import type { SnapshotFile } from '../types/github';

/** Build-time snapshot (same-origin, costs no API quota). Missing file is fine. */
export async function loadSnapshot(): Promise<SnapshotFile | null> {
  try {
    const res = await fetch('./snapshot.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null;
    const j = (await res.json()) as SnapshotFile;
    return j && Array.isArray(j.repos) ? j : null;
  } catch {
    return null;
  }
}
