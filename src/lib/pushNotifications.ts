import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, sanitizeId } from './firebase';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateBrowserVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const rawPublic = new Uint8Array(await window.crypto.subtle.exportKey('raw', keyPair.publicKey));
  const jwkPrivate = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  if (!jwkPrivate.d) {
    throw new Error('Could not export VAPID private key.');
  }
  return {
    publicKey: bytesToBase64Url(rawPublic),
    privateKey: jwkPrivate.d,
  };
}

async function deterministicEndpointHash(uid: string, endpoint: string): Promise<string> {
  const enc = new TextEncoder().encode(`${uid}:${endpoint}`);
  const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', enc));
  const hex = Array.from(digest.slice(0, 14))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return sanitizeId(`sub_${uid.slice(0, 16)}_${hex}`);
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      if (import.meta.env.PROD) {
        reg = await navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .catch(() => navigator.serviceWorker.register('/service-worker.js', { scope: '/' }));
      } else {
        reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      }
    }
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((resolve) => setTimeout(() => resolve(reg!), 3500)),
    ]);
    return ready || reg || null;
  } catch {
    return null;
  }
}

export async function fetchPublicVapidKey(): Promise<string | null> {
  // 1. Check Firestore /pushPublic/vapid first (shared across Cloud Run & Cloudflare Pages)
  try {
    const snap = await getDoc(doc(db, 'pushPublic', 'vapid'));
    if (snap.exists()) {
      const pub = (snap.data() as { publicKey?: string }).publicKey?.trim();
      if (pub && pub.length >= 40) return pub;
    }
  } catch {
    // Fall through to backend API
  }

  // 2. Fallback to backend / Cloud Run env endpoint
  try {
    const res = await fetch('/api/push/vapid-public-key');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = (await res.json()) as { publicKey?: string };
      if (json.publicKey && json.publicKey.trim().length >= 40) {
        return json.publicKey.trim();
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Ensures VAPID keys exist in Firestore (/pushConfig/vapid + /pushPublic/vapid)
 * so Web Push works across both Express/Cloud Run and Cloudflare Pages deployments.
 */
export async function ensureAdminVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
} | null> {
  if (!auth.currentUser) return null;

  try {
    const configRef = doc(db, 'pushConfig', 'vapid');
    const pubRef = doc(db, 'pushPublic', 'vapid');
    const existing = await getDoc(configRef);

    if (existing.exists()) {
      const data = existing.data() as {
        publicKey: string;
        privateKey: string;
        subject: string;
      };
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists() || pubSnap.data()?.publicKey !== data.publicKey) {
        await setDoc(pubRef, {
          publicKey: data.publicKey,
          updatedAt: serverTimestamp(),
        });
      }
      return data;
    }

    // Try adopting the server's generated VAPID keypair first so any guest subscriptions remain valid
    let publicKey = '';
    let privateKey = '';
    const subject = 'mailto:tradewithamithyt@gmail.com';

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/push/vapid-init', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const serverKeys = (await res.json()) as {
            publicKey?: string;
            privateKey?: string;
          };
          if (serverKeys.publicKey && serverKeys.privateKey) {
            publicKey = serverKeys.publicKey.trim();
            privateKey = serverKeys.privateKey.trim();
          }
        }
      }
    } catch {
      // On Cloudflare Pages without /api/push/vapid-init, generate via Web Crypto below
    }

    if (!publicKey || !privateKey) {
      const generated = await generateBrowserVapidKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
    }

    const batch = writeBatch(db);
    batch.set(configRef, {
      publicKey,
      privateKey,
      subject,
      updatedAt: serverTimestamp(),
    });
    batch.set(pubRef, {
      publicKey,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    return { publicKey, privateKey, subject };
  } catch (err) {
    console.warn('VAPID initialization skipped:', err);
    return null;
  }
}

