/**
 * Zero-dependency ISO/IEC 18004 Byte-Mode QR Matrix Encoder & Crisp SVG Renderer.
 * Supports Versions 1 through 14 across Error Correction Levels L, M, Q, H.
 * Pure TypeScript (Node.js / Vitest / browser safe).
 */

export type QrEcLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  version: number;
  size: number;
  ecLevel: QrEcLevel;
  mask: number;
  modules: Uint8Array[];
}

export interface QrSvgOptions {
  ecLevel?: QrEcLevel;
  quietZone?: number;
  size?: number;
  fg?: string;
  bg?: string;
  className?: string;
  ariaLabel?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_ENCODER = new TextEncoder();

const EC_FORMAT_BITS: Record<QrEcLevel, number> = {
  M: 0,
  L: 1,
  H: 2,
  Q: 3,
};

const EC_INDEX: Record<QrEcLevel, number> = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3,
};

type VersionEntry = readonly [
  totalCodewords: number,
  ecPerBlock: readonly [number, number, number, number],
  numBlocks: readonly [number, number, number, number],
];

// Per version 1..14: [totalCodewords, ecPerBlock[L,M,Q,H], numBlocks[L,M,Q,H]]
const VERSION_SPEC: readonly (VersionEntry | null)[] = [
  null,
  [26, [7, 10, 13, 17], [1, 1, 1, 1]],
  [44, [10, 16, 22, 28], [1, 1, 1, 1]],
  [70, [15, 26, 18, 22], [1, 1, 2, 2]],
  [100, [20, 18, 26, 16], [1, 2, 2, 4]],
  [134, [26, 24, 18, 22], [1, 2, 4, 4]],
  [172, [18, 16, 24, 28], [2, 4, 4, 4]],
  [196, [20, 18, 18, 26], [2, 4, 6, 5]],
  [242, [24, 22, 22, 26], [2, 4, 6, 6]],
  [292, [30, 22, 20, 24], [2, 5, 8, 8]],
  [346, [18, 26, 24, 28], [4, 5, 8, 8]],
  [404, [20, 30, 28, 24], [4, 5, 8, 11]],
  [466, [24, 22, 26, 28], [4, 8, 10, 11]],
  [532, [26, 22, 24, 22], [4, 9, 12, 16]],
  [581, [30, 24, 20, 24], [4, 9, 16, 16]],
];

// GF(256) lookup tables modulo primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D).
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] ?? 0) + (GF_LOG[b] ?? 0)] ?? 0;
}

function buildReedSolomonDivisor(degree: number): Uint8Array {
  let coeffs = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(coeffs.length + 1);
    const root = GF_EXP[i] ?? 1;
    for (let j = 0; j < coeffs.length; j++) {
      const c = coeffs[j] ?? 0;
      next[j] = (next[j] ?? 0) ^ c;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(c, root);
    }
    coeffs = next;
  }
  return coeffs;
}

function computeReedSolomonRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const divisor = buildReedSolomonDivisor(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = (data[i] ?? 0) ^ (rem[0] ?? 0);
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] = (rem[j] ?? 0) ^ gfMul(divisor[j + 1] ?? 0, factor);
      }
    }
  }
  return rem;
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  const step = Math.ceil((last - 6) / (count * 2 - 2)) * 2;
  const pos = [6];
  for (let p = last; pos.length < count; p -= step) {
    pos.splice(1, 0, p);
  }
  return pos;
}

function getDataCodewordCount(version: number, ecLevel: QrEcLevel): number {
  const spec = VERSION_SPEC[version]!;
  const idx = EC_INDEX[ecLevel];
  return spec[0] - (spec[1][idx] ?? 0) * (spec[2][idx] ?? 0);
}

function chooseVersion(byteLength: number, ecLevel: QrEcLevel): number {
  for (let v = 1; v < VERSION_SPEC.length; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    const capacityBits = getDataCodewordCount(v, ecLevel) * 8;
    if (requiredBits <= capacityBits) return v;
  }
  throw new RangeError(
    `QR payload (${byteLength} bytes) exceeds supported Version 14 capacity at EC level ${ecLevel}`,
  );
}

class BitBuffer {
  bytes: number[] = [];
  bitLen = 0;

  appendBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      if (this.bitLen % 8 === 0) this.bytes.push(0);
      if ((val >>> i) & 1) {
        const lastIdx = this.bytes.length - 1;
        this.bytes[lastIdx] = (this.bytes[lastIdx] ?? 0) | (0x80 >>> (this.bitLen % 8));
      }
      this.bitLen++;
    }
  }
}

