import { useMemo } from 'react';
import { useNow } from '../../hooks/useNow';

export function LiveClock() {
  const now = useNow(1000);
  const tz = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '', []);
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="mono text-[12px] tracking-wider text-dim" aria-label="Local time">
      {p(d.getHours())}:{p(d.getMinutes())}:<span className="text-ink">{p(d.getSeconds())}</span>
      <span className="ml-1.5 text-mute">{tz}</span>
    </span>
  );
}
