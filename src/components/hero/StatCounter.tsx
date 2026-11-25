import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { useReducedMotion } from '../../hooks/useMediaQuery';

export type StatTone = 'neutral' | 'hot' | 'online' | 'active';

const TONE_LED: Record<Exclude<StatTone, 'neutral'>, string> = {
  hot: 'var(--led-hot)',
  online: 'var(--led-online)',
  active: 'var(--led-active)',
};

export interface StatCounterProps {
  value: number;
  label: string;
  /** Compact non-truncating label shown below 480px viewports (e.g. 375px phones). */
  shortLabel?: string;
  suffix?: string;
  tone?: StatTone;
  detail?: string;
  className?: string;
}

export function StatCounter({ value, label, shortLabel, suffix = '', tone = 'neutral', detail, className = '' }: StatCounterProps) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => String(Math.max(0, Math.round(v))).padStart(2, '0'));

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const ctrl = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => ctrl.stop();
  }, [value, mv, reduced]);

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5">
        {tone !== 'neutral' && (
          <span className="led-dot" style={{ ['--c' as string]: TONE_LED[tone] }} aria-hidden="true" />
        )}
        <span className="eyebrow whitespace-nowrap text-[9.5px]! tracking-[0.09em]! min-[480px]:text-[10.5px]! min-[480px]:tracking-[0.16em]!">
          {shortLabel ? (
            <>
              <span className="min-[480px]:hidden">{shortLabel}</span>
              <span className="hidden min-[480px]:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </span>
      </div>
      <div className="mono mt-1 flex items-baseline gap-1 text-[24px] font-semibold leading-none tracking-tight text-ink sm:text-[26px]">
        <motion.span>{text}</motion.span>
        {suffix && <span className="text-[12px] font-medium text-mute">{suffix}</span>}
        {detail && <span className="ml-auto hidden truncate text-[10px] font-normal tracking-wider text-mute sm:inline">{detail}</span>}
      </div>
    </div>
  );
}
