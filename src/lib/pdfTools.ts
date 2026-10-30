import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const coverMemoryCache = new Map<string, string>();
const coverInflightMap = new Map<string, Promise<string | null>>();

let pdfjsConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjsConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    pdfjsConfigured = true;
  }
  return pdfjs;
}

/**
 * Extracts a Google Drive file ID from common share/view/download links.
 */
export function extractGoogleDriveFileId(rawUrl: string): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch?.[1]) return fileMatch[1];

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname.includes('drive.google.com') ||
      parsed.hostname.includes('docs.google.com') ||
      parsed.hostname.includes('drive.usercontent.google.com')
    ) {
      const idParam = parsed.searchParams.get('id');
      if (idParam && /^[a-zA-Z0-9_-]{10,}$/.test(idParam)) {
        return idParam;
      }
    }
  } catch {
    // Non-absolute URL
  }

  return null;
}

/**
 * Normalizes PDF links (Google Drive, Dropbox, GitHub, relative API routes)
 * into direct binary read/download URLs and optional Drive cover thumbnail URLs.
 */
export function normalizePdfSourceUrl(rawUrl: string): {
  readUrl: string;
  downloadUrl: string;
  driveFileId: string | null;
  driveThumbnailUrl: string | null;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { readUrl: '', downloadUrl: '', driveFileId: null, driveThumbnailUrl: null };
  }

  const driveFileId = extractGoogleDriveFileId(trimmed);
  if (driveFileId) {
    const directDownload = `https://drive.google.com/uc?export=download&id=${driveFileId}`;
    return {
      readUrl: directDownload,
      downloadUrl: directDownload,
      driveFileId,
      driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w800`,
    };
  }

  // Normalize Dropbox share links to direct binary stream
  if (trimmed.includes('dropbox.com/')) {
    const directDropbox = trimmed
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/[?&]dl=[01]/g, '');
    return {
      readUrl: directDropbox,
      downloadUrl: directDropbox,
      driveFileId: null,
      driveThumbnailUrl: null,
    };
  }

  // Normalize GitHub blob links to raw binary URL
  if (trimmed.includes('github.com/') && trimmed.includes('/blob/')) {
    const rawGithub = trimmed
      .replace('github.com/', 'raw.githubusercontent.com/')
      .replace('/blob/', '/');
    return {
      readUrl: rawGithub,
      downloadUrl: rawGithub,
      driveFileId: null,
      driveThumbnailUrl: null,
    };
  }

  return {
    readUrl: trimmed,
    downloadUrl: trimmed,
    driveFileId: null,
    driveThumbnailUrl: null,
  };
}

function isPdfBinaryHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false;
  // Look for "%PDF-" within the first 64 bytes
  const limit = Math.min(bytes.byteLength - 4, 64);
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

async function renderPdfBytesToCoverDataUrl(bytes: Uint8Array): Promise<string | null> {
  if (typeof document === 'undefined' || !isPdfBinaryHeader(bytes)) {
    return null;
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
  });

  try {
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const targetWidth = 440;
    const scale = Math.max(0.5, Math.min(2.2, targetWidth / Math.max(1, unscaledViewport.width)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    let dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    // Keep strictly below 170,000 chars to satisfy firestore.rules (<= 180000)
    if (dataUrl.length > 170_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.58);
    }
    if (dataUrl.length > 170_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.42);
    }

    return dataUrl.length <= 175_000 ? dataUrl : null;
  } catch {
    return null;
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extracts Page 1 cover image directly from an uploaded local PDF File.
 */
export async function extractPdfCoverFromFile(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    return await renderPdfBytesToCoverDataUrl(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

function getSessionCache(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSessionCache(key: string, val: string): void {
  try {
    if (val.length < 180_000) {
      sessionStorage.setItem(key, val);
    }
  } catch {
    // Ignore storage quota limits
  }
}

function verifyImageLoads(url: string): Promise<boolean> {
  if (typeof Image === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(false), 6000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 16);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

/**
 * Automatically extracts or resolves Page 1 cover image from any PDF link.
 * Works both on AI Studio (Express server) and static GitHub Pages.
 */
export async function extractPdfCoverFromUrl(rawUrl: string): Promise<string | null> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  if (coverMemoryCache.has(trimmed)) {
    return coverMemoryCache.get(trimmed) || null;
  }

  const storageKey = `msnr_pdf_cover_v2_${trimmed.slice(0, 180)}`;
  const sessionHit = getSessionCache(storageKey);
  if (sessionHit) {
    coverMemoryCache.set(trimmed, sessionHit);
    return sessionHit;
  }

  const existingJob = coverInflightMap.get(trimmed);
  if (existingJob) return existingJob;

  const job = (async (): Promise<string | null> => {
    const { readUrl, driveThumbnailUrl } = normalizePdfSourceUrl(trimmed);

    // 1. Try direct fetch + client-side pdfjs Page-1 render
    if (readUrl) {
      try {
        const res = await fetch(readUrl, {
          method: 'GET',
          credentials: readUrl.startsWith('/') ? 'same-origin' : 'omit',
        });
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          const rendered = await renderPdfBytesToCoverDataUrl(bytes);
          if (rendered) {
            coverMemoryCache.set(trimmed, rendered);
            setSessionCache(storageKey, rendered);
            return rendered;
          }
        }
      } catch {
        // Proceed to fallbacks when cross-origin server omits CORS headers
      }
    }

    // 2. If it's a Google Drive PDF link, Google Drive natively serves a high-res Page-1 cover thumbnail!
    if (driveThumbnailUrl) {
      const ok = await verifyImageLoads(driveThumbnailUrl);
      if (ok) {
        coverMemoryCache.set(trimmed, driveThumbnailUrl);
        setSessionCache(storageKey, driveThumbnailUrl);
        return driveThumbnailUrl;
      }
    }

    // 3. Try server-side CORS proxy (/api/pdf/proxy) when Express server is available
    if (readUrl && (readUrl.startsWith('http://') || readUrl.startsWith('https://'))) {
      try {
        const proxyRes = await fetch(`/api/pdf/proxy?url=${encodeURIComponent(readUrl)}`);
        if (proxyRes.ok) {
          const bytes = new Uint8Array(await proxyRes.arrayBuffer());
          const rendered = await renderPdfBytesToCoverDataUrl(bytes);
          if (rendered) {
            coverMemoryCache.set(trimmed, rendered);
            setSessionCache(storageKey, rendered);
            return rendered;
          }
        }
      } catch {
        // Static hosting without /api/pdf/proxy
      }
    }

    return null;
  })();

  coverInflightMap.set(trimmed, job);
  try {
    return await job;
  } finally {
    coverInflightMap.delete(trimmed);
  }
}

export function isPlaceholderBookCover(coverUrl?: string | null): boolean {
  if (!coverUrl || !coverUrl.trim()) return true;
  const val = coverUrl.trim();
  return (
    val.includes('book_cover_msnr_mastery') ||
    val.includes('book_cover_xauusd_blueprint')
  );
}

function sanitizePdfFilename(title: string): string {
  const base = (title || 'MSNR_Academy_Guide')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 90);
  const safe = base || 'MSNR_Academy_Guide';
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}

/**
 * Triggers an immediate automatic file download for a PDF URL instead of opening a viewer tab.
 */
export async function downloadPdfAutomatically(rawUrl: string, bookTitle: string): Promise<void> {
  const filename = sanitizePdfFilename(bookTitle);
  const { readUrl, downloadUrl } = normalizePdfSourceUrl(rawUrl);
  if (!readUrl) return;

  // 1. Direct binary fetch -> Blob -> ObjectURL download (works on same-origin & CORS-enabled URLs)
  try {
    const res = await fetch(readUrl, {
      method: 'GET',
      credentials: readUrl.startsWith('/') ? 'same-origin' : 'omit',
    });
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (isPdfBinaryHeader(bytes)) {
        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        triggerBlobDownload(pdfBlob, filename);
        return;
      }
    }
  } catch {
    // Continue to proxy / attachment download fallbacks
  }

  // 2. Server-side attachment proxy (/api/pdf/download) when Express runtime is active
  if (readUrl.startsWith('http://') || readUrl.startsWith('https://')) {
    try {
      const proxyRes = await fetch(
        `/api/pdf/download?url=${encodeURIComponent(readUrl)}&filename=${encodeURIComponent(filename)}`
      );
      if (proxyRes.ok) {
        const bytes = new Uint8Array(await proxyRes.arrayBuffer());
        if (isPdfBinaryHeader(bytes)) {
          const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
          triggerBlobDownload(pdfBlob, filename);
          return;
        }
      }
    } catch {
      // Static GitHub Pages fallback below
    }
  }

  // 3. Cross-origin static hosting fallback: use hidden iframe for Content-Disposition: attachment
  // (e.g. Google Drive uc?export=download or Firebase Storage uploaded with attachment metadata)
  // without opening a new tab or navigating away from the workspace.
  let finalDownloadTarget = downloadUrl;
  if (
    finalDownloadTarget.includes('firebasestorage.googleapis.com') &&
    !finalDownloadTarget.includes('response-content-disposition=')
  ) {
    const sep = finalDownloadTarget.includes('?') ? '&' : '?';
    finalDownloadTarget = `${finalDownloadTarget}${sep}response-content-disposition=${encodeURIComponent(
      `attachment; filename="${filename}"`
    )}`;
  }

  if (
    finalDownloadTarget.includes('drive.google.com/uc?') ||
    finalDownloadTarget.includes('dl.dropboxusercontent.com') ||
    finalDownloadTarget.includes('response-content-disposition=')
  ) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = finalDownloadTarget;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 45_000);
    return;
  }

  const fallbackAnchor = document.createElement('a');
  fallbackAnchor.href = finalDownloadTarget;
  fallbackAnchor.download = filename;
  fallbackAnchor.rel = 'noopener noreferrer';
  fallbackAnchor.style.display = 'none';
  document.body.appendChild(fallbackAnchor);
  fallbackAnchor.click();
  document.body.removeChild(fallbackAnchor);
}
