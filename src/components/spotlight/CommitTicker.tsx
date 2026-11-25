import { AnimatePresence, motion } from 'framer-motion';
import { GitBranch } from 'lucide-react';
import { SPRING } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';

/** Latest commit telemetry line: sharp branch tag + 7-char SHA + message. */
export function CommitTicker({ project, showMeta = false }: { project: Project; showMeta?: boolean }) {
  const now = useNow(30_000);
  const c = project.latestCommit;
  if (!c) {
    return (
      <div className="mono flex h-[22px] min-w-0 items-center gap-2 text-[11px] text-mute">
        <GitBranch size={11} className="shrink-0" aria-hidden="true" />
        <span className="shrink-0">{project.defaultBranch}</span>
        <span className="opacity-50" aria-hidden="true">
          /
        </span>
        <span className="truncate">snapshot telemetry standby</span>
      </div>
    );
  }
  const sha = c.sha.slice(0, 7);
  const commitUrl = c.url ?? `${project.sourceUrl}/commit/${c.sha}`;

  return (
    <div className="relative h-[22px] min-w-0 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={`${project.id}-${c.sha}`}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={SPRING}
          className="flex min-w-0 items-center gap-2 whitespace-nowrap"
        >
          <span className="chip h-[20px]! shrink-0 rounded-[var(--radius-xs)]! px-1.5! text-[10px]!">
            <GitBranch size={10} aria-hidden="true" />
            {project.defaultBranch}
          </span>
          <a
            className="above mono shrink-0 text-[11px] font-semibold text-hot-ink hover:underline"
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sha}
          </a>
          <span className="min-w-0 flex-1 truncate text-[12px] text-dim" title={c.message || 'latest push'}>
            {c.message || 'latest push'}
          </span>
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
