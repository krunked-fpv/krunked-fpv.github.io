import { motion } from 'framer-motion';
import { Eye, ExternalLink } from 'lucide-react';
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

/** Chronological ship matrix: events + repo pushes, grouped by day. */
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
    const covered = new Set(entries.filter((e) => e.label.startsWith('PUSH')).map((e) => `${e.repo}|${e.at.slice(0, 10)}`));
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
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of filteredEntries.slice(0, 140)) {
      const day = dayLabel(e.at, now);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [logs, projects, byName, now, chronoWindow]);

  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="eyebrow w-full border-b border-hairline bg-chassis/95 px-2 py-2 text-dim! backdrop-blur-md md:sticky md:top-[calc(var(--topbar-h)+var(--filterbar-h))] md:z-10">
            {g.day}
          </h3>
          <ol className="relative ml-1.5 mt-3 border-l border-hairline pl-5 pt-1">
            {g.items.map((e) => {
              const p = byName.get(e.repo);
              const age = now - Date.parse(e.at);
              const tier = age < 86_400_000 ? 'fresh' : age < 7 * 86_400_000 ? 'active' : 'idle';
              const tok = TIER_TOKENS[tier];
              const t = new Date(e.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              const label = p?.displayName ?? humanizeName(e.repo);

              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={SPRING}
                  className="relative pb-3.5"
                >
                  <span
                    className="absolute -left-[25px] top-1.5 size-2 rounded-full"
                    style={{ background: tok.dot }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-transparent px-2.5 py-1.5 transition-colors hover:border-hairline hover:bg-tint">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <time className="mono w-11 shrink-0 text-[11px] text-mute" dateTime={e.at}>
                        {t}
                      </time>
                      <button
                        type="button"
                        onClick={() => {
                          foley.latch();
                          setPeek(e.repo, 'card', p?.launchUrl ? 'sandbox' : 'brief');
                        }}
                        className="text-left text-[14px] font-medium text-ink hover:text-hot-ink"
                      >
                        {label}
                      </button>
                      <span className="mono text-[10.5px] font-medium tracking-wider" style={{ color: tok.ink }}>
                        {e.label}
                      </span>
                      {e.detail && <span className="mono min-w-0 truncate text-[11px] text-dim">{e.detail}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          foley.latch();
                          setPeek(e.repo, 'card', p?.launchUrl ? 'sandbox' : 'brief');
                        }}
                        className="icon-btn size-7!"
                        aria-label={`Inspect ${label}`}
                        title="Live Peek"
                      >
                        <Eye size={13} />
                      </button>
                      {p?.launchUrl && (
                        <a
                          href={p.launchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => foley.relay()}
                          className="icon-btn size-7!"
                          aria-label={`Launch ${label}`}
                          title="Launch app"
                        >
                          <ExternalLink size={13} />
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
      {!groups.length && <p className="mono text-[12px] text-mute">No ships recorded in this window.</p>}
    </div>
  );
}
