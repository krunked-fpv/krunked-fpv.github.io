import { motion } from 'framer-motion';
import { ArrowDown, Crosshair, Minimize2 } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { BRAND, GITHUB_USER, SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import { rankOrbitWorlds, useChronoPulse } from '../../store/selectors';
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

/**
 * Full-Viewport Interactive Event Horizon Black Hole Singularity Arena:
 * - Synchronously aligns HeroCanvas (WebGL2), BurstFxCanvas (Canvas 2D), idle Singularity Core,
 *   and 17-world orbital constellation to centerYRatio (0.435 desktop lg+, 0.47 mobile <1024px).
 * - Detonating clears the center completely so the glowing neon-purple Event Horizon stays pure
 *   and unobstructed inside the orbiting constellation.
 */
export function HeroBand({ projects, activeSpotlight, onActiveChange, children }: HeroBandProps) {
  const user = useDeck((s) => s.user);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const pulseDays = useChronoPulse();
  const foley = useFoley();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const centerYRatio = isDesktop ? ORBIT_CENTER_Y_DESKTOP : ORBIT_CENTER_Y_MOBILE;

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [arenaSize, setArenaSize] = useState({ width: 1440, height: 848 });

  useLayoutEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setArenaSize((prev) =>
          Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
            ? prev
            : { width: rect.width, height: rect.height },
        );
      }
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
    () => computeOrbitLayout(orbitWorlds, 0, centerYRatio, arenaSize.height, arenaSize.width),
    [orbitWorlds, centerYRatio, arenaSize.height, arenaSize.width],
  );

  const activeWorld = useMemo(() => {
    const key = hoveredSlug ?? selectedSlug;
    if (key) {
      const hit = orbitWorlds.find((p) => p.name === key);
      if (hit) return hit;
    }
    return orbitWorlds[0] ?? activeSpotlight ?? projects[0] ?? null;
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

        {/* Layer 2: Neon-Purple Supernova Detonation, Sparks & Live Curved Orbital Tethers */}
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
              className="mono group inline-flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.14em] text-ink transition hover:text-hot-ink"
            >
              {user?.avatar_url ? (
                <img
                  src={`${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}s=48`}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px] shrink-0 rounded-full object-cover ring-1 ring-hairline-strong transition group-hover:ring-hot/70"
                />
              ) : (
                <span className="size-[18px] shrink-0 rounded-full bg-tint shadow-[inset_0_0_0_1px_var(--hairline-strong)]" />
              )}
              <span className="truncate">@{profileLogin}</span>
              <span className="text-hot-ink opacity-85" aria-hidden="true">
                //
              </span>
              <span className="hidden text-dim transition group-hover:text-ink sm:inline">
                {isDaylight ? 'SOLAR ECLIPSE' : 'EVENT HORIZON'}
              </span>
            </a>
            <div className="mono flex flex-wrap items-center gap-x-2 text-[10px] tracking-[0.12em] text-mute uppercase">
              <span data-tabular>
                <b className="font-semibold text-ink">{liveCount}</b> PLAYABLE WORLDS
              </span>
              <span className="opacity-60" aria-hidden="true">
                ·
              </span>
              <span data-tabular>
                <b className="font-semibold text-ink">{commits30d}</b> COMMITS (30D)
              </span>
            </div>
          </div>

          {/* Top-Right Armed Status OR Clean Implode Control */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!exploded ? (
              <div
                className={`mono inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase backdrop-blur-xl ${
                  isDaylight
                    ? 'border-[#0A0A0B]/20 bg-[#FFFEFA]/88 text-[#3A3A3E] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_18px_-10px_rgba(10,10,11,0.18)]'
                    : 'border-[#B829FF]/28 bg-[#07080B]/82 text-[#ABA89E] shadow-[inset_0_1px_0_rgba(214,91,255,0.16),0_8px_24px_-10px_rgba(184,41,255,0.28)]'
                }`}
              >
                <span
                  className="beacon scale-[0.82]"
                  style={{ ['--c' as string]: 'var(--led-hot)' }}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">GRAVITY WELL //</span>
                <span className="text-hot-ink">ARMED</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={triggerImplode}
                className={`mono inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase backdrop-blur-xl transition active:scale-95 sm:px-3 ${
                  isDaylight
                    ? 'border-[#0A0A0B]/24 bg-[#FFFEFA]/92 text-[#0A0A0B] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_6px_18px_-10px_rgba(10,10,11,0.18)] hover:border-[#7A1ED6]/60 hover:text-[#7A1ED6]'
                    : 'border-[#B829FF]/40 bg-[#090B0E]/88 text-[#F5F3EC] shadow-[inset_0_1px_0_rgba(214,91,255,0.22),0_0_20px_-8px_rgba(184,41,255,0.42)] hover:border-[#D65BFF]/80 hover:text-[#D2FF28]'
                }`}
                title="Collapse all orbiting worlds back into the black hole"
              >
                <Minimize2 size={12} aria-hidden="true" />
                <span>Implode</span>
              </button>
            )}
          </div>
        </div>

        {/* Layer 4: Clean Idle Singularity Core (clears completely when exploded so the neon-purple black hole stays unobstructed) */}
        {!exploded && (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center"
            style={{
              left: `${ORBIT_CENTER_X * 100}%`,
              top: `${centerYRatio * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Outer Gravitational Proximity Halo */}
            <div
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') setHoverCore(true);
              }}
              onPointerLeave={() => setHoverCore(false)}
              className="pointer-events-auto relative flex size-[286px] items-center justify-center rounded-full sm:size-[324px]"
            >
              {/* Crisp Calm Neon-Purple Outer Ring Accent */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute size-[228px] rounded-full transition-transform duration-300 ease-out sm:size-[262px] ${
                  hoverCore ? 'scale-[0.96]' : 'scale-100'
                }`}
                style={{
                  border: isDaylight
                    ? '1px solid rgba(122, 30, 214, 0.34)'
                    : '1px solid rgba(191, 58, 255, 0.45)',
                  boxShadow: isDaylight
                    ? '0 0 26px -4px rgba(122, 30, 214, 0.2), inset 0 0 18px -6px rgba(255, 149, 0, 0.16)'
                    : '0 0 36px -4px rgba(191, 58, 255, 0.44), inset 0 0 22px -6px rgba(214, 91, 255, 0.22)',
                }}
              />

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
                aria-label={`Detonate the KRUNKED Singularity Core to reveal ${placements.length} orbiting worlds`}
                className="singularity-core group relative flex size-[208px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full px-5 text-center sm:size-[240px]"
              >
                {/* Machined Inner Rim Ring & Subtle Top Specular Sheen */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[5px] rounded-full"
                  style={{
                    border: isDaylight
                      ? '1px solid rgba(255, 228, 181, 0.16)'
                      : '1px solid rgba(214, 91, 255, 0.22)',
                  }}
                />
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-7 top-0 h-16 rounded-b-full bg-gradient-to-b ${
                    isDaylight
                      ? 'from-[#FFE4B5]/12 via-[#FF7A28]/8 to-transparent'
                      : 'from-[#D65BFF]/14 via-[#B829FF]/6 to-transparent'
                  }`}
                />

                <span
                  className={`mono relative z-[1] inline-flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.22em] uppercase ${
                    isDaylight ? 'text-[#FFB020]' : 'text-[#D2FF28]/95'
                  }`}
                >
                  <span
                    className={`inline-block size-[4px] rounded-full ${
                      isDaylight
                        ? 'bg-[#FFB020] shadow-[0_0_8px_#FF7A28]'
                        : 'bg-[#D65BFF] shadow-[0_0_8px_#B829FF]'
                    }`}
                  />
                  SINGULARITY // 01
                </span>

                <h1
                  className={`masthead-display relative z-[1] mt-1.5 text-[32px] font-bold leading-none tracking-[0.14em] text-[#F5F3EC] sm:text-[40px] ${
                    isDaylight
                      ? 'drop-shadow-[0_2px_14px_rgba(255,140,32,0.22)]'
                      : 'drop-shadow-[0_2px_18px_rgba(184,41,255,0.34)]'
                  }`}
                >
                  {BRAND.primary}
                </h1>

                <span className="serif relative z-[1] mt-1.5 text-[16px] text-[#CFCBC0] sm:text-[18px]">
                  {liveCount} playable worlds
                </span>

                <span
                  className={`mono relative z-[1] mt-3.5 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[9.5px] font-bold tracking-[0.14em] uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition duration-200 ${
                    isDaylight
                      ? 'border-[#FF9500]/75 bg-[#FF7A28]/18 text-[#FFB84D] group-hover:border-[#FFB020] group-hover:bg-[#FF7A28] group-hover:text-[#050506] group-hover:shadow-[0_0_20px_-2px_rgba(255,122,40,0.68)]'
                      : 'border-[#D2FF28]/65 bg-[#D2FF28]/14 text-[#D2FF28] group-hover:border-[#D2FF28] group-hover:bg-[#D2FF28] group-hover:text-[#040503] group-hover:shadow-[0_0_22px_-2px_rgba(184,41,255,0.55)]'
                  }`}
                >
                  <Crosshair size={11} aria-hidden="true" />
                  <span className="hidden lg:inline">Hover To Detonate</span>
                  <span className="lg:hidden">Tap To Detonate</span>
                </span>
              </motion.button>
            </div>
          </div>
        )}

        {/* Layer 5: Exploding 17-World Orbital Constellation + Holographic Launch HUD */}
        {children ?? (
          <SpotlightDeck
            projects={orbitWorlds}
            allProjects={projects}
            exploded={exploded}
            orbitShift={0}
            centerYRatio={centerYRatio}
            arenaHeight={arenaSize.height}
            arenaWidth={arenaSize.width}
            placements={placements}
            activeSlug={selectedSlug}
            hoveredSlug={hoveredSlug}
            onSelectWorld={handleSelectWorld}
            onHoverWorld={handleHoverWorld}
            onActiveChange={onActiveChange}
          />
        )}

        {/* Layer 6: Clean Minimal Bottom Hint & Archive Scroll Trigger */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 p-4 sm:p-5 xl:p-6 lg:pb-4">
          {!exploded && (
            <div className="mono hidden text-[10px] tracking-[0.14em] text-mute uppercase lg:block">
              HOVER CORE TO DETONATE · CLICK TO EXPLORE
            </div>
          )}

          <a
            href="#worlds"
            onClick={() => foley.tick()}
            className={`mono pointer-events-auto group ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase backdrop-blur-xl transition sm:px-3 ${
              isDaylight
                ? 'border-[#0A0A0B]/20 bg-[#FFFEFA]/92 text-[#0A0A0B] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_10px_28px_-12px_rgba(10,10,11,0.2)] hover:border-[#7A1ED6]/60 hover:text-[#7A1ED6]'
                : 'border-[#F5F3EC]/16 bg-[#06070A]/86 text-[#F5F3EC] shadow-[inset_0_1px_0_rgba(245,243,236,0.12),0_14px_34px_-14px_rgba(0,0,0,0.96)] hover:border-[#B829FF]/70 hover:text-[#D2FF28]'
            }`}
          >
            <span>
              <span className={exploded ? 'hidden xl:inline' : 'hidden sm:inline'}>
                All {liveCount} Worlds{' '}
              </span>
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
