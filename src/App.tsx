import { MotionConfig } from 'framer-motion';
import { Calendar, Radio, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFoley, useFoleySync } from './audio/useFoley';
import { FilterBar } from './components/collection/FilterBar';
import { ShipMatrix } from './components/collection/ShipMatrix';
import { ShowcaseBento } from './components/collection/ShowcaseBento';
import { TelemetryGrid } from './components/collection/TelemetryGrid';
import { FlagshipDock } from './components/dock/FlagshipDock';
import { HeroBand } from './components/hero/HeroBand';
import { StatusBar } from './components/layout/StatusBar';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/palette/CommandPalette';
import { PeekDrawer } from './components/peek/PeekDrawer';
import { SettingsModal } from './components/settings/SettingsModal';
import { SpotlightDeck } from './components/spotlight/SpotlightDeck';
import { ForgeStream } from './components/stream/ForgeStream';
import { IconButton } from './components/ui/IconButton';
import { Modal } from './components/ui/Modal';
import { ToastHost } from './components/ui/Toast';
import { SPRING, THEME_COLORS } from './config/site';
import { forceSync, startEngine } from './data/syncEngine';
import { useHotkeys } from './hooks/useHotkeys';
import { useDeck } from './store/deckStore';
import { filterProjects, sortProjects, spotlightOf, useProjects } from './store/selectors';
import type { Project, ThemeMode } from './types/project';

