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

/** Grounded architectural studio footer (replaces fixed bottom bar for full above-the-fold clarity). */
export function StatusBar({ projects }: { projects: Project[] }) {
  const sync = useDeck((s) => s.sync);
  const user = useDeck((s) => s.user);
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
      className="mt-16 w-full border-t border-hairline bg-inset/50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Zone: Brand Atelier Identity & Live Sync Telemetry */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <BrandEmblem size={20} />
            <span className="text-[12.5px] font-semibold tracking-[0.13em] text-ink">{BRAND.primary}</span>
            <span className="mono text-[11px] font-semibold text-hot-ink" aria-hidden="true">
              {BRAND.separator}
            </span>
            <span className="mono text-[11px] font-medium tracking-[0.14em] text-dim">{BRAND.secondary}</span>
            <span className="text-mute" aria-hidden="true">
              ·
            </span>
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex items-center gap-0.5 text-[11px] text-dim transition hover:text-ink"
            >
              @{profileHandle}
              <ArrowUpRight size={11} className="text-mute" aria-hidden="true" />
            </a>
          </div>

          <div className="mono flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] tracking-[0.06em] text-mute">
            <span>
              <b className="font-semibold text-ink">{live}</b> live worlds
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Last ship <b className="font-semibold text-ink">{last ? `${formatDelta(now - Date.parse(last))} ago` : '--'}</b>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5" style={{ color: inkColor }}>
              <span className="led-dot" style={{ ['--c' as string]: ledColor }} aria-hidden="true" />
              <span aria-live="polite">{statusLabel(sync, now)}</span>
            </span>

            {chronoWindow && (
              <button
                type="button"
                onClick={() => {
                  click();
                  setChronoWindow(null);
                }}
                className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-hot-soft px-1.5 py-0.5 text-[10px] font-medium text-hot-ink transition hover:opacity-90"
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
        </div>

        {/* Center Zone: Keyboard Legend + Live Interactive Clock / Stopwatch */}
        <div className="flex flex-wrap items-center gap-3 lg:justify-center">
          <div className="hidden items-center gap-3 text-[11px] text-mute sm:flex">
            <span className="inline-flex items-center gap-1">
              <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
              <span>Search</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>T</Kbd>
              <span>Theme</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>M</Kbd>
              <span>Audio</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>1</Kbd>
              <Kbd>2</Kbd>
              <Kbd>3</Kbd>
              <span>Views</span>
            </span>
          </div>
          <span className="hidden h-3.5 w-px bg-hairline-strong sm:inline-block" aria-hidden="true" />
          <LiveClock />
        </div>

        {/* Right Zone: Vault Health, Conditional API Quota & Force Sync */}
        <div className="mono flex flex-wrap items-center gap-2.5 text-[10.5px] tracking-[0.06em] text-mute lg:justify-end">
          <button
            type="button"
            onClick={() => {
              click();
              setSettings(true, 'vault');
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 text-dim transition hover:border-hairline-strong hover:text-ink"
            aria-label={`Vault storage mirrors: ${vaultStatus.healthyCount} of 3 healthy`}
            title={`Triple-store Vault rev ${vaultStatus.rev} · ${vaultStatus.healthyCount}/3 mirrors healthy · open Vault Diagnostics`}
          >
            <span className="led-dot" style={{ ['--c' as string]: vaultLed }} aria-hidden="true" />
            <span>Vault {vaultStatus.healthyCount}/3</span>
          </button>

          {rate && (
            <span
              className="inline-flex h-7 items-center gap-2 rounded-full border border-hairline bg-surface px-2.5"
              title={resetSec > 0 ? `GitHub API quota resets in ${mm}:${ss}` : 'GitHub API quota'}
            >
              <span className="text-mute">API</span>
              <b className="font-semibold" style={{ color: qInk }}>
                {rate.remaining}/{rate.limit}
              </b>
              <span className="h-1.5 w-11 overflow-hidden rounded-full bg-tint shadow-[inset_0_0_0_1px_var(--hairline)]">
                <span
                  className="block h-full rounded-full transition-all duration-300"
                  style={{ width: `${q * 100}%`, background: qLed }}
                />
              </span>
              {resetSec > 0 && <span className="hidden xl:inline">{mm}:{ss}</span>}
            </span>
          )}

          <ForceSyncButton
            variant="text"
            className="h-7! rounded-full! border border-hairline bg-surface px-2.5! hover:border-hairline-strong"
          />
        </div>
      </div>
    </footer>
  );
}
