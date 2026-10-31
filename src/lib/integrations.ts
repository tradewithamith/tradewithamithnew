import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getAccessToken, getValidYoutubeAccessToken } from './firebase';
import type { VisitorStatistics } from '../types/academy';

export type YoutubeCheckResult =
  | { status: 'SUBSCRIBED'; message: string }
  | { status: 'NOT_SUBSCRIBED'; message: string }
  | { status: 'TOKEN_EXPIRED'; message: string }
  | { status: 'UNCONFIGURED'; message: string }
  | { status: 'API_LIMITED'; message: string };

export function normalizeYoutubeChannelId(raw: string): string {
  const trimmed = (raw || '').trim();
  const urlMatch = trimmed.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{15,})/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }
  const directMatch = trimmed.match(/^(UC[a-zA-Z0-9_-]{15,})$/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }
  return '';
}

export function sanitizeSubscriberCount(raw: string | null | undefined): string {
  const cleaned = String(raw || '')
    .replace(/subscribers?/gi, '')
    .trim();
  if (!cleaned || cleaned.includes('@')) {
    return '';
  }
  if (/^\d[\d,.\s]*[KMBkmb]?$/.test(cleaned)) {
    return cleaned.replace(/\s+/g, '').toUpperCase();
  }
  return '';
}

export function normalizeTelegramUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'https://t.me/TradeWithAmithBot';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const handle = trimmed.replace(/^@/, '').replace(/^t\.me\//i, '');
  return `https://t.me/${handle}`;
}

export function formatTelegramHandle(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '@TradeWithAmithBot';
  if (trimmed.startsWith('@')) return trimmed;
  const match = trimmed.match(/t\.me\/([a-zA-Z0-9_]+)/i);
  if (match?.[1]) return `@${match[1]}`;
  return trimmed;
}

/**
 * Official YouTube Data API v3 Subscription Verification
 * Checks whether the authenticated Google user is subscribed to the configured YouTube Channel ID.
 */
