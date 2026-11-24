import { useSyncExternalStore } from 'react';
import { statusLabel } from '../../data/syncReducer';
import { getRate, subscribeRate } from '../../data/rateLimit';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { ForceSyncButton } from './ForceSyncButton';
import { phaseColor } from './TopBar';

export function StatusBar({ projects }: { projects: Project[] }) {
  const sync = useDeck((s) => s.sync);
  const rate = useSyncExternalStore(subscribeRate, getRate);
  const now = useNow(1000);
  const live = projects.filter((p) => p.kind === 'live').length;
  const last = projects.reduce<string | null>((a, p) => (!a || Date.parse(p.lastActivityAt) > Date.parse(a) ? p.lastActivityAt : a), null);
  const color = phaseColor(sync.phase);
  const q = rate ? rate.remaining / Math.max(1, rate.limit) : 1;
  const qColor = !rate ? '#5C6570' : rate.remaining < 5 ? '#F43F5E' : rate.remaining < 20 ? '#F59E0B' : '#10B981';
  const resetSec = rate && rate.reset * 1000 > now ? Math.ceil((rate.reset * 1000 - now) / 1000) : 0;
  const mm = String(Math.floor(resetSec / 60)).padStart(2, '0');
  const ss = String(resetSec % 60).padStart(2, '0');

  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-40 max-w-full overflow-hidden border-t border-white/[0.06] bg-ob-950/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="status"
    >
      <div className="mono mx-auto flex h-9 max-w-[1480px] items-center justify-between gap-2 px-3 text-[10.5px] tracking-[0.06em] text-mute sm:gap-3 sm:px-6 sm:tracking-[0.1em]">
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap sm:gap-4">
          <span>
            <span className="hidden min-[380px]:inline">LIVE APPS </span>
            <span className="min-[380px]:hidden">LIVE </span>
            <b className="font-medium text-ink">{live}</b>
          </span>
          <span className="hidden sm:inline">
            LAST PUSH <b className="font-medium text-ink">{last ? formatDelta(now - Date.parse(last)) : '—'}</b>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 truncate" style={{ color }}>
            <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate" aria-live="polite">{statusLabel(sync, now)}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 min-[380px]:flex">
            <span className="hidden sm:inline">QUOTA</span>
            <b className="font-medium" style={{ color: qColor }}>
              {rate ? `${rate.remaining}/${rate.limit}` : '—'}
            </b>
            <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-white/10 sm:block">
              <span className="block h-full rounded-full transition-all" style={{ width: `${q * 100}%`, background: qColor }} />
            </span>
            {rate && resetSec > 0 && <span className="hidden md:inline">RESET {mm}:{ss}</span>}
          </span>
          <ForceSyncButton variant="text" />
        </div>
      </div>
    </footer>
  );
}
