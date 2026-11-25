import { motion } from 'framer-motion';
import { ArrowDown, Compass, Crosshair, Layers, Minimize2, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { BRAND, GITHUB_USER, SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useMediaQuery, useReducedMotion } from '../../hooks/useMediaQuery';
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
import { FlashMovieStage, type FlashStageTelemetry } from './FlashMovieStage';
import { TelemetryRibbon } from './HeatStrip';
import { HeroCanvas } from './HeroCanvas';

export interface HeroBandProps {
  projects: Project[];
  activeSpotlight?: Project | null;
  onActiveChange?: (project: Project | null) => void;
  /** Optional custom slot; when omitted, HeroBand renders the self-contained 17-world Singularity Arena. */
  children?: ReactNode;
}

const KEYFRAME_TICKS = [0, 21, 56, 100] as const;

const VERNIER_TICKS_36 = Array.from({ length: 36 }, (_, i) => {
  const deg = i * 10;
  const rad = ((deg - 90) * Math.PI) / 180;
  const isCardinal = i % 9 === 0;
  const isMajor = i % 3 === 0;
  const rOuter = 124;
  const rInner = isCardinal ? 112 : isMajor ? 117 : 120;
  return {
    key: i,
    isCardinal,
    isMajor,
    x1: Number((130 + Math.cos(rad) * rInner).toFixed(2)),
    y1: Number((130 + Math.sin(rad) * rInner).toFixed(2)),
    x2: Number((130 + Math.cos(rad) * rOuter).toFixed(2)),
    y2: Number((130 + Math.sin(rad) * rOuter).toFixed(2)),
  };
});

const PULSE_TICKS_24 = Array.from({ length: 24 }, (_, i) => {
  const deg = i * 15;
  const rad = ((deg - 90) * Math.PI) / 180;
  const isCardinal = i % 6 === 0;
  const rOuter = 61;
  const rInner = isCardinal ? 54 : 57.5;
  return {
    key: i,
    isCardinal,
    x1: Number((64 + Math.cos(rad) * rInner).toFixed(2)),
    y1: Number((64 + Math.sin(rad) * rInner).toFixed(2)),
    x2: Number((64 + Math.cos(rad) * rOuter).toFixed(2)),
    y2: Number((64 + Math.sin(rad) * rOuter).toFixed(2)),
  };
});

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

function sceneAccentColor(scene: FlashStageTelemetry['scene'], isDaylight: boolean): string {
  switch (scene) {
    case 'PRELOADER':
      return isDaylight ? '#006B8F' : '#00D4FF';
    case 'IGNITION':
      return isDaylight ? '#D94E00' : '#FF9500';
    case 'COLLAPSE':
      return isDaylight ? '#C23914' : '#FF5226';
    case 'ORBIT':
      return isDaylight ? '#386200' : '#D2FF28';
    default:
      return isDaylight ? '#0A0A0B' : '#F5F3EC';
  }
}

/**
 * Full-Viewport Interactive Event Horizon Black Hole Singularity Arena:
 * - Synchronously locks HeroCanvas (WebGL2), BurstFxCanvas (Canvas 2D), FlashMovieStage (24fps Vector),
 *   precision vernier Singularity Core, and 17-world orbital constellation to centerYRatio.
 * - Features bottom-left Macromedia Flash 24fps timeline bar with REPLAY, ONION, and GUIDES hardware toggles.
 */
export function HeroBand({ projects, activeSpotlight, onActiveChange, children }: HeroBandProps) {
  const user = useDeck((s) => s.user);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const pulseDays = useChronoPulse();
  const foley = useFoley();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const reduced = useReducedMotion();

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
  const [replaySeq, setReplaySeq] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [orbitShift, setOrbitShift] = useState(0);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<FlashStageTelemetry>({
    frame: 1,
    totalFrames: 144,
    fps: 24,
    scene: 'PRELOADER',
    playing: true,
  });
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
    () => computeOrbitLayout(orbitWorlds, orbitShift, centerYRatio, arenaSize.height, arenaSize.width),
    [orbitWorlds, orbitShift, centerYRatio, arenaSize.height, arenaSize.width],
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

  const handleTelemetry = useCallback((next: FlashStageTelemetry) => {
    setTelemetry(next);
  }, []);

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

  const triggerReplay = useCallback(() => {
    foley.relay();
    setPaused(false);
    setReplaySeq((s) => s + 1);
  }, [foley]);

  const toggleOnionSkin = useCallback(() => {
    foley.latch();
    setOnionSkin((v) => !v);
  }, [foley]);

  const toggleGuides = useCallback(() => {
    foley.latch();
    setShowGuides((v) => !v);
  }, [foley]);

  const togglePaused = useCallback(() => {
    foley.tick();
    setPaused((v) => !v);
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

  const totalFrames = Math.max(1, telemetry.totalFrames || 144);
  const clampedFrame = Math.max(1, Math.min(totalFrames, Math.round(telemetry.frame || 1)));
  const frameLabel = `${String(clampedFrame).padStart(3, '0')}/${String(totalFrames).padStart(3, '0')}`;
  const progressPct = Math.max(0, Math.min(100, (clampedFrame / totalFrames) * 100));
  const isStagePlaying = telemetry.playing && !paused;
  const sceneColor = sceneAccentColor(telemetry.scene, isDaylight);
  const vernierAccent = isDaylight ? '#D94E00' : '#D2FF28';
  const vernierInk = isDaylight ? 'rgba(10,10,11,0.42)' : 'rgba(245,243,236,0.34)';

  const flashBarShellClass = isDaylight
    ? 'border-[#0A0A0B]/20 bg-[#FFFEFA]/92 text-[#0A0A0B] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_10px_28px_-12px_rgba(10,10,11,0.22)]'
    : 'border-[#F5F3EC]/15 bg-[#06070A]/86 text-[#F5F3EC] shadow-[inset_0_1px_0_rgba(245,243,236,0.12),0_14px_34px_-14px_rgba(0,0,0,0.96)]';

  const microBtnIdleClass = isDaylight
    ? 'border-transparent text-[#3A3A3E] hover:border-[#0A0A0B]/18 hover:bg-[#0A0A0B]/6 hover:text-[#0A0A0B]'
    : 'border-transparent text-[#ABA89E] hover:border-[#F5F3EC]/18 hover:bg-[#F5F3EC]/8 hover:text-[#F5F3EC]';

  const onionActiveClass = isDaylight
    ? 'border-[#006B8F]/55 bg-[#006B8F]/12 text-[#005775] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'
    : 'border-[#00D4FF]/65 bg-[#00D4FF]/14 text-[#00D4FF] shadow-[inset_0_1px_0_rgba(0,212,255,0.28),0_0_12px_-3px_rgba(0,212,255,0.45)]';

  const guidesActiveClass = isDaylight
    ? 'border-[#D94E00]/60 bg-[#D94E00]/12 text-[#B83E00] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'
    : 'border-[#D2FF28]/65 bg-[#D2FF28]/14 text-[#D2FF28] shadow-[inset_0_1px_0_rgba(210,255,40,0.3),0_0_12px_-3px_rgba(210,255,40,0.4)]';

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

        {/* Layer 2: Kinetic Vector Detonation, Sparks & Curved Bezier Orbital Tethers */}
        <BurstFxCanvas
          exploded={exploded}
          burstSeq={burstSeq}
          implodeSeq={implodeSeq}
          onionSkin={onionSkin}
          showGuides={showGuides}
          accentHue={activeHue}
          theme={theme}
          nodes={enrichedTargets}
          hoveredId={hoveredSlug ?? selectedSlug}
          centerYRatio={centerYRatio}
          className="pointer-events-none absolute inset-0 z-[4]"
        />

        {/* Layer 2.5: Authentic 24fps Macromedia/Adobe Flash Vector Animation Stage */}
        <FlashMovieStage
          exploded={exploded}
          hoverCore={hoverCore}
          burstSeq={burstSeq}
          implodeSeq={implodeSeq}
          replaySeq={replaySeq}
          paused={paused}
          onionSkin={onionSkin}
          showGuides={showGuides}
          accentHue={activeHue}
          theme={theme}
          nodes={enrichedTargets}
          hoveredId={hoveredSlug ?? selectedSlug}
          centerYRatio={centerYRatio}
          onTelemetry={handleTelemetry}
          className="pointer-events-none absolute inset-0 z-[6]"
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

          {/* Top-Right Armed Status OR Active Pulse/Implode Cockpit Controls */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!exploded ? (
              <div
                className={`mono inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase backdrop-blur-xl ${
                  isDaylight
                    ? 'border-[#0A0A0B]/20 bg-[#FFFEFA]/88 text-[#3A3A3E] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_18px_-10px_rgba(10,10,11,0.18)]'
                    : 'border-[#F5F3EC]/14 bg-[#07080B]/82 text-[#ABA89E] shadow-[inset_0_1px_0_rgba(245,243,236,0.1),0_8px_22px_-10px_rgba(0,0,0,0.9)]'
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
              <>
                <button
                  type="button"
                  onClick={triggerPulseWave}
                  className={`mono inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase backdrop-blur-xl transition active:scale-95 sm:px-3 ${
                    isDaylight
                      ? 'border-[#D94E00]/55 bg-[#FFFEFA]/92 text-[#B83E00] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_6px_18px_-8px_rgba(217,78,0,0.22)] hover:border-[#D94E00] hover:bg-[#FFFFFF]'
                      : 'border-[#D2FF28]/55 bg-[#090B0E]/88 text-[#D2FF28] shadow-[inset_0_1px_0_rgba(210,255,40,0.28),0_0_20px_-8px_rgba(210,255,40,0.35)] hover:border-[#D2FF28]/85 hover:bg-[#111419]'
                  }`}
                  title="Fire Flash shockwave pulse and rotate orbital rings"
                >
                  <Zap size={12} aria-hidden="true" />
                  <span>Pulse</span>
                  <span className="hidden sm:inline">Wave</span>
                </button>
                <button
                  type="button"
                  onClick={triggerImplode}
                  className={`mono inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase backdrop-blur-xl transition active:scale-95 sm:px-3 ${
                    isDaylight
                      ? 'border-[#0A0A0B]/24 bg-[#FFFEFA]/92 text-[#0A0A0B] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_6px_18px_-10px_rgba(10,10,11,0.18)] hover:border-[#0A0A0B]/60'
                      : 'border-[#F5F3EC]/20 bg-[#090B0E]/88 text-[#F5F3EC] shadow-[inset_0_1px_0_rgba(245,243,236,0.12),0_10px_24px_-12px_rgba(0,0,0,0.9)] hover:border-[#D2FF28]/55 hover:text-[#D2FF28]'
                  }`}
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
          {!exploded ? (
            /* Outer Gravitational Proximity Halo + Precision Rotating SVG Vernier Ring */
            <div
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') setHoverCore(true);
              }}
              onPointerLeave={() => setHoverCore(false)}
              className="pointer-events-auto relative flex size-[290px] items-center justify-center rounded-full sm:size-[332px]"
            >
              {/* Rotating Precision Hairline Vernier & Astrolabe Bezel */}
              <svg
                viewBox="0 0 260 260"
                aria-hidden="true"
                className={`pointer-events-none absolute size-[254px] transition-transform duration-300 ease-out sm:size-[292px] ${
                  hoverCore ? 'scale-[0.955]' : 'scale-100'
                }`}
              >
                {/* Slow Clockwise Outer Micro-Tick Vernier Ring */}
                <g
                  className={reduced ? '' : 'origin-center animate-[spin_38s_linear_infinite]'}
                  style={{ transformOrigin: '130px 130px' }}
                >
                  <circle
                    cx="130"
                    cy="130"
                    r="124"
                    fill="none"
                    stroke={vernierInk}
                    strokeWidth="0.75"
                    strokeDasharray="2 6"
                  />
                  {VERNIER_TICKS_36.map((t) => (
                    <line
                      key={t.key}
                      x1={t.x1}
                      y1={t.y1}
                      x2={t.x2}
                      y2={t.y2}
                      stroke={t.isCardinal ? vernierAccent : vernierInk}
                      strokeWidth={t.isCardinal ? 1.5 : t.isMajor ? 1 : 0.7}
                      strokeOpacity={t.isCardinal ? 0.92 : t.isMajor ? 0.6 : 0.34}
                    />
                  ))}
                </g>

                {/* Counter-Rotating Inner Sweeping Calibration Arcs */}
                <g
                  className={reduced ? '' : 'origin-center animate-[spin_22s_linear_infinite_reverse]'}
                  style={{ transformOrigin: '130px 130px' }}
                >
                  <circle
                    cx="130"
                    cy="130"
                    r="114.5"
                    fill="none"
                    stroke={vernierAccent}
                    strokeWidth={hoverCore ? 1.5 : 1.05}
                    strokeOpacity={hoverCore ? 0.85 : 0.42}
                    strokeDasharray="44 136 22 158"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="130"
                    cy="130"
                    r="107.5"
                    fill="none"
                    stroke={vernierInk}
                    strokeWidth="0.65"
                    strokeOpacity={0.32}
                    strokeDasharray="16 28"
                  />
                </g>
              </svg>

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
                {/* Machined Inner Specular Rim Ring & Top Rim Sheen */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[5px] rounded-full border border-[#F5F3EC]/12"
                />
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-7 top-0 h-16 rounded-b-full bg-gradient-to-b ${
                    isDaylight
                      ? 'from-[#FFE4B5]/12 via-[#FF7A28]/8 to-transparent'
                      : 'from-[#F5F3EC]/10 via-[#D2FF28]/4 to-transparent'
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
                        : 'bg-[#D2FF28] shadow-[0_0_8px_#D2FF28]'
                    }`}
                  />
                  SINGULARITY // 01
                </span>

                <h1
                  className={`masthead-display relative z-[1] mt-1.5 text-[32px] font-bold leading-none tracking-[0.14em] text-[#F5F3EC] sm:text-[40px] ${
                    isDaylight
                      ? 'drop-shadow-[0_2px_14px_rgba(255,140,32,0.22)]'
                      : 'drop-shadow-[0_2px_14px_rgba(210,255,40,0.14)]'
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
                      : 'border-[#D2FF28]/65 bg-[#D2FF28]/14 text-[#D2FF28] group-hover:border-[#D2FF28] group-hover:bg-[#D2FF28] group-hover:text-[#040503] group-hover:shadow-[0_0_20px_-2px_rgba(210,255,40,0.65)]'
                  }`}
                >
                  <Crosshair size={11} aria-hidden="true" />
                  <span className="hidden lg:inline">Hover To Detonate</span>
                  <span className="lg:hidden">Tap To Detonate</span>
                </span>
              </motion.button>
            </div>
          ) : (
            /* Exploded Compact Shockwave Pulse Trigger with Tight Rotating Vernier Collar */
            <div className="pointer-events-none relative flex size-[128px] items-center justify-center">
              <svg
                viewBox="0 0 128 128"
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 size-full transition-transform duration-200 ${
                  hoverCore ? 'scale-105' : 'scale-100'
                }`}
              >
                <g
                  className={reduced ? '' : 'origin-center animate-[spin_18s_linear_infinite]'}
                  style={{ transformOrigin: '64px 64px' }}
                >
                  <circle
                    cx="64"
                    cy="64"
                    r="61"
                    fill="none"
                    stroke={vernierAccent}
                    strokeWidth="0.9"
                    strokeOpacity={hoverCore ? 0.85 : 0.45}
                    strokeDasharray="18 20 8 18"
                  />
                  {PULSE_TICKS_24.map((t) => (
                    <line
                      key={t.key}
                      x1={t.x1}
                      y1={t.y1}
                      x2={t.x2}
                      y2={t.y2}
                      stroke={t.isCardinal ? vernierAccent : vernierInk}
                      strokeWidth={t.isCardinal ? 1.4 : 0.75}
                      strokeOpacity={t.isCardinal ? 0.9 : 0.45}
                    />
                  ))}
                </g>
              </svg>

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
                className="singularity-core pointer-events-auto group relative flex size-[104px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full text-center"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[4px] rounded-full border border-[#F5F3EC]/12"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-4 top-0 h-8 rounded-b-full bg-gradient-to-b from-[#F5F3EC]/12 to-transparent"
                />
                <Zap
                  size={16}
                  className={`relative z-[1] transition-transform duration-200 group-hover:scale-115 ${
                    isDaylight ? 'text-[#FFB020]' : 'text-[#D2FF28]'
                  }`}
                  aria-hidden="true"
                />
                <span className="mono relative z-[1] mt-1 text-[9.5px] font-bold tracking-[0.18em] text-[#F5F3EC] uppercase">
                  PULSE
                </span>
                <span className="mono relative z-[1] text-[8.5px] tracking-[0.14em] text-[#CFCBC0]">
                  {placements.length} ORBIT
                </span>
              </motion.button>
            </div>
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

        {/* Layer 6: Bottom-Left Flash Stage Control & Timeline Strip + Bottom-Right Archive Trigger */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 p-4 sm:p-5 xl:p-6 lg:pb-4">
          {/* Razor-Sleek Macromedia Flash 24fps Stage Telemetry & Control Deck */}
          <div
            role="region"
            aria-label="Flash vector animation stage timeline and authoring controls"
            className={`pointer-events-auto mono relative flex overflow-hidden rounded-[var(--radius-sm)] border backdrop-blur-xl transition-all duration-200 ${flashBarShellClass} ${
              exploded
                ? 'h-8 items-center gap-1 px-1.5 lg:h-auto lg:w-[174px] lg:flex-col lg:items-stretch lg:gap-0 lg:px-0 xl:w-[248px]'
                : 'h-8 items-center gap-1.5 px-2'
            }`}
          >
            {/* Subtle Top Specular Edge */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
              style={{
                background: isDaylight
                  ? 'linear-gradient(90deg, transparent, rgba(217,78,0,0.45), transparent)'
                  : 'linear-gradient(90deg, transparent, rgba(210,255,40,0.45), transparent)',
              }}
            />

            {/* Row 1 (or Left Segment when single-row): Playhead LED + SWF 24FPS + Frame Counter + Scene + Progress Bar */}
            <div
              className={`flex min-w-0 items-center ${
                exploded
                  ? 'gap-1 lg:h-[26px] lg:justify-between lg:px-1.5 xl:gap-1.5 xl:px-2'
                  : 'gap-2'
              }`}
            >
              <button
                type="button"
                onClick={togglePaused}
                aria-pressed={paused}
                aria-label={paused ? 'Resume 24fps Flash animation' : 'Pause 24fps Flash animation'}
                title={paused ? 'Resume 24fps Flash playhead' : 'Pause 24fps Flash playhead'}
                className={`inline-flex shrink-0 cursor-pointer items-center font-semibold uppercase transition hover:opacity-85 ${
                  exploded
                    ? 'gap-1 text-[8.5px] tracking-[0.06em] xl:text-[9px] xl:tracking-[0.09em]'
                    : 'gap-1.5 text-[9.5px] tracking-[0.11em]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block size-[6px] shrink-0 rounded-full transition-opacity ${
                    isStagePlaying && !reduced ? 'animate-pulse' : ''
                  }`}
                  style={{
                    backgroundColor: isStagePlaying
                      ? isDaylight
                        ? '#D94E00'
                        : '#D2FF28'
                      : isDaylight
                        ? '#8C4E00'
                        : '#FF9500',
                    boxShadow: isStagePlaying
                      ? isDaylight
                        ? '0 0 6px rgba(217,78,0,0.55)'
                        : '0 0 8px rgba(210,255,40,0.85)'
                      : 'none',
                  }}
                />
                {paused ? (
                  <Play size={9} className="shrink-0 opacity-75" aria-hidden="true" />
                ) : (
                  !exploded && (
                    <Pause size={9} className="hidden shrink-0 opacity-60 xl:inline" aria-hidden="true" />
                  )
                )}
                {exploded ? (
                  <>
                    <span className="hidden xl:inline">SWF {telemetry.fps}F</span>
                    <span className="inline xl:hidden">{telemetry.fps}F</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">
                      SWF <span className="opacity-45">//</span> {telemetry.fps}FPS
                    </span>
                    <span className="inline sm:hidden">{telemetry.fps}F</span>
                  </>
                )}
              </button>

              {/* Live Frame Readout */}
              <span
                data-tabular
                className={`shrink-0 font-medium ${
                  isDaylight ? 'text-[#3A3A3E]' : 'text-[#ABA89E]'
                } ${
                  exploded
                    ? 'hidden text-[8.5px] tracking-[0.03em] lg:inline xl:text-[9px] xl:tracking-[0.05em]'
                    : 'hidden text-[9.5px] tracking-[0.06em] md:inline'
                }`}
              >
                {!exploded && <span>FR </span>}
                <span className={isDaylight ? 'font-semibold text-[#0A0A0B]' : 'font-semibold text-[#F5F3EC]'}>
                  {frameLabel}
                </span>
              </span>

              {/* Active Scene Tag */}
              <span
                className={`shrink-0 rounded-[2px] px-1 py-[1px] font-bold uppercase ${
                  exploded
                    ? 'hidden text-[8px] tracking-[0.06em] lg:inline-block xl:tracking-[0.09em]'
                    : 'hidden text-[8.5px] tracking-[0.11em] sm:inline-block'
                }`}
                style={{
                  color: sceneColor,
                  backgroundColor: isDaylight ? 'rgba(10,10,11,0.055)' : 'rgba(245,243,236,0.06)',
                  boxShadow: `inset 0 0 0 1px ${isDaylight ? 'rgba(10,10,11,0.12)' : 'rgba(245,243,236,0.12)'}`,
                }}
              >
                {telemetry.scene}
              </span>

              {/* Mini Hairline Playhead Progress Bar with Pure-CSS Keyframe Diamond Ticks (Single-Row Desktop Idle) */}
              {!exploded && (
                <div
                  aria-hidden="true"
                  className="relative hidden h-3 w-14 shrink-0 items-center lg:flex xl:w-16"
                >
                  <div
                    className={`h-[1.5px] w-full ${
                      isDaylight ? 'bg-[#0A0A0B]/16' : 'bg-[#F5F3EC]/16'
                    }`}
                  />
                  <div
                    className="absolute left-0 h-[1.5px]"
                    style={{
                      width: `${progressPct.toFixed(1)}%`,
                      backgroundColor: vernierAccent,
                    }}
                  />
                  {KEYFRAME_TICKS.map((kf) => {
                    const reached = progressPct >= kf;
                    return (
                      <span
                        key={kf}
                        className="absolute top-1/2 size-[4.5px] -translate-x-1/2 -translate-y-1/2 rotate-45 border transition-colors"
                        style={{
                          left: `${kf}%`,
                          borderColor: reached
                            ? vernierAccent
                            : isDaylight
                              ? 'rgba(10,10,11,0.34)'
                              : 'rgba(245,243,236,0.34)',
                          backgroundColor: reached
                            ? vernierAccent
                            : isDaylight
                              ? '#FFFEFA'
                              : '#06070A',
                        }}
                      />
                    );
                  })}
                  <span
                    className="absolute top-[1px] bottom-[1px] w-[1.5px] -translate-x-1/2"
                    style={{
                      left: `${progressPct.toFixed(1)}%`,
                      backgroundColor: isDaylight ? '#0A0A0B' : '#FFFFFF',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Embedded Seam Timeline Progress Bar with CSS Keyframe Diamonds (Desktop Exploded 2-Row Mode) */}
            {exploded && (
              <div
                aria-hidden="true"
                className="relative hidden h-[7px] w-full items-center px-2 lg:flex"
              >
                <div
                  className={`relative h-[1.5px] w-full ${
                    isDaylight ? 'bg-[#0A0A0B]/14' : 'bg-[#F5F3EC]/14'
                  }`}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${progressPct.toFixed(1)}%`,
                      backgroundColor: vernierAccent,
                    }}
                  />
                  {KEYFRAME_TICKS.map((kf) => {
                    const reached = progressPct >= kf;
                    return (
                      <span
                        key={kf}
                        className="absolute top-1/2 size-[4px] -translate-x-1/2 -translate-y-1/2 rotate-45 border"
                        style={{
                          left: `${kf}%`,
                          borderColor: reached
                            ? vernierAccent
                            : isDaylight
                              ? 'rgba(10,10,11,0.34)'
                              : 'rgba(245,243,236,0.34)',
                          backgroundColor: reached
                            ? vernierAccent
                            : isDaylight
                              ? '#FFFEFA'
                              : '#06070A',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hairline Vertical Divider (Single-Row Mode) */}
            <span
              aria-hidden="true"
              className={`h-3.5 w-px shrink-0 ${
                isDaylight ? 'bg-[#0A0A0B]/15' : 'bg-[#F5F3EC]/14'
              } ${exploded ? 'lg:hidden' : ''}`}
            />

            {/* Tactile Hardware Micro-Buttons: REPLAY | ONION | GUIDES */}
            <div
              className={`flex shrink-0 items-center gap-0.5 ${
                exploded ? 'lg:grid lg:h-[26px] lg:grid-cols-3 lg:gap-0.5 lg:px-[3px] lg:pb-0.5 xl:gap-1 xl:px-1' : ''
              }`}
            >
              <button
                type="button"
                onClick={triggerReplay}
                aria-label="Replay Flash vector preloader and iris mask wipe intro"
                title="Replay 24fps Flash preloader and iris wipe"
                className={`inline-flex h-[22px] cursor-pointer items-center justify-center gap-0.5 rounded-[2px] border px-1.5 text-[9px] font-bold tracking-[0.09em] uppercase transition active:scale-95 lg:px-0.5 lg:text-[8.5px] lg:tracking-[0.04em] xl:gap-1 xl:px-1.5 xl:text-[9px] xl:tracking-[0.09em] ${microBtnIdleClass}`}
              >
                <RotateCcw size={9.5} className="shrink-0" aria-hidden="true" />
                <span className={exploded ? 'hidden xl:inline' : 'hidden sm:inline'}>REPLAY</span>
                {exploded && <span className="hidden lg:inline xl:hidden">RPL</span>}
              </button>

              <button
                type="button"
                onClick={toggleOnionSkin}
                aria-pressed={onionSkin}
                aria-label={onionSkin ? 'Disable Flash onion-skin ghost frames' : 'Enable Flash onion-skin ghost frames'}
                title="Toggle authentic Macromedia Flash multi-frame onion-skin ghosting"
                className={`inline-flex h-[22px] cursor-pointer items-center justify-center gap-0.5 rounded-[2px] border px-1.5 text-[9px] font-bold tracking-[0.09em] uppercase transition active:scale-95 lg:px-0.5 lg:text-[8.5px] lg:tracking-[0.04em] xl:gap-1 xl:px-1.5 xl:text-[9px] xl:tracking-[0.09em] ${
                  onionSkin ? onionActiveClass : microBtnIdleClass
                }`}
              >
                <Layers size={9.5} className="shrink-0" aria-hidden="true" />
                <span>ONION</span>
              </button>

              <button
                type="button"
                onClick={toggleGuides}
                aria-pressed={showGuides}
                aria-label={showGuides ? 'Hide Flash Bezier motion guides' : 'Show Flash Bezier motion guides'}
                title="Toggle Flash Bezier motion guide splines, control handles, and registration marks"
                className={`inline-flex h-[22px] cursor-pointer items-center justify-center gap-0.5 rounded-[2px] border px-1.5 text-[9px] font-bold tracking-[0.09em] uppercase transition active:scale-95 lg:px-0.5 lg:text-[8.5px] lg:tracking-[0.04em] xl:gap-1 xl:px-1.5 xl:text-[9px] xl:tracking-[0.09em] ${
                  showGuides ? guidesActiveClass : microBtnIdleClass
                }`}
              >
                <Compass size={9.5} className="shrink-0" aria-hidden="true" />
                <span className={exploded ? 'hidden xl:inline' : 'inline'}>GUIDES</span>
                {exploded && <span className="inline xl:hidden">GUIDE</span>}
              </button>
            </div>
          </div>

          {/* Bottom-Right Archive Scroll Trigger */}
          <a
            href="#worlds"
            onClick={() => foley.tick()}
            className={`mono pointer-events-auto group ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase backdrop-blur-xl transition sm:px-3 ${
              isDaylight
                ? 'border-[#0A0A0B]/20 bg-[#FFFEFA]/92 text-[#0A0A0B] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_10px_28px_-12px_rgba(10,10,11,0.2)] hover:border-[#D94E00]/65 hover:text-[#B83E00]'
                : 'border-[#F5F3EC]/16 bg-[#06070A]/86 text-[#F5F3EC] shadow-[inset_0_1px_0_rgba(245,243,236,0.12),0_14px_34px_-14px_rgba(0,0,0,0.96)] hover:border-[#D2FF28]/60 hover:text-[#D2FF28]'
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
