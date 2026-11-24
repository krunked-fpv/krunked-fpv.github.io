import { cyrb53 } from '../art/hash';
import { parseHex, remapHue, rgbToHue } from '../art/color';
import { PROJECT_OVERRIDES, type ProjectOverride } from '../config/projectOverrides';
import { getProbe } from '../data/probe';
import { cachedCommits } from '../data/enrich';
import type { CommitLite, GhEvent, GhRepo } from '../types/github';
import type { ArtStyle, Category, Project } from '../types/project';
import { sparkline, velocity } from './activity';
import { classify } from './classify';
import { freshnessOf } from './freshness';
import { pickGlyph } from './glyphs';
import { fallbackTagline, humanizeName } from './humanize';
import { resolveLaunch } from './resolveLaunch';

const STYLE_BY_CAT: Partial<Record<Category, ArtStyle>> = {
  Game: 'synthwave',
  'Hardware/Sky': 'orbital',
  'Audio/Vinyl': 'groove',
  Automation: 'prism',
};
const STYLES: ArtStyle[] = ['topo', 'orbital', 'synthwave', 'prism', 'groove'];
const DAY = 86_400_000;

export interface BuildInput {
  repos: GhRepo[];
  events: GhEvent[];
  pins: string[];
  now: number;
  overrides?: Record<string, Partial<ProjectOverride>>;
  /** injectable for tests */
  commitsFor?: (repo: string) => CommitLite[];
  probeFor?: (url: string) => { isPwa: boolean; themeColor: string | null; ogImage: string | null } | undefined;
}

export function buildProjects(input: BuildInput): Project[] {
  const { repos, events, pins, now } = input;
  const overrides = input.overrides ?? PROJECT_OVERRIDES;
  const commitsFor = input.commitsFor ?? ((r: string) => cachedCommits(r)?.commits ?? []);
  const probeFor = input.probeFor ?? getProbe;

  const pushesByRepo = new Map<string, GhEvent[]>();
  for (const e of events) {
    if (e.type !== 'PushEvent') continue;
    const name = e.repo.name.split('/')[1] ?? '';
    const arr = pushesByRepo.get(name) ?? [];
    arr.push(e);
    pushesByRepo.set(name, arr);
  }

  const out: Project[] = [];
  for (const r of repos) {
    const ov = overrides[r.name] ?? {};
    if (ov.hidden || r.fork || r.archived) continue;

    const launchUrl = resolveLaunch(r, ov.launchUrl);
    const kind = launchUrl ? 'live' : 'code';
    const sizeKb = r.size;
    const category = classify(r, kind, sizeKb, ov.category);
    const pushes = (pushesByRepo.get(r.name) ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const lastPush = pushes[0]?.created_at;
    const lastActivityAt = lastPush && Date.parse(lastPush) > Date.parse(r.pushed_at) ? lastPush : r.pushed_at;
    const commits = commitsFor(r.name);
    const head = pushes[0]?.payload.head;
    const latestCommit: CommitLite | null =
      commits[0] ?? (head ? { sha: head, message: '', date: pushes[0]?.created_at ?? r.pushed_at, author: '' } : null);
    const pushDates = pushes.map((p) => p.created_at);
    const spark = sparkline(commits, pushDates, now);
    const commits14 = commits.filter((c) => now - Date.parse(c.date) < 14 * DAY).length;
    const commits7d = commits.filter((c) => now - Date.parse(c.date) < 7 * DAY).length;
    const pushes14 = pushes.filter((p) => now - Date.parse(p.created_at) < 14 * DAY).length;
    const pushes7d = Math.max(pushes.filter((p) => now - Date.parse(p.created_at) < 7 * DAY).length, commits7d);

    const seed = cyrb53(`${r.name}|${r.language ?? ''}|${r.topics.join(',')}`);
    const probe = launchUrl ? probeFor(launchUrl) : undefined;
    let accentHue: number | null = ov.accent ?? null;
    if (accentHue === null && probe?.themeColor) {
      const rgb = parseHex(probe.themeColor);
      if (rgb) {
        const { L, hue } = rgbToHue(...rgb);
        if (L > 0.25 && L < 0.95) accentHue = hue;
      }
    }
    const style = ov.artStyle ?? STYLE_BY_CAT[category] ?? (STYLES[seed % STYLES.length] as ArtStyle);
    const rawHue = accentHue ?? (seed % 360);
    accentHue = remapHue(rawHue);

    out.push({
      id: r.name,
      name: r.name,
      displayName: ov.displayName ?? humanizeName(r.name),
      tagline: ov.tagline ?? r.description ?? fallbackTagline(category, r.language),
      kind,
      category,
      launchUrl,
      sourceUrl: r.html_url,
      language: r.language,
      topics: r.topics,
      stars: r.stargazers_count,
      forks: r.forks_count,
      sizeKb,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      lastActivityAt,
      freshness: freshnessOf(lastActivityAt, now),
      accentHue,
      art: { seed, style },
      glyph: pickGlyph(r.name, r.topics, category, ov.glyph),
      isPwa: !!probe?.isPwa,
      ogImage: probe?.ogImage ?? null,
      screenshot: ov.screenshot ?? null,
      pinned: pins.includes(r.name),
      featured: !!ov.featured,
      latestCommit,
      recentCommits: commits.slice(0, 8),
      sparkline: spark,
      pushes7d,
      velocityScore: velocity(commits14, pushes14, sizeKb),
      defaultBranch: r.default_branch,
    });
  }
  return out;
}

export const hueOf = (p: Project) => p.accentHue ?? p.art.seed % 360;
