import type { ArtTheme, Palette } from './color';
import { mulberry32 } from './prng';
import type { Ctx2D } from './styles/types';

const grainTiles = new Map<ArtTheme, HTMLCanvasElement>();

/** Builds a tiny 64x64 deterministic monochrome print-grain tile once per theme (zero GPU readbacks). */
function getGrainTile(theme: ArtTheme): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const hit = grainTiles.get(theme);
  if (hit) return hit;

  const size = 64;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const gctx = tile.getContext('2d');
  if (!gctx) return null;

  const rng = mulberry32(theme === 'daylight' ? 0x4441594c : 0x4f425344);
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const v = rng();
      if (v > 0.64) {
        const a = (v - 0.64) * (theme === 'daylight' ? 0.065 : 0.072);
        gctx.fillStyle = theme === 'daylight' ? `rgba(17,19,24,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`;
        gctx.fillRect(x, y, 1, 1);
      } else if (v < 0.2) {
        const a = (0.2 - v) * (theme === 'daylight' ? 0.08 : 0.07);
        gctx.fillStyle = theme === 'daylight' ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${a.toFixed(3)})`;
        gctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  grainTiles.set(theme, tile);
  return tile;
}

/** Subtle architectural drafting grid + intersection ticks + edge vernier scale. */
export function drawDraftingGrid(
  ctx: Ctx2D,
  w: number,
  h: number,
  pal: Palette,
  opts: { pitch?: number; opacity?: number; vernier?: boolean } = {},
) {
  const pitch = opts.pitch ?? (Math.min(w, h) > 320 ? 32 : 24);
  const alpha = opts.opacity ?? (pal.isLight ? 0.055 : 0.042);

  ctx.save();
  ctx.strokeStyle = pal.reticle(alpha);
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  for (let x = pitch; x < w; x += pitch) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = pitch; y < h; y += pitch) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // Registration crosshairs every 2nd grid intersection
  ctx.strokeStyle = pal.reticle(alpha * 2.1);
  ctx.beginPath();
  for (let y = pitch * 2; y < h - pitch * 0.5; y += pitch * 2) {
    for (let x = pitch * 2; x < w - pitch * 0.5; x += pitch * 2) {
      ctx.moveTo(x - 2.5, y + 0.5);
      ctx.lineTo(x + 3.5, y + 0.5);
      ctx.moveTo(x + 0.5, y - 2.5);
      ctx.lineTo(x + 0.5, y + 3.5);
    }
  }
  ctx.stroke();

  // Right-margin Swiss vernier scale
  if (opts.vernier && w >= 180 && h >= 120) {
    ctx.strokeStyle = pal.reticle(pal.isLight ? 0.16 : 0.14);
    ctx.beginPath();
    const step = 10;
    const rx = w - 6;
    for (let y = 16, i = 0; y < h - 18; y += step, i++) {
      const len = i % 5 === 0 ? 7 : 3;
      ctx.moveTo(rx - len, y + 0.5);
      ctx.lineTo(rx, y + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Crisp L-shaped optical registration fiducials inset from the four corners. */
export function drawCornerFiducials(ctx: Ctx2D, w: number, h: number, pal: Palette) {
  if (w < 120 || h < 80) return;
  const m = 10;
  const arm = Math.min(10, Math.round(Math.min(w, h) * 0.055));

  ctx.save();
  ctx.strokeStyle = pal.reticle(pal.isLight ? 0.22 : 0.18);
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(m, m + arm);
  ctx.lineTo(m, m);
  ctx.lineTo(m + arm, m);
  // Top-right
  ctx.moveTo(w - m - arm, m);
  ctx.lineTo(w - m, m);
  ctx.lineTo(w - m, m + arm);
  // Bottom-right
  ctx.moveTo(w - m, h - m - arm);
  ctx.lineTo(w - m, h - m);
  ctx.lineTo(w - m - arm, h - m);
  // Bottom-left
  ctx.moveTo(m + arm, h - m);
  ctx.lineTo(m, h - m);
  ctx.lineTo(m, h - m - arm);
  ctx.stroke();
  ctx.restore();
}

/** Geodetic triangulation datum or target bracket marker. */
export function drawSurveyMarker(
  ctx: Ctx2D,
  x: number,
  y: number,
  pal: Palette,
  variant: 'triangle' | 'reticle' = 'triangle',
) {
  ctx.save();
  if (variant === 'triangle') {
    const r = 7;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.88, y + r * 0.62);
    ctx.lineTo(x - r * 0.88, y + r * 0.62);
    ctx.closePath();
    ctx.fillStyle = pal.isLight ? 'rgba(255,255,255,0.88)' : 'rgba(6,7,9,0.78)';
    ctx.fill();
    ctx.strokeStyle = pal.key;
    ctx.lineWidth = 1.25;
    ctx.stroke();

    ctx.fillStyle = pal.counter;
    ctx.beginPath();
    ctx.arc(x, y + 0.6, 1.9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const s = 8.5;
    const c = 3.8;
    ctx.strokeStyle = pal.keyAlpha(pal.isLight ? 0.88 : 0.82);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + c); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + c, y - s);
    ctx.moveTo(x + s - c, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + c);
    ctx.moveTo(x + s, y + s - c); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - c, y + s);
    ctx.moveTo(x - s + c, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - c);
    ctx.stroke();

    ctx.fillStyle = pal.counter;
    ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
  }
  ctx.restore();
}

/**
 * Museum-grade optical finish:
 * Clean directional depth vignette (zero muddy wash) + cached tactile print grain.
 * Contextual scrimming is handled cleanly by CoverArt's `scrim` prop so the artwork itself stays luminous.
 */
export function finishCover(ctx: Ctx2D, w: number, h: number, pal: Palette) {
  ctx.save();

  // Whisper-clean optical framing vignette centered slightly toward the upper-right focal zone
  const vig = ctx.createRadialGradient(
    w * 0.58,
    h * 0.4,
    Math.min(w, h) * 0.34,
    w * 0.52,
    h * 0.48,
    Math.max(w, h) * 0.9,
  );
  if (pal.isLight) {
    // Crisp architectural gallery illumination — never muddy brown-grey
    vig.addColorStop(0, 'rgba(255,255,255,0.06)');
    vig.addColorStop(0.68, 'rgba(236,234,228,0)');
    vig.addColorStop(1, 'rgba(17,19,24,0.075)');
  } else {
    vig.addColorStop(0, 'rgba(255,255,255,0.02)');
    vig.addColorStop(0.62, 'rgba(6,7,10,0)');
    vig.addColorStop(1, 'rgba(4,5,8,0.44)');
  }
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // Subtle cached tactile print grain overlay
  const tile = getGrainTile(pal.theme);
  if (tile && typeof ctx.createPattern === 'function') {
    try {
      const pat = ctx.createPattern(tile, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
      }
    } catch {
      // Safe fallback in headless canvas mocks
    }
  }

  // Subtle inner optical plate edge catchlight along top border
  ctx.fillStyle = pal.isLight ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 0, w, 1);

  ctx.restore();
}
