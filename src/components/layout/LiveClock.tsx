import { useEffect, useMemo, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { useNow } from '../../hooks/useNow';

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** Clickable 24h local clock <-> session stopwatch (double-click resets stopwatch). */
export function LiveClock() {
  const now = useNow(1000);
  const { click, latch } = useFoley();
  const [mode, setMode] = useState<'clock' | 'stopwatch'>('clock');
  const [elapsedMs, setElapsedMs] = useState(0);
  const accumulatedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  const tz = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '',
    [],
  );

  useEffect(() => {
    if (mode !== 'stopwatch') return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const tick = () => {
      if (startedAtRef.current !== null) {
        setElapsedMs(accumulatedRef.current + (Date.now() - startedAtRef.current));
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => {
      window.clearInterval(id);
      if (startedAtRef.current !== null) {
        accumulatedRef.current += Date.now() - startedAtRef.current;
        startedAtRef.current = null;
      }
    };
  }, [mode]);

  const handleClick = () => {
    click();
    setMode((prev) => (prev === 'clock' ? 'stopwatch' : 'clock'));
  };

  const handleDoubleClick = () => {
    latch();
    accumulatedRef.current = 0;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setMode('stopwatch');
  };

  if (mode === 'stopwatch') {
    const totalSec = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const tenths = Math.floor((elapsedMs % 1000) / 100);
    return (
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className="mono inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-hot-soft px-2 text-[11.5px] tracking-wider text-hot-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--led-hot)_32%,transparent)] transition hover:bg-hover active:scale-95"
        aria-label="Session stopwatch — click for local clock, double-click to reset"
        title="Stopwatch active · click for clock · double-click to reset"
      >
        <span className="led-dot" style={{ ['--c' as string]: 'var(--led-hot)' }} aria-hidden="true" />
        <span className="text-[10px] font-semibold tracking-[0.12em]">SW</span>
        <span className="font-medium text-ink">
          {pad2(mins)}:{pad2(secs)}.{tenths}
        </span>
      </button>
    );
  }

  const d = new Date(now);
  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="mono inline-flex h-7 items-center rounded-[var(--radius-sm)] px-2 text-[11.5px] tracking-wider text-dim transition hover:bg-hover hover:text-ink active:scale-95"
      aria-label="Local time — click for session stopwatch"
      title="Local 24h clock · click for session stopwatch"
    >
      {pad2(d.getHours())}:{pad2(d.getMinutes())}:<span className="font-medium text-ink">{pad2(d.getSeconds())}</span>
      {tz && <span className="ml-1.5 text-[10.5px] text-mute">{tz}</span>}
    </button>
  );
}
