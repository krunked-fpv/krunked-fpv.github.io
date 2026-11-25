import { motion } from 'framer-motion';
import { ArrowUpRight, Eye, Layers, QrCode, Rocket, Star } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { LaunchLink } from '../collection/CardActions';
import { GithubMark } from '../ui/GithubMark';
import { IconButton } from '../ui/IconButton';
import { Sparkline } from '../viz/Sparkline';
import { CommitTicker } from './CommitTicker';
import { FreshnessBadge, TIER_TOKENS } from './FreshnessBadge';

export type TileVariant = 'lead' | 'medium' | 'compact';

export interface SpotlightTileProps {
  project: Project;
  variant?: TileVariant;
  /** commits landed since the user's last visit (null = unknown) */
  newCommits: number | null;
  /** 0-based position in the exhibition deck */
  index?: number;
  total?: number;
  /** True when rendered as an expanded blade inside the desktop 5-blade accordion. */
  blade?: boolean;
  className?: string;
}

function StagePlate({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'online' | 'hot';
  className?: string;
}) {
  const color =
    tone === 'online'
      ? 'var(--led-online-ink)'
      : tone === 'hot'
        ? 'var(--led-hot-ink)'
        : 'var(--ink-secondary)';
  return (
    <span
      className={`chip rounded-[var(--radius-sm)]! px-2! text-[10px]! font-semibold! tracking-[0.1em]! backdrop-blur-md ${className}`}
      style={{
        color,
        background: 'var(--badge-bg)',
        boxShadow: 'inset 0 0 0 1px var(--badge-border)',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Cinema Exhibition Stage Blade:
 * Full-bleed bespoke animated WorldVisual (via CoverArt scrim="stage"), sharp Monolith chamfer plates,
 * untruncated poster title, commit telemetry, and solid Kinetic Acid-Lime / Pitch-Black primary CTA.
 */
export function SpotlightTile({
  project,
  newCommits,
  index,
  total,
  blade = false,
  className = '',
}: SpotlightTileProps) {
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const hue = hueOf(project);
  const tok = TIER_TOKENS[project.freshness.tier];

  const indexPlate =
    typeof index === 'number' && typeof total === 'number' && total > 0
      ? `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
      : null;

  const statusText =
    project.kind === 'live' ? (project.isPwa ? 'LIVE · PWA' : 'LIVE') : 'CODE';

  return (
    <article
      className={`group relative flex h-full w-full flex-col justify-between overflow-hidden bg-surface ${
        blade ? '' : 'min-h-[360px] rounded-[var(--radius-lg)] border border-hairline sm:min-h-[420px]'
      } ${className}`}
    >
      {/* Active Acid-Lime Top Accent Hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[2px] bg-hot"
      />

      {/* Full-bleed Bespoke Animated WorldVisual Artwork */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <CoverArt project={project} animated fill scrim="stage" />
      </div>

      {/* Top Metadata Rail */}
      <div className="relative z-[2] flex items-center justify-between gap-2 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {indexPlate && (
            <StagePlate tone="hot" className={blade ? '' : 'hidden! sm:inline-flex!'}>
              {indexPlate}
            </StagePlate>
          )}
          <span className="sm:hidden">
            <FreshnessBadge project={project} compact overlay />
          </span>
          <span className="hidden sm:inline-flex">
            <FreshnessBadge project={project} overlay />
          </span>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {newCommits !== null && newCommits > 0 && (
            <StagePlate tone="hot">
              <Rocket size={10} aria-hidden="true" /> +{newCommits} NEW
            </StagePlate>
          )}
          <StagePlate className="hidden! sm:inline-flex!">{project.category}</StagePlate>
          <StagePlate tone={project.kind === 'live' ? 'online' : 'neutral'}>{statusText}</StagePlate>
        </div>
      </div>

      {/* Bottom Editorial Presentation & Action Deck (fades cleanly on blade expand to avoid reflow jitter) */}
      <motion.div
        key={project.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: blade ? 0.08 : 0, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-[2] flex min-w-0 flex-col gap-2.5 p-4 pt-6 sm:gap-3 sm:p-5 sm:pt-8"
      >
        {/* Identity Lockup: Sharp Chamfer Glyph + Untruncated Poster Title */}
        <div className="flex items-start gap-3 sm:items-end sm:gap-3.5">
          <Glyph name={project.glyph} hue={hue} size={44} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="masthead-display text-[clamp(24px,3vw,42px)] font-bold leading-[0.98] tracking-[-0.038em] text-ink">
              <LaunchLink project={project} origin="spot">
                {project.displayName}
              </LaunchLink>
            </h2>
            <p className="mt-1.5 max-w-[580px] line-clamp-2 text-[13px] leading-[1.48] text-dim sm:text-[14px]">
              {project.tagline}
            </p>
          </div>
        </div>

        {/* Commit Telemetry & 30d Sparkline Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-2.5">
          <div className="min-w-0 flex-1">
            <CommitTicker project={project} showMeta />
          </div>
          <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
            <Sparkline
              values={project.sparkline}
              color={tok.dot}
              width={96}
              height={22}
              showBaseline={false}
            />
            <span className="mono text-[10px] leading-tight text-mute">
              <span className="font-semibold text-ink">
                {project.commits30dTotal > 0 ? project.commits30dTotal : project.pushes7d}
              </span>{' '}
              <span className="inline-flex items-center gap-0.5 text-dim">
                <Layers size={10} aria-hidden="true" />
                {project.commits30dTotal > 0 ? '30D' : '7D'}
              </span>
            </span>
          </div>
        </div>

        {/* Action Row: Single crisp row on 375px mobile AND commanding Cinema bar on desktop */}
        <div className="above flex items-center justify-between gap-1.5 pt-0.5 sm:gap-2">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {project.launchUrl ? (
              <a
                href={project.launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => foley.relay()}
                className="btn btn-primary min-h-9! h-9 shrink-0 gap-1.5 rounded-[var(--radius-sm)]! px-3 text-[11.5px] font-bold tracking-[0.06em] uppercase whitespace-nowrap sm:min-h-10! sm:h-10 sm:px-4 sm:text-[12px]"
              >
                <span>Launch World</span>
                <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  foley.latch();
                  setPeek(project.name, 'spot', 'brief');
                }}
                className="btn btn-primary min-h-9! h-9 shrink-0 gap-1.5 rounded-[var(--radius-sm)]! px-3 text-[11.5px] font-bold tracking-[0.06em] uppercase whitespace-nowrap sm:min-h-10! sm:h-10 sm:px-4 sm:text-[12px]"
              >
                <span>Inspect</span>
                <Eye size={14} className="shrink-0" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                foley.latch();
                setPeek(project.name, 'spot', project.launchUrl ? 'sandbox' : 'brief');
              }}
              className="btn min-h-9! h-9 shrink-0 gap-1.5 rounded-[var(--radius-sm)]! bg-elevated/88! px-2.5 text-[12px] whitespace-nowrap backdrop-blur-md sm:min-h-10! sm:h-10 sm:px-3.5 sm:text-[12.5px]"
            >
              <Eye size={14} className="shrink-0" aria-hidden="true" />
              <span>
                <span className="hidden sm:inline">Live </span>Peek
              </span>
            </button>

            {project.launchUrl && (
              <button
                type="button"
                onClick={() => {
                  foley.click();
                  setPeek(project.name, 'spot', 'qr');
                }}
                className="btn min-h-9! h-9 w-9 shrink-0 justify-center rounded-[var(--radius-sm)]! bg-elevated/80! px-0 text-[12px] backdrop-blur-md min-[420px]:w-auto min-[420px]:gap-1.5 min-[420px]:px-2.5 sm:min-h-10! sm:h-10 sm:px-3"
                aria-label={`QR handoff for ${project.displayName}`}
                title="QR mobile handoff"
              >
                <QrCode size={14} className="shrink-0" aria-hidden="true" />
                <span className="hidden min-[420px]:inline">QR</span>
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <a
              className="icon-btn h-9! w-9! rounded-[var(--radius-sm)]! bg-elevated/80! backdrop-blur-md shadow-[inset_0_0_0_1px_var(--hairline)] sm:h-10! sm:w-10!"
              href={project.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source of ${project.displayName} on GitHub`}
              title="Source on GitHub"
              onClick={() => foley.click()}
            >
              <GithubMark size={15} />
            </a>

            <IconButton
              label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
              aria-pressed={project.pinned}
              className="h-9! w-9! rounded-[var(--radius-sm)]! bg-elevated/80! backdrop-blur-md shadow-[inset_0_0_0_1px_var(--hairline)] sm:h-10! sm:w-10!"
              onClick={() => {
                foley.latch();
                togglePin(project.name);
                toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
              }}
            >
              <Star size={15} fill={project.pinned ? 'currentColor' : 'none'} />
            </IconButton>
          </div>
        </div>
      </motion.div>
    </article>
  );
}
