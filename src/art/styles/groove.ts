import { nonPurpleRgb } from '../color';
import { drawDraftingGrid } from '../drafting';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Reference Direct-Drive Turntable & Mastering Lathe Print:
 * - Obsidian: deep studio lacquer vinyl platter, dual-row Technics strobe rim, 96-seg harmonic
 *   grooves, vibrant track lead-out bands, dramatic twin-lobe anisotropic reflection, Bauhaus
 *   record label, and brushed S-curve tonearm with illuminated stylus.
 * - Braun Daylight: luminous pearl-silver machined aluminum platter with sharp graphite grooves,
 *   high-chroma Swiss gallery pigment label, and tactile studio shadows.
 */
export function drawGroove({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);

  // Studio plinth deck background
  if (pal.isLight) {
    const deck = ctx.createLinearGradient(0, 0, w, h);
    deck.addColorStop(0, '#F6F4EE');
    deck.addColorStop(0.55, pal.ground);
    deck.addColorStop(1, pal.groundDeep);
    ctx.fillStyle = deck;
    ctx.fillRect(0, 0, w, h);
  } else {
    const deck = ctx.createLinearGradient(0, 0, w, h);
    deck.addColorStop(0, '#0D1017');
    deck.addColorStop(1, pal.ground);
    ctx.fillStyle = deck;
    ctx.fillRect(0, 0, w, h);
  }

  drawDraftingGrid(ctx, w, h, pal, { pitch: 30, opacity: pal.isLight ? 0.048 : 0.032 });

  const cx = w * range(rng, 0.6, 0.74);
  const cy = h * range(rng, 0.42, 0.5);
  const R = Math.min(w, h) * 0.73;

  // Ambient chromatic aura + recessed platter well shadow
  const wellShadow = ctx.createRadialGradient(cx, cy + 5, R * 0.86, cx, cy + 6, R * 1.18);
  if (pal.isLight) {
    wellShadow.addColorStop(0, 'rgba(17,19,24,0.16)');
    wellShadow.addColorStop(0.55, pal.keyAlpha(0.08));
    wellShadow.addColorStop(1, 'rgba(236,234,228,0)');
  } else {
    wellShadow.addColorStop(0, 'rgba(0,0,0,0.72)');
    wellShadow.addColorStop(0.58, pal.keyAlpha(0.18));
    wellShadow.addColorStop(1, 'rgba(9,11,15,0)');
  }
  ctx.fillStyle = wellShadow;
  ctx.beginPath();
  ctx.arc(cx, cy + 5, R * 1.18, 0, Math.PI * 2);
  ctx.fill();

  // Machined aluminum strobe rim bezel
  const rimR = R * 1.055;
  ctx.beginPath();
  ctx.arc(cx, cy, rimR, 0, Math.PI * 2);
  const rimGrad = ctx.createLinearGradient(cx - rimR, cy - rimR, cx + rimR, cy + rimR);
  if (pal.isLight) {
    rimGrad.addColorStop(0, '#ECEAE2');
    rimGrad.addColorStop(0.5, '#D7D3C9');
    rimGrad.addColorStop(1, '#F2F0E8');
  } else {
    rimGrad.addColorStop(0, '#222836');
    rimGrad.addColorStop(0.5, '#11151E');
    rimGrad.addColorStop(1, '#1A202D');
  }
  ctx.fillStyle = rimGrad;
  ctx.fill();
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.24 : 0.24);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Dual-row Technics/Braun timing strobe dots
  const strobeCount = 96;
  const strobePhase = t * 0.35;
  for (let i = 0; i < strobeCount; i++) {
    const a = (i / strobeCount) * Math.PI * 2 + strobePhase;
    const major = i % 4 === 0;
    const sr = R * (major ? 1.028 : 1.024);
    const sx = cx + Math.cos(a) * sr;
    const sy = cy + Math.sin(a) * sr;
    ctx.fillStyle = major ? pal.keyAlpha(pal.isLight ? 0.65 : 0.65) : pal.reticle(pal.isLight ? 0.3 : 0.3);
    ctx.beginPath();
    ctx.arc(sx, sy, major ? 1.35 : 0.78, 0, Math.PI * 2);
    ctx.fill();
  }

  // Platter body: pearl-silver ceramic aluminum in Daylight; glossy lacquer vinyl in Obsidian
  const disc = ctx.createRadialGradient(cx - R * 0.14, cy - R * 0.14, R * 0.12, cx, cy, R);
  if (pal.isLight) {
    disc.addColorStop(0, '#FAF8F3');
    disc.addColorStop(0.52, '#ECEAE2');
    disc.addColorStop(1, '#DFDBD0');
  } else {
    disc.addColorStop(0, '#202634');
    disc.addColorStop(0.55, '#0E1219');
    disc.addColorStop(1, '#06080B');
  }
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = pal.isLight ? 'rgba(17,19,24,0.2)' : 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Seeded LP track lead-out separators
  const tracks = 3 + Math.floor(rng() * 3);
  const groups: number[] = [];
  for (let i = 0; i < tracks; i++) groups.push(range(rng, 0.39, 0.91));
  groups.sort((a, b) => a - b);

  // Continuous 96-segment harmonic vinyl grooves
  const f1 = 2 + Math.floor(rng() * 4);
  const f2 = f1 * 2 + 1;
  const ph = rng() * Math.PI * 2;
  const segs = 96;
  const step = Math.max(2.0, R / 86);

  for (let r = R * 0.32; r < R * 0.985; r += step) {
    const k = r / R;
    const isGap = groups.some((g) => Math.abs(k - g) < 0.0085);
    ctx.beginPath();
    for (let a = 0; a <= segs; a++) {
      const ang = (a / segs) * Math.PI * 2;
      const wob = Math.sin(ang * f1 + ph + k * 18) * 0.34 + Math.cos(ang * f2 - ph * 0.5) * 0.13;
      const rr = r + (isGap ? 0 : wob);
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (isGap) {
      ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.68 : 0.68);
      ctx.lineWidth = 1.45;
    } else if (pal.isLight) {
      const etchMod = 0.065 + (Math.sin(k * 95) + 1) * 0.036;
      ctx.strokeStyle = `rgba(17,19,24,${etchMod.toFixed(3)})`;
      ctx.lineWidth = 0.7;
    } else {
      const sheenMod = 0.038 + (Math.sin(k * 95) + 1) * 0.028;
      ctx.strokeStyle = `rgba(255,255,255,${sheenMod.toFixed(3)})`;
      ctx.lineWidth = 0.7;
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
    ctx.arc(cx, cy, R * 0.99, a0 - 0.38, a0 + 0.38);
    ctx.closePath();
    ctx.clip();

    const sh = ctx.createRadialGradient(cx, cy, R * 0.28, cx, cy, R);
    if (pal.isLight) {
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0.68)');
      sh.addColorStop(0.76, pal.keyAlpha(0.18));
      sh.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.48, pal.keyAlpha(0.3));
      sh.addColorStop(0.72, 'rgba(255,255,255,0.18)');
      sh.addColorStop(0.88, pal.counterAlpha(0.14));
      sh.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = sh;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  }

  // Iconic Bauhaus Swiss Center Label (strictly analogous non-purple pigments)
  const lr = R * 0.255;
  const [alR, alG, alB] = nonPurpleRgb(pal.isLight ? 0.56 : 0.62, pal.isLight ? 0.14 : 0.15, pal.hue + 20);
  const lab = ctx.createLinearGradient(cx - lr, cy - lr, cx + lr, cy + lr);
  if (pal.isLight) {
    lab.addColorStop(0, pal.key);
    lab.addColorStop(0.55, `rgb(${alR} ${alG} ${alB})`);
    lab.addColorStop(1, pal.deep);
  } else {
    lab.addColorStop(0, pal.key);
    lab.addColorStop(0.55, `rgb(${alR} ${alG} ${alB})`);
    lab.addColorStop(1, pal.deep);
  }
  ctx.fillStyle = lab;
  ctx.beginPath();
  ctx.arc(cx, cy, lr, 0, Math.PI * 2);
  ctx.fill();

  // Crisp Bauhaus split-hemisphere graphic arc on label
  const indexAng = ph + t * 0.45;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.96, indexAng - Math.PI * 0.5, indexAng + Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = pal.isLight ? 'rgba(255,255,255,0.22)' : 'rgba(6,7,9,0.28)';
  ctx.fill();
  ctx.restore();

  // Concentric Swiss label rings + index needle bar
  ctx.strokeStyle = pal.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.52)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.98, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, lr * 0.48, indexAng - Math.PI * 0.75, indexAng + Math.PI * 0.35);
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(indexAng) * lr * 0.28, cy + Math.sin(indexAng) * lr * 0.28);
  ctx.lineTo(cx + Math.cos(indexAng) * lr * 0.74, cy + Math.sin(indexAng) * lr * 0.74);
  ctx.stroke();

  // Machined steel spindle collar & bright pin
  ctx.fillStyle = pal.isLight ? '#181B22' : '#06070A';
  ctx.beginPath();
  ctx.arc(cx, cy, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.78)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.fillStyle = pal.isLight ? '#F5F7FA' : '#C8D0DC';
  ctx.beginPath();
  ctx.arc(cx - 0.8, cy - 0.8, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Sculpted S-curve precision tonearm & gimbal assembly
  if (w >= 170) {
    const pivotX = w - Math.max(20, w * 0.085);
    const pivotY = Math.max(20, h * 0.14);
    const headX = cx + R * 0.56;
    const headY = cy + R * 0.38;
    const ctrlX = pivotX - (pivotX - headX) * 0.22;
    const ctrlY = headY - 22;

    ctx.save();
    // Gimbal mount base
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 12, 0, Math.PI * 2);
    ctx.fillStyle = pal.isLight ? 'rgba(255,255,255,0.82)' : 'rgba(22,27,36,0.9)';
    ctx.fill();
    ctx.strokeStyle = pal.reticle(0.38);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = pal.keyAlpha(0.75);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Soft tonearm cast shadow
    ctx.beginPath();
    ctx.moveTo(pivotX + 2, pivotY + 4);
    ctx.quadraticCurveTo(ctrlX + 2, ctrlY + 4, headX + 2, headY + 4);
    ctx.strokeStyle = pal.isLight ? 'rgba(17,19,24,0.14)' : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Brushed metallic S-arm tube
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, headX, headY);
    ctx.strokeStyle = pal.isLight ? 'rgba(30,34,42,0.72)' : 'rgba(226,232,240,0.72)';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Highlight filament along arm
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, headX, headY);
    ctx.strokeStyle = pal.isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Illuminated stylus tracking LED tip
    const tipGlow = ctx.createRadialGradient(headX, headY, 0, headX, headY, 9);
    tipGlow.addColorStop(0, pal.key);
    tipGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tipGlow;
    ctx.beginPath();
    ctx.arc(headX, headY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.key;
    ctx.beginPath();
    ctx.arc(headX, headY, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(headX, headY, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
