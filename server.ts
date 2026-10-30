import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createHttpServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for resilient fallback when external APIs have quota/network limits
let cachedSubscriberCount: string | null = null;
const cachedSheetsByUrl = new Map<string, { rows: Record<string, string>[]; fetchedAt: number }>();

function parseCsvRows(csvText: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim().length > 0) {
        lines.push(current);
      }
      current = '';
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current);
  }
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c === ',' && !quoted) {
        out.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    out.push(cell.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  );

  return lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // 1. Secure server-side YouTube subscriber count lookup with cached fallback
  let cachedSubscriberFetchedAt = 0;
  let cachedChannelKey = '';
  app.get('/api/youtube/channel-stats', async (req: Request, res: Response) => {
    const rawChannel = String(req.query.channelId || '').trim();
    const rawHandle = String(req.query.handle || '').trim();
    const channelMatch = rawChannel.match(/(UC[a-zA-Z0-9_-]{15,})/);
    const channelId = channelMatch?.[1] || '';
    const handleMatch =
      rawHandle.match(/@([a-zA-Z0-9_.-]+)/) || rawChannel.match(/@([a-zA-Z0-9_.-]+)/);
    const cleanHandle = handleMatch?.[1] || 'tradewithamithYT';
    const lookupKey = `${channelId}|${cleanHandle}`;
    const apiKey = process.env.YOUTUBE_API_KEY || '';

    if (!channelId && !cleanHandle) {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'fallback' });
      return;
    }

    if (
      cachedSubscriberCount &&
      cachedChannelKey === lookupKey &&
      Date.now() - cachedSubscriberFetchedAt < 2 * 60_000
    ) {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached_fresh' });
      return;
    }

    try {
      if (apiKey && channelId) {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`
        );
        if (ytRes.ok) {
          const data = (await ytRes.json()) as {
            items?: Array<{ statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }>;
          };
          const count = data.items?.[0]?.statistics?.subscriberCount;
          if (count) {
            cachedSubscriberCount = Number(count).toLocaleString('en-US');
            cachedSubscriberFetchedAt = Date.now();
            cachedChannelKey = lookupKey;
            res.json({ subscriberCount: cachedSubscriberCount, source: 'youtube_api' });
            return;
          }
        }
      }

      // Public channel page lookup with full browser UA + YouTube consent cookie
      const candidateUrls = [
        ...(channelId ? [`https://www.youtube.com/channel/${encodeURIComponent(channelId)}`] : []),
        ...(cleanHandle ? [`https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`] : []),
      ];

      for (const targetUrl of candidateUrls) {
        const pubRes = await fetch(targetUrl, {
          headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+999',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (pubRes.ok) {
          const html = await pubRes.text();
          const subMatch = html.match(/([0-9][0-9.,]*\s*[KMB]?)\s+subscribers/i);
          if (subMatch?.[1]) {
            cachedSubscriberCount = subMatch[1].replace(/\s+/g, '');
            cachedSubscriberFetchedAt = Date.now();
            cachedChannelKey = lookupKey;
            res.json({ subscriberCount: cachedSubscriberCount, source: 'youtube_public' });
            return;
          }
        }
      }

      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached' });
    } catch {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached' });
    }
  });

  // 2. Published Google Sheets CSV / JSON server proxy with last-synced cache fallback
  app.get('/api/sheets/fetch', async (req: Request, res: Response) => {
    const sheetUrl = String(req.query.url || '').trim();
    if (!sheetUrl || !sheetUrl.startsWith('https://docs.google.com/spreadsheets/')) {
      res.status(400).json({ error: 'Provide a valid Google Sheets URL.' });
      return;
    }

    try {
      let fetchTarget = sheetUrl;
      if (sheetUrl.includes('/edit')) {
        const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
        if (match?.[1]) {
          fetchTarget = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gidMatch?.[1] ? `&gid=${gidMatch[1]}` : ''}`;
        }
      }

      const response = await fetch(fetchTarget);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const rows = parseCsvRows(text);
      cachedSheetsByUrl.set(sheetUrl, { rows, fetchedAt: Date.now() });
      res.json({ rows, source: 'live' });
    } catch {
      const cached = cachedSheetsByUrl.get(sheetUrl);
      if (cached) {
        res.json({ rows: cached.rows, source: 'cached' });
        return;
      }
      res.status(502).json({ error: 'Unable to reach Google Sheets right now.', rows: [] });
    }
  });

  // 3. SSRF-safe external PDF binary proxy & attachment downloader for cover extraction & direct download
  const isSafeExternalHttpUrl = (raw: string): URL | null => {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      const host = u.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        host === '169.254.169.254'
      ) {
        return null;
      }
      return u;
    } catch {
      return null;
    }
  };

  const handleExternalPdfFetch = async (req: Request, res: Response, asAttachment: boolean) => {
    const rawUrl = String(req.query.url || '').trim();
    const safeUrl = isSafeExternalHttpUrl(rawUrl);
    if (!safeUrl) {
      res.status(400).json({ error: 'Provide a valid public HTTP/HTTPS PDF URL.' });
      return;
    }

    const rawFilename = String(req.query.filename || 'MSNR_Guide.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const filename = rawFilename.toLowerCase().endsWith('.pdf')
      ? rawFilename
      : `${rawFilename}.pdf`;

    try {
      const upstream = await fetch(safeUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
        redirect: 'follow',
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Upstream HTTP ${upstream.status}` });
        return;
      }

      const contentLength = Number(upstream.headers.get('content-length') || '0');
      if (contentLength > 40 * 1024 * 1024) {
        res.status(413).json({ error: 'PDF exceeds 40MB proxy limit.' });
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength > 40 * 1024 * 1024) {
        res.status(413).json({ error: 'PDF exceeds 40MB proxy limit.' });
        return;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${asAttachment ? 'attachment' : 'inline'}; filename="${filename}"`
      );
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.status(502).json({ error: 'Failed to retrieve remote PDF.' });
    }
  };

  app.get('/api/pdf/proxy', (req: Request, res: Response) => {
    void handleExternalPdfFetch(req, res, false);
  });

  app.get('/api/pdf/download', (req: Request, res: Response) => {
    void handleExternalPdfFetch(req, res, true);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: !hmrDisabled,
        watch: hmrDisabled ? null : {},
      },
      appType: 'mpa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      const requested = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
      const allowedPages = ['index.html', 'terms.html', 'privacy.html', 'about.html', 'contact.html', 'admin.html'];
      const target = allowedPages.includes(requested) ? requested : 'index.html';
      res.sendFile(path.join(distPath, target));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Trade With Amith — MSNR Academy server listening on port ${PORT}`);
  });
}

startServer();
