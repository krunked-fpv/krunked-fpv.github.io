import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { ExternalLink, Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { FreshnessBadge } from '../spotlight/FreshnessBadge';
import { Chip } from '../ui/Chip';
import { GithubMark } from '../ui/GithubMark';
import { IconButton } from '../ui/IconButton';
import { SandboxFrame } from './SandboxFrame';
import { TelemetryBrief } from './TelemetryBrief';

export function PeekDrawer({ projects }: { projects: Project[] }) {
  const peek = useDeck((s) => s.peek);
  const peekOrigin = useDeck((s) => s.peekOrigin);
  const repos = useDeck((s) => s.repos);
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const project = useMemo(() => projects.find((p) => p.name === peek) ?? null, [projects, peek]);
  const repo = useMemo(() => repos.find((r) => r.name === peek), [repos, peek]);

  const closeBtn = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setPeek(null);
    if (window.location.hash.startsWith('#peek/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [setPeek]);

  useEffect(() => {
    if (!project) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const targetHash = `#peek/${encodeURIComponent(project.name)}`;
    if (window.location.hash !== targetHash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${targetHash}`);
    }
    const t = setTimeout(() => closeBtn.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.overflow = '';
      prevFocus.current?.focus?.();
    };
  }, [project, close]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) close();
  };

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-end md:items-stretch"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-ob-950/75 backdrop-blur-md" onClick={close} aria-hidden="true" />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${project.displayName} inspector`}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={SPRING}
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={isMobile ? handleDragEnd : undefined}
            className="surface relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[24px]! rounded-b-none! md:h-full md:w-[min(1100px,92vw)] md:rounded-l-[24px]! md:rounded-r-none!"
            style={{ background: 'var(--color-ob-900)' }}
          >
            {/* Mobile grabber */}
            <div className="flex justify-center pt-2.5 pb-1 md:hidden">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Cover Header */}
            <motion.div
              layoutId={peekOrigin ? `cover-${peekOrigin}-${project.id}` : undefined}
              className="relative shrink-0 overflow-hidden border-b border-white/[0.07]"
            >
              <CoverArt project={project} fill />
              <div className="relative z-10 flex flex-col gap-4 p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FreshnessBadge project={project} />
                    {project.isPwa && <Chip color="#06B6D4">PWA</Chip>}
                    {project.kind === 'live' ? <Chip color="#06B6D4">LIVE</Chip> : <Chip>CODE</Chip>}
                    <Chip>{project.category}</Chip>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
                      aria-pressed={project.pinned}
                      onClick={() => {
                        togglePin(project.name);
                        toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
                      }}
                    >
                      <Star size={17} fill={project.pinned ? 'currentColor' : 'none'} />
                    </IconButton>
                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="icon-btn"
                      aria-label={`Source of ${project.displayName} on GitHub`}
                      title="View on GitHub"
                    >
                      <GithubMark size={17} />
                    </a>
                    <button
                      ref={closeBtn}
                      type="button"
                      onClick={close}
                      className="icon-btn"
                      aria-label="Close inspector"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Glyph name={project.glyph} hue={hueOf(project)} size={48} />
                    <div className="min-w-0">
                      <h2 className="display truncate text-[28px] sm:text-[36px]">{project.displayName}</h2>
                      <p className="mt-1 line-clamp-2 text-[13.5px] text-dim">{project.tagline}</p>
                    </div>
                  </div>
                  {project.launchUrl && (
                    <a href={project.launchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary shrink-0">
                      Launch App <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Scrollable Body */}
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="flex flex-col gap-6">
                <SandboxFrame project={project} />
                <TelemetryBrief project={project} repo={repo} />
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
