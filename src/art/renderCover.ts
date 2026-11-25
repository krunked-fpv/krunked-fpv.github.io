import { makePalette, type ArtTheme } from './color';
import { drawCornerFiducials, finishCover } from './drafting';
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
  theme?: ArtTheme;
}

const DRAWERS: Record<ArtStyle, (a: StyleArgs) => void> = {
  topo: drawTopo,
  orbital: drawOrbital,
  synthwave: drawSynthwave,
  prism: drawPrism,
  groove: drawGroove,
};

/** Deterministic: same (seed, style, hue, theme, size, t) -> same pixels. */
export function renderCover(canvas: HTMLCanvasElement | OffscreenCanvas, o: RenderOpts) {
  const dpr = o.dpr ?? 1;
  canvas.width = Math.max(1, Math.round(o.w * dpr));
  canvas.height = Math.max(1, Math.round(o.h * dpr));
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pal = makePalette(o.hue, o.theme ?? 'obsidian');
  DRAWERS[o.style]({ ctx, w: o.w, h: o.h, seed: o.seed, pal, t: o.t ?? 0 });
  drawCornerFiducials(ctx, o.w, o.h, pal);
  finishCover(ctx, o.w, o.h, pal);
}