function encodeDataCodewords(utf8Bytes: Uint8Array, version: number, ecLevel: QrEcLevel): Uint8Array {
  const dataCwCount = getDataCodewordCount(version, ecLevel);
  const capacityBits = dataCwCount * 8;
  const countBits = version <= 9 ? 8 : 16;
  const buf = new BitBuffer();

  // Byte mode indicator 0100 + length + payload bytes.
  buf.appendBits(0b0100, 4);
  buf.appendBits(utf8Bytes.length, countBits);
  for (let i = 0; i < utf8Bytes.length; i++) {
    buf.appendBits(utf8Bytes[i] ?? 0, 8);
  }

  // Terminator up to 4 zero bits + byte alignment + 0xEC/0x11 pad bytes.
  const terminatorLen = Math.min(4, capacityBits - buf.bitLen);
  buf.appendBits(0, terminatorLen);
  const remBits = buf.bitLen % 8;
  if (remBits !== 0) buf.appendBits(0, 8 - remBits);

  let padToggle = 0;
  while (buf.bytes.length < dataCwCount) {
    buf.appendBits(padToggle === 0 ? 0xec : 0x11, 8);
    padToggle ^= 1;
  }
  return Uint8Array.from(buf.bytes);
}

function addEccAndInterleave(dataBytes: Uint8Array, version: number, ecLevel: QrEcLevel): Uint8Array {
  const spec = VERSION_SPEC[version]!;
  const totalCw = spec[0];
  const idx = EC_INDEX[ecLevel];
  const ecLen = spec[1][idx] ?? 0;
  const numBlocks = spec[2][idx] ?? 1;

  const shortBlockLen = Math.floor(dataBytes.length / numBlocks);
  const numShortBlocks = numBlocks - (dataBytes.length % numBlocks);

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < numBlocks; b++) {
    const len = shortBlockLen + (b < numShortBlocks ? 0 : 1);
    const block = dataBytes.subarray(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonRemainder(block, ecLen));
  }

  const out = new Uint8Array(totalCw);
  let outPos = 0;
  const maxDataLen = shortBlockLen + (numShortBlocks < numBlocks ? 1 : 0);

  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      const blk = dataBlocks[b]!;
      if (i < blk.length) out[outPos++] = blk[i] ?? 0;
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      out[outPos++] = ecBlocks[b]?.[i] ?? 0;
    }
  }
  return out;
}

function createMatrix(size: number): Uint8Array[] {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

function setFunctionModule(modules: Uint8Array[], isFunction: Uint8Array[], r: number, c: number, dark: boolean | number) {
  modules[r]![c] = dark ? 1 : 0;
  isFunction[r]![c] = 1;
}

function drawFinderPattern(modules: Uint8Array[], isFunction: Uint8Array[], size: number, top: number, left: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = top + dr;
      const c = left + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      const dark = dist <= 1 || dist === 3;
      setFunctionModule(modules, isFunction, r, c, dark);
    }
  }
}

function drawAlignmentPattern(modules: Uint8Array[], isFunction: Uint8Array[], cr: number, cc: number) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      setFunctionModule(modules, isFunction, cr + dr, cc + dc, dist === 0 || dist === 2);
    }
  }
}

function drawVersionInfo(modules: Uint8Array[], isFunction: Uint8Array[], size: number, version: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = (bits >>> i) & 1;
    const a = Math.floor(i / 3);
    const b = size - 11 + (i % 3);
    setFunctionModule(modules, isFunction, a, b, bit);
    setFunctionModule(modules, isFunction, b, a, bit);
  }
}

function reserveAndDrawFunctionPatterns(modules: Uint8Array[], isFunction: Uint8Array[], version: number) {
  const size = modules.length;

  // Timing patterns on row 6 and column 6.
  for (let i = 0; i < size; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    setFunctionModule(modules, isFunction, 6, i, bit);
    setFunctionModule(modules, isFunction, i, 6, bit);
  }

  // Three 7x7 finder patterns with 1-module white separators.
  drawFinderPattern(modules, isFunction, size, 0, 0);
  drawFinderPattern(modules, isFunction, size, 0, size - 7);
  drawFinderPattern(modules, isFunction, size, size - 7, 0);

  // Alignment patterns for version >= 2 (skipping finder corners).
  const alignPos = getAlignmentPositions(version);
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const r = alignPos[i]!;
      const c = alignPos[j]!;
      const overlapsFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === alignPos.length - 1) ||
        (i === alignPos.length - 1 && j === 0);
      if (!overlapsFinder) drawAlignmentPattern(modules, isFunction, r, c);
    }
  }

  // Reserve format info strips + mandatory dark module at (4*version + 9, 8).
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunction[8]![i] = 1;
      isFunction[i]![8] = 1;
    }
  }
  for (let i = size - 8; i < size; i++) {
    isFunction[8]![i] = 1;
    isFunction[i]![8] = 1;
  }
  setFunctionModule(modules, isFunction, 4 * version + 9, 8, 1);

  drawVersionInfo(modules, isFunction, size, version);
}

