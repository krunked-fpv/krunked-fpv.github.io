import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_OWNER = 'krunked-fpv';
export const API_ORIGIN = 'https://api.github.com';
export const MAX_CONCURRENCY = 6;
export const API_TIMEOUT_MS = 10_000;
export const PROBE_TIMEOUT_MS = 4_500;
export const MAX_HTML_BYTES = 512 * 1024;
export const MAX_MANIFEST_BYTES = 128 * 1024;
export const MAX_README_BYTES = 16 * 1024;
export const RECENT_COMMITS_LIMIT = 15;

const MS_PER_DAY = 86_400_000;
const USER_AGENT = 'krunked-forge-deck-snapshot-v2';

const EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[\u{1F1E6}-\u{1F1FF}]|\u2605|\u2606)/gu;

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/g;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '\u00B7',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bull: '\u2022',
  laquo: '\u00AB',
  raquo: '\u00BB',
  times: '\u00D7',
  divide: '\u00F7',
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122',
  num: '#',
  sol: '/',
  colon: ':',
  lpar: '(',
  rpar: ')',
};

const BOILERPLATE_TITLE_RE =
  /^(?:document|vite\s+app|vite\s*\+\s*react(?:\s*\+\s*ts)?|vite\s*\+\s*ts|react\s+app|create\s+react\s+app|next\.js|svelte\s+app|vue\s+app|index(?:\.html?)?|home|untitled|app|welcome)$/i;

const NOT_FOUND_TITLE_RE = /(?:\b404\b|site\s+not\s+found|page\s+not\s+found)/i;
const NOT_FOUND_BODY_RE = /there\s+isn['’]t\s+a\s+github\s+pages\s+site\s+here/i;

const BOT_LOGINS = new Set([
  'github-actions[bot]',
  'dependabot[bot]',
  'renovate[bot]',
  'github-actions',
  'dependabot',
  'renovate',
]);

const SKIP_CI_RE = /\[(?:skip ci|ci skip)\]/i;

/**
 * Decode common HTML named and numeric entities into Unicode characters.
 */
export function decodeHtmlEntities(input) {
  if (input == null) return '';
  return String(input).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (
        Number.isFinite(code) &&
        code >= 0x20 &&
        code <= 0x10ffff &&
        (code < 0xd800 || code > 0xdfff) &&
        !(code >= 0x7f && code <= 0x9f)
      ) {
        return String.fromCodePoint(code);
      }
      return '';
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (
        Number.isFinite(code) &&
        code >= 0x20 &&
        code <= 0x10ffff &&
        (code < 0xd800 || code > 0xdfff) &&
        !(code >= 0x7f && code <= 0x9f)
      ) {
        return String.fromCodePoint(code);
      }
      return '';
    }
    const lower = entity.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match;
  });
}

function stripMarkupBlocks(text) {
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)/gi, ' ')
    .replace(/<\/?[a-zA-Z!][a-zA-Z0-9:-]*(?:[\s/][^<>]*)?\/?>/g, ' ');
}

/**
 * Strip HTML/script blocks, decode HTML entities (preventing double-encoded XSS),
 * strip Unicode pictographs/emojis and control characters, and normalize whitespace.
 */
