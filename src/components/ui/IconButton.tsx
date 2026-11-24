import type { ComponentProps, ReactNode } from 'react';

interface Props extends Omit<ComponentProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className = '', ...rest }: Props) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}
