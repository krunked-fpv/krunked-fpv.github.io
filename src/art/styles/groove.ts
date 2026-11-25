import { nonPurpleRgb } from '../color';
import { drawDraftingGrid } from '../drafting';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Reference Turntable / Mastering Lathe:
 * - Obsidian: deep anodized lacquer vinyl platter, strobe timing rim, 96-seg harmonic grooves,
 *   rotating anisotropic sheen, Swiss label rings, and cantilevered tonearm silhouette.
 * - Braun Daylight: bright machined brushed-aluminum / ceramic platter with subtle graphite
 *   grooves and analogous pigment index label for >= 7:1 card typography legibility.
 */
export function drawGroove({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 0, w, h);

  drawDraftingGrid(ctx, w, h, pal, { pitch: 30, opacity: pal.isLight ? 0.045 : 0.03 });

  const cx = w * range(rng, 0.6, 0.74);
  const cy = h * range(rng, 0.44, 0.56);
  const R = Math.min(w, h) * 0.76;

  // Machined aluminum platter outer bezel + Technics/Braun strobe dots
  const rimR = R * 1.045;
  ctx.beginPath();
  ctx.arc(cx, cy, rimR, 0, Math.PI * 2);
  ctx.fillStyle = pal.isLight ? '#DEDAD0' : '#131720';
  ctx.fill();
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.22 : 0.2);
  ctx.lineWidth = 1;
  ctx.stroke();

  const strobeCount = 96;
  const strobePhase = t * 0.35;
  ctx.fillStyle = pal.reticle(pal.isLight ? 0.28 : 0.28);
  for (let i = 0; i < strobeCount; i++) {
    const a = (i / strobeCount) * Math.PI * 2 + strobePhase;
    const sx = cx + Math.cos(a) * (R * 1.022);
    const sy = cy + Math.sin(a) * (R * 1.022);
    const dotR = i % 4 === 0 ? 1.25 : 0.75;
    ctx.beginPath();
    ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Platter body: bright ceramic-aluminum in Braun Daylight; deep obsidian lacquer in dark mode
  const disc = ctx.createRadialGradient(cx, cy, R * 0.16, cx, cy, R);
  if (pal.isLight) {
    disc.addColorStop(0, '#F3F1EB');
    disc.addColorStop(0.55, '#E7E4DC');
    disc.addColorStop(1, '#DBD7CD');
  } else {
    disc.addColorStop(0, '#1B202B');
    disc.addColorStop(0.6, '#0E1117');
    disc.addColorStop(1, '#07090C');
  }
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Crisp outer platter hairline ring in Daylight
  if (pal.isLight) {
    ctx.strokeStyle = 'rgba(20,22,26,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Seeded LP track lead-out separators
  const tracks = 3 + Math.floor(rng() * 3);
  const groups: number[] = [];
  for (let i = 0; i < tracks; i++) groups.push(range(rng, 0.38, 0.92));
  groups.sort((a, b) => a - b);

  // Smooth 96-segment continuous harmonic grooves
  const f1 = 2 + Math.floor(rng() * 4);
  const f2 = f1 * 2 + 1;
  const ph = rng() * Math.PI * 2;
  const segs = 96;
  const step = Math.max(2.0, R / 88);

  for (let r = R * 0.31; r < R * 0.985; r += step) {
    const k = r / R;
    const isGap = groups.some((g) => Math.abs(k - g) < 0.008);
    ctx.beginPath();
    for (let a = 0; a <= segs; a++) {
      const ang = (a / segs) * Math.PI * 2;
      const wob = Math.sin(ang * f1 + ph + k * 18) * 0.36 + Math.cos(ang * f2 - ph * 0.5) * 0.14;
      const rr = r + (isGap ? 0 : wob);
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (isGap) {
      ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.5 : 0.52);
      ctx.lineWidth = 1.25;
    } else if (pal.isLight) {
      const etchMod = 0.055 + (Math.sin(k * 95) + 1) * 0.03;
      ctx.strokeStyle = `rgba(20,22,26,${etchMod.toFixed(3)})`;
      ctx.lineWidth = 0.65;
    } else {
      const sheenMod = 0.03 + (Math.sin(k * 95) + 1) * 0.022;
      ctx.strokeStyle = `rgba(255,255,255,${sheenMod.toFixed(3)})`;
      ctx.lineWidth = 0.65;
    }
    ctx.stroke();
  }

  // Dual-lobe rotating anisotropic specular reflection cones
  const sheenAng = rng() * Math.PI + t * 0.45;
  for (let s = 0; s < 2; s++) {
    const a0 = sheenAng + s * Math.PI;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.99, a0 - 0.34, a0 + 0.34);
    ctx.closePath();
    ctx.clip();

    const sh = ctx.createRadialGradient(cx, cy, R * 0.28, cx, cy, R);
    if (pal.isLight) {
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.55, 'rgba(255,255,255,0.52)');
      sh.addColorStop(0.78, pal.keyAlpha(0.14));
      sh.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.55, pal.keyAlpha(0.24));
      sh.addColorStop(0.75, 'rgba(255,255,255,0.12)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = sh;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  }

  // Machined Swiss center label disc (strictly analogous gradient -- never crosses sRGB lavender/pink!)
  const lr = R * 0.23;
  const [alR, alG, alB] = nonPurpleRgb(pal.isLight ? 0.68 : 0.66, pal.isLight ? 0.095 : 0.13, pal.hue + 14);
  const lab = ctx.createLinearGradient(cx - lr, cy - lr, cx + lr, cy + lr);
  if (pal.isLight) {
    lab.addColorStop(0, `rgb(${alR} ${alG} ${alB})`);
    lab.addColorStop(0.55, pal.deep);
    lab.addColorStop(1, '#F3F1EB');
  } else {
    lab.addColorStop(0, pal.key);
    lab.addColorStop(0.6, `rgb(${alR} ${alG} ${alB})`);
    lab.addColorStop(1, pal.deep);
  }
  ctx.fillStyle = lab;
  ctx.beginPath();
  ctx.arc(cx, cy, lr, 0, Math.PI * 2);
  ctx.fill();

  // Concentric Swiss index rings + registration tick on label
  ctx.strokeStyle = pal.isLight ? 'rgba(20,22,26,0.34)' : 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.98, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.5, -Math.PI * 0.85, Math.PI * 0.35);
  ctx.stroke();

  const indexAng = ph + t * 0.45;
  ctx.strokeStyle = pal.isLight ? pal.key : 'rgba(255,255,255,0.78)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(indexAng) * lr * 0.3, cy + Math.sin(indexAng) * lr * 0.3);
  ctx.lineTo(cx + Math.cos(indexAng) * lr * 0.74, cy + Math.sin(indexAng) * lr * 0.74);
  ctx.stroke();

  // Machined steel spindle collar & pin
  ctx.fillStyle = pal.isLight ? '#23262E' : '#07080A';
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = pal.isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cantilevered industrial tonearm silhouette along right margin
  if (w >= 180) {
    const pivotX = w - Math.max(18, w * 0.08);
    const pivotY = Math.max(18, h * 0.14);
    const headX = cx + R * 0.58;
    const headY = cy + R * 0.42;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 10, 0, Math.PI * 2);
    ctx.fillStyle = pal.isLight ? 'rgba(20,22,26,0.08)' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = pal.reticle(0.32);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX - (pivotX - headX) * 0.65, headY - 12);
    ctx.lineTo(headX, headY);
    ctx.strokeStyle = pal.reticle(pal.isLight ? 0.42 : 0.48);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.fillStyle = pal.key;
    ctx.beginPath();
    ctx.arc(headX, headY, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
