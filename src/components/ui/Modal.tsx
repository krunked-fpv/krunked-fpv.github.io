import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { SPRING } from '../../config/site';

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  align?: 'top' | 'center';
  children: ReactNode;
  /** element to focus on open; defaults to first focusable */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

/** Scrim + Esc + focus trap + focus restore. */
export function Modal({ open, onClose, label, align = 'center', children, initialFocus }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>('input,button,[href],[tabindex]:not([tabindex="-1"])');
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('input,button:not([disabled]),[href],select,textarea')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.overflow = '';
      prev.current?.focus?.();
    };
  }, [open, onClose, initialFocus]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[80] flex justify-center px-4 ${align === 'top' ? 'items-start pt-[12vh]' : 'items-center'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="absolute inset-0 bg-ob-950/70 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={SPRING}
            className="relative w-full"
            style={{ maxWidth: 'var(--modal-w, 640px)' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
