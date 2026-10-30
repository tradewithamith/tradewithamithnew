import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const MEDIA_PAGE_SIZE = 6;

export interface PaginatedResult<T> {
  pageItems: T[];
  safePage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

export function paginateItems<T>(
  items: T[],
  currentPage: number,
  pageSize: number = MEDIA_PAGE_SIZE
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const startOffset = (safePage - 1) * pageSize;
  const pageItems = items.slice(startOffset, startOffset + pageSize);

  return {
    pageItems,
    safePage,
    totalPages,
    startIndex: items.length === 0 ? 0 : startOffset + 1,
    endIndex: Math.min(startOffset + pageItems.length, items.length),
  };
}

export function scrollNearestContainerToTop(anchor: HTMLElement | null): void {
  if (!anchor || typeof window === 'undefined') return;

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  let node: HTMLElement | null = anchor.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTo({ top: 0, behavior });
      return;
    }
    node = node.parentElement;
  }

  window.scrollTo({ top: 0, behavior });
}

function buildPageTokens(current: number, total: number): Array<number | 'ellipsis-left' | 'ellipsis-right'> {
  if (total <= 5) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }

  const tokens: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [1];

  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);

  if (windowStart > 2) {
    tokens.push('ellipsis-left');
  }

  for (let p = windowStart; p <= windowEnd; p += 1) {
    tokens.push(p);
  }

  if (windowEnd < total - 1) {
    tokens.push('ellipsis-right');
  }

  tokens.push(total);
  return tokens;
}

interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalItems,
  pageSize = MEDIA_PAGE_SIZE,
  itemLabel = 'items',
  onPageChange,
}) => {
  if (totalItems <= 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);
  const tokens = buildPageTokens(safePage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3"
    >
      <p className="text-xs font-mono tabular-nums text-[#8E8E93]">
        <span>
          Showing {startItem}–{endItem} of {totalItems.toLocaleString()} {itemLabel}
        </span>
        <span aria-hidden="true" className="mx-2">
          ·
        </span>
        <span>
          Page {safePage} of {totalPages}
        </span>
      </p>

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
          className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-semibold text-[#D1D1D6] hover:text-[#F5F5F7] disabled:opacity-35 disabled:pointer-events-none transition-colors inline-flex items-center gap-1.5 whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <span>Previous</span>
        </button>

        <div className="flex items-center gap-1">
          {tokens.map((token) => {
            if (token === 'ellipsis-left' || token === 'ellipsis-right') {
              return (
                <span
                  key={token}
                  aria-hidden="true"
                  className="px-1.5 text-xs font-mono text-[#8E8E93] select-none"
                >
                  …
                </span>
              );
            }

            const isActive = token === safePage;
            return (
              <button
                key={token}
                type="button"
                onClick={() => onPageChange(token)}
                aria-label={`Page ${token}`}
                aria-current={isActive ? 'page' : undefined}
                className={`min-w-[40px] min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl text-xs font-mono tabular-nums font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] ${
                  isActive
                    ? 'bg-[#D4AF37] text-[#09090B] border border-[#D4AF37]'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-[#D1D1D6] hover:text-[#F5F5F7]'
                }`}
              >
                {token}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
          className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.09] text-xs font-semibold text-[#D1D1D6] hover:text-[#F5F5F7] disabled:opacity-35 disabled:pointer-events-none transition-colors inline-flex items-center gap-1.5 whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </nav>
  );
};
