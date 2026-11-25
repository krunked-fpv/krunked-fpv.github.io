import { drawDraftingGrid, drawSurveyMarker } from '../drafting';
import { makeNoise } from '../noise';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Swiss Hypsometric Cartography & Geodetic Relief Print:
 * Sunlit mineral paper / velvety carbon field, elevation-ramped marching-squares iso-contours
 * (saddle-disambiguated with index halos), summit relief plateaus, geodesic transect line,
 * and triangulation datum markers.
 */
export function drawTopo({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const scale = (range(rng, 1.6, 2.85) / Math.max(w, h)) * 2.1;
  const ox = rng() * 100 + t * 0.1;
  const oy = rng() * 100 + Math.sin(t * 0.22) * 0.05;

  // Multi-stop atmospheric mineral ground
  if (pal.isLight) {
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#F7F5EF');
    base.addColorStop(0.55, pal.ground);
    base.addColorStop(1, pal.groundDeep);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, w, h);
  }

  // Directional hypsometric atmospheric wash centered upper-right
  const wash = ctx.createRadialGradient(
    w * 0.72,
    h * 0.28,
    0,
    w * 0.66,
    h * 0.34,
    Math.max(w, h) * 0.92,
  );
  if (pal.isLight) {
    wash.addColorStop(0, pal.keyAlpha(0.14));
    wash.addColorStop(0.45, pal.analogAlpha(0.065));
    wash.addColorStop(1, 'rgba(236,234,228,0)');
  } else {
    wash.addColorStop(0, pal.midAlpha(0.28));
    wash.addColorStop(0.48, pal.deepAlpha(0.48));
    wash.addColorStop(1, 'rgba(9,11,15,0)');
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // Architectural cartographic graticule
  drawDraftingGrid(ctx, w, h, pal, { pitch: 32, opacity: pal.isLight ? 0.055 : 0.038, vernier: true });

  const cell = Math.max(5, Math.min(13, Math.round(Math.min(w, h) / 50)));
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const field = new Float32Array(cols * rows);

  for (let y = 0; y < rows; y++) {
    const ny = y * cell * scale + oy;
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      field[rowOff + x] = noise.fbm(x * cell * scale + ox, ny, 4);
    }
  }

  // Locate top 3 separated summits biased cleanly away from bottom-left title breathing room
  const peaks: { x: number; y: number; v: number }[] = [];
  for (let y = 2; y < rows - 3; y++) {
    for (let x = 2; x < cols - 3; x++) {
      const v = field[y * cols + x] as number;
      if (
        v > (field[(y - 1) * cols + x] as number) &&
        v > (field[(y + 1) * cols + x] as number) &&
        v > (field[y * cols + x - 1] as number) &&
        v > (field[y * cols + x + 1] as number)
      ) {
        peaks.push({ x: x * cell, y: y * cell, v });
      }
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const chosenPeaks: { x: number; y: number; v: number }[] = [];
  const minDist = Math.min(w, h) * 0.24;
  for (const p of peaks) {
    if (p.y > h * 0.68 && p.x < w * 0.48) continue;
    if (chosenPeaks.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > minDist)) {
      chosenPeaks.push(p);
      if (chosenPeaks.length >= 3) break;
    }
  }

  // Multi-layered hypsometric relief halos around top summits
  for (let i = 0; i < chosenPeaks.length; i++) {
    const pk = chosenPeaks[i]!;
    const rad = Math.min(w, h) * (0.34 - i * 0.055);
    const bloom = ctx.createRadialGradient(pk.x, pk.y, 0, pk.x, pk.y, rad);
    const colorFn = i === 1 ? pal.analogAlpha : pal.keyAlpha;
    bloom.addColorStop(0, colorFn(pal.isLight ? 0.22 : 0.28));
    bloom.addColorStop(0.45, colorFn(pal.isLight ? 0.085 : 0.11));
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(pk.x - rad, pk.y - rad, rad * 2, rad * 2);
  }

  // Marching squares with saddle-point disambiguation and elevation-ramped Swiss pigment inks
  const levels = 24 + Math.floor(rng() * 5);
  const emph = 5 + Math.floor(rng() * 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let li = 1; li < levels; li++) {
    const norm = li / levels;
    const lv = 0.22 + norm * 0.57;
    const strong = li % emph === 0;
    const midWeight = li % 2 === 0;

    ctx.beginPath();
    for (let y = 0; y < rows - 1; y++) {
      const r0 = y * cols;
      const r1 = (y + 1) * cols;
      const py = y * cell;
      for (let x = 0; x < cols - 1; x++) {
        const a = field[r0 + x] as number;
        const b = field[r0 + x + 1] as number;
        const c = field[r1 + x + 1] as number;
        const d = field[r1 + x] as number;
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;

        const px = x * cell;
        const lerp = (v0: number, v1: number) => (lv - v0) / (v1 - v0 || 1e-6);
        const topX = px + lerp(a, b) * cell;
        const rightY = py + lerp(b, c) * cell;
        const botX = px + lerp(d, c) * cell;
        const leftY = py + lerp(a, d) * cell;

        const seg = (x1: number, y1: number, x2: number, y2: number) => {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        };

        switch (idx) {
          case 1:
          case 14:
            seg(px, leftY, botX, py + cell);
            break;
          case 2:
          case 13:
            seg(botX, py + cell, px + cell, rightY);
            break;
          case 3:
          case 12:
            seg(px, leftY, px + cell, rightY);
            break;
          case 4:
          case 11:
            seg(topX, py, px + cell, rightY);
            break;
          case 5: {
            const center = (a + b + c + d) * 0.25;
            if (center > lv) {
              seg(topX, py, px, leftY);
              seg(botX, py + cell, px + cell, rightY);
            } else {
              seg(topX, py, px + cell, rightY);
              seg(px, leftY, botX, py + cell);
            }
            break;
          }
          case 6:
          case 9:
            seg(topX, py, botX, py + cell);
            break;
          case 7:
          case 8:
            seg(topX, py, px, leftY);
            break;
          case 10: {
            const center = (a + b + c + d) * 0.25;
            if (center > lv) {
              seg(topX, py, px + cell, rightY);
              seg(px, leftY, botX, py + cell);
            } else {
              seg(topX, py, px, leftY);
              seg(botX, py + cell, px + cell, rightY);
            }
            break;
          }
        }
      }
    }

    if (strong) {
      const highAlt = norm > 0.62;
      ctx.strokeStyle = highAlt
        ? pal.analogAlpha(pal.isLight ? 0.22 : 0.34)
        : pal.keyAlpha(pal.isLight ? 0.2 : 0.32);
      ctx.lineWidth = 3.8;
      ctx.stroke();

      ctx.strokeStyle = highAlt ? pal.analog : pal.key;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (!pal.isLight) {
        ctx.strokeStyle = pal.highlight;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else {
      const elevBoost = 0.55 + norm * 0.7;
      if (pal.isLight) {
        ctx.strokeStyle =
          norm > 0.58
            ? pal.keyAlpha((midWeight ? 0.38 : 0.2) * elevBoost)
            : pal.inkAlpha((midWeight ? 0.24 : 0.12) * elevBoost);
      } else {
        ctx.strokeStyle =
          norm > 0.62
            ? pal.analogAlpha((midWeight ? 0.42 : 0.22) * elevBoost)
            : pal.keyAlpha((midWeight ? 0.34 : 0.17) * elevBoost);
      }
      ctx.lineWidth = midWeight ? 0.95 : 0.65;
      ctx.stroke();
    }
  }

  // Geodetic triangulation markers + crisp transect vector linking primary summits
  const markers =
    chosenPeaks.length > 0
      ? chosenPeaks
      : [
          { x: w * range(rng, 0.58, 0.84), y: h * range(rng, 0.22, 0.44), v: 0.72 },
          { x: w * range(rng, 0.28, 0.52), y: h * range(rng, 0.18, 0.38), v: 0.65 },
        ];

  if (markers.length >= 2) {
    const p0 = markers[0]!;
    const p1 = markers[1]!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;

    ctx.save();
    ctx.strokeStyle = pal.counterAlpha(pal.isLight ? 0.62 : 0.58);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Perpendicular range calibration ticks along geodesic transect
    const ticks = 5;
    ctx.strokeStyle = pal.counterAlpha(pal.isLight ? 0.7 : 0.65);
    ctx.beginPath();
    for (let k = 1; k < ticks; k++) {
      const f = k / ticks;
      const tx = p0.x + dx * f;
      const ty = p0.y + dy * f;
      const tl = k === Math.floor(ticks / 2) ? 4.5 : 2.5;
      ctx.moveTo(tx - nx * tl, ty - ny * tl);
      ctx.lineTo(tx + nx * tl, ty + ny * tl);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]!;
    drawSurveyMarker(ctx, m.x, m.y, pal, i === 0 ? 'triangle' : 'reticle');
  }
}
