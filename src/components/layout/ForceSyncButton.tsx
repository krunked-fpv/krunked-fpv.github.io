import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { forceSync } from '../../data/syncEngine';
import { useDeck } from '../../store/deckStore';

/** Tactile force-sync trigger: spins while revalidating, pulses an emerald ring on success. */
export function ForceSyncButton({ variant = 'icon' }: { variant?: 'icon' | 'text' }) {
  const phase = useDeck((s) => s.sync.phase);
  const syncing = phase === 'REVALIDATING';
  const [pulse, setPulse] = useState(false);
  const prev = useRef(phase);
  useEffect(() => {
    if (prev.current === 'REVALIDATING' && phase === 'LIVE') {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 950);
      return () => clearTimeout(t);
    }
    prev.current = phase;
  }, [phase]);
  useEffect(() => {
    prev.current = phase;
  });
  const icon = <RefreshCw size={variant === 'icon' ? 16 : 12} className={syncing ? 'spin' : ''} />;
  if (variant === 'text')
    return (
      <button
        type="button"
        onClick={() => void forceSync()}
        disabled={syncing}
        className={`mono flex h-6 items-center gap-1.5 rounded-md px-2 text-[10.5px] tracking-[0.12em] text-dim transition hover:bg-white/[0.07] hover:text-ink active:scale-95 ${pulse ? 'ring-pulse' : ''}`}
        aria-label="Force sync"
      >
        {icon}
        <span className="hidden min-[400px]:inline">FORCE </span>SYNC
      </button>
    );
  return (
    <button type="button" onClick={() => void forceSync()} disabled={syncing} className={`icon-btn ${pulse ? 'ring-pulse' : ''}`} aria-label="Force sync" title="Force sync">
      {icon}
    </button>
  );
}
