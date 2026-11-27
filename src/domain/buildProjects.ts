import { cyrb53 } from '../art/hash';
import { parseHex, remapHue, rgbToHue } from '../art/color';
import { GITHUB_USER, PAGES_ORIGIN } from '../config/site';
import { PROJECT_OVERRIDES, type ProjectOverride } from '../config/projectOverrides';
import { cachedCommits, cachedLanguages } from '../data/enrich';
import { getProbeBySlug } from '../data/probe';
import type { CommitLite, CommitsEntry, GhEvent, GhRepo, SnapshotProbe } from '../types/github';
import type { ArtStyle, Category, Project } from '../types/project';
import type { CurationOverride } from '../types/vault';
import { sparkline, velocity } from './activity';
import { classify } from './classify';
import { freshnessOf } from './freshness';
import { pickGlyph } from './glyphs';
import { fallbackTagline, humanizeName } from './humanize';
import { probeAppliesToCandidate, resolveLaunch } from './resolveLaunch';
import { isBotCommit, isSelfDeckRepo, sanitizeHttpUrl, stripHtmlAndEmojis } from './sanitize';

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
  /** User local curation overrides from vault.curation (takes precedence over static overrides). */
  curation?: Record<string, CurationOverride>;
  /** When true, includes hidden repos (marked hidden: true) so UI can inspect/unhide them. */
  includeHidden?: boolean;
  /** injectable for tests: accepts either CommitsEntry or bare CommitLite[]. */
  commitsFor?: (repo: string) => CommitsEntry | CommitLite[] | undefined;
  /** injectable for tests */
  languagesFor?: (repo: string) => Record<string, number> | undefined;
  /** injectable for tests */
  probeFor?: (slugOrUrl: string, candidateUrl?: string | null) => Partial<SnapshotProbe> | undefined;
}

function normalizeCommitsResult(res: CommitsEntry | CommitLite[] | undefined): CommitsEntry | undefined {
  if (!res) return undefined;
  if (Array.isArray(res)) return { pushedAt: '', commits: res };
  return res;
}

function resolveScreenshot(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('./') || (s.startsWith('/') && !s.startsWith('//'))) return s;
  return sanitizeHttpUrl(s);
}

/** Maps a deterministic seed uniformly across the 265-degree non-purple OKLCH wheel ([0..244] U [341..359]). */
function autoHueFromSeed(seed: number): number {
  const spread = ((Math.imul(seed >>> 0, 2654435761) >>> 0) % 265);
  return remapHue(spread < 245 ? spread : spread + 96);
}

