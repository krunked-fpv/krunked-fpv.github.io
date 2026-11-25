import { motion } from 'framer-motion';
import { ArrowDown, Crosshair, Minimize2, Zap } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { BRAND, GITHUB_USER, SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import { useChronoPulse } from '../../store/selectors';
import type { Project } from '../../types/project';
import {
  computeOrbitLayout,
  ORBIT_CENTER_X,
  ORBIT_CENTER_Y_DESKTOP,
  ORBIT_CENTER_Y_MOBILE,
  SpotlightDeck,
} from '../spotlight/SpotlightDeck';
import { BurstFxCanvas } from './BurstFxCanvas';
import { TelemetryRibbon } from './HeatStrip';
import { HeroCanvas } from './HeroCanvas';

export interface HeroBandProps {
  projects: Project[];
  activeSpotlight?: Project | null;
  onActiveChange?: (project: Project | null) => void;
  /** Optional custom slot; when omitted, HeroBand renders the self-contained 17-world Singularity Arena. */
  children?: ReactNode;
}

function rankOrbitWorlds(projects: Project[]): Project[] {
  const visible = projects.filter((p) => !p.hidden);
  const live = visible.filter((p) => p.kind === 'live');
  const pool = live.length > 0 ? live : visible;
  return [...pool].sort((a, b) => {
    const fDiff = Number(b.featured) - Number(a.featured);
    if (fDiff !== 0) return fDiff;
    const actDiff = (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0);
    if (actDiff !== 0) return actDiff;
    return b.velocityScore - a.velocityScore;
  });
}

/**
 * Full-Viewport Interactive Event Horizon Black Hole Singularity Arena:
 * - Synchronously aligns HeroCanvas, BurstFxCanvas, Singularity Core, and 17-world orbital constellation
 *   to centerYRatio (0.435 on desktop lg+, 0.47 on mobile <1024px) for guaranteed HUD clearance.
 * - Instant Flash supernova detonation on pointer hover / tap / keyboard with snappy 140ms core swap
 *   and bouncy high-energy orbital blast.
 */
export function HeroBand({ projects, activeSpotlight, onActiveChange, children }: HeroBandProps) {
  const user = useDeck((s) => s.user);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const pulseDays = useChronoPulse();
  const foley = useFoley();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const centerYRatio = isDesktop ? ORBIT_CENTER_Y_DESKTOP : ORBIT_CENTER_Y_MOBILE;

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [arenaHeight, setArenaHeight] = useState(848);

  useLayoutEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setArenaHeight(h);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [exploded, setExploded] = useState(false);
  const [hoverCore, setHoverCore] = useState(false);
  const [burstSeq, setBurstSeq] = useState(0);
  const [implodeSeq, setImplodeSeq] = useState(0);
  const [orbitShift, setOrbitShift] = useState(0);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const lastImplodeAtRef = useRef(0);

  const orbitWorlds = useMemo(() => rankOrbitWorlds(projects), [projects]);
  const liveCount = useMemo(() => projects.filter((p) => !p.hidden && p.kind === 'live').length, [projects]);

  const pulse30d = useMemo(
    () => pulseDays.slice(-30).reduce((sum, d) => sum + d.count, 0),
    [pulseDays],
  );
  const projectCommits30d = useMemo(
    () => projects.reduce((sum, p) => sum + (p.commits30dTotal || 0), 0),
    [projects],
  );
  const commits30d = pulse30d > 0 ? pulse30d : projectCommits30d;

  const { placements, targets } = useMemo(
    () => computeOrbitLayout(orbitWorlds, orbitShift, centerYRatio, arenaHeight),
    [orbitWorlds, orbitShift, centerYRatio, arenaHeight],
  );

  const activeWorld = useMemo(() => {
    const key = hoveredSlug ?? selectedSlug;
    if (key) {
      const hit = orbitWorlds.find((p) => p.name === key);
      if (hit) return hit;
    }
    return activeSpotlight ?? orbitWorlds[0] ?? projects[0] ?? null;
  }, [hoveredSlug, selectedSlug, orbitWorlds, activeSpotlight, projects]);

  const activeHue = activeWorld ? hueOf(activeWorld) : 84;
  const isDaylight = theme === 'daylight';
  const profileUrl = user?.html_url ?? `https://github.com/${GITHUB_USER}`;
  const profileLogin = user?.login ?? GITHUB_USER;

  const enrichedTargets = useMemo(
    () =>
      targets.map((t) => ({
        ...t,
        active: t.id === (hoveredSlug ?? selectedSlug),
      })),
    [targets, hoveredSlug, selectedSlug],
  );

  useEffect(() => {
    if (exploded && !selectedSlug && orbitWorlds[0]) {
      setSelectedSlug(orbitWorlds[0].name);
      onActiveChange?.(orbitWorlds[0]);
    }
  }, [exploded, selectedSlug, orbitWorlds, onActiveChange]);

  const triggerDetonate = useCallback(() => {
    if (exploded) return;
    if (Date.now() - lastImplodeAtRef.current < 420) return;
    foley.relay();
    setExploded(true);
    setHoverCore(false);
    setBurstSeq((s) => s + 1);
    const first = orbitWorlds[0] ?? null;
    if (first) {
      setSelectedSlug(first.name);
      onActiveChange?.(first);
    }
  }, [exploded, foley, orbitWorlds, onActiveChange]);

  const triggerPulseWave = useCallback(() => {
    foley.latch();
    setBurstSeq((s) => s + 1);
    setOrbitShift((n) => n + 1);
  }, [foley]);

  const triggerImplode = useCallback(() => {
    foley.click();
    lastImplodeAtRef.current = Date.now();
    setExploded(false);
    setHoverCore(false);
    setHoveredSlug(null);
    setImplodeSeq((s) => s + 1);
  }, [foley]);

  const handleCorePointerEnter = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    setHoverCore(true);
    if (!exploded) {
      triggerDetonate();
    }
  };

  const handleCoreClick = () => {
    if (!exploded) {
      triggerDetonate();
    } else {
      triggerPulseWave();
    }
  };

  const handleSelectWorld = useCallback(
    (p: Project) => {
      setSelectedSlug(p.name);
      onActiveChange?.(p);
    },
    [onActiveChange],
  );

  const handleHoverWorld = useCallback(
    (p: Project | null) => {
      setHoveredSlug(p ? p.name : null);
      if (p) {
        setSelectedSlug(p.name);
        onActiveChange?.(p);
      }
    },
    [onActiveChange],
  );

  return (
    <section
      id="stage"
      aria-label="Event Horizon interactive singularity stage"
      className="relative w-full overflow-hidden border-b border-hairline bg-chassis"
    >
      {/* Full-Viewport Cosmic Singularity Arena */}
      <div
        ref={arenaRef}
        className="relative flex min-h-[620px] w-full flex-col justify-between overflow-hidden lg:block lg:h-[calc(100vh-52px)] lg:min-h-[680px] lg:max-h-[940px]"
      >
        {/* Layer 1: 60fps WebGL2 Gargantua Black Hole / Solar Eclipse Shader */}
        <HeroCanvas
          accentHue={activeHue}
          theme={theme}
          exploded={exploded}
          burstSeq={burstSeq}
          hoverCore={hoverCore}
          centerYRatio={centerYRatio}
          className="pointer-events-none absolute inset-0 z-0"
        />

        {/* Layer 2: Golden-Age Flash Vector Supernova, Sparks & Live Orbital Tethers */}
        <BurstFxCanvas
          exploded={exploded}
          burstSeq={burstSeq}
          implodeSeq={implodeSeq}
          accentHue={activeHue}
          theme={theme}
          nodes={enrichedTargets}
          hoveredId={hoveredSlug ?? selectedSlug}
          centerYRatio={centerYRatio}
          className="pointer-events-none absolute inset-0 z-[5]"
        />

        {/* Layer 3: Frameless Floating Top HUD Corners */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4 sm:p-6">
          {/* Top-Left Telemetry Identity */}
          <div className="pointer-events-auto flex min-w-0 flex-col gap-1">
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.14em] text-ink transition hover:text-hot-ink"
            >
              {user?.avatar_url ? (
                <img
                  src={`${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}s=48`}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px] shrink-0 rounded-full object-cover ring-1 ring-hairline-strong"
                />
              ) : (
                <span className="size-[18px] shrink-0 rounded-full bg-tint shadow-[inset_0_0_0_1px_var(--hairline-strong)]" />
              )}
              <span className="truncate">@{profileLogin}</span>
              <span className="text-hot-ink" aria-hidden="true">
                //
              </span>
              <span className="hidden text-dim sm:inline">
                {isDaylight ? 'SOLAR ECLIPSE' : 'EVENT HORIZON'}
              </span>
            </a>
            <div className="mono flex flex-wrap items-center gap-x-2 text-[10px] tracking-[0.12em] text-mute uppercase">
              <span>
                <b className="font-semibold text-ink">{liveCount}</b> PLAYABLE WORLDS
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <b className="font-semibold text-ink">{commits30d}</b> COMMITS (30D)
              </span>
            </div>
          </div>

          {/* Top-Right Armed Status OR Active Pulse/Implode Cockpit Controls */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!exploded ? (
              <div className="mono inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-hairline bg-surface/75 px-2.5 text-[10px] font-semibold tracking-[0.14em] text-dim uppercase backdrop-blur-md">
                <span
                  className="beacon scale-[0.82]"
                  style={{ ['--c' as string]: 'var(--led-hot)' }}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">GRAVITY WELL //</span>
                <span className="text-hot-ink">ARMED</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={triggerPulseWave}
                  className="mono inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-hot/60 bg-surface/85 px-2.5 text-[10px] font-semibold tracking-[0.12em] text-hot-ink uppercase backdrop-blur-md transition hover:bg-elevated active:scale-95 sm:px-3"
                  title="Fire Flash shockwave pulse and rotate orbital rings"
                >
                  <Zap size={12} aria-hidden="true" />
                  <span>Pulse</span>
                  <span className="hidden sm:inline">Wave</span>
                </button>
                <button
                  type="button"
                  onClick={triggerImplode}
                  className="mono inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-hairline-strong bg-surface/85 px-2.5 text-[10px] font-semibold tracking-[0.12em] text-ink uppercase backdrop-blur-md transition hover:border-hot/60 hover:text-hot-ink active:scale-95 sm:px-3"
                  title="Collapse all orbiting worlds back into the black hole"
                >
                  <Minimize2 size={12} aria-hidden="true" />
                  <span>Implode</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Layer 4: Dead-Center Interactive Singularity Core locked pixel-for-pixel to (50%, centerYRatio) */}
        <div
          className={`pointer-events-none absolute z-20 flex items-center justify-center ${
            exploded ? 'hidden lg:flex' : 'flex'
          }`}
          style={{
            left: `${ORBIT_CENTER_X * 100}%`,
            top: `${centerYRatio * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Outer Gravitational Proximity Halo (coils energy as pointer approaches core) */}
          {!exploded ? (
            <div
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') setHoverCore(true);
              }}
              onPointerLeave={() => setHoverCore(false)}
              className="pointer-events-auto flex size-[290px] items-center justify-center rounded-full sm:size-[330px]"
            >
              <motion.button
                type="button"
                onPointerEnter={handleCorePointerEnter}
                onMouseEnter={() => {
                  if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)')?.matches) {
                    setHoverCore(true);
                    triggerDetonate();
                  }
                }}
                onClick={handleCoreClick}
                whileTap={{ scale: 0.94 }}
                transition={SPRING}
                aria-label="Detonate the KRUNKED Singularity Core to reveal all 17 playable worlds"
                className="singularity-core group relative flex size-[208px] cursor-pointer flex-col items-center justify-center rounded-full px-5 text-center sm:size-[240px]"
              >
                <span className="mono text-[9.5px] font-semibold tracking-[0.22em] text-[#D2FF28]/90 uppercase">
                  SINGULARITY // 01
                </span>

                <h1 className="masthead-display mt-1.5 text-[32px] font-bold leading-none tracking-[0.14em] text-[#F5F3EC] sm:text-[40px]">
                  {BRAND.primary}
                </h1>

                <span className="serif mt-1.5 text-[16px] text-[#ABA89E] sm:text-[18px]">
                  {liveCount} playable worlds
                </span>

                <span className="mono mt-3.5 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#D2FF28]/60 bg-[#D2FF28]/14 px-2.5 py-1 text-[9.5px] font-bold tracking-[0.14em] text-[#D2FF28] uppercase transition group-hover:bg-[#D2FF28] group-hover:text-[#040503]">
                  <Crosshair size={11} aria-hidden="true" />
                  <span className="hidden lg:inline">Hover To Detonate</span>
                  <span className="lg:hidden">Tap To Detonate</span>
                </span>
              </motion.button>
            </div>
          ) : (
            /* Snappy non-blocking core swap directly into the glowing Shockwave Pulse Trigger */
            <motion.button
              key="core-pulse"
              type="button"
              initial={{ scale: 1.32, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              onClick={handleCoreClick}
              onMouseEnter={() => setHoverCore(true)}
              onMouseLeave={() => setHoverCore(false)}
              aria-label="Fire shockwave pulse and rotate orbiting worlds"
              title="Click for shockwave pulse + orbital advance"
              className="singularity-core pointer-events-auto group flex size-[104px] cursor-pointer flex-col items-center justify-center rounded-full text-center"
            >
              <Zap
                size={16}
                className="text-[#D2FF28] transition-transform duration-200 group-hover:scale-110"
                aria-hidden="true"
              />
              <span className="mono mt-1 text-[9.5px] font-bold tracking-[0.18em] text-[#F5F3EC] uppercase">
                PULSE
              </span>
              <span className="mono text-[8.5px] tracking-[0.14em] text-[#ABA89E]">
                {liveCount} ORBIT
              </span>
            </motion.button>
          )}
        </div>

        {/* Layer 5: Exploding 17-World Orbital Constellation + Holographic Launch HUD */}
        {children ?? (
          <SpotlightDeck
            projects={orbitWorlds}
            allProjects={projects}
            exploded={exploded}
            orbitShift={orbitShift}
            centerYRatio={centerYRatio}
            arenaHeight={arenaHeight}
            placements={placements}
            activeSlug={selectedSlug}
            hoveredSlug={hoveredSlug}
            onSelectWorld={handleSelectWorld}
            onHoverWorld={handleHoverWorld}
            onActiveChange={onActiveChange}
          />
        )}

        {/* Layer 6: Frameless Bottom Corner Hints & Archive Scroll Trigger */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-4 sm:p-6">
          {!exploded && (
            <div className="mono hidden text-[10px] tracking-[0.14em] text-mute uppercase lg:block">
              HOVER CORE TO DETONATE SUPERNOVA · OR CLICK TO LAUNCH
            </div>
          )}

          <a
            href="#worlds"
            onClick={() => foley.tick()}
            className="mono pointer-events-auto group ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-hairline bg-surface/80 px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink uppercase backdrop-blur-md transition hover:border-hot/60 hover:text-hot-ink"
          >
            <span>
              <span className={exploded ? 'lg:hidden xl:inline' : ''}>All {liveCount} Worlds </span>
              Archive
            </span>
            <ArrowDown
              size={12}
              className="text-hot-ink transition-transform duration-200 group-hover:translate-y-0.5"
              aria-hidden="true"
            />
          </a>
        </div>
      </div>

      {/* Full-Width Hardware Telemetry & Collapsible Live Dispatch Ribbon */}
      <TelemetryRibbon projects={projects} />
    </section>
  );
}
