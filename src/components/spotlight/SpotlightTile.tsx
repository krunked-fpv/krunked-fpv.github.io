import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowUpRight, Eye, Layers, QrCode, Rocket, Star } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useSpecular } from '../../hooks/useSpecular';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { CardActions, LaunchLink } from '../collection/CardActions';
import { GithubMark } from '../ui/GithubMark';
import { IconButton } from '../ui/IconButton';
import { Sparkline } from '../viz/Sparkline';
import { CommitTicker } from './CommitTicker';
import { FreshnessBadge, TIER_TOKENS } from './FreshnessBadge';

export type TileVariant = 'lead' | 'medium' | 'compact';

interface Props {
  project: Project;
  variant: TileVariant;
  /** commits landed since the user's last visit (null = unknown) */
  newCommits: number | null;
  className?: string;
}

function OverlayChip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'online' | 'hot';
}) {
  const color =
    tone === 'online'
      ? 'var(--led-online-ink)'
      : tone === 'hot'
        ? 'var(--led-hot-ink)'
        : 'var(--ink-secondary)';
  return (
    <span
      className="chip backdrop-blur-md"
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

export function SpotlightTile({ project, variant, newCommits, className = '' }: Props) {
  const reduced = useReducedMotion();
  const spec = useSpecular<HTMLDivElement>();
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const hue = hueOf(project);
  const lead = variant === 'lead';
  const tok = TIER_TOKENS[project.freshness.tier];

  // Subtle hardware tilt (<= 2.5deg), lead only
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 380, damping: 32 });
  const sy = useSpring(my, { stiffness: 380, damping: 32 });
  const rotY = useTransform(sx, [-0.5, 0.5], [-2.4, 2.4]);
  const rotX = useTransform(sy, [-0.5, 0.5], [2.4, -2.4]);
  const tilt = lead && !reduced;

  return (
    <motion.article
      layout
      layoutId={`spot-${project.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
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
      style={tilt ? { rotateX: rotX, rotateY: rotY, transformPerspective: 1200 } : undefined}
      className={`surface group relative flex min-h-[224px] flex-col justify-between overflow-hidden rounded-[14px]! ${className}`}
    >
      {/* Procedural cover art with dual-theme legibility scrim */}
      <motion.div layoutId={`cover-spot-${project.id}`} className="pointer-events-none absolute inset-0 z-0">
        <CoverArt project={project} animated={lead} fill />
      </motion.div>

      {/* Top metadata rail */}
      <div className="relative z-[2] flex items-start justify-between gap-2 p-3.5 sm:p-4">
        <FreshnessBadge project={project} compact={!lead} overlay />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {newCommits !== null && newCommits > 0 && (
            <OverlayChip tone="hot">
              <Rocket size={10} /> +{newCommits} NEW
            </OverlayChip>
          )}
          {project.isPwa && <OverlayChip tone="online">PWA</OverlayChip>}
          {project.kind === 'live' ? (
            <OverlayChip tone="online">LIVE</OverlayChip>
          ) : (
            <OverlayChip>CODE</OverlayChip>
          )}
        </div>
      </div>

      {/* Bottom identity, commit ticker & tactile hardware actions */}
      <div className="relative z-[2] flex min-w-0 flex-col gap-2.5 p-3.5 pt-5 sm:p-4 sm:pt-6">
        <div className="flex items-end gap-3">
          <Glyph name={project.glyph} hue={hue} size={lead ? 48 : 36} />
          <div className="min-w-0 flex-1">
            <h3
              className={`display truncate text-ink ${
                lead ? 'text-[28px] sm:text-[38px]' : 'text-[20px] sm:text-[22px]'
              }`}
            >
              <LaunchLink project={project} origin="spot">
                {project.displayName}
              </LaunchLink>
            </h3>
            <p className="mt-1 truncate text-[12.5px] text-dim sm:text-[13px]">{project.tagline}</p>
          </div>
        </div>

        <CommitTicker project={project} showMeta={lead} />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Sparkline
              values={project.sparkline}
              color={tok.dot}
              width={lead ? 124 : 68}
              height={lead ? 28 : 22}
            />
            <span className="mono hidden text-[10px] leading-tight text-mute sm:block">
              {project.commits30dTotal > 0 ? `${project.commits30dTotal} COMMITS` : `${project.pushes7d} PUSHES`}
              <br />
              <span className="inline-flex items-center gap-1 text-dim">
                <Layers size={10} /> {project.commits30dTotal > 0 ? '30D' : '7D'}
              </span>
            </span>
          </div>

          {lead ? (
            <div className="above flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  foley.latch();
                  setPeek(project.name, 'spot', project.launchUrl ? 'sandbox' : 'brief');
                }}
                className="btn min-h-9! gap-1.5 px-3 text-[12.5px]"
              >
                <Eye size={14} /> Live Peek
              </button>

              {project.launchUrl && (
                <button
                  type="button"
                  onClick={() => {
                    foley.click();
                    setPeek(project.name, 'spot', 'qr');
                  }}
                  className="btn min-h-9! gap-1.5 px-2.5 text-[12px]"
                  aria-label={`QR handoff for ${project.displayName}`}
                  title="QR mobile handoff"
                >
                  <QrCode size={14} />
                  <span className="hidden sm:inline">QR</span>
                </button>
              )}

              <a
                className="icon-btn"
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
                onClick={() => {
                  foley.latch();
                  togglePin(project.name);
                  toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
                }}
              >
                <Star size={15} fill={project.pinned ? 'currentColor' : 'none'} />
              </IconButton>

              {project.launchUrl && (
                <a
                  href={project.launchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => foley.relay()}
                  className="btn btn-primary min-h-9! gap-1.5 px-3.5 text-[12.5px]"
                >
                  Launch <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <CardActions project={project} size="sm" origin="spot" />
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