export async function verifyYoutubeSubscription(
  channelId: string,
  overrideToken?: string | null
): Promise<YoutubeCheckResult> {
  const cleanChannelId = normalizeYoutubeChannelId(channelId);
  if (!cleanChannelId) {
    return {
      status: 'UNCONFIGURED',
      message:
        'Google account authenticated. Set your YouTube Channel ID in Admin Settings to enforce strict channel matching.',
    };
  }

  const token = overrideToken ?? getValidYoutubeAccessToken(auth.currentUser?.uid);
  if (!token) {
    return {
      status: 'TOKEN_EXPIRED',
      message: 'Please verify your YouTube subscription with Google to continue.',
    };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${encodeURIComponent(cleanChannelId)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (response.status === 200) {
      const data = (await response.json()) as { items?: unknown[] };
      if (Array.isArray(data.items) && data.items.length > 0) {
        return {
          status: 'SUBSCRIBED',
          message: 'Subscription verified via YouTube Data API.',
        };
      }
      return {
        status: 'NOT_SUBSCRIBED',
        message: 'You are not currently subscribed to Trade With Amith on YouTube. Please subscribe first, then click Verify Subscription.',
      };
    }

    if (response.status === 401) {
      return {
        status: 'TOKEN_EXPIRED',
        message: 'Your Google YouTube verification session expired. Please verify your subscription again.',
      };
    }

    const errJson = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const apiReason = errJson?.error?.message || `HTTP ${response.status}`;

    return {
      status: 'API_LIMITED',
      message: `YouTube API verification notice (${apiReason}). Enable YouTube Data API v3 in Google Cloud Console for strict enforcement.`,
    };
  } catch {
    return {
      status: 'API_LIMITED',
      message:
        'Network or browser privacy settings prevented live YouTube API lookup. Verified Google session recorded.',
    };
  }
}

async function syncSubscriberCountToFirestore(channelId: string, count: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const clean = sanitizeSubscriberCount(count);
  if (!clean) return;
  const throttleKey = 'msnr_yt_stats_synced_at';
  const lastWrite = Number(sessionStorage.getItem(throttleKey) || '0');
  if (Date.now() - lastWrite < 10 * 60_000) return;

  try {
    sessionStorage.setItem(throttleKey, String(Date.now()));
    await setDoc(doc(db, 'youtubeStats', 'live'), {
      channelId: channelId.slice(0, 80),
      subscriberCount: clean.slice(0, 40),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking sync
  }
}

/**
 * Retrieves live YouTube subscriber count via authenticated token, YouTube API key,
 * server/Cloudflare proxy, SocialCounts live API, Jina reader, or Firestore live cache.
 */
export async function fetchYoutubeSubscriberCount(
  channelId: string,
  fallbackCount: string,
  channelUrl?: string
): Promise<string> {
  const localCacheKey = 'msnr_live_yt_subs_v5';
  const cleanId = normalizeYoutubeChannelId(channelId) || 'UCKwo4dtX8sFrJcW5I5tZ0cw';
  const handleMatch = (channelUrl || '').match(/@([a-zA-Z0-9_.-]+)/);
  const handle = handleMatch ? `@${handleMatch[1]}` : '@tradewithamithYT';
  const safeFallback = sanitizeSubscriberCount(fallbackCount);
  const safeCached = sanitizeSubscriberCount(localStorage.getItem(localCacheKey));

  const recordFreshCount = (countStr: string): string => {
    localStorage.setItem(localCacheKey, countStr);
    void syncSubscriberCountToFirestore(cleanId, countStr);
    return countStr;
  };

  // 1. Try authenticated YouTube Data API v3 if Google OAuth token is valid
  const token = getValidYoutubeAccessToken(auth.currentUser?.uid);
  if (token && cleanId) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(cleanId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{ statistics?: { subscriberCount?: string } }>;
        };
        const raw = json.items?.[0]?.statistics?.subscriberCount;
        if (raw !== undefined && raw !== null && /^\d+$/.test(String(raw))) {
          const formatted = sanitizeSubscriberCount(Number(raw).toLocaleString('en-US'));
          if (formatted) {
            return recordFreshCount(formatted);
          }
        }
      }
    } catch {
      // Continue to next source
    }
  }

  // 2. Try client-side YouTube Data API key if configured via VITE_YOUTUBE_API_KEY
  const publicApiKey = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) || '';
  if (publicApiKey && cleanId) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(cleanId)}&key=${encodeURIComponent(publicApiKey)}`
      );
      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{ statistics?: { subscriberCount?: string } }>;
        };
        const raw = json.items?.[0]?.statistics?.subscriberCount;
        if (raw !== undefined && raw !== null && /^\d+$/.test(String(raw))) {
          const formatted = sanitizeSubscriberCount(Number(raw).toLocaleString('en-US'));
          if (formatted) {
            return recordFreshCount(formatted);
          }
        }
      }
    } catch {
      // Continue to server/edge endpoint
    }
  }

  // 3. Try server-side / Cloudflare Pages Function endpoint
  try {
    const res = await fetch(
      `/api/youtube/channel-stats?channelId=${encodeURIComponent(cleanId)}&handle=${encodeURIComponent(handle)}`
    );
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as { subscriberCount?: string | null };
        const cleanCount = sanitizeSubscriberCount(data.subscriberCount);
        if (cleanCount) {
          return recordFreshCount(cleanCount);
        }
      }
    }
  } catch {
    // Fall through to direct browser CORS live endpoints
  }

  // 4. Direct CORS-enabled SocialCounts Live YouTube Subscriber API (works on any static host)
  if (cleanId) {
    try {
      const scRes = await fetch(
        `https://api.socialcounts.org/youtube-live-subscriber-count/${encodeURIComponent(cleanId)}`,
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
          const formatted = sanitizeSubscriberCount(exact.toLocaleString('en-US'));
          if (formatted) {
            return recordFreshCount(formatted);
          }
        }
      }
    } catch {
      // Fall through to Jina reader
    }
  }

  // 5. Direct CORS-enabled Jina Reader fallback
  try {
    const jinaRes = await fetch(`https://r.jina.ai/https://www.youtube.com/${handle}`, {
      headers: { Accept: 'text/plain' },
    });
    if (jinaRes.ok) {
      const text = await jinaRes.text();
      const subMatch = text.match(/([0-9][0-9.,]*\s*[KMB]?)\s+subscribers/i);
      const cleanCount = sanitizeSubscriberCount(subMatch?.[1]);
      if (cleanCount) {
        return recordFreshCount(cleanCount);
      }
    }
  } catch {
    // Fall through to Firestore live cache
  }

  // 6. Firestore /youtubeStats/live fallback
  try {
    const snap = await getDoc(doc(db, 'youtubeStats', 'live'));
    if (snap.exists()) {
      const data = snap.data() as { subscriberCount?: string };
      const cleanCount = sanitizeSubscriberCount(data.subscriberCount);
      if (cleanCount) {
        localStorage.setItem(localCacheKey, cleanCount);
        return cleanCount;
      }
    }
  } catch {
    // Ignore offline error
  }

  return safeCached || safeFallback;
}

/**
 * Fetches rows from Google Sheets via:
 * 1) Official Google Sheets API v4 (using Admin's OAuth token + Spreadsheet ID + Sheet Tab name), OR
 * 2) Published Google Sheets CSV URL (via server proxy with direct browser CSV fallback).
 */
