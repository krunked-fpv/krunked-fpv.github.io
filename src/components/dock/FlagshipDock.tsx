import { Reorder, useDragControls } from 'framer-motion';
import { ChevronLeft, ChevronRight, Eye, GripVertical, Star, X } from 'lucide-react';
import { useMemo } from 'react';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { TIER_TOKENS } from '../spotlight/FreshnessBadge';
import { Kbd, modKey } from '../ui/Kbd';

interface CartridgeProps {
  project: Project;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onPeek: (name: string, isLive: boolean) => void;
  onUnpin: (name: string) => void;
}

function DockCartridge({ project, index, total, onMove, onPeek, onUnpin }: CartridgeProps) {
  const dragControls = useDragControls();
  const foley = useFoley();
  const hue = hueOf(project);
  const tok = TIER_TOKENS[project.freshness.tier];
  const slot = String(index + 1).padStart(2, '0');

  return (
    <Reorder.Item
      value={project.name}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.04, zIndex: 10 }}
      className="group surface relative flex h-[134px] w-[166px] shrink-0 flex-col justify-between overflow-hidden rounded-[14px]! select-none"
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <CoverArt project={project} fill />
      </div>

      {/* Top hardware strip: slot number, LED, drag handle */}
      <div className="relative z-[4] flex items-center justify-between gap-1 px-2.5 pt-2">
        <span
          className="mono inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium text-ink backdrop-blur-md"
          style={{
            background: 'var(--badge-bg)',
            boxShadow: 'inset 0 0 0 1px var(--badge-border)',
          }}
        >
          <span className="size-[6px] rounded-full" style={{ background: tok.dot }} />
          {slot}
        </span>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Drag to reorder ${project.displayName}`}
            title="Drag to reorder"
            onPointerDown={(e) => {
              foley.tick();
              dragControls.start(e);
            }}
            className="grid size-6 cursor-grab touch-none place-items-center rounded-[6px] text-dim backdrop-blur-md transition-colors hover:text-ink active:cursor-grabbing"
            style={{ background: 'var(--badge-bg)', boxShadow: 'inset 0 0 0 1px var(--badge-border)' }}
          >
            <GripVertical size={12} />
          </button>
          <button
            type="button"
            aria-label={`Live Peek ${project.displayName}`}
            title="Live Peek"
            onClick={() => onPeek(project.name, Boolean(project.launchUrl))}
            className="grid size-6 place-items-center rounded-[6px] text-dim backdrop-blur-md transition-colors hover:text-ink"
            style={{ background: 'var(--badge-bg)', boxShadow: 'inset 0 0 0 1px var(--badge-border)' }}
          >
            <Eye size={12} />
          </button>
          <button
            type="button"
            aria-label={`Unpin ${project.displayName}`}
            title="Unpin"
            onClick={() => onUnpin(project.name)}
            className="grid size-6 place-items-center rounded-[6px] text-dim backdrop-blur-md transition-colors hover:text-alarm-ink"
            style={{ background: 'var(--badge-bg)', boxShadow: 'inset 0 0 0 1px var(--badge-border)' }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Primary launch surface */}
      <a
        href={project.launchUrl ?? project.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        onClick={() => foley.relay()}
        className="relative z-[2] flex flex-1 flex-col justify-end px-2.5 pb-1.5"
        aria-label={`Launch ${project.displayName}`}
      >
        <div className="flex items-center gap-2">
          <Glyph name={project.glyph} hue={hue} size={28} />
          <span className="truncate text-[13px] font-semibold tracking-tight text-ink">{project.displayName}</span>
        </div>
      </a>

      {/* Accessible keyboard & touch reorder bar */}
      <div className="relative z-[4] flex items-center justify-between border-t border-hairline bg-bar/80 px-2 py-1 backdrop-blur-md">
        <span className="mono truncate text-[9.5px] uppercase tracking-wider text-mute">
          {project.kind === 'live' ? 'LIVE' : 'CODE'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={`Move ${project.displayName} left`}
            className="grid size-5 place-items-center rounded text-dim transition-colors hover:bg-hover hover:text-ink disabled:opacity-30"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={`Move ${project.displayName} right`}
            className="grid size-5 place-items-center rounded text-dim transition-colors hover:bg-hover hover:text-ink disabled:opacity-30"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

/** Pinned hardware cartridges. Persisted & synced across triple-store vault. */
export function FlagshipDock({ projects }: { projects: Project[] }) {
  const pins = useDeck((s) => s.vault.pins);
  const reorder = useDeck((s) => s.reorderPins);
  const togglePin = useDeck((s) => s.togglePin);
  const setPeek = useDeck((s) => s.setPeek);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);
  const visible = useMemo(() => pins.filter((n) => byName.has(n)), [pins, byName]);

  const commitOrder = (nextVisible: string[]) => {
    const rest = pins.filter((n) => !byName.has(n));
    reorder([...nextVisible, ...rest]);
  };

  const handleMove = (from: number, to: number) => {
    if (to < 0 || to >= visible.length || from === to) return;
    const next = [...visible];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    foley.latch();
    commitOrder(next);
  };

  return (
    <section aria-label="Flagship Dock" className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="eyebrow text-dim!">Flagship Dock</h2>
          {visible.length > 0 && (
            <span className="mono text-[10px] tracking-wider text-mute">{visible.length} PINNED</span>
          )}
        </div>
        <span className="mono text-[10px] tracking-wider text-mute">
          {visible.length ? 'GRIP OR ARROWS TO REORDER' : 'STANDBY'}
        </span>
      </div>

      {visible.length ? (
        <Reorder.Group
          axis="x"
          values={visible}
          onReorder={(next) => {
            foley.tick();
            commitOrder(next);
          }}
          className="hide-scroll flex max-w-full gap-3 overflow-x-auto pb-1.5"
        >
          {visible.map((n, idx) => {
            const p = byName.get(n)!;
            return (
              <DockCartridge
                key={n}
                project={p}
                index={idx}
                total={visible.length}
                onMove={handleMove}
                onPeek={(name, isLive) => {
                  foley.latch();
                  setPeek(name, null, isLive ? 'sandbox' : 'brief');
                }}
                onUnpin={(name) => {
                  foley.latch();
                  togglePin(name);
                  toast(`Unpinned ${p.displayName}`, 'info');
                }}
              />
            );
          })}
        </Reorder.Group>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-hairline bg-inset/70 px-4 py-3 text-[12.5px] text-dim">
          <div className="flex items-center gap-2.5">
            <Star size={14} className="shrink-0 text-solar-ink" />
            <span>
              Pin builds with the star button on any card, or press <Kbd>P</Kbd> in the <Kbd>{modKey()}</Kbd>{' '}
              <Kbd>K</Kbd> launcher.
            </span>
          </div>
          <span className="mono text-[10px] tracking-wider text-mute">VAULT SYNCED</span>
        </div>
      )}
    </section>
  );
}
