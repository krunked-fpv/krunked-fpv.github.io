import { Activity, Check, Copy, ExternalLink, GitBranch, GitCommitHorizontal, Star, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { enrichCommits } from '../../data/enrich';
import { syncDisabled } from '../../data/ghClient';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { GhRepo } from '../../types/github';
import type { Project } from '../../types/project';
import { formatDate, formatSize, langColor, topLanguages } from '../collection/meta';
import { TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { Chip } from '../ui/Chip';
import { Sparkline } from '../viz/Sparkline';
import { ReadmeView } from './ReadmeView';

export function TelemetryBrief({ project, repo }: { project: Project; repo: GhRepo | undefined }) {
  const bump = useDeck((s) => s.bump);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();
  const now = useNow(30_000);
  const [copiedClone, setCopiedClone] = useState(false);

  const tok = TIER_TOKENS[project.freshness.tier];
  const langs = topLanguages(project.languages, 6);
  const cloneCmd = `git clone ${project.sourceUrl}.git`;

  useEffect(() => {
    if (!repo || syncDisabled()) return;
    let alive = true;
    void enrichCommits(repo).then((changed) => {
      if (alive && changed) bump();
    });
    return () => {
      alive = false;
    };
  }, [repo, bump]);

  const copyClone = async () => {
    try {
      await navigator.clipboard?.writeText(cloneCmd);
      foley.click();
      setCopiedClone(true);
      toast('Copied git clone command', 'ok');
      setTimeout(() => setCopiedClone(false), 1800);
    } catch {
      toast('Clipboard unavailable', 'warn');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Hardware Telemetry Matrix */}
      <dl className="mono grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-[12px] border border-hairline bg-inset p-3">
          <dt className="text-[10px] tracking-wider text-mute">LAST PUSH</dt>
          <dd className="mt-1 text-[13px] font-medium" style={{ color: tok.ink }}>
            {formatDelta(now - Date.parse(project.lastActivityAt))} ago
          </dd>
          <dd className="mt-0.5 text-[10px] text-mute">{formatDate(project.pushedAt)}</dd>
        </div>

        <div className="rounded-[12px] border border-hairline bg-inset p-3">
          <dt className="text-[10px] tracking-wider text-mute">30D VELOCITY</dt>
          <dd className="mt-1 text-[13px] font-medium text-ink">{project.commits30dTotal} commits</dd>
          <dd className="mt-0.5 text-[10px] text-mute">{project.pushes7d} pushes (7d)</dd>
        </div>

        <div className="rounded-[12px] border border-hairline bg-inset p-3">
          <dt className="text-[10px] tracking-wider text-mute">SIZE / LANG</dt>
          <dd className="mt-1 text-[13px] font-medium text-ink">{formatSize(project.sizeKb)}</dd>
          <dd className="mt-0.5 flex items-center gap-1.5 text-[10px] text-dim">
            <span className="size-[6px] rounded-full" style={{ background: langColor(project.language) }} />
            {project.language ?? 'Mixed'}
          </dd>
        </div>

        <div className="rounded-[12px] border border-hairline bg-inset p-3">
          <dt className="text-[10px] tracking-wider text-mute">SIGNAL</dt>
          <dd className="mt-1 flex items-center gap-2.5 text-[13px] font-medium text-ink">
            <span className="inline-flex items-center gap-1">
              <Star size={12} className="text-solar-ink" /> {project.stars}
            </span>
            <span className="text-dim">{project.forks} forks</span>
          </dd>
          <dd className="mt-0.5 flex items-center gap-1 text-[10px] text-mute">
            <GitBranch size={10} /> {project.defaultBranch}
          </dd>
        </div>
      </dl>

      {/* Language Composition Bar */}
      {langs.length > 0 && (
        <section className="rounded-[12px] border border-hairline bg-inset p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="eyebrow text-dim!">Language Composition</h4>
            <span className="mono text-[10px] text-mute">{langs.length} DETECTED</span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface">
            {langs.map((l) => (
              <span
                key={l.name}
                style={{ width: `${l.pct}%`, background: l.color }}
                className="h-full first:rounded-l-full last:rounded-r-full"
                title={`${l.name}: ${l.pct.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="mono mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[10.5px]">
            {langs.map((l) => (
              <span key={l.name} className="inline-flex items-center gap-1.5 text-dim">
                <span className="size-2 rounded-full" style={{ background: l.color }} />
                <span className="text-ink">{l.name}</span>
                <span className="text-mute">{l.pct.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Quick Operations: Clone & CI Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mono flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-hairline bg-inset px-3 py-2 text-[11px] text-dim">
          <Terminal size={12} className="shrink-0 text-mute" />
          <code className="min-w-0 flex-1 truncate">{cloneCmd}</code>
          <button
            type="button"
            onClick={() => void copyClone()}
            className="inline-flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10.5px] font-medium text-ink transition-colors hover:bg-hover"
            aria-label="Copy git clone command"
          >
            {copiedClone ? <Check size={12} className="text-phosphor-ink" /> : <Copy size={12} />}
            {copiedClone ? 'Copied' : 'Copy'}
          </button>
        </div>

        <a
          href={project.actionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => foley.click()}
          className="btn min-h-9! gap-1.5 text-[12px]"
        >
          <Activity size={13} className="text-phosphor-ink" />
          CI Actions <ExternalLink size={12} />
        </a>
      </div>

      {project.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.topics.map((t) => (
            <Chip key={t}>#{t}</Chip>
          ))}
        </div>
      )}

      {/* 30-Day Velocity & Recent Commits */}
      <section className="rounded-[14px] border border-hairline bg-inset p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="eyebrow text-dim!">30-Day Commit Momentum</h4>
            <p className="mono mt-0.5 text-[11px] text-mute">
              {project.commits30dTotal} human commits in 30d · created {formatDate(project.createdAt)}
            </p>
          </div>
          <Sparkline
            values={project.sparkline}
            color={project.freshness.tier === 'fresh' ? 'var(--led-hot)' : 'var(--led-online)'}
            width={160}
            height={34}
          />
        </div>

        {project.recentCommits.length > 0 ? (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {project.recentCommits.slice(0, 10).map((c) => (
              <li key={c.sha} className="flex items-baseline justify-between gap-3 py-2.5 text-[13px]">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <GitCommitHorizontal size={12} className="mt-1 shrink-0 text-mute" />
                  <a
                    href={c.url ?? `${project.sourceUrl}/commit/${c.sha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono shrink-0 text-[11px] font-medium text-hot-ink hover:underline"
                  >
                    {c.sha.slice(0, 7)}
                  </a>
                  <span className="min-w-0 truncate text-ink">{c.message || 'Commit'}</span>
                </div>
                <span className="mono shrink-0 text-[10.5px] text-mute">
                  {c.date ? `${formatDelta(now - Date.parse(c.date))} ago` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mono border-t border-hairline pt-3 text-[11.5px] text-mute">
            {project.latestCommit
              ? `Latest push head ${project.latestCommit.sha.slice(0, 7)} — commit log cached cleanly.`
              : 'No recent commits recorded in snapshot.'}
          </p>
        )}
      </section>

      {/* README */}
      {repo && (
        <section className="rounded-[14px] border border-hairline bg-inset p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between border-b border-hairline pb-2.5">
            <h4 className="eyebrow text-dim!">README.md</h4>
            <span className="mono text-[10px] text-mute">{repo.default_branch}</span>
          </div>
          <ReadmeView repo={repo} />
        </section>
      )}
    </div>
  );
}
