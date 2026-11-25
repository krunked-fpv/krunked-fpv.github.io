import { AnimatePresence, motion } from 'framer-motion';
import { SPRING } from '../../config/site';
import { useDeck } from '../../store/deckStore';

const TONE_LED: Record<string, string> = {
  info: 'var(--led-hot)',
  warn: 'var(--led-active)',
  ok: 'var(--led-online)',
  error: 'var(--led-alarm)',
};

export function ToastHost() {
  const toasts = useDeck((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--statusbar-h) + 14px + env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const led = TONE_LED[t.tone] ?? 'var(--led-hot)';
          return (
            <motion.div
              key={t.id}
              role="status"
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={SPRING}
              className="surface surface-elevated surface-static pointer-events-auto flex max-w-[min(92vw,440px)] items-center gap-2.5 rounded-[var(--radius-md)]! px-3.5 py-2 text-[12.5px] font-medium text-ink"
            >
              <span className="led-dot" style={{ ['--c' as string]: led }} aria-hidden="true" />
              <span className="min-w-0 truncate">{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
