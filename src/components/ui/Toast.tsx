import { AnimatePresence, motion } from 'framer-motion';
import { SPRING } from '../../config/site';
import { useDeck } from '../../store/deckStore';

const TONE = { info: '#06B6D4', warn: '#F59E0B', ok: '#10B981' } as const;

export function ToastHost() {
  const toasts = useDeck((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--statusbar-h) + 14px + env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={SPRING}
            className="surface pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 text-[13px]"
            style={{ background: 'var(--color-ob-800)' }}
          >
            <span className="size-1.5 rounded-full" style={{ background: TONE[t.tone] }} />
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
