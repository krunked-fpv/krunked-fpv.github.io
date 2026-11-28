import { useEffect, useRef } from 'react';
import { nonPurpleRgb, remapHue } from '../../art/color';
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
  /** Increment to trigger a dramatic supernova shockwave, starburst spikes, and sparks */
  burstSeq: number;
  /** Increment to trigger a dramatic vortex implosion pulling sparks spiraling into the black hole */
  implodeSeq?: number;
  accentHue?: number;
  theme?: ArtTheme;
  nodes?: readonly OrbitNodeTarget[];
  hoveredId?: string | null;
  /** Normalized vertical center ratio from top edge (0..1, default 0.47; desktop lg+ 0.435) */
  centerYRatio?: number;
  className?: string;
}

interface Vec2 {
  x: number;
  y: number;
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
  /** Radius in multiples of event-horizon core radius (tightly bound 1.06..2.02) */
  rMult: number;
  speed: number;
  size: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function easeBackOut(t: number, overshoot = 1.45): number {
  const x = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

function evalQuadBezier(p0: Vec2, p1: Vec2, p2: Vec2, rawT: number): { x: number; y: number; angle: number } {
  const t = clamp(rawT, 0, 1);
  const mt = 1 - t;
  const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
  const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
  const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return { x, y, angle: Math.atan2(dy, dx) };
}

/** Daylight Solar Eclipse palette kissed with royal ultraviolet (#7A1ED6), vermilion & archival ink. */
const DAYLIGHT_PALETTE = ['#7A1ED6', '#D94E00', '#0A0A0B', '#B45309'] as const;

/** Obsidian Event Horizon palette infused with electric neon purple (#B829FF / #D65BFF / #9E2EFF) + acid-lime & ivory. */
const NEON_DARK_PALETTE = ['#B829FF', '#D65BFF', '#D2FF28', '#F5F3EC', '#9E2EFF'] as const;

function nonPurpleCss(isLight: boolean, rawHue: number, a = 1): string {
  const L = isLight ? 0.42 : 0.78;
  const C = isLight ? 0.165 : 0.185;
  const [r, g, b] = nonPurpleRgb(L, C, remapHue(rawHue));
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(clamp(a, 0, 1).toFixed(4))})`;
}

/** Computes a sleek curved quadratic Bezier orbital tether from photon ring to orbiting world. */
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
  const nx = -spanY / span;
  const ny = spanX / span;
  const bendDir = ring === 'inner' ? 1 : -0.82;
  const bend = Math.min(50, span * 0.155) * bendDir;

  return {
    p0: { x: sx, y: sy },
    p1: {
      x: (sx + tx) * 0.5 + nx * bend,
      y: (sy + ty) * 0.5 + ny * bend,
    },
    p2: { x: tx, y: ty },
  };
}

/** Draws a subtle vector directional pulse chevron along a curved orbital tether. */
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
  ctx.moveTo(-size * 0.85, -size * 0.6);
  ctx.lineTo(size * 0.55, 0);
  ctx.lineTo(-size * 0.85, size * 0.6);
  ctx.stroke();
  ctx.restore();
}

/** Draws a razor-clean snapping 4-corner targeting reticle with subtle leader ticks on the hovered world. */
function drawSnapReticle(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  ring: 'inner' | 'outer',
  lockAge: number,
  timeSec: number,
  isLight: boolean,
): void {
  const baseHw = ring === 'inner' ? 93 : 69;
  const baseHh = ring === 'inner' ? 54 : 24;
  const arm = ring === 'inner' ? 11.5 : 8.5;

  const t = clamp(lockAge / 0.22, 0, 1);
  const snap = easeBackOut(t, 1.35);
  const expand = (1 - snap) * 16;
  const breath = Math.sin(timeSec * 3.0) * 0.9;
  const hw = baseHw + expand + breath;
  const hh = baseHh + expand * 0.6 + breath * 0.5;

  ctx.save();
  ctx.translate(tx, ty);

  // Subtle neon-purple ambient halo behind the snapped corner brackets in dark mode
  if (!isLight) {
    ctx.strokeStyle = 'rgba(184, 41, 255, 0.45)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh + arm); ctx.lineTo(-hw, -hh); ctx.lineTo(-hw + arm, -hh);
    ctx.moveTo(hw - arm, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -hh + arm);
    ctx.moveTo(hw, hh - arm); ctx.lineTo(hw, hh); ctx.lineTo(hw - arm, hh);
    ctx.moveTo(-hw + arm, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh - arm);
    ctx.stroke();
  }

  // Razor crisp 4-corner aerospace brackets
  ctx.strokeStyle = isLight ? '#0A0A0B' : '#D2FF28';
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(-hw, -hh + arm); ctx.lineTo(-hw, -hh); ctx.lineTo(-hw + arm, -hh);
  ctx.moveTo(hw - arm, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -hh + arm);
  ctx.moveTo(hw, hh - arm); ctx.lineTo(hw, hh); ctx.lineTo(hw - arm, hh);
  ctx.moveTo(-hw + arm, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh - arm);
  ctx.stroke();

  // Delicate neon-purple / royal-ultraviolet midpoint leader ticks
  ctx.strokeStyle = isLight ? 'rgba(122, 30, 214, 0.72)' : 'rgba(214, 91, 255, 0.82)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-hw - 5.5, 0); ctx.lineTo(-hw + 2.5, 0);
  ctx.moveTo(hw - 2.5, 0); ctx.lineTo(hw + 5.5, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Pure Event Horizon kinetics canvas: delicate neon-purple & warm-gold accretion motes at rest,
 * dramatic neon-purple supernova detonation shockwaves/sparks/starburst streaks, logarithmic
 * vortex implosion, viewport-clamped orbital hairlines, curved Bezier world tethers, and a
 * snapping 4-corner targeting reticle. Strictly synchronized to centerYRatio.
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
  }, [exploded, burstSeq, implodeSeq, accentHue, theme, nodes, hoveredId, centerYRatio, reduced, inView]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssW = 1;
    let cssH = 1;
    let dpr = 1;
    let needsFullClear = true;
    const MAX_2D_PIXELS = 2_073_600;

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      cssW = Math.round(rect.width);
      cssH = Math.round(rect.height);
      const baseDpr = Math.min(1.5, window.devicePixelRatio || 1);
      const budgetDpr = Math.sqrt(MAX_2D_PIXELS / Math.max(1, cssW * cssH));
      dpr = Math.max(0.75, Math.min(baseDpr, budgetDpr));
      const pw = Math.max(1, Math.round(cssW * dpr));
      const ph = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        needsFullClear = true;
      }
    };
    syncSize();

    const sparks: BurstSpark[] = [];
    const spikes: StarburstSpike[] = [];
    const waves: ShockWave[] = [];
    const vortex: VortexSpark[] = [];
    const ambient: AmbientMote[] = [];

    // Delicate accretion micro-motes tightly kissing the horizon (ZERO outer clutter at rest!)
    for (let i = 0; i < 32; i++) {
      ambient.push({
        angle: (i / 32) * TAU + Math.random() * 0.4,
        rMult: 1.1 + Math.random() * 0.9,
        speed: 0.34 + Math.random() * 0.54,
        size: 0.85 + (i % 3) * 0.38,
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

      st.flashAlpha = isLight ? 0.5 : 0.72;
      st.guidesVel = Math.max(st.guidesVel, 7.2);

      // Electric neon-purple + acid-lime + incandescent ivory shockwaves
      waves.push(
        {
          age: 0,
          duration: 0.78,
          maxR: safeMaxR * 0.96,
          kind: 'primary',
          color: isLight ? '#7A1ED6' : '#B829FF',
          rotSpeed: 0,
          startAngle: 0,
        },
        {
          age: -0.055,
          duration: 0.88,
          maxR: safeMaxR * 0.88,
          kind: 'secondary',
          color: isLight ? '#D94E00' : '#D65BFF',
          rotSpeed: 0.42,
          startAngle: 0,
        },
        {
          age: -0.1,
          duration: 0.72,
          maxR: safeMaxR * 0.72,
          kind: 'segmented',
          color: isLight ? '#0A0A0B' : '#D2FF28',
          rotSpeed: -1.4,
          startAngle: Math.random() * TAU,
        },
      );

      const palette = isLight
        ? DAYLIGHT_PALETTE
        : ([...NEON_DARK_PALETTE, nonPurpleCss(false, hBase, 1)] as const);

      // Crisp tapered starburst spikes (30) + high-velocity radial streaks (38)
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU + (Math.random() - 0.5) * 0.08;
        spikes.push({
          angle: a,
          speed: minDim * (0.76 + Math.random() * 0.86),
          length: minDim * (0.13 + Math.random() * 0.22),
          baseWidth: 2.0 + Math.random() * 4.4,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.26,
          color: palette[i % palette.length]!,
          speedLine: false,
        });
      }
      for (let i = 0; i < 38; i++) {
        const a = Math.random() * TAU;
        spikes.push({
          angle: a,
          speed: minDim * (1.04 + Math.random() * 0.9),
          length: minDim * (0.14 + Math.random() * 0.24),
          baseWidth: 0.9 + Math.random() * 1.35,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.25,
          color: palette[(i + 1) % palette.length]!,
          speedLine: true,
        });
      }

      // 176 luminous neon-purple, acid-lime & ivory sparks decaying cleanly
      const startR = minDim * 0.088;
      for (let i = 0; i < 176; i++) {
        const a = Math.random() * TAU;
        const speed = minDim * (0.36 + Math.pow(Math.random(), 0.72) * 1.54);
        sparks.push({
          x: cx + Math.cos(a) * startR,
          y: cy + Math.sin(a) * startR,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          drag: 2.05 + Math.random() * 1.65,
          curl: (Math.random() - 0.5) * 1.45,
          life: 0,
          maxLife: 0.46 + Math.random() * 0.62,
          size: 1.35 + Math.random() * 2.45,
          color: palette[i % palette.length]!,
          kind: i % 5 === 0 ? 'diamond' : 'streak',
        });
      }
    };

    const spawnImplosion = () => {
      const st = stateRef.current;
      const minDim = Math.max(320, Math.min(cssW, cssH));
      const safeMaxR = Math.min(cssW * 0.5, cssH * st.centerYRatio, cssH * (1 - st.centerYRatio)) * 0.95;
      const isLight = st.isLight;

      spikes.length = 0;
      sparks.length = 0;

      waves.push(
        {
          age: 0,
          duration: 0.58,
          maxR: safeMaxR,
          kind: 'implode',
          color: isLight ? '#7A1ED6' : '#B829FF',
          rotSpeed: 1.5,
          startAngle: 0,
        },
        {
          age: -0.08,
          duration: 0.54,
          maxR: safeMaxR * 0.74,
          kind: 'implode',
          color: isLight ? '#D94E00' : '#D2FF28',
          rotSpeed: -1.8,
          startAngle: 1.1,
        },
      );

      const cols = isLight ? DAYLIGHT_PALETTE : NEON_DARK_PALETTE;
      for (let i = 0; i < 136; i++) {
        vortex.push({
          angle: Math.random() * TAU,
          radius: minDim * (0.24 + Math.random() * 0.36),
          radialSpeed: minDim * (0.62 + Math.random() * 0.76),
          angSpeed: 3.6 + Math.random() * 4.2,
          life: 0,
          maxLife: 0.48 + Math.random() * 0.34,
          size: 1.4 + Math.random() * 2.15,
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

      // 1. Subtle 1px orbital track hairlines STRICTLY clamped within viewport bounds (>= 24px margin)
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
          ? `rgba(122,30,214,${(0.16 * gAlpha).toFixed(3)})`
          : `rgba(184,41,255,${(0.22 * gAlpha).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -timeSec * 10;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx1, ry1, 0, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = isLight
          ? `rgba(10,10,11,${(0.11 * gAlpha).toFixed(3)})`
          : `rgba(210,255,40,${(0.11 * gAlpha).toFixed(3)})`;
        ctx.setLineDash([2, 8]);
        ctx.lineDashOffset = timeSec * 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx2, ry2, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isDesktop && gAlpha > 0.4) {
          ctx.strokeStyle = isLight
            ? `rgba(122,30,214,${(0.24 * gAlpha).toFixed(3)})`
            : `rgba(214,91,255,${(0.24 * gAlpha).toFixed(3)})`;
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

      // 2. Ultra-fine curved Bezier orbital tethers with subtle neon-purple & world-hue harmony
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

        ctx.strokeStyle = isLight
          ? i % 2 === 0
            ? 'rgba(122,30,214,0.14)'
            : 'rgba(10,10,11,0.12)'
          : i % 2 === 0
            ? 'rgba(184,41,255,0.18)'
            : nonPurpleCss(false, n.hue, 0.16);
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(curve.p0.x, curve.p0.y);
        ctx.quadraticCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y);
        ctx.stroke();

        // Delicate traveling directional pulse pip along the Bezier tether
        const uPip = (timeSec * 0.32 + i * 0.19) % 1;
        const pip = evalQuadBezier(curve.p0, curve.p1, curve.p2, uPip);
        drawEnergyChevron(
          ctx,
          pip.x,
          pip.y,
          pip.angle,
          2.9,
          isLight ? 'rgba(122,30,214,0.44)' : 'rgba(214,91,255,0.46)',
          1.0,
        );

        ctx.fillStyle = isLight ? 'rgba(122,30,214,0.5)' : 'rgba(184,41,255,0.58)';
        ctx.beginPath();
        ctx.arc(curve.p0.x, curve.p0.y, 1.5, 0, TAU);
        ctx.fill();
      }

