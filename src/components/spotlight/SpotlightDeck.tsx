import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { SpotlightTile, type TileVariant } from './SpotlightTile';

const LAYOUT: { variant: TileVariant; cls: string }[] = [
  { variant: 'lead', cls: 'lg:col-span-4 lg:row-span-2 lg:min-h-[388px]' },
  { variant: 'medium', cls: 'lg:col-span-2 lg:min-h-[188px]' },
  { variant: 'medium', cls: 'lg:col-span-2 lg:min-h-[188px]' },
  { variant: 'compact', cls: 'lg:col-span-3 lg:min-h-[182px]' },
  { variant: 'compact', cls: 'lg:col-span-3 lg:min-h-[182px]' },
];

/** Asymmetric spotlight deck engineered so Lead title + controls sit cleanly above the 900px desktop fold. */
export function SpotlightDeck({ projects }: { projects: Project[] }) {
  const seenAtLoad = useRef(useDeck.getState().vault.seen);
  const markSeen = useDeck((s) => s.markSeen);
  const foley = useFoley();
  const railRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  // After a dwell, remember latest SHA per spotlighted repo (drives "+N NEW" badge)
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

  const scrollToSlide = (idx: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const child = rail.children[idx] as HTMLElement | undefined;
    if (!child) return;
    foley.tick();
    child.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setActiveSlide(idx);
  };

  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 4) return;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < rail.children.length; i++) {
      const el = rail.children[i] as HTMLElement;
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(elCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    setActiveSlide(bestIdx);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <motion.div
        ref={railRef}
        onScroll={onRailScroll}
        layout
        className="hide-scroll flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-6 lg:gap-3.5 lg:overflow-visible lg:pb-0"
      >
        {projects.map((p, i) => {
          const slot = LAYOUT[i] ?? LAYOUT[4]!;
          return (
            <div
              key={p.id}
              className={`flex w-[86vw] max-w-[340px] shrink-0 snap-center sm:w-[62vw] sm:max-w-none lg:w-auto ${slot.cls}`}
            >
              <SpotlightTile project={p} variant={slot.variant} newCommits={newCount(p)} className="w-full min-w-0" />
            </div>
          );
        })}
      </motion.div>

      {/* Mobile/tablet slide index indicators */}
      {projects.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 lg:hidden" role="tablist" aria-label="Spotlight slides">
          {projects.map((p, i) => {
            const on = i === activeSlide;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`Jump to spotlight ${i + 1}: ${p.displayName}`}
                onClick={() => scrollToSlide(i)}
                className={`h-1.5 rounded-full transition-all ${
                  on ? 'w-6 bg-hot' : 'w-2 bg-hairline-strong hover:bg-mute'
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