async function persistSubscriptionRecord(
  sub: PushSubscription,
  uid?: string | null
): Promise<void> {
  const json = sub.toJSON();
  const endpoint = json.endpoint || sub.endpoint;
  const p256dh = json.keys?.p256dh || '';
  const authSecret = json.keys?.auth || '';

  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !authSecret) {
    return;
  }

  // Register on server cache (supports unauthenticated visitors too)
  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: uid || auth.currentUser?.uid || null,
        subscription: {
          endpoint,
          keys: { p256dh, auth: authSecret },
        },
      }),
    });
  } catch {
    // Non-blocking on static/offline hosts
  }

  // Persist in Firestore for verified signed-in users (works across serverless & Cloudflare Pages)
  const currentUser = auth.currentUser;
  if (currentUser && currentUser.emailVerified) {
    try {
      const subId = await deterministicEndpointHash(currentUser.uid, endpoint);
      const subRef = doc(db, 'pushSubscriptions', subId);
      const snap = await getDoc(subRef);
      if (snap.exists()) {
        await updateDoc(subRef, {
          endpoint: endpoint.slice(0, 1500),
          p256dh: p256dh.slice(0, 256),
          auth: authSecret.slice(0, 128),
          active: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(subRef, {
          id: subId,
          userId: currentUser.uid,
          endpoint: endpoint.slice(0, 1500),
          p256dh: p256dh.slice(0, 256),
          auth: authSecret.slice(0, 128),
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Requests browser Notification permission (if needed) and subscribes the Service Worker
 * to Web Push so alerts arrive even when the browser or app is completely closed.
 */
export async function subscribeUserToBackgroundPush(uid?: string | null): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;

    const reg = await getReadyServiceWorkerRegistration();
    if (!reg || !('pushManager' in reg)) return false;

    const vapidPublicKey = await fetchPublicVapidKey();
    if (!vapidPublicKey) return false;

    const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
    let sub = await reg.pushManager.getSubscription();

    if (sub) {
      // Verify the existing subscription uses the current applicationServerKey
      const existingKeyBuf = sub.options?.applicationServerKey;
      if (existingKeyBuf) {
        const existingBytes = new Uint8Array(existingKeyBuf);
        const matches =
          existingBytes.byteLength === appServerKey.byteLength &&
          existingBytes.every((b, idx) => b === appServerKey[idx]);
        if (!matches) {
          await sub.unsubscribe().catch(() => {});
          sub = null;
        }
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey as BufferSource,
      });
    }

    await persistSubscriptionRecord(sub, uid);
    return true;
  } catch (err) {
    console.warn('Background push subscription warning:', err);
    return false;
  }
}

/**
 * Silently ensures an already-granted notification permission has an active, synced
 * PushManager subscription without prompting the user.
 */
export async function syncExistingPushSubscription(uid?: string | null): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  await subscribeUserToBackgroundPush(uid);
}

/**
 * Dispatches background Web Push notifications to all subscribers (targetUid === 'ALL')
 * or a specific member (targetUid === userId) when Admin publishes signals, broadcasts, or approvals.
 */
export async function dispatchAdminWebPush(params: {
  targetUid: string;
  title: string;
  message: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  if (!auth.currentUser) return;

  try {
    const vapid = await ensureAdminVapidKeys();
    const idToken = await auth.currentUser.getIdToken();

    const snap = await getDocs(collection(db, 'pushSubscriptions'));
    const subscriptions: Array<{
      id: string;
      userId: string;
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }> = [];

    snap.forEach((d) => {
      const r = d.data() as {
        id: string;
        userId: string;
        endpoint: string;
        p256dh: string;
        auth: string;
        active: boolean;
      };
      if (!r.active || !r.endpoint || !r.p256dh || !r.auth) return;
      if (params.targetUid !== 'ALL' && r.userId !== params.targetUid) return;
      subscriptions.push({
        id: d.id,
        userId: r.userId,
        endpoint: r.endpoint,
        keys: { p256dh: r.p256dh, auth: r.auth },
      });
    });

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        vapid: vapid || undefined,
        targetUid: params.targetUid,
        subscriptions,
        notification: {
          title: params.title,
          body: params.message,
          icon: '/pwa-192x192.png?v=twa3',
          badge: '/pwa-192x192.png?v=twa3',
          url: params.url || '/',
          tag: params.tag || `twa_${Date.now()}`,
        },
      }),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = (await res.json()) as { expiredIds?: string[] };
        if (Array.isArray(result.expiredIds) && result.expiredIds.length > 0) {
          await Promise.all(
            result.expiredIds.map((deadId) =>
              deleteDoc(doc(db, 'pushSubscriptions', deadId)).catch(() => {})
            )
          );
        }
      }
    }
  } catch (err) {
    console.warn('Background push dispatch skipped:', err);
  }
}
