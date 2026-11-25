import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Layers, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { Glyph } from '../art/Glyph';
import { ForgeStream } from '../stream/ForgeStream';
import { Sparkline } from '../viz/Sparkline';
import { TIER_TOKENS } from './FreshnessBadge';
import { SpotlightTile } from './SpotlightTile';

type PanelTab = 'featured' | 'shiplog';

export interface SpotlightDeckProps {
  projects: Project[];
  allProjects?: Project[];
  onActiveChange?: (project: Project | null) => void;
}

/**
 * 12-Column Interactive Exhibition Stage engineered to sit cleanly above the 900px desktop fold
 * in both Obsidian and Daylight:
 * - Left 8 cols: Full-bleed animated Main Stage showcasing the selected featured world.
 * - Right 4 cols: Height-matched tactile selector deck switching seamlessly between Featured (5) & Ship Log.
 */
export function SpotlightDeck({ projects, allProjects, onActiveChange }: SpotlightDeckProps) {
  const seenAtLoad = useRef(useDeck.getState().vault.seen);
  const markSeen = useDeck((s) => s.markSeen);
  const foley = useFoley();
  const now = useNow(30_000);

  const [activeIdx, setActiveIdx] = useState(0);
  const [panelTab, setPanelTab] = useState<PanelTab>('featured');

  const safeIdx = projects.length > 0 ? Math.min(activeIdx, projects.length - 1) : 0;
  const activeProject = projects[safeIdx] ?? null;

  // Notify parent (HeroBand ambient glow) whenever the showcased world changes
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

  const newCount = (p: Project): number | null => {
    const seen = seenAtLoad.current[p.name];
    const head = p.latestCommit?.sha;
    if (!seen || !head || seen === head) return null;
    const idx = p.recentCommits.findIndex((c) => c.sha === seen);
    return idx > 0 ? idx : 1;
  };

  const selectIndex = (idx: number) => {
    if (idx < 0 || idx >= projects.length) return;
    if (idx !== safeIdx) foley.tick();
    setActiveIdx(idx);
  };

  if (!activeProject) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
      {/* Left 8 Columns: Main Exhibition Stage */}
      <div className="min-w-0 lg:col-span-8">
        <AnimatePresence mode="wait" initial={false}>
          <SpotlightTile
            key={activeProject.id}
            project={activeProject}
            variant="lead"
            newCommits={newCount(activeProject)}
            index={safeIdx}
            total={projects.length}
            className="w-full"
          />
        </AnimatePresence>

        {/* Mobile / Tablet (<1024px) Horizontal Tactile Selector Pills with clean scroll-fade */}
        {projects.length > 1 && (
          <div className="relative mt-3 w-full min-w-0 overflow-hidden lg:hidden">
            <div
              role="tablist"
              aria-label="Featured builds"
              className="hide-scroll flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 pr-10"
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
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition active:scale-[0.98] ${
                      selected
                        ? 'border-hot/60 bg-elevated text-ink shadow-sm'
                        : 'border-hairline bg-surface text-dim hover:border-hairline-strong hover:text-ink'
                    }`}
                  >
                    <span className={`mono text-[10.5px] font-semibold ${selected ? 'text-hot-ink' : 'text-mute'}`}>
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

      {/* Right 4 Columns (Desktop): Height-Matched Tactile Switcher & Live Dispatch Panel */}
      <div className="hidden min-w-0 lg:col-span-4 lg:flex lg:h-[490px] lg:flex-col">
        <div className="surface surface-static flex h-full min-h-0 flex-col overflow-hidden rounded-[16px]!">
          {/* Segmented Panel Switcher: Featured (5) | Ship Log */}
          <div className="shrink-0 border-b border-hairline bg-inset/65 p-2">
            <div
              role="tablist"
              aria-label="Exhibition rail view"
              className="grid grid-cols-2 gap-1 rounded-[10px] bg-chassis/55 p-1 shadow-[var(--shadow-inset)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'featured'}
                onClick={() => {
                  if (panelTab !== 'featured') foley.tick();
                  setPanelTab('featured');
                }}
                className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition ${
                  panelTab === 'featured'
                    ? 'bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
                    : 'text-mute hover:text-dim'
                }`}
              >
                <Layers size={12.5} aria-hidden="true" />
                <span>Featured</span>
                <span className="mono text-[10.5px] text-mute">({projects.length})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'shiplog'}
                onClick={() => {
                  if (panelTab !== 'shiplog') foley.tick();
                  setPanelTab('shiplog');
                }}
                className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition ${
                  panelTab === 'shiplog'
                    ? 'bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
                    : 'text-mute hover:text-dim'
                }`}
              >
                <span
                  className="beacon scale-[0.82]"
                  style={{ ['--c' as string]: 'var(--led-online)' }}
                  aria-hidden="true"
                />
                <Radio size={12.5} className="text-phosphor-ink" aria-hidden="true" />
                <span>Ship Log</span>
              </button>
            </div>
          </div>

          {/* Panel Content */}
          {panelTab === 'featured' ? (
            <div
              role="listbox"
              aria-label="Featured exhibition selector"
              className="flex min-h-0 flex-1 flex-col divide-y divide-hairline"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  selectIndex((safeIdx + 1) % projects.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  selectIndex((safeIdx - 1 + projects.length) % projects.length);
                }
              }}
            >
              {projects.map((p, i) => {
                const selected = i === safeIdx;
                const hue = hueOf(p);
                const tok = TIER_TOKENS[p.freshness.tier];
                const num = String(i + 1).padStart(2, '0');
                const ageStr = formatDelta(Math.max(0, now - Date.parse(p.lastActivityAt)));

                return (
                  <div
                    key={p.id}
                    role="option"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectIndex(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectIndex(i);
                      }
                    }}
                    className={`group relative flex min-h-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      selected ? 'bg-elevated/85' : 'bg-transparent hover:bg-hover'
                    }`}
                  >
                    {/* Active International Orange Indicator Bar */}
                    {selected && (
                      <motion.span
                        layoutId="spotlight-active-bar"
                        transition={SPRING}
                        className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-hot"
                        aria-hidden="true"
                      />
                    )}

                    <span
                      className={`mono w-5 shrink-0 text-[11px] font-semibold tracking-wider ${
                        selected ? 'text-hot-ink' : 'text-mute'
                      }`}
                    >
                      {num}
                    </span>

                    <Glyph name={p.glyph} hue={hue} size={32} className="shrink-0" />

                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[14px] leading-snug font-semibold tracking-[-0.015em] transition-colors ${
                          selected ? 'text-ink' : 'text-dim group-hover:text-ink'
                        }`}
                      >
                        {p.displayName}
                      </div>
                      <div className="mono mt-0.5 flex items-center gap-1.5 text-[10.5px] text-mute">
                        <span className="truncate">{p.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className={p.freshness.tier === 'fresh' ? 'text-hot-ink' : 'text-mute'}>{ageStr}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Sparkline
                        values={p.sparkline}
                        color={selected ? 'var(--led-hot)' : tok.dot}
                        width={46}
                        height={18}
                        animate={false}
                        showBaseline={false}
                        showEndDot={selected}
                      />
                      {p.launchUrl && (
                        <a
                          href={p.launchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            foley.relay();
                          }}
                          aria-label={`Launch ${p.displayName}`}
                          title={`Launch ${p.displayName}`}
                          className="grid size-7 place-items-center rounded-[7px] text-mute opacity-75 transition hover:bg-surface hover:text-hot-ink hover:opacity-100"
                        >
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <ForgeStream
              projects={allProjects ?? projects}
              embedded
              className="min-h-0 flex-1 rounded-none! border-0 shadow-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}
