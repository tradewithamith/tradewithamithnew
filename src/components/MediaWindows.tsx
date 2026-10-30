import React, { useState } from 'react';
import { Check, Copy, Download, Eye, Lock, Play, X } from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { extractYoutubeEmbedUrl, extractYoutubeThumbnail } from '../lib/integrations';
import { ASSETS, type AcademyVideo, type FreeBook, type PaidBookPublic } from '../types/academy';
import { BinanceQrDisplay, ResilientImage } from './ResilientImage';

export const VideosWindow: React.FC = () => {
  const { videos } = useAcademy();
  const [selectedVideo, setSelectedVideo] = useState<AcademyVideo | null>(null);
  const [search, setSearch] = useState('');

  const filtered = videos.filter(
    (v) =>
      v.title.toLowerCase().includes(search.toLowerCase()) ||
      v.description.toLowerCase().includes(search.toLowerCase())
  );

  const embedUrl = selectedVideo ? extractYoutubeEmbedUrl(selectedVideo.youtubeUrl) : null;

  return (
    <div className="p-3.5 sm:p-8 space-y-5 sm:space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#D4AF37]">
            MSNR Education Library · Synchronized With Google Sheets
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7]">
            Video Masterclasses
          </h2>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search MSNR lessons..."
          aria-label="Search video lessons"
          className="w-full sm:w-64 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-[#F5F5F7] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#D4AF37]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="apple-surface rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-medium text-[#F5F5F7]">No Matching Videos</p>
          <p className="text-sm text-[#A1A1AA]">Try another keyword or clear your search filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {filtered.map((video) => {
            const thumbSrc =
              video.thumbnail || extractYoutubeThumbnail(video.youtubeUrl, ASSETS.videoThumb);
            return (
              <article
                key={video.id}
                className="apple-surface rounded-xl sm:rounded-2xl overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="relative aspect-video overflow-hidden bg-[#0E0F14]">
                    <ResilientImage
                      src={thumbSrc}
                      alt={video.title}
                      fallbackLabel={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                  </div>
                  <div className="p-3 sm:p-5 space-y-1.5 sm:space-y-2">
                    <p className="text-[10px] sm:text-xs text-[#8E8E93] font-mono tabular-nums">
                      {video.date}
                    </p>
                    <h3 className="text-xs sm:text-base font-semibold text-[#F5F5F7] leading-snug line-clamp-2">
                      {video.title}
                    </h3>
                    <p className="text-[11px] sm:text-sm text-[#A1A1AA] line-clamp-2 sm:line-clamp-3 leading-relaxed">
                      {video.description}
                    </p>
                  </div>
                </div>

                <div className="px-3 pb-3 sm:px-5 sm:pb-5">
                  <button
                    type="button"
                    onClick={() => setSelectedVideo(video)}
                    className="w-full py-2 sm:py-2.5 px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-white/[0.07] hover:bg-[#D4AF37] text-[#F5F5F7] hover:text-[#09090B] text-[11px] sm:text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 sm:gap-2"
                  >
                    <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current shrink-0" />
                    <span className="truncate">Watch Lesson</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Centered Apple TV-Style Video Player Modal */}
      {selectedVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedVideo.title}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-4xl apple-window rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/[0.08]">
              <h3 className="text-sm font-semibold text-[#F5F5F7] truncate">
                {selectedVideo.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                aria-label="Close video player"
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={selectedVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <p className="text-sm text-[#D1D1D6]">
                    This lesson opens directly on YouTube.
                  </p>
                  <a
                    href={selectedVideo.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold"
                  >
                    Watch on YouTube
                  </a>
                </div>
              )}
            </div>
            <div className="p-5 text-xs sm:text-sm text-[#A1A1AA]">
              {selectedVideo.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const FreePdfsWindow: React.FC = () => {
  const { freeBooks, incrementFreeBookMetric } = useAcademy();
  const [localMetrics, setLocalMetrics] = useState<Record<string, { v: number; d: number }>>({});

  const handleDownload = async (book: FreeBook) => {
    setLocalMetrics((prev) => ({
      ...prev,
      [book.id]: {
        v: (prev[book.id]?.v ?? 0) + 1,
        d: (prev[book.id]?.d ?? 0) + 1,
      },
    }));
    await incrementFreeBookMetric(book, 'downloads');

    const link = document.createElement('a');
    link.href = book.pdfUrl;
    link.download = `${book.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviewCount = async (book: FreeBook) => {
    setLocalMetrics((prev) => ({
      ...prev,
      [book.id]: {
        v: (prev[book.id]?.v ?? 0) + 1,
        d: prev[book.id]?.d ?? 0,
      },
    }));
    await incrementFreeBookMetric(book, 'views');
  };

  return (
    <div className="p-3.5 sm:p-8 space-y-5 sm:space-y-7">
      <div className="space-y-1">
        <p className="text-xs font-medium text-[#D4AF37]">
          Open-Access Study Material · Firebase Tracked Downloads
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7]">
          Free PDF Library
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        {freeBooks.map((book) => {
          const extra = localMetrics[book.id] || { v: 0, d: 0 };
          const views = book.views + extra.v;
          const downloads = book.downloads + extra.d;

          return (
            <article
              key={book.id}
              onMouseEnter={() => {
                if (!localMetrics[book.id]) {
                  handlePreviewCount(book);
                }
              }}
              className="apple-surface rounded-xl sm:rounded-2xl p-3 sm:p-5 flex flex-col lg:flex-row gap-3 sm:gap-5 items-stretch"
            >
              <div className="w-full lg:w-36 aspect-[3/4] rounded-lg sm:rounded-xl overflow-hidden shrink-0 border border-white/10">
                <ResilientImage
                  src={book.coverUrl || ASSETS.bookMsnr}
                  alt={book.name}
                  fallbackLabel={book.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 flex flex-col justify-between space-y-2.5 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-xs sm:text-lg font-semibold text-[#F5F5F7] leading-snug line-clamp-2">
                    {book.name}
                  </h3>
                  <p className="text-[11px] sm:text-sm text-[#A1A1AA] leading-relaxed line-clamp-2 sm:line-clamp-3">
                    {book.description}
                  </p>
                </div>

                <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-4 text-[10px] sm:text-xs text-[#8E8E93] font-mono tabular-nums">
                    <span className="inline-flex items-center gap-1 sm:gap-1.5">
                      <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                      <span>
                        {views.toLocaleString()}
                        <span className="hidden sm:inline"> Views</span>
                      </span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 sm:gap-1.5">
                      <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                      <span>
                        {downloads.toLocaleString()}
                        <span className="hidden sm:inline"> Downloads</span>
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownload(book)}
                    className="w-full lg:w-auto px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#D4AF37] text-[#09090B] text-[11px] sm:text-xs font-semibold hover:bg-[#E5C76B] transition-colors inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                  >
                    <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="truncate">Download PDF</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export const PaidPdfsWindow: React.FC = () => {
  const {
    paidBooks,
    bookAccessMap,
    isAdmin,
    settings,
    user,
    profile,
    submitBookPurchase,
    getProtectedPaidBookUrl,
  } = useAcademy();

  const [purchaseTarget, setPurchaseTarget] = useState<PaidBookPublic | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [txId, setTxId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const openBuyModal = (book: PaidBookPublic) => {
    setPurchaseTarget(book);
    setBuyerName(profile?.name || user?.displayName || '');
    setTelegram(profile?.telegram || '');
    setTxId('');
    setFeedback(null);
  };

  const handleCopyBinance = () => {
    navigator.clipboard?.writeText(settings.binancePayId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseTarget) return;
    if (buyerName.trim().length < 2 || telegram.trim().length < 2 || txId.trim().length < 3) {
      setFeedback({ type: 'err', text: 'Enter your Name, Telegram Number, and Transaction ID.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await submitBookPurchase({
        book: purchaseTarget,
        name: buyerName,
        telegram,
        transactionId: txId,
      });
      setFeedback({
        type: 'ok',
        text: 'Payment submitted (Status: PENDING). Once Admin verifies your transaction, this book unlocks automatically.',
      });
      setTxId('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to submit purchase right now.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlockedDownload = async (book: PaidBookPublic) => {
    const protectedUrl = await getProtectedPaidBookUrl(book.id);
    if (!protectedUrl) return;
    const link = document.createElement('a');
    link.href = protectedUrl;
    link.download = `${book.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-3.5 sm:p-8 space-y-5 sm:space-y-7">
      <div className="space-y-1">
        <p className="text-xs font-medium text-[#D4AF37]">
          Individual Per-Book Entitlement · Protected Storage Security
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7]">
          Premium PDF Bookstore
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        {paidBooks.map((book) => {
          const isUnlocked = isAdmin || bookAccessMap[book.id]?.status === 'APPROVED';

          return (
            <article
              key={book.id}
              className="apple-surface rounded-xl sm:rounded-2xl p-3 sm:p-5 flex flex-col lg:flex-row gap-3 sm:gap-5 items-stretch"
            >
              <div className="relative w-full lg:w-36 aspect-[3/4] rounded-lg sm:rounded-xl overflow-hidden shrink-0 border border-white/10">
                <ResilientImage
                  src={book.coverUrl || ASSETS.bookXauusd}
                  alt={book.name}
                  fallbackLabel={book.name}
                  className="w-full h-full object-cover"
                />
                {!isUnlocked && (
                  <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 sm:p-3 text-center">
                    <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-[#D4AF37] mb-1 sm:mb-1.5" />
                    <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide text-[#F5F5F7]">
                      PREMIUM CONTENT
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between space-y-2.5 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    <span className="text-[10px] sm:text-xs text-[#A1A1AA] truncate">
                      {isUnlocked ? (
                        'Unlocked Edition'
                      ) : (
                        <>
                          <span className="sm:hidden">Premium PDF</span>
                          <span className="hidden sm:inline">
                            PREMIUM CONTENT · PURCHASE REQUIRED
                          </span>
                        </>
                      )}
                    </span>
                    <span className="text-xs sm:text-base font-semibold font-mono tabular-nums text-[#E5C76B] shrink-0">
                      ${book.price}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-lg font-semibold text-[#F5F5F7] leading-snug line-clamp-2">
                    {book.name}
                  </h3>
                  <p
                    className={`text-[11px] sm:text-sm text-[#A1A1AA] leading-relaxed ${
                      !isUnlocked ? 'line-clamp-2 sm:line-clamp-3' : 'line-clamp-3 sm:line-clamp-none'
                    }`}
                  >
                    {book.description}
                  </p>
                </div>

                <div className="pt-1 sm:pt-2">
                  {isUnlocked ? (
                    <button
                      type="button"
                      onClick={() => handleUnlockedDownload(book)}
                      className="w-full lg:w-auto px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#30D158] text-[#09090B] text-[11px] sm:text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                    >
                      <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                      <span className="sm:hidden truncate">Download PDF</span>
                      <span className="hidden sm:inline">Download Purchased PDF</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openBuyModal(book)}
                      className="w-full lg:w-auto px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#D4AF37] text-[#09090B] text-[11px] sm:text-xs font-semibold hover:bg-[#E5C76B] transition-colors whitespace-nowrap truncate"
                    >
                      BUY NOW · ${book.price}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Apple-Style Individual Book Purchase Modal */}
      {purchaseTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Purchase ${purchaseTarget.name}`}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg apple-window rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.08]">
              <div>
                <h3 className="text-base font-semibold text-[#F5F5F7]">{purchaseTarget.name}</h3>
                <p className="text-xs text-[#D4AF37] font-mono tabular-nums">
                  Single-Book License · ${purchaseTarget.price} USD
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseTarget(null)}
                aria-label="Close purchase modal"
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="apple-surface rounded-xl p-4 text-center space-y-3">
                <p className="text-xs text-[#A1A1AA]">
                  Send <strong className="text-[#F5F5F7]">${purchaseTarget.price}</strong> via
                  Binance Pay and submit your Transaction ID below.
                </p>
                <BinanceQrDisplay
                  qrUrl={settings.binanceQrUrl}
                  binancePayId={settings.binancePayId}
                />
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#A1A1AA]">Binance Pay ID:</span>
                  <span className="font-mono tabular-nums text-sm font-semibold text-[#E5C76B]">
                    {settings.binancePayId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyBinance}
                    className="p-1 rounded hover:bg-white/10 text-[#D1D1D6]"
                    aria-label="Copy Binance Pay ID"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-[#30D158]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <form onSubmit={handlePurchaseSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#D1D1D6] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#D1D1D6] mb-1">
                    Telegram Number / @Username
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

                <div>
                  <label className="block text-xs font-medium text-[#D1D1D6] mb-1">
                    Binance Pay Transaction ID
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={txId}
                    onChange={(e) => setTxId(e.target.value)}
                    placeholder="Enter your order / transaction ID"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-mono text-[#F5F5F7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                {feedback && (
                  <p
                    className={`text-xs p-3 rounded-xl ${
                      feedback.type === 'ok'
                        ? 'bg-[#30D158]/15 text-[#30D158]'
                        : 'bg-[#FF453A]/15 text-[#FF453A]'
                    }`}
                  >
                    {feedback.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Submitting Verification...' : 'SUBMIT BOOK PAYMENT'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
