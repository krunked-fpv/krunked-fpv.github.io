import { useEffect, useRef } from 'react';
import {
  buildOrbitalBezierGuide,
  clamp,
  drawCalligraphicPlasmaWhip,
  drawCollapseVortexClip,
  drawDetonationSakugaClip,
  drawFlashAstrolabeClip,
  drawInterceptorProbeClip,
  drawMotionGuidesOverlay,
  drawPreloaderIntroClip,
  FLASH_FPS,
  FLASH_PRELOADER_FRAMES,
  FLASH_TOTAL_FRAMES,
  makeFlashPalette,
  sampleProbePose,
  stepFlashFrame,
} from '../../art/flashMovieClips';
import { remapHue } from '../../art/color';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import type { ArtTheme } from '../../types/project';
import type { OrbitNodeTarget } from './BurstFxCanvas';

export interface FlashStageTelemetry {
  frame: number;
  totalFrames: number;
  fps: number;
  scene: 'PRELOADER' | 'APPROACH' | 'IGNITION' | 'ORBIT' | 'COLLAPSE';
  playing: boolean;
}

export interface FlashMovieStageProps {
  exploded: boolean;
  hoverCore: boolean;
  burstSeq: number;
  implodeSeq: number;
  replaySeq: number;
  paused?: boolean;
  onionSkin?: boolean;
  showGuides?: boolean;
  accentHue: number;
  theme: ArtTheme;
  nodes: readonly OrbitNodeTarget[];
  hoveredId: string | null;
  centerYRatio: number;
  onTelemetry?: (t: FlashStageTelemetry) => void;
  className?: string;
}

const TAU = Math.PI * 2;
const INTRO_DURATION_SEC = FLASH_PRELOADER_FRAMES / FLASH_FPS;
const BOOST_DURATION_SEC = 1.25;
const COLLAPSE_DURATION_SEC = 0.74;

/**
 * Authentic 24fps Macromedia / Adobe Flash Vector MovieClip Stage layered seamlessly over the
 * WebGL2 Black Hole Event Horizon:
 * - MovieClip A: Depth-sorted 3D-projected FPV Orbital Interceptor Probe with cel shading & 12fps flames
 * - MovieClip B: Tapered calligraphic cel-shaded accretion plasma whips
 * - MovieClip C: Fast non-blocking 30-frame Flash preloader & diagonal vector mask-wipe intro
 * - MovieClip D: 24fps Sakuga 2-frame cel-ink detonation impact frame & swirling vortex collapse
 * - MovieClip E: Shape-tweened Flash astrolabe, multi-frame onion-skinning & Bezier motion guides
 */