function drawFormatBits(modules: Uint8Array[], ecLevel: QrEcLevel, maskPattern: number) {
  const size = modules.length;
  const data = (EC_FORMAT_BITS[ecLevel] << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) modules[i]![8] = (bits >>> i) & 1;
  modules[7]![8] = (bits >>> 6) & 1;
  modules[8]![8] = (bits >>> 7) & 1;
  modules[8]![7] = (bits >>> 8) & 1;
  for (let i = 9; i < 15; i++) modules[8]![14 - i] = (bits >>> i) & 1;

  for (let i = 0; i < 8; i++) modules[8]![size - 1 - i] = (bits >>> i) & 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i]![8] = (bits >>> i) & 1;
  modules[size - 8]![8] = 1;
}

function placeCodewords(modules: Uint8Array[], isFunction: Uint8Array[], codewords: Uint8Array) {
  const size = modules.length;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunction[r]![c]) {
          let dark = 0;
          if (bitIndex < totalBits) {
            dark = ((codewords[bitIndex >>> 3] ?? 0) >>> (7 - (bitIndex & 7))) & 1;
          }
          modules[r]![c] = dark;
          bitIndex++;
        }
      }
    }
    upward = !upward;
  }
}

const MASK_PREDICATES: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(modules: Uint8Array[], isFunction: Uint8Array[], maskPattern: number) {
  const size = modules.length;
  const pred = MASK_PREDICATES[maskPattern]!;
  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    const fnRow = isFunction[r]!;
    for (let c = 0; c < size; c++) {
      if (!fnRow[c] && pred(r, c)) {
        row[c] = (row[c] ?? 0) ^ 1;
      }
    }
  }
}

function countFinderLikePatterns(line: Uint8Array): number {
  let count = 0;
  const n = line.length;
  for (let i = 0; i <= n - 11; i++) {
    if (
      line[i] === 1 &&
      line[i + 1] === 0 &&
      line[i + 2] === 1 &&
      line[i + 3] === 1 &&
      line[i + 4] === 1 &&
      line[i + 5] === 0 &&
      line[i + 6] === 1 &&
      line[i + 7] === 0 &&
      line[i + 8] === 0 &&
      line[i + 9] === 0 &&
      line[i + 10] === 0
    ) {
      count++;
    }
    if (
      line[i] === 0 &&
      line[i + 1] === 0 &&
      line[i + 2] === 0 &&
      line[i + 3] === 0 &&
      line[i + 4] === 1 &&
      line[i + 5] === 0 &&
      line[i + 6] === 1 &&
      line[i + 7] === 1 &&
      line[i + 8] === 1 &&
      line[i + 9] === 0 &&
      line[i + 10] === 1
    ) {
      count++;
    }
  }
  return count;
}

function computePenaltyScore(modules: Uint8Array[]): number {
  const size = modules.length;
  let penalty = 0;

  // N1 (5+ adjacent same-color) & N3 (1:1:3:1:1 finder-like) on rows & cols.
  const colLine = new Uint8Array(size);
  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    let runColor = row[0] ?? 0;
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (row[c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = row[c] ?? 0;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    penalty += countFinderLikePatterns(row) * 40;
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size; r++) colLine[r] = modules[r]![c] ?? 0;
    let runColor = colLine[0] ?? 0;
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (colLine[r] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = colLine[r] ?? 0;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    penalty += countFinderLikePatterns(colLine) * 40;
  }

  // N2 (2x2 same-color blocks) + N4 dark balance.
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    const nextRow = modules[r + 1];
    for (let c = 0; c < size; c++) {
      const v = row[c] ?? 0;
      darkCount += v;
      if (nextRow && c < size - 1) {
        if (v === row[c + 1] && v === nextRow[c] && v === nextRow[c + 1]) {
          penalty += 3;
        }
      }
    }
  }

  const totalModules = size * size;
  const k = Math.floor((Math.abs(darkCount * 2 - totalModules) * 10) / totalModules);
  penalty += k * 10;
  return penalty;
}

