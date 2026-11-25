import { AnimatePresence } from 'framer-motion';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useSpatialNav } from '../../hooks/useSpatialNav';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { PulseBeacon, TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { SpecularSurface } from '../ui/SpecularSurface';
import { Sparkline } from '../viz/Sparkline';
import { CardActions, LaunchLink } from './CardActions';
import { formatShortDate, formatSize, langColor, topLanguages } from './meta';

function TelemetryRow({ project }: { project: Project }) {
  const now = useNow(30_000);
  const tok = TIER_TOKENS[project.freshness.tier];
  const langs = topLanguages(project.languages, 4);

  return (
    <SpecularSurface
      layout
      layoutId={`row-${project.id}`}
      data-deck-card={project.name}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={SPRING}
      className="group flex min-w-0 flex-col justify-between rounded-[14px]! p-4 transition-transform duration-200 [transition-timing-function:var(--ease-snap)] hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-[10px] border border-hairline bg-inset">
          <CoverArt project={project} fill scrim="none" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <PulseBeacon project={project} />
            <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-ink transition-colors group-hover:text-hot-ink">
              <LaunchLink project={project} origin="card">
                {project.displayName}
              </LaunchLink>
            </h3>
          </div>
          <div className="mono mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-mute">
            <span className="font-medium" style={{ color: tok.ink }}>
              {formatDelta(now - Date.parse(project.lastActivityAt))}
            </span>
            <span className="text-hairline-strong" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 text-dim">
              <span
                className="size-[6px] shrink-0 rounded-full"
                style={{ background: langColor(project.language) }}
                aria-hidden="true"
              />
              {project.language ?? 'Mixed'}
            </span>
            <span className="text-hairline-strong" aria-hidden="true">
              ·
            </span>
            <span className="truncate uppercase tracking-[0.08em]">{project.category}</span>
          </div>
        </div>

        <Sparkline
          values={project.sparkline}
          color={project.freshness.tier === 'fresh' ? 'var(--led-hot)' : 'var(--led-online)'}
          width={68}
          height={24}
          animate={false}
          className="hidden shrink-0 sm:block"
        />
      </div>

      {langs.length > 0 && (
        <div
          className="mt-3 flex h-[2px] w-full overflow-hidden rounded-full bg-inset"
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

      <div className="mt-3 flex items-end justify-between gap-2 border-t border-hairline pt-3">
        <dl className="mono grid flex-1 grid-cols-4 gap-2 text-[10px] tracking-[0.06em]">
          {[
            ['PUSHED', formatShortDate(project.pushedAt)],
            ['30D', `${project.commits30dTotal}c`],
            ['SIZE', formatSize(project.sizeKb)],
            ['SHA', project.latestCommit ? project.latestCommit.sha.slice(0, 7) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[9.5px] text-mute">{k}</dt>
              <dd className="mt-0.5 truncate font-medium text-dim">{v}</dd>
            </div>
          ))}
        </dl>
        <CardActions project={project} size="sm" origin="card" />
      </div>
    </SpecularSurface>
  );
}

/** Braun Hi-Fi Swiss specification index with sparklines, SHA telemetry, and spatial keyboard nav. */
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
      className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {projects.map((p) => (
          <TelemetryRow key={p.id} project={p} />
        ))}
      </AnimatePresence>
    </div>
  );
}
