import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { SPRING } from '../../config/site';

export type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_WIDTH: Record<ModalSize, string> = {
  sm: '460px',
  md: '640px',
  lg: '780px',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  label: string;
  align?: 'top' | 'center';
  size?: ModalSize;
  /** Anchors the dialog cleanly to the bottom edge on narrow (<640px) screens. */
  mobileSheet?: boolean;
  children: ReactNode;
  /** Element to focus on open; defaults to first focusable descendant. */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

/** Theme-aware hardware modal: scrim + Esc + Tab focus trap + focus restore + clean clipping. */
export function Modal({ open, onClose, label, align = 'center', size = 'md', mobileSheet = false, children, initialFocus }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])].filter(
        (el) => el.offsetParent !== null && !el.hasAttribute('inert'),
      );

    const t = window.setTimeout(() => {
      const target = initialFocus?.current ?? getFocusable()[0] ?? panel.current;
      target?.focus();
    }, 24);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panel.current) {
        const focusables = getFocusable();
        if (focusables.length === 0) {
          e.preventDefault();
          panel.current.focus();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (!active || !panel.current.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.overflow = prevOverflow;
      prev.current?.focus?.();
    };
  }, [open, onClose, initialFocus]);

  const containerAlign =
    align === 'top'
      ? 'items-start pt-[10vh] sm:pt-[12vh]'
      : mobileSheet
        ? 'items-end pb-0 sm:items-center sm:px-4'
        : 'items-center';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[80] flex justify-center ${mobileSheet ? 'px-0 sm:px-4' : 'px-3 sm:px-4'} ${containerAlign}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ background: 'var(--scrim)' }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            initial={mobileSheet ? { opacity: 0, y: 20, scale: 0.98 } : { opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={mobileSheet ? { opacity: 0, y: 14, scale: 0.98 } : { opacity: 0, scale: 0.97, y: -4 }}
            transition={SPRING}
            className="relative w-full overflow-hidden rounded-[var(--radius-lg)] focus:outline-none"
            style={{
              maxWidth: `var(--modal-w, ${SIZE_WIDTH[size]})`,
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
