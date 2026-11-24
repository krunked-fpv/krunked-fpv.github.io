export interface Palette {
  hue: number;
  key: string;
  deep: string;
  counter: string;
  glow: (a: number) => string;
  keyAlpha: (a: number) => string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** OKLCH → sRGB [0..255]. */
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
  return [Math.round(clamp01(gamma(r)) * 255), Math.round(clamp01(gamma(g)) * 255), Math.round(clamp01(gamma(bl)) * 255)];
}

export function rgbToHue(r: number, g: number, b: number): { L: number; hue: number } {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
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

/** Hues 245–340° read as generic purple/indigo/magenta — remap into cyan or amber. */
export function remapHue(h: number): number {
  const n = ((h % 360) + 360) % 360;
  if (n >= 245 && n <= 340) {
    return n < 292 ? 185 + ((n - 245) / 47) * 45 : 22 + ((n - 292) / 48) * 48;
  }
  return n;
}

const css = (c: [number, number, number], a = 1) => (a >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`);

export function makePalette(rawHue: number): Palette {
  const hue = remapHue(rawHue);
  const key = oklchToRgb(0.74, 0.15, hue);
  const deep = oklchToRgb(0.28, 0.08, hue);
  const counter = oklchToRgb(0.8, 0.12, remapHue(hue + 150));
  return {
    hue,
    key: css(key),
    deep: css(deep),
    counter: css(counter),
    glow: (a) => css(key, a),
    keyAlpha: (a) => css(key, a),
  };
}