export function sanitizeText(input) {
  if (input == null) return '';
  let text = stripMarkupBlocks(String(input));
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = decodeHtmlEntities(text);
    const cleaned = stripMarkupBlocks(decoded);
    if (cleaned === text) break;
    text = cleaned;
  }
  return text
    .replace(CONTROL_CHAR_REGEX, ' ')
    .replace(EMOJI_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const stripHtmlAndEmojis = sanitizeText;
export const stripEmojisAndDecodeHtml = sanitizeText;

/**
 * Validate and normalize an HTTP(S) URL against an optional base URL.
 * Rejects non-http(s) schemes (javascript:, data:, vbscript:, file:, blob:),
 * control characters, and embedded credentials.
 */
export function sanitizeHttpUrl(rawUrl, baseUrl) {
  if (typeof rawUrl !== 'string') return null;
  const decoded = decodeHtmlEntities(rawUrl).trim();
  if (!decoded || CONTROL_CHAR_REGEX.test(decoded)) return null;
  try {
    const parsed = baseUrl ? new URL(decoded, baseUrl) : new URL(decoded);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Validate a strict CSS hex color string (#RGB, #RGBA, #RRGGBB, #RRGGBBAA).
 */
export function sanitizeHexColor(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
}

function parseHtmlAttributes(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = re.exec(attrText)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = val;
  }
  return attrs;
}

function splitTitleAndSubtitle(rawTitle) {
  if (!rawTitle) return { titlePart: null, subtitlePart: null };
  const clean = sanitizeText(rawTitle);
  if (!clean || BOILERPLATE_TITLE_RE.test(clean)) {
    return { titlePart: null, subtitlePart: null };
  }
  const match = clean.match(/^(.+?)\s+(?:\u2014|\u2013|\u00B7|\||::|-)\s+(.+)$/);
  if (match) {
    const left = match[1].trim();
    const right = match[2].trim();
    const leftBoilerplate = BOILERPLATE_TITLE_RE.test(left);
    return {
      titlePart: leftBoilerplate ? null : left,
      subtitlePart: right || null,
    };
  }
  return { titlePart: clean, subtitlePart: null };
}

function ensureTrailingSlash(urlStr) {
  try {
    const u = new URL(urlStr);
    const lastSeg = u.pathname.split('/').pop() || '';
    if (!u.pathname.endsWith('/') && !lastSeg.includes('.')) {
      u.pathname = `${u.pathname}/`;
    }
    return u.href;
  } catch {
    return urlStr;
  }
}

/**
 * Extract safe, sanitized metadata from a sub-app HTML document and detect GitHub Pages soft-404s.
 */
export function parseSubAppHtml(htmlText, baseUrl) {
  const text = typeof htmlText === 'string' ? htmlText.slice(0, MAX_HTML_BYTES) : '';
  const resolvedBase = baseUrl ? ensureTrailingSlash(baseUrl) : undefined;

  const titleMatch = text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? sanitizeText(titleMatch[1]) : '';

  const isNotFound = NOT_FOUND_TITLE_RE.test(rawTitle) || NOT_FOUND_BODY_RE.test(text);

  if (isNotFound) {
    return {
      title: null,
      subtitle: null,
      description: null,
      themeColor: null,
      applicationName: null,
      iconUrl: null,
      ogImageUrl: null,
      manifestUrl: null,
      isNotFound: true,
    };
  }

  let metaDesc = null;
  let ogDesc = null;
  let ogTitle = null;
  let ogImage = null;
  let themeColor = null;
  let applicationName = null;

  const metaRe = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = metaRe.exec(text)) !== null) {
    const attrs = parseHtmlAttributes(m[1]);
    const rawContent = attrs.content ?? '';
    const key = (attrs.name || attrs.property || '').toLowerCase().trim();
    if (!key || !rawContent.trim()) continue;

    if (key === 'og:image' || key === 'twitter:image') {
      if (!ogImage) ogImage = sanitizeHttpUrl(rawContent, resolvedBase);
      continue;
    }
    if (key === 'theme-color') {
      if (!themeColor) themeColor = sanitizeHexColor(rawContent);
      continue;
    }

    const content = sanitizeText(rawContent);
    if (!content) continue;

    if (key === 'description' && !metaDesc) metaDesc = content;
    else if ((key === 'og:description' || key === 'twitter:description') && !ogDesc) ogDesc = content;
    else if ((key === 'og:title' || key === 'twitter:title') && !ogTitle) ogTitle = content;
    else if (key === 'application-name' && !applicationName) applicationName = content;
  }

  let manifestUrl = null;
  let linkIconUrl = null;
  let appleIconUrl = null;

  const linkRe = /<link\b([^>]*)>/gi;
  while ((m = linkRe.exec(text)) !== null) {
    const attrs = parseHtmlAttributes(m[1]);
    const relTokens = (attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    const href = attrs.href;
    if (!href) continue;
    const resolved = sanitizeHttpUrl(href, resolvedBase);
    if (!resolved) continue;

    if (relTokens.includes('manifest') && !manifestUrl) {
      manifestUrl = resolved;
    } else if (relTokens.includes('apple-touch-icon') && !appleIconUrl) {
      appleIconUrl = resolved;
    } else if (relTokens.includes('icon') && !linkIconUrl) {
      linkIconUrl = resolved;
    }
  }

  const cleanAppName = applicationName && !BOILERPLATE_TITLE_RE.test(applicationName) ? applicationName : null;
  const primaryTitle =
    rawTitle && !BOILERPLATE_TITLE_RE.test(rawTitle)
      ? rawTitle
      : ogTitle && !BOILERPLATE_TITLE_RE.test(ogTitle)
        ? ogTitle
        : cleanAppName;
  const { titlePart, subtitlePart } = splitTitleAndSubtitle(primaryTitle);

  return {
    title: titlePart,
    subtitle: subtitlePart,
    description: metaDesc || ogDesc || null,
    themeColor,
    applicationName: cleanAppName,
    iconUrl: appleIconUrl || linkIconUrl || null,
    ogImageUrl: ogImage || null,
    manifestUrl,
    isNotFound: false,
  };
}

function pickManifestIcon(icons, manifestUrl) {
  if (!Array.isArray(icons) || icons.length === 0) return null;
  let bestUrl = null;
  let bestScore = -1;

  for (const icon of icons) {
    if (!icon || typeof icon.src !== 'string') continue;
    const url = sanitizeHttpUrl(icon.src, manifestUrl);
    if (!url) continue;
    let score = 1;
    const sizesStr = String(icon.sizes || '');
    const sizeMatch = sizesStr.match(/(\d+)x(\d+)/);
    if (sizeMatch) {
      const px = Number.parseInt(sizeMatch[1], 10);
      if (px === 192) score += 50;
      else if (px === 512) score += 45;
      else if (px >= 128) score += 30;
      else score += 10;
    }
    const lowerUrl = url.toLowerCase();
    if (icon.type === 'image/svg+xml' || lowerUrl.endsWith('.svg')) {
      score += 40;
    } else if (icon.type === 'image/png' || lowerUrl.endsWith('.png')) {
      score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}

async function readBoundedText(res, maxBytes) {
  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let total = 0;
    let out = '';
    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const remaining = maxBytes - total;
        const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
        total += chunk.byteLength;
        out += decoder.decode(chunk, { stream: true });
        if (total >= maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      out += decoder.decode();
    } catch {
      // Partial read is safe to parse
    }
    return out;
  }
  const text = await res.text();
  return typeof text === 'string' ? text.slice(0, maxBytes) : '';
}

async function fetchWithTimeout(url, options, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function emptyProbe(candidateUrl, probedAt, overrides = {}) {
  return {
    candidateUrl: candidateUrl ?? null,
    resolvedUrl: null,
    liveVerified: false,
    httpStatus: null,
    isNotFound: false,
    isPwa: false,
    title: null,
    subtitle: null,
    description: null,
    themeColor: null,
    ogImage: null,
    iconUrl: null,
    manifest: null,
    probedAt,
    ...overrides,
  };
}

async function fetchValidManifest(candidateUrls, { fetchImpl, timeoutMs }) {
  const seen = new Set();
  for (const url of candidateUrls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const mRes = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          redirect: 'follow',
          headers: {
            Accept: 'application/manifest+json,application/json;q=0.9,*/*;q=0.8',
            'User-Agent': USER_AGENT,
          },
        },
        fetchImpl,
        timeoutMs,
      );
      if (!mRes || !mRes.ok) continue;
      const contentType = String(mRes.headers?.get?.('content-type') || '').toLowerCase();
      const rawText = await readBoundedText(mRes, MAX_MANIFEST_BYTES);
      const trimmed = rawText.trimStart();
      // Guard against SPA HTML 200 fallbacks returned for missing manifest files
      if (!trimmed || trimmed.startsWith('<')) continue;
      if (
        contentType &&
        !contentType.includes('json') &&
        !contentType.includes('octet-stream') &&
        !contentType.includes('text/plain')
      ) {
        continue;
      }
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const hasManifestShape =
        typeof parsed.name === 'string' ||
        typeof parsed.short_name === 'string' ||
        Array.isArray(parsed.icons) ||
        typeof parsed.start_url === 'string' ||
        typeof parsed.display === 'string';
      if (!hasManifestShape) continue;

      const resolvedManifestUrl = sanitizeHttpUrl(mRes.url || url) || url;
      const rawMName = sanitizeText(parsed.name);
      const rawMShort = sanitizeText(parsed.short_name);
      const rawMDesc = sanitizeText(parsed.description);
      return {
        url: resolvedManifestUrl,
        name: rawMName && !BOILERPLATE_TITLE_RE.test(rawMName) ? rawMName : null,
        shortName: rawMShort && !BOILERPLATE_TITLE_RE.test(rawMShort) ? rawMShort : null,
        description: rawMDesc || null,
        themeColor: sanitizeHexColor(parsed.theme_color),
        iconUrl: pickManifestIcon(parsed.icons, resolvedManifestUrl),
      };
    } catch {
      // Non-fatal: continue to next fallback candidate
    }
  }
  return null;
}

/**
 * Probe a candidate live sub-app URL and its web app manifest within timeoutMs.
 * Returns a SnapshotProbe conforming to src/types/github.ts.
 */
/**
 * Extract a clean, plain-text one-sentence summary from a repository README.md.
 * Skips headings, CI badges, Play Live links, code blocks, tables, and decorative quotes.
 */
export function extractReadmeSummary(markdown, maxLen = 175) {
  if (typeof markdown !== 'string' || !markdown.trim()) return null;

  // Strip fenced code blocks and HTML comments before splitting into paragraphs
  const stripped = markdown
    .slice(0, MAX_README_BYTES)
    .replace(/```[\s\S]*?```/g, '\n\n')
    .replace(/~~~[\s\S]*?~~~/g, '\n\n')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const blocks = stripped.split(/\r?\n\s*\r?\n/);

  for (const rawBlock of blocks) {
    const lines = rawBlock
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    // Skip headings, lists, blockquotes, horizontal rules, tables, and image/badge blocks
    const first = lines[0];
    if (
      /^#{1,6}\s/.test(first) ||
      /^[-*+]\s/.test(first) ||
      /^\d+\.\s/.test(first) ||
      /^>/.test(first) ||
      /^\|/.test(first) ||
      /^[-*_]{3,}$/.test(first)
    ) {
      continue;
    }

    const joined = lines.join(' ');
    // Strip markdown images/badges first so badge-only lines become empty
    const noBadges = joined
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/(?:^|\s)_([^_]+)_(?=\s|[.,;:!?]|$)/g, ' $1');

    const clean = sanitizeText(noBadges).replace(/\s+([.,;:!?])/g, '$1').trim();
    if (!clean || clean.length < 18) continue;
    // Skip bare URL / Play Live / Live Demo link lines
    if (/^(?:play\s+live|live\s+demo|demo|url|website|homepage)\s*:/i.test(clean)) continue;
    if (/^https?:\/\/\S+$/i.test(clean)) continue;

    // Prefer first complete sentence when the paragraph is multi-sentence
    const sentenceMatch = clean.match(/^(.{24,}?[.!?])(?:\s|$)/);
    let summary = sentenceMatch ? sentenceMatch[1].trim() : clean;

    if (summary.length > maxLen) {
      const cut = summary.slice(0, maxLen - 1);
      const lastSpace = cut.lastIndexOf(' ');
      const trimmed = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\-\u2014\u2013]+$/, '').trim();
      summary = `${trimmed}\u2026`;
    }
    return summary;
  }

  return null;
}

