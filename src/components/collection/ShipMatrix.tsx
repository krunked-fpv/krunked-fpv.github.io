import { motion } from 'framer-motion';
import { ExternalLink, Eye } from 'lucide-react';
import { useMemo } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { humanizeName } from '../../domain/humanize';
import type { ShipLog } from '../../domain/shiplog';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import { useShipLogs } from '../../store/selectors';
import type { Project } from '../../types/project';
import { TIER_TOKENS } from '../spotlight/FreshnessBadge';

interface Entry {
  id: string;
  at: string;
  repo: string;
  label: string;
  detail: string;
}

const PR_LABEL_RE = /^PR\s+#(\d+)\s+([A-Z_-]+)$/i;
const DEDUPE_WINDOW_MS = 60 * 60_000;

/**
 * Collapse redundant rapid PR OPENED/REOPENED/SYNCHRONIZE/UPDATED events when a MERGED or CLOSED
 * event exists for the same repo + PR number within 60 minutes, plus duplicate identical entries.
 */
function dedupeEntries(sortedDesc: Entry[]): Entry[] {
  const closedPrTimestamps = new Map<string, number[]>();
  for (const e of sortedDesc) {
    const m = PR_LABEL_RE.exec(e.label);
    const action = m?.[2]?.toUpperCase();
    if (m && (action === 'MERGED' || action === 'CLOSED')) {
      const key = `${e.repo}#${m[1]}`;
      const ts = Date.parse(e.at);
      if (Number.isFinite(ts)) {
        const list = closedPrTimestamps.get(key) ?? [];
        list.push(ts);
        closedPrTimestamps.set(key, list);
      }
    }
  }

  const out: Entry[] = [];
  const lastSeenByKey = new Map<string, number>();

  for (const e of sortedDesc) {
    const ts = Date.parse(e.at);
    const m = PR_LABEL_RE.exec(e.label);
    const action = m?.[2]?.toUpperCase();
    if (
      m &&
      (action === 'OPENED' || action === 'REOPENED' || action === 'SYNCHRONIZE' || action === 'UPDATED') &&
      Number.isFinite(ts)
    ) {
      const closedList = closedPrTimestamps.get(`${e.repo}#${m[1]}`);
      if (closedList?.some((mts) => Math.abs(mts - ts) <= DEDUPE_WINDOW_MS)) {
        continue;
      }
    }

    const sig = `${e.repo}|${e.label}|${e.detail}`;
    const prevTs = lastSeenByKey.get(sig);
    if (prevTs !== undefined && Number.isFinite(ts) && Math.abs(prevTs - ts) <= DEDUPE_WINDOW_MS) {
      continue;
    }
    if (Number.isFinite(ts)) lastSeenByKey.set(sig, ts);
    out.push(e);
  }
  return out;
}

function dayLabel(iso: string, now: number): string {
  const d = new Date(iso);
  const t = new Date(now);
  const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((sod(t) - sod(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Chronological ship timeline: deduplicated events + repo pushes, grouped by editorial day headers. */
export function ShipMatrix({ projects }: { projects: Project[] }) {
  const logs = useShipLogs(projects);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const setPeek = useDeck((s) => s.setPeek);
  const foley = useFoley();
  const now = useNow(60_000);
  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);

  const groups = useMemo(() => {
    const entries: Entry[] = logs
      .filter((l: ShipLog) => byName.has(l.repo))
      .map((l) => ({ id: l.id, at: l.at, repo: l.repo, label: l.label, detail: l.detail }));

    const covered = new Set(
      entries.filter((e) => e.label.startsWith('PUSH')).map((e) => `${e.repo}|${e.at.slice(0, 10)}`),
    );

    for (const p of projects) {
      if (covered.has(`${p.name}|${p.pushedAt.slice(0, 10)}`)) continue;
      entries.push({
        id: `p-${p.id}`,
        at: p.pushedAt,
        repo: p.name,
        label: 'LAST PUSH',
        detail: p.latestCommit?.message || p.latestCommit?.sha.slice(0, 7) || '',
      });
    }

    const filteredEntries = chronoWindow
      ? entries.filter((e) => {
          const day = e.at.slice(0, 10);
          return day >= chronoWindow.startDate && day <= chronoWindow.endDate;
        })
      : entries;

    filteredEntries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const cleaned = dedupeEntries(filteredEntries);

    const out: { day: string; items: Entry[] }[] = [];
    for (const e of cleaned.slice(0, 140)) {
      const day = dayLabel(e.at, now);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [logs, projects, byName, now, chronoWindow]);

  if (!groups.length) {
    return (
      <div className="surface flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <p className="text-[14.5px] font-medium text-ink">No ships recorded in this window</p>
        <p className="mono text-[11px] text-mute">Adjust your filter or clear the active Chrono-Pulse date window.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <section key={g.day}>
          <div className="flex w-full items-center justify-between border-b border-hairline bg-chassis/95 px-1 py-2.5 backdrop-blur-md md:sticky md:top-[calc(var(--topbar-h)+var(--filterbar-h))] md:z-10">
            <h3 className="eyebrow text-ink!">{g.day}</h3>
            <span className="mono text-[10px] tracking-[0.14em] text-mute">
              {String(g.items.length).padStart(2, '0')} {g.items.length === 1 ? 'SHIP' : 'SHIPS'}
            </span>
          </div>

          <ol className="relative ml-2 mt-3 border-l border-hairline pl-5 pt-1">
            {g.items.map((e) => {
              const p = byName.get(e.repo);
              const age = now - Date.parse(e.at);
              const tier = age < 86_400_000 ? 'fresh' : age < 7 * 86_400_000 ? 'active' : 'idle';
              const tok = TIER_TOKENS[tier];
              const t = new Date(e.at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              const label = p?.displayName ?? humanizeName(e.repo);

              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={SPRING}
                  className="relative pb-2.5 last:pb-0"
                >
                  <span
                    className="absolute -left-[25px] top-3.5 size-2 rounded-full ring-2 ring-chassis"
                    style={{ background: tok.dot }}
                    aria-hidden="true"
                  />
                  <div className="group flex items-center justify-between gap-3 rounded-[11px] border border-transparent px-3 py-2 transition-colors hover:border-hairline hover:bg-surface">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
                      <time className="mono w-11 shrink-0 text-[11px] text-mute" dateTime={e.at}>
                        {t}
                      </time>
                      <button
                        type="button"
                        onClick={() => {
                          foley.latch();
                          setPeek(e.repo, 'card', p?.launchUrl ? 'sandbox' : 'brief');
                        }}
                        className="min-w-0 max-w-[220px] shrink-0 truncate text-left text-[14px] font-semibold tracking-[-0.015em] text-ink transition-colors hover:text-hot-ink"
                      >
                        {label}
                      </button>
                      <span
                        className="mono shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em]"
                        style={{
                          color: tok.ink,
                          background: tok.soft,
                        }}
                      >
                        {e.label}
                      </span>
                      {e.detail && (
                        <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-dim" title={e.detail}>
                          {e.detail}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          foley.latch();
                          setPeek(e.repo, 'card', p?.launchUrl ? 'sandbox' : 'brief');
                        }}
                        className="icon-btn icon-btn-sm"
                        aria-label={`Inspect ${label}`}
                        title="Live Peek"
                      >
                        <Eye size={14} />
                      </button>
                      {p?.launchUrl && (
                        <a
                          href={p.launchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => foley.relay()}
                          className="icon-btn icon-btn-sm"
                          aria-label={`Launch ${label}`}
                          title="Launch app"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
