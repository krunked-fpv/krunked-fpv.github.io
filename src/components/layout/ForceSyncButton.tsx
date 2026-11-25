import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { forceSync } from '../../data/syncEngine';
import { useDeck } from '../../store/deckStore';

/** Tactile force-sync trigger: spins while revalidating, pulses an emerald ring on success. */
export function ForceSyncButton({ variant = 'icon', className = '' }: { variant?: 'icon' | 'text'; className?: string }) {
  const phase = useDeck((s) => s.sync.phase);
  const { click } = useFoley();
  const syncing = phase === 'REVALIDATING';
  const [pulse, setPulse] = useState(false);
  const prev = useRef(phase);

  useEffect(() => {
    if (prev.current === 'REVALIDATING' && phase === 'LIVE') {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 900);
      prev.current = phase;
      return () => window.clearTimeout(t);
    }
    prev.current = phase;
  }, [phase]);

  const handleSync = () => {
    click();
    void forceSync();
  };

  const icon = <RefreshCw size={variant === 'icon' ? 15 : 12} className={syncing ? 'spin' : ''} aria-hidden="true" />;

  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className={`mono flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[10.5px] font-medium tracking-[0.1em] text-dim transition hover:bg-hover hover:text-ink active:scale-95 disabled:opacity-55 ${pulse ? 'ring-pulse' : ''} ${className}`}
        aria-label="Force sync"
        title="Force sync live GitHub telemetry"
      >
        {icon}
        <span className="hidden min-[400px]:inline">FORCE </span>SYNC
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={syncing}
      className={`icon-btn ${pulse ? 'ring-pulse' : ''} ${className}`}
      aria-label="Force sync"
      title="Force sync"
    >
      {icon}
    </button>
  );
}
