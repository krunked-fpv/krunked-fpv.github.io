import { forwardRef, type ComponentProps } from 'react';
import { motion } from 'framer-motion';
import { useSpecular } from '../../hooks/useSpecular';

export type SurfaceElevation = 'surface' | 'elevated' | 'inset';

export interface SpecularSurfaceProps extends ComponentProps<typeof motion.div> {
  elevation?: SurfaceElevation;
  /** Enables pointer-tracked border specular ring + subtle interior sheen on hover. */
  interactive?: boolean;
}

/** Machined hardware surface with 1px milled hairline, top chamfer, and pointer-tracked specular sheen. */
export const SpecularSurface = forwardRef<HTMLDivElement, SpecularSurfaceProps>(function SpecularSurface(
  { elevation = 'surface', interactive = true, className = '', ...rest },
  fwd,
) {
  const spec = useSpecular<HTMLDivElement>();
  const baseClass =
    elevation === 'inset'
      ? 'surface-inset'
      : elevation === 'elevated'
        ? `surface surface-elevated ${interactive ? 'surface-interactive' : 'surface-static'}`
        : `surface ${interactive ? 'surface-interactive' : 'surface-static'}`;

  return (
    <motion.div
      {...rest}
      ref={(el) => {
        if (interactive && elevation !== 'inset') spec(el);
        if (typeof fwd === 'function') fwd(el);
        else if (fwd) fwd.current = el;
      }}
      className={`${baseClass} ${className}`}
    />
  );
});