function syncThemeDocument(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'daylight' ? 'light' : 'dark';
  const meta =
    document.getElementById('meta-theme-color') ?? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

export function App() {
  useFoleySync();

  const prefs = useDeck((s) => s.vault.prefs);
  const syncPhase = useDeck((s) => s.sync.phase);
  const lastLive200At = useDeck((s) => s.sync.lastLive200At);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const showHidden = useDeck((s) => s.showHidden);
  const paletteOpen = useDeck((s) => s.paletteOpen);
  const settingsOpen = useDeck((s) => s.settingsOpen);
  const shipSheetOpen = useDeck((s) => s.shipSheetOpen);
  const peek = useDeck((s) => s.peek);

  const setShipSheet = useDeck((s) => s.setShipSheet);
  const setFilter = useDeck((s) => s.setFilter);
  const setView = useDeck((s) => s.setView);
  const setTheme = useDeck((s) => s.setTheme);
  const setPalette = useDeck((s) => s.setPalette);
  const setSettings = useDeck((s) => s.setSettings);
  const setChronoWindow = useDeck((s) => s.setChronoWindow);
  const foley = useFoley();

  const allProjects = useProjects({ includeHidden: true });
  const projects = useMemo(
    () => (showHidden ? allProjects : allProjects.filter((p) => !p.hidden)),
    [allProjects, showHidden],
  );
  const hiddenCount = useMemo(() => allProjects.filter((p) => p.hidden).length, [allProjects]);

  const spotlight = useMemo(() => spotlightOf(projects), [projects]);
  const [activeSpotlight, setActiveSpotlight] = useState<Project | null>(null);

  const resolvedSpotlight = useMemo(() => {
    if (activeSpotlight) {
      const fresh = spotlight.find((p) => p.name === activeSpotlight.name);
      if (fresh) return fresh;
    }
    return spotlight[0] ?? null;
  }, [activeSpotlight, spotlight]);

  const filtered = useMemo(() => {
    const base = filterProjects(projects, prefs.filter, chronoWindow);
    return sortProjects(base, prefs.sort);
  }, [projects, prefs.filter, prefs.sort, chronoWindow]);

  // Synchronize persisted theme -> DOM data-theme + #meta-theme-color
  useEffect(() => {
    syncThemeDocument(prefs.theme);
  }, [prefs.theme]);

  // Subtle sync completion chime when fresh 200 live telemetry arrives (safe no-op when muted)
  const prevLiveRef = useRef<number | null>(lastLive200At);
  useEffect(() => {
    if (lastLive200At && prevLiveRef.current !== null && lastLive200At !== prevLiveRef.current) {
      foley.sync();
    }
    prevLiveRef.current = lastLive200At;
  }, [lastLive200At, foley]);

  useEffect(() => {
    void startEngine();
  }, []);

  // Hash deep links: #palette, #settings, #peek/<slug>, #qr/<slug>
  useEffect(() => {
    const syncHash = () => {
      const h = window.location.hash;
      const st = useDeck.getState();
      if (h === '#palette') {
        st.setPalette(true);
      } else if (h === '#settings') {
        st.setSettings(true);
      } else if (h.startsWith('#peek/')) {
        const name = decodeURIComponent(h.slice('#peek/'.length));
        if (name) st.setPeek(name, null, null);
      } else if (h.startsWith('#qr/')) {
        const name = decodeURIComponent(h.slice('#qr/'.length));
        if (name) st.setPeek(name, null, 'qr');
      } else if (!h) {
        if (st.peek) st.setPeek(null);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next: ThemeMode = prefs.theme === 'daylight' ? 'obsidian' : 'daylight';
    foley.click();
    const commit = () => {
      syncThemeDocument(next);
      setTheme(next);
    };
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (!reduced && typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit);
    } else {
      commit();
    }
  }, [prefs.theme, setTheme, foley]);

  const anyOverlayOpen = Boolean(paletteOpen || settingsOpen || shipSheetOpen || peek);

  useHotkeys({
    modalOpen: anyOverlayOpen,
    onPalette: () => {
      foley.relay();
      setPalette(true);
    },
    onView: (v) => {
      foley.click();
      setView(v);
    },
    onToggleTheme: handleToggleTheme,
    onToggleSound: () => foley.toggle(),
    onForceSync: () => {
      foley.click();
      void forceSync();
    },
    onOpenSettings: () => {
      foley.click();
      setSettings(true, 'diagnostics');
    },
    onEscape: () => {
      if (chronoWindow) {
        foley.tick();
        setChronoWindow(null);
      }
    },
  });

  const loading = projects.length === 0 && (syncPhase === 'BOOT' || syncPhase === 'REVALIDATING');

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <div className="flex min-h-screen w-full flex-col overflow-x-clip bg-chassis text-ink">
        <TopBar />

        <main className="w-full flex-1 overflow-x-clip">
          <HeroBand projects={projects} activeSpotlight={resolvedSpotlight} />

          {/* FEATURED EXHIBITION STAGE — Fits cleanly above the 900px fold in Obsidian & Daylight */}
          <section aria-label="Featured Exhibition" className="mx-auto max-w-[1400px] px-4 pb-5 pt-3 sm:px-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="beacon" style={{ ['--c' as string]: 'var(--led-hot)' }} aria-hidden="true" />
                <h2 className="eyebrow text-dim!">Featured Exhibition</h2>
                <span className="mono hidden text-[10.5px] tracking-[0.14em] text-mute sm:inline">
                  · {String(spotlight.length).padStart(2, '0')} ACTIVE BUILDS
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  foley.click();
                  setShipSheet(true);
                }}
                className="btn min-h-8! shrink-0 gap-1.5 px-3 text-[12px] lg:hidden!"
              >
                <Radio size={13} className="text-phosphor-ink" /> Ship Log
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="skeleton h-[460px] lg:col-span-8" />
                <div className="skeleton hidden h-[460px] lg:col-span-4 lg:block" />
              </div>
            ) : (
              <SpotlightDeck
                projects={spotlight}
                allProjects={projects}
                onActiveChange={setActiveSpotlight}
              />
            )}
          </section>

          <FlagshipDock projects={projects} />

          <FilterBar projects={projects} hiddenCount={hiddenCount} />

          {/* Chrono-Pulse Active Sprint Window Banner */}
          {chronoWindow && (
            <div className="mx-auto max-w-[1400px] px-4 pt-5 sm:px-6">
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-hairline-strong bg-inset px-4 py-2.5 text-[12.5px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Calendar size={14} className="shrink-0 text-hot-ink" />
                  <span className="mono font-medium text-ink">
                    CHRONO WINDOW:{' '}
                    {chronoWindow.startDate === chronoWindow.endDate
                      ? chronoWindow.startDate
                      : `${chronoWindow.startDate} to ${chronoWindow.endDate}`}
                  </span>
                  <span className="mono text-[11px] text-dim">
                    · {chronoWindow.totalCount} {chronoWindow.totalCount === 1 ? 'commit' : 'commits'} across{' '}
                    {chronoWindow.repos.length} {chronoWindow.repos.length === 1 ? 'repo' : 'repos'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    foley.click();
                    setChronoWindow(null);
                  }}
                  className="btn min-h-7! gap-1 px-2.5 text-[11.5px]"
                >
                  <X size={12} /> Clear Window
                </button>
              </div>
            </div>
          )}

          {/* Studio Collection Gallery / Index / Timeline */}
          <section aria-label="Applications and repositories" className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-[348px]" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="surface flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="text-[16px] font-semibold tracking-[-0.02em] text-ink">No builds match this filter</p>
                <p className="max-w-md text-[13.5px] leading-relaxed text-dim">
                  {chronoWindow
                    ? 'No visible repositories matched both your active filter and selected Chrono-Pulse date window.'
                    : prefs.filter === 'pinned'
                      ? 'Pin apps from any card or press P in the command palette to collect them in your Pinned Dock.'
                      : 'Try switching back to Live Apps or browsing All Repos.'}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {chronoWindow && (
                    <button
                      type="button"
                      onClick={() => {
                        foley.click();
                        setChronoWindow(null);
                      }}
                      className="btn"
                    >
                      Clear Date Window
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      foley.click();
                      setFilter('live');
                    }}
                    className="btn btn-primary"
                  >
                    Show Live Apps
                  </button>
                </div>
              </div>
            ) : prefs.view === 'bento' ? (
              <ShowcaseBento projects={filtered} />
            ) : prefs.view === 'grid' ? (
              <TelemetryGrid projects={filtered} />
            ) : (
              <ShipMatrix projects={filtered} />
            )}
          </section>
        </main>

        <StatusBar projects={projects} />

        <CommandPalette projects={projects} />
        <PeekDrawer projects={allProjects} />
        <SettingsModal />
        <ToastHost />

        {/* Mobile / Tablet Ship-Log Sheet */}
        <Modal open={shipSheetOpen} onClose={() => setShipSheet(false)} label="Forge Stream" mobileSheet>
          <div className="surface surface-elevated flex max-h-[82dvh] flex-col overflow-hidden rounded-[16px]! bg-surface">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-phosphor-ink" />
                <span className="eyebrow text-dim!">Live Ship Log</span>
              </div>
              <IconButton label="Close ship log" onClick={() => setShipSheet(false)}>
                <X size={17} />
              </IconButton>
            </div>
            <ForgeStream
              projects={projects}
              limit={40}
              embedded
              className="max-h-[70dvh] rounded-none! border-0 shadow-none"
            />
          </div>
        </Modal>
      </div>
    </MotionConfig>
  );
}

export default App;
