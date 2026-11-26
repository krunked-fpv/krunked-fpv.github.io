import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Eye, GitBranch } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nonPurpleRgb } from '../../art/color';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useNow } from '../../hooks/useNow';
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

function accentCss(hue: number, isDaylight: boolean, alpha = 1): string {
  const [r, g, b] = nonPurpleRgb(isDaylight ? 0.46 : 0.78, isDaylight ? 0.165 : 0.185, hue);
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

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
 * Dynamically adapts horizontal margin to arenaWidth so long satellite pill names never clip at 1024px
 * and guarantees clean clearance above Top HUD, Bottom-Left Flash Bar, Bottom-Center Launch HUD,
 * and Bottom-Right Archive trigger across both 1440x900 and 1024x768.
 */
export function computeOrbitLayout(
  worlds: readonly Project[],
  orbitShift = 0,
  centerYRatio = ORBIT_CENTER_Y_DESKTOP,
  arenaHeight = 848,
  arenaWidth = 1440,
): { placements: OrbitPlacement[]; targets: OrbitNodeTarget[] } {
  const capped = worlds.slice(0, 17);
  const inner = capped.slice(0, INNER_COUNT);
  const outer = capped.slice(INNER_COUNT);

  const safeH = Math.max(600, arenaHeight);
  const safeW = Math.max(800, arenaWidth);

  // Horizontal outer margin guarantees >= 14px breathing room from left/right viewport edges even at 1024px
  const minOuterNx = Math.max(0.088, 102 / safeW);
  const maxOuterNx = 1 - minOuterNx;
  const effectiveOuterRx = Math.min(OUTER_RX, 0.5 - minOuterNx);

  // Vertical envelope guarantees >= 24px air gap above bottom HUD bay and clear of top corner bars
  const minOuterNy = Math.max(0.085, 62 / safeH);
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
    // Sweep 126deg clockwise through 180, 270, 0 to 414deg (54deg), keeping bottom hemisphere open for HUD bay
    const deg = total <= 1 ? 270 : 126 + (slot / (total - 1)) * 288;
    const rad = (deg * Math.PI) / 180;
    const nx = Math.max(minOuterNx, Math.min(maxOuterNx, ORBIT_CENTER_X + Math.cos(rad) * effectiveOuterRx));
    const ny = Math.max(minOuterNy, Math.min(maxOuterNy, centerYRatio + Math.sin(rad) * effectiveOuterRy));
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
  arenaWidth?: number;
  placements?: readonly OrbitPlacement[];
  activeSlug?: string | null;
  hoveredSlug?: string | null;
  onSelectWorld?: (project: Project) => void;
  onHoverWorld?: (project: Project | null) => void;
  onActiveChange?: (project: Project | null) => void;
}

/**
 * Exploding 17-World Radial Orbital Constellation + Holographic Launch HUD:
 * - Desktop (lg+): Synchronously measures arena bounds and blasts 6 machined Inner Flagship cartridges
 *   & up to 11 jewel-bezel Outer satellite pills outward from (50%, centerYRatio) with dynamic OKLCH
 *   ignition accents, Flash diagonal specular sheen sweeps, and the docked Holographic Launch HUD.
 * - Mobile (<1024px): Blasts out a staggered 2-column Top-6 constellation grid with generous clearance.
 */
export function SpotlightDeck({
  projects,
  exploded = true,
  orbitShift = 0,
  centerYRatio = ORBIT_CENTER_Y_DESKTOP,
  arenaHeight: arenaHeightProp,
  arenaWidth: arenaWidthProp,
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
  const theme = useDeck((s) => s.vault.prefs.theme);
  const foley = useFoley();
  const reduced = useReducedMotion();
  const now = useNow(30_000);
  const isDaylight = theme === 'daylight';

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [measuredSize, setMeasuredSize] = useState({
    width: arenaWidthProp ?? 1440,
    height: arenaHeightProp ?? 848,
  });

  useLayoutEffect(() => {
    if (arenaHeightProp !== undefined && arenaWidthProp !== undefined) return;
    const el = arenaRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMeasuredSize({ width: rect.width, height: rect.height });
      }
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [arenaHeightProp, arenaWidthProp]);

  const effectiveHeight = arenaHeightProp ?? measuredSize.height;
  const effectiveWidth = arenaWidthProp ?? measuredSize.width;
  const computed =
    placementsProp ??
    computeOrbitLayout(projects, orbitShift, centerYRatio, effectiveHeight, effectiveWidth).placements;

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
              const accentSolid = accentCss(hue, isDaylight, 1);
              const accentGlow = accentCss(hue, isDaylight, isDaylight ? 0.24 : 0.36);
              const accentSoft = accentCss(hue, isDaylight, isDaylight ? 0.12 : 0.16);

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
                  transition={reduced ? { duration: 0.14 } : { ...FLASH_SPRING, delay }}
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
                        style={
                          isSelected
                            ? {
                                boxShadow: isDaylight
                                  ? `inset 0 2px 0 ${accentSolid}, inset 0 0 0 1.5px #0A0A0B, 0 8px 24px -8px ${accentGlow}, 0 14px 32px -12px rgba(10,10,11,0.28)`
                                  : `inset 0 1.5px 0 ${accentSolid}, inset 0 0 0 1px ${accentCss(hue, false, 0.72)}, 0 0 28px -5px rgba(184,41,255,0.34), 0 0 22px -6px ${accentGlow}, 0 16px 34px -12px rgba(0,0,0,0.96)`,
                              }
                            : undefined
                        }
                        aria-label={`${project.displayName} — ${project.category}. ${isSelected ? 'Press Enter to launch' : 'Focus to inspect'}`}
                        className="orbit-pod reticle-box group relative flex w-[172px] cursor-pointer flex-col overflow-hidden text-left transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.035] xl:w-[192px]"
                      >
                        {/* Dynamic OKLCH Top Ignition Hairline */}
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[2px] transition-opacity duration-200"
                          style={{
                            opacity: isSelected ? 1 : 0.72,
                            background: `linear-gradient(90deg, transparent 3%, ${accentSolid} 28%, ${isDaylight ? '#FFFFFF' : '#F5F3EC'} 50%, ${accentSolid} 72%, transparent 97%)`,
                          }}
                        />

                        {/* Flash Diagonal Specular Sheen Sweep on Hover */}
                        {!reduced && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 z-[4] -translate-x-[135%] skew-x-[-24deg] bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-500 ease-out group-hover:translate-x-[135%]"
                          />
                        )}

                        {/* Miniature Bespoke CoverArt Banner */}
                        <div className="relative h-[52px] w-full overflow-hidden bg-chassis">
                          <CoverArt project={project} fill scrim="none" />
                          <div
                            className={`pointer-events-none absolute inset-0 ${
                              isDaylight
                                ? 'bg-gradient-to-t from-[#FFFEFA]/85 via-transparent to-black/10'
                                : 'bg-gradient-to-t from-[#08090D]/90 via-transparent to-black/30'
                            }`}
                          />
                          <span
                            className="mono absolute top-1.5 left-1.5 rounded-[2px] px-1 py-[1px] text-[9px] font-semibold tracking-[0.12em] backdrop-blur-md"
                            style={{
                              color: isSelected ? 'var(--led-hot-ink)' : 'var(--ink-primary)',
                              background: 'var(--badge-bg)',
                              boxShadow: `inset 0 0 0 1px ${isSelected ? accentCss(hue, isDaylight, 0.65) : 'var(--badge-border)'}`,
                            }}
                          >
                            {num}
                          </span>
                          <span
                            className="led-dot absolute top-2 right-2 ring-2 ring-chassis/70"
                            style={{ ['--c' as string]: tok.dot }}
                            aria-hidden="true"
                          />
                        </div>

                        {/* Subtle Chromatic Seam */}
                        <div
                          aria-hidden="true"
                          className="h-px w-full"
                          style={{
                            background: isSelected
                              ? `linear-gradient(90deg, transparent, ${accentSolid}, transparent)`
                              : 'var(--hairline)',
                          }}
                        />

                        {/* Crisp Untruncated Cartridge Footer */}
                        <div className="relative flex items-center gap-1.5 px-2 py-2 xl:gap-2 xl:px-2.5">
                          <span
                            className="grid size-[22px] shrink-0 place-items-center rounded-[4px] transition-colors duration-200 xl:size-[26px]"
                            style={{
                              backgroundColor: isSelected ? accentSoft : 'var(--surface-tint)',
                              boxShadow: `inset 0 0 0 1px ${isSelected ? accentCss(hue, isDaylight, 0.45) : 'var(--hairline)'}`,
                            }}
                          >
                            <Glyph name={project.glyph} hue={hue} size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11.5px] font-semibold leading-tight tracking-[-0.015em] text-ink transition-colors group-hover:text-hot-ink xl:text-[12.5px]">
                              {project.displayName}
                            </div>
                            <div className="mono mt-0.5 truncate text-[8.5px] tracking-[0.11em] text-mute uppercase">
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
                              className="grid size-[18px] shrink-0 place-items-center rounded-[3px] text-mute transition duration-150 hover:bg-hot hover:text-[#040503] group-hover:text-ink xl:size-5"
                            >
                              <ArrowUpRight size={11.5} aria-hidden="true" />
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
                        style={
                          isSelected
                            ? {
                                boxShadow: isDaylight
                                  ? `inset 0 1px 0 rgba(255,255,255,1), inset 0 0 0 1.5px #0A0A0B, 0 6px 20px -8px ${accentGlow}, 0 10px 24px -10px rgba(10,10,11,0.22)`
                                  : `inset 0 1px 0 rgba(245,243,236,0.24), inset 0 0 0 1px ${accentCss(hue, false, 0.72)}, 0 0 24px -5px rgba(184,41,255,0.32), 0 0 20px -6px ${accentGlow}, 0 12px 26px -10px rgba(0,0,0,0.96)`,
                              }
                            : undefined
                        }
                        aria-label={`${project.displayName} — ${project.category}`}
                        className="orbit-pod reticle-box group relative inline-flex w-auto max-w-[174px] cursor-pointer items-center gap-1.5 overflow-hidden py-1.5 pr-2.5 pl-2 text-left text-ink whitespace-nowrap transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.045] xl:max-w-[210px] xl:gap-2 xl:pr-3 xl:pl-2.5"
                      >
                        {/* Left Jewel Accent Edge Bar */}
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-1.5 left-0 w-[2.5px] rounded-r-full transition-opacity duration-200"
                          style={{
                            backgroundColor: accentSolid,
                            opacity: isSelected ? 1 : 0.65,
                            boxShadow: isSelected ? `0 0 8px ${accentGlow}` : 'none',
                          }}
                        />

                        {/* Flash Specular Sheen Sweep on Hover */}
                        {!reduced && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 z-[3] -translate-x-[140%] skew-x-[-24deg] bg-gradient-to-r from-transparent via-white/16 to-transparent transition-transform duration-400 ease-out group-hover:translate-x-[140%]"
                          />
                        )}

                        <Glyph name={project.glyph} hue={hue} size={18} className="shrink-0 xl:size-[20px]" />
                        <span className="truncate text-[11.5px] font-semibold tracking-[-0.012em] text-ink transition-colors group-hover:text-hot-ink xl:text-[12px]">
                          {project.displayName}
                        </span>
                        <span
                          className="led-dot shrink-0"
                          style={{ ['--c' as string]: isSelected ? accentSolid : tok.dot }}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>

        {/* Bottom-Center Docked Sleek 3-Row Holographic Launch HUD (Exact clearance for 1024px & 1440px) */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 w-[min(572px,56vw)] -translate-x-1/2 xl:w-[min(716px,54vw)] 2xl:w-[min(740px,52vw)]">
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
            className="relative z-20 mx-auto w-full max-w-[640px] px-4 pt-24 pb-20 lg:hidden"
          >
            <div className="grid grid-cols-2 gap-3">
              {mobileSix.map((item, i) => {
                const { project, hue } = item;
                const tok = TIER_TOKENS[project.freshness.tier];
                const num = String(i + 1).padStart(2, '0');
                const fromX = i % 2 === 0 ? 48 : -48;
                const fromY = i < 2 ? 64 : i >= 4 ? -64 : 0;
                const accentSolid = accentCss(hue, isDaylight, 1);
                const commit = project.latestCommit;
                const commitTs = Date.parse(commit?.date || project.lastActivityAt) || now;
                const ageLabel = formatDelta(now - commitTs).toUpperCase();
                const commitSha = commit?.sha ? commit.sha.slice(0, 7) : null;
                const commitMsg = commit?.message || 'latest push';

                return (
                  <motion.div
                    key={project.id}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.16, x: fromX, y: fromY }}
                    animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.12, x: fromX, y: fromY }}
                    transition={reduced ? { duration: 0.14 } : { ...FLASH_SPRING, delay: i * 0.025 }}
                    className="orbit-pod reticle-box relative flex min-w-0 flex-col overflow-hidden"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[2px]"
                      style={{
                        background: `linear-gradient(90deg, transparent 4%, ${accentSolid} 35%, ${accentSolid} 65%, transparent 96%)`,
                      }}
                    />

                    <div className="relative h-[82px] w-full overflow-hidden bg-chassis">
                      <CoverArt project={project} fill scrim="subtle" />
                      <div
                        className={`pointer-events-none absolute inset-0 ${
                          isDaylight
                            ? 'bg-gradient-to-t from-[#FFFEFA]/82 via-transparent to-black/10'
                            : 'bg-gradient-to-t from-[#08090D]/88 via-transparent to-black/25'
                        }`}
                      />
                      <span
                        className="mono absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-[2px] px-1.5 py-[1px] text-[9px] font-semibold tracking-[0.1em] backdrop-blur-md"
                        style={{
                          color: 'var(--led-hot-ink)',
                          background: 'var(--badge-bg)',
                          boxShadow: 'inset 0 0 0 1px var(--badge-border)',
                        }}
                      >
                        <span>{num}</span>
                        <span className="opacity-45" aria-hidden="true">
                          ·
                        </span>
                        <span style={{ color: tok.ink }}>{ageLabel}</span>
                      </span>
                      <span
                        className="led-dot absolute top-2.5 right-2.5 ring-2 ring-chassis/70"
                        style={{ ['--c' as string]: tok.dot }}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-2 p-2.5">
                      <div className="flex items-start gap-2">
                        <Glyph name={project.glyph} hue={hue} size={24} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold leading-tight tracking-[-0.015em] text-ink">
                            {project.displayName}
                          </div>
                          <div className="mono mt-0.5 truncate text-[9px] tracking-[0.11em] text-mute uppercase">
                            {project.category}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex min-w-0 items-center gap-1 rounded-[var(--radius-xs)] border border-hairline bg-inset/75 px-1.5 py-1 text-[10.5px]"
                        title={commitMsg}
                      >
                        <GitBranch size={10} className="shrink-0 text-mute" aria-hidden="true" />
                        {commitSha && (
                          <span className="mono shrink-0 text-[9.5px] font-semibold text-hot-ink">
                            {commitSha}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-dim">{commitMsg}</span>
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
