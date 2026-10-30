import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  Loader2,
  Lock,
  Play,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { parseFirebaseAuthError } from '../lib/firebase';
import { extractYoutubeEmbedUrl, extractYoutubeThumbnail } from '../lib/integrations';
import {
  downloadPdfAutomatically,
  extractPdfCoverFromUrl,
  isPlaceholderBookCover,
} from '../lib/pdfTools';
import {
  ASSETS,
  type AcademyVideo,
  type FreeBook,
  type MarketAnalysisVideo,
  type PaidBookPublic,
  type VideoReactionType,
} from '../types/academy';
import { BinanceQrDisplay, ResilientImage } from './ResilientImage';

interface PdfCoverThumbnailProps {
  coverUrl?: string;
  pdfUrl?: string | null;
  alt: string;
  fallbackAsset: string;
  className?: string;
}

export const PdfCoverThumbnail: React.FC<PdfCoverThumbnailProps> = ({
  coverUrl,
  pdfUrl,
  alt,
  fallbackAsset,
  className = 'w-full h-full object-cover',
}) => {
  const hasRealSavedCover = Boolean(coverUrl && !isPlaceholderBookCover(coverUrl));
  const [autoCover, setAutoCover] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    let active = true;
    if (hasRealSavedCover || !pdfUrl) {
      setAutoCover(null);
      setExtracting(false);
      return;
    }

    setExtracting(true);
    extractPdfCoverFromUrl(pdfUrl)
      .then((rendered) => {
        if (active && rendered) {
          setAutoCover(rendered);
        }
      })
      .finally(() => {
        if (active) setExtracting(false);
      });

    return () => {
      active = false;
    };
  }, [hasRealSavedCover, pdfUrl]);

  const resolvedSrc = hasRealSavedCover ? coverUrl! : autoCover || coverUrl || fallbackAsset;

  return (
    <div className="relative w-full h-full bg-[#0E0F14]">
      <ResilientImage
        src={resolvedSrc}
        alt={alt}
        fallbackLabel={alt}
        className={className}
      />
      {extracting && !autoCover && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65 backdrop-blur-xs py-1 px-2 flex items-center justify-center gap-1.5 text-[10px] text-[#E5C76B]">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span className="truncate">Loading Cover...</span>
        </div>
      )}
    </div>
  );
};

