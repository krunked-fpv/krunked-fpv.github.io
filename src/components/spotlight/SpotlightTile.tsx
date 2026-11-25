import { motion } from 'framer-motion';
import { ArrowUpRight, Eye, QrCode, Rocket, Star } from 'lucide-react';
import { useFoley } from '../../audio/useFoley';
import { hueOf } from '../../domain/buildProjects';
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
 * Floating 3-row Holographic Launch Dock HUD (~84px tall) anchored along bottom-center of the Singularity Arena.
 * Displays live animated CoverArt preview, single-line metadata, untruncated title + tagline, commit ticker,
 * and compact right-hand Launch / Peek / QR / GitHub / Pin controls.
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
  const foley = useFoley();

  const hue = hueOf(project);
  const indexPlate =
    typeof index === 'number' && typeof total === 'number' && total > 0
      ? `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`
      : null;
  const statusText =
    project.kind === 'live' ? (project.isPwa ? 'LIVE · PWA' : 'LIVE') : 'CODE';

  return (
    <motion.article
      key={project.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`hologram-hud reticle-box relative flex w-full items-center gap-3 overflow-hidden px-3 py-2.5 sm:gap-3.5 sm:px-3.5 ${className}`}
      data-active="true"
    >
      {/* Left: Animated Bespoke WorldVisual Miniature Preview */}
      <div className="relative h-[64px] w-[112px] shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-hairline bg-chassis">
        <CoverArt project={project} animated fill scrim="none" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-chassis/85 to-transparent" />
        <div className="absolute bottom-1 left-1 z-[2] flex items-center gap-1">
          <Glyph name={project.glyph} hue={hue} size={20} />
          {indexPlate && (
            <span
              className="mono rounded-[2px] px-1 py-[1px] text-[8.5px] font-semibold tracking-[0.1em] backdrop-blur-md"
              style={{
                color: 'var(--led-hot-ink)',
                background: 'var(--badge-bg)',
                boxShadow: 'inset 0 0 0 1px var(--badge-border)',
              }}
            >
              {indexPlate}
            </span>
          )}
        </div>
      </div>

      {/* Center: Sleek 3-Row Editorial Brief */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {/* Row 1: Freshness · Category · Status on one crisp horizontal line */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
          <FreshnessBadge project={project} compact overlay={false} />
          <span className="mono truncate text-[9.5px] font-medium tracking-[0.13em] text-mute uppercase">
            {project.category}
          </span>
          <span className="shrink-0 text-mute" aria-hidden="true">
            ·
          </span>
          <span
            className="mono shrink-0 text-[9.5px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: project.kind === 'live' ? 'var(--led-online-ink)' : 'var(--ink-muted)' }}
          >
            {statusText}
          </span>
          {newCommits !== null && newCommits > 0 && (
            <span className="chip chip-hot h-[18px]! shrink-0 px-1.5! text-[9px]!">
              <Rocket size={9} aria-hidden="true" /> +{newCommits} NEW
            </span>
          )}
        </div>

        {/* Row 2: Bold Untruncated Title + Readable Tagline */}
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="shrink-0 text-[17.5px] font-bold leading-tight tracking-[-0.025em] text-ink">
            {project.displayName}
          </h2>
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-dim" title={project.tagline}>
            {project.tagline}
          </p>
        </div>

        {/* Row 3: Commit Ticker with full horizontal breathing room */}
        <div className="min-w-0">
          <CommitTicker project={project} />
        </div>
      </div>

      {/* Right: Compact Hardware Action Console */}
      <div className="flex shrink-0 items-center gap-1.5">
        {project.launchUrl ? (
          <a
            href={project.launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => foley.relay()}
            className="btn btn-primary min-h-9! h-9 gap-1 rounded-[var(--radius-sm)]! px-3 text-[11px] font-bold tracking-[0.07em] uppercase whitespace-nowrap"
          >
            <span>Launch</span>
            <ArrowUpRight size={13.5} className="shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              foley.latch();
              setPeek(project.name, 'spot', 'brief');
            }}
            className="btn btn-primary min-h-9! h-9 gap-1 rounded-[var(--radius-sm)]! px-3 text-[11px] font-bold tracking-[0.07em] uppercase whitespace-nowrap"
          >
            <span>Inspect</span>
            <Eye size={13.5} className="shrink-0" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            foley.latch();
            setPeek(project.name, 'spot', project.launchUrl ? 'sandbox' : 'brief');
          }}
          className="btn min-h-9! h-9 gap-1 rounded-[var(--radius-sm)]! bg-elevated/90! px-2.5 text-[11.5px] whitespace-nowrap"
          aria-label={`Live Peek ${project.displayName}`}
        >
          <Eye size={13.5} className="shrink-0" aria-hidden="true" />
          <span>Peek</span>
        </button>

        {project.launchUrl && (
          <IconButton
            label={`QR handoff for ${project.displayName}`}
            size="sm"
            className="h-8! w-8! rounded-[var(--radius-sm)]! border border-hairline bg-elevated/75!"
            onClick={() => {
              foley.click();
              setPeek(project.name, 'spot', 'qr');
            }}
          >
            <QrCode size={13.5} />
          </IconButton>
        )}

        <a
          className="icon-btn h-8! w-8! rounded-[var(--radius-sm)]! border border-hairline bg-elevated/75!"
          href={project.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Source of ${project.displayName} on GitHub`}
          title="Source on GitHub"
          onClick={() => foley.click()}
        >
          <GithubMark size={13.5} />
        </a>

        <IconButton
          label={project.pinned ? `Unpin ${project.displayName}` : `Pin ${project.displayName}`}
          aria-pressed={project.pinned}
          size="sm"
          className="h-8! w-8! rounded-[var(--radius-sm)]! border border-hairline bg-elevated/75!"
          onClick={() => {
            foley.latch();
            togglePin(project.name);
            toast(project.pinned ? `Unpinned ${project.displayName}` : `Pinned ${project.displayName} to dock`, 'ok');
          }}
        >
          <Star size={13.5} fill={project.pinned ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
    </motion.article>
  );
}
