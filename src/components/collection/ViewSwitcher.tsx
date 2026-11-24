import { motion } from 'framer-motion';
import { Grid3x3, History, LayoutDashboard } from 'lucide-react';
import { SPRING } from '../../config/site';
import type { ViewMode } from '../../types/project';

const VIEWS: { key: ViewMode; label: string; Icon: typeof Grid3x3 }[] = [
  { key: 'bento', label: 'Showcase Bento', Icon: LayoutDashboard },
  { key: 'grid', label: 'Telemetry Grid', Icon: Grid3x3 },
  { key: 'matrix', label: 'Ship Matrix', Icon: History },
];

export function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div role="radiogroup" aria-label="View mode" className="relative flex rounded-[11px] bg-white/[0.04] p-[3px] shadow-[inset_0_0_0_1px_var(--hairline)]">
      {VIEWS.map(({ key, label, Icon }) => {
        const on = view === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => onChange(key)}
            className={`relative grid size-9 place-items-center rounded-lg transition-colors max-md:size-11 ${on ? 'text-ink' : 'text-mute hover:text-dim'}`}
          >
            {on && <motion.span layoutId="view-ind" transition={SPRING} className="absolute inset-0 rounded-lg bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />}
            <Icon size={16} className="relative" />
          </button>
        );
      })}
    </div>
  );
}
