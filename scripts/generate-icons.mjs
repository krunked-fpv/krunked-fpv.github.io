import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function sdRoundedRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function blend(dstR, dstG, dstB, dstA, srcR, srcG, srcB, srcA) {
  const a = srcA + dstA * (1 - srcA);
  if (a <= 1e-6) return [0, 0, 0, 0];
  return [
    (srcR * srcA + dstR * dstA * (1 - srcA)) / a,
    (srcG * srcA + dstG * dstA * (1 - srcA)) / a,
    (srcB * srcA + dstB * dstA * (1 - srcA)) / a,
    a,
  ];
}

/** 4x4 supersampled rasterizer for Forge Deck mark (obsidian chassis + emerald/cyan K-anvil). */
function renderIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const sub = [-0.375, -0.125, 0.125, 0.375];
  const markScale = maskable ? 0.68 : 0.86;
  const stroke = 0.068 * markScale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let accR = 0, accG = 0, accB = 0, accA = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const nx = ((x + 0.5 + sub[sx]) / size) * 2 - 1;
          const ny = ((y + 0.5 + sub[sy]) / size) * 2 - 1;

          // Base background: obsidian gradient (#0D1015 -> #07080A)
          const tY = clamp((ny + 1) * 0.5, 0, 1);
          let r = 13 + (7 - 13) * tY;
          let g = 16 + (8 - 16) * tY;
          let b = 21 + (10 - 21) * tY;
          let a = 1;

          if (!maskable) {
            const dBox = sdRoundedRect(nx, ny, 0.94, 0.94, 0.38);
            const mask = 1 - smoothstep(-0.012, 0.012, dBox);
            if (mask <= 0) continue;
            a = mask;
            // Inner translucent 1px hairline border
            const border = (1 - smoothstep(0.0, 0.024, Math.abs(dBox + 0.02)));
            [r, g, b, a] = blend(r, g, b, a, 255, 255, 255, 0.12 * border * mask);
          } else {
            // Subtle chamfer hairline inside maskable safe zone
            const dSafe = sdRoundedRect(nx, ny, 0.72, 0.72, 0.24);
            const border = 1 - smoothstep(0.0, 0.018, Math.abs(dSafe));
            [r, g, b, a] = blend(r, g, b, a, 255, 255, 255, 0.06 * border);
          }

          // Top subtle cyan/emerald ambient key light
          const keyGlow = Math.exp(-((nx * nx) / 0.8 + ((ny + 0.55) * (ny + 0.55)) / 0.35)) * 0.14;
          [r, g, b, a] = blend(r, g, b, a, 16, 185, 129, keyGlow * a);

          // K-anvil mark geometry (scaled)
          const mx = nx / markScale;
          const my = ny / markScale;
          const dSpine = sdSegment(mx, my, -0.34, -0.46, -0.34, 0.46);
          const dTopArm = sdSegment(mx, my, -0.14, -0.02, 0.36, -0.44);
          const dBotArm = sdSegment(mx, my, -0.14, 0.02, 0.38, 0.46);
          const dAnvil = sdSegment(mx, my, -0.34, 0.0, -0.14, 0.0);
          const dMark = Math.min(dSpine, dTopArm, dBotArm, dAnvil) - stroke / markScale;

          // Soft luminary aura around mark
          if (dMark < 0.28) {
            const glow = Math.exp(-Math.max(0, dMark) * 11) * 0.24;
            [r, g, b, a] = blend(r, g, b, a, 16, 185, 129, glow * a);
          }

          // Crisp foreground stroke: emerald (#10B981) -> electric cyan (#06B6D4)
          const fg = 1 - smoothstep(-0.015, 0.015, dMark);
          if (fg > 0) {
            const gt = clamp((mx + 0.4) / 0.85, 0, 1);
            const mr = 16 + (6 - 16) * gt;
            const mg = 185 + (182 - 185) * gt;
            const mb = 129 + (212 - 129) * gt;
            [r, g, b, a] = blend(r, g, b, a, mr, mg, mb, fg * (maskable ? 1 : a));
          }

          // Accent forge spark dot top-right
          const dDot = Math.hypot(mx - 0.38, my - -0.44) - stroke * 0.45 / markScale;
          const dot = 1 - smoothstep(-0.015, 0.015, dDot);
          if (dot > 0) [r, g, b, a] = blend(r, g, b, a, 232, 250, 244, dot * 0.85);

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

const root = process.cwd();
const iconsDir = join(root, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

writeFileSync(join(iconsDir, 'favicon-32.png'), renderIcon(32, false));
writeFileSync(join(iconsDir, 'apple-touch-icon.png'), renderIcon(180, true));
writeFileSync(join(iconsDir, 'icon-192.png'), renderIcon(192, false));
writeFileSync(join(iconsDir, 'icon-512.png'), renderIcon(512, false));
writeFileSync(join(iconsDir, 'icon-maskable-512.png'), renderIcon(512, true));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0D1015"/>
      <stop offset="1" stop-color="#07080A"/>
    </linearGradient>
    <linearGradient id="k" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10B981"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bg)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
  <path d="M21 17v30M21 32h7l14-14M28 32l15 15" fill="none" stroke="url(#k)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(join(root, 'public', 'favicon.svg'), svg);
console.log('Generated PWA icons & favicon.svg in public/');
