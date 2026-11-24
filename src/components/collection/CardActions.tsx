import { Eye, Star } from 'lucide-react';
import { GithubMark } from '../ui/GithubMark';
import type { Project } from '../../types/project';
import { useDeck } from '../../store/deckStore';
import { IconButton } from '../ui/IconButton';

export const launch = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

/** [Preview] [Source] [Pin] micro-actions. Sit above the stretched launch link. */
export function CardActions({ project, size = 'md', origin = null }: { project: Project; size?: 'sm' | 'md'; origin?: 'spot' | 'card' | null }) {
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const px = size === 'sm' ? 15 : 17;
  return (
    <div className="above flex items-center gap-0.5">
      <IconButton label={`Preview ${project.displayName}`} onClick={() => setPeek(project.name, origin)}>
        <Eye size={px} />
      </IconButton>
      <a
        className="icon-btn"
        href={project.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Source of ${project.displayName} on GitHub`}
        title="Source"
      >
        <GithubMark size={px} />
      </a>
      <IconButton
        label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
        aria-pressed={project.pinned}
        onClick={() => {
          togglePin(project.name);
          toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
        }}
      >
        <Star size={px} fill={project.pinned ? 'currentColor' : 'none'} />
      </IconButton>
    </div>
  );
}

/** Primary surface: launches the live app, or opens Peek for code-only repos. */
export function LaunchLink({ project, children, className = '', origin = null }: { project: Project; children: React.ReactNode; className?: string; origin?: 'spot' | 'card' | null }) {
  const setPeek = useDeck((s) => s.setPeek);
  if (project.launchUrl)
    return (
      <a
        href={project.launchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`stretch ${className}`}
        aria-label={`Launch ${project.displayName}`}
      >
        {children}
      </a>
    );
  return (
    <button type="button" onClick={() => setPeek(project.name, origin)} className={`stretch text-left ${className}`} aria-label={`Open ${project.displayName} brief`}>
      {children}
    </button>
  );
}
