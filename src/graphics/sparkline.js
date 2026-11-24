/**
 * Crisp 30-Day Telemetry Sparkline (Bar + Envelope Area + Baseline Ticks).
 * Zero external dependencies; Node.js and browser DOM safe.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function sanitizeColor(value, fallback) {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  if (/^(currentColor|none)$/i.test(raw)) return raw;
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

function normalizeCounts30d(counts30d) {
  const src = Array.isArray(counts30d) ? counts30d : [];
  const trimmed = src.length > 30 ? src.slice(-30) : src;
  const out = new Array(30).fill(0);
  const offset = 30 - trimmed.length;
  for (let i = 0; i < trimmed.length; i++) {
    const num = Number(trimmed[i]);
    out[offset + i] = Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
  }
  return out;
}

function buildSparklineSpec(counts30d, options = {}) {
  const values = normalizeCounts30d(counts30d);
  const width =
    typeof options?.width === 'number' && Number.isFinite(options.width) && options.width > 20
      ? Math.round(options.width)
      : 180;
  const height =
    typeof options?.height === 'number' && Number.isFinite(options.height) && options.height > 12
      ? Math.round(options.height)
      : 32;

  const accent = sanitizeColor(
    options?.accentColor ?? options?.color ?? options?.accent,
    'var(--led-hot, #FF4F00)'
  );
  const className = String(options?.className || 'sparkline-svg').replace(/[^a-zA-Z0-9_\-\s]/g, '');

  const baselineY = height - 5;
  const topPad = 3;
  const usableH = Math.max(4, baselineY - topPad);
  const maxVal = Math.max(0, ...values);
  const totalCommits = values.reduce((acc, v) => acc + v, 0);

  const slotW = width / 30;
  const barW = Math.max(1.5, +(slotW - 1.5).toFixed(2));
  const bars = [];
  const points = [];

  for (let i = 0; i < 30; i++) {
    const val = values[i];
    const x = +(i * slotW + (slotW - barW) / 2).toFixed(2);
    const cx = +(i * slotW + slotW / 2).toFixed(2);

    if (val === 0 || maxVal === 0) {
      bars.push({
        x,
        y: baselineY - 1.5,
        width: barW,
        height: 1.5,
        fill: 'currentColor',
        opacity: '0.22',
      });
      points.push({ x: cx, y: baselineY });
    } else {
      const h = Math.max(3, Math.round((val / maxVal) * usableH));
      const y = baselineY - h;
      const recencyBoost = 0.6 + 0.4 * (i / 29);
      bars.push({
        x,
        y,
        width: barW,
        height: h,
        fill: accent,
        opacity: recencyBoost.toFixed(2),
      });
      points.push({ x: cx, y });
    }
  }

  let areaPath = '';
  let ridgePath = '';
  if (maxVal > 0 && points.length > 0) {
    const ridgeParts = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`);
    ridgePath = ridgeParts.join(' ');
    areaPath = `${ridgePath} L${points[points.length - 1].x} ${baselineY} L${points[0].x} ${baselineY} Z`;
  }

  // Weekly telemetry baseline ticks across the 30-day window.
  const tickIndices = [0, 7, 14, 21, 29];
  const ticks = tickIndices.map((idx) => {
    const tx = +(idx * slotW + slotW / 2).toFixed(2);
    return { x1: tx, y1: baselineY, x2: tx, y2: baselineY + 3 };
  });

  return {
    width,
    height,
    baselineY,
    accent,
    className,
    totalCommits,
    maxVal,
    bars,
    ticks,
    areaPath,
    ridgePath,
    ariaLabel: String(
      options?.ariaLabel || `30-day commit sparkline (${totalCommits} commits total)`
    ),
  };
}

/**
 * Renders a 30-day telemetry sparkline as an SVG markup string.
 * @param {number[]} counts30d
 * @param {object} [options]
 * @returns {string}
 */
