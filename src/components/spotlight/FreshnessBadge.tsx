import { badgeLabel, freshnessOf } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { FreshTier, Project } from '../../types/project';

export const TIER_TOKENS: Record<FreshTier, { dot: string; ink: string; soft: string }> = {
  fresh: { dot: 'var(--led-hot)', ink: 'var(--led-hot-ink)', soft: 'var(--led-hot-soft)' },
  active: { dot: 'var(--led-active)', ink: 'var(--led-active-ink)', soft: 'var(--led-active-soft)' },
  idle: { dot: 'var(--ink-muted)', ink: 'var(--ink-muted)', soft: 'var(--surface-tint)' },
};

export function PulseBeacon({ project }: { project: Project }) {
  const age = project.freshness.ageMs;
  const now = useNow(age < 120_000 ? 1000 : 30_000);
  const f = freshnessOf(project.lastActivityAt, now);
  const tok = TIER_TOKENS[f.tier];
  if (!f.pulse) {
    return (
      <span
        className="inline-block size-[7px] shrink-0 rounded-full"
        style={{ background: tok.dot }}
        aria-hidden="true"
      />
    );
  }
  return <span className="beacon shrink-0" style={{ ['--c' as string]: tok.dot }} aria-hidden="true" />;
}

/** Live-ticking, dual-theme AA freshness badge with dynamic pulse. */
export function FreshnessBadge({
  project,
  compact = false,
  overlay = true,
}: {
  project: Project;
  compact?: boolean;
  /** True when placed over cover-art canvas (uses high-contrast --badge-bg plate). */
  overlay?: boolean;
}) {
  const age = project.freshness.ageMs;
  const now = useNow(age < 120_000 ? 1000 : 30_000);
  const iso = project.lastActivityAt;
  const f = freshnessOf(iso, now);
  const label = badgeLabel(iso, now);
  const tok = TIER_TOKENS[f.tier];

  return (
    <span
      className="chip backdrop-blur-md"
      style={{
        color: tok.ink,
        background: overlay ? 'var(--badge-bg)' : tok.soft,
        boxShadow: `inset 0 0 0 1px ${overlay ? 'var(--badge-border)' : 'var(--hairline)'}`,
      }}
      title={`Last push ${new Date(iso).toLocaleString()}`}
    >
      <PulseBeacon project={project} />
      {compact ? label.replace(' AGO', '') : label}
    </span>
  );
}
