import { useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export interface PwaInstallState {
  canInstall: boolean;
  installed: boolean;
  dismissed: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
}

const DISMISS_KEY = 'forge-deck:pwa-dismissed';

interface Snapshot {
  canInstall: boolean;
  installed: boolean;
  dismissed: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let dismissed = false;
let snapshot: Snapshot = { canInstall: false, installed: false, dismissed: false };
const listeners = new Set<() => void>();

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const standaloneMq = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return standaloneMq || nav.standalone === true;
  } catch {
    return false;
  }
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage?.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function emit() {
  const next: Snapshot = {
    canInstall: !installed && !dismissed && deferredPrompt !== null,
    installed,
    dismissed,
  };
  if (
    next.canInstall === snapshot.canInstall &&
    next.installed === snapshot.installed &&
    next.dismissed === snapshot.dismissed
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  installed = readStandalone();
  dismissed = readDismissed();
  snapshot = { canInstall: false, installed, dismissed };

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

const SERVER_SNAPSHOT: Snapshot = { canInstall: false, installed: false, dismissed: false };

export function usePwaInstall(): PwaInstallState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const ev = deferredPrompt;
    if (!ev) return 'unavailable';
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        installed = true;
      }
      emit();
      return choice.outcome;
    } catch {
      deferredPrompt = null;
      emit();
      return 'unavailable';
    }
  }, []);

  const dismiss = useCallback(() => {
    dismissed = true;
    try {
      window.sessionStorage?.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  return {
    canInstall: snap.canInstall,
    installed: snap.installed,
    dismissed: snap.dismissed,
    promptInstall,
    dismiss,
  };
}
