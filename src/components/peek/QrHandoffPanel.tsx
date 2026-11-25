import { Check, Copy, Download, ExternalLink, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { renderQrSvgString } from '../../art/qr';
import { useFoley } from '../../audio/useFoley';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { Chip } from '../ui/Chip';
import { QrCode } from '../viz/QrCode';

export function QrHandoffPanel({ project }: { project: Project }) {
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();
  const [copied, setCopied] = useState(false);

  const targetUrl = project.launchUrl ?? project.sourceUrl;
  const isLive = Boolean(project.launchUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(targetUrl);
      foley.click();
      setCopied(true);
      toast('Copied handoff URL', 'ok');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Clipboard unavailable', 'warn');
    }
  };

  const handleDownloadSvg = () => {
    try {
      const svg = renderQrSvgString(targetUrl, {
        size: 512,
        quietZone: 4,
        ecLevel: 'M',
        ariaLabel: `QR code for ${project.displayName}`,
      });
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${project.name}.svg`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      foley.latch();
      toast(`Downloaded qr-${project.name}.svg`, 'ok');
    } catch {
      toast('Could not export QR SVG', 'warn');
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 rounded-[14px] border border-hairline bg-inset px-5 py-7 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Chip tone={isLive ? 'online' : 'neutral'} led>
          {isLive ? 'LIVE APP HANDOFF' : 'REPOSITORY HANDOFF'}
        </Chip>
        <Chip>ISO/IEC 18004</Chip>
      </div>

      <QrCode
        value={targetUrl}
        size={228}
        framed
        label={`QR code for ${project.displayName}`}
      />

      <div className="flex max-w-md flex-col items-center gap-2">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
          <Smartphone size={15} className="text-hot-ink" />
          Scan with any mobile camera to launch instantly
        </p>
        <code className="mono w-full break-all rounded-[10px] border border-hairline bg-surface px-3 py-2 text-[11px] text-dim">
          {targetUrl}
        </code>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => void handleCopy()} className="btn">
          {copied ? <Check size={14} className="text-phosphor-ink" /> : <Copy size={14} />}
          {copied ? 'Copied URL' : 'Copy URL'}
        </button>

        <button type="button" onClick={handleDownloadSvg} className="btn">
          <Download size={14} /> Download SVG
        </button>

        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => foley.relay()}
          className="btn btn-primary"
        >
          Open Direct <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
