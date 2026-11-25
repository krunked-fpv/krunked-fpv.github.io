import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMicroFoley,
  DEFAULT_MASTER_GAIN,
  foley,
  MAX_ACTIVE_VOICES,
  MAX_MASTER_GAIN,
} from '../audio/microFoley';
import { useFoley, useFoleySync } from '../audio/useFoley';
import { useDeck } from '../store/deckStore';
import type { AudioContextCtor, FoleyCue, UseFoleyReturn } from '../types/audio';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface ParamEvent {
  op: 'set' | 'linear' | 'exp' | 'cancel';
  value?: number;
  time: number;
}

class MockAudioParam {
  value = 0;
  readonly events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push({ op: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push({ op: 'linear', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) {
      throw new RangeError('exponentialRampToValueAtTime requires positive target');
    }
    this.value = value;
    this.events.push({ op: 'exp', value, time });
    return this;
  }

  cancelScheduledValues(time: number) {
    this.events.push({ op: 'cancel', time });
    return this;
  }
}

class MockNode {
  readonly kind: string;
  readonly connectedTo: unknown[] = [];
  disconnected = 0;

  constructor(kind: string) {
    this.kind = kind;
  }

  connect(target: unknown) {
    this.connectedTo.push(target);
    return target;
  }

  disconnect() {
    this.disconnected += 1;
  }
}

class MockGainNode extends MockNode {
  readonly gain = new MockAudioParam();
  constructor() {
    super('gain');
  }
}

class MockDynamicsCompressorNode extends MockNode {
  readonly threshold = new MockAudioParam();
  readonly knee = new MockAudioParam();
  readonly ratio = new MockAudioParam();
  readonly attack = new MockAudioParam();
  readonly release = new MockAudioParam();
  constructor() {
    super('compressor');
  }
}

class MockBiquadFilterNode extends MockNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new MockAudioParam();
  readonly Q = new MockAudioParam();
  constructor() {
    super('biquad');
  }
}

class MockSourceNode extends MockNode {
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  startedOffset: number | null = null;
  stoppedAt: number | null = null;
  stopCalls = 0;

  start(when = 0, offset?: number) {
    this.startedAt = when;
    this.startedOffset = offset ?? null;
  }

  stop(when?: number) {
    this.stopCalls += 1;
    if (when !== undefined) this.stoppedAt = when;
  }

  triggerEnded() {
    this.onended?.();
  }
}

class MockBufferSourceNode extends MockSourceNode {
  buffer: AudioBuffer | null = null;
  constructor() {
    super('bufferSource');
  }
}

class MockOscillatorNode extends MockSourceNode {
  type: OscillatorType = 'sine';
  readonly frequency = new MockAudioParam();
  constructor() {
    super('oscillator');
  }
}

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(index: number): Float32Array {
    return this.channels[index] ?? new Float32Array(this.length);
  }
}

interface MockContextTracker {
  instances: MockAudioContext[];
  Ctor: AudioContextCtor;
}

class MockAudioContext {
  state: AudioContextState = 'running';
  sampleRate = 44100;
  currentTime = 0.05;
  readonly destination = { kind: 'destination' };

  readonly gains: MockGainNode[] = [];
  readonly compressors: MockDynamicsCompressorNode[] = [];
  readonly filters: MockBiquadFilterNode[] = [];
  readonly bufferSources: MockBufferSourceNode[] = [];
  readonly oscillators: MockOscillatorNode[] = [];
  readonly buffers: MockAudioBuffer[] = [];

  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;

