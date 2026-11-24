import { MotionConfig } from 'framer-motion';
import { Radio, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { SPRING } from './config/site';
import { startEngine } from './data/syncEngine';
import { useHotkeys } from './hooks/useHotkeys';
import { useDeck } from './store/deckStore';
import { filterProjects, sortProjects, spotlightOf, useProjects } from './store/selectors';
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

export function App() {
  const prefs = useDeck((s) => s.vault.prefs);
  const syncPhase = useDeck((s) => s.sync.phase);
  const shipSheetOpen = useDeck((s) => s.shipSheetOpen);
  const setShipSheet = useDeck((s) => s.setShipSheet);
  const setFilter = useDeck((s) => s.setFilter);
  const setPalette = useDeck((s) => s.setPalette);

  const projects = useProjects();
  const spotlight = useMemo(() => spotlightOf(projects), [projects]);
  const filtered = useMemo(
    () => sortProjects(filterProjects(projects, prefs.filter), prefs.sort),
    [projects, prefs.filter, prefs.sort],
  );

  useEffect(() => {
    void startEngine();
  }, []);

  useEffect(() => {
    const syncHash = () => {
      const h = window.location.hash;
      if (h === '#palette') {
        useDeck.getState().setPalette(true);
      } else if (h.startsWith('#peek/')) {
        const name = decodeURIComponent(h.slice('#peek/'.length));
        if (name) useDeck.getState().setPeek(name);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useHotkeys(() => setPalette(true));

  const loading = projects.length === 0 && (syncPhase === 'BOOT' || syncPhase === 'REVALIDATING');

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <div className="min-h-screen w-full overflow-x-clip">
        <TopBar />

        <main className="w-full overflow-x-clip">
          <HeroBand projects={projects} />

          {/* FRESH OFF THE FORGE */}
          <section aria-label="Fresh off the forge" className="mx-auto max-w-[1480px] px-4 pb-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="beacon" style={{ ['--c' as string]: '#10B981' }} aria-hidden="true" />
                <h2 className="eyebrow text-dim!">Fresh off the forge</h2>
                <span className="mono hidden text-[10.5px] text-mute sm:inline">· LATEST SHIPPED &amp; PUSHED</span>
              </div>
              <button
                type="button"
                onClick={() => setShipSheet(true)}
                className="btn min-h-8! shrink-0 gap-1.5 px-3 text-[12px] xl:hidden!"
              >
                <Radio size={13} className="text-phosphor" /> Ship Log
              </button>
            </div>

            {loading ? (
              <div className="grid gap-4 lg:grid-cols-6">
                <div className="skeleton h-[440px] lg:col-span-4 lg:row-span-2" />
                <div className="skeleton h-[212px] lg:col-span-2" />
                <div className="skeleton h-[212px] lg:col-span-2" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
                <div className="min-w-0 xl:col-span-8">
                  <SpotlightDeck projects={spotlight} />
                </div>
                <ForgeStream projects={projects} className="hidden xl:sticky xl:top-[72px] xl:col-span-4 xl:flex xl:h-[666px]" />
              </div>
            )}
          </section>

          <FlagshipDock projects={projects} />

          <FilterBar projects={projects} />

          <section aria-label="Applications and repositories" className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton h-[280px]" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="surface flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="text-[15px] font-medium text-ink">No builds match this filter</p>
                <p className="text-[13px] text-mute">
                  {prefs.filter === 'pinned'
                    ? 'Pin apps from any card or command palette to collect them here.'
                    : 'Try switching back to Live Apps or All Repositories.'}
                </p>
                <button type="button" onClick={() => setFilter('live')} className="btn mt-1">
                  Show Live Apps
                </button>
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
        <PeekDrawer projects={projects} />
        <SettingsModal />
        <ToastHost />

        {/* Mobile / Tablet Ship-Log Sheet */}
        <Modal open={shipSheetOpen} onClose={() => setShipSheet(false)} label="Forge Stream">
          <div className="surface flex max-h-[80dvh] flex-col overflow-hidden rounded-[20px]!" style={{ background: 'var(--color-ob-900)' }}>
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-phosphor" />
                <span className="eyebrow text-dim!">Live Ship Log</span>
              </div>
              <IconButton label="Close ship log" onClick={() => setShipSheet(false)}>
                <X size={17} />
              </IconButton>
            </div>
            <ForgeStream projects={projects} limit={40} className="rounded-none! border-0 shadow-none max-h-[70dvh]" />
          </div>
        </Modal>
      </div>
    </MotionConfig>
  );
}
export default App;
