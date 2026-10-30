import heroTerminalImg from '../assets/images/hero_msnr_terminal_1793368431080.jpg';
import bookMsnrImg from '../assets/images/book_cover_msnr_mastery_1793368431512.jpg';
import bookXauusdImg from '../assets/images/book_cover_xauusd_blueprint_1793368432859.jpg';
import videoThumbImg from '../assets/images/video_thumb_xauusd_structure_1793368433221.jpg';

const BASE_URL = import.meta.env.BASE_URL || '/';

export const ASSETS = {
  brandEmblem: `${BASE_URL}assets/aistudio/logo_9bf96027.JPG`,
  binanceQr: `${BASE_URL}assets/aistudio/binance_qr_c6b76463.jpg`,
  heroTerminal: heroTerminalImg,
  bookMsnr: bookMsnrImg,
  bookXauusd: bookXauusdImg,
  videoThumb: videoThumbImg,
};

export type WindowId = 'home' | 'signals' | 'market-analysis' | 'videos' | 'free-pdfs' | 'paid-pdfs';

export type StaticPageId = 'workspace' | 'terms' | 'privacy' | 'about' | 'contact' | 'admin';

export type SignalDirection = 'BUY' | 'SELL';
export type SignalOrderType = 'LIMIT' | 'MARKET';
export type SignalResult = 'ACTIVE' | 'TP HIT' | 'SL HIT' | 'CLOSED';

export type VipType = 'NONE' | 'LIFETIME' | 'MONTHLY' | 'CUSTOM';
export type VipStatus = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type ApprovalStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type VipCategory = 'NONE' | 'EXNESS' | 'BINANCE' | 'CUSTOM';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  telegram: string;
  youtubeVerified: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VipGrant {
  userId: string;
  vipStatus: VipStatus;
  vipType: VipType;
  approvalStatus: ApprovalStatus;
  vipCategory?: VipCategory;
  vipExpiryMs: number;
  updatedAt?: unknown;
}

export interface VipSignalPublic {
  id: string;
  date: string;
  currency: 'XAUUSD';
  direction: SignalDirection;
  orderType: SignalOrderType;
  result: SignalResult;
  pips: number;
  createdAtMs: number;
}

export interface VipSignalPrivate {
  id: string;
  currency: 'XAUUSD';
  entry: number;
  tp: number;
  extraTp: number;
  sl: number;
  note: string;
}

export interface MergedSignal extends VipSignalPublic {
  entry?: number;
  tp?: number;
  extraTp?: number;
  sl?: number;
  note?: string;
}

export interface VipRequestItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  telegram: string;
  method: 'EXNESS' | 'BINANCE' | 'CUSTOM';
  exnessId: string;
  transactionId: string;
  customDetails: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAtMs: number;
}

export interface AcademyVideo {
  id: string;
  title: string;
  youtubeUrl: string;
  thumbnail: string;
  description: string;
  date: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAtMs: number;
}

export interface MarketAnalysisVideo {
  id: string;
  title: string;
  youtubeUrl: string;
  thumbnail: string;
  description: string;
  date: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAtMs: number;
}

export type VideoReactionType = 'LIKE' | 'DISLIKE';

export interface MarketAnalysisReaction {
  id: string;
  videoId: string;
  userId: string;
  reaction: VideoReactionType;
  status: 'ACTIVE';
  createdAtMs: number;
}

export interface MarketAnalysisReactionSummary {
  likes: number;
  dislikes: number;
  userReaction: VideoReactionType | null;
}

export interface FreeBook {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  pdfUrl: string;
  views: number;
  downloads: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAtMs: number;
}

export interface PaidBookPublic {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  price: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAtMs: number;
}

export interface BookPurchaseItem {
  id: string;
  userId: string;
  userEmail: string;
  bookId: string;
  bookName: string;
  price: number;
  name: string;
  telegram: string;
  transactionId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAtMs: number;
}

export interface BookAccessItem {
  id: string;
  userId: string;
  bookId: string;
  status: 'APPROVED' | 'REVOKED';
}

