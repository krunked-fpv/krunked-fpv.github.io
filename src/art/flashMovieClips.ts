import { nonPurpleRgb, remapHue } from './color';
import type { ArtTheme } from '../types/project';

export const FLASH_FPS = 24;
export const FLASH_TOTAL_FRAMES = 144;
export const FLASH_PRELOADER_FRAMES = 30;

const TAU = Math.PI * 2;
const BEZIER_K = 0.5522847498;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Classic Macromedia Flash overshoot ease-out (snappy UI & symbol pop). */
export function easeBackOut(t: number, overshoot = 1.70158): number {
  const x = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

/** Classic Flash elastic bounce ease-out. */
export function easeElasticOut(t: number, period = 0.34): number {
  const x = clamp(t, 0, 1);
  if (x <= 0 || x >= 1) return x;
  const s = period / 4;
  return Math.pow(2, -10 * x) * Math.sin(((x - s) * TAU) / period) + 1;
}

/** Razor-fast Flash exponential deceleration. */
export function easeExpoOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/** Silky Flash quartic S-curve for Motion Guides and orbital sweeps. */
export function easeQuartInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}

export interface SteppedClock {
  /** Monotonic integer frame index at target fps */
  frameIndex: number;
  /** 1-based frame counter in [1..totalFrames] */
  frameInLoop: number;
  /** Fractional progress within current frame [0..1) */
  subFrame: number;
  /** Quantized time in seconds snapped to target fps */
  quantizedTime: number;
}

/** Classic 24fps (or 12fps on-twos) Flash MovieClip frame stepper. */
export function stepFlashFrame(
  timeSec: number,
  fps = FLASH_FPS,
  totalFrames = FLASH_TOTAL_FRAMES,
): SteppedClock {
  const raw = Math.max(0, timeSec) * fps;
  const frameIndex = Math.floor(raw);
  const subFrame = raw - frameIndex;
  const frameInLoop = (frameIndex % totalFrames) + 1;
  return {
    frameIndex,
    frameInLoop,
    subFrame,
    quantizedTime: frameIndex / fps,
  };
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface BezierSample {
  x: number;
  y: number;
  dx: number;
  dy: number;
  angle: number;
  curvature: number;
}

/** Evaluates a quadratic Bezier curve with tangent angle and signed curvature. */
export function evalQuadBezier(p0: Vec2, p1: Vec2, p2: Vec2, rawT: number): BezierSample {
  const t = clamp(rawT, 0, 1);
  const mt = 1 - t;
  const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
  const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
  const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  const ddx = 2 * (p2.x - 2 * p1.x + p0.x);
  const ddy = 2 * (p2.y - 2 * p1.y + p0.y);
  const speed = Math.hypot(dx, dy) || 1;
  const curvature = (dx * ddy - dy * ddx) / (speed * speed * speed);
  return { x, y, dx, dy, angle: Math.atan2(dy, dx), curvature };
}

export interface CubicSegment {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p3: Vec2;
}

/** Evaluates a cubic Bezier segment with exact tangent angle and signed curvature. */
export function evalCubicBezier(seg: CubicSegment, rawT: number): BezierSample {
  const t = clamp(rawT, 0, 1);
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const { p0, c1, c2, p3 } = seg;

  const x = mt2 * mt * p0.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t2 * t * p3.x;
  const y = mt2 * mt * p0.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t2 * t * p3.y;

  const dx = 3 * mt2 * (c1.x - p0.x) + 6 * mt * t * (c2.x - c1.x) + 3 * t2 * (p3.x - c2.x);
  const dy = 3 * mt2 * (c1.y - p0.y) + 6 * mt * t * (c2.y - c1.y) + 3 * t2 * (p3.y - c2.y);

  const ddx = 6 * mt * (c2.x - 2 * c1.x + p0.x) + 6 * t * (p3.x - 2 * c2.x + c1.x);
  const ddy = 6 * mt * (c2.y - 2 * c1.y + p0.y) + 6 * t * (p3.y - 2 * c2.y + c1.y);

  const speed = Math.hypot(dx, dy) || 1;
  const curvature = (dx * ddy - dy * ddx) / (speed * speed * speed);
  return { x, y, dx, dy, angle: Math.atan2(dy, dx), curvature };
}

export interface FlashThemePalette {
  isLight: boolean;
  ink: string;
  rim: string;
  primary: string;
  secondary: string;
  tertiary: string;
  amber: string;
  specular: string;
  bodyLit: string;
  bodyMid: string;
  bodyShade: string;
  bodyEdge: string;
  canopyBase: string;
  canopyDeep: string;
  onionPast: string;
  onionFuture: string;
  guideStroke: string;
  guideAnchor: string;
  guideHandle: string;
  accentCss: (alpha?: number) => string;
  veilCss: (alpha: number) => string;
}

/** Dual-theme Flash cel-shading palette (Obsidian + Acid Lime / Solar Eclipse Ivory + Vermilion + Ink). */
export function makeFlashPalette(theme: ArtTheme, accentHue: number): FlashThemePalette {
  const isLight = theme === 'daylight';
  const safeHue = remapHue(accentHue);
  const [ar, ag, ab] = nonPurpleRgb(isLight ? 0.44 : 0.78, isLight ? 0.165 : 0.185, safeHue);

  const accentCss = (alpha = 1): string =>
    alpha >= 1
      ? `rgb(${ar} ${ag} ${ab})`
      : `rgb(${ar} ${ag} ${ab} / ${Number(clamp(alpha, 0, 1).toFixed(4))})`;

  if (isLight) {
    return {
      isLight: true,
      ink: '#0A0A0B',
      rim: '#0A0A0B',
      primary: '#D94E00',
      secondary: '#006B8F',
      tertiary: '#15803D',
      amber: '#B45309',
      specular: '#FFFFFF',
      bodyLit: '#FAF8F2',
      bodyMid: '#E3DEC8',
      bodyShade: '#C4BDA5',
      bodyEdge: '#0A0A0B',
      canopyBase: '#00779E',
      canopyDeep: '#04384D',
      onionPast: '#006B8F',
      onionFuture: '#D94E00',
      guideStroke: 'rgba(10, 10, 11, 0.46)',
      guideAnchor: '#D94E00',
      guideHandle: '#006B8F',
      accentCss,
      veilCss: (a: number) => `rgba(245, 243, 236, ${clamp(a, 0, 1).toFixed(3)})`,
    };
  }

  return {
    isLight: false,
    ink: '#050608',
    rim: '#F5F3EC',
    primary: '#D2FF28',
    secondary: '#00D4FF',
    tertiary: '#2EE59D',
    amber: '#FF9500',
    specular: '#FFFFFF',
    bodyLit: '#2B323F',
    bodyMid: '#181D26',
    bodyShade: '#0C0F14',
    bodyEdge: '#F0F3ED',
    canopyBase: '#00D4FF',
    canopyDeep: '#00516B',
    onionPast: '#00D4FF',
    onionFuture: '#D2FF28',
    guideStroke: 'rgba(0, 212, 255, 0.56)',
    guideAnchor: '#D2FF28',
    guideHandle: '#00D4FF',
    accentCss,
    veilCss: (a: number) => `rgba(3, 4, 7, ${clamp(a, 0, 1).toFixed(3)})`,
  };
}

export interface OrbitalGuideGeometry {
  cx: number;
  cy: number;
  rHorizon: number;
  orbitR: number;
  roll: number;
  pitch: number;
  camD: number;
  segments: readonly [CubicSegment, CubicSegment, CubicSegment, CubicSegment];
}

function projectOrbitPoint(
  cx: number,
  cy: number,
  orbitR: number,
  roll: number,
  pitch: number,
  camD: number,
  theta: number,
): { x: number; y: number; dx: number; dy: number; zNorm: number; persp: number } {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);

  const lx = orbitR * cosT;
  const ly = orbitR * sinT * sinP;
  const lz = orbitR * sinT * cosP;

  const dlx = -orbitR * sinT;
  const dly = orbitR * cosT * sinP;
  const dlz = orbitR * cosT * cosP;

  const denom = Math.max(orbitR * 0.6, camD - lz);
  const persp = camD / denom;
  const dPersp = (camD * dlz) / (denom * denom);

  const sx = lx * persp;
  const sy = ly * persp;
  const dsx = dlx * persp + lx * dPersp;
  const dsy = dly * persp + ly * dPersp;

  return {
    x: cx + sx * cosR - sy * sinR,
    y: cy + sx * sinR + sy * cosR,
    dx: dsx * cosR - dsy * sinR,
    dy: dsx * sinR + dsy * cosR,
    zNorm: sinT,
    persp,
  };
}

