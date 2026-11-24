import { makeNoise } from '../noise';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/** Synthwave grid: banded sun, seeded ridge silhouette, perspective floor. */
export function drawSynthwave({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const horizon = h * range(rng, 0.5, 0.62);
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#07080A');
  sky.addColorStop(1, pal.deep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#0A0C10';
  ctx.fillRect(0, horizon, w, h - horizon);

  // sun
  const sx = w * range(rng, 0.35, 0.68);
  const sr = Math.min(w, h) * range(rng, 0.26, 0.36);
  const sy = horizon - sr * 0.25;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, pal.counter);
  sun.addColorStop(1, pal.key);
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  // bands
  ctx.fillStyle = '#0D1015';
  for (let i = 0; i < 7; i++) {
    const by = sy + sr * (0.0 + i * 0.15);
    ctx.fillRect(sx - sr, by, sr * 2, 1 + i * 0.9);
  }
  ctx.restore();
  const halo = ctx.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 2.2);
  halo.addColorStop(0, pal.glow(0.25));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, horizon + 4);

  // ridge silhouette
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  const o = rng() * 50;
  for (let x = 0; x <= w; x += 4) {
    const n = noise.fbm(x / (w * 0.22) + o, 3.3, 4);
    const edge = Math.min(1, Math.abs(x - w * 0.5) / (w * 0.5));
    ctx.lineTo(x, horizon - n * h * 0.22 * (0.25 + edge));
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fillStyle = '#07080A';
  ctx.fill();

  // perspective floor
  ctx.strokeStyle = pal.glow(0.55);
  ctx.lineWidth = 1;
  const vx = w * 0.5;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(vx + i * 6, horizon);
    ctx.lineTo(vx + i * w * 0.14, h);
    ctx.stroke();
  }
  const scroll = (t * 0.35) % 1;
  for (let i = 0; i < 12; i++) {
    const p = (i + scroll) / 12;
    const y = horizon + Math.pow(p, 2.2) * (h - horizon);
    ctx.strokeStyle = pal.glow(0.15 + p * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = pal.glow(0.9);
  ctx.fillRect(0, horizon - 0.5, w, 1.5);
}
