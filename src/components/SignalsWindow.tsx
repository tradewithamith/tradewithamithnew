import React, { useMemo, useState } from 'react';
import { Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { calculateSignalPips, calculateTargetPips } from '../lib/firebase';
import type { MergedSignal } from '../types/academy';

interface SignalsWindowProps {
  onOpenVipJoin: () => void;
}

export const SignalsWindow: React.FC<SignalsWindowProps> = ({ onOpenVipJoin }) => {
  const {
    signals,
    tradingStats,
    isVipActive,
    hasPendingVipRequest,
    settings,
    vipGrant,
    isAdmin,
  } = useAcademy();
  const [tab, setTab] = useState<'active' | 'history'>('active');

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthIso = todayIso.slice(0, 7);
  const sevenDaysAgoMs = Date.now() - 7 * 86_400_000;

  // Realized pips come strictly from settled admin-published signals (TP HIT, SL HIT, CLOSED).
  // Active unsettled signals never add to realized pip statistics.
  const enrichedSignals = useMemo(() => {
    return signals.map((sig) => {
      const validDir = sig.direction === 'BUY' || sig.direction === 'SELL' ? sig.direction : null;
      let realizedPips = 0;
      if (sig.result !== 'ACTIVE') {
        if (sig.result === 'CLOSED') {
          realizedPips = Number(sig.pips) || 0;
        } else if (
          validDir &&
          sig.entry !== undefined &&
          sig.tp !== undefined &&
          sig.sl !== undefined
        ) {
          realizedPips = calculateSignalPips({
            direction: validDir,
            entry: sig.entry,
            tp: sig.tp,
            sl: sig.sl,
            result: sig.result,
            pipMultiplier: settings.pipMultiplier,
          });
        } else {
          realizedPips = Number(sig.pips) || 0;
        }
      }

      const targetPips =
        sig.result === 'ACTIVE' && validDir && sig.entry !== undefined && sig.tp !== undefined
          ? calculateTargetPips({
              direction: validDir,
              entry: sig.entry,
              tp: sig.tp,
              pipMultiplier: settings.pipMultiplier,
            })
          : 0;

      return { ...sig, displayPips: realizedPips, targetPips };
    });
  }, [signals, settings.pipMultiplier]);

  const activeSignals = useMemo(
    () => enrichedSignals.filter((s) => s.result === 'ACTIVE'),
    [enrichedSignals]
  );

  const historySignals = useMemo(
    () =>
      enrichedSignals.filter(
        (s) => s.result !== 'ACTIVE' && s.createdAtMs >= sevenDaysAgoMs
      ),
    [enrichedSignals, sevenDaysAgoMs]
  );

  const pipSummary = useMemo(() => {
    const completed = enrichedSignals.filter((s) => s.result !== 'ACTIVE');
    let dailyTotal = 0;
    let monthlyTotal = 0;
    let overallTotal = 0;
    let profitPips = 0;
    let lossPips = 0;

    for (const s of completed) {
      const p = s.displayPips || 0;
      overallTotal += p;
      if (p > 0) profitPips += p;
      if (p < 0) lossPips += Math.abs(p);
      if (s.date === todayIso) dailyTotal += p;
      if (s.date.startsWith(currentMonthIso)) monthlyTotal += p;
    }

    return { dailyTotal, monthlyTotal, overallTotal, profitPips, lossPips };
  }, [enrichedSignals, todayIso, currentMonthIso]);

  const formatSignedPips = (val: number) => {
    if (val === 0) return '0 PIPS';
    return `${val > 0 ? '+' : ''}${val.toLocaleString()} PIPS`;
  };

  const renderSignalCard = (sig: MergedSignal & { displayPips: number; targetPips: number }) => {
    const hasPrivateDetails =
      isVipActive && sig.entry !== undefined && sig.direction !== 'LOCKED';
    const isBuy = hasPrivateDetails && sig.direction === 'BUY';

    return (
      <article
        key={sig.id}
        className="relative apple-surface rounded-2xl p-6 overflow-hidden flex flex-col justify-between gap-5"
      >
        <div
          className={`flex flex-col justify-between gap-5 ${
            !hasPrivateDetails ? 'blur-md select-none pointer-events-none opacity-35' : ''
          }`}
          aria-hidden={!hasPrivateDetails}
        >
          {/* Top Metadata Row (Zero-Pill Unboxed Typography) */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-[#A1A1AA] font-mono tabular-nums">
                <span>{hasPrivateDetails ? sig.date : '••••-••-••'}</span>
                <span aria-hidden="true">·</span>
                <span>{hasPrivateDetails ? sig.orderType : '•••••'}</span>
                <span aria-hidden="true">·</span>
                <span>{hasPrivateDetails ? sig.result : '••••••'}</span>
              </div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
                  {hasPrivateDetails ? sig.currency : '••••••'}
                </h3>
                {hasPrivateDetails ? (
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-semibold ${
                      isBuy ? 'text-[#30D158]' : 'text-[#FF453A]'
                    }`}
                  >
                    {isBuy ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {sig.direction}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#A1A1AA]">
                    ••••
                  </span>
                )}
              </div>
            </div>

            <div className="text-right font-mono tabular-nums">
              {!hasPrivateDetails ? (
                <span className="text-xs sm:text-sm font-semibold text-[#A1A1AA]">
                  •••• PIPS
                </span>
              ) : sig.result === 'ACTIVE' ? (
                <span className="text-xs sm:text-sm font-semibold text-[#E5C76B]">
                  {sig.targetPips !== 0
                    ? `Target ${formatSignedPips(sig.targetPips)}`
                    : 'LIVE · RUNNING'}
                </span>
              ) : (
                <span
                  className={`text-sm font-semibold ${
                    sig.displayPips > 0
                      ? 'text-[#30D158]'
                      : sig.displayPips < 0
                      ? 'text-[#FF453A]'
                      : 'text-[#D1D1D6]'
                  }`}
                >
                  {formatSignedPips(sig.displayPips)}
                </span>
              )}
            </div>
          </div>

          {/* Execution Levels Area */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums text-sm">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[11px] font-sans text-[#8E8E93]">Entry Price</p>
                <p className="mt-1 font-semibold text-[#F5F5F7]">
                  {hasPrivateDetails ? sig.entry : '█████'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[11px] font-sans text-[#8E8E93]">TP</p>
                <p className="mt-1 font-semibold text-[#30D158]">
                  {hasPrivateDetails ? sig.tp : '█████'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[11px] font-sans text-[#8E8E93]">Extra TP</p>
                <p className="mt-1 font-semibold text-[#E5C76B]">
                  {hasPrivateDetails ? sig.extraTp : '█████'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[11px] font-sans text-[#8E8E93]">SL</p>
                <p className="mt-1 font-semibold text-[#FF453A]">
                  {hasPrivateDetails ? sig.sl : '█████'}
                </p>
              </div>
            </div>

            {/* Trade Note */}
            <div className="mt-3 text-xs text-[#A1A1AA] leading-relaxed">
              <span className="text-[#D1D1D6] font-medium">Note: </span>
              {hasPrivateDetails
                ? sig.note || 'Follow standard MSNR body-close confirmation rules.'
                : '████████████████████████████████████████████'}
            </div>
          </div>
        </div>

        {/* Full-Card Frosted Glass Lock Overlay Until Manual Admin Approval */}
        {!hasPrivateDetails && (
          <div className="absolute inset-0 z-10 rounded-2xl apple-glass flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-center gap-3.5 text-center sm:text-left">
              <Lock className="w-5 h-5 text-[#D4AF37] shrink-0" />
              <div>
                <p className="text-xs font-semibold tracking-wide text-[#F5F5F7]">
                  {hasPendingVipRequest
                    ? 'APPROVAL PENDING · SIGNALS LOCKED'
                    : 'VIP ACCESS REQUIRED'}
                </p>
                <p className="mt-0.5 text-xs text-[#A1A1AA] max-w-md">
                  {hasPendingVipRequest
                    ? 'Your access request is awaiting manual Admin verification. All signal details remain locked until approved.'
                    : 'Unlock live Entry, TP, Extra TP, SL, and MSNR confirmation notes after Admin approval.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenVipJoin}
              className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors whitespace-nowrap shrink-0"
            >
              {hasPendingVipRequest ? 'REQUEST PENDING' : 'JOIN VIP'}
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="p-5 sm:p-8 space-y-8">
      {/* Terminal Header & VIP Status */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#D4AF37]">
            XAUUSD Gold Execution Desk · Multiplier {settings.pipMultiplier} Pips / $1.00
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7]">
            VIP Signals &amp; Pip Performance
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {isVipActive ? (
            <span className="text-xs font-medium text-[#30D158]">
              {isAdmin
                ? 'Admin Full Access Active'
                : vipGrant?.vipType === 'LIFETIME'
                ? 'Lifetime VIP Active'
                : `${vipGrant?.vipType === 'CUSTOM' ? 'Verified' : 'Monthly'} VIP Active · Expires ${new Date(vipGrant?.vipExpiryMs || 0).toLocaleDateString()}`}
            </span>
          ) : hasPendingVipRequest ? (
            <button
              type="button"
              onClick={onOpenVipJoin}
              className="px-4 py-2 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/45 text-[#E5C76B] text-xs font-semibold hover:bg-[#D4AF37]/25 transition-colors whitespace-nowrap shrink-0"
            >
              Verification Pending · Signals Locked
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenVipJoin}
              className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors whitespace-nowrap shrink-0"
            >
              Unlock VIP Access
            </button>
          )}
        </div>
      </div>

      {/* Automatic Win Rate & Pip Calculator Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 font-mono tabular-nums">
        <div className="apple-surface rounded-xl p-4">
          <p className="text-xs font-sans text-[#A1A1AA]">Win Rate</p>
          <p className="mt-1.5 text-lg font-semibold text-[#E5C76B]">
            {tradingStats.winRateFormatted}
          </p>
          <p className="mt-0.5 text-[11px] text-[#8E8E93]">
            {tradingStats.closedSignals === 0
              ? '0 Closed'
              : `${tradingStats.wins}W · ${tradingStats.losses}L`}
          </p>
        </div>

        <div className="apple-surface rounded-xl p-4">
          <p className="text-xs font-sans text-[#A1A1AA]">Daily Pips</p>
          <p
            className={`mt-1.5 text-lg font-semibold ${
              pipSummary.dailyTotal > 0
                ? 'text-[#30D158]'
                : pipSummary.dailyTotal < 0
                ? 'text-[#FF453A]'
                : 'text-[#D1D1D6]'
            }`}
          >
            {formatSignedPips(pipSummary.dailyTotal)}
          </p>
        </div>

        <div className="apple-surface rounded-xl p-4">
          <p className="text-xs font-sans text-[#A1A1AA]">Monthly Pips</p>
          <p
            className={`mt-1.5 text-lg font-semibold ${
              pipSummary.monthlyTotal > 0
                ? 'text-[#30D158]'
                : pipSummary.monthlyTotal < 0
                ? 'text-[#FF453A]'
                : 'text-[#D1D1D6]'
            }`}
          >
            {formatSignedPips(pipSummary.monthlyTotal)}
          </p>
        </div>

        <div className="apple-surface rounded-xl p-4">
          <p className="text-xs font-sans text-[#A1A1AA]">Overall Total</p>
          <p
            className={`mt-1.5 text-lg font-semibold ${
              pipSummary.overallTotal > 0
                ? 'text-[#E5C76B]'
                : pipSummary.overallTotal < 0
                ? 'text-[#FF453A]'
                : 'text-[#D1D1D6]'
            }`}
          >
            {formatSignedPips(pipSummary.overallTotal)}
          </p>
        </div>

        <div className="apple-surface rounded-xl p-4">
          <p className="text-xs font-sans text-[#A1A1AA]">Profit Pips</p>
          <p className="mt-1.5 text-lg font-semibold text-[#30D158]">
            {pipSummary.profitPips > 0 ? `+${pipSummary.profitPips.toLocaleString()} PIPS` : '0 PIPS'}
          </p>
        </div>

        <div className="apple-surface rounded-xl p-4">
          <p className="text-xs font-sans text-[#A1A1AA]">Loss Pips</p>
          <p className="mt-1.5 text-lg font-semibold text-[#FF453A]">
            {pipSummary.lossPips > 0 ? `-${pipSummary.lossPips.toLocaleString()} PIPS` : '0 PIPS'}
          </p>
        </div>
      </div>

      {/* Entire Signals Section — Completely Blurred & Locked for Non-VIP Users */}
      {!isVipActive ? (
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0B0C10]/60">
          {/* Redacted & Heavily Blurred Placeholder Background (Zero Real Signal Data in DOM) */}
          <div
            aria-hidden="true"
            className="p-5 sm:p-6 space-y-6 blur-lg select-none pointer-events-none opacity-35"
          >
            <div className="inline-flex items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.08]">
              <span className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#D4AF37] text-[#09090B]">
                Active Signals (•)
              </span>
              <span className="px-4 py-1.5 rounded-lg text-xs font-semibold text-[#A1A1AA]">
                7-Day Signal History (•)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {[1, 2].map((idx) => (
                <div
                  key={idx}
                  className="apple-surface rounded-2xl p-6 flex flex-col justify-between gap-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-[#A1A1AA] font-mono">
                        <span>••••-••-••</span>
                        <span>·</span>
                        <span>•••••</span>
                        <span>·</span>
                        <span>••••••</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-semibold text-[#F5F5F7]">••••••</span>
                        <span className="text-sm font-semibold text-[#30D158]">••••</span>
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-mono font-semibold text-[#E5C76B]">
                      Target +••• PIPS
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-sm">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[11px] font-sans text-[#8E8E93]">Entry Price</p>
                      <p className="mt-1 font-semibold text-[#F5F5F7]">█████</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[11px] font-sans text-[#8E8E93]">TP</p>
                      <p className="mt-1 font-semibold text-[#30D158]">█████</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[11px] font-sans text-[#8E8E93]">Extra TP</p>
                      <p className="mt-1 font-semibold text-[#E5C76B]">█████</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[11px] font-sans text-[#8E8E93]">SL</p>
                      <p className="mt-1 font-semibold text-[#FF453A]">█████</p>
                    </div>
                  </div>

                  <div className="text-xs text-[#A1A1AA]">
                    <span className="text-[#D1D1D6] font-medium">Note: </span>
                    ████████████████████████████████████████████████████
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full-Section Frosted Glass VIP Lock Overlay */}
          <div className="absolute inset-0 z-10 backdrop-blur-md bg-[#070709]/65 flex items-center justify-center p-6">
            <div className="max-w-md w-full apple-surface rounded-2xl p-6 sm:p-8 text-center space-y-4 border border-[#D4AF37]/30 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold tracking-wider text-[#D4AF37]">
                  {hasPendingVipRequest
                    ? 'APPROVAL PENDING · SIGNALS LOCKED'
                    : 'VIP ACCESS REQUIRED'}
                </p>
                <h3 className="text-lg sm:text-xl font-semibold text-[#F5F5F7]">
                  {hasPendingVipRequest
                    ? 'Your VIP Request Is Awaiting Approval'
                    : 'Unlock Full XAUUSD VIP Signals'}
                </h3>
                <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                  {hasPendingVipRequest
                    ? 'All active signals, 7-day signal history, Entry, TP, Extra TP, SL, and confirmation notes remain blurred until your VIP request is manually verified and approved.'
                    : 'Active signals and 7-day execution history are exclusive to approved VIP members. Join VIP to unlock full real-time XAUUSD setups.'}
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onOpenVipJoin}
                  className="px-6 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs sm:text-sm font-semibold hover:bg-[#E5C76B] transition-colors"
                >
                  {hasPendingVipRequest ? 'VIEW PENDING REQUEST' : 'JOIN VIP ACCESS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Interactive Segmented Control: Active Signals vs 7-Day Signal History */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="inline-flex items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setTab('active')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'active'
                    ? 'bg-[#D4AF37] text-[#09090B]'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                }`}
              >
                Active Signals ({activeSignals.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('history')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'history'
                    ? 'bg-[#D4AF37] text-[#09090B]'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                }`}
              >
                7-Day Signal History ({historySignals.length})
              </button>
            </div>
          </div>

          {/* Signal List / History Table */}
          {tab === 'active' ? (
            activeSignals.length === 0 ? (
              <div className="apple-surface rounded-2xl p-10 text-center space-y-2">
                <p className="text-base font-medium text-[#F5F5F7]">No Active Signals Right Now</p>
                <p className="text-sm text-[#A1A1AA]">
                  Waiting for price to reach an unmitigated H4 or Daily XAUUSD MSNR roadblock.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">{activeSignals.map(renderSignalCard)}</div>
            )
          ) : historySignals.length === 0 ? (
            <div className="apple-surface rounded-2xl p-10 text-center space-y-2">
              <p className="text-base font-medium text-[#F5F5F7]">No Completed Signals in Last 7 Days</p>
              <p className="text-sm text-[#A1A1AA]">
                Completed TP HIT, SL HIT, and CLOSED signals from the past 7 days appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Desktop Structured History Table + Mobile Cards */}
              <div className="hidden md:block apple-surface rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-[#A1A1AA]">
                      <th className="py-3.5 px-5 font-medium">Date</th>
                      <th className="py-3.5 px-4 font-medium">Instrument</th>
                      <th className="py-3.5 px-4 font-medium">Direction</th>
                      <th className="py-3.5 px-4 font-medium text-right">Entry</th>
                      <th className="py-3.5 px-4 font-medium text-right">TP</th>
                      <th className="py-3.5 px-4 font-medium text-right">SL</th>
                      <th className="py-3.5 px-4 font-medium">Result</th>
                      <th className="py-3.5 px-5 font-medium text-right">Pips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums">
                    {historySignals.map((sig) => {
                      const unlocked =
                        isVipActive && sig.entry !== undefined && sig.direction !== 'LOCKED';
                      return (
                        <tr key={sig.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-5 text-xs text-[#D1D1D6]">
                            {unlocked ? (
                              sig.date
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">••••-••-••</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-sans font-semibold text-[#F5F5F7]">
                            {unlocked ? (
                              sig.currency
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">••••••</span>
                            )}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-sans font-semibold ${
                              !unlocked
                                ? 'text-[#A1A1AA]'
                                : sig.direction === 'BUY'
                                ? 'text-[#30D158]'
                                : 'text-[#FF453A]'
                            }`}
                          >
                            {unlocked ? (
                              sig.direction
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">••••</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#F5F5F7]">
                            {unlocked ? (
                              sig.entry
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">•••••</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#30D158]">
                            {unlocked ? (
                              sig.tp
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">•••••</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#FF453A]">
                            {unlocked ? (
                              sig.sl
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">•••••</span>
                            )}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-sans text-xs font-semibold ${
                              !unlocked
                                ? 'text-[#A1A1AA]'
                                : sig.result === 'TP HIT'
                                ? 'text-[#30D158]'
                                : sig.result === 'SL HIT'
                                ? 'text-[#FF453A]'
                                : 'text-[#D1D1D6]'
                            }`}
                          >
                            {unlocked ? (
                              sig.result
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">••••••</span>
                            )}
                          </td>
                          <td
                            className={`py-3.5 px-5 text-right font-semibold ${
                              !unlocked
                                ? 'text-[#A1A1AA]'
                                : sig.displayPips >= 0
                                ? 'text-[#30D158]'
                                : 'text-[#FF453A]'
                            }`}
                          >
                            {unlocked ? (
                              formatSignedPips(sig.displayPips)
                            ) : (
                              <span className="blur-sm select-none pointer-events-none">•••• PIPS</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden grid grid-cols-1 gap-4">
                {historySignals.map(renderSignalCard)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
