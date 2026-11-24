import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { SpotlightTile, type TileVariant } from './SpotlightTile';

const LAYOUT: { variant: TileVariant; cls: string }[] = [
  { variant: 'lead', cls: 'lg:col-span-4 lg:row-span-2 lg:min-h-[440px]' },
  { variant: 'medium', cls: 'lg:col-span-2 lg:min-h-[214px]' },
  { variant: 'medium', cls: 'lg:col-span-2 lg:min-h-[214px]' },
  { variant: 'compact', cls: 'lg:col-span-3 lg:min-h-[210px]' },
  { variant: 'compact', cls: 'lg:col-span-3 lg:min-h-[210px]' },
];

/** Asymmetric bento of the most recently pushed projects. */
export function SpotlightDeck({ projects }: { projects: Project[] }) {
  const seenAtLoad = useRef(useDeck.getState().vault.seen);
  const markSeen = useDeck((s) => s.markSeen);

  // after a dwell, remember the latest SHA per spotlighted repo (drives "+N commits since last visit")
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

  return (
    <motion.div
      layout
      className="hide-scroll flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:pb-0"
    >
      {projects.map((p, i) => {
        const slot = LAYOUT[i] ?? LAYOUT[4]!;
        return (
          <div key={p.id} className={`flex w-[320px] max-w-full shrink-0 snap-center sm:w-[62vw] sm:max-w-none lg:w-auto ${slot.cls}`}>
            <SpotlightTile project={p} variant={slot.variant} newCommits={newCount(p)} className="w-full min-w-0" />
          </div>
        );
      })}
    </motion.div>
  );
}
