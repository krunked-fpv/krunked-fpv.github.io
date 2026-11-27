import { PAGES_ORIGIN, STORAGE_NS } from '../config/site';
import { probeAppliesToCandidate } from '../domain/resolveLaunch';
import {
  decodeHtmlEntities,
  sanitizeHttpUrl,
  sanitizeThemeColor,
  stripHtmlAndEmojis,
} from '../domain/sanitize';
import type { SnapshotManifest, SnapshotProbe } from '../types/github';
import { syncDisabled } from './ghClient';
import { readIdbProbes, withTimeout, writeIdbProbe } from './idbCache';

export type ProbeResult = SnapshotProbe;

const KEY = `${STORAGE_NS}:probe:v2`;
const TTL = 12 * 3_600_000;
const NEGATIVE_TTL = 30 * 60_000;
const PROBE_TIMEOUT_MS = 4500;

const BOILERPLATE_TITLES = new Set([
  'document',
  'vite app',
  'react app',
  'vite + react',
  'vite + react + ts',
  'vite + ts',
  'create react app',
  'index',
  'index.html',
  'untitled',
  'app',
  'home',
  'welcome',
  'localhost',
  'site not found',
  'page not found',
  '404',
  'github pages',
]);

let byUrl: Record<string, SnapshotProbe> | null = null;
const bySlug = new Map<string, SnapshotProbe>();

function isBoilerplateOrNotFoundTitle(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase().trim();
  if (BOILERPLATE_TITLES.has(lower)) return true;
  return lower.includes('site not found') || lower.includes('page not found') || /\b404\b/.test(lower);
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrString)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    const rawVal = match[2] ?? match[3] ?? match[4] ?? '';
    if (name) attrs[name] = rawVal;
  }
  return attrs;
}

function splitTitleSubtitle(cleanTitle: string): { title: string | null; subtitle: string | null } {
  if (!cleanTitle) return { title: null, subtitle: null };
  const match = cleanTitle.match(/^(.+?)\s+(?:\u2014|\u2013|--|\||::|-)\s+(.+)$/);
  if (!match) return { title: cleanTitle, subtitle: null };
  const head = (match[1] ?? '').trim();
  const sub = (match[2] ?? '').trim();
  return {
    title: head && !isBoilerplateOrNotFoundTitle(head) ? head : cleanTitle,
    subtitle: sub && !isBoilerplateOrNotFoundTitle(sub) ? sub : null,
  };
}

function scoreIconCandidate(attrs: Record<string, string>): number {
  const relTokens = String(attrs.rel ?? '').toLowerCase().split(/\s+/);
  let score = 1;
  if (relTokens.includes('apple-touch-icon')) score += 10;
  if (String(attrs.type ?? '').toLowerCase().includes('svg')) score += 8;
  const sizesMatch = String(attrs.sizes ?? '').match(/(\d+)x(\d+)/i);
  if (sizesMatch) score += Math.min(Number.parseInt(sizesMatch[1] ?? '0', 10) || 0, 512) / 32;
  if (String(attrs.href ?? '').toLowerCase().endsWith('.ico')) score -= 1;
  return score;
}

export interface ParsedProbeHtml {
  isNotFound: boolean;
  isPwa: boolean;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  themeColor: string | null;
  ogImage: string | null;
  iconUrl: string | null;
  manifestUrl: string | null;
}

/**
 * Pure, DOMParser-free HTML metadata parser safe for both browser and Node tests.
 * Detects GitHub Pages soft-404s, strips HTML/emojis, and strictly validates URLs.
 */
