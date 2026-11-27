import { makePalette, nonPurpleRgb, remapHue, type ArtTheme } from './color';
import { mulberry32, range } from './prng';
import { drawTopo } from './styles/topo';
import type { Ctx2D } from './styles/types';
import { fnv1a32 } from './swissEmblem';
import type { Category } from '../types/project';

export const AUTO_WORLD_ARCHETYPES = [
  'summit',
  'abyss',
  'citadel',
  'catacomb',
  'diamond',
  'circuit',
  'arena',
  'velocity',
  'wasteland',
  'runic',
  'biocell',
  'aero',
  'cartograph',
  'deck',
] as const;

export type AutoWorldArchetype = (typeof AUTO_WORLD_ARCHETYPES)[number];

export interface AutoWorldSelectionInput {
  slug: string;
  displayName?: string;
  tagline?: string;
  category?: Category;
  topics?: readonly string[];
  seed: number;
}

export interface AutoWorldRenderOpts {
  archetype: AutoWorldArchetype;
  slug: string;
  seed: number;
  hue: number;
  w: number;
  h: number;
  dpr?: number;
  t?: number;
  theme?: ArtTheme;
}

interface AutoCtx {
  ctx: Ctx2D;
  w: number;
  h: number;
  seed: number;
  hue: number;
  counterHue: number;
  analogHue: number;
  t: number;
  theme: ArtTheme;
  isLight: boolean;
}

const PI = Math.PI;
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function tone(L: number, C: number, rawHue: number, a = 1): string {
  const [r, g, b] = nonPurpleRgb(L, C, rawHue);
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(clamp(a, 0, 1).toFixed(4))})`;
}

function pigment(isLight: boolean, rawHue: number, a = 1, boost = 0): string {
  const L = isLight ? clamp(0.42 + boost * 0.12, 0.24, 0.68) : clamp(0.76 + boost * 0.14, 0.34, 0.94);
  const C = isLight ? clamp(0.165 + Math.abs(boost) * 0.02, 0.09, 0.2) : clamp(0.174 + Math.abs(boost) * 0.02, 0.1, 0.21);
  return tone(L, C, rawHue, a);
}

function lime(isLight: boolean, a = 1): string {
  const [r, g, b]: [number, number, number] = isLight ? [56, 98, 0] : [210, 255, 40];
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(clamp(a, 0, 1).toFixed(4))})`;
}

function ink(isLight: boolean, a = 1): string {
  return isLight
    ? a >= 1
      ? '#0A0A0B'
      : `rgba(10,10,11,${Number(clamp(a, 0, 1).toFixed(4))})`
    : a >= 1
      ? '#F5F3EC'
      : `rgba(245,243,236,${Number(clamp(a, 0, 1).toFixed(4))})`;
}

