import { nonPurpleRgb, remapHue, type ArtTheme } from './color';
import { makeNoise } from './noise';
import { mulberry32, range } from './prng';
import type { Ctx2D } from './styles/types';

export interface WorldSceneOpts {
  slug: string;
  seed: number;
  hue: number;
  w: number;
  h: number;
  dpr?: number;
  t?: number;
  theme?: ArtTheme;
}

export const WORLD_SCENE_SLUGS = [
  'discogs_sniper',
  'krunked_skymap',
  'discogs_collection',
  'chroma-cosmos',
  'learning_languages',
  'dojo',
  'pokemath',
  'maul-forge',
  'bitforge-80',
  'alchemists_ledger',
  'swarm_tycoon',
  'taxquest',
  'clausehound-ai',
  'chaosdeck-sre',
  'ozias_laboratory',
  'greg_n_friends',
  'violets_homework',
  'starlight_v2',
] as const;

export type WorldSceneSlug = (typeof WORLD_SCENE_SLUGS)[number];

interface SceneCtx {
  ctx: Ctx2D;
  w: number;
  h: number;
  seed: number;
  hue: number;
  t: number;
  theme: ArtTheme;
  isLight: boolean;
}

type Rgb = [number, number, number];

const PI = Math.PI;
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Non-purple OKLCH CSS color helper (strictly outside 245..340deg). */
function tone(L: number, C: number, rawHue: number, a = 1): string {
  const [r, g, b] = nonPurpleRgb(L, C, rawHue);
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(clamp(a, 0, 1).toFixed(4))})`;
}

/** Dual-theme pigment helper: luminous on OLED pitch, rich gallery ink on Swiss vellum. */
function pigment(isLight: boolean, rawHue: number, a = 1, boost = 0): string {
  const L = isLight ? clamp(0.42 + boost * 0.12, 0.24, 0.68) : clamp(0.76 + boost * 0.14, 0.32, 0.94);
  const C = isLight ? clamp(0.165 + Math.abs(boost) * 0.02, 0.09, 0.2) : clamp(0.172 + Math.abs(boost) * 0.02, 0.1, 0.21);
  return tone(L, C, rawHue, a);
}

/** Acid-lime studio signature (electric #D2FF28 in Obsidian, deep museum chartreuse ink in Daylight). */
function lime(isLight: boolean, a = 1): string {
  const [r, g, b]: Rgb = isLight ? [56, 98, 0] : [210, 255, 40];
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(clamp(a, 0, 1).toFixed(4))})`;
}

function ink(isLight: boolean, a = 1): string {
  return isLight
    ? a >= 1
      ? '#0A0A0B'
      : `rgba(10,10,11,${Number(clamp(a, 0, 1).toFixed(4))})`
    : a >= 1
      ? '#F5F3EC'
      : `rgba(245,243,236,${Number(clamp(a, 0, 1).toFixed(4))})`;
}

