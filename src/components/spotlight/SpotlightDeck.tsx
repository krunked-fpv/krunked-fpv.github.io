import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Eye } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import type { OrbitNodeTarget } from '../hero/BurstFxCanvas';
import { TIER_TOKENS } from './FreshnessBadge';
import { SpotlightTile } from './SpotlightTile';

export const ORBIT_CENTER_X = 0.5;
export const ORBIT_CENTER_Y_DESKTOP = 0.435;
export const ORBIT_CENTER_Y_MOBILE = 0.47;
export const ORBIT_CENTER_Y = ORBIT_CENTER_Y_DESKTOP;

const INNER_COUNT = 6;
const INNER_RX = 0.212;
const INNER_RY = 0.232;
const OUTER_RX = 0.422;
const OUTER_RY = 0.34;

/** Snappy golden-age Flash spring: visibly popping by ~120ms, locked solidly within ~450ms. */
const FLASH_SPRING = {
  type: 'spring',
  stiffness: 340,
  damping: 22,
  mass: 0.72,
} as const;

export interface OrbitPlacement {
  project: Project;
  index: number;
  ring: 'inner' | 'outer';
  ringIndex: number;
  /** Normalized 0..1 coordinates inside the Singularity Arena */
  nx: number;
  ny: number;
  hue: number;
}

/**
 * Computes zero-collision dual-ring orbital coordinates for up to 17 worlds around the Event Horizon.
 * Guarantees >= 24px air gap above the bottom Holographic Launch HUD (y <= arenaHeight - 134) at
 * both 1440x900 and 1024x768, while giving wide untruncated inner cartridges (184px) and outer pills
 * (up to 204px) clean mutual separation.
 */
export function computeOrbitLayout(
  worlds: readonly Project[],
  orbitShift = 0,
  centerYRatio = ORBIT_CENTER_Y_DESKTOP,
  arenaHeight = 848,
): { placements: OrbitPlacement[]; targets: OrbitNodeTarget[] } {
  const capped = worlds.slice(0, 17);
  const inner = capped.slice(0, INNER_COUNT);
  const outer = capped.slice(INNER_COUNT);

  const safeH = Math.max(600, arenaHeight);
  // Keep every outer pod center safely above arenaHeight - 134 (accounting for ~18px pill half-height + >=24px gap over ~88px HUD)
  const maxOuterNy = Math.min(0.715, (safeH - 134) / safeH);
  const maxInnerNy = Math.min(0.672, (safeH - 166) / safeH);
  const effectiveOuterRy = Math.min(OUTER_RY, 295 / safeH);
  const effectiveInnerRy = Math.min(INNER_RY, Math.max(0.19, maxInnerNy - centerYRatio));

  const placements: OrbitPlacement[] = [];

  inner.forEach((project, idx) => {
    const slot = (idx + orbitShift) % Math.max(1, inner.length);
    const deg = -150 + slot * (360 / Math.max(1, inner.length));
    const rad = (deg * Math.PI) / 180;
    const nx = ORBIT_CENTER_X + Math.cos(rad) * INNER_RX;
    const ny = Math.max(0.145, Math.min(maxInnerNy, centerYRatio + Math.sin(rad) * effectiveInnerRy));
    placements.push({
      project,
      index: idx,
      ring: 'inner',
      ringIndex: idx,
      nx,
      ny,
      hue: hueOf(project),
    });
  });

  outer.forEach((project, idx) => {
    const total = outer.length;
    const slot = (idx + orbitShift * 2) % Math.max(1, total);
    // Sweep 126deg clockwise through 180, 270, 0 to 414deg (54deg), keeping bottom-hemisphere outer pods well clear of the HUD bay
    const deg = total <= 1 ? 270 : 126 + (slot / (total - 1)) * 288;
    const rad = (deg * Math.PI) / 180;
    const nx = Math.max(0.088, Math.min(0.912, ORBIT_CENTER_X + Math.cos(rad) * OUTER_RX));
    const ny = Math.max(0.085, Math.min(maxOuterNy, centerYRatio + Math.sin(rad) * effectiveOuterRy));
    placements.push({
      project,
      index: inner.length + idx,
      ring: 'outer',
      ringIndex: idx,
      nx,
      ny,
      hue: hueOf(project),
    });
  });

  const targets: OrbitNodeTarget[] = placements.map((p) => ({
    id: p.project.name,
    nx: p.nx,
    ny: p.ny,
    hue: p.hue,
    ring: p.ring,
  }));

  return { placements, targets };
}