async function fetchReadmeSummary(owner, slug, branch, { fetchImpl = fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const safeBranch = sanitizeText(branch) || 'main';
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/${encodeURIComponent(safeBranch)}/README.md`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        redirect: 'follow',
        headers: { Accept: 'text/plain,text/markdown;q=0.9,*/*;q=0.8', 'User-Agent': USER_AGENT },
      },
      fetchImpl,
      Math.min(timeoutMs, 3_500),
    );
    if (!res || !res.ok) return null;
    const text = await readBoundedText(res, MAX_README_BYTES);
    return extractReadmeSummary(text);
  } catch {
    return null;
  }
}

export async function probeLiveSubApp(
  slug,
  candidateUrl,
  { fetchImpl = fetch, timeoutMs = PROBE_TIMEOUT_MS, now = new Date() } = {},
) {
  const probedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const cleanCandidate = sanitizeHttpUrl(candidateUrl);

  if (!cleanCandidate) {
    return {
      probe: emptyProbe(null, probedAt),
      transientError: false,
    };
  }

  try {
    const res = await fetchWithTimeout(
      cleanCandidate,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': USER_AGENT,
        },
      },
      fetchImpl,
      timeoutMs,
    );

    const httpStatus = Number.isFinite(res?.status) ? res.status : null;
    if (!res || (httpStatus !== null && httpStatus >= 400)) {
      return {
        probe: emptyProbe(cleanCandidate, probedAt, {
          httpStatus,
          isNotFound: true,
        }),
        transientError: false,
      };
    }

    const effectiveUrl = sanitizeHttpUrl(res.url || cleanCandidate) || cleanCandidate;
    const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
    const isLikelyBinary =
      Boolean(contentType) &&
      !contentType.includes('html') &&
      !contentType.includes('xml') &&
      !contentType.includes('text/plain');

    if (isLikelyBinary) {
      return {
        probe: emptyProbe(cleanCandidate, probedAt, {
          resolvedUrl: effectiveUrl,
          liveVerified: true,
          httpStatus: httpStatus ?? 200,
          isNotFound: false,
        }),
        transientError: false,
      };
    }

    const htmlText = await readBoundedText(res, MAX_HTML_BYTES);
    const parsedHtml = parseSubAppHtml(htmlText, effectiveUrl);

    if (parsedHtml.isNotFound) {
      return {
        probe: emptyProbe(cleanCandidate, probedAt, {
          httpStatus: httpStatus ?? 200,
          isNotFound: true,
        }),
        transientError: false,
      };
    }

    const dirUrl = ensureTrailingSlash(effectiveUrl);
    const manifestCandidates = [
      parsedHtml.manifestUrl,
      sanitizeHttpUrl('manifest.webmanifest', dirUrl),
      sanitizeHttpUrl('manifest.json', dirUrl),
    ].filter(Boolean);

    const fetchedManifest = await fetchValidManifest(manifestCandidates, { fetchImpl, timeoutMs });
    const isPwa = Boolean(parsedHtml.manifestUrl || fetchedManifest);

    const manifestTitleSplit = splitTitleAndSubtitle(fetchedManifest?.name || '');
    const title = parsedHtml.title || manifestTitleSplit.titlePart || fetchedManifest?.shortName || null;
    const subtitle = parsedHtml.title
      ? parsedHtml.subtitle
      : manifestTitleSplit.subtitlePart || null;
    const description = parsedHtml.description || fetchedManifest?.description || null;
    const themeColor = parsedHtml.themeColor || fetchedManifest?.themeColor || null;
    const iconUrl = fetchedManifest?.iconUrl || parsedHtml.iconUrl || null;

    const manifest = fetchedManifest
      ? {
          url: fetchedManifest.url,
          name: fetchedManifest.name,
          shortName: fetchedManifest.shortName,
          themeColor: fetchedManifest.themeColor,
          iconUrl: fetchedManifest.iconUrl,
        }
      : parsedHtml.manifestUrl
        ? {
            url: parsedHtml.manifestUrl,
            name: parsedHtml.applicationName,
            shortName: null,
            themeColor: parsedHtml.themeColor,
            iconUrl: parsedHtml.iconUrl,
          }
        : null;

    return {
      probe: {
        candidateUrl: cleanCandidate,
        resolvedUrl: effectiveUrl,
        liveVerified: true,
        httpStatus: httpStatus ?? 200,
        isNotFound: false,
        isPwa,
        title,
        subtitle,
        description,
        themeColor,
        ogImage: parsedHtml.ogImageUrl,
        iconUrl,
        manifest,
        probedAt,
      },
      transientError: false,
    };
  } catch {
    return {
      probe: emptyProbe(cleanCandidate, probedAt),
      transientError: true,
    };
  }
}

function isBotIdentity(value) {
  if (typeof value !== 'string') return false;
  const lower = value.trim().toLowerCase();
  if (!lower) return false;
  if (BOT_LOGINS.has(lower)) return true;
  if (/\[bot\]$/i.test(lower)) return true;
  if (
    lower.includes('github-actions[bot]') ||
    lower.includes('dependabot[bot]') ||
    lower.includes('renovate[bot]')
  ) {
    return true;
  }
  return false;
}

/**
 * Identify automated CI/bot commits (github-actions[bot], dependabot[bot],
 * renovate[bot], or [skip ci] / [ci skip]) so cron/bot activity never inflates velocity.
 */
export function isAutomatedBakeCommit(commit) {
  if (!commit || typeof commit !== 'object') return false;
  if (commit.author?.type === 'Bot' || commit.committer?.type === 'Bot') return true;
  const identities = [
    commit.author?.login,
    commit.committer?.login,
    commit.commit?.author?.name,
    commit.commit?.committer?.name,
    commit.commit?.author?.email,
    commit.commit?.committer?.email,
  ];
  if (identities.some(isBotIdentity)) return true;
  const message = String(commit.commit?.message || commit.message || '');
  return SKIP_CI_RE.test(message);
}

/**
 * Identify automated bot events in /users/:owner/events/public.
 */
export function isAutomatedBotEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (isBotIdentity(event.actor?.login) || isBotIdentity(event.actor?.display_login)) return true;
  const prTitle = String(event.payload?.pull_request?.title || '');
  if (prTitle && SKIP_CI_RE.test(prTitle)) return true;
  return false;
}

function toUtcDateKey(dateInput) {
  if (!dateInput) return null;
  const ms = Date.parse(dateInput);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build an ordered array of N UTC date keys ('YYYY-MM-DD', oldest -> newest).
 */
export function buildUtcDayWindow(nowDate, days) {
  const d = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const todayMidnightUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(new Date(todayMidnightUtc - i * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Aggregate bot-filtered commits into 30d daily buckets, 90d day map, and top recent CommitLite list.
 */
export function processRepoCommits(
  rawCommits,
  { htmlUrl, owner, dayWindow30, dayWindow90Set, limit = RECENT_COMMITS_LIMIT },
) {
  const dayIndex30 = new Map(dayWindow30.map((d, idx) => [d, idx]));
  const commits30d = new Array(30).fill(0);
  const commitsByDay90 = new Map();
  const commits = [];
  const seenShas = new Set();

  for (const commit of Array.isArray(rawCommits) ? rawCommits : []) {
    if (!commit || typeof commit !== 'object') continue;
    if (isAutomatedBakeCommit(commit)) continue;

    const sha = typeof commit.sha === 'string' ? commit.sha.trim() : '';
    if (sha && seenShas.has(sha)) continue;
    if (sha) seenShas.add(sha);

    const dateIso =
      commit.commit?.author?.date ||
      commit.commit?.committer?.date ||
      commit.date ||
      null;
    const dateKey = toUtcDateKey(dateIso);

    if (dateKey && dayWindow90Set.has(dateKey)) {
      commitsByDay90.set(dateKey, (commitsByDay90.get(dateKey) || 0) + 1);
    }
    if (dateKey && dayIndex30.has(dateKey)) {
      commits30d[dayIndex30.get(dateKey)] += 1;
    }

    if (commits.length < limit && sha) {
      const firstLine = String(commit.commit?.message ?? commit.message ?? '').split(/\r?\n/)[0] ?? '';
      const cleanMessage = sanitizeText(firstLine) || 'Commit update';
      const cleanAuthor =
        sanitizeText(commit.author?.login || commit.commit?.author?.name || commit.author || owner) || owner;
      const commitUrl = sanitizeHttpUrl(commit.html_url || commit.url) || `${htmlUrl}/commit/${sha}`;

      commits.push({
        sha,
        message: cleanMessage,
        date: dateIso || new Date().toISOString(),
        author: cleanAuthor,
        url: commitUrl,
      });
    }
  }

  const commits30dTotal = commits30d.reduce((sum, n) => sum + n, 0);
  let commits90dTotal = 0;
  for (const count of commitsByDay90.values()) commits90dTotal += count;

  return { commits, commits30d, commits30dTotal, commits90dTotal, commitsByDay90 };
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIdx = 0;

  async function runner() {
    while (true) {
      const current = nextIdx;
      nextIdx += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runner()));
  return results;
}

function createGitHubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  };
  if (typeof token === 'string' && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

function parseNextLink(linkHeader) {
  if (typeof linkHeader !== 'string' || !linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (match) {
      const url = sanitizeHttpUrl(match[1]);
      if (url) {
        try {
          if (new URL(url).origin === API_ORIGIN) return url;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchGitHubJson(
  url,
  { headers, fetchImpl = fetch, timeoutMs = API_TIMEOUT_MS, allowEmptyStatuses = [], rateTracker = null },
) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.origin !== API_ORIGIN) {
    throw new Error(`Refusing non-GitHub API URL: ${url}`);
  }
  const res = await fetchWithTimeout(url, { method: 'GET', headers }, fetchImpl, timeoutMs);
  const remHeader = res?.headers?.get?.('x-ratelimit-remaining');
  if (rateTracker && remHeader != null && remHeader !== '') {
    const parsedRem = Number.parseInt(remHeader, 10);
    if (Number.isFinite(parsedRem)) {
      rateTracker.remaining = parsedRem;
    }
  }
  if (allowEmptyStatuses.includes(res.status)) {
    return { ok: true, status: res.status, data: null, nextUrl: null };
  }
  if (!res.ok) {
    const err = new Error(`GitHub API HTTP ${res.status} for ${parsedUrl.pathname}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const nextUrl = parseNextLink(res.headers?.get?.('link') || '');
  return { ok: true, status: res.status, data, nextUrl };
}

function projectUser(u) {
  if (!u || typeof u !== 'object') return null;
  const login = sanitizeText(u.login);
  if (!login) return null;
  return {
    login,
    name: sanitizeText(u.name) || null,
    avatar_url: sanitizeHttpUrl(u.avatar_url) || '',
    bio: sanitizeText(u.bio) || null,
    html_url: sanitizeHttpUrl(u.html_url) || `https://github.com/${encodeURIComponent(login)}`,
    public_repos: Number.isFinite(Number(u.public_repos)) ? Number(u.public_repos) : 0,
    followers: Number.isFinite(Number(u.followers)) ? Number(u.followers) : 0,
  };
}

function projectRepo(r, fallbackOwner, generatedAt) {
  const name = sanitizeText(r?.name);
  const repoOwner = sanitizeText(r?.owner?.login) || fallbackOwner;
  const fullName = sanitizeText(r?.full_name) || `${repoOwner}/${name}`;
  const htmlUrl =
    sanitizeHttpUrl(r?.html_url) || `https://github.com/${encodeURIComponent(repoOwner)}/${encodeURIComponent(name)}`;
  const createdAt = typeof r?.created_at === 'string' && r.created_at ? r.created_at : generatedAt;
  const updatedAt = typeof r?.updated_at === 'string' && r.updated_at ? r.updated_at : r?.pushed_at || createdAt;
  const pushedAt = typeof r?.pushed_at === 'string' && r.pushed_at ? r.pushed_at : updatedAt;
  return {
    id: Number.isFinite(Number(r?.id)) ? Number(r.id) : 0,
    name,
    full_name: fullName,
    html_url: htmlUrl,
    description: sanitizeText(r?.description) || null,
    homepage: sanitizeHttpUrl(r?.homepage),
    has_pages: Boolean(r?.has_pages),
    language: sanitizeText(r?.language) || null,
    topics: Array.isArray(r?.topics) ? r.topics.map(sanitizeText).filter(Boolean) : [],
    stargazers_count: Number.isFinite(Number(r?.stargazers_count)) ? Number(r.stargazers_count) : 0,
    forks_count: Number.isFinite(Number(r?.forks_count)) ? Number(r.forks_count) : 0,
    size: Number.isFinite(Number(r?.size)) ? Number(r.size) : 0,
    default_branch: sanitizeText(r?.default_branch) || 'main',
    created_at: createdAt,
    updated_at: updatedAt,
    pushed_at: pushedAt,
    fork: Boolean(r?.fork),
    archived: Boolean(r?.archived),
  };
}

function projectEvent(e) {
  const p = e?.payload ?? {};
  const payload = {
    ref: p.ref != null ? sanitizeText(p.ref) || null : null,
  };
  if (p.ref_type != null) payload.ref_type = sanitizeText(p.ref_type);
  if (p.head != null) payload.head = sanitizeText(p.head);
  if (p.before != null) payload.before = sanitizeText(p.before);
  if (typeof p.size === 'number' && Number.isFinite(p.size)) payload.size = p.size;
  if (p.action != null) payload.action = sanitizeText(p.action);
  if (typeof p.number === 'number' && Number.isFinite(p.number)) payload.number = p.number;
  if (p.pull_request && typeof p.pull_request === 'object') {
    payload.pull_request = {
      ...(typeof p.pull_request.merged === 'boolean' ? { merged: p.pull_request.merged } : {}),
      ...(p.pull_request.title != null ? { title: sanitizeText(p.pull_request.title) } : {}),
      ...(typeof p.pull_request.number === 'number' ? { number: p.pull_request.number } : {}),
    };
  }
  if (p.release && typeof p.release === 'object') {
    payload.release = {
      ...(p.release.tag_name != null ? { tag_name: sanitizeText(p.release.tag_name) } : {}),
      ...(p.release.name != null ? { name: sanitizeText(p.release.name) } : {}),
    };
  }
  return {
    id: String(e?.id ?? ''),
    type: sanitizeText(e?.type),
    repo: { name: sanitizeText(e?.repo?.name) },
    payload,
    created_at: String(e?.created_at ?? ''),
  };
}

/**
 * Validate that an object conforms to the locked SnapshotV2 schema.
 */
export function isValidSnapshotV2(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.schemaVersion !== 'SnapshotV2') return false;
  if (typeof obj.generatedAt !== 'string' || !obj.generatedAt) return false;
  if (typeof obj.owner !== 'string' || !obj.owner) return false;
  if (!['live-github-bake', 'preserved-cache', 'offline-fallback'].includes(obj.sourceMode)) return false;
  if (!Array.isArray(obj.repos) || !Array.isArray(obj.events)) return false;
  if (!obj.commits || typeof obj.commits !== 'object' || Array.isArray(obj.commits)) return false;
  if (!obj.languages || typeof obj.languages !== 'object' || Array.isArray(obj.languages)) return false;
  if (!obj.probes || typeof obj.probes !== 'object' || Array.isArray(obj.probes)) return false;
  if (!Array.isArray(obj.chronoPulse90d) || obj.chronoPulse90d.length !== 90) return false;
  for (const day of obj.chronoPulse90d) {
    if (
      !day ||
      typeof day !== 'object' ||
      typeof day.date !== 'string' ||
      typeof day.count !== 'number' ||
      !Array.isArray(day.repos)
    ) {
      return false;
    }
  }
  if (!obj.totals || typeof obj.totals !== 'object') return false;
  return (
    typeof obj.totals.totalRepos === 'number' &&
    typeof obj.totals.liveApps === 'number' &&
    typeof obj.totals.verifiedPages === 'number' &&
    typeof obj.totals.deadPages === 'number' &&
    typeof obj.totals.commits30d === 'number' &&
    typeof obj.totals.commits90d === 'number'
  );
}

