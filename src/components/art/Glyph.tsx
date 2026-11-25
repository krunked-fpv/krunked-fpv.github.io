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
 * Dual-theme machined bezel hardware badge (or deterministic Swiss micro-emblem)
 * with strictly non-purple OKLCH pigment accent and >= 5:1 contrast in Obsidian & Daylight.
 */
export function Glyph({ name, hue, size = 36, slug, variant = 'icon', className = '' }: GlyphProps) {
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const pal = makePalette(hue, theme);
  const Icon = ICONS[name as GlyphName] ?? Code2;
  const radius = Math.round(size * 0.27);
  const iconSize = Math.max(14, Math.round(size * 0.49));

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center backdrop-blur-md transition-transform duration-200 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        color: pal.key,
        background: pal.isLight
          ? `radial-gradient(circle at 26% 16%, ${pal.keyAlpha(0.13)}, rgba(255,255,255,0.93) 72%)`
          : `radial-gradient(circle at 26% 16%, ${pal.keyAlpha(0.26)}, rgba(10,12,17,0.86) 74%)`,
        boxShadow: pal.isLight
          ? `inset 0 0 0 1px ${pal.keyAlpha(0.32)}, inset 0 1px 0 rgba(255,255,255,0.96), 0 1px 2px rgba(17,19,24,0.08), 0 6px 14px -6px rgba(17,19,24,0.18)`
          : `inset 0 0 0 1px ${pal.keyAlpha(0.42)}, inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 18px -6px rgba(0,0,0,0.78), 0 2px 12px -5px ${pal.keyAlpha(0.42)}`,
      }}
    >
      {variant === 'emblem' && slug ? (
        <SwissEmblem slug={slug} size={Math.round(size * 0.76)} hue={pal.hue} framed={false} />
      ) : (
        <Icon size={iconSize} strokeWidth={1.85} />
      )}
    </span>
  );
}