export function parseProbeHtml(html: string, base: string): ParsedProbeHtml {
  const empty: ParsedProbeHtml = {
    isNotFound: false,
    isPwa: false,
    title: null,
    subtitle: null,
    description: null,
    themeColor: null,
    ogImage: null,
    iconUrl: null,
    manifestUrl: null,
  };
  if (typeof html !== 'string' || !html.trim()) return empty;

  const safeBase = sanitizeHttpUrl(base) ?? undefined;
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');

  const titleMatch = stripped.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? stripHtmlAndEmojis(titleMatch[1]) : '';
  const lower = stripped.toLowerCase();

  const isNotFound =
    /site not found|page not found|\b404\b/i.test(rawTitle) ||
    lower.includes("there isn't a github pages site here") ||
    lower.includes('there isn\u2019t a github pages site here') ||
    lower.includes('site not found \u00b7 github pages');

  let title: string | null = null;
  let subtitle: string | null = null;
  if (!isNotFound && rawTitle && !isBoilerplateOrNotFoundTitle(rawTitle)) {
    const split = splitTitleSubtitle(rawTitle);
    title = split.title;
    subtitle = split.subtitle;
  }

  let description: string | null = null;
  let ogDescription: string | null = null;
  let ogTitle: string | null = null;
  let metaTagline: string | null = null;
  let themeColor: string | null = null;
  let ogImage: string | null = null;

  const metaRe = /<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(stripped)) !== null) {
    const attrs = parseAttributes(m[1] ?? '');
    const key = (attrs.name ?? attrs.property ?? '').toLowerCase().trim();
    const rawContent = attrs.content ?? '';
    if (!key || !rawContent) continue;

    if (key === 'description' && !description) {
      description = stripHtmlAndEmojis(rawContent) || null;
    } else if ((key === 'og:description' || key === 'twitter:description') && !ogDescription) {
      ogDescription = stripHtmlAndEmojis(rawContent) || null;
    } else if ((key === 'og:title' || key === 'application-name') && !ogTitle) {
      const cleaned = stripHtmlAndEmojis(rawContent);
      if (cleaned && !isBoilerplateOrNotFoundTitle(cleaned)) ogTitle = cleaned;
    } else if ((key === 'tagline' || key === 'subtitle') && !metaTagline) {
      metaTagline = stripHtmlAndEmojis(rawContent) || null;
    } else if (key === 'theme-color' && !themeColor) {
      themeColor = sanitizeThemeColor(rawContent);
    } else if ((key === 'og:image' || key === 'twitter:image') && !ogImage) {
      ogImage = sanitizeHttpUrl(decodeHtmlEntities(rawContent), safeBase);
    }
  }

  if (!isNotFound && !title && ogTitle) title = ogTitle;
  if (!subtitle && metaTagline) subtitle = metaTagline;
  if (!description && ogDescription) description = ogDescription;

  let manifestUrl: string | null = null;
  let bestIconUrl: string | null = null;
  let bestIconScore = -Infinity;

  const linkRe = /<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  while ((m = linkRe.exec(stripped)) !== null) {
    const attrs = parseAttributes(m[1] ?? '');
    const relTokens = String(attrs.rel ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!relTokens.length || !attrs.href) continue;

    const safeHref = sanitizeHttpUrl(decodeHtmlEntities(attrs.href), safeBase);
    if (!safeHref) continue;

    if (relTokens.includes('manifest') && !manifestUrl) {
      manifestUrl = safeHref;
    }
    if (relTokens.includes('icon') || relTokens.includes('apple-touch-icon')) {
      const score = scoreIconCandidate(attrs);
      if (score > bestIconScore) {
        bestIconScore = score;
        bestIconUrl = safeHref;
      }
    }
  }

  return {
    isNotFound,
    isPwa: Boolean(manifestUrl),
    title,
    subtitle,
    description,
    themeColor,
    ogImage,
    iconUrl: bestIconUrl,
    manifestUrl,
  };
}

/** Back-compatible alias for parseProbeHtml. */
export function parseProbe(html: string, base: string) {
  return parseProbeHtml(html, base);
}

function loadStore(): Record<string, SnapshotProbe> {
  if (byUrl) return byUrl;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    byUrl = raw ? (JSON.parse(raw) as Record<string, SnapshotProbe>) : {};
  } catch {
    byUrl = {};
  }
  return byUrl;
}

function saveStore() {
  try {
    if (typeof localStorage !== 'undefined' && byUrl) {
      localStorage.setItem(KEY, JSON.stringify(byUrl));
    }
  } catch {
    /* ignore */
  }
}

export function sanitizeProbe(raw: Partial<SnapshotProbe>): SnapshotProbe {
  const manifest: SnapshotManifest | null = raw.manifest
    ? {
        url: sanitizeHttpUrl(raw.manifest.url),
        name: raw.manifest.name ? stripHtmlAndEmojis(raw.manifest.name) || null : null,
        shortName: raw.manifest.shortName ? stripHtmlAndEmojis(raw.manifest.shortName) || null : null,
        themeColor: sanitizeThemeColor(raw.manifest.themeColor),
        iconUrl: sanitizeHttpUrl(raw.manifest.iconUrl),
      }
    : null;

  const isNotFound = Boolean(raw.isNotFound);
  return {
    candidateUrl: sanitizeHttpUrl(raw.candidateUrl),
    resolvedUrl: sanitizeHttpUrl(raw.resolvedUrl),
    liveVerified: isNotFound ? false : Boolean(raw.liveVerified),
    httpStatus: typeof raw.httpStatus === 'number' && Number.isFinite(raw.httpStatus) ? raw.httpStatus : null,
    isNotFound,
    isPwa: isNotFound ? false : Boolean(raw.isPwa),
    title: raw.title ? stripHtmlAndEmojis(raw.title) || null : null,
    subtitle: raw.subtitle ? stripHtmlAndEmojis(raw.subtitle) || null : null,
    description: raw.description ? stripHtmlAndEmojis(raw.description) || null : null,
    themeColor: sanitizeThemeColor(raw.themeColor) ?? manifest?.themeColor ?? null,
    ogImage: sanitizeHttpUrl(raw.ogImage),
    iconUrl: sanitizeHttpUrl(raw.iconUrl) ?? manifest?.iconUrl ?? null,
    manifest,
    probedAt: typeof raw.probedAt === 'string' && raw.probedAt ? raw.probedAt : new Date().toISOString(),
  };
}

