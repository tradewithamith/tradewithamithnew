import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAILS = new Set([
  'amithmadumal19941029@gmail.com',
]);

function loadFirebaseWebApiKey(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { apiKey?: string };
    return parsed.apiKey || '';
  } catch {
    return '';
  }
}

const FIREBASE_WEB_API_KEY = loadFirebaseWebApiKey();
const LOCAL_RUNTIME_CACHE_DIR = path.join(__dirname, '.firebase');
const VAPID_CACHE_FILE = path.join(LOCAL_RUNTIME_CACHE_DIR, 'dev-vapid-keys.json');
const GUEST_SUBS_FILE = path.join(LOCAL_RUNTIME_CACHE_DIR, 'dev-push-subscriptions.json');

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

interface StoredPushSub {
  uid?: string | null;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function getOrCreateLocalVapidKeys(): StoredVapidKeys {
  const envPub = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPriv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (envPub && envPriv) {
    return {
      publicKey: envPub,
      privateKey: envPriv,
      subject: 'mailto:tradewithamithyt@gmail.com',
    };
  }

  try {
    if (fs.existsSync(VAPID_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_CACHE_FILE, 'utf8')) as Partial<StoredVapidKeys>;
      if (parsed.publicKey && parsed.privateKey) {
        return {
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
          subject: parsed.subject || 'mailto:tradewithamithyt@gmail.com',
        };
      }
    }
  } catch {
    // Regenerate below
  }

  const generated = webpush.generateVAPIDKeys();
  const nextKeys: StoredVapidKeys = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: 'mailto:tradewithamithyt@gmail.com',
  };
  try {
    fs.mkdirSync(LOCAL_RUNTIME_CACHE_DIR, { recursive: true });
    fs.writeFileSync(VAPID_CACHE_FILE, JSON.stringify(nextKeys, null, 2), 'utf8');
  } catch {
    // Non-fatal on read-only fs
  }
  return nextKeys;
}

const serverVapidKeys = getOrCreateLocalVapidKeys();

function loadGuestSubscriptions(): Map<string, StoredPushSub> {
  const map = new Map<string, StoredPushSub>();
  try {
    if (fs.existsSync(GUEST_SUBS_FILE)) {
      const list = JSON.parse(fs.readFileSync(GUEST_SUBS_FILE, 'utf8')) as StoredPushSub[];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.endpoint && item?.keys?.p256dh && item?.keys?.auth) {
            map.set(item.endpoint, item);
          }
        }
      }
    }
  } catch {
    // Ignore corrupted cache
  }
  return map;
}

const serverSubscriptions = loadGuestSubscriptions();

