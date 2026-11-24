import type { Palette } from '../color';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface StyleArgs {
  ctx: Ctx2D;
  w: number;
  h: number;
  seed: number;
  pal: Palette;
  /** seconds; 0 for static frame */
  t: number;
}
