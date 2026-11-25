import {
  CalendarX,
  CornerDownLeft,
  Download,
  Eye,
  Filter,
  GitCommitHorizontal,
  History,
  LayoutGrid,
  List,
  Moon,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { THEME_COLORS } from '../../config/site';
import { forceSync } from '../../data/syncEngine';
import { hueOf } from '../../domain/buildProjects';
import { badgeLabel } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import { searchActions, searchProjects } from '../../store/selectors';
import type { Project, ThemeMode } from '../../types/project';
import { downloadDeckConfig } from '../../vault/configIo';
import { Glyph } from '../art/Glyph';
import { launch } from '../collection/CardActions';
import { TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { Kbd, modKey } from '../ui/Kbd';
import { Modal } from '../ui/Modal';

interface ActionDef {
  id: string;
  label: string;
  hint: string;
  keywords: readonly string[];
  Icon: typeof Search;
  run: () => void;
}

type Item =
  | { type: 'project'; id: string; project: Project; nameIdx: number[]; snippet: string | null }
  | { type: 'action'; id: string; label: string; hint: string; Icon: typeof Search; labelIdx: number[]; run: () => void };

function Highlight({ text, idx }: { text: string; idx: number[] }) {
  if (!idx.length) return <>{text}</>;
  const set = new Set(idx);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="bg-transparent font-semibold text-hot-ink">
            {ch}
          </mark>
        ) : (
          ch
        ),
      )}
    </>
  );
}

function switchThemeWithTransition(next: ThemeMode, setTheme: (t: ThemeMode) => void) {
  const commit = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next === 'daylight' ? 'light' : 'dark';
      const meta =
        document.getElementById('meta-theme-color') ??
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[next]);
    }
    setTheme(next);
  };
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!reduced && typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
    document.startViewTransition(commit);
  } else {
    commit();
  }
}

