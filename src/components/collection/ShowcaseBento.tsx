import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Search } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { GITHUB_USER, SPRING } from '../../config/site';
import { useSpatialNav } from '../../hooks/useSpatialNav';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { GithubMark } from '../ui/GithubMark';
import { Kbd, modKey } from '../ui/Kbd';
import { AppCard } from './AppCard';

type ColSpan = 4 | 6 | 8 | 12;

/**
 * Orchestrates asymmetric editorial scale contrast across the 12-column monolith wall:
 * - >= 10 worlds: panoramic 6+6 opener, 4+4+4, 8+4 spotlight, 4+4+4, 4+8 spotlight, then 4-col plates.
 * - < 10 worlds (filtered): 12 (1), 6+6 (2 or 4), or 4-col plates.
 */
function xlSpanFor(index: number, total: number): ColSpan {
  if (total === 1) return 12;
  if (total < 10) {
    return total === 2 || total === 4 ? 6 : 4;
  }
  if (index === 0 || index === 1) return 6;
  if (index === 5 || index === 11) return 8;
  return 4;
}

const XL_SPAN_CLASS: Record<ColSpan, string> = {
  4: 'xl:col-span-4',
  6: 'xl:col-span-6',
  8: 'xl:col-span-8',
  12: 'xl:col-span-12',
};

/**
 * Asymmetric Architectural 12-Column Hairline Exhibition Wall.
 * Opens with a spacecraft-hangar telemetry strip and terminates in a razor-sharp 12/12
 * rectangular monograph block with an integrated Studio Archive monolith plate.
 */
