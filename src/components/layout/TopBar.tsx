import { Download, Moon, Search, Settings, Sun, Volume2, VolumeX } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { BRAND, THEME_COLORS } from '../../config/site';
import { forceSync } from '../../data/syncEngine';
import { statusLabel, type SyncState } from '../../data/syncReducer';
import { useNow } from '../../hooks/useNow';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { useDeck } from '../../store/deckStore';
import { useProjects } from '../../store/selectors';
import type { ThemeMode } from '../../types/project';
import { BrandEmblem } from '../ui/BrandEmblem';
import { IconButton } from '../ui/IconButton';
import { Kbd, modKey } from '../ui/Kbd';

/** Semantic LED color CSS variable for sync phases (safe across Event Horizon & Solar Eclipse). */
export const phaseColor = (phase: string): string =>
  phase === 'LIVE'
    ? 'var(--led-online)'
    : phase === 'REVALIDATING' || phase === 'RATE_LIMITED' || phase === 'OFFLINE'
      ? 'var(--led-active)'
      : phase === 'ERROR'
        ? 'var(--led-alarm)'
        : 'var(--ink-muted)';

/** WCAG-AA readable ink CSS variable for sync phases (safe across Event Horizon & Solar Eclipse). */
export const phaseInk = (phase: string): string =>
  phase === 'LIVE'
    ? 'var(--led-online-ink)'
    : phase === 'REVALIDATING' || phase === 'RATE_LIMITED' || phase === 'OFFLINE'
      ? 'var(--led-active-ink)'
      : phase === 'ERROR'
        ? 'var(--led-alarm-ink)'
        : 'var(--ink-muted)';

function compactSyncLabel(sync: SyncState): string {
  switch (sync.phase) {
    case 'BOOT':
      return 'BOOT';
    case 'HYDRATED':
      return sync.hydrateSource === 'snapshot' ? 'SNAPSHOT' : sync.hydrateSource === 'cache' ? 'CACHED' : 'STANDBY';
    case 'REVALIDATING':
      return 'SYNCING';
    case 'LIVE':
      return 'LIVE';
    case 'OFFLINE':
      return 'OFFLINE';
    case 'RATE_LIMITED':
      return 'LIMITED';
    case 'ERROR':
      return 'RETRY';
  }
}

function applyThemeToDocument(next: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next === 'daylight' ? 'light' : 'dark';
  const meta =
    document.getElementById('meta-theme-color') ?? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[next]);
}

/** Releases lingering focus ring on pointer click while keeping keyboard :focus-visible intact. */
function blurOnPointerClick(e: MouseEvent<HTMLButtonElement>) {
  if (e.detail > 0) e.currentTarget.blur();
}

const NAV_ANCHORS = [
  { id: 'stage', num: '01', label: 'SINGULARITY', href: '#stage' },
  { id: 'worlds', num: '02', label: 'ARCHIVE', href: '#worlds' },
  { id: 'pulse', num: '03', label: 'PULSE', href: '#pulse' },
] as const;

type SectionId = (typeof NAV_ANCHORS)[number]['id'];

const SECTION_FLOW_ORDER: readonly SectionId[] = ['stage', 'pulse', 'worlds'];

