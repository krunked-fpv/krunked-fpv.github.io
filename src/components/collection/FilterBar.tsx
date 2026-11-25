import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Code2, Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { useDeck } from '../../store/deckStore';
import { dynamicChips, filterProjects, type FilterChip } from '../../store/selectors';
import type { Project } from '../../types/project';
import { langColor } from './meta';
import { SortMenu } from './SortMenu';
import { ViewSwitcher } from './ViewSwitcher';

const CORE = [
  { key: 'live', label: 'Live Apps' },
  { key: 'recent', label: 'Recent' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'all', label: 'All' },
];

function Pill({
  id,
  label,
  count,
  hideZero = false,
  on,
  onClick,
}: {
  id: string;
  label: string;
  count: number;
  hideZero?: boolean;
  on: boolean;
  onClick: () => void;
}) {
  const showCount = !hideZero || count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-filter={id}
      className={`relative flex h-8 shrink-0 items-center gap-1 rounded-[8px] px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors max-md:h-9 ${
        on ? 'text-chassis' : 'text-dim hover:bg-hover hover:text-ink'
      }`}
    >
      {on && (
        <motion.span
          layoutId="pill-ind"
          transition={SPRING}
          className="absolute inset-0 rounded-[8px] bg-ink shadow-xs"
        />
      )}
      <span className="relative">{label}</span>
      {showCount && (
        <span className={`mono relative text-[10.5px] ${on ? 'text-chassis/75' : 'text-mute'}`}>{count}</span>
      )}
    </button>
  );
}

