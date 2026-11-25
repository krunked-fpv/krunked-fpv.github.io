import { drawDraftingGrid, drawSurveyMarker } from '../drafting';
import { makeNoise } from '../noise';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Cartographic Elevation Survey:
 * Hypsometric altitude wash, architectural graticule, saddle-disambiguated marching-squares
 * iso-contours (dual index/intermediate weights), and geodetic summit triangulation markers.
 */
export function drawTopo({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const scale = (range(rng, 1.65, 3.0) / Math.max(w, h)) * 2.15;
  const ox = rng() * 100 + t * 0.12;
  const oy = rng() * 100 + Math.sin(t * 0.25) * 0.06;

  // Base mineral wash
  const g = ctx.createRadialGradient(w * 0.72, h * 0.28, 0, w * 0.65, h * 0.35, Math.max(w, h) * 0.95);
  g.addColorStop(0, pal.deep);
  g.addColorStop(1, pal.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Subtle architectural survey grid
  drawDraftingGrid(ctx, w, h, pal, { pitch: 32, opacity: pal.isLight ? 0.05 : 0.035, vernier: true });

  const cell = Math.max(5, Math.min(14, Math.round(Math.min(w, h) / 48)));
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

  // Locate top 3 separated elevation summits for hypsometric blooms & geodetic markers
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
  const minDist = Math.min(w, h) * 0.22;
  for (const p of peaks) {
    if (p.y > h * 0.78 && p.x < w * 0.55) continue; // keep bottom-left title zone clean
    if (chosenPeaks.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > minDist)) {
      chosenPeaks.push(p);
      if (chosenPeaks.length >= 3) break;
    }
  }

  // Soft hypsometric elevation glows around summits
  for (let i = 0; i < chosenPeaks.length; i++) {
    const pk = chosenPeaks[i]!;
    const rad = Math.min(w, h) * (0.28 - i * 0.04);
    const bloom = ctx.createRadialGradient(pk.x, pk.y, 0, pk.x, pk.y, rad);
    bloom.addColorStop(0, pal.keyAlpha(pal.isLight ? 0.16 : 0.18));
    bloom.addColorStop(0.55, pal.keyAlpha(pal.isLight ? 0.05 : 0.06));
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(pk.x - rad, pk.y - rad, rad * 2, rad * 2);
  }

  // Marching squares with saddle-point disambiguation (cases 5 & 10)
  const levels = 22 + Math.floor(rng() * 6);
  const emph = 5 + Math.floor(rng() * 3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let li = 1; li < levels; li++) {
    const lv = 0.21 + (li / levels) * 0.58;
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
      // Soft halo under major index contour
      ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.18 : 0.26);
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.strokeStyle = pal.key;
      ctx.lineWidth = 1.45;
      ctx.stroke();
    } else {
      ctx.strokeStyle = pal.isLight
        ? pal.inkAlpha(midWeight ? 0.24 : 0.13)
        : pal.keyAlpha(midWeight ? 0.34 : 0.18);
      ctx.lineWidth = midWeight ? 0.9 : 0.65;
      ctx.stroke();
    }
  }

  // Geodetic triangulation markers on summits (or seeded fallback)
  const markers =
    chosenPeaks.length > 0
      ? chosenPeaks
      : [
          { x: w * range(rng, 0.56, 0.84), y: h * range(rng, 0.2, 0.45), v: 0.7 },
          { x: w * range(rng, 0.24, 0.5), y: h * range(rng, 0.18, 0.42), v: 0.65 },
        ];

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]!;
    drawSurveyMarker(ctx, m.x, m.y, pal, i === 0 ? 'triangle' : 'reticle');
  }
}