export function ShowcaseBento({ projects }: { projects: Project[] }) {
  const setPeek = useDeck((s) => s.setPeek);
  const setPalette = useDeck((s) => s.setPalette);
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

  const spans = projects.map((_, i) => xlSpanFor(i, projects.length));
  const totalXlCols = spans.reduce<number>((sum, s) => sum + s, 0);
  const xlRem = (12 - (totalXlCols % 12)) % 12;
  const showXlArchive = projects.length >= 4 && (xlRem === 4 || xlRem === 8);
  const mdOdd = projects.length >= 3 && projects.length % 2 === 1;
  const showArchivePlate = showXlArchive || mdOdd;

  const liveCount = projects.filter((p) => p.kind === 'live').length;
  const commits30d = projects.reduce((sum, p) => sum + (p.commits30dTotal || 0), 0);
  const isWidePlate = xlRem === 8;

  // Breakpoint-exact visibility so neither md (6-col) nor xl (12-col) ever leaves an exposed bg-hairline gap
  const archiveResponsiveClass = showXlArchive
    ? mdOdd
      ? `hidden md:flex md:col-span-3 ${isWidePlate ? 'xl:col-span-8' : 'xl:col-span-4'}`
      : `hidden xl:flex ${isWidePlate ? 'xl:col-span-8' : 'xl:col-span-4'}`
    : 'hidden md:flex md:col-span-3 xl:hidden';

  return (
    <div className="flex flex-col gap-4">
      {/* Spacecraft Hangar Section Intro Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="beacon scale-[0.85]"
            style={{ ['--c' as string]: 'var(--led-hot)' }}
            aria-hidden="true"
          />
          <h2 className="eyebrow text-ink!">
            FULL ARCHIVE // {String(projects.length).padStart(2, '0')}{' '}
            {liveCount === projects.length ? 'PLAYABLE WORLDS' : 'INDEXED BUILDS'}
          </h2>
        </div>

        <div className="mono hidden items-center gap-1.5 text-[10px] tracking-[0.14em] text-mute sm:flex">
          <span className="rounded-[4px] border border-hairline bg-inset/75 px-2 py-0.5 text-mute">
            SEC 02 · HANGAR DECK
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-hairline bg-surface/80 px-2 py-0.5 font-semibold text-ink">
            <span
              className="size-[5px] rounded-full"
              style={{ background: 'var(--led-online)' }}
              aria-hidden="true"
            />
            {liveCount} LIVE
          </span>
          {commits30d > 0 && (
            <span className="rounded-[4px] border border-hairline bg-inset/75 px-2 py-0.5 text-dim">
              {commits30d}C / 30D
            </span>
          )}
        </div>
      </div>

      {/* Physical 12-Column Hairline Architectural Monograph Wall */}
      <motion.div
        ref={containerRef}
        onKeyDown={onKeyDown}
        layout
        className="monolith-grid grid grid-cols-1 gap-px overflow-hidden rounded-[9px] border border-hairline bg-hairline [box-shadow:var(--shadow-stage)] md:grid-cols-6 xl:grid-cols-12"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {projects.map((p, i) => {
            const span = spans[i] ?? 4;
            const mdCls = projects.length === 1 ? 'md:col-span-6' : 'md:col-span-3';
            return (
              <AppCard
                key={p.id}
                project={p}
                index={i}
                span={span}
                className={`${mdCls} ${XL_SPAN_CLASS[span]}`}
              />
            );
          })}
        </AnimatePresence>

        {showArchivePlate && (
          <motion.aside
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={SPRING}
            aria-label="Studio Archive"
            className={`monolith-cell hero-grid reticle-box relative min-w-0 flex-col justify-between overflow-hidden p-6 sm:p-7 ${archiveResponsiveClass}`}
          >
            {/* Subtle ambient studio aura inside the monograph annex plate */}
            <div aria-hidden="true" className="stage-glow opacity-80" />

            <div className="relative z-[2] flex items-center justify-between gap-2">
              <span className="chip rounded-[4px]! shadow-[inset_0_1px_0_var(--inset-highlight),inset_0_0_0_1px_var(--hairline-strong)]!">
                <span
                  className="led-dot"
                  style={{ ['--c' as string]: 'var(--led-hot)' }}
                  aria-hidden="true"
                />
                STUDIO ARCHIVE
              </span>
              <span className="mono rounded-[4px] border border-hairline bg-inset/75 px-2 py-0.5 text-[9.5px] font-medium tracking-[0.16em] text-mute">
                SEC 02 // END
              </span>
            </div>

            <div
              className={`relative z-[2] my-auto py-8 ${
                isWidePlate ? 'xl:flex xl:items-end xl:justify-between xl:gap-8' : 'flex flex-col gap-4'
              }`}
            >
              <div className={isWidePlate ? 'max-w-xl' : ''}>
                <p className="mono inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-hot-ink">
                  <span className="h-[2px] w-3 rounded-full bg-hot" aria-hidden="true" />
                  @{GITHUB_USER} // ORBITAL HANGAR
                </p>
                <h3 className="display mt-2.5 text-[27px] leading-[1.05] text-ink sm:text-[30px]">
                  {liveCount > 0 ? `${liveCount} live worlds` : `${projects.length} tracked builds`}{' '}
                  <span className="serif font-normal text-dim">&amp; open prototypes.</span>
                </h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
                  Inspect source repositories, hardware instruments, and active experimental branches directly on GitHub.
                </p>
              </div>

              {isWidePlate && (
                <div className="mono hidden shrink-0 grid-cols-2 gap-2 xl:grid">
                  <div className="rounded-[6px] border border-hairline bg-inset/80 px-3.5 py-2.5 shadow-[inset_0_1px_0_var(--inset-highlight)]">
                    <span className="block text-[9.5px] tracking-[0.15em] text-mute">ONLINE</span>
                    <span className="mt-0.5 block text-[18px] font-semibold tracking-[-0.02em] text-ink">
                      {String(liveCount).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="rounded-[6px] border border-hairline bg-inset/80 px-3.5 py-2.5 shadow-[inset_0_1px_0_var(--inset-highlight)]">
                    <span className="block text-[9.5px] tracking-[0.15em] text-mute">30D PULSE</span>
                    <span className="mt-0.5 block text-[18px] font-semibold tracking-[-0.02em] text-hot-ink">
                      {commits30d}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="relative z-[2] flex flex-wrap items-center justify-between gap-2.5 border-t border-hairline pt-4">
              <a
                href={`https://github.com/${GITHUB_USER}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => foley.relay()}
                className="btn btn-primary gap-2 px-3.5 text-[12.5px]"
              >
                <GithubMark size={14} />
                <span>Browse GitHub</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>

              <button
                type="button"
                onClick={() => {
                  foley.relay();
                  setPalette(true);
                }}
                className="btn gap-2 px-3 text-[12.5px] text-dim hover:text-ink"
              >
                <Search size={13} aria-hidden="true" />
                <span>Search All</span>
                <span className="flex items-center gap-0.5 pl-0.5">
                  <Kbd>{modKey()}</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
            </div>
          </motion.aside>
        )}
      </motion.div>
    </div>
  );
}
