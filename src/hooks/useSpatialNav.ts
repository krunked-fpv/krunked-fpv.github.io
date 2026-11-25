import { useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { isEditable } from './useHotkeys';

export interface SpatialNavCallbacks {
  onPeek?: (slug: string) => void;
  onQr?: (slug: string) => void;
  onPin?: (slug: string) => void;
  onMove?: () => void;
}

/**
 * Geometric 2D arrow-key navigation across asymmetric Bento / Telemetry Grid cards.
 * Cards must carry `data-deck-card={project.name}` and contain a focusable `[data-card-primary]` (or be focusable themselves).
 */
export function useSpatialNav<T extends HTMLElement = HTMLDivElement>(callbacks: SpatialNavCallbacks = {}) {
  const containerRef = useRef<T | null>(null);
  const { onPeek, onQr, onPin, onMove } = callbacks;

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<T>) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      const root = containerRef.current;
      if (!root) return;

      const target = e.target as HTMLElement | null;
      const currentCard = target?.closest<HTMLElement>('[data-deck-card]');
      if (!currentCard || !root.contains(currentCard)) return;

      const slug = currentCard.dataset.deckCard;
      const key = e.key.toLowerCase();

      if (slug) {
        if (key === 'i' && onPeek) {
          e.preventDefault();
          onPeek(slug);
          return;
        }
        if (key === 'p' && onPin) {
          e.preventDefault();
          onPin(slug);
          return;
        }
        if (key === 'q' && onQr) {
          e.preventDefault();
          onQr(slug);
          return;
        }
      }

      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
        return;
      }

      const cards = [...root.querySelectorAll<HTMLElement>('[data-deck-card]')];
      if (cards.length < 2) return;

      const curRect = currentCard.getBoundingClientRect();
      const curCx = curRect.left + curRect.width / 2;
      const curCy = curRect.top + curRect.height / 2;

      let best: HTMLElement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const c of cards) {
        if (c === currentCard) continue;
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - curCx;
        const dy = cy - curCy;

        if (e.key === 'ArrowRight' && dx <= 8) continue;
        if (e.key === 'ArrowLeft' && dx >= -8) continue;
        if (e.key === 'ArrowDown' && dy <= 8) continue;
        if (e.key === 'ArrowUp' && dy >= -8) continue;

        const primary = e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy);
        const cross = e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
        const score = primary + cross * 2.2;
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }

      if (best) {
        e.preventDefault();
        const focusTarget = best.querySelector<HTMLElement>('[data-card-primary]') ?? best;
        focusTarget.focus();
        best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        onMove?.();
      }
    },
    [onPeek, onQr, onPin, onMove],
  );

  return { containerRef, onKeyDown };
}
