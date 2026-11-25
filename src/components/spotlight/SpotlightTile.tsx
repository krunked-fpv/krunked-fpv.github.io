import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowUpRight, Eye, Layers, QrCode, Rocket, Star } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useSpecular } from '../../hooks/useSpecular';
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

interface Props {
  project: Project;
  variant?: TileVariant;
  /** commits landed since the user's last visit (null = unknown) */
  newCommits: number | null;
  /** 0-based position in the exhibition deck */
  index?: number;
  total?: number;
  className?: string;
}

function StagePill({
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
      className={`chip rounded-full! px-2.5! text-[10px]! font-semibold! tracking-[0.09em]! backdrop-blur-md ${className}`}
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
 * Centerpiece Exhibition Stage card showcasing the active featured world.
 * Uses CoverArt scrim="stage" for vivid upper-right focal artwork and >= 10:1 bottom-left typography legibility.
 */
export function SpotlightTile({
  project,
  variant = 'lead',
  newCommits,
  index,
  total,
  className = '',
}: Props) {
  const reduced = useReducedMotion();
  const spec = useSpecular<HTMLDivElement>();
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const hue = hueOf(project);
  const tok = TIER_TOKENS[project.freshness.tier];

  // Subtle machined tilt (<= 1.8deg) on pointer hover
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 360, damping: 32 });
  const sy = useSpring(my, { stiffness: 360, damping: 32 });
  const rotY = useTransform(sx, [-0.5, 0.5], [-1.8, 1.8]);
  const rotX = useTransform(sy, [-0.5, 0.5], [1.8, -1.8]);
  const tilt = variant === 'lead' && !reduced;

  const indexPlate =
    typeof index === 'number' && typeof total === 'number' && total > 0
      ? `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
      : null;

  const statusText =
    project.kind === 'live' ? (project.isPwa ? 'LIVE · PWA' : 'LIVE') : 'CODE';

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      ref={spec}
      onPointerMove={
        tilt
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              mx.set((e.clientX - r.left) / r.width - 0.5);
              my.set((e.clientY - r.top) / r.height - 0.5);
            }
          : undefined
      }
      onPointerLeave={tilt ? () => (mx.set(0), my.set(0)) : undefined}
      style={tilt ? { rotateX: rotX, rotateY: rotY, transformPerspective: 1400 } : undefined}
      className={`studio-stage group relative flex min-h-[372px] flex-col justify-between sm:min-h-[440px] lg:h-[490px] ${className}`}
    >
      {/* Full-bleed animated procedural artwork with sculpted dual-theme stage scrim */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <CoverArt project={project} animated fill scrim="stage" />
      </div>

      {/* Top Metadata Rail: Single crisp row on mobile, full exhibition index on sm+ */}
      <div className="relative z-[2] flex items-center justify-between gap-2 p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="sm:hidden">
            <FreshnessBadge project={project} compact overlay />
          </span>
          <span className="hidden sm:inline-flex">
            <FreshnessBadge project={project} overlay />
          </span>
          {indexPlate && <StagePill className="hidden! sm:inline-flex!">{indexPlate}</StagePill>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {newCommits !== null && newCommits > 0 && (
            <StagePill tone="hot">
              <Rocket size={10} aria-hidden="true" /> +{newCommits} NEW
            </StagePill>
          )}
          <StagePill className="hidden! sm:inline-flex!">{project.category}</StagePill>
          <StagePill tone={project.kind === 'live' ? 'online' : 'neutral'}>{statusText}</StagePill>
        </div>
      </div>

      {/* Bottom Editorial Presentation & Action Deck */}
      <div className="relative z-[2] flex min-w-0 flex-col gap-2.5 p-4 pt-6 sm:gap-3.5 sm:p-6 sm:pt-10">
        {/* Identity Lockup: Untruncated Display Title + Crisp Tagline */}
        <div className="flex items-start gap-3 sm:items-end sm:gap-4">
          <Glyph name={project.glyph} hue={hue} size={46} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="display text-[clamp(24px,3.1vw,42px)] leading-[1.03] tracking-[-0.032em] text-ink">
              <LaunchLink project={project} origin="spot">
                {project.displayName}
              </LaunchLink>
            </h3>
            <p className="mt-1 max-w-[620px] line-clamp-2 text-[13px] leading-relaxed text-dim sm:mt-1.5 sm:text-[14.5px]">
              {project.tagline}
            </p>
          </div>
        </div>

        {/* Commit Telemetry & 30d Sparkline Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-2.5 sm:pt-3">
          <div className="min-w-0 flex-1">
            <CommitTicker project={project} showMeta />
          </div>
          <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
            <Sparkline
              values={project.sparkline}
              color={tok.dot}
              width={104}
              height={24}
              showBaseline={false}
            />
            <span className="mono text-[10.5px] leading-tight text-mute">
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

        {/* Primary Action Row: Single sleek row on 375px mobile AND spacious bar on desktop */}
        <div className="above flex items-center justify-between gap-2 pt-0.5 sm:gap-2.5">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {project.launchUrl ? (
              <a
                href={project.launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => foley.relay()}
                className="btn btn-primary min-h-9! h-9 shrink-0 gap-1 px-2.5 text-[12.5px] font-semibold whitespace-nowrap sm:min-h-10! sm:h-10 sm:gap-1.5 sm:px-4 sm:text-[13px]"
              >
                Launch App <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  foley.latch();
                  setPeek(project.name, 'spot', 'brief');
                }}
                className="btn btn-primary min-h-9! h-9 shrink-0 gap-1 px-2.5 text-[12.5px] font-semibold whitespace-nowrap sm:min-h-10! sm:h-10 sm:gap-1.5 sm:px-4 sm:text-[13px]"
              >
                Inspect <Eye size={14} className="shrink-0" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                foley.latch();
                setPeek(project.name, 'spot', project.launchUrl ? 'sandbox' : 'brief');
              }}
              className="btn min-h-9! h-9 shrink-0 gap-1.5 bg-elevated/85! px-2.5 text-[12.5px] whitespace-nowrap backdrop-blur-md sm:min-h-10! sm:h-10 sm:px-3.5 sm:text-[13px]"
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
                className="btn min-h-9! h-9 w-9 shrink-0 justify-center bg-elevated/75! px-0 text-[12.5px] backdrop-blur-md min-[420px]:w-auto min-[420px]:gap-1.5 min-[420px]:px-2.5 sm:min-h-10! sm:h-10 sm:px-3"
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
              className="icon-btn h-9! w-9! bg-elevated/75! backdrop-blur-md shadow-[inset_0_0_0_1px_var(--hairline)] sm:h-10! sm:w-10!"
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
              className="h-9! w-9! bg-elevated/75! backdrop-blur-md shadow-[inset_0_0_0_1px_var(--hairline)] sm:h-10! sm:w-10!"
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
      </div>
    </motion.article>
  );
}
