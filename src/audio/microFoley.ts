/**
 * Procedural WebAudio micro-foley synthesizer for KRUNKED // FORGE DECK V2.
 * Synthesizes restrained Braun / Teenage Engineering tactile hardware transients
 * purely via Web Audio API with zero external audio assets.
 * Safe to import and invoke in browser, SSR, jsdom, and Node.js runtimes.
 */

import type {
  AudioContextCtor,
  FoleyCue,
  FoleyDiagnostics,
  MicroFoleyEngine,
  MicroFoleyOptions,
} from '../types/audio';

export type {
  AudioContextCtor,
  FoleyCue,
  FoleyDiagnostics,
  MicroFoleyEngine,
  MicroFoleyOptions,
} from '../types/audio';

export const DEFAULT_MASTER_GAIN = 0.11;
export const MAX_MASTER_GAIN = 0.12;
export const MAX_ACTIVE_VOICES = 10;

const NOISE_BUFFER_SECONDS = 0.25;
const MIN_TICK_AUDIO_INTERVAL_SEC = 0.008;
const MIN_SYNC_AUDIO_INTERVAL_SEC = 0.25;

interface AudioWindowLike {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
}

interface DisconnectableNode {
  disconnect?: () => void;
}

interface StoppableSource extends DisconnectableNode {
  onended: ((this: AudioScheduledSourceNode, ev: Event) => unknown) | null;
  stop?: (when?: number) => void;
}

interface ActiveVoice {
  cleaned: boolean;
  cleanup: (forceStop?: boolean) => void;
}

interface NoiseBurstParams {
  t0: number;
  attackSec: number;
  decaySec: number;
  peakGain: number;
  filterFreq: number;
  filterQ: number;
}

interface BodyTransientParams {
  t0: number;
  startFreq: number;
  endFreq: number;
  durationSec: number;
  peakGain: number;
  waveType?: OscillatorType;
  attackSec?: number;
}

function clampMasterGain(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_MASTER_GAIN;
  }
  return Math.max(0, Math.min(MAX_MASTER_GAIN, raw));
}

function resolveAudioContextCtor(explicitCtor: AudioContextCtor | null): AudioContextCtor | null {
  if (typeof explicitCtor === 'function') {
    return explicitCtor;
  }
  if (typeof window !== 'undefined') {
    const win = window as unknown as AudioWindowLike;
    const winCtor = win.AudioContext ?? win.webkitAudioContext;
    if (typeof winCtor === 'function') return winCtor;
  }
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as AudioWindowLike;
    const globalCtor = g.AudioContext ?? g.webkitAudioContext;
    if (typeof globalCtor === 'function') return globalCtor;
  }
  return null;
}

function isDocumentHidden(respectVisibility: boolean): boolean {
  if (!respectVisibility) return false;
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

function isReducedMotionPreferred(respectReducedMotion: boolean): boolean {
  if (!respectReducedMotion) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function setParamValue(param: AudioParam | undefined | null, value: number, time = 0): void {
  if (!param) return;
  if (typeof param.setValueAtTime === 'function') {
    try {
      param.setValueAtTime(value, time);
    } catch {
      // Ignore automation errors on mocked or read-only params
    }
  }
  try {
    param.value = value;
  } catch {
    // Ignore read-only param properties
  }
}

function scheduleGainEnvelope(
  gainNode: GainNode,
  t0: number,
  attackSec: number,
  decaySec: number,
  peakGain: number,
): number {
  const param = gainNode.gain;
  if (!param) return t0 + attackSec + decaySec;

  const tAttack = t0 + attackSec;
  const tDecay = tAttack + decaySec;
  const tZero = tDecay + 0.0003;
  const clampedPeak = Math.max(0.0002, Math.min(1, peakGain));

  if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(0.0001, t0);
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(clampedPeak, tAttack);
    } else {
      param.setValueAtTime(clampedPeak, tAttack);
    }
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(0.0001, tDecay);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(0.0001, tDecay);
    }
    param.setValueAtTime(0, tZero);
  } else {
    param.value = clampedPeak;
  }

  return tZero;
}

function buildNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  if (typeof ctx.createBuffer !== 'function') return null;
  const sampleRate = Number(ctx.sampleRate) > 0 ? Number(ctx.sampleRate) : 44100;
  const frameCount = Math.max(512, Math.floor(sampleRate * NOISE_BUFFER_SECONDS));
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  if (buffer && typeof buffer.getChannelData === 'function') {
    const channel = buffer.getChannelData(0);
    if (channel && typeof channel.length === 'number') {
      // Deterministic xorshift32 white noise with DC-offset removal for pop-free transients
      let state = 0x6d2b79f5;
      let sum = 0;
      for (let i = 0; i < channel.length; i += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        const sample = (state >>> 0) / 0x80000000 - 1;
        channel[i] = sample;
        sum += sample;
      }
      if (channel.length > 0) {
        const mean = sum / channel.length;
        for (let i = 0; i < channel.length; i += 1) {
          const current = channel[i];
          if (current !== undefined) {
            channel[i] = Math.max(-1, Math.min(1, current - mean));
          }
        }
      }
    }
  }
  return buffer;
}

function safeDisconnect(node: DisconnectableNode | null | undefined): void {
  if (!node || typeof node.disconnect !== 'function') return;
  try {
    node.disconnect();
  } catch {
    // Ignore already-disconnected errors
  }
}

function getAudioNow(audioCtx: AudioContext): number {
  const t = Number(audioCtx.currentTime);
  return Number.isFinite(t) && t >= 0 ? t : 0;
}

