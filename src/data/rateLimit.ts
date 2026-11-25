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

/** Parse Retry-After header supporting both integer delta-seconds and HTTP-date formats. */
export function parseRetryAfterMs(headerVal: string | null, now = Date.now()): number | null {
  if (!headerVal) return null;
  const trimmed = headerVal.trim();
  if (!trimmed) return null;

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const sec = Number(trimmed);
    return Number.isFinite(sec) && sec >= 0 ? Math.round(sec * 1000) : null;
  }

  const targetMs = Date.parse(trimmed);
  if (Number.isFinite(targetMs)) {
    return Math.max(0, targetMs - now);
  }
  return null;
}

export function readRateHeaders(h: Headers): RateState | null {
  const remainingRaw = h.get('x-ratelimit-remaining');
  if (remainingRaw === null) return null;
  const remaining = Number(remainingRaw);
  if (!Number.isFinite(remaining)) return null;

  const prev = getRate();
  const limitRaw = Number(h.get('x-ratelimit-limit') ?? prev?.limit ?? 60);
  const resetRaw = Number(h.get('x-ratelimit-reset') ?? prev?.reset ?? 0);
  const usedRaw = Number(h.get('x-ratelimit-used') ?? 0);
  const pollRaw = h.get('x-poll-interval');
  const poll = pollRaw !== null ? Number(pollRaw) : (prev?.pollInterval ?? null);

  // Normalize reset to epoch seconds even if a proxy emits milliseconds.
  const reset = Number.isFinite(resetRaw) ? (resetRaw > 1e12 ? Math.floor(resetRaw / 1000) : resetRaw) : 0;

  return {
    limit: Number.isFinite(limitRaw) ? limitRaw : 60,
    remaining,
    reset,
    used: Number.isFinite(usedRaw) ? usedRaw : 0,
    pollInterval: poll !== null && Number.isFinite(poll) ? poll : null,
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