function fillBackdrop(ctx: Ctx2D, w: number, h: number, isLight: boolean, h0: number, h1?: number) {
  if (isLight) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#F8F6F0');
    g.addColorStop(0.55, '#F5F3EC');
    g.addColorStop(1, tone(0.92, 0.028, h1 ?? h0, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = ctx.createRadialGradient(w * 0.58, h * 0.36, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.94);
    g.addColorStop(0, tone(0.17, 0.055, h0, 1));
    g.addColorStop(0.52, tone(0.088, 0.028, h1 ?? h0, 1));
    g.addColorStop(1, '#030305');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawBloom(ctx: Ctx2D, x: number, y: number, r: number, color0: string, colorMid?: string) {
  if (r <= 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color0);
  if (colorMid) g.addColorStop(0.45, colorMid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function drawHairGrid(ctx: Ctx2D, w: number, h: number, isLight: boolean, pitch: number, alpha?: number) {
  const a = alpha ?? (isLight ? 0.055 : 0.044);
  ctx.strokeStyle = ink(isLight, a);
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
}

// ============================================================================
// Semantic + Deterministic Multi-Archetype Selection
// ============================================================================
const ARCHETYPE_RULES: ReadonlyArray<readonly [RegExp, AutoWorldArchetype]> = [
  [/\b(cards?|deck|deckbuilder|poker|tarot|solitaire|blackjack|dice|chess|mahjong)\b/i, 'deck'],
  [/\b(kartz?|karts?|rac(e|ing|er)|drift|turbo|rally|speedway|motorsport)\b/i, 'velocity'],
  [/\b(skybreaker|dogfight(er)?|starfighter|aircraft|fighter|aero|flight|wing|glide|drone|fpv)\b/i, 'aero'],
  [/\b(circuit|pcb|microchip|chips?|hookshot|silicon|grapple|cyber|logic|kernel)\b/i, 'circuit'],
  [/\b(lumia|diamond|falling[- ]?block|tetris|prism|gem|crystal|optic|laser|spectrum|synesthe)/i, 'diamond'],
  [/\b(cells?|stem\s*cells?|biology|biotech|bioluminesc\w*|microbes?|colony|spores?|dna|organisms?|flora|slime|mutat\w*)\b/i, 'biocell'],
  [/\b(dweller|gothic|catacomb|matchstick|lantern|candle|crypt|fairy[- ]?tale|ghost|haunt|tomb)\b/i, 'catacomb'],
  [/\b(well|abyss|descent|gunboot|cavern|cave|mine|shaft|subterranean|underworld|chasm)\b/i, 'abyss'],
  [/\b(summit|alpine|mountain|peaks?|cliff|ridge|climb|rope[- ]?tether|penguin|crag|fred)\b/i, 'summit'],
  [/\b(tower|spire|citadel|castle|fortress|keep|bastion|speed[- ]?platformer|rampart)\b/i, 'citadel'],
  [/\b(norse|rune|runic|valkyrie|viking|twin[- ]?stick|shockwave|krunkedfall|fall|ragnarok)\b/i, 'runic'],
  [/\b(throne|wasteland|crown|ruin|hades|relic|desert|shatter)\b/i, 'wasteland'],
  [/\b(arena|tato|krunkedtato|shooter|horde|survivor|bullet[- ]?heaven|turret|brawler|gladiator)\b/i, 'arena'],
  [/\b(quest|biomes?|metroidvania|atlas|realm|island|overworld|explore|expedition|adventure|map)\b/i, 'cartograph'],
];

/**
 * Selects a visually rich, domain-aligned procedural world archetype for any uncurated repository.
 * Prioritizes semantic signals from slug/title/tagline/topics, then deterministically fans out
 * across all 14 archetypes via FNV-1a + seed mixing so opaque future repo names stay diverse.
 */
export function selectAutoWorldArchetype(input: AutoWorldSelectionInput): AutoWorldArchetype {
  const hay = [input.slug, input.displayName ?? '', input.tagline ?? '', ...(input.topics ?? [])]
    .join(' ')
    .replace(/[-_]+/g, ' ');

  for (const [re, archetype] of ARCHETYPE_RULES) {
    if (re.test(hay)) return archetype;
  }

  const mix = (fnv1a32(input.slug.toLowerCase()) ^ (input.seed >>> 0)) >>> 0;
  return AUTO_WORLD_ARCHETYPES[mix % AUTO_WORLD_ARCHETYPES.length]!;
}

// ============================================================================
// 1. summit — Alpine Twin-Peak Crest & Rope-Tether Beacon
// ============================================================================
function drawSummit({ ctx, w, h, seed, hue, counterHue, analogHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, analogHue);
  const rng = mulberry32(seed ^ 0x50a177);
  const minD = Math.min(w, h);

  ctx.save();
  // Crisp high-altitude star / snow pips
  for (let i = 0; i < 42; i++) {
    const sx = rng() * w;
    const sy = rng() * h * 0.56;
    const tw = 0.35 + 0.65 * Math.sin(t * 2 + i * 1.9);
    ctx.fillStyle = i % 4 === 0 ? pigment(isLight, hue, 0.65 * tw) : ink(isLight, (isLight ? 0.2 : 0.45) * tw);
    const sz = i % 6 === 0 ? 2.2 : 1.3;
    ctx.fillRect(sx, sy, sz, sz);
  }

  // Sweeping alpine wind-stream ribbons
  for (let b = 0; b < 3; b++) {
    const y0 = h * (0.16 + b * 0.11);
    ctx.beginPath();
    for (let s = 0; s <= 40; s++) {
      const u = s / 40;
      const x = u * w;
      const y = y0 + Math.sin(u * 6.2 + t * 0.9 + b * 1.4) * h * 0.045;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = b === 0 ? pigment(isLight, counterHue, 0.38) : pigment(isLight, hue, 0.28);
    ctx.lineWidth = b === 0 ? 1.5 : 1;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -t * (18 + b * 7);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Atmospheric summit sun/moon halo behind twin peaks
  const sunX = w * range(rng, 0.54, 0.7);
  const sunY = h * range(rng, 0.26, 0.36);
  drawBloom(ctx, sunX, sunY, minD * 0.62, pigment(isLight, hue, isLight ? 0.2 : 0.34), pigment(isLight, counterHue, 0.1));
  ctx.strokeStyle = pigment(isLight, hue, isLight ? 0.42 : 0.48);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sunX, sunY, minD * 0.16, 0, TAU);
  ctx.stroke();

  // Back jagged alpine silhouette
  const drawRange = (baseY: number, amp: number, freq: number, fill: string, rim: string, phase: number) => {
    const pts: Array<[number, number]> = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const ridge =
        Math.abs(Math.sin(u * PI * freq + phase)) * 0.65 +
        Math.abs(Math.cos(u * PI * (freq * 1.8) - phase * 0.6)) * 0.35;
      const y = baseY - ridge * amp;
      pts.push([x, y]);
    }
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]!;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  drawRange(
    h * 0.74,
    h * 0.34,
    2.2,
    isLight ? tone(0.84, 0.04, hue, 0.85) : tone(0.14, 0.045, hue, 0.9),
    pigment(isLight, hue, 0.42),
    range(rng, 0.2, 1.4),
  );

  // Twin hero alpine summits with faceted lit/shadow snow slopes
  const leftPeakX = w * range(rng, 0.3, 0.38);
  const leftPeakY = h * range(rng, 0.34, 0.42);
  const rightPeakX = w * range(rng, 0.65, 0.74);
  const rightPeakY = h * range(rng, 0.22, 0.31);

  const drawPeak = (px: number, py: number, span: number, pHue: number) => {
    // Lit left face
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - span, h);
    ctx.lineTo(px + span * 0.08, h);
    ctx.closePath();
    ctx.fillStyle = isLight ? tone(0.88, 0.045, pHue, 0.96) : tone(0.22, 0.07, pHue, 0.95);
    ctx.fill();

    // Shadow right face
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + span * 0.08, h);
    ctx.lineTo(px + span * 1.15, h);
    ctx.closePath();
    ctx.fillStyle = isLight ? tone(0.76, 0.055, pHue, 0.95) : '#06080D';
    ctx.fill();

    // Crisp snow-cap chevrons
    const capH = (h - py) * 0.26;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - span * 0.26, py + capH);
    ctx.lineTo(px - span * 0.08, py + capH * 0.78);
    ctx.lineTo(px + span * 0.06, py + capH * 1.05);
    ctx.lineTo(px + span * 0.24, py + capH * 0.86);
    ctx.closePath();
    ctx.fillStyle = isLight ? '#FFFFFF' : tone(0.92, 0.04, pHue, 0.92);
    ctx.fill();

    // Ridge highlight stroke
    ctx.strokeStyle = pigment(isLight, pHue, 0.92);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px - span, h);
    ctx.lineTo(px, py);
    ctx.lineTo(px + span * 1.15, h);
    ctx.stroke();
  };

  drawPeak(leftPeakX, leftPeakY, w * 0.34, counterHue);
  drawPeak(rightPeakX, rightPeakY, w * 0.38, hue);

  // Taut climbing rope tether catenary linking the twin peaks with piton beacons
  const sag = h * 0.14 + Math.sin(t * 2.1) * 4;
  const midX = (leftPeakX + rightPeakX) * 0.5;
  const midY = (leftPeakY + rightPeakY) * 0.5 + sag;
  ctx.strokeStyle = lime(isLight, 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftPeakX, leftPeakY);
  ctx.quadraticCurveTo(midX, midY, rightPeakX, rightPeakY);
  ctx.stroke();

  // Twin climber / piton beacons along tether
  for (const u of [0.28, 0.72]) {
    const bx = (1 - u) * (1 - u) * leftPeakX + 2 * (1 - u) * u * midX + u * u * rightPeakX;
    const by = (1 - u) * (1 - u) * leftPeakY + 2 * (1 - u) * u * midY + u * u * rightPeakY;
    const col = u < 0.5 ? pigment(isLight, 24, 1) : pigment(isLight, 154, 1);
    drawBloom(ctx, bx, by, 14, col);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ink(isLight, 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Summit beacon pulse
  const pulse = (t * 0.6) % 1;
  ctx.strokeStyle = lime(isLight, (1 - pulse) * 0.85);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(rightPeakX, rightPeakY, 5 + pulse * 20, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = lime(isLight, 1);
  ctx.beginPath();
  ctx.arc(rightPeakX, rightPeakY, 3.2, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ============================================================================
// 2. abyss — Deep Vertical Shaft & Glowing Mineral Strata
// ============================================================================
function drawAbyss({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, counterHue);
  const rng = mulberry32(seed ^ 0xa8755);
  const cx = w * range(rng, 0.5, 0.58);

  ctx.save();
  // Central vertical descent glow shaft
  const shaftW = w * 0.34;
  const shaftGrad = ctx.createLinearGradient(cx - shaftW, 0, cx + shaftW, 0);
  shaftGrad.addColorStop(0, 'rgba(0,0,0,0)');
  shaftGrad.addColorStop(0.5, pigment(isLight, hue, isLight ? 0.2 : 0.28));
  shaftGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shaftGrad;
  ctx.fillRect(cx - shaftW, 0, shaftW * 2, h);

  // Receding rectangular shaft depth frames
  const frames = 7;
  const scroll = (t * 0.45) % 1;
  for (let i = 0; i < frames; i++) {
    const f = ((i + scroll) / frames);
    const scale = 0.22 + f * 0.88;
    const fw = w * 0.52 * scale;
    const fh = h * 0.95 * scale;
    ctx.strokeStyle = pigment(isLight, i % 2 === 0 ? hue : counterHue, (0.14 + f * 0.44) * (isLight ? 0.9 : 1));
    ctx.lineWidth = 0.8 + f * 0.9;
    ctx.strokeRect(cx - fw * 0.5, h * 0.5 - fh * 0.5, fw, fh);
  }

  // Jagged stepped subterranean chasm walls flanking left & right
  const drawWall = (side: -1 | 1) => {
    const tiers = 10;
    const stepH = h / tiers;
    ctx.beginPath();
    ctx.moveTo(side < 0 ? 0 : w, 0);
    for (let i = 0; i <= tiers; i++) {
      const y = i * stepH;
      const inset = w * (0.2 + 0.14 * Math.sin(i * 1.15 + seed * 0.02 + side) + (i % 3 === 0 ? 0.05 : 0));
      const x = side < 0 ? inset : w - inset;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(side < 0 ? 0 : w, h);
    ctx.closePath();
    ctx.fillStyle = isLight ? tone(0.84, 0.045, hue, 0.94) : tone(0.11, 0.04, hue, 0.96);
    ctx.fill();
    ctx.strokeStyle = pigment(isLight, hue, 0.72);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Glowing horizontal mineral ledges protruding into shaft
    for (let i = 1; i < tiers; i += 2) {
      const y = i * stepH + ((t * 22) % (stepH * 2)) - stepH;
      const ledgeW = w * range(rng, 0.07, 0.15);
      const lx = side < 0 ? w * 0.24 : w * 0.76 - ledgeW;
      ctx.fillStyle = i % 4 === 1 ? pigment(isLight, counterHue, 0.88) : pigment(isLight, hue, 0.78);
      ctx.fillRect(lx, y, ledgeW, 4);
      ctx.fillStyle = lime(isLight, 0.85);
      ctx.fillRect(lx, y, ledgeW, 1.4);
    }
  };
  drawWall(-1);
  drawWall(1);

  // Descending luminous diver / recoil plasma trail down center shaft
  const diverY = h * 0.42 + Math.sin(t * 2.4) * h * 0.05;
  drawBloom(ctx, cx, diverY, Math.min(w, h) * 0.28, pigment(isLight, counterHue, 0.52), lime(isLight, 0.16));

  // Recoil blast beam upward + falling bolts downward
  const beam = ctx.createLinearGradient(cx, diverY, cx, h);
  beam.addColorStop(0, lime(isLight, 0.95));
  beam.addColorStop(0.55, pigment(isLight, counterHue, 0.55));
  beam.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(cx - 2.5, diverY, 5, h - diverY);

  // Crisp diver diamond core + concentric muzzle ring
  ctx.strokeStyle = lime(isLight, 0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, diverY, 13, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = ink(isLight, 0.96);
  ctx.beginPath();
  ctx.moveTo(cx, diverY - 7);
  ctx.lineTo(cx + 6, diverY);
  ctx.lineTo(cx, diverY + 7);
  ctx.lineTo(cx - 6, diverY);
  ctx.closePath();
  ctx.fill();

  // Rising spark motes
  for (let i = 0; i < 18; i++) {
    const px = cx + (rng() - 0.5) * w * 0.3;
    const py = ((rng() * h - t * (36 + (i % 4) * 14)) % h + h) % h;
    ctx.fillStyle = i % 3 === 0 ? lime(isLight, 0.88) : pigment(isLight, counterHue, 0.75);
    ctx.fillRect(px, py, 2.2, 5.5);
  }

  // Right-edge depth altimeter scale
  if (w >= 150) {
    ctx.strokeStyle = ink(isLight, 0.34);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 18, idx = 0; y < h - 18; y += 10, idx++) {
      const len = idx % 4 === 0 ? 11 : 4.5;
      ctx.moveTo(w - 12 - len, y + 0.5);
      ctx.lineTo(w - 12, y + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================================
// 3. citadel — Kinetic Isometric Spire & Neon Portal Arch
// ============================================================================
function drawCitadel({ ctx, w, h, seed, hue, counterHue, analogHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, analogHue);
  const rng = mulberry32(seed ^ 0xc17ade);
  const minD = Math.min(w, h);
  const cx = w * range(rng, 0.54, 0.64);

  ctx.save();
  drawHairGrid(ctx, w, h, isLight, Math.max(20, Math.round(minD / 9)));

  // Sweeping spotlight cones angling upward behind citadel
  for (let i = 0; i < 2; i++) {
    const ang = -PI * 0.5 + (i === 0 ? -0.34 : 0.28) + Math.sin(t * 0.7 + i * 2) * 0.1;
    ctx.save();
    ctx.translate(cx + (i === 0 ? -w * 0.14 : w * 0.14), h);
    ctx.rotate(ang);
    const cone = ctx.createLinearGradient(0, 0, Math.max(w, h), 0);
    cone.addColorStop(0, pigment(isLight, i === 0 ? hue : counterHue, isLight ? 0.18 : 0.24));
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.max(w, h), -minD * 0.2);
    ctx.lineTo(Math.max(w, h), minD * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Stepped brutalist spire monolith tiers
  const tiers = [
    { tw: w * 0.36, topY: h * 0.66, th: h * 0.36 },
    { tw: w * 0.26, topY: h * 0.44, th: h * 0.24 },
    { tw: w * 0.17, topY: h * 0.26, th: h * 0.2 },
    { tw: w * 0.08, topY: h * 0.14, th: h * 0.13 },
  ];

  for (let i = 0; i < tiers.length; i++) {
    const tr = tiers[i]!;
    const x0 = cx - tr.tw * 0.5;
    // Main tier body
    ctx.fillStyle = isLight ? tone(0.86 - i * 0.04, 0.045, hue, 0.96) : tone(0.15 + i * 0.025, 0.05, hue, 0.96);
    ctx.fillRect(x0, tr.topY, tr.tw, tr.th);

    // Shadow bevel right third
    ctx.fillStyle = isLight ? 'rgba(10,10,11,0.1)' : 'rgba(0,0,0,0.42)';
    ctx.fillRect(cx + tr.tw * 0.16, tr.topY, tr.tw * 0.34, tr.th);

    // Crisp rim outline
    ctx.strokeStyle = pigment(isLight, hue, 0.78);
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x0, tr.topY, tr.tw, tr.th);

    // Crenellated battlements along tier crown
    const merlons = Math.max(3, Math.floor(tr.tw / 14));
    const mw = tr.tw / (merlons * 2 - 1);
    ctx.fillStyle = pigment(isLight, hue, isLight ? 0.62 : 0.75);
    for (let m = 0; m < merlons; m++) {
      ctx.fillRect(x0 + m * mw * 2, tr.topY - 5, mw, 5);
    }

    // Illuminated lancet window slits
    if (i > 0 && i < 3) {
      const slits = 3;
      for (let s = 0; s < slits; s++) {
        const sx = x0 + tr.tw * (0.24 + s * 0.26);
        ctx.fillStyle = s === 1 ? lime(isLight, 0.92) : pigment(isLight, counterHue, 0.88);
        ctx.fillRect(sx - 2, tr.topY + tr.th * 0.28, 4, tr.th * 0.42);
      }
    }
  }

  // Spire antenna + pulsing signal crown
  ctx.strokeStyle = lime(isLight, 0.92);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.14);
  ctx.lineTo(cx, h * 0.05);
  ctx.stroke();
  drawBloom(ctx, cx, h * 0.06, 20, lime(isLight, 0.65));

  // Glowing central portal arch at citadel base
  const archW = w * 0.12;
  const archH = h * 0.24;
  const archY = h * 0.98;
  drawBloom(ctx, cx, archY - archH * 0.45, archW * 1.9, pigment(isLight, counterHue, 0.5), lime(isLight, 0.16));
  ctx.beginPath();
  ctx.moveTo(cx - archW * 0.5, archY);
  ctx.lineTo(cx - archW * 0.5, archY - archH * 0.55);
  ctx.arc(cx, archY - archH * 0.55, archW * 0.5, PI, 0, false);
  ctx.lineTo(cx + archW * 0.5, archY);
  ctx.closePath();
  ctx.fillStyle = isLight ? pigment(true, counterHue, 0.85) : tone(0.84, 0.18, counterHue, 0.92);
  ctx.fill();
  ctx.strokeStyle = lime(isLight, 0.95);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Diagonal kinetic rush chevrons flanking the tower
  const shift = (t * 24) % 18;
  ctx.strokeStyle = lime(isLight, 0.72);
  ctx.lineWidth = 1.6;
  for (let c = 0; c < 4; c++) {
    const bx = w * 0.14 + c * 16 + shift;
    const by = h * 0.52 - c * 11;
    ctx.beginPath();
    ctx.moveTo(bx - 6, by - 7);
    ctx.lineTo(bx + 2, by);
    ctx.lineTo(bx - 6, by + 7);
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================================
// 4. catacomb — Gothic Matchstick Lantern & Vaulted Arches
// ============================================================================
function drawCatacomb({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  const warmHue = 44;
  fillBackdrop(ctx, w, h, isLight, hue, warmHue);
  const rng = mulberry32(seed ^ 0xca7ac0);
  const minD = Math.min(w, h);
  const cx = w * range(rng, 0.52, 0.6);
  const cy = h * 0.56;

  ctx.save();
  // Warm flickering matchstick / lantern glow radiating through gothic vaults
  const flicker = 1 + Math.sin(t * 6.5) * 0.04 + Math.cos(t * 11.2) * 0.025;
  drawBloom(
    ctx,
    cx,
    cy,
    minD * 0.72 * flicker,
    isLight ? pigment(true, warmHue, 0.28) : tone(0.76, 0.19, warmHue, 0.44),
    isLight ? pigment(true, 26, 0.1) : tone(0.56, 0.18, 26, 0.16),
  );

  // Nested receding pointed gothic cathedral arches
  for (let i = 0; i < 6; i++) {
    const frac = 0.28 + i * 0.16;
    const aw = w * 0.44 * frac;
    const ah = h * 0.92 * frac;
    const baseY = h * 1.02;
    const springY = baseY - ah * 0.52;
    const apexY = baseY - ah;

    ctx.beginPath();
    ctx.moveTo(cx - aw, baseY);
    ctx.lineTo(cx - aw, springY);
    ctx.quadraticCurveTo(cx - aw * 0.86, apexY + ah * 0.12, cx, apexY);
    ctx.quadraticCurveTo(cx + aw * 0.86, apexY + ah * 0.12, cx + aw, springY);
    ctx.lineTo(cx + aw, baseY);
    ctx.strokeStyle =
      i === 1
        ? pigment(isLight, warmHue, 0.82)
        : pigment(isLight, i % 2 === 0 ? hue : counterHue, isLight ? 0.48 - i * 0.05 : 0.56 - i * 0.06);
    ctx.lineWidth = i === 1 ? 2 : 1.15;
    ctx.stroke();
  }

  // Filigree geometric rose-window tracery ring in upper vault
  const roseY = h * 0.29;
  const roseR = minD * 0.18;
  ctx.strokeStyle = pigment(isLight, warmHue, isLight ? 0.45 : 0.42);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, roseY, roseR, 0, TAU);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + t * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx, roseY);
    ctx.lineTo(cx + Math.cos(a) * roseR, roseY + Math.sin(a) * roseR);
    ctx.stroke();
  }

  // Sculpted brass hanging lantern / matchstick flame centerpiece
  ctx.strokeStyle = ink(isLight, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, cy - minD * 0.16);
  ctx.stroke();

  const lw = minD * 0.12;
  const lh = minD * 0.17;
  ctx.fillStyle = isLight ? 'rgba(255,252,242,0.88)' : 'rgba(12,10,8,0.82)';
  ctx.strokeStyle = pigment(isLight, warmHue, 0.95);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - lh * 0.92);
  ctx.lineTo(cx + lw, cy - lh * 0.35);
  ctx.lineTo(cx + lw * 0.74, cy + lh * 0.55);
  ctx.lineTo(cx - lw * 0.74, cy + lh * 0.55);
  ctx.lineTo(cx - lw, cy - lh * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner dancing flame teardrop
  const fh = lh * 0.48 * flicker;
  ctx.fillStyle = isLight ? pigment(true, 32, 0.96) : tone(0.92, 0.16, 62, 1);
  ctx.beginPath();
  ctx.moveTo(cx, cy - fh * 0.65);
  ctx.quadraticCurveTo(cx + lw * 0.38, cy + fh * 0.15, cx, cy + fh * 0.45);
  ctx.quadraticCurveTo(cx - lw * 0.38, cy + fh * 0.15, cx, cy - fh * 0.65);
  ctx.fill();

  // Drifting storybook ember & soot motes
  for (let i = 0; i < 28; i++) {
    const mx = rng() * w;
    const my = ((rng() * h - t * (10 + (i % 5) * 4)) % h + h) % h;
    const pulse = 0.3 + 0.7 * Math.sin(t * 2.8 + i * 1.7);
    ctx.fillStyle = i % 3 === 0 ? pigment(isLight, warmHue, 0.85 * pulse) : pigment(isLight, hue, 0.5 * pulse);
    ctx.beginPath();
    ctx.arc(mx, my, i % 4 === 0 ? 2.2 : 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ============================================================================
// 5. diamond — Synesthetic Diamond Matrix & Harmonic Pulse
// ============================================================================
function drawDiamond({ ctx, w, h, seed, hue, counterHue, analogHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, counterHue);
  const rng = mulberry32(seed ^ 0xd1a00d);
  const minD = Math.min(w, h);
  const paletteHues = [remapHue(hue), remapHue(counterHue), remapHue(analogHue), remapHue(hue + 72), 184, 52];

  ctx.save();
  // Harmonic concentric beat ripples behind diamond matrix
  const beatX = w * 0.56;
  const beatY = h * 0.48;
  for (let r = 0; r < 4; r++) {
    const rad = minD * (0.16 + ((r * 0.25 + t * 0.2) % 1) * 0.62);
    const alpha = (1 - rad / (minD * 0.82)) * (isLight ? 0.28 : 0.36);
    if (alpha > 0.02) {
      ctx.strokeStyle = pigment(isLight, paletteHues[r % paletteHues.length]!, alpha);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(beatX, beatY, rad, 0, TAU);
      ctx.stroke();
    }
  }

  // Staggered beveled pixel-diamond falling matrix
  const cell = clamp(Math.round(minD / 7.5), 18, 40);
  const cols = Math.ceil(w / cell) + 2;
  const rows = Math.ceil(h / (cell * 0.72)) + 2;
  const activeCol = Math.floor(cols * 0.56);
  const dropRow = Math.floor((t * 2.2) % Math.max(4, rows - 2));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = c * cell + (r % 2 === 1 ? cell * 0.5 : 0) - cell * 0.25;
      const dy = r * cell * 0.72;
      const v = rng();
      const stacked = r > rows * 0.48 + Math.sin(c * 0.9 + seed) * 1.4;
      const isFalling = (c === activeCol || c === activeCol + 1) && (r === dropRow || r === dropRow + 1);
      if (!stacked && !isFalling && v < 0.72) continue;

      const dHue = paletteHues[(c + r * 2 + Math.floor(v * 6)) % paletteHues.length]!;
      const rad = cell * (isFalling ? 0.46 : stacked ? 0.42 : 0.28);

      if (isFalling) {
        drawBloom(ctx, dx, dy, rad * 2.4, pigment(isLight, dHue, 0.55));
      }

      // Outer beveled diamond
      ctx.beginPath();
      ctx.moveTo(dx, dy - rad);
      ctx.lineTo(dx + rad, dy);
      ctx.lineTo(dx, dy + rad);
      ctx.lineTo(dx - rad, dy);
      ctx.closePath();

      ctx.fillStyle = isFalling
        ? pigment(isLight, dHue, 0.94, 0.2)
        : stacked
          ? pigment(isLight, dHue, isLight ? 0.52 : 0.42)
          : pigment(isLight, dHue, isLight ? 0.22 : 0.2);
      ctx.fill();

      // Upper-left specular facet triangle
      ctx.beginPath();
      ctx.moveTo(dx, dy - rad);
      ctx.lineTo(dx + rad, dy);
      ctx.lineTo(dx, dy);
      ctx.lineTo(dx - rad, dy);
      ctx.closePath();
      ctx.fillStyle = isLight ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.16)';
      ctx.fill();

      // Crisp inner diamond highlight
      ctx.strokeStyle = isFalling ? lime(isLight, 0.95) : pigment(isLight, dHue, isLight ? 0.85 : 0.82);
      ctx.lineWidth = isFalling ? 1.6 : 0.95;
      ctx.beginPath();
      ctx.moveTo(dx, dy - rad);
      ctx.lineTo(dx + rad, dy);
      ctx.lineTo(dx, dy + rad);
      ctx.lineTo(dx - rad, dy);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Beat-bar synesthetic equalizer strip along bottom right
  const eqBars = 12;
  const eqW = Math.min(w * 0.34, 140);
  const eqX = w - eqW - 18;
  const eqY = h - 18;
  for (let i = 0; i < eqBars; i++) {
    const bh = 6 + Math.abs(Math.sin(t * 3.4 + i * 0.72 + seed)) * 22;
    ctx.fillStyle = i % 3 === 0 ? lime(isLight, 0.88) : pigment(isLight, paletteHues[i % paletteHues.length]!, 0.78);
    ctx.fillRect(eqX + i * (eqW / eqBars), eqY - bh, Math.max(2, eqW / eqBars - 3), bh);
  }
  ctx.restore();
}

// ============================================================================
// 6. circuit — Photonic PCB Core & Grapple-Bus Traces
// ============================================================================
function drawCircuit({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, counterHue);
  const rng = mulberry32(seed ^ 0xc14c01);
  const minD = Math.min(w, h);
  const cx = w * range(rng, 0.55, 0.64);
  const cy = h * range(rng, 0.44, 0.54);

  ctx.save();
  drawHairGrid(ctx, w, h, isLight, Math.max(18, Math.round(minD / 11)));
  drawBloom(ctx, cx, cy, minD * 0.56, pigment(isLight, hue, isLight ? 0.18 : 0.32), lime(isLight, 0.1));

  // Radiating 45-degree chamfered PCB bus traces with animated signal pulses
  const busRoutes: Array<{ pts: Array<[number, number]>; bHue: number }> = [
    { pts: [[0, cy - minD * 0.24], [cx - minD * 0.28, cy - minD * 0.24], [cx - minD * 0.14, cy - minD * 0.1]], bHue: hue },
    { pts: [[0, cy + minD * 0.18], [cx - minD * 0.34, cy + minD * 0.18], [cx - minD * 0.16, cy + minD * 0.04]], bHue: counterHue },
    { pts: [[w, cy - minD * 0.16], [cx + minD * 0.3, cy - minD * 0.16], [cx + minD * 0.15, cy - minD * 0.04]], bHue: 112 },
    { pts: [[w, cy + minD * 0.26], [cx + minD * 0.26, cy + minD * 0.26], [cx + minD * 0.12, cy + minD * 0.12]], bHue: hue },
    { pts: [[cx - minD * 0.18, 0], [cx - minD * 0.18, cy - minD * 0.28], [cx - minD * 0.04, cy - minD * 0.15]], bHue: counterHue },
    { pts: [[cx + minD * 0.14, h], [cx + minD * 0.14, cy + minD * 0.28], [cx + minD * 0.04, cy + minD * 0.15]], bHue: 112 },
  ];

  for (let i = 0; i < busRoutes.length; i++) {
    const tr = busRoutes[i]!;
    const col = tr.bHue === 112 ? lime(isLight, 0.82) : pigment(isLight, tr.bHue, 0.82);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    tr.pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();

    // Parallel secondary hairline bus
    ctx.strokeStyle = tr.bHue === 112 ? lime(isLight, 0.32) : pigment(isLight, tr.bHue, 0.32);
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    tr.pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px, py + 6) : ctx.lineTo(px, py + 6)));
    ctx.stroke();

    // Gold/copper via pads
    for (let k = 1; k < tr.pts.length; k++) {
      const [px, py] = tr.pts[k]!;
      ctx.fillStyle = isLight ? '#F5F3EC' : '#05070A';
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // Animated data pulse traveling along trace
    const segs = tr.pts.length - 1;
    const prog = ((t * 0.55 + i * 0.19) % 1) * segs;
    const idx = Math.min(segs - 1, Math.floor(prog));
    const f = prog - idx;
    const [x1, y1] = tr.pts[idx]!;
    const [x2, y2] = tr.pts[idx + 1]!;
    const px = x1 + (x2 - x1) * f;
    const py = y1 + (y2 - y1) * f;
    drawBloom(ctx, px, py, 14, col);
    ctx.fillStyle = ink(isLight, 1);
    ctx.fillRect(px - 2.2, py - 2.2, 4.4, 4.4);
  }

  // Hero central chamfered silicon processor package with IC pins
  const die = minD * 0.28;
  const half = die * 0.5;
  const pins = 5;
  ctx.fillStyle = pigment(isLight, 56, isLight ? 0.72 : 0.78);
  for (let p = 0; p < pins; p++) {
    const off = -half * 0.72 + (p / (pins - 1)) * die * 0.72;
    ctx.fillRect(cx + off - 1.5, cy - half - 8, 3, 8);
    ctx.fillRect(cx + off - 1.5, cy + half, 3, 8);
    ctx.fillRect(cx - half - 8, cy + off - 1.5, 8, 3);
    ctx.fillRect(cx + half, cy + off - 1.5, 8, 3);
  }

  // Chamfered package housing
  const ch = 8;
  ctx.beginPath();
  ctx.moveTo(cx - half + ch, cy - half);
  ctx.lineTo(cx + half - ch, cy - half);
  ctx.lineTo(cx + half, cy - half + ch);
  ctx.lineTo(cx + half, cy + half - ch);
  ctx.lineTo(cx + half - ch, cy + half);
  ctx.lineTo(cx - half + ch, cy + half);
  ctx.lineTo(cx - half, cy + half - ch);
  ctx.lineTo(cx - half, cy - half + ch);
  ctx.closePath();
  ctx.fillStyle = isLight ? '#181C24' : '#080C12';
  ctx.fill();
  ctx.strokeStyle = pigment(isLight, hue, 0.92);
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Inner glowing silicon logic die grid
  const inner = half * 0.58;
  ctx.strokeStyle = lime(isLight, 0.9);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - inner, cy - inner, inner * 2, inner * 2);
  ctx.fillStyle = pigment(isLight, counterHue, 0.55);
  ctx.fillRect(cx - inner * 0.55, cy - inner * 0.55, inner * 1.1, inner * 1.1);
  ctx.fillStyle = lime(isLight, 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, 3.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// 7. arena — Tactical Radial Horde Ring & Reticle Sweep
// ============================================================================
function drawArena({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, counterHue);
  const rng = mulberry32(seed ^ 0xa4e4a1);
  const minD = Math.min(w, h);
  const cx = w * range(rng, 0.54, 0.62);
  const cy = h * range(rng, 0.46, 0.54);
  const maxR = minD * 0.44;

  ctx.save();
  drawBloom(ctx, cx, cy, maxR * 1.35, pigment(isLight, hue, isLight ? 0.16 : 0.28), pigment(isLight, counterHue, 0.1));

  // Concentric tactical arena zones & radial sector lines
  for (let i = 1; i <= 4; i++) {
    const r = (maxR / 4) * i;
    ctx.strokeStyle = i === 4 ? pigment(isLight, hue, 0.78) : ink(isLight, isLight ? 0.18 : 0.16);
    ctx.lineWidth = i === 4 ? 1.5 : 0.9;
    if (i === 2) ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = ink(isLight, isLight ? 0.1 : 0.09);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * TAU;
    ctx.moveTo(cx + Math.cos(a) * (maxR * 0.2), cy + Math.sin(a) * (maxR * 0.2));
    ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
  }
  ctx.stroke();

  // Rotating auto-fire turret sweep wedge
  const sweep = t * 1.1 - 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, maxR, sweep - 0.48, sweep);
  ctx.closePath();
  ctx.fillStyle = lime(isLight, isLight ? 0.14 : 0.16);
  ctx.fill();

  // Radiating firing tracers
  for (let k = 0; k < 5; k++) {
    const a = sweep - k * 1.15;
    const len = maxR * (0.45 + ((t * 0.9 + k * 0.23) % 0.55));
    ctx.strokeStyle = k % 2 === 0 ? lime(isLight, 0.85) : pigment(isLight, counterHue, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (maxR * 0.22), cy + Math.sin(a) * (maxR * 0.22));
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.stroke();
  }

  // Converging perimeter horde chevrons
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * TAU + rng() * 0.24;
    const dist = maxR * (0.58 + rng() * 0.46) - ((t * 10 + i * 3) % (maxR * 0.18));
    const ex = cx + Math.cos(ang) * dist;
    const ey = cy + Math.sin(ang) * dist;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang + PI);
    ctx.fillStyle = i % 4 === 0 ? pigment(isLight, 22, 0.95) : pigment(isLight, counterHue, 0.86);
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-4, -3.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Glowing loot drop crates with expanding ping rings
  for (let i = 0; i < 3; i++) {
    const a = 0.7 + i * 2.15;
    const d = maxR * (0.56 + (i % 2) * 0.22);
    const bx = cx + Math.cos(a) * d;
    const by = cy + Math.sin(a) * d;
    const p = (t * 0.7 + i * 0.33) % 1;
    ctx.strokeStyle = lime(isLight, (1 - p) * 0.75);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(bx, by, 4 + p * 12, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = lime(isLight, 0.96);
    ctx.fillRect(bx - 3.2, by - 3.2, 6.4, 6.4);
  }

  // Central survivor core badge + lock brackets
  ctx.fillStyle = isLight ? '#FFFFFF' : '#080B10';
  ctx.strokeStyle = lime(isLight, 0.95);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.16, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pigment(isLight, hue, 1);
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// 8. velocity — Perspective Drift Circuit & Apex Telemetry
// ============================================================================
function drawVelocity({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, counterHue);
  const rng = mulberry32(seed ^ 0x59eed1);
  const horizon = h * 0.36;
  const vx = w * range(rng, 0.56, 0.66);

  ctx.save();
  // Horizon velocity glow & speed streaks in upper sky
  drawBloom(ctx, vx, horizon, Math.min(w, h) * 0.55, pigment(isLight, hue, isLight ? 0.22 : 0.36), pigment(isLight, counterHue, 0.14));

  for (let i = 0; i < 16; i++) {
    const sy = rng() * horizon * 0.88;
    const sx = ((rng() * w - t * (90 + (i % 4) * 35)) % w + w) % w;
    ctx.strokeStyle = i % 3 === 0 ? lime(isLight, 0.55) : pigment(isLight, hue, 0.34);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 18 + (i % 4) * 14, sy);
    ctx.stroke();
  }

  // Horizon datum rule
  ctx.fillStyle = pigment(isLight, hue, 0.72);
  ctx.fillRect(0, horizon, w, 1.5);

  // Perspective banked S-curve asphalt track ribbon
  const slices = 34;
  const curveAmp = w * 0.18;
  const scroll = (t * 2.8) % 1;

  const trackAt = (z: number) => {
    const p = Math.pow(z, 1.85);
    const y = horizon + p * (h - horizon);
    const cx = vx + Math.sin((1 - z) * 2.5 + 0.4) * curveAmp * p;
    const halfW = (0.045 + p * 0.4) * w;
    return { y, cx, halfW, p };
  };

  // Fill asphalt surface polygon
  const leftEdge: Array<[number, number]> = [];
  const rightEdge: Array<[number, number]> = [];
  for (let i = 0; i <= slices; i++) {
    const tr = trackAt(i / slices);
    leftEdge.push([tr.cx - tr.halfW, tr.y]);
    rightEdge.push([tr.cx + tr.halfW, tr.y]);
  }
  ctx.beginPath();
  leftEdge.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  for (let i = rightEdge.length - 1; i >= 0; i--) ctx.lineTo(rightEdge[i]![0], rightEdge[i]![1]);
  ctx.closePath();
  ctx.fillStyle = isLight ? '#23262E' : '#0A0D14';
  ctx.fill();

  // Alternating apex curbing segments + center racing dashes + boost chevron pads
  for (let i = 0; i < slices; i++) {
    const z0 = i / slices;
    const z1 = (i + 1) / slices;
    const a = trackAt(z0);
    const b = trackAt(z1);
    const odd = (i + Math.floor(scroll * 2)) % 2 === 0;
    const curbW0 = Math.max(2, a.halfW * 0.11);
    const curbW1 = Math.max(2, b.halfW * 0.11);

    // Left & right apex rumble strips
    const curbCol = odd ? pigment(isLight, 24, 0.94) : '#F5F3EC';
    ctx.fillStyle = curbCol;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(a.cx + side * a.halfW, a.y);
      ctx.lineTo(a.cx + side * (a.halfW + curbW0), a.y);
      ctx.lineTo(b.cx + side * (b.halfW + curbW1), b.y);
      ctx.lineTo(b.cx + side * b.halfW, b.y);
      ctx.closePath();
      ctx.fill();
    }

    // Center telemetry racing dash
    if (odd && i > 4) {
      ctx.strokeStyle = pigment(isLight, hue, 0.65);
      ctx.lineWidth = 1 + a.p * 2;
      ctx.beginPath();
      ctx.moveTo(a.cx, a.y);
      ctx.lineTo(b.cx, b.y);
      ctx.stroke();
    }
  }

  // Luminous speed-boost chevron pads embedded in track
  for (let k = 0; k < 3; k++) {
    const z = 0.42 + ((k * 0.22 + scroll * 0.22) % 0.56);
    const tr = trackAt(z);
    const cw = tr.halfW * 0.34;
    const ch = 6 + tr.p * 12;
    ctx.strokeStyle = lime(isLight, 0.95);
    ctx.lineWidth = 1.6 + tr.p * 1.4;
    ctx.beginPath();
    ctx.moveTo(tr.cx - cw, tr.y + ch);
    ctx.lineTo(tr.cx, tr.y);
    ctx.lineTo(tr.cx + cw, tr.y + ch);
    ctx.stroke();
  }

  // Sweeping twin neon drift trails carving apex line
  for (const lane of [-0.28, 0.24]) {
    ctx.beginPath();
    for (let i = 4; i <= slices; i++) {
      const tr = trackAt(i / slices);
      const tx = tr.cx + tr.halfW * lane;
      if (i === 4) ctx.moveTo(tx, tr.y);
      else ctx.lineTo(tx, tr.y);
    }
    ctx.strokeStyle = lane < 0 ? pigment(isLight, counterHue, 0.9) : pigment(isLight, hue, 0.9);
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  // Overhead sector timing gantry arch at z=0.32
  const g = trackAt(0.32);
  const gh = h * 0.22;
  ctx.strokeStyle = ink(isLight, 0.78);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.cx - g.halfW * 1.18, g.y);
  ctx.lineTo(g.cx - g.halfW * 1.18, g.y - gh);
  ctx.lineTo(g.cx + g.halfW * 1.18, g.y - gh);
  ctx.lineTo(g.cx + g.halfW * 1.18, g.y);
  ctx.stroke();
  ctx.fillStyle = lime(isLight, 0.95);
  ctx.fillRect(g.cx - g.halfW * 0.55, g.y - gh - 2, g.halfW * 1.1, 4);
  ctx.restore();
}

// ============================================================================
// 9. wasteland — Shattered Crown & Solar Eclipse Horizon
// ============================================================================
function drawWasteland({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  const sunHue = remapHue(hue < 80 ? hue : 34);
  fillBackdrop(ctx, w, h, isLight, sunHue, counterHue);
  const rng = mulberry32(seed ^ 0x7440ae);
  const minD = Math.min(w, h);
  const horizon = h * 0.62;
  const sx = w * range(rng, 0.55, 0.66);
  const sy = horizon - minD * 0.14;
  const sr = minD * 0.27;

  ctx.save();
  // Blazing double-ringed solar eclipse corona
  drawBloom(ctx, sx, sy, sr * 2.4, pigment(isLight, sunHue, isLight ? 0.28 : 0.44), pigment(isLight, 56, 0.16));
  ctx.fillStyle = isLight ? '#181412' : '#050404';
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pigment(isLight, sunHue, 0.96);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.strokeStyle = pigment(isLight, 56, 0.65);
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 1.24, -PI * 0.92, -PI * 0.08);
  ctx.stroke();
  ctx.setLineDash([]);

  // Terraced wasteland horizon mesas
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w * 0.14, horizon - h * 0.11);
  ctx.lineTo(w * 0.28, horizon - h * 0.11);
  ctx.lineTo(w * 0.36, horizon - h * 0.03);
  ctx.lineTo(w * 0.76, horizon - h * 0.04);
  ctx.lineTo(w * 0.85, horizon - h * 0.13);
  ctx.lineTo(w, horizon - h * 0.13);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = isLight ? tone(0.84, 0.05, sunHue, 0.92) : '#090707';
  ctx.fill();

  // Perspective wasteland grid floor
  ctx.strokeStyle = pigment(isLight, sunHue, isLight ? 0.28 : 0.34);
  ctx.lineWidth = 0.9;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + i * 10, horizon);
    ctx.lineTo(sx + i * w * 0.16, h);
    ctx.stroke();
  }
  for (let r = 1; r <= 6; r++) {
    const y = horizon + Math.pow(r / 6, 1.8) * (h - horizon);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Iconic fractured brutalist crown monolith silhouette + levitating shards
  const cw = minD * 0.34;
  const ch = minD * 0.24;
  const cy = horizon + minD * 0.02;
  ctx.beginPath();
  ctx.moveTo(sx - cw * 0.5, cy);
  ctx.lineTo(sx - cw * 0.62, cy - ch * 0.92);
  ctx.lineTo(sx - cw * 0.25, cy - ch * 0.42);
  ctx.lineTo(sx, cy - ch * 1.12);
  ctx.lineTo(sx + cw * 0.25, cy - ch * 0.42);
  ctx.lineTo(sx + cw * 0.62, cy - ch * 0.92);
  ctx.lineTo(sx + cw * 0.5, cy);
  ctx.closePath();
  ctx.fillStyle = isLight ? '#181412' : '#0C0908';
  ctx.fill();
  ctx.strokeStyle = lime(isLight, 0.92);
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Floating fractured debris shards orbiting above crown
  for (let i = 0; i < 6; i++) {
    const ang = -PI + (i / 5) * PI;
    const rad = cw * (0.76 + (i % 2) * 0.24);
    const fx = sx + Math.cos(ang) * rad;
    const fy = cy - ch * 0.55 + Math.sin(ang) * rad * 0.65 + Math.sin(t * 2 + i * 1.3) * 4;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(ang + t * 0.25);
    ctx.fillStyle = i % 2 === 0 ? pigment(isLight, sunHue, 0.9) : lime(isLight, 0.85);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4.5, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ============================================================================
// 10. runic — Post-Apocalyptic Norse Runic Shockwave & Monolith Pillars
// ============================================================================
function drawRunic({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, counterHue);
  const rng = mulberry32(seed ^ 0x4041c5);
  const minD = Math.min(w, h);
  const cx = w * range(rng, 0.52, 0.6);
  const cy = h * 0.56;

  ctx.save();
  // Expanding radial shockwave distortion rings on ground plane
  drawBloom(ctx, cx, cy, minD * 0.54, pigment(isLight, hue, isLight ? 0.22 : 0.38), pigment(isLight, counterHue, 0.14));
  for (let i = 0; i < 4; i++) {
    const prog = (t * 0.42 + i * 0.25) % 1;
    const rx = minD * (0.12 + prog * 0.68);
    const ry = rx * 0.36;
    ctx.strokeStyle = i % 2 === 0 ? pigment(isLight, hue, (1 - prog) * 0.82) : lime(isLight, (1 - prog) * 0.72);
    ctx.lineWidth = 2.2 - prog * 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.stroke();
  }

  // Twin-stick tactical energy beams intersecting at shockwave core
  for (let b = 0; b < 3; b++) {
    const ang = -0.38 + b * 0.42 + Math.sin(t * 0.8 + b) * 0.06;
    ctx.strokeStyle = b === 1 ? lime(isLight, 0.86) : pigment(isLight, counterHue, 0.75);
    ctx.lineWidth = b === 1 ? 2 : 1.25;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * w * 0.6, cy - Math.sin(ang) * w * 0.6);
    ctx.lineTo(cx + Math.cos(ang) * w * 0.6, cy + Math.sin(ang) * w * 0.6);
    ctx.stroke();
  }

  // Standing angular basalt runestone monolith pillars flanking impact core
  const pillars = [
    { x: w * 0.24, y: h * 0.56, pw: minD * 0.11, ph: minD * 0.44 },
    { x: cx, y: cy - minD * 0.04, pw: minD * 0.14, ph: minD * 0.56 },
    { x: w * 0.8, y: h * 0.52, pw: minD * 0.1, ph: minD * 0.4 },
  ];

  for (let i = 0; i < pillars.length; i++) {
    const p = pillars[i]!;
    const topY = p.y - p.ph * 0.62;
    const botY = p.y + p.ph * 0.38;
    ctx.beginPath();
    ctx.moveTo(p.x - p.pw * 0.45, botY);
    ctx.lineTo(p.x - p.pw * 0.52, topY + 12);
    ctx.lineTo(p.x, topY);
    ctx.lineTo(p.x + p.pw * 0.52, topY + 14);
    ctx.lineTo(p.x + p.pw * 0.44, botY);
    ctx.closePath();
    ctx.fillStyle = isLight ? tone(0.84, 0.04, hue, 0.96) : '#0A0D12';
    ctx.fill();
    ctx.strokeStyle = pigment(isLight, i === 1 ? hue : counterHue, 0.86);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Glowing carved geometric Norse-style angular rune strokes
    const ry0 = topY + p.ph * 0.22;
    const ry1 = botY - p.ph * 0.22;
    const rMid = (ry0 + ry1) * 0.5;
    ctx.strokeStyle = i === 1 ? lime(isLight, 0.95) : pigment(isLight, hue, 0.9);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(p.x, ry0);
    ctx.lineTo(p.x, ry1);
    ctx.moveTo(p.x, ry0 + 6);
    ctx.lineTo(p.x + p.pw * 0.26, rMid - 4);
    ctx.lineTo(p.x, rMid + 4);
    ctx.moveTo(p.x, rMid);
    ctx.lineTo(p.x - p.pw * 0.24, rMid + 12);
    ctx.stroke();
  }

  // Rising glowing embers
  for (let i = 0; i < 24; i++) {
    const ex = rng() * w;
    const ey = ((rng() * h - t * (16 + (i % 5) * 6)) % h + h) % h;
    ctx.fillStyle = i % 3 === 0 ? lime(isLight, 0.88) : pigment(isLight, counterHue, 0.78);
    ctx.fillRect(ex, ey, 2.2, 2.2);
  }
  ctx.restore();
}

// ============================================================================
// 11. biocell — Bioluminescent Cellular Voronoi & Stem Nuclei
// ============================================================================
function drawBiocell({ ctx, w, h, seed, hue, counterHue, analogHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, analogHue);
  const rng = mulberry32(seed ^ 0xb10ce1);
  const minD = Math.min(w, h);

  ctx.save();
  // Generate organic jittered hexagonal cell nodes
  const spacing = clamp(minD * 0.3, 46, 86);
  const cells: Array<{ x: number; y: number; r: number; cHue: number; isStem: boolean }> = [];
  const cols = Math.ceil(w / spacing) + 2;
  const rows = Math.ceil(h / (spacing * 0.86)) + 2;

  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const x = c * spacing + (r % 2 === 0 ? 0 : spacing * 0.5) + (rng() - 0.5) * spacing * 0.32;
      const y = r * spacing * 0.86 + (rng() - 0.5) * spacing * 0.32;
      const distCenter = Math.hypot(x - w * 0.58, y - h * 0.48);
      const isStem = distCenter < minD * 0.26 || rng() > 0.82;
      const cHue = isStem ? hue : rng() > 0.5 ? analogHue : counterHue;
      cells.push({ x, y, r: spacing * range(rng, 0.38, 0.48), cHue, isStem });
    }
  }

  // Branching synaptic cytoplasmic filaments linking neighboring stem cells
  ctx.strokeStyle = pigment(isLight, hue, isLight ? 0.3 : 0.34);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i]!;
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < spacing * 1.18) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
  }
  ctx.stroke();

  // Organic 7-vertex cellular membranes + glowing pulsing mitotic nuclei
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const pulse = 1 + 0.05 * Math.sin(t * 2.2 + i * 0.9);
    const sides = 7;

    if (c.isStem) {
      drawBloom(ctx, c.x, c.y, c.r * 1.65, pigment(isLight, c.cHue, isLight ? 0.2 : 0.34), lime(isLight, 0.09));
    }

    ctx.beginPath();
    for (let s = 0; s <= sides; s++) {
      const ang = (s / sides) * TAU + i * 0.35;
      const wobble = 0.86 + 0.16 * Math.sin(ang * 3 + i + t * 0.7);
      const px = c.x + Math.cos(ang) * c.r * wobble * pulse;
      const py = c.y + Math.sin(ang) * c.r * wobble * pulse;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = c.isStem
      ? pigment(isLight, c.cHue, isLight ? 0.22 : 0.26)
      : isLight
        ? 'rgba(255,255,255,0.45)'
        : 'rgba(8,14,18,0.46)';
    ctx.fill();
    ctx.strokeStyle = c.isStem ? pigment(isLight, c.cHue, 0.88) : pigment(isLight, c.cHue, 0.42);
    ctx.lineWidth = c.isStem ? 1.5 : 0.95;
    ctx.stroke();

    // Inner nucleus
    const nr = c.r * (c.isStem ? 0.32 : 0.2);
    ctx.fillStyle = c.isStem ? lime(isLight, 0.92) : pigment(isLight, c.cHue, 0.72);
    ctx.beginPath();
    ctx.arc(c.x, c.y, nr, 0, TAU);
    ctx.fill();
    if (c.isStem) {
      ctx.strokeStyle = ink(isLight, 0.7);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(c.x, c.y, nr * 1.55, 0, TAU);
      ctx.stroke();
    }
  }

  // Microscope optical aperture ring
  ctx.strokeStyle = ink(isLight, 0.24);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w * 0.58, h * 0.48, minD * 0.42, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// 12. aero — Supersonic Dogfight Horizon & Tactical Aerospace HUD
// ============================================================================
function drawAero({ ctx, w, h, seed, hue, counterHue, t, isLight }: AutoCtx) {
  const skyHue = remapHue(hue > 160 && hue < 235 ? hue : 204);
  fillBackdrop(ctx, w, h, isLight, skyHue, counterHue);
  const rng = mulberry32(seed ^ 0xae4012);
  const minD = Math.min(w, h);
  const hor = h * 0.64;

  ctx.save();
  // Volumetric cloud-deck horizon strata
  const cloudGrad = ctx.createLinearGradient(0, hor - h * 0.1, 0, h);
  cloudGrad.addColorStop(0, pigment(isLight, skyHue, isLight ? 0.14 : 0.24));
  cloudGrad.addColorStop(0.45, pigment(isLight, skyHue, isLight ? 0.08 : 0.1));
  cloudGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cloudGrad;
  ctx.fillRect(0, hor - h * 0.1, w, h - hor + h * 0.1);

  // Sweeping supersonic contrail arcs across high sky
  for (let c = 0; c < 3; c++) {
    ctx.strokeStyle = c === 0 ? lime(isLight, 0.55) : pigment(isLight, skyHue, 0.42);
    ctx.lineWidth = c === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(0, h * (0.28 + c * 0.14));
    ctx.quadraticCurveTo(w * 0.48, h * (0.14 + c * 0.1), w, h * (0.36 + c * 0.08));
    ctx.stroke();
  }

  // Precision aerospace HUD pitch-ladder + bank roll arc
  const hx = w * 0.58;
  const hy = h * 0.46;
  const hudR = minD * 0.34;
  ctx.strokeStyle = pigment(isLight, skyHue, isLight ? 0.56 : 0.52);
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.arc(hx, hy, hudR, -PI * 0.82, -PI * 0.18);
  ctx.stroke();

  for (let p = -2; p <= 2; p++) {
    const py = hy + p * (minD * 0.08);
    const gap = minD * 0.11;
    const arm = p === 0 ? minD * 0.16 : minD * 0.1;
    ctx.beginPath();
    ctx.moveTo(hx - gap - arm, py);
    ctx.lineTo(hx - gap, py);
    ctx.lineTo(hx - gap, py + (p <= 0 ? 5 : -5));
    ctx.moveTo(hx + gap + arm, py);
    ctx.lineTo(hx + gap, py);
    ctx.lineTo(hx + gap, py + (p <= 0 ? 5 : -5));
    ctx.stroke();
  }

  // Banking delta-wing starfighter / dogfighter silhouette + parabolic Mach shock-cone
  const jx = hx + Math.sin(t * 0.9) * 8;
  const jy = hy + Math.cos(t * 1.1) * 5;
  const jetR = minD * 0.19;
  const bank = -0.32 + Math.sin(t * 0.7) * 0.06;

  ctx.save();
  ctx.translate(jx, jy);
  ctx.rotate(bank);

  // Translucent parabolic Mach shock-cone
  ctx.strokeStyle = lime(isLight, 0.82);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-jetR * 0.9, -jetR * 1.05);
  ctx.quadraticCurveTo(jetR * 1.35, 0, -jetR * 0.9, jetR * 1.05);
  ctx.stroke();

  // Afterburner plume glow
  drawBloom(ctx, -jetR * 0.72, 0, jetR * 0.95, pigment(isLight, 34, 0.72), lime(isLight, 0.22));

  // Delta-wing aircraft body
  ctx.beginPath();
  ctx.moveTo(jetR * 0.95, 0);
  ctx.lineTo(-jetR * 0.55, -jetR * 0.68);
  ctx.lineTo(-jetR * 0.28, -jetR * 0.12);
  ctx.lineTo(-jetR * 0.72, -jetR * 0.26);
  ctx.lineTo(-jetR * 0.58, 0);
  ctx.lineTo(-jetR * 0.72, jetR * 0.26);
  ctx.lineTo(-jetR * 0.28, jetR * 0.12);
  ctx.lineTo(-jetR * 0.55, jetR * 0.68);
  ctx.closePath();
  ctx.fillStyle = isLight ? '#181C24' : '#F5F3EC';
  ctx.fill();
  ctx.strokeStyle = pigment(isLight, skyHue, 0.95);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // Target-lock diamond reticle ahead of nose
  const tx = w * range(rng, 0.76, 0.84);
  const ty = h * range(rng, 0.26, 0.36);
  const tr = 11;
  ctx.strokeStyle = pigment(isLight, 26, 0.95);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx, ty - tr);
  ctx.lineTo(tx + tr, ty);
  ctx.lineTo(tx, ty + tr);
  ctx.lineTo(tx - tr, ty);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = pigment(isLight, 26, 1);
  ctx.beginPath();
  ctx.arc(tx, ty, 2.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// 13. cartograph — Hypsometric Quest Atlas & Biome Waypoints
// ============================================================================
function drawCartograph({ ctx, w, h, seed, hue, counterHue, t, theme, isLight }: AutoCtx) {
  const pal = makePalette(hue, theme);
  drawTopo({ ctx, w, h, seed, pal, t });

  const rng = mulberry32(seed ^ 0xca4709);
  const minD = Math.min(w, h);

  ctx.save();
  // Illuminated quest expedition route connecting 4 biome shrines
  const shrines: Array<[number, number]> = [
    [w * range(rng, 0.22, 0.3), h * range(rng, 0.62, 0.72)],
    [w * range(rng, 0.4, 0.48), h * range(rng, 0.34, 0.46)],
    [w * range(rng, 0.6, 0.68), h * range(rng, 0.54, 0.64)],
    [w * range(rng, 0.76, 0.84), h * range(rng, 0.24, 0.34)],
  ];

  ctx.strokeStyle = lime(isLight, 0.92);
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -t * 16;
  ctx.beginPath();
  for (let i = 0; i < shrines.length; i++) {
    const [x, y] = shrines[i]!;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const [px, py] = shrines[i - 1]!;
      ctx.quadraticCurveTo((px + x) * 0.5, (py + y) * 0.5 - 18, x, y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < shrines.length; i++) {
    const [sx, sy] = shrines[i]!;
    const isFinal = i === shrines.length - 1;
    drawBloom(ctx, sx, sy, isFinal ? 18 : 11, isFinal ? lime(isLight, 0.6) : pigment(isLight, counterHue, 0.45));
    const r = isFinal ? 6.5 : 4.5;
    ctx.fillStyle = isFinal ? lime(isLight, 1) : pigment(isLight, counterHue, 0.95);
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx + r, sy);
    ctx.lineTo(sx, sy + r);
    ctx.lineTo(sx - r, sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink(isLight, 0.85);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Sculpted miniature compass rose in lower-right corner
  const crX = w - minD * 0.16;
  const crY = h - minD * 0.16;
  const crR = minD * 0.11;
  ctx.strokeStyle = ink(isLight, 0.42);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(crX, crY, crR * 0.75, 0, TAU);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.translate(crX, crY);
    ctx.rotate((k * PI) / 2);
    ctx.fillStyle = k === 0 ? lime(isLight, 0.95) : pigment(isLight, hue, 0.85);
    ctx.beginPath();
    ctx.moveTo(0, -crR);
    ctx.lineTo(crR * 0.2, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ============================================================================
// 14. deck — Holographic Fanned Card Deck & Isometric Relic Grid
// ============================================================================
function drawDeck({ ctx, w, h, seed, hue, counterHue, analogHue, t, isLight }: AutoCtx) {
  fillBackdrop(ctx, w, h, isLight, hue, analogHue);
  const rng = mulberry32(seed ^ 0xdec412);
  const minD = Math.min(w, h);
  const cx = w * range(rng, 0.54, 0.6);
  const cy = h * 0.68;

  ctx.save();
  drawHairGrid(ctx, w, h, isLight, Math.max(20, Math.round(minD / 10)));
  drawBloom(ctx, cx, h * 0.44, minD * 0.56, pigment(isLight, hue, isLight ? 0.2 : 0.34), pigment(isLight, counterHue, 0.12));

  // 5 fanned architectural monolith cards with geometric emblems & foil sheen
  const cardCount = 5;
  const cardW = minD * 0.31;
  const cardH = cardW * 1.42;
  const cardHues = [counterHue, analogHue, hue, counterHue, analogHue];

  for (let i = 0; i < cardCount; i++) {
    const offset = i - 2;
    const isHero = i === 2;
    const angle = offset * 0.22 + Math.sin(t * 0.8 + i) * 0.015;
    const lift = isHero ? -minD * 0.09 : Math.abs(offset) * minD * 0.035;
    const cHue = cardHues[i]!;

    ctx.save();
    ctx.translate(cx + offset * cardW * 0.42, cy + lift);
    ctx.rotate(angle);

    const x0 = -cardW * 0.5;
    const y0 = -cardH * 0.72;

    // Card drop shadow
    ctx.fillStyle = isLight ? 'rgba(10,10,11,0.16)' : 'rgba(0,0,0,0.62)';
    ctx.fillRect(x0 + 4, y0 + 6, cardW, cardH);

    // Card chassis
    const cg = ctx.createLinearGradient(x0, y0, x0 + cardW, y0 + cardH);
    if (isLight) {
      cg.addColorStop(0, '#FFFFFF');
      cg.addColorStop(1, tone(0.92, 0.032, cHue, 1));
    } else {
      cg.addColorStop(0, tone(0.2, 0.055, cHue, 1));
      cg.addColorStop(1, '#080A0F');
    }
    ctx.fillStyle = cg;
    ctx.fillRect(x0, y0, cardW, cardH);

    // Diagonal holographic foil shimmer band on hero card
    if (isHero) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, cardW, cardH);
      ctx.clip();
      const sheenX = x0 + ((t * 42) % (cardW * 2.2)) - cardW * 0.6;
      const sg = ctx.createLinearGradient(sheenX, y0, sheenX + cardW * 0.45, y0 + cardH);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, lime(isLight, isLight ? 0.2 : 0.24));
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x0, y0, cardW, cardH);
      ctx.restore();
    }

    // Crisp outer + recessed inner frame
    ctx.strokeStyle = isHero ? lime(isLight, 0.95) : pigment(isLight, cHue, 0.8);
    ctx.lineWidth = isHero ? 1.8 : 1.15;
    ctx.strokeRect(x0, y0, cardW, cardH);
    ctx.strokeStyle = ink(isLight, 0.18);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x0 + 5, y0 + 5, cardW - 10, cardH - 10);

    // Corner suit pips
    ctx.fillStyle = isHero ? lime(isLight, 0.95) : pigment(isLight, cHue, 0.92);
    ctx.fillRect(x0 + 9, y0 + 9, 4, 4);
    ctx.fillRect(x0 + cardW - 13, y0 + cardH - 13, 4, 4);

    // Center geometric relic emblem (distinct per card index)
    const ex = 0;
    const ey = y0 + cardH * 0.5;
    const er = cardW * 0.24;
    ctx.strokeStyle = isHero ? lime(isLight, 0.95) : pigment(isLight, cHue, 0.88);
    ctx.fillStyle = pigment(isLight, cHue, isHero ? 0.34 : 0.22);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (i % 3 === 0) {
      ctx.moveTo(ex, ey - er);
      ctx.lineTo(ex + er * 0.82, ey);
      ctx.lineTo(ex, ey + er);
      ctx.lineTo(ex - er * 0.82, ey);
      ctx.closePath();
    } else if (i % 3 === 1) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU - PI * 0.5;
        const px = ex + Math.cos(a) * er;
        const py = ey + Math.sin(a) * er;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(ex, ey, er * 0.82, 0, TAU);
    }
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
  ctx.restore();
}

const ARCHETYPE_DRAWERS: Record<AutoWorldArchetype, (s: AutoCtx) => void> = {
  summit: drawSummit,
  abyss: drawAbyss,
  citadel: drawCitadel,
  catacomb: drawCatacomb,
  diamond: drawDiamond,
  circuit: drawCircuit,
  arena: drawArena,
  velocity: drawVelocity,
  wasteland: drawWasteland,
  runic: drawRunic,
  biocell: drawBiocell,
  aero: drawAero,
  cartograph: drawCartograph,
  deck: drawDeck,
};

/**
 * Draws one of the 14 rich procedural auto-world archetypes directly onto an active 2D canvas context.
 */
export function drawAutoWorldToContext(
  ctx: Ctx2D,
  opts: Omit<AutoWorldRenderOpts, 'dpr'>,
): void {
  const theme: ArtTheme = opts.theme ?? 'obsidian';
  const isLight = theme === 'daylight';
  const safeHue = remapHue(opts.hue);
  const counterHue = remapHue(safeHue + 138);
  const analogHue = remapHue(safeHue + 28);
  const drawer = ARCHETYPE_DRAWERS[opts.archetype] ?? drawCartograph;

  drawer({
    ctx,
    w: Math.max(1, opts.w),
    h: Math.max(1, opts.h),
    seed: opts.seed,
    hue: safeHue,
    counterHue,
    analogHue,
    t: opts.t ?? 0,
    theme,
    isLight,
  });
}

/**
 * Standalone renderer for an auto-world archetype onto a canvas element or OffscreenCanvas.
 */
export function renderAutoWorldScene(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: AutoWorldRenderOpts,
): void {
  const dpr = opts.dpr ?? 1;
  const w = Math.max(1, opts.w);
  const h = Math.max(1, opts.h);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawAutoWorldToContext(ctx, opts);
}
