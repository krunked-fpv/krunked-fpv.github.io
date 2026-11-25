import { AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useMemo } from 'react';
import { useDeck } from '../../store/deckStore';
import { useShipLogs } from '../../store/selectors';
import type { Project } from '../../types/project';
import { SpecularSurface } from '../ui/SpecularSurface';
import { ShipLogItem } from './ShipLogItem';

/** Vertical ship-log telemetry rail translating raw GitHub events into crisp dispatches. */
export function ForgeStream({
  projects,
  limit = 28,
  className = '',
}: {
  projects: Project[];
  limit?: number;
  className?: string;
}) {
  const logs = useShipLogs(projects);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);

  const filtered = useMemo(() => {
    if (!chronoWindow) return logs;
    return logs.filter((l) => {
      const d = l.at.slice(0, 10);
      return d >= chronoWindow.startDate && d <= chronoWindow.endDate;
    });
  }, [logs, chronoWindow]);

  const shown = filtered.slice(0, limit);

  return (
    <SpecularSurface className={`flex flex-col overflow-hidden rounded-[14px]! ${className}`}>
      <div className="flex items-center justify-between border-b border-hairline bg-inset/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-phosphor-ink" />
          <h3 className="eyebrow text-dim!">Forge Stream</h3>
        </div>
        <span className="mono text-[10.5px] text-mute">
          {chronoWindow ? `${filtered.length} IN WINDOW` : `${logs.length} EVENTS`}
        </span>
      </div>
      <ol className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-4">
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
    </SpecularSurface>
  );
}
