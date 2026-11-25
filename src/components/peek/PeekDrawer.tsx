import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { ExternalLink, FileText, MonitorPlay, QrCode, SlidersHorizontal, Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { PeekTab, Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { FreshnessBadge } from '../spotlight/FreshnessBadge';
import { GithubMark } from '../ui/GithubMark';
import { IconButton } from '../ui/IconButton';
import { CuratePanel } from './CuratePanel';
import { QrHandoffPanel } from './QrHandoffPanel';
import { SandboxFrame } from './SandboxFrame';
import { TelemetryBrief } from './TelemetryBrief';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const TABS: { key: PeekTab; label: string; shortLabel: string; Icon: typeof MonitorPlay }[] = [
  { key: 'sandbox', label: 'Live Sandbox', shortLabel: 'Sandbox', Icon: MonitorPlay },
  { key: 'brief', label: 'Brief & README', shortLabel: 'Brief', Icon: FileText },
  { key: 'qr', label: 'QR Handoff', shortLabel: 'QR', Icon: QrCode },
  { key: 'curate', label: 'Curate', shortLabel: 'Curate', Icon: SlidersHorizontal },
];

function HeaderPlate({
  children,
  tone = 'neutral',
  led = false,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'online' | 'hot';
  led?: boolean;
}) {
  const color =
    tone === 'online'
      ? 'var(--led-online-ink)'
      : tone === 'hot'
        ? 'var(--led-hot-ink)'
        : 'var(--ink-secondary)';
  const dot =
    tone === 'online'
      ? 'var(--led-online)'
      : tone === 'hot'
        ? 'var(--led-hot)'
        : 'var(--ink-muted)';

  return (
    <span
      className="chip rounded-[4px]! backdrop-blur-md"
      style={{
        color,
        background: 'var(--badge-bg)',
        boxShadow: 'inset 0 0 0 1px var(--badge-border)',
      }}
    >
      {led && <span className="size-[5px] shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function PeekDrawer({ projects }: { projects: Project[] }) {
  const peek = useDeck((s) => s.peek);
  const peekOrigin = useDeck((s) => s.peekOrigin);
  const peekTab = useDeck((s) => s.peekTab);
  const repos = useDeck((s) => s.repos);
  const setPeek = useDeck((s) => s.setPeek);
  const setPeekTab = useDeck((s) => s.setPeekTab);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const dragControls = useDragControls();

  const project = useMemo(() => projects.find((p) => p.name === peek) ?? null, [projects, peek]);
  const repo = useMemo(() => repos.find((r) => r.name === peek), [repos, peek]);
  const activeTab: PeekTab = peekTab ?? (project?.launchUrl ? 'sandbox' : 'brief');

  const drawerRef = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    foley.tick();
    setPeek(null);
    if (window.location.hash.startsWith('#peek/') || window.location.hash.startsWith('#qr/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [setPeek, foley]);

  useEffect(() => {
    if (!project) return;
    prevFocus.current = document.activeElement as HTMLElement | null;

    const targetHash =
      activeTab === 'qr'
        ? `#qr/${encodeURIComponent(project.name)}`
        : `#peek/${encodeURIComponent(project.name)}`;
    if (window.location.hash !== targetHash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${targetHash}`);
    }

    const t = window.setTimeout(() => closeBtn.current?.focus(), 36);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = [...drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
          (el) => el.offsetParent !== null && !el.hasAttribute('inert'),
        );
        if (!focusables.length) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (!active || !drawerRef.current.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.overflow = prevOverflow;
      prevFocus.current?.focus?.();
    };
  }, [project, activeTab, close]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 550) close();
  };

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-end md:items-stretch"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ background: 'var(--scrim)' }}
            onClick={close}
            aria-hidden="true"
          />

          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${project.displayName} inspector`}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={SPRING}
            drag={isMobile ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={isMobile ? handleDragEnd : undefined}
            className="surface surface-elevated relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[10px]! rounded-b-none! bg-surface md:h-full md:w-[min(1080px,92vw)] md:rounded-l-[10px]! md:rounded-r-none!"
          >
            {/* Mobile Drag Grabber ONLY (scroll & iframe touches never trigger drag) */}
            <div
              onPointerDown={isMobile ? (e) => dragControls.start(e) : undefined}
              className="flex touch-none justify-center bg-surface pb-1.5 pt-2.5 md:hidden"
              aria-hidden="true"
            >
              <span className="h-1 w-10 rounded-full bg-hairline-strong" />
            </div>

            {/* Cover Header */}
            <motion.div
              layoutId={peekOrigin ? `cover-${peekOrigin}-${project.id}` : undefined}
              className="relative shrink-0 overflow-hidden border-b border-hairline"
            >
              <CoverArt project={project} fill scrim="stage" />

              <div className="relative z-10 flex flex-col gap-4 p-4 sm:px-6 sm:py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FreshnessBadge project={project} overlay />
                    {project.kind === 'live' ? (
                      <HeaderPlate tone="online" led>
                        {project.isPwa ? 'LIVE · PWA' : 'LIVE'}
                      </HeaderPlate>
                    ) : (
                      <HeaderPlate>CODE</HeaderPlate>
                    )}
                    <HeaderPlate>{project.category}</HeaderPlate>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <IconButton
                      tone="active"
                      label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
                      aria-pressed={project.pinned}
                      onClick={() => {
                        foley.latch();
                        togglePin(project.name);
                        toast(
                          project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`,
                          'ok',
                        );
                      }}
                      className="rounded-[6px]! backdrop-blur-md"
                      style={
                        project.pinned
                          ? undefined
                          : { background: 'var(--badge-bg)', boxShadow: 'inset 0 0 0 1px var(--badge-border)' }
                      }
                    >
                      <Star size={15} fill={project.pinned ? 'currentColor' : 'none'} />
                    </IconButton>

                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => foley.click()}
                      className="icon-btn rounded-[6px]! backdrop-blur-md"
                      style={{ background: 'var(--badge-bg)', boxShadow: 'inset 0 0 0 1px var(--badge-border)' }}
                      aria-label={`Source of ${project.displayName} on GitHub`}
                      title="View on GitHub"
                    >
                      <GithubMark size={15} />
                    </a>

                    <button
                      ref={closeBtn}
                      type="button"
                      onClick={close}
                      className="icon-btn rounded-[6px]! backdrop-blur-md"
                      style={{ background: 'var(--badge-bg)', boxShadow: 'inset 0 0 0 1px var(--badge-border)' }}
                      aria-label="Close inspector"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Glyph name={project.glyph} hue={hueOf(project)} size={46} />
                    <div className="min-w-0">
                      <h2 className="display text-[24px] text-ink sm:text-[32px]">{project.displayName}</h2>
                      <p className="mt-1 line-clamp-2 max-w-2xl text-[13.5px] leading-snug text-dim">
                        {project.tagline}
                      </p>
                    </div>
                  </div>
                  {project.launchUrl && (
                    <a
                      href={project.launchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => foley.relay()}
                      className="btn btn-primary shrink-0 px-4"
                    >
                      Launch World <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>

            {/* 4-Tab Recessed Monolith Bar */}
            <div
              role="tablist"
              aria-label="Inspector sections"
              className="hide-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline bg-inset/85 px-4 py-2 sm:px-6"
            >
              {TABS.map(({ key, label, shortLabel, Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      if (activeTab !== key) {
                        foley.tick();
                        setPeekTab(key);
                      }
                    }}
                    className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] px-3 text-[12px] font-medium whitespace-nowrap transition-colors sm:text-[12.5px] ${
                      active ? 'text-ink' : 'text-mute hover:bg-hover hover:text-dim'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="peek-tab-ind"
                        transition={SPRING}
                        className="absolute inset-0 rounded-[4px] border border-hairline-strong bg-elevated"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-2 bottom-0 h-[1.5px] rounded-full bg-hot"
                        />
                      </motion.span>
                    )}
                    <Icon size={13} className="relative shrink-0" />
                    <span className="relative sm:hidden">{shortLabel}</span>
                    <span className="relative hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Inspector Body */}
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-surface p-4 sm:p-6">
              {activeTab === 'sandbox' && (
                <SandboxFrame project={project} onOpenBrief={() => setPeekTab('brief')} />
              )}
              {activeTab === 'brief' && <TelemetryBrief project={project} repo={repo} />}
              {activeTab === 'qr' && <QrHandoffPanel project={project} />}
              {activeTab === 'curate' && <CuratePanel project={project} />}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