export interface SpotlightDeckProps {
  projects: Project[];
  allProjects?: Project[];
  exploded?: boolean;
  orbitShift?: number;
  centerYRatio?: number;
  arenaHeight?: number;
  placements?: readonly OrbitPlacement[];
  activeSlug?: string | null;
  hoveredSlug?: string | null;
  onSelectWorld?: (project: Project) => void;
  onHoverWorld?: (project: Project | null) => void;
  onActiveChange?: (project: Project | null) => void;
}

/**
 * Exploding 17-World Radial Orbital Constellation + Holographic Launch HUD:
 * - Desktop (lg+): Synchronously measures arena bounds on mount and immediately blasts 6 wide untruncated
 *   Inner Flagship cartridges (184px) & up to 11 auto-width Outer satellite pills outward from (50%, centerYRatio)
 *   with snappy Flash spring physics, dual pointer+mouse hover bindings, and a 3-row Holographic Launch HUD.
 * - Mobile (<1024px): Blasts out a staggered 2-column Top-6 constellation grid with generous pt-24 top clearance.
 */
export function SpotlightDeck({
  projects,
  exploded = true,
  orbitShift = 0,
  centerYRatio = ORBIT_CENTER_Y_DESKTOP,
  arenaHeight: arenaHeightProp,
  placements: placementsProp,
  activeSlug = null,
  hoveredSlug = null,
  onSelectWorld,
  onHoverWorld,
  onActiveChange,
}: SpotlightDeckProps) {
  const seenAtLoad = useRef(useDeck.getState().vault.seen);
  const markSeen = useDeck((s) => s.markSeen);
  const setPeek = useDeck((s) => s.setPeek);
  const foley = useFoley();
  const reduced = useReducedMotion();

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(arenaHeightProp ?? 848);

  // Measure arena height synchronously on mount so pods never wait for an extra ResizeObserver tick
  useLayoutEffect(() => {
    if (arenaHeightProp !== undefined) return;
    const el = arenaRef.current;
    if (!el) return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setMeasuredHeight(h);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [arenaHeightProp]);

  const effectiveHeight = arenaHeightProp ?? measuredHeight;
  const computed =
    placementsProp ?? computeOrbitLayout(projects, orbitShift, centerYRatio, effectiveHeight).placements;

  const activePlacement =
    computed.find((p) => p.project.name === (hoveredSlug ?? activeSlug)) ??
    computed.find((p) => p.project.name === activeSlug) ??
    computed[0] ??
    null;

  // After an 8s dwell, remember latest SHA per flagship repo (drives "+N NEW" badge)
  useEffect(() => {
    if (!exploded) return;
    const t = setTimeout(() => {
      for (const item of computed.slice(0, 6)) {
        if (item.project.latestCommit) markSeen(item.project.name, item.project.latestCommit.sha);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [exploded, computed, markSeen]);

  const newCount = (p: Project): number | null => {
    const seen = seenAtLoad.current[p.name];
    const head = p.latestCommit?.sha;
    if (!seen || !head || seen === head) return null;
    const idx = p.recentCommits.findIndex((c) => c.sha === seen);
    return idx > 0 ? idx : 1;
  };

  const handlePodEnter = (project: Project) => {
    if (hoveredSlug !== project.name) foley.tick();
    onHoverWorld?.(project);
    onSelectWorld?.(project);
    onActiveChange?.(project);
  };

  const handlePodClick = (project: Project, isAlreadyActive: boolean) => {
    if (isAlreadyActive && project.launchUrl) {
      foley.relay();
      window.open(project.launchUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    foley.tick();
    onSelectWorld?.(project);
    onActiveChange?.(project);
  };

  const mobileSix = computed.slice(0, 6);

  return (
    <>
      {/* Desktop (lg+): Dual-Ring Exploding 17-World Orbital Constellation */}
      <div ref={arenaRef} className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
        <AnimatePresence>
          {exploded &&
            computed.map((item) => {
              const { project, ring, ringIndex, nx, ny, hue, index } = item;
              const isSelected = activePlacement?.project.name === project.name;
              const tok = TIER_TOKENS[project.freshness.tier];
              const num = String(index + 1).padStart(2, '0');
              const delay = reduced ? 0 : ring === 'inner' ? ringIndex * 0.015 : 0.06 + ringIndex * 0.014;
              const floatDelay = `${(index * 0.45) % 4}s`;

              return (
                <motion.div
                  key={project.id}
                  initial={
                    reduced
                      ? { left: `${nx * 100}%`, top: `${ny * 100}%`, opacity: 0, scale: 0.92 }
                      : {
                          left: `${ORBIT_CENTER_X * 100}%`,
                          top: `${centerYRatio * 100}%`,
                          scale: 0.08,
                          opacity: 0,
                          rotate: ring === 'inner' ? -32 : -48,
                        }
                  }
                  animate={{
                    left: `${nx * 100}%`,
                    top: `${ny * 100}%`,
                    scale: 1,
                    opacity: 1,
                    rotate: 0,
                  }}
                  exit={
                    reduced
                      ? { opacity: 0, scale: 0.9 }
                      : {
                          left: `${ORBIT_CENTER_X * 100}%`,
                          top: `${centerYRatio * 100}%`,
                          scale: 0.05,
                          opacity: 0,
                          rotate: 86,
                          transition: { duration: 0.34, ease: [0.4, 0, 0.2, 1] },
                        }
                  }
                  transition={
                    reduced
                      ? { duration: 0.14 }
                      : { ...FLASH_SPRING, delay }
                  }
                  style={{
                    position: 'absolute',
                    x: '-50%',
                    y: '-50%',
                    zIndex: isSelected ? 25 : ring === 'inner' ? 16 : 12,
                  }}
                  className="pointer-events-auto"
                >
                  <div
                    style={
                      reduced
                        ? undefined
                        : {
                            animation: 'orbit-float 6s ease-in-out infinite',
                            animationDelay: floatDelay,
                          }
                    }
                  >
                    {ring === 'inner' ? (
                      <div
                        role="button"
                        tabIndex={0}
                        data-active={isSelected ? 'true' : undefined}
                        onPointerEnter={() => handlePodEnter(project)}
                        onMouseEnter={() => handlePodEnter(project)}
                        onMouseLeave={() => onHoverWorld?.(null)}
                        onFocus={() => {
                          onSelectWorld?.(project);
                          onActiveChange?.(project);
                        }}
                        onClick={() => handlePodClick(project, isSelected)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handlePodClick(project, isSelected);
                          }
                        }}
                        aria-label={`${project.displayName} — ${project.category}. ${isSelected ? 'Press Enter to launch' : 'Focus to inspect'}`}
                        className="orbit-pod reticle-box group relative flex w-[168px] cursor-pointer flex-col overflow-hidden text-left hover:scale-[1.04] xl:w-[184px]"
                      >
                        {/* Miniature Bespoke CoverArt Banner */}
                        <div className="relative h-[50px] w-full overflow-hidden bg-chassis">
                          <CoverArt project={project} fill scrim="none" />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface/75 via-transparent to-transparent" />
                          <span
                            className="mono absolute top-1.5 left-1.5 rounded-[2px] px-1 py-[1px] text-[9px] font-semibold tracking-[0.12em] backdrop-blur-md"
                            style={{
                              color: isSelected ? 'var(--led-hot-ink)' : 'var(--ink-primary)',
                              background: 'var(--badge-bg)',
                              boxShadow: 'inset 0 0 0 1px var(--badge-border)',
                            }}
                          >
                            {num}
                          </span>
                          <span
                            className="led-dot absolute top-2 right-2"
                            style={{ ['--c' as string]: tok.dot }}
                            aria-hidden="true"
                          />
                        </div>

                        {/* Crisp Untruncated Cartridge Footer */}
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <Glyph name={project.glyph} hue={hue} size={22} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="whitespace-nowrap text-[11.5px] font-semibold leading-tight text-ink transition-colors group-hover:text-hot-ink xl:text-[12.5px]">
                              {project.displayName}
                            </div>
                            <div className="mono truncate text-[9px] tracking-[0.1em] text-mute uppercase">
                              {project.category}
                            </div>
                          </div>
                          {project.launchUrl && (
                            <a
                              href={project.launchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                foley.relay();
                              }}
                              aria-label={`Launch ${project.displayName}`}
                              title={`Launch ${project.displayName}`}
                              className="grid size-5 shrink-0 place-items-center rounded-[3px] text-mute transition hover:bg-hot hover:text-[#040503]"
                            >
                              <ArrowUpRight size={12} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-active={isSelected ? 'true' : undefined}
                        onPointerEnter={() => handlePodEnter(project)}
                        onMouseEnter={() => handlePodEnter(project)}
                        onMouseLeave={() => onHoverWorld?.(null)}
                        onFocus={() => {
                          onSelectWorld?.(project);
                          onActiveChange?.(project);
                        }}
                        onClick={() => handlePodClick(project, isSelected)}
                        aria-label={`${project.displayName} — ${project.category}`}
                        className="orbit-pod reticle-box group inline-flex w-auto max-w-[204px] cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-ink whitespace-nowrap hover:scale-[1.05]"
                      >
                        <Glyph name={project.glyph} hue={hue} size={20} className="shrink-0" />
                        <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink transition-colors group-hover:text-hot-ink">
                          {project.displayName}
                        </span>
                        <span
                          className="led-dot shrink-0"
                          style={{ ['--c' as string]: isSelected ? 'var(--led-hot)' : tok.dot }}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>

        {/* Bottom-Center Docked Sleek 3-Row Holographic Launch HUD */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 w-[min(720px,74vw)] -translate-x-1/2 xl:w-[min(760px,92vw)]">
          <AnimatePresence mode="wait">
            {exploded && activePlacement && (
              <SpotlightTile
                key={activePlacement.project.id}
                project={activePlacement.project}
                variant="hud"
                newCommits={newCount(activePlacement.project)}
                index={activePlacement.index}
                total={computed.length}
                className="pointer-events-auto"
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile / Tablet (<1024px): Explosive Staggered 2-Column Top-6 Constellation Grid */}
      <AnimatePresence>
        {exploded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="relative z-20 mx-auto w-full max-w-[640px] px-4 pt-24 pb-16 lg:hidden"
          >
            <div className="grid grid-cols-2 gap-2.5">
              {mobileSix.map((item, i) => {
                const { project, hue } = item;
                const tok = TIER_TOKENS[project.freshness.tier];
                const num = String(i + 1).padStart(2, '0');
                const fromX = i % 2 === 0 ? 48 : -48;
                const fromY = i < 2 ? 64 : i >= 4 ? -64 : 0;

                return (
                  <motion.div
                    key={project.id}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.16, x: fromX, y: fromY }}
                    animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.12, x: fromX, y: fromY }}
                    transition={reduced ? { duration: 0.14 } : { ...FLASH_SPRING, delay: i * 0.025 }}
                    className="orbit-pod reticle-box flex min-w-0 flex-col overflow-hidden"
                  >
                    <div className="relative h-[78px] w-full overflow-hidden bg-chassis">
                      <CoverArt project={project} fill scrim="subtle" />
                      <span
                        className="mono absolute top-1.5 left-1.5 rounded-[2px] px-1 py-[1px] text-[9px] font-semibold tracking-[0.12em] backdrop-blur-md"
                        style={{
                          color: 'var(--led-hot-ink)',
                          background: 'var(--badge-bg)',
                          boxShadow: 'inset 0 0 0 1px var(--badge-border)',
                        }}
                      >
                        {num}
                      </span>
                      <span
                        className="led-dot absolute top-2 right-2"
                        style={{ ['--c' as string]: tok.dot }}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-2 p-2.5">
                      <div className="flex items-start gap-2">
                        <Glyph name={project.glyph} hue={hue} size={24} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-bold leading-tight text-ink">
                            {project.displayName}
                          </div>
                          <div className="mono mt-0.5 truncate text-[9px] tracking-[0.1em] text-mute uppercase">
                            {project.category}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {project.launchUrl ? (
                          <a
                            href={project.launchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => foley.relay()}
                            className="btn btn-primary min-h-8! h-8 flex-1 gap-1 rounded-[var(--radius-xs)]! px-2 text-[10.5px] font-bold tracking-[0.06em] uppercase"
                          >
                            <span>Launch</span>
                            <ArrowUpRight size={12} aria-hidden="true" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              foley.latch();
                              setPeek(project.name, 'spot', 'brief');
                            }}
                            className="btn btn-primary min-h-8! h-8 flex-1 gap-1 rounded-[var(--radius-xs)]! px-2 text-[10.5px] font-bold tracking-[0.06em] uppercase"
                          >
                            <span>Brief</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            foley.latch();
                            setPeek(project.name, 'spot', project.launchUrl ? 'sandbox' : 'brief');
                          }}
                          aria-label={`Live Peek ${project.displayName}`}
                          className="btn min-h-8! h-8 w-8 shrink-0 justify-center rounded-[var(--radius-xs)]! bg-elevated/90! px-0"
                        >
                          <Eye size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
