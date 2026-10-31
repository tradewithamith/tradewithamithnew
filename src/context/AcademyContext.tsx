import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
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
  clearYoutubeAccessToken,
  computeTradingPerformanceStats,
  consumeRedirectResult,
  db,
  getValidYoutubeAccessToken,
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
  getCalendarKeys,
  normalizeYoutubeChannelId,
  recordUniqueAuthenticatedVisit,
  sanitizeSubscriberCount,
  verifyYoutubeSubscription,
  type YoutubeCheckResult,
} from '../lib/integrations';
import { syncExistingPushSubscription } from '../lib/pushNotifications';
import {
  DEFAULT_SETTINGS,
  LEGACY_DEMO_FREE_BOOK_IDS,
  LEGACY_DEMO_PAID_BOOK_IDS,
  LEGACY_DEMO_SIGNAL_IDS,
  LEGACY_DEMO_VIDEO_IDS,
  type AcademySettings,
  type AcademyVideo,
  type AppNotification,
  type BookAccessItem,
  type FreeBook,
  type MarketAnalysisReaction,
  type MarketAnalysisReactionSummary,
  type MarketAnalysisVideo,
  type MergedSignal,
  type PaidBookPublic,
  type TradingPerformanceStats,
  type UserProfile,
  type VideoReactionType,
  type VipCategory,
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
  hasPendingVipRequest: boolean;
  settings: AcademySettings;
  subscriberCount: string;
  signals: MergedSignal[];
  tradingStats: TradingPerformanceStats;
  videos: AcademyVideo[];
  marketAnalysisVideos: MarketAnalysisVideo[];
  marketAnalysisReactionsSummary: Record<string, MarketAnalysisReactionSummary>;
  freeBooks: FreeBook[];
  paidBooks: PaidBookPublic[];
  bookAccessMap: Record<string, BookAccessItem>;
  notifications: AppNotification[];
  visitorStats: VisitorStatistics;
  gateVerified: boolean;
  gateMessage: string | null;
  gateBusy: boolean;
  login: (opts?: { includeYoutubeScope?: boolean; includeSheetsScope?: boolean }) => Promise<User | null>;
  logout: () => Promise<void>;
  verifySubscriberGate: () => Promise<YoutubeCheckResult>;
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
  toggleMarketAnalysisReaction: (videoId: string, reaction: VideoReactionType) => Promise<void>;
}

const AcademyContext = createContext<AcademyContextValue | null>(null);

