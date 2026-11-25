import { motion } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { FreshnessBadge } from '../spotlight/FreshnessBadge';
import { SpecularSurface } from '../ui/SpecularSurface';
import { CardActions, LaunchLink } from './CardActions';
import { langColor, topLanguages } from './meta';

function OverlayPill({
  children,
  tone = 'neutral',
  led = false,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'online' | 'hot';
  led?: boolean;
}) {
  const color =
    tone === 'online'
      ? 'var(--led-online-ink)'
      : tone === 'hot'
        ? 'var(--led-hot-ink)'
        : 'var(--ink-secondary)';
  const dot =
    tone === 'online'
      ? 'var(--led-online)'
      : tone === 'hot'
        ? 'var(--led-hot)'
        : 'var(--ink-muted)';

  return (
    <span
      className="chip backdrop-blur-md"
      style={{
        color,
        background: 'var(--badge-bg)',
        boxShadow: 'inset 0 0 0 1px var(--badge-border)',
      }}
    >
      {led && <span className="size-[6px] shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Museum-grade exhibition card for the 3-column studio gallery.
 * Preserves data-deck-card + LaunchLink[data-card-primary] for 2D spatial keyboard nav.
 */
export function AppCard({ project, index = 0 }: { project: Project; index?: number }) {
  const hue = hueOf(project);
  const now = useNow(30_000);
  const langs = topLanguages(project.languages, 4);
  const ageLabel = formatDelta(now - Date.parse(project.lastActivityAt));

  return (
    <SpecularSurface
      layout
      layoutId={`card-${project.id}`}
      data-deck-card={project.name}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ ...SPRING, delay: Math.min(index, 8) * 0.02 }}
      className="card-exhibit group flex min-w-0 flex-col rounded-[16px]!"
    >
      {/* Top 16:10 Exhibition Art Frame */}
      <motion.div
        layoutId={`cover-card-${project.id}`}
        className="relative aspect-[16/10] overflow-hidden rounded-t-[16px] border-b border-hairline"
      >
        <CoverArt
          project={project}
          fill
          scrim="subtle"
          className="transition-transform duration-700 [transition-timing-function:var(--ease-snap)] group-hover:scale-[1.03]"
        />

        {/* Minimal high-contrast top overlays (max 2 pills on right) */}
        <div className="absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-2 p-3">
          <FreshnessBadge project={project} compact overlay />
          <div className="flex items-center justify-end gap-1.5">
            {project.hasCustomCuration && (
              <OverlayPill tone="hot">
                <SlidersHorizontal size={10} aria-hidden="true" />
                CURATED
              </OverlayPill>
            )}
            {project.kind === 'live' ? (
              <OverlayPill tone="online" led>
                {project.isPwa ? 'LIVE · PWA' : 'LIVE'}
              </OverlayPill>
            ) : (
              <OverlayPill>CODE</OverlayPill>
            )}
          </div>
        </div>

        {/* Machined glyph emblem anchored bottom-left */}
        <div className="absolute bottom-3 left-3 z-[2]">
          <Glyph name={project.glyph} hue={hue} size={36} />
        </div>
      </motion.div>

      {/* Generous Editorial Card Body */}
      <div className="relative flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 text-[20px] font-semibold leading-[1.2] tracking-[-0.025em] text-ink transition-colors group-hover:text-hot-ink">
              <LaunchLink project={project} origin="card">
                {project.displayName}
              </LaunchLink>
            </h3>
            <span className="mono shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-mute">
              {project.category}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 min-h-[2.75rem] text-[13.5px] leading-relaxed text-dim">
            {project.tagline}
          </p>
        </div>

        <div className="mt-4 flex flex-col">
          {/* Ultra-thin 2px language spectrum hairline */}
          {langs.length > 0 && (
            <div
              className="flex h-[2px] w-full overflow-hidden rounded-full bg-inset"
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

          {/* Concise tabular telemetry + persistent tactile micro-actions */}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3">
            <div className="mono flex min-w-0 items-center gap-1.5 truncate text-[11px] tracking-[0.02em] text-mute">
              {project.language && (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-dim">
                  <span
                    className="size-[6px] shrink-0 rounded-full"
                    style={{ background: langColor(project.language) }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{project.language}</span>
                </span>
              )}
              {project.commits30dTotal > 0 && (
                <>
                  {project.language && (
                    <span className="text-hairline-strong" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span className="shrink-0 text-dim">{project.commits30dTotal}c/30d</span>
                </>
              )}
              {(project.language || project.commits30dTotal > 0) && (
                <span className="text-hairline-strong" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="shrink-0">{ageLabel}</span>
            </div>
            <CardActions project={project} size="sm" origin="card" />
          </div>
        </div>
      </div>
    </SpecularSurface>
  );
}
