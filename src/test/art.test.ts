import { describe, expect, it } from 'vitest';
import {
  buildChronoWindow,
  buildMomentumPath,
  formatRepoSummary,
  normalizeChronoDays,
  resolveChronoWindowRange,
  thermalTier,
} from '../art/chronoPulse';
import { makePalette, nonPurpleRgb, oklchToRgb, parseHex, remapHue, rgbToHue } from '../art/color';
import { coverKey } from '../art/coverCache';
import { cyrb53 } from '../art/hash';
import { mulberry32 } from '../art/prng';
import { buildQrPath, encodeQrMatrix, renderQrSvgString, type QrEcLevel } from '../art/qr';
import { buildEmblemSpec, fnv1a32, renderSwissEmblemSvg } from '../art/swissEmblem';

const isNonPurpleHue = (h: number) => h < 245 || h > 340;

describe('procedural art determinism, dual themes & non-purple guard', () => {
  it('produces identical seeds and PRNG sequences for identical inputs', () => {
    const s1 = cyrb53('maul-forge|JavaScript|');
    const s2 = cyrb53('maul-forge|JavaScript|');
    const s3 = cyrb53('bitforge-80|JavaScript|');
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);

    const r1 = mulberry32(s1);
    const r2 = mulberry32(s2);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it('remaps every hue in [0..360) and non-finite inputs out of the 245..340 band', () => {
    for (let h = -360; h < 720; h++) {
      const remapped = remapHue(h);
      expect(remapped).toBeGreaterThanOrEqual(0);
      expect(remapped).toBeLessThan(360);
      expect(isNonPurpleHue(remapped)).toBe(true);
    }
    expect(isNonPurpleHue(remapHue(Number.NaN))).toBe(true);
    expect(isNonPurpleHue(remapHue(Number.POSITIVE_INFINITY))).toBe(true);
  });

  it('generates distinct deterministic dual-theme palettes (Obsidian & Braun Daylight) with zero purple hues', () => {
    for (const theme of ['obsidian', 'daylight'] as const) {
      for (let h = 0; h < 360; h += 15) {
        const p = makePalette(h, theme);
        expect(p.theme).toBe(theme);
        expect(p.isLight).toBe(theme === 'daylight');
        expect(isNonPurpleHue(p.hue)).toBe(true);
        expect(isNonPurpleHue(p.counterHue)).toBe(true);

        // Verify prism dispersion offsets stay remapped out of 245..340 deg and never produce purple/magenta RGB (r > g && b > g)
        for (let band = 0; band < 7; band++) {
          const bandRaw = p.hue + band * 24 - 64;
          expect(isNonPurpleHue(remapHue(bandRaw))).toBe(true);
          const [r, g, b] = nonPurpleRgb(theme === 'daylight' ? 0.54 : 0.78, 0.15, bandRaw);
          const { hue } = rgbToHue(r, g, b);
          expect(hue > 255 && hue < 340).toBe(false);
          if (hue >= 245 && hue <= 340) {
            expect(r).toBeLessThanOrEqual(g); // clipped cerulean/blue only, never red-violet/purple
          }
        }
      }
    }

    const obs = makePalette(270, 'obsidian');
    const day = makePalette(270, 'daylight');
    expect(obs.ground).toBe('#090B0F');
    expect(day.ground).toBe('#ECEAE4');
    expect(obs.key).not.toBe(day.key);
    expect(obs.ink).not.toBe(day.ink);
    expect(parseHex('#FF4F00')).toEqual([255, 79, 0]);
    expect(parseHex('#0f8')).toEqual([0, 255, 136]);
    expect(parseHex('not-a-hex')).toBeNull();
    expect(oklchToRgb(0.7, 0.14, 185)).toHaveLength(3);
  });

  it('differentiates coverCache keys by theme, style, seed, hue, dimensions, and DPR', () => {
    const base = { seed: 42, style: 'topo' as const, hue: 190, w: 320, h: 200, dpr: 2 };
    const kObs = coverKey({ ...base, theme: 'obsidian' });
    const kDay = coverKey({ ...base, theme: 'daylight' });
    const kDefault = coverKey(base);
    expect(kObs).toBe(kDefault);
    expect(kObs).not.toBe(kDay);
    expect(kObs).not.toBe(coverKey({ ...base, style: 'orbital', theme: 'obsidian' }));
    expect(kObs).not.toBe(coverKey({ ...base, dpr: 1, theme: 'obsidian' }));
  });
});

describe('ISO/IEC 18004 QR encoder & SVG renderer', () => {
  it('encodes valid QR matrices across versions 1..14 and EC levels L/M/Q/H with finder/timing/dark-module invariants', () => {
    const cases: Array<{ text: string; ecLevel: QrEcLevel; minVer: number }> = [
      { text: 'https://krunked-fpv.github.io/dojo/', ecLevel: 'L', minVer: 2 },
      { text: 'https://krunked-fpv.github.io/maul-forge/', ecLevel: 'M', minVer: 3 },
      { text: 'https://krunked-fpv.github.io/discogs_collection/?sort=velocity&view=bento', ecLevel: 'Q', minVer: 4 },
      { text: 'A'.repeat(180), ecLevel: 'H', minVer: 10 },
    ];

    for (const c of cases) {
      const m1 = encodeQrMatrix(c.text, { ecLevel: c.ecLevel });
      const m2 = encodeQrMatrix(c.text, { ecLevel: c.ecLevel });
      expect(m1.version).toBeGreaterThanOrEqual(c.minVer);
      expect(m1.version).toBeLessThanOrEqual(14);
      expect(m1.size).toBe(17 + 4 * m1.version);
      expect(m1.mask).toBeGreaterThanOrEqual(0);
      expect(m1.mask).toBeLessThanOrEqual(7);
      expect(m1.modules).toEqual(m2.modules);

      // Verify all three 7x7 finder corners (outer ring dark, inner ring light, 3x3 center dark)
      const corners: Array<[number, number]> = [
        [0, 0],
        [0, m1.size - 7],
        [m1.size - 7, 0],
      ];
      for (const [top, left] of corners) {
        expect(m1.modules[top]![left]).toBe(1);
        expect(m1.modules[top + 1]![left + 1]).toBe(0);
        expect(m1.modules[top + 3]![left + 3]).toBe(1);
      }

      // Mandatory dark module at (4*version + 9, 8)
      expect(m1.modules[4 * m1.version + 9]![8]).toBe(1);

      // Timing strips along row 6 and column 6
      for (let i = 8; i < m1.size - 8; i++) {
        expect(m1.modules[6]![i]).toBe(i % 2 === 0 ? 1 : 0);
        expect(m1.modules[i]![6]).toBe(i % 2 === 0 ? 1 : 0);
      }
    }
  });

  it('rejects unsupported EC levels and payloads exceeding Version 14 capacity', () => {
    expect(() => encodeQrMatrix('hi', { ecLevel: 'Z' as QrEcLevel })).toThrow(RangeError);
    expect(() => encodeQrMatrix('X'.repeat(600), { ecLevel: 'H' })).toThrow(RangeError);
  });

  it('builds quiet-zone RLE SVG paths and neutralizes XML/XSS injection in attributes', () => {
    const m = encodeQrMatrix('https://krunked-fpv.github.io/dojo/', { ecLevel: 'M' });
    const { total, pathD } = buildQrPath(m, 4);
    expect(total).toBe(m.size + 8);
    expect(pathD.startsWith('M')).toBe(true);

    const svg = renderQrSvgString('https://krunked-fpv.github.io/dojo/', {
      fg: 'javascript:alert(1)',
      bg: '"><script>alert(1)</script>',
      ariaLabel: 'Dojo "QR" <script>x</script>',
      className: 'qr-box" onclick="alert(1)',
    });
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#090B0F"');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('onclick=');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('Swiss-grid micro-emblem generator', () => {
  it('computes deterministic FNV-1a hashes and spans all 8 architectural archetypes', () => {
    expect(fnv1a32('dojo')).toBe(fnv1a32('dojo'));
    expect(fnv1a32('dojo')).not.toBe(fnv1a32('maul-forge'));

    const seen = new Set<number>();
    for (let i = 0; i < 64; i++) {
      const spec = buildEmblemSpec(`krunked-repo-${i}`);
      seen.add(spec.archetype);
      expect(spec.innerShapes.length).toBeGreaterThan(0);
      expect(spec.frameShapes.length).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(8);
  });

  it('remaps purple hue overrides and escapes SVG attributes safely', () => {
    const spec = buildEmblemSpec('taxquest', { hue: 280 });
    const rgb = parseHex(spec.accent);
    expect(rgb).not.toBeNull();
    const { hue } = rgbToHue(...rgb!);
    expect(isNonPurpleHue(hue)).toBe(true);

    const svg = renderSwissEmblemSvg('dojo', {
      accent: 'url(javascript:alert(1))',
      ariaLabel: 'Badge "<img src=x>"',
      className: 'emblem" onload="x()',
    });
    expect(svg).toContain('viewBox="0 0 48 48"');
    expect(svg).not.toContain('javascript:');
    expect(svg).not.toContain('onload=');
    expect(svg).toContain('&lt;img');
  });
});

describe('UTC Chrono-Pulse windowing & thermal tier helpers', () => {
  it('normalizes input series into exact 90 chronological UTC days and aggregates sprint windows', () => {
    const now = Date.UTC(2026, 10, 24, 18, 0, 0);
    const days = normalizeChronoDays(
      [
        { date: '2026-11-23', count: 3, repos: ['dojo', 'maul-forge', 'dojo'] },
        { date: '2026-11-24', count: 6, repos: ['krunked_skymap'] },
      ],
      90,
      now,
    );
    expect(days).toHaveLength(90);
    expect(days[88]).toEqual({ date: '2026-11-23', count: 3, repos: ['dojo', 'maul-forge'] });
    expect(days[89]).toEqual({ date: '2026-11-24', count: 6, repos: ['krunked_skymap'] });

    // Reversed indices clamp & sort cleanly
    const win = buildChronoWindow(days, 89, 88);
    expect(win).toEqual({
      startDate: '2026-11-23',
      endDate: '2026-11-24',
      startIdx: 88,
      endIdx: 89,
      totalCount: 9,
      repos: ['dojo', 'krunked_skymap', 'maul-forge'],
    });
    expect(resolveChronoWindowRange({ startDate: '2026-11-23', endDate: '2026-11-24' }, days)).toEqual([88, 89]);
    expect(thermalTier(0, 6)).toBe(0);
    expect(thermalTier(1, 6)).toBe(1);
    expect(thermalTier(2, 6)).toBe(2);
    expect(thermalTier(6, 6)).toBe(3);
    expect(formatRepoSummary(['a', 'b', 'c', 'd'], 2)).toBe('a, b +2');
    expect(buildMomentumPath(days, 36, 28, 4).startsWith('M2.0,')).toBe(true);
  });
});
