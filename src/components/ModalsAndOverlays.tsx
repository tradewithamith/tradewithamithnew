import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Mail,
  Send,
  Share,
  Smartphone,
  X,
  Youtube,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { formatTelegramHandle, normalizeTelegramUrl } from '../lib/integrations';
import { subscribeUserToBackgroundPush } from '../lib/pushNotifications';
import { BinanceQrDisplay, ResilientImage } from './ResilientImage';

export const VipJoinModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { settings, user, profile, submitVipRequest } = useAcademy();
  const [selectedOption, setSelectedOption] = useState<'EXNESS' | 'BINANCE' | 'CUSTOM'>('EXNESS');

  const [name, setName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [exnessId, setExnessId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [customDetails, setCustomDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(profile?.name || user?.displayName || '');
      setTelegram(profile?.telegram || '');
      setStatusMsg(null);
    }
  }, [isOpen, profile, user]);

  if (!isOpen) return null;

  const copyBinanceId = () => {
    navigator.clipboard?.writeText(settings.binancePayId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || telegram.trim().length < 2) {
      setStatusMsg({ type: 'err', text: 'Please enter your Name and Telegram Number.' });
      return;
    }
    if (selectedOption === 'EXNESS' && exnessId.trim().length < 3) {
      setStatusMsg({ type: 'err', text: 'Please enter your Exness Account / Partner ID.' });
      return;
    }
    if (selectedOption === 'BINANCE' && transactionId.trim().length < 3) {
      setStatusMsg({ type: 'err', text: 'Please enter your Binance Pay Transaction ID.' });
      return;
    }
    if (selectedOption === 'CUSTOM' && customDetails.trim().length < 3) {
      setStatusMsg({ type: 'err', text: `Please complete: ${settings.thirdMethodFields}` });
      return;
    }

    setBusy(true);
    setStatusMsg(null);
    try {
      await submitVipRequest({
        name,
        telegram,
        method: selectedOption,
        exnessId: selectedOption === 'EXNESS' ? exnessId : '',
        transactionId: selectedOption === 'BINANCE' ? transactionId : '',
        customDetails: selectedOption === 'CUSTOM' ? customDetails : '',
      });
      setStatusMsg({
        type: 'ok',
        text:
          selectedOption === 'EXNESS'
            ? 'Verification submitted (PENDING). Signal details remain locked until Admin manually verifies and approves your Exness account.'
            : selectedOption === 'BINANCE'
            ? 'Payment submitted (PENDING). Signal details remain locked until Admin manually verifies and approves your transaction.'
            : 'Access request submitted (PENDING). Signal details remain locked until Admin manually verifies and approves your request.',
      });
      setExnessId('');
      setTransactionId('');
      setCustomDetails('');
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Submission failed. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Join VIP Signals"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-3xl apple-window rounded-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Window Bar */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Join VIP Signals</h2>
            <p className="text-xs text-[#A1A1AA]">
              Manual verification by Trade With Amith · Instant XAUUSD terminal unlock on approval
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close VIP modal"
            className="p-2 rounded-lg text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Option Selector Tabs */}
          <div
            className={`grid grid-cols-1 ${
              settings.thirdMethodEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            } gap-3`}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedOption('EXNESS');
                setStatusMsg(null);
              }}
              className={`p-4 rounded-xl text-left border transition-colors ${
                selectedOption === 'EXNESS'
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F5F5F7]'
                  : 'apple-surface text-[#A1A1AA] hover:text-[#F5F5F7]'
              }`}
            >
              <p className="text-[11px] font-medium text-[#D4AF37]">OPTION 1 · EXNESS</p>
              <p className="mt-1 text-sm font-semibold text-[#F5F5F7]">LIFETIME VIP ACCESS</p>
              <p className="mt-0.5 text-xs font-mono tabular-nums text-[#A1A1AA]">
                Min. ${settings.exnessMinDeposit} Deposit
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedOption('BINANCE');
                setStatusMsg(null);
              }}
              className={`p-4 rounded-xl text-left border transition-colors ${
                selectedOption === 'BINANCE'
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F5F5F7]'
                  : 'apple-surface text-[#A1A1AA] hover:text-[#F5F5F7]'
              }`}
            >
              <p className="text-[11px] font-medium text-[#D4AF37]">OPTION 2 · BINANCE PAY</p>
              <p className="mt-1 text-sm font-semibold text-[#F5F5F7]">VIP MONTHLY ACCESS</p>
              <p className="mt-0.5 text-xs font-mono tabular-nums text-[#A1A1AA]">
                ${settings.vipMonthlyPrice} / Month
              </p>
            </button>

            {settings.thirdMethodEnabled && (
              <button
                type="button"
                onClick={() => {
                  setSelectedOption('CUSTOM');
                  setStatusMsg(null);
                }}
                className={`p-4 rounded-xl text-left border transition-colors ${
                  selectedOption === 'CUSTOM'
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F5F5F7]'
                    : 'apple-surface text-[#A1A1AA] hover:text-[#F5F5F7]'
                }`}
              >
                <p className="text-[11px] font-medium text-[#D4AF37]">
                  OPTION 3 · {settings.thirdMethodPayment}
                </p>
                <p className="mt-1 text-sm font-semibold text-[#F5F5F7] truncate">
                  {settings.thirdMethodTitle}
                </p>
                <p className="mt-0.5 text-xs font-mono tabular-nums text-[#A1A1AA]">
                  {settings.thirdMethodPrice}
                </p>
              </button>
            )}
          </div>

          {/* Selected Option Instructions + Form */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-5 apple-surface rounded-2xl p-5 space-y-4">
              {selectedOption === 'EXNESS' && (
                <>
                  <h3 className="text-base font-semibold text-[#F5F5F7]">LIFETIME VIP ACCESS</h3>
                  <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                    Create an Exness account using our official partner link and deposit a minimum
                    of <strong className="text-[#F5F5F7]">${settings.exnessMinDeposit}</strong>.
                    After manual verification, receive lifetime VIP access.
                  </p>
                  <a
                    href={settings.exnessReferralUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-[#E5C76B] inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Open Exness Partner Link</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}

              {selectedOption === 'BINANCE' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-[#F5F5F7]">VIP MONTHLY ACCESS</h3>
                      <p className="text-xs font-mono tabular-nums text-[#E5C76B]">
                        ${settings.vipMonthlyPrice} / Month · 30 Days From Approval
                      </p>
                    </div>
                    {settings.binanceLogoUrl && (
                      <ResilientImage
                        src={settings.binanceLogoUrl}
                        alt="Binance Pay"
                        className="w-8 h-8 rounded-lg object-contain"
                      />
                    )}
                  </div>

                  <BinanceQrDisplay
                    qrUrl={settings.binanceQrUrl}
                    binancePayId={settings.binancePayId}
                  />

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#8E8E93]">Binance Pay ID</p>
                      <p className="font-mono tabular-nums text-sm font-semibold text-[#F5F5F7]">
                        {settings.binancePayId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={copyBinanceId}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-xs text-[#F5F5F7] inline-flex items-center gap-1.5"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#30D158]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {selectedOption === 'CUSTOM' && (
                <>
                  <h3 className="text-base font-semibold text-[#F5F5F7]">
                    {settings.thirdMethodTitle}
                  </h3>
                  <p className="text-xs font-mono tabular-nums text-[#E5C76B]">
                    {settings.thirdMethodPrice} · {settings.thirdMethodPayment}
                  </p>
                  <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                    {settings.thirdMethodDescription}
                  </p>
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs text-[#D1D1D6] leading-relaxed">
                    {settings.thirdMethodInstructions}
                  </div>
                </>
              )}

              <div className="pt-2 border-t border-white/[0.07] space-y-2">
                <a
                  href={normalizeTelegramUrl(settings.telegramUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-medium text-[#A1A1AA] hover:text-[#E5C76B] transition-colors"
                >
                  <Send className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span className="truncate">
                    Verification Support: {formatTelegramHandle(settings.telegramUrl)}
                  </span>
                </a>
                <a
                  href={`mailto:${settings.contactEmail}`}
                  className="flex items-center gap-2 text-xs font-medium text-[#A1A1AA] hover:text-[#E5C76B] transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-[#E5C76B] shrink-0" />
                  <span className="truncate">{settings.contactEmail}</span>
                </a>
              </div>
            </div>

            {/* Verification Submission Form */}
            <form onSubmit={handleSubmit} className="md:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#D1D1D6] mb-1.5">Name</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {selectedOption === 'EXNESS' && (
                <div>
                  <label className="block text-xs font-medium text-[#D1D1D6] mb-1.5">
                    Exness ID
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={exnessId}
                    onChange={(e) => setExnessId(e.target.value)}
                    placeholder="Your Exness trading account or client ID"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              {selectedOption === 'BINANCE' && (
                <div>
                  <label className="block text-xs font-medium text-[#D1D1D6] mb-1.5">
                    Transaction ID
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Binance Pay Order / Transaction ID"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              {selectedOption === 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-medium text-[#D1D1D6] mb-1.5">
                    {settings.thirdMethodFields || 'Reference Details'}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    value={customDetails}
                    onChange={(e) => setCustomDetails(e.target.value)}
                    placeholder="Enter your payment hash or reference"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#D1D1D6] mb-1.5">
                  Telegram Number
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="+94 7X XXX XXXX or @username"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {statusMsg && (
                <div
                  className={`p-3.5 rounded-xl text-xs leading-relaxed ${
                    statusMsg.type === 'ok'
                      ? 'bg-[#30D158]/15 text-[#30D158]'
                      : 'bg-[#FF453A]/15 text-[#FF453A]'
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] disabled:opacity-50 transition-colors"
              >
                {busy
                  ? 'Submitting...'
                  : selectedOption === 'EXNESS'
                  ? 'SUBMIT FOR VERIFICATION'
                  : 'SUBMIT PAYMENT'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export const InstallAppModal: React.FC<{
  isOpen: boolean;
  initialTab: 'apple' | 'android';
  onClose: () => void;
}> = ({ isOpen, initialTab, onClose }) => {
  const { settings } = useAcademy();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [tab, setTab] = useState<'apple' | 'android' | 'desktop'>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${settings.siteName || 'Trade With Amith'} App`}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg apple-window rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <ResilientImage
              src={settings.logoUrl}
              alt={settings.siteName || 'Trade With Amith'}
              className="w-9 h-9 rounded-xl object-cover border border-white/15"
            />
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F7]">
                Install {settings.siteName || 'Trade With Amith'}
              </h3>
              <p className="text-xs text-[#A1A1AA]">Standalone Home Screen &amp; Desktop App</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setTab('apple')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'apple' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
              }`}
            >
              iPhone / iPad
            </button>
            <button
              type="button"
              onClick={() => setTab('android')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'android'
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
              }`}
            >
              Android
            </button>
            <button
              type="button"
              onClick={() => setTab('desktop')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'desktop'
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
              }`}
            >
              Mac / Desktop
            </button>
          </div>

          {tab === 'apple' && (
            <div className="apple-surface rounded-xl p-5 space-y-3 text-sm text-[#D1D1D6]">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-semibold">
                <Share className="w-4 h-4 text-[#D4AF37]" />
                <span>Install on iPhone or iPad (Safari)</span>
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-[#A1A1AA] list-decimal list-inside">
                <li>
                  Open this website in <strong className="text-[#F5F5F7]">Safari</strong>.
                </li>
                <li>
                  Tap the <strong className="text-[#F5F5F7]">Share</strong> icon in the bottom
                  toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-[#F5F5F7]">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-[#F5F5F7]">Add</strong> to launch{' '}
                  {settings.siteName || 'Trade With Amith'} in full-screen standalone mode.
                </li>
              </ol>
            </div>
          )}

          {tab === 'android' && (
            <div className="apple-surface rounded-xl p-5 space-y-3 text-sm text-[#D1D1D6]">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-semibold">
                <Smartphone className="w-4 h-4 text-[#D4AF37]" />
                <span>Install on Android (Chrome)</span>
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-[#A1A1AA] list-decimal list-inside">
                <li>
                  Open this website in <strong className="text-[#F5F5F7]">Google Chrome</strong>.
                </li>
                <li>
                  Tap the three-dot menu in the top-right corner.
                </li>
                <li>
                  Select <strong className="text-[#F5F5F7]">Install App</strong> or{' '}
                  <strong className="text-[#F5F5F7]">Add to Home Screen</strong>.
                </li>
              </ol>
            </div>
          )}

          {tab === 'desktop' && (
            <div className="apple-surface rounded-xl p-5 space-y-3 text-sm text-[#D1D1D6]">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-semibold">
                <Laptop className="w-4 h-4 text-[#D4AF37]" />
                <span>Install on macOS or Windows</span>
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-[#A1A1AA] list-decimal list-inside">
                <li>
                  In Chrome or Edge, click the <strong className="text-[#F5F5F7]">Install</strong>{' '}
                  icon on the right side of the address bar.
                </li>
                <li>
                  In Safari on macOS Sonoma+, click{' '}
                  <strong className="text-[#F5F5F7]">File → Add to Dock</strong>.
                </li>
              </ol>
            </div>
          )}

          {isInstalled ? (
            <p className="text-xs text-center text-[#30D158] font-medium">
              {settings.siteName || 'Trade With Amith'} is already installed on this device.
            </p>
          ) : (
            isInstallable && (
              <button
                type="button"
                onClick={install}
                className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Install App Direct Now</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export const YoutubeGateOverlay: React.FC = () => {
  const {
    settings,
    gateVerified,
    gateBusy,
    gateMessage,
    verifySubscriberGate,
    bypassGateForSession,
  } = useAcademy();
  const [apiLimitedNotice, setApiLimitedNotice] = useState<string | null>(null);
  const [subscribedClicked, setSubscribedClicked] = useState(false);

  if (!settings.youtubeGateEnabled || gateVerified) {
    return null;
  }

  const handleVerify = async () => {
    setApiLimitedNotice(null);
    try {
      const res = await verifySubscriberGate();
      if (res.status === 'API_LIMITED') {
        setApiLimitedNotice(res.message);
      }
    } catch {
      setApiLimitedNotice(
        'YouTube API OAuth verification requires either adding your email under Test Users or publishing the OAuth Consent Screen in Google Cloud Console.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="YouTube Subscriber Verification Gate"
      className="fixed inset-0 z-50 bg-[#070709]/92 backdrop-blur-2xl flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md apple-window rounded-3xl p-7 sm:p-8 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden border border-white/15 shadow-xl">
          <ResilientImage
            src={settings.logoUrl}
            alt={settings.siteName}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-[#D4AF37]">MSNR ACADEMY</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F5F5F7]">
            TRADE WITH AMITH
          </h1>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Please subscribe to our YouTube channel to continue.
          </p>
        </div>

        <div className="space-y-3">
          <a
            href={settings.youtubeChannelUrl || 'https://www.youtube.com/@tradewithamithYT'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setSubscribedClicked(true)}
            className="w-full py-3 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-[#F5F5F7] inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Youtube className="w-4 h-4 text-[#FF453A]" />
            <span>SUBSCRIBE ON YOUTUBE</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#A1A1AA]" />
          </a>

          <button
            type="button"
            disabled={gateBusy}
            onClick={handleVerify}
            className="w-full py-3 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#E5C76B] text-[#09090B] text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {gateBusy
              ? 'VERIFYING VIA YOUTUBE API...'
              : subscribedClicked
              ? 'I SUBSCRIBED · VERIFY SUBSCRIPTION'
              : 'VERIFY SUBSCRIPTION'}
          </button>
        </div>

        {gateMessage && !apiLimitedNotice && (
          <div className="p-3 rounded-xl bg-[#FF453A]/15 text-[#FF453A] text-xs font-medium">
            {gateMessage}
          </div>
        )}

        {apiLimitedNotice && (
          <div className="p-3.5 rounded-xl bg-white/[0.05] border border-white/10 text-left space-y-2.5">
            <p className="text-xs text-[#D1D1D6] leading-relaxed">{apiLimitedNotice}</p>
            <button
              type="button"
              onClick={bypassGateForSession}
              className="w-full py-2 rounded-lg bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C76B] text-xs font-semibold transition-colors"
            >
              Enter Academy Workspace
            </button>
          </div>
        )}

        <p className="text-[11px] text-[#8E8E93] leading-relaxed">
          Subscribe to @tradewithamithYT first, then verify your subscription via Google Sign-In.
        </p>
      </div>
    </div>
  );
};

export const NotificationCenter: React.FC = () => {
  const { user, settings, notifications, gateVerified } = useAcademy();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('msnr_dismissed_notifs') || '{}');
    } catch {
      return {};
    }
  });

  // 30-Second Onboarding Notification Popup (Respects permanent ALLOW in localStorage)
  useEffect(() => {
    if (!settings.onboardingNotifEnabled) return;
    if (localStorage.getItem('msnr_notif_permission_granted') === 'true') return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      localStorage.setItem('msnr_notif_permission_granted', 'true');
      return;
    }

    const timer = window.setTimeout(() => {
      setShowOnboarding(true);
    }, 30_000);

    return () => window.clearTimeout(timer);
  }, [settings.onboardingNotifEnabled, gateVerified]);

  const handleAllowOnboarding = async () => {
    try {
      await subscribeUserToBackgroundPush(user?.uid || null);
      localStorage.setItem('msnr_notif_permission_granted', 'true');
    } catch {
      localStorage.setItem('msnr_notif_permission_granted', 'true');
    }
    setShowOnboarding(false);
  };

  const handleDismissBroadcast = (id: string) => {
    const next = { ...dismissedIds, [id]: true };
    setDismissedIds(next);
    localStorage.setItem('msnr_dismissed_notifs', JSON.stringify(next));
  };

  const visibleBroadcast = notifications.find((n) => n.active && !dismissedIds[n.id]);

  if (!showOnboarding && !visibleBroadcast) return null;

  return (
    <div className="fixed top-16 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm space-y-3 pointer-events-none">
      {showOnboarding && (
        <div
          role="status"
          className="pointer-events-auto apple-window rounded-2xl p-4 flex items-start gap-3.5 shadow-2xl"
        >
          <ResilientImage
            src={settings.logoUrl}
            alt={settings.siteName}
            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#F5F5F7] truncate">
                {settings.onboardingNotifTitle}
              </p>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                aria-label="Dismiss notification"
                className="text-[#8E8E93] hover:text-[#F5F5F7]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-[#A1A1AA] leading-relaxed">
              {settings.onboardingNotifMessage}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAllowOnboarding}
                className="px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-semibold hover:bg-[#E5C76B] transition-colors"
              >
                ALLOW
              </button>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-[#A1A1AA] hover:text-[#F5F5F7] text-[11px] font-medium transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {visibleBroadcast && (
        <div
          role="status"
          className="pointer-events-auto apple-window rounded-2xl p-4 flex items-start gap-3.5 shadow-2xl"
        >
          <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-[#E5C76B]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#F5F5F7] truncate">
                {visibleBroadcast.title}
              </p>
              <button
                type="button"
                onClick={() => handleDismissBroadcast(visibleBroadcast.id)}
                aria-label="Close alert"
                className="text-[#8E8E93] hover:text-[#F5F5F7]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-[#A1A1AA] leading-relaxed">
              {visibleBroadcast.message}
            </p>
            {visibleBroadcast.buttonText && visibleBroadcast.buttonUrl && (
              <a
                href={visibleBroadcast.buttonUrl}
                onClick={() => handleDismissBroadcast(visibleBroadcast.id)}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-semibold hover:bg-[#E5C76B]"
              >
                <span>{visibleBroadcast.buttonText}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
