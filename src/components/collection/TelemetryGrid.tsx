import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { makePalette } from '../../art/color';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useSpatialNav } from '../../hooks/useSpatialNav';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme, Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { PulseBeacon, TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { Sparkline } from '../viz/Sparkline';
import { CardActions, LaunchLink } from './CardActions';
import { formatShortDate, formatSize, langColor } from './meta';

function CatalogIndexRow({
  project,
  theme,
  index,
}: {
  project: Project;
  theme: ArtTheme;
  index: number;
}) {
  const now = useNow(30_000);
  const foley = useFoley();
  const pal = makePalette(hueOf(project), theme);
  const tok = TIER_TOKENS[project.freshness.tier];
  const rowNo = String(index + 1).padStart(2, '0');
  const delta = formatDelta(now - Date.parse(project.lastActivityAt));

  const rowStyle = {
    ['--row-accent' as string]: pal.key,
  } as CSSProperties;

  return (
    <motion.div
      layout
      layoutId={`row-${project.id}`}
      data-deck-card={project.name}
      style={rowStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING}
      className="group relative grid grid-cols-1 items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-hover lg:grid-cols-[44px_minmax(0,2.3fr)_124px_132px_148px_92px_206px] lg:gap-4"
    >
      {/* Dynamic OKLCH 2px left ignition rail + subtle specular gradient wash on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[2.5px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: pal.key }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, ${pal.keyAlpha(pal.isLight ? 0.06 : 0.08)} 0%, transparent 32%)`,
        }}
      />

      {/* NO. */}
      <div className="mono relative z-[1] hidden text-[11px] font-semibold tracking-[0.14em] text-mute transition-colors group-hover:text-hot-ink lg:block">
        {rowNo}
      </div>

      {/* WORLD: 78x48 bespoke thumbnail with Flash specular sheen + title + concise tagline */}
      <div className="relative z-[1] flex min-w-0 items-center gap-3.5">
        <div className="flash-sheen relative h-[48px] w-[78px] shrink-0 overflow-hidden rounded-[5px] border border-hairline bg-inset shadow-[inset_0_1px_0_var(--inset-highlight)] transition-colors group-hover:border-hairline-strong">
          <CoverArt
            project={project}
            fill
            scrim="none"
            className="transition-transform duration-500 [transition-timing-function:var(--ease-snap)] group-hover:scale-105"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] font-medium tracking-[0.12em] text-mute lg:hidden">{rowNo}</span>
            <PulseBeacon project={project} />
            <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-ink transition-colors group-hover:text-hot-ink">
              <LaunchLink project={project} origin="card">
                {project.displayName}
              </LaunchLink>
            </h3>
            {project.kind === 'live' && (
              <span className="mono hidden rounded-[3px] bg-phosphor-soft px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.1em] text-phosphor-ink sm:inline lg:hidden">
                LIVE
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-dim">{project.tagline}</p>
        </div>
      </div>

      {/* CATEGORY */}
      <div className="relative z-[1] hidden min-w-0 lg:block">
        <span className="mono inline-flex max-w-full items-center gap-1.5 truncate rounded-[4px] border border-hairline bg-inset/80 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-dim shadow-[inset_0_1px_0_var(--inset-highlight)]">
          <span
            aria-hidden="true"
            className="size-[5px] shrink-0 rounded-full"
            style={{ background: pal.key }}
          />
          <span className="truncate">{project.category}</span>
        </span>
      </div>

      {/* STACK */}
      <div className="relative z-[1] hidden min-w-0 flex-col gap-0.5 lg:flex">
        <span className="mono inline-flex items-center gap-1.5 truncate text-[11.5px] font-medium text-ink">
          <span
            className="size-[6px] shrink-0 rounded-full"
            style={{ background: langColor(project.language) }}
            aria-hidden="true"
          />
          <span className="truncate">{project.language ?? 'Mixed'}</span>
        </span>
        <span className="mono text-[10px] text-mute">{formatSize(project.sizeKb)}</span>
      </div>

      {/* VELOCITY (30D) */}
      <div className="relative z-[1] hidden items-center gap-2.5 lg:flex">
        <Sparkline
          values={project.sparkline}
          color={project.freshness.tier === 'fresh' ? 'var(--led-hot)' : 'var(--led-online)'}
          width={76}
          height={22}
          animate={false}
          className="shrink-0"
        />
        <span className="mono shrink-0 text-[11px] font-semibold text-dim">{project.commits30dTotal}c</span>
      </div>

      {/* SHIPPED */}
      <div className="relative z-[1] hidden flex-col gap-0.5 lg:flex">
        <span className="mono text-[11.5px] font-semibold" style={{ color: tok.ink }}>
          {delta}
        </span>
        <span className="mono text-[10px] text-mute">{formatShortDate(project.pushedAt)}</span>
      </div>

      {/* ACTIONS (Desktop right-aligned; Mobile stacked metadata + actions row) */}
      <div className="relative z-[1] flex items-center justify-between gap-2 border-t border-hairline/70 pt-2.5 lg:justify-end lg:border-t-0 lg:pt-0">
        <div className="mono flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-mute lg:hidden">
          <span className="font-semibold" style={{ color: tok.ink }}>
            {delta}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-dim">
            <span
              className="size-[6px] shrink-0 rounded-full"
              style={{ background: langColor(project.language) }}
              aria-hidden="true"
            />
            {project.language ?? 'Mixed'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{project.commits30dTotal}c/30d</span>
        </div>

        <div className="above flex shrink-0 items-center gap-1.5">
          {project.launchUrl && (
            <a
              href={project.launchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => foley.relay()}
              aria-label={`Launch ${project.displayName}`}
              className="mono hidden h-7 items-center gap-1 rounded-[4px] border border-hairline bg-inset/80 px-2.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-dim shadow-[inset_0_1px_0_var(--inset-highlight)] transition hover:border-hot/60 hover:bg-hot-soft hover:text-hot-ink xl:inline-flex"
            >
              <span>Launch</span>
              <ArrowUpRight size={11} aria-hidden="true" />
            </a>
          )}
          <CardActions project={project} size="sm" origin="card" />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Interactive Swiss Catalog Index Table.
 * Full-width editorial specification index with live bespoke world thumbnails,
 * Flash specular row sweep, 30d sparklines, and spatial keyboard navigation.
 */
export function TelemetryGrid({ projects }: { projects: Project[] }) {
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const { containerRef, onKeyDown } = useSpatialNav<HTMLDivElement>({
    onPeek: (slug) => {
      const p = projects.find((x) => x.name === slug);
      foley.latch();
      setPeek(slug, 'card', p?.launchUrl ? 'sandbox' : 'brief');
    },
    onQr: (slug) => {
      const p = projects.find((x) => x.name === slug);
      if (!p?.launchUrl) return;
      foley.click();
      setPeek(slug, 'card', 'qr');
    },
    onPin: (slug) => {
      const p = projects.find((x) => x.name === slug);
      if (!p) return;
      foley.latch();
      togglePin(slug);
      toast(p.pinned ? `Unpinned ${p.displayName}` : `Pinned ${p.displayName} to dock`, 'ok');
    },
    onMove: () => foley.tick(),
  });

  const liveCount = projects.filter((p) => p.kind === 'live').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="beacon scale-[0.85]"
            style={{ ['--c' as string]: 'var(--led-hot)' }}
            aria-hidden="true"
          />
          <h2 className="eyebrow text-ink!">
            CATALOG INDEX // {String(projects.length).padStart(2, '0')}{' '}
            {liveCount === projects.length ? 'PLAYABLE WORLDS' : 'INDEXED BUILDS'}
          </h2>
        </div>
        <div className="mono hidden items-center gap-1.5 text-[10px] tracking-[0.14em] text-mute sm:flex">
          <span className="rounded-[4px] border border-hairline bg-inset/75 px-2 py-0.5">
            SEC 02 · SWISS SPECIFICATION INDEX
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-hairline bg-surface/80 px-2 py-0.5 font-semibold text-ink">
            <span
              className="size-[5px] rounded-full"
              style={{ background: 'var(--led-online)' }}
              aria-hidden="true"
            />
            {liveCount} LIVE
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-[9px] border border-hairline bg-surface [box-shadow:var(--shadow-surface)]"
      >
        {/* Swiss Catalog Column Header */}
        <div
          aria-hidden="true"
          className="mono hidden grid-cols-[44px_minmax(0,2.3fr)_124px_132px_148px_92px_206px] items-center gap-4 border-b border-hairline bg-inset/90 px-4 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-mute shadow-[inset_0_1px_0_var(--inset-highlight)] lg:grid"
        >
          <span>NO.</span>
          <span>WORLD</span>
          <span>CATEGORY</span>
          <span>STACK</span>
          <span>VELOCITY (30D)</span>
          <span>SHIPPED</span>
          <span className="text-right">ACTIONS</span>
        </div>

        <div className="divide-y divide-hairline">
          <AnimatePresence mode="popLayout" initial={false}>
            {projects.map((p, i) => (
              <CatalogIndexRow key={p.id} project={p} theme={theme} index={i} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
