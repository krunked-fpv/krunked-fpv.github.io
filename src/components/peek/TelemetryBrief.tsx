import { GitBranch, GitCommitHorizontal, Star } from 'lucide-react';
import { useEffect } from 'react';
import { enrichCommits } from '../../data/enrich';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta, TIER_COLOR } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { GhRepo } from '../../types/github';
import type { Project } from '../../types/project';
import { formatDate, formatSize, langColor } from '../collection/meta';
import { Chip } from '../ui/Chip';
import { Sparkline } from '../viz/Sparkline';
import { ReadmeView } from './ReadmeView';

export function TelemetryBrief({ project, repo }: { project: Project; repo: GhRepo | undefined }) {
  const bump = useDeck((s) => s.bump);
  const now = useNow(30_000);
  const hue = hueOf(project);
  const tierColor = TIER_COLOR[project.freshness.tier];

  useEffect(() => {
    if (!repo) return;
    let alive = true;
    void enrichCommits(repo).then((changed) => {
      if (alive && changed) bump();
    });
    return () => {
      alive = false;
    };
  }, [repo, bump]);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Matrix */}
      <dl className="mono grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-white/[0.06] bg-ob-950/60 p-3">
          <dt className="text-[10px] tracking-wider text-mute">LAST PUSH</dt>
          <dd className="mt-1 text-[13px] font-medium" style={{ color: tierColor }}>
            {formatDelta(now - Date.parse(project.lastActivityAt))} ago
          </dd>
          <dd className="mt-0.5 text-[10px] text-mute">{formatDate(project.pushedAt)}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-ob-950/60 p-3">
          <dt className="text-[10px] tracking-wider text-mute">CREATED</dt>
          <dd className="mt-1 text-[13px] font-medium text-ink">{formatDate(project.createdAt)}</dd>
          <dd className="mt-0.5 text-[10px] text-mute">{project.category}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-ob-950/60 p-3">
          <dt className="text-[10px] tracking-wider text-mute">BUNDLE / REPO</dt>
          <dd className="mt-1 text-[13px] font-medium text-ink">{formatSize(project.sizeKb)}</dd>
          <dd className="mt-0.5 flex items-center gap-1.5 text-[10px] text-dim">
            <span className="size-1.5 rounded-full" style={{ background: langColor(project.language) }} />
            {project.language ?? 'Mixed'}
          </dd>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-ob-950/60 p-3">
          <dt className="text-[10px] tracking-wider text-mute">SIGNAL</dt>
          <dd className="mt-1 flex items-center gap-3 text-[13px] font-medium text-ink">
            <span className="inline-flex items-center gap-1">
              <Star size={12} className="text-solar" /> {project.stars}
            </span>
            <span className="text-dim">{project.forks} forks</span>
          </dd>
          <dd className="mt-0.5 flex items-center gap-1 text-[10px] text-mute">
            <GitBranch size={10} /> {project.defaultBranch}
          </dd>
        </div>
      </dl>

      {project.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.topics.map((t) => (
            <Chip key={t}>#{t}</Chip>
          ))}
        </div>
      )}

      {/* Velocity & Recent Commits */}
      <section className="rounded-2xl border border-white/[0.06] bg-ob-950/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="eyebrow text-dim!">14-Day Commit Momentum</h4>
            <p className="mono mt-0.5 text-[11px] text-mute">{project.pushes7d} pushes in last 7 days</p>
          </div>
          <Sparkline values={project.sparkline} color={`oklch(0.78 0.14 ${hue})`} width={150} height={34} />
        </div>

        {project.recentCommits.length > 0 ? (
          <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
            {project.recentCommits.slice(0, 8).map((c) => (
              <li key={c.sha} className="flex items-baseline justify-between gap-3 py-2.5 text-[13px]">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <GitCommitHorizontal size={12} className="mt-1 shrink-0 text-mute" />
                  <a
                    href={`${project.sourceUrl}/commit/${c.sha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono shrink-0 text-[11px] text-volt hover:underline"
                  >
                    {c.sha.slice(0, 7)}
                  </a>
                  <span className="min-w-0 truncate text-ink">{c.message || 'Commit'}</span>
                </div>
                <span className="mono shrink-0 text-[10.5px] text-mute">{c.date ? `${formatDelta(now - Date.parse(c.date))} ago` : ''}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mono border-t border-white/[0.05] pt-3 text-[11.5px] text-mute">
            {project.latestCommit
              ? `Latest push head ${project.latestCommit.sha.slice(0, 7)} — commit log queued or quota-conserved.`
              : 'No recent commits cached yet.'}
          </p>
        )}
      </section>

      {/* README */}
      {repo && (
        <section className="rounded-2xl border border-white/[0.06] bg-ob-950/50 p-5">
          <div className="mb-3 flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <h4 className="eyebrow text-dim!">README.md</h4>
            <span className="mono text-[10px] text-mute">{repo.default_branch}</span>
          </div>
          <ReadmeView repo={repo} />
        </section>
      )}
    </div>
  );
}
