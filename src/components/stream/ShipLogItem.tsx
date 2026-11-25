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
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={SPRING}
      className="relative min-w-0 pl-6"
    >
      <span className="absolute left-[5px] top-2 h-full w-px bg-hairline" aria-hidden="true" />
      <span
        className="absolute left-0 top-[7px] grid size-[11px] place-items-center rounded-[2px] bg-surface"
        style={{ boxShadow: `0 0 0 1px ${tok.dot}` }}
      >
        <span className="size-[5px] rounded-[1px]" style={{ background: tok.dot }} />
      </span>

      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className="mono flex min-w-0 items-center gap-1.5 truncate text-[10px] font-semibold tracking-[0.1em]"
          style={{ color: tok.ink }}
        >
          <Icon size={11} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{log.label}</span>
        </span>
        <time className="mono shrink-0 text-[10.5px] text-mute" dateTime={log.at}>
          {formatDelta(age)}
        </time>
      </div>

      <div className="mt-1 pb-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <SwissEmblem slug={log.repo} size={18} className="shrink-0 opacity-90" />
          {linkable ? (
            <button
              type="button"
              onClick={() => {
                foley.latch();
                setPeek(log.repo, null, isLive ? 'sandbox' : 'brief');
              }}
              className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] font-medium text-ink transition-colors hover:text-hot-ink"
              title={label}
            >
              {label}
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-dim" title={label}>
              {label}
            </span>
          )}
        </div>
        {log.detail && (
          <p className="mono mt-0.5 truncate pl-[26px] text-[11px] text-mute" title={log.detail}>
            {log.detail}
          </p>
        )}
      </div>
    </motion.li>
  );
}
