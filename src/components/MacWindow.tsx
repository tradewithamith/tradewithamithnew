import React, { useRef, useState } from 'react';
import { Minus, Maximize2, Minimize2, X } from 'lucide-react';
import type { WindowId } from '../types/academy';

interface MacWindowProps {
  id: WindowId;
  title: string;
  subtitle?: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  initialOffset?: { x: number; y: number };
  onClose: (id: WindowId) => void;
  onMinimize: (id: WindowId) => void;
  onToggleMaximize: (id: WindowId) => void;
  onFocus: (id: WindowId) => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export const MacWindow: React.FC<MacWindowProps> = ({
  id,
  title,
  subtitle,
  isOpen,
  isMinimized,
  isMaximized,
  zIndex,
  initialOffset = { x: 0, y: 0 },
  onClose,
  onMinimize,
  onToggleMaximize,
  onFocus,
  headerRight,
  children,
}) => {
  const [pos, setPos] = useState(initialOffset);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!isOpen || isMinimized) {
    return null;
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop || isMaximized) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    onFocus(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || isMaximized) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const clampedX = Math.max(-220, Math.min(220, dragStartRef.current.origX + dx));
    const clampedY = Math.max(-24, Math.min(160, dragStartRef.current.origY + dy));
    setPos({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }
    }
  };

  const desktopTransform = isMaximized
    ? 'translate3d(0px, 0px, 0px)'
    : `translate3d(${pos.x}px, ${pos.y}px, 0px)`;

  return (
    <section
      aria-label={title}
      onMouseDown={() => {
        if (isDesktop) onFocus(id);
      }}
      style={{ zIndex }}
      className={
        isMaximized
          ? 'w-full lg:fixed lg:inset-x-4 lg:top-16 lg:bottom-24 lg:w-auto transition-opacity duration-150 lg:pointer-events-none'
          : 'w-full lg:fixed lg:inset-x-6 lg:top-[76px] lg:max-w-[1160px] lg:mx-auto transition-opacity duration-150 lg:pointer-events-none'
      }
    >
      <div
        style={{ transform: isDesktop ? desktopTransform : undefined }}
        className={`pointer-events-auto apple-window rounded-2xl lg:rounded-[22px] overflow-x-clip lg:overflow-hidden flex flex-col ${
          isMaximized ? 'lg:h-full' : 'lg:max-h-[calc(100vh-11rem)]'
        }`}
      >
        {/* macOS Window Chrome (Desktop) / Compact iOS Title Header (Mobile) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => onToggleMaximize(id)}
          className="hidden lg:flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.02] select-none cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onClose(id)}
              aria-label={`Close ${title} window`}
              title="Close"
              className="group w-3.5 h-3.5 rounded-full bg-[#FF5F56] flex items-center justify-center transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="w-2.5 h-2.5 text-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              type="button"
              onClick={() => onMinimize(id)}
              aria-label={`Minimize ${title} window`}
              title="Minimize to Dock"
              className="group w-3.5 h-3.5 rounded-full bg-[#FFBD2E] flex items-center justify-center transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <Minus className="w-2.5 h-2.5 text-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              type="button"
              onClick={() => onToggleMaximize(id)}
              aria-label={isMaximized ? `Restore ${title} window` : `Maximize ${title} window`}
              title={isMaximized ? 'Restore Size' : 'Maximize'}
              className="group w-3.5 h-3.5 rounded-full bg-[#27C93F] flex items-center justify-center transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {isMaximized ? (
                <Minimize2 className="w-2 h-2 text-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
              ) : (
                <Maximize2 className="w-2 h-2 text-black/80 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-[#D1D1D6] truncate">
            <span className="text-[#F5F5F7] font-semibold">{title}</span>
            {subtitle && (
              <>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span className="text-[#A1A1AA] truncate">{subtitle}</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-end min-w-[72px]">{headerRight}</div>
        </div>

        {/* Scrollable Window Body (desktop internal scroll; mobile native document touch scroll) */}
        <div className="flex-1 lg:overflow-y-auto lg:overscroll-contain">{children}</div>
      </div>
    </section>
  );
};
