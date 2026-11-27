import {
  Activity,
  AppWindow,
  Blocks,
  Bot,
  Castle,
  CircuitBoard,
  Code2,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Disc3,
  Dna,
  Flame,
  FlaskConical,
  FlaskRound,
  Gamepad2,
  Gauge,
  Gem,
  Ghost,
  Hammer,
  Hexagon,
  Languages,
  Layers,
  Mountain,
  Music,
  NotebookPen,
  Orbit,
  Radar,
  Radio,
  Receipt,
  Rocket,
  Scale,
  Shield,
  Spade,
  Sparkles,
  Swords,
  Telescope,
  Terminal,
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
  Mountain,
  Castle,
  CircuitBoard,
  Flame,
  Crown,
  Compass,
  Crosshair,
  Dna,
  Rocket,
  Sparkles,
  Layers,
  Shield,
  Terminal,
  Gauge,
  Spade,
  Gem,
  Ghost,
  Blocks,
  Radio,
  Music,
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
 * Precision 4px chamfered spacecraft instrument badge (zero soft bubbly glow),
 * dual-calibrated for Event Horizon (#020203) and Solar Eclipse (#F5F3EC) at >= 5:1 contrast.
 */
export function Glyph({ name, hue, size = 36, slug, variant = 'icon', className = '' }: GlyphProps) {
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const pal = makePalette(hue, theme);
  const Icon = ICONS[name as GlyphName] ?? Code2;
  const iconSize = Math.max(13, Math.round(size * 0.48));

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center backdrop-blur-md ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        color: pal.key,
        background: pal.isLight
          ? 'rgba(255, 255, 255, 0.96)'
          : `radial-gradient(circle at 50% 18%, ${pal.keyAlpha(0.14)}, rgba(4, 5, 7, 0.94) 76%)`,
        boxShadow: pal.isLight
          ? `inset 0 0 0 1px rgba(10, 10, 11, 0.18), inset 0 2px 0 ${pal.key}`
          : `inset 0 0 0 1px ${pal.keyAlpha(0.48)}, inset 0 1px 0 rgba(245, 243, 236, 0.14)`,
      }}
    >
      {variant === 'emblem' && slug ? (
        <SwissEmblem slug={slug} size={Math.round(size * 0.74)} hue={pal.hue} framed={false} />
      ) : (
        <Icon size={iconSize} strokeWidth={1.85} />
      )}
    </span>
  );
}