export const MarketAnalysisWindow: React.FC = () => {
  const {
    marketAnalysisVideos,
    marketAnalysisReactionsSummary,
    toggleMarketAnalysisReaction,
  } = useAcademy();
  const [selectedVideo, setSelectedVideo] = useState<MarketAnalysisVideo | null>(null);
  const [search, setSearch] = useState('');
  const [busyReactionKey, setBusyReactionKey] = useState<string | null>(null);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);

  const filtered = marketAnalysisVideos.filter(
    (v) =>
      v.title.toLowerCase().includes(search.toLowerCase()) ||
      v.description.toLowerCase().includes(search.toLowerCase())
  );

  const embedUrl = selectedVideo ? extractYoutubeEmbedUrl(selectedVideo.youtubeUrl) : null;

  const handleReactionClick = async (videoId: string, reaction: VideoReactionType) => {
    const key = `${videoId}_${reaction}`;
    setBusyReactionKey(key);
    setReactionNotice(null);
    try {
      await toggleMarketAnalysisReaction(videoId, reaction);
    } catch (err) {
      const parsed = parseFirebaseAuthError(err);
      setReactionNotice(
        parsed.isUnauthorizedDomain
          ? `${parsed.message} Add "${parsed.hostname}" in Firebase Authorized Domains.`
          : err instanceof Error
          ? err.message
          : 'Sign in with Google to record your reaction.'
      );
    } finally {
      setBusyReactionKey(null);
    }
  };

  const renderReactionPill = (videoId: string, size: 'card' | 'modal') => {
    const stats = marketAnalysisReactionsSummary[videoId] || {
      likes: 0,
      dislikes: 0,
      userReaction: null,
    };
    const liked = stats.userReaction === 'LIKE';
    const disliked = stats.userReaction === 'DISLIKE';
    const isBusy =
      busyReactionKey === `${videoId}_LIKE` || busyReactionKey === `${videoId}_DISLIKE`;

    return (
      <div
        className={`inline-flex items-center rounded-full bg-white/[0.06] border border-white/[0.1] overflow-hidden font-mono tabular-nums ${
          size === 'modal' ? 'text-xs' : 'text-[11px] sm:text-xs'
        }`}
      >
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleReactionClick(videoId, 'LIKE')}
          aria-label={`Like video (${stats.likes} likes)`}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
            size === 'modal' ? 'px-3.5 py-2' : 'px-2.5 sm:px-3 py-1.5'
          } ${
            liked
              ? 'bg-[#D4AF37]/20 text-[#E5C76B] font-semibold'
              : 'text-[#D1D1D6] hover:bg-white/[0.08] hover:text-[#F5F5F7]'
          }`}
        >
          <ThumbsUp
            className={`${size === 'modal' ? 'w-4 h-4' : 'w-3.5 h-3.5'} shrink-0 ${
              liked ? 'fill-current' : ''
            }`}
          />
          <span>{stats.likes.toLocaleString()}</span>
        </button>

        <span aria-hidden="true" className="w-px h-4 bg-white/[0.12]" />

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleReactionClick(videoId, 'DISLIKE')}
          aria-label={`Dislike video (${stats.dislikes} dislikes)`}
          aria-pressed={disliked}
          className={`inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
            size === 'modal' ? 'px-3.5 py-2' : 'px-2.5 sm:px-3 py-1.5'
          } ${
            disliked
              ? 'bg-[#FF453A]/20 text-[#FF453A] font-semibold'
              : 'text-[#A1A1AA] hover:bg-white/[0.08] hover:text-[#F5F5F7]'
          }`}
        >
          <ThumbsDown
            className={`${size === 'modal' ? 'w-4 h-4' : 'w-3.5 h-3.5'} shrink-0 ${
              disliked ? 'fill-current' : ''
            }`}
          />
          <span>{stats.dislikes.toLocaleString()}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="p-3.5 sm:p-8 space-y-5 sm:space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#D4AF37]">
            XAUUSD Gold Breakdowns · Exclusive Unlisted Briefings
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7]">
            Market Analysis
          </h2>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search market analysis..."
          aria-label="Search market analysis videos"
          className="w-full sm:w-64 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-[#F5F5F7] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#D4AF37]"
        />
      </div>

      {reactionNotice && (
        <div className="rounded-xl bg-[#181920] border border-[#D4AF37]/30 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-[#E5C76B]">
          <span>{reactionNotice}</span>
          <button
            type="button"
            onClick={() => setReactionNotice(null)}
            className="text-[#A1A1AA] hover:text-[#F5F5F7]"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="apple-surface rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-medium text-[#F5F5F7]">
            {marketAnalysisVideos.length === 0
              ? 'No Market Analysis Videos Published Yet'
              : 'No Matching Market Analysis Videos'}
          </p>
          <p className="text-sm text-[#A1A1AA]">
            {marketAnalysisVideos.length === 0
              ? 'New XAUUSD multi-timeframe storyline and session outlook videos will appear here.'
              : 'Try another keyword or clear your search filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {filtered.map((video) => {
            const thumbSrc =
              video.thumbnail || extractYoutubeThumbnail(video.youtubeUrl, ASSETS.heroTerminal);
            return (
              <article
                key={video.id}
                className="apple-surface rounded-xl sm:rounded-2xl overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedVideo(video)}
                    className="relative w-full aspect-video overflow-hidden bg-[#0E0F14] block text-left"
                    aria-label={`Play ${video.title}`}
                  >
                    <ResilientImage
                      src={thumbSrc}
                      alt={video.title}
                      fallbackLabel={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent flex items-center justify-center">
                      <span className="w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-[#F5F5F7] group-hover:bg-[#D4AF37] group-hover:text-[#09090B] group-hover:border-[#D4AF37] transition-colors">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </span>
                    </div>
                  </button>
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

                <div className="px-3 pb-3 sm:px-5 sm:pb-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {renderReactionPill(video.id, 'card')}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedVideo(video)}
                    className="w-full py-2 sm:py-2.5 px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-white/[0.07] hover:bg-[#D4AF37] text-[#F5F5F7] hover:text-[#09090B] text-[11px] sm:text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 sm:gap-2"
                  >
                    <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current shrink-0" />
                    <span className="truncate">Watch Analysis</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Centered Apple TV-Style Market Analysis Player Modal */}
      {selectedVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedVideo.title}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-4xl apple-window rounded-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/[0.08] shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#F5F5F7] truncate">
                  {selectedVideo.title}
                </h3>
                <p className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
                  {selectedVideo.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                aria-label="Close video player"
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video bg-black shrink-0">
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
                    Open this unlisted briefing directly on YouTube.
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
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium text-[#D1D1D6]">
                  Was this XAUUSD market breakdown helpful?
                </span>
                {renderReactionPill(selectedVideo.id, 'modal')}
              </div>
              {selectedVideo.description && (
                <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                  {selectedVideo.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
          <p className="text-base font-medium text-[#F5F5F7]">
            {videos.length === 0 ? 'No Videos Published Yet' : 'No Matching Videos'}
          </p>
          <p className="text-sm text-[#A1A1AA]">
            {videos.length === 0
              ? 'New MSNR educational lessons and masterclasses will appear here once published.'
              : 'Try another keyword or clear your search filter.'}
          </p>
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (book: FreeBook) => {
    if (downloadingId === book.id) return;
    setDownloadingId(book.id);
    setLocalMetrics((prev) => ({
      ...prev,
      [book.id]: {
        v: (prev[book.id]?.v ?? 0) + 1,
        d: (prev[book.id]?.d ?? 0) + 1,
      },
    }));
    try {
      void incrementFreeBookMetric(book, 'downloads');
      await downloadPdfAutomatically(book.pdfUrl, book.name);
    } finally {
      setDownloadingId(null);
    }
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
          Open-Access Study Material · Automatic Cover &amp; Direct Download
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F5F7]">
          Free PDF Library
        </h2>
      </div>

      {freeBooks.length === 0 ? (
        <div className="apple-surface rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-medium text-[#F5F5F7]">No Free PDF Guides Published Yet</p>
          <p className="text-sm text-[#A1A1AA]">
            Free MSNR study guides and checklists will appear here once published.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          {freeBooks.map((book) => {
          const extra = localMetrics[book.id] || { v: 0, d: 0 };
          const views = book.views + extra.v;
          const downloads = book.downloads + extra.d;
          const isDownloading = downloadingId === book.id;

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
                <PdfCoverThumbnail
                  coverUrl={book.coverUrl}
                  pdfUrl={book.pdfUrl}
                  alt={book.name}
                  fallbackAsset={ASSETS.bookMsnr}
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
                    disabled={isDownloading}
                    onClick={() => handleDownload(book)}
                    className="w-full lg:w-auto px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#D4AF37] text-[#09090B] text-[11px] sm:text-xs font-semibold hover:bg-[#E5C76B] disabled:opacity-65 transition-colors inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {isDownloading ? 'Downloading...' : 'Download PDF'}
                    </span>
                  </button>
                </div>
              </div>
            </article>
          );
          })}
        </div>
      )}
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [unlockedPdfUrls, setUnlockedPdfUrls] = useState<Record<string, string>>({});

  // Resolve protected PDF URLs for unlocked books when coverUrl is still a placeholder
  useEffect(() => {
    let active = true;
    paidBooks.forEach((book) => {
      const isUnlocked = isAdmin || bookAccessMap[book.id]?.status === 'APPROVED';
      if (isUnlocked && isPlaceholderBookCover(book.coverUrl) && !unlockedPdfUrls[book.id]) {
        getProtectedPaidBookUrl(book.id)
          .then((url) => {
            if (active && url) {
              setUnlockedPdfUrls((prev) => ({ ...prev, [book.id]: url }));
            }
          })
          .catch(() => {});
      }
    });
    return () => {
      active = false;
    };
  }, [paidBooks, bookAccessMap, isAdmin, getProtectedPaidBookUrl, unlockedPdfUrls]);

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
    if (downloadingId === book.id) return;
    setDownloadingId(book.id);
    try {
      const protectedUrl = unlockedPdfUrls[book.id] || (await getProtectedPaidBookUrl(book.id));
      if (!protectedUrl) return;
      await downloadPdfAutomatically(protectedUrl, book.name);
    } finally {
      setDownloadingId(null);
    }
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

      {paidBooks.length === 0 ? (
        <div className="apple-surface rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-medium text-[#F5F5F7]">No Premium PDF Books Published Yet</p>
          <p className="text-sm text-[#A1A1AA]">
            Premium MSNR playbooks and digital editions will appear here once published.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          {paidBooks.map((book) => {
          const isUnlocked = isAdmin || bookAccessMap[book.id]?.status === 'APPROVED';
          const isDownloading = downloadingId === book.id;

          return (
            <article
              key={book.id}
              className="apple-surface rounded-xl sm:rounded-2xl p-3 sm:p-5 flex flex-col lg:flex-row gap-3 sm:gap-5 items-stretch"
            >
              <div className="relative w-full lg:w-36 aspect-[3/4] rounded-lg sm:rounded-xl overflow-hidden shrink-0 border border-white/10">
                <PdfCoverThumbnail
                  coverUrl={book.coverUrl}
                  pdfUrl={isUnlocked ? unlockedPdfUrls[book.id] || null : null}
                  alt={book.name}
                  fallbackAsset={ASSETS.bookXauusd}
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
                      disabled={isDownloading}
                      onClick={() => handleUnlockedDownload(book)}
                      className="w-full lg:w-auto px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#30D158] text-[#09090B] text-[11px] sm:text-xs font-semibold hover:opacity-90 disabled:opacity-65 transition-opacity inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                      )}
                      <span className="sm:hidden truncate">
                        {isDownloading ? 'Downloading...' : 'Download PDF'}
                      </span>
                      <span className="hidden sm:inline">
                        {isDownloading ? 'Downloading PDF...' : 'Download Purchased PDF'}
                      </span>
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
      )}

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
