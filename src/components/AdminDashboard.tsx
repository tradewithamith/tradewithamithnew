import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  Copy,
  Crown,
  Edit3,
  ExternalLink,
  FileText,
  FolderSync,
  LayoutDashboard,
  LineChart,
  Loader2,
  LogOut,
  PlaySquare,
  Plus,
  Settings,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useAcademy } from '../context/AcademyContext';
import {
  calculateSignalPips,
  clampStr,
  db,
  handleFirestoreError,
  isTopLevelBrowserWindow,
  OperationType,
  parseFirebaseAuthError,
  sanitizeId,
  signInWithGoogle,
  signInWithGoogleRedirect,
  storage,
  type ParsedAuthError,
} from '../lib/firebase';
import {
  extractYoutubeThumbnail,
  fetchGoogleSheetRows,
  normalizeTelegramUrl,
  normalizeYoutubeChannelId,
} from '../lib/integrations';
import {
  extractPdfCoverFromFile,
  extractPdfCoverFromUrl,
} from '../lib/pdfTools';
import {
  ASSETS,
  LEGACY_DEMO_SIGNAL_IDS,
  STARTER_FREE_BOOKS,
  STARTER_PAID_BOOKS,
  STARTER_VIDEOS,
  type AcademySettings,
  type AcademyVideo,
  type AppNotification,
  type BookPurchaseItem,
  type FreeBook,
  type MarketAnalysisReaction,
  type MarketAnalysisVideo,
  type PaidBookPublic,
  type SignalDirection,
  type SignalOrderType,
  type SignalResult,
  type UserProfile,
  type VipCategory,
  type VipGrant,
  type VipRequestItem,
  type VipSignalPrivate,
  type VipSignalPublic,
} from '../types/academy';
import { GoogleSignInButton, ResilientImage } from './ResilientImage';

type AdminTab =
  | 'overview'
  | 'signals'
  | 'vip-requests'
  | 'book-purchases'
  | 'market-analysis'
  | 'videos'
  | 'free-pdfs'
  | 'paid-pdfs'
  | 'users'
  | 'notifications'
  | 'statistics'
  | 'settings';

function tsMs(v: unknown): number {
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as Timestamp).toMillis === 'function') {
    return (v as Timestamp).toMillis();
  }
  return Date.now();
}