export const AcademyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [vipGrant, setVipGrant] = useState<VipGrant | null>(null);

  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_SETTINGS);
  const [subscriberCount, setSubscriberCount] = useState<string>(DEFAULT_SETTINGS.subscriberCountFallback);

  const [dbSignalsPublic, setDbSignalsPublic] = useState<VipSignalPublic[] | null>(null);
  const [signalsPrivateMap, setSignalsPrivateMap] = useState<Record<string, VipSignalPrivate>>({});

  const [dbVideos, setDbVideos] = useState<AcademyVideo[] | null>(null);
  const [dbMarketAnalysisVideos, setDbMarketAnalysisVideos] = useState<MarketAnalysisVideo[]>([]);
  const [dbMarketAnalysisReactions, setDbMarketAnalysisReactions] = useState<MarketAnalysisReaction[]>([]);
  const [dbFreeBooks, setDbFreeBooks] = useState<FreeBook[] | null>(null);
  const [dbPaidBooks, setDbPaidBooks] = useState<PaidBookPublic[] | null>(null);

  const [bookAccessMap, setBookAccessMap] = useState<Record<string, BookAccessItem>>({});
  const [broadcastNotifs, setBroadcastNotifs] = useState<AppNotification[]>([]);
  const [personalNotifs, setPersonalNotifs] = useState<AppNotification[]>([]);

  const [visitorStats, setVisitorStats] = useState<VisitorStatistics>(() => {
    const { dayKey, weekKey, monthKey } = getCalendarKeys();
    return {
      dayKey,
      weekKey,
      monthKey,
      todayCount: 0,
      weekCount: 0,
      monthCount: 0,
      totalCount: 0,
      lastSessionId: '',
    };
  });

  const [hasPendingVipRequestDb, setHasPendingVipRequestDb] = useState(false);

  const [gateVerified, setGateVerified] = useState<boolean>(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);

  const isBootstrappedAdmin =
    !!user && user.emailVerified && isBootstrappedAdminEmail(user.email);

  const isAdmin = isBootstrappedAdmin;

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

  const hasPendingVipRequest = useMemo(() => {
    if (isVipActive) return false;
    return hasPendingVipRequestDb || vipGrant?.approvalStatus === 'PENDING';
  }, [isVipActive, hasPendingVipRequestDb, vipGrant]);

  // 1. Auth Listener & Automatic Profile Provisioning
  useEffect(() => {
    void consumeRedirectResult();
    try {
      localStorage.removeItem('msnr_yt_verified_v1');
    } catch {
      // Ignore storage errors
    }

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      void syncExistingPushSubscription(currentUser?.uid || null);

      if (!currentUser) {
        setProfile(null);
        setVipGrant(null);
        setHasPendingVipRequestDb(false);
        setSignalsPrivateMap({});
        setBookAccessMap({});
        setPersonalNotifs([]);
        setGateVerified(false);
        return;
      }

      if (isBootstrappedAdminEmail(currentUser.email)) {
        setGateVerified(true);
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
            youtubeVerified: false,
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

  // Re-verify YouTube channel subscription on every website revisit & tab return
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    let lastCheckedAt = 0;

    const runSubscriptionRevisitCheck = async () => {
      if (cancelled) return;

      if (!settings.youtubeGateEnabled || isBootstrappedAdmin) {
        setGateVerified(true);
        setGateMessage(null);
        return;
      }

      if (!user) {
        setGateVerified(false);
        return;
      }

      const token = getValidYoutubeAccessToken(user.uid);
      if (!token) {
        setGateVerified(false);
        return;
      }

      lastCheckedAt = Date.now();
      const check = await verifyYoutubeSubscription(settings.youtubeChannelId, token);
      if (cancelled) return;

      if (check.status === 'SUBSCRIBED' || check.status === 'UNCONFIGURED') {
        setGateVerified(true);
        setGateMessage(null);
      } else if (check.status === 'NOT_SUBSCRIBED') {
        setGateVerified(false);
        setGateMessage(check.message);
        if (user.emailVerified) {
          updateDoc(doc(db, 'users', user.uid), {
            youtubeVerified: false,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } else if (check.status === 'TOKEN_EXPIRED') {
        clearYoutubeAccessToken();
        setGateVerified(false);
      } else if (check.status === 'API_LIMITED') {
        setGateVerified(false);
        setGateMessage(check.message);
      }
    };

    void runSubscriptionRevisitCheck();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt > 15_000) {
        void runSubscriptionRevisitCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [authReady, user, settings.youtubeGateEnabled, settings.youtubeChannelId, isBootstrappedAdmin]);

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
          merged.heroVideoUrl = resolveAsset(data.heroVideoUrl || '');
          const validYtId = normalizeYoutubeChannelId(data.youtubeChannelId || '');
          merged.youtubeChannelId = validYtId || DEFAULT_SETTINGS.youtubeChannelId;
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
          if (
            !data.telegramUrl ||
            data.telegramUrl === 'https://t.me/TradeWithAmith'
          ) {
            merged.telegramUrl = DEFAULT_SETTINGS.telegramUrl;
          }
          if (
            !data.contactEmail ||
            data.contactEmail === 'emoneywithamith@gmail.com' ||
            data.contactEmail === 'support@tradewithamith.com'
          ) {
            merged.contactEmail = DEFAULT_SETTINGS.contactEmail;
          }
          if (
            data.subscriberCountFallback === '24,800' ||
            data.subscriberCountFallback === '336' ||
            !sanitizeSubscriberCount(data.subscriberCountFallback)
          ) {
            merged.subscriberCountFallback = '';
          } else {
            merged.subscriberCountFallback = sanitizeSubscriberCount(data.subscriberCountFallback);
          }
          if (
            data.thirdMethodTitle === 'USDT TRC20 / Bank Transfer' &&
            data.thirdMethodPrice === '$39 / Quarter'
          ) {
            merged.thirdMethodEnabled = false;
            merged.thirdMethodTitle = '';
            merged.thirdMethodDescription = '';
            merged.thirdMethodPrice = '';
            merged.thirdMethodPayment = '';
            merged.thirdMethodInstructions = '';
            merged.thirdMethodFields = '';
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
          const raw = snap.data() as VisitorStatistics;
          const { dayKey, weekKey, monthKey } = getCalendarKeys();
          setVisitorStats({
            dayKey,
            weekKey,
            monthKey,
            todayCount: raw.dayKey === dayKey ? Number(raw.todayCount) || 0 : 0,
            weekCount: raw.weekKey === weekKey ? Number(raw.weekCount) || 0 : 0,
            monthCount: raw.monthKey === monthKey ? Number(raw.monthCount) || 0 : 0,
            totalCount: Number(raw.totalCount) || 0,
            lastSessionId: raw.lastSessionId || '',
          });
        }
      },
      (err) => console.warn('Stats snapshot warning:', err)
    );

    return () => {
      unsubSettings();
      unsubStats();
    };
  }, []);

  // 3. Sync Live YouTube Subscriber Count on load and every 60 seconds
  useEffect(() => {
    let active = true;
    const syncLiveCount = () => {
      fetchYoutubeSubscriberCount(
        settings.youtubeChannelId,
        settings.subscriberCountFallback,
        settings.youtubeChannelUrl
      ).then((count) => {
        if (active) setSubscriberCount(sanitizeSubscriberCount(count));
      });
    };

    syncLiveCount();
    const timer = window.setInterval(syncLiveCount, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    settings.youtubeChannelId,
    settings.subscriberCountFallback,
    settings.youtubeChannelUrl,
    user,
  ]);

  // 4. User Profile, VIP Grant, Admin Doc, Book Access & Personal Notifications
  useEffect(() => {
    if (!user) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    );

    const myVipReqQ = query(collection(db, 'vipRequests'), where('userId', '==', user.uid));
    const unsubMyVipReqs = onSnapshot(
      myVipReqQ,
      (snap) => {
        let pending = false;
        snap.forEach((d) => {
          const r = d.data() as { status?: string };
          if (r.status === 'PENDING') pending = true;
        });
        setHasPendingVipRequestDb(pending);
      },
      () => setHasPendingVipRequestDb(false)
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
            vipCategory: (raw.vipCategory as VipCategory | undefined) || undefined,
            vipExpiryMs: tsToMs(raw.vipExpiry, 0),
          });
        } else {
          setVipGrant(null);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `vipGrants/${user.uid}`)
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
      unsubMyVipReqs();
      unsubVip();
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
          // Exclude any legacy starter/demo signal IDs so only real admin-published signals appear
          if (LEGACY_DEMO_SIGNAL_IDS.has(d.id)) return;
          const raw = d.data();
          list.push({
            id: d.id,
            date: raw.date,
            currency: 'XAUUSD',
            direction: raw.direction,
            orderType: raw.orderType,
            result: raw.result,
            pips: raw.result === 'ACTIVE' ? 0 : Number(raw.pips) || 0,
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
          if (LEGACY_DEMO_VIDEO_IDS.has(d.id)) return;
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
          if (LEGACY_DEMO_FREE_BOOK_IDS.has(d.id)) return;
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
          if (LEGACY_DEMO_PAID_BOOK_IDS.has(d.id)) return;
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

    const marketVideosQ = query(
      collection(db, 'marketAnalysisVideos'),
      where('status', '==', 'ACTIVE')
    );
    const unsubMarketVideos = onSnapshot(
      marketVideosQ,
      (snap) => {
        const list: MarketAnalysisVideo[] = [];
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
        setDbMarketAnalysisVideos(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (err) => console.warn('Market analysis videos listener:', err)
    );

    const marketReactionsQ = query(
      collection(db, 'marketAnalysisReactions'),
      where('status', '==', 'ACTIVE')
    );
    const unsubMarketReactions = onSnapshot(
      marketReactionsQ,
      (snap) => {
        const list: MarketAnalysisReaction[] = [];
        snap.forEach((d) => {
          const raw = d.data();
          list.push({
            id: d.id,
            videoId: raw.videoId,
            userId: raw.userId,
            reaction: raw.reaction,
            status: 'ACTIVE',
            createdAtMs: tsToMs(raw.createdAt),
          });
        });
        setDbMarketAnalysisReactions(list);
      },
      (err) => console.warn('Market analysis reactions listener:', err)
    );

    return () => {
      unsubSignals();
      unsubVideos();
      unsubFree();
      unsubPaid();
      unsubNotifs();
      unsubMarketVideos();
      unsubMarketReactions();
    };
  }, []);

  // 6. Fetch Protected Signal Execution Prices ONLY when user is Active VIP or Admin
  // Never fall back to fake starter signals — only real admin-published signals are displayed.
  const activeSignalsSource = useMemo(() => dbSignalsPublic ?? [], [dbSignalsPublic]);

  useEffect(() => {
    if (!isVipActive || !user || activeSignalsSource.length === 0) {
      setSignalsPrivateMap({});
      return;
    }

    let cancelled = false;
    Promise.all(
      activeSignalsSource.map(async (sig) => {
        try {
          const snap = await getDoc(doc(db, 'vipSignalsPrivate', sig.id));
          if (snap.exists()) {
            const d = snap.data();
            return [
              sig.id,
              {
                id: sig.id,
                currency: 'XAUUSD' as const,
                direction: d.direction,
                orderType: d.orderType,
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
  }, [isVipActive, user, activeSignalsSource]);

  const signals: MergedSignal[] = useMemo(() => {
    return activeSignalsSource.map((pub) => {
      if (!isVipActive) {
        return {
          ...pub,
          direction: 'LOCKED',
          orderType: 'LOCKED',
          entry: undefined,
          tp: undefined,
          extraTp: undefined,
          sl: undefined,
          note: undefined,
        };
      }
      const priv = signalsPrivateMap[pub.id];
      if (!priv) return pub;
      return {
        ...pub,
        ...priv,
        direction: priv.direction || pub.direction,
        orderType: priv.orderType || pub.orderType,
      };
    });
  }, [activeSignalsSource, isVipActive, signalsPrivateMap]);

  // Automatic Live Win Rate & Performance Calculation from real trading signals
  const tradingStats: TradingPerformanceStats = useMemo(() => {
    // Recompute using private prices if admin/VIP has them loaded, else public realized pips
    const normalizedSignals: VipSignalPublic[] = signals.map((sig) => ({
      id: sig.id,
      date: sig.date,
      currency: sig.currency,
      direction: sig.direction,
      orderType: sig.orderType,
      result: sig.result,
      pips: sig.result === 'ACTIVE' ? 0 : Number(sig.pips) || 0,
      createdAtMs: sig.createdAtMs,
    }));
    return computeTradingPerformanceStats(normalizedSignals);
  }, [signals]);

  const videos = useMemo(() => dbVideos ?? [], [dbVideos]);
  const marketAnalysisVideos = dbMarketAnalysisVideos;

  const marketAnalysisReactionsSummary = useMemo(() => {
    const summary: Record<string, MarketAnalysisReactionSummary> = {};
    const currentUid = user?.uid || null;

    for (const r of dbMarketAnalysisReactions) {
      if (!summary[r.videoId]) {
        summary[r.videoId] = { likes: 0, dislikes: 0, userReaction: null };
      }
      if (r.reaction === 'LIKE') {
        summary[r.videoId].likes += 1;
      } else if (r.reaction === 'DISLIKE') {
        summary[r.videoId].dislikes += 1;
      }
      if (currentUid && r.userId === currentUid) {
        summary[r.videoId].userReaction = r.reaction;
      }
    }

    return summary;
  }, [dbMarketAnalysisReactions, user]);

  const freeBooks = useMemo(() => dbFreeBooks ?? [], [dbFreeBooks]);
  const paidBooks = useMemo(() => dbPaidBooks ?? [], [dbPaidBooks]);

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
        setGateVerified(false);
        setGateMessage(check.message);
        if (check.status === 'NOT_SUBSCRIBED' && signedInUser.emailVerified) {
          updateDoc(doc(db, 'users', signedInUser.uid), {
            youtubeVerified: false,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      return check;
    } catch (err) {
      const parsed = parseFirebaseAuthError(err);
      const errText = parsed.isUnauthorizedDomain
        ? `${parsed.message} Add "${parsed.hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`
        : parsed.isUserCancelled
        ? 'Google Sign-In was cancelled. Please sign in with Google to verify your YouTube subscription.'
        : parsed.message;
      setGateVerified(false);
      setGateMessage(errText);
      return {
        status: 'API_LIMITED',
        message: errText,
      };
    } finally {
      setGateBusy(false);
    }
  }, [settings.youtubeChannelId]);

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

      const bookPubSnap = await getDoc(doc(db, 'paidBooksPublic', input.book.id));
      if (!bookPubSnap.exists()) {
        throw new Error('This book is no longer available in the catalog.');
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
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `paidBooksProtected/${bookId}`);
    }
  }, []);

  const toggleMarketAnalysisReaction = useCallback(
    async (videoId: string, reaction: VideoReactionType): Promise<void> => {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const res = await signInWithGoogle();
        activeUser = res.user;
      }
      if (!activeUser || !activeUser.emailVerified) {
        throw new Error('Sign in with Google to like or dislike Market Analysis videos.');
      }

      const reactionId = `${videoId}_${activeUser.uid}`;
      const path = `marketAnalysisReactions/${reactionId}`;
      const reactionRef = doc(db, 'marketAnalysisReactions', reactionId);

      try {
        const snap = await getDoc(reactionRef);
        if (snap.exists()) {
          const existing = snap.data() as { reaction?: VideoReactionType };
          if (existing.reaction === reaction) {
            await deleteDoc(reactionRef);
          } else {
            await updateDoc(reactionRef, {
              reaction,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          await setDoc(reactionRef, {
            id: reactionId,
            videoId,
            userId: activeUser.uid,
            reaction,
            status: 'ACTIVE',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    []
  );

  const value: AcademyContextValue = {
    user,
    authReady,
    profile,
    vipGrant,
    isAdmin,
    isVipActive,
    hasPendingVipRequest,
    settings,
    subscriberCount,
    signals,
    tradingStats,
    videos,
    marketAnalysisVideos,
    marketAnalysisReactionsSummary,
    freeBooks,
    paidBooks,
    bookAccessMap,
    notifications,
    visitorStats,
    gateVerified,
    gateMessage,
    gateBusy,
    login,
    logout,
    verifySubscriberGate,
    submitVipRequest,
    submitBookPurchase,
    incrementFreeBookMetric,
    getProtectedPaidBookUrl,
    toggleMarketAnalysisReaction,
  };

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
};

export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext);
  if (!ctx) throw new Error('useAcademy must be used inside AcademyProvider');
  return ctx;
}
