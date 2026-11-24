import type { CommitLite, GhEvent } from '../types/github';

export type ShipKind = 'push' | 'repo' | 'branch' | 'tag' | 'release' | 'pr' | 'public';

export interface ShipLog {
  id: string;
  kind: ShipKind;
  repo: string; // short name
  label: string; // "PUSH → main"
  detail: string; // sha / message / tag
  at: string;
  count: number;
}

const GROUP_MS = 30 * 60_000;

const shortRepo = (full: string) => full.split('/')[1] ?? full;

/** Translate raw events into ship logs. Defensive for trimmed payloads. */
export function toShipLogs(events: GhEvent[], commitIndex: Map<string, CommitLite> = new Map()): ShipLog[] {
  const sorted = [...events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const out: ShipLog[] = [];
  for (const e of sorted) {
    const repo = shortRepo(e.repo?.name ?? '');
    const p = e.payload ?? {};
    let log: ShipLog | null = null;
    switch (e.type) {
      case 'PushEvent': {
        const branch = (p.ref ?? '').replace('refs/heads/', '') || 'main';
        const sha = (p.head ?? '').slice(0, 7);
        const msg = p.head ? commitIndex.get(p.head)?.message : undefined;
        const prev = out[out.length - 1];
        if (
          prev &&
          prev.kind === 'push' &&
          prev.repo === repo &&
          Date.parse(prev.at) - Date.parse(e.created_at) <= GROUP_MS
        ) {
          prev.count += 1;
          prev.label = `PUSH → ${branch} ×${prev.count}`;
          continue;
        }
        log = { id: e.id, kind: 'push', repo, label: `PUSH → ${branch}`, detail: msg ?? sha, at: e.created_at, count: 1 };
        break;
      }
      case 'CreateEvent': {
        const t = p.ref_type;
        if (t === 'repository') log = mk(e, repo, 'repo', 'FORGED NEW REPO', '');
        else if (t === 'branch') log = mk(e, repo, 'branch', 'BRANCH', p.ref ?? '');
        else if (t === 'tag') log = mk(e, repo, 'tag', 'TAG', p.ref ?? '');
        break;
      }
      case 'ReleaseEvent':
        log = mk(e, repo, 'release', 'RELEASE', p.release?.tag_name ?? p.release?.name ?? '');
        break;
      case 'PullRequestEvent': {
        const n = p.number ?? p.pull_request?.number;
        const act = p.pull_request?.merged ? 'merged' : (p.action ?? 'updated');
        log = mk(e, repo, 'pr', `PR${n ? ` #${n}` : ''} ${act.toUpperCase()}`, p.pull_request?.title ?? '');
        break;
      }
      case 'PublicEvent':
        log = mk(e, repo, 'public', 'OPEN-SOURCED', '');
        break;
      default:
        break; // WatchEvent etc.
    }
    if (log) out.push(log);
  }
  return out;
}

function mk(e: GhEvent, repo: string, kind: ShipKind, label: string, detail: string): ShipLog {
  return { id: e.id, kind, repo, label, detail, at: e.created_at, count: 1 };
}
