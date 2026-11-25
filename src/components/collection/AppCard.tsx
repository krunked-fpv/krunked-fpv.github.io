import { motion } from 'framer-motion';
import { ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useSpecular } from '../../hooks/useSpecular';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { PulseBeacon, TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { CardActions, LaunchLink } from './CardActions';
import { langColor, topLanguages } from './meta';

function CornerPlate({
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
      className="mono inline-flex h-[22px] items-center gap-1.5 rounded-[4px] px-2 text-[10px] font-medium uppercase tracking-[0.1em] backdrop-blur-md"
      style={{
        color,
        background: 'var(--badge-bg)',
        boxShadow: 'inset 0 0 0 1px var(--badge-border)',
      }}
    >
      {led && <span className="size-[5px] shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Magnetic architectural exhibition plate inside the 12-column hairline monolith wall.
 * Features pointer-tracked specular lighting, subtle 3D artwork tilt, and snapping Flash-era
 * 4-corner targeting reticle brackets while preserving data-deck-card + LaunchLink[data-card-primary].
 */
export function AppCard({
  project,
  index = 0,
  span = 4,
  className = '',
}: {
  project: Project;
  index?: number;
  span?: 4 | 6 | 8 | 12;
  className?: string;
}) {
  const hue = hueOf(project);
  const now = useNow(30_000);
  const specRef = useSpecular<HTMLElement>();
  const artRef = useRef<HTMLDivElement | null>(null);
  const langs = topLanguages(project.languages, 4);
  const ageLabel = formatDelta(now - Date.parse(project.lastActivityAt));
  const tok = TIER_TOKENS[project.freshness.tier];
  const plateNo = String(index + 1).padStart(2, '0');
  const isPanoramic = span >= 6;

  // Lightweight zero-re-render subtle 3D depth tilt on the inner artwork frame (hover-capable, non-reduced-motion only)
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const art = artRef.current;
    if (!art || typeof window === 'undefined') return;
    if (!window.matchMedia('(hover: hover)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    art.style.transform = `perspective(720px) rotateX(${(-ny * 3.2).toFixed(2)}deg) rotateY(${(nx * 3.6).toFixed(2)}deg) scale(1.045)`;
  }, []);

  const onPointerLeave = useCallback(() => {
    const art = artRef.current;
    if (art) art.style.transform = '';
  }, []);

  // Anamorphic widescreen ratio on 8-col plates keeps sibling 4-col heights balanced in the hairline wall
  const artRatio =
    span === 8
      ? 'aspect-[16/10] xl:aspect-[2.85/1]'
      : span === 6 || span === 12
        ? 'aspect-[16/9]'
        : 'aspect-[16/10]';

  return (
    <motion.article
      ref={specRef}
      layout
      layoutId={`card-${project.id}`}
      data-deck-card={project.name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 8) * 0.015 }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`monolith-cell card-magnetic group relative flex h-full min-w-0 flex-col justify-between overflow-hidden ${className}`}
    >
      {/* Subtle kinetic top ignition bar on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[6] h-[2px] bg-hot opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />

      {/* Top Bespoke World Artwork Stage with subtle 3D magnetic depth tilt */}
      <motion.div
        layoutId={`cover-card-${project.id}`}
        className={`relative ${artRatio} w-full shrink-0 overflow-hidden border-b border-hairline bg-inset`}
      >
        <div
          ref={artRef}
          className="absolute inset-0 transition-[transform,filter] duration-500 [transition-timing-function:var(--ease-snap)] will-change-transform group-hover:scale-[1.045] group-hover:brightness-[1.08]"
        >
          <CoverArt project={project} fill scrim="subtle" />
        </div>

        {/* Corner architectural metadata: index + freshness dot top-left, single crisp status plate top-right */}
        <div className="absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-2 p-3">
          <span
            className="mono inline-flex h-[22px] items-center gap-2 rounded-[4px] px-2 text-[10px] font-medium tracking-[0.12em] text-ink backdrop-blur-md"
            style={{
              background: 'var(--badge-bg)',
              boxShadow: 'inset 0 0 0 1px var(--badge-border)',
            }}
            title={`Last push ${new Date(project.lastActivityAt).toLocaleString()}`}
          >
            <span className="text-mute">{plateNo}</span>
            <PulseBeacon project={project} />
            <span style={{ color: tok.ink }}>{ageLabel.toUpperCase()}</span>
          </span>

          <div className="flex items-center justify-end gap-1.5">
            {project.hasCustomCuration && (
              <CornerPlate tone="hot">
                <SlidersHorizontal size={10} aria-hidden="true" />
                CURATED
              </CornerPlate>
            )}
            {project.kind === 'live' ? (
              <CornerPlate tone="online" led>
                {project.isPwa ? 'LIVE · PWA' : 'LIVE'}
              </CornerPlate>
            ) : (
              <CornerPlate>CODE</CornerPlate>
            )}
          </div>
        </div>

        {/* Machined square-chamfer glyph anchored bottom-left */}
        <div className="absolute bottom-3 left-3 z-[2]">
          <Glyph name={project.glyph} hue={hue} size={isPanoramic ? 40 : 34} />
        </div>
      </motion.div>

      {/* Crisp Editorial Body */}
      <div className={`relative z-[1] flex flex-1 flex-col justify-between ${isPanoramic ? 'p-5 sm:p-6' : 'p-4 sm:p-5'}`}>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="mono truncate text-[10px] font-medium uppercase tracking-[0.16em] text-mute">
              {project.category}
            </span>
            <span
              className={`mono inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                isPanoramic
                  ? 'rounded-[4px] border border-hairline px-2 py-0.5 text-dim group-hover:border-hot/60 group-hover:bg-hot-soft group-hover:text-hot-ink'
                  : 'text-mute group-hover:text-hot-ink'
              }`}
              aria-hidden="true"
            >
              <span>{project.launchUrl ? 'Launch' : 'Inspect'}</span>
              <ArrowUpRight
                size={12}
                className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </span>
          </div>

          <h3
            className={`min-w-0 font-semibold text-ink transition-colors group-hover:text-hot-ink ${
              isPanoramic
                ? 'text-[24px] leading-[1.08] tracking-[-0.032em] sm:text-[26px]'
                : 'text-[20px] leading-[1.15] tracking-[-0.025em]'
            }`}
          >
            <LaunchLink project={project} origin="card">
              {project.displayName}
            </LaunchLink>
          </h3>

          <p
            className={`mt-2 line-clamp-2 min-h-[2.65rem] leading-relaxed text-dim ${
              isPanoramic ? 'max-w-2xl text-[14px]' : 'text-[13.5px]'
            }`}
          >
            {project.tagline}
          </p>
        </div>

        <div className="mt-4 flex flex-col">
          {/* Razor-thin 2px language spectrum hairline */}
          {langs.length > 0 && (
            <div
              className="flex h-[2px] w-full overflow-hidden bg-inset"
              aria-label={`Languages: ${langs.map((l) => `${l.name} ${Math.round(l.pct)}%`).join(', ')}`}
            >
              {langs.map((l) => (
                <span
                  key={l.name}
                  style={{ width: `${l.pct}%`, background: l.color }}
                  className="h-full"
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
                <span className="hidden text-hairline-strong min-[410px]:inline" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="hidden shrink-0 min-[410px]:inline">{ageLabel}</span>
            </div>
            <CardActions project={project} size="sm" origin="card" />
          </div>
        </div>
      </div>
    </motion.article>
  );
}
