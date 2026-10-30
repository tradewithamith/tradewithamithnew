import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Crown,
  FileText,
  Home,
  PlaySquare,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import { ResilientImage } from './ResilientImage';
import type { WindowId } from '../types/academy';

interface NavConfig {
  id: WindowId;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}

export const WORKSPACE_NAV_ITEMS: NavConfig[] = [
  { id: 'home', label: 'Home', shortLabel: 'Home', icon: Home },
  { id: 'signals', label: 'VIP Signals', shortLabel: 'Signals', icon: BarChart3 },
  { id: 'videos', label: 'Videos', shortLabel: 'Videos', icon: PlaySquare },
  { id: 'free-pdfs', label: 'Free PDFs', shortLabel: 'Free Books', icon: FileText },
  { id: 'paid-pdfs', label: 'Paid PDFs', shortLabel: 'Bookstore', icon: BookOpen },
];

interface HeaderProps {
  activeWindow: WindowId | null;
  onSelectWindow: (id: WindowId) => void;
  onOpenVipJoin: () => void;
  isStaticPage?: boolean;
}

export const AppleTopBar: React.FC<HeaderProps> = ({
  activeWindow,
  onSelectWindow,
  onOpenVipJoin,
  isStaticPage = false,
}) => {
  const { settings, user, isVipActive, isAdmin } = useAcademy();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: WindowId) => {
    if (!isStaticPage) {
      e.preventDefault();
      onSelectWindow(id);
    }
  };

  return (
    <header className="sticky top-0 z-40 apple-glass border-b border-white/[0.08]">
      <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-14">
        {/* Zone 1: Brand Wordmark + Replaceable Logo */}
        <a
          href="./index.html"
          onClick={(e) => {
            if (!isStaticPage) {
              e.preventDefault();
              onSelectWindow('home');
            }
          }}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] rounded-lg"
        >
          <ResilientImage
            src={settings.logoUrl}
            alt={settings.siteName}
            className="w-7 h-7 rounded-lg object-cover border border-white/15 shrink-0"
          />
          <span className="text-[15px] font-semibold tracking-tight text-[#F5F5F7] whitespace-nowrap shrink-0">
            {settings.siteName}
          </span>
        </a>

        {/* Zone 2: 5 Concise Single-Line Desktop Navigation Links */}
        <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-sm font-medium">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const isActive = !isStaticPage && activeWindow === item.id;
            return (
              <a
                key={item.id}
                href={`./index.html#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors duration-150 border-b ${
                  isActive
                    ? 'text-[#F5F5F7] border-[#D4AF37]'
                    : 'text-[#A1A1AA] border-transparent hover:text-[#F5F5F7]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          {isAdmin ? (
            <a
              href={isStaticPage ? './admin.html' : '#admin'}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C76B] transition-colors whitespace-nowrap shrink-0"
            >
              Admin Console
            </a>
          ) : isVipActive && user ? (
            <button
              type="button"
              onClick={() => onSelectWindow('signals')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white/10 text-[#F5F5F7] hover:bg-white/15 border border-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              VIP Terminal
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenVipJoin}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C76B] transition-colors whitespace-nowrap shrink-0"
            >
              Join VIP Signals
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

interface DockProps {
  activeWindow: WindowId | null;
  openWindows: Record<WindowId, boolean>;
  minimizedWindows: Record<WindowId, boolean>;
  onSelectWindow: (id: WindowId) => void;
  onOpenVipJoin: () => void;
}

export const AppleBottomDock: React.FC<DockProps> = ({
  activeWindow,
  openWindows,
  minimizedWindows,
  onSelectWindow,
  onOpenVipJoin,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <>
      {/* Desktop macOS Floating Glass Dock */}
      <div className="hidden lg:flex fixed bottom-4 inset-x-0 z-40 justify-center pointer-events-none">
        <div
          role="toolbar"
          aria-label="Application Dock"
          onMouseLeave={() => setHoveredIdx(null)}
          className="pointer-events-auto apple-glass px-3.5 py-2 rounded-2xl flex items-end gap-2.5 shadow-2xl"
        >
          {WORKSPACE_NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const isOpen = openWindows[item.id];
            const isMinimized = minimizedWindows[item.id];
            const isFocused = activeWindow === item.id && isOpen && !isMinimized;

            let scale = 1;
            if (hoveredIdx === index) scale = 1.24;
            else if (hoveredIdx !== null && Math.abs(hoveredIdx - index) === 1) scale = 1.1;

            return (
              <div key={item.id} className="relative group flex flex-col items-center">
                {/* Tooltip */}
                <span className="pointer-events-none absolute -top-9 px-2.5 py-1 rounded-md bg-[#181920]/95 border border-white/10 text-[11px] font-medium text-[#F5F5F7] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {item.label}
                  {isMinimized ? ' (Minimized)' : ''}
                </span>

                <button
                  type="button"
                  onMouseEnter={() => setHoveredIdx(index)}
                  onClick={() => onSelectWindow(item.id)}
                  aria-label={item.label}
                  style={{ transform: `scale(${scale}) translateY(${scale > 1 ? -4 : 0}px)` }}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-150 ${
                    isFocused
                      ? 'bg-gradient-to-b from-[#D4AF37]/30 to-[#D4AF37]/10 text-[#E5C76B] border border-[#D4AF37]/40'
                      : 'bg-white/[0.06] text-[#E5E5EA] hover:bg-white/[0.11] border border-white/[0.08]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>

                {/* macOS Open / Minimized Indicator */}
                <span
                  aria-hidden="true"
                  className={`mt-1 w-1 h-1 rounded-full transition-opacity ${
                    isOpen
                      ? isMinimized
                        ? 'opacity-100 bg-[#FFBD2E]'
                        : 'opacity-100 bg-[#F5F5F7]'
                      : 'opacity-0'
                  }`}
                />
              </div>
            );
          })}

          <div className="w-px h-8 bg-white/10 mx-1 self-center" />

          {/* VIP Quick Action in Dock */}
          <div className="relative group flex flex-col items-center">
            <span className="pointer-events-none absolute -top-9 px-2.5 py-1 rounded-md bg-[#181920]/95 border border-white/10 text-[11px] font-medium text-[#F5F5F7] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              VIP Membership
            </span>
            <button
              type="button"
              onClick={onOpenVipJoin}
              aria-label="Open VIP Membership"
              className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-b from-[#D4AF37] to-[#B69121] text-[#09090B] hover:scale-110 transition-transform duration-150"
            >
              <Crown className="w-5 h-5" />
            </button>
            <span aria-hidden="true" className="mt-1 w-1 h-1 opacity-0" />
          </div>
        </div>
      </div>

      {/* Mobile iPhone-Inspired Floating Bottom Navigation (Strict <= 15% Viewport Cap) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 apple-glass border-t border-white/[0.09] pb-safe"
      >
        <div className="grid grid-cols-5 px-2 pt-1.5">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeWindow === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectWindow(item.id)}
                className={`min-h-[46px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                  active ? 'text-[#E5C76B]' : 'text-[#A1A1AA] hover:text-[#F5F5F7]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium whitespace-nowrap">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
