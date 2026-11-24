import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { FreshnessBadge } from '../spotlight/FreshnessBadge';
import { Chip } from '../ui/Chip';
import { SpecularSurface } from '../ui/SpecularSurface';
import { CardActions, LaunchLink } from './CardActions';
import { formatSize, langColor } from './meta';

export function AppCard({ project, big = false, index = 0 }: { project: Project; big?: boolean; index?: number }) {
  const hue = hueOf(project);
  const now = useNow(30_000);
  return (
    <SpecularSurface
      layout
      layoutId={`card-${project.id}`}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ ...SPRING, delay: Math.min(index, 8) * 0.025 }}
      className={`group flex min-w-0 flex-col ${big ? 'sm:col-span-2 sm:row-span-2' : ''}`}
    >
      <motion.div layoutId={`cover-card-${project.id}`} className={`relative ${big ? 'min-h-[260px] flex-1' : 'aspect-[16/10]'} overflow-hidden rounded-t-[18px]`}>
        <CoverArt project={project} fill className="transition-transform duration-700 [transition-timing-function:var(--ease-snap)] group-hover:scale-[1.04]" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <FreshnessBadge project={project} compact />
          <div className="flex gap-1.5">
            {project.isPwa && <Chip color="#06B6D4">PWA</Chip>}
            {project.kind === 'live' ? <Chip color="#06B6D4">LIVE</Chip> : <Chip>CODE</Chip>}
          </div>
        </div>
        <div className="absolute bottom-3 left-3">
          <Glyph name={project.glyph} hue={hue} size={big ? 46 : 38} />
        </div>
      </motion.div>
      <div className="relative flex flex-col gap-3 p-4">
        <div className="glow-under" style={{ background: `oklch(0.75 0.15 ${hue})` }} />
        <div className="min-w-0">
          <h3 className={`display truncate ${big ? 'text-[28px]' : 'text-[20px]'}`}>
            <LaunchLink project={project} origin="card">{project.displayName}</LaunchLink>
          </h3>
          <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-dim">{project.tagline}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="mono flex min-w-0 items-center gap-3 text-[10.5px] tracking-wide text-mute">
            {project.language && (
              <span className="flex items-center gap-1.5 truncate">
                <span className="size-2 rounded-full" style={{ background: langColor(project.language) }} />
                {project.language}
              </span>
            )}
            <span>{formatDelta(now - Date.parse(project.lastActivityAt))}</span>
            {project.stars > 0 && (
              <span className="flex items-center gap-1">
                <Star size={10} /> {project.stars}
              </span>
            )}
            <span className="hidden min-[400px]:inline">{formatSize(project.sizeKb)}</span>
          </div>
          <div className="[@media(hover:hover)]:opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <CardActions project={project} size="sm" origin="card" />
          </div>
        </div>
      </div>
    </SpecularSurface>
  );
}
