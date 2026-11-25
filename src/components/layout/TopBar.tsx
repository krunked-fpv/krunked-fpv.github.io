import { Download, Moon, Search, Settings, Sun, Volume2, VolumeX } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useMemo } from 'react';
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

/** Semantic LED color CSS variable for sync phases (safe across Monolith Obsidian & Vellum Daylight). */
export const phaseColor = (phase: string): string =>
  phase === 'LIVE'
    ? 'var(--led-online)'
    : phase === 'REVALIDATING' || phase === 'RATE_LIMITED' || phase === 'OFFLINE'
      ? 'var(--led-active)'
      : phase === 'ERROR'
        ? 'var(--led-alarm)'
        : 'var(--ink-muted)';

/** WCAG-AA readable ink CSS variable for sync phases (safe across Monolith Obsidian & Vellum Daylight). */
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
  { num: '01', label: 'STAGE', href: '#stage' },
  { num: '02', label: 'WORLDS', href: '#worlds' },
  { num: '03', label: 'PULSE', href: '#pulse' },
] as const;

/** Ultra-minimal 52px Floating Cinema Nav — sharp Monolith architecture with zero clutter. */
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

  const liveCount = useMemo(() => projects.filter((p) => p.kind === 'live').length, [projects]);
  const ledColor = phaseColor(sync.phase);
  const inkColor = phaseInk(sync.phase);
  const isDaylight = theme === 'daylight';
  const syncing = sync.phase === 'REVALIDATING';
  const fullStatus = statusLabel(sync, now);
  const shortStatus = compactSyncLabel(sync);

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
      className="sticky top-0 z-40 w-full max-w-full overflow-hidden border-b border-hairline bg-bar backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto grid h-[52px] max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        {/* Left: Crisp Monolith Wordmark + Live Worlds Beacon */}
        <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          <a
            href="./"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] py-1 transition hover:opacity-90"
            aria-label={`${BRAND.primary} Monolith Studio`}
          >
            <BrandEmblem size={22} />
            <span className="text-[13px] font-bold tracking-[0.2em] text-ink sm:text-[13.5px]">
              {BRAND.primary}
            </span>
          </a>

          {liveCount > 0 && (
            <>
              <span className="h-3 w-px bg-hairline-strong" aria-hidden="true" />
              <a
                href="#worlds"
                onClick={() => foley.tick()}
                className="mono inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-hot-ink transition hover:opacity-85"
              >
                <span
                  className="beacon scale-[0.8]"
                  style={{ ['--c' as string]: 'var(--led-hot)' }}
                  aria-hidden="true"
                />
                <span>{liveCount} LIVE</span>
              </a>
            </>
          )}
        </div>

        {/* Center (md+): Editorial Jump Anchors + Live Telemetry Status Dot */}
        <nav
          aria-label="Primary sections"
          className="hidden items-center justify-center gap-1 md:flex"
        >
          {NAV_ANCHORS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => foley.tick()}
              className="mono inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-[10.5px] font-medium tracking-[0.14em] text-dim transition hover:bg-hover hover:text-ink"
            >
              <span className="text-mute">{item.num}</span>
              <span>{item.label}</span>
            </a>
          ))}

          <span className="mx-1.5 h-3.5 w-px bg-hairline-strong" aria-hidden="true" />

          <button
            type="button"
            onClick={(e) => {
              blurOnPointerClick(e);
              foley.click();
              void forceSync();
            }}
            disabled={syncing}
            className="mono inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-hairline bg-surface/70 px-2.5 text-[10px] font-semibold tracking-[0.12em] transition hover:border-hairline-strong hover:bg-elevated disabled:cursor-default"
            aria-label={`Sync status: ${fullStatus}. Click to force sync`}
            title={`${fullStatus} · Click to revalidate GitHub telemetry`}
          >
            <span
              className={sync.phase === 'LIVE' || sync.phase === 'REVALIDATING' ? 'beacon scale-[0.82]' : 'led-dot'}
              style={{ ['--c' as string]: ledColor }}
              aria-hidden="true"
            />
            <span style={{ color: inkColor }} aria-live="polite">
              {shortStatus}
            </span>
          </button>
        </nav>

        {/* Right: Sleek Command Keycap + Hardware Switches */}
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
          {canInstall && (
            <button
              type="button"
              onClick={(e) => {
                blurOnPointerClick(e);
                foley.latch();
                void promptInstall();
              }}
              className="mono inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-hot-soft px-2.5 text-[10px] font-semibold tracking-[0.12em] text-hot-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--led-hot)_36%,transparent)] transition hover:bg-hover active:scale-95"
              aria-label="Install Studio app"
              title="Install KRUNKED Studio as a standalone app"
            >
              <Download size={13} aria-hidden="true" />
              <span className="hidden lg:inline">INSTALL</span>
            </button>
          )}

          {/* Compact Command Palette Trigger */}
          <button
            type="button"
            onClick={(e) => {
              blurOnPointerClick(e);
              foley.relay();
              setPalette(true);
            }}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-hairline bg-surface/80 text-dim transition hover:border-hairline-strong hover:bg-elevated hover:text-ink active:scale-95 sm:w-auto sm:gap-2 sm:px-2.5"
            aria-label="Open command palette"
            title={`Command palette (${modKey()}K)`}
          >
            <Search size={13.5} aria-hidden="true" />
            <span className="hidden items-center gap-0.5 sm:inline-flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <IconButton
            label={isDaylight ? 'Switch to Monolith Cinema dark theme' : 'Switch to Kunsthalle Vellum light theme'}
            aria-pressed={isDaylight}
            tone="active"
            size="sm"
            className="sm:h-8! sm:w-8!"
            onClick={handleToggleTheme}
          >
            {isDaylight ? <Moon size={14.5} aria-hidden="true" /> : <Sun size={14.5} aria-hidden="true" />}
          </IconButton>

          <IconButton
            label={foley.enabled ? 'Mute studio audio foley' : 'Enable studio audio foley'}
            aria-pressed={foley.enabled}
            tone="online"
            size="sm"
            className="sm:h-8! sm:w-8!"
            onClick={(e) => {
              blurOnPointerClick(e);
              foley.toggle();
            }}
          >
            {foley.enabled ? <Volume2 size={14.5} aria-hidden="true" /> : <VolumeX size={14.5} aria-hidden="true" />}
          </IconButton>

          <IconButton
            label="Settings"
            size="sm"
            className="sm:h-8! sm:w-8!"
            onClick={(e) => {
              blurOnPointerClick(e);
              foley.click();
              setSettings(true);
            }}
          >
            <Settings size={14.5} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