  createGain() {
    const node = new MockGainNode();
    this.gains.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new MockDynamicsCompressorNode();
    this.compressors.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBufferSource() {
    const node = new MockBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createOscillator() {
    const node = new MockOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const buf = new MockAudioBuffer(channels, length, sampleRate);
    this.buffers.push(buf);
    return buf;
  }

  resume() {
    this.resumeCalls += 1;
    if (this.state === 'suspended') {
      this.state = 'running';
    }
    return Promise.resolve();
  }

  suspend() {
    this.suspendCalls += 1;
    if (this.state === 'running') {
      this.state = 'suspended';
    }
    return Promise.resolve();
  }

  close() {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function createMockAudioTracker(initialState: AudioContextState = 'running'): MockContextTracker {
  const instances: MockAudioContext[] = [];
  class TrackedMockAudioContext extends MockAudioContext {
    constructor() {
      super();
      this.state = initialState;
      instances.push(this);
    }
  }
  return {
    instances,
    Ctor: TrackedMockAudioContext as unknown as AudioContextCtor,
  };
}

function mockVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
}

function mockReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('procedural WebAudio micro-foley DSP engine', () => {
  beforeEach(() => {
    mockVisibilityState('visible');
    mockReducedMotion(false);
    foley.dispose();
  });

  afterEach(() => {
    foley.dispose();
    mockVisibilityState('visible');
    mockReducedMotion(false);
  });

  it('defaults to muted and executes safely with zero AudioContext in jsdom', () => {
    expect(foley.isMuted()).toBe(true);
    expect(foley.getDiagnostics()).toEqual({
      muted: true,
      supported: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });

    const cues: FoleyCue[] = ['tick', 'click', 'latch', 'relay', 'sync'];
    for (const cue of cues) {
      expect(() => foley.play(cue)).not.toThrow();
    }
    expect(() => foley.unlock()).not.toThrow();
    expect(() => foley.setMuted(false)).not.toThrow();
    for (const cue of cues) {
      expect(() => foley.play(cue)).not.toThrow();
    }
    expect(() => foley.dispose()).not.toThrow();
    expect(foley.isMuted()).toBe(true);
  });

  it('allocates zero AudioContext while muted or on passive setMuted(false)', () => {
    const tracker = createMockAudioTracker();
    const engine = createMicroFoley({ AudioContext: tracker.Ctor });

    expect(engine.isMuted()).toBe(true);
    expect(engine.getDiagnostics().supported).toBe(true);
    expect(engine.getDiagnostics().contextState).toBe('uninitialized');

    engine.tick();
    engine.click();
    engine.latch();
    engine.relay();
    engine.sync();
    engine.unlock();
    expect(tracker.instances).toHaveLength(0);

    // Passive hydration unmute must STILL not allocate AudioContext
    expect(engine.setMuted(false)).toBe(false);
    expect(tracker.instances).toHaveLength(0);
    expect(engine.getDiagnostics().contextState).toBe('uninitialized');

    // First cue lazily allocates exactly one AudioContext
    engine.click();
    expect(tracker.instances).toHaveLength(1);
    expect(engine.getDiagnostics().contextState).toBe('running');

    engine.dispose();
  });

  it('handles throwing or malformed AudioContext constructors gracefully', () => {
    const ThrowingCtor = function () {
      throw new Error('Autoplay / hardware unavailable');
    } as unknown as AudioContextCtor;

    const broken = createMicroFoley({ AudioContext: ThrowingCtor });
    broken.setMuted(false);
    expect(() => broken.click()).not.toThrow();
    expect(broken.getDiagnostics().contextState).toBe('uninitialized');
    expect(() => broken.dispose()).not.toThrow();
  });

  it('routes all voices through DynamicsCompressor and hard-clamped masterGain <= 0.12', () => {
    const tracker = createMockAudioTracker();
    const loudAttempt = createMicroFoley({ AudioContext: tracker.Ctor, masterGain: 0.95 });
    loudAttempt.setMuted(false);
    loudAttempt.click();

    const ctx = tracker.instances[0]!;
    expect(ctx.compressors).toHaveLength(1);
    const comp = ctx.compressors[0]!;
    expect(comp.threshold.value).toBe(-18);
    expect(comp.knee.value).toBe(6);
    expect(comp.ratio.value).toBe(12);
    expect(comp.attack.value).toBe(0.001);
    expect(comp.release.value).toBe(0.04);

    const masterGain = ctx.gains[0]!;
    expect(masterGain.gain.value).toBe(MAX_MASTER_GAIN);
    expect(comp.connectedTo).toContain(masterGain);
    expect(masterGain.connectedTo).toContain(ctx.destination);

    // Default masterGain is 0.11
    const defaultTracker = createMockAudioTracker();
    const defaultEngine = createMicroFoley({ AudioContext: defaultTracker.Ctor });
    defaultEngine.setMuted(false);
    defaultEngine.tick();
    expect(defaultTracker.instances[0]!.gains[0]!.gain.value).toBe(DEFAULT_MASTER_GAIN);

    // Noise buffer is zero-mean and strictly bounded within [-1, 1]
    const noiseBuf = ctx.buffers[0]!;
    const samples = noiseBuf.getChannelData(0);
    expect(samples.length).toBeGreaterThanOrEqual(512);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i]!;
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
      sum += s;
    }
    expect(Math.abs(sum / samples.length)).toBeLessThan(0.005);

    loudAttempt.dispose();
    defaultEngine.dispose();
  });

  it('synthesizes all 5 tactile hardware cues with smooth zero-click envelopes', () => {
    const runCue = (cue: FoleyCue) => {
      const tracker = createMockAudioTracker();
      const engine = createMicroFoley({ AudioContext: tracker.Ctor });
      engine.setMuted(false);
      engine.play(cue);
      return { engine, ctx: tracker.instances[0]! };
    };

    // tick: 1 bandpass burst @ 3400Hz Q=3.2, 0 oscillators
    const tickRun = runCue('tick');
    expect(tickRun.ctx.bufferSources).toHaveLength(1);
    expect(tickRun.ctx.oscillators).toHaveLength(0);
    expect(tickRun.ctx.filters[0]!.type).toBe('bandpass');
    expect(tickRun.ctx.filters[0]!.frequency.value).toBe(3400);
    expect(tickRun.ctx.filters[0]!.Q.value).toBe(3.2);
    tickRun.engine.dispose();

    // click: 1 bandpass burst @ 2600Hz + 1 triangle sweep 520->140Hz
    const clickRun = runCue('click');
    expect(clickRun.ctx.bufferSources).toHaveLength(1);
    expect(clickRun.ctx.oscillators).toHaveLength(1);
    expect(clickRun.ctx.oscillators[0]!.type).toBe('triangle');
    expect(clickRun.ctx.oscillators[0]!.frequency.events[0]!.value).toBe(520);
    expect(clickRun.ctx.oscillators[0]!.frequency.events[1]!.value).toBe(140);
    clickRun.engine.dispose();

    // latch: 2 stages separated by 9ms (2 bursts + 2 triangle oscillators)
    const latchRun = runCue('latch');
    expect(latchRun.ctx.bufferSources).toHaveLength(2);
    expect(latchRun.ctx.oscillators).toHaveLength(2);
    expect(latchRun.ctx.bufferSources[1]!.startedAt! - latchRun.ctx.bufferSources[0]!.startedAt!).toBeCloseTo(
      0.009,
      6,
    );
    latchRun.engine.dispose();

    // relay: 2 stages separated by 14ms (sine armature + triangle contact)
    const relayRun = runCue('relay');
    expect(relayRun.ctx.bufferSources).toHaveLength(2);
    expect(relayRun.ctx.oscillators).toHaveLength(2);
    expect(relayRun.ctx.oscillators[0]!.type).toBe('sine');
    expect(relayRun.ctx.oscillators[1]!.type).toBe('triangle');
    expect(relayRun.ctx.bufferSources[1]!.startedAt! - relayRun.ctx.bufferSources[0]!.startedAt!).toBeCloseTo(
      0.014,
      6,
    );
    relayRun.engine.dispose();

    // sync: restrained dual-pulse telemetry confirm separated by 26ms (880->660 & 1320->990)
    const syncRun = runCue('sync');
    expect(syncRun.ctx.bufferSources).toHaveLength(2);
    expect(syncRun.ctx.oscillators).toHaveLength(2);
    expect(syncRun.ctx.oscillators[0]!.type).toBe('sine');
    expect(syncRun.ctx.oscillators[1]!.type).toBe('sine');
    expect(syncRun.ctx.oscillators[0]!.frequency.events[0]!.value).toBe(880);
    expect(syncRun.ctx.oscillators[0]!.frequency.events[1]!.value).toBe(660);
    expect(syncRun.ctx.oscillators[1]!.frequency.events[0]!.value).toBe(1320);
    expect(syncRun.ctx.oscillators[1]!.frequency.events[1]!.value).toBe(990);
    expect(syncRun.ctx.oscillators[1]!.startedAt! - syncRun.ctx.oscillators[0]!.startedAt!).toBeCloseTo(0.026, 6);

    // Every voice envelope starts at 0.0001, ramps linearly, decays exponentially to 0.0001, then zeroes before stop
    for (const envGain of syncRun.ctx.gains.slice(1)) {
      const ops = envGain.gain.events.map((e) => e.op);
      expect(ops).toEqual(['set', 'linear', 'exp', 'set']);
      expect(envGain.gain.events[0]!.value).toBe(0.0001);
      expect(envGain.gain.events[1]!.value!).toBeLessThanOrEqual(0.45);
      expect(envGain.gain.events[2]!.value).toBe(0.0001);
      expect(envGain.gain.events[3]!.value).toBe(0);
    }
    syncRun.engine.dispose();
  });

  it('auto-disconnects nodes on ended and enforces MAX_ACTIVE_VOICES FIFO eviction', () => {
    const tracker = createMockAudioTracker();
    const engine = createMicroFoley({ AudioContext: tracker.Ctor });
    engine.setMuted(false);

    engine.click(); // 2 voices (1 noise + 1 osc)
    const ctx = tracker.instances[0]!;
    expect(engine.getDiagnostics().activeVoices).toBe(2);

    ctx.bufferSources[0]!.triggerEnded();
    ctx.oscillators[0]!.triggerEnded();
    expect(engine.getDiagnostics().activeVoices).toBe(0);
    expect(ctx.bufferSources[0]!.disconnected).toBeGreaterThanOrEqual(1);
    expect(ctx.filters[0]!.disconnected).toBeGreaterThanOrEqual(1);
    expect(ctx.oscillators[0]!.disconnected).toBeGreaterThanOrEqual(1);
    expect(ctx.gains[1]!.disconnected).toBeGreaterThanOrEqual(1);
    expect(ctx.gains[2]!.disconnected).toBeGreaterThanOrEqual(1);

    // Flood 4 relays (16 voices) — activeVoices must never exceed MAX_ACTIVE_VOICES (10)
    for (let i = 0; i < 4; i += 1) {
      engine.relay();
      expect(engine.getDiagnostics().activeVoices).toBeLessThanOrEqual(MAX_ACTIVE_VOICES);
    }
    expect(engine.getDiagnostics().activeVoices).toBe(MAX_ACTIVE_VOICES);

    // Oldest voices were evicted and force-stopped
    const evictedSource = ctx.bufferSources[1]!;
    expect(evictedSource.stopCalls).toBeGreaterThanOrEqual(2); // scheduled stop + forced eviction stop
    expect(evictedSource.disconnected).toBeGreaterThanOrEqual(1);

    engine.dispose();
  });

  it('debounces rapid ticks (8ms) and syncs (250ms) and guards suspended contexts', () => {
    const tracker = createMockAudioTracker('suspended');
    const engine = createMicroFoley({ AudioContext: tracker.Ctor });
    engine.setMuted(false);

    // Start at currentTime = 0 to prove zero-clock debounce works too
    engine.unlock();
    const ctx = tracker.instances[0]!;
    ctx.currentTime = 0;
    ctx.state = 'running';

    engine.tick();
    engine.tick(); // 0ms later -> debounced
    ctx.currentTime = 0.005;
    engine.tick(); // 5ms later -> debounced
    ctx.currentTime = 0.009;
    engine.tick(); // 9ms later -> fires
    expect(ctx.bufferSources).toHaveLength(2);

    // Sync debounce (250ms)
    const beforeSync = ctx.oscillators.length;
    engine.sync();
    ctx.currentTime += 0.1;
    engine.sync(); // 100ms later -> debounced
    expect(ctx.oscillators.length - beforeSync).toBe(2);
    ctx.currentTime += 0.2;
    engine.sync(); // 300ms later -> fires
    expect(ctx.oscillators.length - beforeSync).toBe(4);

    // Suspended context resumes automatically
    ctx.state = 'suspended';
    const beforeResume = ctx.resumeCalls;
    engine.click();
    expect(ctx.resumeCalls).toBe(beforeResume + 1);

    engine.dispose();
  });

  it('respects hidden document visibility and prefers-reduced-motion gating', () => {
    const tracker = createMockAudioTracker();
    const engine = createMicroFoley({ AudioContext: tracker.Ctor });
    engine.setMuted(false);

    // Hidden tab blocks cues and unlock with zero AudioContext allocation
    mockVisibilityState('hidden');
    engine.tick();
    engine.click();
    engine.latch();
    engine.relay();
    engine.sync();
    engine.unlock();
    expect(tracker.instances).toHaveLength(0);

    // Reduced motion suppresses continuous/ambient tick & sync (zero allocation),
    // while still honoring deliberate opt-in click/latch/relay
    mockVisibilityState('visible');
    mockReducedMotion(true);
    engine.tick();
    engine.sync();
    expect(tracker.instances).toHaveLength(0);

    engine.click();
    expect(tracker.instances).toHaveLength(1);
    const ctx = tracker.instances[0]!;
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.oscillators).toHaveLength(1);

    // tick/sync remain suppressed even once context exists
    engine.tick();
    engine.sync();
    expect(ctx.bufferSources).toHaveLength(1);

    // Explicit opt-out flags allow cues even when hidden or reduced-motion
    const overrideTracker = createMockAudioTracker();
    const overrideEngine = createMicroFoley({
      AudioContext: overrideTracker.Ctor,
      respectVisibility: false,
      respectReducedMotion: false,
    });
    mockVisibilityState('hidden');
    overrideEngine.setMuted(false);
    overrideEngine.tick();
    expect(overrideTracker.instances).toHaveLength(1);
    expect(overrideTracker.instances[0]!.bufferSources).toHaveLength(1);

    engine.dispose();
    overrideEngine.dispose();
  });

  it('recovers automatically if an AudioContext transitions to closed externally', () => {
    const tracker = createMockAudioTracker();
    const engine = createMicroFoley({ AudioContext: tracker.Ctor });
    engine.setMuted(false);
    engine.click();
    expect(tracker.instances).toHaveLength(1);

    // Simulate OS/browser closing audio hardware context
    tracker.instances[0]!.state = 'closed';
    engine.click();
    expect(tracker.instances).toHaveLength(2);
    expect(engine.getDiagnostics().contextState).toBe('running');

    engine.dispose();
  });

  it('silences & suspends on setMuted(true), restores on unmute, and tears down idempotently on dispose()', () => {
    const tracker = createMockAudioTracker();
    const engine = createMicroFoley({ AudioContext: tracker.Ctor });
    engine.setMuted(false);
    engine.latch();

    const ctx = tracker.instances[0]!;
    expect(engine.getDiagnostics().activeVoices).toBe(4);

    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
    expect(engine.getDiagnostics().activeVoices).toBe(0);
    expect(ctx.gains[0]!.gain.value).toBe(0);
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe('suspended');

    // Re-unmuting and playing restores masterGain and resumes context
    engine.setMuted(false);
    engine.click();
    expect(ctx.gains[0]!.gain.value).toBe(DEFAULT_MASTER_GAIN);
    expect(ctx.resumeCalls).toBe(1);

    // dispose() tears down graph, closes context, resets muted, and is idempotent
    engine.dispose();
    expect(engine.isMuted()).toBe(true);
    expect(engine.getDiagnostics().contextState).toBe('uninitialized');
    expect(engine.getDiagnostics().activeVoices).toBe(0);
    expect(ctx.closeCalls).toBe(1);
    expect(ctx.compressors[0]!.disconnected).toBeGreaterThanOrEqual(1);
    expect(ctx.gains[0]!.disconnected).toBeGreaterThanOrEqual(1);

    expect(() => engine.dispose()).not.toThrow();
    expect(ctx.closeCalls).toBe(1);

    // Engine can re-allocate cleanly after dispose() if unmuted again
    engine.setMuted(false);
    engine.click();
    expect(tracker.instances).toHaveLength(2);
    engine.dispose();
  });
});

