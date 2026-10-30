import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import type { SignalDirection, SignalResult } from '../types/academy';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const BOOTSTRAPPED_ADMIN_EMAIL = 'emoneywithamith@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'emoneywithamith@gmail.com',
  'amithmadumal19941029@gmail.com',
] as const;

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return BOOTSTRAPPED_ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === normalized);
}

export const FIREBASE_AUTH_SETTINGS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

// Configured Google OAuth Scopes matching set_up_oauth provisioning
export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

let cachedAccessToken: string | null = null;
let isSigningIn = false;
let activeSignInPromise: Promise<{ user: User; accessToken: string | null }> | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user && !isSigningIn) {
    cachedAccessToken = null;
  }
});

// Mandatory startup Firestore connection validation per firebase-integration-rpc
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function buildGoogleProvider(options?: {
  includeYoutubeScope?: boolean;
  includeSheetsScope?: boolean;
}): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  if (options?.includeYoutubeScope) {
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
  }
  if (options?.includeSheetsScope) {
    provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
  }
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function isTopLevelBrowserWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

export async function signInWithGoogle(options?: {
  includeYoutubeScope?: boolean;
  includeSheetsScope?: boolean;
}): Promise<{ user: User; accessToken: string | null }> {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  const provider = buildGoogleProvider(options);

  activeSignInPromise = (async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      return { user: result.user, accessToken: cachedAccessToken };
    } finally {
      isSigningIn = false;
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
}

export async function signInWithGoogleRedirect(options?: {
  includeYoutubeScope?: boolean;
  includeSheetsScope?: boolean;
}): Promise<void> {
  const provider = buildGoogleProvider(options);
  await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
}

export async function consumeRedirectResult(): Promise<void> {
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
    }
  } catch (err) {
    console.warn('Redirect sign-in check:', err);
  }
}

export interface ParsedAuthError {
  code: string;
  title: string;
  message: string;
  hostname: string;
  firebaseConsoleUrl: string;
  isUnauthorizedDomain: boolean;
  isPopupBlocked: boolean;
  isUserCancelled: boolean;
}

export function parseFirebaseAuthError(error: unknown): ParsedAuthError {
  const hostname =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'your-domain.github.io';

  const rawCode =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';

  const rawMessage = error instanceof Error ? error.message : String(error || 'Sign-in failed');

  if (
    rawCode === 'auth/unauthorized-domain' ||
    rawMessage.toLowerCase().includes('unauthorized-domain')
  ) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'Domain Not Authorized in Firebase Yet',
      message: `Firebase immediately closed the login popup because "${hostname}" is not added to your Firebase project's Authorized Domains yet.`,
      hostname,
      firebaseConsoleUrl: FIREBASE_AUTH_SETTINGS_URL,
      isUnauthorizedDomain: true,
      isPopupBlocked: false,
      isUserCancelled: false,
    };
  }

  if (rawCode === 'auth/popup-blocked' || rawMessage.toLowerCase().includes('popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      title: 'Browser Blocked the Google Sign-In Popup',
      message:
        'Allow popups for this site in your browser address bar, then click Sign In again (or use Full-Page Redirect below).',
      hostname,
      firebaseConsoleUrl: FIREBASE_AUTH_SETTINGS_URL,
      isUnauthorizedDomain: false,
      isPopupBlocked: true,
      isUserCancelled: false,
    };
  }

  if (
    rawCode === 'auth/popup-closed-by-user' ||
    rawCode === 'auth/cancelled-popup-request' ||
    rawMessage.toLowerCase().includes('popup-closed-by-user')
  ) {
    return {
      code: rawCode || 'auth/popup-closed-by-user',
      title: 'Google Sign-In Popup Closed Before Completing',
      message: `If the popup closed by itself right away, verify that "${hostname}" is listed in Firebase Authorized Domains and that third-party popups/cookies are allowed.`,
      hostname,
      firebaseConsoleUrl: FIREBASE_AUTH_SETTINGS_URL,
      isUnauthorizedDomain: false,
      isPopupBlocked: false,
      isUserCancelled: true,
    };
  }

  return {
    code: rawCode || 'auth/error',
    title: 'Google Sign-In Could Not Complete',
    message: rawMessage,
    hostname,
    firebaseConsoleUrl: FIREBASE_AUTH_SETTINGS_URL,
    isUnauthorizedDomain: false,
    isPopupBlocked: false,
    isUserCancelled: false,
  };
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export async function logoutUser(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

// Validation synchronicity helpers matching firebase-blueprint.json & firestore.rules
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (cleaned.length >= 1 && ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

export function clampStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const trimmed = (val ?? fallback).trim();
  return trimmed.slice(0, maxLen);
}

/**
 * Configurable XAUUSD Pip Calculator
 * Example: Entry 4140 -> TP 4150 with pipMultiplier 10 => +100 PIPS
 */
export function calculateSignalPips(params: {
  direction: SignalDirection;
  entry: number;
  tp: number;
  sl: number;
  result: SignalResult;
  pipMultiplier: number;
}): number {
  const { direction, entry, tp, sl, result, pipMultiplier } = params;
  const mult = pipMultiplier > 0 ? pipMultiplier : 10;

  if (!Number.isFinite(entry) || !Number.isFinite(tp) || !Number.isFinite(sl)) {
    return 0;
  }

  if (result === 'SL HIT') {
    const lossDistance = Math.abs(entry - sl);
    return -Math.round(lossDistance * mult);
  }

  // For ACTIVE, TP HIT, or CLOSED (projected/realized primary target distance)
  const rawMove = direction === 'BUY' ? tp - entry : entry - tp;
  return Math.round(rawMove * mult);
}
