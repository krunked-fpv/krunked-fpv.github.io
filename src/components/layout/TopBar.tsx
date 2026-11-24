import { Search, Settings } from 'lucide-react';
import { BRAND } from '../../config/site';
import { statusLabel } from '../../data/syncReducer';
import { useDeck } from '../../store/deckStore';
import { useNow } from '../../hooks/useNow';
import { Kbd, modKey } from '../ui/Kbd';
import { IconButton } from '../ui/IconButton';
import { ForceSyncButton } from './ForceSyncButton';
import { LiveClock } from './LiveClock';

export const phaseColor = (phase: string) =>
  phase === 'LIVE' ? '#10B981' : phase === 'REVALIDATING' ? '#06B6D4' : phase === 'RATE_LIMITED' || phase === 'OFFLINE' ? '#F59E0B' : phase === 'ERROR' ? '#F43F5E' : '#5C6570';

export function TopBar() {
  const sync = useDeck((s) => s.sync);
  const setPalette = useDeck((s) => s.setPalette);
  const setSettings = useDeck((s) => s.setSettings);
  const now = useNow(1000);
  const color = phaseColor(sync.phase);
  return (
    <header
      className="sticky top-0 z-40 w-full max-w-full overflow-hidden border-b border-white/[0.06] bg-ob-950/75 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
        <a href="./" className="flex min-w-0 items-baseline gap-2 truncate whitespace-nowrap" aria-label={`${BRAND.primary} ${BRAND.secondary}`}>
          <span className="text-[15px] font-semibold tracking-[0.14em]">{BRAND.primary}</span>
          <span className="mono text-[13px] text-phosphor">{BRAND.separator}</span>
          <span className="mono hidden text-[12px] tracking-[0.18em] text-dim min-[440px]:inline">{BRAND.secondary}</span>
        </a>

        <div className="hidden items-center gap-4 md:flex">
          <LiveClock />
          <span className="h-4 w-px bg-white/10" />
          <span className="mono flex items-center gap-2 text-[11px] tracking-[0.1em]" style={{ color }} aria-live="polite">
            <span className={sync.phase === 'LIVE' || sync.phase === 'REVALIDATING' ? 'beacon' : 'inline-block size-2 rounded-full'} style={{ ['--c' as string]: color, background: color }} />
            {statusLabel(sync, now)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="btn mr-1 min-h-9! gap-2.5 pr-2 text-dim"
            aria-label="Open command palette"
          >
            <Search size={14} />
            <span className="hidden text-[13px] sm:inline">Search apps</span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <ForceSyncButton />
          <IconButton label="Settings" onClick={() => setSettings(true)}>
            <Settings size={16} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