export const AdminDashboard: React.FC<{ onExitAdmin?: () => void }> = ({ onExitAdmin }) => {
  const { user, authReady, isAdmin, settings, visitorStats, logout } = useAcademy();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<ParsedAuthError | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Admin Live Collections
  const [pubSignals, setPubSignals] = useState<VipSignalPublic[]>([]);
  const [privSignals, setPrivSignals] = useState<Record<string, VipSignalPrivate>>({});
  const [vipRequests, setVipRequests] = useState<VipRequestItem[]>([]);
  const [bookPurchases, setBookPurchases] = useState<BookPurchaseItem[]>([]);
  const [allMarketVideos, setAllMarketVideos] = useState<MarketAnalysisVideo[]>([]);
  const [allMarketReactions, setAllMarketReactions] = useState<MarketAnalysisReaction[]>([]);
  const [allVideos, setAllVideos] = useState<AcademyVideo[]>([]);
  const [allFreeBooks, setAllFreeBooks] = useState<FreeBook[]>([]);
  const [allPaidBooks, setAllPaidBooks] = useState<PaidBookPublic[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allGrants, setAllGrants] = useState<Record<string, VipGrant>>({});
  const [allNotifs, setAllNotifs] = useState<AppNotification[]>([]);

  // VIP Category Filters (Exness VIP Users vs Binance VIP Users)
  const [vipRequestCategoryFilter, setVipRequestCategoryFilter] = useState<
    'EXNESS' | 'BINANCE' | 'CUSTOM' | 'ALL'
  >('EXNESS');
  const [vipUsersCategoryTab, setVipUsersCategoryTab] = useState<'EXNESS' | 'BINANCE' | 'ALL'>(
    'EXNESS'
  );
  const [memberSearch, setMemberSearch] = useState('');

  // Signal Form State
  const [editingSignalId, setEditingSignalId] = useState<string | null>(null);
  const [sigDate, setSigDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sigDirection, setSigDirection] = useState<SignalDirection>('BUY');
  const [sigOrderType, setSigOrderType] = useState<SignalOrderType>('LIMIT');
  const [sigEntry, setSigEntry] = useState('4140');
  const [sigTp, setSigTp] = useState('4150');
  const [sigExtraTp, setSigExtraTp] = useState('4160');
  const [sigSl, setSigSl] = useState('4128');
  const [sigResult, setSigResult] = useState<SignalResult>('ACTIVE');
  const [sigClosedPips, setSigClosedPips] = useState('0');
  const [sigNote, setSigNote] = useState('Wait for M15 candlestick confirmation before entry.');
  const [closingSignalModal, setClosingSignalModal] = useState<{
    signal: VipSignalPublic;
    pipsInput: string;
  } | null>(null);

  // Market Analysis Video Form State
  const [editingMaId, setEditingMaId] = useState<string | null>(null);
  const [maTitle, setMaTitle] = useState('');
  const [maUrl, setMaUrl] = useState('');
  const [maThumb, setMaThumb] = useState('');
  const [maDate, setMaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [maStatus, setMaStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [maDesc, setMaDesc] = useState('');

  // Video Form State
  const [editingVidId, setEditingVidId] = useState<string | null>(null);
  const [vidTitle, setVidTitle] = useState('');
  const [vidUrl, setVidUrl] = useState('');
  const [vidThumb, setVidThumb] = useState('');
  const [vidDate, setVidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vidStatus, setVidStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [vidDesc, setVidDesc] = useState('');

  // Free Book Form State (Cover automatically extracted from PDF!)
  const [editingFbId, setEditingFbId] = useState<string | null>(null);
  const [fbName, setFbName] = useState('');
  const [fbDesc, setFbDesc] = useState('');
  const [fbCover, setFbCover] = useState('');
  const [fbPdf, setFbPdf] = useState('');
  const [fbExtractingCover, setFbExtractingCover] = useState(false);

  // Paid Book Form State (Cover automatically extracted from PDF!)
  const [editingPbId, setEditingPbId] = useState<string | null>(null);
  const [pbName, setPbName] = useState('');
  const [pbDesc, setPbDesc] = useState('');
  const [pbPrice, setPbPrice] = useState('29');
  const [pbCover, setPbCover] = useState('');
  const [pbPdf, setPbPdf] = useState('');
  const [pbExtractingCover, setPbExtractingCover] = useState(false);

  // Notification Form State
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  const [notifBtnText, setNotifBtnText] = useState('');
  const [notifBtnUrl, setNotifBtnUrl] = useState('');

  // Settings Draft State
  const [draftSettings, setDraftSettings] = useState<AcademySettings>(settings);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [syncingSheets, setSyncingSheets] = useState(false);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4200);
  };

  // Attach Admin Firestore Listeners ONLY when verified Admin
  useEffect(() => {
    if (!user || !isAdmin) return;

    const u1 = onSnapshot(
      collection(db, 'vipSignalsPublic'),
      (snap) => {
        const list: VipSignalPublic[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            date: r.date,
            currency: 'XAUUSD',
            direction: r.direction,
            orderType: r.orderType,
            result: r.result,
            pips: r.pips,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setPubSignals(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'vipSignalsPublic')
    );

    const u2 = onSnapshot(
      collection(db, 'vipSignalsPrivate'),
      (snap) => {
        const map: Record<string, VipSignalPrivate> = {};
        snap.forEach((d) => {
          const r = d.data();
          map[d.id] = {
            id: d.id,
            currency: 'XAUUSD',
            entry: r.entry,
            tp: r.tp,
            extraTp: r.extraTp,
            sl: r.sl,
            note: r.note,
          };
        });
        setPrivSignals(map);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'vipSignalsPrivate')
    );

    const u3 = onSnapshot(
      collection(db, 'vipRequests'),
      (snap) => {
        const list: VipRequestItem[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            userId: r.userId,
            name: r.name,
            email: r.email,
            telegram: r.telegram,
            method: r.method,
            exnessId: r.exnessId,
            transactionId: r.transactionId,
            customDetails: r.customDetails,
            status: r.status,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setVipRequests(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'vipRequests')
    );

    const u4 = onSnapshot(
      collection(db, 'bookPurchases'),
      (snap) => {
        const list: BookPurchaseItem[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            userId: r.userId,
            userEmail: r.userEmail,
            bookId: r.bookId,
            bookName: r.bookName,
            price: r.price,
            name: r.name,
            telegram: r.telegram,
            transactionId: r.transactionId,
            status: r.status,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setBookPurchases(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'bookPurchases')
    );

    const u5 = onSnapshot(
      collection(db, 'videos'),
      (snap) => {
        const list: AcademyVideo[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            title: r.title,
            youtubeUrl: r.youtubeUrl,
            thumbnail: r.thumbnail,
            description: r.description,
            date: r.date,
            status: r.status,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setAllVideos(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'videos')
    );

    const u6 = onSnapshot(
      collection(db, 'freeBooks'),
      (snap) => {
        const list: FreeBook[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            name: r.name,
            description: r.description,
            coverUrl: r.coverUrl,
            pdfUrl: r.pdfUrl,
            views: r.views ?? 0,
            downloads: r.downloads ?? 0,
            status: r.status,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setAllFreeBooks(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'freeBooks')
    );

    const u7 = onSnapshot(
      collection(db, 'paidBooksPublic'),
      (snap) => {
        const list: PaidBookPublic[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            name: r.name,
            description: r.description,
            coverUrl: r.coverUrl,
            price: r.price ?? 0,
            status: r.status,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setAllPaidBooks(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'paidBooksPublic')
    );

    const u8 = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => list.push(d.data() as UserProfile));
        setAllUsers(list);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'users')
    );

    const u9 = onSnapshot(
      collection(db, 'vipGrants'),
      (snap) => {
        const map: Record<string, VipGrant> = {};
        snap.forEach((d) => {
          const r = d.data();
          map[d.id] = {
            userId: r.userId,
            vipStatus: r.vipStatus,
            vipType: r.vipType,
            approvalStatus: r.approvalStatus,
            vipCategory: (r.vipCategory as VipCategory | undefined) || undefined,
            vipExpiryMs: tsMs(r.vipExpiry),
          };
        });
        setAllGrants(map);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'vipGrants')
    );

    const u10 = onSnapshot(
      collection(db, 'notifications'),
      (snap) => {
        const list: AppNotification[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            targetUid: r.targetUid,
            title: r.title,
            message: r.message,
            icon: r.icon,
            buttonText: r.buttonText,
            buttonUrl: r.buttonUrl,
            active: r.active,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setAllNotifs(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'notifications')
    );

    const u11 = onSnapshot(
      collection(db, 'marketAnalysisVideos'),
      (snap) => {
        const list: MarketAnalysisVideo[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            title: r.title,
            youtubeUrl: r.youtubeUrl,
            thumbnail: r.thumbnail,
            description: r.description,
            date: r.date,
            status: r.status,
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setAllMarketVideos(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'marketAnalysisVideos')
    );

    const u12 = onSnapshot(
      collection(db, 'marketAnalysisReactions'),
      (snap) => {
        const list: MarketAnalysisReaction[] = [];
        snap.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            videoId: r.videoId,
            userId: r.userId,
            reaction: r.reaction,
            status: 'ACTIVE',
            createdAtMs: tsMs(r.createdAt),
          });
        });
        setAllMarketReactions(list);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'marketAnalysisReactions')
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
      u10();
      u11();
      u12();
    };
  }, [user, isAdmin]);

  // Automatically extract Page-1 cover whenever Admin pastes/changes Free PDF URL
  useEffect(() => {
    const trimmed = fbPdf.trim();
    if (!trimmed || (fbCover && fbCover.startsWith('data:image/'))) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setFbExtractingCover(true);
      extractPdfCoverFromUrl(trimmed)
        .then((rendered) => {
          if (active && rendered) {
            setFbCover(rendered);
          }
        })
        .finally(() => {
          if (active) setFbExtractingCover(false);
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fbPdf, fbCover]);

  // Automatically extract Page-1 cover whenever Admin pastes/changes Paid PDF URL
  useEffect(() => {
    const trimmed = pbPdf.trim();
    if (!trimmed || (pbCover && pbCover.startsWith('data:image/'))) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setPbExtractingCover(true);
      extractPdfCoverFromUrl(trimmed)
        .then((rendered) => {
          if (active && rendered) {
            setPbCover(rendered);
          }
        })
        .finally(() => {
          if (active) setPbExtractingCover(false);
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pbPdf, pbCover]);

  // --- Admin Helper: Upload File to Firebase Storage ---
  const handleStorageUpload = async (
    file: File,
    folder: string,
    onUrl: (url: string) => void,
    onExtractedCover?: (coverDataUrl: string) => void
  ) => {
    setUploadingField(folder);
    try {
      if (file.type === 'application/pdf' && onExtractedCover) {
        extractPdfCoverFromFile(file).then((coverDataUrl) => {
          if (coverDataUrl) {
            onExtractedCover(coverDataUrl);
          }
        });
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `academy/${folder}/${Date.now()}_${safeName}`);
      const metadata =
        file.type === 'application/pdf'
          ? {
              contentType: 'application/pdf',
              contentDisposition: `attachment; filename="${safeName}"`,
            }
          : undefined;
      await uploadBytes(storageRef, file, metadata);
      const downloadUrl = await getDownloadURL(storageRef);
      onUrl(downloadUrl);
      showToast('ok', `Uploaded ${file.name} to Firebase Storage.`);
    } catch (err) {
      showToast(
        'err',
        err instanceof Error
          ? `Storage upload error: ${err.message}`
          : 'Could not upload file to Firebase Storage.'
      );
    } finally {
      setUploadingField(null);
    }
  };

  // --- Seed Starter Catalog Into Live Firestore (Videos & PDFs ONLY — NEVER Fake Signals!) ---
  const handleInitializeStarterData = async () => {
    try {
      const batch = writeBatch(db);
      const settingsSnap = await getDoc(doc(db, 'settings', 'config'));
      if (!settingsSnap.exists()) {
        batch.set(doc(db, 'settings', 'config'), {
          ...settings,
          updatedAt: serverTimestamp(),
        });
      }

      for (const v of STARTER_VIDEOS) {
        batch.set(doc(db, 'videos', v.id), {
          id: v.id,
          title: v.title,
          youtubeUrl: v.youtubeUrl,
          thumbnail: v.thumbnail,
          description: v.description,
          date: v.date,
          status: 'ACTIVE',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      for (const fb of STARTER_FREE_BOOKS) {
        const autoCover = (await extractPdfCoverFromUrl(fb.pdfUrl)) || '';
        batch.set(doc(db, 'freeBooks', fb.id), {
          id: fb.id,
          name: fb.name,
          description: fb.description,
          coverUrl: clampStr(autoCover || fb.coverUrl, 175000),
          pdfUrl: fb.pdfUrl,
          views: fb.views,
          downloads: fb.downloads,
          status: 'ACTIVE',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      for (const pb of STARTER_PAID_BOOKS) {
        const sampleProtectedUrl =
          pb.id === 'paid_msnr_playbook'
            ? '/api/sample-pdf/msnr-masterbook-pro'
            : '/api/sample-pdf/xauusd-liquidity-atlas';
        const autoCover = (await extractPdfCoverFromUrl(sampleProtectedUrl)) || pb.coverUrl;
        batch.set(doc(db, 'paidBooksPublic', pb.id), {
          id: pb.id,
          name: pb.name,
          description: pb.description,
          coverUrl: clampStr(autoCover, 175000),
          price: pb.price,
          status: 'ACTIVE',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'paidBooksProtected', pb.id), {
          id: pb.id,
          pdfUrl: sampleProtectedUrl,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      showToast('ok', 'Starter videos and PDFs synced (zero fake signals added).');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Initialization failed.');
    }
  };

  // --- Signals CRUD ---
  const handleSaveSignal = async (e: React.FormEvent) => {
    e.preventDefault();
    const entryNum = Number(sigEntry);
    const tpNum = Number(sigTp);
    const extraTpNum = Number(sigExtraTp || sigTp);
    const slNum = Number(sigSl);
    const closedPipsNum = Number(sigClosedPips || '0');

    if (!Number.isFinite(entryNum) || !Number.isFinite(tpNum) || !Number.isFinite(slNum)) {
      showToast('err', 'Entry, TP, and SL must be valid numbers.');
      return;
    }

    const pips = calculateSignalPips({
      direction: sigDirection,
      entry: entryNum,
      tp: tpNum,
      sl: slNum,
      result: sigResult,
      pipMultiplier: settings.pipMultiplier,
      customClosedPips: sigResult === 'CLOSED' ? closedPipsNum : undefined,
    });

    try {
      const id = editingSignalId || sanitizeId(`sig_xau_${Date.now()}`);
      const batch = writeBatch(db);

      if (editingSignalId) {
        batch.update(doc(db, 'vipSignalsPublic', id), {
          date: clampStr(sigDate, 40),
          direction: sigDirection,
          orderType: sigOrderType,
          result: sigResult,
          pips,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'vipSignalsPrivate', id), {
          entry: entryNum,
          tp: tpNum,
          extraTp: extraTpNum,
          sl: slNum,
          note: clampStr(sigNote, 1000),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, 'vipSignalsPublic', id), {
          id,
          date: clampStr(sigDate, 40),
          currency: 'XAUUSD',
          direction: sigDirection,
          orderType: sigOrderType,
          result: sigResult,
          pips,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'vipSignalsPrivate', id), {
          id,
          currency: 'XAUUSD',
          entry: entryNum,
          tp: tpNum,
          extraTp: extraTpNum,
          sl: slNum,
          note: clampStr(sigNote, 1000),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setEditingSignalId(null);
      setSigResult('ACTIVE');
      setSigClosedPips('0');
      showToast('ok', editingSignalId ? 'Signal updated.' : 'New XAUUSD VIP signal published.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vipSignalsPublic');
    }
  };

  const handleMarkSignalOutcome = async (
    sig: VipSignalPublic,
    outcome: SignalResult,
    explicitClosedPips?: number
  ) => {
    if (outcome === 'CLOSED' && explicitClosedPips === undefined) {
      setClosingSignalModal({
        signal: sig,
        pipsInput: sig.result === 'CLOSED' ? String(sig.pips || 0) : '0',
      });
      return;
    }

    const priv = privSignals[sig.id];
    const pips =
      outcome === 'CLOSED'
        ? Math.round(Number(explicitClosedPips) || 0)
        : priv
        ? calculateSignalPips({
            direction: sig.direction,
            entry: priv.entry,
            tp: priv.tp,
            sl: priv.sl,
            result: outcome,
            pipMultiplier: settings.pipMultiplier,
          })
        : outcome === 'ACTIVE'
        ? 0
        : sig.pips;

    try {
      await updateDoc(doc(db, 'vipSignalsPublic', sig.id), {
        result: outcome,
        pips,
        updatedAt: serverTimestamp(),
      });
      showToast(
        'ok',
        `Marked signal as ${outcome} (${pips > 0 ? '+' : ''}${pips} pips).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `vipSignalsPublic/${sig.id}`);
    }
  };

  const handleRemoveLegacyDemoSignals = async () => {
    const legacy = pubSignals.filter((s) => LEGACY_DEMO_SIGNAL_IDS.has(s.id));
    if (legacy.length === 0) return;
    try {
      const b = writeBatch(db);
      for (const s of legacy) {
        b.delete(doc(db, 'vipSignalsPublic', s.id));
        b.delete(doc(db, 'vipSignalsPrivate', s.id));
      }
      await b.commit();
      showToast('ok', `Removed ${legacy.length} legacy demo signals from Firestore.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'vipSignalsPublic');
    }
  };

  // --- VIP Request Approval / Rejection (Preserving Separate Exness vs Binance VIP Category) ---
  const handleVipDecision = async (req: VipRequestItem, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'vipRequests', req.id), {
        status: decision,
        updatedAt: serverTimestamp(),
      });

      if (decision === 'APPROVED') {
        const isLifetime = req.method === 'EXNESS';
        const vipType = isLifetime ? 'LIFETIME' : req.method === 'BINANCE' ? 'MONTHLY' : 'CUSTOM';
        const vipCategory: VipCategory = req.method;
        const expiryDate = isLifetime
          ? new Date('2099-12-31T23:59:59Z')
          : new Date(Date.now() + 30 * 86_400_000);

        const grantRef = doc(db, 'vipGrants', req.userId);
        const existingGrant = await getDoc(grantRef);
        const grantPayload = {
          userId: req.userId,
          vipStatus: 'ACTIVE',
          vipType,
          approvalStatus: 'APPROVED',
          vipCategory,
          vipExpiry: Timestamp.fromDate(expiryDate),
          updatedAt: serverTimestamp(),
        };
        if (existingGrant.exists()) {
          batch.update(grantRef, {
            vipStatus: 'ACTIVE',
            vipType,
            approvalStatus: 'APPROVED',
            vipCategory,
            vipExpiry: Timestamp.fromDate(expiryDate),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(grantRef, grantPayload);
        }
      }

      // Send targeted Apple-style notification to user
      const notifId = sanitizeId(`notif_vip_${Date.now()}`);
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        targetUid: req.userId,
        title: decision === 'APPROVED' ? 'VIP Access Approved' : 'VIP Request Update',
        message:
          decision === 'APPROVED'
            ? req.method === 'EXNESS'
              ? 'Your Exness Lifetime VIP access is now active. Open VIP Signals to view full XAUUSD setups.'
              : 'Your Binance 30-day Monthly VIP access is now active. Open VIP Signals to view full XAUUSD setups.'
            : 'Your VIP verification request could not be confirmed. Contact our Telegram desk for assistance.',
        icon: 'crown',
        buttonText: decision === 'APPROVED' ? 'Open VIP Signals' : 'Contact Support',
        buttonUrl: decision === 'APPROVED' ? './index.html#signals' : './contact.html',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      showToast('ok', `${req.method} VIP request ${decision.toLowerCase()} and member notified.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `vipRequests/${req.id}`);
    }
  };

  // --- Book Purchase Approval / Rejection / Revocation ---
  const handleBookPurchaseDecision = async (
    pur: BookPurchaseItem,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookPurchases', pur.id), {
        status: decision,
        updatedAt: serverTimestamp(),
      });

      const accessId = `${pur.userId}_${pur.bookId}`;
      const accessRef = doc(db, 'bookAccess', accessId);
      const accessSnap = await getDoc(accessRef);

      if (decision === 'APPROVED') {
        if (accessSnap.exists()) {
          batch.update(accessRef, { status: 'APPROVED', updatedAt: serverTimestamp() });
        } else {
          batch.set(accessRef, {
            id: accessId,
            userId: pur.userId,
            bookId: pur.bookId,
            status: 'APPROVED',
            updatedAt: serverTimestamp(),
          });
        }
      } else if (accessSnap.exists()) {
        batch.update(accessRef, { status: 'REVOKED', updatedAt: serverTimestamp() });
      }

      const notifId = sanitizeId(`notif_bk_${Date.now()}`);
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        targetUid: pur.userId,
        title: decision === 'APPROVED' ? 'Digital Book Unlocked' : 'Book Payment Update',
        message:
          decision === 'APPROVED'
            ? `"${pur.bookName}" is now unlocked for download in Paid PDFs.`
            : `Your payment submission for "${pur.bookName}" could not be verified.`,
        icon: 'book',
        buttonText: 'Open Bookstore',
        buttonUrl: './index.html#paid-pdfs',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      showToast('ok', `Book purchase marked ${decision.toLowerCase()}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookPurchases/${pur.id}`);
    }
  };

  const resolveUserVipCategory = (uid: string): VipCategory => {
    const grant = allGrants[uid];
    if (grant?.vipCategory && grant.vipCategory !== 'NONE') {
      return grant.vipCategory;
    }
    const matchingReq = vipRequests.find((r) => r.userId === uid && r.status === 'APPROVED');
    if (matchingReq) return matchingReq.method;
    const latestReq = vipRequests.find((r) => r.userId === uid);
    if (latestReq && grant?.vipStatus === 'ACTIVE') return latestReq.method;
    if (grant?.vipType === 'LIFETIME') return 'EXNESS';
    if (grant?.vipType === 'MONTHLY') return 'BINANCE';
    if (grant?.vipType === 'CUSTOM') return 'CUSTOM';
    return 'NONE';
  };

  // --- User Direct VIP Management (Exness VIP vs Binance VIP) ---
  const handleManualUserVip = async (
    targetUid: string,
    mode: 'EXNESS_LIFETIME' | 'BINANCE_30D' | 'REVOKE'
  ) => {
    try {
      const grantRef = doc(db, 'vipGrants', targetUid);
      const snap = await getDoc(grantRef);
      const existingCat = resolveUserVipCategory(targetUid);

      const expiry =
        mode === 'EXNESS_LIFETIME'
          ? new Date('2099-12-31T23:59:59Z')
          : mode === 'BINANCE_30D'
          ? new Date(Math.max(Date.now(), allGrants[targetUid]?.vipExpiryMs || 0) + 30 * 86_400_000)
          : new Date(Date.now() - 60_000);

      const vipCategory: VipCategory =
        mode === 'EXNESS_LIFETIME'
          ? 'EXNESS'
          : mode === 'BINANCE_30D'
          ? 'BINANCE'
          : existingCat;

      const nextData = {
        userId: targetUid,
        vipStatus: mode === 'REVOKE' ? ('REVOKED' as const) : ('ACTIVE' as const),
        vipType:
          mode === 'EXNESS_LIFETIME'
            ? ('LIFETIME' as const)
            : mode === 'BINANCE_30D'
            ? ('MONTHLY' as const)
            : ('NONE' as const),
        approvalStatus: mode === 'REVOKE' ? ('REJECTED' as const) : ('APPROVED' as const),
        vipCategory,
        vipExpiry: Timestamp.fromDate(expiry),
        updatedAt: serverTimestamp(),
      };

      if (snap.exists()) {
        await updateDoc(grantRef, {
          vipStatus: nextData.vipStatus,
          vipType: nextData.vipType,
          approvalStatus: nextData.approvalStatus,
          vipCategory: nextData.vipCategory,
          vipExpiry: nextData.vipExpiry,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(grantRef, nextData);
      }
      showToast(
        'ok',
        mode === 'EXNESS_LIFETIME'
          ? 'Granted Exness Lifetime VIP.'
          : mode === 'BINANCE_30D'
          ? 'Granted / Extended Binance 30-Day VIP.'
          : 'Revoked VIP access.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `vipGrants/${targetUid}`);
    }
  };

  // --- Google Sheets Synchronization ---
  const handleSyncSheets = async (kind: 'videos' | 'free-pdfs' | 'paid-pdfs') => {
    setSyncingSheets(true);
    try {
      const publishedCsvUrl =
        kind === 'videos'
          ? draftSettings.sheetsVideosUrl
          : kind === 'free-pdfs'
          ? draftSettings.sheetsFreePdfsUrl
          : draftSettings.sheetsPaidPdfsUrl;
      const tabName =
        kind === 'videos' ? 'Videos' : kind === 'free-pdfs' ? 'FreePDFs' : 'PaidPDFs';

      if (draftSettings.sheetsSpreadsheetId && !publishedCsvUrl) {
        await signInWithGoogle({ includeSheetsScope: true });
      }

      const rows = await fetchGoogleSheetRows({
        publishedCsvUrl,
        spreadsheetId: draftSettings.sheetsSpreadsheetId,
        tabName,
      });

      if (rows.length === 0) {
        showToast('err', 'Sheet returned 0 rows. Verify column headers and active rows.');
        return;
      }

      const batch = writeBatch(db);
      let count = 0;

      if (kind === 'videos') {
        for (const r of rows) {
          const id = sanitizeId(r.id || `vid_${count}_${Date.now()}`);
          const ytUrl = clampStr(r.youtube_url || r.youtubeurl, 500);
          if (!ytUrl) continue;
          const status = (r.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
          batch.set(doc(db, 'videos', id), {
            id,
            title: clampStr(r.title, 200, 'MSNR Lesson'),
            youtubeUrl: ytUrl,
            thumbnail: clampStr(
              r.thumbnail || extractYoutubeThumbnail(ytUrl, ASSETS.videoThumb),
              500
            ),
            description: clampStr(r.description, 1000),
            date: clampStr(r.date || new Date().toISOString().slice(0, 10), 40),
            status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
      } else if (kind === 'free-pdfs') {
        for (const r of rows) {
          const id = sanitizeId(r.id || `free_${count}_${Date.now()}`);
          const pdfUrl = clampStr(r.pdf_url || r.pdfurl, 500);
          if (!pdfUrl) continue;
          const status = (r.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
          const autoCover =
            r.cover_url || r.coverurl || (await extractPdfCoverFromUrl(pdfUrl)) || '';
          batch.set(doc(db, 'freeBooks', id), {
            id,
            name: clampStr(r.name, 200, 'MSNR Guide'),
            description: clampStr(r.description, 1000),
            coverUrl: clampStr(autoCover, 175000),
            pdfUrl,
            views: 0,
            downloads: 0,
            status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
      } else {
        for (const r of rows) {
          const id = sanitizeId(r.id || `paid_${count}_${Date.now()}`);
          const pdfUrl = clampStr(r.pdf_url || r.pdfurl, 500);
          if (!pdfUrl) continue;
          const status = (r.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
          const autoCover =
            r.cover_url || r.coverurl || (await extractPdfCoverFromUrl(pdfUrl)) || ASSETS.bookXauusd;
          batch.set(doc(db, 'paidBooksPublic', id), {
            id,
            name: clampStr(r.name, 200, 'Premium MSNR Book'),
            description: clampStr(r.description, 1000),
            coverUrl: clampStr(autoCover, 175000),
            price: Math.max(0, Number(r.price) || 29),
            status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'paidBooksProtected', id), {
            id,
            pdfUrl,
            updatedAt: serverTimestamp(),
          });
          count++;
        }
      }

      await batch.commit();
      showToast('ok', `Synchronized ${count} ${kind} items from Google Sheets.`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Google Sheets sync failed.');
    } finally {
      setSyncingSheets(false);
    }
  };

  // --- Save Global Settings ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const refDoc = doc(db, 'settings', 'config');
      const snap = await getDoc(refDoc);
      const payload = {
        siteName: clampStr(draftSettings.siteName, 120, 'Trade With Amith'),
        logoUrl: clampStr(draftSettings.logoUrl, 500, ASSETS.brandEmblem),
        heroSubtitle: clampStr(draftSettings.heroSubtitle, 300),
        msnrDescription: clampStr(draftSettings.msnrDescription, 1500),
        winRate: clampStr(draftSettings.winRate, 30, '89.4%'),
        subscriberCountFallback: clampStr(draftSettings.subscriberCountFallback, 40, '336'),
        youtubeChannelId: clampStr(normalizeYoutubeChannelId(draftSettings.youtubeChannelId), 80),
        youtubeChannelUrl: clampStr(draftSettings.youtubeChannelUrl, 300),
        youtubeGateEnabled: Boolean(draftSettings.youtubeGateEnabled),
        pipMultiplier: Math.max(0.1, Number(draftSettings.pipMultiplier) || 10),
        binancePayId: clampStr(draftSettings.binancePayId, 80, '973369286'),
        binanceQrUrl: clampStr(draftSettings.binanceQrUrl, 500, ASSETS.binanceQr),
        binanceLogoUrl: clampStr(draftSettings.binanceLogoUrl, 500),
        vipMonthlyPrice: Math.max(0, Number(draftSettings.vipMonthlyPrice) || 15),
        exnessReferralUrl: clampStr(draftSettings.exnessReferralUrl, 500),
        exnessMinDeposit: Math.max(0, Number(draftSettings.exnessMinDeposit) || 30),
        thirdMethodEnabled: Boolean(draftSettings.thirdMethodEnabled),
        thirdMethodTitle: clampStr(draftSettings.thirdMethodTitle, 120),
        thirdMethodDescription: clampStr(draftSettings.thirdMethodDescription, 600),
        thirdMethodPrice: clampStr(draftSettings.thirdMethodPrice, 60),
        thirdMethodPayment: clampStr(draftSettings.thirdMethodPayment, 120),
        thirdMethodInstructions: clampStr(draftSettings.thirdMethodInstructions, 800),
        thirdMethodFields: clampStr(draftSettings.thirdMethodFields, 300),
        telegramUrl: clampStr(normalizeTelegramUrl(draftSettings.telegramUrl), 300),
        contactEmail: clampStr(draftSettings.contactEmail, 200),
        instagramUrl: clampStr(draftSettings.instagramUrl, 300),
        sheetsVideosUrl: clampStr(draftSettings.sheetsVideosUrl, 500),
        sheetsFreePdfsUrl: clampStr(draftSettings.sheetsFreePdfsUrl, 500),
        sheetsPaidPdfsUrl: clampStr(draftSettings.sheetsPaidPdfsUrl, 500),
        sheetsSpreadsheetId: clampStr(draftSettings.sheetsSpreadsheetId, 150),
        onboardingNotifEnabled: Boolean(draftSettings.onboardingNotifEnabled),
        onboardingNotifTitle: clampStr(draftSettings.onboardingNotifTitle, 120),
        onboardingNotifMessage: clampStr(draftSettings.onboardingNotifMessage, 300),
        updatedAt: serverTimestamp(),
      };

      if (snap.exists()) {
        await updateDoc(refDoc, payload);
      } else {
        await setDoc(refDoc, payload);
      }
      showToast('ok', 'Academy settings saved and synced live.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/config');
    }
  };

  const handleReturnClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onExitAdmin) {
      e.preventDefault();
      onExitAdmin();
    }
  };

  const handleAdminSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(parseFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAdminRedirectSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      setAuthError(parseFirebaseAuthError(err));
      setAuthBusy(false);
    }
  };

  const handleSwitchAdminAccount = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await logout();
      await signInWithGoogle();
    } catch (err) {
      setAuthError(parseFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const copyDetectedHost = (host: string) => {
    navigator.clipboard?.writeText(host);
    setCopiedHost(true);
    window.setTimeout(() => setCopiedHost(false), 2000);
  };

  // --- Auth Loading / Unauthorized Screens ---
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#070709] flex items-center justify-center p-6 text-sm text-[#A1A1AA]">
        Initializing Admin Console...
      </div>
    );
  }

  if (!user) {
    const canUseRedirect = isTopLevelBrowserWindow();

    return (
      <div className="min-h-screen bg-[#070709] flex items-center justify-center p-4">
        <div className="w-full max-w-lg apple-window rounded-3xl p-7 sm:p-8 text-center space-y-6">
          <ResilientImage
            src={settings.logoUrl}
            alt={settings.siteName}
            className="w-16 h-16 rounded-2xl mx-auto object-cover border border-white/15"
          />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#D4AF37]">PROTECTED CONSOLE</p>
            <h1 className="text-2xl font-semibold text-[#F5F5F7]">MSNR Admin Dashboard</h1>
            <p className="text-xs sm:text-sm text-[#A1A1AA]">
              Sign in with your authorized administrator Google account to manage VIP signals,
              approvals, books, and academy settings.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-center">
              <GoogleSignInButton
                onClick={handleAdminSignIn}
                disabled={authBusy}
                label={authBusy ? 'Connecting to Google...' : 'Sign in as Administrator'}
              />
            </div>

            {canUseRedirect && (
              <div>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleAdminRedirectSignIn}
                  className="text-xs font-medium text-[#D4AF37] hover:text-[#E5C76B] disabled:opacity-50 transition-colors"
                >
                  Popup closing or blocked? Sign in via Full-Page Redirect instead
                </button>
              </div>
            )}
          </div>

          {authError && (
            <div className="rounded-2xl bg-[#161215] border border-[#FF453A]/35 p-4 text-left space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#FF453A]">{authError.title}</p>
                <p className="text-xs text-[#D1D1D6] leading-relaxed">{authError.message}</p>
              </div>

              {(authError.isUnauthorizedDomain || authError.isUserCancelled) && (
                <div className="rounded-xl bg-black/45 border border-white/10 p-3 space-y-2.5">
                  <p className="text-[11px] font-medium text-[#E5C76B]">
                    One-Time Fix if Popup Closes Immediately on GitHub Pages / Custom Domain:
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2">
                    <code className="text-xs font-mono text-[#F5F5F7] truncate">
                      {authError.hostname}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyDetectedHost(authError.hostname)}
                      className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-[#F5F5F7] inline-flex items-center gap-1 shrink-0"
                    >
                      {copiedHost ? <Check className="w-3 h-3 text-[#30D158]" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedHost ? 'Copied' : 'Copy Domain'}</span>
                    </button>
                  </div>
                  <ol className="text-[11px] text-[#A1A1AA] space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Copy the domain shown above.</li>
                    <li>
                      Open Firebase Authentication Settings → scroll to{' '}
                      <strong className="text-[#F5F5F7]">Authorized domains</strong> → click{' '}
                      <strong className="text-[#F5F5F7]">Add domain</strong> and paste it.
                    </li>
                    <li>Return here and click Sign in as Administrator again.</li>
                  </ol>
                  <a
                    href={authError.firebaseConsoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-lg bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C76B] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Open Firebase Authorized Domains</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          <div>
            <a
              href="./index.html"
              onClick={handleReturnClick}
              className="text-xs text-[#8E8E93] hover:text-[#F5F5F7]"
            >
              Return to Public Website
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#070709] flex items-center justify-center p-4">
        <div className="w-full max-w-md apple-window rounded-3xl p-8 text-center space-y-5">
          <ShieldAlert className="w-10 h-10 text-[#FF453A] mx-auto" />
          <h1 className="text-xl font-semibold text-[#F5F5F7]">Administrator Access Required</h1>
          <p className="text-xs sm:text-sm text-[#A1A1AA]">
            Signed in as <strong className="text-[#F5F5F7]">{user.email}</strong>. Switch to your
            authorized administrator Google account to open the MSNR Academy Admin Console.
          </p>
          {authError && (
            <p className="text-xs text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/25 rounded-xl p-3">
              {authError.message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={authBusy}
              onClick={handleSwitchAdminAccount}
              className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C76B] text-[#09090B] text-xs font-semibold disabled:opacity-50"
            >
              {authBusy ? 'Switching...' : 'Switch Google Account'}
            </button>
            <a
              href="./index.html"
              onClick={handleReturnClick}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#F5F5F7] text-xs font-semibold"
            >
              Open Academy
            </a>
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'signals', label: 'VIP Signals', icon: BarChart3 },
    {
      id: 'vip-requests',
      label: 'VIP Requests',
      icon: Crown,
      badge: vipRequests.filter((r) => r.status === 'PENDING').length,
    },
    {
      id: 'users',
      label: 'VIP Users',
      icon: Users,
    },
    { id: 'market-analysis', label: 'Market Analysis', icon: LineChart },
    { id: 'videos', label: 'Videos', icon: PlaySquare },
    { id: 'free-pdfs', label: 'Free PDFs', icon: FileText },
    { id: 'paid-pdfs', label: 'Paid PDFs', icon: BookOpen },
    {
      id: 'book-purchases',
      label: 'Book Purchases',
      icon: BookOpen,
      badge: bookPurchases.filter((b) => b.status === 'PENDING').length,
    },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'statistics', label: 'Statistics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#070709] text-[#F5F5F7] flex flex-col lg:flex-row">
      {/* macOS Sidebar */}
      <aside className="w-full lg:w-64 apple-glass border-b lg:border-b-0 lg:border-r border-white/[0.08] p-4 flex flex-col justify-between shrink-0 lg:overflow-y-auto">
        <div className="space-y-5">
          <div className="flex items-center justify-between px-2">
            <a href="./index.html" onClick={handleReturnClick} className="flex items-center gap-2.5">
              <ResilientImage
                src={settings.logoUrl}
                alt={settings.siteName}
                className="w-7 h-7 rounded-lg object-cover border border-white/15"
              />
              <span className="text-sm font-semibold tracking-tight">{settings.siteName}</span>
            </a>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] font-semibold ${
                        active ? 'text-[#09090B]' : 'text-[#E5C76B]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pt-6 border-t border-white/[0.08] text-xs">
          <a
            href="./index.html"
            onClick={handleReturnClick}
            className="px-3 py-2 rounded-xl text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/[0.05] inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Live Website</span>
          </a>
          <button
            type="button"
            onClick={logout}
            className="px-3 py-2 rounded-xl text-[#A1A1AA] hover:text-[#FF453A] hover:bg-white/[0.05] inline-flex items-center gap-2 text-left"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out ({user.email?.split('@')[0]})</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace (native document touch scroll on mobile; independent pane scroll on desktop) */}
      <main className="flex-1 min-w-0 p-5 sm:p-8 lg:p-10 space-y-8 lg:overflow-y-auto">
        {toast && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border ${
              toast.type === 'ok'
                ? 'bg-[#30D158]/15 border-[#30D158]/30 text-[#30D158]'
                : 'bg-[#FF453A]/15 border-[#FF453A]/30 text-[#FF453A]'
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* 1. OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#D4AF37]">ADMINISTRATION</p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                  Academy Command Overview
                </h1>
              </div>

              <button
                type="button"
                onClick={handleInitializeStarterData}
                className="px-4 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors whitespace-nowrap"
              >
                Initialize / Sync Starter Catalog to Firestore
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">Pending VIP Requests</p>
                <p className="mt-2 text-2xl font-semibold text-[#E5C76B]">
                  {vipRequests.filter((r) => r.status === 'PENDING').length}
                </p>
              </div>
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">Pending Book Orders</p>
                <p className="mt-2 text-2xl font-semibold text-[#E5C76B]">
                  {bookPurchases.filter((b) => b.status === 'PENDING').length}
                </p>
              </div>
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">Published Signals</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F5F7]">
                  {pubSignals.filter((s) => !LEGACY_DEMO_SIGNAL_IDS.has(s.id)).length}
                </p>
              </div>
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">Registered Members</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F5F7]">{allUsers.length}</p>
              </div>
            </div>

            <div className="apple-surface rounded-2xl p-6 space-y-3">
              <h2 className="text-base font-semibold text-[#F5F5F7]">
                Quick Firebase Hosting Deployment Guide
              </h2>
              <ol className="text-xs sm:text-sm text-[#A1A1AA] space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Install Node.js (v20+) on your computer and run{' '}
                  <code className="font-mono text-[#E5C76B]">npm install -g firebase-tools</code>.
                </li>
                <li>
                  Inside your project folder, run{' '}
                  <code className="font-mono text-[#E5C76B]">npm install</code> followed by{' '}
                  <code className="font-mono text-[#E5C76B]">npm run build</code> to compile all 6
                  pages (<code className="font-mono">index.html</code>,{' '}
                  <code className="font-mono">admin.html</code>,{' '}
                  <code className="font-mono">about.html</code>,{' '}
                  <code className="font-mono">contact.html</code>,{' '}
                  <code className="font-mono">terms.html</code>,{' '}
                  <code className="font-mono">privacy.html</code>) into <code className="font-mono">dist/</code>.
                </li>
                <li>
                  Run <code className="font-mono text-[#E5C76B]">firebase login</code> and{' '}
                  <code className="font-mono text-[#E5C76B]">firebase deploy</code> — both{' '}
                  <code className="font-mono">firebase.json</code> and{' '}
                  <code className="font-mono">firestore.rules</code> are pre-configured.
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* 2. VIP SIGNALS */}
        {activeTab === 'signals' && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Manage XAUUSD VIP Signals</h1>
                <p className="text-xs text-[#A1A1AA]">
                  Pips are ONLY counted when you publish and settle real trading signals (TP HIT, SL HIT, or CLOSED).
                </p>
              </div>

              {pubSignals.some((s) => LEGACY_DEMO_SIGNAL_IDS.has(s.id)) && (
                <button
                  type="button"
                  onClick={handleRemoveLegacyDemoSignals}
                  className="px-4 py-2 rounded-xl bg-[#FF453A]/20 hover:bg-[#FF453A]/30 border border-[#FF453A]/40 text-xs font-semibold text-[#FF453A]"
                >
                  Remove Legacy Demo Signals From Database
                </button>
              )}
            </div>

            <form onSubmit={handleSaveSignal} className="apple-surface rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F5F5F7]">
                  {editingSignalId ? `Editing Signal (${editingSignalId})` : 'Publish New XAUUSD Signal'}
                </h2>
                {editingSignalId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSignalId(null);
                      setSigResult('ACTIVE');
                      setSigClosedPips('0');
                    }}
                    className="text-xs text-[#A1A1AA] hover:text-[#F5F5F7]"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Date</label>
                  <input
                    type="date"
                    value={sigDate}
                    onChange={(e) => setSigDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Direction</label>
                  <select
                    value={sigDirection}
                    onChange={(e) => setSigDirection(e.target.value as SignalDirection)}
                    className="w-full px-3 py-2 rounded-xl bg-[#14151B] border border-white/10 text-sm"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Order Type</label>
                  <select
                    value={sigOrderType}
                    onChange={(e) => setSigOrderType(e.target.value as SignalOrderType)}
                    className="w-full px-3 py-2 rounded-xl bg-[#14151B] border border-white/10 text-sm"
                  >
                    <option value="LIMIT">LIMIT</option>
                    <option value="MARKET">MARKET</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Status / Result</label>
                  <select
                    value={sigResult}
                    onChange={(e) => setSigResult(e.target.value as SignalResult)}
                    className="w-full px-3 py-2 rounded-xl bg-[#14151B] border border-white/10 text-sm"
                  >
                    <option value="ACTIVE">ACTIVE (Running · 0 Realized Pips)</option>
                    <option value="TP HIT">TP HIT</option>
                    <option value="SL HIT">SL HIT</option>
                    <option value="CLOSED">CLOSED (Manual Exit)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                <div>
                  <label className="block text-xs font-sans text-[#A1A1AA] mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={sigEntry}
                    onChange={(e) => setSigEntry(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-[#A1A1AA] mb-1">TP</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={sigTp}
                    onChange={(e) => setSigTp(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-[#A1A1AA] mb-1">Extra TP</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={sigExtraTp}
                    onChange={(e) => setSigExtraTp(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-[#A1A1AA] mb-1">SL</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={sigSl}
                    onChange={(e) => setSigSl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
              </div>

              {sigResult === 'CLOSED' && (
                <div>
                  <label className="block text-xs text-[#E5C76B] mb-1">
                    Realized Pips on Manual Close (e.g. 45, 0 for breakeven, or -20)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={sigClosedPips}
                    onChange={(e) => setSigClosedPips(e.target.value)}
                    className="w-full sm:w-64 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-[#D4AF37]/40 text-sm font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Execution Note</label>
                <input
                  type="text"
                  maxLength={1000}
                  value={sigNote}
                  onChange={(e) => setSigNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{editingSignalId ? 'Save Signal Changes' : 'Publish VIP Signal'}</span>
              </button>
            </form>

            {pubSignals.filter((s) => !LEGACY_DEMO_SIGNAL_IDS.has(s.id)).length === 0 ? (
              <div className="apple-surface rounded-2xl p-10 text-center text-sm text-[#A1A1AA]">
                No trading signals published yet. Publish your first XAUUSD signal above.
              </div>
            ) : (
              <div className="space-y-3">
                {pubSignals
                  .filter((s) => !LEGACY_DEMO_SIGNAL_IDS.has(s.id))
                  .map((s) => {
                    const priv = privSignals[s.id];
                    return (
                      <div
                        key={s.id}
                        className="apple-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 font-mono tabular-nums text-xs">
                          <div className="flex items-center gap-2 font-sans">
                            <span className="font-semibold text-sm text-[#F5F5F7]">
                              {s.currency}
                            </span>
                            <span
                              className={`font-semibold ${
                                s.direction === 'BUY' ? 'text-[#30D158]' : 'text-[#FF453A]'
                              }`}
                            >
                              {s.direction} {s.orderType}
                            </span>
                            <span className="text-[#8E8E93]">· {s.date} · {s.result}</span>
                          </div>
                          <p className="text-[#D1D1D6]">
                            Entry: {priv?.entry ?? '—'} · TP: {priv?.tp ?? '—'} · Extra TP:{' '}
                            {priv?.extraTp ?? '—'} · SL: {priv?.sl ?? '—'} · Realized Pips:{' '}
                            {s.result === 'ACTIVE' ? '0 (Active)' : s.pips}
                          </p>
                          {priv?.note && <p className="font-sans text-[#8E8E93]">{priv.note}</p>}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMarkSignalOutcome(s, 'TP HIT')}
                            className="px-2.5 py-1.5 rounded-lg bg-[#30D158]/15 text-[#30D158] text-xs font-semibold"
                          >
                            TP HIT
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkSignalOutcome(s, 'SL HIT')}
                            className="px-2.5 py-1.5 rounded-lg bg-[#FF453A]/15 text-[#FF453A] text-xs font-semibold"
                          >
                            SL HIT
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkSignalOutcome(s, 'CLOSED')}
                            className="px-2.5 py-1.5 rounded-lg bg-white/10 text-[#F5F5F7] text-xs font-semibold"
                          >
                            CLOSED
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSignalId(s.id);
                              setSigDate(s.date);
                              setSigDirection(s.direction);
                              setSigOrderType(s.orderType);
                              setSigResult(s.result);
                              setSigClosedPips(String(s.pips || 0));
                              if (priv) {
                                setSigEntry(String(priv.entry));
                                setSigTp(String(priv.tp));
                                setSigExtraTp(String(priv.extraTp));
                                setSigSl(String(priv.sl));
                                setSigNote(priv.note);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#D1D1D6]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                title: 'Delete VIP Signal?',
                                description: `Permanently delete ${s.currency} ${s.direction} signal (${s.date})?`,
                                onConfirm: async () => {
                                  const b = writeBatch(db);
                                  b.delete(doc(db, 'vipSignalsPublic', s.id));
                                  b.delete(doc(db, 'vipSignalsPrivate', s.id));
                                  await b.commit();
                                  showToast('ok', 'Signal deleted.');
                                },
                              })
                            }
                            className="p-1.5 rounded-lg text-[#FF453A] hover:bg-[#FF453A]/15"
                            aria-label="Delete signal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* 3. VIP REQUESTS (Separated by Exness VIP vs Binance VIP) */}
        {activeTab === 'vip-requests' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">VIP Verification Requests</h1>
                <p className="text-xs text-[#A1A1AA]">
                  Review and approve Exness VIP Users and Binance VIP Users separately.
                </p>
              </div>

              <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] gap-1">
                {(
                  [
                    {
                      id: 'EXNESS' as const,
                      label: 'Exness VIP Requests',
                      pending: vipRequests.filter(
                        (r) => r.method === 'EXNESS' && r.status === 'PENDING'
                      ).length,
                    },
                    {
                      id: 'BINANCE' as const,
                      label: 'Binance VIP Requests',
                      pending: vipRequests.filter(
                        (r) => r.method === 'BINANCE' && r.status === 'PENDING'
                      ).length,
                    },
                    {
                      id: 'CUSTOM' as const,
                      label: 'Custom VIP',
                      pending: vipRequests.filter(
                        (r) => r.method === 'CUSTOM' && r.status === 'PENDING'
                      ).length,
                    },
                    {
                      id: 'ALL' as const,
                      label: 'All',
                      pending: vipRequests.filter((r) => r.status === 'PENDING').length,
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setVipRequestCategoryFilter(t.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                      vipRequestCategoryFilter === t.id
                        ? 'bg-[#D4AF37] text-[#09090B]'
                        : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className="font-mono tabular-nums opacity-85">({t.pending})</span>
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const filteredReqs =
                vipRequestCategoryFilter === 'ALL'
                  ? vipRequests
                  : vipRequests.filter((r) => r.method === vipRequestCategoryFilter);

              if (filteredReqs.length === 0) {
                return (
                  <div className="apple-surface rounded-2xl p-10 text-center text-sm text-[#A1A1AA]">
                    No {vipRequestCategoryFilter === 'ALL' ? '' : vipRequestCategoryFilter + ' '}VIP
                    requests submitted yet.
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredReqs.map((req) => (
                    <div
                      key={req.id}
                      className="apple-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 text-xs">
                        <p className="text-sm font-semibold text-[#F5F5F7]">
                          {req.name} ·{' '}
                          <span className="text-[#D4AF37]">
                            {req.method === 'EXNESS'
                              ? 'Exness VIP'
                              : req.method === 'BINANCE'
                              ? 'Binance VIP'
                              : 'Custom VIP'}
                          </span>{' '}
                          ·{' '}
                          <span
                            className={
                              req.status === 'APPROVED'
                                ? 'text-[#30D158]'
                                : req.status === 'REJECTED'
                                ? 'text-[#FF453A]'
                                : 'text-[#E5C76B]'
                            }
                          >
                            {req.status}
                          </span>
                        </p>
                        <p className="text-[#A1A1AA]">
                          Email: {req.email} · Telegram: {req.telegram}
                        </p>
                        <p className="font-mono text-[#D1D1D6]">
                          {req.method === 'EXNESS' && `Exness Account ID: ${req.exnessId}`}
                          {req.method === 'BINANCE' && `Binance Pay TxID: ${req.transactionId}`}
                          {req.method === 'CUSTOM' && `Details: ${req.customDetails}`}
                          {' · '}
                          {new Date(req.createdAtMs).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleVipDecision(req, 'APPROVED')}
                          className="px-3.5 py-2 rounded-xl bg-[#30D158] text-[#09090B] text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            APPROVE {req.method === 'EXNESS' ? 'EXNESS VIP' : req.method === 'BINANCE' ? 'BINANCE VIP' : 'VIP'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVipDecision(req, 'REJECTED')}
                          className="px-3.5 py-2 rounded-xl bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                        >
                          REJECT
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* 4. BOOK PURCHASES */}
        {activeTab === 'book-purchases' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Paid PDF Book Purchases</h1>
            {bookPurchases.length === 0 ? (
              <div className="apple-surface rounded-2xl p-10 text-center text-sm text-[#A1A1AA]">
                No paid book purchase requests yet.
              </div>
            ) : (
              <div className="space-y-3">
                {bookPurchases.map((pur) => (
                  <div
                    key={pur.id}
                    className="apple-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 text-xs">
                      <p className="text-sm font-semibold text-[#F5F5F7]">
                        {pur.bookName} · <span className="font-mono text-[#E5C76B]">${pur.price}</span>{' '}
                        · {pur.status}
                      </p>
                      <p className="text-[#A1A1AA]">
                        Buyer: {pur.name} ({pur.userEmail}) · Telegram: {pur.telegram}
                      </p>
                      <p className="font-mono text-[#D1D1D6]">
                        TxID: {pur.transactionId} · {new Date(pur.createdAtMs).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBookPurchaseDecision(pur, 'APPROVED')}
                        className="px-3.5 py-2 rounded-xl bg-[#30D158] text-[#09090B] text-xs font-semibold"
                      >
                        APPROVE BOOK
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBookPurchaseDecision(pur, 'REJECTED')}
                        className="px-3.5 py-2 rounded-xl bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                      >
                        REJECT / REVOKE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4B. MARKET ANALYSIS VIDEOS (Separate Admin Section for Unlisted YouTube Videos + Likes/Dislikes) */}
        {activeTab === 'market-analysis' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Market Analysis Videos</h1>
              <p className="text-xs text-[#A1A1AA]">
                Add, edit, or delete unlisted YouTube Market Analysis videos and monitor live Like &amp; Dislike counts.
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const id = editingMaId || sanitizeId(`ma_${Date.now()}`);
                  const resolvedThumb = clampStr(
                    maThumb || extractYoutubeThumbnail(maUrl, ASSETS.heroTerminal),
                    500
                  );
                  if (editingMaId) {
                    await updateDoc(doc(db, 'marketAnalysisVideos', id), {
                      title: clampStr(maTitle, 200),
                      youtubeUrl: clampStr(maUrl, 500),
                      thumbnail: resolvedThumb,
                      description: clampStr(maDesc, 1000),
                      date: clampStr(maDate || new Date().toISOString().slice(0, 10), 40),
                      status: maStatus,
                      updatedAt: serverTimestamp(),
                    });
                    showToast('ok', 'Market Analysis video updated.');
                  } else {
                    await setDoc(doc(db, 'marketAnalysisVideos', id), {
                      id,
                      title: clampStr(maTitle, 200),
                      youtubeUrl: clampStr(maUrl, 500),
                      thumbnail: resolvedThumb,
                      description: clampStr(maDesc, 1000),
                      date: clampStr(maDate || new Date().toISOString().slice(0, 10), 40),
                      status: maStatus,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                    });
                    showToast('ok', 'Market Analysis video published.');
                  }
                  setEditingMaId(null);
                  setMaTitle('');
                  setMaUrl('');
                  setMaThumb('');
                  setMaDate(new Date().toISOString().slice(0, 10));
                  setMaStatus('ACTIVE');
                  setMaDesc('');
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, 'marketAnalysisVideos');
                }
              }}
              className="apple-surface rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F5F5F7]">
                  {editingMaId
                    ? 'Edit Market Analysis Video'
                    : 'Publish New Market Analysis Video (Unlisted YouTube Supported)'}
                </h2>
                {editingMaId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMaId(null);
                      setMaTitle('');
                      setMaUrl('');
                      setMaThumb('');
                      setMaDate(new Date().toISOString().slice(0, 10));
                      setMaStatus('ACTIVE');
                      setMaDesc('');
                    }}
                    className="text-xs text-[#A1A1AA] hover:text-[#F5F5F7]"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Analysis Title</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    placeholder="e.g. XAUUSD Weekly Storyline & London Roadblocks"
                    value={maTitle}
                    onChange={(e) => setMaTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">
                    Unlisted YouTube URL (youtu.be/... or youtube.com/watch?v=...)
                  </label>
                  <input
                    type="url"
                    required
                    maxLength={500}
                    placeholder="https://youtu.be/..."
                    value={maUrl}
                    onChange={(e) => setMaUrl(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Date</label>
                  <input
                    type="date"
                    value={maDate}
                    onChange={(e) => setMaDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Visibility</label>
                  <select
                    value={maStatus}
                    onChange={(e) => setMaStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#14151B] border border-white/10 text-sm"
                  >
                    <option value="ACTIVE">ACTIVE (Visible on Website)</option>
                    <option value="INACTIVE">INACTIVE (Hidden)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#A1A1AA] mb-1">
                    Optional Custom Thumbnail URL (Leave blank to auto-use YouTube thumbnail)
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Auto-detected from YouTube link when left empty"
                    value={maThumb}
                    onChange={(e) => setMaThumb(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#A1A1AA] mb-1">Analysis Notes / Description</label>
                  <textarea
                    rows={2}
                    required
                    maxLength={1000}
                    placeholder="Key H4 & Daily XAUUSD MSNR levels covered in this session..."
                    value={maDesc}
                    onChange={(e) => setMaDesc(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {editingMaId ? 'Save Market Analysis Changes' : 'Publish Market Analysis Video'}
                </span>
              </button>
            </form>

            {allMarketVideos.length === 0 ? (
              <div className="apple-surface rounded-2xl p-10 text-center text-sm text-[#A1A1AA]">
                No Market Analysis videos added yet. Paste an unlisted YouTube link above to publish.
              </div>
            ) : (
              <div className="space-y-3">
                {allMarketVideos.map((v) => {
                  const likes = allMarketReactions.filter(
                    (r) => r.videoId === v.id && r.reaction === 'LIKE'
                  ).length;
                  const dislikes = allMarketReactions.filter(
                    (r) => r.videoId === v.id && r.reaction === 'DISLIKE'
                  ).length;
                  const previewThumb =
                    v.thumbnail || extractYoutubeThumbnail(v.youtubeUrl, ASSETS.heroTerminal);

                  return (
                    <div
                      key={v.id}
                      className="apple-surface rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div className="w-24 aspect-video rounded-lg overflow-hidden bg-black/50 border border-white/10 shrink-0">
                          <ResilientImage
                            src={previewThumb}
                            alt={v.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-[#F5F5F7] truncate">{v.title}</p>
                          <p className="text-xs text-[#A1A1AA] truncate">
                            {v.date} ·{' '}
                            <span
                              className={
                                v.status === 'ACTIVE' ? 'text-[#30D158]' : 'text-[#8E8E93]'
                              }
                            >
                              {v.status}
                            </span>{' '}
                            · {v.youtubeUrl}
                          </p>
                          <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#D1D1D6]">
                            <span className="inline-flex items-center gap-1 text-[#E5C76B]">
                              <ThumbsUp className="w-3.5 h-3.5" />
                              {likes}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[#A1A1AA]">
                              <ThumbsDown className="w-3.5 h-3.5" />
                              {dislikes}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await updateDoc(doc(db, 'marketAnalysisVideos', v.id), {
                              status: v.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                              updatedAt: serverTimestamp(),
                            });
                            showToast(
                              'ok',
                              `Video marked ${v.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}.`
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#D1D1D6]"
                        >
                          {v.status === 'ACTIVE' ? 'Hide' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMaId(v.id);
                            setMaTitle(v.title);
                            setMaUrl(v.youtubeUrl);
                            setMaThumb(v.thumbnail);
                            setMaDate(v.date);
                            setMaStatus(v.status);
                            setMaDesc(v.description);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#F5F5F7] inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: 'Delete Market Analysis Video?',
                              description: `Permanently delete "${v.title}" from Market Analysis?`,
                              onConfirm: async () => {
                                await deleteDoc(doc(db, 'marketAnalysisVideos', v.id));
                                showToast('ok', 'Market Analysis video deleted.');
                              },
                            })
                          }
                          className="p-2 rounded-lg text-[#FF453A] hover:bg-[#FF453A]/15"
                          aria-label="Delete Market Analysis video"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 5. VIDEOS */}
        {activeTab === 'videos' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Videos Library</h1>
                <p className="text-xs text-[#A1A1AA] font-mono">
                  Google Sheet Columns: id, title, youtube_url, thumbnail, description, date, status
                </p>
              </div>
              <button
                type="button"
                disabled={syncingSheets}
                onClick={() => handleSyncSheets('videos')}
                className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold inline-flex items-center gap-2"
              >
                <FolderSync className="w-4 h-4" />
                <span>{syncingSheets ? 'Syncing...' : 'Sync From Google Sheets'}</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const id = editingVidId || sanitizeId(`vid_${Date.now()}`);
                const resolvedThumb = clampStr(
                  vidThumb || extractYoutubeThumbnail(vidUrl, ASSETS.videoThumb),
                  500
                );
                if (editingVidId) {
                  await updateDoc(doc(db, 'videos', id), {
                    title: clampStr(vidTitle, 200),
                    youtubeUrl: clampStr(vidUrl, 500),
                    thumbnail: resolvedThumb,
                    description: clampStr(vidDesc, 1000),
                    date: clampStr(vidDate || new Date().toISOString().slice(0, 10), 40),
                    status: vidStatus,
                    updatedAt: serverTimestamp(),
                  });
                  showToast('ok', 'Video updated.');
                } else {
                  await setDoc(doc(db, 'videos', id), {
                    id,
                    title: clampStr(vidTitle, 200),
                    youtubeUrl: clampStr(vidUrl, 500),
                    thumbnail: resolvedThumb,
                    description: clampStr(vidDesc, 1000),
                    date: clampStr(vidDate || new Date().toISOString().slice(0, 10), 40),
                    status: vidStatus,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  showToast('ok', 'Video added to library.');
                }
                setEditingVidId(null);
                setVidTitle('');
                setVidUrl('');
                setVidThumb('');
                setVidDate(new Date().toISOString().slice(0, 10));
                setVidStatus('ACTIVE');
                setVidDesc('');
              }}
              className="apple-surface rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="sm:col-span-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F5F5F7]">
                  {editingVidId ? 'Edit Video Lesson' : 'Add Video Lesson'}
                </h2>
                {editingVidId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVidId(null);
                      setVidTitle('');
                      setVidUrl('');
                      setVidThumb('');
                      setVidDesc('');
                    }}
                    className="text-xs text-[#A1A1AA] hover:text-[#F5F5F7]"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                placeholder="Video Title"
                value={vidTitle}
                onChange={(e) => setVidTitle(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="url"
                required
                placeholder="YouTube URL (https://www.youtube.com/watch?v=... or youtu.be/...)"
                value={vidUrl}
                onChange={(e) => setVidUrl(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="text"
                placeholder="Optional Custom Thumbnail URL"
                value={vidThumb}
                onChange={(e) => setVidThumb(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="text"
                required
                placeholder="Short Description"
                value={vidDesc}
                onChange={(e) => setVidDesc(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C76B] text-xs font-semibold"
                >
                  {editingVidId ? 'Save Video Changes' : 'Add Video Lesson'}
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {allVideos.map((v) => (
                <div
                  key={v.id}
                  className="apple-surface rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#F5F5F7] truncate">{v.title}</p>
                    <p className="text-xs text-[#A1A1AA] truncate">{v.youtubeUrl} · {v.status}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVidId(v.id);
                        setVidTitle(v.title);
                        setVidUrl(v.youtubeUrl);
                        setVidThumb(v.thumbnail);
                        setVidDate(v.date);
                        setVidStatus(v.status);
                        setVidDesc(v.description);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          title: 'Delete Video?',
                          description: `Remove "${v.title}" from the Videos library?`,
                          onConfirm: async () => {
                            await deleteDoc(doc(db, 'videos', v.id));
                            showToast('ok', 'Video removed.');
                          },
                        })
                      }
                      className="p-2 rounded-lg text-[#FF453A] hover:bg-[#FF453A]/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. FREE PDFS (Automatic Cover Extraction From PDF Link / File) */}
        {activeTab === 'free-pdfs' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Free PDF Library</h1>
                <p className="text-xs text-[#A1A1AA]">
                  Provide a PDF link or upload a PDF — the cover page thumbnail is extracted automatically.
                </p>
              </div>
              <button
                type="button"
                disabled={syncingSheets}
                onClick={() => handleSyncSheets('free-pdfs')}
                className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold inline-flex items-center gap-2"
              >
                <FolderSync className="w-4 h-4" />
                <span>Sync From Google Sheets</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFbExtractingCover(true);
                try {
                  let resolvedCover = fbCover;
                  if (!resolvedCover && fbPdf.trim()) {
                    resolvedCover = (await extractPdfCoverFromUrl(fbPdf.trim())) || '';
                  }
                  const id = editingFbId || sanitizeId(`free_${Date.now()}`);
                  if (editingFbId) {
                    await updateDoc(doc(db, 'freeBooks', id), {
                      name: clampStr(fbName, 200),
                      description: clampStr(fbDesc, 1000),
                      coverUrl: clampStr(resolvedCover, 175000),
                      pdfUrl: clampStr(fbPdf, 500),
                      updatedAt: serverTimestamp(),
                    });
                    showToast('ok', 'Free PDF updated.');
                  } else {
                    await setDoc(doc(db, 'freeBooks', id), {
                      id,
                      name: clampStr(fbName, 200),
                      description: clampStr(fbDesc, 1000),
                      coverUrl: clampStr(resolvedCover, 175000),
                      pdfUrl: clampStr(fbPdf, 500),
                      views: 0,
                      downloads: 0,
                      status: 'ACTIVE',
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                    });
                    showToast('ok', 'Free PDF published with automatic cover thumbnail.');
                  }
                  setEditingFbId(null);
                  setFbName('');
                  setFbDesc('');
                  setFbCover('');
                  setFbPdf('');
                } finally {
                  setFbExtractingCover(false);
                }
              }}
              className="apple-surface rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="sm:col-span-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F5F5F7]">
                  {editingFbId ? 'Edit Free PDF' : 'Publish Free PDF (Auto-Cover Enabled)'}
                </h2>
                {editingFbId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFbId(null);
                      setFbName('');
                      setFbDesc('');
                      setFbCover('');
                      setFbPdf('');
                    }}
                    className="text-xs text-[#A1A1AA] hover:text-[#F5F5F7]"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <input
                type="text"
                required
                placeholder="PDF Title"
                value={fbName}
                onChange={(e) => setFbName(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="text"
                required
                placeholder="Short Description"
                value={fbDesc}
                onChange={(e) => setFbDesc(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />

              <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  placeholder="Paste PDF Link (Google Drive, Dropbox, Direct PDF URL, or Upload PDF)"
                  value={fbPdf}
                  onChange={(e) => {
                    setFbCover('');
                    setFbPdf(e.target.value);
                  }}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <label className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingField === 'free-pdfs' ? 'Uploading...' : 'Upload PDF File'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleStorageUpload(f, 'free-pdfs', setFbPdf, setFbCover);
                      }
                    }}
                  />
                </label>
              </div>

              {(fbExtractingCover || fbCover) && (
                <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  {fbCover ? (
                    <img
                      src={fbCover}
                      alt="Extracted PDF cover preview"
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-lg border border-white/15 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                    </div>
                  )}
                  <div className="text-xs text-[#A1A1AA]">
                    <p className="font-semibold text-[#F5F5F7]">
                      {fbExtractingCover
                        ? 'Extracting Page 1 cover from PDF...'
                        : 'PDF Page 1 Cover Extracted Automatically'}
                    </p>
                    <p>No manual cover image upload needed.</p>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={fbExtractingCover}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold disabled:opacity-60"
                >
                  {editingFbId ? 'Save Free PDF Changes' : 'Publish Free PDF'}
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {allFreeBooks.map((b) => (
                <div
                  key={b.id}
                  className="apple-surface rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{b.name}</p>
                    <p className="text-xs font-mono text-[#A1A1AA]">
                      {b.views} views · {b.downloads} downloads · {b.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFbId(b.id);
                        setFbName(b.name);
                        setFbDesc(b.description);
                        setFbCover(b.coverUrl);
                        setFbPdf(b.pdfUrl);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          title: 'Delete Free PDF?',
                          description: `Remove "${b.name}" from Free PDFs?`,
                          onConfirm: async () => {
                            await deleteDoc(doc(db, 'freeBooks', b.id));
                            showToast('ok', 'Free PDF deleted.');
                          },
                        })
                      }
                      className="p-2 rounded-lg text-[#FF453A] hover:bg-[#FF453A]/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. PAID PDFS (Automatic Cover Extraction From Protected PDF Link / File) */}
        {activeTab === 'paid-pdfs' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Paid PDF Bookstore</h1>
                <p className="text-xs text-[#A1A1AA]">
                  Provide the protected PDF link or upload a PDF — Page 1 is extracted automatically as the public bookstore cover.
                </p>
              </div>
              <button
                type="button"
                disabled={syncingSheets}
                onClick={() => handleSyncSheets('paid-pdfs')}
                className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold inline-flex items-center gap-2"
              >
                <FolderSync className="w-4 h-4" />
                <span>Sync From Google Sheets</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPbExtractingCover(true);
                try {
                  let resolvedCover = pbCover;
                  if (!resolvedCover && pbPdf.trim()) {
                    resolvedCover = (await extractPdfCoverFromUrl(pbPdf.trim())) || '';
                  }
                  const id = editingPbId || sanitizeId(`paid_${Date.now()}`);
                  const batch = writeBatch(db);
                  if (editingPbId) {
                    batch.update(doc(db, 'paidBooksPublic', id), {
                      name: clampStr(pbName, 200),
                      description: clampStr(pbDesc, 1000),
                      coverUrl: clampStr(resolvedCover || ASSETS.bookXauusd, 175000),
                      price: Math.max(0, Number(pbPrice) || 29),
                      updatedAt: serverTimestamp(),
                    });
                    if (pbPdf.trim()) {
                      batch.set(doc(db, 'paidBooksProtected', id), {
                        id,
                        pdfUrl: clampStr(pbPdf, 500),
                        updatedAt: serverTimestamp(),
                      });
                    }
                    await batch.commit();
                    showToast('ok', 'Paid PDF updated.');
                  } else {
                    batch.set(doc(db, 'paidBooksPublic', id), {
                      id,
                      name: clampStr(pbName, 200),
                      description: clampStr(pbDesc, 1000),
                      coverUrl: clampStr(resolvedCover || ASSETS.bookXauusd, 175000),
                      price: Math.max(0, Number(pbPrice) || 29),
                      status: 'ACTIVE',
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                    });
                    batch.set(doc(db, 'paidBooksProtected', id), {
                      id,
                      pdfUrl: clampStr(pbPdf, 500),
                      updatedAt: serverTimestamp(),
                    });
                    await batch.commit();
                    showToast('ok', 'Paid book published with automatic cover & protected vault.');
                  }
                  setEditingPbId(null);
                  setPbName('');
                  setPbDesc('');
                  setPbCover('');
                  setPbPdf('');
                } finally {
                  setPbExtractingCover(false);
                }
              }}
              className="apple-surface rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="sm:col-span-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F5F5F7]">
                  {editingPbId ? 'Edit Paid PDF Book' : 'Publish Paid PDF Book (Auto-Cover Enabled)'}
                </h2>
                {editingPbId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPbId(null);
                      setPbName('');
                      setPbDesc('');
                      setPbCover('');
                      setPbPdf('');
                    }}
                    className="text-xs text-[#A1A1AA] hover:text-[#F5F5F7]"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <input
                type="text"
                required
                placeholder="Book Name"
                value={pbName}
                onChange={(e) => setPbName(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="number"
                required
                min="0"
                step="any"
                placeholder="Price USD"
                value={pbPrice}
                onChange={(e) => setPbPrice(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
              />
              <input
                type="text"
                required
                placeholder="Description"
                value={pbDesc}
                onChange={(e) => setPbDesc(e.target.value)}
                className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />

              <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required={!editingPbId}
                  placeholder="Protected PDF Link (Google Drive, Dropbox, Direct PDF URL, or Upload PDF)"
                  value={pbPdf}
                  onChange={(e) => {
                    setPbCover('');
                    setPbPdf(e.target.value);
                  }}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <label className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadingField === 'protected-pdfs' ? 'Uploading...' : 'Upload PDF File'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleStorageUpload(f, 'protected-pdfs', setPbPdf, setPbCover);
                      }
                    }}
                  />
                </label>
              </div>

              {(pbExtractingCover || pbCover) && (
                <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  {pbCover ? (
                    <img
                      src={pbCover}
                      alt="Extracted paid PDF cover preview"
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-lg border border-white/15 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                    </div>
                  )}
                  <div className="text-xs text-[#A1A1AA]">
                    <p className="font-semibold text-[#F5F5F7]">
                      {pbExtractingCover
                        ? 'Extracting Page 1 cover from PDF...'
                        : 'Book Cover Automatically Extracted From PDF Page 1'}
                    </p>
                    <p>Cover is saved publicly while the PDF link stays locked inside the protected vault.</p>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={pbExtractingCover}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold disabled:opacity-60"
                >
                  {editingPbId ? 'Save Paid PDF Changes' : 'Publish Paid PDF'}
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {allPaidBooks.map((b) => (
                <div
                  key={b.id}
                  className="apple-surface rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {b.name} · <span className="font-mono text-[#E5C76B]">${b.price}</span>
                    </p>
                    <p className="text-xs text-[#A1A1AA] truncate">{b.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        setEditingPbId(b.id);
                        setPbName(b.name);
                        setPbDesc(b.description);
                        setPbPrice(String(b.price));
                        setPbCover(b.coverUrl);
                        try {
                          const protSnap = await getDoc(doc(db, 'paidBooksProtected', b.id));
                          setPbPdf(
                            protSnap.exists()
                              ? (protSnap.data() as { pdfUrl?: string }).pdfUrl || ''
                              : ''
                          );
                        } catch {
                          setPbPdf('');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          title: 'Delete Paid Book?',
                          description: `Remove "${b.name}" from Paid PDFs?`,
                          onConfirm: async () => {
                            const batch = writeBatch(db);
                            batch.delete(doc(db, 'paidBooksPublic', b.id));
                            batch.delete(doc(db, 'paidBooksProtected', b.id));
                            await batch.commit();
                            showToast('ok', 'Paid book removed.');
                          },
                        })
                      }
                      className="p-2 rounded-lg text-[#FF453A] hover:bg-[#FF453A]/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8. VIP USERS (Organized Into Separate Exness VIP Users & Binance VIP Users Categories) */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold">VIP Users &amp; Category Management</h1>
                <p className="text-xs text-[#A1A1AA]">
                  Manage and approve <strong className="text-[#F5F5F7]">Exness VIP Users</strong> and{' '}
                  <strong className="text-[#F5F5F7]">Binance VIP Users</strong> in dedicated categories.
                </p>
              </div>

              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search name, email, ID..."
                className="w-full sm:w-64 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
            </div>

            {(() => {
              const q = memberSearch.trim().toLowerCase();
              const matchesSearch = (text: string) => !q || text.toLowerCase().includes(q);

              const exnessUsers = allUsers.filter(
                (u) =>
                  resolveUserVipCategory(u.uid) === 'EXNESS' &&
                  matchesSearch(`${u.name} ${u.email} ${u.telegram}`)
              );
              const binanceUsers = allUsers.filter(
                (u) =>
                  resolveUserVipCategory(u.uid) === 'BINANCE' &&
                  matchesSearch(`${u.name} ${u.email} ${u.telegram}`)
              );
              const pendingExnessReqs = vipRequests.filter(
                (r) =>
                  r.method === 'EXNESS' &&
                  r.status === 'PENDING' &&
                  matchesSearch(`${r.name} ${r.email} ${r.exnessId} ${r.telegram}`)
              );
              const pendingBinanceReqs = vipRequests.filter(
                (r) =>
                  r.method === 'BINANCE' &&
                  r.status === 'PENDING' &&
                  matchesSearch(`${r.name} ${r.email} ${r.transactionId} ${r.telegram}`)
              );
              const filteredAllUsers = allUsers.filter((u) =>
                matchesSearch(`${u.name} ${u.email} ${u.telegram}`)
              );

              return (
                <>
                  {/* Category Switcher: Exness VIP Users vs Binance VIP Users vs All Members */}
                  <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] gap-1">
                    <button
                      type="button"
                      onClick={() => setVipUsersCategoryTab('EXNESS')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-2 ${
                        vipUsersCategoryTab === 'EXNESS'
                          ? 'bg-[#D4AF37] text-[#09090B]'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                      }`}
                    >
                      <span>Exness VIP Users</span>
                      <span className="font-mono tabular-nums">
                        ({exnessUsers.length}
                        {pendingExnessReqs.length > 0 ? ` · ${pendingExnessReqs.length} Pending` : ''})
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVipUsersCategoryTab('BINANCE')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-2 ${
                        vipUsersCategoryTab === 'BINANCE'
                          ? 'bg-[#D4AF37] text-[#09090B]'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                      }`}
                    >
                      <span>Binance VIP Users</span>
                      <span className="font-mono tabular-nums">
                        ({binanceUsers.length}
                        {pendingBinanceReqs.length > 0 ? ` · ${pendingBinanceReqs.length} Pending` : ''})
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVipUsersCategoryTab('ALL')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-2 ${
                        vipUsersCategoryTab === 'ALL'
                          ? 'bg-[#D4AF37] text-[#09090B]'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                      }`}
                    >
                      <span>All Registered Members</span>
                      <span className="font-mono tabular-nums">({filteredAllUsers.length})</span>
                    </button>
                  </div>

                  {/* CATEGORY 1: EXNESS VIP USERS */}
                  {vipUsersCategoryTab === 'EXNESS' && (
                    <div className="space-y-6">
                      {pendingExnessReqs.length > 0 && (
                        <div className="space-y-3">
                          <h2 className="text-xs font-semibold tracking-wider text-[#E5C76B] uppercase">
                            Pending Exness VIP Approvals ({pendingExnessReqs.length})
                          </h2>
                          {pendingExnessReqs.map((req) => (
                            <div
                              key={req.id}
                              className="apple-surface rounded-2xl p-5 border border-[#D4AF37]/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                            >
                              <div className="space-y-1 text-xs">
                                <p className="text-sm font-semibold text-[#F5F5F7]">
                                  {req.name} · <span className="text-[#E5C76B]">PENDING EXNESS VIP</span>
                                </p>
                                <p className="text-[#A1A1AA]">
                                  Email: {req.email} · Telegram: {req.telegram}
                                </p>
                                <p className="font-mono text-[#D1D1D6]">
                                  Exness Account ID: {req.exnessId || '—'} · Submitted{' '}
                                  {new Date(req.createdAtMs).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVipDecision(req, 'APPROVED')}
                                  className="px-3.5 py-2 rounded-xl bg-[#30D158] text-[#09090B] text-xs font-semibold inline-flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Exness VIP</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVipDecision(req, 'REJECTED')}
                                  className="px-3.5 py-2 rounded-xl bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        <h2 className="text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
                          Exness VIP Users ({exnessUsers.length})
                        </h2>
                        {exnessUsers.length === 0 ? (
                          <div className="apple-surface rounded-2xl p-8 text-center text-sm text-[#A1A1AA]">
                            No Exness VIP users yet. Approve an Exness request above or assign a member from &ldquo;All Registered Members&rdquo;.
                          </div>
                        ) : (
                          exnessUsers.map((u) => {
                            const g = allGrants[u.uid];
                            const exnessReq = vipRequests.find(
                              (r) => r.userId === u.uid && r.method === 'EXNESS'
                            );
                            return (
                              <div
                                key={u.uid}
                                className="apple-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                              >
                                <div className="space-y-1 text-xs">
                                  <p className="text-sm font-semibold text-[#F5F5F7]">
                                    {u.name} · <span className="text-[#A1A1AA]">{u.email}</span>
                                  </p>
                                  <p className="text-[#A1A1AA] font-mono">
                                    Category: <span className="text-[#E5C76B]">Exness VIP</span> ·
                                    Exness ID: {exnessReq?.exnessId || 'Manual Grant'} · Telegram:{' '}
                                    {u.telegram || exnessReq?.telegram || '—'} · Status:{' '}
                                    <span
                                      className={
                                        g?.vipStatus === 'ACTIVE'
                                          ? 'text-[#30D158]'
                                          : 'text-[#FF453A]'
                                      }
                                    >
                                      {g?.vipStatus || 'NONE'} ({g?.vipType || 'LIFETIME'})
                                    </span>
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {g?.vipStatus !== 'ACTIVE' && (
                                    <button
                                      type="button"
                                      onClick={() => handleManualUserVip(u.uid, 'EXNESS_LIFETIME')}
                                      className="px-3 py-1.5 rounded-lg bg-[#30D158] text-[#09090B] text-xs font-semibold"
                                    >
                                      Re-Activate Exness VIP
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleManualUserVip(u.uid, 'REVOKE')}
                                    className="px-3 py-1.5 rounded-lg bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                                  >
                                    Revoke VIP
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 2: BINANCE VIP USERS */}
                  {vipUsersCategoryTab === 'BINANCE' && (
                    <div className="space-y-6">
                      {pendingBinanceReqs.length > 0 && (
                        <div className="space-y-3">
                          <h2 className="text-xs font-semibold tracking-wider text-[#E5C76B] uppercase">
                            Pending Binance VIP Approvals ({pendingBinanceReqs.length})
                          </h2>
                          {pendingBinanceReqs.map((req) => (
                            <div
                              key={req.id}
                              className="apple-surface rounded-2xl p-5 border border-[#D4AF37]/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                            >
                              <div className="space-y-1 text-xs">
                                <p className="text-sm font-semibold text-[#F5F5F7]">
                                  {req.name} · <span className="text-[#E5C76B]">PENDING BINANCE VIP</span>
                                </p>
                                <p className="text-[#A1A1AA]">
                                  Email: {req.email} · Telegram: {req.telegram}
                                </p>
                                <p className="font-mono text-[#D1D1D6]">
                                  Binance Pay TxID: {req.transactionId || '—'} · Submitted{' '}
                                  {new Date(req.createdAtMs).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVipDecision(req, 'APPROVED')}
                                  className="px-3.5 py-2 rounded-xl bg-[#30D158] text-[#09090B] text-xs font-semibold inline-flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Binance VIP (30d)</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVipDecision(req, 'REJECTED')}
                                  className="px-3.5 py-2 rounded-xl bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        <h2 className="text-xs font-semibold tracking-wider text-[#A1A1AA] uppercase">
                          Binance VIP Users ({binanceUsers.length})
                        </h2>
                        {binanceUsers.length === 0 ? (
                          <div className="apple-surface rounded-2xl p-8 text-center text-sm text-[#A1A1AA]">
                            No Binance VIP users yet. Approve a Binance Pay request above or assign a member from &ldquo;All Registered Members&rdquo;.
                          </div>
                        ) : (
                          binanceUsers.map((u) => {
                            const g = allGrants[u.uid];
                            const binanceReq = vipRequests.find(
                              (r) => r.userId === u.uid && r.method === 'BINANCE'
                            );
                            return (
                              <div
                                key={u.uid}
                                className="apple-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                              >
                                <div className="space-y-1 text-xs">
                                  <p className="text-sm font-semibold text-[#F5F5F7]">
                                    {u.name} · <span className="text-[#A1A1AA]">{u.email}</span>
                                  </p>
                                  <p className="text-[#A1A1AA] font-mono">
                                    Category: <span className="text-[#E5C76B]">Binance VIP</span> ·
                                    TxID: {binanceReq?.transactionId || 'Manual Grant'} · Telegram:{' '}
                                    {u.telegram || binanceReq?.telegram || '—'} · Status:{' '}
                                    <span
                                      className={
                                        g?.vipStatus === 'ACTIVE'
                                          ? 'text-[#30D158]'
                                          : 'text-[#FF453A]'
                                      }
                                    >
                                      {g?.vipStatus || 'NONE'}
                                    </span>
                                    {g?.vipExpiryMs
                                      ? ` · Expires ${new Date(g.vipExpiryMs).toLocaleDateString()}`
                                      : ''}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleManualUserVip(u.uid, 'BINANCE_30D')}
                                    className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold"
                                  >
                                    +30 Days Binance VIP
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleManualUserVip(u.uid, 'REVOKE')}
                                    className="px-3 py-1.5 rounded-lg bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                                  >
                                    Revoke VIP
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 3: ALL REGISTERED MEMBERS */}
                  {vipUsersCategoryTab === 'ALL' && (
                    <div className="space-y-3">
                      {filteredAllUsers.map((u) => {
                        const g = allGrants[u.uid];
                        const cat = resolveUserVipCategory(u.uid);
                        return (
                          <div
                            key={u.uid}
                            className="apple-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                          >
                            <div className="space-y-1 text-xs">
                              <p className="text-sm font-semibold text-[#F5F5F7]">
                                {u.name} · <span className="text-[#A1A1AA]">{u.email}</span>
                              </p>
                              <p className="text-[#A1A1AA] font-mono">
                                Telegram: {u.telegram || '—'} · Category:{' '}
                                <span className="text-[#E5C76B]">{cat}</span> · Status:{' '}
                                {g?.vipStatus || 'NONE'}
                                {g?.vipType === 'MONTHLY' &&
                                  ` · Expires ${new Date(g.vipExpiryMs).toLocaleDateString()}`}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleManualUserVip(u.uid, 'EXNESS_LIFETIME')}
                                className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold"
                              >
                                Assign Exness VIP
                              </button>
                              <button
                                type="button"
                                onClick={() => handleManualUserVip(u.uid, 'BINANCE_30D')}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                              >
                                Assign Binance VIP (+30d)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleManualUserVip(u.uid, 'REVOKE')}
                                className="px-3 py-1.5 rounded-lg bg-[#FF453A]/20 text-[#FF453A] text-xs font-semibold"
                              >
                                Revoke VIP
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* 9. NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Apple Popup Notifications</h1>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const id = sanitizeId(`notif_${Date.now()}`);
                await setDoc(doc(db, 'notifications', id), {
                  id,
                  targetUid: 'ALL',
                  title: clampStr(notifTitle, 120),
                  message: clampStr(notifMsg, 500),
                  icon: 'bell',
                  buttonText: clampStr(notifBtnText, 60),
                  buttonUrl: clampStr(notifBtnUrl, 500),
                  active: true,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                setNotifTitle('');
                setNotifMsg('');
                setNotifBtnText('');
                setNotifBtnUrl('');
                showToast('ok', 'Broadcast notification published.');
              }}
              className="apple-surface rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <input
                type="text"
                required
                placeholder="Notification Title"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="text"
                required
                placeholder="Message"
                value={notifMsg}
                onChange={(e) => setNotifMsg(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="text"
                placeholder="Optional Button Label (e.g. View Signal)"
                value={notifBtnText}
                onChange={(e) => setNotifBtnText(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <input
                type="text"
                placeholder="Optional Button URL (e.g. /index.html#signals)"
                value={notifBtnUrl}
                onChange={(e) => setNotifBtnUrl(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
              />
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold"
                >
                  Send Apple Broadcast Popup
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {allNotifs.map((n) => (
                <div
                  key={n.id}
                  className="apple-surface rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="text-xs">
                    <p className="text-sm font-semibold text-[#F5F5F7]">
                      {n.title} · <span className="text-[#8E8E93]">Target: {n.targetUid}</span>
                    </p>
                    <p className="text-[#A1A1AA]">{n.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateDoc(doc(db, 'notifications', n.id), {
                          active: !n.active,
                          updatedAt: serverTimestamp(),
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        n.active
                          ? 'bg-[#30D158]/20 text-[#30D158]'
                          : 'bg-white/10 text-[#A1A1AA]'
                      }`}
                    >
                      {n.active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'notifications', n.id))}
                      className="p-2 rounded-lg text-[#FF453A] hover:bg-[#FF453A]/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 10. STATISTICS */}
        {activeTab === 'statistics' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Visitor &amp; Academy Analytics</h1>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">Today</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F5F7]">
                  {visitorStats.todayCount.toLocaleString()}
                </p>
              </div>
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">This Week</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F5F7]">
                  {visitorStats.weekCount.toLocaleString()}
                </p>
              </div>
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">This Month</p>
                <p className="mt-2 text-2xl font-semibold text-[#E5C76B]">
                  {visitorStats.monthCount.toLocaleString()}
                </p>
              </div>
              <div className="apple-surface rounded-2xl p-5">
                <p className="text-xs font-sans text-[#A1A1AA]">Total Unique Visits</p>
                <p className="mt-2 text-2xl font-semibold text-[#30D158]">
                  {visitorStats.totalCount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 11. SETTINGS */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-8 max-w-4xl">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Academy Configuration</h1>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B]"
              >
                Save All Settings
              </button>
            </div>

            {/* Brand & Statistics */}
            <section className="apple-surface rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold">Branding &amp; Pip Convention</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Website Name</label>
                  <input
                    type="text"
                    value={draftSettings.siteName}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, siteName: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Win Rate Display</label>
                  <input
                    type="text"
                    value={draftSettings.winRate}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, winRate: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">
                    XAUUSD Pip Multiplier (e.g. 10 =&gt; $10 move = 100 pips)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={draftSettings.pipMultiplier}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        pipMultiplier: Number(e.target.value) || 10,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Logo URL / Upload</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftSettings.logoUrl}
                      onChange={(e) =>
                        setDraftSettings({ ...draftSettings, logoUrl: e.target.value })
                      }
                      className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                    />
                    <label className="px-3 py-2 rounded-xl bg-white/10 text-xs font-semibold cursor-pointer inline-flex items-center">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            handleStorageUpload(f, 'brand', (url) =>
                              setDraftSettings((s) => ({ ...s, logoUrl: url }))
                            );
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Hero Subtitle</label>
                <input
                  type="text"
                  value={draftSettings.heroSubtitle}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, heroSubtitle: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Website / MSNR Overview</label>
                <textarea
                  rows={3}
                  value={draftSettings.msnrDescription}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, msnrDescription: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
              </div>
            </section>

            {/* YouTube Channel & Gate */}
            <section className="apple-surface rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">YouTube Channel &amp; Subscriber Gate</h2>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draftSettings.youtubeGateEnabled}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        youtubeGateEnabled: e.target.checked,
                      })
                    }
                  />
                  <span>Enable YouTube Subscription Gate</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">YouTube Channel ID</label>
                  <input
                    type="text"
                    placeholder="UC..."
                    value={draftSettings.youtubeChannelId}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, youtubeChannelId: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">YouTube Channel URL</label>
                  <input
                    type="url"
                    value={draftSettings.youtubeChannelUrl}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, youtubeChannelUrl: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">
                    Fallback Subscriber Count
                  </label>
                  <input
                    type="text"
                    value={draftSettings.subscriberCountFallback}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        subscriberCountFallback: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
              </div>
            </section>

            {/* VIP Payment Methods (Exness, Binance Pay, Option 3) */}
            <section className="apple-surface rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold">VIP Joining &amp; Payment Configuration</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Exness Referral URL</label>
                  <input
                    type="url"
                    value={draftSettings.exnessReferralUrl}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, exnessReferralUrl: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">
                    Minimum Exness Deposit ($)
                  </label>
                  <input
                    type="number"
                    value={draftSettings.exnessMinDeposit}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        exnessMinDeposit: Number(e.target.value) || 30,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Binance Pay ID</label>
                  <input
                    type="text"
                    value={draftSettings.binancePayId}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, binancePayId: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">
                    Monthly VIP Price ($)
                  </label>
                  <input
                    type="number"
                    value={draftSettings.vipMonthlyPrice}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        vipMonthlyPrice: Number(e.target.value) || 15,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Binance QR Image</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftSettings.binanceQrUrl}
                      onChange={(e) =>
                        setDraftSettings({ ...draftSettings, binanceQrUrl: e.target.value })
                      }
                      className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                    />
                    <label className="px-3 py-2 rounded-xl bg-white/10 text-xs font-semibold cursor-pointer">
                      QR Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            handleStorageUpload(f, 'binance', (url) =>
                              setDraftSettings((s) => ({ ...s, binanceQrUrl: url }))
                            );
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1">Binance Logo Image</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftSettings.binanceLogoUrl}
                      onChange={(e) =>
                        setDraftSettings({ ...draftSettings, binanceLogoUrl: e.target.value })
                      }
                      className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                    />
                    <label className="px-3 py-2 rounded-xl bg-white/10 text-xs font-semibold cursor-pointer">
                      Logo Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            handleStorageUpload(f, 'binance', (url) =>
                              setDraftSettings((s) => ({ ...s, binanceLogoUrl: url }))
                            );
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Option 3 — Custom VIP Method</h3>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draftSettings.thirdMethodEnabled}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          thirdMethodEnabled: e.target.checked,
                        })
                      }
                    />
                    <span>Active</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Title"
                    value={draftSettings.thirdMethodTitle}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, thirdMethodTitle: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Price Label"
                    value={draftSettings.thirdMethodPrice}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, thirdMethodPrice: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Payment Method"
                    value={draftSettings.thirdMethodPayment}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, thirdMethodPayment: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Required Field Prompt"
                  value={draftSettings.thirdMethodFields}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, thirdMethodFields: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <textarea
                  rows={2}
                  placeholder="Instructions"
                  value={draftSettings.thirdMethodInstructions}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      thirdMethodInstructions: e.target.value,
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
              </div>
            </section>

            {/* Google Sheets & Contact */}
            <section className="apple-surface rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold">Google Sheets Sync &amp; Contact Links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Google Spreadsheet ID (Optional OAuth v4 Sync)"
                  value={draftSettings.sheetsSpreadsheetId}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, sheetsSpreadsheetId: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono"
                />
                <input
                  type="text"
                  placeholder="Published Videos Sheet CSV URL"
                  value={draftSettings.sheetsVideosUrl}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, sheetsVideosUrl: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <input
                  type="text"
                  placeholder="Published Free PDFs Sheet CSV URL"
                  value={draftSettings.sheetsFreePdfsUrl}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, sheetsFreePdfsUrl: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <input
                  type="text"
                  placeholder="Published Paid PDFs Sheet CSV URL"
                  value={draftSettings.sheetsPaidPdfsUrl}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, sheetsPaidPdfsUrl: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <input
                  type="text"
                  placeholder="Telegram (@TradeWithAmithBot or https://t.me/...)"
                  value={draftSettings.telegramUrl}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, telegramUrl: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <input
                  type="email"
                  placeholder="Contact Email"
                  value={draftSettings.contactEmail}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, contactEmail: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <input
                  type="url"
                  placeholder="Social / Instagram URL"
                  value={draftSettings.instagramUrl}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, instagramUrl: e.target.value })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
                <input
                  type="text"
                  placeholder="30-Second Notification Message"
                  value={draftSettings.onboardingNotifMessage}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      onboardingNotifMessage: e.target.value,
                    })
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm"
                />
              </div>
            </section>
          </form>
        )}
      </main>

      {/* Confirmation Dialog for Destructive Actions */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm apple-window rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F7]">{confirmAction.title}</h3>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="text-[#8E8E93] hover:text-[#F5F5F7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
              {confirmAction.description}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-medium text-[#F5F5F7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmAction.onConfirm;
                  setConfirmAction(null);
                  await fn();
                }}
                className="px-4 py-2 rounded-xl bg-[#FF453A] text-white text-xs font-semibold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Settling Signal as CLOSED with Exact Realized Pips */}
      {closingSignalModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const sig = closingSignalModal.signal;
              const parsedPips = Number(closingSignalModal.pipsInput);
              const safePips = Number.isFinite(parsedPips) ? Math.round(parsedPips) : 0;
              setClosingSignalModal(null);
              await handleMarkSignalOutcome(sig, 'CLOSED', safePips);
            }}
            className="w-full max-w-sm apple-window rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F7]">
                Close Signal ({closingSignalModal.signal.currency} {closingSignalModal.signal.direction})
              </h3>
              <button
                type="button"
                onClick={() => setClosingSignalModal(null)}
                className="text-[#8E8E93] hover:text-[#F5F5F7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              Enter the exact realized pips for this closed trade (e.g. <span className="font-mono text-[#F5F5F7]">0</span> for breakeven, <span className="font-mono text-[#30D158]">45</span> for partial profit, or <span className="font-mono text-[#FF453A]">-20</span> for manual stop).
            </p>
            <div>
              <label className="block text-[11px] font-medium text-[#A1A1AA] mb-1">
                Realized Pips
              </label>
              <input
                type="number"
                step="1"
                required
                value={closingSignalModal.pipsInput}
                onChange={(e) =>
                  setClosingSignalModal({
                    ...closingSignalModal,
                    pipsInput: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/15 text-sm font-mono tabular-nums text-[#F5F5F7]"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setClosingSignalModal(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-medium text-[#F5F5F7]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold"
              >
                Save Closed Pips
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
