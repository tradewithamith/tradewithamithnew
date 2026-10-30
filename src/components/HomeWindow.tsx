import React, { useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Laptop,
  LogOut,
  Mail,
  Send,
  Smartphone,
  Youtube,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { parseFirebaseAuthError } from '../lib/firebase';
import { formatTelegramHandle, normalizeTelegramUrl } from '../lib/integrations';
import { ASSETS, type WindowId } from '../types/academy';
import { GoogleSignInButton, ResilientImage } from './ResilientImage';

interface HomeWindowProps {
  onOpenVipJoin: () => void;
  onSelectWindow: (id: WindowId) => void;
  onOpenInstallModal: (initialTab: 'apple' | 'android') => void;
}

export const HomeWindow: React.FC<HomeWindowProps> = ({
  onOpenVipJoin,
  onSelectWindow,
  onOpenInstallModal,
}) => {
  const {
    settings,
    subscriberCount,
    tradingStats,
    visitorStats,
    user,
    vipGrant,
    isVipActive,
    isAdmin,
    login,
    logout,
  } = useAcademy();

  const [tilt, setTilt] = useState({ rx: 6, ry: -8 });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginErrMsg, setLoginErrMsg] = useState<string | null>(null);

  const handleMemberSignIn = async () => {
    setLoginBusy(true);
    setLoginErrMsg(null);
    try {
      await login();
    } catch (err) {
      const parsed = parseFirebaseAuthError(err);
      setLoginErrMsg(
        parsed.isUnauthorizedDomain
          ? `${parsed.message} Add "${parsed.hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`
          : parsed.message
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: Number((-ny * 16).toFixed(2)), ry: Number((nx * 18).toFixed(2)) });
  };

  const resetStage = () => setTilt({ rx: 6, ry: -8 });

  return (
    <div className="p-5 sm:p-8 lg:p-10 space-y-12">
      {/* 1. Apple Keynote Hero Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-medium tracking-wide text-[#D4AF37]">
              Malaysian Support &amp; Resistance · Institutional XAUUSD Terminal
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#F5F5F7] leading-[1.08] max-w-xl">
              {settings.siteName}
            </h1>
            <p className="text-base sm:text-lg font-medium text-[#E5E5EA] max-w-xl">
              {settings.heroSubtitle}
            </p>
            <p className="text-sm sm:text-[15px] leading-relaxed text-[#A1A1AA] max-w-2xl">
              {settings.msnrDescription}
            </p>
          </div>

          <div className="space-y-5 pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenVipJoin}
                className="px-6 py-3 rounded-xl bg-[#D4AF37] text-[#09090B] text-sm font-semibold hover:bg-[#E5C76B] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <span>JOIN VIP SIGNALS</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onSelectWindow('signals')}
                className="px-5 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-sm font-medium text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
              >
                View XAUUSD Signals
              </button>
            </div>

            {/* Apple & Android App Install Triggers */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onOpenInstallModal('apple')}
                className="px-3.5 py-2 rounded-lg bg-white/[0.035] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-[#D1D1D6] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Laptop className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>APPLE INSTALL</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenInstallModal('android')}
                className="px-3.5 py-2 rounded-lg bg-white/[0.035] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-[#D1D1D6] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>ANDROID INSTALL</span>
              </button>
            </div>
          </div>
        </div>

        {/* Visual Showcase Panel */}
        <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-white/[0.08] min-h-[260px]">
          <ResilientImage
            src={ASSETS.heroTerminal}
            alt="Spatial XAUUSD Gold Support and Resistance Terminal"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070709]/90 via-[#070709]/35 to-transparent flex flex-col justify-end p-6">
            <div className="text-xs text-[#D1D1D6] flex items-center gap-2">
              <span>XAUUSD Gold</span>
              <span aria-hidden="true">·</span>
              <span>H4 &amp; Daily Roadblocks</span>
              <span aria-hidden="true">·</span>
              <span>VIP Execution</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-[#F5F5F7]">
              Clean structural price levels without retail indicator noise.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Home Page Live Performance Strip (100% Real Trading Results — Zero Fake Stats) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onSelectWindow('signals')}
          className="apple-surface rounded-2xl p-5 space-y-1.5 text-left hover:border-[#D4AF37]/45 transition-colors"
        >
          <p className="text-xs font-medium text-[#A1A1AA]">Win Rate</p>
          <p className="text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-[#E5C76B]">
            {tradingStats.winRateFormatted}
          </p>
          <p className="text-xs font-mono tabular-nums text-[#8E8E93]">
            {tradingStats.closedSignals === 0
              ? tradingStats.activeSignals > 0
                ? `${tradingStats.activeSignals} Active · 0 Closed`
                : '0 Closed Trades'
              : `${tradingStats.wins}W · ${tradingStats.losses}L${
                  tradingStats.breakeven > 0 ? ` · ${tradingStats.breakeven}BE` : ''
                } (${tradingStats.closedSignals} Closed)`}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelectWindow('signals')}
          className="apple-surface rounded-2xl p-5 space-y-1.5 text-left hover:border-[#D4AF37]/45 transition-colors"
        >
          <p className="text-xs font-medium text-[#A1A1AA]">Realized Pips</p>
          <p
            className={`text-2xl sm:text-3xl font-semibold font-mono tabular-nums ${
              tradingStats.totalNetPips > 0
                ? 'text-[#30D158]'
                : tradingStats.totalNetPips < 0
                ? 'text-[#FF453A]'
                : 'text-[#F5F5F7]'
            }`}
          >
            {tradingStats.totalNetPips === 0
              ? '0 PIPS'
              : `${tradingStats.totalNetPips > 0 ? '+' : ''}${tradingStats.totalNetPips.toLocaleString()} PIPS`}
          </p>
          <p className="text-xs font-mono tabular-nums text-[#8E8E93]">
            {tradingStats.totalSignals} Published {tradingStats.totalSignals === 1 ? 'Signal' : 'Signals'}
          </p>
        </button>

        <a
          href={settings.youtubeChannelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="apple-surface rounded-2xl p-5 space-y-1.5 hover:border-[#D4AF37]/45 transition-colors group block"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[#A1A1AA]">YouTube Academy</p>
            <ExternalLink className="w-3.5 h-3.5 text-[#8E8E93] group-hover:text-[#D4AF37] transition-colors" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-[#F5F5F7] truncate">
            {subscriberCount || '@tradewithamithYT'}
          </p>
          <p className="text-xs text-[#8E8E93]">
            {subscriberCount ? 'Live Channel Subscribers' : 'Official YouTube Channel'}
          </p>
        </a>

        <div className="apple-surface rounded-2xl p-5 space-y-1.5">
          <p className="text-xs font-medium text-[#A1A1AA]">XAUUSD · MSNR</p>
          <p className="text-xl sm:text-2xl font-semibold text-[#F5F5F7] leading-snug">
            Malaysian S&amp;R
          </p>
          <p className="text-xs text-[#8E8E93]">Spot Gold Precision</p>
        </div>
      </div>

      {/* 3. Interactive 3D Spatial Emblem Centerpiece */}
      <div
        onMouseMove={handleStageMove}
        onMouseLeave={resetStage}
        className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#101116] via-[#090A0E] to-[#0D0E13] px-6 py-12 sm:py-16 overflow-hidden flex flex-col items-center text-center"
      >
        {/* Subtle Ambient Light & Floating Dust Motes */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[220px] rounded-full bg-[#D4AF37]/10 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-10 left-[22%] w-1 h-1 rounded-full bg-[#E5C76B]/45"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-12 right-[24%] w-1.5 h-1.5 rounded-full bg-white/25"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-[16%] w-1 h-1 rounded-full bg-[#D4AF37]/40"
        />

        <div style={{ perspective: '1100px' }} className="mb-7">
          <div
            style={{
              transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
              transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className="emblem-3d-motion relative w-36 h-36 sm:w-44 sm:h-44 rounded-[30px] p-1.5 bg-gradient-to-br from-white/20 via-[#D4AF37]/30 to-white/5 shadow-[0_24px_60px_rgba(0,0,0,0.75)]"
          >
            <div className="w-full h-full rounded-[25px] overflow-hidden bg-[#09090B] relative">
              <ResilientImage
                src={settings.logoUrl}
                alt={`${settings.siteName} 3D Emblem`}
                className="w-full h-full object-cover"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20"
              />
            </div>
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7] max-w-lg">
          Engineered Around Institutional Storyline &amp; Unmitigated Price Levels
        </h2>
        <p className="mt-3 text-sm sm:text-[15px] text-[#A1A1AA] max-w-2xl leading-relaxed">
          Malaysian Support &amp; Resistance isolates fresh line-chart A and V turning points, Open-Close
          Gaps, and higher-timeframe roadblocks—giving XAUUSD traders objective entry, invalidation,
          and target precision.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => onSelectWindow('market-analysis')}
            className="px-4 py-2.5 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/35 text-xs font-semibold text-[#E5C76B] transition-colors whitespace-nowrap"
          >
            Watch Market Analysis
          </button>
          <button
            type="button"
            onClick={() => onSelectWindow('videos')}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-xs font-semibold text-[#F5F5F7] transition-colors whitespace-nowrap"
          >
            Explore Video Masterclasses
          </button>
          <button
            type="button"
            onClick={() => onSelectWindow('free-pdfs')}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-xs font-semibold text-[#F5F5F7] transition-colors whitespace-nowrap"
          >
            Download Free MSNR Guides
          </button>
          <button
            type="button"
            onClick={() => onSelectWindow('paid-pdfs')}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-xs font-semibold text-[#F5F5F7] transition-colors whitespace-nowrap"
          >
            Open Digital Bookstore
          </button>
        </div>
      </div>

      {/* 4. Three Editorial MSNR Methodology Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="apple-surface rounded-2xl p-6 space-y-2.5">
          <h3 className="text-base font-semibold text-[#F5F5F7]">
            01. Fresh Unmitigated SNR
          </h3>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Focus strictly on untouched line-chart A/V levels and OC-Gap zones on Daily and H4 charts
            before dropping to execution timeframes.
          </p>
        </div>

        <div className="apple-surface rounded-2xl p-6 space-y-2.5">
          <h3 className="text-base font-semibold text-[#F5F5F7]">
            02. Multi-Timeframe Storyline
          </h3>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Map exactly where XAUUSD rejected from and the next higher-timeframe roadblock it is
            traveling toward before committing capital.
          </p>
        </div>

        <div className="apple-surface rounded-2xl p-6 space-y-2.5">
          <h3 className="text-base font-semibold text-[#F5F5F7]">
            03. Verified VIP Execution
          </h3>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Every XAUUSD VIP alert includes exact Entry, TP, Extra TP runner target, SL invalidation,
            and confirmation notes.
          </p>
        </div>
      </div>

      {/* 5. Account Status, Visitor Metrics & Secondary Legal Navigation */}
      <footer className="pt-6 border-t border-white/[0.08] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 text-xs text-[#A1A1AA]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-[#8E8E93]">TODAY</span>
            <span className="text-[#F5F5F7] font-semibold">
              {visitorStats.todayCount.toLocaleString()} Visitors
            </span>
          </div>
          <span aria-hidden="true" className="text-white/20">·</span>
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-[#8E8E93]">THIS MONTH</span>
            <span className="text-[#F5F5F7] font-semibold">
              {visitorStats.monthCount.toLocaleString()} Visitors
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {user ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[#D1D1D6]">
                {user.email}
                {' · '}
                <strong className="text-[#E5C76B]">
                  {isAdmin
                    ? 'Administrator'
                    : isVipActive
                    ? `${vipGrant?.vipType} VIP`
                    : 'Standard Member'}
                </strong>
              </span>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1 text-[#A1A1AA] hover:text-[#F5F5F7] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-1.5">
              <GoogleSignInButton
                onClick={handleMemberSignIn}
                disabled={loginBusy}
                label={loginBusy ? 'Signing In...' : 'Member Sign In'}
              />
              {loginErrMsg && (
                <p className="text-[11px] text-[#FF453A] max-w-sm leading-snug">{loginErrMsg}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <a
            href={settings.youtubeChannelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#D1D1D6] hover:text-[#F5F5F7] transition-colors whitespace-nowrap"
          >
            <Youtube className="w-3.5 h-3.5 text-[#FF453A]" />
            <span>YouTube</span>
          </a>
          <a
            href={normalizeTelegramUrl(settings.telegramUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#D1D1D6] hover:text-[#F5F5F7] transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{formatTelegramHandle(settings.telegramUrl)}</span>
          </a>
          <a
            href={`mailto:${settings.contactEmail}`}
            className="inline-flex items-center gap-1.5 text-[#D1D1D6] hover:text-[#F5F5F7] transition-colors whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5 text-[#E5C76B]" />
            <span>{settings.contactEmail}</span>
          </a>
          <span aria-hidden="true" className="text-white/15">·</span>
          <a href="./about.html" className="hover:text-[#F5F5F7] transition-colors whitespace-nowrap">
            About
          </a>
          <a href="./contact.html" className="hover:text-[#F5F5F7] transition-colors whitespace-nowrap">
            Contact
          </a>
          <a href="./terms.html" className="hover:text-[#F5F5F7] transition-colors whitespace-nowrap">
            Terms
          </a>
          <a href="./privacy.html" className="hover:text-[#F5F5F7] transition-colors whitespace-nowrap">
            Privacy
          </a>
          <a href="#admin" className="hover:text-[#D4AF37] transition-colors whitespace-nowrap">
            Admin
          </a>
        </div>
      </footer>
    </div>
  );
};
