import { useEffect, useRef } from 'react';
import { nonPurpleRgb, remapHue } from '../../art/color';
import {
  drawRegistrationMark,
  easeBackOut,
  easeExpoOut,
  evalQuadBezier,
  type Vec2,
} from '../../art/flashMovieClips';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme } from '../../types/project';

export interface OrbitNodeTarget {
  id: string;
  /** Normalized 0..1 coordinates inside the arena container */
  nx: number;
  ny: number;
  hue: number;
  active?: boolean;
  ring: 'inner' | 'outer';
}

export interface BurstFxCanvasProps {
  exploded: boolean;
  /** Increment to trigger a full golden-age Flash vector explosion (starburst spikes, speed lines, shockwaves, sparks) */
  burstSeq: number;
  /** Increment to trigger a dramatic vortex implosion pulling sparks spiraling into the black hole */
  implodeSeq?: number;
  accentHue?: number;
  theme?: ArtTheme;
  nodes?: readonly OrbitNodeTarget[];
  hoveredId?: string | null;
  /** Normalized vertical center ratio from top edge (0..1, default 0.47; desktop lg+ 0.435) */
  centerYRatio?: number;
  /** Optional Macromedia Flash multi-frame onion-skin ghost echo on active tether & lock reticle */
  onionSkin?: boolean;
  /** Optional Flash authoring Bezier tangent handles & control nodes on active orbital tether */
  showGuides?: boolean;
  className?: string;
}

interface BurstSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  curl: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'streak' | 'diamond';
}

interface StarburstSpike {
  angle: number;
  speed: number;
  length: number;
  baseWidth: number;
  life: number;
  maxLife: number;
  color: string;
  speedLine: boolean;
}

interface ShockWave {
  age: number;
  duration: number;
  maxR: number;
  kind: 'primary' | 'secondary' | 'segmented' | 'implode';
  color: string;
  rotSpeed: number;
  startAngle: number;
}

