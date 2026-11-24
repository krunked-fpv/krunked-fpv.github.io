import { useState } from 'react';
import { useHeat } from '../../store/selectors';

/** 90-day ship-velocity heat strip. */
export function HeatStrip() {
  const days = useHeat();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="eyebrow shrink-0">90-day velocity</span>
        <span className="mono truncate text-[10.5px] tracking-wider text-dim">
          {h ? `${h.date} · ${h.count} ${h.count === 1 ? 'ship' : 'ships'}` : `${total} ships · ${active}d`}
        </span>
      </div>
      <div className="grid h-9 w-full min-w-0 items-end overflow-hidden" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} role="img" aria-label={`Ship velocity over 90 days: ${total} ships on ${active} days`} onPointerLeave={() => setHover(null)}>
        {days.map((d, i) => {
          const r = d.count / max;
          return (
            <div
              key={d.date}
              onPointerEnter={() => setHover(i)}
              className="relative h-full min-w-0 flex-1 cursor-crosshair"
            >
              <div
                className="absolute inset-x-[0.5px] bottom-0 rounded-[1px] transition-[height,background] duration-300 sm:inset-x-px sm:rounded-[1.5px]"
                style={{
                  height: d.count ? `${22 + r * 78}%` : '10%',
                  background: d.count ? `rgba(16,185,129,${0.35 + r * 0.65})` : 'rgba(255,255,255,0.06)',
                  boxShadow: r > 0.7 ? '0 0 8px rgba(16,185,129,0.6)' : undefined,
                  outline: hover === i ? '1px solid rgba(255,255,255,0.6)' : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mono mt-1.5 flex justify-between text-[9.5px] tracking-wider text-mute">
        <span>-90D</span>
        <span className="hidden sm:inline">public event window</span>
        <span>NOW</span>
      </div>
    </div>
  );
}
