import { useMemo } from 'react';
import { buildEmblemSpec, type EmblemShape } from '../../art/swissEmblem';

export interface SwissEmblemProps {
  slug: string;
  size?: number;
  hue?: number;
  accent?: string;
  framed?: boolean;
  className?: string;
  ariaLabel?: string;
}

const ATTR_MAP: Record<string, string> = {
  'fill-opacity': 'fillOpacity',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
};

function toReactAttrs(attrs: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[ATTR_MAP[k] ?? k] = v;
  }
  return out;
}

function renderShapeNode(shape: EmblemShape, key: string) {
  const props = toReactAttrs(shape.attrs);
  switch (shape.tag) {
    case 'rect':
      return <rect key={key} {...props} />;
    case 'circle':
      return <circle key={key} {...props} />;
    case 'line':
      return <line key={key} {...props} />;
    case 'path':
      return <path key={key} {...props} />;
    case 'polygon':
      return <polygon key={key} {...props} />;
  }
}

/** Deterministic FNV-1a Swiss-grid architectural micro-emblem (pure JSX, dual-theme currentColor). */
export function SwissEmblem({
  slug,
  size = 36,
  hue,
  accent,
  framed = true,
  className = '',
  ariaLabel,
}: SwissEmblemProps) {
  const spec = useMemo(
    () => buildEmblemSpec(slug, { size, hue, accent, ariaLabel }),
    [slug, size, hue, accent, ariaLabel],
  );

  return (
    <svg
      viewBox="0 0 48 48"
      width={spec.pxSize}
      height={spec.pxSize}
      role="img"
      aria-label={spec.ariaLabel}
      data-emblem-hash={spec.hashHex}
      data-emblem-archetype={spec.archetype}
      className={`inline-block shrink-0 text-ink ${className}`}
    >
      {framed && spec.frameShapes.map((shape, idx) => renderShapeNode(shape, `f-${idx}`))}
      <g transform={spec.transform || undefined}>
        {spec.innerShapes.map((shape, idx) => renderShapeNode(shape, `i-${idx}`))}
      </g>
    </svg>
  );
}
