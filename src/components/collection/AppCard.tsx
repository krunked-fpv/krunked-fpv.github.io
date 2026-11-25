import { motion } from 'framer-motion';
import { SlidersHorizontal, Star } from 'lucide-react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { FreshnessBadge } from '../spotlight/FreshnessBadge';
import { SpecularSurface } from '../ui/SpecularSurface';
import { Sparkline } from '../viz/Sparkline';
import { CardActions, LaunchLink } from './CardActions';
import { formatSize, langColor, topLanguages } from './meta';

function OverlayPill({
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

export function AppCard({ project, big = false, index = 0 }: { project: Project; big?: boolean; index?: number }) {
  const hue = hueOf(project);
  const now = useNow(30_000);
  const langs = topLanguages(project.languages, 4);

  return (
    <SpecularSurface
      layout
      layoutId={`card-${project.id}`}
      data-deck-card={project.name}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ ...SPRING, delay: Math.min(index, 8) * 0.02 }}
      className={`group flex min-w-0 flex-col rounded-[14px]! ${big ? 'sm:col-span-2 sm:row-span-2' : ''}`}
    >
      <motion.div
        layoutId={`cover-card-${project.id}`}
        className={`relative ${big ? 'min-h-[240px] flex-1' : 'aspect-[16/10]'} overflow-hidden rounded-t-[14px] border-b border-hairline`}
      >
        <CoverArt
          project={project}
          fill
          className="transition-transform duration-700 [transition-timing-function:var(--ease-snap)] group-hover:scale-[1.035]"
        />
        <div className="absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-2 p-3">
          <FreshnessBadge project={project} compact overlay />
          <div className="flex flex-wrap justify-end gap-1.5">
            {project.hasCustomCuration && (
              <OverlayPill tone="hot">
                <SlidersHorizontal size={10} /> CURATED
              </OverlayPill>
            )}
            {project.isPwa && <OverlayPill tone="online">PWA</OverlayPill>}
            {project.kind === 'live' ? (
              <OverlayPill tone="online">LIVE</OverlayPill>
            ) : (
              <OverlayPill>CODE</OverlayPill>
            )}
          </div>
        </div>
        <div className="absolute bottom-3 left-3 z-[2]">
          <Glyph name={project.glyph} hue={hue} size={big ? 44 : 36} />
        </div>
        {big && project.sparkline.some((v) => v > 0) && (
          <div
            className="absolute bottom-3 right-3 z-[2] rounded-[8px] px-2 py-1 backdrop-blur-md"
            style={{
              background: 'var(--badge-bg)',
              boxShadow: 'inset 0 0 0 1px var(--badge-border)',
            }}
          >
            <Sparkline
              values={project.sparkline}
              color={project.freshness.tier === 'fresh' ? 'var(--led-hot)' : 'var(--led-online)'}
              width={92}
              height={24}
            />
          </div>
        )}
      </motion.div>

      <div className="relative flex flex-1 flex-col justify-between gap-3 p-3.5 sm:p-4">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={`display truncate text-ink ${big ? 'text-[26px]' : 'text-[19px]'}`}>
              <LaunchLink project={project} origin="card">
                {project.displayName}
              </LaunchLink>
            </h3>
            <span className="mono shrink-0 text-[10px] uppercase tracking-[0.12em] text-mute">{project.category}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-dim">{project.tagline}</p>
        </div>

        <div className="flex flex-col gap-2.5">
          {langs.length > 0 && (
            <div
              className="flex h-[3px] w-full overflow-hidden rounded-full bg-inset"
              aria-label={`Languages: ${langs.map((l) => `${l.name} ${Math.round(l.pct)}%`).join(', ')}`}
            >
              {langs.map((l) => (
                <span
                  key={l.name}
                  style={{ width: `${l.pct}%`, background: l.color }}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
            <div className="mono flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] tracking-wide text-mute">
              {project.language && (
                <span className="inline-flex items-center gap-1.5 truncate text-dim">
                  <span className="size-[7px] shrink-0 rounded-full" style={{ background: langColor(project.language) }} />
                  {project.language}
                </span>
              )}
              <span>{formatDelta(now - Date.parse(project.lastActivityAt))}</span>
              {project.commits30dTotal > 0 && (
                <span className="hidden min-[420px]:inline text-dim">{project.commits30dTotal}c/30d</span>
              )}
              {project.stars > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star size={10} /> {project.stars}
                </span>
              )}
              {project.sizeKb > 0 && <span className="hidden xl:inline">{formatSize(project.sizeKb)}</span>}
            </div>
            <CardActions project={project} size="sm" origin="card" />
          </div>
        </div>
      </div>
    </SpecularSurface>
  );
}
