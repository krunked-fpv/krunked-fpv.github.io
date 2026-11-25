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
  value?: number;
  /** Optional formatted text readout (e.g. "5h") displayed in place of numeric counter. */
  displayText?: string;
  label: string;
  /** Compact non-truncating label shown below 480px viewports (e.g. 375px phones). */
  shortLabel?: string;
  suffix?: string;
  tone?: StatTone;
  detail?: string;
  className?: string;
}

export function StatCounter({
  value = 0,
  displayText,
  label,
  shortLabel,
  suffix = '',
  tone = 'neutral',
  detail,
  className = '',
}: StatCounterProps) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => String(Math.max(0, Math.round(v))));

  useEffect(() => {
    if (displayText !== undefined) return;
    if (reduced) {
      mv.set(value);
      return;
    }
    const ctrl = animate(mv, value, { duration: 0.85, ease: [0.16, 1, 0.3, 1] });
    return () => ctrl.stop();
  }, [value, mv, reduced, displayText]);

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5">
        {tone !== 'neutral' && (
          <span className="led-dot" style={{ ['--c' as string]: TONE_LED[tone] }} aria-hidden="true" />
        )}
        <span className="eyebrow whitespace-nowrap text-[9.5px]! tracking-[0.12em]! min-[480px]:text-[10px]! min-[480px]:tracking-[0.16em]!">
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
      <div
        data-tabular
        className="mono mt-1 flex items-baseline gap-1 text-[22px] font-bold leading-none tracking-[-0.03em] text-ink sm:text-[24px]"
      >
        {displayText !== undefined ? <span>{displayText}</span> : <motion.span>{text}</motion.span>}
        {suffix && <span className="text-[11px] font-medium tracking-wider text-mute uppercase">{suffix}</span>}
        {detail && (
          <span className="ml-auto hidden truncate text-[10px] font-normal tracking-wider text-mute sm:inline">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}