/** Seed Tier-1 SnapshotV2 probes into memory & cache so client avoids redundant fetches on boot. */
export function seedProbes(probes: Record<string, SnapshotProbe> | undefined) {
  if (!probes || typeof probes !== 'object') return;
  const s = loadStore();
  for (const [slug, raw] of Object.entries(probes)) {
    if (!raw || typeof raw !== 'object') continue;
    const clean = sanitizeProbe(raw);
    if (!clean.candidateUrl && !clean.resolvedUrl) continue;
    const key = slug.toLowerCase();
    const prev = bySlug.get(key);
    const prevMs = prev ? Date.parse(prev.probedAt) || 0 : 0;
    const nextMs = Date.parse(clean.probedAt) || 0;
    if (!prev || nextMs >= prevMs) {
      bySlug.set(key, clean);
      if (clean.candidateUrl) s[clean.candidateUrl] = clean;
      if (clean.resolvedUrl) s[clean.resolvedUrl] = clean;
    }
  }
  saveStore();
}

export async function hydrateProbesFromIdb(timeoutMs = 25): Promise<number> {
  const s = loadStore();
  const entries = await withTimeout(readIdbProbes().catch(() => []), timeoutMs, []);
  let merged = 0;
  for (const [key, probe] of entries) {
    if (!probe || typeof probe !== 'object') continue;
    const clean = sanitizeProbe(probe);
    if (!clean.candidateUrl && !clean.resolvedUrl) continue;
    if (key.startsWith('http://') || key.startsWith('https://')) {
      const prev = s[key];
      if (!prev || (Date.parse(clean.probedAt) || 0) > (Date.parse(prev.probedAt) || 0)) {
        s[key] = clean;
        merged += 1;
      }
    } else {
      const slugKey = key.toLowerCase();
      const prev = bySlug.get(slugKey);
      if (!prev || (Date.parse(clean.probedAt) || 0) > (Date.parse(prev.probedAt) || 0)) {
        bySlug.set(slugKey, clean);
        merged += 1;
      }
    }
  }
  return merged;
}

export function getProbe(url: string): SnapshotProbe | undefined {
  return loadStore()[url];
}

export function getProbeBySlug(slug: string, url?: string | null): SnapshotProbe | undefined {
  const byName = bySlug.get(slug.toLowerCase());
  if (byName && (!url || probeAppliesToCandidate(byName, url))) {
    return byName;
  }
  if (url) {
    const exact = loadStore()[url];
    if (exact && probeAppliesToCandidate(exact, url)) return exact;
  }
  return undefined;
}

/**
 * Same-origin-only guard (SPEC.md §1 #7 & ARCHITECTURE.md §4.4).
 * Skips client probing under ?sync=off or when running on localhost / non-PAGES_ORIGIN
 * so zero cross-origin CORS console errors ever occur.
 */
export function canClientProbe(url: string): boolean {
  if (syncDisabled()) return false;
  if (typeof location === 'undefined') return false;
  if (location.origin.toLowerCase() !== PAGES_ORIGIN.toLowerCase()) return false;
  const safe = sanitizeHttpUrl(url);
  if (!safe) return false;
  try {
    return new URL(safe).origin.toLowerCase() === location.origin.toLowerCase();
  } catch {
    return false;
  }
}

function pickManifestIcon(icons: unknown, manifestBaseUrl: string): string | null {
  if (!Array.isArray(icons)) return null;
  let bestUrl: string | null = null;
  let bestSize = -1;
  for (const item of icons) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { src?: unknown; sizes?: unknown };
    if (typeof rec.src !== 'string') continue;
    const safeUrl = sanitizeHttpUrl(decodeHtmlEntities(rec.src), manifestBaseUrl);
    if (!safeUrl) continue;
    const match = String(rec.sizes ?? '').match(/(\d+)x(\d+)/i);
    const size = match ? Number.parseInt(match[1] ?? '0', 10) || 0 : 0;
    if (size >= bestSize) {
      bestSize = size;
      bestUrl = safeUrl;
    }
  }
  return bestUrl;
}

