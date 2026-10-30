import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, Mail, MessageSquare, Send, Youtube } from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { formatTelegramHandle, normalizeTelegramUrl } from '../lib/integrations';
import type { StaticPageId } from '../types/academy';
import { AppleTopBar } from './AppleHeaderAndDock';
import { VipJoinModal } from './ModalsAndOverlays';
import { ResilientImage } from './ResilientImage';

export const StaticInfoPage: React.FC<{ page: Exclude<StaticPageId, 'workspace' | 'admin'> }> = ({
  page,
}) => {
  const { settings, tradingStats } = useAcademy();
  const [vipOpen, setVipOpen] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [inqName, setInqName] = useState('');
  const [inqEmail, setInqEmail] = useState('');
  const [inqMessage, setInqMessage] = useState('');

  return (
    <div className="min-h-screen bg-[#070709] text-[#F5F5F7] flex flex-col">
      <AppleTopBar
        activeWindow={null}
        isStaticPage={true}
        onSelectWindow={() => {}}
        onOpenVipJoin={() => setVipOpen(true)}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-6">
          <a
            href="./index.html"
            className="inline-flex items-center gap-2 text-xs font-medium text-[#A1A1AA] hover:text-[#F5F5F7] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Academy Workspace</span>
          </a>
        </div>

        <div className="apple-window rounded-3xl p-6 sm:p-10 space-y-8">
          {page === 'about' && (
            <>
              <div className="flex items-center gap-4">
                <ResilientImage
                  src={settings.logoUrl}
                  alt={settings.siteName}
                  className="w-14 h-14 rounded-2xl object-cover border border-white/15"
                />
                <div>
                  <p className="text-xs font-medium text-[#D4AF37]">MSNR ACADEMY</p>
                  <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#F5F5F7]">
                    About {settings.siteName}
                  </h1>
                </div>
              </div>

              <div className="space-y-4 text-sm sm:text-base text-[#D1D1D6] leading-relaxed">
                <p>{settings.msnrDescription}</p>
                <p>
                  Founded to strip away lagging retail indicators and subjective chart clutter,
                  <strong> Trade With Amith — MSNR Academy</strong> specializes exclusively in
                  Malaysian Support &amp; Resistance (MSNR) applied to spot Gold (XAUUSD).
                </p>
                <p>
                  Every lesson, PDF field guide, and VIP execution signal emphasizes higher-timeframe
                  storyline mapping, fresh unmitigated line-chart A/V levels, Open-Close Gaps, and
                  strict risk management.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="apple-surface rounded-2xl p-5">
                  <p className="text-xs text-[#8E8E93]">Core Methodology</p>
                  <p className="mt-1 text-base font-semibold text-[#F5F5F7]">Malaysian S&amp;R</p>
                </div>
                <div className="apple-surface rounded-2xl p-5">
                  <p className="text-xs text-[#8E8E93]">Focus Instrument</p>
                  <p className="mt-1 text-base font-semibold text-[#E5C76B]">XAUUSD Gold</p>
                </div>
                <div className="apple-surface rounded-2xl p-5">
                  <p className="text-xs text-[#8E8E93]">Live Win Rate</p>
                  <p className="mt-1 text-base font-semibold font-mono tabular-nums text-[#E5C76B]">
                    {tradingStats.winRateFormatted}
                  </p>
                  <p className="mt-0.5 text-[11px] font-mono tabular-nums text-[#8E8E93]">
                    {tradingStats.closedSignals === 0
                      ? '0 Closed Trades'
                      : `${tradingStats.wins}W · ${tradingStats.losses}L (${tradingStats.closedSignals} Closed)`}
                  </p>
                </div>
              </div>
            </>
          )}

          {page === 'contact' && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#D4AF37]">OFFICIAL CHANNELS</p>
                <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#F5F5F7]">
                  Contact {settings.siteName}
                </h1>
                <p className="text-sm text-[#A1A1AA]">
                  Reach our VIP verification desk, student support, or official social channels.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a
                  href={normalizeTelegramUrl(settings.telegramUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="apple-surface rounded-2xl p-5 flex items-center justify-between hover:border-[#D4AF37]/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <Send className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-sm font-semibold text-[#F5F5F7]">Telegram Desk</p>
                      <p className="text-xs text-[#A1A1AA] truncate max-w-[200px]">
                        {formatTelegramHandle(settings.telegramUrl)}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#8E8E93]" />
                </a>

                <a
                  href={settings.youtubeChannelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="apple-surface rounded-2xl p-5 flex items-center justify-between hover:border-[#D4AF37]/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <Youtube className="w-5 h-5 text-[#FF453A]" />
                    <div>
                      <p className="text-sm font-semibold text-[#F5F5F7]">YouTube Channel</p>
                      <p className="text-xs text-[#A1A1AA] truncate max-w-[200px]">
                        {settings.youtubeChannelUrl}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#8E8E93]" />
                </a>

                <a
                  href={`mailto:${settings.contactEmail}`}
                  className="apple-surface rounded-2xl p-5 flex items-center justify-between hover:border-[#D4AF37]/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <Mail className="w-5 h-5 text-[#E5C76B]" />
                    <div>
                      <p className="text-sm font-semibold text-[#F5F5F7]">Direct Email</p>
                      <p className="text-xs text-[#A1A1AA]">{settings.contactEmail}</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#8E8E93]" />
                </a>

                <a
                  href={settings.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="apple-surface rounded-2xl p-5 flex items-center justify-between hover:border-[#D4AF37]/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <MessageSquare className="w-5 h-5 text-[#D1D1D6]" />
                    <div>
                      <p className="text-sm font-semibold text-[#F5F5F7]">Social Community</p>
                      <p className="text-xs text-[#A1A1AA] truncate max-w-[200px]">
                        {settings.instagramUrl}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#8E8E93]" />
                </a>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const subject = encodeURIComponent(
                    `[${settings.siteName}] Inquiry from ${inqName.trim()}`
                  );
                  const body = encodeURIComponent(
                    `Name: ${inqName.trim()}\nEmail: ${inqEmail.trim()}\n\n${inqMessage.trim()}`
                  );
                  const mailLink = document.createElement('a');
                  mailLink.href = `mailto:${settings.contactEmail}?subject=${subject}&body=${body}`;
                  mailLink.click();
                  setContactSent(true);
                }}
                className="apple-surface rounded-2xl p-6 space-y-4"
              >
                <h2 className="text-base font-semibold text-[#F5F5F7]">Send Direct Inquiry</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    value={inqName}
                    onChange={(e) => setInqName(e.target.value)}
                    placeholder="Your Name"
                    className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                  <input
                    type="email"
                    required
                    value={inqEmail}
                    onChange={(e) => setInqEmail(e.target.value)}
                    placeholder="Email Address"
                    className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <textarea
                  rows={3}
                  required
                  value={inqMessage}
                  onChange={(e) => setInqMessage(e.target.value)}
                  placeholder="How can we help with VIP access, Exness verification, or MSNR study material?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                />
                {contactSent ? (
                  <p className="text-xs text-[#30D158] font-medium">
                    Your email client has been opened to message {settings.contactEmail}. For fastest verification response, you may also message our Telegram desk above.
                  </p>
                ) : (
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors"
                  >
                    Email {settings.contactEmail}
                  </button>
                )}
              </form>
            </>
          )}

          {page === 'terms' && (
            <div className="space-y-5 text-sm text-[#D1D1D6] leading-relaxed">
              <div>
                <p className="text-xs font-medium text-[#D4AF37]">LEGAL &amp; RISK DISCLOSURE</p>
                <h1 className="mt-1 text-2xl sm:text-4xl font-semibold tracking-tight text-[#F5F5F7]">
                  Terms of Service
                </h1>
              </div>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  1. Educational &amp; Analytical Nature
                </h2>
                <p className="text-[#A1A1AA]">
                  All MSNR market commentary, XAUUSD trade setups, videos, and digital publications
                  provided by {settings.siteName} are strictly for educational and analytical study.
                  Foreign exchange and spot gold trading carry significant risk of loss and are not
                  suitable for every investor.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  2. VIP Membership &amp; Manual Verification
                </h2>
                <p className="text-[#A1A1AA]">
                  Lifetime Exness VIP requests and Monthly Binance Pay subscriptions require manual
                  verification of submitted account IDs or transaction hashes. Monthly VIP grants
                  remain active for 30 calendar days from the timestamp of administrator approval.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  3. Individual Digital Book Licensing
                </h2>
                <p className="text-[#A1A1AA]">
                  Paid PDF monographs are licensed individually per approved book purchase for
                  personal study only. Redistribution, public link sharing, or unauthorized resale
                  results in immediate access revocation.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  4. Official Legal &amp; Support Contact
                </h2>
                <p className="text-[#A1A1AA]">
                  For membership verification or legal inquiries, contact{' '}
                  <a
                    href={`mailto:${settings.contactEmail}`}
                    className="text-[#E5C76B] hover:underline"
                  >
                    {settings.contactEmail}
                  </a>
                  .
                </p>
              </section>
            </div>
          )}

          {page === 'privacy' && (
            <div className="space-y-5 text-sm text-[#D1D1D6] leading-relaxed">
              <div>
                <p className="text-xs font-medium text-[#D4AF37]">DATA PROTECTION</p>
                <h1 className="mt-1 text-2xl sm:text-4xl font-semibold tracking-tight text-[#F5F5F7]">
                  Privacy Policy
                </h1>
              </div>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  1. Minimal Account Information
                </h2>
                <p className="text-[#A1A1AA]">
                  We authenticate members via Google Sign-In and store only essential profile fields
                  (name, email, Telegram handle, VIP entitlement status, and approved book access)
                  in isolated Firebase Firestore documents protected by strict owner-and-admin
                  security rules.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  2. YouTube Subscription Verification
                </h2>
                <p className="text-[#A1A1AA]">
                  When verifying channel subscription status, OAuth read-only tokens remain strictly
                  in volatile browser memory for the verification request and are never persisted to
                  local storage or shared with third parties.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  3. Visitor Analytics &amp; Browser Notifications
                </h2>
                <p className="text-[#A1A1AA]">
                  Daily and monthly visitor counters deduplicate repeated page refreshes without
                  invasive cross-site tracking. Browser notifications are opt-in and respect native
                  operating system permission controls at all times.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="text-base font-semibold text-[#F5F5F7]">
                  4. Privacy &amp; Support Contact
                </h2>
                <p className="text-[#A1A1AA]">
                  For account data inquiries or official support, contact us directly at{' '}
                  <a
                    href={`mailto:${settings.contactEmail}`}
                    className="text-[#E5C76B] hover:underline"
                  >
                    {settings.contactEmail}
                  </a>
                  .
                </p>
              </section>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-white/[0.08] py-6 px-6 text-xs text-[#8E8E93]">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            © {new Date().getFullYear()} {settings.siteName} ·{' '}
            <a href={`mailto:${settings.contactEmail}`} className="hover:text-[#F5F5F7]">
              {settings.contactEmail}
            </a>
          </span>
          <div className="flex items-center gap-5">
            <a href="./index.html" className="hover:text-[#F5F5F7]">Home</a>
            <a href="./about.html" className="hover:text-[#F5F5F7]">About</a>
            <a href="./contact.html" className="hover:text-[#F5F5F7]">Contact</a>
            <a href="./terms.html" className="hover:text-[#F5F5F7]">Terms</a>
            <a href="./privacy.html" className="hover:text-[#F5F5F7]">Privacy</a>
          </div>
        </div>
      </footer>

      <VipJoinModal isOpen={vipOpen} onClose={() => setVipOpen(false)} />
    </div>
  );
};
