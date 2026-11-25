import { useId, useMemo } from 'react';

export interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
  animate?: boolean;
  showBaseline?: boolean;
  showEndDot?: boolean;
  ariaLabel?: string;
}

type Pt = readonly [number, number];

/**
 * Fritsch-Carlson monotone cubic Hermite spline.
 * Strictly preserves monotonicity between samples (zero negative-dip or peak overshoot).
 */
function buildMonotonePath(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`;
  if (n === 2) {
    return `M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)} L${pts[1]![0].toFixed(2)},${pts[1]![1].toFixed(2)}`;
  }

  const dx = new Float64Array(n - 1);
  const slopes = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]![0] - pts[i]![0];
    slopes[i] = dx[i]! !== 0 ? (pts[i + 1]![1] - pts[i]![1]) / dx[i]! : 0;
  }

  const tangents = new Float64Array(n);
  tangents[0] = slopes[0]!;
  tangents[n - 1] = slopes[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const d0 = slopes[i - 1]!;
    const d1 = slopes[i]!;
    tangents[i] = d0 * d1 <= 0 ? 0 : (d0 + d1) * 0.5;
  }

  // Fritsch-Carlson monotonicity clamp
  for (let i = 0; i < n - 1; i++) {
    const d = slopes[i]!;
    if (d === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i]! / d;
      const b = tangents[i + 1]! / d;
      const magSq = a * a + b * b;
      if (magSq > 9) {
        const tau = 3 / Math.sqrt(magSq);
        tangents[i] = tau * a * d;
        tangents[i + 1] = tau * b * d;
      }
    }
  }

  const segs: string[] = [`M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const h3 = dx[i]! / 3;
    const c1x = p0[0] + h3;
    const c1y = p0[1] + tangents[i]! * h3;
    const c2x = p1[0] - h3;
    const c2y = p1[1] - tangents[i + 1]! * h3;
    segs.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p1[0].toFixed(2)},${p1[1].toFixed(2)}`,
    );
  }
  return segs.join(' ');
}

/** Razor-sharp 30-day commit-velocity oscilloscope sparkline (monotone cubic Hermite). */
export function Sparkline({
  values,
  color,
  width = 120,
  height = 32,
  className = '',
  animate = true,
  showBaseline = true,
  showEndDot = true,
  ariaLabel,
}: SparklineProps) {
  const id = useId().replace(/:/g, '');
  const padX = 3;
  const padY = 3.5;
  const baselineY = height - padY;

  const { pts, linePath, areaPath, flat, lastActive } = useMemo(() => {
    let safe = values.length > 0 ? values : [0, 0];
    // Trim flat leading silence when all non-zero activity lands in the trailing half,
    // keeping 2 lead-in samples and at least 12 points so the waveform spans the full width expressively.
    if (safe.length > 14) {
      const firstNonZero = safe.findIndex((v) => v > 0);
      if (firstNonZero > 0 && firstNonZero >= Math.floor(safe.length * 0.5)) {
        const start = Math.min(safe.length - 12, Math.max(0, firstNonZero - 2));
        safe = safe.slice(start);
      }
    }
    const max = Math.max(1, ...safe);
    const isFlat = safe.every((v) => v <= 0);
    const spanX = Math.max(1, width - padX * 2);
    const spanY = Math.max(1, height - padY * 2);

    const points: Pt[] = safe.map((v, i) => {
      const x = safe.length === 1 ? width * 0.5 : padX + (i / (safe.length - 1)) * spanX;
      const clamped = Math.max(0, v);
      const y = baselineY - (clamped / max) * spanY;
      return [x, y] as const;
    });

    const d = buildMonotonePath(points);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const area = isFlat
      ? ''
      : `${d} L${last[0].toFixed(2)},${baselineY.toFixed(2)} L${first[0].toFixed(2)},${baselineY.toFixed(2)} Z`;

    return {
      pts: points,
      linePath: d,
      areaPath: area,
      flat: isFlat,
      lastActive: (safe[safe.length - 1] ?? 0) > 0,
    };
  }, [values, width, height, baselineY]);

  const last = pts[pts.length - 1];
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  const label = ariaLabel ?? `Commit velocity over ${values.length} days: ${total} total`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={`text-ink ${className}`}
      role="img"
      aria-label={label}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`sp-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {showBaseline && (
        <line
          x1={padX}
          y1={baselineY}
          x2={width - padX}
          y2={baselineY}
          stroke="currentColor"
          strokeOpacity={0.14}
          strokeWidth={0.75}
          shapeRendering="crispEdges"
        />
      )}

      {!flat && areaPath && <path d={areaPath} fill={`url(#sp-fill-${id})`} />}

      <path
        d={linePath}
        pathLength={100}
        fill="none"
        stroke={flat ? 'currentColor' : color}
        strokeOpacity={flat ? 0.22 : 1}
        strokeWidth={flat ? 1 : 1.55}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate && !flat ? 'spark-line' : undefined}
        style={{ ['--len' as string]: 100 }}
      />

      {showEndDot && !flat && last && (
        <g>
          {lastActive && <circle cx={last[0]} cy={last[1]} r={4.5} fill={color} fillOpacity={0.22} />}
          <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
        </g>
      )}
    </svg>
  );
}
