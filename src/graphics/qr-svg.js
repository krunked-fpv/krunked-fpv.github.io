/**
 * Zero-dependency ISO/IEC 18004 Byte-Mode QR Matrix Encoder & Crisp SVG Renderer.
 * Supports Versions 1 through 14 across Error Correction Levels L, M, Q, H.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_ENCODER = new TextEncoder();

const EC_FORMAT_BITS = Object.freeze({
  M: 0,
  L: 1,
  H: 2,
  Q: 3,
});

// Per version 1..14: [totalCodewords, ecPerBlock[L,M,Q,H], numBlocks[L,M,Q,H]]
const VERSION_SPEC = Object.freeze([
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
]);

const EC_INDEX = Object.freeze({ L: 0, M: 1, Q: 2, H: 3 });

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

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildReedSolomonDivisor(degree) {
  let coeffs = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(coeffs.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < coeffs.length; j++) {
      next[j] ^= coeffs[j];
      next[j + 1] ^= gfMul(coeffs[j], root);
    }
    coeffs = next;
  }
  return coeffs;
}

function computeReedSolomonRemainder(data, ecCount) {
  const divisor = buildReedSolomonDivisor(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(divisor[j + 1], factor);
      }
    }
  }
  return rem;
}

function getAlignmentPositions(version) {
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

function getDataCodewordCount(version, ecLevel) {
  const [totalCw, ecList, blockList] = VERSION_SPEC[version];
  const idx = EC_INDEX[ecLevel];
  return totalCw - ecList[idx] * blockList[idx];
}

function chooseVersion(byteLength, ecLevel) {
  for (let v = 1; v < VERSION_SPEC.length; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    const capacityBits = getDataCodewordCount(v, ecLevel) * 8;
    if (requiredBits <= capacityBits) return v;
  }
  throw new RangeError(
    `QR payload (${byteLength} bytes) exceeds supported Version 14 capacity at EC level ${ecLevel}`
  );
}

class BitBuffer {
  constructor() {
    this.bytes = [];
    this.bitLen = 0;
  }
  appendBits(val, length) {
    for (let i = length - 1; i >= 0; i--) {
      if (this.bitLen % 8 === 0) this.bytes.push(0);
      if ((val >>> i) & 1) {
        this.bytes[this.bytes.length - 1] |= 0x80 >>> (this.bitLen % 8);
      }
      this.bitLen++;
    }
  }
}

function encodeDataCodewords(utf8Bytes, version, ecLevel) {
  const dataCwCount = getDataCodewordCount(version, ecLevel);
  const capacityBits = dataCwCount * 8;
  const countBits = version <= 9 ? 8 : 16;
  const buf = new BitBuffer();

  // Byte mode indicator 0100 + length + payload bytes.
  buf.appendBits(0b0100, 4);
  buf.appendBits(utf8Bytes.length, countBits);
  for (let i = 0; i < utf8Bytes.length; i++) {
    buf.appendBits(utf8Bytes[i], 8);
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

function addEccAndInterleave(dataBytes, version, ecLevel) {
  const [totalCw, ecList, blockList] = VERSION_SPEC[version];
  const idx = EC_INDEX[ecLevel];
  const ecLen = ecList[idx];
  const numBlocks = blockList[idx];

  const shortBlockLen = Math.floor(dataBytes.length / numBlocks);
  const numShortBlocks = numBlocks - (dataBytes.length % numBlocks);

  const dataBlocks = [];
  const ecBlocks = [];
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
      if (i < dataBlocks[b].length) out[outPos++] = dataBlocks[b][i];
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      out[outPos++] = ecBlocks[b][i];
    }
  }
  return out;
}

function createMatrix(size) {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

function setFunctionModule(modules, isFunction, r, c, dark) {
  modules[r][c] = dark ? 1 : 0;
  isFunction[r][c] = 1;
}

function drawFinderPattern(modules, isFunction, size, top, left) {
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

function drawAlignmentPattern(modules, isFunction, cr, cc) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      setFunctionModule(modules, isFunction, cr + dr, cc + dc, dist === 0 || dist === 2);
    }
  }
}

function drawVersionInfo(modules, isFunction, size, version) {
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

function reserveAndDrawFunctionPatterns(modules, isFunction, version) {
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
      const r = alignPos[i];
      const c = alignPos[j];
      const overlapsFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === alignPos.length - 1) ||
        (i === alignPos.length - 1 && j === 0);
      if (!overlapsFinder) drawAlignmentPattern(modules, isFunction, r, c);
    }
  }

  // Reserve format info strips + set mandatory dark module at (4*version + 9, 8).
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunction[8][i] = 1;
      isFunction[i][8] = 1;
    }
  }
  for (let i = size - 8; i < size; i++) {
    isFunction[8][i] = 1;
    isFunction[i][8] = 1;
  }
  setFunctionModule(modules, isFunction, 4 * version + 9, 8, 1);

  drawVersionInfo(modules, isFunction, size, version);
}

function drawFormatBits(modules, ecLevel, maskPattern) {
  const size = modules.length;
  const data = (EC_FORMAT_BITS[ecLevel] << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) modules[i][8] = (bits >>> i) & 1;
  modules[7][8] = (bits >>> 6) & 1;
  modules[8][8] = (bits >>> 7) & 1;
  modules[8][7] = (bits >>> 8) & 1;
  for (let i = 9; i < 15; i++) modules[8][14 - i] = (bits >>> i) & 1;

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = (bits >>> i) & 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = (bits >>> i) & 1;
  modules[size - 8][8] = 1;
}

function placeCodewords(modules, isFunction, codewords) {
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
        if (!isFunction[r][c]) {
          let dark = 0;
          if (bitIndex < totalBits) {
            dark = (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
          }
          modules[r][c] = dark;
          bitIndex++;
        }
      }
    }
    upward = !upward;
  }
}

const MASK_PREDICATES = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(modules, isFunction, maskPattern) {
  const size = modules.length;
  const pred = MASK_PREDICATES[maskPattern];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c] && pred(r, c)) {
        modules[r][c] ^= 1;
      }
    }
  }
}

function countFinderLikePatterns(line) {
  let count = 0;
  const n = line.length;
  for (let i = 0; i <= n - 11; i++) {
    // 10111010000 or 00001011101
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

function computePenaltyScore(modules) {
  const size = modules.length;
  let penalty = 0;

  // N1 (5+ adjacent same-color modules) and N3 (1:1:3:1:1 finder-like patterns) on rows & cols.
  const colLine = new Uint8Array(size);
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    let runColor = row[0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (row[c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = row[c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    penalty += countFinderLikePatterns(row) * 40;
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size; r++) colLine[r] = modules[r][c];
    let runColor = colLine[0];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (colLine[r] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = colLine[r];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    penalty += countFinderLikePatterns(colLine) * 40;
  }

  // N2 (2x2 same-color blocks) + N4 dark module balance.
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    for (let c = 0; c < size; c++) {
      const v = row[c];
      darkCount += v;
      if (r < size - 1 && c < size - 1) {
        if (v === row[c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
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

/**
 * Encodes UTF-8 text into a genuine ISO/IEC 18004 byte-mode QR matrix.
 * @param {string} text
 * @param {{ ecLevel?: 'L'|'M'|'Q'|'H' }} [options]
 * @returns {{ version: number, size: number, ecLevel: 'L'|'M'|'Q'|'H', modules: Uint8Array[] }}
 */
