import { GITHUB_USER } from '../config/site';
import type { ArtStyle, Category } from '../types/project';
import type { CurationOverride } from '../types/vault';

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '\u00B7',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122',
  times: '\u00D7',
  divide: '\u00F7',
  bull: '\u2022',
  laquo: '\u00AB',
  raquo: '\u00BB',
  rarr: '\u2192',
  larr: '\u2190',
  deg: '\u00B0',
});

/**
 * Strips pictographic emojis, keycaps, regional flags, ZWJ/VS16 sequences,
 * and raw star glyphs (U+2605/U+2606). Preserves ASCII and keyboard arrows/symbols.
 */
const EMOJI_STRIP_RE =
  /(?:[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[\u{1F1E6}-\u{1F1FF}]|\u2605|\u2606)/gu;

const DANGEROUS_SCHEME_RE = /^(?:javascript|data|vbscript|file|blob|about|mailto|tel|ftp):/i;
const ANY_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const BARE_DOMAIN_RE = /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+(?::\d+)?(?:[/?#].*)?$/;

const BOT_AUTHOR_RE = /(?:\b(?:github-actions|dependabot|renovate)(?:\[bot\])?\b|\[bot\]$)/i;
const SKIP_CI_RE = /\[(?:skip\s+ci|ci\s+skip|no\s+ci)\]/i;

const VALID_CATEGORIES: ReadonlySet<string> = new Set<Category>([
  'Game',
  'App',
  'Hardware/Sky',
  'Audio/Vinyl',
  'Automation',
  'Engine',
  'Utility',
]);

const VALID_ART_STYLES: ReadonlySet<string> = new Set<ArtStyle>([
  'topo',
  'orbital',
  'synthwave',
  'prism',
  'groove',
]);

function codePointToSafeChar(cp: number): string {
  if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff) return '';
  if (cp >= 0xd800 && cp <= 0xdfff) return '';
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return ' ';
  return String.fromCodePoint(cp);
}

/** Decode safe named and numeric HTML entities without executing markup. */
export function decodeHtmlEntities(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  return text.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (full, dec, hex, named) => {
    if (dec !== undefined) {
      return codePointToSafeChar(Number.parseInt(dec, 10));
    }
    if (hex !== undefined) {
      return codePointToSafeChar(Number.parseInt(hex, 16));
    }
    const key = String(named).toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, key)
      ? (NAMED_HTML_ENTITIES[key] as string)
      : full;
  });
}

function stripRawMarkup(raw: string): string {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-zA-Z!/?](?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ');
}

/**
 * Strip raw HTML/script/style tags, decode entities, strip any newly revealed tags,
 * remove all Unicode emojis/pictographs, and collapse whitespace.
 */
export function stripHtmlAndEmojis(input: unknown): string {
  if (input === null || input === undefined) return '';
  const raw = String(input);
  if (!raw) return '';

  const firstPass = stripRawMarkup(raw);
  const decoded = decodeHtmlEntities(firstPass);
  const secondPass = stripRawMarkup(decoded);
  const noControl = secondPass.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  const withoutEmojis = noControl.replace(EMOJI_STRIP_RE, '');
  return withoutEmojis.replace(/\s+/g, ' ').trim();
}

export interface SanitizeUrlOptions {
  allowBareDomain?: boolean;
}

const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

/**
 * Strictly validate and normalize an HTTP(S) URL.
 * Rejects javascript:, data:, vbscript:, file:, blob:, control chars, and embedded userinfo.
 */
export function sanitizeHttpUrl(
  rawUrl: unknown,
  baseUrl?: string,
  opts: SanitizeUrlOptions = {},
): string | null {
  if (typeof rawUrl !== 'string') return null;
  if (CONTROL_CHAR_RE.test(rawUrl)) return null;
  const decoded = decodeHtmlEntities(rawUrl);
  if (CONTROL_CHAR_RE.test(decoded)) return null;
  const cleaned = decoded.trim();
  if (!cleaned) return null;

  // Reject dangerous schemes even if whitespace was embedded before colon.
  const schemeProbe = cleaned.replace(/\s+/g, '');
  if (DANGEROUS_SCHEME_RE.test(schemeProbe)) return null;

  let candidate = cleaned;
  if (!ANY_SCHEME_RE.test(candidate) && !candidate.startsWith('//')) {
    if (opts.allowBareDomain && BARE_DOMAIN_RE.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (!baseUrl) {
      return null;
    }
  }

  let validBase: string | undefined;
  if (typeof baseUrl === 'string' && !CONTROL_CHAR_RE.test(baseUrl) && baseUrl.trim()) {
    try {
      const parsedBase = new URL(baseUrl.trim());
      if (
        (parsedBase.protocol === 'http:' || parsedBase.protocol === 'https:') &&
        !parsedBase.username &&
        !parsedBase.password
      ) {
        validBase = parsedBase.href;
      }
    } catch {
      validBase = undefined;
    }
  }

  try {
    const parsed = validBase ? new URL(candidate, validBase) : new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Strict hex theme-color validator (#RGB, #RGBA, #RRGGBB, #RRGGBBAA). */
export function sanitizeThemeColor(raw: unknown): string | null {
  const clean = stripHtmlAndEmojis(raw);
  if (!clean) return null;
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)) {
    return clean;
  }
  return null;
}

/** True when a commit was authored by CI/dependency bots or tagged [skip ci]. */
export function isBotCommit(commit: { author?: string | null; message?: string | null }): boolean {
  const author = String(commit.author ?? '');
  const message = String(commit.message ?? '');
  return BOT_AUTHOR_RE.test(author) || SKIP_CI_RE.test(message);
}

/** True when the repo is the host Forge Deck site (<owner>.github.io). */
export function isSelfDeckRepo(name: string, owner: string = GITHUB_USER): boolean {
  return name.trim().toLowerCase() === `${owner.trim().toLowerCase()}.github.io`;
}

/** Sanitize a user curation override patch before saving into VaultData.curation. */
export function sanitizeCurationPatch(patch: Partial<CurationOverride>): Partial<CurationOverride> {
  const out: Partial<CurationOverride> = {};
  if ('displayName' in patch) {
    const s = stripHtmlAndEmojis(patch.displayName).slice(0, 72);
    if (s) out.displayName = s;
  }
  if ('tagline' in patch) {
    const s = stripHtmlAndEmojis(patch.tagline).slice(0, 200);
    if (s) out.tagline = s;
  }
  if ('category' in patch && typeof patch.category === 'string' && VALID_CATEGORIES.has(patch.category)) {
    out.category = patch.category as Category;
  }
  if ('artStyle' in patch && typeof patch.artStyle === 'string' && VALID_ART_STYLES.has(patch.artStyle)) {
    out.artStyle = patch.artStyle as ArtStyle;
  }
  if ('launchUrl' in patch) {
    const u = sanitizeHttpUrl(patch.launchUrl, undefined, { allowBareDomain: true });
    if (u) out.launchUrl = u;
  }
  if ('accent' in patch && typeof patch.accent === 'number' && Number.isFinite(patch.accent)) {
    out.accent = ((Math.round(patch.accent) % 360) + 360) % 360;
  }
  if ('hidden' in patch && typeof patch.hidden === 'boolean') {
    out.hidden = patch.hidden;
  }
  if ('featured' in patch && typeof patch.featured === 'boolean') {
    out.featured = patch.featured;
  }
  return out;
}
