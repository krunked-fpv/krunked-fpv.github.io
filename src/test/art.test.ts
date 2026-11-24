import { describe, expect, it } from 'vitest';
import { makePalette, remapHue } from '../art/color';
import { cyrb53 } from '../art/hash';
import { mulberry32 } from '../art/prng';

describe('procedural art determinism & palette guard', () => {
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

  it('remaps every hue out of the 245–340 purple/indigo/magenta band', () => {
    for (let h = 0; h < 360; h++) {
      const remapped = remapHue(h);
      expect(remapped < 245 || remapped > 340).toBe(true);
    }
  });

  it('produces deterministic palettes without purple hues', () => {
    const p1 = makePalette(270);
    const p2 = makePalette(270);
    expect(p1.hue).toBe(p2.hue);
    expect(p1.hue < 245 || p1.hue > 340).toBe(true);
    expect(p1.key).toBe(p2.key);
    expect(p1.counter).toBe(p2.counter);
  });
});
