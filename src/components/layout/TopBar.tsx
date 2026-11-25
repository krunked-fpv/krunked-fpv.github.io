import { Download, Moon, Search, Settings, Sun, Volume2, VolumeX } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { BRAND, THEME_COLORS } from '../../config/site';
import { forceSync } from '../../data/syncEngine';
import { statusLabel } from '../../data/syncReducer';
import { useNow } from '../../hooks/useNow';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { useDeck } from '../../store/deckStore';
import type { ThemeMode } from '../../types/project';
import { BrandEmblem } from '../ui/BrandEmblem';
import { IconButton } from '../ui/IconButton';
import { Kbd, modKey } from '../ui/Kbd';
import { ForceSyncButton } from './ForceSyncButton';
import { LiveClock } from './LiveClock';

/** Semantic LED color CSS variable for sync phases (safe across Obsidian & Daylight). */
export const phaseColor = (phase: string): string =>
  phase === 'LIVE'
    ? 'var(--led-online)'
    : phase === 'REVALIDATING' || phase === 'RATE_LIMITED' || phase === 'OFFLINE'
      ? 'var(--led-active)'
      : phase === 'ERROR'
        ? 'var(--led-alarm)'
        : 'var(--ink-muted)';

/** WCAG-AA readable ink CSS variable for sync phases (safe across Obsidian & Daylight). */
export const phaseInk = (phase: string): string =>
  phase === 'LIVE'
    ? 'var(--led-online-ink)'
    : phase === 'REVALIDATING' || phase === 'RATE_LIMITED' || phase === 'OFFLINE'
      ? 'var(--led-active-ink)'
      : phase === 'ERROR'
        ? 'var(--led-alarm-ink)'
        : 'var(--ink-muted)';

function applyThemeToDocument(next: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next === 'daylight' ? 'light' : 'dark';
  const meta =
    document.getElementById('meta-theme-color') ?? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[next]);
}

export function TopBar() {
  const sync = useDeck((s) => s.sync);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const setTheme = useDeck((s) => s.setTheme);
  const setPalette = useDeck((s) => s.setPalette);
  const setSettings = useDeck((s) => s.setSettings);
  const foley = useFoley();
  const { canInstall, promptInstall } = usePwaInstall();
  const now = useNow(1000);

  const ledColor = phaseColor(sync.phase);
  const inkColor = phaseInk(sync.phase);
  const isDaylight = theme === 'daylight';
  const syncing = sync.phase === 'REVALIDATING';

  const handleToggleTheme = () => {
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
      <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
        {/* Left: Machined Brand Module (never trailing "KRUNKED //" on narrow phones) */}
        <a
          href="./"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] py-1 transition hover:opacity-90 sm:gap-2"
          aria-label={`${BRAND.primary} ${BRAND.secondary}`}
        >
          <BrandEmblem size={24} />
          <span className="flex items-baseline gap-1 sm:gap-1.5">
            <span className="text-[13px] font-semibold tracking-[0.12em] text-ink sm:text-[14.5px] sm:tracking-[0.13em]">
              {BRAND.primary}
            </span>
            <span className="mono text-[12px] font-semibold text-hot-ink" aria-hidden="true">
              {BRAND.separator}
            </span>
            <span className="mono text-[11px] font-medium tracking-[0.12em] text-dim min-[440px]:hidden">
              {BRAND.mobileShort}
            </span>
            <span className="mono hidden text-[11.5px] font-medium tracking-[0.16em] text-dim min-[440px]:inline">
              {BRAND.secondary}
            </span>
          </span>
        </a>

        {/* Center: Live Clock / Stopwatch + Clickable Telemetry Sync Pill */}
        <div className="hidden items-center gap-2.5 md:flex">
          <LiveClock />
          <span className="h-3.5 w-px bg-hairline-strong" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              foley.click();
              void forceSync();
            }}
            disabled={syncing}
            className="sync-pill"
            aria-label={`Sync status: ${statusLabel(sync, now)}. Click to force sync`}
            title="Click to revalidate GitHub telemetry"
          >
            <span
              className={sync.phase === 'LIVE' || sync.phase === 'REVALIDATING' ? 'beacon' : 'led-dot'}
              style={{ ['--c' as string]: ledColor }}
              aria-hidden="true"
            />
            <span className="truncate" style={{ color: inkColor }} aria-live="polite">
              {statusLabel(sync, now)}
            </span>
          </button>
        </div>

        {/* Right: Hardware Control Rack */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {canInstall && (
            <button
              type="button"
              onClick={() => {
                foley.latch();
                void promptInstall();
              }}
              className="mono mr-0.5 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-hot-soft px-2 text-[10.5px] font-semibold tracking-[0.1em] text-hot-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--led-hot)_34%,transparent)] transition hover:bg-hover active:scale-95 sm:mr-1 sm:px-2.5"
              aria-label="Install Forge Deck app"
              title="Install Forge Deck as standalone app"
            >
              <Download size={13} aria-hidden="true" />
              <span className="hidden sm:inline">INSTALL</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              foley.relay();
              setPalette(true);
            }}
            className="btn mr-0.5 min-h-9! h-9 w-9 justify-center px-0 text-dim sm:mr-1 sm:min-h-8! sm:h-8 sm:w-auto sm:gap-2 sm:px-2.5"
            aria-label="Open command palette"
            title={`Command palette (${modKey()}K)`}
          >
            <Search size={14} aria-hidden="true" />
            <span className="hidden text-[12.5px] lg:inline">Search</span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <IconButton
            label={isDaylight ? 'Switch to Anodized Obsidian theme' : 'Switch to Braun Daylight theme'}
            aria-pressed={isDaylight}
            tone="active"
            size="sm"
            className="sm:h-[34px] sm:w-[34px]"
            onClick={handleToggleTheme}
          >
            {isDaylight ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
          </IconButton>

          <IconButton
            label={foley.enabled ? 'Mute hardware audio foley' : 'Enable hardware audio foley'}
            aria-pressed={foley.enabled}
            tone="online"
            size="sm"
            className="sm:h-[34px] sm:w-[34px]"
            onClick={() => foley.toggle()}
          >
            {foley.enabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
          </IconButton>

          <ForceSyncButton className="hidden! sm:inline-grid! sm:h-[34px] sm:w-[34px]" />

          <IconButton
            label="Settings"
            size="sm"
            className="sm:h-[34px] sm:w-[34px]"
            onClick={() => {
              foley.click();
              setSettings(true);
            }}
          >
            <Settings size={15} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
