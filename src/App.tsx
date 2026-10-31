/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { AcademyProvider, useAcademy } from './context/AcademyContext';
import { AppleBottomDock, AppleTopBar, WORKSPACE_NAV_ITEMS } from './components/AppleHeaderAndDock';
import { HomeWindow } from './components/HomeWindow';
import { MacWindow } from './components/MacWindow';
import {
  FreePdfsWindow,
  MarketAnalysisWindow,
  PaidPdfsWindow,
  VideosWindow,
} from './components/MediaWindows';
import {
  InstallAppModal,
  NotificationCenter,
  VipJoinModal,
  YoutubeGateOverlay,
} from './components/ModalsAndOverlays';
import { ResilientImage } from './components/ResilientImage';
import { SignalsWindow } from './components/SignalsWindow';
import { StaticInfoPage } from './components/StaticPages';
import { usePWAInstall } from './hooks/usePWAInstall';
import type { StaticPageId, WindowId } from './types/academy';

const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

const VALID_WINDOWS: WindowId[] = [
  'home',
  'signals',
  'market-analysis',
  'videos',
  'free-pdfs',
  'paid-pdfs',
];

function detectInitialPage(): StaticPageId {
  if (typeof document !== 'undefined') {
    const rootAttr = document.getElementById('root')?.getAttribute('data-page');
    if (
      rootAttr === 'workspace' ||
      rootAttr === 'admin' ||
      rootAttr === 'terms' ||
      rootAttr === 'privacy' ||
      rootAttr === 'about' ||
      rootAttr === 'contact'
    ) {
      return rootAttr;
    }
  }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('/admin') || path.endsWith('/admin.html')) return 'admin';
    if (path.endsWith('/terms') || path.endsWith('/terms.html')) return 'terms';
    if (path.endsWith('/privacy') || path.endsWith('/privacy.html')) return 'privacy';
    if (path.endsWith('/about') || path.endsWith('/about.html')) return 'about';
    if (path.endsWith('/contact') || path.endsWith('/contact.html')) return 'contact';
  }

  return 'workspace';
}

function parseHashWindow(): WindowId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '').trim() as WindowId;
  return VALID_WINDOWS.includes(raw) ? raw : null;
}

function isHashAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hash.replace(/^#/, '').trim().toLowerCase() === 'admin';
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AcademyErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected interface error',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070709] text-[#F5F5F7] flex items-center justify-center p-6">
          <div className="max-w-md w-full apple-window rounded-3xl p-8 space-y-4 text-center">
            <p className="text-xs font-semibold tracking-wider text-[#D4AF37]">
              MSNR ACADEMY RECOVERY
            </p>
            <h1 className="text-xl font-semibold text-[#F5F5F7]">
              Workspace Temporarily Interrupted
            </h1>
            <p className="text-xs text-[#A1A1AA] leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#E5C76B] transition-colors"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const WINDOW_META: Record<
  WindowId,
  { title: string; subtitle: string; offset: { x: number; y: number } }
> = {
  home: {
    title: 'Trade With Amith — MSNR Academy',
    subtitle: 'Malaysian Support & Resistance · XAUUSD Gold',
    offset: { x: 0, y: 0 },
  },
  signals: {
    title: 'VIP Signals Terminal',
    subtitle: 'XAUUSD Institutional Execution & Pip Calculator',
    offset: { x: 22, y: 18 },
  },
  'market-analysis': {
    title: 'Market Analysis',
    subtitle: 'XAUUSD Gold Breakdowns & Session Storyline',
    offset: { x: 14, y: 20 },
  },
  videos: {
    title: 'Video Masterclasses',
    subtitle: 'MSNR Structure & Storyline Education',
    offset: { x: -20, y: 24 },
  },
  'free-pdfs': {
    title: 'Free PDF Library',
    subtitle: 'Open-Access Malaysian S&R Study Guides',
    offset: { x: 18, y: 30 },
  },
  'paid-pdfs': {
    title: 'Premium PDF Bookstore',
    subtitle: 'Individual Per-Book Institutional Blueprints',
    offset: { x: -18, y: 28 },
  },
};

const WorkspaceShell: React.FC = () => {
  const { settings } = useAcademy();
  const { isOnline } = usePWAInstall();

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const initialTarget = parseHashWindow() || 'home';

  const [openWindows, setOpenWindows] = useState<Record<WindowId, boolean>>(() => ({
    home: true,
    signals: initialTarget === 'signals',
    'market-analysis': initialTarget === 'market-analysis',
    videos: initialTarget === 'videos',
    'free-pdfs': initialTarget === 'free-pdfs',
    'paid-pdfs': initialTarget === 'paid-pdfs',
  }));

  const [minimizedWindows, setMinimizedWindows] = useState<Record<WindowId, boolean>>({
    home: false,
    signals: false,
    'market-analysis': false,
    videos: false,
    'free-pdfs': false,
    'paid-pdfs': false,
  });

  const [maximizedWindows, setMaximizedWindows] = useState<Record<WindowId, boolean>>({
    home: false,
    signals: false,
    'market-analysis': false,
    videos: false,
    'free-pdfs': false,
    'paid-pdfs': false,
  });

  const [zMap, setZMap] = useState<Record<WindowId, number>>(() => ({
    home: initialTarget === 'home' ? 12 : 10,
    signals: initialTarget === 'signals' ? 14 : 11,
    'market-analysis': initialTarget === 'market-analysis' ? 14 : 11,
    videos: initialTarget === 'videos' ? 14 : 11,
    'free-pdfs': initialTarget === 'free-pdfs' ? 14 : 11,
    'paid-pdfs': initialTarget === 'paid-pdfs' ? 14 : 11,
  }));

  const [topZ, setTopZ] = useState(15);
  const [activeWindow, setActiveWindow] = useState<WindowId | null>(initialTarget);
  const [vipModalOpen, setVipModalOpen] = useState(false);
  const [installModal, setInstallModal] = useState<{
    open: boolean;
    tab: 'apple' | 'android';
  }>({ open: false, tab: 'apple' });

  // Sync dynamic document title with Admin siteName ("Trade With Amith")
  useEffect(() => {
    document.title = settings.siteName || 'Trade With Amith';
  }, [settings.siteName]);

  // Track responsive desktop vs iPhone mobile mode
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const focusWindow = useCallback((id: WindowId) => {
    setTopZ((prev) => {
      const next = prev + 1;
      setZMap((zm) => ({ ...zm, [id]: next }));
      return next;
    });
    setActiveWindow(id);
  }, []);

  const selectOrOpenWindow = useCallback(
    (id: WindowId) => {
      setOpenWindows((prev) => ({ ...prev, [id]: true }));
      setMinimizedWindows((prev) => ({ ...prev, [id]: false }));
      setTopZ((prev) => {
        const next = prev + 1;
        setZMap((zm) => ({ ...zm, [id]: next }));
        return next;
      });
      setActiveWindow(id);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#${id}`);
        if (!isDesktop) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    },
    [isDesktop]
  );

  // Listen for hash deep links (e.g., from Notification broadcast buttons)
  useEffect(() => {
    const onHashChange = () => {
      const target = parseHashWindow();
      if (target) {
        selectOrOpenWindow(target);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [selectOrOpenWindow]);

  const handleCloseWindow = useCallback(
    (id: WindowId) => {
      setOpenWindows((prev) => {
        const next = { ...prev, [id]: false };
        if (activeWindow === id) {
          const remaining = VALID_WINDOWS.filter((w) => next[w] && !minimizedWindows[w]);
          const fallback =
            remaining.sort((a, b) => (zMap[b] || 0) - (zMap[a] || 0))[0] ?? null;
          setActiveWindow(fallback);
        }
        return next;
      });
      setMaximizedWindows((prev) => ({ ...prev, [id]: false }));
    },
    [activeWindow, minimizedWindows, zMap]
  );

  const handleMinimizeWindow = useCallback(
    (id: WindowId) => {
      setMinimizedWindows((prev) => {
        const next = { ...prev, [id]: true };
        if (activeWindow === id) {
          const remaining = VALID_WINDOWS.filter((w) => openWindows[w] && !next[w]);
          const fallback =
            remaining.sort((a, b) => (zMap[b] || 0) - (zMap[a] || 0))[0] ?? null;
          setActiveWindow(fallback);
        }
        return next;
      });
    },
    [activeWindow, openWindows, zMap]
  );

  const handleToggleMaximize = useCallback(
    (id: WindowId) => {
      setMaximizedWindows((prev) => ({ ...prev, [id]: !prev[id] }));
      focusWindow(id);
    },
    [focusWindow]
  );

  const visibleDesktopWindowsCount = useMemo(
    () => VALID_WINDOWS.filter((w) => openWindows[w] && !minimizedWindows[w]).length,
    [openWindows, minimizedWindows]
  );

  const mobileActiveId: WindowId = activeWindow || 'home';

  const renderWindowBody = (id: WindowId) => {
    switch (id) {
      case 'home':
        return (
          <HomeWindow
            onOpenVipJoin={() => setVipModalOpen(true)}
            onSelectWindow={selectOrOpenWindow}
            onOpenInstallModal={(tab) => setInstallModal({ open: true, tab })}
          />
        );
      case 'signals':
        return <SignalsWindow onOpenVipJoin={() => setVipModalOpen(true)} />;
      case 'market-analysis':
        return <MarketAnalysisWindow />;
      case 'videos':
        return <VideosWindow />;
      case 'free-pdfs':
        return <FreePdfsWindow />;
      case 'paid-pdfs':
        return <PaidPdfsWindow />;
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-[#F5F5F7] relative overflow-x-clip flex flex-col">
      {/* Subtle Apple Spatial Ambient Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212, 175, 55, 0.085), transparent 65%), radial-gradient(ellipse 60% 45% at 85% 95%, rgba(255, 255, 255, 0.035), transparent 70%)',
        }}
      />

      {/* Offline Connectivity Notice */}
      {!isOnline && (
        <div
          role="status"
          className="relative z-50 bg-[#181920] border-b border-[#D4AF37]/30 px-4 py-1.5 text-center text-xs text-[#E5C76B] flex items-center justify-center gap-2"
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode · Viewing cached MSNR Academy workspace</span>
        </div>
      )}

      {/* Apple Glass Top Bar */}
      <AppleTopBar
        activeWindow={isDesktop ? activeWindow : mobileActiveId}
        onSelectWindow={selectOrOpenWindow}
        onOpenVipJoin={() => setVipModalOpen(true)}
      />

      {/* Main Workspace Canvas */}
      <main className="relative z-10 flex-1 w-full px-3 sm:px-5 pt-4 pb-28 lg:pb-28">
        {isDesktop ? (
          <>
            {/* Desktop Empty State Launcher when all macOS windows are closed or minimized */}
            {visibleDesktopWindowsCount === 0 && (
              <div className="min-h-[calc(100vh-11rem)] flex items-center justify-center">
                <div className="apple-surface rounded-3xl p-8 max-w-md w-full text-center space-y-5">
                  <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden border border-white/15 shadow-lg">
                    <ResilientImage
                      src={settings.logoUrl}
                      alt={settings.siteName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold text-[#F5F5F7]">{settings.siteName}</h2>
                    <p className="text-xs text-[#A1A1AA]">
                      Select any window from the macOS Dock below or launch a workspace module:
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {WORKSPACE_NAV_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectOrOpenWindow(item.id)}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-[#F5F5F7] transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Floating macOS Windows (Desktop) */}
            {VALID_WINDOWS.map((winId) => {
              const meta = WINDOW_META[winId];
              return (
                <MacWindow
                  key={winId}
                  id={winId}
                  title={winId === 'home' ? settings.siteName : meta.title}
                  subtitle={meta.subtitle}
                  isOpen={openWindows[winId]}
                  isMinimized={minimizedWindows[winId]}
                  isMaximized={maximizedWindows[winId]}
                  zIndex={zMap[winId] || 10}
                  initialOffset={meta.offset}
                  onClose={handleCloseWindow}
                  onMinimize={handleMinimizeWindow}
                  onToggleMaximize={handleToggleMaximize}
                  onFocus={focusWindow}
                >
                  {renderWindowBody(winId)}
                </MacWindow>
              );
            })}

            {/* Subtle Desktop Secondary Navigation Strip (Bottom-Right Corner) */}
            <div className="hidden lg:flex fixed bottom-5 right-6 z-20 items-center gap-4 text-[11px] text-[#8E8E93]">
              <a href="./terms.html" className="hover:text-[#F5F5F7] transition-colors">
                Terms
              </a>
              <a href="./privacy.html" className="hover:text-[#F5F5F7] transition-colors">
                Privacy
              </a>
              <a href="./about.html" className="hover:text-[#F5F5F7] transition-colors">
                About
              </a>
              <a href="./contact.html" className="hover:text-[#F5F5F7] transition-colors">
                Contact
              </a>
            </div>
          </>
        ) : (
          /* iPhone-Inspired Single-Card Mobile Experience */
          <div className="max-w-2xl mx-auto space-y-5">
            <MacWindow
              id={mobileActiveId}
              title={
                mobileActiveId === 'home'
                  ? settings.siteName
                  : WINDOW_META[mobileActiveId].title
              }
              subtitle={WINDOW_META[mobileActiveId].subtitle}
              isOpen={true}
              isMinimized={false}
              isMaximized={false}
              zIndex={10}
              onClose={() => selectOrOpenWindow('home')}
              onMinimize={() => selectOrOpenWindow('home')}
              onToggleMaximize={() => {}}
              onFocus={() => {}}
            >
              {renderWindowBody(mobileActiveId)}
            </MacWindow>

            {/* Mobile Secondary Legal Links */}
            <div className="flex flex-wrap items-center justify-center gap-5 py-2 text-xs text-[#8E8E93]">
              <a href="./terms.html" className="hover:text-[#F5F5F7] transition-colors">
                Terms
              </a>
              <a href="./privacy.html" className="hover:text-[#F5F5F7] transition-colors">
                Privacy
              </a>
              <a href="./about.html" className="hover:text-[#F5F5F7] transition-colors">
                About
              </a>
              <a href="./contact.html" className="hover:text-[#F5F5F7] transition-colors">
                Contact
              </a>
            </div>
          </div>
        )}
      </main>

      {/* macOS Floating Magnification Dock (Desktop) / iPhone Bottom Tab Dock (Mobile) */}
      <AppleBottomDock
        activeWindow={isDesktop ? activeWindow : mobileActiveId}
        openWindows={openWindows}
        minimizedWindows={minimizedWindows}
        onSelectWindow={selectOrOpenWindow}
        onOpenVipJoin={() => setVipModalOpen(true)}
      />

      {/* Apple Glass Modals, YouTube Subscriber Gate & Real-Time Notification Center */}
      <VipJoinModal isOpen={vipModalOpen} onClose={() => setVipModalOpen(false)} />
      <InstallAppModal
        isOpen={installModal.open}
        initialTab={installModal.tab}
        onClose={() => setInstallModal((prev) => ({ ...prev, open: false }))}
      />
      <YoutubeGateOverlay />
      <NotificationCenter />
    </div>
  );
};

export default function App() {
  const initialPage = useMemo(() => detectInitialPage(), []);
  const [hashAdminOpen, setHashAdminOpen] = useState<boolean>(() => isHashAdmin());

  useEffect(() => {
    const syncAdminHash = () => {
      setHashAdminOpen(isHashAdmin());
    };
    window.addEventListener('hashchange', syncAdminHash);
    return () => window.removeEventListener('hashchange', syncAdminHash);
  }, []);

  const exitHashAdmin = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '#home');
    }
    setHashAdminOpen(false);
  }, []);

  return (
    <AcademyErrorBoundary>
      <AcademyProvider>
        {initialPage === 'admin' || hashAdminOpen ? (
          <Suspense
            fallback={
              <div className="min-h-screen bg-[#070709] text-[#A1A1AA] flex items-center justify-center text-xs font-medium">
                Loading MSNR Admin Console...
              </div>
            }
          >
            <AdminDashboard onExitAdmin={initialPage === 'admin' ? undefined : exitHashAdmin} />
          </Suspense>
        ) : initialPage === 'terms' ||
          initialPage === 'privacy' ||
          initialPage === 'about' ||
          initialPage === 'contact' ? (
          <StaticInfoPage page={initialPage} />
        ) : (
          <WorkspaceShell />
        )}
      </AcademyProvider>
    </AcademyErrorBoundary>
  );
}