async function readExistingSnapshot(outputPath) {
  try {
    const raw = await fs.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (isValidSnapshotV2(parsed)) return parsed;
  } catch {
    // Missing, unreadable, or legacy V1 snapshot
  }
  return null;
}

function sanitizeProbe(probe) {
  if (!probe || typeof probe !== 'object') return probe;
  const manifest =
    probe.manifest && typeof probe.manifest === 'object'
      ? {
          url: sanitizeHttpUrl(probe.manifest.url),
          name: sanitizeText(probe.manifest.name) || null,
          shortName: sanitizeText(probe.manifest.shortName) || null,
          themeColor: sanitizeHexColor(probe.manifest.themeColor),
          iconUrl: sanitizeHttpUrl(probe.manifest.iconUrl),
        }
      : null;
  return {
    candidateUrl: sanitizeHttpUrl(probe.candidateUrl),
    resolvedUrl: sanitizeHttpUrl(probe.resolvedUrl),
    liveVerified: Boolean(probe.liveVerified),
    httpStatus: Number.isFinite(probe.httpStatus) ? probe.httpStatus : null,
    isNotFound: Boolean(probe.isNotFound),
    isPwa: Boolean(probe.isPwa),
    title: sanitizeText(probe.title) || null,
    subtitle: sanitizeText(probe.subtitle) || null,
    description: sanitizeText(probe.description) || null,
    themeColor: sanitizeHexColor(probe.themeColor),
    ogImage: sanitizeHttpUrl(probe.ogImage),
    iconUrl: sanitizeHttpUrl(probe.iconUrl),
    manifest,
    probedAt: typeof probe.probedAt === 'string' ? probe.probedAt : new Date().toISOString(),
  };
}

