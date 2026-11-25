import { nonPurpleRgb } from '../color';
import { drawDraftingGrid } from '../drafting';
import { makeNoise } from '../noise';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Architectural CAD Vector Horizon:
 * Sliced aperture solar disc (zero purple), dual-layer fBm mountain ridges with rim light,
 * perspective meridian/scanline CAD floor, and zenith coordinate pins.
 */
export function drawSynthwave({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const horizon = Math.round(h * range(rng, 0.5, 0.6));

  // Stratified sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, pal.groundDeep);
  sky.addColorStop(0.72, pal.ground);
  sky.addColorStop(1, pal.deep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // Floor ground
  const floorBg = ctx.createLinearGradient(0, horizon, 0, h);
  floorBg.addColorStop(0, pal.isLight ? pal.groundDeep : '#090B10');
  floorBg.addColorStop(1, pal.ground);
  ctx.fillStyle = floorBg;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Subtle sky drafting coordinate grid
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  drawDraftingGrid(ctx, w, horizon, pal, { pitch: 30, opacity: pal.isLight ? 0.045 : 0.03 });

  // Precision zenith coordinate pins
  const starCount = 18 + Math.floor(rng() * 14);
  for (let i = 0; i < starCount; i++) {
    const px = rng() * w;
    const py = rng() * horizon * 0.72;
    const r = rng() > 0.78 ? 1.3 : 0.75;
    ctx.fillStyle = pal.reticle(pal.isLight ? 0.24 : 0.32);
    ctx.fillRect(px, py, r * 1.4, r * 1.4);
  }
  ctx.restore();

  // Sliced aperture solar disc
  const sx = w * range(rng, 0.44, 0.7);
  const sr = Math.min(w, h) * range(rng, 0.24, 0.34);
  const sy = horizon - sr * 0.24;

  // Atmospheric halo behind sun (analogous hue -- zero pink/lavender sRGB midpoint)
  const halo = ctx.createRadialGradient(sx, sy, sr * 0.45, sx, sy, sr * 2.3);
  halo.addColorStop(0, pal.keyAlpha(pal.isLight ? 0.22 : 0.32));
  halo.addColorStop(0.55, pal.keyAlpha(pal.isLight ? 0.08 : 0.1));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, horizon + 6);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();

  const [sunTopR, sunTopG, sunTopB] = nonPurpleRgb(pal.isLight ? 0.68 : 0.84, pal.isLight ? 0.12 : 0.13, pal.hue + 16);
  const sunGrad = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sunGrad.addColorStop(0, `rgb(${sunTopR} ${sunTopG} ${sunTopB})`);
  sunGrad.addColorStop(0.58, pal.key);
  sunGrad.addColorStop(1, pal.deep);
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // Thin outer optical measurement ring around solar disc
  ctx.strokeStyle = pal.keyAlpha(0.45);
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.arc(sx, sy, sr + 5, -Math.PI * 0.92, -Math.PI * 0.08);
  ctx.stroke();

  // Progressive aperture shutter slices matching ground tone
  ctx.fillStyle = pal.ground;
  for (let i = 0; i < 7; i++) {
    const by = sy + sr * (0.04 + i * 0.135);
    const bandH = 1.1 + i * 0.95;
    ctx.fillRect(sx - sr - 2, by, sr * 2 + 4, bandH);
  }
  ctx.restore();

  // Far atmospheric ridge silhouette
  const oFar = rng() * 50;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 4) {
    const n = noise.fbm(x / (w * 0.28) + oFar, 1.7, 4);
    const edge = Math.min(1, Math.abs(x - sx) / (w * 0.55));
    const y = horizon - n * h * 0.25 * (0.3 + edge * 0.85);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fillStyle = pal.isLight ? pal.inkAlpha(0.12) : pal.deep;
  ctx.fill();

  // Near sharp wireframe foreground ridge + rim highlight polyline
  const oNear = rng() * 50 + 19;
  const nearPts: [number, number][] = [];
  for (let x = 0; x <= w; x += 4) {
    const n = noise.fbm(x / (w * 0.19) + oNear, 4.1, 4);
    const edge = Math.min(1, Math.abs(x - w * 0.5) / (w * 0.5));
    const y = horizon - n * h * 0.18 * (0.2 + edge * 0.95);
    nearPts.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (const [x, y] of nearPts) ctx.lineTo(x, y);
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fillStyle = pal.isLight ? '#D7D3C7' : '#06070A';
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < nearPts.length; i++) {
    const [x, y] = nearPts[i]!;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.52 : 0.62);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // True perspective CAD wireframe floor
  const vx = sx * 0.35 + w * 0.325;
  const floorH = Math.max(1, h - horizon);

  // Perspective meridians
  for (let i = -14; i <= 14; i++) {
    const distNorm = Math.abs(i) / 14;
    const alpha = (1 - distNorm * 0.55) * (pal.isLight ? 0.38 : 0.48);
    ctx.strokeStyle = i === 0 ? pal.counterAlpha(0.65) : pal.keyAlpha(alpha);
    ctx.lineWidth = i === 0 ? 1.2 : 0.85;
    ctx.beginPath();
    ctx.moveTo(vx + i * 5.5, horizon);
    ctx.lineTo(vx + i * w * 0.155, h);
    ctx.stroke();
  }

  // Quadratic depth-attenuated horizontal scanlines scrolling smoothly with t
  const scroll = (t * 0.32) % 1;
  const lines = 14;
  for (let i = 0; i < lines; i++) {
    const p = (i + scroll) / lines;
    const y = horizon + Math.pow(p, 2.25) * floorH;
    ctx.strokeStyle = pal.keyAlpha((0.12 + p * 0.52) * (pal.isLight ? 0.82 : 1));
    ctx.lineWidth = 0.65 + p * 0.65;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Crisp horizon datum rule + vanishing-point vernier tick
  ctx.fillStyle = pal.key;
  ctx.fillRect(0, horizon - 0.5, w, 1.5);
  ctx.strokeStyle = pal.counter;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(vx, horizon - 5);
  ctx.lineTo(vx, horizon + 5);
  ctx.stroke();
}
