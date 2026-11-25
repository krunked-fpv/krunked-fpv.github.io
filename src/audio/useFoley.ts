/**
 * React 19 hooks bridging the procedural micro-foley singleton with Zustand vault prefs.
 * Safe in SSR / jsdom / reduced-motion / hidden-tab environments with zero try/catch boilerplate.
 */

import { useCallback, useEffect } from 'react';
import { useDeck } from '../store/deckStore';
import type { FoleyCue, UseFoleyReturn } from '../types/audio';
import { foley } from './microFoley';

const playCue = (cue: FoleyCue): void => foley.play(cue);
const playTick = (): void => foley.tick();
const playClick = (): void => foley.click();
const playLatch = (): void => foley.latch();
const playRelay = (): void => foley.relay();
const playSync = (): void => foley.sync();

/**
 * Mount once at the root App component to keep the singleton micro-foley engine
 * synchronized with `vault.prefs.soundEnabled` and page visibility state.
 * Never allocates an AudioContext until the user unmutes and triggers a cue.
 */
export function useFoleySync(): void {
  const soundEnabled = useDeck((s) => Boolean(s.vault.prefs.soundEnabled));

  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    foley.setMuted(hidden || !soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        foley.setMuted(true);
      } else {
        const enabled = Boolean(useDeck.getState().vault.prefs.soundEnabled);
        foley.setMuted(!enabled);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      foley.setMuted(true);
    };
  }, []);
}

/**
 * Ergonomic hook for triggering hardware micro-foley cues and toggling persisted audio state.
 * Calling `toggle()` or `setEnabled(true)` inside a click handler synchronously unmutes
 * and plays a confirmation `latch` cue inside the user gesture to unlock WebAudio cleanly.
 */
export function useFoley(): UseFoleyReturn {
  const enabled = useDeck((s) => Boolean(s.vault.prefs.soundEnabled));

  const setEnabled = useCallback((next: boolean) => {
    const flag = Boolean(next);
    const state = useDeck.getState();
    const prev = Boolean(state.vault.prefs.soundEnabled);
    state.setSoundEnabled(flag);
    foley.setMuted(!flag);
    if (flag && !prev) {
      foley.latch();
    }
  }, []);

  const toggle = useCallback(() => {
    const state = useDeck.getState();
    const next = !Boolean(state.vault.prefs.soundEnabled);
    state.toggleSound();
    foley.setMuted(!next);
    if (next) {
      foley.latch();
    }
  }, []);

  return {
    enabled,
    setEnabled,
    toggle,
    play: playCue,
    tick: playTick,
    click: playClick,
    latch: playLatch,
    relay: playRelay,
    sync: playSync,
  };
}