export function encodeQrMatrix(text, options = { ecLevel: 'M' }) {
  const ecLevel = String(options?.ecLevel ?? 'M').toUpperCase();
  if (!(ecLevel in EC_INDEX)) {
    throw new RangeError(`Unsupported QR error correction level: ${ecLevel}`);
  }

  const utf8Bytes = TEXT_ENCODER.encode(String(text ?? ''));
  const version = chooseVersion(utf8Bytes.length, ecLevel);
  const size = 17 + 4 * version;

  const dataBytes = encodeDataCodewords(utf8Bytes, version, ecLevel);
  const allCodewords = addEccAndInterleave(dataBytes, version, ecLevel);

  const baseModules = createMatrix(size);
  const isFunction = createMatrix(size);
  reserveAndDrawFunctionPatterns(baseModules, isFunction, version);
  placeCodewords(baseModules, isFunction, allCodewords);

  let bestMask = 0;
  let bestScore = Infinity;
  let bestModules = null;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row) => row.slice());
    applyMask(candidate, isFunction, mask);
    drawFormatBits(candidate, ecLevel, mask);
    const score = computePenaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestModules = candidate;
    }
  }

  // Re-ensure format bits correspond to winning mask (already set on bestModules).
  void bestMask;
  return { version, size, ecLevel, modules: bestModules };
}

