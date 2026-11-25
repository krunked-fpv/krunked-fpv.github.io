export interface FuzzyResult {
  score: number;
  indices: number[];
}

function matchSingle(q: string, t: string): FuzzyResult | null {
  if (!q) return { score: 0, indices: [] };
  const exact = t.indexOf(q);
  if (exact >= 0) {
    const idx = Array.from({ length: q.length }, (_, i) => exact + i);
    return {
      score: 100 + (exact === 0 ? 40 : isBoundary(t, exact) ? 20 : 0) + q.length * 3 - exact * 0.2,
      indices: idx,
    };
  }
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi] as string;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    indices.push(found);
    if (found === ti && qi > 0) {
      run++;
      score += 6 + run * 2;
    } else {
      run = 0;
      score += 2;
    }
    if (found === 0) score += 12;
    else if (isBoundary(t, found)) score += 8;
    score -= Math.min(4, found - ti) * 0.5;
    ti = found + 1;
  }
  return { score, indices };
}

/** fzf-style subsequence match with bonuses for prefix, word starts, runs, and multi-token queries. */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, indices: [] };

  const direct = matchSingle(q, t);
  if (direct) return direct;

  // Multi-word fallback: all space-separated tokens must match in any order.
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;

  let totalScore = 0;
  const idxSet = new Set<number>();
  for (const tok of tokens) {
    const res = matchSingle(tok, t);
    if (!res) return null;
    totalScore += res.score;
    for (const i of res.indices) idxSet.add(i);
  }
  return {
    score: (totalScore / tokens.length) * 0.85,
    indices: [...idxSet].sort((a, b) => a - b),
  };
}

function isBoundary(t: string, i: number) {
  if (i === 0) return true;
  const p = t[i - 1] as string;
  return p === ' ' || p === '-' || p === '_' || p === '/' || p === '.';
}

export interface FuzzyField {
  text: string;
  weight: number;
}

/** Best weighted score across fields. Returns which field matched with its indices. */
export function fuzzyFields(
  query: string,
  fields: FuzzyField[],
): { score: number; field: number; indices: number[] } | null {
  let best: { score: number; field: number; indices: number[] } | null = null;
  fields.forEach((f, i) => {
    if (!f.text) return;
    const r = fuzzyMatch(query, f.text);
    if (!r) return;
    const s = r.score * f.weight;
    if (!best || s > best.score) best = { score: s, field: i, indices: r.indices };
  });
  return best;
}
