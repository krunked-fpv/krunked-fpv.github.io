import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { TIER_TOKENS } from './FreshnessBadge';
import { SpotlightTile } from './SpotlightTile';

export interface SpotlightDeckProps {
  projects: Project[];
  allProjects?: Project[];
  onActiveChange?: (project: Project | null) => void;
}

/**
 * 5-Blade Expanding Monolith Accordion:
 * - Desktop (lg+): 5 full-height side-by-side monolith blades (`h-[410px]`) inside a crisp 1px hairline frame.
 *   Active blade expands smoothly (`flex-[5.2]`) showcasing animated bespoke artwork + primary CTAs;
 *   collapsed blades (`flex-[1]`) reveal dramatic vertical crops of each world and glide open on click/hover/keyboard.
 * - Mobile (<1024px): Single full-width cinema blade + sleek scroll-faded `01..05` selector pills beneath.
 */
export function SpotlightDeck({ projects, onActiveChange }: SpotlightDeckProps) {
  const seenAtLoad = useRef(useDeck.getState().vault.seen);
  const markSeen = useDeck((s) => s.markSeen);
  const foley = useFoley();

  const [activeIdx, setActiveIdx] = useState(0);
  const hoverTimerRef = useRef<number | null>(null);

  const safeIdx = projects.length > 0 ? Math.min(activeIdx, projects.length - 1) : 0;
  const activeProject = projects[safeIdx] ?? null;

  // Notify parent (HeroCanvas hue sync) whenever the active world changes
  useEffect(() => {
    onActiveChange?.(activeProject);
  }, [activeProject, onActiveChange]);

  // After an 8s dwell, remember latest SHA per spotlighted repo (drives "+N NEW" badge)
  useEffect(() => {
    const t = setTimeout(() => {
      for (const p of projects) if (p.latestCommit) markSeen(p.name, p.latestCommit.sha);
    }, 8000);
    return () => clearTimeout(t);
  }, [projects, markSeen]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const newCount = (p: Project): number | null => {
    const seen = seenAtLoad.current[p.name];
    const head = p.latestCommit?.sha;
    if (!seen || !head || seen === head) return null;
    const idx = p.recentCommits.findIndex((c) => c.sha === seen);
    return idx > 0 ? idx : 1;
  };

  const selectIndex = useCallback(
    (idx: number) => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (idx < 0 || idx >= projects.length) return;
      if (idx !== safeIdx) foley.tick();
      setActiveIdx(idx);
    },
    [projects.length, safeIdx, foley],
  );

  const scheduleHoverSelect = (idx: number) => {
    if (idx === safeIdx) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      selectIndex(idx);
    }, 95);
  };

  const cancelHoverSelect = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  if (!activeProject) return null;

  return (
    <div className="w-full min-w-0">
      {/* Desktop (lg+): 5-Blade Expanding Monolith Cinema Accordion */}
      <div
        role="region"
        aria-label="Featured worlds exhibition blades"
        onMouseLeave={cancelHoverSelect}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            selectIndex((safeIdx + 1) % projects.length);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            selectIndex((safeIdx - 1 + projects.length) % projects.length);
          }
        }}
        className="hidden h-[410px] w-full gap-px overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-hairline lg:flex"
      >
        {projects.map((p, i) => {
          const isActive = i === safeIdx;
          const num = String(i + 1).padStart(2, '0');
          const hue = hueOf(p);
          const tok = TIER_TOKENS[p.freshness.tier];

          if (isActive) {
            return (
              <div
                key={p.id}
                className="relative flex min-w-0 flex-[5.2] overflow-hidden bg-surface transition-[flex-grow] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
              >
                <SpotlightTile
                  project={p}
                  variant="lead"
                  blade
                  newCommits={newCount(p)}
                  index={i}
                  total={projects.length}
                />
              </div>
            );
          }

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => selectIndex(i)}
              onMouseEnter={() => scheduleHoverSelect(i)}
              aria-label={`Inspect featured world ${num}: ${p.displayName}`}
              className="group relative flex min-w-[96px] flex-[1] cursor-pointer flex-col justify-between overflow-hidden bg-surface text-left transition-[flex-grow] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] focus-visible:z-10"
            >
              {/* Hover Kinetic Acid-Lime Top Edge */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-[2px] bg-transparent transition-colors duration-200 group-hover:bg-hot"
              />

              {/* Vertical Crop of Bespoke WorldVisual Artwork */}
              <div className="pointer-events-none absolute inset-0 z-0 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]">
                <CoverArt project={p} fill scrim="blade" />
              </div>

              {/* Top Blade Index & Freshness LED */}
              <div className="relative z-[2] flex w-full items-center justify-between gap-2 p-3.5">
                <span className="mono text-[11px] font-semibold tracking-[0.14em] text-ink/85 transition-colors group-hover:text-hot-ink">
                  {num}
                </span>
                <span
                  className="led-dot"
                  style={{ ['--c' as string]: tok.dot }}
                  aria-hidden="true"
                />
              </div>

              {/* Bottom Anchored Blade Identity */}
              <div className="relative z-[2] mt-auto flex w-full min-w-0 flex-col gap-2 p-3.5">
                <Glyph name={p.glyph} hue={hue} size={28} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-[1.18] tracking-[-0.02em] text-ink transition-colors group-hover:text-hot-ink">
                    {p.displayName}
                  </div>
                  <div className="mono mt-1 truncate text-[9.5px] font-medium tracking-[0.13em] text-dim uppercase">
                    {p.category}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mobile / Tablet (<1024px): Single Active Cinema Blade + Scroll-Faded Selector Strip */}
      <div className="lg:hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeProject.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <SpotlightTile
              project={activeProject}
              variant="lead"
              newCommits={newCount(activeProject)}
              index={safeIdx}
              total={projects.length}
            />
          </motion.div>
        </AnimatePresence>

        {projects.length > 1 && (
          <div className="relative mt-3 w-full min-w-0 overflow-hidden">
            <div
              role="tablist"
              aria-label="Featured worlds"
              className="hide-scroll flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-1 pr-10"
              style={{
                maskImage: 'linear-gradient(90deg, #000 0%, #000 calc(100% - 36px), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 calc(100% - 36px), transparent 100%)',
              }}
            >
              {projects.map((p, i) => {
                const selected = i === safeIdx;
                const num = String(i + 1).padStart(2, '0');
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectIndex(i)}
                    className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition active:scale-[0.98] ${
                      selected
                        ? 'border-hot/70 bg-elevated text-ink'
                        : 'border-hairline bg-surface text-dim hover:border-hairline-strong hover:text-ink'
                    }`}
                  >
                    <span className={`mono text-[10px] font-semibold ${selected ? 'text-hot-ink' : 'text-mute'}`}>
                      {num}
                    </span>
                    <span>{p.displayName}</span>
                  </button>
                );
              })}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-chassis to-transparent"
            />
          </div>
        )}
      </div>
    </div>
  );
}
