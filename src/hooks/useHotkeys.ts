import { useEffect } from 'react';
import type { ViewMode } from '../types/project';

export const isEditable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export interface HotkeyHandlers {
  onPalette: () => void;
  onView?: (view: ViewMode) => void;
  onToggleTheme?: () => void;
  onToggleSound?: () => void;
  onForceSync?: () => void;
  onOpenSettings?: () => void;
  onEscape?: () => void;
  /** True when any modal, palette, or peek drawer is open (blocks single-letter shortcuts). */
  modalOpen?: boolean;
}

/**
 * Global keyboard shortcuts (input & modal guarded):
 * - Cmd/Ctrl+K or / : Open command palette
 * - 1 / 2 / 3       : Switch view (Bento / Grid / Matrix)
 * - T               : Toggle theme (Obsidian <-> Braun Daylight)
 * - M               : Toggle micro-foley audio mute
 * - R               : Force GitHub sync
 * - G               : Open Settings & Diagnostics
 * - Esc             : Clear active overlays / filters
 */
export function useHotkeys(input: HotkeyHandlers | (() => void)) {
  const handlers: HotkeyHandlers = typeof input === 'function' ? { onPalette: input } : input;
  const {
    onPalette,
    onView,
    onToggleTheme,
    onToggleSound,
    onForceSync,
    onOpenSettings,
    onEscape,
    modalOpen = false,
  } = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        onPalette();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;

      if (e.key === '/' && !modalOpen) {
        e.preventDefault();
        onPalette();
        return;
      }

      if (e.key === '?' && !modalOpen) {
        e.preventDefault();
        onPalette();
        return;
      }

      if (e.key === 'Escape' && !modalOpen && onEscape) {
        onEscape();
        return;
      }

      if (modalOpen) return;

      if (k === '1' && onView) {
        e.preventDefault();
        onView('bento');
      } else if (k === '2' && onView) {
        e.preventDefault();
        onView('grid');
      } else if (k === '3' && onView) {
        e.preventDefault();
        onView('matrix');
      } else if (k === 't' && onToggleTheme) {
        e.preventDefault();
        onToggleTheme();
      } else if (k === 'm' && onToggleSound) {
        e.preventDefault();
        onToggleSound();
      } else if (k === 'r' && onForceSync) {
        e.preventDefault();
        onForceSync();
      } else if (k === 'g' && onOpenSettings) {
        e.preventDefault();
        onOpenSettings();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPalette, onView, onToggleTheme, onToggleSound, onForceSync, onOpenSettings, onEscape, modalOpen]);
}
