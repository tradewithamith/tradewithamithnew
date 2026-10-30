import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  auth,
  clampStr,
  consumeRedirectResult,
  db,
  handleFirestoreError,
  isBootstrappedAdminEmail,
  logoutUser,
  OperationType,
  parseFirebaseAuthError,
  sanitizeId,
  signInWithGoogle,
} from '../lib/firebase';
import {
  fetchYoutubeSubscriberCount,
  recordUniqueAuthenticatedVisit,
  verifyYoutubeSubscription,
  type YoutubeCheckResult,
} from '../lib/integrations';
import {
  DEFAULT_SETTINGS,
  STARTER_FREE_BOOKS,
  STARTER_PAID_BOOKS,
  STARTER_SIGNALS_PUBLIC,
  STARTER_VIDEOS,
  type AcademySettings,
  type AcademyVideo,
  type AppNotification,
  type BookAccessItem,
  type FreeBook,
  type MergedSignal,
  type PaidBookPublic,
  type UserProfile,
  type VipGrant,
  type VipSignalPrivate,
  type VipSignalPublic,
  type VisitorStatistics,
} from '../types/academy';

function tsToMs(val: unknown, fallback = Date.now()): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof val === 'number') return val;
  return fallback;
}

interface AcademyContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  vipGrant: VipGrant | null;
  isAdmin: boolean;
  isVipActive: boolean;
  settings: AcademySettings;
  subscriberCount: string;
  signals: MergedSignal[];
  videos: AcademyVideo[];
  freeBooks: FreeBook[];
  paidBooks: PaidBookPublic[];
  bookAccessMap: Record<string, BookAccessItem>;
  notifications: AppNotification[];
  visitorStats: VisitorStatistics;
  usingStarterCatalog: boolean;
  gateVerified: boolean;
  gateMessage: string | null;
  gateBusy: boolean;
  login: (opts?: { includeYoutubeScope?: boolean; includeSheetsScope?: boolean }) => Promise<User | null>;
  logout: () => Promise<void>;
  verifySubscriberGate: () => Promise<YoutubeCheckResult>;
  bypassGateForSession: () => void;
  submitVipRequest: (input: {
    name: string;
    telegram: string;
    method: 'EXNESS' | 'BINANCE' | 'CUSTOM';
    exnessId?: string;
    transactionId?: string;
    customDetails?: string;
  }) => Promise<void>;
  submitBookPurchase: (input: {
    book: PaidBookPublic;
    name: string;
    telegram: string;
    transactionId: string;
  }) => Promise<void>;
  incrementFreeBookMetric: (book: FreeBook, field: 'views' | 'downloads') => Promise<void>;
  getProtectedPaidBookUrl: (bookId: string) => Promise<string | null>;
}

const AcademyContext = createContext<AcademyContextValue | null>(null);

