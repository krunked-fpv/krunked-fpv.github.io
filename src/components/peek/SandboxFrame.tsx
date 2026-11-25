import { motion } from 'framer-motion';
import { Check, Copy, ExternalLink, Lock, Monitor, RotateCw, ShieldAlert, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { isSelfHostedPeekTarget } from '../../domain/resolveLaunch';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { Chip } from '../ui/Chip';

type Viewport = 'desktop' | 'mobile';

const VP: Record<Viewport, { w: number; h: number; label: string }> = {
  desktop: { w: 1280, h: 800, label: '1280x800' },
  mobile: { w: 390, h: 844, label: '390x844' },
};

export function SandboxFrame({
  project,
  onOpenBrief,
}: {
  project: Project;
  onOpenBrief?: () => void;
}) {
  const narrow = useMediaQuery('(max-width: 767px)');
  const [vp, setVp] = useState<Viewport>(() => (narrow ? 'mobile' : 'desktop'));
  const [userPickedVp, setUserPickedVp] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    setReloadKey(0);
    setCopied(false);
    setUserPickedVp(false);
    setVp(narrow ? 'mobile' : 'desktop');
  }, [project.id, narrow]);

  useEffect(() => {
    if (!userPickedVp) {
      setVp(narrow ? 'mobile' : 'desktop');
    }
  }, [narrow, userPickedVp]);

  const selfBlocked = Boolean(project.isSelfDeck || isSelfHostedPeekTarget(project.launchUrl));
  const canEmbed = Boolean(project.launchUrl && !selfBlocked);

  useEffect(() => {
    if (!canEmbed || loaded) return;
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [canEmbed, loaded, reloadKey]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      setBox({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [canEmbed]);

  const copyUrl = async () => {
    if (!project.launchUrl) return;
    try {
      await navigator.clipboard?.writeText(project.launchUrl);
      foley.click();
      setCopied(true);
      toast('Copied live URL', 'ok');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Clipboard unavailable in this context', 'warn');
    }
  };

  // Runtime self-iframe recursion guard (SPEC.md §1.5)
  if (selfBlocked) {
    return (
      <div
        data-self-frame-guard="active"
        className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-hairline-strong bg-inset px-6 py-12 text-center"
      >
        <span className="grid size-12 place-items-center rounded-[12px] border border-hairline bg-elevated text-hot-ink">
          <ShieldAlert size={22} />
        </span>
        <Chip tone="hot" led>
          SELF-FRAME GUARD ACTIVE
        </Chip>
        <h4 className="text-[16px] font-semibold tracking-tight text-ink">
          Recursive deck embedding blocked
        </h4>
        <p className="max-w-md text-[13px] leading-relaxed text-dim">
          Forge Deck blocks framing its own host route (<span className="mono text-ink">{project.launchUrl ?? '/'}</span>)
          inside the Live Peek sandbox to prevent recursive shell loops.
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <a
            href={project.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => foley.click()}
            className="btn"
          >
            View Repository <ExternalLink size={14} />
          </a>
          {onOpenBrief && (
            <button
              type="button"
              onClick={() => {
                foley.click();
                onOpenBrief();
              }}
              className="btn btn-primary"
            >
              Inspect Telemetry &amp; README
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!project.launchUrl) {
    const hue = hueOf(project);
    return (
      <div className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden rounded-[14px] border border-hairline bg-inset">
        <CoverArt project={project} fill />
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 py-8 text-center">
          <Glyph name={project.glyph} hue={hue} size={48} />
          <Chip tone="neutral">
            {project.liveVerified === false ? 'PAGES 404 // CODE REPO' : 'NO LIVE DEPLOYMENT'}
          </Chip>
          <p className="max-w-sm text-[13px] text-dim">
            {project.liveVerified === false
              ? 'GitHub Pages returned 404 for this repository. Demoted to a code brief so you never hit a dead embed.'
              : 'This repository is a library, engine, or CLI without a verified Pages site.'}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {onOpenBrief && (
              <button
                type="button"
                onClick={() => {
                  foley.click();
                  onOpenBrief();
                }}
                className="btn btn-primary"
              >
                Open Brief &amp; README
              </button>
            )}
            <a
              href={project.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => foley.click()}
              className="btn"
            >
              Repository <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const target = VP[vp];
  const scale = box.w > 0 && box.h > 0 ? Math.min((box.w - 16) / target.w, (box.h - 16) / target.h, 1) : narrow ? 0.8 : 0.65;
  const scaledW = Math.max(200, Math.round(target.w * scale));
  const scaledH = Math.max(200, Math.round(target.h * scale));
  const scalePct = Math.round(scale * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Hardware Sandbox Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-hairline bg-inset px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="relative flex rounded-[8px] border border-hairline bg-surface p-0.5"
            role="radiogroup"
            aria-label="Sandbox viewport"
          >
            {(['desktop', 'mobile'] as const).map((k) => {
              const on = vp === k;
              const Icon = k === 'desktop' ? Monitor : Smartphone;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    foley.latch();
                    setUserPickedVp(true);
                    setVp(k);
                  }}
                  className={`relative flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors ${
                    on ? 'text-ink' : 'text-mute hover:text-dim'
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="sandbox-vp"
                      transition={SPRING}
                      className="absolute inset-0 rounded-[6px] border border-hairline-strong bg-elevated"
                    />
                  )}
                  <Icon size={13} className="relative" />
                  <span className="relative capitalize">{k}</span>
                </button>
              );
            })}
          </div>
          <span className="mono hidden text-[10.5px] text-mute sm:inline">
            {target.label} · {scalePct}%
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="btn min-h-8! gap-1.5 px-2.5 text-[11.5px]"
            aria-label="Copy live URL"
          >
            {copied ? <Check size={12} className="text-phosphor-ink" /> : <Copy size={12} />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy URL'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              foley.click();
              setLoaded(false);
              setTimedOut(false);
              setReloadKey((k) => k + 1);
            }}
            className="btn min-h-8! gap-1.5 px-2.5 text-[11.5px]"
            aria-label="Reload sandbox"
          >
            <RotateCw size={12} />
            <span className="hidden sm:inline">Reload</span>
          </button>

          <a
            href={project.launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => foley.relay()}
            className="btn btn-primary min-h-8! gap-1.5 px-3 text-[11.5px]"
          >
            Open Tab <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* URL Address Bezel */}
      <div className="mono flex items-center gap-2 rounded-[10px] border border-hairline bg-inset px-3 py-1.5 text-[11px] text-dim">
        <Lock size={11} className="shrink-0 text-phosphor-ink" />
        <span className="min-w-0 flex-1 truncate">{project.launchUrl}</span>
        <span className="hidden shrink-0 text-[10px] uppercase tracking-wider text-mute sm:inline">
          SANDBOXED
        </span>
      </div>

      {/* Scaled Hardware Bezel Stage */}
      <div
        ref={stageRef}
        className="relative flex h-[430px] w-full items-center justify-center overflow-hidden rounded-[14px] border border-hairline-strong p-2 sm:h-[500px]"
        style={{ background: 'var(--bezel-frame)' }}
      >
        <div
          className="relative overflow-hidden rounded-[10px] border border-hairline-strong bg-chassis shadow-2xl"
          style={{ width: scaledW, height: scaledH }}
        >
          <iframe
            key={`${project.id}-${reloadKey}`}
            src={project.launchUrl}
            title={`${project.displayName} live sandbox`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            allow="fullscreen; gamepad; autoplay"
            onLoad={() => {
              setLoaded(true);
              setTimedOut(false);
            }}
            style={{
              width: target.w,
              height: target.h,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 0,
              background: '#08090B',
            }}
          />

          {!loaded && !timedOut && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-chassis/85 backdrop-blur-sm">
              <span className="beacon" style={{ ['--c' as string]: 'var(--led-online)' }} />
              <span className="mono text-[11px] tracking-wider text-dim">BOOTING SANDBOX...</span>
            </div>
          )}

          {!loaded && timedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-chassis/95 p-6 text-center backdrop-blur-md">
              <Chip tone="active" led>
                FRAME TIMEOUT
              </Chip>
              <h4 className="text-[16px] font-semibold text-ink">Deployment refused iframe embedding</h4>
              <p className="max-w-sm text-[13px] text-dim">
                This site may enforce X-Frame-Options or CSP frame-ancestors, or is still cold-starting. Launch it directly in a tab.
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <a
                  href={project.launchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => foley.relay()}
                  className="btn btn-primary"
                >
                  Open in new tab <ExternalLink size={14} />
                </a>
                <button type="button" onClick={() => setTimedOut(false)} className="btn">
                  Keep waiting
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
