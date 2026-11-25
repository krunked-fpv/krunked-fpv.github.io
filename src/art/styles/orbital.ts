import { drawDraftingGrid, drawSurveyMarker } from '../drafting';
import { mulberry32, range } from '../prng';
import type { StyleArgs } from './types';

/**
 * Precision Telemetry Astrolabe / Radar:
 * Off-center instrument dial, 72-step azimuth vernier compass, inclined Keplerian orbital arcs,
 * 32-slice logarithmic phosphor decay sweep, and bracket-locked target blips with velocity vectors.
 */
export function drawOrbital({ ctx, w, h, seed, pal, t }: StyleArgs) {
  const rng = mulberry32(seed);
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 0, w, h);

  const cx = w * range(rng, 0.58, 0.74);
  const cy = h * range(rng, 0.34, 0.48);
  const R = Math.max(w, h) * 0.58;

  // Radial focal atmosphere
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
  bg.addColorStop(0, pal.deep);
  bg.addColorStop(0.65, pal.isLight ? 'rgba(236,234,228,0.12)' : 'rgba(9,11,15,0.2)');
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Architectural coordinate grid
  drawDraftingGrid(ctx, w, h, pal, { pitch: 28, opacity: pal.isLight ? 0.05 : 0.032, vernier: true });

  // Concentric range rings
  const rings = 6 + Math.floor(rng() * 3);
  for (let i = 1; i <= rings; i++) {
    const r = (R / rings) * i;
    const major = i === rings || i % 3 === 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = major
      ? pal.isLight
        ? pal.inkAlpha(0.26)
        : pal.keyAlpha(0.38)
      : pal.reticle(pal.isLight ? 0.14 : 0.11);
    ctx.lineWidth = major ? 1.15 : 0.7;
    if (!major && i % 2 === 0) ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

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
        ? pal.reticle(pal.isLight ? 0.36 : 0.32)
        : pal.reticle(pal.isLight ? 0.16 : 0.14);
    ctx.lineWidth = cardinal ? 1.4 : 0.8;
    ctx.stroke();
  }

  // Inclined Keplerian orbital trajectories
  const orbitCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < orbitCount; i++) {
    const rx = R * range(rng, 0.38, 0.86);
    const ry = rx * range(rng, 0.28, 0.56);
    const tilt = range(rng, -0.75, 0.75) + i * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, (rx + ry) * 0.5, 0, Math.PI * 2);
    }
    ctx.strokeStyle = i === 0 ? pal.counterAlpha(pal.isLight ? 0.45 : 0.36) : pal.keyAlpha(0.24);
    ctx.lineWidth = i === 0 ? 1.1 : 0.85;
    ctx.setLineDash(i === 0 ? [6, 4] : [2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Moving orbital satellite beacon along the primary ellipse
    const satAng = rng() * Math.PI * 2 + t * (0.42 + i * 0.18) * (i % 2 === 0 ? 1 : -1);
    const sx = Math.cos(satAng) * rx;
    const sy = Math.sin(satAng) * ry;
    ctx.fillStyle = i === 0 ? pal.counter : pal.key;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Crosshair axes with central break
  const gap = 12;
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.2 : 0.16);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // 32-slice logarithmic decay sweep wedge
  const sweep = rng() * Math.PI * 2 + t * 0.72;
  const wedge = Math.PI * 0.46;
  const slices = 32;
  for (let i = 0; i < slices; i++) {
    const a0 = sweep - (wedge * (i + 1)) / slices;
    const a1 = sweep - (wedge * i) / slices;
    const falloff = Math.pow(1 - i / slices, 1.85);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.98, a0, a1);
    ctx.closePath();
    ctx.fillStyle = pal.keyAlpha(falloff * (pal.isLight ? 0.19 : 0.24));
    ctx.fill();
  }

  // Leading radar sweep hairline
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * R * 0.99, cy + Math.sin(sweep) * R * 0.99);
  ctx.strokeStyle = pal.key;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Gimbal center ring
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.strokeStyle = pal.key;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = pal.counter;
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  // Seeded blips with velocity vectors + priority target lock reticles
  const blips = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < blips; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = range(rng, 0.18, 0.92) * R;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const velAng = rng() * Math.PI * 2;
    const velLen = range(rng, 7, 16);

    let diff = (sweep - ang) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    const lit = t === 0 ? 0.72 : Math.max(0.28, 1 - diff / (wedge * 1.4));

    if (!pal.isLight) {
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 15);
      gl.addColorStop(0, i % 3 === 0 ? pal.counter : pal.key);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, lit);
      ctx.fillStyle = gl;
      ctx.fillRect(x - 15, y - 15, 30, 30);
      ctx.globalAlpha = 1;
    }

    // Velocity vector tail
    ctx.strokeStyle = i % 3 === 0 ? pal.counterAlpha(0.55 * lit) : pal.keyAlpha(0.55 * lit);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(velAng) * velLen, y + Math.sin(velAng) * velLen);
    ctx.stroke();

    // Target core
    ctx.fillStyle = pal.isLight ? pal.key : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, i < 2 ? 2.2 : 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Lock bracket on top 2 priority blips
    if (i < 2) {
      drawSurveyMarker(ctx, x, y, pal, 'reticle');
    }
  }
}
