import { Reorder, useDragControls } from 'framer-motion';
import { ChevronLeft, ChevronRight, Eye, GripVertical, Star, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { makePalette } from '../../art/color';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme, Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { TIER_TOKENS } from '../spotlight/FreshnessBadge';

interface CartridgeProps {
  project: Project;
  theme: ArtTheme;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onPeek: (name: string, isLive: boolean) => void;
  onUnpin: (name: string) => void;
}

function DockCartridge({ project, theme, index, total, onMove, onPeek, onUnpin }: CartridgeProps) {
  const dragControls = useDragControls();
  const foley = useFoley();
  const hue = hueOf(project);
  const pal = makePalette(hue, theme);
  const tok = TIER_TOKENS[project.freshness.tier];
  const slot = String(index + 1).padStart(2, '0');

  const accentStyle = {
    ['--card-accent' as string]: pal.key,
  } as CSSProperties;

  return (
    <Reorder.Item
      value={project.name}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.03, zIndex: 10 }}
      style={accentStyle}
      className="group surface relative flex h-[144px] w-[228px] shrink-0 flex-col justify-between overflow-hidden rounded-[7px]! select-none transition-shadow duration-200 hover:[box-shadow:var(--shadow-elevated)]"
    >
      {/* Dynamic OKLCH top ignition edge on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[6] h-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${pal.key} 25%, ${pal.highlight} 50%, ${pal.key} 75%, transparent 100%)`,
        }}
      />

      {/* Artwork stage with Flash diagonal specular sheen */}
      <div className="flash-sheen pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 transition-transform duration-500 [transition-timing-function:var(--ease-snap)] group-hover:scale-[1.05]">
          <CoverArt project={project} fill scrim="stage" />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: pal.isLight
              ? 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 45%, rgba(255,254,250,0.42) 100%)'
              : 'linear-gradient(180deg, rgba(3,3,5,0.22) 0%, transparent 45%, rgba(3,3,5,0.58) 100%)',
          }}
        />
      </div>

      {/* Top hardware strip: slot number, LED, machined tactile controls */}
      <div className="relative z-[5] flex items-center justify-between gap-1.5 px-2.5 pt-2.5">
        <span
          className="mono inline-flex h-[22px] items-center gap-1.5 rounded-[4px] px-1.5 text-[10px] font-semibold tracking-[0.12em] text-ink backdrop-blur-md"
          style={{
            background: 'var(--badge-bg)',
            boxShadow: 'inset 0 1px 0 var(--inset-highlight), inset 0 0 0 1px var(--badge-border)',
          }}
        >
          <span
            className="size-[5px] rounded-full"
            style={{ background: tok.dot, boxShadow: `0 0 6px ${tok.dot}` }}
            aria-hidden="true"
          />
          {slot}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Drag to reorder ${project.displayName}`}
            title="Drag to reorder"
            onPointerDown={(e) => {
              foley.tick();
              dragControls.start(e);
            }}
            className="grid size-6 cursor-grab touch-none place-items-center rounded-[4px] text-dim backdrop-blur-md transition hover:text-ink active:cursor-grabbing"
            style={{
              background: 'var(--badge-bg)',
              boxShadow: 'inset 0 1px 0 var(--inset-highlight), inset 0 0 0 1px var(--badge-border)',
            }}
          >
            <GripVertical size={12} />
          </button>
          <button
            type="button"
            aria-label={`Live Peek ${project.displayName}`}
            title="Live Peek"
            onClick={() => onPeek(project.name, Boolean(project.launchUrl))}
            className="grid size-6 cursor-pointer place-items-center rounded-[4px] text-dim backdrop-blur-md transition hover:text-ink"
            style={{
              background: 'var(--badge-bg)',
              boxShadow: 'inset 0 1px 0 var(--inset-highlight), inset 0 0 0 1px var(--badge-border)',
            }}
          >
            <Eye size={12} />
          </button>
          <button
            type="button"
            aria-label={`Unpin ${project.displayName}`}
            title="Unpin"
            onClick={() => onUnpin(project.name)}
            className="grid size-6 cursor-pointer place-items-center rounded-[4px] text-dim backdrop-blur-md transition hover:text-alarm-ink"
            style={{
              background: 'var(--badge-bg)',
              boxShadow: 'inset 0 1px 0 var(--inset-highlight), inset 0 0 0 1px var(--badge-border)',
            }}
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
        className="relative z-[2] flex flex-1 flex-col justify-end px-2.5 pb-2.5"
        aria-label={`Launch ${project.displayName}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="transition-transform duration-200 group-hover:-translate-y-0.5">
            <Glyph name={project.glyph} hue={hue} size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold tracking-[-0.015em] text-ink transition-colors group-hover:text-hot-ink">
              {project.displayName}
            </span>
          </div>
        </div>
      </a>

      {/* Accessible keyboard & touch reorder hardware rail */}
      <div className="relative z-[5] flex items-center justify-between border-t border-hairline bg-bar/88 px-2.5 py-1.5 backdrop-blur-md">
        <span className="mono truncate text-[9.5px] font-medium uppercase tracking-[0.12em] text-dim">
          <span className={project.kind === 'live' ? 'text-phosphor-ink' : 'text-mute'}>
            {project.kind === 'live' ? 'LIVE' : 'CODE'}
          </span>{' '}
          · {project.category}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 rounded-[4px] border border-hairline bg-inset/75 p-[1px]">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={`Move ${project.displayName} left`}
            className="grid size-5 cursor-pointer place-items-center rounded-[3px] text-dim transition-colors hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-30"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={`Move ${project.displayName} right`}
            className="grid size-5 cursor-pointer place-items-center rounded-[3px] text-dim transition-colors hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-30"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

/**
 * Pinned hardware cartridges. Persisted & synced across triple-store vault.
 * Gracefully renders nothing when 0 apps are pinned (zero dead standby clutter).
 */
export function FlagshipDock({ projects }: { projects: Project[] }) {
  const pins = useDeck((s) => s.vault.pins);
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const reorder = useDeck((s) => s.reorderPins);
  const togglePin = useDeck((s) => s.togglePin);
  const setPeek = useDeck((s) => s.setPeek);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const byName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);
  const visible = useMemo(() => pins.filter((n) => byName.has(n)), [pins, byName]);

  if (visible.length === 0) return null;

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
    <section aria-label="Pinned Dock" className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-hairline pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-grid size-5 place-items-center rounded-[4px] border border-hairline bg-hot-soft text-hot-ink">
            <Star size={11} fill="currentColor" aria-hidden="true" />
          </span>
          <h2 className="eyebrow text-ink!">Pinned Dock</h2>
          <span className="mono rounded-[4px] border border-hairline bg-inset/80 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.14em] text-dim">
            {String(visible.length).padStart(2, '0')} {visible.length === 1 ? 'CARTRIDGE' : 'CARTRIDGES'}
          </span>
        </div>
        <span className="mono hidden text-[10px] tracking-[0.14em] text-mute sm:inline">
          DRAG OR ARROWS TO REORDER
        </span>
      </div>

      <Reorder.Group
        axis="x"
        values={visible}
        onReorder={(next) => {
          foley.tick();
          commitOrder(next);
        }}
        className="hide-scroll flex max-w-full gap-3 overflow-x-auto pb-1.5 pt-0.5"
      >
        {visible.map((n, idx) => {
          const p = byName.get(n)!;
          return (
            <DockCartridge
              key={n}
              project={p}
              theme={theme}
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
    </section>
  );
}