export function FlashMovieStage({
  exploded,
  hoverCore,
  burstSeq,
  implodeSeq,
  replaySeq,
  paused = false,
  onionSkin = false,
  showGuides = false,
  accentHue,
  theme,
  nodes,
  hoveredId,
  centerYRatio,
  onTelemetry,
  className = '',
}: FlashMovieStageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '240px' });
  const reduced = useReducedMotion();

  const onTelemetryRef = useRef(onTelemetry);
  onTelemetryRef.current = onTelemetry;

  const stateRef = useRef({
    exploded,
    hoverCore,
    paused,
    onionSkin,
    showGuides,
    accentHue: remapHue(accentHue),
    theme,
    nodes,
    hoveredId,
    centerYRatio,
    reduced,
    inView,
    // Smooth interpolation channels
    explodedMix: exploded ? 1 : 0,
    hoverMix: hoverCore ? 1 : 0,
    // Logical MovieClip timeline clocks
    stageTime: 0,
    probePhase: 0.14,
    introAge: reduced ? INTRO_DURATION_SEC + 1 : 0,
    burstAge: 0,
    implodeAge: 0,
  });

  const prevBurstRef = useRef(burstSeq);
  const prevImplodeRef = useRef(implodeSeq);
  const prevReplayRef = useRef(replaySeq);
  const renderNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const st = stateRef.current;
    st.exploded = exploded;
    st.hoverCore = hoverCore;
    st.paused = paused;
    st.onionSkin = onionSkin;
    st.showGuides = showGuides;
    st.accentHue = remapHue(accentHue);
    st.theme = theme;
    st.nodes = nodes;
    st.hoveredId = hoveredId;
    st.centerYRatio = centerYRatio;
    st.reduced = reduced;
    st.inView = inView;

    if (reduced) {
      st.introAge = INTRO_DURATION_SEC + 1;
      st.burstAge = 0;
      st.implodeAge = 0;
    } else {
      if (burstSeq !== prevBurstRef.current) {
        st.burstAge = 0.001;
        st.implodeAge = 0;
        // Skip any remaining intro cleanly if user immediately detonates
        st.introAge = INTRO_DURATION_SEC + 1;
      }
      if (implodeSeq !== prevImplodeRef.current) {
        st.implodeAge = 0.001;
        st.burstAge = 0;
      }
      if (replaySeq !== prevReplayRef.current) {
        st.introAge = 0;
        st.stageTime = 0;
      }
    }

    prevBurstRef.current = burstSeq;
    prevImplodeRef.current = implodeSeq;
    prevReplayRef.current = replaySeq;

    // Immediately redraw when static/paused or toggles flip so ONION/GUIDES respond on the exact click
    if (reduced || paused) {
      renderNowRef.current?.();
    }
  }, [
    exploded,
    hoverCore,
    burstSeq,
    implodeSeq,
    replaySeq,
    paused,
    onionSkin,
    showGuides,
    accentHue,
    theme,
    nodes,
    hoveredId,
    centerYRatio,
    reduced,
    inView,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssW = 1;
    let cssH = 1;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      cssW = Math.round(rect.width);
      cssH = Math.round(rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.max(1, Math.round(cssW * dpr));
      const ph = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    };
    syncSize();

    const computeScene = (st: typeof stateRef.current): FlashStageTelemetry['scene'] => {
      if (!st.reduced && st.introAge < INTRO_DURATION_SEC) return 'PRELOADER';
      if (st.implodeAge > 0 && st.implodeAge < COLLAPSE_DURATION_SEC) return 'COLLAPSE';
      if (st.burstAge > 0 && st.burstAge < BOOST_DURATION_SEC) return 'IGNITION';
      return st.exploded ? 'ORBIT' : 'APPROACH';
    };

    let lastTelemetryAt = -1;
    let lastScene: FlashStageTelemetry['scene'] | null = null;
    let lastPlaying: boolean | null = null;

    const emitTelemetry = (now: number, force = false) => {
      const cb = onTelemetryRef.current;
      if (!cb) return;
      const st = stateRef.current;
      const scene = computeScene(st);
      const playing = !st.paused && !st.reduced && st.inView && document.visibilityState === 'visible';
      if (!force && now - lastTelemetryAt < 84 && scene === lastScene && playing === lastPlaying) return;

      lastTelemetryAt = now;
      lastScene = scene;
      lastPlaying = playing;

      const frame =
        scene === 'PRELOADER'
          ? clamp(Math.floor(st.introAge * FLASH_FPS) + 1, 1, FLASH_PRELOADER_FRAMES)
          : stepFlashFrame(st.stageTime, FLASH_FPS, FLASH_TOTAL_FRAMES).frameInLoop;

      cb({
        frame,
        totalFrames: FLASH_TOTAL_FRAMES,
        fps: FLASH_FPS,
        scene,
        playing,
      });
    };

    /** Applies an even-odd inverse circular clip mask so back-pass vectors genuinely duck behind the black hole. */
    const withBehindHorizonClip = (cx: number, cy: number, rClip: number, drawFn: () => void) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cssW, cssH);
      ctx.arc(cx, cy, rClip, 0, TAU);
      ctx.clip('evenodd');
      drawFn();
      ctx.restore();
    };

    const drawStage = () => {
      const st = stateRef.current;
      if (cssW <= 1 || cssH <= 1) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW * 0.5;
      const cy = cssH * st.centerYRatio;
      const minDim = Math.max(320, Math.min(cssW, cssH));
      const palette = makeFlashPalette(st.theme, st.accentHue);

      const explodedMix = st.reduced ? (st.exploded ? 1 : 0) : st.explodedMix;
      const hoverMix = st.reduced ? (st.hoverCore ? 1 : 0) : st.hoverMix;
      const rHorizon = minDim * (0.154 - explodedMix * 0.04 - hoverMix * 0.012 * (1 - explodedMix * 0.5));

      const boostNorm =
        !st.reduced && st.burstAge > 0 && st.burstAge < BOOST_DURATION_SEC
          ? st.burstAge / BOOST_DURATION_SEC
          : 0;
      const boostPulse = boostNorm > 0 ? Math.sin(boostNorm * Math.PI) : 0;

      const clock = stepFlashFrame(st.reduced ? 1.85 : st.stageTime, FLASH_FPS, FLASH_TOTAL_FRAMES);
      const loopNorm = (st.reduced ? 0.28 : (st.stageTime * FLASH_FPS) / FLASH_TOTAL_FRAMES) % 1;

      const guide = buildOrbitalBezierGuide(cx, cy, rHorizon, explodedMix, hoverMix, boostPulse);

      // 1. MovieClip E1: Shape-tweened Flash Astrolabe framing the event horizon
      drawFlashAstrolabeClip(
        ctx,
        cssW,
        cssH,
        cx,
        cy,
        rHorizon,
        loopNorm,
        hoverMix,
        explodedMix,
        palette,
        st.onionSkin,
      );

      // 2. MovieClip B (Lensed Arch Pass): Cel-shaded accretion plasma whips curving BEHIND the horizon
      const whipPhase = st.reduced ? 0.35 : clock.quantizedTime * (0.68 + hoverMix * 0.35 + boostPulse * 0.9);
      withBehindHorizonClip(cx, cy, rHorizon * 1.01, () => {
        drawCalligraphicPlasmaWhip(ctx, {
          cx,
          cy,
          rx: rHorizon * (2.06 + boostPulse * 0.24),
          ry: rHorizon * 0.72,
          tilt: -0.17,
          startAngle: Math.PI * 1.04 + (whipPhase % TAU),
          arcSpan: 1.06,
          maxWidth: 6.4,
          fillColor: palette.amber,
          highlightColor: palette.specular,
          inkColor: palette.ink,
          alpha: palette.isLight ? 0.68 : 0.72,
        });

        drawCalligraphicPlasmaWhip(ctx, {
          cx,
          cy,
          rx: rHorizon * (1.42 + boostPulse * 0.16),
          ry: rHorizon * 1.24,
          tilt: -0.14,
          startAngle: Math.PI * 1.15 - ((whipPhase * 0.78) % TAU),
          arcSpan: 0.92,
          maxWidth: 5.0,
          fillColor: palette.secondary,
          highlightColor: palette.specular,
          inkColor: palette.ink,
          alpha: palette.isLight ? 0.56 : 0.62,
        });
      });

      // 3. MovieClip A: FPV Orbital Interceptor Probe + Onion-Skin Ghost Stack (depth-sorted!)
      const activeProbePhase = st.reduced ? 0.19 : st.probePhase;
      const mainPose = sampleProbePose(guide, activeProbePhase, hoverMix, boostPulse, minDim);

      const renderProbeWithDepth = (
        pose: ReturnType<typeof sampleProbePose>,
        mode: 'solid' | 'onion-past' | 'onion-future' | 'smear',
        frameForClip: number,
        alpha: number,
      ) => {
        if (pose.inFront) {
          drawInterceptorProbeClip(ctx, pose, palette, frameForClip, mode, alpha);
        } else {
          // Physically occlude behind the event horizon silhouette!
          withBehindHorizonClip(cx, cy, rHorizon * 1.015, () => {
            drawInterceptorProbeClip(ctx, pose, palette, frameForClip, mode, alpha * 0.88);
          });
        }
      };

      const onionStep = 0.036 * (1 + boostPulse * 0.55);
      const smearStep = (2 / FLASH_TOTAL_FRAMES) * (1 + boostPulse * 0.85);
      if (st.onionSkin) {
        // Classic Macromedia Flash onion-skinning: 4 wide-spaced cyan past frames + distinct leading frame
        const pastAlphas = [0.54, 0.39, 0.26, 0.16] as const;
        for (let k = pastAlphas.length; k >= 1; k--) {
          const pastPose = sampleProbePose(
            guide,
            activeProbePhase - onionStep * k,
            hoverMix,
            boostPulse,
            minDim,
          );
          renderProbeWithDepth(pastPose, 'onion-past', Math.max(0, clock.frameIndex - k * 5), pastAlphas[k - 1]!);
        }
        const futurePose = sampleProbePose(
          guide,
          activeProbePhase + onionStep * 1.15,
          hoverMix,
          boostPulse,
          minDim,
        );
        renderProbeWithDepth(futurePose, 'onion-future', clock.frameIndex + 5, 0.44);
      } else if (boostPulse > 0.08 && !st.reduced) {
        // Subtle 2-ghost speed smear during high-G detonation boost even with ONION off
        for (let k = 2; k >= 1; k--) {
          const smearPose = sampleProbePose(
            guide,
            activeProbePhase - smearStep * 0.7 * k,
            hoverMix,
            boostPulse,
            minDim,
          );
          renderProbeWithDepth(smearPose, 'smear', Math.max(0, clock.frameIndex - k), 0.24 / k);
        }
      }

      // Main solid cel-shaded FPV Interceptor Probe
      renderProbeWithDepth(mainPose, 'solid', clock.frameIndex, 1);

      // 4. MovieClip B (Foreground Pass): Smooth equatorial calligraphic plasma slash sweeping across front limb
      const fgCycle = st.reduced ? 0.48 : (whipPhase * 0.26) % 1;
      const drawForegroundWhip = (cycleOffset: number, alphaScale: number, onionCol?: string) => {
        const u = ((fgCycle + cycleOffset) % 1 + 1) % 1;
        const env = Math.sin(u * Math.PI);
        if (env < 0.05) return;
        const arcSpan = 0.88;
        const startA = 0.06 + u * (Math.PI - arcSpan - 0.12);
        drawCalligraphicPlasmaWhip(
          ctx,
          {
            cx,
            cy,
            rx: rHorizon * (2.14 + boostPulse * 0.26),
            ry: rHorizon * 1.12,
            tilt: -0.19,
            startAngle: startA,
            arcSpan,
            maxWidth: (7.2 + hoverMix * 1.6 + boostPulse * 2.2) * (0.65 + 0.35 * env),
            fillColor: palette.primary,
            highlightColor: palette.specular,
            inkColor: palette.ink,
            alpha: env * alphaScale,
          },
          onionCol,
        );
      };

      if (st.onionSkin) {
        drawForegroundWhip(-0.14, 0.34, palette.onionPast);
        drawForegroundWhip(-0.07, 0.54, palette.onionPast);
        drawForegroundWhip(0.07, 0.44, palette.onionFuture);
      }
      drawForegroundWhip(0, palette.isLight ? 0.82 : 0.88);

      // 5. MovieClip D: 24fps Sakuga Detonation & Collapse Sequences
      if (!st.reduced && st.burstAge > 0) {
        drawDetonationSakugaClip(ctx, cx, cy, rHorizon, minDim, st.burstAge, palette);
      }
      if (!st.reduced && st.implodeAge > 0) {
        drawCollapseVortexClip(ctx, cx, cy, rHorizon, minDim, st.implodeAge, palette);
      }

      // 6. MovieClip E2: Interactive Macromedia Flash Authoring Guides & Registration Crosshairs
      if (st.showGuides) {
        let activeNodePx: { x: number; y: number } | null = null;
        if (st.exploded && st.nodes.length > 0) {
          const hit = st.nodes.find((n) => (st.hoveredId ? n.id === st.hoveredId : Boolean(n.active)));
          if (hit) {
            activeNodePx = { x: hit.nx * cssW, y: hit.ny * cssH };
          }
        }
        drawMotionGuidesOverlay(ctx, guide, mainPose, palette, activeNodePx);
      }

      // 7. MovieClip C: Vector Preloader & Diagonal Iris Mask-Wipe Intro (Frames 1..30)
      if (!st.reduced && st.introAge < INTRO_DURATION_SEC) {
        const introFrame = clamp(Math.floor(st.introAge * FLASH_FPS) + 1, 1, FLASH_PRELOADER_FRAMES);
        drawPreloaderIntroClip(ctx, cssW, cssH, cx, cy, rHorizon, introFrame, palette);
      }
    };

    renderNowRef.current = () => {
      syncSize();
      drawStage();
      emitTelemetry(typeof performance !== 'undefined' ? performance.now() : Date.now(), true);
    };

    // Draw initial frame immediately (important for reduced-motion & first paint)
    drawStage();
    emitTelemetry(typeof performance !== 'undefined' ? performance.now() : Date.now(), true);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        syncSize();
        drawStage();
      });
      ro.observe(wrap);
    }

    let raf = 0;
    let lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const st = stateRef.current;

      if (document.visibilityState !== 'visible' || !st.inView || st.reduced || st.paused) {
        lastNow = now;
        emitTelemetry(now);
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      st.stageTime += dt;

      if (st.introAge < INTRO_DURATION_SEC) {
        st.introAge += dt;
      }
      if (st.burstAge > 0) {
        st.burstAge += dt;
        if (st.burstAge > BOOST_DURATION_SEC) st.burstAge = 0;
      }
      if (st.implodeAge > 0) {
        st.implodeAge += dt;
        if (st.implodeAge > COLLAPSE_DURATION_SEC) st.implodeAge = 0;
      }

      // Smooth transitions for exploded / hover coiling
      st.explodedMix += ((st.exploded ? 1 : 0) - st.explodedMix) * (1 - Math.exp(-dt * 6.4));
      st.hoverMix += ((st.hoverCore ? 1 : 0) - st.hoverMix) * (1 - Math.exp(-dt * 9.5));

      // Advance probe along orbital Motion Guide (1 full seamless loop every 6.0s, surging 2.4x during boost!)
      const boostFactor =
        st.burstAge > 0 && st.burstAge < BOOST_DURATION_SEC
          ? 1 + 1.45 * Math.sin((st.burstAge / BOOST_DURATION_SEC) * Math.PI)
          : 1;
      const hoverFactor = 1 + st.hoverMix * 0.32;
      st.probePhase = (st.probePhase + (dt / (FLASH_TOTAL_FRAMES / FLASH_FPS)) * boostFactor * hoverFactor) % 1;

      drawStage();
      emitTelemetry(now);
    };

    const onVisChange = () => {
      lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
      emitTelemetry(lastNow, true);
    };
    document.addEventListener('visibilitychange', onVisChange);

    if (typeof requestAnimationFrame === 'function') {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      renderNowRef.current = null;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisChange);
      ro?.disconnect();
    };
  }, []);

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        inViewRef.current = el;
      }}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
    </div>
  );
}
