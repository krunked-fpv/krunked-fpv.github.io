import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OWNER = 'krunked-fpv';
const PROBE_TIMEOUT_MS = 4500;
const API_TIMEOUT_MS = 10000;
const MAX_CONCURRENCY = 6;
const MAX_HTML_BYTES = 512 * 1024;
const MS_PER_DAY = 86_400_000;

export const CATEGORY_TAGS = [
  'GAMES & RPG',
  'SIMULATORS & FPV',
  'UTILITIES & AI',
  'SRE & TELEMETRY',
  'AUDIO & VINYL',
  'FAMILY & EDU',
];

const EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[\u{1F1E6}-\u{1F1FF}])/gu;

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
};

const ACRONYMS = new Set([
  'fpv', 'ui', 'pwa', 'cli', 'ai', 'sre', 'qr', 'dsp', 'gpu', 'rpg',
  'edu', 'api', 'sdk', '2d', '3d', 'bpm', 'dj', 'hud', 'rf', 'vtx',
  'osd', 'pid', 'gps', 'url', 'http', 'https', 'svg', 'json', 'iot',
  'led', 'rgb', 'dvr', 'rc', 'usb', 'cpu', 'ram', 'ci', 'cd',
]);

const BOILERPLATE_TITLE_RE = /^(?:document|vite\s+app|vite\s*\+\s*react(?:\s*\+\s*ts)?|vite\s*\+\s*ts|react\s+app|create\s+react\s+app|next\.js|svelte\s+app|vue\s+app|index(?:\.html?)?|home|untitled|app|welcome)$/i;

const NOT_FOUND_TITLE_RE = /(?:\b404\b|site\s+not\s+found|page\s+not\s+found)/i;
const NOT_FOUND_BODY_RE = /there\s+isn['’]t\s+a\s+github\s+pages\s+site\s+here/i;

const CATEGORY_KEYWORDS = {
  'SRE & TELEMETRY': [
    'sre', 'telemetry', 'chaos', 'chaosdeck', 'monitor', 'monitoring', 'observability',
    'status', 'uptime', 'metrics', 'dashboard', 'launchpad', 'deck', 'ops', 'devops',
    'infra', 'incident', 'alert', 'alerts', 'audit', 'probe', 'foundry', 'benchmark',
    'trace', 'health', 'watchdog', 'pulse', 'runbook',
  ],
  'SIMULATORS & FPV': [
    'fpv', 'drone', 'quad', 'quadcopter', 'whoop', 'tinywhoop', 'betaflight', 'inav',
    'elrs', 'expresslrs', 'radiomaster', 'goggle', 'goggles', 'sim', 'simulator',
    'simulation', 'flight', 'physics', 'cockpit', 'osd', 'pid', 'blackbox', 'vtx',
    'skymap', 'starfield', 'orbital', 'orbiter', 'uav', 'airframe', 'propeller', 'rc',
    'gyro', 'lidar', 'radar', 'telemetry-link',
  ],
  'AUDIO & VINYL': [
    'audio', 'vinyl', 'discogs', 'crate', 'turntable', 'bpm', 'dj', 'synth', 'synthesizer',
    'dsp', 'midi', 'beat', 'sound', 'music', 'waveform', 'eq', 'equalizer', 'mixer',
    'sampler', 'foley', 'podcast', 'radio', 'amp', 'wax', 'lp', 'groove', 'tracklist',
    'vinyls', 'sniper',
  ],
  'GAMES & RPG': [
    'game', 'games', 'rpg', 'quest', 'dungeon', 'arcade', 'puzzle', 'chess', 'retro',
    'pixel', 'sprite', 'boss', 'loot', 'arena', 'card', 'deckbuilder', 'roguelike',
    'tetris', 'snake', 'pong', 'combat', 'maul', 'tabletop', 'dice', 'campaign',
    'character', 'monster', 'inventory', 'adventure', 'platformer', 'shooter',
  ],
  'FAMILY & EDU': [
    'family', 'edu', 'education', 'kid', 'kids', 'chore', 'chores', 'reward', 'rewards',
    'dojo', 'school', 'learn', 'learning', 'flashcard', 'flashcards', 'math', 'spelling',
    'reading', 'study', 'quiz', 'allowance', 'parent', 'parents', 'household', 'habit',
    'habits', 'bedtime', 'timer-kids',
  ],
  'UTILITIES & AI': [
    'ai', 'llm', 'prompt', 'agent', 'mcp', 'cli', 'tool', 'tools', 'util', 'utility',
    'utilities', 'converter', 'qr', 'json', 'csv', 'regex', 'diff', 'calc', 'calculator',
    'timer', 'pomodoro', 'note', 'notes', 'markdown', 'pdf', 'image', 'ocr', 'scrape',
    'scraper', 'helper', 'generator', 'formatter', 'vault', 'hash', 'workbench', 'forge',
    'planner', 'tracker', 'checklist', 'assistant', 'parser',
  ],
};

/**
 * Decode common HTML named and numeric entities into Unicode characters.
 */
export function decodeHtmlEntities(input) {
  if (input == null) return '';
  return String(input).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      return '';
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      return '';
    }
    const lower = entity.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match;
  });
}

