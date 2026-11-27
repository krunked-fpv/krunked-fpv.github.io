import { describe, expect, it } from 'vitest';
import {
  AUTO_WORLD_ARCHETYPES,
  renderAutoWorldScene,
  selectAutoWorldArchetype,
  type AutoWorldArchetype,
} from '../art/autoWorld';
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
import { renderWorldScene } from '../art/worldScenes';

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

function createRecordingCanvas() {
  const ops: string[] = [];
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy(
    {
      canvas: { width: 320, height: 200 },
      createLinearGradient: () => {
        ops.push('linearGrad');
        return grad;
      },
      createRadialGradient: () => {
        ops.push('radialGrad');
        return grad;
      },
      createPattern: () => null,
      setLineDash: () => {},
      measureText: () => ({ width: 20 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return (..._args: unknown[]) => {
          ops.push(String(prop));
        };
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, ops };
}

describe('multi-archetype procedural auto-world artwork generator', () => {
  it('assigns distinct thematic archetypes to new uncurated repos and spreads arbitrary future slugs broadly', () => {
    expect(AUTO_WORLD_ARCHETYPES.length).toBeGreaterThanOrEqual(12);

    const thematicCases: Array<{
      input: Parameters<typeof selectAutoWorldArchetype>[0];
      expected: AutoWorldArchetype;
    }> = [
      {
        input: {
          slug: 'krunked-n-fred',
          displayName: 'Krunked & Fred',
          tagline: 'Rope-tethered co-op precision platformer across perilous alpine peaks',
          category: 'Game',
          seed: cyrb53('krunked-n-fred'),
        },
        expected: 'summit',
      },
      {
        input: {
          slug: 'krunked-well',
          displayName: 'Krunked Well',
          tagline: 'Vertical gunboot descent roguelite',
          category: 'Game',
          seed: cyrb53('krunked-well'),
        },
        expected: 'abyss',
      },
      {
        input: {
          slug: 'krunked-tower',
          displayName: 'Krunked Tower',
          tagline: 'Kinetic 2D speed-platformer',
          category: 'Game',
          seed: cyrb53('krunked-tower'),
        },
        expected: 'citadel',
      },
      {
        input: {
          slug: 'krunked-dweller',
          displayName: 'Krunked Dweller',
          tagline: 'Dark fairy-tale gothic 2D Metroidvania with dynamic matchstick lighting',
          category: 'Game',
          seed: cyrb53('krunked-dweller'),
        },
        expected: 'catacomb',
      },
      {
        input: {
          slug: 'krunked-lumia',
          displayName: 'Krunked Lumia',
          tagline: 'Synesthetic diamond falling-block puzzle game',
          category: 'Game',
          seed: cyrb53('krunked-lumia'),
        },
        expected: 'diamond',
      },
      {
        input: {
          slug: 'krunked-circuit',
          displayName: 'Krunked Circuit',
          tagline: 'Action-platformer with hookshot grappling and booster chips',
          category: 'Game',
          seed: cyrb53('krunked-circuit'),
        },
        expected: 'circuit',
      },
      {
        input: {
          slug: 'krunked-tato',
          displayName: 'krunkedtato',
          tagline: 'Top-down arena shooter roguelite',
          category: 'Game',
          seed: cyrb53('krunked-tato'),
        },
        expected: 'arena',
      },
      {
        input: {
          slug: 'krunked-kartz',
          displayName: 'Krunked Kartz',
          tagline: 'Retro 3D kart racing and battle arena',
          category: 'Game',
          seed: cyrb53('krunked-kartz'),
        },
        expected: 'velocity',
      },
      {
        input: {
          slug: 'krunked-throne',
          displayName: 'KRUNKED THRONE',
          tagline: '16-bit wasteland action roguelike',
          category: 'Game',
          seed: cyrb53('krunked-throne'),
        },
        expected: 'wasteland',
      },
      {
        input: {
          slug: 'krunked-fall',
          displayName: 'KRUNKEDFALL',
          tagline: 'Neon-lit post-apocalyptic Norse twin-stick pixel-art action roguelite',
          category: 'Game',
          seed: cyrb53('krunked-fall'),
        },
        expected: 'runic',
      },
      {
        input: {
          slug: 'krunked-cells',
          displayName: 'Krunked Cells',
          tagline: 'Roguelite action-platformer with Boss Stem Cells',
          category: 'Game',
          seed: cyrb53('krunked-cells'),
        },
        expected: 'biocell',
      },
      {
        input: {
          slug: 'krunked-skybreaker',
          displayName: 'KRUNKED SKYBREAKER',
          tagline: 'Clean-room WebGL2 arcade dogfighter',
          category: 'Game',
          seed: cyrb53('krunked-skybreaker'),
        },
        expected: 'aero',
      },
      {
        input: {
          slug: 'krunked-quest',
          displayName: 'Krunked Quest',
          tagline: '16-bit neo-retro Metroidvania across 11 biomes',
          category: 'Game',
          seed: cyrb53('krunked-quest'),
        },
        expected: 'cartograph',
      },
      {
        input: {
          slug: 'krunked-cards',
          displayName: 'Krunked Cards',
          tagline: 'Deckbuilder prototype',
          category: 'Game',
          seed: cyrb53('krunked-cards'),
        },
        expected: 'deck',
      },
    ];

    const seenThematic = new Set<AutoWorldArchetype>();
    for (const tc of thematicCases) {
      const picked = selectAutoWorldArchetype(tc.input);
      expect(picked).toBe(tc.expected);
      seenThematic.add(picked);
    }
    expect(seenThematic.size).toBe(thematicCases.length);

    // Arbitrary opaque future slugs (no semantic keywords) must still fan out broadly across archetypes
    const opaqueSeen = new Set<AutoWorldArchetype>();
    for (let i = 0; i < 64; i++) {
      const slug = `project-zeta-${i}`;
      opaqueSeen.add(
        selectAutoWorldArchetype({
          slug,
          displayName: `Project Zeta ${i}`,
          tagline: '',
          category: 'App',
          seed: cyrb53(`${slug}|TypeScript|`),
        }),
      );
    }
    expect(opaqueSeen.size).toBeGreaterThanOrEqual(10);
  });

  it('renders every auto-world archetype cleanly across both themes and honors customArtStyle overrides in renderWorldScene', () => {
    for (const theme of ['obsidian', 'daylight'] as const) {
      for (const archetype of AUTO_WORLD_ARCHETYPES) {
        const { canvas, ops } = createRecordingCanvas();
        renderAutoWorldScene(canvas, {
          archetype,
          slug: `test-${archetype}`,
          seed: cyrb53(archetype),
          hue: 280, // purple input must be safely remapped
          w: 360,
          h: 220,
          dpr: 1,
          t: 1.25,
          theme,
        });
        expect(ops.length).toBeGreaterThan(25);
      }
    }

    // Two uncurated repos rendered through renderWorldScene must produce structurally distinct draw commands
    const recA = createRecordingCanvas();
    const recB = createRecordingCanvas();
    renderWorldScene(recA.canvas, {
      slug: 'krunked-kartz',
      seed: cyrb53('krunked-kartz'),
      hue: 48,
      w: 360,
      h: 220,
      theme: 'obsidian',
      displayName: 'Krunked Kartz',
      tagline: 'Retro 3D kart racing',
      category: 'Game',
    });
    renderWorldScene(recB.canvas, {
      slug: 'krunked-cells',
      seed: cyrb53('krunked-cells'),
      hue: 156,
      w: 360,
      h: 220,
      theme: 'obsidian',
      displayName: 'Krunked Cells',
      tagline: 'Boss Stem Cells roguelite',
      category: 'Game',
    });
    expect(recA.ops.join(',')).not.toBe(recB.ops.join(','));

    // Explicit customArtStyle override must change the rendered output from the default world
    const recDefault = createRecordingCanvas();
    const recCustom = createRecordingCanvas();
    renderWorldScene(recDefault.canvas, {
      slug: 'krunked-kartz',
      seed: cyrb53('krunked-kartz'),
      hue: 48,
      w: 360,
      h: 220,
      theme: 'obsidian',
      displayName: 'Krunked Kartz',
    });
    renderWorldScene(recCustom.canvas, {
      slug: 'krunked-kartz',
      seed: cyrb53('krunked-kartz'),
      hue: 48,
      w: 360,
      h: 220,
      theme: 'obsidian',
      displayName: 'Krunked Kartz',
      customArtStyle: 'groove',
    });
    expect(recCustom.ops.join(',')).not.toBe(recDefault.ops.join(','));
  });
});
