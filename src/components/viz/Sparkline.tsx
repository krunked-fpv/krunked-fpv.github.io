import { useId } from 'react';

interface Props {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
  animate?: boolean;
}

/** Glowing SVG commit-momentum waveform (catmull-rom smoothed). */
export function Sparkline({ values, color, width = 120, height = 32, className = '', animate = true }: Props) {
  const id = useId().replace(/:/g, '');
  const max = Math.max(1, ...values);
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = pts.reduce((d, p, i, a) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const p0 = a[i - 2] ?? a[i - 1]!;
    const p1 = a[i - 1]!;
    const p2 = p;
    const p3 = a[i + 1] ?? p;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    return `${d} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }, '');
  const last = pts[pts.length - 1];
  const flat = values.every((v) => v === 0);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`Activity, last ${values.length} days: ${values.join(', ')}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!flat && last && pts[0] && <path d={`${path} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#a${id})`} />}
      <path
        d={path}
        pathLength={100}
        fill="none"
        stroke={flat ? 'rgba(255,255,255,0.18)' : color}
        strokeWidth={flat ? 1 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate && !flat ? 'spark-line' : undefined}
        style={{ ['--len' as string]: 100, filter: flat ? undefined : `drop-shadow(0 0 4px ${color})` }}
      />
      {!flat && last && <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />}
    </svg>
  );
}
