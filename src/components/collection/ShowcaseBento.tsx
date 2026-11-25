import { AnimatePresence, motion } from 'framer-motion';
import { useFoley } from '../../audio/useFoley';
import { useSpatialNav } from '../../hooks/useSpatialNav';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { AppCard } from './AppCard';

export function ShowcaseBento({ projects }: { projects: Project[] }) {
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const { containerRef, onKeyDown } = useSpatialNav<HTMLDivElement>({
    onPeek: (slug) => {
      const p = projects.find((x) => x.name === slug);
      foley.latch();
      setPeek(slug, 'card', p?.launchUrl ? 'sandbox' : 'brief');
    },
    onQr: (slug) => {
      const p = projects.find((x) => x.name === slug);
      if (!p?.launchUrl) return;
      foley.click();
      setPeek(slug, 'card', 'qr');
    },
    onPin: (slug) => {
      const p = projects.find((x) => x.name === slug);
      if (!p) return;
      foley.latch();
      togglePin(slug);
      toast(p.pinned ? `Unpinned ${p.displayName}` : `Pinned ${p.displayName} to dock`, 'ok');
    },
    onMove: () => foley.tick(),
  });

  return (
    <motion.div
      ref={containerRef}
      onKeyDown={onKeyDown}
      layout
      className="grid grid-flow-dense grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {projects.map((p, i) => (
          <AppCard key={p.id} project={p} index={i} big={projects.length > 6 && i % 7 === 0} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
