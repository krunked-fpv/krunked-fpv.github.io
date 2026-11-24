import { AnimatePresence } from 'framer-motion';
import { SPRING } from '../../config/site';
import { formatDelta, TIER_COLOR } from '../../domain/freshness';
import { hueOf } from '../../domain/buildProjects';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { PulseBeacon } from '../spotlight/FreshnessBadge';
import { Sparkline } from '../viz/Sparkline';
import { SpecularSurface } from '../ui/SpecularSurface';
import { CardActions, LaunchLink } from './CardActions';
import { formatDate, formatSize, langColor } from './meta';

function Row({ project }: { project: Project }) {
  const now = useNow(30_000);
  const color = TIER_COLOR[project.freshness.tier];
  const hue = hueOf(project);
  return (
    <SpecularSurface
      layout
      layoutId={`row-${project.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={SPRING}
      className="group rounded-[14px]! p-3"
    >
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg">
          <CoverArt project={project} fill />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 truncate text-[14px] font-semibold tracking-tight">
            <PulseBeacon project={project} />
            <LaunchLink project={project}>{project.displayName}</LaunchLink>
          </h3>
          <div className="mono mt-0.5 flex items-center gap-2 text-[10.5px] text-mute">
            <span style={{ color }}>{formatDelta(now - Date.parse(project.lastActivityAt))}</span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: langColor(project.language) }} />
              {project.language ?? '—'}
            </span>
            <span className="hidden sm:inline">· {project.category}</span>
          </div>
        </div>
        <Sparkline values={project.sparkline} color={`oklch(0.78 0.14 ${hue})`} width={64} height={22} animate={false} className="hidden shrink-0 sm:block" />
        <div className="[@media(hover:hover)]:opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <CardActions project={project} size="sm" />
        </div>
      </div>
      <dl className="mono mt-3 grid grid-cols-4 gap-2 border-t border-white/[0.05] pt-2.5 text-[10px] tracking-wide">
        {[
          ['PUSHED', formatDate(project.pushedAt)],
          ['CREATED', formatDate(project.createdAt)],
          ['SIZE', formatSize(project.sizeKb)],
          ['SHA', project.latestCommit ? project.latestCommit.sha.slice(0, 7) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-mute">{k}</dt>
            <dd className="mt-0.5 truncate text-dim">{v}</dd>
          </div>
        ))}
      </dl>
    </SpecularSurface>
  );
}

export function TelemetryGrid({ projects }: { projects: Project[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {projects.map((p) => (
          <Row key={p.id} project={p} />
        ))}
      </AnimatePresence>
    </div>
  );
}
