import { ArrowUpRight, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useFoley } from '../../audio/useFoley';
import { BRAND, GITHUB_USER } from '../../config/site';
import { getRate, subscribeRate } from '../../data/rateLimit';
import { statusLabel } from '../../data/syncReducer';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { getVaultStatus, subscribeVaultStatus } from '../../vault/cookieVault';
import { BrandEmblem } from '../ui/BrandEmblem';
import { Kbd, modKey } from '../ui/Kbd';
import { ForceSyncButton } from './ForceSyncButton';
import { LiveClock } from './LiveClock';
import { phaseColor, phaseInk } from './TopBar';

/** Iconic Swiss Studio Colophon footer for Event Horizon / Solar Eclipse. */
export function StatusBar({ projects }: { projects: Project[] }) {
  const sync = useDeck((s) => s.sync);
  const user = useDeck((s) => s.user);
  const theme = useDeck((s) => s.vault.prefs.theme);
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

  const profileUrl = user?.html_url ?? `https://github.com/${GITHUB_USER}`;
  const profileHandle = user?.login ?? GITHUB_USER;

  return (
    <footer
      className="relative mt-24 w-full border-t border-hairline bg-inset/55"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Luminous top specular colophon hairline */}
      <span aria-hidden="true" className="colophon-rule absolute inset-x-0 top-0" />

      {/* Upper Editorial Swiss Colophon Band */}
      <div className="hero-grid relative overflow-hidden border-b border-hairline">
        <div className="relative z-[1] mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <BrandEmblem size={24} />
              <span className="masthead-display text-[21px] font-bold tracking-[0.16em] text-ink sm:text-[25px]">
                {BRAND.primary}
              </span>
              <span className="mono text-[12px] font-semibold text-hot-ink" aria-hidden="true">
                {BRAND.separator}
              </span>
              <span className="mono rounded-[4px] border border-hairline bg-surface/85 px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em] text-dim shadow-[inset_0_1px_0_var(--inset-highlight)]">
                {theme === 'daylight' ? 'SOLAR ECLIPSE' : 'EVENT HORIZON'}
              </span>
            </div>

            <div className="mono flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10.5px] tracking-[0.09em] text-mute">
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-dim transition hover:text-hot-ink"
              >
                @{profileHandle}
                <ArrowUpRight size={11} aria-hidden="true" />
              </a>
              <span className="text-hairline-strong" aria-hidden="true">
                /
              </span>
              <span>
                <b className="font-semibold text-ink">{live}</b> LIVE WORLDS
              </span>
              <span className="text-hairline-strong" aria-hidden="true">
                /
              </span>
              <span>
                LAST SHIP{' '}
                <b className="font-semibold text-ink">
                  {last ? `${formatDelta(now - Date.parse(last))} AGO` : '--'}
                </b>
              </span>
              <span className="text-hairline-strong" aria-hidden="true">
                /
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-hairline bg-surface/75 px-2 py-0.5"
                style={{ color: inkColor }}
              >
                <span
                  className={sync.phase === 'LIVE' ? 'beacon scale-[0.75]' : 'led-dot'}
                  style={{ ['--c' as string]: ledColor }}
                  aria-hidden="true"
                />
                <span aria-live="polite">{statusLabel(sync, now)}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {chronoWindow && (
              <button
                type="button"
                onClick={() => {
                  click();
                  setChronoWindow(null);
                }}
                className="mono inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[5px] bg-hot-soft px-2.5 text-[10px] font-semibold tracking-[0.08em] text-hot-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--led-hot)_36%,transparent)] transition hover:opacity-90"
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
            <div className="rounded-[6px] border border-hairline bg-surface/85 px-1 py-0.5 shadow-[inset_0_1px_0_var(--inset-highlight)]">
              <LiveClock />
            </div>
          </div>
        </div>
      </div>

      {/* Lower Hardware Controls & Keyboard Legend Strip */}
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="hidden flex-wrap items-center gap-3 text-[11px] text-mute sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
              <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
            <span>Command</span>
          </span>
          <span className="h-3 w-px bg-hairline-strong" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <Kbd>T</Kbd>
            <span>Theme</span>
          </span>
          <span className="h-3 w-px bg-hairline-strong" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <Kbd>M</Kbd>
            <span>Audio</span>
          </span>
          <span className="h-3 w-px bg-hairline-strong" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
              <Kbd>1</Kbd>
              <Kbd>2</Kbd>
              <Kbd>3</Kbd>
            </span>
            <span>Views</span>
          </span>
        </div>

        <div className="mono flex flex-wrap items-center gap-2 text-[10.5px] tracking-[0.09em] text-mute">
          <button
            type="button"
            onClick={() => {
              click();
              setSettings(true, 'vault');
            }}
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[5px] border border-hairline bg-surface px-2.5 text-dim shadow-[inset_0_1px_0_var(--inset-highlight)] transition hover:border-hairline-strong hover:bg-elevated hover:text-ink"
            aria-label={`Vault storage mirrors: ${vaultStatus.healthyCount} of 3 healthy`}
            title={`Triple-store Vault rev ${vaultStatus.rev} · ${vaultStatus.healthyCount}/3 mirrors healthy · open Vault Diagnostics`}
          >
            <span className="led-dot" style={{ ['--c' as string]: vaultLed }} aria-hidden="true" />
            <span>VAULT {vaultStatus.healthyCount}/3</span>
          </button>

          {rate && (
            <span
              className="inline-flex h-7 items-center gap-2 rounded-[5px] border border-hairline bg-surface px-2.5 shadow-[inset_0_1px_0_var(--inset-highlight)]"
              title={resetSec > 0 ? `GitHub API quota resets in ${mm}:${ss}` : 'GitHub API quota'}
            >
              <span className="text-mute">API</span>
              <b className="font-semibold" style={{ color: qInk }}>
                {rate.remaining}/{rate.limit}
              </b>
              <span className="h-1.5 w-12 overflow-hidden rounded-[2px] bg-inset shadow-[inset_0_0_0_1px_var(--hairline)]">
                <span
                  className="block h-full transition-all duration-300"
                  style={{ width: `${q * 100}%`, background: qLed }}
                />
              </span>
              {resetSec > 0 && <span className="hidden text-dim xl:inline">{mm}:{ss}</span>}
            </span>
          )}

          <ForceSyncButton
            variant="text"
            className="h-7! rounded-[5px]! border border-hairline bg-surface px-2.5! shadow-[inset_0_1px_0_var(--inset-highlight)] hover:border-hairline-strong hover:bg-elevated"
          />
        </div>
      </div>
    </footer>
  );
}