      // 3. Active hovered world: neon-purple & world-hue curved telemetry beam + snapping 4-corner reticle
      if (activeNode) {
        const tx = activeNode.nx * cssW;
        const ty = activeNode.ny * cssH;
        const curve = buildCurvedTether(cx, cy, coreEdge, tx, ty, activeNode.ring);

        if (curve) {
          const beamGrad = ctx.createLinearGradient(curve.p0.x, curve.p0.y, curve.p2.x, curve.p2.y);
          if (isLight) {
            beamGrad.addColorStop(0, 'rgba(122,30,214,0.38)');
            beamGrad.addColorStop(0.52, 'rgba(217,78,0,0.44)');
            beamGrad.addColorStop(1, 'rgba(10,10,11,0.62)');
          } else {
            beamGrad.addColorStop(0, 'rgba(184,41,255,0.52)');
            beamGrad.addColorStop(0.5, nonPurpleCss(false, activeNode.hue, 0.54));
            beamGrad.addColorStop(1, '#F5F3EC');
          }

          ctx.save();
          // Ambient neon energy sheath
          ctx.strokeStyle = beamGrad;
          ctx.lineWidth = 4.2;
          ctx.beginPath();
          ctx.moveTo(curve.p0.x, curve.p0.y);
          ctx.quadraticCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y);
          ctx.stroke();

          // Razor inner vector spline
          ctx.strokeStyle = isLight ? '#7A1ED6' : '#D65BFF';
          ctx.lineWidth = 1.45;
          ctx.beginPath();
          ctx.moveTo(curve.p0.x, curve.p0.y);
          ctx.quadraticCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y);
          ctx.stroke();