function fillBackdrop(ctx: Ctx2D, w: number, h: number, isLight: boolean, darkTintHue: number, lightTintHue?: number) {
  if (isLight) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#F8F6F0');
    g.addColorStop(0.55, '#F5F3EC');
    g.addColorStop(1, tone(0.925, 0.024, lightTintHue ?? darkTintHue, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = ctx.createRadialGradient(w * 0.6, h * 0.36, 0, w * 0.52, h * 0.5, Math.max(w, h) * 0.92);
    g.addColorStop(0, tone(0.16, 0.048, darkTintHue, 1));
    g.addColorStop(0.5, tone(0.085, 0.026, darkTintHue, 1));
    g.addColorStop(1, '#030304');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawBloom(ctx: Ctx2D, x: number, y: number, r: number, color0: string, colorMid?: string) {
  if (r <= 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color0);
  if (colorMid) g.addColorStop(0.45, colorMid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

const grainCache = new Map<ArtTheme, HTMLCanvasElement>();

function getGrainPattern(ctx: Ctx2D, theme: ArtTheme): CanvasPattern | null {
  if (typeof document === 'undefined' || typeof ctx.createPattern !== 'function') return null;
  let tile = grainCache.get(theme);
  if (!tile) {
    const sz = 64;
    tile = document.createElement('canvas');
    tile.width = sz;
    tile.height = sz;
    const g = tile.getContext('2d');
    if (!g) return null;
    const rng = mulberry32(theme === 'daylight' ? 0x56454c4c : 0x4d4f4e4f);
    for (let y = 0; y < sz; y += 2) {
      for (let x = 0; x < sz; x += 2) {
        const v = rng();
        if (v > 0.66) {
          const a = (v - 0.66) * (theme === 'daylight' ? 0.055 : 0.07);
          g.fillStyle = theme === 'daylight' ? `rgba(10,10,11,${a.toFixed(3)})` : `rgba(245,243,236,${a.toFixed(3)})`;
          g.fillRect(x, y, 1, 1);
        } else if (v < 0.18) {
          const a = (0.18 - v) * 0.065;
          g.fillStyle = theme === 'daylight' ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${a.toFixed(3)})`;
          g.fillRect(x + 1, y + 1, 1, 1);
        }
      }
    }
    grainCache.set(theme, tile);
  }
  try {
    return ctx.createPattern(tile, 'repeat');
  } catch {
    return null;
  }
}

function finishPlate(ctx: Ctx2D, w: number, h: number, theme: ArtTheme, isLight: boolean) {
  ctx.save();
  // Subtle optical vignette
  const vig = ctx.createRadialGradient(w * 0.56, h * 0.42, Math.min(w, h) * 0.34, w * 0.5, h * 0.5, Math.max(w, h) * 0.88);
  if (isLight) {
    vig.addColorStop(0, 'rgba(255,255,255,0)');
    vig.addColorStop(0.74, 'rgba(245,243,236,0)');
    vig.addColorStop(1, 'rgba(10,10,11,0.085)');
  } else {
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.64, 'rgba(3,3,4,0)');
    vig.addColorStop(1, 'rgba(2,2,3,0.48)');
  }
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // Subtle print grain
  const pat = getGrainPattern(ctx, theme);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }

  // Crisp optical corner brackets on medium/large plates
  if (w >= 140 && h >= 90) {
    const m = 10;
    const arm = Math.min(10, Math.round(Math.min(w, h) * 0.048));
    ctx.strokeStyle = ink(isLight, isLight ? 0.2 : 0.16);
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(m, m + arm); ctx.lineTo(m, m); ctx.lineTo(m + arm, m);
    ctx.moveTo(w - m - arm, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + arm);
    ctx.moveTo(w - m, h - m - arm); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m - arm, h - m);
    ctx.moveTo(m + arm, h - m); ctx.lineTo(m, h - m); ctx.lineTo(m, h - m - arm);
    ctx.stroke();
  }

  // Top hairline edge catchlight
  ctx.fillStyle = isLight ? 'rgba(255,255,255,0.45)' : 'rgba(245,243,236,0.06)';
  ctx.fillRect(0, 0, w, 1);
  ctx.restore();
}

// ============================================================================
// 1. discogs_sniper — Tactical Vinyl Waveform & Sniper Reticle
// ============================================================================
function drawDiscogsSniper({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 34, 42);
  const rng = mulberry32(seed ^ 0x5119e4);
  const minD = Math.min(w, h);

  // Tactical oscilloscope grid
  const pitch = Math.max(18, Math.round(minD / 11));
  ctx.save();
  ctx.strokeStyle = ink(isLight, isLight ? 0.06 : 0.048);
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  for (let x = pitch; x < w; x += pitch) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = pitch; y < h; y += pitch) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  const cy = h * 0.52;
  const targetX = w * 0.6 + Math.sin(t * 0.45) * w * 0.03;
  const targetY = cy - h * 0.14 + Math.cos(t * 0.55) * h * 0.025;

  // Ambient glow behind sniper target
  drawBloom(
    ctx,
    targetX,
    targetY,
    minD * 0.55,
    isLight ? pigment(true, 34, 0.12) : tone(0.66, 0.18, 34, 0.24),
    isLight ? lime(true, 0.06) : lime(false, 0.08),
  );

  // Groove horizon line
  ctx.strokeStyle = ink(isLight, isLight ? 0.24 : 0.22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  // Mirrored tactical audio spectrum bars + waveform envelope
  const bars = clamp(Math.floor(w / 7), 24, 110);
  const step = w / bars;
  const peaks: Array<{ x: number; y: number; amp: number }> = [];

  for (let i = 0; i < bars; i++) {
    const u = i / (bars - 1);
    const x = u * w + step * 0.5;
    // Create rich multi-lobe audio waveform with dramatic peak near targetX
    const distTarget = Math.abs(x - targetX) / (w * 0.14);
    const focusBoost = Math.exp(-distTarget * distTarget) * 0.65;
    const groove =
      0.24 +
      0.22 * Math.sin(u * 13.5 + t * 1.4 + seed * 0.01) +
      0.16 * Math.sin(u * 29.0 - t * 2.1 + 1.3) +
      0.12 * Math.cos(u * 47.0 + t * 0.9) +
      focusBoost;
    const amp = clamp(groove, 0.06, 1.0) * h * 0.32;
    const isHot = distTarget < 0.85 || amp > h * 0.22;

    const barW = Math.max(1.5, step * 0.52);
    // Upper bar
    ctx.fillStyle = isHot
      ? isLight
        ? pigment(true, 28, 0.85)
        : tone(0.76, 0.18, 32, 0.88)
      : isLight
        ? ink(true, 0.36)
        : tone(0.52, 0.11, 38, 0.48);
    ctx.fillRect(x - barW * 0.5, cy - amp, barW, amp - 1.5);

    // Lower mirrored reflection bar
    ctx.fillStyle = isHot
      ? isLight
        ? pigment(true, 28, 0.32)
        : tone(0.62, 0.15, 32, 0.34)
      : ink(isLight, isLight ? 0.14 : 0.16);
    ctx.fillRect(x - barW * 0.5, cy + 2, barW, amp * 0.56);

    // Acid-lime peak hold cap
    if (isHot || i % 3 === 0) {
      ctx.fillStyle = lime(isLight, isHot ? 0.95 : 0.55);
      ctx.fillRect(x - barW * 0.5, cy - amp - 4.5, barW, 2.2);
    }

    if (i % Math.max(4, Math.floor(bars / 7)) === 2) {
      peaks.push({ x, y: cy - amp, amp });
    }
  }

  // Smooth glowing upper oscilloscope trace
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const u = i / 96;
    const x = u * w;
    const d = Math.abs(x - targetX) / (w * 0.16);
    const y =
      cy -
      h *
        0.24 *
        (0.42 +
          0.26 * Math.sin(u * 14 + t * 1.6) +
          0.14 * Math.cos(u * 34 - t * 2.5) +
          0.52 * Math.exp(-d * d));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = lime(isLight, isLight ? 0.92 : 0.95);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Concentric sniper reticle lock
  const rOuter = minD * 0.34;
  const rMid = rOuter * 0.66;
  const rInner = rOuter * 0.32;

  // Rotating radar sweep wedge inside reticle
  const sweepAng = t * 1.15 - PI * 0.35;
  ctx.save();
  ctx.translate(targetX, targetY);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, rOuter, sweepAng - 0.55, sweepAng);
  ctx.closePath();
  ctx.fillStyle = lime(isLight, isLight ? 0.12 : 0.14);
  ctx.fill();

  // Reticle rings
  ctx.strokeStyle = ink(isLight, isLight ? 0.38 : 0.32);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, rOuter, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = pigment(isLight, 30, 0.85);
  ctx.lineWidth = 1.35;
  ctx.setLineDash([rMid * 0.42, rMid * 0.18]);
  ctx.beginPath();
  ctx.arc(0, 0, rMid, t * 0.25, TAU + t * 0.25);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = lime(isLight, 0.92);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, rInner, 0, TAU);
  ctx.stroke();

  // Graduated degree range ticks on outer reticle
  ctx.strokeStyle = ink(isLight, isLight ? 0.55 : 0.48);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let a = 0; a < 36; a++) {
    const ang = (a / 36) * TAU;
    const major = a % 3 === 0;
    const len = major ? 7 : 3.5;
    ctx.moveTo(Math.cos(ang) * (rOuter - len), Math.sin(ang) * (rOuter - len));
    ctx.lineTo(Math.cos(ang) * rOuter, Math.sin(ang) * rOuter);
  }
  ctx.stroke();

  // Precision split crosshairs with mil-dot ticks
  const gap = rInner * 0.55;
  const span = rOuter * 1.36;
  ctx.strokeStyle = lime(isLight, isLight ? 0.88 : 0.85);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-span, 0); ctx.lineTo(-gap, 0);
  ctx.moveTo(gap, 0); ctx.lineTo(span, 0);
  ctx.moveTo(0, -span); ctx.lineTo(0, -gap);
  ctx.moveTo(0, gap); ctx.lineTo(0, span);
  ctx.stroke();

  // 4 chamfered target lock brackets
  const bS = rMid * 0.92;
  const bA = Math.max(7, rOuter * 0.18);
  ctx.strokeStyle = pigment(isLight, 24, 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-bS, -bS + bA); ctx.lineTo(-bS, -bS); ctx.lineTo(-bS + bA, -bS);
  ctx.moveTo(bS - bA, -bS); ctx.lineTo(bS, -bS); ctx.lineTo(bS, -bS + bA);
  ctx.moveTo(bS, bS - bA); ctx.lineTo(bS, bS); ctx.lineTo(bS - bA, bS);
  ctx.moveTo(-bS + bA, bS); ctx.lineTo(-bS, bS); ctx.lineTo(-bS, bS - bA);
  ctx.stroke();

  // Center lock pip
  ctx.fillStyle = pigment(isLight, 18, 1);
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Price-drop beacon blips with expanding lock pulses
  const blipCoords: Array<[number, number]> = [
    [w * 0.24, cy - h * 0.16],
    [w * 0.82, cy - h * 0.2],
    [w * 0.42, cy + h * 0.14],
  ];
  for (let i = 0; i < blipCoords.length; i++) {
    const [bx, by] = blipCoords[i]!;
    const phase = (t * 0.65 + i * 0.37 + rng() * 0.2) % 1;
    ctx.strokeStyle = i === 0 ? lime(isLight, (1 - phase) * 0.85) : pigment(isLight, 22, (1 - phase) * 0.85);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(bx, by, 4 + phase * minD * 0.085, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = i === 0 ? lime(isLight, 1) : pigment(isLight, 22, 1);
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, TAU);
    ctx.fill();

    // Crisp geometric callout bar
    ctx.strokeStyle = ink(isLight, 0.35);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(bx + 5, by - 5);
    ctx.lineTo(bx + 15, by - 14);
    ctx.lineTo(bx + 34, by - 14);
    ctx.stroke();
    ctx.fillStyle = i === 0 ? lime(isLight, 0.85) : pigment(isLight, 32, 0.85);
    ctx.fillRect(bx + 17, by - 18, 14, 2.5);
  }

  // Right-edge dB vernier ladder
  if (w >= 160) {
    ctx.strokeStyle = ink(isLight, isLight ? 0.32 : 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = h * 0.14, idx = 0; y < h * 0.86; y += 9, idx++) {
      const len = idx % 4 === 0 ? 10 : 4.5;
      ctx.moveTo(w - 14 - len, y);
      ctx.lineTo(w - 14, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================================
// 2. krunked_skymap — Live Aerospace Tactical Globe
// ============================================================================
function drawKrunkedSkymap({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 204, 202);
  const rng = mulberry32(seed ^ 0x5c7a1b);
  const minD = Math.min(w, h);
  const cx = w * 0.58;
  const cy = h * 0.54;
  const R = minD * 0.56;

  ctx.save();
  // Starfield / telemetry coordinate pips in deep space
  for (let i = 0; i < 42; i++) {
    const sx = rng() * w;
    const sy = rng() * h;
    const dx = sx - cx;
    const dy = sy - cy;
    if (dx * dx + dy * dy < R * R * 1.06) continue;
    const pulse = 0.4 + 0.6 * Math.sin(t * 1.8 + i * 2.1);
    ctx.fillStyle = isLight ? pigment(true, 206, 0.24 * pulse) : tone(0.88, 0.08, 200, 0.45 * pulse);
    ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1.2, i % 5 === 0 ? 2 : 1.2);
  }

  // Atmospheric limb Fresnel halo
  const atmo = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.26);
  if (isLight) {
    atmo.addColorStop(0, pigment(true, 202, 0.18));
    atmo.addColorStop(0.55, pigment(true, 196, 0.09));
    atmo.addColorStop(1, 'rgba(245,243,236,0)');
  } else {
    atmo.addColorStop(0, tone(0.76, 0.18, 200, 0.38));
    atmo.addColorStop(0.45, tone(0.58, 0.16, 208, 0.16));
    atmo.addColorStop(1, 'rgba(3,5,8,0)');
  }
  ctx.fillStyle = atmo;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.26, 0, TAU);
  ctx.fill();

  // Back half of inclined SGP4 satellite orbit (behind globe)
  const satRx = R * 1.38;
  const satRy = R * 0.44;
  const satTilt = -0.42;
  const satAngle = t * 0.48 + 0.75;

  const drawOrbitHalf = (front: boolean) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(satTilt);
    ctx.beginPath();
    ctx.ellipse(0, 0, satRx, satRy, 0, front ? 0 : PI, front ? PI : TAU);
    ctx.strokeStyle = front ? pigment(isLight, 46, isLight ? 0.9 : 0.86) : pigment(isLight, 46, 0.24);
    ctx.lineWidth = front ? 1.6 : 1;
    if (!front) ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };
  drawOrbitHalf(false);

  // Globe sphere fill
  const sphereGrad = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.34, R * 0.08, cx, cy, R);
  if (isLight) {
    sphereGrad.addColorStop(0, '#FFFFFF');
    sphereGrad.addColorStop(0.55, tone(0.92, 0.045, 204, 1));
    sphereGrad.addColorStop(1, tone(0.78, 0.09, 208, 1));
  } else {
    sphereGrad.addColorStop(0, tone(0.26, 0.09, 202, 1));
    sphereGrad.addColorStop(0.62, tone(0.12, 0.06, 208, 1));
    sphereGrad.addColorStop(1, '#03060A');
  }
  ctx.fillStyle = sphereGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // Clip inside globe for orthographic graticule & continents
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();

  const tiltLat = 0.36;
  const cosTilt = Math.cos(tiltLat);
  const sinTilt = Math.sin(tiltLat);
  const spin = t * 0.14;

  const project = (lat: number, lon: number) => {
    const cLat = Math.cos(lat);
    const sLat = Math.sin(lat);
    const l = lon + spin;
    const x3 = cLat * Math.sin(l);
    const y3 = sLat * cosTilt - cLat * Math.cos(l) * sinTilt;
    const z3 = sLat * sinTilt + cLat * Math.cos(l) * cosTilt;
    return { x: cx + x3 * R, y: cy - y3 * R, z: z3 };
  };

  // Parallels
  ctx.strokeStyle = pigment(isLight, 202, isLight ? 0.28 : 0.24);
  ctx.lineWidth = 0.85;
  for (let latDeg = -60; latDeg <= 60; latDeg += 20) {
    const lat = (latDeg * PI) / 180;
    ctx.beginPath();
    let started = false;
    for (let s = 0; s <= 72; s++) {
      const p = project(lat, (s / 72) * TAU);
      if (p.z >= -0.02) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();
  }

  // Meridians
  for (let lonDeg = 0; lonDeg < 360; lonDeg += 24) {
    const lon = (lonDeg * PI) / 180;
    ctx.beginPath();
    let started = false;
    for (let s = -32; s <= 32; s++) {
      const p = project((s / 32) * (PI * 0.49), lon);
      if (p.z >= -0.02) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();
  }

  // Stylized radar landmass stipple clusters
  const noise = makeNoise(seed ^ 0x3312);
  ctx.fillStyle = pigment(isLight, 184, isLight ? 0.42 : 0.34);
  for (let latD = -64; latD <= 68; latD += 8) {
    for (let lonD = 0; lonD < 360; lonD += 10) {
      const n = noise.fbm(lonD * 0.028 + 3.1, latD * 0.036 + 5.7, 3);
      if (n > 0.56) {
        const p = project((latD * PI) / 180, (lonD * PI) / 180);
        if (p.z > 0.08) {
          const sz = 1.6 + p.z * 1.4;
          ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
        }
      }
    }
  }
  ctx.restore();

  // Crisp glowing planetary limb ring
  ctx.strokeStyle = pigment(isLight, 198, isLight ? 0.78 : 0.85);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();

  // Sweeping geodesic ADS-B flight arcs with glowing animated aircraft chevrons
  const routes: Array<{ a: [number, number]; b: [number, number]; lift: number; hue: number; speed: number }> = [
    { a: [-0.62, 0.25], b: [0.58, -0.34], lift: 0.32, hue: 112, speed: 0.24 },
    { a: [-0.42, -0.42], b: [0.64, 0.14], lift: 0.28, hue: 196, speed: 0.19 },
    { a: [-0.74, -0.06], b: [0.22, -0.58], lift: 0.26, hue: 46, speed: 0.28 },
    { a: [0.14, 0.52], b: [0.76, -0.14], lift: 0.24, hue: 162, speed: 0.22 },
  ];

  for (let i = 0; i < routes.length; i++) {
    const rt = routes[i]!;
    const ax = cx + rt.a[0] * R;
    const ay = cy + rt.a[1] * R;
    const bx = cx + rt.b[0] * R;
    const by = cy + rt.b[1] * R;
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const nx = -(by - ay);
    const ny = bx - ax;
    const len = Math.hypot(nx, ny) || 1;
    const cpx = mx + (nx / len) * R * rt.lift;
    const cpy = my + (ny / len) * R * rt.lift;

    // Altitude vector ticks along arc
    ctx.strokeStyle = rt.hue === 112 ? lime(isLight, 0.3) : pigment(isLight, rt.hue, 0.34);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let s = 1; s < 10; s++) {
      const u = s / 10;
      const px = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cpx + u * u * bx;
      const py = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cpy + u * u * by;
      const gx = ax + (bx - ax) * u;
      const gy = ay + (by - ay) * u;
      ctx.moveTo(px, py);
      ctx.lineTo(px + (gx - px) * 0.32, py + (gy - py) * 0.32);
    }
    ctx.stroke();

    // Glowing flight corridor arc
    ctx.strokeStyle = rt.hue === 112 ? lime(isLight, 0.85) : pigment(isLight, rt.hue, 0.86);
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(cpx, cpy, bx, by);
    ctx.stroke();

    // Origin / destination airport beacons
    for (const [ex, ey] of [
      [ax, ay],
      [bx, by],
    ] as const) {
      ctx.fillStyle = ink(isLight, 0.9);
      ctx.beginPath();
      ctx.arc(ex, ey, 2.2, 0, TAU);
      ctx.fill();
    }

    // Animated aircraft chevron along quadratic curve
    const u = (0.38 + i * 0.19 + t * rt.speed) % 1;
    const px = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cpx + u * u * bx;
    const py = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cpy + u * u * by;
    const tx = 2 * (1 - u) * (cpx - ax) + 2 * u * (bx - cpx);
    const ty = 2 * (1 - u) * (cpy - ay) + 2 * u * (by - cpy);
    const ang = Math.atan2(ty, tx);

    drawBloom(ctx, px, py, 14, rt.hue === 112 ? lime(isLight, 0.5) : pigment(isLight, rt.hue, 0.45));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = rt.hue === 112 ? lime(isLight, 1) : ink(isLight, 1);
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-4.5, -4.2);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-4.5, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Front half of SGP4 satellite orbit + moving satellite diamond
  drawOrbitHalf(true);
  const satLocalX = Math.cos(satAngle) * satRx;
  const satLocalY = Math.sin(satAngle) * satRy;
  const sx = cx + satLocalX * Math.cos(satTilt) - satLocalY * Math.sin(satTilt);
  const sy = cy + satLocalX * Math.sin(satTilt) + satLocalY * Math.cos(satTilt);
  const satFront = Math.sin(satAngle) >= 0;
  if (satFront || Math.hypot(sx - cx, sy - cy) > R) {
    drawBloom(ctx, sx, sy, 18, pigment(isLight, 46, 0.65));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(satTilt + PI * 0.25);
    ctx.fillStyle = pigment(isLight, 50, 1);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeStyle = ink(isLight, 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(-7, -1.6, 14, 3.2);
    ctx.restore();
  }

  // Outer aerospace azimuth compass ticks
  ctx.strokeStyle = ink(isLight, isLight ? 0.26 : 0.22);
  ctx.lineWidth = 0.9;
  const azR = R * 1.12;
  ctx.beginPath();
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU;
    const len = k % 4 === 0 ? 7 : 3;
    ctx.moveTo(cx + Math.cos(a) * azR, cy + Math.sin(a) * azR);
    ctx.lineTo(cx + Math.cos(a) * (azR + len), cy + Math.sin(a) * (azR + len));
  }
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// 3. discogs_collection — Macro Audiophile Direct-Drive Platter
// ============================================================================
function drawDiscogsCollection({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 44, 48);
  const minD = Math.min(w, h);
  const cx = w * 0.62;
  const cy = h * 0.52;
  const R = minD * 0.72;
  const spin = t * 0.62;

  ctx.save();
  // Ambient warm copper rim halo
  drawBloom(
    ctx,
    cx,
    cy,
    R * 1.25,
    isLight ? pigment(true, 44, 0.16) : tone(0.54, 0.14, 42, 0.22),
    isLight ? pigment(true, 32, 0.05) : tone(0.32, 0.09, 36, 0.1),
  );

  // Platter cast shadow
  ctx.fillStyle = isLight ? 'rgba(10,10,11,0.16)' : 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 10, R * 1.03, 0, TAU);
  ctx.fill();

  // Machined brushed-titanium outer bevel rim
  const rimGrad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  rimGrad.addColorStop(0, isLight ? '#52565E' : '#3C4048');
  rimGrad.addColorStop(0.32, isLight ? '#A8AEB8' : '#7E8591');
  rimGrad.addColorStop(0.58, isLight ? '#23262B' : '#181A1F');
  rimGrad.addColorStop(0.85, isLight ? '#7B818C' : '#585E68');
  rimGrad.addColorStop(1, '#14161A');
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // Precision Technics-style strobe dots along beveled rim
  const dotR1 = R * 0.968;
  const dotR2 = R * 0.946;
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * TAU + spin;
    const glowZone = Math.cos(a - 2.65) > 0.72;
    ctx.fillStyle = glowZone
      ? isLight
        ? pigment(true, 28, 0.95)
        : tone(0.8, 0.19, 32, 0.96)
      : 'rgba(235,238,244,0.42)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * dotR1, cy + Math.sin(a) * dotR1, Math.max(1.2, R * 0.009), 0, TAU);
    ctx.fill();
    if (i % 2 === 0) {
      ctx.fillStyle = glowZone ? lime(isLight, 0.85) : 'rgba(220,225,232,0.28)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dotR2, cy + Math.sin(a) * dotR2, Math.max(0.9, R * 0.006), 0, TAU);
      ctx.fill();
    }
  }

  // Deep pressed carbon vinyl disc (jet-black even in Daylight for bold Braun poster contrast!)
  const vinylR = R * 0.915;
  const vinylGrad = ctx.createRadialGradient(cx - vinylR * 0.25, cy - vinylR * 0.25, vinylR * 0.12, cx, cy, vinylR);
  vinylGrad.addColorStop(0, '#1B1D22');
  vinylGrad.addColorStop(0.55, '#0C0D10');
  vinylGrad.addColorStop(1, '#050608');
  ctx.fillStyle = vinylGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, vinylR, 0, TAU);
  ctx.fill();

  // Spinning anisotropic specular sheen cones across vinyl grooves
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, vinylR, 0, TAU);
  ctx.clip();
  for (let cone = 0; cone < 2; cone++) {
    const baseA = -0.78 + cone * PI + Math.sin(t * 0.7) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(baseA);
    const sheen = ctx.createLinearGradient(0, -vinylR * 0.36, 0, vinylR * 0.36);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.35, tone(0.84, 0.11, 48, 0.15));
    sheen.addColorStop(0.5, 'rgba(255,252,244,0.24)');
    sheen.addColorStop(0.65, tone(0.74, 0.13, 38, 0.12));
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, vinylR, -0.34, 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 42 razor-crisp micro-grooves + track gap bands
  const labelR = R * 0.33;
  const grooveCount = 42;
  for (let i = 0; i < grooveCount; i++) {
    const frac = i / (grooveCount - 1);
    const gr = labelR * 1.08 + frac * (vinylR * 0.97 - labelR * 1.08);
    const isBandGap = i === 12 || i === 25 || i === 35;
    ctx.strokeStyle = isBandGap
      ? 'rgba(255,250,240,0.24)'
      : i % 3 === 0
        ? 'rgba(255,250,240,0.11)'
        : 'rgba(180,190,205,0.055)';
    ctx.lineWidth = isBandGap ? 1.5 : 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // Warm burnished copper-gold center label
  const lblGrad = ctx.createLinearGradient(cx - labelR, cy - labelR, cx + labelR, cy + labelR);
  lblGrad.addColorStop(0, tone(0.78, 0.16, 52, 1));
  lblGrad.addColorStop(0.48, tone(0.62, 0.17, 40, 1));
  lblGrad.addColorStop(1, tone(0.42, 0.14, 30, 1));
  ctx.fillStyle = lblGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, labelR, 0, TAU);
  ctx.fill();

  // Rotating archival ring accents on label
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.strokeStyle = 'rgba(10,10,11,0.52)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, labelR * 0.84, 0.25, PI * 1.35);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,250,238,0.62)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, labelR * 0.64, PI * 0.9, PI * 1.85);
  ctx.stroke();

  // Geometric catalog stamp bar on label
  ctx.fillStyle = 'rgba(10,10,11,0.65)';
  ctx.fillRect(-labelR * 0.52, -labelR * 0.34, labelR * 0.42, Math.max(2, labelR * 0.08));
  ctx.fillStyle = lime(false, 0.85);
  ctx.fillRect(labelR * 0.26, labelR * 0.18, labelR * 0.28, Math.max(2, labelR * 0.08));
  ctx.restore();

  // Machined chrome center spindle
  ctx.fillStyle = '#E8ECEF';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, R * 0.042), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#181A1F';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, R * 0.018), 0, TAU);
  ctx.fill();

  // Cantilevered brushed-titanium S-tonearm (from top-right pivot onto vinyl)
  const pivotX = Math.min(w * 0.92, cx + R * 0.84);
  const pivotY = Math.max(h * 0.14, cy - R * 0.62);
  const tipX = cx + R * 0.42;
  const tipY = cy + R * 0.34 + Math.sin(t * 2.2) * 0.8;

  // Tonearm gimbal housing
  ctx.fillStyle = isLight ? '#2B2F36' : '#252930';
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, minD * 0.095, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,235,242,0.5)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Arm shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(4, minD * 0.022);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX + 3, pivotY + 5);
  ctx.bezierCurveTo(pivotX + 6, cy + 8, tipX + 36, tipY - 12, tipX + 4, tipY + 5);
  ctx.stroke();

  // Brushed titanium arm tube
  const armGrad = ctx.createLinearGradient(pivotX, pivotY, tipX, tipY);
  armGrad.addColorStop(0, '#D4DAE3');
  armGrad.addColorStop(0.5, '#8B929E');
  armGrad.addColorStop(1, '#EEF2F7');
  ctx.strokeStyle = armGrad;
  ctx.lineWidth = Math.max(3.2, minD * 0.018);
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.bezierCurveTo(pivotX + 2, cy, tipX + 34, tipY - 16, tipX, tipY);
  ctx.stroke();

  // Headshell cartridge & luminous stylus contact glow
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(2.22);
  ctx.fillStyle = '#181B20';
  ctx.fillRect(-4, -5, 18, 10);
  ctx.fillStyle = lime(false, 0.95);
  ctx.fillRect(10, -2.5, 4, 5);
  ctx.restore();
  drawBloom(ctx, tipX - 5, tipY + 4, 16, tone(0.84, 0.18, 42, 0.72), lime(false, 0.25));

  ctx.restore();
}

// ============================================================================
// 4. chroma-cosmos — Hi-Bit Cosmic Coloring Nebula (ZERO PURPLE!)
// ============================================================================
function drawChromaCosmos({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 188, 178);
  const rng = mulberry32(seed ^ 0xc05a05);
  const minD = Math.min(w, h);

  ctx.save();
  // Lush layered non-purple ribbon bands: cyan (196), emerald (156), solar gold (72), coral (22)
  const bandHues = [196, 156, 72, 22, 182] as const;

  if (!isLight) ctx.globalCompositeOperation = 'screen';

  for (let b = 0; b < bandHues.length; b++) {
    const bh = bandHues[b]!;
    const yBase = h * (0.2 + b * 0.145);
    const amp = h * (0.14 + (b % 3) * 0.045);
    const thickness = minD * (0.15 + (b % 2) * 0.07);
    const phase = t * (0.35 + b * 0.08) + b * 1.45;

    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const wave =
        Math.sin(u * 4.4 + phase) * amp +
        Math.cos(u * 8.2 - phase * 0.7 + b) * amp * 0.36;
      const y = yBase + wave - thickness * (0.55 + 0.35 * Math.sin(u * PI));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const u = i / steps;
      const x = u * w;
      const wave =
        Math.sin(u * 4.4 + phase) * amp +
        Math.cos(u * 8.2 - phase * 0.7 + b) * amp * 0.36;
      const y = yBase + wave + thickness * (0.55 + 0.35 * Math.sin(u * PI));
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, yBase - amp, w, yBase + amp);
    if (isLight) {
      grad.addColorStop(0, pigment(true, bh, 0.08));
      grad.addColorStop(0.4, pigment(true, bh, 0.32));
      grad.addColorStop(0.7, pigment(true, remapHue(bh + 18), 0.28));
      grad.addColorStop(1, pigment(true, bh, 0.06));
    } else {
      grad.addColorStop(0, tone(0.68, 0.19, bh, 0.08));
      grad.addColorStop(0.38, tone(0.76, 0.2, bh, 0.42));
      grad.addColorStop(0.68, tone(0.82, 0.18, remapHue(bh + 18), 0.36));
      grad.addColorStop(1, tone(0.66, 0.18, bh, 0.06));
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Bright core filament thread along ribbon spine
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const wave =
        Math.sin(u * 4.4 + phase) * amp +
        Math.cos(u * 8.2 - phase * 0.7 + b) * amp * 0.36;
      const y = yBase + wave;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = isLight ? pigment(true, bh, 0.65) : tone(0.9, 0.15, bh, 0.72);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';

  // Crisp stepped geometric constellation diamonds + link vectors
  const nodes: Array<{ x: number; y: number; r: number; hue: number }> = [
    { x: w * 0.62, y: h * 0.38, r: minD * 0.125, hue: 72 },
    { x: w * 0.32, y: h * 0.3, r: minD * 0.068, hue: 196 },
    { x: w * 0.8, y: h * 0.26, r: minD * 0.056, hue: 22 },
    { x: w * 0.76, y: h * 0.66, r: minD * 0.072, hue: 156 },
    { x: w * 0.45, y: h * 0.64, r: minD * 0.052, hue: 196 },
  ];

  // Constellation dotted vectors
  ctx.strokeStyle = ink(isLight, isLight ? 0.34 : 0.3);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  for (let i = 1; i < nodes.length; i++) {
    ctx.moveTo(nodes[0]!.x, nodes[0]!.y);
    ctx.lineTo(nodes[i]!.x, nodes[i]!.y);
  }
  ctx.moveTo(nodes[1]!.x, nodes[1]!.y);
  ctx.lineTo(nodes[4]!.x, nodes[4]!.y);
  ctx.moveTo(nodes[2]!.x, nodes[2]!.y);
  ctx.lineTo(nodes[3]!.x, nodes[3]!.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Prism halo around hero constellation diamond
  const hero = nodes[0]!;
  ctx.strokeStyle = pigment(isLight, 196, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hero.x, hero.y, hero.r * 1.42, 0, TAU);
  ctx.stroke();

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const breathe = 1 + 0.06 * Math.sin(t * 2.1 + i * 1.3);
    const rr = n.r * breathe;

    drawBloom(ctx, n.x, n.y, rr * 1.9, pigment(isLight, n.hue, isLight ? 0.24 : 0.42));

    // Stepped nested geometric diamonds
    for (let ring = 0; ring < 2; ring++) {
      const s = rr * (ring === 0 ? 1 : 0.58);
      ctx.beginPath();
      ctx.moveTo(n.x, n.y - s);
      ctx.lineTo(n.x + s * 0.82, n.y);
      ctx.lineTo(n.x, n.y + s);
      ctx.lineTo(n.x - s * 0.82, n.y);
      ctx.closePath();
      if (ring === 1) {
        ctx.fillStyle = isLight ? pigment(true, n.hue, 0.82) : tone(0.88, 0.16, n.hue, 0.9);
        ctx.fill();
      } else {
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.62)' : 'rgba(4,8,12,0.58)';
        ctx.fill();
        ctx.strokeStyle = pigment(isLight, n.hue, 0.92);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
  }

  // Fine twinkling hi-bit pixel starlight
  for (let i = 0; i < 64; i++) {
    const sx = Math.round(rng() * w);
    const sy = Math.round(rng() * h);
    const twinkle = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.8 + (i % 5) * 0.6) + i * 1.7), 2);
    const sh = bandHues[i % bandHues.length]!;
    ctx.fillStyle = i % 3 === 0 ? ink(isLight, twinkle * 0.9) : pigment(isLight, sh, twinkle * 0.85);
    if (i % 7 === 0) {
      // Crisp 4-arm pixel cross star
      const px = 2;
      ctx.fillRect(sx - px * 2, sy, px * 5, px);
      ctx.fillRect(sx, sy - px * 2, px, px * 5);
    } else {
      const sz = i % 4 === 0 ? 2.5 : 1.5;
      ctx.fillRect(sx, sy, sz, sz);
    }
  }
  ctx.restore();
}

// ============================================================================
// 5. learning_languages — Wanderling World Atlas
// ============================================================================
function drawLearningLanguages({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 214, 54);
  const minD = Math.min(w, h);
  const cx = w * 0.56;
  const cy = h * 0.5;
  const R = minD * 0.39;

  ctx.save();
  // Cartographic outer neatline border with alternating degree ticks
  if (w >= 160 && h >= 100) {
    const pad = 14;
    ctx.strokeStyle = ink(isLight, isLight ? 0.28 : 0.22);
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    const seg = 22;
    for (let x = pad, i = 0; x < w - pad - seg; x += seg, i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = pigment(isLight, 52, isLight ? 0.45 : 0.35);
        ctx.fillRect(x, pad - 2.5, seg, 2.5);
        ctx.fillRect(x, h - pad, seg, 2.5);
      }
    }
  }

  // Warm cartographic ocean hemisphere
  const oceanGrad = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.28, R * 0.1, cx, cy, R);
  if (isLight) {
    oceanGrad.addColorStop(0, tone(0.93, 0.04, 210, 1));
    oceanGrad.addColorStop(0.7, tone(0.84, 0.08, 214, 1));
    oceanGrad.addColorStop(1, tone(0.72, 0.11, 216, 1));
  } else {
    oceanGrad.addColorStop(0, tone(0.28, 0.1, 212, 1));
    oceanGrad.addColorStop(0.65, tone(0.14, 0.075, 216, 1));
    oceanGrad.addColorStop(1, '#04080F');
  }
  ctx.fillStyle = oceanGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // Clip hemisphere for stylized continents & graticules
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();

  const noise = makeNoise(seed ^ 0x41a71a);
  const spin = t * 0.07;

  // Bathymetry + archipelago continents
  const cell = Math.max(5, Math.round(R / 22));
  for (let py = cy - R; py < cy + R; py += cell) {
    for (let px = cx - R; px < cx + R; px += cell) {
      const nx = (px - cx) / R;
      const ny = (py - cy) / R;
      const r2 = nx * nx + ny * ny;
      if (r2 > 0.98) continue;
      const lon = Math.atan2(nx, Math.sqrt(Math.max(0.001, 1 - r2))) + spin;
      const lat = Math.asin(clamp(ny, -1, 1));
      const v = noise.fbm(lon * 2.1 + 4.2, lat * 2.4 + 2.1, 3);
      if (v > 0.545) {
        ctx.fillStyle = isLight ? pigment(true, 168, v > 0.64 ? 0.62 : 0.42) : tone(0.58, 0.13, 168, v > 0.64 ? 0.58 : 0.36);
        ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      } else if (v > 0.51) {
        ctx.fillStyle = pigment(isLight, 56, isLight ? 0.2 : 0.16);
        ctx.fillRect(px, py, cell, cell);
      }
    }
  }

  // Sweeping orthographic latitude/longitude graticules
  ctx.strokeStyle = isLight ? 'rgba(10,10,11,0.22)' : 'rgba(245,243,236,0.18)';
  ctx.lineWidth = 0.85;
  for (let i = -3; i <= 3; i++) {
    const yy = cy + (i / 4) * R;
    const rx = Math.sqrt(Math.max(0, R * R - (yy - cy) * (yy - cy)));
    ctx.beginPath();
    ctx.ellipse(cx, yy, rx, Math.max(1, rx * 0.18), 0, 0, TAU);
    ctx.stroke();
  }
  for (let j = -3; j <= 3; j++) {
    const frac = (j / 3.6 + ((spin * 0.4) % 0.55));
    const rx = Math.abs(Math.sin(frac * PI)) * R;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(2, rx), R, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // Double engraved hemisphere rim
  ctx.strokeStyle = pigment(isLight, 56, isLight ? 0.85 : 0.78);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = ink(isLight, isLight ? 0.28 : 0.24);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 5, 0, TAU);
  ctx.stroke();

  // Drifting golden trade-wind streamlines
  ctx.lineCap = 'round';
  for (let s = 0; s < 5; s++) {
    const sy = cy - R * 0.62 + s * R * 0.31;
    const offset = ((t * 28 + s * 44) % (w * 0.8));
    ctx.strokeStyle = pigment(isLight, 56, isLight ? 0.72 : 0.68);
    ctx.lineWidth = 1.3;
    ctx.setLineDash([18, 12, 6, 16]);
    ctx.lineDashOffset = -offset;
    ctx.beginPath();
    for (let k = 0; k <= 32; k++) {
      const u = k / 32;
      const x = cx - R * 1.15 + u * R * 2.3;
      const y = sy + Math.sin(u * 5.2 + s * 1.1 + t * 0.4) * R * 0.085;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Illuminated city beacon nodes connected by golden cultural bridges
  const cities: Array<[number, number]> = [
    [cx - R * 0.48, cy - R * 0.28],
    [cx - R * 0.06, cy - R * 0.42],
    [cx + R * 0.38, cy - R * 0.16],
    [cx + R * 0.18, cy + R * 0.24],
    [cx - R * 0.36, cy + R * 0.34],
  ];
  ctx.strokeStyle = pigment(isLight, 48, 0.55);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < cities.length - 1; i++) {
    const [x1, y1] = cities[i]!;
    const [x2, y2] = cities[i + 1]!;
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) * 0.5, (y1 + y2) * 0.5 - 24, x2, y2);
  }
  ctx.stroke();

  for (let i = 0; i < cities.length; i++) {
    const [bx, by] = cities[i]!;
    const p = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.3);
    drawBloom(ctx, bx, by, 14, pigment(isLight, 38, 0.45));
    ctx.strokeStyle = pigment(isLight, 36, 0.55 + p * 0.35);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(bx, by, 5 + p * 3.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = pigment(isLight, 24, 1);
    ctx.beginPath();
    ctx.arc(bx, by, 2.8, 0, TAU);
    ctx.fill();
  }

  // Sculptural geometric 8-point compass rose (upper-right / lower-right landmark)
  const crX = Math.min(w - minD * 0.17, cx + R * 0.92);
  const crY = Math.min(h - minD * 0.18, cy + R * 0.58);
  const crR = minD * 0.135;
  ctx.save();
  ctx.translate(crX, crY);
  ctx.rotate(Math.sin(t * 0.35) * 0.08);
  ctx.strokeStyle = pigment(isLight, 56, 0.72);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, crR * 0.72, 0, TAU);
  ctx.stroke();

  // Minor diagonal points
  for (let k = 0; k < 4; k++) {
    const a = PI * 0.25 + (k * PI) / 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -crR * 0.68);
    ctx.lineTo(crR * 0.14, 0);
    ctx.lineTo(0, crR * 0.68);
    ctx.lineTo(-crR * 0.14, 0);
    ctx.closePath();
    ctx.fillStyle = pigment(isLight, 212, 0.55);
    ctx.fill();
    ctx.restore();
  }
  // Major beveled cardinal points
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * PI) / 2);
    // Bright half
    ctx.beginPath();
    ctx.moveTo(0, -crR);
    ctx.lineTo(crR * 0.18, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? pigment(isLight, 26, 0.96) : pigment(isLight, 58, 0.92);
    ctx.fill();
    // Dark beveled half
    ctx.beginPath();
    ctx.moveTo(0, -crR);
    ctx.lineTo(-crR * 0.18, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = ink(isLight, isLight ? 0.82 : 0.45);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = ink(isLight, 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ============================================================================
// 6. dojo — Starlight Island Archipelago
// ============================================================================
function drawDojo({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  const rng = mulberry32(seed ^ 0x151a4d);
  const horizonY = h * 0.58;
  const minD = Math.min(w, h);

  ctx.save();
  // Atmospheric sky gradient (ZERO PURPLE: twilight emerald-teal -> warm solar horizon)
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  if (isLight) {
    sky.addColorStop(0, tone(0.88, 0.05, 192, 1));
    sky.addColorStop(0.52, '#F5F3EC');
    sky.addColorStop(1, tone(0.92, 0.075, 58, 1));
  } else {
    sky.addColorStop(0, '#03080C');
    sky.addColorStop(0.45, tone(0.18, 0.068, 192, 1));
    sky.addColorStop(0.82, tone(0.26, 0.085, 168, 1));
    sky.addColorStop(1, tone(0.42, 0.115, 54, 1));
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizonY + 2);

  // Subtle pixel zenith starlight
  for (let i = 0; i < 36; i++) {
    const sx = Math.round(rng() * w);
    const sy = Math.round(rng() * horizonY * 0.68);
    const tw = 0.35 + 0.65 * Math.sin(t * 2 + i * 1.9);
    ctx.fillStyle = isLight ? pigment(true, 188, 0.28 * tw) : tone(0.92, 0.08, 72, 0.65 * tw);
    ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1.5, i % 5 === 0 ? 2 : 1.5);
  }

  // Dual celestial bodies: glowing solar-gold disc + companion crescent moon
  const sunX = w * 0.63;
  const sunY = horizonY - minD * 0.21;
  const sunR = minD * 0.135;
  drawBloom(
    ctx,
    sunX,
    sunY,
    sunR * 2.8,
    isLight ? pigment(true, 42, 0.28) : tone(0.86, 0.16, 62, 0.42),
    isLight ? pigment(true, 28, 0.08) : tone(0.68, 0.14, 42, 0.14),
  );
  const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
  sunGrad.addColorStop(0, isLight ? tone(0.66, 0.18, 38, 1) : tone(0.95, 0.12, 74, 1));
  sunGrad.addColorStop(1, isLight ? tone(0.52, 0.18, 24, 1) : tone(0.76, 0.18, 42, 1));
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, TAU);
  ctx.fill();

  // Companion pale teal-ivory moon
  const moonX = w * 0.44;
  const moonY = horizonY - minD * 0.33;
  const moonR = minD * 0.058;
  drawBloom(ctx, moonX, moonY, moonR * 2.4, pigment(isLight, 178, isLight ? 0.2 : 0.32));
  ctx.fillStyle = isLight ? tone(0.52, 0.14, 186, 0.9) : tone(0.92, 0.06, 174, 0.92);
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.fill();
  // Subtle crescent cutout
  ctx.fillStyle = isLight ? '#F2F0E8' : tone(0.16, 0.06, 192, 0.92);
  ctx.beginPath();
  ctx.arc(moonX + moonR * 0.34, moonY - moonR * 0.16, moonR * 0.82, 0, TAU);
  ctx.fill();

  // Layered atmospheric archipelago island silhouettes
  const drawIslandLayer = (
    peaks: Array<[number, number]>,
    fillColor: string,
    ridgeHighlight?: string,
  ) => {
    ctx.beginPath();
    ctx.moveTo(peaks[0]![0] * w, horizonY);
    for (const [px, py] of peaks) {
      ctx.lineTo(px * w, horizonY - py * h);
    }
    ctx.lineTo(peaks[peaks.length - 1]![0] * w, horizonY);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (ridgeHighlight) {
      ctx.strokeStyle = ridgeHighlight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < peaks.length; i++) {
        const [px, py] = peaks[i]!;
        if (i === 0) ctx.moveTo(px * w, horizonY - py * h);
        else ctx.lineTo(px * w, horizonY - py * h);
      }
      ctx.stroke();
    }
  };

  // Far misty volcanic range
  drawIslandLayer(
    [
      [0.08, 0.0],
      [0.18, 0.11],
      [0.27, 0.19],
      [0.36, 0.09],
      [0.44, 0.13],
      [0.54, 0.0],
    ],
    isLight ? tone(0.62, 0.09, 186, 0.62) : tone(0.24, 0.07, 184, 0.85),
  );
  // Right grand mountain peak
  drawIslandLayer(
    [
      [0.46, 0.0],
      [0.56, 0.08],
      [0.68, 0.16],
      [0.77, 0.25],
      [0.86, 0.14],
      [0.95, 0.06],
      [1.02, 0.0],
    ],
    isLight ? tone(0.46, 0.11, 176, 0.82) : tone(0.17, 0.06, 178, 0.94),
    isLight ? undefined : tone(0.68, 0.13, 62, 0.28),
  );
  // Foreground dark island ridges
  drawIslandLayer(
    [
      [-0.02, 0.0],
      [0.05, 0.12],
      [0.14, 0.15],
      [0.22, 0.06],
      [0.3, 0.0],
    ],
    isLight ? '#182A29' : '#060D0F',
  );
  drawIslandLayer(
    [
      [0.72, 0.0],
      [0.8, 0.07],
      [0.89, 0.12],
      [0.98, 0.09],
      [1.02, 0.0],
    ],
    isLight ? '#0F1F1F' : '#04090B',
  );

  // Tiny glowing island beacon lantern on mid ridge
  const bX = w * 0.77;
  const bY = horizonY - h * 0.255;
  drawBloom(ctx, bX, bY, 16, lime(isLight, 0.55));
  ctx.fillStyle = lime(isLight, 1);
  ctx.fillRect(bX - 1.5, bY - 1.5, 3, 3);

  // Water sea surface below horizon
  const water = ctx.createLinearGradient(0, horizonY, 0, h);
  if (isLight) {
    water.addColorStop(0, tone(0.84, 0.065, 184, 1));
    water.addColorStop(0.5, tone(0.74, 0.09, 192, 1));
    water.addColorStop(1, tone(0.6, 0.1, 196, 1));
  } else {
    water.addColorStop(0, tone(0.22, 0.08, 184, 1));
    water.addColorStop(0.45, tone(0.12, 0.06, 192, 1));
    water.addColorStop(1, '#030608');
  }
  ctx.fillStyle = water;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // Crisp pixel-stepped water reflection ripples
  const stepH = Math.max(3, Math.round(h * 0.015));
  for (let y = horizonY + 3, row = 0; y < h - 4; y += stepH + 2, row++) {
    const depth = (y - horizonY) / (h - horizonY);
    const waveShift = Math.sin(t * 2.1 + row * 0.85) * (6 + depth * 18);

    // Golden sun reflection column
    const refW = sunR * (1.55 - depth * 0.72) * (0.7 + 0.3 * Math.cos(row * 1.7 + t * 2.8));
    ctx.fillStyle = isLight
      ? tone(0.62, 0.16, 38, 0.75 * (1 - depth * 0.45))
      : tone(0.86, 0.15, 62, 0.82 * (1 - depth * 0.42));
    ctx.fillRect(Math.round(sunX - refW * 0.5 + waveShift), Math.round(y), Math.round(refW), Math.max(2, stepH - 1));

    // Companion moon subtle shimmer
    const mW = moonR * (1.2 - depth * 0.65);
    if (row % 2 === 0 && mW > 4) {
      ctx.fillStyle = pigment(isLight, 176, 0.48 * (1 - depth * 0.5));
      ctx.fillRect(Math.round(moonX - mW * 0.5 - waveShift * 0.6), Math.round(y), Math.round(mW), Math.max(1.5, stepH - 1.5));
    }

    // Broad horizontal stepped wave glints
    const gX = ((row * 97 + seed) % Math.max(40, Math.round(w))) + waveShift * 1.2;
    const gW = 14 + (row % 4) * 10;
    ctx.fillStyle = ink(isLight, isLight ? 0.16 : 0.14);
    ctx.fillRect(Math.round(gX % w), Math.round(y), gW, 1.5);
  }

  // Drifting translucent sea-mist ribbon along island waterline
  const mist = ctx.createLinearGradient(0, horizonY - 12, 0, horizonY + 14);
  mist.addColorStop(0, 'rgba(255,255,255,0)');
  mist.addColorStop(0.5, isLight ? 'rgba(255,255,255,0.52)' : tone(0.76, 0.08, 174, 0.24));
  mist.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, horizonY - 12, w, 26);

  ctx.restore();
}

// ============================================================================
// 7. pokemath — Retro Handheld Tactical Battle LCD
// ============================================================================
function drawPokemath({ ctx, w, h, t, isLight }: SceneCtx) {
  if (isLight) {
    // Crisp architectural DMG-inspired sage-vellum LCD plate
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#F5F3EC');
    bg.addColorStop(1, '#E7ECE0');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    fillBackdrop(ctx, w, h, false, 134);
  }

  const minD = Math.min(w, h);
  ctx.save();

  // Tactile dot-matrix grid
  const dotPitch = Math.max(6, Math.round(minD / 36));
  ctx.fillStyle = isLight ? 'rgba(18,38,24,0.085)' : 'rgba(210,255,40,0.055)';
  for (let y = dotPitch; y < h; y += dotPitch) {
    for (let x = dotPitch; x < w; x += dotPitch) {
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }

  // Perspective battle arena grid in lower half
  const horY = h * 0.56;
  ctx.strokeStyle = isLight ? pigment(true, 148, 0.24) : lime(false, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let row = 0; row <= 6; row++) {
    const f = Math.pow(row / 6, 1.55);
    const y = horY + f * (h - horY);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  for (let col = -5; col <= 5; col++) {
    ctx.moveTo(w * 0.5 + col * w * 0.08, horY);
    ctx.lineTo(w * 0.5 + col * w * 0.24, h);
  }
  ctx.stroke();

  // Two opposing stepped battle platforms
  const p1x = w * 0.3;
  const p1y = h * 0.72;
  const p2x = w * 0.72;
  const p2y = h * 0.4;

  const drawPlatform = (px: number, py: number, rx: number, hue: number) => {
    const ry = rx * 0.3;
    drawBloom(ctx, px, py - ry * 0.5, rx * 1.45, pigment(isLight, hue, isLight ? 0.18 : 0.34));
    ctx.fillStyle = isLight ? pigment(true, hue, 0.22) : tone(0.24, 0.09, hue, 0.65);
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hue === 112 ? lime(isLight, 0.9) : pigment(isLight, hue, 0.92);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Inner stepped ring
    ctx.strokeStyle = ink(isLight, 0.38);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px, py, rx * 0.68, ry * 0.64, 0, 0, TAU);
    ctx.stroke();
  };

  drawPlatform(p1x, p1y, minD * 0.21, 112);
  drawPlatform(p2x, p2y, minD * 0.18, 22);

  // Geometric mathematical entity crystal hovering over upper-right platform
  const bob = Math.sin(t * 2.4) * 4;
  ctx.save();
  ctx.translate(p2x, p2y - minD * 0.14 + bob);
  const cr = minD * 0.095;
  ctx.fillStyle = pigment(isLight, 24, isLight ? 0.85 : 0.92);
  ctx.beginPath();
  ctx.moveTo(0, -cr);
  ctx.lineTo(cr * 0.82, 0);
  ctx.lineTo(0, cr * 0.86);
  ctx.lineTo(-cr * 0.82, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ink(isLight, 0.85);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Inner math cross
  ctx.fillStyle = isLight ? '#F5F3EC' : '#050806';
  ctx.fillRect(-cr * 0.32, -2, cr * 0.64, 4);
  ctx.fillRect(-2, -cr * 0.32, 4, cr * 0.64);
  ctx.restore();

  // Glowing mathematical Lissajous / sine attack beam between platforms
  const midX = (p1x + p2x) * 0.5;
  const midY = (p1y + p2y) * 0.5 - minD * 0.05;
  const lRx = minD * 0.32;
  const lRy = minD * 0.16;

  // Dual glowing sine/Lissajous traces
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const lx = midX + Math.sin(3 * a + t * 1.15) * lRx;
      const ly = midY + Math.sin(2 * a - t * 0.75 + pass * 0.45) * lRy;
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.strokeStyle = pass === 0 ? lime(isLight, isLight ? 0.92 : 0.96) : pigment(isLight, 192, 0.82);
    ctx.lineWidth = pass === 0 ? 2.1 : 1.3;
    ctx.stroke();
  }

  // Clean stepped geometric battle HUD stat bars (top-left & bottom-right)
  const drawStatBox = (x: number, y: number, bw: number, fillPct: number, barHue: number) => {
    const bh = 22;
    ctx.fillStyle = isLight ? 'rgba(255,255,255,0.86)' : 'rgba(6,12,8,0.82)';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = ink(isLight, isLight ? 0.65 : 0.45);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, bw, bh);
    // Corner pixel notches
    ctx.fillStyle = barHue === 112 ? lime(isLight, 1) : pigment(isLight, barHue, 1);
    ctx.fillRect(x, y, 4, 4);
    ctx.fillRect(x + bw - 4, y + bh - 4, 4, 4);

    // Segmented HP / Power meter
    const segs = 10;
    const padX = 7;
    const sw = (bw - padX * 2 - (segs - 1) * 2) / segs;
    const filled = Math.round(segs * fillPct);
    for (let s = 0; s < segs; s++) {
      ctx.fillStyle =
        s < filled
          ? barHue === 112
            ? lime(isLight, 0.95)
            : pigment(isLight, barHue, 0.95)
          : ink(isLight, 0.14);
      ctx.fillRect(x + padX + s * (sw + 2), y + 9, sw, 6);
    }
  };

  if (w >= 140) {
    const bw = clamp(w * 0.28, 74, 150);
    drawStatBox(18, 18, bw, 0.72 + 0.12 * Math.sin(t * 1.3), 24);
    drawStatBox(w - bw - 18, h - 42, bw, 0.88, 112);
  }

  ctx.restore();
}

// ============================================================================
// 8. maul-forge — Bastion TD Isometric Fortress Maze
// ============================================================================
function drawMaulForge({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 56, 48);
  const minD = Math.min(w, h);
  const ox = w * 0.54;
  const oy = h * 0.25;
  const tile = minD * 0.072;

  const iso = (gx: number, gy: number, gz = 0): [number, number] => [
    ox + (gx - gy) * tile,
    oy + (gx + gy) * tile * 0.54 - gz * tile * 0.82,
  ];

  // 9x9 isometric labyrinth map (1 = fortress wall, 2 = flame tower, 3 = frost tower, 4 = earth tower)
  const grid = [
    [1, 1, 0, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 2, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 3, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 4, 0, 1],
    [1, 2, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];

  // Energy creep path waypoints through the corridors
  const pathPts: Array<[number, number]> = [
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 5],
    [5, 5],
    [5, 1],
    [7, 1],
    [7, 5],
    [3, 5],
    [3, 7],
    [8.5, 7],
  ];

  ctx.save();
  // Isometric floor grid diamond
  ctx.strokeStyle = ink(isLight, isLight ? 0.14 : 0.12);
  ctx.lineWidth = 0.8;
  for (let i = 0; i <= 9; i++) {
    const [x1, y1] = iso(i, 0);
    const [x2, y2] = iso(i, 9);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const [x3, y3] = iso(0, i);
    const [x4, y4] = iso(9, i);
    ctx.beginPath();
    ctx.moveTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.stroke();
  }

  // Elemental tower range rings projected onto isometric floor
  const towerSpec: Record<number, { hue: number; range: number }> = {
    2: { hue: 28, range: 2.3 }, // amber flame
    3: { hue: 196, range: 2.5 }, // cyan frost
    4: { hue: 148, range: 2.2 }, // emerald earth
  };

  for (let gy = 0; gy < 9; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      const cell = grid[gy]![gx]!;
      const spec = towerSpec[cell];
      if (!spec) continue;
      const [cx, cy] = iso(gx + 0.5, gy + 0.5, 0);
      const rx = spec.range * tile * 1.4;
      const ry = rx * 0.54;
      const pulse = 0.92 + 0.08 * Math.sin(t * 2.2 + cell * 1.7);

      ctx.fillStyle = pigment(isLight, spec.hue, isLight ? 0.12 : 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * pulse, ry * pulse, 0, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = pigment(isLight, spec.hue, isLight ? 0.72 : 0.78);
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Glowing animated energy pulse path weaving through maze
  ctx.beginPath();
  for (let i = 0; i < pathPts.length; i++) {
    const [px, py] = iso(pathPts[i]![0] + 0.5, pathPts[i]![1] + 0.5, 0.06);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = lime(isLight, isLight ? 0.38 : 0.34);
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = lime(isLight, 0.95);
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Animated energy beads moving along path
  const segCount = pathPts.length - 1;
  for (let b = 0; b < 5; b++) {
    const prog = (t * 0.42 + b * 0.2) % 1;
    const total = prog * segCount;
    const idx = Math.min(segCount - 1, Math.floor(total));
    const local = total - idx;
    const a = pathPts[idx]!;
    const c = pathPts[idx + 1]!;
    const [bx, by] = iso(a[0] + (c[0] - a[0]) * local + 0.5, a[1] + (c[1] - a[1]) * local + 0.5, 0.15);
    drawBloom(ctx, bx, by, 14, lime(isLight, 0.7));
    ctx.fillStyle = isLight ? '#0A0A0B' : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(bx, by, 2.8, 0, TAU);
    ctx.fill();
  }

  // Painter's algorithm isometric blocks & elemental bastion towers (back to front)
  const drawBlock = (gx: number, gy: number, height: number, accentHue: number | null) => {
    const topC = isLight
      ? accentHue !== null
        ? pigment(true, accentHue, 0.88)
        : '#DDD9CE'
      : accentHue !== null
        ? tone(0.54, 0.15, accentHue, 1)
        : '#262930';
    const leftC = isLight
      ? accentHue !== null
        ? tone(0.36, 0.14, accentHue, 1)
        : '#B7B2A6'
      : accentHue !== null
        ? tone(0.34, 0.12, accentHue, 1)
        : '#14161C';
    const rightC = isLight
      ? accentHue !== null
        ? tone(0.28, 0.12, accentHue, 1)
        : '#8C887E'
      : accentHue !== null
        ? tone(0.22, 0.09, accentHue, 1)
        : '#0B0C10';

    const p00 = iso(gx, gy, height);
    const p10 = iso(gx + 1, gy, height);
    const p11 = iso(gx + 1, gy + 1, height);
    const p01 = iso(gx, gy + 1, height);
    const b10 = iso(gx + 1, gy, 0);
    const b11 = iso(gx + 1, gy + 1, 0);
    const b01 = iso(gx, gy + 1, 0);

    // Left face
    ctx.fillStyle = leftC;
    ctx.beginPath();
    ctx.moveTo(p01[0], p01[1]);
    ctx.lineTo(p11[0], p11[1]);
    ctx.lineTo(b11[0], b11[1]);
    ctx.lineTo(b01[0], b01[1]);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = rightC;
    ctx.beginPath();
    ctx.moveTo(p10[0], p10[1]);
    ctx.lineTo(p11[0], p11[1]);
    ctx.lineTo(b11[0], b11[1]);
    ctx.lineTo(b10[0], b10[1]);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = topC;
    ctx.beginPath();
    ctx.moveTo(p00[0], p00[1]);
    ctx.lineTo(p10[0], p10[1]);
    ctx.lineTo(p11[0], p11[1]);
    ctx.lineTo(p01[0], p01[1]);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isLight ? 'rgba(10,10,11,0.28)' : 'rgba(245,243,236,0.16)';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // Levitating glowing elemental crystal atop bastion towers
    if (accentHue !== null) {
      const hover = Math.sin(t * 2.8 + gx + gy) * 3.5;
      const [tx, ty] = iso(gx + 0.5, gy + 0.5, height + 0.95);
      const cy = ty + hover;
      drawBloom(ctx, tx, cy, tile * 1.4, pigment(isLight, accentHue, isLight ? 0.32 : 0.65));
      ctx.fillStyle = isLight ? pigment(true, accentHue, 1) : tone(0.9, 0.16, accentHue, 1);
      ctx.beginPath();
      ctx.moveTo(tx, cy - tile * 0.58);
      ctx.lineTo(tx + tile * 0.34, cy);
      ctx.lineTo(tx, cy + tile * 0.44);
      ctx.lineTo(tx - tile * 0.34, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ink(isLight, 0.7);
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  };

  for (let gy = 0; gy < 9; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      const cell = grid[gy]![gx]!;
      if (cell === 1) {
        drawBlock(gx, gy, 0.56, null);
      } else if (cell >= 2) {
        drawBlock(gx, gy, 1.05, towerSpec[cell]!.hue);
      }
    }
  }
  ctx.restore();
}

// ============================================================================
// 9. bitforge-80 — 128x128 Tactile Pixel Fantasy Console
// ============================================================================
function drawBitforge80({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 152, 162);
  ctx.save();

  // Tactile pixel display screen region
  const pad = Math.max(10, Math.round(Math.min(w, h) * 0.07));
  const sx = pad;
  const sy = pad;
  const sw = w - pad * 2;
  const sh = h - pad * 2;

  // Recessed console screen chassis
  ctx.fillStyle = isLight ? '#141B17' : '#050907';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = isLight ? '#0A0A0B' : 'rgba(245,243,236,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, sw, sh);

  // Crisp integer pixel grid inside screen
  const px = clamp(Math.floor(Math.min(sw, sh) / 28), 3, 12);
  const cols = Math.floor(sw / px);
  const rows = Math.floor(sh / px);
  const ox = sx + Math.floor((sw - cols * px) / 2);
  const oy = sy + Math.floor((sh - rows * px) / 2);

  const pRect = (gx: number, gy: number, gw: number, gh: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(ox + Math.round(gx) * px, oy + Math.round(gy) * px, Math.round(gw) * px, Math.round(gh) * px);
  };

  // Retro arcade stepped sky horizon bands (emerald-teal -> dark spruce)
  const hor = Math.floor(rows * 0.64);
  pRect(0, 0, cols, hor, '#071310');
  pRect(0, Math.floor(hor * 0.62), cols, Math.ceil(hor * 0.38), '#0B211B');

  // Pixelated stepped twin mountain peaks
  for (let c = 0; c < cols; c++) {
    const u = c / cols;
    const m1 = Math.max(0, 1 - Math.abs(u - 0.32) * 5.2) * hor * 0.42;
    const m2 = Math.max(0, 1 - Math.abs(u - 0.72) * 4.4) * hor * 0.56;
    const mh = Math.floor(Math.max(m1, m2));
    if (mh > 0) {
      pRect(c, hor - mh, 1, mh, '#133B31');
      if (mh > 2) pRect(c, hor - mh, 1, 1, '#2EE59D');
    }
  }

  // Tiled arcade checkerboard dungeon floor scrolling smoothly with t
  const scroll = Math.floor(t * 6);
  for (let r = hor; r < rows; r++) {
    const depth = (r - hor) / Math.max(1, rows - hor);
    const tileW = Math.max(2, Math.floor(2 + depth * 3));
    for (let c = 0; c < cols; c++) {
      const odd = (Math.floor((c + scroll) / tileW) + r) % 2 === 0;
      pRect(c, r, 1, 1, odd ? '#0E241C' : '#081611');
    }
  }
  // Acid-lime horizon line
  pRect(0, hor, cols, 1, '#D2FF28');

  // Hero pixel arcade starfighter sprite (crisp symmetric 11x9 bitmap!)
  const shipMask = [
    '.....A.....',
    '....AAA....',
    '....ACA....',
    '...AACAA...',
    '..BAAAAAB..',
    '.BBAAAAABB.',
    'BBB.AAA.BBB',
    'B...A.A...B',
    '....D.D....',
  ];
  const shipBob = Math.round(Math.sin(t * 4.2) * 1.4);
  const shipX = Math.floor(cols * 0.58) - 5;
  const shipY = Math.floor(hor * 0.56) - 4 + shipBob;

  // Phosphor bloom behind hero sprite
  drawBloom(
    ctx,
    ox + (shipX + 5.5) * px,
    oy + (shipY + 4.5) * px,
    px * 11,
    'rgba(210,255,40,0.34)',
    'rgba(46,229,157,0.12)',
  );

  for (let ry = 0; ry < shipMask.length; ry++) {
    const line = shipMask[ry]!;
    for (let rx = 0; rx < line.length; rx++) {
      const ch = line[rx];
      if (ch === '.') continue;
      const col =
        ch === 'A'
          ? '#D2FF28'
          : ch === 'B'
            ? '#FFB82E'
            : ch === 'C'
              ? '#49E6FF'
              : t % 0.3 < 0.15
                ? '#FF5226'
                : '#FFD95A';
      pRect(shipX + rx, shipY + ry, 1, 1, col);
    }
  }

  // Secondary retro invader / crystal gem sprite left-upper
  const gemMask = [
    '..C..',
    '.CBC.',
    'CBABC',
    '.CBC.',
    '..C..',
  ];
  const gx1 = Math.floor(cols * 0.24) - 2;
  const gy1 = Math.floor(hor * 0.34) - 2 + Math.round(Math.cos(t * 3.1) * 1.2);
  drawBloom(ctx, ox + (gx1 + 2.5) * px, oy + (gy1 + 2.5) * px, px * 6, 'rgba(73,230,255,0.28)');
  for (let ry = 0; ry < gemMask.length; ry++) {
    const line = gemMask[ry]!;
    for (let rx = 0; rx < line.length; rx++) {
      const ch = line[rx];
      if (ch === '.') continue;
      pRect(gx1 + rx, gy1 + ry, 1, 1, ch === 'A' ? '#FFFFFF' : ch === 'B' ? '#49E6FF' : '#2EE59D');
    }
  }

  // Animated laser pulse bolts & pixel stars
  const boltX = (Math.floor(cols * 0.58 + (t * 16) % (cols * 0.45))) % cols;
  pRect(boltX, Math.max(2, shipY - 2), 3, 1, '#FFB82E');
  pRect(Math.floor(cols * 0.82), Math.floor(hor * 0.24), 1, 1, '#D2FF28');
  pRect(Math.floor(cols * 0.14), Math.floor(hor * 0.2), 1, 1, '#FFB82E');
  pRect(Math.floor(cols * 0.44), Math.floor(hor * 0.16), 1, 1, '#49E6FF');

  // Subtle CRT scanlines over screen
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  for (let y = sy; y < sy + sh; y += 3) {
    ctx.fillRect(sx, y, sw, 1);
  }

  // Hardware console LED indicator dots in outer bezel
  ctx.fillStyle = '#D2FF28';
  ctx.beginPath();
  ctx.arc(sx + sw - 12, sy - pad * 0.48, 2.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#FF5226';
  ctx.beginPath();
  ctx.arc(sx + sw - 22, sy - pad * 0.48, 2.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ============================================================================
// 10. alchemists_ledger — Suminagashi Marbled Fluid Ink & Brass Astrolabe
// ============================================================================
function drawAlchemistsLedger({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 38, 46);
  const noise = makeNoise(seed ^ 0x50a1a9);
  const minD = Math.min(w, h);

  ctx.save();
  // 3 Suminagashi organic fluid drop eddies with domain-warped fBm rings
  const eddies: Array<{ cx: number; cy: number; maxR: number; rings: number; hues: number[] }> = [
    { cx: w * 0.58, cy: h * 0.48, maxR: minD * 0.68, rings: 18, hues: [38, 62, 172, 46] },
    { cx: w * 0.22, cy: h * 0.34, maxR: minD * 0.42, rings: 11, hues: [172, 44, 62] },
    { cx: w * 0.86, cy: h * 0.72, maxR: minD * 0.38, rings: 10, hues: [42, 168, 56] },
  ];

  const drift = t * 0.16;

  for (let eIdx = 0; eIdx < eddies.length; eIdx++) {
    const ed = eddies[eIdx]!;
    for (let r = ed.rings; r >= 1; r--) {
      const frac = r / ed.rings;
      const baseR = ed.maxR * frac;
      const ringHue = ed.hues[r % ed.hues.length]!;
      const isIvoryBand = r % 4 === 0;

      ctx.beginPath();
      const segs = 72;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * TAU;
        const ux = Math.cos(a) * frac * 1.85 + eIdx * 3.1;
        const uy = Math.sin(a) * frac * 1.85 + eIdx * 1.9;
        // Domain-warped fluid curl displacement
        const wx = noise.fbm(ux + drift, uy - drift * 0.6, 3) - 0.5;
        const wy = noise.fbm(ux - drift * 0.5 + 7.2, uy + drift + 2.4, 3) - 0.5;
        const swirl = 0.28 * baseR;
        const px = ed.cx + Math.cos(a) * baseR + wx * swirl * 2.1;
        const py = ed.cy + Math.sin(a) * baseR * 0.86 + wy * swirl * 1.9;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      if (isIvoryBand) {
        ctx.fillStyle = isLight ? 'rgba(245,243,236,0.72)' : 'rgba(242,232,210,0.12)';
      } else {
        ctx.fillStyle = isLight
          ? pigment(true, ringHue, 0.22 + (1 - frac) * 0.24, -0.05)
          : tone(0.32 + (1 - frac) * 0.28, 0.13, ringHue, 0.34 + (1 - frac) * 0.24);
      }
      ctx.fill();

      ctx.strokeStyle = isIvoryBand
        ? pigment(isLight, 58, isLight ? 0.55 : 0.45)
        : pigment(isLight, ringHue, isLight ? 0.52 : 0.42);
      ctx.lineWidth = r % 3 === 0 ? 1.25 : 0.75;
      ctx.stroke();
    }
  }

  // Fine alchemical brass astrolabe geometry overlaid sharply
  const ax = w * 0.58;
  const ay = h * 0.48;
  const ar = minD * 0.38;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.strokeStyle = isLight ? tone(0.46, 0.14, 54, 0.85) : tone(0.84, 0.14, 62, 0.78);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, ar, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.arc(0, 0, ar * 0.74, 0, TAU);
  ctx.stroke();

  // Off-center ecliptic brass circle
  ctx.save();
  ctx.rotate(t * 0.12);
  ctx.strokeStyle = isLight ? tone(0.42, 0.13, 44, 0.72) : tone(0.82, 0.13, 52, 0.65);
  ctx.beginPath();
  ctx.arc(ar * 0.16, -ar * 0.08, ar * 0.54, 0, TAU);
  ctx.stroke();

  // Alchemical equilateral triangle inside astrolabe
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -PI * 0.5 + (i * TAU) / 3;
    const vx = Math.cos(a) * ar * 0.74;
    const vy = Math.sin(a) * ar * 0.74;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.stroke();

  // Astrolabe brass degree ticks
  ctx.beginPath();
  for (let d = 0; d < 36; d++) {
    const a = (d / 36) * TAU;
    const len = d % 3 === 0 ? 7 : 3;
    ctx.moveTo(Math.cos(a) * ar, Math.sin(a) * ar);
    ctx.lineTo(Math.cos(a) * (ar + len), Math.sin(a) * (ar + len));
  }
  ctx.stroke();
  ctx.restore();

  // Center philosopher's gold pin
  ctx.fillStyle = isLight ? tone(0.48, 0.16, 48, 1) : tone(0.9, 0.15, 68, 1);
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ============================================================================
// 11. swarm_tycoon — Photolithography Silicon Wafer Die
// ============================================================================
function drawSwarmTycoon({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 192, 184);
  const rng = mulberry32(seed ^ 0x5111c0);
  const minD = Math.min(w, h);
  const cx = w * 0.58;
  const cy = h * 0.5;
  const R = minD * 0.47;

  ctx.save();
  // Cleanroom outer wafer aura
  drawBloom(ctx, cx, cy, R * 1.45, pigment(isLight, 184, isLight ? 0.14 : 0.24), pigment(isLight, 64, 0.08));

  // Circular silicon wafer silhouette with bottom alignment notch
  const notchAng = PI * 0.5;
  const waferPath = () => {
    ctx.beginPath();
    ctx.arc(cx, cy, R, notchAng + 0.07, notchAng + TAU - 0.07);
    ctx.lineTo(cx, cy + R - 7);
    ctx.closePath();
  };

  // Iridescent silicon steel-teal wafer sheen (non-purple!)
  const waferGrad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  if (isLight) {
    waferGrad.addColorStop(0, tone(0.84, 0.06, 196, 1));
    waferGrad.addColorStop(0.45, tone(0.76, 0.085, 178, 1));
    waferGrad.addColorStop(0.78, tone(0.82, 0.07, 68, 1));
    waferGrad.addColorStop(1, tone(0.68, 0.08, 198, 1));
  } else {
    waferGrad.addColorStop(0, tone(0.24, 0.085, 198, 1));
    waferGrad.addColorStop(0.42, tone(0.16, 0.065, 176, 1));
    waferGrad.addColorStop(0.7, tone(0.26, 0.095, 68, 1));
    waferGrad.addColorStop(1, '#081014');
  }
  waferPath();
  ctx.fillStyle = waferGrad;
  ctx.fill();

  // Clip rectilinear microchip die grid inside wafer
  ctx.save();
  waferPath();
  ctx.clip();

  const dieSize = Math.max(16, Math.round(R * 0.28));
  const startX = cx - Math.ceil(R / dieSize) * dieSize;
  const startY = cy - Math.ceil(R / dieSize) * dieSize;

  for (let y = startY; y < cy + R; y += dieSize) {
    for (let x = startX; x < cx + R; x += dieSize) {
      const isHeroDie = Math.abs(x + dieSize * 0.5 - cx) < dieSize * 0.9 && Math.abs(y + dieSize * 0.5 - cy) < dieSize * 0.9;
      const lit = rng() > 0.65;
      ctx.fillStyle = isHeroDie
        ? isLight
          ? tone(0.44, 0.14, 186, 0.35)
          : tone(0.42, 0.13, 188, 0.45)
        : lit
          ? pigment(isLight, 178, isLight ? 0.16 : 0.18)
          : 'rgba(0,0,0,0.08)';
      ctx.fillRect(x + 1.5, y + 1.5, dieSize - 3, dieSize - 3);

      ctx.strokeStyle = isHeroDie ? pigment(isLight, 64, 0.85) : ink(isLight, isLight ? 0.24 : 0.2);
      ctx.lineWidth = isHeroDie ? 1.2 : 0.7;
      ctx.strokeRect(x + 1.5, y + 1.5, dieSize - 3, dieSize - 3);

      // Microscopic internal sub-cell logic stripes
      if (dieSize >= 20) {
        ctx.fillStyle = isHeroDie ? pigment(isLight, 64, 0.6) : ink(isLight, 0.16);
        ctx.fillRect(x + 5, y + 5, dieSize * 0.32, 2);
        ctx.fillRect(x + 5, y + dieSize - 8, dieSize * 0.5, 2);
        ctx.fillRect(x + dieSize - 8, y + 5, 2.5, dieSize * 0.45);
      }
    }
  }
  ctx.restore();

  // Crisp bevel ring around wafer
  waferPath();
  ctx.strokeStyle = pigment(isLight, 188, 0.85);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Magnified rectilinear gold & cyan VLSI bus traces radiating across wafer & cleanroom
  const traces: Array<{ pts: Array<[number, number]>; hue: number }> = [
    {
      pts: [
        [w * 0.12, h * 0.28],
        [w * 0.34, h * 0.28],
        [w * 0.42, h * 0.38],
        [cx, h * 0.38],
        [cx + R * 0.38, cy],
      ],
      hue: 64,
    },
    {
      pts: [
        [w * 0.16, h * 0.68],
        [w * 0.36, h * 0.68],
        [w * 0.46, h * 0.56],
        [cx + R * 0.24, h * 0.56],
        [w * 0.88, h * 0.42],
      ],
      hue: 194,
    },
    {
      pts: [
        [cx - R * 0.28, h * 0.14],
        [cx - R * 0.28, h * 0.32],
        [cx, h * 0.48],
        [cx + R * 0.46, h * 0.72],
        [w * 0.9, h * 0.72],
      ],
      hue: 112,
    },
  ];

  for (let i = 0; i < traces.length; i++) {
    const tr = traces[i]!;
    ctx.beginPath();
    for (let k = 0; k < tr.pts.length; k++) {
      const [px, py] = tr.pts[k]!;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = tr.hue === 112 ? lime(isLight, 0.75) : pigment(isLight, tr.hue, 0.82);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Via pads at vertices
    for (const [px, py] of tr.pts) {
      ctx.fillStyle = isLight ? '#F5F3EC' : '#05080A';
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = tr.hue === 112 ? lime(isLight, 0.95) : pigment(isLight, tr.hue, 0.95);
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // Animated traveling data-packet pulse along rectilinear trace
    const segs = tr.pts.length - 1;
    const prog = ((t * 0.46 + i * 0.31) % 1) * segs;
    const idx = Math.min(segs - 1, Math.floor(prog));
    const f = prog - idx;
    const [x1, y1] = tr.pts[idx]!;
    const [x2, y2] = tr.pts[idx + 1]!;
    const px = x1 + (x2 - x1) * f;
    const py = y1 + (y2 - y1) * f;
    drawBloom(ctx, px, py, 16, tr.hue === 112 ? lime(isLight, 0.78) : pigment(isLight, tr.hue, 0.78));
    ctx.fillStyle = isLight ? '#0A0A0B' : '#FFFFFF';
    ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
  }
  ctx.restore();
}

// ============================================================================
// 12. taxquest — Swiss Banknote Guilloche & Vault
// ============================================================================
function drawTaxquest({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 146, 138);
  const minD = Math.min(w, h);
  const cx = w * 0.58;
  const cy = h * 0.5;
  const R = minD * 0.42;

  ctx.save();
  // Crisp architectural currency ledger rules across background
  ctx.strokeStyle = pigment(isLight, 146, isLight ? 0.14 : 0.12);
  ctx.lineWidth = 0.75;
  const ruleStep = Math.max(12, Math.round(h / 18));
  ctx.beginPath();
  for (let y = ruleStep; y < h; y += ruleStep) {
    ctx.moveTo(16, y + 0.5);
    ctx.lineTo(w - 16, y + 0.5);
  }
  ctx.stroke();

  // Subtle vertical ledger columns on left margin
  ctx.strokeStyle = pigment(isLight, 64, isLight ? 0.24 : 0.18);
  ctx.beginPath();
  ctx.moveTo(w * 0.16, 16);
  ctx.lineTo(w * 0.16, h - 16);
  ctx.moveTo(w * 0.18, 16);
  ctx.lineTo(w * 0.18, h - 16);
  ctx.stroke();

  drawBloom(ctx, cx, cy, R * 1.4, pigment(isLight, 146, isLight ? 0.16 : 0.28), pigment(isLight, 68, 0.1));

  // Intricate multi-layer mathematical hypotrochoid / guilloche banknote rosette
  const layers = [
    { R0: R * 0.88, r0: R * 0.22, d: R * 0.34, petals: 12, hue: 146, rot: t * 0.08, alpha: 0.72 },
    { R0: R * 0.78, r0: R * 0.195, d: R * 0.3, petals: 16, hue: 66, rot: -t * 0.06 + 0.2, alpha: 0.68 },
    { R0: R * 0.62, r0: R * 0.155, d: R * 0.24, petals: 9, hue: 162, rot: t * 0.1 + 0.5, alpha: 0.58 },
  ];

  for (const ly of layers) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ly.rot);
    ctx.strokeStyle = pigment(isLight, ly.hue, ly.alpha);
    ctx.lineWidth = 0.95;

    for (let strand = 0; strand < 3; strand++) {
      const phase = (strand / 3) * 0.32;
      ctx.beginPath();
      const steps = 260;
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * TAU * 3;
        const k = ly.petals / 3;
        const rad = ly.R0 * 0.74 + Math.cos(k * theta + phase) * ly.d * 0.62 + Math.sin(theta * 2) * ly.r0 * 0.18;
        const x = Math.cos(theta) * rad;
        const y = Math.sin(theta) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Precision Swiss combination vault dial
  const dialR = R * 0.44;
  ctx.fillStyle = isLight ? '#F8F6F0' : '#060A08';
  ctx.beginPath();
  ctx.arc(cx, cy, dialR, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = pigment(isLight, 68, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Graduated combination dial ticks rotating subtly
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.5) * 0.35);
  ctx.strokeStyle = ink(isLight, isLight ? 0.72 : 0.78);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const major = i % 5 === 0;
    const rIn = dialR * (major ? 0.72 : 0.83);
    const rOut = dialR * 0.94;
    ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
    ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
  }
  ctx.stroke();

  // Central vault lock spokes
  ctx.strokeStyle = pigment(isLight, 146, 0.92);
  ctx.lineWidth = 2;
  for (let s = 0; s < 3; s++) {
    const a = (s * TAU) / 3 - PI * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * dialR * 0.52, Math.sin(a) * dialR * 0.52);
    ctx.stroke();
  }
  ctx.fillStyle = pigment(isLight, 68, 1);
  ctx.beginPath();
  ctx.arc(0, 0, dialR * 0.16, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Top red/lime vault alignment index triangle
  ctx.fillStyle = lime(isLight, 1);
  ctx.beginPath();
  ctx.moveTo(cx, cy - dialR - 3);
  ctx.lineTo(cx - 5, cy - dialR - 12);
  ctx.lineTo(cx + 5, cy - dialR - 12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ============================================================================
// 13. clausehound-ai — Faraday Brass Redline Blueprint
// ============================================================================
function drawClausehoundAi({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 54, 48);
  const minD = Math.min(w, h);

  ctx.save();
  // Blueprint drafting micro-grid
  const pitch = Math.max(18, Math.round(minD / 12));
  ctx.strokeStyle = ink(isLight, isLight ? 0.065 : 0.05);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = pitch; x < w; x += pitch) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = pitch; y < h; y += pitch) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // 3 stacked architectural contract document planes in sleek oblique perspective
  const drawPage = (cx: number, cy: number, pw: number, ph: number, depthIdx: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(1, -0.18, 0.36, 0.84, 0, 0);

    // Page shadow
    ctx.fillStyle = isLight ? 'rgba(10,10,11,0.12)' : 'rgba(0,0,0,0.58)';
    ctx.fillRect(-pw * 0.5 + 8, -ph * 0.5 + 10, pw, ph);

    // Page substrate
    ctx.fillStyle = isLight
      ? depthIdx === 2
        ? '#FFFFFF'
        : '#F0EDE4'
      : depthIdx === 2
        ? '#121419'
        : '#0A0B0F';
    ctx.fillRect(-pw * 0.5, -ph * 0.5, pw, ph);

    // Brass blueprint border
    ctx.strokeStyle =
      depthIdx === 2
        ? pigment(isLight, 54, isLight ? 0.85 : 0.78)
        : ink(isLight, isLight ? 0.25 : 0.2);
    ctx.lineWidth = depthIdx === 2 ? 1.6 : 1;
    ctx.strokeRect(-pw * 0.5, -ph * 0.5, pw, ph);

    // Clause lines & trap highlights on top page
    if (depthIdx === 2) {
      const mX = -pw * 0.4;
      const lineW = pw * 0.8;
      // Header bar
      ctx.fillStyle = pigment(isLight, 54, 0.85);
      ctx.fillRect(mX, -ph * 0.38, lineW * 0.44, 5);

      const rows = 9;
      for (let r = 0; r < rows; r++) {
        const ly = -ph * 0.24 + r * (ph * 0.072);
        const rw = lineW * (r % 3 === 2 ? 0.62 : r % 2 === 0 ? 0.94 : 0.82);
        const isTrap = r === 3 || r === 4 || r === 7;

        if (isTrap) {
          // Vermilion redline highlight box + strikethrough scalpel cut
          ctx.fillStyle = pigment(isLight, 18, isLight ? 0.22 : 0.26);
          ctx.fillRect(mX - 4, ly - 3, rw + 8, 9);
          ctx.fillStyle = pigment(isLight, 18, 0.95);
          ctx.fillRect(mX, ly, rw, 3);
        } else {
          ctx.fillStyle = ink(isLight, isLight ? 0.26 : 0.28);
          ctx.fillRect(mX, ly, rw, 2.5);
        }
      }

      // Precision redline bracket margin annotation
      ctx.strokeStyle = pigment(isLight, 18, 0.95);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(mX + lineW + 10, -ph * 0.24 + 3 * ph * 0.072 - 4);
      ctx.lineTo(mX + lineW + 16, -ph * 0.24 + 3 * ph * 0.072 - 4);
      ctx.lineTo(mX + lineW + 16, -ph * 0.24 + 4 * ph * 0.072 + 6);
      ctx.lineTo(mX + lineW + 10, -ph * 0.24 + 4 * ph * 0.072 + 6);
      ctx.stroke();
    }
    ctx.restore();
  };

  const pageW = minD * 0.62;
  const pageH = minD * 0.72;
  drawPage(w * 0.54 - 26, h * 0.52 + 24, pageW, pageH, 0);
  drawPage(w * 0.54 - 12, h * 0.52 + 12, pageW, pageH, 1);
  drawPage(w * 0.54 + 4, h * 0.52 - 2, pageW, pageH, 2);

  // Razor-sharp glowing scalpel laser scan beam slicing across the contract planes
  const scanY = h * (0.28 + 0.44 * (0.5 + 0.5 * Math.sin(t * 1.1)));
  const beamGrad = ctx.createLinearGradient(0, scanY - 26, 0, scanY + 26);
  beamGrad.addColorStop(0, 'rgba(255,77,36,0)');
  beamGrad.addColorStop(0.5, pigment(isLight, 18, isLight ? 0.34 : 0.44));
  beamGrad.addColorStop(1, 'rgba(255,77,36,0)');
  ctx.fillStyle = beamGrad;
  ctx.fillRect(0, scanY - 26, w, 52);

  ctx.strokeStyle = isLight ? pigment(true, 18, 0.96) : '#FF633D';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(w, scanY);
  ctx.stroke();

  // Bright laser contact spark
  drawBloom(ctx, w * 0.58, scanY, 24, pigment(isLight, 24, 0.78), lime(isLight, 0.3));
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(w * 0.58, scanY, 3, 0, TAU);
  ctx.fill();

  // Faraday brass corner calibration ticks & vernier crosshair
  const bColor = pigment(isLight, 52, isLight ? 0.85 : 0.78);
  ctx.strokeStyle = bColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(w * 0.84, h * 0.22, minD * 0.06, 0, TAU);
  ctx.moveTo(w * 0.84 - 12, h * 0.22);
  ctx.lineTo(w * 0.84 + 12, h * 0.22);
  ctx.moveTo(w * 0.84, h * 0.22 - 12);
  ctx.lineTo(w * 0.84, h * 0.22 + 12);
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// 14. chaosdeck-sre — Phosphor War-Room Incident Topology
// ============================================================================
function drawChaosdeckSre({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 158, 162);
  const minD = Math.min(w, h);
  ctx.save();

  // Upper horizon latency oscilloscope panel
  const scopeH = h * 0.26;
  ctx.fillStyle = isLight ? 'rgba(10,10,11,0.035)' : 'rgba(245,243,236,0.025)';
  ctx.fillRect(0, 0, w, scopeH);
  ctx.strokeStyle = ink(isLight, isLight ? 0.16 : 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, scopeH);
  ctx.lineTo(w, scopeH);
  ctx.stroke();

  // Threshold SLA dotted alarm line
  const slaY = scopeH * 0.42;
  ctx.strokeStyle = pigment(isLight, 18, 0.55);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, slaY);
  ctx.lineTo(w, slaY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Real-time scrolling latency wave with sharp incident spike
  ctx.beginPath();
  const pts = 96;
  for (let i = 0; i <= pts; i++) {
    const u = i / pts;
    const x = u * w;
    const spikeCenter = (0.64 + t * 0.08) % 1;
    const dSpike = Math.min(Math.abs(u - spikeCenter), 1 - Math.abs(u - spikeCenter)) / 0.055;
    const spike = Math.exp(-dSpike * dSpike) * scopeH * 0.62;
    const jitter = (0.5 + 0.5 * Math.sin(u * 38 - t * 4.5)) * scopeH * 0.12;
    const y = scopeH * 0.84 - jitter - spike;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = pigment(isLight, 192, 0.92);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Microservice node constellation
  const nodes: Array<{ x: number; y: number; state: 'ok' | 'warn' | 'crit'; r: number }> = [
    { x: w * 0.58, y: h * 0.54, state: 'crit', r: 10 }, // central incident epicenter
    { x: w * 0.34, y: h * 0.42, state: 'ok', r: 7 },
    { x: w * 0.44, y: h * 0.74, state: 'warn', r: 7.5 },
    { x: w * 0.76, y: h * 0.4, state: 'ok', r: 8 },
    { x: w * 0.82, y: h * 0.68, state: 'ok', r: 7 },
    { x: w * 0.22, y: h * 0.62, state: 'ok', r: 6.5 },
    { x: w * 0.64, y: h * 0.82, state: 'warn', r: 6.5 },
    { x: w * 0.48, y: h * 0.34, state: 'ok', r: 6 },
    { x: w * 0.9, y: h * 0.48, state: 'ok', r: 6 },
  ];

  const links: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 6],
    [0, 7],
    [1, 5],
    [1, 7],
    [2, 5],
    [2, 6],
    [3, 4],
    [3, 7],
    [3, 8],
    [4, 6],
    [4, 8],
  ];

  const stateHue = (s: 'ok' | 'warn' | 'crit') => (s === 'crit' ? 18 : s === 'warn' ? 46 : 156);

  // Expanding vermilion alert shockwaves from critical node
  const crit = nodes[0]!;
  drawBloom(ctx, crit.x, crit.y, minD * 0.32, pigment(isLight, 18, isLight ? 0.22 : 0.36));
  for (let wv = 0; wv < 3; wv++) {
    const p = (t * 0.55 + wv / 3) % 1;
    ctx.strokeStyle = pigment(isLight, 18, (1 - p) * 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(crit.x, crit.y, crit.r + p * minD * 0.22, 0, TAU);
    ctx.stroke();
  }

  // Curved glowing traffic arcs + moving request packets
  for (let i = 0; i < links.length; i++) {
    const [ai, bi] = links[i]!;
    const a = nodes[ai]!;
    const b = nodes[bi]!;
    const mx = (a.x + b.x) * 0.5 + (a.y - b.y) * 0.12;
    const my = (a.y + b.y) * 0.5 + (b.x - a.x) * 0.12;
    const linkHue = a.state === 'crit' || b.state === 'crit' ? 28 : a.state === 'warn' || b.state === 'warn' ? 48 : 158;

    ctx.strokeStyle = pigment(isLight, linkHue, isLight ? 0.45 : 0.42);
    ctx.lineWidth = a.state === 'crit' || b.state === 'crit' ? 1.5 : 1.1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();

    // Animated traffic packet dot
    const u = (t * (0.45 + (i % 4) * 0.12) + i * 0.23) % 1;
    const px = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
    const py = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y;
    ctx.fillStyle = linkHue === 158 ? lime(isLight, 0.95) : pigment(isLight, linkHue, 1);
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, TAU);
    ctx.fill();
  }

  // Draw microservice nodes (hexagonal service icons + pulsing halos)
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const nh = stateHue(n.state);
    const rr = n.r * (minD / 280 + 0.55);

    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * TAU - PI * 0.5;
      const vx = n.x + Math.cos(ang) * rr;
      const vy = n.y + Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fillStyle = isLight ? '#FFFFFF' : '#060A0C';
    ctx.fill();
    ctx.strokeStyle = pigment(isLight, nh, 0.96);
    ctx.lineWidth = n.state === 'crit' ? 2.2 : 1.5;
    ctx.stroke();

    ctx.fillStyle = pigment(isLight, nh, 1);
    ctx.beginPath();
    ctx.arc(n.x, n.y, rr * 0.36, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================================
// 15. ozias_laboratory — Kinetic Lab Dual-Beam Oscilloscope
// ============================================================================
function drawOziasLaboratory({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 148, 158);
  const minD = Math.min(w, h);
  ctx.save();

  // Illuminated CRT calibration graticule (8x6 divisions + center axis ticks)
  const gx0 = w * 0.08;
  const gy0 = h * 0.1;
  const gw = w * 0.84;
  const gh = h * 0.8;

  ctx.strokeStyle = pigment(isLight, 152, isLight ? 0.18 : 0.16);
  ctx.lineWidth = 0.85;
  ctx.strokeRect(gx0, gy0, gw, gh);
  ctx.beginPath();
  for (let c = 1; c < 8; c++) {
    const x = gx0 + (c / 8) * gw;
    ctx.moveTo(x, gy0);
    ctx.lineTo(x, gy0 + gh);
  }
  for (let r = 1; r < 6; r++) {
    const y = gy0 + (r / 6) * gh;
    ctx.moveTo(gx0, y);
    ctx.lineTo(gx0 + gw, y);
  }
  ctx.stroke();

  // Center crosshairs with precision sub-ticks
  const cx = gx0 + gw * 0.54;
  const cy = gy0 + gh * 0.5;
  ctx.strokeStyle = pigment(isLight, 152, isLight ? 0.36 : 0.34);
  ctx.beginPath();
  ctx.moveTo(gx0, cy);
  ctx.lineTo(gx0 + gw, cy);
  ctx.moveTo(cx, gy0);
  ctx.lineTo(cx, gy0 + gh);
  for (let i = 0; i <= 40; i++) {
    const tx = gx0 + (i / 40) * gw;
    ctx.moveTo(tx, cy - 3);
    ctx.lineTo(tx, cy + 3);
  }
  ctx.stroke();

  // Phosphor glow behind dual-beam Lissajous curve
  drawBloom(ctx, cx, cy, minD * 0.44, lime(isLight, isLight ? 0.16 : 0.26), pigment(isLight, 192, 0.14));

  // Beam 1 (Acid-Lime Phosphor) & Beam 2 (Electric Cyan) harmonic Lissajous figure-8
  const ampX = gw * 0.34;
  const ampY = gh * 0.36;
  const drawBeam = (fx: number, fy: number, delta: number, color: string, glowColor: string) => {
    ctx.beginPath();
    const N = 180;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const x = cx + Math.sin(fx * a + delta) * ampX;
      const y = cy + Math.sin(fy * a) * ampY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.85;
    ctx.stroke();
  };

  drawBeam(2, 3, t * 0.72 + 0.6, lime(isLight, 0.96), lime(isLight, 0.26));
  drawBeam(3, 2, -t * 0.55 + 1.4, pigment(isLight, 194, 0.94), pigment(isLight, 194, 0.24));

  // Stylized drafted Erlenmeyer experiment flask (left-lower quadrant)
  const fx = gx0 + gw * 0.16;
  const fy = gy0 + gh * 0.62;
  const fS = minD * 0.16;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.beginPath();
  ctx.moveTo(-fS * 0.2, -fS * 0.75);
  ctx.lineTo(-fS * 0.2, -fS * 0.3);
  ctx.lineTo(-fS * 0.68, fS * 0.56);
  ctx.lineTo(fS * 0.68, fS * 0.56);
  ctx.lineTo(fS * 0.2, -fS * 0.3);
  ctx.lineTo(fS * 0.2, -fS * 0.75);
  ctx.closePath();
  ctx.fillStyle = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(6,16,12,0.55)';
  ctx.fill();
  ctx.strokeStyle = pigment(isLight, 162, 0.85);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Bubbling glowing reagent inside flask
  ctx.beginPath();
  ctx.moveTo(-fS * 0.45, fS * 0.12);
  ctx.lineTo(-fS * 0.62, fS * 0.52);
  ctx.lineTo(fS * 0.62, fS * 0.52);
  ctx.lineTo(fS * 0.45, fS * 0.12);
  ctx.closePath();
  ctx.fillStyle = lime(isLight, isLight ? 0.36 : 0.45);
  ctx.fill();
  ctx.restore();

  // Floating geometric Bohr atom with orbiting plasma sparks (upper-right)
  const ax = gx0 + gw * 0.84;
  const ay = gy0 + gh * 0.26;
  const aR = minD * 0.11;
  ctx.save();
  ctx.translate(ax, ay);
  for (let k = 0; k < 3; k++) {
    ctx.save();
    ctx.rotate((k * PI) / 3 + t * 0.25);
    ctx.strokeStyle = pigment(isLight, 48, 0.72);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, aR, aR * 0.38, 0, 0, TAU);
    ctx.stroke();

    const ea = t * (2.2 + k * 0.4) + k * 2.1;
    const ex = Math.cos(ea) * aR;
    const ey = Math.sin(ea) * aR * 0.38;
    ctx.fillStyle = pigment(isLight, 44, 1);
    ctx.beginPath();
    ctx.arc(ex, ey, 2.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = lime(isLight, 1);
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ============================================================================
// 16. greg_n_friends — WildPulse Bio-Telemetry Terrain
// ============================================================================
function drawGregNFriends({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 134, 138);
  const noise = makeNoise(seed ^ 0x9e3779);
  const minD = Math.min(w, h);
  ctx.save();

  // Organic night-vision topographic elevation contour lines
  const levels = 9;
  for (let lv = 0; lv < levels; lv++) {
    const yBase = h * (0.12 + (lv / (levels - 1)) * 0.76);
    ctx.beginPath();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const n = noise.fbm(u * 3.4 + 1.2, lv * 0.45 + t * 0.05, 3);
      const y = yBase + (n - 0.5) * h * 0.24;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = pigment(isLight, 138, isLight ? 0.22 + (lv % 2) * 0.14 : 0.18 + (lv % 2) * 0.14);
    ctx.lineWidth = lv % 3 === 0 ? 1.3 : 0.8;
    ctx.stroke();
  }

  // Wildlife tracking vector nodes + dotted migration trails
  const animals: Array<{ x: number; y: number; heading: number }> = [
    { x: w * 0.26, y: h * 0.3, heading: 0.4 },
    { x: w * 0.52, y: h * 0.26, heading: -0.35 },
    { x: w * 0.78, y: h * 0.34, heading: 0.75 },
    { x: w * 0.68, y: h * 0.76, heading: -1.1 },
    { x: w * 0.36, y: h * 0.78, heading: -0.6 },
  ];

  // Dotted migration vector paths
  ctx.strokeStyle = pigment(isLight, 46, isLight ? 0.52 : 0.45);
  ctx.lineWidth = 1.1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(animals[0]!.x, animals[0]!.y);
  ctx.lineTo(animals[1]!.x, animals[1]!.y);
  ctx.lineTo(animals[2]!.x, animals[2]!.y);
  ctx.moveTo(animals[4]!.x, animals[4]!.y);
  ctx.lineTo(animals[3]!.x, animals[3]!.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < animals.length; i++) {
    const a = animals[i]!;
    const pulse = (t * 0.6 + i * 0.24) % 1;
    ctx.strokeStyle = pigment(isLight, 44, (1 - pulse) * 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4 + pulse * 14, 0, TAU);
    ctx.stroke();

    // Directional wildlife chevron tracker
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.heading + Math.sin(t + i) * 0.12);
    ctx.fillStyle = pigment(isLight, 42, 1);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -3.8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 3.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Luminous crisp bio-acoustic ECG heartbeat trace across mid-plane
  const ecgY = h * 0.54;
  const ecgAmp = minD * 0.24;
  const ecgVal = (u: number): number => {
    const cycle = (u * 2.4 - t * 0.22 + 10) % 1;
    // Authentic P-QRS-T cardiac waveform
    const p = Math.exp(-Math.pow((cycle - 0.18) / 0.032, 2)) * 0.16;
    const q = -Math.exp(-Math.pow((cycle - 0.3) / 0.012, 2)) * 0.22;
    const r = Math.exp(-Math.pow((cycle - 0.34) / 0.015, 2)) * 1.0;
    const s = -Math.exp(-Math.pow((cycle - 0.38) / 0.014, 2)) * 0.34;
    const tw = Math.exp(-Math.pow((cycle - 0.54) / 0.048, 2)) * 0.28;
    return p + q + r + s + tw;
  };

  // Wide phosphor glow under ECG trace
  ctx.beginPath();
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = u * w;
    const y = ecgY - ecgVal(u) * ecgAmp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = lime(isLight, isLight ? 0.28 : 0.3);
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.strokeStyle = lime(isLight, 0.98);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glowing phosphor scan head along ECG trace
  const headU = (0.64 + t * 0.16) % 1;
  const headX = headU * w;
  const headY = ecgY - ecgVal(headU) * ecgAmp;
  drawBloom(ctx, headX, headY, 22, lime(isLight, 0.85));
  ctx.fillStyle = isLight ? '#0A0A0B' : '#FFFFFF';
  ctx.beginPath();
  ctx.arc(headX, headY, 3.2, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ============================================================================
// 17. violets_homework — Twilight Firefly Sanctuary (ZERO PURPLE!)
// ============================================================================
function drawVioletsHomework({ ctx, w, h, seed, t, isLight }: SceneCtx) {
  const rng = mulberry32(seed ^ 0xf14ef1);
  const minD = Math.min(w, h);
  ctx.save();

  // Serene emerald-teal twilight sky -> dusk horizon (strictly outside 245..340deg!)
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (isLight) {
    sky.addColorStop(0, tone(0.86, 0.055, 188, 1));
    sky.addColorStop(0.5, '#F5F3EC');
    sky.addColorStop(0.82, tone(0.9, 0.06, 86, 1));
    sky.addColorStop(1, tone(0.76, 0.08, 162, 1));
  } else {
    sky.addColorStop(0, '#03080A');
    sky.addColorStop(0.42, tone(0.16, 0.055, 192, 1));
    sky.addColorStop(0.76, tone(0.24, 0.072, 168, 1));
    sky.addColorStop(1, tone(0.14, 0.05, 148, 1));
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Delicate warm crescent moon in upper right sky
  const moonX = w * 0.78;
  const moonY = h * 0.22;
  const moonR = minD * 0.078;
  drawBloom(ctx, moonX, moonY, moonR * 3.2, tone(0.88, 0.12, 74, isLight ? 0.24 : 0.34));
  ctx.fillStyle = isLight ? tone(0.62, 0.14, 62, 0.92) : tone(0.94, 0.08, 78, 0.95);
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = isLight ? tone(0.89, 0.04, 186, 0.95) : tone(0.14, 0.048, 192, 0.98);
  ctx.beginPath();
  ctx.arc(moonX + moonR * 0.38, moonY - moonR * 0.2, moonR * 0.85, 0, TAU);
  ctx.fill();

  // Whisper-quiet dusk stars
  for (let i = 0; i < 28; i++) {
    const sx = rng() * w;
    const sy = rng() * h * 0.56;
    const tw = 0.3 + 0.7 * Math.sin(t * 1.6 + i * 2.3);
    ctx.fillStyle = isLight ? pigment(true, 178, 0.22 * tw) : tone(0.94, 0.06, 82, 0.55 * tw);
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Rolling deep emerald-cypress meadow hill silhouettes
  const drawHill = (baseY: number, amp: number, freq: number, phase: number, color: string) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      const y = baseY - Math.sin(u * freq + phase) * amp - Math.cos(u * freq * 0.55 - phase) * amp * 0.45;
      ctx.lineTo(u * w, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  drawHill(h * 0.72, h * 0.09, 3.6, 0.6, isLight ? tone(0.56, 0.095, 164, 0.76) : tone(0.15, 0.055, 168, 0.95));
  drawHill(h * 0.82, h * 0.08, 4.2, 2.2, isLight ? tone(0.38, 0.09, 158, 0.88) : tone(0.1, 0.045, 158, 0.98));
  drawHill(h * 0.92, h * 0.06, 5.0, 4.1, isLight ? '#152A23' : '#040A08');

  // Softly glowing sanctuary lantern on the mid ridge
  const lx = w * 0.62;
  const ly = h * 0.73;
  drawBloom(
    ctx,
    lx,
    ly,
    minD * 0.34,
    isLight ? tone(0.72, 0.16, 62, 0.42) : tone(0.84, 0.16, 64, 0.52),
    isLight ? tone(0.78, 0.14, 72, 0.14) : tone(0.68, 0.14, 52, 0.16),
  );
  // Minimal lantern post & warm glass pane
  ctx.fillStyle = isLight ? '#14241E' : '#050908';
  ctx.fillRect(lx - 1.5, ly, 3, h * 0.14);
  ctx.fillRect(lx - 6, ly - 10, 12, 12);
  ctx.fillStyle = tone(0.92, 0.15, 74, 1);
  ctx.fillRect(lx - 3.5, ly - 7.5, 7, 7);

  // 32 layered warm golden firefly bokeh orbs gently drifting & glowing
  for (let i = 0; i < 32; i++) {
    const baseX = rng() * w;
    const baseY = h * (0.16 + rng() * 0.74);
    const depth = i < 7 ? 2 : i < 20 ? 1 : 0; // foreground bokeh, midground crisp, distant sparks
    const driftX = Math.sin(t * (0.45 + (i % 5) * 0.14) + i * 1.7) * (10 + depth * 10);
    const driftY = Math.cos(t * (0.38 + (i % 4) * 0.12) + i * 2.1) * (8 + depth * 8) - ((t * (4 + depth * 3)) % 24);
    const fx = (baseX + driftX + w) % w;
    const fy = clamp(baseY + driftY, h * 0.08, h * 0.94);
    const glow = 0.45 + 0.55 * Math.sin(t * (1.8 + (i % 5) * 0.55) + i * 1.9);
    const fh = i % 3 === 0 ? 78 : i % 3 === 1 ? 62 : 52;

    if (depth === 2) {
      // Soft foreground golden bokeh orb
      const br = minD * (0.048 + (i % 3) * 0.018);
      drawBloom(ctx, fx, fy, br, tone(isLight ? 0.64 : 0.86, 0.15, fh, glow * (isLight ? 0.34 : 0.42)));
    } else if (depth === 1) {
      // Crisp midground firefly with subtle warm halo
      drawBloom(ctx, fx, fy, minD * 0.042, tone(isLight ? 0.62 : 0.88, 0.16, fh, glow * (isLight ? 0.45 : 0.65)));
      ctx.fillStyle = isLight ? tone(0.58, 0.17, 54, 0.95) : tone(0.96, 0.12, 82, 0.98);
      ctx.beginPath();
      ctx.arc(fx, fy, 2.2, 0, TAU);
      ctx.fill();
    } else {
      // Tiny distant meadow glow
      ctx.fillStyle = tone(isLight ? 0.6 : 0.9, 0.15, 72, glow * 0.85);
      ctx.beginPath();
      ctx.arc(fx, fy, 1.35, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 18. starlight_v2 — Architectural Prototype Blueprint (3D Polyhedron CAD)
// ============================================================================
function drawStarlightV2({ ctx, w, h, t, isLight }: SceneCtx) {
  fillBackdrop(ctx, w, h, isLight, 206, 204);
  const minD = Math.min(w, h);
  const cx = w * 0.58;
  const cy = h * 0.47;
  const scale = minD * 0.34;

  ctx.save();
  // Precision CAD blueprint grid
  const step = Math.max(20, Math.round(minD / 11));
  ctx.strokeStyle = pigment(isLight, 206, isLight ? 0.12 : 0.1);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // Orthographic construction axes & drafting compass sweep arcs
  ctx.strokeStyle = pigment(isLight, 206, isLight ? 0.28 : 0.24);
  ctx.lineWidth = 0.9;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.arc(cx, cy, scale * 1.18, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  drawBloom(ctx, cx, cy, scale * 1.5, pigment(isLight, 204, isLight ? 0.14 : 0.28), lime(isLight, 0.08));

  // True 3D icosahedron vertices & edges
  const phi = (1 + Math.sqrt(5)) / 2;
  const rawVerts: Array<[number, number, number]> = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ];
  const norm = Math.hypot(1, phi);
  const verts = rawVerts.map(([x, y, z]): [number, number, number] => [x / norm, y / norm, z / norm]);

  const edges: Array<[number, number]> = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const a = verts[i]!;
      const b = verts[j]!;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < 1.12) edges.push([i, j]);
    }
  }

  const ry = t * 0.36 + 0.48;
  const rx = 0.38 + Math.sin(t * 0.25) * 0.12;
  const cyR = Math.cos(ry);
  const syR = Math.sin(ry);
  const cxR = Math.cos(rx);
  const sxR = Math.sin(rx);

  const proj = verts.map(([vx, vy, vz]) => {
    const x1 = vx * cyR + vz * syR;
    const z1 = -vx * syR + vz * cyR;
    const y2 = vy * cxR - z1 * sxR;
    const z2 = vy * sxR + z1 * cxR;
    const persp = 3.2 / (3.2 - z2 * 0.72);
    return { x: cx + x1 * scale * persp, y: cy + y2 * scale * persp, z: z2 };
  });

  // Ground shadow projection plane below polyhedron
  const shadowY = cy + scale * 1.14;
  ctx.strokeStyle = pigment(isLight, 206, isLight ? 0.22 : 0.2);
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.ellipse(cx, shadowY, scale * 0.88, scale * 0.2, 0, 0, TAU);
  ctx.stroke();

  // Subtle vertical blueprint drop-lines from front vertices to ground plane
  ctx.strokeStyle = ink(isLight, isLight ? 0.14 : 0.12);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < proj.length; i += 2) {
    const p = proj[i]!;
    if (p.z > 0) {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, shadowY);
    }
  }
  ctx.stroke();

  // Draw edges: back edges dashed, front edges crisp bright CAD strokes
  for (const [ia, ib] of edges) {
    const a = proj[ia]!;
    const b = proj[ib]!;
    const avgZ = (a.z + b.z) * 0.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (avgZ < 0) {
      ctx.strokeStyle = pigment(isLight, 206, isLight ? 0.3 : 0.26);
      ctx.lineWidth = 0.9;
      ctx.setLineDash([3, 3]);
    } else {
      ctx.strokeStyle = isLight ? pigment(true, 206, 0.92) : tone(0.86, 0.14, 202, 0.92);
      ctx.lineWidth = 1.55;
      ctx.setLineDash([]);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Glowing ringed node vertices
  for (let i = 0; i < proj.length; i++) {
    const p = proj[i]!;
    const front = p.z >= 0;
    const isKey = i === 0 || i === 5 || i === 9;
    if (isKey && front) {
      drawBloom(ctx, p.x, p.y, 16, lime(isLight, 0.55));
    }
    ctx.fillStyle = isKey ? lime(isLight, 1) : front ? ink(isLight, 0.95) : pigment(isLight, 206, 0.55);
    ctx.beginPath();
    ctx.arc(p.x, p.y, isKey ? 3.8 : front ? 2.6 : 1.7, 0, TAU);
    ctx.fill();
    if (isKey) {
      ctx.strokeStyle = lime(isLight, 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5, 0, TAU);
      ctx.stroke();
    }
  }

  // Precision vernier caliper scale along left & bottom margin
  if (w >= 160) {
    ctx.strokeStyle = ink(isLight, isLight ? 0.38 : 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 22, idx = 0; x < w - 22; x += 10, idx++) {
      const tick = idx % 5 === 0 ? 8 : 3.5;
      ctx.moveTo(x + 0.5, h - 14);
      ctx.lineTo(x + 0.5, h - 14 - tick);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// Deterministic Fallback — Swiss Kinetic Monolith & Orbital Prisms
// ============================================================================
function drawFallbackScene({ ctx, w, h, seed, hue, t, isLight }: SceneCtx) {
  const safeHue = remapHue(hue);
  const counterHue = remapHue(safeHue + 136);
  fillBackdrop(ctx, w, h, isLight, safeHue, counterHue);
  const rng = mulberry32(seed ^ 0xfa11ba);
  const minD = Math.min(w, h);
  const cx = w * 0.58;
  const cy = h * 0.48;

  ctx.save();
  drawBloom(ctx, cx, cy, minD * 0.55, pigment(isLight, safeHue, isLight ? 0.2 : 0.34), pigment(isLight, counterHue, 0.12));

  // Layered kinetic rings
  for (let i = 0; i < 4; i++) {
    const r = minD * (0.16 + i * 0.11);
    ctx.strokeStyle = i % 2 === 0 ? pigment(isLight, safeHue, 0.72 - i * 0.12) : pigment(isLight, counterHue, 0.62 - i * 0.1);
    ctx.lineWidth = i === 1 ? 1.8 : 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, t * (0.2 + i * 0.1) * (i % 2 === 0 ? 1 : -1), t * (0.2 + i * 0.1) + PI * 1.45);
    ctx.stroke();
  }

  // Architectural prism facets
  const facets = 5;
  for (let i = 0; i < facets; i++) {
    const ang = (i / facets) * TAU + t * 0.18 + rng() * 0.4;
    const dist = minD * range(rng, 0.12, 0.34);
    const fx = cx + Math.cos(ang) * dist;
    const fy = cy + Math.sin(ang) * dist;
    const sz = minD * range(rng, 0.04, 0.085);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(ang + PI * 0.25);
    ctx.fillStyle = i === 0 ? lime(isLight, 0.9) : pigment(isLight, i % 2 === 0 ? safeHue : counterHue, 0.78);
    ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
    ctx.restore();
  }
  ctx.restore();
}

const SCENE_DRAWERS: Record<string, (s: SceneCtx) => void> = {
  discogs_sniper: drawDiscogsSniper,
  krunked_skymap: drawKrunkedSkymap,
  discogs_collection: drawDiscogsCollection,
  'chroma-cosmos': drawChromaCosmos,
  learning_languages: drawLearningLanguages,
  dojo: drawDojo,
  pokemath: drawPokemath,
  'maul-forge': drawMaulForge,
  'bitforge-80': drawBitforge80,
  alchemists_ledger: drawAlchemistsLedger,
  swarm_tycoon: drawSwarmTycoon,
  taxquest: drawTaxquest,
  'clausehound-ai': drawClausehoundAi,
  'chaosdeck-sre': drawChaosdeckSre,
  ozias_laboratory: drawOziasLaboratory,
  greg_n_friends: drawGregNFriends,
  violets_homework: drawVioletsHomework,
  starlight_v2: drawStarlightV2,
};

export function hasBespokeWorldScene(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCENE_DRAWERS, slug);
}

/**
 * Renders a bespoke, commissioned procedural artwork scene for a KRUNKED world slug.
 * Deterministic for identical (slug, seed, hue, w, h, dpr, t, theme) and strictly non-purple.
 */
export function renderWorldScene(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: WorldSceneOpts,
): void {
  const dpr = opts.dpr ?? 1;
  const w = Math.max(1, opts.w);
  const h = Math.max(1, opts.h);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));

  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const theme: ArtTheme = opts.theme ?? 'obsidian';
  const isLight = theme === 'daylight';
  const safeHue = remapHue(opts.hue);
  const drawer = SCENE_DRAWERS[opts.slug] ?? drawFallbackScene;

  drawer({
    ctx,
    w,
    h,
    seed: opts.seed,
    hue: safeHue,
    t: opts.t ?? 0,
    theme,
    isLight,
  });

  finishPlate(ctx, w, h, theme, isLight);
}
