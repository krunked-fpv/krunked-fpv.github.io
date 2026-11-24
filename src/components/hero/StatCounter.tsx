import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

export function StatCounter({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => String(Math.round(v)).padStart(2, '0'));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.2, 0.9, 0.25, 1] });
    return () => c.stop();
  }, [value, mv]);
  return (
    <div>
      <div className="mono flex items-baseline text-[30px] font-medium leading-none tracking-tight text-ink">
        <motion.span>{text}</motion.span>
        {suffix && <span className="ml-0.5 text-[14px] text-mute">{suffix}</span>}
      </div>
      <div className="eyebrow mt-1.5">{label}</div>
    </div>
  );
}
