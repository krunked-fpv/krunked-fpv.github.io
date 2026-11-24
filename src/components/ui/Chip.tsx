import type { ReactNode } from 'react';

export function Chip({ children, color, className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={`chip ${className}`} style={color ? { color, boxShadow: `inset 0 0 0 1px ${color}40`, background: `${color}14` } : undefined}>
      {children}
    </span>
  );
}
