import { CornerDownLeft, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceSync } from '../../data/syncEngine';
import { fuzzyMatch } from '../../domain/fuzzy';
import { hueOf } from '../../domain/buildProjects';
import { badgeLabel, TIER_COLOR } from '../../domain/freshness';
import { searchProjects } from '../../store/selectors';
import { useDeck } from '../../store/deckStore';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';
import { Glyph } from '../art/Glyph';
import { launch } from '../collection/CardActions';
import { Kbd, modKey } from '../ui/Kbd';
import { Modal } from '../ui/Modal';

type Item =
  | { type: 'project'; id: string; project: Project; nameIdx: number[]; snippet: string | null }
  | { type: 'action'; id: string; label: string; hint: string; run: () => void };

function Highlight({ text, idx }: { text: string; idx: number[] }) {
  if (!idx.length) return <>{text}</>;
  const set = new Set(idx);
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <mark key={i} className="bg-transparent text-phosphor">{ch}</mark> : ch))}
    </>
  );
}

export function CommandPalette({ projects }: { projects: Project[] }) {
  const open = useDeck((s) => s.paletteOpen);
  const setOpen = useDeck((s) => s.setPalette);
  const { setView, setFilter, togglePin, setPeek, setSettings, toast } = useDeck.getState();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [navMode, setNavMode] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const now = useNow(30_000);

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setNavMode(false);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = searchProjects(projects, q)
      .slice(0, 30)
      .map((h) => ({ type: 'project', id: `p-${h.project.id}`, project: h.project, nameIdx: h.nameIdx, snippet: h.commitSnippet }));
    const actions: { id: string; label: string; hint: string; run: () => void }[] = [
      { id: 'sync', label: 'Force Sync', hint: 'Revalidate with GitHub', run: () => void forceSync() },
      { id: 'v-bento', label: 'View: Showcase Bento', hint: 'View', run: () => setView('bento') },
      { id: 'v-grid', label: 'View: Telemetry Grid', hint: 'View', run: () => setView('grid') },
      { id: 'v-matrix', label: 'View: Ship Matrix', hint: 'View', run: () => setView('matrix') },
      { id: 'f-live', label: 'Filter: Live Apps', hint: 'Filter', run: () => setFilter('live') },
      { id: 'f-recent', label: 'Filter: Recently Shipped', hint: 'Filter', run: () => setFilter('recent') },
      { id: 'f-pinned', label: 'Filter: Pinned Dock', hint: 'Filter', run: () => setFilter('pinned') },
      { id: 'f-all', label: 'Filter: All Repositories', hint: 'Filter', run: () => setFilter('all') },
      { id: 'settings', label: 'Settings', hint: 'Token, cache, curation', run: () => setSettings(true) },
    ];
    const acts = q.trim() ? actions.filter((a) => fuzzyMatch(q, a.label)) : actions;
    return [...out, ...acts.map((a) => ({ type: 'action' as const, ...a }))];
  }, [projects, q, setView, setFilter, setSettings]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (it: Item | undefined, shift = false) => {
    if (!it) return;
    if (it.type === 'action') {
      close();
      // let the modal unmount first so focus restoration doesn't fight actions that open modals
      setTimeout(it.run, 0);
      return;
    }
    const p = it.project;
    close();
    if (shift) launch(p.sourceUrl);
    else if (p.launchUrl) launch(p.launchUrl);
    else setPeek(p.name);
  };

  const pinActive = () => {
    const it = items[active];
    if (it?.type !== 'project') return;
    togglePin(it.project.name);
    toast(it.project.pinned ? `Unpinned ${it.project.displayName}` : `Pinned ${it.project.displayName}`, 'ok');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = items.length || 1;
    if (e.key === 'ArrowDown') (e.preventDefault(), setNavMode(true), setActive((a) => (a + 1) % n));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setNavMode(true), setActive((a) => (a - 1 + n) % n));
    else if (e.key === 'Enter') (e.preventDefault(), run(items[active], e.shiftKey));
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') (e.preventDefault(), pinActive());
    else if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey && (q === '' || navMode)) (e.preventDefault(), pinActive());
    else if (e.key === 'Tab') e.preventDefault();
  };

  return (
    <Modal open={open} onClose={close} label="Command palette" align="top" initialFocus={input}>
      <div className="surface overflow-hidden rounded-[20px]!" style={{ background: 'var(--color-ob-800)', boxShadow: '0 40px 120px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search size={17} className="text-mute" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setNavMode(false);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active]!.id}` : undefined}
            aria-label="Search apps, topics and commits"
            placeholder="Search apps, topics, commit messages…"
            autoComplete="off"
            spellCheck={false}
            className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-mute"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul id="palette-list" ref={list} role="listbox" className="thin-scroll max-h-[min(52vh,460px)] overflow-y-auto p-2">
          {items.map((it, i) => {
            const on = i === active;
            const first = it.type === 'action' && items[i - 1]?.type !== 'action';
            return (
              <li key={it.id} role="presentation">
                {first && <div className="eyebrow px-3 pb-1 pt-3">Actions</div>}
                <div
                  id={`pal-${it.id}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onPointerMove={() => !on && setActive(i)}
                  onClick={() => run(it)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${on ? 'bg-white/[0.07]' : ''}`}
                >
                  {it.type === 'project' ? (
                    <>
                      <Glyph name={it.project.glyph} hue={hueOf(it.project)} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[14px] font-medium">
                          <span className="truncate">
                            <Highlight text={it.project.displayName} idx={it.nameIdx} />
                          </span>
                          {it.project.pinned && <span className="text-solar text-[11px]">★</span>}
                        </div>
                        <div className="truncate text-[12px] text-mute">{it.snippet ? <span className="mono">⌥ {it.snippet}</span> : it.project.tagline}</div>
                      </div>
                      <span className="mono hidden shrink-0 text-[10px] tracking-wider sm:block" style={{ color: TIER_COLOR[it.project.freshness.tier] }}>
                        {badgeLabel(it.project.lastActivityAt, now)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="grid size-[34px] place-items-center rounded-lg bg-white/[0.05] text-dim">
                        <CornerDownLeft size={14} />
                      </span>
                      <span className="flex-1 text-[14px]">{it.label}</span>
                      <span className="mono text-[10px] tracking-wider text-mute">{it.hint}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {!items.length && <li className="px-3 py-8 text-center text-[13px] text-mute">Nothing matches “{q}”.</li>}
        </ul>
        <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.07] px-4 py-2.5 text-[10.5px] text-mute">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> launch</span>
          <span className="flex items-center gap-1.5"><Kbd>⇧</Kbd><Kbd>↵</Kbd> source</span>
          <span className="flex items-center gap-1.5"><Kbd>P</Kbd> / <Kbd>{modKey()}</Kbd><Kbd>P</Kbd> pin</span>
        </div>
      </div>
    </Modal>
  );
}
