import { nonPurpleRgb } from '../color';
import { drawDraftingGrid } from '../drafting';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Optical Caustic & Faceted Glass Rig:
 * Theme-safe blending (screen/lighter on Obsidian; multiply + crisp specular edges on Braun Daylight),
 * golden-ratio crystal prism cluster, collimator beam splitting into a non-purple spectral fan,
 * and angular protractor reticle around the primary optical vertex.
 */
export function drawPrism({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, pal.deep);
  bg.addColorStop(0.55, pal.ground);
  bg.addColorStop(1, pal.groundDeep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Architectural optical bench drafting grid
  drawDraftingGrid(ctx, w, h, pal, { pitch: 28, opacity: pal.isLight ? 0.05 : 0.032, vernier: true });

  // Focal optical vertex (golden-ratio right-shifted to keep bottom-left text clean)
  const fx = w * range(rng, 0.48, 0.62);
  const fy = h * range(rng, 0.36, 0.52);
  const baseScale = Math.min(w, h);

  // Subtle protractor calibration arc around focal vertex
  ctx.save();
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.2 : 0.16);
  ctx.lineWidth = 0.85;
  const pr = baseScale * 0.36;
  ctx.beginPath();
  ctx.arc(fx, fy, pr, -Math.PI * 0.72, Math.PI * 0.38);
  ctx.stroke();
  for (let deg = -120; deg <= 60; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const major = deg % 45 === 0;
    const r0 = pr - (major ? 7 : 3.5);
    ctx.beginPath();
    ctx.moveTo(fx + Math.cos(rad) * r0, fy + Math.sin(rad) * r0);
    ctx.lineTo(fx + Math.cos(rad) * pr, fy + Math.sin(rad) * pr);
    ctx.stroke();
  }
  ctx.restore();

  // Structured optical crystal facets (theme-safe blend mode!)
  ctx.save();
  ctx.globalCompositeOperation = pal.isLight ? 'multiply' : 'screen';

  const facets = 6 + Math.floor(rng() * 4);
  const drift = Math.sin(t * 0.45) * 5;
  const facetL = pal.isLight ? 0.64 : 0.68;
  const edgeL = pal.isLight ? 0.46 : 0.78;

  for (let i = 0; i < facets; i++) {
    const isHero = i === 0;
    const cx = isHero ? fx : fx + range(rng, -0.34, 0.34) * w + drift * (i % 2 ? 1 : -1);
    const cy = isHero ? fy : fy + range(rng, -0.3, 0.3) * h;
    const size = isHero ? baseScale * 0.34 : range(rng, 0.16, 0.42) * baseScale;
    const rot = rng() * Math.PI * 2 + (isHero ? Math.sin(t * 0.3) * 0.04 : 0);
    const sides = i % 3 === 0 ? 4 : 3;
    const hueShift = (i / facets) * 76 - 24;
    const [r, g, b] = nonPurpleRgb(facetL, pal.isLight ? 0.11 : 0.14, pal.hue + hueShift);
    const [er, eg, eb] = nonPurpleRgb(edgeL, pal.isLight ? 0.15 : 0.14, pal.hue + hueShift);

    ctx.beginPath();
    for (let k = 0; k < sides; k++) {
      const ang = rot + (k * Math.PI * 2) / sides;
      const rad = sides === 4 && k % 2 === 1 ? size * 0.68 : size;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const fill = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    fill.addColorStop(0, `rgba(${r},${g},${b},${pal.isLight ? 0.24 : 0.26})`);
    fill.addColorStop(0.65, `rgba(${r},${g},${b},${pal.isLight ? 0.09 : 0.08})`);
    fill.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle = `rgba(${er},${eg},${eb},${isHero ? 0.8 : 0.48})`;
    ctx.lineWidth = isHero ? 1.4 : 0.95;
    ctx.stroke();

    // Chromatic dispersion fringe strictly non-purple
    const [r2, g2, b2] = nonPurpleRgb(edgeL, 0.13, pal.hue + 148 + hueShift);
    ctx.save();
    ctx.translate(1.8, -1.2);
    ctx.strokeStyle = `rgba(${r2},${g2},${b2},${pal.isLight ? 0.32 : 0.34})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Collimated incident light beam + refracted non-purple spectral fan
  ctx.save();
  const entryY = fy + range(rng, -0.06, 0.06) * h;
  const incident = ctx.createLinearGradient(0, entryY, fx, fy);
  if (pal.isLight) {
    incident.addColorStop(0, 'rgba(20,22,26,0)');
    incident.addColorStop(0.55, 'rgba(20,22,26,0.45)');
    incident.addColorStop(1, pal.key);
  } else {
    incident.addColorStop(0, 'rgba(255,255,255,0)');
    incident.addColorStop(0.55, 'rgba(255,255,255,0.68)');
    incident.addColorStop(1, '#FFFFFF');
  }
  ctx.strokeStyle = incident;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, entryY);
  ctx.lineTo(fx, fy);
  ctx.stroke();

  // Spectral fan (7 strictly non-purple dispersion channels)
  const bands = 7;
  const spreadDeg = 28;
  const baseAngle = range(rng, -0.14, 0.14);
  for (let k = 0; k < bands; k++) {
    const frac = k / (bands - 1) - 0.5;
    const ang = baseAngle + (frac * spreadDeg * Math.PI) / 180;
    const len = Math.max(w, h) * 0.85;
    const ex = fx + Math.cos(ang) * len;
    const ey = fy + Math.sin(ang) * len;
    const [r, g, b] = nonPurpleRgb(pal.isLight ? 0.54 : 0.78, 0.155, pal.hue + k * 24 - 64);

    const ray = ctx.createLinearGradient(fx, fy, ex, ey);
    ray.addColorStop(0, `rgba(${r},${g},${b},${pal.isLight ? 0.62 : 0.65})`);
    ray.addColorStop(0.6, `rgba(${r},${g},${b},${pal.isLight ? 0.26 : 0.28})`);
    ray.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.strokeStyle = ray;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Specular focal node
  const glint = ctx.createRadialGradient(fx, fy, 0, fx, fy, 16);
  glint.addColorStop(0, pal.isLight ? pal.key : '#FFFFFF');
  glint.addColorStop(0.35, pal.keyAlpha(0.55));
  glint.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.arc(fx, fy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
