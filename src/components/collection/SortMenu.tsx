import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import type { SortMode } from '../../types/project';

const OPTIONS: { key: SortMode; label: string; tag: string }[] = [
  { key: 'push', label: 'Latest Push', tag: 'LIVE' },
  { key: 'velocity', label: '30d Velocity', tag: 'HOT' },
  { key: 'created', label: 'Recently Created', tag: 'NEW' },
  { key: 'alpha', label: 'Alphabetical', tag: 'A-Z' },
];

/** Accessible tactile listbox for collection sorting. */
export function SortMenu({ sort, onChange }: { sort: SortMode; onChange: (s: SortMode) => void }) {
  const foley = useFoley();
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
    const opt = OPTIONS[i];
    if (!opt) return;
    foley.click();
    onChange(opt.key);
    setOpen(false);
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        foley.tick();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      foley.tick();
      setActive((a) => (a + 1) % OPTIONS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      foley.tick();
      setActive((a) => (a - 1 + OPTIONS.length) % OPTIONS.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className={`btn min-h-8! gap-1.5 rounded-[9px]! px-2.5 text-[12px] ${
          open ? 'bg-elevated text-ink' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort: ${current.label}`}
        onClick={() => {
          foley.tick();
          setOpen((o) => !o);
        }}
      >
        <ArrowUpDown size={12} className="shrink-0 text-mute" aria-hidden="true" />
        <span className="truncate font-medium">{current.label}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-mute transition-transform duration-150 ${open ? 'rotate-180 text-ink' : ''}`}
          aria-hidden="true"
        />
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
            className="surface surface-elevated absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-[12px]! border border-hairline-strong bg-elevated p-1.5 shadow-xl"
            style={{ transformOrigin: 'top right' }}
          >
            {OPTIONS.map((o, i) => {
              const selected = o.key === sort;
              return (
                <li
                  key={o.key}
                  id={`sort-${o.key}`}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[12.5px] transition-colors ${
                    i === active ? 'bg-hover text-ink' : selected ? 'text-ink' : 'text-dim'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`mono w-8 text-[9.5px] font-medium tracking-[0.12em] ${
                        selected ? 'text-hot-ink' : 'text-mute'
                      }`}
                    >
                      {o.tag}
                    </span>
                    <span className={selected ? 'font-medium' : ''}>{o.label}</span>
                  </span>
                  {selected && <Check size={13} className="shrink-0 text-hot-ink" />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
