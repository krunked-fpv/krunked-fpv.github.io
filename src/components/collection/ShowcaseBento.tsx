import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Search } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { GITHUB_USER, SPRING } from '../../config/site';
import { useSpatialNav } from '../../hooks/useSpatialNav';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { GithubMark } from '../ui/GithubMark';
import { Kbd, modKey } from '../ui/Kbd';
import { SpecularSurface } from '../ui/SpecularSurface';
import { AppCard } from './AppCard';

/**
 * Spacious 3-column museum gallery grid (~440px per card at 1400px).
 * Unified exhibition card geometry ensures untruncated display titles and razor alignment,
 * with an architectural Studio Archive closing plate eliminating orphan grid columns on xl+.
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

  const rem = projects.length % 3;
  const showArchivePlate = projects.length >= 4 && rem !== 0;
  const liveCount = projects.filter((p) => p.kind === 'live').length;
  const isWidePlate = rem === 1;

  return (
    <motion.div
      ref={containerRef}
      onKeyDown={onKeyDown}
      layout
      className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {projects.map((p, i) => (
          <AppCard key={p.id} project={p} index={i} />
        ))}
      </AnimatePresence>

      {showArchivePlate && (
        <SpecularSurface
          layout
          interactive={false}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className={`hero-grid hidden min-w-0 flex-col justify-between overflow-hidden rounded-[16px]! p-6 xl:flex ${
            isWidePlate ? 'xl:col-span-2' : 'xl:col-span-1'
          }`}
        >
          <div className="relative z-[1] flex items-center justify-between gap-2">
            <span className="chip">
              <span
                className="led-dot"
                style={{ ['--c' as string]: 'var(--led-online)' }}
                aria-hidden="true"
              />
              STUDIO ARCHIVE
            </span>
            <span className="mono text-[10px] tracking-[0.16em] text-mute">ON THE BENCH</span>
          </div>

          <div
            className={`relative z-[1] my-auto py-8 ${
              isWidePlate ? 'flex items-end justify-between gap-8' : 'flex flex-col gap-3'
            }`}
          >
            <div className={isWidePlate ? 'max-w-lg' : ''}>
              <p className="mono text-[10.5px] tracking-[0.16em] text-hot-ink uppercase">
                @{GITHUB_USER} // CONTINUOUS FORGE
              </p>
              <h3 className="display mt-2 text-[26px] leading-[1.1] text-ink">
                {liveCount > 0
                  ? `${liveCount} live builds`
                  : `${projects.length} tracked builds`}{' '}
                <span className="serif font-normal text-dim">&amp; open prototypes.</span>
              </h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-dim">
                Explore source repositories, active experiments, and commit histories across the full studio catalog on GitHub.
              </p>
            </div>
          </div>

          <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2.5 border-t border-hairline pt-4">
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
        </SpecularSurface>
      )}
    </motion.div>
  );
}
