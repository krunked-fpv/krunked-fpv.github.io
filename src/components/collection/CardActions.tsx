import { Eye, QrCode, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFoley } from '../../audio/useFoley';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { GithubMark } from '../ui/GithubMark';
import { IconButton } from '../ui/IconButton';

export const launch = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore malformed url */
  }
};

/**
 * Persistent hardware micro-actions: [Peek] [QR] [Source] [Pin].
 * Always visible at refined rest contrast (never hover-hidden opacity-0).
 */
export function CardActions({
  project,
  size = 'md',
  origin = null,
  showQr = true,
}: {
  project: Project;
  size?: 'sm' | 'md';
  origin?: 'spot' | 'card' | null;
  showQr?: boolean;
}) {
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();
  const px = size === 'sm' ? 14 : 16;

  return (
    <div className="above flex shrink-0 items-center gap-0.5">
      <IconButton
        size={size}
        label={`Live Peek ${project.displayName}`}
        onClick={() => {
          foley.latch();
          setPeek(project.name, origin, project.launchUrl ? 'sandbox' : 'brief');
        }}
      >
        <Eye size={px} />
      </IconButton>

      {showQr && project.launchUrl && (
        <IconButton
          size={size}
          label={`QR mobile handoff for ${project.displayName}`}
          onClick={() => {
            foley.click();
            setPeek(project.name, origin, 'qr');
          }}
        >
          <QrCode size={px} />
        </IconButton>
      )}

      <a
        className={`icon-btn ${size === 'sm' ? 'icon-btn-sm' : ''}`}
        href={project.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Source of ${project.displayName} on GitHub`}
        title="Source on GitHub"
        onClick={() => foley.click()}
      >
        <GithubMark size={px} />
      </a>

      <IconButton
        size={size}
        tone="active"
        label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
        aria-pressed={project.pinned}
        onClick={() => {
          foley.latch();
          togglePin(project.name);
          toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
        }}
      >
        <Star size={px} fill={project.pinned ? 'currentColor' : 'none'} />
      </IconButton>
    </div>
  );
}

/** Primary stretched surface action: launches live app or opens Brief inspector for code repos. */
export function LaunchLink({
  project,
  children,
  className = '',
  origin = null,
}: {
  project: Project;
  children: ReactNode;
  className?: string;
  origin?: 'spot' | 'card' | null;
}) {
  const setPeek = useDeck((s) => s.setPeek);
  const foley = useFoley();

  if (project.launchUrl) {
    return (
      <a
        href={project.launchUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-card-primary="true"
        onClick={() => foley.relay()}
        className={`stretch ${className}`}
        aria-label={`Launch ${project.displayName}`}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      data-card-primary="true"
      onClick={() => {
        foley.latch();
        setPeek(project.name, origin, 'brief');
      }}
      className={`stretch text-left ${className}`}
      aria-label={`Inspect ${project.displayName} brief`}
    >
      {children}
    </button>
  );
}
