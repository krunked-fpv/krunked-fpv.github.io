import { motion } from 'framer-motion';
import { Grid3x3, History, LayoutGrid } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import type { ViewMode } from '../../types/project';

const VIEWS: { key: ViewMode; label: string; shortcut: string; Icon: typeof Grid3x3 }[] = [
  { key: 'bento', label: 'Gallery View', shortcut: '1', Icon: LayoutGrid },
  { key: 'grid', label: 'Telemetry Index', shortcut: '2', Icon: Grid3x3 },
  { key: 'matrix', label: 'Ship Timeline', shortcut: '3', Icon: History },
];

export function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const foley = useFoley();

  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="relative flex rounded-[10px] border border-hairline bg-inset p-[3px]"
    >
      {VIEWS.map(({ key, label, shortcut, Icon }) => {
        const on = view === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label} (Shortcut ${shortcut})`}
            title={`${label} [${shortcut}]`}
            onClick={() => {
              if (view !== key) {
                foley.click();
                onChange(key);
              }
            }}
            className={`relative grid size-7.5 place-items-center rounded-[7px] transition-colors max-md:size-9 ${
              on ? 'text-ink' : 'text-mute hover:text-dim'
            }`}
          >
            {on && (
              <motion.span
                layoutId="view-ind"
                transition={SPRING}
                className="absolute inset-0 rounded-[7px] border border-hairline-strong bg-elevated shadow-xs"
              />
            )}
            <Icon size={14} className="relative" />
          </button>
        );
      })}
    </div>
  );
}
