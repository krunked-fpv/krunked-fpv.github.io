import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'hot' | 'online' | 'active' | 'alarm';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: '',
  hot: 'chip-hot',
  online: 'chip-online',
  active: 'chip-active',
  alarm: 'chip-alarm',
};

const TONE_LED: Record<ChipTone, string> = {
  neutral: 'var(--ink-muted)',
  hot: 'var(--led-hot)',
  online: 'var(--led-online)',
  active: 'var(--led-active)',
  alarm: 'var(--led-alarm)',
};

/** Maps legacy V1 hex strings to WCAG-AA dual-theme semantic tones. */
function inferTone(color?: string): ChipTone | null {
  if (!color) return null;
  const norm = color.trim().toLowerCase();
  if (norm === '#ff4f00' || norm === '#ff6e2e') return 'hot';
  if (norm === '#10b981' || norm === '#34d399' || norm === '#06b6d4' || norm === '#22d3ee') return 'online';
  if (norm === '#f59e0b' || norm === '#fbbf24') return 'active';
  if (norm === '#ef4444' || norm === '#f43f5e' || norm === '#f87171') return 'alarm';
  return null;
}

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  /** Optional 5px LED status indicator dot inside chip. */
  led?: boolean;
  /** Legacy compatibility prop; prefer `tone` for guaranteed Daylight AA contrast. */
  color?: string;
  className?: string;
}

export function Chip({ children, tone, led = false, color, className = '' }: ChipProps) {
  const resolved = tone ?? inferTone(color) ?? 'neutral';
  const customStyle =
    !tone && color && !inferTone(color)
      ? {
          color,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 32%, transparent)`,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }
      : undefined;

  return (
    <span className={`chip ${TONE_CLASS[resolved]} ${className}`} style={customStyle}>
      {led && <span className="size-[5px] shrink-0 rounded-full" style={{ background: TONE_LED[resolved] }} aria-hidden="true" />}
      {children}
    </span>
  );
}