export async function fetchGoogleSheetRows(params: {
  publishedCsvUrl?: string;
  spreadsheetId?: string;
  tabName?: string;
}): Promise<Record<string, string>[]> {
  const token = getAccessToken();
  const cleanSpreadsheetId = (params.spreadsheetId || '').trim();
  const cleanTab = (params.tabName || '').trim();

  if (token && cleanSpreadsheetId && cleanTab) {
    const range = encodeURIComponent(`${cleanTab}!A1:H200`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanSpreadsheetId)}/values/${range}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = (await res.json()) as { values?: string[][] };
      const values = data.values || [];
      if (values.length >= 2) {
        const headers = values[0].map((h) =>
          String(h).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        );
        return values.slice(1).map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            if (h) obj[h] = String(row[i] ?? '').trim();
          });
          return obj;
        });
      }
    }
  }

  const csvUrl = (params.publishedCsvUrl || '').trim();
  if (!csvUrl) {
    throw new Error('Provide either a Published Google Sheet URL or a Spreadsheet ID with Google Sign-In.');
  }

  // Try server proxy first to avoid CORS when Express backend is present
  try {
    const proxyRes = await fetch(`/api/sheets/fetch?url=${encodeURIComponent(csvUrl)}`);
    const contentType = proxyRes.headers.get('content-type') || '';
    if (proxyRes.ok && contentType.includes('application/json')) {
      const payload = (await proxyRes.json()) as { rows?: Record<string, string>[] };
      if (Array.isArray(payload.rows)) return payload.rows;
    }
  } catch {
    // Fallback to direct fetch on static Firebase Hosting
  }

  let directTargetUrl = csvUrl;
  if (csvUrl.includes('docs.google.com/spreadsheets/') && csvUrl.includes('/edit')) {
    const idMatch = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const gidMatch = csvUrl.match(/gid=([0-9]+)/);
    if (idMatch?.[1]) {
      directTargetUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv${
        gidMatch?.[1] ? `&gid=${gidMatch[1]}` : ''
      }`;
    }
  }

  const directRes = await fetch(directTargetUrl);
  if (!directRes.ok) {
    throw new Error('Could not load published Google Sheet URL.');
  }
  const text = await directRes.text();

  const splitCsvLine = (line: string): string[] => {
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

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  );
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = (cols[idx] ?? '').trim();
    });
    return obj;
  });
}

export function getCalendarKeys(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const dayKey = `${yyyy}-${mm}-${dd}`;
  const monthKey = `${yyyy}-${mm}`;

  const firstJan = new Date(Date.UTC(yyyy, 0, 1));
  const days = Math.floor((date.getTime() - firstJan.getTime()) / 86_400_000);
  const weekNum = String(Math.ceil((days + firstJan.getUTCDay() + 1) / 7)).padStart(2, '0');
  const weekKey = `${yyyy}-W${weekNum}`;

  return { dayKey, weekKey, monthKey };
}

/**
 * Records a deduplicated daily unique visit in Firestore using an atomic batch
 * (creates /visitorSessions/{dayKey}_{uid} + increments /statistics/visitors).
 */
export async function recordUniqueAuthenticatedVisit(uid: string): Promise<void> {
  const { dayKey, weekKey, monthKey } = getCalendarKeys();
  const sessionId = `${dayKey}_${uid}`;
  const localGuardKey = `msnr_visit_${sessionId}`;

  if (localStorage.getItem(localGuardKey) === '1') {
    return;
  }

  try {
    const sessionRef = doc(db, 'visitorSessions', sessionId);
    const existingSession = await getDoc(sessionRef);
    if (existingSession.exists()) {
      localStorage.setItem(localGuardKey, '1');
      return;
    }

    const statsRef = doc(db, 'statistics', 'visitors');
    const statsSnap = await getDoc(statsRef);
    const batch = writeBatch(db);

    batch.set(sessionRef, {
      sessionId,
      uid,
      dayKey,
      monthKey,
      createdAt: serverTimestamp(),
    });

    if (!statsSnap.exists()) {
      batch.set(statsRef, {
        dayKey,
        weekKey,
        monthKey,
        todayCount: 1,
        weekCount: 1,
        monthCount: 1,
        totalCount: 1,
        lastSessionId: sessionId,
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = statsSnap.data() as VisitorStatistics;
      batch.update(statsRef, {
        dayKey,
        weekKey,
        monthKey,
        todayCount: prev.dayKey === dayKey ? (prev.todayCount || 0) + 1 : 1,
        weekCount: prev.weekKey === weekKey ? (prev.weekCount || 0) + 1 : 1,
        monthCount: prev.monthKey === monthKey ? (prev.monthCount || 0) + 1 : 1,
        totalCount: (prev.totalCount || 0) + 1,
        lastSessionId: sessionId,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    localStorage.setItem(localGuardKey, '1');
  } catch {
    // Non-blocking if visitor session already committed concurrently
  }
}

export function extractYoutubeVideoId(rawUrl: string): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const vParam = parsed.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

      const segments = parsed.pathname.split('/').filter(Boolean);
      const markerIdx = segments.findIndex((s) =>
        ['embed', 'shorts', 'live', 'v'].includes(s.toLowerCase())
      );
      if (markerIdx !== -1 && segments[markerIdx + 1]) {
        const candidate = segments[markerIdx + 1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
      }
    }
  } catch {
    // Fallback to regex matching below
  }

  const regExp =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  return match?.[1] || null;
}

export function extractYoutubeEmbedUrl(rawUrl: string): string | null {
  const videoId = extractYoutubeVideoId(rawUrl);
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  }
  return null;
}

export function extractYoutubeThumbnail(rawUrl: string, fallback: string): string {
  const videoId = extractYoutubeVideoId(rawUrl);
  if (videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  return fallback;
}