function sanitizeExistingSnapshot(snapshot) {
  const cloned = structuredClone(snapshot);
  cloned.sourceMode = 'preserved-cache';
  cloned.owner = sanitizeText(cloned.owner) || DEFAULT_OWNER;
  cloned.user = cloned.user ? projectUser(cloned.user) : null;
  cloned.repos = Array.isArray(cloned.repos)
    ? cloned.repos.map((r) => projectRepo(r, cloned.owner, cloned.generatedAt))
    : [];
  cloned.events = Array.isArray(cloned.events)
    ? cloned.events.filter((e) => !isAutomatedBotEvent(e)).map(projectEvent)
    : [];

  if (cloned.commits && typeof cloned.commits === 'object') {
    for (const [slug, entry] of Object.entries(cloned.commits)) {
      if (!entry || typeof entry !== 'object') continue;
      const cleanCommits = Array.isArray(entry.commits)
        ? entry.commits
            .filter((c) => !isAutomatedBakeCommit(c))
            .slice(0, RECENT_COMMITS_LIMIT)
            .map((c) => ({
              sha: String(c.sha || ''),
              message: sanitizeText(c.message) || 'Commit update',
              date: String(c.date || ''),
              author: sanitizeText(c.author) || cloned.owner,
              ...(sanitizeHttpUrl(c.url) ? { url: sanitizeHttpUrl(c.url) } : {}),
            }))
        : [];
      cloned.commits[slug] = {
        pushedAt: String(entry.pushedAt || cloned.generatedAt),
        commits: cleanCommits,
        commits30d:
          Array.isArray(entry.commits30d) && entry.commits30d.length === 30
            ? entry.commits30d.map((n) => (Number.isFinite(n) && n > 0 ? n : 0))
            : new Array(30).fill(0),
        commits30dTotal: Number.isFinite(entry.commits30dTotal) ? entry.commits30dTotal : 0,
        commits90dTotal: Number.isFinite(entry.commits90dTotal) ? entry.commits90dTotal : 0,
      };
    }
  }

  if (cloned.probes && typeof cloned.probes === 'object') {
    for (const [slug, p] of Object.entries(cloned.probes)) {
      cloned.probes[slug] = sanitizeProbe(p);
    }
  }

  if (Array.isArray(cloned.chronoPulse90d)) {
    cloned.chronoPulse90d = cloned.chronoPulse90d.map((d) => ({
      date: String(d.date || ''),
      count: Number.isFinite(d.count) && d.count > 0 ? d.count : 0,
      repos: Array.isArray(d.repos) ? d.repos.map(sanitizeText).filter(Boolean).sort() : [],
    }));
  }

  return cloned;
}