export function CommandPalette({ projects }: { projects: Project[] }) {
  const open = useDeck((s) => s.paletteOpen);
  const setOpen = useDeck((s) => s.setPalette);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const foley = useFoley();

  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [navMode, setNavMode] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const now = useNow(30_000);

  const close = useCallback(() => {
    setOpen(false);
    if (window.location.hash === '#palette') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setNavMode(false);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const projectHits: Item[] = searchProjects(projects, q)
      .slice(0, 24)
      .map((h) => ({
        type: 'project',
        id: `p-${h.project.id}`,
        project: h.project,
        nameIdx: h.nameIdx,
        snippet: h.commitSnippet,
      }));

    const st = useDeck.getState();
    const isDaylight = theme === 'daylight';
    const actions: ActionDef[] = [
      {
        id: 'toggle-theme',
        label: isDaylight ? 'Switch Theme: Event Horizon (Dark)' : 'Switch Theme: Solar Eclipse (Light)',
        hint: 'Theme [T]',
        keywords: ['theme', 'dark', 'light', 'obsidian', 'daylight', 'horizon', 'eclipse', 'singularity', 'black hole', 'appearance'],
        Icon: isDaylight ? Moon : Sun,
        run: () => {
          const next: ThemeMode = isDaylight ? 'obsidian' : 'daylight';
          foley.click();
          switchThemeWithTransition(next, st.setTheme);
          st.toast(next === 'daylight' ? 'Switched to Solar Eclipse' : 'Switched to Event Horizon', 'info');
        },
      },
      {
        id: 'toggle-audio',
        label: foley.enabled ? 'Mute Micro-Foley Audio' : 'Enable Micro-Foley Audio',
        hint: 'Audio [M]',
        keywords: ['sound', 'audio', 'foley', 'mute', 'unmute', 'clicks', 'hardware'],
        Icon: foley.enabled ? VolumeX : Volume2,
        run: () => {
          foley.toggle();
          st.toast(foley.enabled ? 'Audio foley muted' : 'Hardware audio foley enabled', 'info');
        },
      },
      {
        id: 'sync',
        label: 'Force Live Sync',
        hint: 'GitHub [R]',
        keywords: ['sync', 'refresh', 'revalidate', 'github', 'etag', 'fetch'],
        Icon: RefreshCw,
        run: () => {
          foley.click();
          void forceSync();
        },
      },
      ...(chronoWindow
        ? [
            {
              id: 'clear-chrono',
              label: `Clear Chrono-Pulse Window (${chronoWindow.startDate})`,
              hint: 'Chrono',
              keywords: ['clear', 'chrono', 'pulse', 'date', 'window', 'filter', 'reset'],
              Icon: CalendarX,
              run: () => {
                foley.click();
                st.setChronoWindow(null);
              },
            },
          ]
        : []),
      {
        id: 'v-bento',
        label: 'Switch View: Exhibition Wall',
        hint: 'View [1]',
        keywords: ['view', 'exhibition', 'bento', 'gallery', 'showcase', 'cards'],
        Icon: LayoutGrid,
        run: () => {
          foley.click();
          st.setView('bento');
        },
      },
      {
        id: 'v-grid',
        label: 'Switch View: Swiss Catalog Index',
        hint: 'View [2]',
        keywords: ['view', 'index', 'grid', 'telemetry', 'compact', 'table', 'catalog'],
        Icon: List,
        run: () => {
          foley.click();
          st.setView('grid');
        },
      },
      {
        id: 'v-matrix',
        label: 'Switch View: Ship Dispatch',
        hint: 'View [3]',
        keywords: ['view', 'dispatch', 'matrix', 'timeline', 'log', 'history'],
        Icon: History,
        run: () => {
          foley.click();
          st.setView('matrix');
        },
      },
      {
        id: 'f-live',
        label: 'Filter: Live Apps',
        hint: 'Filter',
        keywords: ['filter', 'live', 'apps', 'deployed', 'pages'],
        Icon: Filter,
        run: () => {
          foley.click();
          st.setFilter('live');
        },
      },
      {
        id: 'f-recent',
        label: 'Filter: Recently Shipped',
        hint: 'Filter',
        keywords: ['filter', 'recent', 'fresh', 'shipped', 'week'],
        Icon: Filter,
        run: () => {
          foley.click();
          st.setFilter('recent');
        },
      },
      {
        id: 'f-pinned',
        label: 'Filter: Pinned Dock',
        hint: 'Filter',
        keywords: ['filter', 'pinned', 'dock', 'stars', 'favorites'],
        Icon: Filter,
        run: () => {
          foley.click();
          st.setFilter('pinned');
        },
      },
      {
        id: 'f-all',
        label: 'Filter: All Repositories',
        hint: 'Filter',
        keywords: ['filter', 'all', 'repos', 'code'],
        Icon: Filter,
        run: () => {
          foley.click();
          st.setFilter('all');
        },
      },
      {
        id: 'export-config',
        label: 'Export Vault Config (KrunkedDeckConfigV2 JSON)',
        hint: 'PAT-Free',
        keywords: ['export', 'backup', 'json', 'vault', 'config', 'download'],
        Icon: Download,
        run: () => {
          foley.latch();
          downloadDeckConfig(useDeck.getState().vault);
          st.toast('Exported PAT-free KrunkedDeckConfigV2 JSON', 'ok');
        },
      },
      {
        id: 'open-vault',
        label: 'Open Vault & Triple-Store Status',
        hint: 'Vault',
        keywords: ['vault', 'cookie', 'indexeddb', 'localstorage', 'import', 'reset'],
        Icon: SlidersHorizontal,
        run: () => {
          foley.click();
          st.setSettings(true, 'vault');
        },
      },
      {
        id: 'open-diagnostics',
        label: 'Open API Diagnostics & PAT Firewall',
        hint: 'Settings [G]',
        keywords: ['settings', 'diagnostics', 'pat', 'token', 'rate', 'limit', 'quota', 'cache'],
        Icon: Settings,
        run: () => {
          foley.click();
          st.setSettings(true, 'diagnostics');
        },
      },
    ];

    const matchedActions: Item[] = searchActions(actions, q).map((hit) => ({
      type: 'action',
      id: hit.action.id,
      label: hit.action.label,
      hint: hit.action.hint,
      Icon: hit.action.Icon,
      labelIdx: hit.labelIdx,
      run: hit.action.run,
    }));

    return [...projectHits, ...matchedActions];
  }, [projects, q, theme, foley, chronoWindow]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runItem = (it: Item | undefined, mode: 'default' | 'source' | 'peek' | 'qr' = 'default') => {
    if (!it) return;
    if (it.type === 'action') {
      close();
      setTimeout(it.run, 0);
      return;
    }
    const p = it.project;
    close();
    const st = useDeck.getState();
    if (mode === 'source') {
      foley.click();
      launch(p.sourceUrl);
    } else if (mode === 'peek') {
      foley.latch();
      setTimeout(() => st.setPeek(p.name, null, p.launchUrl ? 'sandbox' : 'brief'), 0);
    } else if (mode === 'qr') {
      foley.click();
      setTimeout(() => st.setPeek(p.name, null, 'qr'), 0);
    } else if (p.launchUrl) {
      foley.relay();
      launch(p.launchUrl);
    } else {
      foley.latch();
      setTimeout(() => st.setPeek(p.name, null, 'brief'), 0);
    }
  };

  const pinActive = () => {
    const it = items[active];
    if (it?.type !== 'project') return;
    const st = useDeck.getState();
    foley.latch();
    st.togglePin(it.project.name);
    st.toast(it.project.pinned ? `Unpinned ${it.project.displayName}` : `Pinned ${it.project.displayName} to dock`, 'ok');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = items.length || 1;
    const key = e.key.toLowerCase();
    const shortcutReady = q === '' || navMode;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      foley.tick();
      setNavMode(true);
      setActive((a) => (a + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      foley.tick();
      setNavMode(true);
      setActive((a) => (a - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) runItem(items[active], 'peek');
      else if (e.shiftKey) runItem(items[active], 'source');
      else runItem(items[active], 'default');
    } else if ((e.metaKey || e.ctrlKey) && key === 'p') {
      e.preventDefault();
      pinActive();
    } else if (key === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey && shortcutReady) {
      e.preventDefault();
      pinActive();
    } else if (key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey && shortcutReady && items[active]?.type === 'project') {
      e.preventDefault();
      runItem(items[active], 'peek');
    } else if (key === 'q' && !e.metaKey && !e.ctrlKey && !e.altKey && shortcutReady && items[active]?.type === 'project') {
      e.preventDefault();
      runItem(items[active], 'qr');
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const projectResultCount = items.filter((it) => it.type === 'project').length;

  return (
    <Modal open={open} onClose={close} label="Command palette" align="top" size="md" initialFocus={input}>
      <div className="surface surface-elevated overflow-hidden rounded-[10px]! bg-elevated">
        {/* Clean inset search header */}
        <div className="flex items-center gap-3 border-b border-hairline bg-inset/70 px-4 transition-colors focus-within:border-hot/70 focus-within:bg-inset">
          <Search size={16} className="shrink-0 text-hot-ink" aria-hidden="true" />
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
            aria-label="Search worlds, commits, and studio commands"
            placeholder="Search worlds, commits, or commands..."
            autoComplete="off"
            spellCheck={false}
            style={{ outline: 'none', boxShadow: 'none' }}
            className="h-13 flex-1 bg-transparent text-[15px] text-ink outline-none! placeholder:text-mute focus:outline-none! focus-visible:outline-none!"
          />
          {q.trim() && (
            <span className="mono hidden text-[10px] tracking-[0.12em] text-mute sm:inline">
              {items.length} {items.length === 1 ? 'HIT' : 'HITS'}
            </span>
          )}
          <Kbd>esc</Kbd>
        </div>

        <ul id="palette-list" ref={list} role="listbox" className="thin-scroll max-h-[min(54vh,460px)] overflow-y-auto p-1.5">
          {items.map((it, i) => {
            const on = i === active;
            const firstProject = it.type === 'project' && i === 0;
            const firstAction = it.type === 'action' && items[i - 1]?.type !== 'action';

            return (
              <li key={it.id} role="presentation">
                {firstProject && (
                  <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
                    <span className="eyebrow">Playable Worlds</span>
                    <span className="mono text-[9.5px] tracking-[0.12em] text-mute">
                      {projectResultCount} INDEXED
                    </span>
                  </div>
                )}
                {firstAction && (
                  <div className="eyebrow px-3 pb-1.5 pt-3">Studio Commands</div>
                )}

                <div
                  id={`pal-${it.id}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onPointerMove={() => !on && setActive(i)}
                  onClick={() => runItem(it)}
                  className={`relative flex cursor-pointer items-center gap-3 rounded-[4px] px-3 py-2.5 transition-colors ${
                    on ? 'bg-hover text-ink' : 'text-dim'
                  }`}
                >
                  {on && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1.5 left-0 w-[2px] bg-hot"
                    />
                  )}

                  {it.type === 'project' ? (
                    <>
                      <Glyph name={it.project.glyph} hue={hueOf(it.project)} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                          <span className="truncate">
                            <Highlight text={it.project.displayName} idx={it.nameIdx} />
                          </span>
                          {it.project.pinned && <Star size={11} className="shrink-0 text-solar-ink" fill="currentColor" />}
                          <span
                            className={`mono hidden text-[9.5px] uppercase tracking-[0.1em] sm:inline ${
                              it.project.kind === 'live' ? 'text-phosphor-ink' : 'text-mute'
                            }`}
                          >
                            {it.project.kind === 'live' ? 'LIVE' : 'CODE'}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-mute">
                          {it.snippet ? (
                            <>
                              <GitCommitHorizontal size={12} className="shrink-0 text-hot-ink" />
                              <span className="mono truncate">{it.snippet}</span>
                            </>
                          ) : (
                            <span className="truncate">{it.project.tagline}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {on && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                runItem(it, 'peek');
                              }}
                              className="grid size-7 place-items-center rounded-[4px] border border-hairline bg-surface text-dim transition-colors hover:border-hairline-strong hover:text-ink"
                              aria-label={`Live Peek ${it.project.displayName}`}
                              title="Live Peek [I]"
                            >
                              <Eye size={13} />
                            </button>
                            {it.project.launchUrl && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runItem(it, 'qr');
                                }}
                                className="grid size-7 place-items-center rounded-[4px] border border-hairline bg-surface text-dim transition-colors hover:border-hairline-strong hover:text-ink"
                                aria-label={`QR handoff ${it.project.displayName}`}
                                title="QR Handoff [Q]"
                              >
                                <QrCode size={13} />
                              </button>
                            )}
                          </>
                        )}
                        <span
                          className="mono hidden pl-1 text-[10px] tracking-wider sm:block"
                          style={{ color: TIER_TOKENS[it.project.freshness.tier].ink }}
                        >
                          {badgeLabel(it.project.lastActivityAt, now)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="grid size-8 shrink-0 place-items-center rounded-[4px] border border-hairline bg-inset text-dim">
                        <it.Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                        <Highlight text={it.label} idx={it.labelIdx} />
                      </span>
                      <span className="mono shrink-0 text-[10px] tracking-wider text-mute">{it.hint}</span>
                      {on && <CornerDownLeft size={13} className="shrink-0 text-hot-ink" />}
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {!items.length && (
            <li className="px-3 py-10 text-center text-[13px] text-mute">
              Nothing matches &ldquo;{q}&rdquo;.
            </li>
          )}
        </ul>

        <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline bg-inset/75 px-4 py-2.5 text-[10.5px] text-mute">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> nav
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> launch
          </span>
          <span className="flex items-center gap-1">
            <Kbd>I</Kbd> peek
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Q</Kbd> qr
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⇧</Kbd>
            <Kbd>↵</Kbd> source
          </span>
          <span className="flex items-center gap-1">
            <Kbd>P</Kbd> / <Kbd>{modKey()}</Kbd>
            <Kbd>P</Kbd> pin
          </span>
        </div>
      </div>
    </Modal>
  );
}
