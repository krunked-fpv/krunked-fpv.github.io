export type FoleyCue = 'tick' | 'click' | 'latch' | 'relay' | 'sync';

export interface FoleyDiagnostics {
  muted: boolean;
  supported: boolean;
  contextState: AudioContextState | 'uninitialized';
  activeVoices: number;
}

export type AudioContextCtor = new () => AudioContext;

export interface MicroFoleyOptions {
  AudioContext?: AudioContextCtor;
  /** Clamped strictly to <= 0.12 (default 0.11). */
  masterGain?: number;
  respectVisibility?: boolean;
  respectReducedMotion?: boolean;
}

export interface MicroFoleyEngine {
  play(cue: FoleyCue): void;
  tick(): void;
  click(): void;
  latch(): void;
  relay(): void;
  sync(): void;
  setMuted(muted: boolean): boolean;
  isMuted(): boolean;
  unlock(): void;
  getDiagnostics(): FoleyDiagnostics;
  dispose(): void;
}

export interface UseFoleyReturn {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  play: (cue: FoleyCue) => void;
  tick: () => void;
  click: () => void;
  latch: () => void;
  relay: () => void;
  sync: () => void;
}
