import { forwardRef, type ComponentProps } from 'react';
import { motion } from 'framer-motion';
import { useSpecular } from '../../hooks/useSpecular';

type Props = ComponentProps<typeof motion.div>;

/** Obsidian surface with 1px hairline and a pointer-tracked specular ring. */
export const SpecularSurface = forwardRef<HTMLDivElement, Props>(function SpecularSurface({ className = '', ...rest }, fwd) {
  const spec = useSpecular<HTMLDivElement>();
  return (
    <motion.div
      {...rest}
      ref={(el) => {
        spec(el);
        if (typeof fwd === 'function') fwd(el);
        else if (fwd) fwd.current = el;
      }}
      className={`surface ${className}`}
    />
  );
});