/** Ultra-crisp 52px translucent cockpit navigation bar over the Event Horizon arena. */
export function TopBar() {
  const sync = useDeck((s) => s.sync);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const setTheme = useDeck((s) => s.setTheme);
  const setPalette = useDeck((s) => s.setPalette);
  const setSettings = useDeck((s) => s.setSettings);
  const projects = useProjects();
  const foley = useFoley();
  const { canInstall, promptInstall } = usePwaInstall();
  const now = useNow(1000);
  const [activeSection, setActiveSection] = useState<SectionId>('stage');

  const liveCount = useMemo(() => projects.filter((p) => p.kind === 'live').length, [projects]);
  const ledColor = phaseColor(sync.phase);
  const inkColor = phaseInk(sync.phase);
  const isDaylight = theme === 'daylight';
  const syncing = sync.phase === 'REVALIDATING';
  const fullStatus = statusLabel(sync, now);
  const shortStatus = compactSyncLabel(sync);

  // Track active section via viewport anchor line so tall #worlds wall stays highlighted cleanly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;

    const updateActive = () => {
      raf = 0;
      const anchorY = 128;
      const rects = SECTION_FLOW_ORDER.map((id) => {
        const el = document.getElementById(id);
        return el ? { id, rect: el.getBoundingClientRect() } : null;
      }).filter((item): item is { id: SectionId; rect: DOMRect } => item !== null);

      if (rects.length === 0) return;

      // Prefer the deepest/most-specific section spanning anchorY (worlds -> nested pulse -> stage)
      const spanning = [...rects]
        .reverse()
        .find(({ rect }) => rect.top <= anchorY && rect.bottom > anchorY);
      if (spanning) {
        setActiveSection((prev) => (prev === spanning.id ? prev : spanning.id));
        return;
      }

      // Fallback to the latest section in document order whose top crossed anchorY
      const passed = [...rects]
        .sort((a, b) => a.rect.top - b.rect.top)
        .filter(({ rect }) => rect.top <= anchorY);
      const next = passed[passed.length - 1]?.id ?? 'stage';
      setActiveSection((prev) => (prev === next ? prev : next));
    };

    const scheduleUpdate = () => {
      if (!raf) raf = window.requestAnimationFrame(updateActive);
    };

    updateActive();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [projects.length]);

  const handleToggleTheme = (e: MouseEvent<HTMLButtonElement>) => {
    blurOnPointerClick(e);
    const next: ThemeMode = isDaylight ? 'obsidian' : 'daylight';
    foley.click();
    const commit = () => {
      applyThemeToDocument(next);
      setTheme(next);
    };
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (!reduced && typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit);
    } else {
      commit();
    }
  };

  return (
    <header
      className="sticky top-0 z-40 w-full max-w-full overflow-hidden border-b border-hairline bg-bar/82 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto grid h-[52px] max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        {/* Left: Machined Brand Emblem + Micro-Glow + Spaced KRUNKED + Orbital Count Pill */}
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-2.5">
          <a
            href="./"
            className="group/brand flex items-center gap-2 rounded-[var(--radius-sm)] py-1 transition"
            aria-label={`${BRAND.primary} Event Horizon Studio`}
          >
            <span className="relative inline-flex items-center justify-center">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-[8px] opacity-0 blur-[7px] transition-opacity duration-200 group-hover/brand:opacity-75"
                style={{ background: 'color-mix(in srgb, var(--led-hot) 44%, transparent)' }}
              />
              <BrandEmblem
                size={22}
                className="relative transition-transform duration-200 group-hover/brand:scale-[1.04]"
              />
            </span>
            <span className="text-[13px] font-bold tracking-[0.22em] text-ink transition-colors group-hover/brand:text-hot-ink sm:text-[13.5px]">
              {BRAND.primary}
            </span>
          </a>

          {liveCount > 0 && (
            <>
              <span className="h-3.5 w-px bg-hairline-strong" aria-hidden="true" />
              <a
                href="#worlds"
                onClick={() => {
                  foley.tick();
                  setActiveSection('worlds');
                }}
                className="mono inline-flex h-[24px] items-center gap-1.5 rounded-[4px] border border-hairline bg-inset/75 px-2 text-[10px] font-semibold tracking-[0.13em] text-hot-ink shadow-[inset_0_1px_0_var(--inset-highlight)] transition hover:border-hairline-strong hover:bg-elevated"
              >
                <span
                  className="beacon scale-[0.78]"
                  style={{ ['--c' as string]: 'var(--led-hot)' }}
                  aria-hidden="true"
                />
                <span className="hidden min-[390px]:inline">{liveCount} IN ORBIT</span>
                <span className="min-[390px]:hidden">{liveCount} LIVE</span>
              </a>
            </>
          )}
        </div>

        {/* Center (md+): Precision Section Nav Anchors with Active Detent + Recessed Sync Telemetry Pill */}
        <nav aria-label="Primary sections" className="hidden items-center justify-center gap-1 md:flex">
          <div className="inline-flex items-center gap-0.5 rounded-[6px] border border-hairline bg-inset/65 p-[2px] shadow-[inset_0_1px_0_var(--inset-highlight)]">
            {NAV_ANCHORS.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    foley.tick();
                    setActiveSection(item.id);
                  }}
                  aria-current={active ? 'location' : undefined}
                  className={`group/nav mono relative inline-flex h-[26px] items-center gap-1.5 rounded-[4px] px-2.5 text-[10.5px] font-medium tracking-[0.14em] transition-colors ${
                    active
                      ? 'bg-elevated text-ink shadow-[inset_0_1px_0_var(--inset-highlight),inset_0_0_0_1px_var(--hairline-strong)]'
                      : 'text-dim hover:bg-hover hover:text-ink'
                  }`}
                >
                  <span
                    className={`transition-colors ${
                      active ? 'text-hot-ink' : 'text-mute group-hover/nav:text-hot-ink'
                    }`}
                  >
                    {item.num}
                  </span>
                  <span>{item.label}</span>
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 bottom-0 h-[1.5px] rounded-full bg-hot"
                    />
                  )}
                </a>
              );
            })}
          </div>

          <span className="mx-1.5 h-3.5 w-px bg-hairline-strong" aria-hidden="true" />

          <button
            type="button"
            onClick={(e) => {
              blurOnPointerClick(e);
              foley.click();
              void forceSync();
            }}
            disabled={syncing}
            className="mono inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[6px] border border-hairline bg-inset/75 px-2.5 text-[10px] font-semibold tracking-[0.12em] shadow-[inset_0_1px_0_var(--inset-highlight)] transition hover:border-hairline-strong hover:bg-elevated active:scale-[0.98] disabled:cursor-default"
            aria-label={`Sync status: ${fullStatus}. Click to force sync`}
            title={`${fullStatus} · Click to revalidate GitHub telemetry`}
          >
            <span
              className={sync.phase === 'LIVE' || sync.phase === 'REVALIDATING' ? 'beacon scale-[0.8]' : 'led-dot'}
              style={{ ['--c' as string]: ledColor }}
              aria-hidden="true"
            />
            <span style={{ color: inkColor }} aria-live="polite">
              {shortStatus}
            </span>
          </button>
        </nav>

        {/* Right: Sleek Command Keycap + Machined Cockpit Utility Rail */}
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {canInstall && (
            <button
              type="button"
              onClick={(e) => {
                blurOnPointerClick(e);
                foley.latch();
                void promptInstall();
              }}
              className="mono inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-hot-soft px-2.5 text-[10px] font-semibold tracking-[0.12em] text-hot-ink shadow-[inset_0_1px_0_var(--inset-highlight),inset_0_0_0_1px_color-mix(in_srgb,var(--led-hot)_38%,transparent)] transition hover:bg-hover active:scale-95"
              aria-label="Install Studio app"
              title="Install KRUNKED Studio as a standalone app"
            >
              <Download size={13} aria-hidden="true" />
              <span className="hidden lg:inline">INSTALL</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              blurOnPointerClick(e);
              foley.relay();
              setPalette(true);
            }}
            className="group/cmd inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] border border-hairline bg-inset/80 text-dim shadow-[inset_0_1px_0_var(--inset-highlight)] transition hover:border-hairline-strong hover:bg-elevated hover:text-ink active:scale-95 sm:w-auto sm:gap-2 sm:px-2.5"
            aria-label="Open command palette"
            title={`Command palette (${modKey()}K)`}
          >
            <Search size={13.5} className="transition-colors group-hover/cmd:text-hot-ink" aria-hidden="true" />
            <span className="hidden items-center gap-0.5 sm:inline-flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="inline-flex items-center gap-0.5 rounded-[6px] border border-hairline bg-inset/75 p-[2px] shadow-[inset_0_1px_0_var(--inset-highlight)]">
            <IconButton
              label={isDaylight ? 'Switch to Event Horizon dark theme' : 'Switch to Solar Eclipse light theme'}
              aria-pressed={isDaylight}
              tone="active"
              size="sm"
              className="h-[28px]! w-[28px]! rounded-[4px]!"
              onClick={handleToggleTheme}
            >
              {isDaylight ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
            </IconButton>

            <IconButton
              label={foley.enabled ? 'Mute studio audio foley' : 'Enable studio audio foley'}
              aria-pressed={foley.enabled}
              tone="online"
              size="sm"
              className="h-[28px]! w-[28px]! rounded-[4px]!"
              onClick={(e) => {
                blurOnPointerClick(e);
                foley.toggle();
              }}
            >
              {foley.enabled ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
            </IconButton>

            <IconButton
              label="Settings"
              size="sm"
              className="h-[28px]! w-[28px]! rounded-[4px]!"
              onClick={(e) => {
                blurOnPointerClick(e);
                foley.click();
                setSettings(true);
              }}
            >
              <Settings size={14} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Luminous bottom specular hairline gradient */}
      <span aria-hidden="true" className="topbar-luminous absolute inset-x-0 bottom-0" />
    </header>
  );
}