/**
 * Emit a minimal valid SnapshotV2 baseline when offline and no prior snapshot exists.
 */
export function createOfflineBaselineSnapshot({ owner = DEFAULT_OWNER, now = new Date() } = {}) {
  const cleanOwner = sanitizeText(owner) || DEFAULT_OWNER;
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const dayWindow90 = buildUtcDayWindow(now, 90);
  const selfSlug = `${cleanOwner}.github.io`;
  const selfUrl = `https://${cleanOwner.toLowerCase()}.github.io/`;
  const selfHtmlUrl = `https://github.com/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(selfSlug)}`;

  return {
    schemaVersion: 'SnapshotV2',
    generatedAt,
    owner: cleanOwner,
    sourceMode: 'offline-fallback',
    user: {
      login: cleanOwner,
      name: cleanOwner,
      avatar_url: '',
      bio: null,
      html_url: `https://github.com/${encodeURIComponent(cleanOwner)}`,
      public_repos: 1,
      followers: 0,
    },
    repos: [
      {
        id: 0,
        name: selfSlug,
        full_name: `${cleanOwner}/${selfSlug}`,
        html_url: selfHtmlUrl,
        description: 'KRUNKED // FORGE DECK — live app launcher and GitHub telemetry surface.',
        homepage: null,
        has_pages: true,
        language: 'TypeScript',
        topics: [],
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
        default_branch: 'main',
        created_at: generatedAt,
        updated_at: generatedAt,
        pushed_at: generatedAt,
        fork: false,
        archived: false,
      },
    ],
    events: [],
    commits: {
      [selfSlug]: {
        pushedAt: generatedAt,
        commits: [],
        commits30d: new Array(30).fill(0),
        commits30dTotal: 0,
        commits90dTotal: 0,
      },
    },
    languages: {
      [selfSlug]: { TypeScript: 1 },
    },
    probes: {
      [selfSlug]: {
        candidateUrl: selfUrl,
        resolvedUrl: selfUrl,
        liveVerified: true,
        httpStatus: 200,
        isNotFound: false,
        isPwa: true,
        title: 'KRUNKED // FORGE DECK',
        subtitle: null,
        description: 'Live app launcher and GitHub telemetry surface.',
        themeColor: '#08090B',
        ogImage: null,
        iconUrl: null,
        manifest: {
          url: `${selfUrl}manifest.webmanifest`,
          name: 'KRUNKED // FORGE DECK',
          shortName: 'Forge Deck',
          themeColor: '#08090B',
          iconUrl: null,
        },
        probedAt: generatedAt,
      },
    },
    chronoPulse90d: dayWindow90.map((date) => ({
      date,
      count: 0,
      repos: [],
    })),
    totals: {
      totalRepos: 0,
      liveApps: 0,
      verifiedPages: 0,
      deadPages: 0,
      commits30d: 0,
      commits90d: 0,
      lastPushAt: generatedAt,
    },
  };
}

async function writeSnapshotFile(outputPath, snapshot) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
}

/**
 * Harvest GitHub user/repos/events/commits/languages and probe live GitHub Pages sub-apps
 * into a strict SnapshotV2 JSON payload.
 */
