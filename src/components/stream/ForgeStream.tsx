import { AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useMemo } from 'react';
import type { Project } from '../../types/project';
import { useShipLogs } from '../../store/selectors';
import { SpecularSurface } from '../ui/SpecularSurface';
import { ShipLogItem } from './ShipLogItem';

/** Vertical ship-log rail translating raw events into readable telemetry. */
export function ForgeStream({ projects, limit = 24, className = '' }: { projects: Project[]; limit?: number; className?: string }) {
  const logs = useShipLogs(projects);
  const visible = useMemo(() => new Set(projects.map((p) => p.name)), [projects]);
  const shown = logs.slice(0, limit);
  return (
    <SpecularSurface className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-phosphor" />
          <h3 className="eyebrow text-dim!">Forge Stream</h3>
        </div>
        <span className="mono text-[10.5px] text-mute">{logs.length} EVENTS</span>
      </div>
      <ol className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        <AnimatePresence initial={false}>
          {shown.map((l) => (
            <ShipLogItem key={l.id} log={l} linkable={visible.has(l.repo)} />
          ))}
        </AnimatePresence>
        {!shown.length && <li className="mono pb-4 text-[12px] text-mute">Awaiting first transmission…</li>}
      </ol>
    </SpecularSurface>
  );
}
