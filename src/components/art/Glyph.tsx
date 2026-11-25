import {
  Activity,
  AppWindow,
  Bot,
  Code2,
  Cpu,
  Disc3,
  FlaskConical,
  FlaskRound,
  Gamepad2,
  Hammer,
  Hexagon,
  Languages,
  NotebookPen,
  Orbit,
  Radar,
  Receipt,
  Scale,
  Swords,
  Telescope,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { makePalette } from '../../art/color';
import type { GlyphName } from '../../domain/glyphs';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme } from '../../types/project';
import { SwissEmblem } from './SwissEmblem';

const ICONS: Record<GlyphName, LucideIcon> = {
  Gamepad2,
  Telescope,
  Disc3,
  Receipt,
  FlaskRound,
  Languages,
  Scale,
  Activity,
  Hexagon,
  Hammer,
  Swords,
  NotebookPen,
  FlaskConical,
  Orbit,
  Code2,
  AppWindow,
  Radar,
  Bot,
  Wrench,
  Cpu,
};

export interface GlyphProps {
  name: string;
  hue: number;
  size?: number;
  slug?: string;
  variant?: 'icon' | 'emblem';
  className?: string;
}

/**
 * Sharp architectural square-chamfer hardware badge (4px radius, crisp 1px structural border,
 * zero soft bubbly glow) with strictly non-purple OKLCH pigment accent >= 5:1 in both themes.
 */
export function Glyph({ name, hue, size = 36, slug, variant = 'icon', className = '' }: GlyphProps) {
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const pal = makePalette(hue, theme);
  const Icon = ICONS[name as GlyphName] ?? Code2;
  const iconSize = Math.max(14, Math.round(size * 0.48));

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center backdrop-blur-md ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        color: pal.key,
        background: pal.isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(8, 9, 12, 0.92)',
        boxShadow: pal.isLight
          ? `inset 0 0 0 1px rgba(10, 10, 11, 0.16), inset 0 2px 0 ${pal.keyAlpha(0.45)}`
          : `inset 0 0 0 1px ${pal.keyAlpha(0.42)}, inset 0 1px 0 rgba(245, 243, 236, 0.12)`,
      }}
    >
      {variant === 'emblem' && slug ? (
        <SwissEmblem slug={slug} size={Math.round(size * 0.74)} hue={pal.hue} framed={false} />
      ) : (
        <Icon size={iconSize} strokeWidth={1.8} />
      )}
    </span>
  );
}