/** Encodes UTF-8 text into a genuine ISO/IEC 18004 byte-mode QR matrix (Versions 1..14). */
export function encodeQrMatrix(text: string, options: { ecLevel?: QrEcLevel } = {}): QrMatrix {
  const rawEc = String(options.ecLevel ?? 'M').toUpperCase() as QrEcLevel;
  if (!(rawEc in EC_INDEX)) {
    throw new RangeError(`Unsupported QR error correction level: ${rawEc}`);
  }

  const utf8Bytes = TEXT_ENCODER.encode(String(text ?? ''));
  const version = chooseVersion(utf8Bytes.length, rawEc);
  const size = 17 + 4 * version;

  const dataBytes = encodeDataCodewords(utf8Bytes, version, rawEc);
  const allCodewords = addEccAndInterleave(dataBytes, version, rawEc);

  const baseModules = createMatrix(size);
  const isFunction = createMatrix(size);
  reserveAndDrawFunctionPatterns(baseModules, isFunction, version);
  placeCodewords(baseModules, isFunction, allCodewords);

  let bestMask = 0;
  let bestScore = Infinity;
  let bestModules: Uint8Array[] = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row) => row.slice());
    applyMask(candidate, isFunction, mask);
    drawFormatBits(candidate, rawEc, mask);
    const score = computePenaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestModules = candidate;
    }
  }

  return { version, size, ecLevel: rawEc, mask: bestMask, modules: bestModules };
}

/** Compacts dark QR modules via horizontal run-length encoding with mandatory quiet zone offset. */
export function buildQrPath(matrix: QrMatrix, quietZone = 4): { total: number; pathD: string } {
  const qz = Number.isInteger(quietZone) && quietZone >= 0 ? quietZone : 4;
  const { size, modules } = matrix;
  const total = size + qz * 2;
  const segments: string[] = [];

  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    let c = 0;
    while (c < size) {
      if (row[c] === 1) {
        const start = c;
        while (c < size && row[c] === 1) c++;
        const len = c - start;
        segments.push(`M${start + qz},${r + qz}h${len}v1h-${len}z`);
      } else {
        c++;
      }
    }
  }
  return { total, pathD: segments.join('') };
}

function sanitizeColor(value: string | undefined, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  if (/^(currentColor|transparent|none)$/i.test(raw)) return raw;
  if (/^var\(--[a-z0-9-]+(?:\s*,\s*#[0-9a-fA-F]{3,8})?\)$/i.test(raw)) return raw;
  return fallback;
}

function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Renders a standalone crisp ISO/IEC 18004 QR SVG string (default high-contrast light plate). */
export function renderQrSvgString(text: string, options: QrSvgOptions = {}): string {
  const ecLevel = options.ecLevel ?? 'M';
  const quietZone = Number.isInteger(options.quietZone) && (options.quietZone ?? 4) >= 0 ? options.quietZone! : 4;
  const fg = sanitizeColor(options.fg, '#090B0F');
  const bg = sanitizeColor(options.bg, '#FFFFFF');
  const pxSize =
    typeof options.size === 'number' && Number.isFinite(options.size) && options.size > 0
      ? Math.round(options.size)
      : 220;
  const className = String(options.className || 'qr-svg').replace(/[^a-zA-Z0-9_\-\s]/g, '');

  const matrix = encodeQrMatrix(text, { ecLevel });
  const { total, pathD } = buildQrPath(matrix, quietZone);
  const ariaLabel = String(options.ariaLabel || `QR code v${matrix.version} (${matrix.ecLevel})`);

  const bgRect =
    bg.toLowerCase() === 'transparent' || bg.toLowerCase() === 'none'
      ? ''
      : `<rect width="${total}" height="${total}" fill="${escapeXmlAttr(bg)}"/>`;

  return [
    `<svg xmlns="${SVG_NS}" class="${escapeXmlAttr(className)}"`,
    ` viewBox="0 0 ${total} ${total}"`,
    ` width="${pxSize}" height="${pxSize}"`,
    ` shape-rendering="crispEdges" role="img"`,
    ` aria-label="${escapeXmlAttr(ariaLabel)}"`,
    ` data-qr-version="${matrix.version}" data-qr-ec="${matrix.ecLevel}" data-qr-mask="${matrix.mask}">`,
    bgRect,
    `<path d="${pathD}" fill="${escapeXmlAttr(fg)}"/>`,
    `</svg>`,
  ].join('');
}