interface VortexSpark {
  angle: number;
  radius: number;
  radialSpeed: number;
  angSpeed: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface AmbientMote {
  angle: number;
  /** Radius in multiples of event-horizon core radius (tightly bound 1.06..2.05) */
  rMult: number;
  speed: number;
  size: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Daylight Eclipse Ink & Solar Ember high-contrast palette (zero washed-out lime on ivory). */
const DAYLIGHT_PALETTE = ['#0A0A0B', '#D94E00', '#B45309', '#006B8F'] as const;

function nonPurpleCss(isLight: boolean, rawHue: number, a = 1): string {
  const L = isLight ? 0.42 : 0.78;
  const C = isLight ? 0.165 : 0.185;
  const [r, g, b] = nonPurpleRgb(L, C, remapHue(rawHue));
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(clamp(a, 0, 1).toFixed(4))})`;
}

/** Computes a graceful curved Flash Bezier Motion-Guide tether from photon ring to orbital world. */
function buildCurvedTether(
  cx: number,
  cy: number,
  coreEdge: number,
  tx: number,
  ty: number,
  ring: 'inner' | 'outer',
): { p0: Vec2; p1: Vec2; p2: Vec2 } | null {
  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= coreEdge + 8) return null;

  const ux = dx / dist;
  const uy = dy / dist;
  const sx = cx + ux * coreEdge;
  const sy = cy + uy * coreEdge;

  const spanX = tx - sx;
  const spanY = ty - sy;
  const span = Math.hypot(spanX, spanY) || 1;
  // Perpendicular normal for subtle opposing orbital curvature (inner clockwise, outer counter-clockwise)
  const nx = -spanY / span;
  const ny = spanX / span;
  const bendDir = ring === 'inner' ? 1 : -0.82;
  const bend = Math.min(54, span * 0.17) * bendDir;

  return {
    p0: { x: sx, y: sy },
    p1: {
      x: (sx + tx) * 0.5 + nx * bend,
      y: (sy + ty) * 0.5 + ny * bend,
    },
    p2: { x: tx, y: ty },
  };
}

/** Draws a crisp procedural Flash chevron arrowhead oriented along `angle`. */
function drawEnergyChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
  lineWidth: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(-size * 0.9, -size * 0.65);
  ctx.lineTo(size * 0.55, 0);
  ctx.lineTo(-size * 0.9, size * 0.65);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the upgraded Flash shape-tweening lock-on targeting reticle:
 * - Phase 1 (0..0.11s): Contracting precision circle with rotating degree ticks
 * - Phase 2 (0.11..0.22s): Morphing sharp vector diamond flare
 * - Phase 3 (0.22s+): Snapped 4-corner aerospace bracket with inward leader ticks & midpoint pips
 */
function drawShapeTweenLockReticle(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  ring: 'inner' | 'outer',
  lockAge: number,
  timeSec: number,
  isLight: boolean,
  primaryColor: string,
  secondaryColor: string,
  ghostMode = false,
): void {
  const baseHw = ring === 'inner' ? 93 : 69;
  const baseHh = ring === 'inner' ? 54 : 24;
  const arm = ring === 'inner' ? 12 : 8.5;

  ctx.save();
  ctx.translate(tx, ty);

  if (lockAge < 0.11 && !ghostMode) {
    // Phase 1: Contracting targeting circle
    const p = clamp(lockAge / 0.11, 0, 1);
    const e = easeExpoOut(p);
    const rad = (ring === 'inner' ? 116 : 82) * (1 - e * 0.34);
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1.65;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, rad, p * 1.4, p * 1.4 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4 rotating tick needles
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = p * 1.2 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (rad + 7), Math.sin(a) * (rad + 7));
      ctx.lineTo(Math.cos(a) * (rad - 6), Math.sin(a) * (rad - 6));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (lockAge < 0.22 && !ghostMode) {
    // Phase 2: Shape-tweened sharp diamond morphing into bracket bounds
    const p = clamp((lockAge - 0.11) / 0.11, 0, 1);
    const e = easeBackOut(p, 1.35);
    const dx = baseHw * (1.26 - e * 0.22);
    const dy = baseHh * (1.55 - e * 0.48);

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.85;
    ctx.beginPath();
    ctx.moveTo(0, -dy);
    ctx.lineTo(dx, 0);
    ctx.lineTo(0, dy);
    ctx.lineTo(-dx, 0);
    ctx.closePath();
    ctx.stroke();

    // Inner cross leader ticks previewing final bracket lock
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(-dx - 7, 0); ctx.lineTo(-dx + 4, 0);
    ctx.moveTo(dx - 4, 0); ctx.lineTo(dx + 7, 0);
    ctx.stroke();

    ctx.restore();
    return;
  }

  // Phase 3: Snapped 4-corner aerospace vector bracket with leader ticks
  const settleP = clamp((lockAge - 0.22) / 0.14, 0, 1);
  const settleEase = easeBackOut(settleP, 1.45);
  const expand = ghostMode ? 0 : (1 - settleEase) * 14;
  const breath = ghostMode ? 0 : Math.sin(timeSec * 3.4) * 1.1;
  const hw = baseHw + expand + breath;
  const hh = baseHh + expand * 0.65 + breath * 0.6;

  ctx.strokeStyle = ghostMode ? secondaryColor : isLight ? '#0A0A0B' : '#D2FF28';
  ctx.lineWidth = ghostMode ? 1.1 : 1.8;
  ctx.beginPath();
  // 4 corner L-brackets
  ctx.moveTo(-hw, -hh + arm); ctx.lineTo(-hw, -hh); ctx.lineTo(-hw + arm, -hh);
  ctx.moveTo(hw - arm, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -hh + arm);
  ctx.moveTo(hw, hh - arm); ctx.lineTo(hw, hh); ctx.lineTo(hw - arm, hh);
  ctx.moveTo(-hw + arm, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh - arm);
  ctx.stroke();

  if (!ghostMode) {
    // Surgical inward horizontal leader ticks & tiny accent lock pips
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-hw - 6, 0); ctx.lineTo(-hw + 3, 0);
    ctx.moveTo(hw - 3, 0); ctx.lineTo(hw + 6, 0);
    ctx.moveTo(0, -hh - 5); ctx.lineTo(0, -hh + 2);
    ctx.moveTo(0, hh - 2); ctx.lineTo(0, hh + 5);
    ctx.stroke();

    ctx.fillStyle = primaryColor;
    ctx.fillRect(-hw - 1.5, -hh - 1.5, 3, 3);
    ctx.fillRect(hw - 1.5, -hh - 1.5, 3, 3);
    ctx.fillRect(hw - 1.5, hh - 1.5, 3, 3);
    ctx.fillRect(-hw - 1.5, hh - 1.5, 3, 3);
  }

  ctx.restore();
}

/**
 * Golden-age Flash vector kinetics layer: surgical detonation shockwaves, cel-edged starburst
 * spikes, speed-lines, sparks, logarithmic vortex implosion, viewport-clamped refined orbital
 * hairlines, curved Flash Bezier Motion-Guide tethers with traveling energy chevrons, and a
 * shape-tweening lock-on targeting reticle. Strictly synchronized to centerYRatio.
 */
export function BurstFxCanvas({
  exploded,
  burstSeq,
  implodeSeq = 0,
  accentHue = 112,
  theme: themeProp,
  nodes,
  hoveredId = null,
  centerYRatio = 0.47,
  onionSkin = false,
  showGuides = false,
  className = '',
}: BurstFxCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '240px' });
  const reduced = useReducedMotion();
  const storeTheme = useDeck((s) => s.vault.prefs.theme);
  const theme: ArtTheme = themeProp ?? storeTheme ?? 'obsidian';

  const stateRef = useRef({
    exploded,
    accentHue: remapHue(accentHue),
    isLight: theme === 'daylight',
    centerYRatio,
    nodes: nodes ?? [],
    hoveredId,
    onionSkin,
    showGuides,
    reduced,
    inView,
    hoverLockId: hoveredId,
    hoverLockAge: 0,
    guidesScale: exploded ? 1 : 0,
    guidesVel: 0,
    flashAlpha: 0,
    pendingBursts: 0,
    pendingImplodes: 0,
    pendingResetAtRest: false,
  });

  const prevBurstRef = useRef(burstSeq);
  const prevImplodeRef = useRef(implodeSeq);
  const prevExplodedRef = useRef(exploded);
  const renderStaticRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const st = stateRef.current;
    st.exploded = exploded;
    st.accentHue = remapHue(accentHue);
    st.isLight = theme === 'daylight';
    st.centerYRatio = centerYRatio;
    st.nodes = nodes ?? [];
    st.onionSkin = onionSkin;
    st.showGuides = showGuides;
    st.reduced = reduced;
    st.inView = inView;

    if (hoveredId !== st.hoverLockId) {
      st.hoverLockId = hoveredId;
      st.hoverLockAge = 0;
    }
    st.hoveredId = hoveredId;

    if (burstSeq !== prevBurstRef.current) {
      st.pendingBursts += 1;
      prevBurstRef.current = burstSeq;
    }
    if (implodeSeq !== prevImplodeRef.current) {
      st.pendingImplodes += 1;
      prevImplodeRef.current = implodeSeq;
    }
    if (!exploded && prevExplodedRef.current) {
      st.pendingResetAtRest = true;
    }
    prevExplodedRef.current = exploded;

    if (reduced) renderStaticRef.current?.();
  }, [
    exploded,
    burstSeq,
    implodeSeq,
    accentHue,
    theme,
    nodes,
    hoveredId,
    centerYRatio,
    onionSkin,
    showGuides,
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

    const sparks: BurstSpark[] = [];
    const spikes: StarburstSpike[] = [];
    const waves: ShockWave[] = [];
    const vortex: VortexSpark[] = [];
    const ambient: AmbientMote[] = [];

    // Subtle delicate micro-motes tightly bound to the accretion corona (ZERO outer clutter at rest)
    for (let i = 0; i < 28; i++) {
      ambient.push({
        angle: (i / 28) * TAU + Math.random() * 0.4,
        rMult: 1.12 + Math.random() * 0.88,
        speed: 0.35 + Math.random() * 0.52,
        size: 0.9 + (i % 3) * 0.38,
      });
    }

    const spawnDetonation = () => {
      const st = stateRef.current;
      const cx = cssW * 0.5;
      const cy = cssH * st.centerYRatio;
      const minDim = Math.max(320, Math.min(cssW, cssH));
      const safeMaxR = Math.min(cx, cssW - cx, cy, cssH - cy) * 1.04;
      const isLight = st.isLight;
      const hBase = st.accentHue;

      // Controlled radial bloom so FlashMovieStage's 2-frame cel-ink impact starburst reads razor-clear!
      st.flashAlpha = isLight ? 0.34 : 0.44;
      st.guidesVel = Math.max(st.guidesVel, 7.2);

      waves.push(
        {
          age: 0,
          duration: 0.74,
          maxR: safeMaxR * 0.94,
          kind: 'primary',
          color: isLight ? '#D94E00' : '#D2FF28',
          rotSpeed: 0,
          startAngle: 0,
        },
        {
          age: -0.055,
          duration: 0.84,
          maxR: safeMaxR * 0.86,
          kind: 'secondary',
          color: isLight ? '#0A0A0B' : '#F5F3EC',
          rotSpeed: 0.42,
          startAngle: 0,
        },
        {
          age: -0.095,
          duration: 0.68,
          maxR: safeMaxR * 0.7,
          kind: 'segmented',
          color: isLight ? '#006B8F' : nonPurpleCss(false, hBase, 1),
          rotSpeed: -1.4,
          startAngle: Math.random() * TAU,
        },
      );

      // Surgical cel-edged Flash starburst spikes (26) + crisp radial speed-lines (34)
      const palette = isLight
        ? DAYLIGHT_PALETTE
        : (['#F5F3EC', '#D2FF28', '#00D4FF', nonPurpleCss(false, hBase, 1)] as const);

      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU + (Math.random() - 0.5) * 0.08;
        spikes.push({
          angle: a,
          speed: minDim * (0.76 + Math.random() * 0.82),
          length: minDim * (0.12 + Math.random() * 0.2),
          baseWidth: 2.0 + Math.random() * 4.2,
          life: 0,
          maxLife: 0.34 + Math.random() * 0.24,
          color: palette[i % palette.length]!,
          speedLine: false,
        });
      }
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * TAU;
        spikes.push({
          angle: a,
          speed: minDim * (1.02 + Math.random() * 0.88),
          length: minDim * (0.13 + Math.random() * 0.22),
          baseWidth: 0.85 + Math.random() * 1.25,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.24,
          color: palette[(i + 1) % palette.length]!,
          speedLine: true,
        });
      }

      // 144 surgical vector sparks & diamond glints harmonizing cleanly with FlashMovieStage
      const startR = minDim * 0.09;
      for (let i = 0; i < 144; i++) {
        const a = Math.random() * TAU;
        const speed = minDim * (0.36 + Math.pow(Math.random(), 0.72) * 1.48);
        sparks.push({
          x: cx + Math.cos(a) * startR,
          y: cy + Math.sin(a) * startR,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          drag: 2.15 + Math.random() * 1.65,
          curl: (Math.random() - 0.5) * 1.4,
          life: 0,
          maxLife: 0.44 + Math.random() * 0.58,
          size: 1.3 + Math.random() * 2.3,
          color: palette[i % palette.length]!,
          kind: i % 4 === 0 ? 'diamond' : 'streak',
        });
      }
    };

    const spawnImplosion = () => {
      const st = stateRef.current;
      const minDim = Math.max(320, Math.min(cssW, cssH));
      const safeMaxR = Math.min(cssW * 0.5, cssH * st.centerYRatio, cssH * (1 - st.centerYRatio)) * 0.94;
      const isLight = st.isLight;
      const hBase = st.accentHue;

      spikes.length = 0;
      sparks.length = 0;

      waves.push(
        {
          age: 0,
          duration: 0.56,
          maxR: safeMaxR,
          kind: 'implode',
          color: isLight ? '#0A0A0B' : '#D2FF28',
          rotSpeed: 1.5,
          startAngle: 0,
        },
        {
          age: -0.075,
          duration: 0.52,
          maxR: safeMaxR * 0.72,
          kind: 'implode',
          color: isLight ? '#D94E00' : nonPurpleCss(false, hBase, 1),
          rotSpeed: -1.8,
          startAngle: 1.1,
        },
      );

      const cols = isLight
        ? DAYLIGHT_PALETTE
        : (['#F5F3EC', '#D2FF28', '#00D4FF', nonPurpleCss(false, hBase, 1)] as const);

      for (let i = 0; i < 112; i++) {
        vortex.push({
          angle: Math.random() * TAU,
          radius: minDim * (0.24 + Math.random() * 0.34),
          radialSpeed: minDim * (0.64 + Math.random() * 0.74),
          angSpeed: 3.6 + Math.random() * 4.2,
          life: 0,
          maxLife: 0.46 + Math.random() * 0.32,
          size: 1.35 + Math.random() * 2.0,
          color: cols[i % cols.length]!,
        });
      }
    };

    const drawGuidesAndTethers = (timeSec: number, guideScale: number) => {
      const st = stateRef.current;
      if (!st.exploded) return;

      const cx = cssW * 0.5;
      const cy = cssH * st.centerYRatio;
      const minD = Math.min(cssW, cssH);
      const isLight = st.isLight;

      // 1. Refined 1px orbital guide hairlines STRICTLY clamped within viewport bounds (>= 24px margin)
      if (guideScale > 0.04) {
        const isDesktop = cssW >= 1024;
        const maxRx = Math.max(24, Math.min(cx, cssW - cx) - 24);
        const maxRy = Math.max(24, Math.min(cy, cssH - cy) - 24);

        let innerRx = isDesktop ? cssW * 0.245 : minD * 0.32;
        let innerRy = isDesktop ? Math.min(cssH * 0.255, maxRy * 0.72) : minD * 0.32;
        let outerRx = isDesktop ? cssW * 0.405 : minD * 0.44;
        let outerRy = isDesktop ? Math.min(cssH * 0.34, maxRy * 0.94) : minD * 0.44;

        if (isDesktop && st.nodes.length > 0) {
          let iMaxX = 0;
          let iMaxY = 0;
          let oMaxX = 0;
          let oMaxY = 0;
          for (let i = 0; i < st.nodes.length; i++) {
            const n = st.nodes[i]!;
            const dx = Math.abs(n.nx * cssW - cx);
            const dy = Math.abs(n.ny * cssH - cy);
            if (n.ring === 'inner') {
              if (dx > iMaxX) iMaxX = dx;
              if (dy > iMaxY) iMaxY = dy;
            } else {
              if (dx > oMaxX) oMaxX = dx;
              if (dy > oMaxY) oMaxY = dy;
            }
          }
          if (iMaxX > 40 && iMaxY > 40) {
            innerRx = iMaxX;
            innerRy = iMaxY;
          }
          if (oMaxX > 60 && oMaxY > 60) {
            outerRx = oMaxX;
            outerRy = oMaxY;
          }
        }

        const rx1 = clamp(innerRx * guideScale, 1, maxRx);
        const ry1 = clamp(innerRy * guideScale, 1, maxRy);
        const rx2 = clamp(outerRx * guideScale, 1, maxRx);
        const ry2 = clamp(outerRy * guideScale, 1, maxRy);
        const gAlpha = clamp(guideScale, 0, 1);

        ctx.save();
        ctx.strokeStyle = isLight
          ? `rgba(10,10,11,${(0.14 * gAlpha).toFixed(3)})`
          : `rgba(210,255,40,${(0.14 * gAlpha).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -timeSec * 10;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx1, ry1, 0, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = isLight
          ? `rgba(10,10,11,${(0.11 * gAlpha).toFixed(3)})`
          : `rgba(0,212,255,${(0.12 * gAlpha).toFixed(3)})`;
        ctx.setLineDash([2, 8]);
        ctx.lineDashOffset = timeSec * 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx2, ry2, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isDesktop && gAlpha > 0.4) {
          ctx.strokeStyle = isLight
            ? `rgba(10,10,11,${(0.24 * gAlpha).toFixed(3)})`
            : `rgba(210,255,40,${(0.22 * gAlpha).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let d = 0; d < 16; d++) {
            const a = (d / 16) * TAU;
            const len = d % 4 === 0 ? 7 : 3;
            const x1 = cx + Math.cos(a) * rx2;
            const y1 = cy + Math.sin(a) * ry2;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - Math.cos(a) * len, y1 - Math.sin(a) * len);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // 2. Curved Flash Bezier Motion-Guide Orbital Tethers from photon ring to orbiting worlds
      if (st.nodes.length === 0) return;
      const coreEdge = minD * 0.116;
      let activeNode: OrbitNodeTarget | null = null;

      for (let i = 0; i < st.nodes.length; i++) {
        const n = st.nodes[i]!;
        const isHot = st.hoveredId ? n.id === st.hoveredId : Boolean(n.active);
        if (isHot) {
          activeNode = n;
          continue;
        }
        const tx = n.nx * cssW;
        const ty = n.ny * cssH;
        const curve = buildCurvedTether(cx, cy, coreEdge, tx, ty, n.ring);
        if (!curve) continue;

        ctx.strokeStyle = isLight ? 'rgba(10,10,11,0.14)' : nonPurpleCss(false, n.hue, 0.17);
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(curve.p0.x, curve.p0.y);
        ctx.quadraticCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y);
        ctx.stroke();

        // Subtle traveling directional pulse pip gliding along each non-active Bezier tether
        const uPip = (timeSec * 0.34 + i * 0.19) % 1;
        const pip = evalQuadBezier(curve.p0, curve.p1, curve.p2, uPip);
        drawEnergyChevron(
          ctx,
          pip.x,
          pip.y,
          pip.angle,
          3.1,
          isLight ? 'rgba(180,83,9,0.45)' : nonPurpleCss(false, n.hue, 0.42),
          1.05,
        );

        ctx.fillStyle = isLight ? 'rgba(180,83,9,0.52)' : nonPurpleCss(false, n.hue, 0.48);
        ctx.beginPath();
        ctx.arc(curve.p0.x, curve.p0.y, 1.55, 0, TAU);
        ctx.fill();
      }

      // 3. Blazing Curved Flash Bezier Telemetry Beam + Traveling Energy Chevrons + Shape-Tween Lock Reticle
      if (activeNode) {
        const tx = activeNode.nx * cssW;
        const ty = activeNode.ny * cssH;
        const curve = buildCurvedTether(cx, cy, coreEdge, tx, ty, activeNode.ring);
        const primaryCol = isLight ? '#D94E00' : '#D2FF28';
        const secondaryCol = isLight ? '#006B8F' : '#00D4FF';

        if (curve) {
          ctx.save();

          // Optional Flash onion-skin ghost echo curves flanking the active curved tether
          if (st.onionSkin) {
            const ghostOffsets = [
              { dx: -6, dy: -4, col: isLight ? 'rgba(0,107,143,0.34)' : 'rgba(0,212,255,0.34)' },
              { dx: 6, dy: 4, col: isLight ? 'rgba(217,78,0,0.28)' : 'rgba(210,255,40,0.28)' },
            ] as const;
            for (const g of ghostOffsets) {
              ctx.strokeStyle = g.col;
              ctx.lineWidth = 1.25;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(curve.p0.x, curve.p0.y);
              ctx.quadraticCurveTo(curve.p1.x + g.dx, curve.p1.y + g.dy, curve.p2.x, curve.p2.y);
              ctx.stroke();
            }
            ctx.setLineDash([]);
          }

          const beamGrad = ctx.createLinearGradient(curve.p0.x, curve.p0.y, curve.p2.x, curve.p2.y);
          if (isLight) {
            beamGrad.addColorStop(0, 'rgba(217,78,0,0.32)');
            beamGrad.addColorStop(0.55, 'rgba(180,83,9,0.42)');
            beamGrad.addColorStop(1, 'rgba(10,10,11,0.62)');
          } else {
            beamGrad.addColorStop(0, 'rgba(210,255,40,0.38)');
            beamGrad.addColorStop(0.55, nonPurpleCss(false, activeNode.hue, 0.54));
            beamGrad.addColorStop(1, '#F5F3EC');
          }

          // Soft wide vector energy sheath
          ctx.strokeStyle = beamGrad;
          ctx.lineWidth = 4.2;
          ctx.beginPath();
          ctx.moveTo(curve.p0.x, curve.p0.y);
          ctx.quadraticCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y);
          ctx.stroke();

          // Razor inner vector spline
          ctx.strokeStyle = primaryCol;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(curve.p0.x, curve.p0.y);
          ctx.quadraticCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y);
          ctx.stroke();

          // 4 animated traveling energy chevrons gliding along the exact Bezier tangent!
          for (let k = 0; k < 4; k++) {
            const u = (timeSec * 0.85 + k * 0.25) % 1;
            const sample = evalQuadBezier(curve.p0, curve.p1, curve.p2, u);
            drawEnergyChevron(
              ctx,
              sample.x,
              sample.y,
              sample.angle,
              5.4,
              isLight ? '#0A0A0B' : '#FFFFFF',
              2.1,
            );
            // Secondary trailing chevron pulse
            const sampleBack = evalQuadBezier(curve.p0, curve.p1, curve.p2, clamp(u - 0.032, 0, 1));
            drawEnergyChevron(ctx, sampleBack.x, sampleBack.y, sampleBack.angle, 4.1, primaryCol, 1.3);
          }

          // Photon-ring origin jewel anchor
          ctx.fillStyle = primaryCol;
          ctx.strokeStyle = isLight ? '#0A0A0B' : '#050608';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(curve.p0.x, curve.p0.y, 3.3, 0, TAU);
          ctx.fill();
          ctx.stroke();

          // Optional Flash authoring Bezier tangent handles on the active tether!
          if (st.showGuides) {
            ctx.strokeStyle = isLight ? 'rgba(0,107,143,0.58)' : 'rgba(0,212,255,0.56)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(curve.p0.x, curve.p0.y);
            ctx.lineTo(curve.p1.x, curve.p1.y);
            ctx.lineTo(curve.p2.x, curve.p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Hollow Bezier control-point circle at quadratic apex
            ctx.fillStyle = isLight ? '#F5F3EC' : '#050608';
            ctx.strokeStyle = secondaryCol;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(curve.p1.x, curve.p1.y, 3.4, 0, TAU);
            ctx.fill();
            ctx.stroke();

            drawRegistrationMark(ctx, curve.p0.x, curve.p0.y, secondaryCol, 4);
          }

          ctx.restore();
        }

        // Shape-tweening vector lock-on reticle (circle -> diamond -> 4-corner aerospace bracket)
        if (st.onionSkin) {
          ctx.save();
          ctx.globalAlpha = 0.34;
          drawShapeTweenLockReticle(
            ctx,
            tx - 4,
            ty - 3,
            activeNode.ring,
            1,
            timeSec,
            isLight,
            primaryCol,
            secondaryCol,
            true,
          );
          ctx.restore();
        }
        drawShapeTweenLockReticle(
          ctx,
          tx,
          ty,
          activeNode.ring,
          st.hoverLockAge,
          timeSec,
          isLight,
          primaryCol,
          secondaryCol,
        );
      }
    };

    const drawStaticFrame = () => {
      syncSize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const st = stateRef.current;
      st.guidesScale = st.exploded ? 1 : 0;
      st.hoverLockAge = 1;
      drawGuidesAndTethers(0, st.guidesScale);
    };

    renderStaticRef.current = drawStaticFrame;
    if (stateRef.current.reduced) {
      drawStaticFrame();
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        syncSize();
        if (stateRef.current.reduced) drawStaticFrame();
      });
      ro.observe(wrap);
    }

    let raf = 0;
    let lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let elapsed = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (document.visibilityState !== 'visible' || !st.inView || st.reduced) {
        lastNow = now;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      elapsed += dt;
      st.hoverLockAge += dt;

      if (st.pendingResetAtRest) {
        st.pendingResetAtRest = false;
        spikes.length = 0;
        sparks.length = 0;
      }
      while (st.pendingBursts > 0) {
        st.pendingBursts -= 1;
        spawnDetonation();
      }
      while (st.pendingImplodes > 0) {
        st.pendingImplodes -= 1;
        spawnImplosion();
      }

      const targetScale = st.exploded ? 1 : 0;
      const force = (targetScale - st.guidesScale) * 165;
      st.guidesVel = (st.guidesVel + force * dt) * Math.exp(-dt * 13);
      st.guidesScale = Math.max(0, st.guidesScale + st.guidesVel * dt);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW * 0.5;
      const cy = cssH * st.centerYRatio;
      const minD = Math.min(cssW, cssH);
      const isLight = st.isLight;

      // 1. Delicate accretion micro-motes tightly bound to the photon ring
      const coreR = minD * (st.exploded ? 0.116 : 0.156);
      const moteCount = st.exploded ? 12 : ambient.length;
      for (let i = 0; i < moteCount; i++) {
        const m = ambient[i]!;
        const pull = 0.24 + 0.35 / Math.max(0.8, m.rMult);
        m.rMult -= pull * m.speed * dt;
        m.angle += (1.1 + 0.85 / Math.max(0.9, m.rMult)) * m.speed * dt;
        if (m.rMult <= 1.04) {
          m.rMult = 1.66 + Math.random() * 0.4;
          m.angle = Math.random() * TAU;
        }
        const rad = coreR * m.rMult;
        const px = cx + Math.cos(m.angle) * rad * 1.12;
        const py = cy + Math.sin(m.angle) * rad * 0.96;
        const fade = clamp(1 - (m.rMult - 1.04) / 1.05, 0.05, 0.68) * clamp((m.rMult - 1.02) * 8, 0, 1);

        ctx.fillStyle = isLight
          ? i % 2 === 0
            ? `rgba(217,78,0,${(fade * 0.62).toFixed(3)})`
            : `rgba(10,10,11,${(fade * 0.42).toFixed(3)})`
          : i % 3 === 0
            ? `rgba(210,255,40,${(fade * 0.66).toFixed(3)})`
            : `rgba(255,224,160,${(fade * 0.58).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, m.size, 0, TAU);
        ctx.fill();
      }

      // 2. Refined orbital guide hairlines & curved Bezier Motion-Guide world tethers
      drawGuidesAndTethers(elapsed, st.guidesScale);

      // 3. Controlled radial detonation bloom (harmonizes with FlashMovieStage's 2-frame impact starburst)
      if (st.flashAlpha > 0.01) {
        st.flashAlpha *= Math.exp(-dt * 16);
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, minD * 0.44);
        fg.addColorStop(
          0,
          isLight
            ? `rgba(255,245,214,${st.flashAlpha.toFixed(3)})`
            : `rgba(245,243,236,${st.flashAlpha.toFixed(3)})`,
        );
        fg.addColorStop(
          0.38,
          isLight
            ? `rgba(217,78,0,${(st.flashAlpha * 0.34).toFixed(3)})`
            : `rgba(210,255,40,${(st.flashAlpha * 0.38).toFixed(3)})`,
        );
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy, minD * 0.44, 0, TAU);
        ctx.fill();
      }