/**
 * Decode HTML entities first, then strip all Unicode pictographic emojis while keeping ASCII, command, and return glyphs.
 */
export function stripEmojisAndDecodeHtml(input) {
  if (input == null) return '';
  const decoded = decodeHtmlEntities(String(input));
  return decoded.replace(EMOJI_REGEX, '').replace(/\s+/g, ' ').trim();
}

/**
 * Normalize and validate an HTTP or HTTPS URL string against an optional base URL.
 */
export function sanitizeHttpUrl(rawUrl, baseUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Validate a CSS hex color string.
 */
function sanitizeHexColor(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
}

/**
 * Convert a repository slug into a clean human-readable title with uppercased acronyms.
 */
export function humanizeSlug(slug) {
  if (typeof slug !== 'string' || !slug.trim()) return 'Untitled Module';
  const cleaned = stripEmojisAndDecodeHtml(slug);
  const parts = cleaned.split(/[-_./]+/).filter(Boolean);
  if (parts.length === 0) return 'Untitled Module';
  return parts
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function truncateAtWord(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen - 1);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLen * 0.5)) {
    return `${slice.slice(0, lastSpace).replace(/[,;:\-—]+$/, '').trim()}...`;
  }
  return `${slice.trim()}...`;
}

function tokenizeWords(text) {
  if (!text) return [];
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Classify a repository into one of the six canonical CATEGORY_TAGS using weighted token matching.
 */
export function classifyCategory({ slug = '', title = '', tagline = '', description = '', topics = [], isSelfDeck = false }) {
  if (isSelfDeck) return 'SRE & TELEMETRY';

  const slugTokens = new Set(tokenizeWords(slug));
  const topicTokens = new Set((Array.isArray(topics) ? topics : []).flatMap((t) => tokenizeWords(t)));
  const titleTokens = new Set(tokenizeWords(`${title} ${tagline}`));
  const descTokens = new Set(tokenizeWords(description));

  const scores = new Map(CATEGORY_TAGS.map((cat) => [cat, 0]));

  for (const cat of CATEGORY_TAGS) {
    const keywords = CATEGORY_KEYWORDS[cat] || [];
    let score = 0;
    for (const kw of keywords) {
      if (slugTokens.has(kw)) score += 4;
      if (topicTokens.has(kw)) score += 3;
      if (titleTokens.has(kw)) score += 2;
      if (descTokens.has(kw)) score += 1;
    }
    scores.set(cat, score);
  }

  // Compound phrase boosts for multi-word domain hints.
  const combined = `${slug} ${title} ${tagline} ${description}`.toLowerCase();
  if (/\b(?:family|chore|chores|reward|allowance)\b/.test(combined)) {
    scores.set('FAMILY & EDU', (scores.get('FAMILY & EDU') || 0) + 4);
  }
  if (/\b(?:vinyl|discogs|crate|turntable|bpm)\b/.test(combined)) {
    scores.set('AUDIO & VINYL', (scores.get('AUDIO & VINYL') || 0) + 4);
  }
  if (/\b(?:fpv|quad|drone|betaflight|blackbox|inav|elrs)\b/.test(combined)) {
    scores.set('SIMULATORS & FPV', (scores.get('SIMULATORS & FPV') || 0) + 4);
  }
  if (/\b(?:sre|telemetry|chaos|observability|uptime)\b/.test(combined)) {
    scores.set('SRE & TELEMETRY', (scores.get('SRE & TELEMETRY') || 0) + 4);
  }

  let bestCategory = 'UTILITIES & AI';
  let bestScore = 0;
  for (const cat of CATEGORY_TAGS) {
    const score = scores.get(cat) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }
  return bestCategory;
}

/**
 * Parse key-value attributes from an HTML opening tag attribute string.
 */
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
  const clean = stripEmojisAndDecodeHtml(rawTitle);
  if (!clean || BOILERPLATE_TITLE_RE.test(clean)) {
    return { titlePart: null, subtitlePart: null };
  }
  const match = clean.match(/^(.+?)\s+(?:\u2014|\u2013|\||::|-)\s+(.+)$/);
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

/**
 * Extract safe metadata from a sub-app HTML document.
 */
export function parseSubAppHtml(htmlText, baseUrl) {
  const text = typeof htmlText === 'string' ? htmlText.slice(0, MAX_HTML_BYTES) : '';
  const titleMatch = text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? stripEmojisAndDecodeHtml(titleMatch[1].replace(/<[^>]*>/g, ' ')) : '';

  const isNotFound =
    NOT_FOUND_TITLE_RE.test(rawTitle) ||
    NOT_FOUND_BODY_RE.test(text);

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
    const content = attrs.content ? stripEmojisAndDecodeHtml(attrs.content) : '';
    if (!content) continue;
    const key = (attrs.name || attrs.property || '').toLowerCase().trim();
    if (!key) continue;

    if (key === 'description' && !metaDesc) metaDesc = content;
    else if ((key === 'og:description' || key === 'twitter:description') && !ogDesc) ogDesc = content;
    else if ((key === 'og:title' || key === 'twitter:title') && !ogTitle) ogTitle = content;
    else if ((key === 'og:image' || key === 'twitter:image') && !ogImage) ogImage = sanitizeHttpUrl(attrs.content, baseUrl);
    else if (key === 'theme-color' && !themeColor) themeColor = sanitizeHexColor(attrs.content);
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
    const resolved = sanitizeHttpUrl(href, baseUrl);
    if (!resolved) continue;

    if (relTokens.includes('manifest') && !manifestUrl) {
      manifestUrl = resolved;
    } else if (relTokens.includes('apple-touch-icon') && !appleIconUrl) {
      appleIconUrl = resolved;
    } else if (relTokens.includes('icon') && !linkIconUrl) {
      linkIconUrl = resolved;
    }
  }

  const primaryTitle = rawTitle && !BOILERPLATE_TITLE_RE.test(rawTitle) ? rawTitle : (ogTitle && !BOILERPLATE_TITLE_RE.test(ogTitle) ? ogTitle : null);
  const { titlePart, subtitlePart } = splitTitleAndSubtitle(primaryTitle);

  return {
    title: titlePart,
    subtitle: subtitlePart,
    description: metaDesc || ogDesc || null,
    themeColor,
    applicationName: applicationName && !BOILERPLATE_TITLE_RE.test(applicationName) ? applicationName : null,
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
    if (icon.type === 'image/svg+xml' || url.toLowerCase().endsWith('.svg')) {
      score += 40;
    } else if (icon.type === 'image/png' || url.toLowerCase().endsWith('.png')) {
      score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function ensureTrailingSlash(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!u.pathname.endsWith('/') && !u.pathname.split('/').pop().includes('.')) {
      u.pathname = `${u.pathname}/`;
    }
    return u.href;
  } catch {
    return urlStr;
  }
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

/**
 * Probe a candidate live sub-app URL and its resolved manifest.json within 4500ms.
 */
export async function probeLiveSubApp(slug, candidateUrl, { fetchImpl = fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const emptyManifest = {
    name: null,
    shortName: null,
    themeColor: null,
    iconUrl: null,
    ogImageUrl: null,
  };

  if (!candidateUrl) {
    return {
      liveVerified: false,
      isNotFound: false,
      resolvedUrl: null,
      parsedHtml: null,
      manifestDescription: null,
      manifest: emptyManifest,
    };
  }

  try {
    const res = await fetchWithTimeout(
      candidateUrl,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'krunked-deck-snapshot-baker',
        },
      },
      fetchImpl,
      timeoutMs,
    );

    if (!res || res.status >= 400) {
      return {
        liveVerified: false,
        isNotFound: true,
        resolvedUrl: null,
        parsedHtml: null,
        manifestDescription: null,
        manifest: emptyManifest,
      };
    }

    const effectiveUrl = sanitizeHttpUrl(res.url || candidateUrl) || candidateUrl;
    const htmlText = await res.text();
    const parsedHtml = parseSubAppHtml(htmlText, effectiveUrl);

    if (parsedHtml.isNotFound) {
      return {
        liveVerified: false,
        isNotFound: true,
        resolvedUrl: null,
        parsedHtml: null,
        manifestDescription: null,
        manifest: emptyManifest,
      };
    }

    const fallbackManifestUrl = sanitizeHttpUrl('manifest.json', ensureTrailingSlash(effectiveUrl));
    const manifestUrl = parsedHtml.manifestUrl || fallbackManifestUrl;

    let manifestName = null;
    let manifestShortName = null;
    let manifestThemeColor = parsedHtml.themeColor;
    let manifestIconUrl = parsedHtml.iconUrl;
    let manifestDescription = null;

    if (manifestUrl) {
      try {
        const mRes = await fetchWithTimeout(
          manifestUrl,
          {
            method: 'GET',
            redirect: 'follow',
            headers: {
              Accept: 'application/manifest+json,application/json;q=0.9,*/*;q=0.8',
              'User-Agent': 'krunked-deck-snapshot-baker',
            },
          },
          fetchImpl,
          timeoutMs,
        );
        if (mRes && mRes.ok) {
          const contentType = String(mRes.headers?.get?.('content-type') || '').toLowerCase();
          const rawManifestText = await mRes.text();
          // Guard against SPA HTML 200 fallback returned for missing manifest.json
          if (!rawManifestText.trimStart().startsWith('<') && (!contentType || contentType.includes('json') || contentType.includes('octet-stream') || contentType.includes('text/plain'))) {
            const mj = JSON.parse(rawManifestText);
            if (mj && typeof mj === 'object' && !Array.isArray(mj)) {
              const rawMName = stripEmojisAndDecodeHtml(mj.name);
              const rawMShort = stripEmojisAndDecodeHtml(mj.short_name);
              const rawMDesc = stripEmojisAndDecodeHtml(mj.description);
              manifestName = rawMName && !BOILERPLATE_TITLE_RE.test(rawMName) ? rawMName : null;
              manifestShortName = rawMShort && !BOILERPLATE_TITLE_RE.test(rawMShort) ? rawMShort : null;
              manifestDescription = rawMDesc || null;
              manifestThemeColor = sanitizeHexColor(mj.theme_color) || manifestThemeColor;
              manifestIconUrl = pickManifestIcon(mj.icons, sanitizeHttpUrl(mRes.url || manifestUrl) || manifestUrl) || manifestIconUrl;
            }
          }
        }
      } catch {
        // Non-fatal: many sub-apps lack manifest.json
      }
    }

    return {
      liveVerified: true,
      isNotFound: false,
      resolvedUrl: effectiveUrl,
      parsedHtml,
      manifestDescription,
      manifest: {
        name: manifestName || parsedHtml.applicationName || null,
        shortName: manifestShortName || null,
        themeColor: manifestThemeColor || null,
        iconUrl: manifestIconUrl || null,
        ogImageUrl: parsedHtml.ogImageUrl || null,
      },
    };
  } catch {
    return {
      liveVerified: false,
      isNotFound: false,
      resolvedUrl: null,
      parsedHtml: null,
      manifestDescription: null,
      manifest: emptyManifest,
    };
  }
}

/**
 * Synthesize clean title, tagline, and description with boilerplate stripping and sanitization.
 */
function synthesizeCopy({
  slug,
  owner,
  isSelfDeck,
  isLiveApp,
  primaryLanguage,
  repoDescription,
  parsedHtml,
  manifest,
  manifestDescription,
}) {
  if (isSelfDeck) {
    const cleanRepoDesc = stripEmojisAndDecodeHtml(repoDescription);
    return {
      title: 'KRUNKED // DECK',
      tagline: 'Live App Launchpad & Telemetry Surface',
      description: cleanRepoDesc || `Live App Launchpad, Sub-App Portal & Real-Time GitHub Telemetry Surface for ${owner}.`,
    };
  }

  const cleanRepoDesc = stripEmojisAndDecodeHtml(repoDescription);
  const htmlTitle = parsedHtml?.title || null;
  const htmlSubtitle = parsedHtml?.subtitle || null;
  const htmlDesc = parsedHtml?.description || null;
  const { titlePart: manifestTitlePart, subtitlePart: manifestSubtitlePart } = splitTitleAndSubtitle(manifest?.name || '');

  let title = null;
  if (htmlTitle && htmlTitle.length <= 48) {
    title = htmlTitle;
  } else if (manifestTitlePart && manifestTitlePart.length <= 48) {
    title = manifestTitlePart;
  } else if (manifest?.shortName && manifest.shortName.length <= 36) {
    title = manifest.shortName;
  } else {
    title = humanizeSlug(slug);
  }

  let description = cleanRepoDesc || htmlDesc || manifestDescription || '';
  if (!description && htmlSubtitle) {
    description = htmlSubtitle;
  }
  if (!description && htmlTitle && htmlTitle !== title) {
    description = htmlTitle;
  }
  if (!description) {
    const langText = primaryLanguage ? `${primaryLanguage} ` : '';
    description = isLiveApp
      ? `${title} — Live ${langText}web application deployed from ${owner}/${slug}.`
      : `${title} — ${langText}repository and tooling module in ${owner}.`;
  }

  let tagline = htmlSubtitle || manifestSubtitlePart || '';
  if (!tagline) {
    const clauses = description.split(/(?:\s+(?:\u2014|\u2013)\s+|[.;]\s+)/).map((s) => s.trim()).filter(Boolean);
    const firstNonTitle = clauses.find((c) => c.toLowerCase() !== title.toLowerCase()) || '';
    if (firstNonTitle && firstNonTitle.length <= 64) {
      tagline = firstNonTitle;
    } else {
      tagline = truncateAtWord(firstNonTitle || description, 64);
    }
  }
  if (!tagline) {
    tagline = isLiveApp ? `${primaryLanguage || 'Web'} Live App` : `${primaryLanguage || 'Source'} Repository`;
  }

  return {
    title: stripEmojisAndDecodeHtml(title),
    tagline: stripEmojisAndDecodeHtml(tagline),
    description: stripEmojisAndDecodeHtml(description),
  };
}

/**
 * Identify automated CI telemetry-bake commits so cron runs never inflate velocity.
 */
export function isAutomatedBakeCommit(commit) {
  if (!commit || typeof commit !== 'object') return false;
  const authorLogin = String(commit.author?.login || '').toLowerCase();
  const committerLogin = String(commit.committer?.login || '').toLowerCase();
  const authorName = String(commit.commit?.author?.name || '').toLowerCase();
  const committerName = String(commit.commit?.committer?.name || '').toLowerCase();
  const authorEmail = String(commit.commit?.author?.email || '').toLowerCase();
  const committerEmail = String(commit.commit?.committer?.email || '').toLowerCase();
  const message = String(commit.commit?.message || '');

  if (
    authorLogin === 'github-actions[bot]' ||
    committerLogin === 'github-actions[bot]' ||
    authorName === 'github-actions[bot]' ||
    committerName === 'github-actions[bot]' ||
    authorEmail.includes('github-actions[bot]') ||
    committerEmail.includes('github-actions[bot]')
  ) {
    return true;
  }
  if (/\[(?:skip ci|ci skip)\]/i.test(message)) {
    return true;
  }
  return false;
}

function toUtcDateKey(dateInput) {
  if (!dateInput) return null;
  const ms = Date.parse(dateInput);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function buildUtcDayWindow(nowDate, days) {
  const todayMidnightUtc = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(new Date(todayMidnightUtc - i * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return keys;
}

function processRepoCommits(rawCommits, { isSelfDeck, htmlUrl, owner, dayWindow30, dayWindow90Set }) {
  const dayIndex30 = new Map(dayWindow30.map((d, idx) => [d, idx]));
  const commits30d = new Array(30).fill(0);
  const commitsByDay90 = new Map();
  const recentCommits = [];

  for (const commit of Array.isArray(rawCommits) ? rawCommits : []) {
    if (!commit || typeof commit !== 'object') continue;
    if (isSelfDeck && isAutomatedBakeCommit(commit)) continue;

    const sha = typeof commit.sha === 'string' ? commit.sha : '';
    const dateIso = commit.commit?.author?.date || commit.commit?.committer?.date || null;
    const dateKey = toUtcDateKey(dateIso);

    if (dateKey && dayWindow90Set.has(dateKey)) {
      commitsByDay90.set(dateKey, (commitsByDay90.get(dateKey) || 0) + 1);
    }
    if (dateKey && dayIndex30.has(dateKey)) {
      commits30d[dayIndex30.get(dateKey)] += 1;
    }

    if (recentCommits.length < 10 && sha) {
      const firstLine = String(commit.commit?.message || '').split(/\r?\n/)[0];
      const cleanMessage = stripEmojisAndDecodeHtml(firstLine) || 'Commit update';
      const cleanAuthor = stripEmojisAndDecodeHtml(commit.author?.login || commit.commit?.author?.name || owner) || owner;
      const commitUrl = sanitizeHttpUrl(commit.html_url) || `${htmlUrl}/commit/${sha}`;

      recentCommits.push({
        sha,
        sha7: sha.slice(0, 7),
        message: cleanMessage,
        author: cleanAuthor,
        date: dateIso || new Date().toISOString(),
        url: commitUrl,
      });
    }
  }

  const commits30dTotal = commits30d.reduce((sum, n) => sum + n, 0);
  return { commits30d, commits30dTotal, recentCommits, commitsByDay90 };
}

async function mapWithConcurrency(items, limit, worker) {
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
    'User-Agent': 'krunked-deck-snapshot-baker',
  };
  if (typeof token === 'string' && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

function parseNextLink(linkHeader) {
  if (typeof linkHeader !== 'string' || !linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (match) return sanitizeHttpUrl(match[1]);
  }
  return null;
}

async function fetchGitHubJson(url, { headers, fetchImpl = fetch, timeoutMs = API_TIMEOUT_MS, allowEmptyStatuses = [] }) {
  const res = await fetchWithTimeout(url, { method: 'GET', headers }, fetchImpl, timeoutMs);
  if (allowEmptyStatuses.includes(res.status)) {
    return { ok: true, status: res.status, data: null, nextUrl: null };
  }
  if (!res.ok) {
    const err = new Error(`GitHub API HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const nextUrl = parseNextLink(res.headers?.get?.('link') || '');
  return { ok: true, status: res.status, data, nextUrl };
}

function isValidSnapshot(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.schemaVersion === 'FoundrySnapshotV1' &&
    typeof obj.generatedAt === 'string' &&
    Array.isArray(obj.chronoPulse90d) &&
    obj.chronoPulse90d.length === 90 &&
    Array.isArray(obj.repos) &&
    obj.repos.length >= 1
  );
}

async function readExistingSnapshot(outputPath) {
  try {
    const raw = await fs.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (isValidSnapshot(parsed)) {
      return parsed;
    }
  } catch {
    // Missing or unreadable cache is handled gracefully
  }
  return null;
}

function sanitizeExistingSnapshot(snapshot) {
  const cloned = structuredClone(snapshot);
  cloned.sourceMode = 'preserved-cache';
  if (Array.isArray(cloned.repos)) {
    for (const repo of cloned.repos) {
      repo.title = stripEmojisAndDecodeHtml(repo.title);
      repo.tagline = stripEmojisAndDecodeHtml(repo.tagline);
      repo.description = stripEmojisAndDecodeHtml(repo.description);
      if (Array.isArray(repo.topics)) {
        repo.topics = repo.topics.map(stripEmojisAndDecodeHtml).filter(Boolean);
      }
      if (Array.isArray(repo.recentCommits)) {
        for (const c of repo.recentCommits) {
          c.message = stripEmojisAndDecodeHtml(c.message);
          c.author = stripEmojisAndDecodeHtml(c.author);
        }
      }
      if (repo.manifest && typeof repo.manifest === 'object') {
        repo.manifest.name = repo.manifest.name ? stripEmojisAndDecodeHtml(repo.manifest.name) : null;
        repo.manifest.shortName = repo.manifest.shortName ? stripEmojisAndDecodeHtml(repo.manifest.shortName) : null;
      }
    }
  }
  return cloned;
}

export function createOfflineBaselineSnapshot({ owner = DEFAULT_OWNER, now = new Date() } = {}) {
  const generatedAt = now.toISOString();
  const dayWindow90 = buildUtcDayWindow(now, 90);
  const slug = `${owner}.github.io`;
  const liveUrl = `https://${owner.toLowerCase()}.github.io/`;
  const htmlUrl = `https://github.com/${owner}/${slug}`;

  const baselineRepo = {
    slug,
    owner,
    fullName: `${owner}/${slug}`,
    htmlUrl,
    actionsUrl: `${htmlUrl}/actions`,
    title: 'KRUNKED // DECK',
    tagline: 'Live App Launchpad & Telemetry Surface',
    description: `Live App Launchpad, Sub-App Portal & Real-Time GitHub Telemetry Surface for ${owner}.`,
    category: 'SRE & TELEMETRY',
    surfaceType: 'WEB_APP',
    isLiveApp: true,
    isSelfDeck: true,
    liveVerified: true,
    liveUrl,
    pagesCandidateUrl: liveUrl,
    homepage: null,
    hasPages: true,
    isPrivate: false,
    isFork: false,
    isArchived: false,
    defaultBranch: 'main',
    primaryLanguage: 'JavaScript',
    languages: { JavaScript: 1 },
    topics: [],
    sizeKb: 0,
    stars: 0,
    watchers: 0,
    openIssues: 0,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    pushedAt: generatedAt,
    commits30d: new Array(30).fill(0),
    commits30dTotal: 0,
    recentCommits: [],
    manifest: {
      name: 'KRUNKED // DECK',
      shortName: 'KRUNKED DECK',
      themeColor: '#08090B',
      iconUrl: null,
      ogImageUrl: null,
    },
  };

  return {
    schemaVersion: 'FoundrySnapshotV1',
    generatedAt,
    owner,
    sourceMode: 'offline-fallback',
    totals: {
      totalRepos: 1,
      liveApps: 1,
      commits30d: 0,
      commits90d: 0,
      lastPushAt: generatedAt,
    },
    chronoPulse90d: dayWindow90.map((date) => ({
      date,
      totalCommits: 0,
      activeRepoSlugs: [],
    })),
    repos: [baselineRepo],
  };
}

async function writeSnapshotFile(outputPath, snapshot) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

/**
 * Harvest repositories, commit velocities, languages, and live Pages metadata into FoundrySnapshotV1.
 */
export async function buildSnapshot(options = {}) {
  const owner = (options.owner ?? process.env.GITHUB_OWNER ?? DEFAULT_OWNER).trim() || DEFAULT_OWNER;
  const token = options.token ?? process.env.GITHUB_TOKEN ?? '';
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const outputPath = options.outputPath ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'foundry-snapshot.json');
  const writeOutput = options.writeOutput ?? true;

  const priorSnapshot = await readExistingSnapshot(outputPath);
  const priorRepoMap = new Map(
    (priorSnapshot?.repos || []).map((r) => [r.slug, r]),
  );

  const generatedAt = now.toISOString();
  const dayWindow90 = buildUtcDayWindow(now, 90);
  const dayWindow30 = dayWindow90.slice(-30);
  const dayWindow90Set = new Set(dayWindow90);
  const since90dIso = `${dayWindow90[0]}T00:00:00.000Z`;
  const headers = createGitHubHeaders(token);

  let rawRepos;
  try {
    const reposUrl = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=pushed`;
    const res = await fetchGitHubJson(reposUrl, { headers, fetchImpl });
    if (!Array.isArray(res.data) || res.data.length === 0) {
      throw new Error('GitHub API returned empty or non-array repository list');
    }
    rawRepos = res.data;
  } catch (err) {
    const fallback = priorSnapshot
      ? sanitizeExistingSnapshot(priorSnapshot)
      : createOfflineBaselineSnapshot({ owner, now });
    if (writeOutput) {
      await writeSnapshotFile(outputPath, fallback);
    }
    return { snapshot: fallback, warning: err?.message || 'GitHub API unavailable' };
  }

  const dailyTotals90 = new Map(dayWindow90.map((d) => [d, { totalCommits: 0, slugs: new Set() }]));

  const processedRepos = await mapWithConcurrency(rawRepos, MAX_CONCURRENCY, async (repo) => {
    const slug = stripEmojisAndDecodeHtml(repo.name || '');
    const repoOwner = stripEmojisAndDecodeHtml(repo.owner?.login || owner) || owner;
    const fullName = `${repoOwner}/${slug}`;
    const htmlUrl = sanitizeHttpUrl(repo.html_url) || `https://github.com/${repoOwner}/${slug}`;
    const isSelfDeck = slug.toLowerCase() === `${owner.toLowerCase()}.github.io` || slug.toLowerCase() === 'krunked-fpv.github.io';
    const hasPages = Boolean(repo.has_pages);
    const homepage = sanitizeHttpUrl(repo.homepage);
    const pagesOrigin = `https://${repoOwner.toLowerCase()}.github.io`;
    const pagesCandidateUrl = isSelfDeck
      ? `${pagesOrigin}/`
      : hasPages
        ? `${pagesOrigin}/${encodeURIComponent(slug)}/`
        : null;

    const priorRepo = priorRepoMap.get(slug) || null;

    // 1. Commits (90d window)
    const commitsUrl = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(slug)}/commits?per_page=100&since=${encodeURIComponent(since90dIso)}`;
    let rawCommits = [];
    let commitsFetchedOk = false;
    try {
      let pageUrl = commitsUrl;
      let pageCount = 0;
      const maxPages = isSelfDeck ? 3 : 1;
      while (pageUrl && pageCount < maxPages) {
        const parsedPageUrl = new URL(pageUrl);
        if (parsedPageUrl.origin !== 'https://api.github.com') break;
        const cRes = await fetchGitHubJson(pageUrl, {
          headers,
          fetchImpl,
          allowEmptyStatuses: [404, 409],
        });
        const pageItems = Array.isArray(cRes.data) ? cRes.data : [];
        rawCommits.push(...pageItems);
        commitsFetchedOk = true;
        pageCount += 1;
        if (!isSelfDeck || pageItems.length < 100 || !cRes.nextUrl) break;
        const humanCount = rawCommits.filter((c) => !isAutomatedBakeCommit(c)).length;
        if (humanCount >= 10) break;
        pageUrl = cRes.nextUrl;
      }
    } catch {
      if (!commitsFetchedOk) rawCommits = [];
    }

    // 2. Languages
    const langsUrl = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(slug)}/languages`;
    let languages = {};
    try {
      const lRes = await fetchGitHubJson(langsUrl, {
        headers,
        fetchImpl,
        allowEmptyStatuses: [404],
      });
      if (lRes.data && typeof lRes.data === 'object' && !Array.isArray(lRes.data)) {
        for (const [lang, bytes] of Object.entries(lRes.data)) {
          if (Number.isFinite(bytes) && bytes > 0) {
            const cleanLang = stripEmojisAndDecodeHtml(lang);
            if (cleanLang) languages[cleanLang] = bytes;
          }
        }
      }
    } catch {
      if (priorRepo?.languages && typeof priorRepo.languages === 'object') {
        languages = { ...priorRepo.languages };
      }
    }

    const langEntries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
    const primaryLanguage = langEntries[0]?.[0] || (repo.language ? stripEmojisAndDecodeHtml(repo.language) : null) || null;

    // 3. Live sub-app HTML + manifest probe
    const primaryCandidate = homepage || pagesCandidateUrl;
    let probeResult = await probeLiveSubApp(slug, primaryCandidate, { fetchImpl });
    if (!probeResult.liveVerified && homepage && pagesCandidateUrl && homepage !== pagesCandidateUrl) {
      probeResult = await probeLiveSubApp(slug, pagesCandidateUrl, { fetchImpl });
    }

    let isLiveApp;
    let liveVerified;
    let surfaceType;
    let liveUrl;

    if (isSelfDeck) {
      isLiveApp = true;
      liveVerified = true;
      surfaceType = 'WEB_APP';
      liveUrl = `${pagesOrigin}/`;
    } else if (probeResult.liveVerified) {
      isLiveApp = true;
      liveVerified = true;
      surfaceType = 'WEB_APP';
      liveUrl = probeResult.resolvedUrl || primaryCandidate;
    } else {
      isLiveApp = false;
      liveVerified = false;
      surfaceType = 'CLI_REPO';
      liveUrl = null;
    }

    const copy = synthesizeCopy({
      slug,
      owner: repoOwner,
      isSelfDeck,
      isLiveApp,
      primaryLanguage,
      repoDescription: repo.description,
      parsedHtml: probeResult.parsedHtml,
      manifest: probeResult.manifest,
      manifestDescription: probeResult.manifestDescription,
    });

    const topics = Array.isArray(repo.topics)
      ? repo.topics.map(stripEmojisAndDecodeHtml).filter(Boolean)
      : [];

    const category = classifyCategory({
      slug,
      title: copy.title,
      tagline: copy.tagline,
      description: copy.description,
      topics,
      isSelfDeck,
    });

    let commitMetrics;
    if (commitsFetchedOk) {
      commitMetrics = processRepoCommits(rawCommits, {
        isSelfDeck,
        htmlUrl,
        owner: repoOwner,
        dayWindow30,
        dayWindow90Set,
      });
    } else if (priorRepo && Array.isArray(priorRepo.commits30d) && priorRepo.commits30d.length === 30) {
      commitMetrics = {
        commits30d: [...priorRepo.commits30d],
        commits30dTotal: Number(priorRepo.commits30dTotal) || 0,
        recentCommits: Array.isArray(priorRepo.recentCommits) ? priorRepo.recentCommits.slice(0, 10) : [],
        commitsByDay90: new Map(),
      };
    } else {
      commitMetrics = processRepoCommits([], {
        isSelfDeck,
        htmlUrl,
        owner: repoOwner,
        dayWindow30,
        dayWindow90Set,
      });
    }

    for (const [dateKey, count] of commitMetrics.commitsByDay90.entries()) {
      const bucket = dailyTotals90.get(dateKey);
      if (bucket && count > 0) {
        bucket.totalCommits += count;
        bucket.slugs.add(slug);
      }
    }

    const manifest = isSelfDeck
      ? {
          name: probeResult.manifest.name || 'KRUNKED // DECK',
          shortName: probeResult.manifest.shortName || 'KRUNKED DECK',
          themeColor: probeResult.manifest.themeColor || '#08090B',
          iconUrl: probeResult.manifest.iconUrl,
          ogImageUrl: probeResult.manifest.ogImageUrl,
        }
      : probeResult.manifest;

    return {
      slug,
      owner: repoOwner,
      fullName,
      htmlUrl,
      actionsUrl: `${htmlUrl}/actions`,
      title: copy.title,
      tagline: copy.tagline,
      description: copy.description,
      category,
      surfaceType,
      isLiveApp,
      isSelfDeck,
      liveVerified,
      liveUrl,
      pagesCandidateUrl,
      homepage,
      hasPages,
      isPrivate: Boolean(repo.private),
      isFork: Boolean(repo.fork),
      isArchived: Boolean(repo.archived),
      defaultBranch: repo.default_branch || 'main',
      primaryLanguage,
      languages,
      topics,
      sizeKb: Number.isFinite(repo.size) ? repo.size : 0,
      stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
      watchers: Number.isFinite(repo.watchers_count) ? repo.watchers_count : 0,
      openIssues: Number.isFinite(repo.open_issues_count) ? repo.open_issues_count : 0,
      createdAt: repo.created_at || generatedAt,
      updatedAt: repo.updated_at || generatedAt,
      pushedAt: repo.pushed_at || repo.updated_at || generatedAt,
      commits30d: commitMetrics.commits30d,
      commits30dTotal: commitMetrics.commits30dTotal,
      recentCommits: commitMetrics.recentCommits,
      manifest,
    };
  });

  processedRepos.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));

  const chronoPulse90d = dayWindow90.map((date) => {
    const bucket = dailyTotals90.get(date);
    return {
      date,
      totalCommits: bucket ? bucket.totalCommits : 0,
      activeRepoSlugs: bucket ? [...bucket.slugs] : [],
    };
  });

  const commits30dTotal = processedRepos.reduce((sum, r) => sum + r.commits30dTotal, 0);
  const commits90dTotal = chronoPulse90d.reduce((sum, d) => sum + d.totalCommits, 0);
  const liveAppsCount = processedRepos.filter((r) => r.isLiveApp).length;
  const lastPushAt = processedRepos[0]?.pushedAt || generatedAt;

  const snapshot = {
    schemaVersion: 'FoundrySnapshotV1',
    generatedAt,
    owner,
    sourceMode: 'live-github-bake',
    totals: {
      totalRepos: processedRepos.length,
      liveApps: liveAppsCount,
      commits30d: commits30dTotal,
      commits90d: commits90dTotal,
      lastPushAt,
    },
    chronoPulse90d,
    repos: processedRepos,
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
        console.log(
          `[build-snapshot] baked ${snapshot.totals.totalRepos} repos (${snapshot.totals.liveApps} live) -> ${snapshot.sourceMode}`,
        );
      }
    })
    .catch((err) => {
      console.error('[build-snapshot] unexpected error:', err);
      process.exitCode = 1;
    });
}
