import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { SPRING } from '../../config/site';
import { dynamicChips, filterProjects } from '../../store/selectors';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { SortMenu } from './SortMenu';
import { ViewSwitcher } from './ViewSwitcher';

const CORE = [
  { key: 'live', label: 'Live Apps' },
  { key: 'recent', label: 'Recently Shipped' },
  { key: 'pinned', label: 'Pinned Dock' },
  { key: 'all', label: 'All Repositories' },
];

function Pill({ id, label, count, on, onClick }: { id: string; label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-filter={id}
      className={`relative flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors max-md:h-11 ${on ? 'text-ob-950' : 'text-dim hover:text-ink'}`}
    >
      {on && <motion.span layoutId="pill-ind" transition={SPRING} className="absolute inset-0 rounded-full bg-ink" />}
      <span className="relative">{label}</span>
      <span className={`mono relative text-[10.5px] ${on ? 'text-ob-950/60' : 'text-mute'}`}>{count}</span>
    </button>
  );
}

export function FilterBar({ projects }: { projects: Project[] }) {
  const prefs = useDeck((s) => s.vault.prefs);
  const setFilter = useDeck((s) => s.setFilter);
  const setView = useDeck((s) => s.setView);
  const setSort = useDeck((s) => s.setSort);
  const chips = useMemo(() => dynamicChips(projects), [projects]);
  const counts = useMemo(() => Object.fromEntries(CORE.map((c) => [c.key, filterProjects(projects, c.key).length])), [projects]);
  return (
    <div className="sticky top-14 z-30 w-full max-w-full overflow-hidden border-b border-white/[0.05] bg-ob-950/80 backdrop-blur-xl" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
      <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="hide-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="toolbar" aria-label="Filters">
          {CORE.map((c) => (
            <Pill key={c.key} id={c.key} label={c.label} count={counts[c.key] ?? 0} on={prefs.filter === c.key} onClick={() => setFilter(c.key)} />
          ))}
          <span className="mx-2 h-5 w-px shrink-0 bg-white/10" />
          {chips.map((c) => (
            <Pill key={c.key} id={c.key} label={c.label} count={c.count} on={prefs.filter === c.key} onClick={() => setFilter(c.key)} />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <SortMenu sort={prefs.sort} onChange={setSort} />
          </div>
          <ViewSwitcher view={prefs.view} onChange={setView} />
        </div>
      </div>
      <div className="mx-auto px-4 pb-2.5 sm:hidden">
        <SortMenu sort={prefs.sort} onChange={setSort} />
      </div>
    </div>
  );
}
