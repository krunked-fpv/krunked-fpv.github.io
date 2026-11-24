import {
  decodeHtmlEntities,
  sanitizeHttpUrl,
  stripEmojisAndDecodeHtml,
} from './classifier.js';

const DEFAULT_TIMEOUT_MS = 4500;

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

function isBoilerplateOrNotFoundTitle(text) {
  if (!text) return true;
  const lower = text.toLowerCase().trim();
  if (BOILERPLATE_TITLES.has(lower)) return true;
  if (lower.includes('site not found') || lower.includes('page not found') || /\b404\b/.test(lower)) {
    return true;
  }
  return false;
}

function parseAttributes(attrString) {
  const attrs = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRe.exec(attrString)) !== null) {
    const name = match[1].toLowerCase();
    const rawVal = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = rawVal;
  }
  return attrs;
}

function sanitizeThemeColor(rawColor) {
  const clean = stripEmojisAndDecodeHtml(rawColor);
  if (!clean) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return clean;
  if (/^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\)$/i.test(clean)) return clean;
  if (/^[a-zA-Z]{3,20}$/.test(clean)) return clean;
  return null;
}

function splitTitleSubtitle(cleanTitle) {
  if (!cleanTitle) return { title: null, tagline: null };
  const match = cleanTitle.match(/^(.+?)\s+(?:\u2014|--|\||::)\s+(.+)$/);
  if (!match) {
    return { title: cleanTitle, tagline: null };
  }
  return {
    title: cleanTitle,
    tagline: match[2].trim() || null,
  };
}

function scoreIconCandidate(attrs) {
  const relTokens = String(attrs.rel || '').toLowerCase().split(/\s+/);
  let score = 1;
  if (relTokens.includes('apple-touch-icon')) score += 10;
  if (String(attrs.type || '').toLowerCase().includes('svg')) score += 8;
  const sizesMatch = String(attrs.sizes || '').match(/(\d+)x(\d+)/i);
  if (sizesMatch) {
    score += Math.min(Number.parseInt(sizesMatch[1], 10) || 0, 512) / 32;
  }
  if (String(attrs.href || '').toLowerCase().endsWith('.ico')) score -= 1;
  return score;
}

/**
 * Safely parse sub-app HTML metadata without executing markup or leaking
 * unsafe URL schemes, HTML tags, or pictographic emojis.
 * @param {string} htmlText
 * @param {string} baseUrl
 * @returns {{
 *   title: string | null,
 *   tagline: string | null,
 *   description: string | null,
 *   themeColor: string | null,
 *   iconUrl: string | null,
 *   ogImageUrl: string | null,
 *   manifestUrl: string | null,
 *   isNotFound: boolean
 * }}
 */
