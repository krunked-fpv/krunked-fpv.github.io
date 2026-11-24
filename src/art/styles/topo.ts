import { makeNoise } from '../noise';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/** Generative topographic mesh: noise-field iso-contours via marching squares. */
export function drawTopo({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const scale = range(rng, 1.6, 3.2) / Math.max(w, h) * 2.2;
  const ox = rng() * 100 + t * 0.15;
  const oy = rng() * 100;
  const cell = Math.max(5, Math.round(Math.min(w, h) / 46));
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const field = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) field[y * cols + x] = noise.fbm(x * cell * scale + ox, y * cell * scale + oy, 4);

  const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, Math.max(w, h) * 0.9);
  g.addColorStop(0, pal.deep);
  g.addColorStop(1, '#0D1015');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const levels = 20 + Math.floor(rng() * 8);
  const emph = 5 + Math.floor(rng() * 6);
  ctx.lineCap = 'round';
  for (let li = 1; li < levels; li++) {
    const lv = 0.2 + (li / levels) * 0.6;
    const strong = li % emph === 0;
    ctx.strokeStyle = strong ? pal.key : pal.glow(0.28);
    ctx.lineWidth = strong ? 1.6 : 0.8;
    ctx.beginPath();
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const a = field[y * cols + x] as number;
        const b = field[y * cols + x + 1] as number;
        const c = field[(y + 1) * cols + x + 1] as number;
        const d = field[(y + 1) * cols + x] as number;
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const px = x * cell;
        const py = y * cell;
        const lerp = (v0: number, v1: number) => (lv - v0) / (v1 - v0 || 1e-6);
        const top: [number, number] = [px + lerp(a, b) * cell, py];
        const right: [number, number] = [px + cell, py + lerp(b, c) * cell];
        const bottom: [number, number] = [px + lerp(d, c) * cell, py + cell];
        const left: [number, number] = [px, py + lerp(a, d) * cell];
        const seg = (p: [number, number], q: [number, number]) => {
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        };
        switch (idx) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 5: seg(top, left); seg(bottom, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(top, left); break;
          case 10: seg(top, right); seg(left, bottom); break;
        }
      }
    }
    ctx.stroke();
  }
  // survey markers
  ctx.fillStyle = pal.counter;
  for (let i = 0; i < 3; i++) {
    const x = rng() * w * 0.8 + w * 0.1;
    const y = rng() * h * 0.7 + h * 0.1;
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.strokeStyle = pal.glow(0.5);
    ctx.strokeRect(x - 7, y - 7, 14, 14);
  }
}