/**
 * Builds the tilted 3D-foreshortened elliptical Flash Motion Guide as 4 exact cubic Bezier segments.
 * Front half (sin > 0) pitches smoothly below the core button; back half (sin < 0) ducks behind the
 * event horizon sphere so the FPV interceptor genuinely passes behind and in front of the black hole.
 */
export function buildOrbitalBezierGuide(
  cx: number,
  cy: number,
  rHorizon: number,
  explodedMix: number,
  hoverMix: number,
  boostPulse: number,
): OrbitalGuideGeometry {
  const baseMult = lerp(2.28, 2.02, explodedMix);
  const coilMult = 1 - hoverMix * 0.08 * (1 - explodedMix * 0.5) + boostPulse * 0.24;
  const orbitR = rHorizon * baseMult * coilMult;
  const roll = -0.22 + boostPulse * 0.09;
  const pitch = lerp(0.41, 0.45, explodedMix);
  const camD = orbitR * 3.1;

  const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5] as const;
  const pts = angles.map((a) => projectOrbitPoint(cx, cy, orbitR, roll, pitch, camD, a));

  const makeSeg = (i: number): CubicSegment => {
    const a = pts[i]!;
    const b = pts[(i + 1) % 4]!;
    return {
      p0: { x: a.x, y: a.y },
      c1: { x: a.x + a.dx * BEZIER_K, y: a.y + a.dy * BEZIER_K },
      c2: { x: b.x - b.dx * BEZIER_K, y: b.y - b.dy * BEZIER_K },
      p3: { x: b.x, y: b.y },
    };
  };

  return {
    cx,
    cy,
    rHorizon,
    orbitR,
    roll,
    pitch,
    camD,
    segments: [makeSeg(0), makeSeg(1), makeSeg(2), makeSeg(3)],
  };
}

export interface ProbePose {
  x: number;
  y: number;
  angle: number;
  zNorm: number;
  inFront: boolean;
  scale: number;
  bank: number;
  stretch: number;
  thrust: number;
  theta: number;
}

/** Evaluates the FPV Orbital Interceptor pose along the 4-segment cubic Bezier Motion Guide. */
export function sampleProbePose(
  guide: OrbitalGuideGeometry,
  cycleT: number,
  hoverMix: number,
  boostPulse: number,
  minDim: number,
): ProbePose {
  const norm = ((cycleT % 1) + 1) % 1;
  const segFloat = norm * 4;
  const segIdx = Math.floor(segFloat) % 4;
  const localT = segFloat - Math.floor(segFloat);
  const seg = guide.segments[segIdx]!;
  const sample = evalCubicBezier(seg, localT);

  const theta = norm * TAU;
  const zNorm = Math.sin(theta);
  const cosP = Math.cos(guide.pitch);
  const lz = guide.orbitR * zNorm * cosP;
  const persp = guide.camD / Math.max(guide.orbitR * 0.6, guide.camD - lz);

  const baseSize = clamp(minDim / 820, 0.72, 1.18);
  const scale = baseSize * (0.82 + (persp - 0.72) * 0.68);
  const bank = clamp(sample.curvature * 135 + zNorm * 0.24 + boostPulse * 0.28, -0.72, 0.72);
  const stretch = 1 + boostPulse * 0.26 + Math.abs(Math.cos(theta)) * 0.05;
  const thrust = 0.85 + hoverMix * 0.45 + boostPulse * 1.35 + (zNorm > 0 ? 0.14 : 0);

  return {
    x: sample.x,
    y: sample.y,
    angle: sample.angle,
    zNorm,
    inFront: zNorm >= -0.04,
    scale,
    bank,
    stretch,
    thrust,
    theta,
  };
}

export type GhostRenderMode = 'solid' | 'onion-past' | 'onion-future' | 'smear';

/**
 * MovieClip A: Sleek cel-shaded Flash FPV Delta-Wing Orbital Interceptor Probe.
 * Features flat 2-tone cel planes, razor ink/rim contours, hard glossy cyan canopy specular wedge,
 * articulated elevon flaps, banking wing foreshortening, squash-and-stretch, and 12fps cel thruster flames.
 */
