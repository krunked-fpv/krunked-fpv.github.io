import { motion } from 'framer-motion';
import { ExternalLink, Monitor, RotateCw, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';

type Viewport = 'desktop' | 'mobile';
const VP: Record<Viewport, { w: number; h: number; label: string }> = {
  desktop: { w: 1280, h: 800, label: '1280×800' },
  mobile: { w: 390, h: 844, label: '390×844' },
};

export function SandboxFrame({ project }: { project: Project }) {
  const [vp, setVp] = useState<Viewport>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    setReloadKey(0);
  }, [project.id]);

  useEffect(() => {
    if (!project.launchUrl || loaded) return;
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [project.launchUrl, loaded, reloadKey]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      setBox({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!project.launchUrl) {
    const hue = hueOf(project);
    return (
      <div className="relative flex h-[280px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.07] bg-ob-950">
        <CoverArt project={project} fill />
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
          <Glyph name={project.glyph} hue={hue} size={52} />
          <span className="chip">NO LIVE DEPLOYMENT</span>
          <p className="max-w-sm text-[13px] text-dim">
            This repository is a library, engine, or utility without a Pages site. Explore the brief and README below.
          </p>
          <a href={project.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn mt-1">
            Open Repository <ExternalLink size={14} />
          </a>
        </div>
      </div>
    );
  }

  const target = VP[vp];
  const scale = box.w > 0 && box.h > 0 ? Math.min((box.w - 16) / target.w, (box.h - 16) / target.h, 1) : 0.6;
  const scaledW = Math.round(target.w * scale);
  const scaledH = Math.round(target.h * scale);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-ob-950/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex rounded-lg bg-white/[0.04] p-0.5 shadow-[inset_0_0_0_1px_var(--hairline)]" role="radiogroup" aria-label="Sandbox viewport">
            {(['desktop', 'mobile'] as const).map((k) => {
              const on = vp === k;
              const Icon = k === 'desktop' ? Monitor : Smartphone;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setVp(k)}
                  className={`relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${on ? 'text-ink' : 'text-mute hover:text-dim'}`}
                >
                  {on && <motion.span layoutId="sandbox-vp" transition={SPRING} className="absolute inset-0 rounded-md bg-white/[0.09]" />}
                  <Icon size={13} className="relative" />
                  <span className="relative capitalize">{k}</span>
                </button>
              );
            })}
          </div>
          <span className="mono hidden text-[10.5px] text-mute sm:inline">{target.label}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoaded(false);
              setTimedOut(false);
              setReloadKey((k) => k + 1);
            }}
            className="btn min-h-8! gap-1.5 px-2.5 text-[12px]"
            aria-label="Reload sandbox"
          >
            <RotateCw size={12} /> Reload
          </button>
          <a
            href={project.launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mono flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-volt hover:bg-volt/10"
          >
            Blocked? Open <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Scaled Viewport Frame */}
      <div
        ref={stageRef}
        className="relative flex h-[430px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.07] bg-ob-950 p-2 sm:h-[490px]"
      >
        <div
          className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-ob-900 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.95)]"
          style={{ width: scaledW, height: scaledH }}
        >
          <iframe
            key={`${project.id}-${reloadKey}`}
            src={project.launchUrl}
            title={`${project.displayName} live sandbox`}
            loading="lazy"
            allow="fullscreen; gamepad; autoplay; clipboard-write"
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
              background: '#07080A',
            }}
          />

          {!loaded && !timedOut && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ob-950/75 backdrop-blur-sm">
              <span className="beacon" style={{ ['--c' as string]: '#06B6D4' }} />
              <span className="mono text-[11px] tracking-wider text-dim">BOOTING SANDBOX…</span>
            </div>
          )}

          {!loaded && timedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ob-950/90 p-6 text-center backdrop-blur-md">
              <span className="chip text-solar!">FRAME TIMEOUT</span>
              <h4 className="text-[16px] font-semibold text-ink">This build refuses to be framed</h4>
              <p className="max-w-sm text-[13px] text-dim">
                The deployment may block embedding via X-Frame-Options or CSP, or is still loading. Launch it directly in a full tab.
              </p>
              <div className="mt-1 flex items-center gap-2">
                <a href={project.launchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
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
