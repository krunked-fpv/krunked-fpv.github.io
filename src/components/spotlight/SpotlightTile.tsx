import { motion } from 'framer-motion';
import { ArrowUpRight, Eye, QrCode, Rocket, Star } from 'lucide-react';
import { nonPurpleRgb } from '../../art/color';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { CoverArt } from '../art/CoverArt';
import { Glyph } from '../art/Glyph';
import { GithubMark } from '../ui/GithubMark';
import { IconButton } from '../ui/IconButton';
import { CommitTicker } from './CommitTicker';
import { FreshnessBadge } from './FreshnessBadge';

export type TileVariant = 'lead' | 'medium' | 'compact' | 'hud';

export interface SpotlightTileProps {
  project: Project;
  variant?: TileVariant;
  /** commits landed since the user's last visit (null = unknown) */
  newCommits?: number | null;
  /** 0-based orbital index */
  index?: number;
  total?: number;
  className?: string;
}

/**
 * Floating 3-row Holographic Launch Dock HUD anchored along bottom-center of the Singularity Arena.
 * Features dynamic non-purple OKLCH top ignition edge, Flash mask-reveal sweep on world switch,
 * framed animated CoverArt preview, crisp editorial brief, and tactile hardware launch controls.
 */
export function SpotlightTile({
  project,
  newCommits = null,
  index,
  total,
  className = '',
}: SpotlightTileProps) {
  const setPeek = useDeck((s) => s.setPeek);
  const togglePin = useDeck((s) => s.togglePin);
  const toast = useDeck((s) => s.toast);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const foley = useFoley();
  const reduced = useReducedMotion();

  const isDaylight = theme === 'daylight';
  const hue = hueOf(project);
  const [ar, ag, ab] = nonPurpleRgb(isDaylight ? 0.46 : 0.78, isDaylight ? 0.165 : 0.185, hue);
  const accentSolid = `rgb(${ar} ${ag} ${ab})`;
  const accentSoft = `rgb(${ar} ${ag} ${ab} / ${isDaylight ? 0.12 : 0.18})`;
  const accentGlow = `rgb(${ar} ${ag} ${ab} / ${isDaylight ? 0.2 : 0.34})`;

  const indexPlate =
    typeof index === 'number' && typeof total === 'number' && total > 0
      ? `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`
      : null;

  return (
    <motion.article
      key={project.id}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 5, scale: 0.985 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`hologram-hud reticle-box relative flex w-full items-center gap-2 overflow-hidden px-2.5 py-2.5 xl:gap-3 xl:px-3 ${className}`}
      data-active="true"
    >
      {/* Animated Dynamic OKLCH Top Accent Edge */}
      <motion.span
        aria-hidden="true"
        initial={reduced ? { opacity: 1 } : { scaleX: 0.2, opacity: 0.25 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[2px] origin-center"
        style={{
          background: `linear-gradient(90deg, transparent 2%, ${accentSolid} 24%, ${isDaylight ? '#FFFFFF' : '#F5F3EC'} 50%, ${accentSolid} 76%, transparent 98%)`,
        }}
      />

      {/* Subtle Ambient Accent Bloom under Top Seam */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 z-[1] h-10 opacity-75"
        style={{
          background: `radial-gradient(ellipse 65% 100% at 50% 0%, ${accentSoft}, transparent 74%)`,
        }}
      />

      {/* One-Shot Flash Horizontal Mask-Reveal Sweep on World Switch */}
      {!reduced && (
        <motion.span
          aria-hidden="true"
          initial={{ x: '-115%', opacity: 0.85 }}
          animate={{ x: '135%', opacity: 0 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-y-0 left-0 z-[4] w-1/2 skew-x-[-22deg]"
          style={{
            background: isDaylight
              ? `linear-gradient(90deg, transparent, ${accentSoft}, transparent)`
              : `linear-gradient(90deg, transparent, rgba(245,243,236,0.12), ${accentSoft}, transparent)`,
          }}
        />
      )}

      {/* Left: Framed Animated Bespoke WorldVisual Miniature Preview */}
      <div
        className="relative z-[2] h-[64px] w-[76px] shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-chassis xl:w-[104px]"
        style={{
          boxShadow: isDaylight
            ? `inset 0 0 0 1px rgba(10,10,11,0.18), 0 4px 12px -6px rgba(10,10,11,0.22)`
            : `inset 0 0 0 1px rgba(245,243,236,0.18), 0 0 18px -8px ${accentGlow}`,
        }}
      >
        <CoverArt project={project} animated fill scrim="none" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/12"
        />
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 ${
            isDaylight
              ? 'bg-gradient-to-t from-[#0A0A0B]/75 via-[#0A0A0B]/20 to-transparent'
              : 'bg-gradient-to-t from-[#020203]/90 via-[#020203]/25 to-transparent'
          }`}
        />
        <div className="absolute right-1 bottom-1 left-1 z-[2] flex items-center justify-between gap-1">
          <span className="grid size-[19px] place-items-center rounded-[3px] bg-[#040507]/75 ring-1 ring-white/15 backdrop-blur-sm xl:size-[22px]">
            <Glyph name={project.glyph} hue={hue} size={14} className="xl:size-[16px]" />
          </span>
          {indexPlate && (
            <span
              data-tabular
              className="mono rounded-[2px] px-1 py-[1px] text-[8px] font-semibold tracking-[0.08em] backdrop-blur-md xl:text-[8.5px]"
              style={{
                color: 'var(--led-hot-ink)',
                background: 'var(--badge-bg)',
                boxShadow: `inset 0 0 0 1px ${isDaylight ? 'rgba(10,10,11,0.18)' : 'rgba(245,243,236,0.2)'}`,
              }}
            >
              {indexPlate}
            </span>
          )}
        </div>
      </div>

      {/* Center: Sleek 3-Row Editorial Brief */}
      <div className="relative z-[2] flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {/* Row 1: Freshness · Category · Status on one crisp horizontal line (zero clipping at 1024/1280/1440px) */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <FreshnessBadge project={project} compact overlay={false} />
          <span className="mono shrink-0 text-[8.5px] font-medium tracking-[0.07em] text-mute uppercase xl:text-[9px] xl:tracking-[0.09em]">
            {project.category}
          </span>
          <span className="shrink-0 text-mute/60" aria-hidden="true">
            ·
          </span>
          <span
            className="mono inline-flex shrink-0 items-center gap-1 text-[8.5px] font-semibold tracking-[0.07em] uppercase xl:text-[9px] xl:tracking-[0.09em]"
            style={{ color: project.kind === 'live' ? 'var(--led-online-ink)' : 'var(--ink-muted)' }}
          >
            {project.kind === 'live' && (
              <span
                className="inline-block size-[5px] rounded-full"
                style={{ backgroundColor: 'var(--led-online)' }}
                aria-hidden="true"
              />
            )}
            <span>{project.kind === 'live' ? 'LIVE' : 'CODE'}</span>
            {project.kind === 'live' && project.isPwa && (
              <span className="hidden 2xl:inline"> · PWA</span>
            )}
          </span>
          {newCommits !== null && newCommits > 0 && (
            <span className="chip chip-hot h-[18px]! shrink-0 px-1.5! text-[9px]!">
              <Rocket size={9} aria-hidden="true" /> +{newCommits} NEW
            </span>
          )}
        </div>

        {/* Row 2: Bold Untruncated Title + Readable Tagline */}
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="shrink-0 text-[16px] font-bold leading-tight tracking-[-0.025em] text-ink xl:text-[18px]">
            {project.displayName}
          </h2>
          <p className="min-w-0 flex-1 truncate text-[12px] text-dim xl:text-[12.5px]" title={project.tagline}>
            {project.tagline}
          </p>
        </div>

        {/* Row 3: Commit Ticker with full horizontal breathing room */}
        <div className="min-w-0">
          <CommitTicker project={project} />
        </div>
      </div>

      {/* Right: Tactile Hardware Action Console */}
      <div className="relative z-[2] flex shrink-0 items-center gap-1">
        {project.launchUrl ? (
          <a
            href={project.launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => foley.relay()}
            className="btn btn-primary group min-h-8! h-8 gap-1 rounded-[var(--radius-sm)]! px-2.5 text-[10.5px] font-bold tracking-[0.07em] uppercase whitespace-nowrap xl:min-h-9! xl:h-9 xl:px-3 xl:text-[11px]"
          >
            <span>Launch</span>
            <ArrowUpRight
              size={13}
              className="shrink-0 transition-transform duration-150 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
              aria-hidden="true"
            />
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              foley.latch();
              setPeek(project.name, 'spot', 'brief');
            }}
            className="btn btn-primary min-h-8! h-8 gap-1 rounded-[var(--radius-sm)]! px-2.5 text-[10.5px] font-bold tracking-[0.07em] uppercase whitespace-nowrap xl:min-h-9! xl:h-9 xl:px-3 xl:text-[11px]"
          >
            <span>Inspect</span>
            <Eye size={13} className="shrink-0" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            foley.latch();
            setPeek(project.name, 'spot', project.launchUrl ? 'sandbox' : 'brief');
          }}
          className="btn min-h-8! h-8 w-8 justify-center gap-1 rounded-[var(--radius-sm)]! bg-elevated/90! px-0 text-[11.5px] whitespace-nowrap xl:min-h-9! xl:h-9 xl:w-auto xl:px-2.5"
          aria-label={`Live Peek ${project.displayName}`}
          title={`Live Peek ${project.displayName}`}
        >
          <Eye size={13.5} className="shrink-0" aria-hidden="true" />
          <span className="hidden xl:inline">Peek</span>
        </button>

        {project.launchUrl && (
          <IconButton
            label={`QR handoff for ${project.displayName}`}
            size="sm"
            className="h-7! w-7! rounded-[var(--radius-sm)]! border border-hairline bg-elevated/80! shadow-[inset_0_1px_0_var(--inset-highlight)] hover:border-hairline-strong xl:h-8! xl:w-8!"
            onClick={() => {
              foley.click();
              setPeek(project.name, 'spot', 'qr');
            }}
          >
            <QrCode size={13} />
          </IconButton>
        )}

        <a
          className="icon-btn h-7! w-7! rounded-[var(--radius-sm)]! border border-hairline bg-elevated/80! shadow-[inset_0_1px_0_var(--inset-highlight)] hover:border-hairline-strong xl:h-8! xl:w-8!"
          href={project.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Source of ${project.displayName} on GitHub`}
          title="Source on GitHub"
          onClick={() => foley.click()}
        >
          <GithubMark size={13} />
        </a>

        <IconButton
          label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
          aria-pressed={project.pinned}
          size="sm"
          className="h-7! w-7! rounded-[var(--radius-sm)]! border border-hairline bg-elevated/80! shadow-[inset_0_1px_0_var(--inset-highlight)] hover:border-hairline-strong xl:h-8! xl:w-8!"
          onClick={() => {
            foley.latch();
            togglePin(project.name);
            toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
          }}
        >
          <Star size={13} fill={project.pinned ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
    </motion.article>
  );
}
