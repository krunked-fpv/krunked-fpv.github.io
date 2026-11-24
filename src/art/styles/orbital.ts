import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/** Orbital radar: concentric rings, rotating sweep wedge, seeded blips, crosshair ticks. */
export function drawOrbital({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  ctx.fillStyle = '#0D1015';
  ctx.fillRect(0, 0, w, h);
  const cx = w * range(rng, 0.55, 0.72);
  const cy = h * range(rng, 0.38, 0.5);
  const R = Math.max(w, h) * 0.62;
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, pal.deep);
  bg.addColorStop(1, 'rgba(13,16,21,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const rings = 6 + Math.floor(rng() * 4);
  for (let i = 1; i <= rings; i++) {
    const r = (R / rings) * i;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = i % 3 === 0 ? pal.glow(0.4) : pal.glow(0.14);
    ctx.lineWidth = i % 3 === 0 ? 1.2 : 0.8;
    if (i % 2 === 0) ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // tick marks
  ctx.strokeStyle = pal.glow(0.35);
  ctx.lineWidth = 1;
  for (let a = 0; a < 72; a++) {
    const ang = (a / 72) * Math.PI * 2;
    const long = a % 6 === 0;
    const r0 = R * 0.98 - (long ? 12 : 6);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * R * 0.98, cy + Math.sin(ang) * R * 0.98);
    ctx.stroke();
  }
  // crosshair
  ctx.strokeStyle = pal.glow(0.25);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // sweep wedge
  const sweep = rng() * Math.PI * 2 + t * 0.9;
  const wedge = Math.PI * 0.42;
  for (let i = 0; i < 24; i++) {
    const a0 = sweep - (wedge * (i + 1)) / 24;
    const a1 = sweep - (wedge * i) / 24;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = pal.glow(0.2 * (1 - i / 24));
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
  ctx.strokeStyle = pal.key;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // blips
  const blips = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < blips; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = range(rng, 0.15, 0.95) * R;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    let diff = (sweep - ang) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    const lit = t === 0 ? 0.6 : Math.max(0.25, 1 - diff / wedge);
    const gl = ctx.createRadialGradient(x, y, 0, x, y, 14);
    gl.addColorStop(0, i % 4 === 0 ? pal.counter : pal.key);
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.min(1, lit);
    ctx.fillStyle = gl;
    ctx.fillRect(x - 14, y - 14, 28, 28);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}