export function buildProjects(input: BuildInput): Project[] {
  const { repos, events, pins, now, curation, includeHidden = false } = input;
  const overrides = input.overrides ?? PROJECT_OVERRIDES;
  const commitsFor = input.commitsFor ?? ((r: string) => cachedCommits(r));
  const languagesFor = input.languagesFor ?? ((r: string) => cachedLanguages(r));
  const probeFor =
    input.probeFor ?? ((slug: string, candidateUrl?: string | null) => getProbeBySlug(slug, candidateUrl));

  const pushesByRepo = new Map<string, GhEvent[]>();
  for (const e of events) {
    if (e.type !== 'PushEvent') continue;
    const name = e.repo.name.split('/')[1] ?? '';
    if (!name) continue;
    const arr = pushesByRepo.get(name) ?? [];
    arr.push(e);
    pushesByRepo.set(name, arr);
  }

  const out: Project[] = [];
  for (const r of repos) {
    if (r.fork || r.archived) continue;

    const staticOv = overrides[r.name] ?? {};
    const userOv = curation?.[r.name];
    const hasCustomCuration = Boolean(userOv && Object.keys(userOv).length > 0);
    const hidden = userOv?.hidden !== undefined ? Boolean(userOv.hidden) : Boolean(staticOv.hidden);

    if (hidden && !includeHidden) continue;

    const isSelfDeck = isSelfDeckRepo(r.name, GITHUB_USER);
    const explicitUrl = userOv?.launchUrl ?? staticOv.launchUrl;
    const candidateUrl = resolveLaunch(r, explicitUrl, GITHUB_USER, PAGES_ORIGIN);
    const rawProbe = probeFor(r.name, candidateUrl);
    const probe = rawProbe && candidateUrl && probeAppliesToCandidate(rawProbe, candidateUrl) ? rawProbe : undefined;
    const launchUrl = resolveLaunch(r, explicitUrl, GITHUB_USER, PAGES_ORIGIN, probe);
    const kind = launchUrl ? 'live' : 'code';

    let liveVerified: boolean | null = null;
    if (probe) {
      if (probe.isNotFound === true || probe.liveVerified === false) liveVerified = false;
      else if (probe.liveVerified === true) liveVerified = true;
    }

    const sizeKb = r.size;
    const cleanTopics = r.topics.map(stripHtmlAndEmojis).filter(Boolean);
    const cleanRepoDesc = r.description ? stripHtmlAndEmojis(r.description) : '';

    const pushes = (pushesByRepo.get(r.name) ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const lastPush = pushes[0]?.created_at;
    const lastActivityAt = lastPush && Date.parse(lastPush) > Date.parse(r.pushed_at) ? lastPush : r.pushed_at;

    const commitsEntry = normalizeCommitsResult(commitsFor(r.name));
    const commits = (commitsEntry?.commits ?? []).filter((c) => !isBotCommit(c));
    const head = pushes[0]?.payload.head;
    const latestCommit: CommitLite | null =
      commits[0] ?? (head ? { sha: head, message: '', date: pushes[0]?.created_at ?? r.pushed_at, author: '' } : null);

    const probedTitle = probe?.title ? stripHtmlAndEmojis(probe.title) : '';
    const probedSubtitle = probe?.subtitle ? stripHtmlAndEmojis(probe.subtitle) : '';
    const probedDesc = probe?.description
      ? stripHtmlAndEmojis(probe.description)
      : rawProbe?.description
        ? stripHtmlAndEmojis(rawProbe.description)
        : '';

    const commitMessages = commits.slice(0, 8).map((c) => c.message).filter(Boolean);
    const extraSignalText = [probedTitle, probedSubtitle, probedDesc, ...commitMessages].filter(Boolean).join(' ');

    const category = classify(
      { name: r.name, topics: cleanTopics, description: cleanRepoDesc || null, extraText: extraSignalText || null },
      kind,
      sizeKb,
      userOv?.category ?? staticOv.category,
    );

    const pushDates = pushes.map((p) => p.created_at);
    const liveSpark = sparkline(commits, pushDates, now, 30);
    const baked30 = commitsEntry?.commits30d;
    const spark =
      Array.isArray(baked30) && baked30.length === 30
        ? liveSpark.map((v, idx) => Math.max(v, baked30[idx] ?? 0))
        : liveSpark;

    const commits30dTotal = Math.max(
      commitsEntry?.commits30dTotal ?? 0,
      spark.reduce((sum, n) => sum + n, 0),
    );
    const commits14 = commits.filter((c) => now - Date.parse(c.date) < 14 * DAY).length;
    const commits7d = commits.filter((c) => now - Date.parse(c.date) < 7 * DAY).length;
    const pushes14 = pushes.filter((p) => now - Date.parse(p.created_at) < 14 * DAY).length;
    const spark7d = spark.slice(-7).reduce((sum, n) => sum + n, 0);
    const pushes7d = Math.max(
      pushes.filter((p) => now - Date.parse(p.created_at) < 7 * DAY).length,
      commits7d,
      spark7d,
    );

    const seed = cyrb53(`${r.name}|${r.language ?? ''}|${cleanTopics.join(',')}`);
    let accentHue: number | null = userOv?.accent ?? staticOv.accent ?? null;
    if (accentHue === null && probe?.themeColor) {
      const rgb = parseHex(probe.themeColor);
      if (rgb) {
        const { L, hue } = rgbToHue(...rgb);
        if (L > 0.25 && L < 0.95) accentHue = hue;
      }
    }
    const style = userOv?.artStyle ?? staticOv.artStyle ?? STYLE_BY_CAT[category] ?? (STYLES[seed % STYLES.length] as ArtStyle);
    accentHue = accentHue !== null ? remapHue(accentHue) : autoHueFromSeed(seed);

    const displayName =
      stripHtmlAndEmojis(userOv?.displayName) ||
      stripHtmlAndEmojis(staticOv.displayName) ||
      probedTitle ||
      humanizeName(r.name);

    const isPwa = Boolean(probe?.isPwa && kind === 'live');

    const tagline =
      stripHtmlAndEmojis(userOv?.tagline) ||
      stripHtmlAndEmojis(staticOv.tagline) ||
      cleanRepoDesc ||
      probedSubtitle ||
      probedDesc ||
      fallbackTagline(category, r.language, {
        name: r.name,
        commitMessages,
        isPwa,
        kind,
      });

    const sourceUrl = sanitizeHttpUrl(r.html_url) ?? `https://github.com/${GITHUB_USER}/${encodeURIComponent(r.name)}`;
    const actionsUrl = `${sourceUrl}/actions`;
    const languages = languagesFor(r.name) ?? {};

    out.push({
      id: r.name,
      name: r.name,
      displayName,
      tagline,
      kind,
      category,
      launchUrl,
      sourceUrl,
      actionsUrl,
      language: r.language ? stripHtmlAndEmojis(r.language) || null : null,
      languages,
      topics: cleanTopics,
      stars: r.stargazers_count,
      forks: r.forks_count,
      sizeKb,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      lastActivityAt,
      freshness: freshnessOf(lastActivityAt, now),
      accentHue,
      art: userOv?.artStyle ? { seed, style, customStyle: userOv.artStyle } : { seed, style },
      glyph: pickGlyph(r.name, cleanTopics, category, staticOv.glyph, `${displayName} ${tagline} ${extraSignalText}`),
      isPwa,
      isSelfDeck,
      liveVerified,
      ogImage: sanitizeHttpUrl(probe?.ogImage ?? null),
      iconUrl: sanitizeHttpUrl(probe?.iconUrl ?? probe?.manifest?.iconUrl ?? null),
      screenshot: resolveScreenshot(staticOv.screenshot),
      pinned: pins.includes(r.name),
      featured: userOv?.featured !== undefined ? Boolean(userOv.featured) : Boolean(staticOv.featured),
      hasCustomCuration,
      hidden,
      latestCommit,
      recentCommits: commits.slice(0, 10),
      sparkline: spark,
      pushes7d,
      commits30dTotal,
      velocityScore: velocity(commits14, pushes14, sizeKb),
      defaultBranch: r.default_branch,
    });
  }
  return out;
}

export const hueOf = (p: Project) => p.accentHue ?? p.art.seed % 360;
