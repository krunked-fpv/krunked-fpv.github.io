import {
  Activity, AppWindow, Bot, Code2, Cpu, Disc3, FlaskConical, FlaskRound, Gamepad2, Hammer, Hexagon, Languages,
  NotebookPen, Orbit, Radar, Receipt, Scale, Swords, Telescope, Wrench, type LucideIcon,
} from 'lucide-react';
import type { GlyphName } from '../../domain/glyphs';

const ICONS: Record<GlyphName, LucideIcon> = {
  Gamepad2, Telescope, Disc3, Receipt, FlaskRound, Languages, Scale, Activity, Hexagon, Hammer, Swords,
  NotebookPen, FlaskConical, Orbit, Code2, AppWindow, Radar, Bot, Wrench, Cpu,
};

/** Lucide icon in a glass chip with accent hairline + inner glow. */
export function Glyph({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  const Icon = ICONS[name as GlyphName] ?? Code2;
  const c = `oklch(0.78 0.14 ${hue})`;
  return (
    <span
      className="inline-grid shrink-0 place-items-center backdrop-blur-md"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        color: c,
        background: `radial-gradient(circle at 30% 20%, oklch(0.5 0.12 ${hue} / 0.35), rgba(7,8,10,0.55))`,
        boxShadow: `inset 0 0 0 1px oklch(0.78 0.14 ${hue} / 0.35), inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 18px -6px oklch(0.78 0.14 ${hue} / 0.6)`,
      }}
    >
      <Icon size={size * 0.5} strokeWidth={1.7} />
    </span>
  );
}
