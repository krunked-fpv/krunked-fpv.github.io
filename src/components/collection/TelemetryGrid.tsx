import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useSpatialNav } from '../../hooks/useSpatialNav';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { PulseBeacon, TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { Sparkline } from '../viz/Sparkline';
import { CardActions, LaunchLink } from './CardActions';
import { formatShortDate, formatSize, langColor } from './meta';

function CatalogIndexRow({ project, index }: { project: Project; index: number }) {
  const now = useNow(30_000);
  const foley = useFoley();
  const tok = TIER_TOKENS[project.freshness.tier];
  const rowNo = String(index + 1).padStart(2, '0');
  const delta = formatDelta(now - Date.parse(project.lastActivityAt));

  return (
    <motion.div
      layout
      layoutId={`row-${project.id}`}
      data-deck-card={project.name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING}
      className="group relative grid grid-cols-1 items-center gap-3 px-4 py-3 transition-colors duration-150 before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-hot before:opacity-0 before:transition-opacity hover:bg-hover hover:before:opacity-100 lg:grid-cols-[44px_minmax(0,2.3fr)_124px_132px_148px_92px_206px] lg:gap-4"
    >
      {/* NO. */}
      <div className="mono hidden text-[11px] font-medium tracking-[0.14em] text-mute transition-colors group-hover:text-hot-ink lg:block">
        {rowNo}
      </div>

      {/* WORLD: 76x46 bespoke thumbnail + title + concise tagline */}
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative h-[46px] w-[76px] shrink-0 overflow-hidden rounded-[4px] border border-hairline bg-inset">
          <CoverArt
            project={project}
            fill
            scrim="none"
            className="transition-transform duration-500 [transition-timing-function:var(--ease-snap)] group-hover:scale-105"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] tracking-[0.12em] text-mute lg:hidden">{rowNo}</span>
            <PulseBeacon project={project} />
            <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-ink transition-colors group-hover:text-hot-ink">
              <LaunchLink project={project} origin="card">
                {project.displayName}
              </LaunchLink>
            </h3>
            {project.kind === 'live' && (
              <span className="mono hidden rounded-[3px] bg-phosphor-soft px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.1em] text-phosphor-ink sm:inline lg:hidden">
                LIVE
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-dim">{project.tagline}</p>
        </div>
      </div>

      {/* CATEGORY */}
      <div className="hidden min-w-0 lg:block">
        <span className="mono inline-flex max-w-full truncate rounded-[4px] border border-hairline bg-inset/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-dim">
          {project.category}
        </span>
      </div>

      {/* STACK */}
      <div className="hidden min-w-0 flex-col gap-0.5 lg:flex">
        <span className="mono inline-flex items-center gap-1.5 truncate text-[11.5px] text-ink">
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
      <div className="hidden items-center gap-2.5 lg:flex">
        <Sparkline
          values={project.sparkline}
          color={project.freshness.tier === 'fresh' ? 'var(--led-hot)' : 'var(--led-online)'}
          width={76}
          height={22}
          animate={false}
          className="shrink-0"
        />
        <span className="mono shrink-0 text-[11px] font-medium text-dim">{project.commits30dTotal}c</span>
      </div>

      {/* SHIPPED */}
      <div className="hidden flex-col gap-0.5 lg:flex">
        <span className="mono text-[11.5px] font-medium" style={{ color: tok.ink }}>
          {delta}
        </span>
        <span className="mono text-[10px] text-mute">{formatShortDate(project.pushedAt)}</span>
      </div>

      {/* ACTIONS (Desktop right-aligned; Mobile stacked metadata + actions row) */}
      <div className="flex items-center justify-between gap-2 border-t border-hairline/70 pt-2.5 lg:justify-end lg:border-t-0 lg:pt-0">
        <div className="mono flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-mute lg:hidden">
          <span className="font-medium" style={{ color: tok.ink }}>
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
              className="mono hidden h-7 items-center gap-1 rounded-[4px] border border-hairline bg-inset/70 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-dim transition-colors hover:border-hot/60 hover:bg-hot-soft hover:text-hot-ink xl:inline-flex"
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
 * 30d sparklines, 2px acid-lime hover rails, and spatial keyboard navigation.
 */
export function TelemetryGrid({ projects }: { projects: Project[] }) {
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

  return (
    <div
      ref={containerRef}
      onKeyDown={onKeyDown}
      className="overflow-hidden rounded-[8px] border border-hairline bg-surface"
    >
      {/* Swiss Catalog Column Header */}
      <div
        aria-hidden="true"
        className="mono hidden grid-cols-[44px_minmax(0,2.3fr)_124px_132px_148px_92px_206px] items-center gap-4 border-b border-hairline bg-inset/85 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-mute lg:grid"
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
            <CatalogIndexRow key={p.id} project={p} index={i} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
