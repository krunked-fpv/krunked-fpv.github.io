import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/** Vinyl grooves: modulated concentric tracks, label disc, conic specular sheen. */
export function drawGroove({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  ctx.fillStyle = '#0D1015';
  ctx.fillRect(0, 0, w, h);
  const cx = w * range(rng, 0.58, 0.72);
  const cy = h * range(rng, 0.45, 0.58);
  const R = Math.min(w, h) * 0.78;
  const disc = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  disc.addColorStop(0, '#171C25');
  disc.addColorStop(1, '#090B0E');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  const tracks = 3 + Math.floor(rng() * 3);
  const groups: number[] = [];
  for (let i = 0; i < tracks; i++) groups.push(range(rng, 0.38, 0.95));
  groups.sort();
  const f1 = 2 + Math.floor(rng() * 5);
  const ph = rng() * 6.28;
  for (let r = R * 0.32; r < R; r += 2.2) {
    const k = r / R;
    const gap = groups.some((g) => Math.abs(k - g) < 0.006);
    ctx.beginPath();
    for (let a = 0; a <= 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      const wob = Math.sin(ang * f1 + ph + k * 20) * 0.35;
      const x = cx + Math.cos(ang) * (r + wob);
      const y = cy + Math.sin(ang) * (r + wob);
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = gap ? pal.glow(0.55) : `rgba(255,255,255,${0.025 + (Math.sin(k * 90) + 1) * 0.015})`;
    ctx.lineWidth = gap ? 1.4 : 0.7;
    ctx.stroke();
  }
  // sheen
  const sheenAng = rng() * Math.PI + t * 0.6;
  for (let s = 0; s < 2; s++) {
    const a0 = sheenAng + s * Math.PI;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0 - 0.28, a0 + 0.28);
    ctx.closePath();
    ctx.clip();
    const sh = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.6, pal.glow(0.22));
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // label
  const lr = R * 0.2;
  const lab = ctx.createLinearGradient(cx - lr, cy - lr, cx + lr, cy + lr);
  lab.addColorStop(0, pal.key);
  lab.addColorStop(1, pal.deep);
  ctx.fillStyle = lab;
  ctx.beginPath();
  ctx.arc(cx, cy, lr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#07080A';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}
