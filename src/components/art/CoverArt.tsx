import type { ArtTheme, Project } from '../../types/project';
import { WorldVisual, type WorldScrim } from './WorldVisual';

export type CoverScrim = WorldScrim;

export interface CoverArtProps {
  project: Project;
  className?: string;
  animated?: boolean;
  fill?: boolean;
  theme?: ArtTheme;
  /**
   * Contextual readability veil over the bespoke world scene:
   * - 'none': unobstructed full-vivid artwork
   * - 'subtle' (default): delicate bottom edge feather for gallery plates
   * - 'blade': vertical edge scrim optimized for narrow cinema accordion blades
   * - 'stage': sculpted dual-axis contrast pocket for monumental stage typography
   */
  scrim?: CoverScrim;
}

/**
 * Dual-theme cover art entrypoint delegating directly to the 18 bespoke per-app
 * commissioned worlds rendered by `WorldVisual` (with user-curated screenshot override support).
 */
export function CoverArt(props: CoverArtProps) {
  return <WorldVisual {...props} />;
}
