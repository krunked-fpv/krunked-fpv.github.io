import { Reorder } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { useMemo } from 'react';
import { hueOf } from '../../domain/buildProjects';
import { TIER_COLOR } from '../../domain/freshness';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { Kbd, modKey } from '../ui/Kbd';

/** Pinned apps as reorderable console tiles. Order persists via the vault. */
export function FlagshipDock({ projects }: { projects: Project[] }) {
  const pins = useDeck((s) => s.vault.pins);
  const reorder = useDeck((s) => s.reorderPins);
  const togglePin = useDeck((s) => s.togglePin);
  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);
  const visible = pins.filter((n) => byName.has(n));

  return (
    <section aria-label="Flagship Dock" className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow text-dim!">Flagship Dock</h2>
        <span className="mono text-[10.5px] text-mute">{visible.length ? 'DRAG TO REORDER' : 'EMPTY'}</span>
      </div>
      {visible.length ? (
        <Reorder.Group
          axis="x"
          values={visible}
          onReorder={(next) => reorder([...next, ...pins.filter((n) => !byName.has(n))])}
          className="hide-scroll flex max-w-full gap-3 overflow-x-auto pb-2"
        >
          {visible.map((n) => {
            const p = byName.get(n)!;
            const hue = hueOf(p);
            return (
              <Reorder.Item key={n} value={n} className="group surface relative size-[132px] shrink-0 cursor-grab overflow-hidden rounded-[20px]! active:cursor-grabbing" whileDrag={{ scale: 1.06, zIndex: 5 }}>
                <CoverArt project={p} fill />
                <a
                  href={p.launchUrl ?? p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  draggable={false}
                  className="absolute inset-0 z-[2] flex flex-col justify-between p-3"
                  aria-label={`Launch ${p.displayName}`}
                >
                  <span className="flex items-start justify-between">
                    <Glyph name={p.glyph} hue={hue} size={34} />
                    <span className="size-2 rounded-full" style={{ background: TIER_COLOR[p.freshness.tier], boxShadow: `0 0 8px ${TIER_COLOR[p.freshness.tier]}` }} />
                  </span>
                  <span className="truncate text-[13px] font-semibold tracking-tight">{p.displayName}</span>
                </a>
                <button
                  type="button"
                  aria-label={`Unpin ${p.displayName}`}
                  onClick={() => togglePin(n)}
                  className="absolute right-2 top-8 z-[5] grid size-7 place-items-center rounded-full bg-ob-950/80 text-dim opacity-0 backdrop-blur transition hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                >
                  <X size={13} />
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-5 py-6 text-[13px] text-mute">
          <Star size={16} />
          <span>
            Pin apps with the star on any card, or press <Kbd>P</Kbd> in the <Kbd>{modKey()}</Kbd> <Kbd>K</Kbd> launcher.
          </span>
        </div>
      )}
    </section>
  );
}