export function drawInterceptorProbeClip(
  ctx: CanvasRenderingContext2D,
  pose: ProbePose,
  palette: FlashThemePalette,
  frame24: number,
  mode: GhostRenderMode = 'solid',
  alpha = 1,
): void {
  const portScale = 1 - pose.bank * 0.32;
  const stbdScale = 1 + pose.bank * 0.32;
  const spineShift = pose.bank * 2.1;
  const flapDeflect = pose.bank * 2.4;
  const flickerStep = Math.floor(frame24 / 2);
  const flamePulse = 0.84 + ((flickerStep * 37) % 5) * 0.09;
  const flameLen = (15 + pose.thrust * 13) * flamePulse;

  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.scale(pose.scale * pose.stretch, pose.scale / Math.sqrt(pose.stretch));
  ctx.globalAlpha = clamp(alpha, 0, 1);

  if (mode !== 'solid') {
    const ghostCol =
      mode === 'onion-future'
        ? palette.onionFuture
        : mode === 'smear'
          ? palette.primary
          : palette.onionPast;

    // Classic Macromedia Flash onion-skin translucent fill + razor vector wireframe silhouette
    ctx.beginPath();
    ctx.moveTo(23, 0);
    ctx.lineTo(7, 4.6 * stbdScale);
    ctx.lineTo(-10, 19.5 * stbdScale);
    ctx.lineTo(-15.5, 16.2 * stbdScale);
    ctx.lineTo(-11.8, 5.2 * stbdScale);
    ctx.lineTo(-15, 2.5 * stbdScale);
    ctx.lineTo(-15, -2.5 * portScale);
    ctx.lineTo(-11.8, -5.2 * portScale);
    ctx.lineTo(-15.5, -16.2 * portScale);
    ctx.lineTo(-10, -19.5 * portScale);
    ctx.lineTo(7, -4.6 * portScale);
    ctx.closePath();

    ctx.fillStyle = ghostCol;
    ctx.save();
    ctx.globalAlpha = clamp(alpha * (mode === 'smear' ? 0.28 : 0.32), 0, 1);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = ghostCol;
    ctx.lineWidth = mode === 'smear' ? 1.15 : 1.7;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner canopy & spine wireframe details so onion-skin ghosts read unmistakably as Flash symbols
    ctx.beginPath();
    ctx.moveTo(21, 0);
    ctx.lineTo(-14, 0);
    ctx.moveTo(11.5, spineShift * 0.4);
    ctx.lineTo(4.2, spineShift + 3.1 * stbdScale);
    ctx.lineTo(-4.2, spineShift);
    ctx.lineTo(4.2, spineShift - 3.1 * portScale);
    ctx.closePath();
    ctx.lineWidth = 1.15;
    ctx.stroke();

    ctx.restore();
    return;
  }

  // 1. Wingtip calligraphic vapor ribbons (tapered vector streaks)
  const vaporLen = 14 + pose.thrust * 12;
  for (const side of [-1, 1] as const) {
    const sc = side < 0 ? portScale : stbdScale;
    const wy = side * 18.2 * sc;
    ctx.beginPath();
    ctx.moveTo(-11.5, wy);
    ctx.quadraticCurveTo(-11.5 - vaporLen * 0.5, wy + side * 1.4, -11.5 - vaporLen, wy + side * 0.4);
    ctx.quadraticCurveTo(-11.5 - vaporLen * 0.45, wy - side * 0.6, -11.5, wy - side * 1.1);
    ctx.closePath();
    ctx.fillStyle = palette.isLight ? 'rgba(217,78,0,0.34)' : 'rgba(0,212,255,0.44)';
    ctx.fill();
  }

  // 2. Twin 12fps flickering cel-shaded plasma thruster flames
  for (const side of [-1, 1] as const) {
    const sc = side < 0 ? portScale : stbdScale;
    const ty = side * 4.1 * sc;
    const outerW = (2.8 + pose.thrust * 0.8) * (0.85 + ((flickerStep + (side > 0 ? 1 : 0)) % 2) * 0.22);

    // Outer cel flame silhouette
    ctx.beginPath();
    ctx.moveTo(-12.5, ty - outerW * 0.65);
    ctx.lineTo(-12.5 - flameLen * 0.42, ty - outerW);
    ctx.lineTo(-12.5 - flameLen, ty);
    ctx.lineTo(-12.5 - flameLen * 0.42, ty + outerW);
    ctx.lineTo(-12.5, ty + outerW * 0.65);
    ctx.closePath();
    ctx.fillStyle = pose.thrust > 1.55 ? palette.amber : palette.primary;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner blazing cel core needle
    ctx.beginPath();
    ctx.moveTo(-12.5, ty - outerW * 0.36);
    ctx.lineTo(-12.5 - flameLen * 0.68, ty);
    ctx.lineTo(-12.5, ty + outerW * 0.36);
    ctx.closePath();
    ctx.fillStyle = palette.specular;
    ctx.fill();

    // Detached 12fps cel plasma diamond puff
    if ((flickerStep + (side > 0 ? 1 : 0)) % 2 === 0) {
      const puffX = -15.5 - flameLen - (flickerStep % 3) * 2.2;
      const ps = 2.1 + pose.thrust * 0.65;
      ctx.beginPath();
      ctx.moveTo(puffX + ps * 1.4, ty);
      ctx.lineTo(puffX, ty - ps * 0.7);
      ctx.lineTo(puffX - ps * 1.4, ty);
      ctx.lineTo(puffX, ty + ps * 0.7);
      ctx.closePath();
      ctx.fillStyle = palette.secondary;
      ctx.fill();
    }
  }

  // 3. Swept Delta Main Wings (2-tone flat cel shading: lit port/top vs shaded starboard/lower)
  // Port wing (upper/lit plane)
  ctx.beginPath();
  ctx.moveTo(11, -1.6 * portScale);
  ctx.lineTo(5.5, -5.8 * portScale);
  ctx.lineTo(-9.5, -19.8 * portScale);
  ctx.lineTo(-15.2, -16.8 * portScale);
  ctx.lineTo(-12.0, -5.8 * portScale);
  ctx.lineTo(-13.5, 0);
  ctx.lineTo(14, 0);
  ctx.closePath();
  ctx.fillStyle = palette.bodyLit;
  ctx.fill();

  // Starboard wing (cel-shaded shadow plane)
  ctx.beginPath();
  ctx.moveTo(11, 1.6 * stbdScale);
  ctx.lineTo(5.5, 5.8 * stbdScale);
  ctx.lineTo(-9.5, 19.8 * stbdScale);
  ctx.lineTo(-15.2, 16.8 * stbdScale);
  ctx.lineTo(-12.0, 5.8 * stbdScale);
  ctx.lineTo(-13.5, 0);
  ctx.lineTo(14, 0);
  ctx.closePath();
  ctx.fillStyle = palette.bodyShade;
  ctx.fill();

  // Bold Flash racing chevron accents on both swept wings
  for (const side of [-1, 1] as const) {
    const sc = side < 0 ? portScale : stbdScale;
    ctx.beginPath();
    ctx.moveTo(-2.5, side * 8.2 * sc);
    ctx.lineTo(-7.8, side * 15.8 * sc);
    ctx.lineTo(-11.2, side * 14.2 * sc);
    ctx.lineTo(-6.2, side * 7.2 * sc);
    ctx.closePath();
    ctx.fillStyle = side < 0 ? palette.primary : palette.amber;
    ctx.fill();
  }

  // Articulated rear elevon flaps deflecting subtly with banking
  for (const side of [-1, 1] as const) {
    const sc = side < 0 ? portScale : stbdScale;
    ctx.beginPath();
    ctx.moveTo(-11.8, side * 6.4 * sc);
    ctx.lineTo(-14.6, side * 14.5 * sc);
    ctx.lineTo(-16.2 + flapDeflect * 0.25 * side, side * 13.4 * sc);
    ctx.lineTo(-13.6, side * 6.0 * sc);
    ctx.closePath();
    ctx.fillStyle = palette.secondary;
    ctx.fill();
  }

  // Outer wing razor contour (crisp bright rim on obsidian, deep archival ink on daylight)
  ctx.beginPath();
  ctx.moveTo(23.5, 0);
  ctx.lineTo(11, -2.8 * portScale);
  ctx.lineTo(5.5, -5.8 * portScale);
  ctx.lineTo(-9.5, -19.8 * portScale);
  ctx.lineTo(-15.2, -16.8 * portScale);
  ctx.lineTo(-12.0, -5.8 * portScale);
  ctx.lineTo(-14.2, -2.5 * portScale);
  ctx.lineTo(-14.2, 2.5 * stbdScale);
  ctx.lineTo(-12.0, 5.8 * stbdScale);
  ctx.lineTo(-15.2, 16.8 * stbdScale);
  ctx.lineTo(-9.5, 19.8 * stbdScale);
  ctx.lineTo(5.5, 5.8 * stbdScale);
  ctx.lineTo(11, 2.8 * stbdScale);
  ctx.closePath();
  ctx.strokeStyle = palette.bodyEdge;
  ctx.lineWidth = palette.isLight ? 2.1 : 1.75;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 4;
  ctx.stroke();

  // 4. Sculpted Aerospace Fuselage Spine + Nosecone
  ctx.beginPath();
  ctx.moveTo(23.5, 0);
  ctx.lineTo(10.5, spineShift - 3.6 * portScale);
  ctx.lineTo(-11.5, spineShift - 4.4 * portScale);
  ctx.lineTo(-14.2, spineShift);
  ctx.lineTo(-11.5, spineShift + 4.4 * stbdScale);
  ctx.lineTo(10.5, spineShift + 3.6 * stbdScale);
  ctx.closePath();
  ctx.fillStyle = palette.bodyMid;
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Hard flat cel highlight strip along lit fuselage nose
  ctx.beginPath();
  ctx.moveTo(22.2, 0);
  ctx.lineTo(11.2, spineShift - 2.4 * portScale);
  ctx.lineTo(8.5, spineShift - 0.4);
  ctx.closePath();
  ctx.fillStyle = palette.specular;
  ctx.save();
  ctx.globalAlpha = alpha * (palette.isLight ? 0.85 : 0.72);
  ctx.fill();
  ctx.restore();

  // 5. Iconic Flash Glossy Canopy Visor (hard-edged vector glass + razor specular wedge)
  ctx.beginPath();
  ctx.moveTo(12.2, spineShift * 0.6);
  ctx.lineTo(4.8, spineShift - 3.4 * portScale);
  ctx.lineTo(-3.8, spineShift - 1.9 * portScale);
  ctx.lineTo(-5.8, spineShift);
  ctx.lineTo(-3.8, spineShift + 1.9 * stbdScale);
  ctx.lineTo(4.8, spineShift + 3.4 * stbdScale);
  ctx.closePath();
  ctx.fillStyle = palette.canopyDeep;
  ctx.fill();

  // Lit upper half of canopy
  ctx.beginPath();
  ctx.moveTo(12.2, spineShift * 0.6);
  ctx.lineTo(4.8, spineShift - 3.4 * portScale);
  ctx.lineTo(-3.8, spineShift - 1.9 * portScale);
  ctx.lineTo(-4.8, spineShift + 0.3);
  ctx.lineTo(5.6, spineShift + 0.5);
  ctx.closePath();
  ctx.fillStyle = palette.canopyBase;
  ctx.fill();

  // Signature Macromedia Flash hard diagonal white specular highlight wedge!
  ctx.beginPath();
  ctx.moveTo(9.8, spineShift - 0.5);
  ctx.lineTo(5.2, spineShift - 2.6 * portScale);
  ctx.lineTo(0.8, spineShift - 2.1 * portScale);
  ctx.lineTo(4.4, spineShift - 0.3);
  ctx.closePath();
  ctx.fillStyle = palette.specular;
  ctx.fill();

  // Canopy ink outline
  ctx.beginPath();
  ctx.moveTo(12.2, spineShift * 0.6);
  ctx.lineTo(4.8, spineShift - 3.4 * portScale);
  ctx.lineTo(-3.8, spineShift - 1.9 * portScale);
  ctx.lineTo(-5.8, spineShift);
  ctx.lineTo(-3.8, spineShift + 1.9 * stbdScale);
  ctx.lineTo(4.8, spineShift + 3.4 * stbdScale);
  ctx.closePath();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 6. Twin Canted Tail Stabilizer Fins
  for (const side of [-1, 1] as const) {
    const sc = side < 0 ? portScale : stbdScale;
    ctx.beginPath();
    ctx.moveTo(-6.2, side * 3.1 * sc + spineShift);
    ctx.lineTo(-13.8, side * 7.8 * sc + spineShift);
    ctx.lineTo(-15.8, side * 5.2 * sc + spineShift);
    ctx.lineTo(-12.2, side * 2.4 * sc + spineShift);
    ctx.closePath();
    ctx.fillStyle = side < 0 ? palette.bodyLit : palette.bodyShade;
    ctx.fill();
    ctx.strokeStyle = palette.bodyEdge;
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }

  // 7. 12fps Navigation Wingtip Strobe
  if (flickerStep % 3 === 0) {
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(-11.4, -18.2 * portScale, 2.0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = palette.secondary;
    ctx.beginPath();
    ctx.arc(-11.4, 18.2 * stbdScale, 1.8, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

export interface PlasmaWhipSpec {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number;
  startAngle: number;
  arcSpan: number;
  maxWidth: number;
  fillColor: string;
  highlightColor: string;
  inkColor: string;
  alpha: number;
}

/**
 * MovieClip B: Tapered calligraphic Flash 8 sakuga cel-shaded plasma ribbon.
 * Draws a thick curved belly tapering cleanly to razor needle tips, with an offset flat cel
 * highlight stripe and crisp ink contour.
 */
export function drawCalligraphicPlasmaWhip(
  ctx: CanvasRenderingContext2D,
  spec: PlasmaWhipSpec,
  onionColor?: string,
): void {
  const steps = 18;
  const cosT = Math.cos(spec.tilt);
  const sinT = Math.sin(spec.tilt);

  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  const hiUpper: Vec2[] = [];
  const hiLower: Vec2[] = [];

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = spec.startAngle + spec.arcSpan * u;
    const lx = Math.cos(a) * spec.rx;
    const ly = Math.sin(a) * spec.ry;
    const px = spec.cx + lx * cosT - ly * sinT;
    const py = spec.cy + lx * sinT + ly * cosT;

    // Analytic tangent along tilted ellipse
    const dlx = -Math.sin(a) * spec.rx;
    const dly = Math.cos(a) * spec.ry;
    const tx = dlx * cosT - dly * sinT;
    const ty = dlx * sinT + dly * cosT;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;

    // Asymmetric calligraphic taper: sharper leading needle, lush mid-belly, sleek trailing tail
    const belly = Math.pow(Math.sin(u * Math.PI), 1.28) * (0.72 + 0.42 * Math.sin(u * Math.PI * 0.72));
    const halfW = spec.maxWidth * 0.5 * belly;

    upper.push({ x: px + nx * halfW, y: py + ny * halfW });
    lower.push({ x: px - nx * halfW, y: py - ny * halfW });

    const hiW = halfW * 0.36;
    const hiShift = halfW * 0.34;
    hiUpper.push({ x: px + nx * (hiShift + hiW), y: py + ny * (hiShift + hiW) });
    hiLower.push({ x: px + nx * (hiShift - hiW), y: py + ny * (hiShift - hiW) });
  }

  ctx.save();
  ctx.globalAlpha = clamp(spec.alpha, 0, 1);

  ctx.beginPath();
  ctx.moveTo(upper[0]!.x, upper[0]!.y);
  for (let i = 1; i <= steps; i++) ctx.lineTo(upper[i]!.x, upper[i]!.y);
  for (let i = steps; i >= 0; i--) ctx.lineTo(lower[i]!.x, lower[i]!.y);
  ctx.closePath();

  if (onionColor) {
    ctx.strokeStyle = onionColor;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = onionColor;
    ctx.globalAlpha = clamp(spec.alpha * 0.22, 0, 1);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = spec.fillColor;
  ctx.fill();
  ctx.strokeStyle = spec.inkColor;
  ctx.lineWidth = 1.45;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Hard flat cel highlight stripe along the leading ridge
  ctx.beginPath();
  ctx.moveTo(hiUpper[1]!.x, hiUpper[1]!.y);
  for (let i = 2; i < steps; i++) ctx.lineTo(hiUpper[i]!.x, hiUpper[i]!.y);
  for (let i = steps - 1; i >= 1; i--) ctx.lineTo(hiLower[i]!.x, hiLower[i]!.y);
  ctx.closePath();
  ctx.fillStyle = spec.highlightColor;
  ctx.globalAlpha = clamp(spec.alpha * 0.9, 0, 1);
  ctx.fill();

  ctx.restore();
}

/**
 * MovieClip C: Vector Preloader & Diagonal Iris Mask-Wipe Intro (Frames 1..30, 1.25s).
 * Sleek translucent radial preloader (00% -> 100%), ActionScript lineTo corner construction ticks,
 * 2-frame vector cross-impact flash, and sweeping diagonal Flash vector mask wipe.
 */
export function drawPreloaderIntroClip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rHorizon: number,
  introFrame: number,
  palette: FlashThemePalette,
): void {
  if (introFrame < 1 || introFrame > FLASH_PRELOADER_FRAMES) return;

  ctx.save();

  // Phase 1: Frames 1..18 — Radial vector preloader + ActionScript corner hairlines
  if (introFrame <= 18) {
    const p = clamp((introFrame - 1) / 17, 0, 1);
    const loadEase = easeExpoOut(p);
    const pct = Math.min(100, Math.round(loadEase * 100));

    // Gentle non-blocking translucent veil so the WebGL2 Black Hole shines through
    const veilAlpha = (1 - p * 0.25) * (palette.isLight ? 0.3 : 0.34);
    ctx.fillStyle = palette.veilCss(veilAlpha);
    ctx.fillRect(0, 0, w, h);

    // 4 ActionScript lineTo corner construction hairlines tucked tightly in viewport margin (clear of HUD text)
    const cornerEase = easeBackOut(clamp(p * 1.45, 0, 1), 1.35);
    const pad = 10;
    const arm = 14 * cornerEase;
    ctx.strokeStyle = palette.isLight ? 'rgba(10,10,11,0.58)' : 'rgba(210,255,40,0.68)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(pad, pad + arm); ctx.lineTo(pad, pad); ctx.lineTo(pad + arm, pad);
    // Top-right
    ctx.moveTo(w - pad - arm, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + arm);
    // Bottom-right
    ctx.moveTo(w - pad, h - pad - arm); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad - arm, h - pad);
    // Bottom-left
    ctx.moveTo(pad + arm, h - pad); ctx.lineTo(pad, h - pad); ctx.lineTo(pad, h - pad - arm);
    ctx.stroke();

    // Radial segmented Macromedia preloader ring framing the core
    const ringR = rHorizon * 1.44;
    const segCount = 24;
    const litCount = Math.max(1, Math.round(loadEase * segCount));

    ctx.strokeStyle = palette.isLight ? 'rgba(10,10,11,0.16)' : 'rgba(245,243,236,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR - 9, 0, TAU);
    ctx.stroke();

    for (let i = 0; i < segCount; i++) {
      const a0 = -Math.PI * 0.5 + (i / segCount) * TAU + 0.03;
      const a1 = -Math.PI * 0.5 + ((i + 1) / segCount) * TAU - 0.045;
      const isLit = i < litCount;
      ctx.strokeStyle = isLit
        ? i === litCount - 1
          ? palette.secondary
          : palette.primary
        : palette.isLight
          ? 'rgba(10,10,11,0.12)'
          : 'rgba(245,243,236,0.12)';
      ctx.lineWidth = isLit ? 4.5 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, a0, a1);
      ctx.stroke();
    }

    // Crisp Flash mono vector percentage tag perched above the preloader ring with readability halo
    const labelY = Math.max(76, cy - ringR - 18);
    const loadText = `SWF // STREAM ${String(pct).padStart(2, '0')}%`;
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = palette.isLight ? 'rgba(245,243,236,0.92)' : 'rgba(4,5,8,0.9)';
    ctx.strokeText(loadText, cx, labelY);
    ctx.fillStyle = palette.isLight ? '#0A0A0B' : '#D2FF28';
    ctx.fillText(loadText, cx, labelY);
  } else if (introFrame <= 20) {
    // Phase 2: Frames 19..20 — Crisp 2-frame vector cross-impact flash!
    const isFrame19 = introFrame === 19;
    const crossLen = Math.min(w, h) * (isFrame19 ? 0.44 : 0.52);

    ctx.strokeStyle = isFrame19 ? palette.specular : palette.primary;
    ctx.lineWidth = isFrame19 ? 2.6 : 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - crossLen, cy);
    ctx.lineTo(cx + crossLen, cy);
    ctx.moveTo(cx, cy - crossLen * 0.72);
    ctx.lineTo(cx, cy + crossLen * 0.72);
    ctx.stroke();

    // Octagonal geometric impact frame
    const octR = rHorizon * (isFrame19 ? 1.48 : 1.72);
    ctx.strokeStyle = isFrame19 ? palette.primary : palette.secondary;
    ctx.lineWidth = isFrame19 ? 2.8 : 1.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const vx = cx + Math.cos(a) * octR;
      const vy = cy + Math.sin(a) * octR;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.stroke();
  } else {
    // Phase 3: Frames 21..30 — Sweeping diagonal Flash vector mask wipe slicing cleanly away!
    const wipeP = clamp((introFrame - 20) / 10, 0, 1);
    const sweep = easeExpoOut(wipeP);
    const fade = 1 - Math.pow(wipeP, 1.8);
    const diag = Math.hypot(w, h);
    const bandW = diag * 0.14 * (1 - wipeP * 0.55);
    const offset = sweep * diag * 0.78;

    ctx.translate(cx, cy);
    ctx.rotate(-0.46);
    ctx.globalAlpha = clamp(fade * 0.85, 0, 1);

    for (const dir of [-1, 1] as const) {
      const xEdge = dir * offset;
      const xStart = dir > 0 ? xEdge : xEdge - bandW;

      ctx.fillStyle = palette.veilCss(0.55 * fade);
      ctx.fillRect(xStart, -diag, bandW, diag * 2);

      // Razor acid-lime / vermilion vector leading edge
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 2.4 * (1 - wipeP * 0.4);
      ctx.beginPath();
      ctx.moveTo(xEdge, -diag);
      ctx.lineTo(xEdge, diag);
      ctx.stroke();

      // Secondary cyan / ink parallel hairline
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(xEdge + dir * 7, -diag);
      ctx.lineTo(xEdge + dir * 7, diag);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Draws a vertex-interpolated Flash shape-tween polygon morphing cleanly across
 * Triangle -> Diamond -> Hexagon -> Octagon -> Triangle.
 */
export function drawShapeTweenPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  morphPhase: number,
  rotation: number,
  strokeColor: string,
  fillColor: string | null,
  lineWidth = 1.4,
): void {
  const stages = [3, 4, 6, 8] as const;
  const total = stages.length;
  const norm = (((morphPhase % 1) + 1) % 1) * total;
  const idxA = Math.floor(norm) % total;
  const idxB = (idxA + 1) % total;
  const blend = easeQuartInOut(norm - Math.floor(norm));

  const nA = stages[idxA]!;
  const nB = stages[idxB]!;
  const sampleCount = 24;

  const sampleRegularPoly = (sides: number, u: number): Vec2 => {
    const pos = u * sides;
    const edgeIdx = Math.floor(pos) % sides;
    const edgeT = pos - Math.floor(pos);
    const a0 = (edgeIdx / sides) * TAU;
    const a1 = ((edgeIdx + 1) / sides) * TAU;
    return {
      x: lerp(Math.cos(a0), Math.cos(a1), edgeT),
      y: lerp(Math.sin(a0), Math.sin(a1), edgeT),
    };
  };

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < sampleCount; i++) {
    const u = i / sampleCount;
    const pA = sampleRegularPoly(nA, u);
    const pB = sampleRegularPoly(nB, u);
    const vx = lerp(pA.x, pB.x, blend) * radius;
    const vy = lerp(pA.y, pB.y, blend) * radius;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * MovieClip D1: Sakuga 24fps Detonation Sequence.
 * - Frames 0..1 (83ms): Iconic 2-frame high-contrast cel-ink starburst impact frame!
 * - Frames 2..22: Expanding cel-shaded blast petals, calligraphic swoosh arcs & morphing geometric rings.
 */
export function drawDetonationSakugaClip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rHorizon: number,
  minDim: number,
  burstAge: number,
  palette: FlashThemePalette,
): void {
  if (burstAge <= 0 || burstAge > 0.96) return;
  const stepFrame = Math.floor(burstAge * FLASH_FPS);

  ctx.save();
  ctx.translate(cx, cy);

  // Authentic 2-frame cel-ink Impact Frame (83ms @ 24fps)
  if (stepFrame <= 1) {
    const isF0 = stepFrame === 0;
    const rays = 12;
    const innerR = rHorizon * (isF0 ? 1.02 : 1.18);
    const outerR = rHorizon * (isF0 ? 2.48 : 2.92);

    ctx.beginPath();
    for (let i = 0; i < rays * 2; i++) {
      const a = (i / (rays * 2)) * TAU + (isF0 ? 0.12 : 0.28);
      const isPeak = i % 2 === 0;
      const jitter = isPeak ? 0.82 + ((i * 19) % 7) * 0.065 : 0.94 + ((i * 11) % 5) * 0.03;
      const rad = (isPeak ? outerR : innerR) * jitter;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = isF0
      ? palette.isLight
        ? 'rgba(217, 78, 0, 0.28)'
        : 'rgba(210, 255, 40, 0.24)'
      : palette.isLight
        ? 'rgba(10, 10, 11, 0.16)'
        : 'rgba(245, 243, 236, 0.2)';
    ctx.fill();
    ctx.strokeStyle = isF0 ? palette.primary : palette.specular;
    ctx.lineWidth = isF0 ? 2.6 : 1.9;
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // High-contrast cel crosshatch accent slashes
    ctx.strokeStyle = isF0 ? palette.ink : palette.secondary;
    ctx.lineWidth = 2.0;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + (isF0 ? 0.4 : 0.72);
      const r0 = rHorizon * 1.32;
      const r1 = rHorizon * (isF0 ? 2.85 : 3.25);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }

    ctx.restore();
    return;
  }

  // Frames 2..22: Expanding cel-shaded blast petals + morphing geometric rings + calligraphic slashes
  const u = clamp((stepFrame - 1) / 21, 0, 1);
  const expand = easeExpoOut(u);
  const fade = Math.pow(1 - u, 1.35);

  // 1. 6 cel-shaded curved blast petals blooming outward
  const petalCount = 6;
  const maxPetalR = minDim * 0.44;
  for (let i = 0; i < petalCount; i++) {
    const baseA = (i / petalCount) * TAU + u * 0.42;
    const rad = rHorizon * 1.08 + expand * (maxPetalR - rHorizon);
    const petalLen = (28 + (i % 2) * 14) * (1 - u * 0.58);
    const petalW = (11 + (i % 3) * 3) * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.85) * (1 - u * 0.65);

    ctx.save();
    ctx.rotate(baseA);
    ctx.globalAlpha = fade * 0.88;
    ctx.beginPath();
    ctx.moveTo(rad + petalLen * 0.55, 0);
    ctx.quadraticCurveTo(rad, -petalW, rad - petalLen * 0.5, -petalW * 0.22);
    ctx.quadraticCurveTo(rad - petalLen * 0.15, 0, rad - petalLen * 0.5, petalW * 0.22);
    ctx.quadraticCurveTo(rad, petalW, rad + petalLen * 0.55, 0);
    ctx.closePath();

    ctx.fillStyle = i % 3 === 0 ? palette.primary : i % 3 === 1 ? palette.secondary : palette.amber;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // 2. Two counter-rotating shape-tweened geometric shock rings
  const ringR1 = rHorizon * 1.12 + expand * minDim * 0.36;
  const ringR2 = rHorizon * 1.05 + easeBackOut(clamp(u * 1.15, 0, 1), 1.2) * minDim * 0.28;
  ctx.globalAlpha = fade * 0.72;
  drawShapeTweenPolygon(ctx, 0, 0, ringR1, u * 0.85, u * 1.1, palette.primary, null, 1.9 * (1 - u * 0.5));
  ctx.globalAlpha = fade * 0.52;
  drawShapeTweenPolygon(ctx, 0, 0, ringR2, 0.5 + u * 0.75, -u * 1.4, palette.secondary, null, 1.35 * (1 - u * 0.5));

  // 3. 4 calligraphic swoosh arcs whipping around the blast perimeter
  for (let i = 0; i < 4; i++) {
    const startA = (i / 4) * TAU + 0.35 + u * 1.25;
    drawCalligraphicPlasmaWhip(ctx, {
      cx: 0,
      cy: 0,
      rx: ringR1 * 0.94,
      ry: ringR1 * 0.94,
      tilt: 0,
      startAngle: startA,
      arcSpan: 0.72 * (1 - u * 0.4),
      maxWidth: 7.5 * (1 - u * 0.6),
      fillColor: i % 2 === 0 ? palette.primary : palette.amber,
      highlightColor: palette.specular,
      inkColor: palette.ink,
      alpha: fade * 0.78,
    });
  }

  ctx.restore();
}

/**
 * MovieClip D2: Sakuga 24fps Collapse Vortex Sequence.
 * Swirling hard-outlined cel vortex ribbons snapping into the event horizon!
 */
export function drawCollapseVortexClip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rHorizon: number,
  minDim: number,
  implodeAge: number,
  palette: FlashThemePalette,
): void {
  if (implodeAge <= 0 || implodeAge > 0.74) return;
  const stepFrame = Math.floor(implodeAge * FLASH_FPS);
  const u = clamp(stepFrame / 17, 0, 1);
  const pull = easeQuartInOut(u);
  const alpha = Math.sin(u * Math.PI) * 0.92;

  ctx.save();
  ctx.translate(cx, cy);

  // 8 hard-outlined cel vortex ribbons spiraling smoothly inward
  const ribbons = 8;
  const startR = minDim * 0.42;
  for (let i = 0; i < ribbons; i++) {
    const baseA = (i / ribbons) * TAU + pull * 2.6;
    const headR = lerp(startR, rHorizon * 0.98, pull);
    const tailR = lerp(startR * 1.15, rHorizon * 1.55, pull);
    const steps = 10;

    const left: Vec2[] = [];
    const right: Vec2[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = lerp(tailR, headR, t);
      const a = baseA + t * 0.95;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const w = Math.sin(t * Math.PI) * (5.2 - pull * 2.4);
      left.push({ x: px + nx * w, y: py + ny * w });
      right.push({ x: px - nx * w, y: py - ny * w });
    }

    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.beginPath();
    ctx.moveTo(left[0]!.x, left[0]!.y);
    for (let s = 1; s <= steps; s++) ctx.lineTo(left[s]!.x, left[s]!.y);
    for (let s = steps; s >= 0; s--) ctx.lineTo(right[s]!.x, right[s]!.y);
    ctx.closePath();

    ctx.fillStyle = i % 2 === 0 ? palette.primary : palette.secondary;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  // Final 2-frame snap-ring sealing the singularity
  if (stepFrame >= 14 && stepFrame <= 16) {
    const snapR = rHorizon * (stepFrame === 14 ? 1.24 : stepFrame === 15 ? 1.08 : 1.02);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, snapR, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * MovieClip E1: Shape-Tweened Flash Astrolabe tightly framing the event horizon.
 * Concentric hairline vernier arcs, rotating cel cardinal wedges, 4 morphing shape-tweened
 * polygon glyphs, and delicate Flash stage margin registration hairlines.
 */
export function drawFlashAstrolabeClip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rHorizon: number,
  loopNorm: number,
  hoverMix: number,
  explodedMix: number,
  palette: FlashThemePalette,
  onionSkin: boolean,
): void {
  const outerR = rHorizon * lerp(1.36, 1.38, explodedMix) * (1 - hoverMix * 0.04);
  const innerR = rHorizon * lerp(1.21, 1.22, explodedMix);
  const rotA = loopNorm * TAU;
  const rotB = -loopNorm * TAU * 0.5;

  ctx.save();

  // 1. Subtle concentric vector vernier arcs (non-obstructive, architectural 2Advanced craft)
  ctx.translate(cx, cy);

  ctx.strokeStyle = palette.isLight ? 'rgba(10,10,11,0.22)' : 'rgba(210,255,40,0.24)';
  ctx.lineWidth = 1.1;
  for (let q = 0; q < 4; q++) {
    const a0 = rotA + (q * Math.PI) / 2 + 0.22;
    const a1 = a0 + 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, outerR, a0, a1);
    ctx.stroke();
  }

  // Inner counter-rotating fine dotted hairline arc
  ctx.strokeStyle = palette.isLight ? 'rgba(0,107,143,0.24)' : 'rgba(0,212,255,0.24)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, innerR, rotB, rotB + TAU * 0.85);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Cardinal cel-shaded triangular wedges (with optional onion-skin ghost fan!)
  const drawWedges = (phaseOffset: number, fillCol: string, strokeCol: string, alpha: number) => {
    const rAngle = rotB + phaseOffset;
    const pulseShift = hoverMix * 5;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 4; i++) {
      const a = rAngle + (i * Math.PI) / 2;
      ctx.save();
      ctx.rotate(a);
      const tipX = outerR - 4 - pulseShift;
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(tipX + 9.5, -3.6);
      ctx.lineTo(tipX + 7.2, 0);
      ctx.lineTo(tipX + 9.5, 3.6);
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  if (onionSkin) {
    drawWedges(-0.36, palette.onionPast, palette.onionPast, 0.24);
    drawWedges(-0.18, palette.onionPast, palette.onionPast, 0.42);
    drawWedges(0.18, palette.onionFuture, palette.onionFuture, 0.36);
  }
  drawWedges(0, palette.primary, palette.ink, 0.86);

  // 3. 4 Quadrant Shape-Tweened Morphing Polygon Glyphs (Triangle -> Diamond -> Hex -> Octagon)
  const glyphR = outerR + 14;
  for (let i = 0; i < 4; i++) {
    const a = rotA * 0.5 + (i * Math.PI) / 2 + Math.PI / 4;
    const gx = Math.cos(a) * glyphR;
    const gy = Math.sin(a) * glyphR;
    const phase = loopNorm + i * 0.25;

    if (onionSkin) {
      const aPrev2 = a - 0.38;
      ctx.save();
      ctx.globalAlpha = 0.24;
      drawShapeTweenPolygon(
        ctx,
        Math.cos(aPrev2) * glyphR,
        Math.sin(aPrev2) * glyphR,
        5.8,
        phase - 0.16,
        -aPrev2,
        palette.onionPast,
        null,
        1.1,
      );
      const aPrev1 = a - 0.19;
      ctx.globalAlpha = 0.45;
      drawShapeTweenPolygon(
        ctx,
        Math.cos(aPrev1) * glyphR,
        Math.sin(aPrev1) * glyphR,
        5.8,
        phase - 0.08,
        -aPrev1,
        palette.onionPast,
        null,
        1.25,
      );
      const aNext = a + 0.19;
      ctx.globalAlpha = 0.38;
      drawShapeTweenPolygon(
        ctx,
        Math.cos(aNext) * glyphR,
        Math.sin(aNext) * glyphR,
        5.8,
        phase + 0.08,
        -aNext,
        palette.onionFuture,
        null,
        1.2,
      );
      ctx.restore();
    }

    drawShapeTweenPolygon(
      ctx,
      gx,
      gy,
      5.8 + hoverMix * 1.2,
      phase,
      -a,
      i % 2 === 0 ? palette.primary : palette.secondary,
      palette.isLight ? 'rgba(245,243,236,0.7)' : 'rgba(6,8,12,0.68)',
      1.35,
    );
  }

  ctx.restore();

  // 4. Delicate 2Advanced Flash stage framing hairlines (far left/right & top-center ticks, clear of HUD corners)
  if (w >= 900 && h >= 580) {
    ctx.save();
    ctx.strokeStyle = palette.isLight ? 'rgba(10,10,11,0.14)' : 'rgba(210,255,40,0.15)';
    ctx.lineWidth = 1;
    const tickX = 18;
    const tickHalf = Math.min(18, h * 0.025);
    ctx.beginPath();
    ctx.moveTo(tickX, cy - tickHalf); ctx.lineTo(tickX, cy + tickHalf);
    ctx.moveTo(tickX, cy); ctx.lineTo(tickX + 8, cy);
    ctx.moveTo(w - tickX, cy - tickHalf); ctx.lineTo(w - tickX, cy + tickHalf);
    ctx.moveTo(w - tickX, cy); ctx.lineTo(w - tickX - 8, cy);
    // Subtle top-center stage axis tick
    ctx.moveTo(cx - 14, 16); ctx.lineTo(cx + 14, 16);
    ctx.moveTo(cx, 16); ctx.lineTo(cx, 23);
    ctx.stroke();
    ctx.restore();
  }
}

/** Draws a classic Macromedia Flash MovieClip `+` registration crosshair (hollow circle + cross). */
export function drawRegistrationMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 4.5,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  const arm = radius + 3.5;
  ctx.beginPath();
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
  ctx.restore();
}

/**
 * MovieClip E2: Interactive Macromedia Flash Authoring Guides Overlay (`showGuides === true`).
 * Renders dotted cubic Bezier Motion Guide splines, tangent control levers with hollow circles,
 * solid anchor vertex squares, MovieClip selection bounds, and `+` registration marks.
 */
export function drawMotionGuidesOverlay(
  ctx: CanvasRenderingContext2D,
  guide: OrbitalGuideGeometry,
  probePose: ProbePose,
  palette: FlashThemePalette,
  activeNodePx: Vec2 | null,
): void {
  ctx.save();

  // 1. Classic dotted cubic Bezier Motion Guide path
  ctx.strokeStyle = palette.guideStroke;
  ctx.lineWidth = 1.35;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  const first = guide.segments[0]!;
  ctx.moveTo(first.p0.x, first.p0.y);
  for (let i = 0; i < 4; i++) {
    const s = guide.segments[i]!;
    ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p3.x, s.p3.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Cubic Bezier tangent control handles (hollow circles) & solid anchor vertex squares
  for (let i = 0; i < 4; i++) {
    const s = guide.segments[i]!;

    // Tangent levers
    ctx.strokeStyle = palette.isLight ? 'rgba(0,107,143,0.48)' : 'rgba(0,212,255,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.p0.x, s.p0.y);
    ctx.lineTo(s.c1.x, s.c1.y);
    ctx.moveTo(s.p3.x, s.p3.y);
    ctx.lineTo(s.c2.x, s.c2.y);
    ctx.stroke();

    // Hollow tangent control circles
    for (const cp of [s.c1, s.c2] as const) {
      ctx.fillStyle = palette.isLight ? '#F5F3EC' : '#050608';
      ctx.strokeStyle = palette.guideHandle;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 3.1, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // Solid anchor vertex square
    const sq = 5.4;
    ctx.fillStyle = palette.guideAnchor;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(s.p0.x - sq * 0.5, s.p0.y - sq * 0.5, sq, sq);
    ctx.strokeRect(s.p0.x - sq * 0.5, s.p0.y - sq * 0.5, sq, sq);
  }

  // 3. MovieClip selection box + `+` registration crosshair + mono vector tag on FPV Probe
  const boxR = 26 * probePose.scale;
  ctx.save();
  ctx.translate(probePose.x, probePose.y);
  ctx.strokeStyle = palette.guideHandle;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(-boxR, -boxR * 0.82, boxR * 2, boxR * 1.64);
  ctx.setLineDash([]);

  // Corner transform handles on MovieClip symbol bounds
  ctx.fillStyle = palette.guideAnchor;
  for (const sx of [-boxR, boxR] as const) {
    for (const sy of [-boxR * 0.82, boxR * 0.82] as const) {
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
  }
  drawRegistrationMark(ctx, 0, 0, palette.guideAnchor, 4.2);

  const haloColor = palette.isLight ? 'rgba(245, 243, 236, 0.94)' : 'rgba(4, 5, 8, 0.92)';
  const probeTag = `MC_PROBE_01 // Z:${probePose.zNorm >= 0 ? '+' : ''}${probePose.zNorm.toFixed(2)}`;
  ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = haloColor;
  ctx.strokeText(probeTag, -boxR, -boxR * 0.82 - 4);
  ctx.fillStyle = palette.isLight ? '#0A0A0B' : '#D2FF28';
  ctx.fillText(probeTag, -boxR, -boxR * 0.82 - 4);
  ctx.restore();

  // 4. Singularity horizon axis registration mark perched cleanly on outer cardinal rim
  const coreRegY = guide.cy - guide.rHorizon * 1.42;
  drawRegistrationMark(ctx, guide.cx, coreRegY, palette.guideHandle, 4.6);
  ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = haloColor;
  ctx.strokeText('REG // HORIZON_00', guide.cx + 11, coreRegY);
  ctx.fillStyle = palette.isLight ? '#006B8F' : '#00D4FF';
  ctx.fillText('REG // HORIZON_00', guide.cx + 11, coreRegY);

  // 5. Active orbital node registration crosshair (when exploded & target locked)
  if (activeNodePx) {
    drawRegistrationMark(ctx, activeNodePx.x, activeNodePx.y, palette.guideAnchor, 5);
  }

  ctx.restore();
}
