import { QUOTA_RESERVE, STORAGE_NS } from '../config/site';

export interface RateState {
  limit: number;
  remaining: number;
  /** epoch seconds */
  reset: number;
  used: number;
  /** seconds, from x-poll-interval */
  pollInterval: number | null;
  updatedAt: number;
}

const KEY = `${STORAGE_NS}:rate:v1`;
let state: RateState | null = null;
const listeners = new Set<() => void>();

function load() {
  if (state) return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw) as RateState;
  } catch {
    /* ignore */
  }
}

export function getRate(): RateState | null {
  load();
  return state;
}

export function setRate(next: RateState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeRate(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readRateHeaders(h: Headers): RateState | null {
  const remaining = h.get('x-ratelimit-remaining');
  if (remaining === null) return null;
  const prev = getRate();
  const poll = h.get('x-poll-interval');
  return {
    limit: Number(h.get('x-ratelimit-limit') ?? prev?.limit ?? 60),
    remaining: Number(remaining),
    reset: Number(h.get('x-ratelimit-reset') ?? prev?.reset ?? 0),
    used: Number(h.get('x-ratelimit-used') ?? 0),
    pollInterval: poll ? Number(poll) : (prev?.pollInterval ?? null),
    updatedAt: Date.now(),
  };
}

/** True when enrichment must not touch the network. */
export function budgetExhausted(minRemaining = QUOTA_RESERVE, now = Date.now()): boolean {
  const r = getRate();
  if (!r) return false;
  if (r.reset * 1000 <= now) return false; // window rolled over
  return r.remaining <= minRemaining;
}

export function _resetRateForTests() {
  state = null;
}
