import { motion } from 'framer-motion';
import { History, LayoutGrid, List } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import type { ViewMode } from '../../types/project';

const VIEWS: { key: ViewMode; label: string; shortcut: string; Icon: typeof LayoutGrid }[] = [
  { key: 'bento', label: 'Exhibition', shortcut: '1', Icon: LayoutGrid },
  { key: 'grid', label: 'Index', shortcut: '2', Icon: List },
  { key: 'matrix', label: 'Dispatch', shortcut: '3', Icon: History },
];

export function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const foley = useFoley();

  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="relative flex rounded-[6px] border border-hairline bg-inset p-[3px]"
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
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              if (view !== key) {
                foley.click();
                onChange(key);
              }
            }}
            className={`relative grid size-7.5 place-items-center rounded-[4px] transition-colors max-md:size-9 ${
              on ? 'text-ink' : 'text-mute hover:text-dim'
            }`}
          >
            {on && (
              <motion.span
                layoutId="view-ind"
                transition={SPRING}
                className="absolute inset-0 rounded-[4px] border border-hairline-strong bg-elevated"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 bottom-0 h-[1.5px] rounded-full bg-hot"
                />
              </motion.span>
            )}
            <Icon size={14} className="relative" />
          </button>
        );
      })}
    </div>
  );
}
