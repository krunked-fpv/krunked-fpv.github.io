export const CATEGORY_TAGS = [
  'GAMES & RPG',
  'SIMULATORS & FPV',
  'UTILITIES & AI',
  'SRE & TELEMETRY',
  'AUDIO & VINYL',
  'FAMILY & EDU',
];

const ACRONYMS = new Set([
  'fpv', 'ui', 'pwa', 'cli', 'ai', 'sre', 'qr',
  'dsp', 'gpu', 'rpg', 'edu', 'api', 'sdk', '2d', '3d',
]);

const NAMED_HTML_ENTITIES = Object.freeze({
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
  bull: '\u2022',
  laquo: '\u00AB',
  raquo: '\u00BB',
  rarr: '\u2192',
  larr: '\u2190',
  deg: '\u00B0',
});

const EMOJI_STRIP_RE = /(?:[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[\u{1F1E6}-\u{1F1FF}])/gu;

const BOILERPLATE_TITLES = new Set([
  'document',
  'vite app',
  'react app',
  'vite + react',
  'vite + react + ts',
  'index',
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

const CATEGORY_RULES = [
  {
    category: 'SRE & TELEMETRY',
    keywords: [
      'sre', 'chaos', 'telemetry', 'observability', 'monitor', 'monitoring',
      'metrics', 'uptime', 'incident', 'oncall', 'devops', 'infra', 'kubernetes',
      'k8s', 'docker', 'prometheus', 'grafana', 'watchdog', 'probe', 'launchpad',
      'dashboard', 'status', 'deploy', 'pipeline', 'ops', 'healthcheck',
    ],
  },
  {
    category: 'SIMULATORS & FPV',
    keywords: [
      'fpv', 'drone', 'quad', 'quadcopter', 'betaflight', 'inav', 'osd',
      'vtx', 'elrs', 'crossfire', 'uav', 'flight', 'simulator', 'sim',
      'cockpit', 'skymap', 'airspace', 'notam', 'lipo', 'gyro', 'blackbox',
      'pid', 'propeller', 'radar', 'telemetry-sim',
    ],
  },
  {
    category: 'AUDIO & VINYL',
    keywords: [
      'vinyl', 'discogs', 'turntable', 'audio', 'sound', 'synth', 'synthesizer',
      'midi', 'sequencer', 'sampler', 'daw', 'bpm', 'dsp', 'reverb', 'oscillator',
      'music', 'crate', 'record', 'album', 'dj', 'radio', 'sdr', 'eq',
    ],
  },
  {
    category: 'GAMES & RPG',
    keywords: [
      'game', 'games', 'rpg', 'ttrpg', 'dnd', 'd20', 'dice', 'dungeon',
      'quest', 'loot', 'monster', 'campaign', 'maul', 'arcade', 'retro',
      'roguelike', 'puzzle', 'chess', 'boardgame', 'cardgame', 'arena',
      'combat', 'boss', 'tetris', 'snake', 'pong', 'platformer',
    ],
  },
  {
    category: 'FAMILY & EDU',
    keywords: [
      'family', 'kid', 'kids', 'child', 'children', 'edu', 'education',
      'learn', 'learning', 'study', 'flashcard', 'math', 'alphabet', 'spelling',
      'quiz', 'school', 'tutor', 'homework', 'chore', 'chores', 'recipe',
      'meal', 'grocery', 'parent', 'storybook', 'bedtime', 'allowance',
    ],
  },
  {
    category: 'UTILITIES & AI',
    keywords: [
      'ai', 'llm', 'prompt', 'agent', 'copilot', 'ocr', 'qr', 'json', 'csv',
      'yaml', 'regex', 'diff', 'converter', 'calculator', 'timer', 'pomodoro',
      'clipboard', 'markdown', 'cli', 'tool', 'utility', 'utilities', 'helper',
      'generator', 'palette', 'svg', 'pdf', 'bookmark', 'launcher', 'dojo',
    ],
  },
];

/**
 * Decode safe HTML entities from a string without executing markup.
 * @param {string} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
  if (typeof text !== 'string' || !text) return '';
  return text.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (full, dec, hex, named) => {
    if (dec !== undefined) {
      const cp = Number.parseInt(dec, 10);
      return codePointToSafeChar(cp);
    }
    if (hex !== undefined) {
      const cp = Number.parseInt(hex, 16);
      return codePointToSafeChar(cp);
    }
    const key = named.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, key)
      ? NAMED_HTML_ENTITIES[key]
      : full;
  });
}

function codePointToSafeChar(cp) {
  if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff) return '';
  if (cp >= 0xd800 && cp <= 0xdfff) return '';
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return ' ';
  return String.fromCodePoint(cp);
}

/**
 * Strip raw HTML tags, decode safe entities, remove pictographic emojis,
 * collapse whitespace, and preserve keyboard glyphs such as keycap/return.
 * @param {unknown} input
 * @returns {string}
 */
export function stripEmojisAndDecodeHtml(input) {
  if (input === null || input === undefined) return '';
  const raw = String(input);
  if (!raw) return '';

  const withoutTags = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-zA-Z!/?](?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ');

  const decoded = decodeHtmlEntities(withoutTags);
  const withoutEmojis = decoded.replace(EMOJI_STRIP_RE, '');
  return withoutEmojis.replace(/\s+/g, ' ').trim();
}

/**
 * Validate and normalize a URL to strictly http: or https:, rejecting
 * javascript:, data:, vbscript:, relative exploits, and malformed inputs.
 * @param {unknown} rawUrl
 * @param {string} [baseUrl]
 * @returns {string | null}
 */
export function sanitizeHttpUrl(rawUrl, baseUrl) {
  if (typeof rawUrl !== 'string') return null;
  const cleaned = rawUrl.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return null;

  let validBase;
  if (typeof baseUrl === 'string' && baseUrl.trim()) {
    try {
      const parsedBase = new URL(baseUrl.trim());
      if (parsedBase.protocol === 'http:' || parsedBase.protocol === 'https:') {
        validBase = parsedBase.href;
      }
    } catch {
      validBase = undefined;
    }
  }

  try {
    const parsed = validBase ? new URL(cleaned, validBase) : new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Humanize a repository slug by splitting on '-'/'_' and uppercasing
 * known domain acronyms.
 * @param {unknown} slug
 * @returns {string}
 */
export function humanizeSlug(slug) {
  if (typeof slug !== 'string') return '';
  const clean = stripEmojisAndDecodeHtml(slug);
  if (!clean) return '';

  return clean
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (ACRONYMS.has(lower)) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function isBoilerplateTitle(candidate) {
  if (!candidate) return true;
  const normalized = candidate.toLowerCase().trim();
  return !normalized || BOILERPLATE_TITLES.has(normalized);
}

function splitTitleAndSubtitle(rawTitle) {
  if (!rawTitle) return { head: '', sub: '' };
  const match = rawTitle.match(/^(.+?)\s+(?:\u2014|--|\||::|-)\s+(.+)$/);
  if (!match) return { head: rawTitle, sub: '' };
  return { head: match[1].trim(), sub: match[2].trim() };
}

function chooseCategory(repoLike, slug, title, description) {
  if (slug.toLowerCase() === 'krunked-fpv.github.io') {
    return 'SRE & TELEMETRY';
  }

  const topics = Array.isArray(repoLike?.topics) ? repoLike.topics.join(' ') : '';
  const manifestText = [
    repoLike?.manifest?.name,
    repoLike?.manifest?.shortName,
    repoLike?.manifest?.description,
  ].filter(Boolean).join(' ');

  const corpus = [
    slug,
    title,
    description,
    topics,
    manifestText,
    repoLike?.tagline,
    repoLike?.primaryLanguage || repoLike?.language,
  ]
    .filter(Boolean)
    .map((part) => stripEmojisAndDecodeHtml(part).toLowerCase())
    .join(' ');

  let bestCategory = 'UTILITIES & AI';
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(corpus)) {
        score += slug.toLowerCase().includes(kw) ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

/**
 * Classify and normalize metadata for a repository record or GitHub API payload.
 * @param {object} repoLike
 * @returns {{ category: string, title: string, tagline: string, description: string }}
 */
export function classifyRepo(repoLike = {}) {
  const slug = stripEmojisAndDecodeHtml(repoLike.slug || repoLike.name || '');
  const owner = stripEmojisAndDecodeHtml(
    repoLike.owner?.login || repoLike.owner || 'krunked-fpv'
  );

  if (slug.toLowerCase() === 'krunked-fpv.github.io') {
    const rawDesc = stripEmojisAndDecodeHtml(
      repoLike.description || repoLike.parsedDescription || ''
    );
    return {
      category: 'SRE & TELEMETRY',
      title: 'KRUNKED // DECK',
      tagline: 'Live App Launchpad & Telemetry Surface',
      description:
        rawDesc ||
        'Live App Launchpad, Sub-App Portal & Real-Time GitHub Telemetry Surface for krunked-fpv.',
    };
  }

  const parsedTitleRaw = stripEmojisAndDecodeHtml(
    repoLike.parsedTitle || repoLike.htmlTitle || ''
  );
  const manifestName = stripEmojisAndDecodeHtml(
    repoLike.manifest?.name || repoLike.manifest?.shortName || ''
  );
  const explicitTitle = stripEmojisAndDecodeHtml(repoLike.title || '');
  const splitParsed = splitTitleAndSubtitle(parsedTitleRaw);

  let title = '';
  if (explicitTitle && !isBoilerplateTitle(explicitTitle) && explicitTitle.toLowerCase() !== slug.toLowerCase()) {
    title = explicitTitle;
  } else if (manifestName && !isBoilerplateTitle(manifestName)) {
    title = manifestName;
  } else if (splitParsed.head && !isBoilerplateTitle(splitParsed.head)) {
    title = splitParsed.head;
  } else if (parsedTitleRaw && !isBoilerplateTitle(parsedTitleRaw)) {
    title = parsedTitleRaw;
  } else {
    title = humanizeSlug(slug) || 'Untitled Module';
  }

  const repoDesc = stripEmojisAndDecodeHtml(repoLike.description || '');
  const metaDesc = stripEmojisAndDecodeHtml(
    repoLike.parsedDescription ||
      repoLike.metaDescription ||
      repoLike.ogDescription ||
      repoLike.manifest?.description ||
      ''
  );
  const subtitle = !isBoilerplateTitle(splitParsed.sub) ? splitParsed.sub : '';

  const category = chooseCategory(repoLike, slug, title, [repoDesc, metaDesc, subtitle].join(' '));

  let description = repoDesc || metaDesc || subtitle;
  if (!description) {
    const lang = stripEmojisAndDecodeHtml(repoLike.primaryLanguage || repoLike.language || '');
    description = lang
      ? `${title} — ${lang} module by ${owner}.`
      : `${title} — ${category.toLowerCase()} module by ${owner}.`;
  }

  const explicitTagline = stripEmojisAndDecodeHtml(repoLike.tagline || '');
  let tagline = explicitTagline || subtitle;
  if (!tagline) {
    const firstSentence = description.split(/(?<=[.!?])\s+|\s+\u2014\s+/)[0] || description;
    tagline = firstSentence.length > 64
      ? `${firstSentence.slice(0, 61).trimEnd()}...`
      : firstSentence;
  }

  return {
    category,
    title,
    tagline,
    description,
  };
}

/**
 * Compute thermal activity tier for a repository push timestamp.
 * @param {string | number | null | undefined} pushedAtIso
 * @param {number} [nowMs=Date.now()]
 * @returns {{ tier: 'hot' | 'active' | 'online', label: string, ageMs: number, colorVar: string, colorToken: string }}
 */
export function getThermalState(pushedAtIso, nowMs = Date.now()) {
  const pushedMs = typeof pushedAtIso === 'number'
    ? pushedAtIso
    : Date.parse(pushedAtIso || '');
  const ageMs = Number.isFinite(pushedMs) ? Math.max(0, nowMs - pushedMs) : Number.POSITIVE_INFINITY;

  if (ageMs < 86_400_000) {
    return {
      tier: 'hot',
      label: 'HOT // <24H',
      ageMs,
      colorVar: '--led-hot',
      colorToken: '--led-hot',
    };
  }
  if (ageMs < 604_800_000) {
    return {
      tier: 'active',
      label: 'ACTIVE // <7D',
      ageMs,
      colorVar: '--led-active',
      colorToken: '--led-active',
    };
  }
  return {
    tier: 'online',
    label: 'ONLINE',
    ageMs,
    colorVar: '--led-online',
    colorToken: '--led-online',
  };
}
