import { AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useMemo } from 'react';
import type { ShipLog } from '../../domain/shiplog';
import { useDeck } from '../../store/deckStore';
import { useShipLogs } from '../../store/selectors';
import type { Project } from '../../types/project';
import { SpecularSurface } from '../ui/SpecularSurface';
import { ShipLogItem } from './ShipLogItem';

const PR_DEDUP_MS = 60 * 60_000;
const PR_LABEL_RE = /^PR\s+#(\d+)\s+([A-Z_-]+)/i;

/**
 * Collapses noisy rapid PR open+merge pairs (e.g. PR #2 OPENED right before PR #2 MERGED)
 * within 60 minutes so the live dispatch highlights diverse ships across repositories.
 */
function deduplicateShipLogs(logs: ShipLog[]): ShipLog[] {
  const closedPrTimes = new Map<string, number[]>();

  for (const log of logs) {
    if (log.kind !== 'pr') continue;
    const m = PR_LABEL_RE.exec(log.label);
    if (!m) continue;
    const action = (m[2] ?? '').toUpperCase();
    if (action === 'MERGED' || action === 'CLOSED') {
      const key = `${log.repo}#${m[1]}`;
      const ts = Date.parse(log.at);
      if (Number.isFinite(ts)) {
        const list = closedPrTimes.get(key) ?? [];
        list.push(ts);
        closedPrTimes.set(key, list);
      }
    }
  }

  const out: ShipLog[] = [];
  for (const log of logs) {
    if (log.kind === 'pr') {
      const m = PR_LABEL_RE.exec(log.label);
      if (m) {
        const action = (m[2] ?? '').toUpperCase();
        if (action === 'OPENED' || action === 'REOPENED' || action === 'SYNCHRONIZE' || action === 'UPDATED') {
          const key = `${log.repo}#${m[1]}`;
          const ts = Date.parse(log.at);
          const mergedList = closedPrTimes.get(key);
          if (mergedList && Number.isFinite(ts) && mergedList.some((mt) => Math.abs(mt - ts) <= PR_DEDUP_MS)) {
            continue;
          }
        }
      }
    }

    // Also skip exact consecutive duplicate event lines within 15 minutes
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.repo === log.repo &&
      prev.kind === log.kind &&
      prev.label === log.label &&
      prev.detail === log.detail &&
      Math.abs(Date.parse(prev.at) - Date.parse(log.at)) <= 15 * 60_000
    ) {
      continue;
    }

    out.push(log);
  }

  return out;
}

/** Vertical ship-log telemetry rail translating raw GitHub events into crisp, deduplicated dispatches. */
export function ForgeStream({
  projects,
  limit = 28,
  embedded = false,
  className = '',
}: {
  projects: Project[];
  limit?: number;
  /** When true, renders flush inside a parent container (such as SpotlightDeck's Ship Log tab). */
  embedded?: boolean;
  className?: string;
}) {
  const logs = useShipLogs(projects);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);

  const deduped = useMemo(() => deduplicateShipLogs(logs), [logs]);

  const filtered = useMemo(() => {
    if (!chronoWindow) return deduped;
    return deduped.filter((l) => {
      const d = l.at.slice(0, 10);
      return d >= chronoWindow.startDate && d <= chronoWindow.endDate;
    });
  }, [deduped, chronoWindow]);

  const shown = filtered.slice(0, limit);

  const list = (
    <ol className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pr-5 pt-3.5 pb-2">
      <AnimatePresence initial={false}>
        {shown.map((l) => {
          const p = byName.get(l.repo);
          return (
            <ShipLogItem
              key={l.id}
              log={l}
              linkable={Boolean(p)}
              displayName={p?.displayName}
              isLive={Boolean(p?.launchUrl)}
            />
          );
        })}
      </AnimatePresence>
      {!shown.length && (
        <li className="mono pb-4 text-[12px] text-mute">
          {chronoWindow ? 'No events inside the selected Chrono-Pulse window.' : 'Awaiting transmission...'}
        </li>
      )}
    </ol>
  );

  if (embedded) {
    return (
      <div className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-hairline bg-inset/35 px-4 py-2">
          <span className="eyebrow text-[10px]!">Live Dispatch</span>
          <span className="mono text-[10px] text-mute">
            {chronoWindow ? `${filtered.length} IN WINDOW` : `${deduped.length} SHIPS`}
          </span>
        </div>
        {list}
      </div>
    );
  }

  return (
    <SpecularSurface className={`flex flex-col overflow-hidden rounded-[14px]! ${className}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-hairline bg-inset/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-phosphor-ink" aria-hidden="true" />
          <h3 className="eyebrow text-dim!">Forge Stream</h3>
        </div>
        <span className="mono text-[10.5px] text-mute">
          {chronoWindow ? `${filtered.length} IN WINDOW` : `${deduped.length} SHIPS`}
        </span>
      </div>
      {list}
    </SpecularSurface>
  );
}
