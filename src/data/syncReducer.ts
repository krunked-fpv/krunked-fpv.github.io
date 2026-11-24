export type SyncPhase = 'BOOT' | 'HYDRATED' | 'REVALIDATING' | 'LIVE' | 'RATE_LIMITED' | 'OFFLINE' | 'ERROR';
export type HydrateSource = 'cache' | 'snapshot' | 'empty';

export interface SyncState {
  phase: SyncPhase;
  hydrateSource: HydrateSource;
  /** last revalidation: every core call was a 304 */
  allNotModified: boolean;
  lastSyncAt: number | null;
  /** epoch ms when the rate limit resets (RATE_LIMITED) */
  resetAt: number | null;
  error: string | null;
}

export type SyncEvent =
  | { type: 'HYDRATED'; source: HydrateSource }
  | { type: 'START' }
  | { type: 'CORE_RESULT'; allNotModified: boolean; at: number }
  | { type: 'CORE_FAIL'; kind: 'rate' | 'offline' | 'error'; resetAt?: number; message?: string }
  | { type: 'OFFLINE' }
  | { type: 'ONLINE' };

/** Pure reducer for the sync state machine (see ARCHITECTURE.md §2). */
export function syncReducer(s: SyncState, e: SyncEvent): SyncState {
  switch (e.type) {
    case 'HYDRATED':
      return s.phase === 'BOOT' || s.phase === 'HYDRATED' ? { ...s, phase: 'HYDRATED', hydrateSource: e.source } : s;
    case 'START':
      return { ...s, phase: 'REVALIDATING', error: null };
    case 'CORE_RESULT':
      return { ...s, phase: 'LIVE', allNotModified: e.allNotModified, lastSyncAt: e.at, resetAt: null, error: null };
    case 'CORE_FAIL':
      if (e.kind === 'rate') return { ...s, phase: 'RATE_LIMITED', resetAt: e.resetAt ?? null, error: null };
      if (e.kind === 'offline') return { ...s, phase: 'OFFLINE', error: null };
      return { ...s, phase: 'ERROR', error: e.message ?? 'Sync failed' };
    case 'OFFLINE':
      return { ...s, phase: 'OFFLINE' };
    case 'ONLINE':
      return s.phase === 'OFFLINE' ? { ...s, phase: s.lastSyncAt ? 'LIVE' : 'HYDRATED' } : s;
  }
}

export function statusLabel(s: SyncState, now: number): string {
  switch (s.phase) {
    case 'BOOT':
      return 'BOOTING';
    case 'HYDRATED':
      return s.hydrateSource === 'snapshot' ? 'SNAPSHOT' : s.hydrateSource === 'cache' ? 'CACHED' : 'STANDBY';
    case 'REVALIDATING':
      return 'SYNCING…';
    case 'LIVE':
      return s.allNotModified ? 'LIVE // 304 ETAG' : 'SYNCED';
    case 'OFFLINE':
      return 'CACHED // OFFLINE';
    case 'RATE_LIMITED': {
      const sec = s.resetAt ? Math.max(0, Math.ceil((s.resetAt - now) / 1000)) : 0;
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      return `RATE LIMITED // RESETS ${mm}:${ss}`;
    }
    case 'ERROR':
      return 'ERROR';
  }
}
