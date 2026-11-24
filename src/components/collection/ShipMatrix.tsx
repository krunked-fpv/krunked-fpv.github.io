import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { SPRING } from '../../config/site';
import { TIER_COLOR } from '../../domain/freshness';
import { humanizeName } from '../../domain/humanize';
import type { ShipLog } from '../../domain/shiplog';
import { useShipLogs } from '../../store/selectors';
import type { Project } from '../../types/project';
import { useDeck } from '../../store/deckStore';
import { useNow } from '../../hooks/useNow';

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
  const now = useNow(60_000);
  const setPeek = useDeck((s) => s.setPeek);
  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);

  const groups = useMemo(() => {
    const entries: Entry[] = logs
      .filter((l: ShipLog) => byName.has(l.repo))
      .map((l) => ({ id: l.id, at: l.at, repo: l.repo, label: l.label, detail: l.detail }));
    const covered = new Set(entries.filter((e) => e.label.startsWith('PUSH')).map((e) => `${e.repo}|${e.at.slice(0, 10)}`));
    for (const p of projects) {
      if (covered.has(`${p.name}|${p.pushedAt.slice(0, 10)}`)) continue;
      entries.push({ id: `p-${p.id}`, at: p.pushedAt, repo: p.name, label: 'LAST PUSH', detail: p.latestCommit?.message || p.latestCommit?.sha.slice(0, 7) || '' });
    }
    entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of entries.slice(0, 140)) {
      const day = dayLabel(e.at, now);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [logs, projects, byName, now]);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="eyebrow sticky top-[116px] z-10 mb-3 w-fit rounded-md bg-ob-950/80 px-2 py-1 backdrop-blur">{g.day}</h3>
          <ol className="relative ml-1 border-l border-white/[0.07] pl-5">
            {g.items.map((e) => {
              const p = byName.get(e.repo);
              const age = now - Date.parse(e.at);
              const color = age < 86_400_000 ? TIER_COLOR.fresh : age < 7 * 86_400_000 ? TIER_COLOR.active : TIER_COLOR.idle;
              const t = new Date(e.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              return (
                <motion.li key={e.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="relative pb-4">
                  <span className="absolute -left-[26px] top-1.5 size-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <time className="mono w-12 shrink-0 text-[11px] text-mute" dateTime={e.at}>
                      {t}
                    </time>
                    {p?.launchUrl ? (
                      <a href={p.launchUrl} target="_blank" rel="noopener noreferrer" className="text-[14px] font-medium hover:text-phosphor">
                        {humanizeName(e.repo)}
                      </a>
                    ) : (
                      <button type="button" onClick={() => setPeek(e.repo)} className="text-[14px] font-medium hover:text-volt">
                        {humanizeName(e.repo)}
                      </button>
                    )}
                    <span className="mono text-[10.5px] tracking-wider" style={{ color }}>
                      {e.label}
                    </span>
                    {e.detail && <span className="mono min-w-0 truncate text-[11px] text-mute">{e.detail}</span>}
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </section>
      ))}
      {!groups.length && <p className="mono text-[12px] text-mute">No ships in this filter.</p>}
    </div>
  );
}
