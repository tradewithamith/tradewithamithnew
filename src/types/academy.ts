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

export interface TradingPerformanceStats {
  totalSignals: number;
  activeSignals: number;
  closedSignals: number;
  wins: number;
  losses: number;
  breakeven: number;
  totalNetPips: number;
  winRatePercent: number;
  winRateFormatted: string;
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
  winRate: '0%',
  subscriberCountFallback: '',
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
  thirdMethodEnabled: false,
  thirdMethodTitle: '',
  thirdMethodDescription: '',
  thirdMethodPrice: '',
  thirdMethodPayment: '',
  thirdMethodInstructions: '',
  thirdMethodFields: '',
  telegramUrl: 'https://t.me/TradeWithAmithBot',
  contactEmail: 'tradewithamithyt@gmail.com',
  instagramUrl: 'https://www.youtube.com/@tradewithamithYT',
  sheetsVideosUrl: '',
  sheetsFreePdfsUrl: '',
  sheetsPaidPdfsUrl: '',
  sheetsSpreadsheetId: '',
  onboardingNotifEnabled: true,
  onboardingNotifTitle: 'Trade With Amith',
  onboardingNotifMessage: 'Welcome to MSNR Academy. Enable instant alerts for XAUUSD VIP execution updates.',
};

export const LEGACY_DEMO_SIGNAL_IDS: ReadonlySet<string> = new Set([
  'sig_xau_active_01',
  'sig_xau_active_02',
  'sig_xau_hist_01',
  'sig_xau_hist_02',
  'sig_xau_hist_03',
  'sig_xau_hist_04',
]);

export const LEGACY_DEMO_VIDEO_IDS: ReadonlySet<string> = new Set([
  'vid_msnr_01',
  'vid_msnr_02',
  'vid_msnr_03',
]);

export const LEGACY_DEMO_FREE_BOOK_IDS: ReadonlySet<string> = new Set([
  'free_msnr_foundations',
  'free_xauusd_checklist',
]);

export const LEGACY_DEMO_PAID_BOOK_IDS: ReadonlySet<string> = new Set([
  'paid_msnr_playbook',
  'paid_xauusd_atlas',
]);

// Zero demo content — only real admin-published items are displayed on the website.
export const STARTER_SIGNALS_PUBLIC: VipSignalPublic[] = [];
export const STARTER_VIDEOS: AcademyVideo[] = [];
export const STARTER_FREE_BOOKS: FreeBook[] = [];
export const STARTER_PAID_BOOKS: PaidBookPublic[] = [];
