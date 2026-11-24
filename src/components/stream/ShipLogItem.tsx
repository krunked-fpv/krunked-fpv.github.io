import { motion } from 'framer-motion';
import { GitBranch, GitCommitHorizontal, Hammer, Package, Tag, GitPullRequest, Unlock } from 'lucide-react';
import { SPRING } from '../../config/site';
import { formatDelta, TIER_COLOR } from '../../domain/freshness';
import { humanizeName } from '../../domain/humanize';
import type { ShipKind, ShipLog } from '../../domain/shiplog';
import { useDeck } from '../../store/deckStore';
import { useNow } from '../../hooks/useNow';

const ICON: Record<ShipKind, typeof GitBranch> = {
  push: GitCommitHorizontal,
  repo: Hammer,
  branch: GitBranch,
  tag: Tag,
  release: Package,
  pr: GitPullRequest,
  public: Unlock,
};

export function ShipLogItem({ log, linkable }: { log: ShipLog; linkable: boolean }) {
  const now = useNow(15_000);
  const age = now - Date.parse(log.at);
  const color = age < 86_400_000 ? TIER_COLOR.fresh : age < 7 * 86_400_000 ? TIER_COLOR.active : TIER_COLOR.idle;
  const Icon = ICON[log.kind];
  const setPeek = useDeck((s) => s.setPeek);
  return (
    <motion.li layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="relative pl-6">
      <span className="absolute left-[5px] top-2 h-full w-px bg-white/[0.06]" aria-hidden="true" />
      <span className="absolute left-0 top-[7px] grid size-[11px] place-items-center rounded-full bg-ob-900" style={{ boxShadow: `0 0 0 1px ${color}` }}>
        <span className="size-[5px] rounded-full" style={{ background: color }} />
      </span>
      <div className="flex items-center justify-between gap-2">
        <span className="mono flex items-center gap-1.5 text-[10.5px] tracking-[0.08em]" style={{ color }}>
          <Icon size={11} /> {log.label}
        </span>
        <time className="mono shrink-0 text-[10.5px] text-mute" dateTime={log.at}>
          {formatDelta(age)}
        </time>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 pb-3.5">
        {linkable ? (
          <button type="button" onClick={() => setPeek(log.repo)} className="shrink-0 text-[13px] font-medium text-ink hover:text-volt">
            {humanizeName(log.repo)}
          </button>
        ) : (
          <span className="shrink-0 text-[13px] font-medium text-dim">{humanizeName(log.repo)}</span>
        )}
        {log.detail && <span className="mono min-w-0 truncate text-[11px] text-mute">{log.detail}</span>}
      </div>
    </motion.li>
  );
}
