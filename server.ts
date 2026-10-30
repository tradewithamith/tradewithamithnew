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

function buildValidPdfBuffer(title: string, subtitle: string, chapters: string[]): Buffer {
  const sanitize = (str: string) =>
    str.replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, ' ');

  const lines: string[] = [
    'BT',
    '/F1 20 Tf',
    '54 742 Td',
    `(TRADE WITH AMITH - MSNR ACADEMY) Tj`,
    '0 -32 Td',
    '/F1 15 Tf',
    `(${sanitize(title)}) Tj`,
    '0 -22 Td',
    '/F2 11 Tf',
    `(${sanitize(subtitle)}) Tj`,
    '0 -32 Td',
  ];

  chapters.forEach((line, index) => {
    lines.push('/F2 10.5 Tf');
    lines.push(`(${index + 1}. ${sanitize(line)}) Tj`);
    lines.push('0 -22 Td');
  });

  lines.push('0 -18 Td');
  lines.push('/F2 9 Tf');
  lines.push('(Copyright Trade With Amith - Malaysian Support & Resistance Academy. Educational Reference.) Tj');
  lines.push('ET');

  const streamContent = lines.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
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
  app.get('/api/youtube/channel-stats', async (req: Request, res: Response) => {
    const rawChannel = String(req.query.channelId || '').trim();
    const match = rawChannel.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    const channelId = match?.[1] || rawChannel;
    const apiKey = process.env.YOUTUBE_API_KEY || '';

    if (!channelId) {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'fallback' });
      return;
    }

    if (cachedSubscriberCount && Date.now() - cachedSubscriberFetchedAt < 10 * 60_000) {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached_fresh' });
      return;
    }

    try {
      if (apiKey) {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`
        );
        if (ytRes.ok) {
          const data = (await ytRes.json()) as {
            items?: Array<{ statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }>;
          };
          const count = data.items?.[0]?.statistics?.subscriberCount;
          if (count) {
            cachedSubscriberCount = Number(count).toLocaleString();
            cachedSubscriberFetchedAt = Date.now();
            res.json({ subscriberCount: cachedSubscriberCount, source: 'youtube_api' });
            return;
          }
        }
      }

      // Public channel page fallback when server API key is not configured
      const pubRes = await fetch(
        `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`,
        {
          headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0',
          },
        }
      );
      if (pubRes.ok) {
        const html = await pubRes.text();
        const subMatch = html.match(/([0-9.,KMB]+)\s+subscribers/i);
        if (subMatch?.[1]) {
          cachedSubscriberCount = subMatch[1];
          cachedSubscriberFetchedAt = Date.now();
          res.json({ subscriberCount: cachedSubscriberCount, source: 'youtube_public' });
          return;
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

  // 3. Built-in real educational PDF generator for starter Academy guides
  app.get('/api/sample-pdf/:slug', (req: Request, res: Response) => {
    const slug = String(req.params.slug || 'msnr-guide').replace(/[^a-zA-Z0-9_-]/g, '');
    const catalog: Record<string, { title: string; subtitle: string; chapters: string[] }> = {
      'msnr-foundations': {
        title: 'MSNR Foundations - Fresh Unmitigated Levels',
        subtitle: 'Malaysian Support & Resistance Core Structure Guide',
        chapters: [
          'Identifying A-V Shape Line Chart Reversal Points on H4 and Daily Timeframes',
          'Distinguishing Fresh Unmitigated SNR Levels from Tested Retail Zones',
          'Gap Levels (OC-Gap) Between Consecutive Same-Color Candlesticks',
          'Multi-Timeframe Storyline Alignment: Monthly -> Weekly -> Daily Roadblocks',
          'Waiting for Lower-Timeframe Confirmation Before XAUUSD Execution',
        ],
      },
      'xauusd-session-checklist': {
        title: 'XAUUSD Gold London & New York Session Execution Checklist',
        subtitle: 'Precision Pre-Trade Protocol for Gold Volatility Windows',
        chapters: [
          'Marking Asian Session High/Low Liquidity Sweeps Prior to London Open',
          'Locating Nearest Fresh H1/H4 MSNR Support & Resistance Roadblocks',
          'Validating Candlestick Body Close vs Wick Rejection at Key Gold Levels',
          'Calculating Position Sizing Using Configurable XAUUSD Pip Multiplier',
          'Trade Management: Scaling Partial Profit at TP1 and Protecting Breakeven',
        ],
      },
      'msnr-masterbook-pro': {
        title: 'The Complete MSNR Institutional Playbook (VIP Monograph)',
        subtitle: 'Advanced Miss Levels, Breakout-Pullbacks & Storyline Mastery',
        chapters: [
          'Institutional Storyline Mapping: Where Price Comes From and Where Price Goes',
          'Classical A/V Levels, Gap Levels, and RBS / SBR Flip Zones in XAUUSD',
          'Engulfing Failure & Manipulation Traps Around High-Impact USD News',
          'Precision Entry Refinement: H4 Roadblock to M15/M5 Confirmation Trigger',
          'Compounding Discipline and Drawdown Control for Funded & Personal Accounts',
        ],
      },
      'xauusd-liquidity-atlas': {
        title: 'XAUUSD Gold Liquidity & Precision Entry Atlas (Premium Edition)',
        subtitle: 'High-Probability Gold Setups Combining MSNR + Session Timing',
        chapters: [
          'Anatomy of a +150 Pip XAUUSD Reversal from Fresh Daily SNR',
          'Spotting Inducement Zones Engineered Above/Below Clean MSNR Levels',
          'Limit Order vs Confirmation Market Execution Rules in High ADR Conditions',
          'Extra TP Runner Protocol: Capturing Full Intraday Expansion Waves',
          'Complete 20-Point Pre-Flight Audit Before Placing Any Gold Position',
        ],
      },
    };

    const docSpec = catalog[slug] || catalog['msnr-foundations'];
    const buffer = buildValidPdfBuffer(docSpec.title, docSpec.subtitle, docSpec.chapters);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
    res.send(buffer);
  });

  // 4. SSRF-safe external PDF binary proxy & attachment downloader for cover extraction & direct download
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