export interface AppNotification {
  id: string;
  targetUid: string;
  title: string;
  message: string;
  icon: string;
  buttonText: string;
  buttonUrl: string;
  active: boolean;
  createdAtMs: number;
}

export interface VisitorStatistics {
  dayKey: string;
  weekKey: string;
  monthKey: string;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  totalCount: number;
  lastSessionId: string;
}

export interface AcademySettings {
  siteName: string;
  logoUrl: string;
  heroSubtitle: string;
  msnrDescription: string;
  winRate: string;
  subscriberCountFallback: string;
  youtubeChannelId: string;
  youtubeChannelUrl: string;
  youtubeGateEnabled: boolean;
  pipMultiplier: number;
  binancePayId: string;
  binanceQrUrl: string;
  binanceLogoUrl: string;
  vipMonthlyPrice: number;
  exnessReferralUrl: string;
  exnessMinDeposit: number;
  thirdMethodEnabled: boolean;
  thirdMethodTitle: string;
  thirdMethodDescription: string;
  thirdMethodPrice: string;
  thirdMethodPayment: string;
  thirdMethodInstructions: string;
  thirdMethodFields: string;
  telegramUrl: string;
  contactEmail: string;
  instagramUrl: string;
  sheetsVideosUrl: string;
  sheetsFreePdfsUrl: string;
  sheetsPaidPdfsUrl: string;
  sheetsSpreadsheetId: string;
  onboardingNotifEnabled: boolean;
  onboardingNotifTitle: string;
  onboardingNotifMessage: string;
}

export const DEFAULT_SETTINGS: AcademySettings = {
  siteName: 'Trade With Amith',
  logoUrl: ASSETS.brandEmblem,
  heroSubtitle: 'Malaysian Support & Resistance · MSNR Trading Education & XAUUSD Analysis',
  msnrDescription:
    'Precision institutional gold trading built on unmitigated Malaysian Support & Resistance (MSNR) roadblocks, multi-timeframe storyline alignment, and disciplined London and New York execution.',
  winRate: '89.4%',
  subscriberCountFallback: '336',
  youtubeChannelId: 'UCKwo4dtX8sFrJcW5I5tZ0cw',
  youtubeChannelUrl: 'https://www.youtube.com/@tradewithamithYT',
  youtubeGateEnabled: true,
  pipMultiplier: 10,
  binancePayId: '973369286',
  binanceQrUrl: ASSETS.binanceQr,
  binanceLogoUrl: '',
  vipMonthlyPrice: 15,
  exnessReferralUrl: 'https://one.exnessonelink.com/a/56mms8g0qe',
  exnessMinDeposit: 30,
  thirdMethodEnabled: true,
  thirdMethodTitle: 'USDT TRC20 / Bank Transfer',
  thirdMethodDescription:
    'Direct quarterly or custom VIP enrollment via USDT (TRC20) or local bank transfer with manual admin verification.',
  thirdMethodPrice: '$39 / Quarter',
  thirdMethodPayment: 'USDT TRC20 Network',
  thirdMethodInstructions:
    'Contact our verification desk via Telegram (@TradeWithAmithBot) for the active settlement address, then submit your transfer hash and Telegram handle below.',
  thirdMethodFields: 'TxHash or Transfer Reference ID',
  telegramUrl: 'https://t.me/TradeWithAmithBot',
  contactEmail: 'emoneywithamith@gmail.com',
  instagramUrl: 'https://www.youtube.com/@tradewithamithYT',
  sheetsVideosUrl: '',
  sheetsFreePdfsUrl: '',
  sheetsPaidPdfsUrl: '',
  sheetsSpreadsheetId: '',
  onboardingNotifEnabled: true,
  onboardingNotifTitle: 'Trade With Amith',
  onboardingNotifMessage: 'Welcome to MSNR Academy. Enable instant alerts for XAUUSD VIP execution updates.',
};

const now = Date.now();
const dayMs = 86_400_000;

