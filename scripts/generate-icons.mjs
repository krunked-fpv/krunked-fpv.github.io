import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// PNG signature: 89 50 4E 47 0D 0A 1A 0A
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// CRC32 table for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: None
    rgba.copy(raw, rowStart + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth: 8
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function verifyPng(filePath, expectedSize) {
  const buf = readFileSync(filePath);
  if (buf.length < 45 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature in ${filePath}`);
  }
  const ihdrTag = buf.subarray(12, 16).toString('ascii');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const iendTag = buf.subarray(buf.length - 8, buf.length - 4).toString('ascii');
  if (ihdrTag !== 'IHDR' || w !== expectedSize || h !== expectedSize || bitDepth !== 8 || colorType !== 6 || iendTag !== 'IEND') {
    throw new Error(
      `Invalid PNG IHDR/IEND in ${filePath}: ${w}x${h} bd=${bitDepth} ct=${colorType} ihdr=${ihdrTag} iend=${iendTag}`,
    );
  }
  return { bytes: buf.length, width: w, height: h };
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdBox(px, py, x0, y0, x1, y1) {
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const dx = Math.abs(px - cx) - (x1 - x0) * 0.5;
  const dy = Math.abs(py - cy) - (y1 - y0) * 0.5;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/** Exact signed distance to a strictly convex clockwise polygon (screen Y-down). */
function sdConvexPoly(px, py, verts) {
  let minDist = Infinity;
  let inside = true;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const wx = px - a[0];
    const wy = py - a[1];
    if (ex * wy - ey * wx < 0) inside = false;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const d = Math.hypot(wx - ex * t, wy - ey * t);
    if (d < minDist) minDist = d;
  }
  return inside ? -minDist : minDist;
}

function over(dstR, dstG, dstB, dstA, srcR, srcG, srcB, srcA) {
  if (srcA <= 0) return [dstR, dstG, dstB, dstA];
  const a = srcA + dstA * (1 - srcA);
  if (a <= 1e-6) return [0, 0, 0, 0];
  return [
    (srcR * srcA + dstR * dstA * (1 - srcA)) / a,
    (srcG * srcA + dstG * dstA * (1 - srcA)) / a,
    (srcB * srcA + dstB * dstA * (1 - srcA)) / a,
    a,
  ];
}

// Sharp mitered geometric K-monogram convex polygons (overlapping internally at y=32 & x=21 for zero subpixel seam)
const K_TOP_ARM = [
  [21.0, 29.6],
  [30.2, 19.0],
  [35.9, 19.0],
  [25.4, 32.0],
  [24.0, 33.2],
  [21.0, 33.2],
];

const K_BOT_ARM = [
  [21.0, 30.8],
  [24.0, 30.8],
  [25.4, 32.0],
  [35.9, 45.0],
  [30.2, 45.0],
  [21.0, 34.4],
];

/**
 * 4x4 supersampled rasterizer for KRUNKED // FORGE DECK V2 industrial hardware mark:
 * - Anodized Obsidian chassis (#08090B) with Swiss 16-unit micro-grid
 * - Machined inner module bezel (#111419) with overhead specular chamfer
 * - Sharp mitered geometric K-monogram (#F3F5F8)
 * - International Orange hardware LED (#FF4F00) + warm diffuser halo + 3 stepped telemetry bars
 */
function renderIcon(size, mode) {
  const isMaskable = mode === 'maskable';
  const isOpaque = mode === 'maskable' || mode === 'apple';
  const isSmall = size <= 48;
  // W3C maskable safe circle radius is 40% (25.6 units in 64x64).
  // Scaling inner 42x42 module by 0.80 yields 33.6x33.6 (corner radius distance 21.8 < 25.6).
  const moduleScale = isMaskable ? 0.80 : isSmall ? 1.18 : 1.0;

  const rgba = Buffer.alloc(size * size * 4);
  const sub = [-0.375, -0.125, 0.125, 0.375];
  // Scale antialiasing band to ~0.75 physical pixels in 64x64 design space
  const pxUnit = 64 / size;
  const aa = Math.max(0.18, pxUnit * 0.55);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const u = ((x + 0.5 + sub[sx]) / size) * 64;
          const v = ((y + 0.5 + sub[sy]) / size) * 64;

          // 1. Outer anodized chassis shape & opacity mask
          let outerMask = 1;
          let dOuter = -99;
          if (!isOpaque) {
            dOuter = sdRoundedBox(u, v, 32, 32, 30, 30, 11.5);
            outerMask = 1 - smoothstep(-aa, aa, dOuter);
            if (outerMask <= 0) continue;
          }

          // Vertical anodized obsidian gradient (#0B0D11 -> #08090B)
          const tY = clamp(v / 64, 0, 1);
          let r = 11 + (8 - 11) * tY;
          let g = 13 + (9 - 13) * tY;
          let b = 17 + (11 - 17) * tY;
          let a = outerMask;

          // 2. Swiss 16-unit architectural micro-grid (suppressed on tiny 32px favicon)
          if (!isSmall) {
            const gX = Math.min(Math.abs(u - 16), Math.abs(u - 32), Math.abs(u - 48));
            const gY = Math.min(Math.abs(v - 16), Math.abs(v - 32), Math.abs(v - 48));
            const dGrid = Math.min(gX, gY) - 0.35;
            const gridCov = 1 - smoothstep(-aa * 0.8, aa * 0.8, dGrid);
            if (gridCov > 0) {
              [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.045 * gridCov * outerMask);
            }
          }

          // Outer chassis machined hairline + top chamfer highlight
          if (!isOpaque) {
            const dOuterStroke = Math.abs(dOuter + 0.55) - 0.45;
            const outerStroke = 1 - smoothstep(-aa, aa, dOuterStroke);
            if (outerStroke > 0) {
              [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.13 * outerStroke * outerMask);
            }
            const dTopEdge = sdSegment(u, v, 13.5, 2.55, 50.5, 2.55) - 0.4;
            const topEdge = 1 - smoothstep(-aa, aa, dTopEdge);
            if (topEdge > 0) {
              [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.2 * topEdge * outerMask);
            }
          } else {
            // Subtle perimeter datum frame on opaque maskable/apple icons
            const dFrame = Math.abs(sdRoundedBox(u, v, 32, 32, 27.5, 27.5, 3)) - 0.35;
            const frameCov = 1 - smoothstep(-aa, aa, dFrame);
            if (frameCov > 0) {
              [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.055 * frameCov);
            }
          }

          // Transform into module-local coordinates centered at (32, 32)
          const mu = 32 + (u - 32) / moduleScale;
          const mv = 32 + (v - 32) / moduleScale;
          const maa = aa / moduleScale;

          // 3. Inner machined instrument bezel (42x42, rx=5.5, centered at 32,32)
          const dPlate = sdRoundedBox(mu, mv, 32, 32, 21, 21, 5.5);
          const plateCov = 1 - smoothstep(-maa, maa, dPlate);
          if (plateCov > 0) {
            const pt = clamp((mv - 11) / 42, 0, 1);
            const pr = 21 + (15 - 21) * pt;
            const pg = 25 + (18 - 25) * pt;
            const pb = 33 + (23 - 33) * pt;
            [r, g, b, a] = over(r, g, b, a, pr, pg, pb, plateCov * outerMask);
          }

          // Inner plate hairline border + overhead milled aluminum chamfer
          const dPlateBorder = Math.abs(dPlate + 0.4) - 0.42;
          const plateBorder = 1 - smoothstep(-maa, maa, dPlateBorder);
          if (plateBorder > 0) {
            [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.14 * plateBorder * outerMask);
          }
          const dPlateSpec = sdSegment(mu, mv, 16.5, 11.45, 47.5, 11.45) - 0.42;
          const plateSpec = 1 - smoothstep(-maa, maa, dPlateSpec);
          if (plateSpec > 0) {
            [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.22 * plateSpec * outerMask);
          }

          // Vertical hardware divider hairline between K-bay and LED/telemetry bay
          if (!isSmall) {
            const dDiv = sdSegment(mu, mv, 37.6, 15.2, 37.6, 48.8) - 0.35;
            const divCov = 1 - smoothstep(-maa, maa, dDiv);
            if (divCov > 0) {
              [r, g, b, a] = over(r, g, b, a, 255, 255, 255, 0.075 * divCov * outerMask);
            }
          }

          // 4. Warm International Orange (#FF4F00) hardware LED radial diffuser glow
          const ledDist = Math.hypot(mu - 44.0, mv - 23.2);
          if (ledDist < 14.5) {
            const glow = Math.exp(-(ledDist * ledDist) / 48) * 0.36;
            [r, g, b, a] = over(r, g, b, a, 255, 79, 0, glow * outerMask);
          }

          // 5. Crisp angular geometric K-monogram (#F3F5F8)
          const dSpine = sdBox(mu, mv, 16.4, 19.0, 21.5, 45.0);
          const dTop = sdConvexPoly(mu, mv, K_TOP_ARM);
          const dBot = sdConvexPoly(mu, mv, K_BOT_ARM);
          const dK = Math.min(dSpine, dTop, dBot);
          const kCov = 1 - smoothstep(-maa, maa, dK);
          if (kCov > 0) {
            [r, g, b, a] = over(r, g, b, a, 243, 245, 248, kCov * outerMask);
          }

          // 6. International Orange hardware LED square (#FF4F00) + top lens specular strip
          const dLed = sdRoundedBox(mu, mv, 44.0, 23.2, 4.2, 4.2, 1.4);
          const ledCov = 1 - smoothstep(-maa, maa, dLed);
          if (ledCov > 0) {
            [r, g, b, a] = over(r, g, b, a, 255, 79, 0, ledCov * outerMask);
          }
          if (!isSmall) {
            const dLens = sdRoundedBox(mu, mv, 44.0, 20.5, 2.8, 0.65, 0.45);
            const lensCov = 1 - smoothstep(-maa, maa, dLens);
            if (lensCov > 0) {
              [r, g, b, a] = over(r, g, b, a, 255, 214, 184, 0.5 * lensCov * outerMask);
            }
          }

          // 7. Three stepped hardware telemetry signal bars (aligned bottom with K at y=45.0)
          const dBar1 = sdRoundedBox(mu, mv, 44.0, 32.8, 4.2, 1.4, 0.55);
          const bar1 = 1 - smoothstep(-maa, maa, dBar1);
          if (bar1 > 0) {
            [r, g, b, a] = over(r, g, b, a, 132, 143, 158, bar1 * outerMask);
          }

          const dBar2 = sdRoundedBox(mu, mv, 42.65, 38.2, 2.85, 1.4, 0.55);
          const bar2 = 1 - smoothstep(-maa, maa, dBar2);
          if (bar2 > 0) {
            [r, g, b, a] = over(r, g, b, a, 180, 188, 201, bar2 * outerMask);
          }

          const dBar3 = sdRoundedBox(mu, mv, 44.0, 43.6, 4.2, 1.4, 0.55);
          const bar3 = 1 - smoothstep(-maa, maa, dBar3);
          if (bar3 > 0) {
            [r, g, b, a] = over(r, g, b, a, 243, 245, 248, bar3 * outerMask);
          }

          accR += r * a;
          accG += g * a;
          accB += b * a;
          accA += a;
        }
      }

      const idx = (y * size + x) * 4;
      const alpha = accA / 16;
      if (alpha > 1e-4) {
        rgba[idx] = Math.round(clamp(accR / accA, 0, 255));
        rgba[idx + 1] = Math.round(clamp(accG / accA, 0, 255));
        rgba[idx + 2] = Math.round(clamp(accB / accA, 0, 255));
        rgba[idx + 3] = Math.round(clamp(alpha * 255, 0, 255));
      }
    }
  }

  return encodePng(size, size, rgba);
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="chassis" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B0D11" />
      <stop offset="100%" stop-color="#08090B" />
    </linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#151921" />
      <stop offset="100%" stop-color="#0F1217" />
    </linearGradient>
    <radialGradient id="ledGlow" cx="44" cy="23.2" r="13.5" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FF4F00" stop-opacity="0.36" />
      <stop offset="100%" stop-color="#FF4F00" stop-opacity="0" />
    </radialGradient>
    <clipPath id="outerClip">
      <rect x="2" y="2" width="60" height="60" rx="11.5" />
    </clipPath>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="11.5" fill="url(#chassis)" />
  <g clip-path="url(#outerClip)" stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="0.7" fill="none">
    <line x1="16" y1="0" x2="16" y2="64" />
    <line x1="32" y1="0" x2="32" y2="64" />
    <line x1="48" y1="0" x2="48" y2="64" />
    <line x1="0" y1="16" x2="64" y2="16" />
    <line x1="0" y1="32" x2="64" y2="32" />
    <line x1="0" y1="48" x2="64" y2="48" />
  </g>
  <rect x="2.55" y="2.55" width="58.9" height="58.9" rx="11" fill="none" stroke="#FFFFFF" stroke-opacity="0.13" stroke-width="0.9" />
  <line x1="13.5" y1="2.55" x2="50.5" y2="2.55" stroke="#FFFFFF" stroke-opacity="0.2" stroke-width="0.8" />
  <rect x="11" y="11" width="42" height="42" rx="5.5" fill="url(#plate)" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="0.85" />
  <line x1="16.5" y1="11.45" x2="47.5" y2="11.45" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="0.85" />
  <line x1="37.6" y1="15.2" x2="37.6" y2="48.8" stroke="#FFFFFF" stroke-opacity="0.075" stroke-width="0.7" />
  <circle cx="44" cy="23.2" r="13.5" fill="url(#ledGlow)" />
  <path d="M16.4 19H21.5V29.5L30.2 19H35.9L25.4 32L35.9 45H30.2L21.5 34.5V45H16.4Z" fill="#F3F5F8" />
  <rect x="39.8" y="19" width="8.4" height="8.4" rx="1.4" fill="#FF4F00" />
  <rect x="41.2" y="19.85" width="5.6" height="1.3" rx="0.45" fill="#FFD6B8" fill-opacity="0.5" />
  <rect x="39.8" y="31.4" width="8.4" height="2.8" rx="0.55" fill="#848F9E" />
  <rect x="39.8" y="36.8" width="5.7" height="2.8" rx="0.55" fill="#B4BCC9" />
  <rect x="39.8" y="42.2" width="8.4" height="2.8" rx="0.55" fill="#F3F5F8" />
</svg>
`;

const TARGETS = [
  { file: 'favicon-32.png', size: 32, mode: 'any' },
  { file: 'apple-touch-icon.png', size: 180, mode: 'apple' },
  { file: 'icon-192.png', size: 192, mode: 'any' },
  { file: 'icon-512.png', size: 512, mode: 'any' },
  { file: 'icon-maskable-192.png', size: 192, mode: 'maskable' },
  { file: 'icon-maskable-512.png', size: 512, mode: 'maskable' },
];

const root = process.cwd();
const iconsDir = join(root, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

for (const t of TARGETS) {
  const outPath = join(iconsDir, t.file);
  writeFileSync(outPath, renderIcon(t.size, t.mode));
  const info = verifyPng(outPath, t.size);
  console.log(`  [ok] public/icons/${t.file} (${info.width}x${info.height}, ${info.bytes} B)`);
}

writeFileSync(join(root, 'public', 'favicon.svg'), FAVICON_SVG);
console.log('  [ok] public/favicon.svg');
console.log('Generated and verified V2 industrial PWA icons & favicon.svg.');
