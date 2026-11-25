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

/** Dual-theme hardware keycap icon (or deterministic Swiss micro-emblem) with non-purple OKLCH accent. */
export function Glyph({ name, hue, size = 36, slug, variant = 'icon', className = '' }: GlyphProps) {
  const theme: ArtTheme = useDeck((s) => s.vault.prefs.theme) ?? 'obsidian';
  const pal = makePalette(hue, theme);
  const Icon = ICONS[name as GlyphName] ?? Code2;
  const radius = Math.round(size * 0.28);

  return (
    <span
      className={`inline-grid shrink-0 place-items-center backdrop-blur-md ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        color: pal.key,
        background: `radial-gradient(circle at 28% 18%, ${pal.keyAlpha(pal.isLight ? 0.16 : 0.28)}, var(--badge-bg, ${pal.isLight ? 'rgba(247,246,242,0.88)' : 'rgba(8,9,11,0.74)'}))`,
        boxShadow: pal.isLight
          ? `inset 0 0 0 1px ${pal.keyAlpha(0.38)}, inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px -6px rgba(20,22,26,0.18)`
          : `inset 0 0 0 1px ${pal.keyAlpha(0.38)}, inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px -6px ${pal.keyAlpha(0.55)}`,
      }}
    >
      {variant === 'emblem' && slug ? (
        <SwissEmblem slug={slug} size={Math.round(size * 0.78)} hue={pal.hue} framed={false} />
      ) : (
        <Icon size={Math.round(size * 0.5)} strokeWidth={1.75} />
      )}
    </span>
  );
}
