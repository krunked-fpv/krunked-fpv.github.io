import type { ArtTheme } from '../types/project';

export type { ArtTheme };

export interface Palette {
  theme: ArtTheme;
  isLight: boolean;
  hue: number;
  counterHue: number;
  analogHue: number;
  key: string;
  mid: string;
  deep: string;
  highlight: string;
  counter: string;
  analog: string;
  ground: string;
  groundDeep: string;
  surface: string;
  ink: string;
  glow: (a: number) => string;
  keyAlpha: (a: number) => string;
  midAlpha: (a: number) => string;
  deepAlpha: (a: number) => string;
  counterAlpha: (a: number) => string;
  analogAlpha: (a: number) => string;
  inkAlpha: (a: number) => string;
  reticle: (a: number) => string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** OKLCH -> sRGB [0..255]. */
export function oklchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [
    Math.round(clamp01(gamma(r)) * 255),
    Math.round(clamp01(gamma(g)) * 255),
    Math.round(clamp01(gamma(bl)) * 255),
  ];
}

export function rgbToHue(r: number, g: number, b: number): { L: number; hue: number } {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, hue };
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()) ?? /^#?([0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Hues 245-340 deg read as generic purple/indigo/magenta -- remap into cyan or amber. */
export function remapHue(h: number): number {
  const n = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 185;
  if (n >= 245 && n <= 340) {
    return n < 292 ? 185 + ((n - 245) / 47) * 45 : 22 + ((n - 292) / 48) * 48;
  }
  return n;
}

/** Strict non-purple OKLCH -> sRGB helper for multi-band shaders and dispersion fans. */
export function nonPurpleRgb(L: number, C: number, rawHue: number): [number, number, number] {
  return oklchToRgb(L, C, remapHue(rawHue));
}

const css = (c: [number, number, number], a = 1) =>
  a >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${Number(a.toFixed(4))})`;

/**
 * Dual-theme Swiss / Bauhaus exhibition palette with strict non-purple guard.
 * Preserves canonical ground tokens (#090B0F obsidian, #ECEAE4 daylight).
 */
export function makePalette(rawHue: number, theme: ArtTheme = 'obsidian'): Palette {
  const hue = remapHue(rawHue);
  const counterHue = remapHue(hue + 148);
  const analogHue = remapHue(hue + 24);
  const isLight = theme === 'daylight';

  if (isLight) {
    // Rich gallery print pigments on warm sunlit museum rag paper (never muddy grey-tan)
    const key = oklchToRgb(0.46, 0.165, hue);
    const mid = oklchToRgb(0.64, 0.125, hue);
    const deep = oklchToRgb(0.91, 0.042, hue);
    const highlight = oklchToRgb(0.97, 0.018, analogHue);
    const counter = oklchToRgb(0.50, 0.155, counterHue);
    const analog = oklchToRgb(0.54, 0.145, analogHue);
    const ink: [number, number, number] = [17, 19, 24];

    return {
      theme,
      isLight: true,
      hue,
      counterHue,
      analogHue,
      key: css(key),
      mid: css(mid),
      deep: css(deep),
      highlight: css(highlight),
      counter: css(counter),
      analog: css(analog),
      ground: '#ECEAE4',
      groundDeep: '#E4E0D6',
      surface: '#FFFFFF',
      ink: '#111318',
      glow: (a) => css(key, a),
      keyAlpha: (a) => css(key, a),
      midAlpha: (a) => css(mid, a),
      deepAlpha: (a) => css(deep, a),
      counterAlpha: (a) => css(counter, a),
      analogAlpha: (a) => css(analog, a),
      inkAlpha: (a) => css(ink, a),
      reticle: (a) => css(ink, a),
    };
  }

  // Luminous anodized studio pigments on velvety carbon ground
  const key = oklchToRgb(0.76, 0.168, hue);
  const mid = oklchToRgb(0.48, 0.138, hue);
  const deep = oklchToRgb(0.24, 0.088, hue);
  const highlight = oklchToRgb(0.90, 0.085, analogHue);
  const counter = oklchToRgb(0.82, 0.148, counterHue);
  const analog = oklchToRgb(0.72, 0.152, analogHue);
  const ink: [number, number, number] = [245, 247, 250];

  return {
    theme: 'obsidian',
    isLight: false,
    hue,
    counterHue,
    analogHue,
    key: css(key),
    mid: css(mid),
    deep: css(deep),
    highlight: css(highlight),
    counter: css(counter),
    analog: css(analog),
    ground: '#090B0F',
    groundDeep: '#050609',
    surface: '#10131A',
    ink: '#F5F7FA',
    glow: (a) => css(key, a),
    keyAlpha: (a) => css(key, a),
    midAlpha: (a) => css(mid, a),
    deepAlpha: (a) => css(deep, a),
    counterAlpha: (a) => css(counter, a),
    analogAlpha: (a) => css(analog, a),
    inkAlpha: (a) => css(ink, a),
    reticle: (a) => css(ink, a),
  };
}
