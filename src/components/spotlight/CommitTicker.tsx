import { AnimatePresence, motion } from 'framer-motion';
import { GitBranch } from 'lucide-react';
import { SPRING } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';

/** Latest commit: branch badge + 7-char SHA + message. Slides up on head update. */
export function CommitTicker({ project, showMeta = false }: { project: Project; showMeta?: boolean }) {
  const now = useNow(30_000);
  const c = project.latestCommit;
  if (!c) {
    return (
      <div className="mono flex h-[22px] items-center gap-2 text-[11px] text-mute">
        <GitBranch size={11} className="shrink-0" />
        <span>{project.defaultBranch}</span>
        <span className="opacity-50">/</span>
        <span className="truncate">snapshot telemetry standby</span>
      </div>
    );
  }
  const sha = c.sha.slice(0, 7);
  const commitUrl = c.url ?? `${project.sourceUrl}/commit/${c.sha}`;

  return (
    <div className="relative h-[22px] overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={c.sha}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={SPRING}
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <span className="chip shrink-0" style={{ height: 20 }}>
            <GitBranch size={10} />
            {project.defaultBranch}
          </span>
          <a
            className="above mono shrink-0 text-[11px] font-medium text-hot-ink hover:underline"
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sha}
          </a>
          <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{c.message || 'latest push'}</span>
          {showMeta && c.date && (
            <span className="mono hidden shrink-0 text-[10.5px] text-mute sm:inline">
              {formatDelta(now - Date.parse(c.date))}
            </span>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
