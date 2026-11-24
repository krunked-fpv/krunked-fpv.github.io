import { AnimatePresence, motion } from 'framer-motion';
import { GitBranch } from 'lucide-react';
import { SPRING } from '../../config/site';
import type { Project } from '../../types/project';

/** Latest commit: branch badge + 7-char SHA + message. Slides up when it changes. */
export function CommitTicker({ project }: { project: Project }) {
  const c = project.latestCommit;
  if (!c) return <div className="mono text-[11px] text-mute">no commit data yet</div>;
  const sha = c.sha.slice(0, 7);
  return (
    <div className="relative h-[22px] overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={c.sha}
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -22, opacity: 0 }}
          transition={SPRING}
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <span className="chip shrink-0" style={{ height: 20 }}>
            <GitBranch size={11} />
            {project.defaultBranch}
          </span>
          <a
            className="above mono shrink-0 text-[11px] text-volt hover:underline"
            href={`${project.sourceUrl}/commit/${c.sha}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sha}
          </a>
          <span className="min-w-0 truncate text-[12px] text-dim">{c.message || 'new push'}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
