import { motion } from 'framer-motion';
import { GitBranch, GitCommitHorizontal, GitPullRequest, Hammer, Package, Tag, Unlock } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { humanizeName } from '../../domain/humanize';
import type { ShipKind, ShipLog } from '../../domain/shiplog';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import { SwissEmblem } from '../art/SwissEmblem';
import { TIER_TOKENS } from '../spotlight/FreshnessBadge';

const ICON: Record<ShipKind, typeof GitBranch> = {
  push: GitCommitHorizontal,
  repo: Hammer,
  branch: GitBranch,
  tag: Tag,
  release: Package,
  pr: GitPullRequest,
  public: Unlock,
};

export function ShipLogItem({
  log,
  linkable,
  displayName,
  isLive = false,
}: {
  log: ShipLog;
  linkable: boolean;
  displayName?: string;
  isLive?: boolean;
}) {
  const now = useNow(15_000);
  const age = now - Date.parse(log.at);
  const tier = age < 86_400_000 ? 'fresh' : age < 7 * 86_400_000 ? 'active' : 'idle';
  const tok = TIER_TOKENS[tier];
  const Icon = ICON[log.kind];
  const setPeek = useDeck((s) => s.setPeek);
  const foley = useFoley();
  const label = displayName ?? humanizeName(log.repo);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={SPRING}
      className="relative pl-6"
    >
      <span className="absolute left-[5px] top-2 h-full w-px bg-hairline" aria-hidden="true" />
      <span
        className="absolute left-0 top-[7px] grid size-[11px] place-items-center rounded-full bg-surface"
        style={{ boxShadow: `0 0 0 1px ${tok.dot}` }}
      >
        <span className="size-[5px] rounded-full" style={{ background: tok.dot }} />
      </span>

      <div className="flex items-center justify-between gap-2">
        <span className="mono flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em]" style={{ color: tok.ink }}>
          <Icon size={11} /> {log.label}
        </span>
        <time className="mono shrink-0 text-[10.5px] text-mute" dateTime={log.at}>
          {formatDelta(age)}
        </time>
      </div>

      <div className="mt-1 flex items-center gap-2 pb-3.5">
        <SwissEmblem slug={log.repo} size={18} className="shrink-0 opacity-85" />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {linkable ? (
            <button
              type="button"
              onClick={() => {
                foley.latch();
                setPeek(log.repo, null, isLive ? 'sandbox' : 'brief');
              }}
              className="shrink-0 text-left text-[13px] font-medium text-ink transition-colors hover:text-hot-ink"
            >
              {label}
            </button>
          ) : (
            <span className="shrink-0 text-[13px] font-medium text-dim">{label}</span>
          )}
          {log.detail && <span className="mono min-w-0 truncate text-[11px] text-mute">{log.detail}</span>}
        </div>
      </div>
    </motion.li>
  );
}