      // 4. Crisp double shockwave & collapsing implosion rings
      for (let i = waves.length - 1; i >= 0; i--) {
        const wv = waves[i]!;
        wv.age += dt;
        if (wv.age < 0) continue;
        const u = wv.age / wv.duration;
        if (u >= 1) {
          waves.splice(i, 1);
          continue;
        }
        const rot = wv.startAngle + wv.rotSpeed * wv.age;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        if (wv.kind === 'implode') {
          const easeIn = 1 - Math.pow(u, 2.2);
          const rad = Math.max(8, easeIn * wv.maxR);
          ctx.globalAlpha = Math.sin(u * Math.PI) * 0.85;
          ctx.strokeStyle = wv.color;
          ctx.lineWidth = 1.4 + u * 3.0;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.arc(0, 0, rad, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const easeOut = 1 - Math.pow(1 - u, 3);
          const rad = minD * 0.1 + easeOut * wv.maxR;
          const alpha = Math.pow(1 - u, 1.5);
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = wv.color;

          if (wv.kind === 'primary') {
            ctx.lineWidth = Math.max(0.8, (1 - u) * 4.2);
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, TAU);
            ctx.stroke();
          } else if (wv.kind === 'secondary') {
            ctx.lineWidth = Math.max(0.75, (1 - u) * 1.6);
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, TAU);
            ctx.stroke();
          } else {
            ctx.lineWidth = Math.max(1.2, (1 - u) * 4.6);
            for (let seg = 0; seg < 4; seg++) {
              const a0 = seg * (Math.PI * 0.5);
              ctx.beginPath();
              ctx.arc(0, 0, rad, a0, a0 + 0.5);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 5. Surgical cel-edged triangular Flash starburst spikes & radial speed-lines
      for (let i = spikes.length - 1; i >= 0; i--) {
        const sp = spikes[i]!;
        sp.life += dt;
        const u = sp.life / sp.maxLife;
        if (u >= 1) {
          spikes.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - u, 2.6);
        const dist = minD * 0.08 + ease * sp.speed * sp.maxLife;
        const len = sp.length * (1 - u * 0.55);
        const alpha = Math.pow(1 - u, 1.3);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sp.angle);
        ctx.globalAlpha = alpha;

        if (sp.speedLine) {
          ctx.strokeStyle = sp.color;
          ctx.lineWidth = sp.baseWidth * (1 - u * 0.5);
          ctx.beginPath();
          ctx.moveTo(Math.max(0, dist - len), 0);
          ctx.lineTo(dist, 0);
          ctx.stroke();
        } else {
          const bw = sp.baseWidth * (1 - u * 0.65);
          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.moveTo(dist + len * 0.45, 0);
          ctx.lineTo(Math.max(0, dist - len * 0.55), -bw);
          ctx.lineTo(Math.max(0, dist - len * 0.32), 0);
          ctx.lineTo(Math.max(0, dist - len * 0.55), bw);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = isLight ? '#0A0A0B' : '#050608';
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. Surgical glowing explosion sparks & diamond glints
      if (!isLight) ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.life += dt;
        const u = p.life / p.maxLife;
        if (u >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const px0 = p.x;
        const py0 = p.y;
        const damp = Math.exp(-p.drag * dt);
        const cvx = p.vx - p.vy * p.curl * dt;
        const cvy = p.vy + p.vx * p.curl * dt;
        p.vx = cvx * damp;
        p.vy = cvy * damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        ctx.globalAlpha = Math.pow(1 - u, 1.25);
        if (p.kind === 'diamond') {
          const s = p.size * (1.2 - u * 0.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - s);
          ctx.lineTo(p.x + s, p.y);
          ctx.lineTo(p.x, p.y + s);
          ctx.lineTo(p.x - s, p.y);
          ctx.closePath();
          ctx.fill();
        } else {
          const tx = p.x - (p.x - px0) * 2.4;
          const ty = p.y - (p.y - py0) * 2.4;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.8, p.size * (1 - u * 0.45));
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }

      // 7. Vortex implosion sparks spiraling down into the singularity
      for (let i = vortex.length - 1; i >= 0; i--) {
        const v = vortex[i]!;
        v.life += dt;
        const u = v.life / v.maxLife;
        if (u >= 1 || v.radius < 6) {
          vortex.splice(i, 1);
          continue;
        }
        const prevX = cx + Math.cos(v.angle) * v.radius;
        const prevY = cy + Math.sin(v.angle) * v.radius;
        const accel = 1 + u * 2.4;
        v.radius = Math.max(0, v.radius - v.radialSpeed * accel * dt);
        v.angle += v.angSpeed * (1 + (1 - clamp(v.radius / (minD * 0.5), 0, 1)) * 2.5) * dt;
        const nx = cx + Math.cos(v.angle) * v.radius;
        const ny = cy + Math.sin(v.angle) * v.radius;

        ctx.globalAlpha = Math.sin(Math.min(1, u * 3.5) * Math.PI * 0.5) * (1 - u * 0.4);
        ctx.strokeStyle = v.color;
        ctx.lineWidth = v.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    const onVisChange = () => {
      lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    };
    document.addEventListener('visibilitychange', onVisChange);

    if (typeof requestAnimationFrame === 'function') {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      renderStaticRef.current = null;
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
