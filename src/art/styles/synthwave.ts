import { nonPurpleRgb } from '../color';
import { drawDraftingGrid } from '../drafting';
import { makeNoise } from '../noise';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Bauhaus Architectural CAD Horizon & Kinetic Vector Print:
 * Luminous multi-stop sky, sculpted shuttered solar disc with calibration arcs (zero purple),
 * tri-layer geometric alpine silhouettes with rim light, and receding perspective CAD grid floor.
 */
export function drawSynthwave({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const horizon = Math.round(h * range(rng, 0.54, 0.61));

  // Stratified exhibition sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  if (pal.isLight) {
    sky.addColorStop(0, '#F7F5EF');
    sky.addColorStop(0.58, pal.deep);
    sky.addColorStop(1, pal.keyAlpha(0.26));
  } else {
    sky.addColorStop(0, pal.groundDeep);
    sky.addColorStop(0.62, pal.ground);
    sky.addColorStop(1, pal.deep);
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // Architectural floor base
  const floorBg = ctx.createLinearGradient(0, horizon, 0, h);
  if (pal.isLight) {
    floorBg.addColorStop(0, '#E9E6DD');
    floorBg.addColorStop(1, '#F4F2EC');
  } else {
    floorBg.addColorStop(0, '#090C12');
    floorBg.addColorStop(1, '#06070A');
  }
  ctx.fillStyle = floorBg;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Subtle sky drafting coordinate grid + zenith coordinate pins
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  drawDraftingGrid(ctx, w, horizon, pal, { pitch: 30, opacity: pal.isLight ? 0.048 : 0.032 });

  const starCount = 20 + Math.floor(rng() * 14);
  for (let i = 0; i < starCount; i++) {
    const px = rng() * w;
    const py = rng() * horizon * 0.7;
    const bright = rng() > 0.78;
    const r = bright ? 1.5 : 0.85;
    ctx.fillStyle = bright ? pal.keyAlpha(pal.isLight ? 0.55 : 0.65) : pal.reticle(pal.isLight ? 0.24 : 0.34);
    ctx.fillRect(px, py, r * 1.4, r * 1.4);
  }
  ctx.restore();

  // Sculpted solar disc (upper-right golden-ratio bias)
  const sx = w * range(rng, 0.54, 0.7);
  const sr = Math.min(w, h) * range(rng, 0.24, 0.31);
  const sy = horizon - sr * 0.28;

  // Volumetric atmospheric solar bloom (strictly analogous hues)
  const halo = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 2.5);
  halo.addColorStop(0, pal.keyAlpha(pal.isLight ? 0.3 : 0.42));
  halo.addColorStop(0.45, pal.analogAlpha(pal.isLight ? 0.12 : 0.16));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, horizon + 6);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();

  // Bauhaus concentric calibration arcs framing the solar disc
  ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.32 : 0.36);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(sx, sy, sr + 7, -Math.PI * 0.94, -Math.PI * 0.06);
  ctx.stroke();

  ctx.strokeStyle = pal.counterAlpha(pal.isLight ? 0.45 : 0.42);
  ctx.lineWidth = 1.1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(sx, sy, sr + 16, -Math.PI * 0.82, -Math.PI * 0.18);
  ctx.stroke();
  ctx.setLineDash([]);

  // Solar body gradient (strictly non-purple analogous range)
  const [sunTopR, sunTopG, sunTopB] = nonPurpleRgb(pal.isLight ? 0.66 : 0.88, pal.isLight ? 0.15 : 0.14, pal.hue + 22);
  const [sunBotR, sunBotG, sunBotB] = nonPurpleRgb(pal.isLight ? 0.44 : 0.62, pal.isLight ? 0.16 : 0.16, pal.hue - 10);
  const sunGrad = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sunGrad.addColorStop(0, `rgb(${sunTopR} ${sunTopG} ${sunTopB})`);
  sunGrad.addColorStop(0.55, pal.key);
  sunGrad.addColorStop(1, `rgb(${sunBotR} ${sunBotG} ${sunBotB})`);
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // Crisp upper rim specular highlight on solar disc
  ctx.strokeStyle = pal.isLight ? 'rgba(255,255,255,0.65)' : pal.highlight;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(sx, sy, sr - 0.5, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.stroke();

  // Progressive aperture shutter slices matching sky horizon base
  ctx.fillStyle = pal.isLight ? '#EFECE5' : pal.ground;
  for (let i = 0; i < 6; i++) {
    const by = sy + sr * (0.08 + i * 0.145);
    const bandH = 1.2 + i * 1.05;
    ctx.fillRect(sx - sr - 2, by, sr * 2 + 4, bandH);
  }
  ctx.restore();

  // Layer 1: Far atmospheric alpine silhouette
  const oFar = rng() * 50;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 4) {
    const n = noise.fbm(x / (w * 0.28) + oFar, 1.7, 4);
    const edge = Math.min(1, Math.abs(x - sx) / (w * 0.52));
    const y = horizon - n * h * 0.27 * (0.28 + edge * 0.85);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fillStyle = pal.isLight ? pal.keyAlpha(0.18) : pal.deep;
  ctx.fill();

  // Layer 2: Mid-range crisp angular ridge silhouette
  const oMid = rng() * 50 + 11;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 6) {
    const n = noise.fbm(x / (w * 0.22) + oMid, 3.1, 4);
    const edge = Math.min(1, Math.abs(x - sx) / (w * 0.48));
    const y = horizon - n * h * 0.21 * (0.22 + edge * 0.9);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fillStyle = pal.isLight ? pal.inkAlpha(0.12) : 'rgba(12,16,24,0.88)';
  ctx.fill();

  // Layer 3: Foreground architectural wireframe ridge + luminous rim polyline
  const oNear = rng() * 50 + 23;
  const nearPts: [number, number][] = [];
  for (let x = 0; x <= w; x += 4) {
    const n = noise.fbm(x / (w * 0.18) + oNear, 4.3, 4);
    const edge = Math.min(1, Math.abs(x - w * 0.54) / (w * 0.5));
    const y = horizon - n * h * 0.16 * (0.18 + edge * 0.96);
    nearPts.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (const [x, y] of nearPts) ctx.lineTo(x, y);
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fillStyle = pal.isLight ? '#DEDAD0' : '#06070B';
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < nearPts.length; i++) {
    const [x, y] = nearPts[i]!;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.72 : 0.78);
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // Floor horizon solar reflection glow
  const floorGlow = ctx.createRadialGradient(sx, horizon, 0, sx, horizon, w * 0.45);
  floorGlow.addColorStop(0, pal.keyAlpha(pal.isLight ? 0.22 : 0.3));
  floorGlow.addColorStop(0.55, pal.analogAlpha(pal.isLight ? 0.06 : 0.08));
  floorGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = floorGlow;
  ctx.fillRect(0, horizon, w, h - horizon);

  // True perspective CAD wireframe floor
  const vx = sx * 0.42 + w * 0.29;
  const floorH = Math.max(1, h - horizon);

  for (let i = -14; i <= 14; i++) {
    const distNorm = Math.abs(i) / 14;
    const alpha = (1 - distNorm * 0.52) * (pal.isLight ? 0.42 : 0.54);
    ctx.strokeStyle = i === 0 ? pal.counter : pal.keyAlpha(alpha);
    ctx.lineWidth = i === 0 ? 1.45 : 0.9;
    ctx.beginPath();
    ctx.moveTo(vx + i * 5.2, horizon);
    ctx.lineTo(vx + i * w * 0.155, h);
    ctx.stroke();
  }

  // Quadratic depth-attenuated horizontal scanlines scrolling smoothly with t
  const scroll = (t * 0.32) % 1;
  const lines = 14;
  for (let i = 0; i < lines; i++) {
    const p = (i + scroll) / lines;
    const y = horizon + Math.pow(p, 2.2) * floorH;
    ctx.strokeStyle = pal.keyAlpha((0.16 + p * 0.56) * (pal.isLight ? 0.8 : 1));
    ctx.lineWidth = 0.7 + p * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Crisp horizon datum rule + glowing vanishing-point vernier
  ctx.fillStyle = pal.key;
  ctx.fillRect(0, horizon - 0.75, w, 1.75);
  ctx.strokeStyle = pal.counter;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(vx, horizon - 6);
  ctx.lineTo(vx, horizon + 6);
  ctx.stroke();
}
