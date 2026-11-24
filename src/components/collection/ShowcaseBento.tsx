import { AnimatePresence, motion } from 'framer-motion';
import type { Project } from '../../types/project';
import { AppCard } from './AppCard';

export function ShowcaseBento({ projects }: { projects: Project[] }) {
  return (
    <motion.div layout className="grid grid-flow-dense grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {projects.map((p, i) => (
          <AppCard key={p.id} project={p} index={i} big={projects.length > 7 && i % 7 === 0} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