function sanitizeColor(value, fallback) {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  if (/^(currentColor|transparent|none)$/i.test(raw)) return raw;
  if (/^var\(--[a-z0-9-]+(?:\s*,\s*#[0-9a-fA-F]{3,8})?\)$/i.test(raw)) return raw;
  return fallback;
}

function escapeXmlAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildQrSvgModel(text, options = {}) {
  const ecLevel = options?.ecLevel ?? 'M';
  const rawQuiet = options?.quietZone ?? options?.margin;
  const quietZone = Number.isInteger(rawQuiet) && rawQuiet >= 0 ? rawQuiet : 4;
  const fg = sanitizeColor(options?.fg ?? options?.fgColor ?? options?.darkColor, '#08090B');
  const bg = sanitizeColor(options?.bg ?? options?.bgColor ?? options?.lightColor, '#FFFFFF');
  const pxSize =
    typeof options?.size === 'number' && Number.isFinite(options.size) && options.size > 0
      ? Math.round(options.size)
      : 220;
  const className = String(options?.className || 'qr-svg').replace(/[^a-zA-Z0-9_\-\s]/g, '');

  const { version, size, ecLevel: resolvedEc, modules } = encodeQrMatrix(text, { ecLevel });
  const total = size + quietZone * 2;

  // Horizontal run-length encoding merges adjacent dark modules into crisp seamless rects.
  const segments = [];
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    let c = 0;
    while (c < size) {
      if (row[c] === 1) {
        const start = c;
        while (c < size && row[c] === 1) c++;
        const len = c - start;
        segments.push(`M${start + quietZone},${r + quietZone}h${len}v1h-${len}z`);
      } else {
        c++;
      }
    }
  }

  return {
    version,
    size,
    ecLevel: resolvedEc,
    total,
    pxSize,
    fg,
    bg,
    className,
    pathD: segments.join(''),
    ariaLabel: String(options?.ariaLabel || `QR code v${version} (${resolvedEc})`),
  };
}

/**
 * Renders a crisp ISO/IEC 18004 QR code as an SVG markup string with 4-module quiet zone.
 * @param {string} text
 * @param {object} [options]
 * @returns {string}
 */
export function renderQrSvgString(text, options = {}) {
  const model = buildQrSvgModel(text, options);
  const bgRect =
    model.bg.toLowerCase() === 'transparent' || model.bg.toLowerCase() === 'none'
      ? ''
      : `<rect width="${model.total}" height="${model.total}" fill="${escapeXmlAttr(model.bg)}"/>`;

  return [
    `<svg xmlns="${SVG_NS}" class="${escapeXmlAttr(model.className)}"`,
    ` viewBox="0 0 ${model.total} ${model.total}"`,
    ` width="${model.pxSize}" height="${model.pxSize}"`,
    ` shape-rendering="crispEdges" role="img"`,
    ` aria-label="${escapeXmlAttr(model.ariaLabel)}"`,
    ` data-qr-version="${model.version}" data-qr-ec="${model.ecLevel}">`,
    bgRect,
    `<path d="${model.pathD}" fill="${escapeXmlAttr(model.fg)}"/>`,
    `</svg>`,
  ].join('');
}

/**
 * Mounts a crisp QR SVG element safely into a DOM container via DOM APIs.
 * @param {HTMLElement} containerEl
 * @param {string} text
 * @param {object} [options]
 * @returns {SVGElement|null}
 */
export function mountQrSvg(containerEl, text, options = {}) {
  if (!containerEl || typeof document === 'undefined') return null;
  const model = buildQrSvgModel(text, options);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', model.className);
  svg.setAttribute('viewBox', `0 0 ${model.total} ${model.total}`);
  svg.setAttribute('width', String(model.pxSize));
  svg.setAttribute('height', String(model.pxSize));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', model.ariaLabel);
  svg.dataset.qrVersion = String(model.version);
  svg.dataset.qrEc = model.ecLevel;

  if (model.bg.toLowerCase() !== 'transparent' && model.bg.toLowerCase() !== 'none') {
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('width', String(model.total));
    bgRect.setAttribute('height', String(model.total));
    bgRect.setAttribute('fill', model.bg);
    svg.appendChild(bgRect);
  }

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', model.pathD);
  path.setAttribute('fill', model.fg);
  svg.appendChild(path);

  containerEl.replaceChildren(svg);
  return svg;
}
