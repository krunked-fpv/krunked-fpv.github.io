import { makePalette } from './color';
import { drawGroove } from './styles/groove';
import { drawOrbital } from './styles/orbital';
import { drawPrism } from './styles/prism';
import { drawSynthwave } from './styles/synthwave';
import { drawTopo } from './styles/topo';
import type { Ctx2D, StyleArgs } from './styles/types';
import type { ArtStyle } from '../types/project';

export interface RenderOpts {
  seed: number;
  style: ArtStyle;
  hue: number;
  w: number;
  h: number;
  dpr?: number;
  t?: number;
}

const DRAWERS: Record<ArtStyle, (a: StyleArgs) => void> = {
  topo: drawTopo,
  orbital: drawOrbital,
  synthwave: drawSynthwave,
  prism: drawPrism,
  groove: drawGroove,
};

/** Deterministic: same (seed, style, hue, size, t) → same pixels. */
export function renderCover(canvas: HTMLCanvasElement | OffscreenCanvas, o: RenderOpts) {
  const dpr = o.dpr ?? 1;
  canvas.width = Math.max(1, Math.round(o.w * dpr));
  canvas.height = Math.max(1, Math.round(o.h * dpr));
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pal = makePalette(o.hue);
  DRAWERS[o.style]({ ctx, w: o.w, h: o.h, seed: o.seed, pal, t: o.t ?? 0 });
  finish(ctx, o.w, o.h);
}

function finish(ctx: Ctx2D, w: number, h: number) {
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
  vig.addColorStop(0, 'rgba(7,8,10,0)');
  vig.addColorStop(1, 'rgba(7,8,10,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  const fade = ctx.createLinearGradient(0, h * 0.55, 0, h);
  fade.addColorStop(0, 'rgba(13,16,21,0)');
  fade.addColorStop(1, 'rgba(13,16,21,0.92)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
}
