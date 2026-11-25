import { drawDraftingGrid, drawSurveyMarker } from '../drafting';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Aerospace Astrolabe & Precision Telemetry Instrument:
 * Off-center Braun/Swiss instrument dial, quadrant telemetry arcs, 72-step azimuth vernier,
 * inclined Keplerian orbits with motion wakes, 36-slice phosphor radar sweep, and lock brackets.
 */
export function drawOrbital({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);

  // Base gallery field
  if (pal.isLight) {
    const bgBase = ctx.createLinearGradient(0, 0, w, h);
    bgBase.addColorStop(0, '#F6F4EE');
    bgBase.addColorStop(0.6, pal.ground);
    bgBase.addColorStop(1, pal.groundDeep);
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, w, h);
  }

  const cx = w * range(rng, 0.58, 0.72);
  const cy = h * range(rng, 0.35, 0.46);
  const R = Math.min(w * 0.52, h * 0.68);

  // Radial atmospheric instrument aura
  const aura = ctx.createRadialGradient(cx, cy, R * 0.08, cx, cy, R * 1.35);
  if (pal.isLight) {
    aura.addColorStop(0, pal.keyAlpha(0.14));
    aura.addColorStop(0.55, pal.analogAlpha(0.055));
    aura.addColorStop(1, 'rgba(236,234,228,0)');
  } else {
    aura.addColorStop(0, pal.midAlpha(0.32));
    aura.addColorStop(0.52, pal.deepAlpha(0.45));
    aura.addColorStop(1, 'rgba(9,11,15,0)');
  }
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, w, h);

  // Precision drafting coordinate grid
  drawDraftingGrid(ctx, w, h, pal, { pitch: 28, opacity: pal.isLight ? 0.052 : 0.036, vernier: true });

  // Recessed machined dial face plate
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
  const dialFace = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.05, cx, cy, R);
  if (pal.isLight) {
    dialFace.addColorStop(0, 'rgba(255,255,255,0.62)');
    dialFace.addColorStop(0.75, 'rgba(247,245,239,0.42)');
    dialFace.addColorStop(1, pal.keyAlpha(0.08));
  } else {
    dialFace.addColorStop(0, 'rgba(18,24,34,0.68)');
    dialFace.addColorStop(0.7, 'rgba(9,12,18,0.54)');
    dialFace.addColorStop(1, pal.deepAlpha(0.38));
  }
  ctx.fillStyle = dialFace;
  ctx.fill();
  ctx.restore();

  // Radial 30-degree azimuth sector lines inside dial
  ctx.save();
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.075 : 0.065);
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  for (let d = 0; d < 12; d++) {
    const ang = (d * Math.PI) / 6;
    ctx.moveTo(cx + Math.cos(ang) * (R * 0.16), cy + Math.sin(ang) * (R * 0.16));
    ctx.lineTo(cx + Math.cos(ang) * (R * 0.98), cy + Math.sin(ang) * (R * 0.98));
  }
  ctx.stroke();
  ctx.restore();

  // Concentric range rings
  const rings = 5 + Math.floor(rng() * 3);
  for (let i = 1; i <= rings; i++) {
    const r = (R / rings) * i;
    const major = i === rings || i % 2 === 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = major
      ? pal.isLight
        ? pal.inkAlpha(i === rings ? 0.3 : 0.18)
        : pal.keyAlpha(i === rings ? 0.52 : 0.3)
      : pal.reticle(pal.isLight ? 0.13 : 0.11);
    ctx.lineWidth = i === rings ? 1.35 : major ? 0.95 : 0.7;
    if (!major) ctx.setLineDash([2.5, 4.5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Bold Bauhaus instrument quadrant arc bands along outer perimeter
  const arcStart1 = range(rng, -Math.PI * 0.85, -Math.PI * 0.25);
  const arcSpan1 = range(rng, Math.PI * 0.35, Math.PI * 0.65);
  const arcStart2 = arcStart1 + arcSpan1 + range(rng, 0.28, 0.65);
  const arcSpan2 = range(rng, Math.PI * 0.22, Math.PI * 0.42);

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.045, arcStart1, arcStart1 + arcSpan1);
  ctx.strokeStyle = pal.key;
  ctx.lineWidth = 3.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.045, arcStart2, arcStart2 + arcSpan2);
  ctx.strokeStyle = pal.counter;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();

  // 72-step azimuth vernier compass bezel
  for (let a = 0; a < 72; a++) {
    const ang = (a / 72) * Math.PI * 2;
    const cardinal = a % 18 === 0;
    const major = a % 6 === 0;
    const tickLen = cardinal ? 14 : major ? 9 : 4.5;
    const r1 = R * 0.99;
    const r0 = r1 - tickLen;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    ctx.strokeStyle = cardinal
      ? pal.key
      : major
        ? pal.reticle(pal.isLight ? 0.38 : 0.35)
        : pal.reticle(pal.isLight ? 0.16 : 0.15);
    ctx.lineWidth = cardinal ? 1.6 : 0.85;
    ctx.stroke();
  }

  // Inclined Keplerian orbital trajectories with fading directional satellite wakes
  const orbitCount = 3;
  for (let i = 0; i < orbitCount; i++) {
    const rx = R * range(rng, 0.42, 0.88);
    const ry = rx * range(rng, 0.28, 0.54);
    const tilt = range(rng, -0.78, 0.78) + i * 0.62;
    const dir = i % 2 === 0 ? 1 : -1;
    const satAng = rng() * Math.PI * 2 + t * (0.42 + i * 0.16) * dir;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // Base elliptical trajectory
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, (rx + ry) * 0.5, 0, Math.PI * 2);
    }
    ctx.strokeStyle =
      i === 0
        ? pal.counterAlpha(pal.isLight ? 0.52 : 0.44)
        : i === 1
          ? pal.keyAlpha(pal.isLight ? 0.42 : 0.36)
          : pal.analogAlpha(pal.isLight ? 0.36 : 0.3);
    ctx.lineWidth = i === 0 ? 1.25 : 0.9;
    ctx.setLineDash(i === 0 ? [7, 4] : [2.5, 4.5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tapered 12-segment orbital wake behind satellite
    const wakeSteps = 12;
    for (let s = 0; s < wakeSteps; s++) {
      const a0 = satAng - dir * (s * 0.065);
      const a1 = satAng - dir * ((s + 1) * 0.065);
      const alpha = (1 - s / wakeSteps) * (pal.isLight ? 0.65 : 0.72);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * rx, Math.sin(a0) * ry);
      ctx.lineTo(Math.cos(a1) * rx, Math.sin(a1) * ry);
      ctx.strokeStyle = i === 0 ? pal.counterAlpha(alpha) : pal.keyAlpha(alpha);
      ctx.lineWidth = 2.4 * (1 - s / wakeSteps) + 0.5;
      ctx.stroke();
    }

    // Satellite beacon core + halo
    const sx = Math.cos(satAng) * rx;
    const sy = Math.sin(satAng) * ry;
    if (!pal.isLight) {
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 10);
      halo.addColorStop(0, i === 0 ? pal.counter : pal.key);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = i === 0 ? pal.counter : pal.key;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.isLight ? '#FFFFFF' : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Primary crosshair axes with central aperture gap
  const gap = 14;
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.22 : 0.18);
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // 36-slice logarithmic phosphor sweep wedge
  const sweep = rng() * Math.PI * 2 + t * 0.72;
  const wedge = Math.PI * 0.44;
  const slices = 36;
  for (let i = 0; i < slices; i++) {
    const a0 = sweep - (wedge * (i + 1)) / slices;
    const a1 = sweep - (wedge * i) / slices;
    const falloff = Math.pow(1 - i / slices, 1.9);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.985, a0, a1);
    ctx.closePath();
    ctx.fillStyle = pal.keyAlpha(falloff * (pal.isLight ? 0.24 : 0.3));
    ctx.fill();
  }

  // Dual-layer glowing radar sweep needle
  const ex = cx + Math.cos(sweep) * R * 0.99;
  const ey = cy + Math.sin(sweep) * R * 0.99;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.26 : 0.42);
  ctx.lineWidth = 4.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = pal.isLight ? pal.key : pal.highlight;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Precision gimbal center assembly
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = pal.isLight ? '#FFFFFF' : '#090B0F';
  ctx.fill();
  ctx.strokeStyle = pal.key;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = pal.counter;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Seeded blips with velocity vectors + priority target lock reticles
  const blips = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < blips; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = range(rng, 0.2, 0.9) * R;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const velAng = rng() * Math.PI * 2;
    const velLen = range(rng, 8, 17);

    let diff = (sweep - ang) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    const lit = t === 0 ? 0.78 : Math.max(0.32, 1 - diff / (wedge * 1.4));

    if (!pal.isLight) {
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 16);
      gl.addColorStop(0, i % 3 === 0 ? pal.counter : pal.key);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, lit);
      ctx.fillStyle = gl;
      ctx.fillRect(x - 16, y - 16, 32, 32);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = i % 3 === 0 ? pal.counterAlpha(0.38) : pal.keyAlpha(0.38);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 5.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Velocity vector tail
    ctx.strokeStyle = i % 3 === 0 ? pal.counterAlpha(0.65 * lit) : pal.keyAlpha(0.65 * lit);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(velAng) * velLen, y + Math.sin(velAng) * velLen);
    ctx.stroke();

    // Target core
    ctx.fillStyle = pal.isLight ? (i % 3 === 0 ? pal.counter : pal.key) : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, i < 2 ? 2.4 : 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Priority target lock bracket
    if (i < 2) {
      drawSurveyMarker(ctx, x, y, pal, 'reticle');
    }
  }
}
