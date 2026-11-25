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

/** Chronological ship dispatch timeline: deduplicated events + repo pushes, grouped by editorial day headers. */
export function ShipMatrix({ projects }: { projects: Project[] }) {
  const logs = useShipLogs(projects);
  const chronoWindow = useDeck((s) => s.chronoWindow);
  const setPeek = useDeck((s) => s.setPeek);
  const foley = useFoley();
  const now = useNow(60_000);
  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);

  const { groups, totalDispatches } = useMemo(() => {
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
    const sliced = cleaned.slice(0, 140);

    const out: { day: string; items: Entry[] }[] = [];
    for (const e of sliced) {
      const day = dayLabel(e.at, now);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return { groups: out, totalDispatches: sliced.length };
  }, [logs, projects, byName, now, chronoWindow]);

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[9px] border border-hairline bg-surface px-6 py-14 text-center [box-shadow:var(--shadow-surface)]">
        <p className="text-[14.5px] font-semibold text-ink">No dispatches recorded in this window</p>
        <p className="mono text-[11px] text-mute">Adjust your filter or clear the active Chrono-Pulse date window.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cohesive Hangar Dispatch Section Intro Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="beacon scale-[0.85]"
            style={{ ['--c' as string]: 'var(--led-hot)' }}
            aria-hidden="true"
          />
          <h2 className="eyebrow text-ink!">
            SHIP DISPATCH // {String(totalDispatches).padStart(2, '0')} RECORDED{' '}
            {totalDispatches === 1 ? 'EVENT' : 'EVENTS'}
          </h2>
        </div>
        <span className="mono hidden rounded-[4px] border border-hairline bg-inset/75 px-2 py-0.5 text-[10px] tracking-[0.14em] text-mute sm:inline">
          SEC 02 · CHRONOLOGICAL TELEMETRY LOG
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section
            key={g.day}
            className="overflow-hidden rounded-[9px] border border-hairline bg-surface [box-shadow:var(--shadow-surface)]"
          >
            <div className="flex w-full items-center justify-between border-b border-hairline bg-inset/90 px-4 py-2.5 shadow-[inset_0_1px_0_var(--inset-highlight)] backdrop-blur-md md:sticky md:top-[calc(var(--topbar-h)+var(--filterbar-h))] md:z-10">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-[2px] rounded-full bg-hot" />
                <h3 className="eyebrow text-ink!">{g.day}</h3>
              </div>
              <span className="mono rounded-[4px] border border-hairline bg-surface/80 px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.14em] text-dim">
                {String(g.items.length).padStart(2, '0')} {g.items.length === 1 ? 'DISPATCH' : 'DISPATCHES'}
              </span>
            </div>

            <ol className="relative divide-y divide-hairline">
              {/* Architectural vertical timeline spine connecting nodes */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-3 left-[19px] hidden w-px bg-hairline sm:block"
              />

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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={SPRING}
                    className="group relative flex items-center justify-between gap-3 px-4 py-3 transition-colors before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[2.5px] before:bg-hot before:opacity-0 before:transition-opacity hover:bg-hover hover:before:opacity-100"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
                      <span
                        className="relative z-[1] size-[7px] shrink-0 rounded-full ring-2 ring-surface"
                        style={{ background: tok.dot }}
                        aria-hidden="true"
                      />
                      <time className="mono w-11 shrink-0 text-[11px] font-medium text-mute" dateTime={e.at}>
                        {t}
                      </time>
                      <button
                        type="button"
                        onClick={() => {
                          foley.latch();
                          setPeek(e.repo, 'card', p?.launchUrl ? 'sandbox' : 'brief');
                        }}
                        className="min-w-0 max-w-[220px] shrink-0 cursor-pointer truncate text-left text-[14px] font-semibold tracking-[-0.015em] text-ink transition-colors hover:text-hot-ink"
                      >
                        {label}
                      </button>
                      <span
                        className="mono shrink-0 rounded-[4px] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.09em]"
                        style={{
                          color: tok.ink,
                          background: tok.soft,
                          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tok.dot} 32%, transparent)`,
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
                  </motion.li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