async function probeOne(url: string): Promise<SnapshotProbe | null> {
  if (!canClientProbe(url)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    const nowIso = new Date().toISOString();
    if (res.status >= 400) {
      return sanitizeProbe({
        candidateUrl: url,
        resolvedUrl: sanitizeHttpUrl(res.url) ?? url,
        liveVerified: false,
        httpStatus: res.status,
        isNotFound: true,
        isPwa: false,
        probedAt: nowIso,
      });
    }
    if (!res.ok) return null;

    const html = (await res.text()).slice(0, 200_000);
    const resolvedUrl = sanitizeHttpUrl(res.url) ?? url;
    const parsed = parseProbeHtml(html, resolvedUrl);

    if (parsed.isNotFound) {
      return sanitizeProbe({
        candidateUrl: url,
        resolvedUrl,
        liveVerified: false,
        httpStatus: res.status,
        isNotFound: true,
        isPwa: false,
        probedAt: nowIso,
      });
    }

    let manifest: SnapshotManifest | null = null;
    if (parsed.manifestUrl && canClientProbe(parsed.manifestUrl)) {
      try {
        const mRes = await fetch(parsed.manifestUrl, { signal: ctl.signal, credentials: 'omit' });
        if (mRes.ok) {
          const mj = (await mRes.json()) as Record<string, unknown>;
          const mUrl = sanitizeHttpUrl(mRes.url) ?? parsed.manifestUrl;
          manifest = {
            url: mUrl,
            name: typeof mj.name === 'string' ? stripHtmlAndEmojis(mj.name) || null : null,
            shortName:
              typeof mj.short_name === 'string'
                ? stripHtmlAndEmojis(mj.short_name) || null
                : typeof mj.shortName === 'string'
                  ? stripHtmlAndEmojis(mj.shortName) || null
                  : null,
            themeColor: sanitizeThemeColor(mj.theme_color ?? mj.themeColor),
            iconUrl: pickManifestIcon(mj.icons, mUrl),
          };
        }
      } catch {
        manifest = null;
      }
    }

    return sanitizeProbe({
      candidateUrl: url,
      resolvedUrl,
      liveVerified: true,
      httpStatus: res.status,
      isNotFound: false,
      isPwa: Boolean(parsed.isPwa || manifest),
      title: parsed.title ?? manifest?.name ?? null,
      subtitle: parsed.subtitle,
      description: parsed.description,
      themeColor: manifest?.themeColor ?? parsed.themeColor,
      ogImage: parsed.ogImage,
      iconUrl: manifest?.iconUrl ?? parsed.iconUrl,
      manifest,
      probedAt: nowIso,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface ProbeTarget {
  slug: string;
  url: string;
  pushedAt?: string;
}

export function isFreshProbe(
  probe: SnapshotProbe | undefined,
  now: number,
  candidateUrl?: string,
  pushedAt?: string,
  force = false,
): boolean {
  if (!probe) return false;
  if (candidateUrl && !probeAppliesToCandidate(probe, candidateUrl)) return false;
  if (force && !probe.liveVerified) return false;
  const ms = Date.parse(probe.probedAt);
  if (!Number.isFinite(ms)) return false;
  if (!probe.liveVerified && pushedAt) {
    const pushedMs = Date.parse(pushedAt);
    if (Number.isFinite(pushedMs) && pushedMs > ms) return false;
  }
  const maxAge = probe.liveVerified ? TTL : NEGATIVE_TTL;
  return now - ms < maxAge;
}

/** Probe same-origin live app pages when not already freshly verified by SnapshotV2. Zero API quota. */
export function probeAll(targets: ProbeTarget[], onResult: () => void, opts: { force?: boolean } = {}) {
  if (syncDisabled()) return;
  const s = loadStore();
  const now = Date.now();
  const force = Boolean(opts.force);
  const pending = targets.filter(({ slug, url, pushedAt }) => {
    if (!canClientProbe(url)) return false;
    const existing = getProbeBySlug(slug, url);
    return !isFreshProbe(existing, now, url, pushedAt, force);
  });
  if (!pending.length) return;

  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 300);

  idle(async () => {
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const target = pending[i++] as ProbeTarget;
        const result = await probeOne(target.url);
        if (!result) continue;
        s[target.url] = result;
        bySlug.set(target.slug.toLowerCase(), result);
        void writeIdbProbe(target.slug.toLowerCase(), result);
        onResult();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    saveStore();
  });
}

export function clearProbes() {
  byUrl = {};
  bySlug.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function _resetProbesForTests() {
  byUrl = null;
  bySlug.clear();
}
