import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SPRING } from '../../config/site';
import type { SortMode } from '../../types/project';

const OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'push', label: 'Latest Push (Live)' },
  { key: 'created', label: 'Recently Created' },
  { key: 'velocity', label: 'Commit Velocity / Size' },
  { key: 'alpha', label: 'Alphabetical' },
];

/** Accessible custom listbox. */
export function SortMenu({ sort, onChange }: { sort: SortMode; onChange: (s: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const current = OPTIONS.find((o) => o.key === sort) ?? OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, OPTIONS.findIndex((o) => o.key === sort)));
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, sort]);

  const choose = (i: number) => {
    onChange(OPTIONS[i]!.key);
    setOpen(false);
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => (a + 1) % OPTIONS.length));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => (a - 1 + OPTIONS.length) % OPTIONS.length));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), choose(active));
    else if (e.key === 'Escape') (e.stopPropagation(), setOpen(false), btn.current?.focus());
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className="btn min-h-9! gap-2 text-[12.5px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mono hidden text-[10px] tracking-[0.14em] text-mute sm:inline">SORT</span>
        {current.label}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Sort mode"
            aria-activedescendant={`sort-${OPTIONS[active]!.key}`}
            tabIndex={-1}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={SPRING}
            className="surface absolute right-0 top-[calc(100%+6px)] z-50 w-60 p-1.5"
            style={{ background: 'var(--color-ob-800)', transformOrigin: 'top right' }}
          >
            {OPTIONS.map((o, i) => (
              <li
                key={o.key}
                id={`sort-${o.key}`}
                role="option"
                aria-selected={o.key === sort}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-[13px] ${i === active ? 'bg-white/[0.07] text-ink' : 'text-dim'}`}
              >
                {o.label}
                {o.key === sort && <Check size={14} className="text-phosphor" />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