/** Compact hardware listbox for filtering by programming language stack without crowding the pill rail. */
function StackMenu({
  languages,
  activeFilter,
  onSelect,
  onReset,
}: {
  languages: FilterChip[];
  activeFilter: string;
  onSelect: (key: string) => void;
  onReset: () => void;
}) {
  const foley = useFoley();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const activeLang = languages.find((l) => l.key === activeFilter) ?? null;
  const options = useMemo(
    () => [
      { key: '__all__', label: 'All Stacks', count: null as number | null },
      ...languages.map((l) => ({ key: l.key, label: l.label, count: l.count })),
    ],
    [languages],
  );

  useEffect(() => {
    if (!open) return;
    const idx = activeLang ? Math.max(0, options.findIndex((o) => o.key === activeLang.key)) : 0;
    setActive(idx);
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, activeLang, options]);

  if (languages.length === 0) return null;

  const choose = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    foley.click();
    if (opt.key === '__all__') onReset();
    else onSelect(opt.key);
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
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      foley.tick();
      setActive((a) => (a - 1 + options.length) % options.length);
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
          activeLang
            ? 'border-hairline-strong bg-elevated text-ink ring-1 ring-hot/40'
            : open
              ? 'bg-elevated text-ink'
              : 'text-dim'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={activeLang ? `Stack filter: ${activeLang.label}` : 'Filter by stack'}
        onClick={() => {
          foley.tick();
          setOpen((o) => !o);
        }}
      >
        {activeLang ? (
          <span
            className="size-[7px] shrink-0 rounded-full"
            style={{ background: langColor(activeLang.label) }}
            aria-hidden="true"
          />
        ) : (
          <Code2 size={12.5} className="shrink-0 text-mute" aria-hidden="true" />
        )}
        <span className="max-w-[92px] truncate font-medium">{activeLang ? activeLang.label : 'Stack'}</span>
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
            aria-label="Filter by language stack"
            aria-activedescendant={`stack-${options[active]!.key}`}
            tabIndex={-1}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={SPRING}
            className="surface surface-elevated thin-scroll absolute left-0 top-[calc(100%+6px)] z-50 max-h-72 w-52 overflow-y-auto rounded-[12px]! border border-hairline-strong bg-elevated p-1.5 shadow-xl sm:left-auto sm:right-0"
            style={{ transformOrigin: 'top right' }}
          >
            {options.map((o, i) => {
              const selected = o.key === '__all__' ? !activeLang : o.key === activeFilter;
              return (
                <li
                  key={o.key}
                  id={`stack-${o.key}`}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[12.5px] transition-colors ${
                    i === 0 ? 'mb-1 border-b border-hairline pb-2.5 rounded-b-[4px]' : ''
                  } ${i === active ? 'bg-hover text-ink' : selected ? 'text-ink' : 'text-dim'}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {o.key === '__all__' ? (
                      <Code2 size={12} className="shrink-0 text-mute" aria-hidden="true" />
                    ) : (
                      <span
                        className="size-[7px] shrink-0 rounded-full"
                        style={{ background: langColor(o.label) }}
                        aria-hidden="true"
                      />
                    )}
                    <span className={`truncate ${selected ? 'font-medium' : ''}`}>{o.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {o.count !== null && <span className="mono text-[10px] text-mute">{o.count}</span>}
                    {selected && <Check size={13} className="text-hot-ink" />}
                  </span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Filter / Stack / Sort / View navigation rail.
 * - Sticky on md+ only (non-sticky on <768px so mobile sticky chrome stays <= 56px).
 * - Core + Category pills fit 100% unclipped at 1440px; language stacks live in the compact Stack dropdown.
 * - Dynamic right fade activates automatically only when the horizontal pill rail actually overflows (tablet/mobile).
 */
export function FilterBar({
  projects,
  hiddenCount = 0,
}: {
  projects: Project[];
  hiddenCount?: number;
}) {
  const prefs = useDeck((s) => s.vault.prefs);
  const showHidden = useDeck((s) => s.showHidden);
  const setFilter = useDeck((s) => s.setFilter);
  const setView = useDeck((s) => s.setView);
  const setSort = useDeck((s) => s.setSort);
  const setShowHidden = useDeck((s) => s.setShowHidden);
  const foley = useFoley();

  const railRef = useRef<HTMLDivElement>(null);
  const lastBaseFilterRef = useRef<string>('live');
  const [fadeRight, setFadeRight] = useState(false);

  useEffect(() => {
    if (!prefs.filter.startsWith('lang:')) {
      lastBaseFilterRef.current = prefs.filter;
    }
  }, [prefs.filter]);

  const { categoryChips, languageChips, activeTopicChip } = useMemo(() => {
    const all = dynamicChips(projects);
    const cats = all.filter((c) => c.key.startsWith('cat:'));
    const langs = all.filter((c) => c.key.startsWith('lang:'));
    const topic = prefs.filter.startsWith('topic:') ? all.find((c) => c.key === prefs.filter) ?? null : null;
    return { categoryChips: cats, languageChips: langs, activeTopicChip: topic };
  }, [projects, prefs.filter]);

  const counts = useMemo(
    () => Object.fromEntries(CORE.map((c) => [c.key, filterProjects(projects, c.key).length])),
    [projects],
  );

  const checkOverflow = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setFadeRight(remaining > 4);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = railRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkOverflow, categoryChips, activeTopicChip]);

  const selectFilter = (key: string) => {
    if (prefs.filter === key) return;
    foley.click();
    setFilter(key);
  };

  const resetStack = () => {
    const fallback = lastBaseFilterRef.current && !lastBaseFilterRef.current.startsWith('lang:')
      ? lastBaseFilterRef.current
      : 'live';
    setFilter(fallback);
  };

  const showingHidden = showHidden && prefs.filter === 'hidden';

  return (
    <div
      className="relative z-30 w-full max-w-full border-y border-hairline bg-bar backdrop-blur-xl md:sticky"
      style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-0 px-4 py-2 sm:px-6">
        {/* Core + Category pill rail — fits 100% unclipped at 1440px, smooth fade on narrow screens */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            ref={railRef}
            onScroll={checkOverflow}
            className="hide-scroll flex items-center gap-1 overflow-x-auto pr-2"
            role="toolbar"
            aria-label="Filter repositories"
            style={
              fadeRight
                ? {
                    WebkitMaskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 36px), transparent 100%)',
                    maskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 36px), transparent 100%)',
                  }
                : undefined
            }
          >
            {CORE.map((c) => (
              <Pill
                key={c.key}
                id={c.key}
                label={c.label}
                count={counts[c.key] ?? 0}
                hideZero={c.key === 'pinned'}
                on={prefs.filter === c.key}
                onClick={() => selectFilter(c.key)}
              />
            ))}

            {categoryChips.length > 0 && (
              <span className="mx-1.5 h-4 w-px shrink-0 bg-hairline-strong" aria-hidden="true" />
            )}
            {categoryChips.map((c) => (
              <Pill
                key={c.key}
                id={c.key}
                label={c.label}
                count={c.count}
                on={prefs.filter === c.key}
                onClick={() => selectFilter(c.key)}
              />
            ))}

            {activeTopicChip && (
              <>
                <span className="mx-1.5 h-4 w-px shrink-0 bg-hairline" aria-hidden="true" />
                <Pill
                  key={activeTopicChip.key}
                  id={activeTopicChip.key}
                  label={activeTopicChip.label}
                  count={activeTopicChip.count}
                  on={prefs.filter === activeTopicChip.key}
                  onClick={() => selectFilter(activeTopicChip.key)}
                />
              </>
            )}
          </div>

          {fadeRight && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bar to-transparent"
            />
          )}
        </div>

        {/* Clean architectural divider + right-hand Stack / Hidden / Sort / View controls */}
        <div className="ml-1.5 flex shrink-0 items-center gap-1.5 border-l border-hairline pl-2.5">
          <div className="hidden sm:block">
            <StackMenu
              languages={languageChips}
              activeFilter={prefs.filter}
              onSelect={setFilter}
              onReset={resetStack}
            />
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => {
                foley.click();
                const nextShow = !showingHidden;
                setShowHidden(nextShow);
                setFilter(nextShow ? 'hidden' : 'live');
              }}
              aria-pressed={showingHidden}
              className={`btn min-h-8! gap-1.5 rounded-[9px]! px-2 text-[11.5px] ${
                showingHidden ? 'border-hairline-strong text-hot-ink' : 'text-dim'
              }`}
              title={showingHidden ? 'Return to visible live apps' : `View ${hiddenCount} hidden repositories`}
            >
              {showingHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              <span className="mono text-[10.5px] tracking-wider">{hiddenCount}</span>
            </button>
          )}

          <div className="hidden sm:block">
            <SortMenu sort={prefs.sort} onChange={setSort} />
          </div>

          <ViewSwitcher view={prefs.view} onChange={setView} />
        </div>
      </div>

      {/* Compact mobile Stack + Sort utility bar */}
      <div className="mx-auto flex items-center justify-between gap-2 border-t border-hairline/70 px-4 py-1.5 sm:hidden">
        <StackMenu
          languages={languageChips}
          activeFilter={prefs.filter}
          onSelect={setFilter}
          onReset={resetStack}
        />
        <span className="mono shrink-0 text-[10px] tracking-[0.14em] text-mute">
          {filterProjects(projects, prefs.filter).length} BUILDS
        </span>
        <SortMenu sort={prefs.sort} onChange={setSort} />
      </div>
    </div>
  );
}
