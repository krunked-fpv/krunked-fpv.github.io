import { forwardRef, type ComponentProps, type ReactNode } from 'react';

export type IconButtonTone = 'default' | 'hot' | 'online' | 'active';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: string;
  active?: boolean;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, tone = 'default', size = 'md', className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-active={active ? 'true' : undefined}
      data-tone={tone !== 'default' ? tone : undefined}
      className={`icon-btn ${size === 'sm' ? 'icon-btn-sm' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
