import { X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useFoley } from '../../audio/useFoley';
import { getRate, subscribeRate } from '../../data/rateLimit';
import { statusLabel } from '../../data/syncReducer';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { getVaultStatus, subscribeVaultStatus } from '../../vault/cookieVault';
import { ForceSyncButton } from './ForceSyncButton';
import { phaseColor, phaseInk } from './TopBar';

export function StatusBar({ projects }: { projects: Project[] }) {
  const sync = useDeck((s) => s.sync);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const soundEnabled = useDeck((s) => s.vault.prefs.soundEnabled);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const setChronoWindow = useDeck((s) => s.setChronoWindow);
  const setSettings = useDeck((s) => s.setSettings);
  const { click } = useFoley();

  const rate = useSyncExternalStore(subscribeRate, getRate);
  const vaultStatus = useSyncExternalStore(subscribeVaultStatus, getVaultStatus);
  const now = useNow(1000);

  const live = projects.filter((p) => p.kind === 'live').length;
  const last = projects.reduce<string | null>(
    (a, p) => (!a || Date.parse(p.lastActivityAt) > Date.parse(a) ? p.lastActivityAt : a),
    null,
  );

  const ledColor = phaseColor(sync.phase);
  const inkColor = phaseInk(sync.phase);
  const q = rate ? Math.max(0, Math.min(1, rate.remaining / Math.max(1, rate.limit))) : 1;
  const qLed = !rate
    ? 'var(--ink-muted)'
    : rate.remaining < 5
      ? 'var(--led-alarm)'
      : rate.remaining < 20
        ? 'var(--led-active)'
        : 'var(--led-online)';
  const qInk = !rate
    ? 'var(--ink-muted)'
    : rate.remaining < 5
      ? 'var(--led-alarm-ink)'
      : rate.remaining < 20
        ? 'var(--led-active-ink)'
        : 'var(--led-online-ink)';

  const resetSec = rate && rate.reset * 1000 > now ? Math.ceil((rate.reset * 1000 - now) / 1000) : 0;
  const mm = String(Math.floor(resetSec / 60)).padStart(2, '0');
  const ss = String(resetSec % 60).padStart(2, '0');

  const vaultLed =
    vaultStatus.healthyCount === 3
      ? 'var(--led-online)'
      : vaultStatus.healthyCount > 0
        ? 'var(--led-active)'
        : 'var(--led-alarm)';

  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-40 max-w-full overflow-hidden border-t border-hairline bg-bar backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="status"
    >
      <div className="mono mx-auto flex h-9 max-w-[1480px] items-center justify-between gap-2 px-3 text-[10.5px] tracking-[0.06em] text-mute sm:gap-3 sm:px-6 sm:tracking-[0.09em]">
        {/* Left Telemetry Cluster */}
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap sm:gap-4">
          <span>
            <span className="hidden min-[380px]:inline">LIVE APPS </span>
            <span className="min-[380px]:hidden">LIVE </span>
            <b className="font-semibold text-ink">{live}</b>
          </span>

          <span className="hidden sm:inline">
            LAST PUSH <b className="font-semibold text-ink">{last ? formatDelta(now - Date.parse(last)) : '--'}</b>
          </span>

          <span className="flex min-w-0 items-center gap-1.5 truncate" style={{ color: inkColor }}>
            <span className="led-dot" style={{ ['--c' as string]: ledColor }} aria-hidden="true" />
            <span className="truncate" aria-live="polite">
              {statusLabel(sync, now)}
            </span>
          </span>

          {chronoWindow && (
            <button
              type="button"
              onClick={() => {
                click();
                setChronoWindow(null);
              }}
              className="hidden items-center gap-1 rounded-[var(--radius-xs)] bg-hot-soft px-1.5 py-0.5 text-[10px] font-medium text-hot-ink transition hover:opacity-90 md:inline-flex"
              aria-label="Clear Chrono-Pulse date filter"
              title="Click to clear active Chrono-Pulse date filter"
            >
              <span>
                {chronoWindow.startDate === chronoWindow.endDate
                  ? chronoWindow.startDate
                  : `${chronoWindow.startDate}..${chronoWindow.endDate}`}
              </span>
              <X size={10} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Right Diagnostics & Controls */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              click();
              setSettings(true, 'vault');
            }}
            className="hidden items-center gap-1.5 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-mute transition hover:bg-hover hover:text-ink lg:inline-flex"
            aria-label={`Vault storage mirrors: ${vaultStatus.healthyCount} of 3 healthy`}
            title={`Triple-store Vault rev ${vaultStatus.rev} · ${vaultStatus.healthyCount}/3 mirrors healthy · open Vault Diagnostics`}
          >
            <span className="led-dot" style={{ ['--c' as string]: vaultLed }} aria-hidden="true" />
            <span>VAULT {vaultStatus.healthyCount}/3</span>
          </button>

          <span className="hidden text-mute xl:inline">
            {theme === 'daylight' ? 'DAYLIGHT' : 'OBSIDIAN'} · {soundEnabled ? 'SFX ON' : 'SFX MUTE'}
          </span>

          <span className="hidden items-center gap-2 min-[380px]:flex">
            <span className="hidden sm:inline">QUOTA</span>
            <b className="font-semibold" style={{ color: qInk }}>
              {rate ? `${rate.remaining}/${rate.limit}` : '--'}
            </b>
            <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-tint shadow-[inset_0_0_0_1px_var(--hairline)] sm:block">
              <span
                className="block h-full rounded-full transition-all duration-300"
                style={{ width: `${q * 100}%`, background: qLed }}
              />
            </span>
            {rate && resetSec > 0 && (
              <span className="hidden md:inline">
                RESET {mm}:{ss}
              </span>
            )}
          </span>

          <ForceSyncButton variant="text" />
        </div>
      </div>
    </footer>
  );
}