export function createMicroFoley(options: MicroFoleyOptions = {}): MicroFoleyEngine {
  const explicitCtor = typeof options.AudioContext === 'function' ? options.AudioContext : null;
  const targetMasterGain = clampMasterGain(options.masterGain);
  const respectVisibility = options.respectVisibility ?? true;
  const respectReducedMotion = options.respectReducedMotion ?? true;

  let muted = true;
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let lastTickAudioTime = -Infinity;
  let lastSyncAudioTime = -Infinity;
  const activeVoices = new Set<ActiveVoice>();

  function clearActiveVoices(): void {
    if (activeVoices.size === 0) return;
    for (const voice of Array.from(activeVoices)) {
      voice.cleanup(true);
    }
    activeVoices.clear();
  }

  function registerVoice(voice: ActiveVoice): void {
    while (activeVoices.size >= MAX_ACTIVE_VOICES) {
      const oldest = activeVoices.values().next().value;
      if (!oldest) break;
      oldest.cleanup(true);
    }
    activeVoices.add(voice);
  }

  function teardownGraph(): void {
    clearActiveVoices();
    safeDisconnect(compressor);
    safeDisconnect(masterGain);
    compressor = null;
    masterGain = null;
    noiseBuffer = null;
    lastTickAudioTime = -Infinity;
    lastSyncAudioTime = -Infinity;

    if (ctx) {
      const targetCtx = ctx;
      ctx = null;
      if (typeof targetCtx.close === 'function' && targetCtx.state !== 'closed') {
        try {
          Promise.resolve(targetCtx.close()).catch(() => {});
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  function ensureContext(): AudioContext | null {
    if (muted || isDocumentHidden(respectVisibility)) return null;

    if (ctx && ctx.state === 'closed') {
      teardownGraph();
    }

    if (!ctx) {
      const AudioContextCtor = resolveAudioContextCtor(explicitCtor);
      if (!AudioContextCtor) return null;

      try {
        ctx = new AudioContextCtor();
      } catch {
        ctx = null;
        return null;
      }

      if (!ctx || typeof ctx.createGain !== 'function') {
        ctx = null;
        return null;
      }

      const now = getAudioNow(ctx);
      masterGain = ctx.createGain();
      if (!masterGain) {
        teardownGraph();
        return null;
      }
      setParamValue(masterGain.gain, targetMasterGain, now);

      if (typeof ctx.createDynamicsCompressor === 'function') {
        try {
          compressor = ctx.createDynamicsCompressor();
          setParamValue(compressor.threshold, -18, now);
          setParamValue(compressor.knee, 6, now);
          setParamValue(compressor.ratio, 12, now);
          setParamValue(compressor.attack, 0.001, now);
          setParamValue(compressor.release, 0.04, now);
          compressor.connect(masterGain);
        } catch {
          compressor = null;
        }
      }

      if (ctx.destination && typeof masterGain.connect === 'function') {
        try {
          masterGain.connect(ctx.destination);
        } catch {
          teardownGraph();
          return null;
        }
      }

      noiseBuffer = buildNoiseBuffer(ctx);
    }

    const now = getAudioNow(ctx);
    if (masterGain && masterGain.gain && masterGain.gain.value !== targetMasterGain) {
      setParamValue(masterGain.gain, targetMasterGain, now);
    }

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        Promise.resolve(ctx.resume()).catch(() => {});
      } catch {
        // Ignore resume errors when invoked without active gesture
      }
    }

    return ctx;
  }

  function getMasterInput(): AudioNode | null {
    return compressor ?? masterGain;
  }

  function bindVoiceLifecycle(source: StoppableSource, nodes: DisconnectableNode[]): ActiveVoice {
    const voice: ActiveVoice = {
      cleaned: false,
      cleanup(forceStop = false) {
        if (voice.cleaned) return;
        voice.cleaned = true;
        activeVoices.delete(voice);
        source.onended = null;
        if (forceStop && typeof source.stop === 'function') {
          try {
            source.stop();
          } catch {
            // Ignore InvalidStateError if already stopped or not started
          }
        }
        for (const node of nodes) {
          safeDisconnect(node);
        }
      },
    };
    source.onended = () => {
      voice.cleanup(false);
    };
    return voice;
  }

  function spawnNoiseBurst({
    t0,
    attackSec,
    decaySec,
    peakGain,
    filterFreq,
    filterQ,
  }: NoiseBurstParams): void {
    if (!ctx || !masterGain) return;
    if (typeof ctx.createBufferSource !== 'function' || typeof ctx.createBiquadFilter !== 'function') {
      return;
    }

    if (!noiseBuffer) {
      noiseBuffer = buildNoiseBuffer(ctx);
    }
    if (!noiseBuffer) return;

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envGain = ctx.createGain();
    const destination = getMasterInput();
    if (!source || !filter || !envGain || !destination) {
      safeDisconnect(source);
      safeDisconnect(filter);
      safeDisconnect(envGain);
      return;
    }

    source.buffer = noiseBuffer;
    filter.type = 'bandpass';
    setParamValue(filter.frequency, filterFreq, t0);
    setParamValue(filter.Q, filterQ, t0);

    const tZero = scheduleGainEnvelope(envGain, t0, attackSec, decaySec, peakGain);
    const stopAt = tZero + 0.0005;
    const voice = bindVoiceLifecycle(source, [source, filter, envGain]);

    try {
      source.connect(filter);
      filter.connect(envGain);
      envGain.connect(destination);

      const bufferDuration = Number(noiseBuffer.duration) || NOISE_BUFFER_SECONDS;
      const neededDuration = Math.max(0.005, stopAt - t0 + 0.002);
      const maxOffset = Math.max(0, bufferDuration - neededDuration);
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

      registerVoice(voice);
      source.start(t0, offset);
      source.stop(stopAt);
    } catch {
      voice.cleanup(false);
    }
  }

  function spawnBodyTransient({
    t0,
    startFreq,
    endFreq,
    durationSec,
    peakGain,
    waveType = 'triangle',
    attackSec = 0.0003,
  }: BodyTransientParams): void {
    if (!ctx || !masterGain || typeof ctx.createOscillator !== 'function') return;

    const osc = ctx.createOscillator();
    const envGain = ctx.createGain();
    const destination = getMasterInput();
    if (!osc || !envGain || !destination) {
      safeDisconnect(osc);
      safeDisconnect(envGain);
      return;
    }

    osc.type = waveType;
    const freqParam = osc.frequency;
    if (freqParam) {
      if (typeof freqParam.setValueAtTime === 'function') {
        freqParam.setValueAtTime(startFreq, t0);
        if (typeof freqParam.exponentialRampToValueAtTime === 'function') {
          freqParam.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + durationSec);
        }
      } else {
        freqParam.value = startFreq;
      }
    }

    const decaySec = Math.max(0.001, durationSec - attackSec);
    const tZero = scheduleGainEnvelope(envGain, t0, attackSec, decaySec, peakGain);
    const stopAt = tZero + 0.0005;
    const voice = bindVoiceLifecycle(osc, [osc, envGain]);

    try {
      osc.connect(envGain);
      envGain.connect(destination);
      registerVoice(voice);
      osc.start(t0);
      osc.stop(stopAt);
    } catch {
      voice.cleanup(false);
    }
  }

  function tick(): void {
    if (muted || isDocumentHidden(respectVisibility) || isReducedMotionPreferred(respectReducedMotion)) {
      return;
    }
    const audioCtx = ensureContext();
    if (!audioCtx) return;

    const audioNow = getAudioNow(audioCtx);
    if (audioNow >= lastTickAudioTime && audioNow - lastTickAudioTime < MIN_TICK_AUDIO_INTERVAL_SEC) {
      return;
    }
    if (audioCtx.state === 'suspended' && activeVoices.size >= 2) {
      return;
    }
    lastTickAudioTime = audioNow;

    const t0 = audioNow + 0.001;
    spawnNoiseBurst({
      t0,
      attackSec: 0.0003,
      decaySec: 0.0018,
      peakGain: 0.75,
      filterFreq: 3400,
      filterQ: 3.2,
    });
  }

  function click(): void {
    if (muted || isDocumentHidden(respectVisibility)) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;

    const t0 = getAudioNow(audioCtx) + 0.001;
    spawnNoiseBurst({
      t0,
      attackSec: 0.0004,
      decaySec: 0.0026,
      peakGain: 0.85,
      filterFreq: 2600,
      filterQ: 2.4,
    });
    spawnBodyTransient({
      t0,
      startFreq: 520,
      endFreq: 140,
      durationSec: 0.003,
      peakGain: 0.55,
      waveType: 'triangle',
    });
  }

  function latch(): void {
    if (muted || isDocumentHidden(respectVisibility)) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;

    const t0 = getAudioNow(audioCtx) + 0.001;
    // Stage 1: pre-catch release
    spawnNoiseBurst({
      t0,
      attackSec: 0.0003,
      decaySec: 0.0022,
      peakGain: 0.55,
      filterFreq: 2100,
      filterQ: 2.8,
    });
    spawnBodyTransient({
      t0,
      startFreq: 380,
      endFreq: 120,
      durationSec: 0.0028,
      peakGain: 0.4,
      waveType: 'triangle',
    });

    // Stage 2: crisp detent lock at +9ms
    const tLock = t0 + 0.009;
    spawnNoiseBurst({
      t0: tLock,
      attackSec: 0.0003,
      decaySec: 0.0026,
      peakGain: 0.85,
      filterFreq: 3200,
      filterQ: 3.4,
    });
    spawnBodyTransient({
      t0: tLock,
      startFreq: 640,
      endFreq: 180,
      durationSec: 0.0032,
      peakGain: 0.55,
      waveType: 'triangle',
    });
  }

  function relay(): void {
    if (muted || isDocumentHidden(respectVisibility)) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;

    const t0 = getAudioNow(audioCtx) + 0.001;
    // Stage 1 (t=0): weighted armature energize
    spawnNoiseBurst({
      t0,
      attackSec: 0.0004,
      decaySec: 0.003,
      peakGain: 0.65,
      filterFreq: 1650,
      filterQ: 2.2,
    });
    spawnBodyTransient({
      t0,
      startFreq: 290,
      endFreq: 95,
      durationSec: 0.0042,
      peakGain: 0.65,
      waveType: 'sine',
    });

    // Stage 2 (t=+14ms): secondary contact snap
    const tContact = t0 + 0.014;
    spawnNoiseBurst({
      t0: tContact,
      attackSec: 0.0003,
      decaySec: 0.0026,
      peakGain: 0.9,
      filterFreq: 3900,
      filterQ: 3.0,
    });
    spawnBodyTransient({
      t0: tContact,
      startFreq: 780,
      endFreq: 210,
      durationSec: 0.0034,
      peakGain: 0.6,
      waveType: 'triangle',
    });
  }

  function sync(): void {
    if (muted || isDocumentHidden(respectVisibility) || isReducedMotionPreferred(respectReducedMotion)) {
      return;
    }
    const audioCtx = ensureContext();
    if (!audioCtx) return;

    const audioNow = getAudioNow(audioCtx);
    if (audioNow >= lastSyncAudioTime && audioNow - lastSyncAudioTime < MIN_SYNC_AUDIO_INTERVAL_SEC) {
      return;
    }
    if (audioCtx.state === 'suspended' && activeVoices.size >= 2) {
      return;
    }
    lastSyncAudioTime = audioNow;

    const t0 = audioNow + 0.001;
    // Stage 1 (t=0): crisp telemetry micro-ping
    spawnNoiseBurst({
      t0,
      attackSec: 0.0003,
      decaySec: 0.0018,
      peakGain: 0.35,
      filterFreq: 2800,
      filterQ: 3.6,
    });
    spawnBodyTransient({
      t0,
      startFreq: 880,
      endFreq: 660,
      durationSec: 0.018,
      peakGain: 0.42,
      waveType: 'sine',
      attackSec: 0.0012,
    });

    // Stage 2 (t=+26ms): restrained harmonic fifth confirmation
    const tConfirm = t0 + 0.026;
    spawnNoiseBurst({
      t0: tConfirm,
      attackSec: 0.0003,
      decaySec: 0.0018,
      peakGain: 0.28,
      filterFreq: 4200,
      filterQ: 4.0,
    });
    spawnBodyTransient({
      t0: tConfirm,
      startFreq: 1320,
      endFreq: 990,
      durationSec: 0.022,
      peakGain: 0.38,
      waveType: 'sine',
      attackSec: 0.0012,
    });
  }

  function play(cue: FoleyCue): void {
    switch (cue) {
      case 'tick':
        tick();
        return;
      case 'click':
        click();
        return;
      case 'latch':
        latch();
        return;
      case 'relay':
        relay();
        return;
      case 'sync':
        sync();
        return;
    }
  }

  function setMuted(nextMuted: boolean): boolean {
    muted = Boolean(nextMuted);
    if (muted) {
      clearActiveVoices();
      if (ctx) {
        const now = getAudioNow(ctx);
        if (masterGain && masterGain.gain) {
          if (typeof masterGain.gain.cancelScheduledValues === 'function') {
            try {
              masterGain.gain.cancelScheduledValues(now);
            } catch {
              // Ignore
            }
          }
          setParamValue(masterGain.gain, 0, now);
        }
        if (ctx.state === 'running' && typeof ctx.suspend === 'function') {
          try {
            Promise.resolve(ctx.suspend()).catch(() => {});
          } catch {
            // Ignore
          }
        }
      }
    }
    return muted;
  }

  function isMuted(): boolean {
    return muted;
  }

  function unlock(): void {
    if (muted || isDocumentHidden(respectVisibility)) return;
    ensureContext();
  }

  function getDiagnostics(): FoleyDiagnostics {
    return {
      muted,
      supported: resolveAudioContextCtor(explicitCtor) !== null,
      contextState: ctx ? ctx.state : 'uninitialized',
      activeVoices: activeVoices.size,
    };
  }

  function dispose(): void {
    muted = true;
    teardownGraph();
  }

  return {
    play,
    tick,
    click,
    latch,
    relay,
    sync,
    setMuted,
    isMuted,
    unlock,
    getDiagnostics,
    dispose,
  };
}

export const foley: MicroFoleyEngine = createMicroFoley();