export function renderSparklineSvg(counts30d, options = {}) {
  const spec = buildSparklineSpec(counts30d, options);
  const parts = [
    `<svg xmlns="${SVG_NS}" class="${escapeXmlAttr(spec.className)}"`,
    ` viewBox="0 0 ${spec.width} ${spec.height}"`,
    ` width="${spec.width}" height="${spec.height}"`,
    ` role="img" aria-label="${escapeXmlAttr(spec.ariaLabel)}"`,
    ` data-commits-30d="${spec.totalCommits}">`,
  ];

  if (spec.areaPath) {
    parts.push(`<path d="${spec.areaPath}" fill="${escapeXmlAttr(spec.accent)}" fill-opacity="0.14"/>`);
    parts.push(
      `<path d="${spec.ridgePath}" fill="none" stroke="${escapeXmlAttr(spec.accent)}" stroke-width="1" stroke-opacity="0.55"/>`
    );
  }

  parts.push(
    `<line x1="0" y1="${spec.baselineY}" x2="${spec.width}" y2="${spec.baselineY}" stroke="currentColor" stroke-opacity="0.2" stroke-width="1"/>`
  );

  for (const t of spec.ticks) {
    parts.push(
      `<line x1="${t.x1}" y1="${t.y1}" x2="${t.x2}" y2="${t.y2}" stroke="currentColor" stroke-opacity="0.32" stroke-width="1"/>`
    );
  }

  for (const b of spec.bars) {
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${escapeXmlAttr(b.fill)}" fill-opacity="${b.opacity}" shape-rendering="crispEdges"/>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Mounts a 30-day telemetry sparkline SVG safely into a DOM container via DOM APIs.
 * @param {HTMLElement} containerEl
 * @param {number[]} counts30d
 * @param {object} [options]
 * @returns {SVGElement|null}
 */
export function mountSparkline(containerEl, counts30d, options = {}) {
  if (!containerEl || typeof document === 'undefined') return null;
  const spec = buildSparklineSpec(counts30d, options);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', spec.className);
  svg.setAttribute('viewBox', `0 0 ${spec.width} ${spec.height}`);
  svg.setAttribute('width', String(spec.width));
  svg.setAttribute('height', String(spec.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', spec.ariaLabel);
  svg.dataset.commits30d = String(spec.totalCommits);

  if (spec.areaPath) {
    const area = document.createElementNS(SVG_NS, 'path');
    area.setAttribute('d', spec.areaPath);
    area.setAttribute('fill', spec.accent);
    area.setAttribute('fill-opacity', '0.14');
    svg.appendChild(area);

    const ridge = document.createElementNS(SVG_NS, 'path');
    ridge.setAttribute('d', spec.ridgePath);
    ridge.setAttribute('fill', 'none');
    ridge.setAttribute('stroke', spec.accent);
    ridge.setAttribute('stroke-width', '1');
    ridge.setAttribute('stroke-opacity', '0.55');
    svg.appendChild(ridge);
  }

  const base = document.createElementNS(SVG_NS, 'line');
  base.setAttribute('x1', '0');
  base.setAttribute('y1', String(spec.baselineY));
  base.setAttribute('x2', String(spec.width));
  base.setAttribute('y2', String(spec.baselineY));
  base.setAttribute('stroke', 'currentColor');
  base.setAttribute('stroke-opacity', '0.2');
  base.setAttribute('stroke-width', '1');
  svg.appendChild(base);

  for (const t of spec.ticks) {
    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', String(t.x1));
    tick.setAttribute('y1', String(t.y1));
    tick.setAttribute('x2', String(t.x2));
    tick.setAttribute('y2', String(t.y2));
    tick.setAttribute('stroke', 'currentColor');
    tick.setAttribute('stroke-opacity', '0.32');
    tick.setAttribute('stroke-width', '1');
    svg.appendChild(tick);
  }

  for (const b of spec.bars) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(b.x));
    rect.setAttribute('y', String(b.y));
    rect.setAttribute('width', String(b.width));
    rect.setAttribute('height', String(b.height));
    rect.setAttribute('fill', b.fill);
    rect.setAttribute('fill-opacity', b.opacity);
    rect.setAttribute('shape-rendering', 'crispEdges');
    svg.appendChild(rect);
  }

  containerEl.replaceChildren(svg);
  return svg;
}
