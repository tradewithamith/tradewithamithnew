// Cloudflare Pages Function: /api/push/send
// Implements native Web Crypto ES256 VAPID + RFC 8291 (aes128gcm) Web Push delivery
// so background notifications work when the app/browser is closed on Cloudflare Pages.

const ADMIN_EMAILS = new Set([
  'emoneywithamith@gmail.com',
  'amithmadumal19941029@gmail.com',
  'tradewithamithyt@gmail.com',
]);

const DEFAULT_FIREBASE_API_KEY = 'AIzaSyDFAC5bHcygcJcz1HJDaM2kxLUO-3xDS7M';

function base64UrlToBytes(b64url) {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + '='.repeat(padLen));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

async function hkdfExtractAndExpand(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const infoPlusOne = concatBytes(info, new Uint8Array([1]));
  const okm = await hmacSha256(prk, infoPlusOne);
  return okm.slice(0, length);
}

async function createVapidAuthorizationHeader(endpoint, subject, publicKeyB64, privateKeyB64) {
  const parsedUrl = new URL(endpoint);
  const audience = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const enc = new TextEncoder();
  const headerB64 = bytesToBase64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = bytesToBase64Url(
    enc.encode(JSON.stringify({ aud: audience, exp, sub: subject }))
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  const pubBytes = base64UrlToBytes(publicKeyB64); // 65-byte uncompressed P-256 point (0x04 || X || Y)
  const xB64 = bytesToBase64Url(pubBytes.slice(1, 33));
  const yB64 = bytesToBase64Url(pubBytes.slice(33, 65));

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: xB64,
    y: yB64,
    d: privateKeyB64,
    ext: true,
  };

  const ecKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      ecKey,
      enc.encode(signingInput)
    )
  );

  const jwt = `${signingInput}.${bytesToBase64Url(signatureBytes)}`;
  return `vapid t=${jwt}, k=${publicKeyB64}`;
}

async function encryptRfc8291Payload(plaintextStr, uaPublicB64, authSecretB64) {
  const enc = new TextEncoder();
  const uaPublicBytes = base64UrlToBytes(uaPublicB64);
  const authSecretBytes = base64UrlToBytes(authSecretB64);

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256
    )
  );

  const keyInfo = concatBytes(
    enc.encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicBytes
  );
  const ikm = await hkdfExtractAndExpand(authSecretBytes, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = enc.encode('Content-Encoding: nonce\0');

  const cek = await hkdfExtractAndExpand(salt, ikm, cekInfo, 16);
  const nonce = await hkdfExtractAndExpand(salt, ikm, nonceInfo, 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const paddedPlaintext = concatBytes(enc.encode(plaintextStr), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlaintext)
  );

  // RFC 8291 aes128gcm header: salt(16) || rs(4, 4096) || idlen(1, 65) || keyid(65, asPublicBytes)
  const header = new Uint8Array(21 + asPublicBytes.length);
  header.set(salt, 0);
  const view = new DataView(header.buffer);
  view.setUint32(16, 4096, false);
  header[20] = asPublicBytes.length;
  header.set(asPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

async function verifyAdminRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return false;

  const apiKey = (env && env.FIREBASE_API_KEY) || DEFAULT_FIREBASE_API_KEY;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    const account = data && data.users && data.users[0];
    if (!account || !account.emailVerified || !account.email) return false;
    return ADMIN_EMAILS.has(String(account.email).trim().toLowerCase());
  } catch {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

  const isAdmin = await verifyAdminRequest(request, env);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Authorized administrator token required.' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    const body = await request.json();
    const pubKey = String(
      (body.vapid && body.vapid.publicKey) || (env && env.VAPID_PUBLIC_KEY) || ''
    ).trim();
    const privKey = String(
      (body.vapid && body.vapid.privateKey) || (env && env.VAPID_PRIVATE_KEY) || ''
    ).trim();
    const subject = String(
      (body.vapid && body.vapid.subject) || 'mailto:tradewithamithyt@gmail.com'
    ).trim();

    if (!pubKey || !privKey) {
      return new Response(JSON.stringify({ error: 'Missing VAPID keys.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : [];
    const payloadStr = JSON.stringify({
      title: String((body.notification && body.notification.title) || 'Trade With Amith').slice(
        0,
        120
      ),
      body: String(
        (body.notification && body.notification.body) || 'New update available.'
      ).slice(0, 500),
      icon: (body.notification && body.notification.icon) || './pwa-192x192.png?v=twa3',
      badge: (body.notification && body.notification.badge) || './pwa-192x192.png?v=twa3',
      url: (body.notification && body.notification.url) || './index.html',
      tag: (body.notification && body.notification.tag) || `twa_${Date.now()}`,
    });

    const expiredIds = [];
    let delivered = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return;
        try {
          const authHeader = await createVapidAuthorizationHeader(
            sub.endpoint,
            subject,
            pubKey,
            privKey
          );
          const encryptedBody = await encryptRfc8291Payload(
            payloadStr,
            sub.keys.p256dh,
            sub.keys.auth
          );

          const pushRes = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: '86400',
              Urgency: 'high',
            },
            body: encryptedBody,
          });

          if (pushRes.status >= 200 && pushRes.status < 300) {
            delivered += 1;
          } else {
            failed += 1;
            if ((pushRes.status === 404 || pushRes.status === 410) && sub.id) {
              expiredIds.push(sub.id);
            }
          }
        } catch {
          failed += 1;
        }
      })
    );

    return new Response(JSON.stringify({ ok: true, delivered, failed, expiredIds }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Push dispatch failed.' }),
      { status: 500, headers: jsonHeaders }
    );
  }
}