function persistGuestSubscriptions() {
  try {
    fs.mkdirSync(LOCAL_RUNTIME_CACHE_DIR, { recursive: true });
    const arr = Array.from(serverSubscriptions.values()).slice(-1000);
    fs.writeFileSync(GUEST_SUBS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {
    // Non-fatal on read-only fs
  }
}

async function verifyAdminIdToken(authHeader?: string): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ') || !FIREBASE_WEB_API_KEY) {
    return false;
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return false;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean }>;
    };
    const account = data.users?.[0];
    if (!account || !account.emailVerified || !account.email) return false;
    return ADMIN_EMAILS.has(account.email.trim().toLowerCase());
  } catch {
    return false;
  }
}

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

  // 1. Secure server-side YouTube subscriber count lookup with multi-source live fallbacks
  let cachedSubscriberFetchedAt = 0;
  let cachedChannelKey = '';
  app.get('/api/youtube/channel-stats', async (req: Request, res: Response) => {
    const rawChannel = String(req.query.channelId || '').trim();
    const rawHandle = String(req.query.handle || '').trim();
    const channelMatch = rawChannel.match(/(UC[a-zA-Z0-9_-]{15,})/);
    const channelId = channelMatch?.[1] || 'UCKwo4dtX8sFrJcW5I5tZ0cw';
    const handleMatch =
      rawHandle.match(/@([a-zA-Z0-9_.-]+)/) || rawChannel.match(/@([a-zA-Z0-9_.-]+)/);
    const cleanHandle = handleMatch?.[1] || 'tradewithamithYT';
    const lookupKey = `${channelId}|${cleanHandle}`;
    const apiKey = process.env.YOUTUBE_API_KEY || '';

    if (
      cachedSubscriberCount &&
      cachedChannelKey === lookupKey &&
      Date.now() - cachedSubscriberFetchedAt < 90_000
    ) {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached_fresh' });
      return;
    }

    try {
      // Source A: Official YouTube Data API v3 (if server YOUTUBE_API_KEY is configured)
      if (apiKey && channelId) {
        try {
          const ytRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`
          );
          if (ytRes.ok) {
            const data = (await ytRes.json()) as {
              items?: Array<{ statistics?: { subscriberCount?: string } }>;
            };
            const count = data.items?.[0]?.statistics?.subscriberCount;
            if (count !== undefined && count !== null && /^\d+$/.test(String(count))) {
              cachedSubscriberCount = Number(count).toLocaleString('en-US');
              cachedSubscriberFetchedAt = Date.now();
              cachedChannelKey = lookupKey;
              res.json({ subscriberCount: cachedSubscriberCount, source: 'youtube_api' });
              return;
            }
          }
        } catch {
          // Continue to next live source
        }
      }

      // Source B: Live SocialCounts YouTube API (JSON exact integer count)
      if (channelId) {
        try {
          const scRes = await fetch(
            `https://api.socialcounts.org/youtube-live-subscriber-count/${encodeURIComponent(channelId)}`,
            { headers: { Accept: 'application/json' } }
          );
          if (scRes.ok) {
            const scJson = (await scRes.json()) as {
              counters?: {
                api?: { subscriberCount?: number };
                estimation?: { subscriberCount?: number };
              };
            };
            const exact =
              scJson?.counters?.api?.subscriberCount ??
              scJson?.counters?.estimation?.subscriberCount;
            if (typeof exact === 'number' && Number.isFinite(exact) && exact >= 0) {
              cachedSubscriberCount = exact.toLocaleString('en-US');
              cachedSubscriberFetchedAt = Date.now();
              cachedChannelKey = lookupKey;
              res.json({ subscriberCount: cachedSubscriberCount, source: 'socialcounts_live' });
              return;
            }
          }
        } catch {
          // Continue to next live source
        }
      }

      // Source C: Public YouTube channel page lookup with consent cookie
      const candidateUrls = [
        ...(channelId ? [`https://www.youtube.com/channel/${encodeURIComponent(channelId)}`] : []),
        ...(cleanHandle ? [`https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`] : []),
      ];

      for (const targetUrl of candidateUrls) {
        try {
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
        } catch {
          // Continue
        }
      }

      // Source D: Jina Reader fallback for regions where YouTube blocks datacenter IPs
      if (cleanHandle) {
        try {
          const jinaRes = await fetch(
            `https://r.jina.ai/https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`,
            { headers: { Accept: 'text/plain' } }
          );
          if (jinaRes.ok) {
            const text = await jinaRes.text();
            const subMatch = text.match(/([0-9][0-9.,]*\s*[KMB]?)\s+subscribers/i);
            if (subMatch?.[1]) {
              cachedSubscriberCount = subMatch[1].replace(/\s+/g, '');
              cachedSubscriberFetchedAt = Date.now();
              cachedChannelKey = lookupKey;
              res.json({ subscriberCount: cachedSubscriberCount, source: 'jina_reader' });
              return;
            }
          }
        } catch {
          // Ignore
        }
      }

      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached' });
    } catch {
      res.json({ subscriberCount: cachedSubscriberCount, source: 'cached' });
    }
  });

  // 1B. Web Push Notifications Endpoints (Background Notifications When App/Browser Is Closed)
  app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
    res.json({ publicKey: serverVapidKeys.publicKey });
  });

  app.get('/api/push/vapid-init', async (req: Request, res: Response) => {
    const isAdminReq = await verifyAdminIdToken(req.headers.authorization);
    if (!isAdminReq) {
      res.status(403).json({ error: 'Authorized administrator token required.' });
      return;
    }
    res.json({
      publicKey: serverVapidKeys.publicKey,
      privateKey: serverVapidKeys.privateKey,
      subject: serverVapidKeys.subject,
    });
  });

  app.post('/api/push/subscribe', (req: Request, res: Response) => {
    const body = req.body as {
      uid?: string | null;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };
    const sub = body?.subscription;
    if (
      !sub?.endpoint ||
      !sub.endpoint.startsWith('https://') ||
      !sub.keys?.p256dh ||
      !sub.keys?.auth
    ) {
      res.status(400).json({ error: 'Invalid PushSubscription object.' });
      return;
    }

    serverSubscriptions.set(sub.endpoint, {
      uid: typeof body.uid === 'string' && body.uid ? body.uid : null,
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
    persistGuestSubscriptions();
    res.json({ ok: true });
  });

  app.post('/api/push/send', async (req: Request, res: Response) => {
    const isAdminReq = await verifyAdminIdToken(req.headers.authorization);
    if (!isAdminReq) {
      res.status(403).json({ error: 'Authorized administrator token required.' });
      return;
    }

    const body = req.body as {
      vapid?: { publicKey?: string; privateKey?: string; subject?: string };
      targetUid?: string;
      subscriptions?: Array<{
        id?: string;
        userId?: string;
        endpoint: string;
        keys: { p256dh: string; auth: string };
      }>;
      notification?: {
        title?: string;
        body?: string;
        icon?: string;
        badge?: string;
        url?: string;
        tag?: string;
      };
    };

    const pubKey = (body?.vapid?.publicKey || serverVapidKeys.publicKey).trim();
    const privKey = (body?.vapid?.privateKey || serverVapidKeys.privateKey).trim();
    const subject = (body?.vapid?.subject || serverVapidKeys.subject || 'mailto:tradewithamithyt@gmail.com').trim();

    if (!pubKey || !privKey) {
      res.status(400).json({ error: 'Missing VAPID keys.' });
      return;
    }

    // Merge Firestore subscriptions passed by Admin with any guest/browser subscriptions cached on server
    const targetUid = body?.targetUid || 'ALL';
    const combinedByEndpoint = new Map<
      string,
      { id?: string; endpoint: string; keys: { p256dh: string; auth: string } }
    >();

    if (Array.isArray(body?.subscriptions)) {
      for (const s of body.subscriptions) {
        if (s?.endpoint && s?.keys?.p256dh && s?.keys?.auth) {
          combinedByEndpoint.set(s.endpoint, {
            id: s.id,
            endpoint: s.endpoint,
            keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
          });
        }
      }
    }

    for (const cached of serverSubscriptions.values()) {
      if (targetUid === 'ALL' || (cached.uid && cached.uid === targetUid)) {
        if (!combinedByEndpoint.has(cached.endpoint)) {
          combinedByEndpoint.set(cached.endpoint, {
            endpoint: cached.endpoint,
            keys: cached.keys,
          });
        }
      }
    }

    const payloadStr = JSON.stringify({
      title: String(body?.notification?.title || 'Trade With Amith').slice(0, 120),
      body: String(body?.notification?.body || 'New update available.').slice(0, 500),
      icon: body?.notification?.icon || './pwa-192x192.png?v=twa3',
      badge: body?.notification?.badge || './pwa-192x192.png?v=twa3',
      url: body?.notification?.url || './index.html',
      tag: body?.notification?.tag || `twa_${Date.now()}`,
    });

    const expiredIds: string[] = [];
    let delivered = 0;
    let failed = 0;

    await Promise.all(
      Array.from(combinedByEndpoint.values()).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payloadStr,
            {
              TTL: 86_400,
              urgency: 'high',
              vapidDetails: {
                subject,
                publicKey: pubKey,
                privateKey: privKey,
              },
            }
          );
          delivered += 1;
        } catch (err: unknown) {
          failed += 1;
          const statusCode =
            err && typeof err === 'object' && 'statusCode' in err
              ? Number((err as { statusCode?: number }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            if (sub.id) expiredIds.push(sub.id);
            if (serverSubscriptions.delete(sub.endpoint)) {
              persistGuestSubscriptions();
            }
          }
        }
      })
    );

    res.json({ ok: true, delivered, failed, expiredIds });
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
    console.log(`Trade With Amith server listening on port ${PORT}`);
  });
}

startServer();