describe('useFoley & useFoleySync React hooks', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    mockVisibilityState('visible');
    mockReducedMotion(false);
    foley.dispose();
    useDeck.getState().setSoundEnabled(false);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    foley.dispose();
    useDeck.getState().setSoundEnabled(false);
    container.remove();
  });

  it('synchronizes foley mute state with Zustand vault prefs, visibilitychange, and toggle()', () => {
    let api: UseFoleyReturn | null = null;

    function Harness() {
      useFoleySync();
      api = useFoley();
      return null;
    }

    const root = createRoot(container);
    act(() => {
      root.render(createElement(Harness));
    });

    expect(api!.enabled).toBe(false);
    expect(foley.isMuted()).toBe(true);

    const latchSpy = vi.spyOn(foley, 'latch');

    // Toggle ON updates store, immediately unmutes singleton, and plays confirmation latch
    act(() => {
      api!.toggle();
    });
    expect(api!.enabled).toBe(true);
    expect(useDeck.getState().vault.prefs.soundEnabled).toBe(true);
    expect(foley.isMuted()).toBe(false);
    expect(latchSpy).toHaveBeenCalledTimes(1);

    // Idempotent setEnabled(true) does not double-trigger latch
    act(() => {
      api!.setEnabled(true);
    });
    expect(latchSpy).toHaveBeenCalledTimes(1);

    // Document hidden mutes engine without erasing user preference
    act(() => {
      mockVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(foley.isMuted()).toBe(true);
    expect(useDeck.getState().vault.prefs.soundEnabled).toBe(true);

    // Returning visible restores engine unmuted state
    act(() => {
      mockVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(foley.isMuted()).toBe(false);

    // Explicit setEnabled(false) persists & mutes without playing latch
    act(() => {
      api!.setEnabled(false);
    });
    expect(api!.enabled).toBe(false);
    expect(useDeck.getState().vault.prefs.soundEnabled).toBe(false);
    expect(foley.isMuted()).toBe(true);
    expect(latchSpy).toHaveBeenCalledTimes(1);

    latchSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });
});
