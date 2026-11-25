import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useMemo } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { useDeck } from '../../store/deckStore';
import { dynamicChips, filterProjects } from '../../store/selectors';
import type { Project } from '../../types/project';
import { SortMenu } from './SortMenu';
import { ViewSwitcher } from './ViewSwitcher';

const CORE = [
  { key: 'live', label: 'Live Apps' },
  { key: 'recent', label: 'Recently Shipped' },
  { key: 'pinned', label: 'Pinned Dock' },
  { key: 'all', label: 'All Repos' },
];

function Pill({
  id,
  label,
  count,
  on,
  onClick,
}: {
  id: string;
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-filter={id}
      className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors max-md:h-10 ${
        on ? 'text-chassis' : 'text-dim hover:bg-hover hover:text-ink'
      }`}
    >
      {on && <motion.span layoutId="pill-ind" transition={SPRING} className="absolute inset-0 rounded-[8px] bg-ink" />}
      <span className="relative">{label}</span>
      <span className={`mono relative text-[10.5px] ${on ? 'text-chassis/75' : 'text-mute'}`}>{count}</span>
    </button>
  );
}

/**
 * Filter / Sort / View rail.
 * - Sticky on md+ only (non-sticky on <768px so mobile sticky chrome stays <= 140px).
 * - Horizontal scroll pill rail uses CSS mask-image fade edges so pills never clip mid-letter.
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

  const chips = useMemo(() => dynamicChips(projects).slice(0, 14), [projects]);
  const counts = useMemo(
    () => Object.fromEntries(CORE.map((c) => [c.key, filterProjects(projects, c.key).length])),
    [projects],
  );

  const selectFilter = (key: string) => {
    if (prefs.filter === key) return;
    foley.click();
    setFilter(key);
  };

  return (
    <div
      className="relative z-30 w-full max-w-full border-y border-hairline bg-bar backdrop-blur-xl md:sticky"
      style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-2 sm:px-6">
        <div
          className="hide-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-8"
          role="toolbar"
          aria-label="Filter repositories"
          style={{
            WebkitMaskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)',
            maskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)',
          }}
        >
          {CORE.map((c) => (
            <Pill
              key={c.key}
              id={c.key}
              label={c.label}
              count={counts[c.key] ?? 0}
              on={prefs.filter === c.key}
              onClick={() => selectFilter(c.key)}
            />
          ))}
          {chips.length > 0 && <span className="mx-1.5 h-4 w-px shrink-0 bg-hairline-strong" aria-hidden="true" />}
          {chips.map((c) => (
            <Pill
              key={c.key}
              id={c.key}
              label={c.label}
              count={c.count}
              on={prefs.filter === c.key}
              onClick={() => selectFilter(c.key)}
            />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => {
                foley.click();
                const nextShow = !(showHidden && prefs.filter === 'hidden');
                setShowHidden(nextShow);
                setFilter(nextShow ? 'hidden' : 'live');
              }}
              aria-pressed={showHidden && prefs.filter === 'hidden'}
              className={`btn min-h-9! gap-1.5 px-2.5 text-[11.5px] ${
                showHidden && prefs.filter === 'hidden' ? 'border-hairline-strong text-hot-ink' : 'text-dim'
              }`}
              title={showHidden && prefs.filter === 'hidden' ? 'Return to visible live apps' : 'View hidden repositories'}
            >
              {showHidden && prefs.filter === 'hidden' ? <Eye size={13} /> : <EyeOff size={13} />}
              <span className="mono hidden lg:inline">
                {showHidden && prefs.filter === 'hidden' ? `SHOWING HIDDEN (${hiddenCount})` : `HIDDEN (${hiddenCount})`}
              </span>
            </button>
          )}
          <div className="hidden sm:block">
            <SortMenu sort={prefs.sort} onChange={setSort} />
          </div>
          <ViewSwitcher view={prefs.view} onChange={setView} />
        </div>
      </div>

      <div className="mx-auto flex items-center justify-between gap-2 px-4 pb-2 sm:hidden">
        <SortMenu sort={prefs.sort} onChange={setSort} />
        <span className="mono text-[10px] tracking-wider text-mute">{projects.length} VISIBLE</span>
      </div>
    </div>
  );
}
