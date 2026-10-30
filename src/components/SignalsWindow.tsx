import React, { useMemo, useState } from 'react';
import { Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { calculateSignalPips, calculateTargetPips } from '../lib/firebase';
import type { MergedSignal } from '../types/academy';

interface SignalsWindowProps {
  onOpenVipJoin: () => void;
}

export const SignalsWindow: React.FC<SignalsWindowProps> = ({ onOpenVipJoin }) => {
  const { signals, isVipActive, settings, vipGrant, isAdmin } = useAcademy();
  const [tab, setTab] = useState<'active' | 'history'>('active');

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthIso = todayIso.slice(0, 7);
  const sevenDaysAgoMs = Date.now() - 7 * 86_400_000;

  // Realized pips come strictly from settled admin-published signals (TP HIT, SL HIT, CLOSED).
  // Active unsettled signals never add to realized pip statistics.
  const enrichedSignals = useMemo(() => {
    return signals.map((sig) => {
      let realizedPips = 0;
      if (sig.result !== 'ACTIVE') {
        if (sig.result === 'CLOSED') {
          realizedPips = Number(sig.pips) || 0;
        } else if (sig.entry !== undefined && sig.tp !== undefined && sig.sl !== undefined) {
          realizedPips = calculateSignalPips({
            direction: sig.direction,
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
        sig.result === 'ACTIVE' && sig.entry !== undefined && sig.tp !== undefined
          ? calculateTargetPips({
              direction: sig.direction,
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
    const isBuy = sig.direction === 'BUY';
    const hasPrivateDetails = isVipActive && sig.entry !== undefined;

    return (
      <article
        key={sig.id}
        className="relative apple-surface rounded-2xl p-6 overflow-hidden flex flex-col justify-between gap-5"
      >
        {/* Top Metadata Row (Zero-Pill Unboxed Typography) */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#A1A1AA] font-mono tabular-nums">
              <span>{sig.date}</span>
              <span aria-hidden="true">·</span>
              <span>{sig.orderType}</span>
              <span aria-hidden="true">·</span>
              <span>{sig.result}</span>
            </div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
                {sig.currency}
              </h3>
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
            </div>
          </div>

          <div className="text-right font-mono tabular-nums">
            {sig.result === 'ACTIVE' ? (
              <span className="text-xs sm:text-sm font-semibold text-[#E5C76B]">
                {hasPrivateDetails && sig.targetPips !== 0
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
        <div className="relative">
          <div
            className={`grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums text-sm ${
              !hasPrivateDetails ? 'blur-md select-none pointer-events-none opacity-45' : ''
            }`}
            aria-hidden={!hasPrivateDetails}
          >
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
          <div
            className={`mt-3 text-xs text-[#A1A1AA] leading-relaxed ${
              !hasPrivateDetails ? 'blur-md select-none pointer-events-none opacity-40' : ''
            }`}
          >
            <span className="text-[#D1D1D6] font-medium">Note: </span>
            {hasPrivateDetails
              ? sig.note || 'Follow standard MSNR body-close confirmation rules.'
              : 'VIP execution confirmation criteria hidden for public visitors.'}
          </div>

          {/* Public Non-VIP Frosted Glass Lock Overlay */}
          {!hasPrivateDetails && (
            <div className="absolute inset-0 rounded-xl apple-glass flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <Lock className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[#F5F5F7]">
                    VIP ACCESS REQUIRED
                  </p>
                  <p className="text-xs text-[#A1A1AA]">
                    Unlock live Entry, TP, Extra TP, SL, and MSNR confirmation notes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenVipJoin}
                className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors whitespace-nowrap shrink-0"
              >
                JOIN VIP
              </button>
            </div>
          )}
        </div>
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
                : `Monthly VIP Active · Expires ${new Date(vipGrant?.vipExpiryMs || 0).toLocaleDateString()}`}
            </span>
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

      {/* Automatic Pip Calculator Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 font-mono tabular-nums">
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

        <div className="apple-surface rounded-xl p-4 col-span-2 lg:col-span-1">
          <p className="text-xs font-sans text-[#A1A1AA]">Loss Pips</p>
          <p className="mt-1.5 text-lg font-semibold text-[#FF453A]">
            {pipSummary.lossPips > 0 ? `-${pipSummary.lossPips.toLocaleString()} PIPS` : '0 PIPS'}
          </p>
        </div>
      </div>

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
                  const unlocked = isVipActive && sig.entry !== undefined;
                  return (
                    <tr key={sig.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-5 text-xs text-[#D1D1D6]">{sig.date}</td>
                      <td className="py-3.5 px-4 font-sans font-semibold text-[#F5F5F7]">
                        {sig.currency}
                      </td>
                      <td
                        className={`py-3.5 px-4 font-sans font-semibold ${
                          sig.direction === 'BUY' ? 'text-[#30D158]' : 'text-[#FF453A]'
                        }`}
                      >
                        {sig.direction}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#F5F5F7]">
                        {unlocked ? sig.entry : <span className="blur-xs select-none">4140</span>}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#30D158]">
                        {unlocked ? sig.tp : <span className="blur-xs select-none">4152</span>}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#FF453A]">
                        {unlocked ? sig.sl : <span className="blur-xs select-none">4131</span>}
                      </td>
                      <td
                        className={`py-3.5 px-4 font-sans text-xs font-semibold ${
                          sig.result === 'TP HIT'
                            ? 'text-[#30D158]'
                            : sig.result === 'SL HIT'
                            ? 'text-[#FF453A]'
                            : 'text-[#D1D1D6]'
                        }`}
                      >
                        {sig.result}
                      </td>
                      <td
                        className={`py-3.5 px-5 text-right font-semibold ${
                          sig.displayPips >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                        }`}
                      >
                        {formatSignedPips(sig.displayPips)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!isVipActive && (
              <div className="px-5 py-3.5 border-t border-white/[0.08] flex items-center justify-between gap-4 bg-white/[0.02]">
                <span className="text-xs text-[#A1A1AA]">
                  Historical Entry, TP, and SL prices are blurred for public visitors.
                </span>
                <button
                  type="button"
                  onClick={onOpenVipJoin}
                  className="px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors whitespace-nowrap"
                >
                  JOIN VIP
                </button>
              </div>
            )}
          </div>

          <div className="md:hidden grid grid-cols-1 gap-4">
            {historySignals.map(renderSignalCard)}
          </div>
        </div>
      )}
    </div>
  );
};