export function parseSubAppHtml(htmlText, baseUrl) {
  const empty = {
    title: null,
    tagline: null,
    description: null,
    themeColor: null,
    iconUrl: null,
    ogImageUrl: null,
    manifestUrl: null,
    isNotFound: false,
  };
  if (typeof htmlText !== 'string' || !htmlText.trim()) {
    return empty;
  }

  const safeBase = sanitizeHttpUrl(baseUrl) || undefined;
  const strippedScripts = htmlText
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');

  const titleMatch = strippedScripts.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? stripEmojisAndDecodeHtml(titleMatch[1]) : '';

  const lowerHtml = strippedScripts.toLowerCase();
  const isNotFound =
    /site not found|page not found|\b404\b/i.test(rawTitle) ||
    lowerHtml.includes("there isn't a github pages site here") ||
    lowerHtml.includes('site not found \u00b7 github pages');

  let title = null;
  let tagline = null;
  if (!isNotFound && rawTitle && !isBoilerplateOrNotFoundTitle(rawTitle)) {
    const split = splitTitleSubtitle(rawTitle);
    title = split.title;
    tagline = split.tagline;
  }

  let description = null;
  let ogDescription = null;
  let ogTitle = null;
  let themeColor = null;
  let ogImageUrl = null;
  let metaTagline = null;

  const metaRe = /<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let metaMatch;
  while ((metaMatch = metaRe.exec(strippedScripts)) !== null) {
    const attrs = parseAttributes(metaMatch[1]);
    const key = (attrs.name || attrs.property || '').toLowerCase().trim();
    const rawContent = attrs.content || '';
    if (!key || !rawContent) continue;

    if (key === 'description' && !description) {
      const cleaned = stripEmojisAndDecodeHtml(rawContent);
      if (cleaned) description = cleaned;
    } else if ((key === 'og:description' || key === 'twitter:description') && !ogDescription) {
      const cleaned = stripEmojisAndDecodeHtml(rawContent);
      if (cleaned) ogDescription = cleaned;
    } else if ((key === 'og:title' || key === 'application-name') && !ogTitle) {
      const cleaned = stripEmojisAndDecodeHtml(rawContent);
      if (cleaned && !isBoilerplateOrNotFoundTitle(cleaned)) ogTitle = cleaned;
    } else if ((key === 'tagline' || key === 'subtitle') && !metaTagline) {
      const cleaned = stripEmojisAndDecodeHtml(rawContent);
      if (cleaned) metaTagline = cleaned;
    } else if (key === 'theme-color' && !themeColor) {
      themeColor = sanitizeThemeColor(rawContent);
    } else if ((key === 'og:image' || key === 'twitter:image') && !ogImageUrl) {
      const decodedUrl = decodeHtmlEntities(rawContent);
      ogImageUrl = sanitizeHttpUrl(decodedUrl, safeBase);
    }
  }

  if (!isNotFound && !title && ogTitle) {
    title = ogTitle;
  }
  if (!tagline && metaTagline) {
    tagline = metaTagline;
  }
  if (!description && ogDescription) {
    description = ogDescription;
  }

  let manifestUrl = null;
  let bestIconUrl = null;
  let bestIconScore = -Infinity;

  const linkRe = /<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let linkMatch;
  while ((linkMatch = linkRe.exec(strippedScripts)) !== null) {
    const attrs = parseAttributes(linkMatch[1]);
    const relTokens = String(attrs.rel || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!relTokens.length || !attrs.href) continue;

    const decodedHref = decodeHtmlEntities(attrs.href);
    const safeHref = sanitizeHttpUrl(decodedHref, safeBase);
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
    title,
    tagline,
    description,
    themeColor,
    iconUrl: bestIconUrl,
    ogImageUrl,
    manifestUrl,
    isNotFound,
  };
}

