import { motion } from 'framer-motion';
import { ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useRef } from 'react';
import { makePalette } from '../../art/color';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useSpecular } from '../../hooks/useSpecular';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme, Project } from '../../types/project';
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
      className="mono inline-flex h-[22px] items-center gap-1.5 rounded-[4px] px-2 text-[9.5px] font-semibold uppercase tracking-[0.11em] backdrop-blur-md"
      style={{
        color,
        background: 'var(--badge-bg)',
        boxShadow: 'inset 0 1px 0 var(--inset-highlight), inset 0 0 0 1px var(--badge-border)',
      }}
    >
      {led && (
        <span
          className="size-[5px] shrink-0 rounded-full"
          style={{ background: dot, boxShadow: `0 0 6px ${dot}` }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/**
 * Collectible architectural exhibition plate inside the 12-column hairline monolith wall.
 * Features dynamic per-project OKLCH accent glow, Flash diagonal specular sheen sweep,
 * pointer-tracked spotlight, subtle 3D artwork tilt, and snapping 4-corner reticles
 * while preserving data-deck-card + LaunchLink[data-card-primary].
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
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const hue = hueOf(project);
  const pal = makePalette(hue, theme);
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
    art.style.transform = `perspective(760px) rotateX(${(-ny * 3.1).toFixed(2)}deg) rotateY(${(nx * 3.4).toFixed(2)}deg) scale(1.048)`;
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

  const cardStyle = {
    ['--card-accent' as string]: pal.key,
  } as CSSProperties;

  return (
    <motion.article
      ref={specRef}
      layout
      layoutId={`card-${project.id}`}
      data-deck-card={project.name}
      style={cardStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 8) * 0.015 }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`monolith-cell card-magnetic group relative flex h-full min-w-0 flex-col justify-between overflow-hidden ${className}`}
    >
      {/* Dynamic OKLCH top ignition edge on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[8] h-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${pal.key} 22%, ${pal.highlight} 50%, ${pal.key} 78%, transparent 100%)`,
        }}
      />

      {/* Top Bespoke World Artwork Stage with Flash diagonal specular sheen & subtle 3D tilt */}
      <motion.div
        layoutId={`cover-card-${project.id}`}
        className={`flash-sheen relative ${artRatio} w-full shrink-0 overflow-hidden border-b border-hairline bg-inset`}
      >
        <div
          ref={artRef}
          className="absolute inset-0 transition-[transform,filter] duration-500 [transition-timing-function:var(--ease-snap)] will-change-transform group-hover:scale-[1.048] group-hover:brightness-[1.08]"
        >
          <CoverArt project={project} fill scrim="subtle" />
        </div>

        {/* Architectural inner frame vignette + recessed top specular edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background: pal.isLight
              ? 'radial-gradient(125% 110% at 50% 42%, transparent 56%, rgba(10, 10, 11, 0.08) 100%)'
              : 'radial-gradient(125% 110% at 50% 42%, transparent 48%, rgba(2, 2, 4, 0.44) 100%)',
            boxShadow: pal.isLight
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(10, 10, 11, 0.08)'
              : 'inset 0 1px 0 rgba(245, 243, 236, 0.11), inset 0 -18px 26px -14px rgba(3, 3, 5, 0.75)',
          }}
        />

        {/* Subtle dynamic per-project OKLCH horizon aura rising from bottom edge on hover */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-16 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `linear-gradient(180deg, transparent 0%, ${pal.keyAlpha(pal.isLight ? 0.14 : 0.22)} 100%)`,
          }}
        />

        {/* Corner architectural metadata: index + freshness dot top-left, crisp status plates top-right */}
        <div className="absolute inset-x-0 top-0 z-[3] flex items-start justify-between gap-2 p-3">
          <span
            className="mono inline-flex h-[22px] items-center gap-2 rounded-[4px] px-2 text-[9.5px] font-semibold tracking-[0.12em] text-ink backdrop-blur-md"
            style={{
              background: 'var(--badge-bg)',
              boxShadow: 'inset 0 1px 0 var(--inset-highlight), inset 0 0 0 1px var(--badge-border)',
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

        {/* Machined glyph pedestal anchored bottom-left */}
        <div
          className="absolute bottom-3 left-3 z-[3] rounded-[6px] p-[3px] backdrop-blur-md transition-transform duration-200 group-hover:-translate-y-0.5"
          style={{
            background: 'var(--badge-bg)',
            boxShadow: `inset 0 1px 0 var(--inset-highlight), 0 0 0 1px ${pal.keyAlpha(pal.isLight ? 0.26 : 0.34)}, 0 8px 20px -8px rgba(0, 0, 0, ${pal.isLight ? 0.22 : 0.86})`,
          }}
        >
          <Glyph name={project.glyph} hue={hue} size={isPanoramic ? 38 : 32} />
        </div>
      </motion.div>

      {/* Crisp Editorial Body */}
      <div
        className={`relative z-[1] flex flex-1 flex-col justify-between ${
          isPanoramic ? 'p-5 sm:p-6' : 'p-4 sm:p-5'
        }`}
      >
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="mono inline-flex min-w-0 items-center gap-2 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">
              <span
                aria-hidden="true"
                className="h-[2px] w-2.5 shrink-0 rounded-full transition-all duration-200 group-hover:w-4"
                style={{ background: pal.key }}
              />
              <span className="truncate">{project.category}</span>
            </span>

            <span
              className={`mono inline-flex shrink-0 items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all duration-200 ${
                isPanoramic
                  ? 'border-hairline bg-inset/70 text-dim group-hover:border-hot/60 group-hover:bg-hot-soft group-hover:text-hot-ink'
                  : 'border-transparent text-mute group-hover:border-hairline-strong group-hover:bg-inset/75 group-hover:text-hot-ink'
              }`}
              aria-hidden="true"
            >
              <span>{project.launchUrl ? 'Launch' : 'Inspect'}</span>
              <ArrowUpRight
                size={11.5}
                className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </span>
          </div>

          <h3
            className={`min-w-0 font-semibold text-ink transition-colors duration-200 group-hover:text-hot-ink ${
              isPanoramic
                ? 'text-[24px] leading-[1.06] tracking-[-0.034em] sm:text-[27px]'
                : 'text-[20px] leading-[1.14] tracking-[-0.026em]'
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
          {/* Machined 2.5px language spectrum hairline with crisp hover luminosity */}
          {langs.length > 0 && (
            <div
              className="flex h-[2.5px] w-full gap-[1px] overflow-hidden rounded-full bg-inset transition-[filter] duration-300 group-hover:brightness-125"
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
                  <span className="truncate font-medium">{project.language}</span>
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
