/**
 * Deterministic FNV-1a 32-bit Seeded Swiss-Grid Architectural Micro-Emblem Generator.
 * Pure TypeScript (zero DOM dependency; Node/Vitest & React JSX safe).
 */

import { oklchToRgb, remapHue } from './color';
import { mulberry32 } from './prng';

export interface EmblemShape {
  tag: 'rect' | 'circle' | 'line' | 'path' | 'polygon';
  attrs: Record<string, string | number>;
}

export interface SwissEmblemOptions {
  size?: number;
  accent?: string;
  hue?: number;
  className?: string;
  ariaLabel?: string;
}

export interface EmblemSpec {
  hash: number;
  hashHex: string;
  slug: string;
  archetype: number;
  pxSize: number;
  accent: string;
  className: string;
  transform: string;
  frameShapes: EmblemShape[];
  innerShapes: EmblemShape[];
  ariaLabel: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_ENCODER = new TextEncoder();

// Strictly non-purple Braun / TE industrial accents
const HARDWARE_ACCENTS = [
  '#FF4F00', // International Signal Orange
  '#10B981', // Phosphor Emerald
  '#F59E0B', // Tungsten Amber
  '#06B6D4', // Volt Cyan
] as const;

/** Computes unsigned 32-bit FNV-1a hash of a UTF-8 string. */
export function fnv1a32(str: string): number {
  const bytes = TEXT_ENCODER.encode(String(str ?? ''));
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function sanitizeColor(value: string | undefined, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  if (/^(currentColor|none)$/i.test(raw)) return raw;
  if (/^var\(--[a-z0-9-]+(?:\s*,\s*#[0-9a-fA-F]{3,8})?\)$/i.test(raw)) return raw;
  return fallback;
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function escapeXmlAttr(value: string | number): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function el(tag: EmblemShape['tag'], attrs: Record<string, string | number>): EmblemShape {
  return { tag, attrs };
}

function buildArchetypeShapes(archetype: number, rand: () => number, accent: string): EmblemShape[] {
  const shapes: EmblemShape[] = [];
  const strokeMain = 'currentColor';

  // Subtle Swiss datum ticks on the 48x48 architectural grid.
  const gridMode = Math.floor(rand() * 3);
  if (gridMode === 0) {
    shapes.push(
      el('line', { x1: 24, y1: 6, x2: 24, y2: 42, stroke: strokeMain, 'stroke-opacity': '0.12', 'stroke-width': '0.75' }),
      el('line', { x1: 6, y1: 24, x2: 42, y2: 24, stroke: strokeMain, 'stroke-opacity': '0.12', 'stroke-width': '0.75' }),
    );
  } else if (gridMode === 1) {
    shapes.push(
      el('rect', {
        x: 10,
        y: 10,
        width: 28,
        height: 28,
        fill: 'none',
        stroke: strokeMain,
        'stroke-opacity': '0.12',
        'stroke-width': '0.75',
        'stroke-dasharray': '2 2',
      }),
    );
  } else {
    shapes.push(
      el('line', { x1: 10, y1: 38, x2: 38, y2: 10, stroke: strokeMain, 'stroke-opacity': '0.12', 'stroke-width': '0.75' }),
    );
  }

  switch (archetype) {
    case 0: {
      // Cantilever Monolith
      const w1 = 16 + Math.floor(rand() * 3) * 4;
      const h2 = 12 + Math.floor(rand() * 3) * 4;
      shapes.push(
        el('rect', { x: 10, y: 11, width: w1, height: 10, fill: strokeMain, 'fill-opacity': '0.12', stroke: strokeMain, 'stroke-width': '1.5' }),
        el('rect', { x: 14, y: 21, width: 24, height: h2, fill: 'none', stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 10, y1: 37, x2: 38, y2: 37, stroke: strokeMain, 'stroke-width': '1.5', 'stroke-linecap': 'square' }),
        el('rect', { x: 32, y: 11, width: 6, height: 6, fill: accent }),
      );
      break;
    }
    case 1: {
      // Telemetry Reticle
      const rInner = 5 + Math.floor(rand() * 2) * 2;
      const rOuter = 13 + Math.floor(rand() * 2) * 2;
      shapes.push(
        el('circle', { cx: 24, cy: 24, r: rOuter, fill: 'none', stroke: strokeMain, 'stroke-width': '1.5' }),
        el('circle', { cx: 24, cy: 24, r: rInner, fill: strokeMain, 'fill-opacity': '0.14', stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 24, y1: 6, x2: 24, y2: 13, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 24, y1: 35, x2: 24, y2: 42, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 6, y1: 24, x2: 13, y2: 24, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 35, y1: 24, x2: 42, y2: 24, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('circle', { cx: 24, cy: 24, r: '2.3', fill: accent }),
      );
      break;
    }
    case 2: {
      // Swiss 3x3 Matrix
      const accentCell = Math.floor(rand() * 9);
      for (let idx = 0; idx < 9; idx++) {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        const x = 10 + c * 10;
        const y = 10 + r * 10;
        if (idx === accentCell) {
          shapes.push(el('rect', { x, y, width: 8, height: 8, fill: accent }));
        } else {
          const state = rand();
          if (state > 0.52) {
            shapes.push(el('rect', { x, y, width: 8, height: 8, fill: strokeMain, 'fill-opacity': '0.16', stroke: strokeMain, 'stroke-width': '1.5' }));
          } else if (state > 0.22) {
            shapes.push(el('rect', { x: x + 1, y: y + 1, width: 6, height: 6, fill: 'none', stroke: strokeMain, 'stroke-width': '1.5' }));
          }
        }
      }
      break;
    }
    case 3: {
      // Orthogonal Bus
      const midY = 18 + Math.floor(rand() * 3) * 4;
      const midX = 20 + Math.floor(rand() * 3) * 4;
      shapes.push(
        el('path', {
          d: `M10 12 H${midX} V${midY} H38`,
          fill: 'none',
          stroke: strokeMain,
          'stroke-width': '1.5',
          'stroke-linecap': 'square',
          'stroke-linejoin': 'miter',
        }),
        el('path', {
          d: `M10 36 V${midY + 6} H${midX + 4} V36 H38`,
          fill: 'none',
          stroke: strokeMain,
          'stroke-width': '1.5',
          'stroke-linecap': 'square',
          'stroke-linejoin': 'miter',
        }),
        el('rect', { x: 9, y: 9, width: 5, height: 5, fill: 'none', stroke: strokeMain, 'stroke-width': '1.5' }),
        el('circle', { cx: 36, cy: midY, r: '2.5', fill: accent }),
      );
      break;
    }
    case 4: {
      // Isometric Chassis
      const inset = 9 + Math.floor(rand() * 2) * 3;
      const points = `24,${inset} ${48 - inset},17 ${48 - inset},31 24,${48 - inset} ${inset},31 ${inset},17`;
      shapes.push(
        el('polygon', {
          points,
          fill: strokeMain,
          'fill-opacity': '0.1',
          stroke: strokeMain,
          'stroke-width': '1.5',
          'stroke-linejoin': 'miter',
        }),
        el('path', {
          d: `M${inset} 17 L24 24 L${48 - inset} 17 M24 24 V${48 - inset}`,
          fill: 'none',
          stroke: strokeMain,
          'stroke-width': '1.5',
        }),
        el('circle', { cx: 24, cy: 24, r: '2.4', fill: accent }),
      );
      break;
    }
    case 5: {
      // Vernier Dial
      const angle = (Math.floor(rand() * 8) * Math.PI) / 4;
      const tx = (24 + Math.cos(angle) * 11).toFixed(2);
      const ty = (24 + Math.sin(angle) * 11).toFixed(2);
      shapes.push(
        el('circle', { cx: 24, cy: 24, r: 14, fill: 'none', stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 24, y1: 10, x2: 24, y2: 14, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 24, y1: 34, x2: 24, y2: 38, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 10, y1: 24, x2: 14, y2: 24, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 34, y1: 24, x2: 38, y2: 24, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('line', { x1: 24, y1: 24, x2: tx, y2: ty, stroke: accent, 'stroke-width': '1.6', 'stroke-linecap': 'square' }),
        el('circle', { cx: 24, cy: 24, r: '2.4', fill: strokeMain }),
      );
      break;
    }
    case 6: {
      // Waveguide Array
      const accentCol = Math.floor(rand() * 4);
      for (let i = 0; i < 4; i++) {
        const x = 10 + i * 7.5;
        const h = 10 + Math.floor(rand() * 5) * 4;
        const y = 37 - h;
        shapes.push(
          el('rect', {
            x: x.toFixed(1),
            y,
            width: 5,
            height: h,
            fill: i === accentCol ? accent : strokeMain,
            'fill-opacity': i === accentCol ? '1' : '0.14',
            stroke: i === accentCol ? accent : strokeMain,
            'stroke-width': '1.5',
          }),
        );
      }
      shapes.push(el('line', { x1: 9, y1: 37, x2: 39, y2: 37, stroke: strokeMain, 'stroke-width': '1.5' }));
      break;
    }
    default: {
      // Split Aperture
      const flip = rand() > 0.5;
      const d = flip ? 'M11 35 L22 13 H37 L26 35 Z' : 'M11 13 H26 L37 35 H22 Z';
      shapes.push(
        el('path', {
          d,
          fill: strokeMain,
          'fill-opacity': '0.12',
          stroke: strokeMain,
          'stroke-width': '1.5',
          'stroke-linejoin': 'miter',
        }),
        el('line', { x1: 11, y1: 24, x2: 37, y2: 24, stroke: strokeMain, 'stroke-width': '1.5' }),
        el('rect', { x: flip ? 11 : 32, y: 12, width: 5, height: 5, fill: accent }),
      );
      break;
    }
  }

  return shapes;
}

/** Builds a deterministic Swiss-grid emblem specification from a repository slug. */
export function buildEmblemSpec(slug: string, options: SwissEmblemOptions = {}): EmblemSpec {
  const normalizedSlug = String(slug ?? 'krunked').trim() || 'krunked';
  const hash = fnv1a32(normalizedSlug);
  const secondaryHash = fnv1a32(`${normalizedSlug}::swiss-grid`);
  const rand = mulberry32(hash ^ secondaryHash);

  const pxSize =
    typeof options.size === 'number' && Number.isFinite(options.size) && options.size > 0
      ? Math.round(options.size)
      : 40;
  const className = String(options.className || 'swiss-emblem').replace(/[^a-zA-Z0-9_\-\s]/g, '');

  const hueAccent =
    typeof options.hue === 'number' && Number.isFinite(options.hue)
      ? rgbToHex(oklchToRgb(0.64, 0.16, remapHue(options.hue)))
      : HARDWARE_ACCENTS[hash % HARDWARE_ACCENTS.length]!;
  const accent = sanitizeColor(options.accent, hueAccent);

  const archetype = hash % 8;
  const rotation = ((hash >>> 8) % 4) * 90;
  const mirrorX = ((hash >>> 12) & 1) === 1;

  const frameShapes: EmblemShape[] = [
    el('rect', {
      x: 2,
      y: 2,
      width: 44,
      height: 44,
      rx: 4,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-opacity': '0.18',
      'stroke-width': '1',
    }),
    el('path', {
      d: 'M2 8 V2 H8 M40 2 H46 V8 M46 40 V46 H40 M8 46 H2 V40',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-opacity': '0.42',
      'stroke-width': '1',
    }),
  ];

  const innerShapes = buildArchetypeShapes(archetype, rand, accent);
  const transforms: string[] = [];
  if (rotation !== 0) transforms.push(`rotate(${rotation} 24 24)`);
  if (mirrorX) transforms.push('translate(48 0) scale(-1 1)');

  return {
    hash,
    hashHex: hash.toString(16).padStart(8, '0'),
    slug: normalizedSlug,
    archetype,
    pxSize,
    accent,
    className,
    transform: transforms.join(' '),
    frameShapes,
    innerShapes,
    ariaLabel: String(options.ariaLabel || `${normalizedSlug} geometric emblem`),
  };
}

function serializeShape(shape: EmblemShape): string {
  const attrs = Object.entries(shape.attrs)
    .map(([k, v]) => `${k}="${escapeXmlAttr(v)}"`)
    .join(' ');
  return `<${shape.tag} ${attrs}/>`;
}

/** Generates a deterministic Swiss-grid geometric SVG string for a repository slug. */
export function renderSwissEmblemSvg(slug: string, options: SwissEmblemOptions = {}): string {
  const spec = buildEmblemSpec(slug, options);
  const frameXml = spec.frameShapes.map(serializeShape).join('');
  const innerXml = spec.innerShapes.map(serializeShape).join('');
  const groupOpen = spec.transform ? `<g transform="${escapeXmlAttr(spec.transform)}">` : '<g>';

  return [
    `<svg xmlns="${SVG_NS}" class="${escapeXmlAttr(spec.className)}"`,
    ` viewBox="0 0 48 48" width="${spec.pxSize}" height="${spec.pxSize}"`,
    ` role="img" aria-label="${escapeXmlAttr(spec.ariaLabel)}"`,
    ` data-emblem-hash="${spec.hashHex}" data-emblem-archetype="${spec.archetype}">`,
    frameXml,
    groupOpen,
    innerXml,
    `</g></svg>`,
  ].join('');
}
