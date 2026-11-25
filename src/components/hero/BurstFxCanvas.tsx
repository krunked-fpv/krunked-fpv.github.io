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
  /** Increment to trigger a full golden-age Flash vector explosion (starburst spikes, speed lines, shockwaves, 180+ sparks) */
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

/**
 * Golden-age Flash vector kinetics layer: visceral detonation shockwaves, triangular
 * starburst spikes, speed-lines, 200+ explosion sparks, logarithmic vortex implosion,
 * viewport-clamped refined orbital hairlines, live radial vector tethers, and snapping
 * 4-corner targeting reticles. Strictly synchronized to centerYRatio.
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

    // Subtle delicate micro-motes tightly bound to the accretion corona (ZERO outer speed-lines at rest!)
    for (let i = 0; i < 32; i++) {
      ambient.push({
        angle: (i / 32) * TAU + Math.random() * 0.4,
        rMult: 1.12 + Math.random() * 0.92,
        speed: 0.35 + Math.random() * 0.55,
        size: 0.9 + (i % 3) * 0.4,
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

      st.flashAlpha = isLight ? 0.65 : 0.88;
      st.guidesVel = Math.max(st.guidesVel, 7.2);

      // Crisp double shockwave rings + segmented inner Flash ring (sized cleanly — zero giant clipped dashes!)
      waves.push(
        {
          age: 0,
          duration: 0.78,
          maxR: safeMaxR * 0.96,
          kind: 'primary',
          color: isLight ? '#D94E00' : '#D2FF28',
          rotSpeed: 0,
          startAngle: 0,
        },
        {
          age: -0.055,
          duration: 0.88,
          maxR: safeMaxR * 0.88,
          kind: 'secondary',
          color: isLight ? '#0A0A0B' : '#F5F3EC',
          rotSpeed: 0.4,
          startAngle: 0,
        },
        {
          age: -0.1,
          duration: 0.72,
          maxR: safeMaxR * 0.72,
          kind: 'segmented',
          color: isLight ? '#006B8F' : nonPurpleCss(false, hBase, 1),
          rotSpeed: -1.4,
          startAngle: Math.random() * TAU,
        },
      );

      // Visceral Flash vector starburst spikes (36) + high-speed radial speed-lines (44)
      const palette = isLight
        ? DAYLIGHT_PALETTE
        : (['#FFFFFF', '#D2FF28', nonPurpleCss(false, hBase, 1), nonPurpleCss(false, 42, 1)] as const);

      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU + (Math.random() - 0.5) * 0.08;
        spikes.push({
          angle: a,
          speed: minDim * (0.78 + Math.random() * 0.88),
          length: minDim * (0.14 + Math.random() * 0.24),
          baseWidth: 2.2 + Math.random() * 5.0,
          life: 0,
          maxLife: 0.36 + Math.random() * 0.28,
          color: palette[i % palette.length]!,
          speedLine: false,
        });
      }
      for (let i = 0; i < 44; i++) {
        const a = Math.random() * TAU;
        spikes.push({
          angle: a,
          speed: minDim * (1.05 + Math.random() * 0.95),
          length: minDim * (0.14 + Math.random() * 0.26),
          baseWidth: 0.9 + Math.random() * 1.4,
          life: 0,
          maxLife: 0.3 + Math.random() * 0.26,
          color: palette[(i + 1) % palette.length]!,
          speedLine: true,
        });
      }

      // 200+ high-velocity glowing particle sparks & streaks decaying cleanly within ~1.15s
      const startR = minDim * 0.085;
      for (let i = 0; i < 204; i++) {
        const a = Math.random() * TAU;
        const speed = minDim * (0.36 + Math.pow(Math.random(), 0.72) * 1.58);
        sparks.push({
          x: cx + Math.cos(a) * startR,
          y: cy + Math.sin(a) * startR,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          drag: 2.0 + Math.random() * 1.7,
          curl: (Math.random() - 0.5) * 1.5,
          life: 0,
          maxLife: 0.48 + Math.random() * 0.64,
          size: 1.4 + Math.random() * 2.6,
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
      const hBase = st.accentHue;

      // Clear any lingering outbound explosion spikes/sparks immediately on implode
      spikes.length = 0;
      sparks.length = 0;

      // 2 collapsing concentric implosion rings strictly inside viewport
      waves.push(
        {
          age: 0,
          duration: 0.58,
          maxR: safeMaxR,
          kind: 'implode',
          color: isLight ? '#0A0A0B' : '#D2FF28',
          rotSpeed: 1.5,
          startAngle: 0,
        },
        {
          age: -0.08,
          duration: 0.54,
          maxR: safeMaxR * 0.74,
          kind: 'implode',
          color: isLight ? '#D94E00' : nonPurpleCss(false, hBase, 1),
          rotSpeed: -1.8,
          startAngle: 1.1,
        },
      );

      // 140 vortex sparks spiraling violently inward into the event horizon
      const cols = isLight
        ? DAYLIGHT_PALETTE
        : (['#FFFFFF', '#D2FF28', nonPurpleCss(false, hBase, 1), nonPurpleCss(false, 42, 1)] as const);

      for (let i = 0; i < 140; i++) {
        vortex.push({
          angle: Math.random() * TAU,
          radius: minDim * (0.24 + Math.random() * 0.36),
          radialSpeed: minDim * (0.62 + Math.random() * 0.76),
          angSpeed: 3.6 + Math.random() * 4.2,
          life: 0,
          maxLife: 0.48 + Math.random() * 0.34,
          size: 1.4 + Math.random() * 2.2,
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

      // 1. Subtle 1px orbital guide hairlines STRICTLY clamped within viewport bounds (>= 24px margin)
      if (guideScale > 0.04) {
        const isDesktop = cssW >= 1024;
        const maxRx = Math.max(24, Math.min(cx, cssW - cx) - 24);
        const maxRy = Math.max(24, Math.min(cy, cssH - cy) - 24);

        // Derive actual orbital ring radii from nodes if present, otherwise safe proportions
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
        // Ultra-refined 1px inner & outer orbital hairlines (ZERO giant clipped circles!)
        ctx.strokeStyle = isLight
          ? `rgba(10,10,11,${(0.14 * gAlpha).toFixed(3)})`
          : `rgba(210,255,40,${(0.13 * gAlpha).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -timeSec * 10;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx1, ry1, 0, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = isLight
          ? `rgba(10,10,11,${(0.11 * gAlpha).toFixed(3)})`
          : `rgba(210,255,40,${(0.1 * gAlpha).toFixed(3)})`;
        ctx.setLineDash([2, 8]);
        ctx.lineDashOffset = timeSec * 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx2, ry2, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        // Crisp inset cardinal ticks on outer track (strictly inward so never clips!)
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

      // 2. Live radial vector tethers from photon ring to orbiting worlds
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
        const dx = tx - cx;
        const dy = ty - cy;
        const dist = Math.hypot(dx, dy);
        if (dist <= coreEdge + 8) continue;

        const sx = cx + (dx / dist) * coreEdge;
        const sy = cy + (dy / dist) * coreEdge;

        ctx.strokeStyle = isLight ? 'rgba(10,10,11,0.13)' : nonPurpleCss(false, n.hue, 0.15);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.fillStyle = isLight ? 'rgba(180,83,9,0.55)' : nonPurpleCss(false, n.hue, 0.45);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, TAU);
        ctx.fill();
      }

      // Blazing kinetic telemetry beam + animated data pulses + snapping 4-corner reticle for active/hovered node
      if (activeNode) {
        const tx = activeNode.nx * cssW;
        const ty = activeNode.ny * cssH;
        const dx = tx - cx;
        const dy = ty - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const sx = cx + ux * coreEdge;
        const sy = cy + uy * coreEdge;

        const beamGrad = ctx.createLinearGradient(sx, sy, tx, ty);
        if (isLight) {
          beamGrad.addColorStop(0, 'rgba(217,78,0,0.34)');
          beamGrad.addColorStop(0.55, 'rgba(180,83,9,0.44)');
          beamGrad.addColorStop(1, 'rgba(10,10,11,0.68)');
        } else {
          beamGrad.addColorStop(0, 'rgba(210,255,40,0.42)');
          beamGrad.addColorStop(0.55, nonPurpleCss(false, activeNode.hue, 0.56));
          beamGrad.addColorStop(1, '#FFFFFF');
        }

        ctx.save();
        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.strokeStyle = isLight ? '#D94E00' : '#D2FF28';
        ctx.lineWidth = 1.45;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // 4 animated traveling data-pulse pips along telemetry beam
        for (let k = 0; k < 4; k++) {
          const u = (timeSec * 0.95 + k * 0.25) % 1;
          const px = sx + (tx - sx) * u;
          const py = sy + (ty - sy) * u;
          ctx.strokeStyle = isLight ? '#0A0A0B' : '#FFFFFF';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(px - ux * 6.5, py - uy * 6.5);
          ctx.lineTo(px + ux * 6.5, py + uy * 6.5);
          ctx.stroke();
        }

        ctx.fillStyle = isLight ? '#D94E00' : '#D2FF28';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, TAU);
        ctx.fill();

        // Snapping Flash 4-corner targeting reticle around hovered pod
        const lockT = clamp(st.hoverLockAge / 0.2, 0, 1);
        const snapEase = 1 - Math.pow(1 - lockT, 3);
        const expand = (1 - snapEase) * 18;
        const hw = (activeNode.ring === 'inner' ? 92 : 68) + expand;
        const hh = (activeNode.ring === 'inner' ? 54 : 24) + expand;
        const arm = activeNode.ring === 'inner' ? 11 : 8;

        ctx.strokeStyle = isLight ? '#0A0A0B' : '#D2FF28';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.moveTo(tx - hw, ty - hh + arm); ctx.lineTo(tx - hw, ty - hh); ctx.lineTo(tx - hw + arm, ty - hh);
        ctx.moveTo(tx + hw - arm, ty - hh); ctx.lineTo(tx + hw, ty - hh); ctx.lineTo(tx + hw, ty - hh + arm);
        ctx.moveTo(tx + hw, ty + hh - arm); ctx.lineTo(tx + hw, ty + hh); ctx.lineTo(tx + hw - arm, ty + hh);
        ctx.moveTo(tx - hw + arm, ty + hh); ctx.lineTo(tx - hw, ty + hh); ctx.lineTo(tx - hw, ty + hh - arm);
        ctx.stroke();
        ctx.restore();
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

      // Snappy spring-in for orbital guide hairlines
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

      // 1. Delicate accretion micro-motes tightly bound to the photon ring (ZERO streaks across outer viewport!)
      const coreR = minD * (st.exploded ? 0.116 : 0.156);
      const moteCount = st.exploded ? 14 : ambient.length;
      for (let i = 0; i < moteCount; i++) {
        const m = ambient[i]!;
        const pull = 0.24 + 0.35 / Math.max(0.8, m.rMult);
        m.rMult -= pull * m.speed * dt;
        m.angle += (1.1 + 0.85 / Math.max(0.9, m.rMult)) * m.speed * dt;
        if (m.rMult <= 1.04) {
          m.rMult = 1.68 + Math.random() * 0.42;
          m.angle = Math.random() * TAU;
        }
        const rad = coreR * m.rMult;
        const px = cx + Math.cos(m.angle) * rad * 1.12;
        const py = cy + Math.sin(m.angle) * rad * 0.96;
        const fade = clamp(1 - (m.rMult - 1.04) / 1.05, 0.05, 0.72) * clamp((m.rMult - 1.02) * 8, 0, 1);

        ctx.fillStyle = isLight
          ? i % 2 === 0
            ? `rgba(217,78,0,${(fade * 0.65).toFixed(3)})`
            : `rgba(10,10,11,${(fade * 0.45).toFixed(3)})`
          : i % 3 === 0
            ? `rgba(210,255,40,${(fade * 0.68).toFixed(3)})`
            : `rgba(255,224,160,${(fade * 0.62).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, m.size, 0, TAU);
        ctx.fill();
      }

      // 2. Refined orbital guide hairlines & live radial world tethers
      drawGuidesAndTethers(elapsed, st.guidesScale);

      // 3. Brief Flash keyframe detonation flash
      if (st.flashAlpha > 0.01) {
        st.flashAlpha *= Math.exp(-dt * 15);
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, minD * 0.5);
        fg.addColorStop(
          0,
          isLight
            ? `rgba(255,245,214,${st.flashAlpha.toFixed(3)})`
            : `rgba(255,255,255,${st.flashAlpha.toFixed(3)})`,
        );
        fg.addColorStop(
          0.35,
          isLight
            ? `rgba(217,78,0,${(st.flashAlpha * 0.35).toFixed(3)})`
            : `rgba(210,255,40,${(st.flashAlpha * 0.42).toFixed(3)})`,
        );
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy, minD * 0.5, 0, TAU);
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
          ctx.globalAlpha = Math.sin(u * Math.PI) * 0.88;
          ctx.strokeStyle = wv.color;
          ctx.lineWidth = 1.4 + u * 3.2;
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
            ctx.lineWidth = Math.max(0.8, (1 - u) * 4.8);
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, TAU);
            ctx.stroke();
          } else if (wv.kind === 'secondary') {
            ctx.lineWidth = Math.max(0.75, (1 - u) * 1.8);
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, TAU);
            ctx.stroke();
          } else {
            ctx.lineWidth = Math.max(1.2, (1 - u) * 5.2);
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

      // 5. Visceral triangular Flash starburst spikes & radial speed-lines
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
        const alpha = Math.pow(1 - u, 1.25);

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
          ctx.lineTo(Math.max(0, dist - len * 0.35), 0);
          ctx.lineTo(Math.max(0, dist - len * 0.55), bw);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // 6. 200+ glowing explosion sparks & streaks
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

        ctx.globalAlpha = Math.pow(1 - u, 1.2);
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

      // 7. 140+ vortex implosion sparks spiraling violently down into the singularity
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
      <canvas ref={canvasRef} className="absolute inset-0 size-full block" />
    </div>
  );
}
