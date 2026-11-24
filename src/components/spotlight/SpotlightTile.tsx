import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowUpRight, Layers, Rocket } from 'lucide-react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useSpecular } from '../../hooks/useSpecular';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { CardActions, LaunchLink } from '../collection/CardActions';
import { Chip } from '../ui/Chip';
import { Sparkline } from '../viz/Sparkline';
import { CommitTicker } from './CommitTicker';
import { FreshnessBadge } from './FreshnessBadge';

export type TileVariant = 'lead' | 'medium' | 'compact';

interface Props {
  project: Project;
  variant: TileVariant;
  /** commits landed since the user's last visit (null = unknown) */
  newCommits: number | null;
  className?: string;
}

const TIER = { fresh: '#10B981', active: '#F59E0B', idle: '#9AA3AE' } as const;

export function SpotlightTile({ project, variant, newCommits, className = '' }: Props) {
  const reduced = useReducedMotion();
  const spec = useSpecular<HTMLDivElement>();
  const hue = hueOf(project);
  const lead = variant === 'lead';
  const color = TIER[project.freshness.tier];

  // gentle pointer tilt (≤3°), lead only
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 380, damping: 32 });
  const sy = useSpring(my, { stiffness: 380, damping: 32 });
  const rotY = useTransform(sx, [-0.5, 0.5], [-3, 3]);
  const rotX = useTransform(sy, [-0.5, 0.5], [3, -3]);
  const tilt = lead && !reduced;

  return (
    <motion.article
      layout
      layoutId={`spot-${project.id}`}
      initial={{ opacity: 0, y: 18 }}
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
      style={tilt ? { rotateX: rotX, rotateY: rotY, transformPerspective: 1100 } : undefined}
      className={`surface group relative flex min-h-[260px] flex-col justify-between overflow-hidden ${className}`}
    >
      {/* Cover art (isolated under motion wrapper so card layout doesn't clip content) */}
      <motion.div layoutId={`cover-spot-${project.id}`} className="pointer-events-none absolute inset-0 z-0">
        <CoverArt project={project} animated={lead} fill />
      </motion.div>
      <div className="glow-under" style={{ background: `oklch(0.75 0.15 ${hue})` }} />

      {/* top row */}
      <div className="relative z-[2] flex items-start justify-between gap-2 p-4">
        <FreshnessBadge project={project} />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {newCommits !== null && newCommits > 0 && (
            <Chip color="#10B981">
              <Rocket size={11} /> NEW · +{newCommits} {newCommits === 1 ? 'commit' : 'commits'}
            </Chip>
          )}
          {project.isPwa && <Chip color="#06B6D4">PWA</Chip>}
          {project.kind === 'live' && <Chip color="#06B6D4">LIVE</Chip>}
        </div>
      </div>

      {/* bottom */}
      <div className="relative z-[2] flex min-w-0 flex-col gap-3 p-4 pt-6">
        <div className="flex items-end gap-3">
          <Glyph name={project.glyph} hue={hue} size={lead ? 52 : 40} />
          <div className="min-w-0 flex-1">
            <h3 className={`display truncate ${lead ? 'text-[34px] sm:text-[44px]' : 'text-[22px] sm:text-[24px]'}`}>
              <LaunchLink project={project} origin="spot">{project.displayName}</LaunchLink>
            </h3>
            <p className={`mt-1 truncate text-[13px] text-dim ${lead ? '' : 'lg:hidden'}`}>{project.tagline}</p>
          </div>
        </div>

        <CommitTicker project={project} />

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Sparkline values={project.sparkline} color={color} width={lead ? 150 : 76} height={lead ? 36 : 24} />
            <span className="mono hidden text-[10.5px] leading-tight text-mute sm:block">
              {project.pushes7d} PUSH{project.pushes7d === 1 ? '' : 'ES'}
              <br />
              <span className="inline-flex items-center gap-1">
                <Layers size={10} /> 14D
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <CardActions project={project} size="sm" origin="spot" />
            {project.launchUrl && variant !== 'medium' && (
              <span className={`btn btn-primary pointer-events-none ml-1 hidden ${lead ? 'sm:inline-flex' : 'xl:inline-flex'}`}>
                Launch <ArrowUpRight size={15} />
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
