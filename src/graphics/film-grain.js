/**
 * Idempotent 2.5% Opacity Monochrome SVG feTurbulence Anodized Chassis Grain Overlay.
 * Zero external dependencies; Node.js import safe; pure DOM node construction.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
let grainFilterCounter = 0;

/**
 * Injects a fixed pointer-events-none monochrome SVG feTurbulence overlay (idempotent).
 * @param {HTMLElement} [rootEl]
 * @returns {HTMLElement|null}
 */
export function mountFilmGrain(rootEl) {
  if (typeof document === 'undefined') return null;

  const target = rootEl || document.body || document.documentElement;
  if (!target) return null;

  const children = target.children ? Array.from(target.children) : [];
  const existing = children.find(
    (node) => node?.dataset?.krunkedFilmGrain === '1' || node?.classList?.contains('film-grain-overlay')
  );
  if (existing) return existing;

  const filterId = `krunked-film-grain-${++grainFilterCounter}`;

  const overlay = document.createElement('div');
  overlay.className = 'film-grain-overlay';
  overlay.dataset.krunkedFilmGrain = '1';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.opacity = '0.025';
  overlay.style.zIndex = '9000';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = '100%';

  const defs = document.createElementNS(SVG_NS, 'defs');
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '0%');
  filter.setAttribute('y', '0%');
  filter.setAttribute('width', '100%');
  filter.setAttribute('height', '100%');

  const turbulence = document.createElementNS(SVG_NS, 'feTurbulence');
  turbulence.setAttribute('type', 'fractalNoise');
  turbulence.setAttribute('baseFrequency', '0.82');
  turbulence.setAttribute('numOctaves', '3');
  turbulence.setAttribute('stitchTiles', 'stitch');
  turbulence.setAttribute('result', 'noise');

  const desaturate = document.createElementNS(SVG_NS, 'feColorMatrix');
  desaturate.setAttribute('type', 'saturate');
  desaturate.setAttribute('values', '0');
  desaturate.setAttribute('in', 'noise');

  filter.append(turbulence, desaturate);
  defs.appendChild(filter);

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('filter', `url(#${filterId})`);

  svg.append(defs, rect);
  overlay.appendChild(svg);
  target.appendChild(overlay);

  return overlay;
}