export async function buildSnapshot(options = {}) {
  const owner = sanitizeText(options.owner ?? process.env.GITHUB_OWNER ?? DEFAULT_OWNER) || DEFAULT_OWNER;
  const token = options.token ?? process.env.GITHUB_TOKEN ?? '';
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const outputPath =
    options.outputPath ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'snapshot.json');
  const writeOutput = options.writeOutput ?? true;
  const concurrency = options.concurrency ?? MAX_CONCURRENCY;
  const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const apiTimeoutMs = options.apiTimeoutMs ?? API_TIMEOUT_MS;

  const priorSnapshot = await readExistingSnapshot(outputPath);
  const generatedAt = now.toISOString();
  const dayWindow90 = buildUtcDayWindow(now, 90);
  const dayWindow30 = dayWindow90.slice(-30);
  const dayWindow90Set = new Set(dayWindow90);
  const since90dIso = `${dayWindow90[0]}T00:00:00.000Z`;
  const headers = createGitHubHeaders(token);
  const rateTracker = { remaining: Number.POSITIVE_INFINITY };

  let rawUser;
  let rawRepos;
  let rawEvents;
  try {
    const [uRes, rRes, eRes] = await Promise.all([
      fetchGitHubJson(`${API_ORIGIN}/users/${encodeURIComponent(owner)}`, {
        headers,
        fetchImpl,
        timeoutMs: apiTimeoutMs,
        rateTracker,
      }),
      fetchGitHubJson(`${API_ORIGIN}/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=pushed`, {
        headers,
        fetchImpl,
        timeoutMs: apiTimeoutMs,
        rateTracker,
      }),
      fetchGitHubJson(`${API_ORIGIN}/users/${encodeURIComponent(owner)}/events/public?per_page=100`, {
        headers,
        fetchImpl,
        timeoutMs: apiTimeoutMs,
        rateTracker,
      }).catch(() => ({ ok: false, data: [] })),
    ]);
    if (!Array.isArray(rRes.data) || rRes.data.length === 0) {
      throw new Error('GitHub API returned empty or non-array repository list');
    }
    rawUser = uRes.data;
    rawRepos = rRes.data;
    rawEvents = Array.isArray(eRes.data) ? eRes.data : [];
  } catch (err) {
    const fallback = priorSnapshot
      ? sanitizeExistingSnapshot(priorSnapshot)
      : createOfflineBaselineSnapshot({ owner, now });
    if (writeOutput) {
      await writeSnapshotFile(outputPath, fallback);
    }
    return { snapshot: fallback, warning: err?.message || 'GitHub API unavailable' };
  }

  const user = projectUser(rawUser);
  const repos = rawRepos
    .map((r) => projectRepo(r, owner, generatedAt))
    .filter((r) => Boolean(r.name))
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
  const events = rawEvents.filter((e) => !isAutomatedBotEvent(e)).map(projectEvent);

  const activeRepos = repos.filter((r) => !r.fork && !r.archived);
  const dailyTotals90 = new Map(dayWindow90.map((d) => [d, { count: 0, repos: new Set() }]));
  const commits = {};
  const languages = {};
  const probes = {};

  const selfSlugLower = `${owner.toLowerCase()}.github.io`;
  const pagesOrigin = `https://${owner.toLowerCase()}.github.io`;

  const priorDayWindow30 = priorSnapshot?.generatedAt
    ? buildUtcDayWindow(new Date(priorSnapshot.generatedAt), 30)
    : null;
  const sameUtcDayAsPrior = Boolean(
    priorSnapshot?.generatedAt && priorSnapshot.generatedAt.slice(0, 10) === generatedAt.slice(0, 10),
  );

  await mapWithConcurrency(activeRepos, concurrency, async (repo) => {
    const slug = repo.name;
    const isSelfDeck = slug.toLowerCase() === selfSlugLower;
    const repoOwner = repo.full_name.includes('/') ? repo.full_name.split('/')[0] : owner;
    const priorCommitsEntry = priorSnapshot?.commits?.[slug] ?? null;
    const priorLanguages = priorSnapshot?.languages?.[slug] ?? null;
    const priorProbe = priorSnapshot?.probes?.[slug] ?? null;

    // 1. Harvest 90d commits (reuse unchanged same-day prior commits if unauth quota is tight)
    const canReusePriorCommits = Boolean(
      sameUtcDayAsPrior &&
        priorCommitsEntry &&
        priorCommitsEntry.pushedAt === repo.pushed_at &&
        Array.isArray(priorCommitsEntry.commits30d) &&
        priorCommitsEntry.commits30d.length === 30 &&
        rateTracker.remaining < 45,
    );
    let rawCommits = [];
    let commitsFetchedOk = false;
    if (!canReusePriorCommits && rateTracker.remaining > 2) {
      try {
        const baseCommitsUrl = `${API_ORIGIN}/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(slug)}/commits?per_page=100&since=${encodeURIComponent(since90dIso)}`;
        let pageUrl = baseCommitsUrl;
        let pageCount = 0;
        const maxPages = isSelfDeck ? 3 : 1;
        while (pageUrl && pageCount < maxPages && rateTracker.remaining > 2) {
          const cRes = await fetchGitHubJson(pageUrl, {
            headers,
            fetchImpl,
            timeoutMs: apiTimeoutMs,
            allowEmptyStatuses: [404, 409],
            rateTracker,
          });
          const pageItems = Array.isArray(cRes.data) ? cRes.data : [];
          rawCommits.push(...pageItems);
          commitsFetchedOk = true;
          pageCount += 1;
          if (!isSelfDeck || pageItems.length < 100 || !cRes.nextUrl) break;
          const humanCount = rawCommits.filter((c) => !isAutomatedBakeCommit(c)).length;
          if (humanCount >= RECENT_COMMITS_LIMIT) break;
          pageUrl = cRes.nextUrl;
        }
        // If no commits inside the 90d window for a non-empty repo, pull latest 5 for display
        if (commitsFetchedOk && rawCommits.length === 0 && repo.size > 0 && rateTracker.remaining > 10) {
          const fallbackUrl = `${API_ORIGIN}/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(slug)}/commits?per_page=5`;
          const fRes = await fetchGitHubJson(fallbackUrl, {
            headers,
            fetchImpl,
            timeoutMs: apiTimeoutMs,
            allowEmptyStatuses: [404, 409],
            rateTracker,
          });
          if (Array.isArray(fRes.data)) rawCommits = fRes.data;
        }
      } catch {
        if (!commitsFetchedOk) rawCommits = [];
      }
    }

    let commitMetrics;
    if (commitsFetchedOk) {
      commitMetrics = processRepoCommits(rawCommits, {
        htmlUrl: repo.html_url,
        owner: repoOwner,
        dayWindow30,
        dayWindow90Set,
      });
    } else if (priorCommitsEntry && Array.isArray(priorCommitsEntry.commits)) {
      const rebuilt = processRepoCommits(priorCommitsEntry.commits, {
        htmlUrl: repo.html_url,
        owner: repoOwner,
        dayWindow30,
        dayWindow90Set,
      });
      const commitsByDay90 = new Map(rebuilt.commitsByDay90);
      const commits30d = new Array(30).fill(0);
      const dayIndex30 = new Map(dayWindow30.map((d, idx) => [d, idx]));
      if (priorDayWindow30 && Array.isArray(priorCommitsEntry.commits30d) && priorCommitsEntry.commits30d.length === 30) {
        for (let i = 0; i < 30; i += 1) {
          const dateKey = priorDayWindow30[i];
          const count = Number(priorCommitsEntry.commits30d[i]) || 0;
          if (count <= 0) continue;
          if (dayWindow90Set.has(dateKey)) {
            commitsByDay90.set(dateKey, Math.max(commitsByDay90.get(dateKey) || 0, count));
          }
          if (dayIndex30.has(dateKey)) {
            commits30d[dayIndex30.get(dateKey)] = count;
          }
        }
      } else {
        for (let i = 0; i < 30; i += 1) commits30d[i] = rebuilt.commits30d[i];
      }
      const commits30dTotal = commits30d.reduce((sum, n) => sum + n, 0);
      let commits90dTotal = 0;
      for (const count of commitsByDay90.values()) commits90dTotal += count;
      commitMetrics = {
        commits: rebuilt.commits,
        commits30d,
        commits30dTotal,
        commits90dTotal: Math.max(commits90dTotal, Number(priorCommitsEntry.commits90dTotal) || 0),
        commitsByDay90,
      };
    } else {
      commitMetrics = processRepoCommits([], {
        htmlUrl: repo.html_url,
        owner: repoOwner,
        dayWindow30,
        dayWindow90Set,
      });
    }

    commits[slug] = {
      pushedAt: repo.pushed_at,
      commits: commitMetrics.commits,
      commits30d: commitMetrics.commits30d,
      commits30dTotal: commitMetrics.commits30dTotal,
      commits90dTotal: commitMetrics.commits90dTotal,
    };

    for (const [dateKey, count] of commitMetrics.commitsByDay90.entries()) {
      const bucket = dailyTotals90.get(dateKey);
      if (bucket && count > 0) {
        bucket.count += count;
        bucket.repos.add(slug);
      }
    }

    // 2. Harvest language byte map (skip empty size=0 repos or reuse unchanged prior map on tight unauth quota)
    const canReusePriorLangs = Boolean(
      sameUtcDayAsPrior &&
        priorCommitsEntry &&
        priorCommitsEntry.pushedAt === repo.pushed_at &&
        priorLanguages &&
        typeof priorLanguages === 'object' &&
        rateTracker.remaining < 45,
    );
    let repoLangs = {};
    if (canReusePriorLangs) {
      repoLangs = { ...priorLanguages };
    } else if (repo.size > 0 && rateTracker.remaining > 2) {
      try {
        const langsUrl = `${API_ORIGIN}/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(slug)}/languages`;
        const lRes = await fetchGitHubJson(langsUrl, {
          headers,
          fetchImpl,
          timeoutMs: apiTimeoutMs,
          allowEmptyStatuses: [404],
          rateTracker,
        });
        if (lRes.data && typeof lRes.data === 'object' && !Array.isArray(lRes.data)) {
          for (const [lang, bytes] of Object.entries(lRes.data)) {
            if (Number.isFinite(bytes) && bytes > 0) {
              const cleanLang = sanitizeText(lang);
              if (cleanLang) repoLangs[cleanLang] = bytes;
            }
          }
        }
      } catch {
        if (priorLanguages && typeof priorLanguages === 'object') {
          repoLangs = { ...priorLanguages };
        }
      }
    } else if (priorLanguages && typeof priorLanguages === 'object') {
      repoLangs = { ...priorLanguages };
    }
    languages[slug] = repoLangs;

    // 3. Probe live GitHub Pages / homepage URL (zero GitHub API quota)
    const pagesCandidateUrl = isSelfDeck
      ? `${pagesOrigin}/`
      : repo.has_pages
        ? `${pagesOrigin}/${encodeURIComponent(slug)}/`
        : null;
    const primaryCandidate = repo.homepage || pagesCandidateUrl;

    if (primaryCandidate) {
      let result = await probeLiveSubApp(slug, primaryCandidate, {
        fetchImpl,
        timeoutMs: probeTimeoutMs,
        now,
      });
      if (
        !result.probe.liveVerified &&
        repo.homepage &&
        pagesCandidateUrl &&
        repo.homepage !== pagesCandidateUrl
      ) {
        result = await probeLiveSubApp(slug, pagesCandidateUrl, {
          fetchImpl,
          timeoutMs: probeTimeoutMs,
          now,
        });
      }
      if (
        result.transientError &&
        priorProbe &&
        priorProbe.candidateUrl === result.probe.candidateUrl &&
        priorProbe.liveVerified
      ) {
        probes[slug] = sanitizeProbe(priorProbe);
      } else {
        probes[slug] = result.probe;
      }
    } else {
      probes[slug] = emptyProbe(null, generatedAt);
    }

    // 4. Enrich missing taglines from raw README.md (zero GitHub API quota, bounded & non-fatal)
    if (
      !repo.description &&
      !probes[slug].description &&
      !probes[slug].subtitle &&
      (repo.size > 0 || probes[slug].liveVerified)
    ) {
      const readmeSummary = await fetchReadmeSummary(repoOwner, slug, repo.default_branch, {
        fetchImpl,
        timeoutMs: probeTimeoutMs,
      });
      if (readmeSummary) {
        probes[slug].description = readmeSummary;
      }
    }
  });

  const chronoPulse90d = dayWindow90.map((date) => {
    const bucket = dailyTotals90.get(date);
    return {
      date,
      count: bucket ? bucket.count : 0,
      repos: bucket ? [...bucket.repos].sort() : [],
    };
  });

  const visibleRepos = activeRepos.filter((r) => r.name.toLowerCase() !== selfSlugLower);
  const verifiedPages = visibleRepos.filter((r) => probes[r.name]?.liveVerified === true).length;
  const deadPages = visibleRepos.filter(
    (r) => Boolean(probes[r.name]?.candidateUrl) && probes[r.name]?.isNotFound === true,
  ).length;
  const commits30dTotal = chronoPulse90d.slice(-30).reduce((sum, d) => sum + d.count, 0);
  const commits90dTotal = chronoPulse90d.reduce((sum, d) => sum + d.count, 0);
  const lastPushAt = visibleRepos[0]?.pushed_at ?? repos[0]?.pushed_at ?? null;

  const snapshot = {
    schemaVersion: 'SnapshotV2',
    generatedAt,
    owner,
    sourceMode: 'live-github-bake',
    user,
    repos,
    events,
    commits,
    languages,
    probes,
    chronoPulse90d,
    totals: {
      totalRepos: visibleRepos.length,
      liveApps: verifiedPages,
      verifiedPages,
      deadPages,
      commits30d: commits30dTotal,
      commits90d: commits90dTotal,
      lastPushAt,
    },
  };

  if (writeOutput) {
    await writeSnapshotFile(outputPath, snapshot);
  }
  return { snapshot, warning: null };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  buildSnapshot()
    .then(({ snapshot, warning }) => {
      if (warning) {
        console.warn(`[build-snapshot] fallback (${snapshot.sourceMode}): ${warning}`);
      } else {
        const { totalRepos, liveApps, deadPages, commits30d, commits90d } = snapshot.totals;
        console.log(
          `[build-snapshot] baked SnapshotV2: ${totalRepos} visible repos (${liveApps} live verified, ${deadPages} dead/404), ${commits30d} commits/30d, ${commits90d} commits/90d`,
        );
      }
    })
    .catch((err) => {
      console.error('[build-snapshot] unexpected error:', err);
      process.exitCode = 1;
    });
}