          // 4 sleek traveling energy chevrons gliding along the Bezier tangent
          for (let k = 0; k < 4; k++) {
            const u = (timeSec * 0.85 + k * 0.25) % 1;
            const sample = evalQuadBezier(curve.p0, curve.p1, curve.p2, u);
            drawEnergyChevron(
              ctx,
              sample.x,
              sample.y,
              sample.angle,
              5.0,
              isLight ? '#0A0A0B' : '#FFFFFF',
              2.0,
            );
            const sampleBack = evalQuadBezier(curve.p0, curve.p1, curve.p2, clamp(u - 0.03, 0, 1));
            drawEnergyChevron(
              ctx,
              sampleBack.x,
              sampleBack.y,
              sampleBack.angle,
              3.8,
              isLight ? '#D94E00' : '#D2FF28',
              1.25,
            );
          }

          // Photon-ring origin jewel anchor
          ctx.fillStyle = isLight ? '#7A1ED6' : '#D65BFF';
          ctx.beginPath();
          ctx.arc(curve.p0.x, curve.p0.y, 3.2, 0, TAU);
          ctx.fill();
          ctx.restore();
        }

        // Crisp snapping 4-corner aerospace targeting reticle
        drawSnapReticle(ctx, tx, ty, activeNode.ring, st.hoverLockAge, timeSec, isLight);
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

      const cx = cssW * 0.5;
      const cy = cssH * st.centerYRatio;
      const minD = Math.min(cssW, cssH);
      const isLight = st.isLight;
      const coreR = minD * (st.exploded ? 0.116 : 0.149);

      const isIdleOnly =
        !st.exploded &&
        st.guidesScale <= 0.005 &&
        st.flashAlpha <= 0.01 &&
        waves.length === 0 &&
        spikes.length === 0 &&
        sparks.length === 0 &&
        vortex.length === 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (isIdleOnly && !needsFullClear) {
        // Only clear the tight orbital mote region around the center instead of full ultrawide viewport
        const dirtyR = Math.ceil(coreR * 2.5 + 12);
        ctx.clearRect(Math.max(0, cx - dirtyR), Math.max(0, cy - dirtyR), dirtyR * 2, dirtyR * 2);
      } else {
        ctx.clearRect(0, 0, cssW, cssH);
        needsFullClear = !isIdleOnly;
      }

      // 1. Delicate accretion micro-motes tightly kissing the horizon (warm Gargantua gold + subtle violet glints)
      const moteCount = st.exploded ? 14 : ambient.length;
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
        const fade = clamp(1 - (m.rMult - 1.04) / 1.05, 0.05, 0.72) * clamp((m.rMult - 1.02) * 8, 0, 1);

        ctx.fillStyle = isLight
          ? i % 3 === 0
            ? `rgba(122,30,214,${(fade * 0.58).toFixed(3)})`
            : i % 3 === 1
              ? `rgba(217,78,0,${(fade * 0.6).toFixed(3)})`
              : `rgba(10,10,11,${(fade * 0.42).toFixed(3)})`
          : i % 3 === 0
            ? `rgba(255,214,132,${(fade * 0.78).toFixed(3)})`
            : i % 3 === 1
              ? `rgba(255,246,220,${(fade * 0.72).toFixed(3)})`
              : `rgba(214,116,255,${(fade * 0.48).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, m.size, 0, TAU);
        ctx.fill();
      }

      if (isIdleOnly) return;

      // 2. Refined orbital track hairlines & curved Bezier world tethers
      drawGuidesAndTethers(elapsed, st.guidesScale);

      // 3. Electric neon-purple radial detonation flash bloom
      if (st.flashAlpha > 0.01) {
        st.flashAlpha *= Math.exp(-dt * 14);
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, minD * 0.5);
        fg.addColorStop(
          0,
          isLight
            ? `rgba(255,245,224,${st.flashAlpha.toFixed(3)})`
            : `rgba(255,245,255,${st.flashAlpha.toFixed(3)})`,
        );
        fg.addColorStop(
          0.34,
          isLight
            ? `rgba(122,30,214,${(st.flashAlpha * 0.36).toFixed(3)})`
            : `rgba(184,41,255,${(st.flashAlpha * 0.56).toFixed(3)})`,
        );
        fg.addColorStop(
          0.68,
          isLight
            ? `rgba(217,78,0,${(st.flashAlpha * 0.14).toFixed(3)})`
            : `rgba(110,30,255,${(st.flashAlpha * 0.22).toFixed(3)})`,
        );
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy, minD * 0.5, 0, TAU);
        ctx.fill();
      }

      // 4. Crisp shockwave & collapsing vortex rings
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
          ctx.globalAlpha = Math.sin(u * Math.PI) * 0.88;
          ctx.strokeStyle = wv.color;
          ctx.lineWidth = 1.4 + u * 3.1;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.arc(0, 0, rad, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const easeOut = 1 - Math.pow(1 - u, 3);
          const rad = minD * 0.1 + easeOut * wv.maxR;
          const alpha = Math.pow(1 - u, 1.48);
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = wv.color;

          if (wv.kind === 'primary') {
            ctx.lineWidth = Math.max(0.85, (1 - u) * 4.8);
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, TAU);
            ctx.stroke();
          } else if (wv.kind === 'secondary') {
            ctx.lineWidth = Math.max(0.75, (1 - u) * 2.1);
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, TAU);
            ctx.stroke();
          } else {
            ctx.lineWidth = Math.max(1.2, (1 - u) * 4.8);
            for (let seg = 0; seg < 4; seg++) {
              const a0 = seg * (Math.PI * 0.5);
              ctx.beginPath();
              ctx.arc(0, 0, rad, a0, a0 + 0.52);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 5. Refined tapered starburst spikes & radial speed-lines
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
        const alpha = Math.pow(1 - u, 1.28);

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
          ctx.lineTo(Math.max(0, dist - len * 0.34), 0);
          ctx.lineTo(Math.max(0, dist - len * 0.55), bw);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // 6. Luminous neon-purple & ivory detonation sparks
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

        ctx.globalAlpha = Math.pow(1 - u, 1.22);
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
          const tx = p.x - (p.x - px0) * 2.5;
          const ty = p.y - (p.y - py0) * 2.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.8, p.size * (1 - u * 0.45));
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }

      // 7. Vortex implosion sparks spiraling violently down into the singularity
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
      style={{ contain: 'strict' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
    </div>
  );
}