export const AcademyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [vipGrant, setVipGrant] = useState<VipGrant | null>(null);
  const [isDbAdmin, setIsDbAdmin] = useState(false);

  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_SETTINGS);
  const [subscriberCount, setSubscriberCount] = useState<string>(DEFAULT_SETTINGS.subscriberCountFallback);

  const [dbSignalsPublic, setDbSignalsPublic] = useState<VipSignalPublic[] | null>(null);
  const [signalsPrivateMap, setSignalsPrivateMap] = useState<Record<string, VipSignalPrivate>>({});

  const [dbVideos, setDbVideos] = useState<AcademyVideo[] | null>(null);
  const [dbFreeBooks, setDbFreeBooks] = useState<FreeBook[] | null>(null);
  const [dbPaidBooks, setDbPaidBooks] = useState<PaidBookPublic[] | null>(null);

  const [bookAccessMap, setBookAccessMap] = useState<Record<string, BookAccessItem>>({});
  const [broadcastNotifs, setBroadcastNotifs] = useState<AppNotification[]>([]);
  const [personalNotifs, setPersonalNotifs] = useState<AppNotification[]>([]);

  const [visitorStats, setVisitorStats] = useState<VisitorStatistics>({
    dayKey: new Date().toISOString().slice(0, 10),
    weekKey: '',
    monthKey: new Date().toISOString().slice(0, 7),
    todayCount: 1,
    weekCount: 1,
    monthCount: 1,
    totalCount: 1,
    lastSessionId: '',
  });

  const [gateVerified, setGateVerified] = useState<boolean>(() => {
    return localStorage.getItem('msnr_yt_verified_v1') === 'true';
  });
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);

  const isBootstrappedAdmin =
    !!user && user.emailVerified && isBootstrappedAdminEmail(user.email);

  const isAdmin = isBootstrappedAdmin || isDbAdmin;

  const isVipActive = useMemo(() => {
    if (isAdmin) return true;
    if (!vipGrant) return false;
    if (vipGrant.approvalStatus !== 'APPROVED' || vipGrant.vipStatus !== 'ACTIVE') {
      return false;
    }
    if (vipGrant.vipType === 'LIFETIME') return true;
    if (vipGrant.vipType === 'MONTHLY' || vipGrant.vipType === 'CUSTOM') {
      return vipGrant.vipExpiryMs > Date.now();
    }
    return false;
  }, [isAdmin, vipGrant]);

  // 1. Auth Listener & Automatic Profile Provisioning
  useEffect(() => {
    void consumeRedirectResult();

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      if (!currentUser) {
        setProfile(null);
        setVipGrant(null);
        setIsDbAdmin(false);
        setSignalsPrivateMap({});
        setBookAccessMap({});
        setPersonalNotifs([]);
        return;
      }

      if (isBootstrappedAdminEmail(currentUser.email)) {
        setGateVerified(true);
        localStorage.setItem('msnr_yt_verified_v1', 'true');
      }

      // Ensure user profile exists in Firestore
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists() && currentUser.emailVerified && currentUser.email) {
          const initialProfile = {
            uid: currentUser.uid,
            name: clampStr(currentUser.displayName || currentUser.email.split('@')[0], 100, 'Member'),
            email: clampStr(currentUser.email, 256),
            telegram: '',
            youtubeVerified: localStorage.getItem('msnr_yt_verified_v1') === 'true',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, initialProfile);
        }
      } catch (err) {
        console.warn('Profile initialization skipped:', err);
      }

      // Record deduplicated daily visitor count
      if (currentUser.emailVerified) {
        recordUniqueAuthenticatedVisit(currentUser.uid);
      }
    });
    return () => unsub();
  }, []);

  // Sync browser favicon across all pages if Admin uploads a custom logo
  useEffect(() => {
    if (
      settings.logoUrl &&
      !settings.logoUrl.includes('logo_9bf96027.JPG') &&
      typeof document !== 'undefined'
    ) {
      const iconLinks = document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
      );
      iconLinks.forEach((link) => {
        link.href = settings.logoUrl;
      });
    }
  }, [settings.logoUrl]);

  // 2. Public Settings & Visitor Statistics Listeners
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    const resolveAsset = (url?: string) => {
      if (!url) return '';
      if (url.startsWith('/assets/')) {
        return `${base}${url.slice(1)}`;
      }
      return url;
    };

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'config'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<AcademySettings>;
          const merged: AcademySettings = { ...DEFAULT_SETTINGS, ...data };
          if (!data.logoUrl || data.logoUrl.includes('brand_emblem_gold')) {
            merged.logoUrl = DEFAULT_SETTINGS.logoUrl;
          } else {
            merged.logoUrl = resolveAsset(merged.logoUrl);
          }
          if (!data.binanceQrUrl) {
            merged.binanceQrUrl = DEFAULT_SETTINGS.binanceQrUrl;
          } else {
            merged.binanceQrUrl = resolveAsset(merged.binanceQrUrl);
          }
          if (!data.youtubeChannelId) {
            merged.youtubeChannelId = DEFAULT_SETTINGS.youtubeChannelId;
          }
          if (
            !data.youtubeChannelUrl ||
            data.youtubeChannelUrl === 'https://www.youtube.com/@TradeWithAmith'
          ) {
            merged.youtubeChannelUrl = DEFAULT_SETTINGS.youtubeChannelUrl;
          }
          if (
            !data.exnessReferralUrl ||
            data.exnessReferralUrl === 'https://one.exnesstrack.org/a/tradewithamith'
          ) {
            merged.exnessReferralUrl = DEFAULT_SETTINGS.exnessReferralUrl;
          }
          if (!data.telegramUrl || data.telegramUrl === 'https://t.me/TradeWithAmith') {
            merged.telegramUrl = DEFAULT_SETTINGS.telegramUrl;
          }
          if (data.subscriberCountFallback === '24,800') {
            merged.subscriberCountFallback = DEFAULT_SETTINGS.subscriberCountFallback;
          }
          setSettings(merged);
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      },
      (err) => console.warn('Settings snapshot warning:', err)
    );

    const unsubStats = onSnapshot(
      doc(db, 'statistics', 'visitors'),
      (snap) => {
        if (snap.exists()) {
          setVisitorStats(snap.data() as VisitorStatistics);
        }
      },
      (err) => console.warn('Stats snapshot warning:', err)
    );

    return () => {
      unsubSettings();
      unsubStats();
    };
  }, []);

  // 3. Sync YouTube Subscriber Count when channelId or fallback updates
  useEffect(() => {
    let active = true;
    fetchYoutubeSubscriberCount(settings.youtubeChannelId, settings.subscriberCountFallback).then(
      (count) => {
        if (active) setSubscriberCount(count);
      }
    );
    return () => {
      active = false;
    };
  }, [settings.youtubeChannelId, settings.subscriberCountFallback, user]);

  // 4. User Profile, VIP Grant, Admin Doc, Book Access & Personal Notifications
  useEffect(() => {
    if (!user) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
          if (data.youtubeVerified) {
            setGateVerified(true);
            localStorage.setItem('msnr_yt_verified_v1', 'true');
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    );

    const unsubVip = onSnapshot(
      doc(db, 'vipGrants', user.uid),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data();
          setVipGrant({
            userId: raw.userId,
            vipStatus: raw.vipStatus,
            vipType: raw.vipType,
            approvalStatus: raw.approvalStatus,
            vipExpiryMs: tsToMs(raw.vipExpiry, 0),
          });
        } else {
          setVipGrant(null);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `vipGrants/${user.uid}`)
    );

    const unsubAdmin = onSnapshot(
      doc(db, 'admins', user.uid),
      (snap) => {
        setIsDbAdmin(snap.exists());
      },
      () => setIsDbAdmin(false)
    );

    const accessQuery = query(collection(db, 'bookAccess'), where('userId', '==', user.uid));
    const unsubAccess = onSnapshot(
      accessQuery,
      (snap) => {
        const map: Record<string, BookAccessItem> = {};
        snap.forEach((d) => {
          const item = d.data() as BookAccessItem;
          map[item.bookId] = item;
        });
        setBookAccessMap(map);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bookAccess')
    );

    const personalNotifQuery = query(
      collection(db, 'notifications'),
      where('active', '==', true),
      where('targetUid', '==', user.uid)
    );
    const unsubPersonalNotifs = onSnapshot(
      personalNotifQuery,
      (snap) => {
        const items: AppNotification[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          items.push({
            id: d.id,
            targetUid: raw.targetUid,
            title: raw.title,
            message: raw.message,
            icon: raw.icon,
            buttonText: raw.buttonText,
            buttonUrl: raw.buttonUrl,
            active: raw.active,
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setPersonalNotifs(items.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      () => {}
    );

    return () => {
      unsubProfile();
      unsubVip();
      unsubAdmin();
      unsubAccess();
      unsubPersonalNotifs();
    };
  }, [user]);

  // 5. Public Catalog Listeners (Signals, Videos, Free Books, Paid Books, Broadcast Notifications)
  useEffect(() => {
    const signalsQ = query(collection(db, 'vipSignalsPublic'), where('currency', '==', 'XAUUSD'));
    const unsubSignals = onSnapshot(
      signalsQ,
      (snap) => {
        if (snap.empty) {
          setDbSignalsPublic([]);
          return;
        }
        const list: VipSignalPublic[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          list.push({
            id: d.id,
            date: raw.date,
            currency: 'XAUUSD',
            direction: raw.direction,
            orderType: raw.orderType,
            result: raw.result,
            pips: raw.pips,
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setDbSignalsPublic(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      () => setDbSignalsPublic([])
    );

    const videosQ = query(collection(db, 'videos'), where('status', '==', 'ACTIVE'));
    const unsubVideos = onSnapshot(
      videosQ,
      (snap) => {
        if (snap.empty) {
          setDbVideos([]);
          return;
        }
        const list: AcademyVideo[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          list.push({
            id: d.id,
            title: raw.title,
            youtubeUrl: raw.youtubeUrl,
            thumbnail: raw.thumbnail,
            description: raw.description,
            date: raw.date,
            status: raw.status,
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setDbVideos(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      () => setDbVideos([])
    );

    const freeBooksQ = query(collection(db, 'freeBooks'), where('status', '==', 'ACTIVE'));
    const unsubFree = onSnapshot(
      freeBooksQ,
      (snap) => {
        if (snap.empty) {
          setDbFreeBooks([]);
          return;
        }
        const list: FreeBook[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          list.push({
            id: d.id,
            name: raw.name,
            description: raw.description,
            coverUrl: raw.coverUrl,
            pdfUrl: raw.pdfUrl,
            views: raw.views ?? 0,
            downloads: raw.downloads ?? 0,
            status: raw.status,
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setDbFreeBooks(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      () => setDbFreeBooks([])
    );

    const paidBooksQ = query(collection(db, 'paidBooksPublic'), where('status', '==', 'ACTIVE'));
    const unsubPaid = onSnapshot(
      paidBooksQ,
      (snap) => {
        if (snap.empty) {
          setDbPaidBooks([]);
          return;
        }
        const list: PaidBookPublic[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          list.push({
            id: d.id,
            name: raw.name,
            description: raw.description,
            coverUrl: raw.coverUrl,
            price: raw.price ?? 0,
            status: raw.status,
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setDbPaidBooks(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      () => setDbPaidBooks([])
    );

    const notifQ = query(
      collection(db, 'notifications'),
      where('active', '==', true),
      where('targetUid', '==', 'ALL')
    );
    const unsubNotifs = onSnapshot(
      notifQ,
      (snap) => {
        const list: AppNotification[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          list.push({
            id: d.id,
            targetUid: raw.targetUid,
            title: raw.title,
            message: raw.message,
            icon: raw.icon,
            buttonText: raw.buttonText,
            buttonUrl: raw.buttonUrl,
            active: raw.active,
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setBroadcastNotifs(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      () => {}
    );

    return () => {
      unsubSignals();
      unsubVideos();
      unsubFree();
      unsubPaid();
      unsubNotifs();
    };
  }, []);

  // 6. Fetch Protected Signal Execution Prices ONLY when user is Active VIP or Admin
  const activeSignalsSource =
    dbSignalsPublic && dbSignalsPublic.length > 0 ? dbSignalsPublic : STARTER_SIGNALS_PUBLIC;

  useEffect(() => {
    if (!isVipActive || !user) {
      setSignalsPrivateMap({});
      return;
    }

    if (!dbSignalsPublic || dbSignalsPublic.length === 0) {
      // Starter preview private levels for VIP / Admin before custom signals are created
      setSignalsPrivateMap({
        sig_xau_active_01: {
          id: 'sig_xau_active_01',
          currency: 'XAUUSD',
          entry: 4140,
          tp: 4150,
          extraTp: 4160,
          sl: 4128,
          note: 'Wait for M15 candlestick body close confirmation at fresh H4 MSNR support before entry.',
        },
        sig_xau_active_02: {
          id: 'sig_xau_active_02',
          currency: 'XAUUSD',
          entry: 4162,
          tp: 4150,
          extraTp: 4142,
          sl: 4171,
          note: 'Fresh Daily A-level rejection during London open. Secure 70% at TP1 and move SL to breakeven.',
        },
        sig_xau_hist_01: {
          id: 'sig_xau_hist_01',
          currency: 'XAUUSD',
          entry: 4118,
          tp: 4132.5,
          extraTp: 4140,
          sl: 4109,
          note: 'NY session sweep of Asian low directly into unmitigated H4 Gap level.',
        },
        sig_xau_hist_02: {
          id: 'sig_xau_hist_02',
          currency: 'XAUUSD',
          entry: 4155,
          tp: 4142,
          extraTp: 4134,
          sl: 4161.5,
          note: 'Invalidated on high-impact CPI impulse break above H1 roadblock.',
        },
        sig_xau_hist_03: {
          id: 'sig_xau_hist_03',
          currency: 'XAUUSD',
          entry: 4105,
          tp: 4116,
          extraTp: 4125,
          sl: 4097,
          note: 'Clean RBS flip retest with zero drawdown.',
        },
        sig_xau_hist_04: {
          id: 'sig_xau_hist_04',
          currency: 'XAUUSD',
          entry: 4148,
          tp: 4140.5,
          extraTp: 4132,
          sl: 4156,
          note: 'Closed manually ahead of FOMC minutes at +75 pips.',
        },
      });
      return;
    }

    let cancelled = false;
    Promise.all(
      dbSignalsPublic.map(async (sig) => {
        try {
          const snap = await getDoc(doc(db, 'vipSignalsPrivate', sig.id));
          if (snap.exists()) {
            const d = snap.data();
            return [
              sig.id,
              {
                id: sig.id,
                currency: 'XAUUSD' as const,
                entry: d.entry,
                tp: d.tp,
                extraTp: d.extraTp,
                sl: d.sl,
                note: d.note,
              },
            ] as const;
          }
        } catch {
          // Ignore individual missing doc
        }
        return null;
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, VipSignalPrivate> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setSignalsPrivateMap(next);
    });

    return () => {
      cancelled = true;
    };
  }, [isVipActive, user, dbSignalsPublic]);

  const signals: MergedSignal[] = useMemo(() => {
    return activeSignalsSource.map((pub) => {
      const priv = isVipActive ? signalsPrivateMap[pub.id] : undefined;
      return priv ? { ...pub, ...priv } : pub;
    });
  }, [activeSignalsSource, isVipActive, signalsPrivateMap]);

  const videos = dbVideos && dbVideos.length > 0 ? dbVideos : STARTER_VIDEOS;
  const freeBooks = dbFreeBooks && dbFreeBooks.length > 0 ? dbFreeBooks : STARTER_FREE_BOOKS;
  const paidBooks = dbPaidBooks && dbPaidBooks.length > 0 ? dbPaidBooks : STARTER_PAID_BOOKS;
  const usingStarterCatalog =
    (dbSignalsPublic?.length ?? 0) === 0 &&
    (dbVideos?.length ?? 0) === 0 &&
    (dbFreeBooks?.length ?? 0) === 0 &&
    (dbPaidBooks?.length ?? 0) === 0;

  const notifications = useMemo(() => {
    return [...personalNotifs, ...broadcastNotifs].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [personalNotifs, broadcastNotifs]);

  // Actions
  const login = useCallback(
    async (opts?: { includeYoutubeScope?: boolean; includeSheetsScope?: boolean }) => {
      const res = await signInWithGoogle(opts);
      return res.user;
    },
    []
  );

  const logout = useCallback(async () => {
    await logoutUser();
  }, []);

  const verifySubscriberGate = useCallback(async (): Promise<YoutubeCheckResult> => {
    setGateBusy(true);
    setGateMessage(null);
    try {
      const { user: signedInUser, accessToken } = await signInWithGoogle({
        includeYoutubeScope: true,
      });

      const check = await verifyYoutubeSubscription(settings.youtubeChannelId, accessToken);

      if (
        check.status === 'SUBSCRIBED' ||
        check.status === 'UNCONFIGURED' ||
        isBootstrappedAdminEmail(signedInUser.email)
      ) {
        setGateVerified(true);
        localStorage.setItem('msnr_yt_verified_v1', 'true');
        if (signedInUser.emailVerified && signedInUser.email) {
          const userRef = doc(db, 'users', signedInUser.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            await updateDoc(userRef, {
              youtubeVerified: true,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(userRef, {
              uid: signedInUser.uid,
              name: clampStr(signedInUser.displayName || 'Member', 100, 'Member'),
              email: clampStr(signedInUser.email, 256),
              telegram: '',
              youtubeVerified: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } else {
        setGateMessage(check.message);
      }

      return check;
    } catch (err) {
      const parsed = parseFirebaseAuthError(err);
      const errText = parsed.isUnauthorizedDomain
        ? `${parsed.message} Add "${parsed.hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`
        : parsed.message;
      setGateMessage(errText);
      return {
        status: 'API_LIMITED',
        message: errText,
      };
    } finally {
      setGateBusy(false);
    }
  }, [settings.youtubeChannelId]);

  const bypassGateForSession = useCallback(() => {
    setGateVerified(true);
    localStorage.setItem('msnr_yt_verified_v1', 'true');
  }, []);

  const submitVipRequest = useCallback(
    async (input: {
      name: string;
      telegram: string;
      method: 'EXNESS' | 'BINANCE' | 'CUSTOM';
      exnessId?: string;
      transactionId?: string;
      customDetails?: string;
    }) => {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const res = await signInWithGoogle();
        activeUser = res.user;
      }
      if (!activeUser || !activeUser.email) {
        throw new Error('Authentication required to submit VIP verification.');
      }

      // Ensure user profile exists before creating vipRequest (enforced by firestore.rules exists())
      const userRef = doc(db, 'users', activeUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: activeUser.uid,
          name: clampStr(input.name, 100, 'Member'),
          email: clampStr(activeUser.email, 256),
          telegram: clampStr(input.telegram, 64),
          youtubeVerified: gateVerified,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, {
          name: clampStr(input.name, 100, 'Member'),
          telegram: clampStr(input.telegram, 64),
          updatedAt: serverTimestamp(),
        });
      }

      const requestId = sanitizeId(`vip_${activeUser.uid.slice(0, 12)}_${Date.now()}`);
      const path = `vipRequests/${requestId}`;
      try {
        await setDoc(doc(db, 'vipRequests', requestId), {
          id: requestId,
          userId: activeUser.uid,
          name: clampStr(input.name, 100, 'Member'),
          email: clampStr(activeUser.email, 256),
          telegram: clampStr(input.telegram, 64),
          method: input.method,
          exnessId: clampStr(input.exnessId, 100),
          transactionId: clampStr(input.transactionId, 120),
          customDetails: clampStr(input.customDetails, 500),
          status: 'PENDING',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [gateVerified]
  );

  const submitBookPurchase = useCallback(
    async (input: {
      book: PaidBookPublic;
      name: string;
      telegram: string;
      transactionId: string;
    }) => {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const res = await signInWithGoogle();
        activeUser = res.user;
      }
      if (!activeUser || !activeUser.email) {
        throw new Error('Authentication required to submit book purchase.');
      }

      // Check if book exists in Firestore paidBooksPublic (starter books may not be seeded yet)
      const bookPubSnap = await getDoc(doc(db, 'paidBooksPublic', input.book.id));
      if (!bookPubSnap.exists()) {
        throw new Error(
          'This starter book has not been published in Admin -> Paid PDFs yet. Ask Admin to click "Initialize Starter Catalog" in Admin Overview.'
        );
      }

      const purchaseId = sanitizeId(`pur_${activeUser.uid.slice(0, 10)}_${Date.now()}`);
      const path = `bookPurchases/${purchaseId}`;
      try {
        await setDoc(doc(db, 'bookPurchases', purchaseId), {
          id: purchaseId,
          userId: activeUser.uid,
          userEmail: clampStr(activeUser.email, 256),
          bookId: input.book.id,
          bookName: clampStr(input.book.name, 200),
          price: Number(input.book.price) || 0,
          name: clampStr(input.name, 100),
          telegram: clampStr(input.telegram, 64),
          transactionId: clampStr(input.transactionId, 120),
          status: 'PENDING',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    []
  );

  const incrementFreeBookMetric = useCallback(
    async (book: FreeBook, field: 'views' | 'downloads') => {
      if (!auth.currentUser?.emailVerified) return;
      try {
        const ref = doc(db, 'freeBooks', book.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const curr = snap.data();
        await updateDoc(ref, {
          [field]: (Number(curr[field]) || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-blocking counter increment
      }
    },
    []
  );

  const getProtectedPaidBookUrl = useCallback(async (bookId: string): Promise<string | null> => {
    try {
      const snap = await getDoc(doc(db, 'paidBooksProtected', bookId));
      if (snap.exists()) {
        return (snap.data() as { pdfUrl?: string }).pdfUrl || null;
      }
      // Starter fallback for admin testing before seeding
      if (bookId === 'paid_msnr_playbook') return '/api/sample-pdf/msnr-masterbook-pro';
      if (bookId === 'paid_xauusd_atlas') return '/api/sample-pdf/xauusd-liquidity-atlas';
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `paidBooksProtected/${bookId}`);
    }
  }, []);

  const value: AcademyContextValue = {
    user,
    authReady,
    profile,
    vipGrant,
    isAdmin,
    isVipActive,
    settings,
    subscriberCount,
    signals,
    videos,
    freeBooks,
    paidBooks,
    bookAccessMap,
    notifications,
    visitorStats,
    usingStarterCatalog,
    gateVerified,
    gateMessage,
    gateBusy,
    login,
    logout,
    verifySubscriberGate,
    bypassGateForSession,
    submitVipRequest,
    submitBookPurchase,
    incrementFreeBookMetric,
    getProtectedPaidBookUrl,
  };

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
};

export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext);
  if (!ctx) throw new Error('useAcademy must be used inside AcademyProvider');
  return ctx;
}
