import { nonPurpleRgb } from '../color';
import { drawDraftingGrid } from '../drafting';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Strictly constrains optical dispersion & facet hues to [18..232] deg
 * (signal orange -> solar gold -> emerald -> teal -> cobalt-azure).
 * Eliminates dusty rose/pink (340..360 / 0..17) AND purple/magenta (233..340).
 */
function safePrismHue(raw: number): number {
  const n = Number.isFinite(raw) ? ((raw % 360) + 360) % 360 : 190;
  if (n >= 232 || n < 18) {
    const dist = n >= 232 ? n - 232 : n + 128; // 0..146
    return dist < 73 ? 174 + (dist / 73) * 48 : 22 + ((dist - 73) / 73) * 60;
  }
  return n;
}

/**
 * Optical Caustic Bench & Bauhaus Refractive Glass Rig:
 * 3 seed-driven optical crystal architectures (equilateral monolith, isometric beam-splitter
 * diamond, and twin-aperture hexagonal lens), calibrated protractor bench, collimated laser
 * beam, and strictly non-rose / non-purple dual-pass spectral dispersion fan.
 */
export function drawPrism({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  const rigMode = seed % 3;

  // Clean sunlit gallery rag / deep optical carbon bench background
  const bg = ctx.createLinearGradient(0, 0, w, h);
  if (pal.isLight) {
    bg.addColorStop(0, '#F7F5EF');
    bg.addColorStop(0.55, pal.ground);
    bg.addColorStop(1, pal.groundDeep);
  } else {
    bg.addColorStop(0, pal.deep);
    bg.addColorStop(0.52, pal.ground);
    bg.addColorStop(1, pal.groundDeep);
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Focal optical vertex biased cleanly into the upper-right breathing zone
  const fx = w * (rigMode === 1 ? range(rng, 0.56, 0.68) : rigMode === 2 ? range(rng, 0.48, 0.58) : range(rng, 0.52, 0.64));
  const fy = h * (rigMode === 1 ? range(rng, 0.3, 0.39) : range(rng, 0.32, 0.42));
  const baseScale = Math.min(w, h);

  // Ambient optical bloom around focal vertex
  const bloom = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(w, h) * 0.62);
  if (pal.isLight) {
    bloom.addColorStop(0, pal.keyAlpha(0.15));
    bloom.addColorStop(0.5, pal.analogAlpha(0.055));
    bloom.addColorStop(1, 'rgba(236,234,228,0)');
  } else {
    bloom.addColorStop(0, pal.midAlpha(0.3));
    bloom.addColorStop(0.45, pal.deepAlpha(0.38));
    bloom.addColorStop(1, 'rgba(9,11,15,0)');
  }
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  // Precision optical bench drafting grid
  drawDraftingGrid(ctx, w, h, pal, { pitch: 28, opacity: pal.isLight ? 0.052 : 0.036, vernier: true });

  // Calibrated protractor arc(s) & optical normal reference axis
  ctx.save();
  const pr = baseScale * (rigMode === 2 ? 0.46 : 0.4);
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.22 : 0.18);
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.arc(fx, fy, pr, -Math.PI * 0.8, Math.PI * 0.38);
  ctx.stroke();

  if (rigMode === 2) {
    // Secondary outer optical vernier arc for hexagonal aperture rig
    ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.38 : 0.34);
    ctx.lineWidth = 1.1;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(fx, fy, pr * 1.18, -Math.PI * 0.55, Math.PI * 0.22);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.2 : 0.16);
  ctx.beginPath();
  ctx.moveTo(fx, fy - pr * 1.1);
  ctx.lineTo(fx, fy + pr * 0.96);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let deg = -135; deg <= 75; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const major = deg % 45 === 0;
    const r0 = pr - (major ? 8 : 3.5);
    ctx.beginPath();
    ctx.moveTo(fx + Math.cos(rad) * r0, fy + Math.sin(rad) * r0);
    ctx.lineTo(fx + Math.cos(rad) * pr, fy + Math.sin(rad) * pr);
    ctx.strokeStyle = major ? pal.keyAlpha(pal.isLight ? 0.65 : 0.56) : pal.reticle(pal.isLight ? 0.22 : 0.18);
    ctx.lineWidth = major ? 1.1 : 0.8;
    ctx.stroke();
  }
  ctx.restore();

  // Seed-varied incident beam entry & dispersion exit vectors
  const entryX = rigMode === 1 ? w * range(rng, 0.04, 0.16) : 0;
  const entryY =
    rigMode === 1
      ? 0
      : rigMode === 2
        ? fy + range(rng, 0.06, 0.16) * h
        : fy - range(rng, 0.04, 0.16) * h;

  const bands = 7;
  const spreadDeg = rigMode === 1 ? 40 : rigMode === 2 ? 26 : 32;
  const baseAngle =
    rigMode === 1
      ? range(rng, 0.04, 0.24)
      : rigMode === 2
        ? range(rng, -0.32, -0.1)
        : range(rng, -0.12, 0.12);
  const fanLen = Math.max(w, h) * 0.92;

  // Strictly non-rose / non-purple spectral channel hues anchored to pal.hue
  const channelHues = Array.from({ length: bands }, (_, k) => {
    const offset = k * 19 - 10; // sweeps forward from pal.hue without dipping into 340..360 rose
    return safePrismHue(pal.hue + offset);
  });

  // Pass 1: Volumetric spectral dispersion ribbons
  ctx.save();
  ctx.globalCompositeOperation = pal.isLight ? 'multiply' : 'screen';
  for (let k = 0; k < bands; k++) {
    const frac = k / (bands - 1) - 0.5;
    const ang = baseAngle + (frac * spreadDeg * Math.PI) / 180;
    const ex = fx + Math.cos(ang) * fanLen;
    const ey = fy + Math.sin(ang) * fanLen;
    const [r, g, b] = nonPurpleRgb(pal.isLight ? 0.52 : 0.76, 0.16, channelHues[k]!);

    const ribbon = ctx.createLinearGradient(fx, fy, ex, ey);
    ribbon.addColorStop(0, `rgba(${r},${g},${b},${pal.isLight ? 0.26 : 0.34})`);
    ribbon.addColorStop(0.55, `rgba(${r},${g},${b},${pal.isLight ? 0.13 : 0.16})`);
    ribbon.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.strokeStyle = ribbon;
    ctx.lineWidth = rigMode === 2 ? 9.5 : 11;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();

  // Structured optical crystal facets + seed-distinct sculptural hero prism
  ctx.save();
  ctx.globalCompositeOperation = pal.isLight ? 'multiply' : 'screen';

  const facets = 4 + Math.floor(rng() * 3);
  const drift = Math.sin(t * 0.45) * 4;
  const facetL = pal.isLight ? 0.58 : 0.68;
  const edgeL = pal.isLight ? 0.44 : 0.82;

  for (let i = facets - 1; i >= 0; i--) {
    const isHero = i === 0;
    const cx = isHero ? fx : fx + range(rng, -0.3, 0.3) * w + drift * (i % 2 ? 1 : -1);
    const cy = isHero ? fy : fy + range(rng, -0.22, 0.22) * h;
    const size = isHero ? baseScale * (rigMode === 1 ? 0.38 : 0.35) : range(rng, 0.14, 0.31) * baseScale;

    let sides = i % 2 === 0 ? 4 : 3;
    let rot = rng() * Math.PI * 2;
    if (isHero) {
      if (rigMode === 0) {
        sides = 3;
        rot = -Math.PI / 2 + range(rng, -0.16, 0.16) + Math.sin(t * 0.3) * 0.035;
      } else if (rigMode === 1) {
        sides = 4;
        rot = -Math.PI / 2 + range(rng, -0.22, 0.22) + Math.sin(t * 0.3) * 0.03;
      } else {
        sides = 6;
        rot = Math.PI / 6 + range(rng, -0.15, 0.15) + Math.sin(t * 0.3) * 0.03;
      }
    }

    const facetHue = safePrismHue(pal.hue + (isHero ? 0 : i * 24 - 12));
    const [r, g, b] = nonPurpleRgb(facetL, pal.isLight ? 0.145 : 0.155, facetHue);
    const [er, eg, eb] = nonPurpleRgb(edgeL, pal.isLight ? 0.165 : 0.15, facetHue);

    const pts: [number, number][] = [];
    for (let k = 0; k < sides; k++) {
      const ang = rot + (k * Math.PI * 2) / sides;
      const rad = sides === 4 && k % 2 === 1 ? size * (isHero ? 0.56 : 0.68) : size;
      pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
    }

    ctx.beginPath();
    pts.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();

    const fill = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    fill.addColorStop(0, `rgba(${r},${g},${b},${isHero ? (pal.isLight ? 0.34 : 0.38) : pal.isLight ? 0.2 : 0.24})`);
    fill.addColorStop(0.6, `rgba(${r},${g},${b},${isHero ? 0.14 : 0.08})`);
    fill.addColorStop(1, `rgba(${r},${g},${b},0.02)`);
    ctx.fillStyle = fill;
    ctx.fill();

    // Internal refractive facet planes inside hero prism
    if (isHero && pts.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      ctx.lineTo(cx, cy + size * 0.1);
      ctx.lineTo(pts[1]![0], pts[1]![1]);
      ctx.closePath();
      ctx.fillStyle = `rgba(${er},${eg},${eb},${pal.isLight ? 0.18 : 0.22})`;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      ctx.lineTo(cx, cy + size * 0.1);
      ctx.lineTo(pts[pts.length - 1]![0], pts[pts.length - 1]![1]);
      ctx.strokeStyle = `rgba(${er},${eg},${eb},${pal.isLight ? 0.42 : 0.48})`;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }

    ctx.beginPath();
    pts.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.strokeStyle = `rgba(${er},${eg},${eb},${isHero ? 0.92 : 0.54})`;
    ctx.lineWidth = isHero ? 1.65 : 1.0;
    ctx.stroke();

    // Crisp chromatic dispersion fringe strictly in safe non-rose/non-purple spectrum
    const fringeHue = safePrismHue(facetHue + 132);
    const [r2, g2, b2] = nonPurpleRgb(edgeL, 0.145, fringeHue);
    ctx.save();
    ctx.translate(2, -1.3);
    ctx.strokeStyle = `rgba(${r2},${g2},${b2},${isHero ? 0.5 : 0.34})`;
    ctx.lineWidth = isHero ? 1.05 : 0.8;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Primary incident collimator beam + razor-sharp spectral ray filaments
  ctx.save();
  const incGlow = ctx.createLinearGradient(entryX, entryY, fx, fy);
  incGlow.addColorStop(0, 'rgba(0,0,0,0)');
  incGlow.addColorStop(0.58, pal.keyAlpha(pal.isLight ? 0.22 : 0.32));
  incGlow.addColorStop(1, pal.keyAlpha(pal.isLight ? 0.42 : 0.54));
  ctx.strokeStyle = incGlow;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(entryX, entryY);
  ctx.lineTo(fx, fy);
  ctx.stroke();

  const incident = ctx.createLinearGradient(entryX, entryY, fx, fy);
  if (pal.isLight) {
    incident.addColorStop(0, 'rgba(17,19,24,0)');
    incident.addColorStop(0.5, 'rgba(17,19,24,0.58)');
    incident.addColorStop(1, pal.key);
  } else {
    incident.addColorStop(0, 'rgba(255,255,255,0)');
    incident.addColorStop(0.5, 'rgba(255,255,255,0.78)');
    incident.addColorStop(1, '#FFFFFF');
  }
  ctx.strokeStyle = incident;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(entryX, entryY);
  ctx.lineTo(fx, fy);
  ctx.stroke();

  for (let k = 0; k < bands; k++) {
    const frac = k / (bands - 1) - 0.5;
    const ang = baseAngle + (frac * spreadDeg * Math.PI) / 180;
    const ex = fx + Math.cos(ang) * fanLen;
    const ey = fy + Math.sin(ang) * fanLen;
    const [r, g, b] = nonPurpleRgb(pal.isLight ? 0.46 : 0.8, 0.165, channelHues[k]!);

    const ray = ctx.createLinearGradient(fx, fy, ex, ey);
    ray.addColorStop(0, `rgba(${r},${g},${b},${pal.isLight ? 0.86 : 0.88})`);
    ray.addColorStop(0.65, `rgba(${r},${g},${b},${pal.isLight ? 0.35 : 0.38})`);
    ray.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.strokeStyle = ray;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Specular caustic focal node + precision optical lens collar
  const glint = ctx.createRadialGradient(fx, fy, 0, fx, fy, 20);
  glint.addColorStop(0, '#FFFFFF');
  glint.addColorStop(0.28, pal.key);
  glint.addColorStop(0.6, pal.keyAlpha(0.3));
  glint.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.arc(fx, fy, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = pal.isLight ? pal.inkAlpha(0.36) : 'rgba(255,255,255,0.46)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(fx, fy, rigMode === 2 ? 14 : 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