async function fetchWithTimeout(fetchFn, url, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else if (typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function getResponseStatus(res) {
  if (!res) return 0;
  if (typeof res.status === 'number') return res.status;
  return res.ok ? 200 : 0;
}

function isResponseOk(res) {
  if (!res) return false;
  if (typeof res.ok === 'boolean') return res.ok;
  const st = getResponseStatus(res);
  return st >= 200 && st < 300;
}

function resolveDefaultManifestUrl(pageUrl) {
  try {
    const u = new URL(pageUrl);
    if (!u.pathname.endsWith('/') && !/\.[a-zA-Z0-9]+$/.test(u.pathname)) {
      u.pathname = `${u.pathname}/`;
    }
    return sanitizeHttpUrl('manifest.json', u.href);
  } catch {
    return null;
  }
}

function pickManifestIcon(icons, manifestBaseUrl) {
  if (!Array.isArray(icons)) return null;
  let bestUrl = null;
  let bestSize = -1;
  for (const item of icons) {
    if (!item || typeof item.src !== 'string') continue;
    const safeUrl = sanitizeHttpUrl(decodeHtmlEntities(item.src), manifestBaseUrl);
    if (!safeUrl) continue;
    const sizeMatch = String(item.sizes || '').match(/(\d+)x(\d+)/i);
    const size = sizeMatch ? Number.parseInt(sizeMatch[1], 10) || 0 : 0;
    if (size >= bestSize) {
      bestSize = size;
      bestUrl = safeUrl;
    }
  }
  return bestUrl;
}

/**
 * Probe a live GitHub Pages or sub-app URL for HTML metadata and manifest.json.
 * Never throws; returns liveVerified: false and safe null fields on failure or 404.
 * @param {string} slug
 * @param {string} liveUrl
 * @param {{ fetchFn?: typeof fetch, timeoutMs?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{
 *   liveVerified: boolean,
 *   manifest: {
 *     name: string | null,
 *     shortName: string | null,
 *     themeColor: string | null,
 *     iconUrl: string | null,
 *     ogImageUrl: string | null,
 *     manifestUrl?: string | null,
 *     description?: string | null
 *   } | null,
 *   parsedTitle: string | null,
 *   parsedDescription: string | null,
 *   tagline: string | null,
 *   error: string | null
 * }>}
 */
export async function probeLiveSubApp(slug, liveUrl, options = {}) {
  const fetchFn = options.fetchFn || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  const safeLiveUrl = sanitizeHttpUrl(liveUrl);

  if (!safeLiveUrl || typeof fetchFn !== 'function') {
    return {
      liveVerified: false,
      manifest: null,
      parsedTitle: null,
      parsedDescription: null,
      tagline: null,
      error: !safeLiveUrl ? 'Invalid live URL' : 'Fetch unavailable',
    };
  }

  let htmlRes;
  try {
    htmlRes = await fetchWithTimeout(fetchFn, safeLiveUrl, timeoutMs, options.signal);
  } catch (err) {
    return {
      liveVerified: false,
      manifest: null,
      parsedTitle: null,
      parsedDescription: null,
      tagline: null,
      error: err?.name === 'AbortError' ? 'Probe timeout' : (err?.message || 'Network error'),
    };
  }

  const status = getResponseStatus(htmlRes);
  if (!isResponseOk(htmlRes) || status >= 400) {
    return {
      liveVerified: false,
      manifest: null,
      parsedTitle: null,
      parsedDescription: null,
      tagline: null,
      error: `HTTP ${status || 'ERROR'}`,
    };
  }

  let htmlText = '';
  try {
    htmlText = typeof htmlRes.text === 'function' ? await htmlRes.text() : '';
  } catch (err) {
    return {
      liveVerified: false,
      manifest: null,
      parsedTitle: null,
      parsedDescription: null,
      tagline: null,
      error: err?.message || 'Failed to read HTML body',
    };
  }

  const resolvedPageUrl = sanitizeHttpUrl(htmlRes.url) || safeLiveUrl;
  const parsed = parseSubAppHtml(htmlText, resolvedPageUrl);

  if (parsed.isNotFound) {
    return {
      liveVerified: false,
      manifest: null,
      parsedTitle: null,
      parsedDescription: null,
      tagline: null,
      error: 'Site not found (404)',
    };
  }

  const manifestCandidate = parsed.manifestUrl || resolveDefaultManifestUrl(resolvedPageUrl);
  let manifestJson = null;
  let resolvedManifestUrl = manifestCandidate;

  if (manifestCandidate) {
    try {
      const mRes = await fetchWithTimeout(fetchFn, manifestCandidate, timeoutMs, options.signal);
      if (isResponseOk(mRes) && getResponseStatus(mRes) < 400) {
        resolvedManifestUrl = sanitizeHttpUrl(mRes.url) || manifestCandidate;
        if (typeof mRes.json === 'function') {
          manifestJson = await mRes.json();
        } else if (typeof mRes.text === 'function') {
          manifestJson = JSON.parse(await mRes.text());
        }
      }
    } catch {
      manifestJson = null;
    }
  }

  const mName = manifestJson ? stripEmojisAndDecodeHtml(manifestJson.name || '') : '';
  const mShortName = manifestJson
    ? stripEmojisAndDecodeHtml(manifestJson.short_name || manifestJson.shortName || '')
    : '';
  const mDesc = manifestJson ? stripEmojisAndDecodeHtml(manifestJson.description || '') : '';
  const mTheme = manifestJson
    ? sanitizeThemeColor(manifestJson.theme_color || manifestJson.themeColor || '')
    : null;
  const mIcon = manifestJson
    ? pickManifestIcon(manifestJson.icons, resolvedManifestUrl || resolvedPageUrl)
    : null;

  const finalTitle = parsed.title || (!isBoilerplateOrNotFoundTitle(mName) ? mName : null) || null;
  const finalDescription = parsed.description || mDesc || null;

  const manifest = {
    name: (!isBoilerplateOrNotFoundTitle(mName) ? mName : null) || finalTitle || null,
    shortName: (!isBoilerplateOrNotFoundTitle(mShortName) ? mShortName : null) || null,
    themeColor: mTheme || parsed.themeColor || null,
    iconUrl: mIcon || parsed.iconUrl || null,
    ogImageUrl: parsed.ogImageUrl || null,
    manifestUrl: manifestJson ? resolvedManifestUrl : parsed.manifestUrl,
    description: mDesc || null,
  };

  return {
    liveVerified: true,
    manifest,
    parsedTitle: finalTitle,
    parsedDescription: finalDescription,
    tagline: parsed.tagline || null,
    error: null,
  };
}