export const LEGACY_DEMO_SIGNAL_IDS: ReadonlySet<string> = new Set([
  'sig_xau_active_01',
  'sig_xau_active_02',
  'sig_xau_hist_01',
  'sig_xau_hist_02',
  'sig_xau_hist_03',
  'sig_xau_hist_04',
]);

// No fake or auto-generated signals — pips are ONLY counted from real admin-published signals.
export const STARTER_SIGNALS_PUBLIC: VipSignalPublic[] = [];

export const STARTER_VIDEOS: AcademyVideo[] = [
  {
    id: 'vid_msnr_01',
    title: 'MSNR Masterclass: Drawing Fresh H4 & Daily Support & Resistance',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnail: ASSETS.videoThumb,
    description:
      'Step-by-step breakdown of line-chart A and V reversal levels, OC-Gap zones, and filtering out tested retail levels on XAUUSD.',
    date: new Date(now - 2 * dayMs).toISOString().slice(0, 10),
    status: 'ACTIVE',
    createdAtMs: now - 2 * dayMs,
  },
  {
    id: 'vid_msnr_02',
    title: 'XAUUSD Storyline Alignment: Monthly Roadblocks to M15 Entry',
    youtubeUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    thumbnail: ASSETS.heroTerminal,
    description:
      'How institutional gold orderflow respects higher-timeframe Malaysian SNR roadblocks and confirms reversals during the London-New York overlap.',
    date: new Date(now - 5 * dayMs).toISOString().slice(0, 10),
    status: 'ACTIVE',
    createdAtMs: now - 5 * dayMs,
  },
  {
    id: 'vid_msnr_03',
    title: 'Avoiding Gold Manipulation Sweeps Before High-Impact USD Releases',
    youtubeUrl: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    thumbnail: ASSETS.videoThumb,
    description:
      'Identifying engineered inducement wicks into fresh MSNR Gap levels and waiting for body-close confirmation before placing risk.',
    date: new Date(now - 9 * dayMs).toISOString().slice(0, 10),
    status: 'ACTIVE',
    createdAtMs: now - 9 * dayMs,
  },
];

export const STARTER_FREE_BOOKS: FreeBook[] = [
  {
    id: 'free_msnr_foundations',
    name: 'MSNR Foundations: Fresh Unmitigated Levels',
    description:
      'Essential field manual covering classical Malaysian A/V levels, OC-Gaps, and clean chart markup rules for XAUUSD beginners and intermediates.',
    coverUrl: '',
    pdfUrl: '/api/sample-pdf/msnr-foundations',
    views: 1420,
    downloads: 864,
    status: 'ACTIVE',
    createdAtMs: now - 10 * dayMs,
  },
  {
    id: 'free_xauusd_checklist',
    name: 'XAUUSD London & NY Session Pre-Trade Checklist',
    description:
      'Concise one-page institutional execution rubric verifying HTF roadblocks, session liquidity sweeps, and pip risk before placing orders.',
    coverUrl: '',
    pdfUrl: '/api/sample-pdf/xauusd-session-checklist',
    views: 980,
    downloads: 612,
    status: 'ACTIVE',
    createdAtMs: now - 7 * dayMs,
  },
];

export const STARTER_PAID_BOOKS: PaidBookPublic[] = [
  {
    id: 'paid_msnr_playbook',
    name: 'The Complete MSNR Institutional Playbook',
    description:
      'Comprehensive monograph covering multi-timeframe storyline construction, Miss Levels, RBS/SBR flips, and precision M5/M15 entry triggers.',
    coverUrl: ASSETS.bookMsnr,
    price: 29,
    status: 'ACTIVE',
    createdAtMs: now - 14 * dayMs,
  },
  {
    id: 'paid_xauusd_atlas',
    name: 'XAUUSD Gold Liquidity & Precision Entry Atlas',
    description:
      'Annotated gold case-study compendium dissecting high-ADR reversals, inducement traps, and runner management using MSNR structure.',
    coverUrl: ASSETS.bookXauusd,
    price: 35,
    status: 'ACTIVE',
    createdAtMs: now - 8 * dayMs,
  },
];
