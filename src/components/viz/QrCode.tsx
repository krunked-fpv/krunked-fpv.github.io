import { useMemo } from 'react';
import {
  buildQrPath,
  encodeQrMatrix,
  renderQrSvgString,
  type QrEcLevel,
  type QrSvgOptions,
} from '../../art/qr';

export interface QrCodeProps {
  value: string;
  size?: number;
  ecLevel?: QrEcLevel;
  quietZone?: number;
  fg?: string;
  bg?: string;
  framed?: boolean;
  label?: string;
  className?: string;
}

/** Triggers a clean standalone .svg file download for a QR code payload. */
export function downloadQrSvg(value: string, filename = 'forge-deck-qr.svg', options: QrSvgOptions = {}): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const svg = renderQrSvgString(value, { size: 512, ecLevel: 'M', quietZone: 4, ...options });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure-JSX ISO/IEC 18004 QR SVG Component.
 * Always renders with a mandatory 4-module quiet zone and high-contrast light plate
 * (#FFFFFF bg / #090B0F fg) for reliable camera lock in both Obsidian and Braun Daylight.
 */
export function QrCode({
  value,
  size = 200,
  ecLevel = 'M',
  quietZone = 4,
  fg = '#090B0F',
  bg = '#FFFFFF',
  framed = true,
  label,
  className = '',
}: QrCodeProps) {
  const encoded = useMemo(() => {
    try {
      const matrix = encodeQrMatrix(value, { ecLevel });
      const { total, pathD } = buildQrPath(matrix, quietZone);
      return { ok: true as const, matrix, total, pathD };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Unable to encode QR payload',
      };
    }
  }, [value, ecLevel, quietZone]);

  if (!encoded.ok) {
    return (
      <div
        className={`mono flex items-center justify-center rounded-xl border border-hairline bg-inset p-4 text-center text-[11px] text-dim ${className}`}
        style={{ width: size, minHeight: Math.min(size, 120) }}
        role="status"
      >
        {encoded.error}
      </div>
    );
  }

  const ariaLabel = label ?? `QR code for ${value} (v${encoded.matrix.version}, EC ${encoded.matrix.ecLevel})`;

  const svgNode = (
    <svg
      viewBox={`0 0 ${encoded.total} ${encoded.total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={ariaLabel}
      data-qr-version={encoded.matrix.version}
      data-qr-ec={encoded.matrix.ecLevel}
      data-qr-mask={encoded.matrix.mask}
      className="block max-w-full rounded-[6px]"
    >
      {bg !== 'transparent' && bg !== 'none' && <rect width={encoded.total} height={encoded.total} fill={bg} />}
      <path d={encoded.pathD} fill={fg} />
    </svg>
  );

  if (!framed) {
    return <span className={`inline-block ${className}`}>{svgNode}</span>;
  }

  return (
    <div
      className={`inline-flex flex-col items-center gap-2 rounded-xl border border-hairline bg-surface p-2.5 shadow-sm ${className}`}
    >
      <div className="overflow-hidden rounded-[8px] border border-hairline bg-[#FFFFFF] p-1">
        {svgNode}
      </div>
      <div className="mono flex w-full items-center justify-between gap-2 px-0.5 text-[10px] tracking-wider text-mute">
        <span>ISO-18004 // V{encoded.matrix.version}</span>
        <span>ECC-{encoded.matrix.ecLevel}</span>
      </div>
    </div>
  );
}
