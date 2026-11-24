import { mulberry32, range } from '../prng';
import { oklchToRgb, remapHue } from '../color';
import type { StyleArgs } from './types';

/** Refractive prism: additive translucent facets with dispersion edges. */
export function drawPrism({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  ctx.fillStyle = '#0D1015';
  ctx.fillRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, pal.deep);
  bg.addColorStop(1, '#0D1015');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'lighter';
  const n = 7 + Math.floor(rng() * 5);
  const drift = Math.sin(t * 0.5) * 6;
  for (let i = 0; i < n; i++) {
    const cx = range(rng, 0.1, 0.95) * w + drift * (i % 2 ? 1 : -1);
    const cy = range(rng, 0.05, 0.95) * h;
    const size = range(rng, 0.25, 0.7) * Math.min(w, h);
    const rot = rng() * Math.PI * 2;
    const hueShift = (i / n) * 70 - 20;
    const [r, g, b] = oklchToRgb(0.7, 0.13, remapHue(pal.hue + hueShift));
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const ang = rot + (k * Math.PI * 2) / 3;
      const px = cx + Math.cos(ang) * size;
      const py = cy + Math.sin(ang) * size;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const fill = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    fill.addColorStop(0, `rgba(${r},${g},${b},0.20)`);
    fill.addColorStop(1, `rgba(${r},${g},${b},0.02)`);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    // dispersion fringe
    const [r2, g2, b2] = oklchToRgb(0.78, 0.12, remapHue(pal.hue + 150 + hueShift));
    ctx.save();
    ctx.translate(1.6, -1.2);
    ctx.strokeStyle = `rgba(${r2},${g2},${b2},0.28)`;
    ctx.stroke();
    ctx.restore();
  }
  // refracted beam
  const by = h * range(rng, 0.3, 0.7);
  const beam = ctx.createLinearGradient(0, by, w, by);
  beam.addColorStop(0, 'rgba(255,255,255,0)');
  beam.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  beam.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, by - 0.5, w, 1);
  for (let k = 0; k < 6; k++) {
    const [r, g, b] = oklchToRgb(0.78, 0.15, remapHue(pal.hue + k * 28 - 70));
    ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
    ctx.fillRect(w * 0.45, by + k * 3 - 8, w * 0.55, 1.5);
  }
  ctx.globalCompositeOperation = 'source-over';
}
