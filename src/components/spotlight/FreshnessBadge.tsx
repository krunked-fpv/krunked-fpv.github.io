import { badgeLabel, freshnessOf, TIER_COLOR } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';

export function PulseBeacon({ project }: { project: Project }) {
  if (!project.freshness.pulse) return null;
  return <span className="beacon" style={{ ['--c' as string]: TIER_COLOR[project.freshness.tier] }} aria-hidden="true" />;
}

/** Live-ticking relative freshness badge. */
export function FreshnessBadge({ project, compact = false }: { project: Project; compact?: boolean }) {
  const age = project.freshness.ageMs;
  const now = useNow(age < 120_000 ? 1000 : 30_000);
  const iso = project.lastActivityAt;
  const label = badgeLabel(iso, now);
  const tier = freshnessOf(iso, now).tier;
  const color = TIER_COLOR[tier];
  return (
    <span
      className="chip backdrop-blur-md"
      style={{ color, background: 'rgba(7,8,10,0.62)', boxShadow: `inset 0 0 0 1px ${color}55` }}
      title={`Last push ${new Date(iso).toLocaleString()}`}
    >
      <PulseBeacon project={project} />
      {compact ? label.replace(' AGO', '') : label}
    </span>
  );
}
