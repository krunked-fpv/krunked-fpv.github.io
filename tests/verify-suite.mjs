import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import zlib from 'node:zlib';

import { foley, createMicroFoley } from '../src/audio/micro-foley.js';
import { mountChronoPulse } from '../src/graphics/chrono-pulse.js';
import { mountFilmGrain } from '../src/graphics/film-grain.js';
import { encodeQrMatrix, mountQrSvg, renderQrSvgString } from '../src/graphics/qr-svg.js';
import { mountSparkline, renderSparklineSvg } from '../src/graphics/sparkline.js';
import { createSwissEmblemElement, fnv1a32, renderSwissEmblemSvg } from '../src/graphics/swiss-emblem.js';
import {
  CATEGORY_TAGS,
  classifyRepo,
  getThermalState,
  humanizeSlug,
  sanitizeHttpUrl,
  stripEmojisAndDecodeHtml,
} from '../src/telemetry/classifier.js';
import { clearTelemetryCache, readCachedSnapshot, writeCachedSnapshot } from '../src/telemetry/idb-cache.js';
import { parseSubAppHtml, probeLiveSubApp } from '../src/telemetry/manifest-probe.js';
import { createSyncEngine } from '../src/telemetry/sync-engine.js';
import { createBentoDeck } from '../src/ui/bento-deck.js';
import { createCommandPalette } from '../src/ui/command-palette.js';
import { createFoundryMatrix } from '../src/ui/foundry-matrix.js';
import { createHeroForge, createLivePeekBezel, isSelfHostedPeekTarget } from '../src/ui/hero-forge.js';
import { createInspectorDrawer } from '../src/ui/inspector-drawer.js';
import { createModals } from '../src/ui/modals.js';
import { createTopBar } from '../src/ui/top-bar.js';
import {
  exportDeckConfigJson,
  parseAndValidateDeckConfigJson,
} from '../src/vault/config-io.js';
import {
  COOKIE_MAX_BYTES,
  VAULT_KEY,
  createCookieVault,
  decodeShadowCookiePayload,
  encodeShadowCookiePayload,
} from '../src/vault/cookie-vault.js';
import {
  PAT_STORAGE_KEY,
  assertGitHubApiOrigin,
  getAuthHeadersForUrl,
  getPatStatus,
  loadRawPatForInternalSync,
  savePat,
  wipePat,
} from '../src/vault/pat-vault.js';
import {
  buildSnapshot,
  createOfflineBaselineSnapshot,
  isAutomatedBakeCommit,
} from '../scripts/build-snapshot.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_AUDIT_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.yml', '.yaml', '.svg', '.md']);

// Enforce strict zero-network guarantee during test execution
globalThis.fetch = async (url) => {
  throw new Error(`Forbidden network request in offline verification suite: ${String(url)}`);
};

const results = [];

async function runCheck(name, fn) {
  const t0 = performance.now();
  try {
    await fn();
    const dt = (performance.now() - t0).toFixed(1);
    results.push({ name, passed: true, dt });
    console.log(`[PASS] ${name} (${dt}ms)`);
  } catch (err) {
    const dt = (performance.now() - t0).toFixed(1);
    results.push({ name, passed: false, dt, error: err });
    console.error(`[FAIL] ${name} (${dt}ms): ${err?.stack || err}`);
  }
}

function repoPath(...parts) {
  return path.join(ROOT_DIR, ...parts);
}

async function walkProjectFiles(dir = ROOT_DIR) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      files.push(...(await walkProjectFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function toRelPosix(absPath) {
  return path.relative(ROOT_DIR, absPath).split(path.sep).join('/');
}

function buildDynamicPatterns() {
  const vendorTokens = [
    ['clau', 'de'].join(''),
    ['g', 'pt'].join(''),
    ['gem', 'ini'].join(''),
    ['lla', 'ma'].join(''),
    ['anth', 'ropic'].join(''),
    ['ope', 'nai'].join(''),
    ['son', 'net'].join(''),
    ['op', 'us'].join(''),
    ['hai', 'ku'].join(''),
    ['deep', 'seek'].join(''),
    ['mis', 'tral'].join(''),
    ['qw', 'en'].join(''),
    ['gr', 'ok'].join(''),
    ['co', 'dex'].join(''),
    ['o', '1'].join(''),
    ['o', '3'].join(''),
    ['o', '4'].join(''),
  ];
  const placeholderTokens = [
    ['TO', 'DO'].join(''),
    ['FIX', 'ME'].join(''),
    ['XX', 'X'].join(''),
  ];
  return {
    vendorRegex: new RegExp(`\\b(?:${vendorTokens.join('|')})(?:[-_.]?[0-9]+(?:\\.[0-9]+)*)?\\b`, 'i'),
    placeholderRegex: new RegExp(`\\b(?:${placeholderTokens.join('|')})\\b`),
    emojiRegex: /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u20E3|[\u{1F1E6}-\u{1F1FF}])/gu,
  };
}

// ============================================================================
// Lightweight In-Memory Browser Environment Mocks (Zero Network / Pure Node)
// ============================================================================

function createMemoryStorage() {
  const map = new Map();
  return {
    _map: map,
    getItem(key) {
      return map.has(String(key)) ? map.get(String(key)) : null;
    },
    setItem(key, val) {
      map.set(String(key), String(val));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}

function createMemoryIdbFactory() {
  const dbs = new Map();

  function makeReq(executor) {
    const req = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    };
    queueMicrotask(() => {
      try {
        executor(req);
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
      }
    });
    return req;
  }

  return {
    _dbs: dbs,
    wipeDatabase(name) {
      dbs.delete(name);
    },
    open(name) {
      return makeReq((req) => {
        let storeMap = dbs.get(name);
        const needsUpgrade = !storeMap;
        if (!storeMap) {
          storeMap = new Map();
          dbs.set(name, storeMap);
        }

        const db = {
          objectStoreNames: {
            contains: (storeName) => storeMap.has(storeName),
          },
          createObjectStore(storeName) {
            if (!storeMap.has(storeName)) {
              storeMap.set(storeName, new Map());
            }
          },
          close() {},
          transaction(storeNames) {
            const tx = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore(storeName) {
                if (!storeMap.has(storeName)) {
                  storeMap.set(storeName, new Map());
                }
                const table = storeMap.get(storeName);
                return {
                  get(key) {
                    return makeReq((gReq) => {
                      gReq.result = table.has(key) ? structuredClone(table.get(key)) : undefined;
                      gReq.onsuccess?.({ target: gReq });
                    });
                  },
                  put(val, key) {
                    return makeReq((pReq) => {
                      table.set(key, structuredClone(val));
                      pReq.result = key;
                      pReq.onsuccess?.({ target: pReq });
                      queueMicrotask(() => tx.oncomplete?.({ target: tx }));
                    });
                  },
                  delete(key) {
                    return makeReq((dReq) => {
                      table.delete(key);
                      dReq.onsuccess?.({ target: dReq });
                      queueMicrotask(() => tx.oncomplete?.({ target: tx }));
                    });
                  },
                  clear() {
                    return makeReq((cReq) => {
                      table.clear();
                      cReq.onsuccess?.({ target: cReq });
                      queueMicrotask(() => tx.oncomplete?.({ target: tx }));
                    });
                  },
                };
              },
            };
            void storeNames;
            return tx;
          },
        };

        req.result = db;
        if (needsUpgrade && typeof req.onupgradeneeded === 'function') {
          req.onupgradeneeded({ target: req });
        }
        req.onsuccess?.({ target: req });
      });
    },
  };
}

function createMockCookieJarDocument() {
  const jar = new Map();
  return {
    _jar: jar,
    clearCookies() {
      jar.clear();
    },
    get cookie() {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    },
    set cookie(raw) {
      const [pair] = String(raw).split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAgeMatch = String(raw).match(/Max-Age\s*=\s*(-?\d+)/i);
      if (maxAgeMatch && Number(maxAgeMatch[1]) <= 0) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    },
  };
}

function createMockDom() {
  class MockClassList {
    constructor(el) {
      this.el = el;
      this.set = new Set();
    }
    _syncFrom(val) {
      this.set = new Set(String(val || '').split(/\s+/).filter(Boolean));
    }
    _syncTo() {
      this.el._attrs.set('class', [...this.set].join(' '));
    }
    add(...tokens) {
      for (const t of tokens) if (t) this.set.add(t);
      this._syncTo();
    }
    remove(...tokens) {
      for (const t of tokens) this.set.delete(t);
      this._syncTo();
    }
    toggle(token, force) {
      if (force === true) this.set.add(token);
      else if (force === false) this.set.delete(token);
      else if (this.set.has(token)) this.set.delete(token);
      else this.set.add(token);
      this._syncTo();
      return this.set.has(token);
    }
    contains(token) {
      return this.set.has(token);
    }
  }

  class MockNode {
    constructor(tag, ns = null) {
      this.tagName = String(tag || '').toUpperCase();
      this.namespaceURI = ns;
      this._attrs = new Map();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.style = {
        setProperty(k, v) {
          this[k] = v;
        },
        removeProperty(k) {
          delete this[k];
        },
      };
      this.dataset = {};
      this.classList = new MockClassList(this);
      this._listeners = new Map();
      this.hidden = false;
      this.disabled = false;
      this.value = '';
      this._text = '';
    }
    get textContent() {
      if (this.children.length === 0) return this._text;
      return this.children.map((c) => c.textContent ?? '').join('');
    }
    set textContent(v) {
      this._text = String(v ?? '');
      this.children = [];
      this.childNodes = this.children;
    }
    get className() {
      return this._attrs.get('class') || '';
    }
    set className(v) {
      this.classList._syncFrom(v);
      this._attrs.set('class', String(v || ''));
    }
    get id() {
      return this._attrs.get('id') || '';
    }
    set id(v) {
      this._attrs.set('id', String(v));
    }
    get firstElementChild() {
      return this.children.find((c) => c instanceof MockNode) || null;
    }
    setAttribute(k, v) {
      const s = String(v);
      this._attrs.set(k, s);
      if (k === 'class') this.classList._syncFrom(s);
      if (k === 'hidden') this.hidden = true;
      if (k === 'disabled') this.disabled = true;
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = s;
      }
    }
    getAttribute(k) {
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    removeAttribute(k) {
      this._attrs.delete(k);
      if (k === 'hidden') this.hidden = false;
      if (k === 'disabled') this.disabled = false;
    }
    appendChild(child) {
      if (!child) return child;
      if (child._isFragment) {
        for (const c of [...child.children]) this.appendChild(c);
        child.children = [];
        return child;
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...items) {
      for (const item of items) {
        if (typeof item === 'string') {
          this.appendChild({ nodeType: 3, textContent: item, parentNode: this });
        } else if (item) {
          this.appendChild(item);
        }
      }
    }
    replaceChildren(...items) {
      this._text = '';
      this.children = [];
      this.childNodes = this.children;
      this.append(...items);
    }
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    }
    replaceWith(node) {
      if (!this.parentNode) return;
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) {
        node.parentNode = this.parentNode;
        this.parentNode.children[idx] = node;
      }
    }
    contains(node) {
      if (node === this) return true;
      return this.children.some((c) => c instanceof MockNode && c.contains(node));
    }
    closest(sel) {
      for (const part of sel.split(',')) {
        const s = part.trim();
        if (s.startsWith('.') && this.classList.contains(s.slice(1))) return this;
      }
      return this.parentNode instanceof MockNode ? this.parentNode.closest(sel) : null;
    }
    _matchesSingle(part) {
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      return this.tagName === part.toUpperCase();
    }
    querySelectorAll(sel) {
      const parts = sel.trim().split(/\s+/).filter(Boolean);
      const matchStep = (root, idx) => {
        const out = [];
        const walk = (node) => {
          for (const child of node.children || []) {
            if (!(child instanceof MockNode)) continue;
            if (child._matchesSingle(parts[idx])) {
              if (idx === parts.length - 1) out.push(child);
              else out.push(...matchStep(child, idx + 1));
            }
            walk(child);
          }
        };
        walk(root);
        return out;
      };
      return parts.length ? matchStep(this, 0) : [];
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    }
    dispatchEvent(ev) {
      ev.target ??= this;
      ev.preventDefault ??= () => {};
      ev.stopPropagation ??= () => {};
      for (const fn of [...(this._listeners.get(ev.type) || [])]) {
        fn(ev);
      }
    }
    click() {
      this.dispatchEvent({ type: 'click' });
    }
    focus() {
      doc.activeElement = this;
    }
    select() {}
    scrollIntoView() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 360, height: 32, right: 360, bottom: 32 };
    }
  }

  const docListeners = new Map();
  const body = new MockNode('body');
  const html = new MockNode('html');
  const doc = {
    body,
    documentElement: html,
    activeElement: null,
    visibilityState: 'visible',
    createElement: (tag) => new MockNode(tag),
    createElementNS: (ns, tag) => new MockNode(tag, ns),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    createDocumentFragment: () => ({
      _isFragment: true,
      children: [],
      appendChild(c) {
        this.children.push(c);
        return c;
      },
    }),
    addEventListener(t, fn) {
      if (!docListeners.has(t)) docListeners.set(t, []);
      docListeners.get(t).push(fn);
    },
    removeEventListener(t, fn) {
      const arr = docListeners.get(t);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };

  return { doc, body, MockNode };
}

// ============================================================================
// 1. STATIC & ANTI-SLOP AUDIT
// ============================================================================

await runCheck('1.1 Zero pictographic emojis across entire repo & snapshot (preserving command/return glyphs)', async () => {
  const { emojiRegex } = buildDynamicPatterns();
  const files = await walkProjectFiles(ROOT_DIR);

  for (const abs of files) {
    if (!TEXT_AUDIT_EXTS.has(path.extname(abs).toLowerCase())) continue;
    const rel = toRelPosix(abs);
    const content = await fs.readFile(abs, 'utf8');
    const hits = content.match(emojiRegex);
    assert.equal(hits, null, `Found pictographic emoji(s) ${JSON.stringify(hits)} in ${rel}`);
  }

  const topBarSource = await fs.readFile(repoPath('src', 'ui', 'top-bar.js'), 'utf8');
  const heroSource = await fs.readFile(repoPath('src', 'ui', 'hero-forge.js'), 'utf8');
  assert.ok(topBarSource.includes('\\u2318') || topBarSource.includes('\u2318'), 'Command glyph must be preserved');
  assert.ok(heroSource.includes('\\u21B5') || heroSource.includes('\u21B5'), 'Return glyph must be preserved');
});

await runCheck('1.2 Zero hardcoded vendor model names, codenames, versions, or placeholders across repo & .agents', async () => {
  const { vendorRegex, placeholderRegex } = buildDynamicPatterns();
  const files = await walkProjectFiles(ROOT_DIR);

  for (const abs of files) {
    if (!TEXT_AUDIT_EXTS.has(path.extname(abs).toLowerCase())) continue;
    const rel = toRelPosix(abs);
    const content = await fs.readFile(abs, 'utf8');
    const vendorHit = content.match(vendorRegex);
    assert.equal(vendorHit, null, `Found hardcoded vendor/model reference "${vendorHit?.[0]}" in ${rel}`);
    const todoHit = content.match(placeholderRegex);
    assert.equal(todoHit, null, `Found placeholder "${todoHit?.[0]}" in ${rel}`);
  }
});

await runCheck('1.3 Zero root-relative paths & all ./ asset links and ES module imports resolve on disk', async () => {
  const rootRelativeRe = /['"`]\/(?:src|assets|data|manifest\.json|sw\.js)\b/;
  const files = await walkProjectFiles(ROOT_DIR);

  for (const abs of files) {
    const rel = toRelPosix(abs);
    if (
      rel === 'index.html' ||
      rel === 'manifest.json' ||
      rel === 'sw.js' ||
      rel.startsWith('src/')
    ) {
      const content = await fs.readFile(abs, 'utf8');
      const match = content.match(rootRelativeRe);
      assert.equal(match, null, `Forbidden root-relative path ${match?.[0]} in ${rel}`);
    }

    if ((rel.startsWith('src/') || rel.startsWith('scripts/')) && (rel.endsWith('.js') || rel.endsWith('.mjs'))) {
      const content = await fs.readFile(abs, 'utf8');
      for (const m of content.matchAll(/\b(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        if (spec.startsWith('node:')) continue;
        assert.ok(spec.startsWith('./') || spec.startsWith('../'), `Non-relative module specifier "${spec}" in ${rel}`);
        const resolved = path.resolve(path.dirname(abs), spec);
        await fs.access(resolved);
      }
    }
  }

  const indexHtml = await fs.readFile(repoPath('index.html'), 'utf8');
  for (const m of indexHtml.matchAll(/\b(?:href|src)=['"]([^'"]+)['"]/g)) {
    const ref = m[1];
    if (/^https?:\/\//i.test(ref)) continue;
    assert.ok(ref.startsWith('./'), `index.html asset "${ref}" must use relative ./ prefix`);
    await fs.access(repoPath(ref.slice(2)));
  }

  const appJs = await fs.readFile(repoPath('src', 'app.js'), 'utf8');
  for (const m of appJs.matchAll(/['"](\.\/(?:sw\.js|data\/[^'"]+))['"]/g)) {
    await fs.access(repoPath(m[1].slice(2)));
  }
});

await runCheck('1.4 SPEC CSS tokens, semantic classes used in src/ui/**, CSS integrity & zero unsafe DOM sinks', async () => {
  const specMd = await fs.readFile(repoPath('SPEC.md'), 'utf8');
  const sec5 = specMd.slice(specMd.indexOf('## 5. CSS Custom Properties'));
  const specVars = [...new Set([...sec5.matchAll(/`(--[a-zA-Z0-9_-]+):/g)].map((m) => m[1]))];
  const specClasses = new Set([...sec5.matchAll(/`(\.[a-zA-Z0-9_-]+)`/g)].map((m) => m[1].slice(1)));

  const cssFiles = ['tokens.css', 'chassis.css', 'components.css', 'views.css'];
  const cssTexts = await Promise.all(cssFiles.map((f) => fs.readFile(repoPath('src', 'styles', f), 'utf8')));
  const combinedCss = cssTexts.join('\n');

  for (const [idx, css] of cssTexts.entries()) {
    let depth = 0;
    for (const ch of css) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      assert.ok(depth >= 0, `Unmatched closing brace in src/styles/${cssFiles[idx]}`);
    }
    assert.equal(depth, 0, `Unclosed brace in src/styles/${cssFiles[idx]}`);
    assert.ok(!/backdrop-filter\s*:/i.test(css), `Disallowed backdrop-filter in ${cssFiles[idx]}`);
    assert.ok(!/scale\(\s*1\.05\s*\)/i.test(css), `Disallowed bounce scale(1.05) in ${cssFiles[idx]}`);
  }

  const definedCssClasses = new Set();
  for (const m of combinedCss.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g)) {
    definedCssClasses.add(m[1]);
  }

  for (const v of specVars) {
    assert.ok(combinedCss.includes(v), `Missing SPEC CSS custom property ${v} in src/styles/`);
  }
  for (const c of specClasses) {
    assert.ok(definedCssClasses.has(c), `Missing SPEC semantic CSS class .${c} in src/styles/`);
  }

  const uiDir = repoPath('src', 'ui');
  const uiFiles = [
    repoPath('index.html'),
    repoPath('src', 'app.js'),
    ...(await fs.readdir(uiDir)).map((f) => path.join(uiDir, f)),
  ];

  const unsafeSinkRe = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/;
  for (const abs of uiFiles) {
    const rel = toRelPosix(abs);
    const content = await fs.readFile(abs, 'utf8');
    if (rel !== 'index.html') {
      const sinkMatch = content.match(unsafeSinkRe);
      assert.equal(sinkMatch, null, `Unsafe DOM HTML sink "${sinkMatch?.[0]}" found in ${rel}`);
    }

    for (const m of content.matchAll(/(?:class|className)\s*[:=]\s*['"]([^'"]+)['"]/g)) {
      for (const cls of m[1].split(/\s+/).filter(Boolean)) {
        if (specClasses.has(cls)) {
          assert.ok(definedCssClasses.has(cls), `SPEC semantic class .${cls} in ${rel} missing from src/styles/`);
        }
      }
    }
  }
});

// ============================================================================
// 2. BINARY PNG & PWA CONTRACT AUDIT
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

await runCheck('2.1 Binary PNG headers, IHDR CRC32 & dimensions, IDAT zlib inflate, and IEND', async () => {
  const expectedIcons = [
    ['assets/icons/icon-192.png', 192, 192],
    ['assets/icons/icon-512.png', 512, 512],
    ['assets/icons/apple-touch-icon.png', 180, 180],
  ];

  for (const [relPath, expW, expH] of expectedIcons) {
    const buf = await fs.readFile(repoPath(relPath));
    assert.equal(
      buf.subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
      `${relPath} missing valid PNG magic header`
    );

    let offset = 8;
    const chunkTypes = [];
    const idatParts = [];
    let ihdr = null;

    while (offset < buf.length) {
      assert.ok(offset + 12 <= buf.length, `${relPath} truncated chunk header at ${offset}`);
      const len = buf.readUInt32BE(offset);
      const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
      const dataStart = offset + 8;
      const dataEnd = dataStart + len;
      assert.ok(dataEnd + 4 <= buf.length, `${relPath} truncated chunk ${type}`);
      const data = buf.subarray(dataStart, dataEnd);
      const storedCrc = buf.readUInt32BE(dataEnd);
      const computedCrc = crc32(buf.subarray(offset + 4, dataEnd));
      assert.equal(storedCrc, computedCrc, `${relPath} chunk ${type} CRC32 mismatch`);

      chunkTypes.push(type);
      if (type === 'IHDR') {
        assert.equal(len, 13, `${relPath} IHDR must be 13 bytes`);
        ihdr = {
          width: data.readUInt32BE(0),
          height: data.readUInt32BE(4),
          bitDepth: data.readUInt8(8),
          colorType: data.readUInt8(9),
        };
      } else if (type === 'IDAT') {
        idatParts.push(data);
      }
      offset = dataEnd + 4;
    }

    assert.equal(offset, buf.length, `${relPath} trailing bytes after IEND`);
    assert.equal(chunkTypes[0], 'IHDR', `${relPath} first chunk must be IHDR`);
    assert.equal(chunkTypes.at(-1), 'IEND', `${relPath} last chunk must be IEND`);
    assert.equal(ihdr.width, expW, `${relPath} width mismatch`);
    assert.equal(ihdr.height, expH, `${relPath} height mismatch`);
    assert.ok(idatParts.length >= 1, `${relPath} missing IDAT chunk`);

    const inflated = zlib.inflateSync(Buffer.concat(idatParts));
    const channels = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : ihdr.colorType === 4 ? 2 : 1;
    const expectedScanlineBytes = (1 + ihdr.width * channels * (ihdr.bitDepth / 8)) * ihdr.height;
    assert.equal(inflated.length, expectedScanlineBytes, `${relPath} inflated pixel stream length mismatch`);
  }
});

await runCheck('2.2 Manifest contract & sw.js VM allowlist + precache verification', async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath('manifest.json'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#08090B');
  assert.equal(manifest.theme_color, '#08090B');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./assets/icons/'), `Icon src must be relative: ${icon.src}`);
    assert.equal(icon.purpose, 'any maskable');
    await fs.access(repoPath(icon.src.slice(2)));
  }

  const swCode = await fs.readFile(repoPath('sw.js'), 'utf8');
  const listeners = {};
  const cacheEntries = new Map();
  let staleDeleted = false;
  let claimed = false;

  const normalizeKey = (req) => {
    const raw = typeof req === 'string' ? req : req?.url;
    return new URL(raw).href;
  };

  const sandbox = {
    URL,
    Set,
    Map,
    Promise,
    Request: class MockRequest {
      constructor(input, init = {}) {
        this.url = typeof input === 'string' ? input : input.url;
        this.method = init.method || 'GET';
      }
    },
    Response: class MockResponse {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status ?? 200;
        this.ok = this.status >= 200 && this.status < 300;
        this.type = 'basic';
      }
      clone() {
        return new MockResponse(this.body, { status: this.status });
      }
    },
    caches: {
      async open(name) {
        assert.equal(name, 'krunked-sw-cache-v1');
        return {
          async put(req, res) {
            cacheEntries.set(normalizeKey(req), res);
          },
          async match(req) {
            return cacheEntries.get(normalizeKey(req)) || undefined;
          },
        };
      },
      async keys() {
        return ['krunked-sw-cache-v1', 'legacy-sw-cache-v0'];
      },
      async delete(name) {
        if (name === 'legacy-sw-cache-v0') staleDeleted = true;
        return true;
      },
    },
    fetch: async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      return new sandbox.Response(`cached:${url}`, { status: 200 });
    },
    self: {
      location: {
        href: 'https://krunked-fpv.github.io/sw.js',
        origin: 'https://krunked-fpv.github.io',
      },
      registration: { scope: 'https://krunked-fpv.github.io/' },
      clients: {
        async claim() {
          claimed = true;
        },
      },
      async skipWaiting() {},
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
    },
  };

  vm.runInNewContext(
    `${swCode}\n;globalThis.__PRECACHE_ASSETS = PRECACHE_ASSETS; globalThis.__CACHE_NAME = KRUNKED_SW_CACHE_V1;`,
    sandbox
  );

  assert.equal(sandbox.__CACHE_NAME, 'krunked-sw-cache-v1');
  assert.ok(Array.isArray(sandbox.__PRECACHE_ASSETS) && sandbox.__PRECACHE_ASSETS.length >= 25);

  for (const relAsset of sandbox.__PRECACHE_ASSETS) {
    const diskPath = relAsset === './' ? 'index.html' : relAsset.replace(/^\.\//, '');
    await fs.access(repoPath(diskPath));
  }

  let installWait = null;
  listeners.install({ waitUntil: (p) => { installWait = p; } });
  await installWait;
  assert.ok(cacheEntries.has('https://krunked-fpv.github.io/index.html'));
  assert.ok(cacheEntries.has('https://krunked-fpv.github.io/data/foundry-snapshot.json'));

  let activateWait = null;
  listeners.activate({ waitUntil: (p) => { activateWait = p; } });
  await activateWait;
  assert.equal(staleDeleted, true, 'Activate must purge deprecated caches');
  assert.equal(claimed, true, 'Activate must call self.clients.claim()');

  const dispatchSwFetch = async (url, method = 'GET') => {
    let responded = false;
    let responsePromise = null;
    const pendingBg = [];
    listeners.fetch({
      request: new sandbox.Request(url, { method }),
      respondWith: (p) => {
        responded = true;
        responsePromise = Promise.resolve(p);
      },
      waitUntil: (p) => pendingBg.push(Promise.resolve(p)),
    });
    const response = responsePromise ? await responsePromise : null;
    await Promise.allSettled(pendingBg);
    return { responded, response };
  };

  // Must ignore GitHub API and sibling sub-apps and non-GET requests
  assert.equal((await dispatchSwFetch('https://api.github.com/users/krunked-fpv/repos')).responded, false);
  assert.equal((await dispatchSwFetch('https://krunked-fpv.github.io/dojo/')).responded, false);
  assert.equal((await dispatchSwFetch('https://krunked-fpv.github.io/dojo/assets/app.js')).responded, false);
  assert.equal((await dispatchSwFetch('https://krunked-fpv.github.io/index.html', 'POST')).responded, false);

  // Must intercept & cache own ./index.html and ./data/foundry-snapshot.json
  const idxRes = await dispatchSwFetch('https://krunked-fpv.github.io/index.html');
  assert.equal(idxRes.responded, true);
  assert.equal(idxRes.response.status, 200);

  const snapRes = await dispatchSwFetch('https://krunked-fpv.github.io/data/foundry-snapshot.json');
  assert.equal(snapRes.responded, true);
  assert.equal(snapRes.response.status, 200);

  // Verify subpath portability when mounted under /krunked-deck/
  sandbox.self.registration.scope = 'https://krunked-fpv.github.io/krunked-deck/';
  assert.equal((await dispatchSwFetch('https://krunked-fpv.github.io/dojo/')).responded, false);
  assert.equal((await dispatchSwFetch('https://krunked-fpv.github.io/krunked-deck/index.html')).responded, true);
  assert.equal((await dispatchSwFetch('https://krunked-fpv.github.io/krunked-deck/data/foundry-snapshot.json')).responded, true);
});

// ============================================================================
// 3. ADVERSARIAL SUBSYSTEM UNIT & INTEGRATION CHECKS
// ============================================================================

const QR_VERSION_SPEC = [
  null,
  [26, [7, 10, 13, 17], [1, 1, 1, 1]],
  [44, [10, 16, 22, 28], [1, 1, 1, 1]],
  [70, [15, 26, 18, 22], [1, 1, 2, 2]],
  [100, [20, 18, 26, 16], [1, 2, 2, 4]],
  [134, [26, 24, 18, 22], [1, 2, 4, 4]],
  [172, [18, 16, 24, 28], [2, 4, 4, 4]],
  [196, [20, 18, 18, 26], [2, 4, 6, 5]],
  [242, [24, 22, 22, 26], [2, 4, 6, 6]],
  [292, [30, 22, 20, 24], [2, 5, 8, 8]],
  [346, [18, 26, 24, 28], [4, 5, 8, 8]],
];
const QR_EC_IDX = { L: 0, M: 1, Q: 2, H: 3 };
const QR_EC_FMT_BITS = { M: 0, L: 1, H: 2, Q: 3 };
const QR_MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function computeRsSyndrome(codeword, ecCount) {
  const syndromes = [];
  for (let i = 0; i < ecCount; i += 1) {
    const root = GF_EXP[i];
    let sum = 0;
    for (let j = 0; j < codeword.length; j += 1) {
      sum = gfMul(sum, root) ^ codeword[j];
    }
    syndromes.push(sum);
  }
  return syndromes;
}

function bchFormatSyndrome(bits15) {
  let rem = bits15;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((rem >>> bit) & 1) {
      rem ^= 0x537 << (bit - 10);
    }
  }
  return rem;
}

function qrAlignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  const step = Math.ceil((last - 6) / (count * 2 - 2)) * 2;
  const pos = [6];
  for (let p = last; pos.length < count; p -= step) {
    pos.splice(1, 0, p);
  }
  return pos;
}

function verifyIso18004Qr(text) {
  const { version, size, ecLevel, modules } = encodeQrMatrix(text, { ecLevel: 'M' });
  assert.equal(size, 17 + 4 * version);
  assert.equal(modules.length, size);

  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [top, left] of corners) {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        assert.equal(modules[r][c], dist <= 1 || dist === 3 ? 1 : 0);
      }
    }
  }

  for (let i = 8; i <= size - 9; i += 1) {
    const exp = i % 2 === 0 ? 1 : 0;
    assert.equal(modules[6][i], exp);
    assert.equal(modules[i][6], exp);
  }

  assert.equal(modules[4 * version + 9][8], 1);

  let fmt1 = 0;
  for (let i = 0; i <= 5; i += 1) fmt1 |= modules[i][8] << i;
  fmt1 |= (modules[7][8] << 6) | (modules[8][8] << 7) | (modules[8][7] << 8);
  for (let i = 9; i < 15; i += 1) fmt1 |= modules[8][14 - i] << i;

  let fmt2 = 0;
  for (let i = 0; i < 8; i += 1) fmt2 |= modules[8][size - 1 - i] << i;
  for (let i = 8; i < 15; i += 1) fmt2 |= modules[size - 15 + i][8] << i;

  const unmasked1 = fmt1 ^ 0x5412;
  const unmasked2 = fmt2 ^ 0x5412;
  assert.equal(unmasked1, unmasked2);
  assert.equal(bchFormatSyndrome(unmasked1), 0);

  const ecBits = (unmasked1 >>> 13) & 0x3;
  const maskId = (unmasked1 >>> 10) & 0x7;
  assert.equal(ecBits, QR_EC_FMT_BITS[ecLevel]);

  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
  for (let i = 0; i < size; i += 1) {
    isFunc[6][i] = 1;
    isFunc[i][6] = 1;
  }
  for (const [top, left] of corners) {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r >= 0 && r < size && c >= 0 && c < size) isFunc[r][c] = 1;
      }
    }
  }
  const alignPos = qrAlignmentPositions(version);
  for (let i = 0; i < alignPos.length; i += 1) {
    for (let j = 0; j < alignPos.length; j += 1) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === alignPos.length - 1) ||
        (i === alignPos.length - 1 && j === 0)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          assert.equal(modules[alignPos[i] + dr][alignPos[j] + dc], dist === 0 || dist === 2 ? 1 : 0);
          isFunc[alignPos[i] + dr][alignPos[j] + dc] = 1;
        }
      }
    }
  }
  for (let i = 0; i <= 8; i += 1) {
    isFunc[8][i] = 1;
    isFunc[i][8] = 1;
  }
  for (let i = size - 8; i < size; i += 1) {
    isFunc[8][i] = 1;
    isFunc[i][8] = 1;
  }
  if (version >= 7) {
    let ver1 = 0;
    let ver2 = 0;
    for (let i = 0; i < 18; i += 1) {
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      isFunc[a][b] = 1;
      isFunc[b][a] = 1;
      ver1 |= modules[a][b] << i;
      ver2 |= modules[b][a] << i;
    }
    assert.equal(ver1, ver2);
    assert.equal(ver1 >>> 12, version);
  }

  const pred = QR_MASKS[maskId];
  const bits = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const r = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        if (!isFunc[r][c]) {
          bits.push(modules[r][c] ^ (pred(r, c) ? 1 : 0));
        }
      }
    }
    upward = !upward;
  }

  const [totalCw, ecList, blockList] = QR_VERSION_SPEC[version];
  const codewords = new Uint8Array(totalCw);
  for (let i = 0; i < totalCw; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i * 8 + b];
    codewords[i] = byte;
  }

  const idx = QR_EC_IDX[ecLevel];
  const ecLen = ecList[idx];
  const numBlocks = blockList[idx];
  const totalData = totalCw - ecLen * numBlocks;
  const shortLen = Math.floor(totalData / numBlocks);
  const numShort = numBlocks - (totalData % numBlocks);

  const dataBlocks = Array.from(
    { length: numBlocks },
    (_, b) => new Uint8Array(shortLen + (b < numShort ? 0 : 1))
  );
  const ecBlocks = Array.from({ length: numBlocks }, () => new Uint8Array(ecLen));
  let pos = 0;
  const maxLen = shortLen + (numShort < numBlocks ? 1 : 0);
  for (let i = 0; i < maxLen; i += 1) {
    for (let b = 0; b < numBlocks; b += 1) {
      if (i < dataBlocks[b].length) dataBlocks[b][i] = codewords[pos++];
    }
  }
  for (let i = 0; i < ecLen; i += 1) {
    for (let b = 0; b < numBlocks; b += 1) {
      ecBlocks[b][i] = codewords[pos++];
    }
  }

  for (let b = 0; b < numBlocks; b += 1) {
    const fullBlock = new Uint8Array(dataBlocks[b].length + ecLen);
    fullBlock.set(dataBlocks[b], 0);
    fullBlock.set(ecBlocks[b], dataBlocks[b].length);
    const syn = computeRsSyndrome(fullBlock, ecLen);
    assert.ok(syn.every((s) => s === 0), `Reed-Solomon syndrome non-zero in block ${b}`);
  }

  const stream = new Uint8Array(totalData);
  let sp = 0;
  for (const blk of dataBlocks) {
    stream.set(blk, sp);
    sp += blk.length;
  }
  assert.equal(stream[0] >>> 4, 4);
  let bitOffset = 4;
  const readBits = (n) => {
    let v = 0;
    for (let k = 0; k < n; k += 1) {
      const bi = bitOffset++;
      v = (v << 1) | ((stream[bi >>> 3] >>> (7 - (bi & 7))) & 1);
    }
    return v;
  };
  const byteLen = readBits(version <= 9 ? 8 : 16);
  const decoded = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i += 1) decoded[i] = readBits(8);
  assert.equal(new TextDecoder().decode(decoded), text);
}

await runCheck('3.1 QR ISO/IEC 18004 matrices, BCH format bits, GF(256) RS syndrome = 0 & SVG', async () => {
  const urls = [
    'https://krunked-fpv.github.io/',
    'https://krunked-fpv.github.io/krunked_skymap/',
    `https://krunked-fpv.github.io/${'a'.repeat(90)}`,
  ];
  assert.equal(urls[2].length, 120);

  for (const url of urls) {
    verifyIso18004Qr(url);
    const svg = renderQrSvgString(url, { size: 220, ecLevel: 'M' });
    assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'));
    assert.ok(svg.includes('viewBox="0 0 ') && svg.includes('<path d="M'));
  }
});

await runCheck('3.2 Swiss emblems FNV-1a determinism/uniqueness & 30d sparkline SVG', async () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  assert.equal(fnv1a32('krunked_skymap'), fnv1a32('krunked_skymap'));

  const slugs = ['dojo', 'krunked_skymap', 'chaosdeck-sre', 'discogs_sniper', 'maul-forge'];
  const svgs = slugs.map((slug) => {
    const s1 = renderSwissEmblemSvg(slug);
    const s2 = renderSwissEmblemSvg(slug);
    assert.equal(s1, s2, `Swiss emblem must be deterministic for ${slug}`);
    assert.ok(s1.startsWith('<svg ') && s1.endsWith('</svg>'));
    return s1;
  });
  assert.equal(new Set(svgs).size, slugs.length, 'Swiss emblems must be distinct across slugs');

  const counts = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? i : 0));
  const spark = renderSparklineSvg(counts, { width: 180, height: 32 });
  assert.ok(spark.startsWith('<svg ') && spark.endsWith('</svg>'));
  assert.ok(spark.includes('data-commits-30d='));
  assert.equal((spark.match(/<rect\b/g) || []).length, 30);

  const zeroSpark = renderSparklineSvg(new Array(30).fill(0));
  assert.ok(zeroSpark.includes('data-commits-30d="0"'));
});

await runCheck('3.3 PAT origin firewall & Config IO PAT stripping / URL rejection', async () => {
  const prevStorage = globalThis.localStorage;
  const prevIdb = globalThis.indexedDB;
  const prevDoc = globalThis.document;
  const memStorage = createMemoryStorage();
  const memIdb = createMemoryIdbFactory();
  const cookieDoc = createMockCookieJarDocument();
  globalThis.localStorage = memStorage;
  globalThis.indexedDB = memIdb;
  globalThis.document = cookieDoc;

  try {
    const validApiUrl = 'https://api.github.com/users/krunked-fpv/repos';
    const parsed = assertGitHubApiOrigin(validApiUrl);
    assert.equal(parsed.origin, 'https://api.github.com');

    for (const evilUrl of [
      'http://api.github.com/users/krunked-fpv/repos',
      'https://evil-github.com/users/krunked-fpv/repos',
      'https://krunked-fpv.github.io/',
      'https://api.github.com.attacker.tld/repos',
      'https://user:pass@api.github.com/users/krunked-fpv/repos',
      'https://api.github.com:8443/users/krunked-fpv/repos',
    ]) {
      assert.throws(() => assertGitHubApiOrigin(evilUrl), `Expected throw for ${evilUrl}`);
      assert.deepEqual(getAuthHeadersForUrl(evilUrl, 'ghp_secretToken9999'), {});
    }

    const fakePat = 'ghp_TestTokenValue123456';
    const saveRes = await savePat(fakePat);
    assert.equal(saveRes.saved, true);
    assert.ok(!saveRes.maskedHint.includes('TestTokenValue'));
    assert.equal(memStorage.getItem(PAT_STORAGE_KEY), fakePat);
    assert.equal(cookieDoc.cookie, '', 'PAT must NEVER be written to document.cookie');
    assert.equal(getPatStatus().configured, true);
    assert.equal(loadRawPatForInternalSync(), fakePat);

    assert.deepEqual(getAuthHeadersForUrl(validApiUrl), {
      Authorization: `Bearer ${fakePat}`,
    });

    const exported = exportDeckConfigJson({
      theme: 'daylight',
      pat: fakePat,
      token: fakePat,
      pinned: ['dojo'],
      curated: {
        dojo: {
          title: 'Dojo Override',
          liveUrl: 'javascript:alert(1)',
        },
      },
    });
    assert.ok(!exported.includes(fakePat), 'exportDeckConfigJson must strip PATs');
    const exportedObj = JSON.parse(exported);
    assert.equal(exportedObj.schema, 'KrunkedDeckConfigV1');
    assert.equal(exportedObj.state.pat, undefined);
    assert.equal(exportedObj.state.curated.dojo.liveUrl, undefined);

    const imported = parseAndValidateDeckConfigJson(
      JSON.stringify({
        schema: 'KrunkedDeckConfigV1',
        state: {
          v: 1,
          theme: 'daylight',
          pat: fakePat,
          token: fakePat,
          githubToken: fakePat,
          pinned: ['krunked_skymap'],
          curated: {
            skymap: {
              title: 'SkyMap <img src=x onerror=alert(1)>',
              liveUrl: 'javascript:alert(1)',
              category: 'SIMULATORS & FPV',
            },
            dojo: {
              title: 'Dojo',
              liveUrl: 'https://krunked-fpv.github.io/dojo/',
            },
          },
        },
      })
    );
    assert.equal(imported.state.pat, undefined);
    assert.equal(imported.state.token, undefined);
    assert.equal(imported.state.githubToken, undefined);
    assert.equal(imported.state.curated.skymap.liveUrl, undefined);
    assert.equal(imported.state.curated.dojo.liveUrl, 'https://krunked-fpv.github.io/dojo/');
    assert.throws(() => parseAndValidateDeckConfigJson('{not-json'));
    assert.throws(() => parseAndValidateDeckConfigJson(JSON.stringify({ schema: 'Wrong', state: {} })));

    await wipePat();
    assert.equal(getPatStatus().configured, false);
    assert.equal(loadRawPatForInternalSync(), null);
  } finally {
    globalThis.localStorage = prevStorage;
    globalThis.indexedDB = prevIdb;
    globalThis.document = prevDoc;
  }
});

await runCheck('3.4 XSS neutralization, HTML entity decoding, emoji stripping & 404 probe rejection', async () => {
  const xssInput = '<img src=x onerror=alert(1)> Telemetry &amp; Ops &middot; &#x21B5; \u{1F680}\u{1F525} \u2318K \u21B5';
  const cleaned = stripEmojisAndDecodeHtml(xssInput);
  assert.ok(!cleaned.includes('<img'), 'HTML img tag must be stripped');
  assert.ok(!cleaned.includes('onerror='), 'Event handler text must be stripped');
  assert.ok(cleaned.includes('&') && cleaned.includes('\u00B7'), 'Entities &amp; and &middot; must decode');
  assert.ok(cleaned.includes('\u2318K') && cleaned.includes('\u21B5'), 'Command and Return glyphs must survive');
  assert.equal(/\p{Extended_Pictographic}/u.test(cleaned), false);

  assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeHttpUrl('vbscript:msgbox(1)'), null);
  assert.equal(sanitizeHttpUrl('https://krunked-fpv.github.io/dojo/'), 'https://krunked-fpv.github.io/dojo/');

  assert.equal(humanizeSlug('chaosdeck-sre_fpv-qr'), 'Chaosdeck SRE FPV QR');
  assert.equal(
    classifyRepo({ slug: 'krunked-fpv.github.io' }).category,
    'SRE & TELEMETRY'
  );
  assert.ok(
    CATEGORY_TAGS.includes(classifyRepo({ slug: 'discogs_sniper', description: 'Vinyl crate sniper' }).category)
  );

  const evilHtml = `
    <!doctype html><html><head>
      <title><img src=x onerror=alert(1)> Orbital &amp; Telemetry &middot; \u{1F6F0}\uFE0F</title>
      <meta name="description" content="<script>alert(1)</script>Live &amp; Ready \u{1F525}">
      <meta property="og:image" content="javascript:alert(1)">
      <link rel="icon" href="data:text/html,<script>alert(1)</script>">
      <link rel="manifest" href="./manifest.json">
    </head><body></body></html>`;
  const parsedEvil = parseSubAppHtml(evilHtml, 'https://krunked-fpv.github.io/orbiter/');
  assert.equal(parsedEvil.isNotFound, false);
  assert.ok(!parsedEvil.title.includes('<img') && parsedEvil.title.includes('&') && parsedEvil.title.includes('\u00B7'));
  assert.equal(parsedEvil.description, 'Live & Ready');
  assert.equal(parsedEvil.ogImageUrl, null);
  assert.equal(parsedEvil.iconUrl, null);
  assert.equal(parsedEvil.manifestUrl, 'https://krunked-fpv.github.io/orbiter/manifest.json');

  const notFoundHtml = '<title>Site not found &middot; GitHub Pages</title><p>There isn\'t a GitHub Pages site here.</p>';
  assert.equal(parseSubAppHtml(notFoundHtml, 'https://krunked-fpv.github.io/maul-forge/').isNotFound, true);

  const probe404 = await probeLiveSubApp('maul-forge', 'https://krunked-fpv.github.io/maul-forge/', {
    fetchFn: async () => ({ ok: false, status: 404, text: async () => 'Not Found' }),
  });
  assert.equal(probe404.liveVerified, false);

  const probeSoft404 = await probeLiveSubApp('maul-forge', 'https://krunked-fpv.github.io/maul-forge/', {
    fetchFn: async () => ({ ok: true, status: 200, url: 'https://krunked-fpv.github.io/maul-forge/', text: async () => notFoundHtml }),
  });
  assert.equal(probeSoft404.liveVerified, false);

  const probeLiveXss = await probeLiveSubApp('orbiter', 'https://krunked-fpv.github.io/orbiter/', {
    fetchFn: async (url) => {
      if (url.endsWith('manifest.json')) {
        return {
          ok: true,
          status: 200,
          url,
          json: async () => ({
            name: '<img src=x onerror=alert(1)> Orbiter &amp; Telemetry \u{1F680}',
            short_name: 'Orbiter \u{1F525}',
            description: '<script>alert(1)</script>Orbit &middot; Ready',
            icons: [{ src: 'javascript:alert(1)', sizes: '192x192' }],
          }),
        };
      }
      return { ok: true, status: 200, url, text: async () => evilHtml };
    },
  });
  assert.equal(probeLiveXss.liveVerified, true);
  assert.ok(!probeLiveXss.manifest.name.includes('<img') && !probeLiveXss.manifest.name.includes('<script'));
  assert.equal(probeLiveXss.manifest.shortName, 'Orbiter');
  assert.equal(probeLiveXss.manifest.iconUrl, null);
  assert.equal(/\p{Extended_Pictographic}/u.test(probeLiveXss.manifest.name), false);
});

await runCheck('3.5 Triple-store auto-healing (<3800B ceiling under 40 curations, A+B wipe -> C heal, C wipe -> regen)', async () => {
  const storage = createMemoryStorage();
  const idb = createMemoryIdbFactory();
  const cookieDoc = createMockCookieJarDocument();
  let clock = 1795492900000;

  const vaultHeavy = createCookieVault({
    localStorage: storage,
    indexedDB: idb,
    document: cookieDoc,
    now: () => ++clock,
  });
  await vaultHeavy.init();
  await vaultHeavy.setPreference('theme', 'daylight');
  await vaultHeavy.togglePin('dojo');
  await vaultHeavy.toggleHide('maul-forge');
  for (let i = 0; i < 40; i += 1) {
    await vaultHeavy.setCuration(`module-${i}`, {
      title: `Module ${i} Override`,
      description: `Detailed curated telemetry summary for module-${i} `.repeat(4).slice(0, 195),
      liveUrl: `https://krunked-fpv.github.io/module-${i}/`,
      category: 'SRE & TELEMETRY',
      accentHex: '#FF4F00',
    });
  }

  const heavyState = vaultHeavy.getState();
  const wire = encodeShadowCookiePayload(heavyState);
  assert.ok(Buffer.byteLength(wire, 'utf8') < COOKIE_MAX_BYTES, 'Raw wire exceeded 3800B');
  assert.ok(Buffer.byteLength(encodeURIComponent(wire), 'utf8') < COOKIE_MAX_BYTES, 'Encoded wire exceeded 3800B');
  assert.ok(vaultHeavy.getDiagnostics().cookieBytes < COOKIE_MAX_BYTES);
  const decodedHeavy = decodeShadowCookiePayload(wire);
  assert.equal(decodedHeavy.theme, 'daylight');
  assert.deepEqual(decodedHeavy.pinned, ['dojo']);
  assert.deepEqual(decodedHeavy.hidden, ['maul-forge']);

  // Bidirectional healing verification with realistic curations fitting cleanly inside 3800B
  const storage2 = createMemoryStorage();
  const idb2 = createMemoryIdbFactory();
  const cookieDoc2 = createMockCookieJarDocument();
  let clock2 = 1795493000000;

  const vPrimary = createCookieVault({
    localStorage: storage2,
    indexedDB: idb2,
    document: cookieDoc2,
    now: () => ++clock2,
  });
  await vPrimary.init();
  await vPrimary.setPreference('theme', 'daylight');
  await vPrimary.setPreference('view', 'split');
  await vPrimary.togglePin('krunked_skymap');
  await vPrimary.toggleHide('maul-forge');
  await vPrimary.setCuration('dojo', {
    title: 'Dojo Command',
    description: 'Family reward & chore hub',
    category: 'FAMILY & EDU',
    accentHex: '#10B981',
  });
  const goldenState = vPrimary.getState();

  // Wipe Store A (localStorage) + Store B (IndexedDB) completely
  storage2.clear();
  idb2.wipeDatabase('krunked_vault_v1');

  const vHealed = createCookieVault({
    localStorage: storage2,
    indexedDB: idb2,
    document: cookieDoc2,
    now: () => ++clock2,
  });
  await vHealed.init();
  const diagAfterABWipe = vHealed.getDiagnostics();
  assert.equal(diagAfterABWipe.lastHealedFrom, 'cookie');
  assert.ok(diagAfterABWipe.lastRepairedStores.includes('localStorage'));
  assert.ok(diagAfterABWipe.lastRepairedStores.includes('indexedDB'));
  assert.deepEqual(vHealed.getState(), goldenState, 'Must heal 100% from shadow cookie');
  assert.ok(storage2.getItem(VAULT_KEY), 'Store A must be written back');

  // Wipe Store C (document.cookie) and assert immediate shadow cookie regeneration
  cookieDoc2.clearCookies();
  assert.equal(cookieDoc2.cookie, '');
  const recAfterCWipe = await vHealed.reconcile();
  assert.ok(recAfterCWipe.repairedStores.includes('cookie'));
  assert.ok(cookieDoc2.cookie.includes(`${VAULT_KEY}=`));
  const cookieVal = cookieDoc2.cookie.split(`${VAULT_KEY}=`)[1].split(';')[0];
  assert.deepEqual(decodeShadowCookiePayload(cookieVal), goldenState);
});

await runCheck('3.6 Tier-2 Sync Engine (<50ms boot, If-None-Match 304, 200 PushEvent merge, 403 graceful fallback)', async () => {
  const prevIdb = globalThis.indexedDB;
  const mockIdb = createMemoryIdbFactory();
  globalThis.indexedDB = mockIdb;

  try {
    const bakedSnapshot = JSON.parse(await fs.readFile(repoPath('data', 'foundry-snapshot.json'), 'utf8'));
    await writeCachedSnapshot(bakedSnapshot);
    assert.ok(await readCachedSnapshot(), 'Telemetry IDB cache should warm');

    const recordedCalls = [];
    let repoAttempt = 0;
    let eventAttempt = 0;

    const mockFetch = async (url, init = {}) => {
      recordedCalls.push({ url, headers: init.headers || {} });
      if (url === './data/foundry-snapshot.json') {
        await new Promise((r) => setTimeout(r, 80));
        return { ok: true, status: 200, json: async () => bakedSnapshot };
      }
      if (url.includes('/repos?')) {
        repoAttempt += 1;
        if (repoAttempt === 1) {
          return {
            ok: true,
            status: 200,
            headers: new Map([
              ['etag', '"repos-etag-v1"'],
              ['x-ratelimit-limit', '60'],
              ['x-ratelimit-remaining', '58'],
              ['x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 1800)],
            ]),
            json: async () => [
              {
                name: 'dojo',
                owner: { login: 'krunked-fpv' },
                has_pages: true,
                html_url: 'https://github.com/krunked-fpv/dojo',
                pushed_at: '2026-11-24T04:30:00Z',
              },
            ],
          };
        }
        if (repoAttempt === 2) {
          return {
            ok: false,
            status: 304,
            headers: new Map([
              ['etag', '"repos-etag-v1"'],
              ['x-ratelimit-remaining', '58'],
            ]),
          };
        }
        return {
          ok: false,
          status: 403,
          headers: new Map([
            ['x-ratelimit-limit', '60'],
            ['x-ratelimit-remaining', '0'],
            ['x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 900)],
          ]),
        };
      }
      if (url.includes('/events/public')) {
        eventAttempt += 1;
        if (eventAttempt === 1) {
          return {
            ok: true,
            status: 200,
            headers: new Map([
              ['etag', '"events-etag-v1"'],
              ['x-ratelimit-remaining', '57'],
            ]),
            json: async () => [
              {
                type: 'PushEvent',
                repo: { name: 'krunked-fpv/dojo' },
                actor: { login: 'krunked-fpv' },
                created_at: new Date().toISOString(),
                payload: {
                  commits: [
                    {
                      sha: 'cafebabe1234567890abcdef1234567890abcdef',
                      message: 'Injected delta telemetry check',
                      author: { name: 'krunked-fpv' },
                    },
                  ],
                },
              },
            ],
          };
        }
        if (eventAttempt === 2) {
          return {
            ok: false,
            status: 304,
            headers: new Map([
              ['etag', '"events-etag-v1"'],
              ['x-ratelimit-remaining', '57'],
            ]),
          };
        }
        return {
          ok: false,
          status: 403,
          headers: new Map([['x-ratelimit-remaining', '0']]),
        };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    };

    const engine = createSyncEngine({ fetchFn: mockFetch, pollIntervalMs: 600_000 });
    const t0 = performance.now();
    const booted = await engine.boot();
    const bootMs = performance.now() - t0;
    assert.ok(bootMs < 50, `Cold-boot hydration with warm IDB took ${bootMs.toFixed(1)}ms (expected <50ms)`);
    assert.ok(booted.repos.length >= 16);

    // 200 OK delta merge + PushEvent splicing
    const sync200 = await engine.syncNow({ manual: true });
    assert.equal(sync200.status.mode, 'LIVE FETCH // 200');
    const dojo = sync200.snapshot.repos.find((r) => r.slug === 'dojo');
    assert.equal(dojo.recentCommits[0].sha, 'cafebabe1234567890abcdef1234567890abcdef');

    // 304 Not Modified conditional ETag check
    const sync304 = await engine.syncNow({ manual: true });
    assert.equal(sync304.status.mode, 'LIVE DELTA // ETAG 304');
    const secondRepoReq = recordedCalls.filter((c) => c.url.includes('/repos?'))[1];
    assert.equal(secondRepoReq.headers['If-None-Match'], '"repos-etag-v1"');

    // 403 Rate Limit graceful fallback without throwing
    const sync403 = await engine.syncNow({ manual: true });
    assert.equal(sync403.status.mode, 'SNAPSHOT CACHE');
    assert.equal(sync403.status.rateLimit.remaining, 0);

    // Private unlock + PAT header routing check
    engine.setOptions({
      getUnlockPrivate: () => true,
      getAuthHeaders: (u) => getAuthHeadersForUrl(u, 'ghp_PrivateSyncToken9876'),
    });
    await engine.syncNow({ manual: true });
    const privateCall = recordedCalls.find((c) => c.url.includes('/user/repos?visibility=all'));
    assert.ok(privateCall, 'Must query /user/repos?visibility=all when unlockPrivate and PAT active');
    assert.equal(privateCall.headers.Authorization, 'Bearer ghp_PrivateSyncToken9876');

    engine.destroy();
    await new Promise((r) => setTimeout(r, 95));
    await clearTelemetryCache();
  } finally {
    globalThis.indexedDB = prevIdb;
  }
});

await runCheck('3.7 Micro-Foley default muted, Node-safe execution, gain limiter & dispose()', async () => {
  assert.equal(foley.isMuted(), true);
  foley.tick();
  foley.click();
  foley.latch();
  foley.relay();

  const createdNodes = [];
  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0.05;
      this.destination = { kind: 'destination' };
    }
    createGain() {
      const node = {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} },
        connect() {},
        disconnect() {},
      };
      createdNodes.push(node);
      return node;
    }
    createDynamicsCompressor() {
      return {
        threshold: {},
        knee: {},
        ratio: {},
        attack: {},
        release: {},
        connect() {},
        disconnect() {},
      };
    }
    createBuffer(ch, len) {
      return { duration: len / this.sampleRate, getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      return { buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} };
    }
    createBiquadFilter() {
      return { type: '', frequency: {}, Q: {}, connect() {}, disconnect() {} };
    }
    createOscillator() {
      return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} };
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {
      this.state = 'closed';
    }
  }

  const localFoley = createMicroFoley({ AudioContext: MockAudioContext });
  assert.equal(localFoley.isMuted(), true);
  localFoley.tick();
  assert.equal(createdNodes.length, 0, 'Muted foley must never create AudioContext');

  localFoley.setMuted(false);
  assert.equal(localFoley.isMuted(), false);
  localFoley.tick();
  localFoley.click();
  localFoley.latch();
  localFoley.relay();
  assert.ok(createdNodes.length > 0);
  localFoley.dispose();
  assert.equal(localFoley.isMuted(), true);
});

await runCheck('3.8 FoundrySnapshotV1 schema, Hero Forge & Split View recursive self-iframe guard', async () => {
  const snapshot = JSON.parse(await fs.readFile(repoPath('data', 'foundry-snapshot.json'), 'utf8'));
  assert.equal(snapshot.schemaVersion, 'FoundrySnapshotV1');
  assert.equal(snapshot.owner, 'krunked-fpv');
  assert.equal(snapshot.chronoPulse90d.length, 90);
  assert.equal(snapshot.chronoPulse90d[89].date, snapshot.generatedAt.slice(0, 10));
  for (let i = 1; i < snapshot.chronoPulse90d.length; i += 1) {
    assert.ok(snapshot.chronoPulse90d[i].date > snapshot.chronoPulse90d[i - 1].date);
  }
  assert.equal(snapshot.totals.totalRepos, snapshot.repos.length);
  assert.equal(snapshot.totals.liveApps, snapshot.repos.filter((r) => r.isLiveApp).length);

  const maul = snapshot.repos.find((r) => r.slug === 'maul-forge');
  assert.ok(maul);
  assert.equal(maul.isLiveApp, false);
  assert.equal(maul.liveVerified, false);
  assert.equal(maul.surfaceType, 'CLI_REPO');
  assert.equal(maul.liveUrl, null);

  const selfRepo = snapshot.repos.find((r) => r.slug.toLowerCase() === 'krunked-fpv.github.io');
  assert.ok(selfRepo);
  assert.equal(selfRepo.isSelfDeck, true);
  assert.equal(selfRepo.isLiveApp, true);
  assert.equal(selfRepo.liveVerified, true);
  assert.equal(selfRepo.surfaceType, 'WEB_APP');
  assert.equal(selfRepo.liveUrl, 'https://krunked-fpv.github.io/');
  assert.equal(selfRepo.category, 'SRE & TELEMETRY');
  assert.equal(selfRepo.title, 'KRUNKED // DECK');

  for (const r of snapshot.repos) {
    assert.ok(CATEGORY_TAGS.includes(r.category), `Invalid category ${r.category} on ${r.slug}`);
    assert.equal(r.commits30d.length, 30);
    assert.ok(r.recentCommits.length <= 10);
    assert.equal(r.surfaceType, r.isLiveApp ? 'WEB_APP' : 'CLI_REPO');
  }

  // Self-iframe guard unit assertions
  assert.equal(isSelfHostedPeekTarget(selfRepo, 'https://krunked-fpv.github.io/').blocked, true);
  assert.equal(isSelfHostedPeekTarget({ isSelfDeck: false }, 'https://krunked-fpv.github.io/').blocked, true);
  assert.equal(isSelfHostedPeekTarget({ isSelfDeck: false }, 'https://krunked-fpv.github.io/index.html').blocked, true);
  assert.equal(isSelfHostedPeekTarget({ isSelfDeck: false }, 'https://krunked-fpv.github.io/krunked_skymap/').blocked, false);

  // Full UI integration test in mocked DOM
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const { doc, body } = createMockDom();
  globalThis.document = doc;
  globalThis.window = {
    location: { protocol: 'https:', origin: 'https://krunked-fpv.github.io', pathname: '/' },
    innerWidth: 1280,
    addEventListener() {},
    removeEventListener() {},
    open() {},
  };

  try {
    const el = (tag, attrs = {}, children = []) => {
      const node = doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'hidden' || k === 'disabled') {
          if (v) node[k] = true;
          continue;
        }
        node.setAttribute(k, v === true ? '' : String(v));
      }
      for (const child of Array.isArray(children) ? children : [children]) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child);
      }
      return node;
    };

    const utils = {
      el,
      svgIcon: () => doc.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      formatStopwatch: () => '00H 01M 00S AGO',
      formatRelativeCompact: () => '1M AGO',
      formatCountdown: () => '10M 00S',
      formatDateShort: (d) => String(d || '').slice(0, 10),
      formatSize: (kb) => `${kb} KB`,
      createThermalBadge: (t) => el('span', { class: 'led-badge' }, [t?.label || 'ONLINE']),
      createRepoIcon: (r) => createSwissEmblemElement(r.slug),
      createLangBar: () => ({
        barEl: el('div', { class: 'lang-bar' }),
        legendEl: el('div', { class: 'lang-legend' }),
        totalBytes: 100,
      }),
      sanitizeHttpUrl,
      CATEGORY_TAGS,
    };

    const actions = {
      foley,
      syncNow: async () => {},
      setView() {},
      toggleTheme() {},
      toggleAudio() {},
      setSort() {},
      setFilter() {},
      setSprintWindow() {},
      launchRepo() {},
      openInspector() {},
      openQrModal() {},
      openSettingsModal() {},
      openCommandPalette() {},
      openInlinePeek() {},
      togglePin: async () => {},
      toggleHide: async () => {},
      setCuration: async () => {},
      resetCuration: async () => {},
      setPreference: async () => {},
      reconcileVault: async () => ({ healedFrom: 'none', repairedStores: [] }),
      savePat: async () => ({ saved: true, maskedHint: 'ghp_...1234' }),
      wipePat: async () => {},
      getPatStatus: () => ({ configured: false, maskedHint: '' }),
      getVaultDiagnostics: () => ({ rev: 1, storeAOk: true, storeBOk: true, storeCOk: true, cookieBytes: 120 }),
      exportConfig() {},
      importConfigFile: async () => {},
      openImportConfigPicker() {},
      triggerInstall: async () => {},
      dismissInstall() {},
      hasBlockingOverlayOpen: () => false,
    };

    const effectiveRepos = snapshot.repos.map((r) => ({
      ...r,
      effectiveTitle: r.title,
      effectiveDescription: r.description,
      effectiveCategory: r.category,
      effectiveLiveUrl: r.liveUrl,
      thermal: getThermalState(r.pushedAt),
      isPinned: false,
      isHidden: false,
    }));
    const selfEff = effectiveRepos.find((r) => r.isSelfDeck);
    const dojoEff = effectiveRepos.find((r) => r.slug === 'dojo');
    const top4Repos = effectiveRepos.filter((r) => r.isLiveApp).slice(0, 4);

    const model = {
      snapshot,
      syncStatus: { mode: 'SNAPSHOT CACHE', badgeTier: 'cached', rateLimit: {} },
      vaultState: { view: 'deck', sort: 'latest', theme: 'obsidian', audioMuted: true, curated: {} },
      activeFilter: 'ALL',
      activeSprintWindow: null,
      canInstall: false,
      isStandalone: false,
      patConfigured: false,
      allRepos: effectiveRepos,
      top4Repos,
      liveAppsPool: effectiveRepos.filter((r) => r.isLiveApp),
      matrixReposPool: effectiveRepos,
      hiddenCount: 0,
    };

    const g1 = mountFilmGrain(body);
    const g2 = mountFilmGrain(body);
    assert.equal(g1, g2, 'mountFilmGrain must be idempotent');

    const chronoHost = doc.createElement('div');
    const cp = mountChronoPulse(chronoHost, { days90: snapshot.chronoPulse90d });
    cp.destroy();

    const heroHost = doc.createElement('section');
    const hero = createHeroForge({ container: heroHost, utils, actions });
    hero.update(model);
    assert.equal(heroHost.querySelectorAll('.rail-slot').length, 4);
    const firstNonSelf = top4Repos.find((r) => !r.isSelfDeck);
    assert.equal(heroHost.querySelector('.hero-forge__title').textContent, firstNonSelf.effectiveTitle);

    hero.openPeekForRepo(selfEff);
    assert.equal(heroHost.querySelectorAll('iframe').length, 0, 'Hero Forge must block self-iframe');
    assert.ok(heroHost.querySelector('.bezel-guard-notice'), 'Hero Forge must render guard blueprint');

    hero.openPeekForRepo(dojoEff);
    const heroFrames = heroHost.querySelectorAll('iframe');
    assert.equal(heroFrames.length, 1);
    assert.equal(heroFrames[0].getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms allow-popups');
    hero.destroy();

    const matrixHost = doc.createElement('section');
    const matrix = createFoundryMatrix({ container: matrixHost, utils, actions });
    matrix.mount();
    matrix.update({ ...model, vaultState: { ...model.vaultState, view: 'split' } });
    matrix.openPeekForRepo(selfEff);
    assert.equal(matrixHost.querySelectorAll('iframe').length, 0, 'Split View must block self-iframe');
    assert.ok(matrixHost.querySelector('.bezel-guard-notice'));
    matrix.openPeekForRepo(dojoEff);
    assert.equal(matrixHost.querySelectorAll('iframe').length, 1);
    matrix.destroy();

    const topHost = doc.createElement('header');
    const topBar = createTopBar({ container: topHost, utils, actions });
    topBar.update(model);
    topBar.destroy();

    const bentoHost = doc.createElement('section');
    const bento = createBentoDeck({ container: bentoHost, utils, actions });
    bento.mount();
    bento.update(model);
    assert.equal(bentoHost.querySelectorAll('.bento-card').length, snapshot.totals.liveApps);
    bento.destroy();

    const drawer = createInspectorDrawer({ utils, actions });
    drawer.update(model);
    drawer.open('dojo');
    assert.equal(drawer.isOpen(), true);
    drawer.close();
    drawer.destroy();

    const palette = createCommandPalette({ utils, actions });
    palette.update(model);
    palette.open();
    assert.equal(palette.isOpen(), true);
    assert.equal(body.querySelectorAll('.palette-item').length, 11 + snapshot.repos.length);
    palette.close();
    palette.destroy();

    const modals = createModals({ utils, actions });
    modals.update(model);
    modals.openQr(dojoEff);
    assert.ok(body.querySelector('.qr-stage svg'));
    modals.openSettings();
    assert.ok(body.querySelector('#pat-vault-input'));
    modals.close();
    modals.destroy();

    // Direct smoke check on standalone bezel + sparkline + QR DOM mount
    const qrHost = doc.createElement('div');
    mountQrSvg(qrHost, dojoEff.effectiveLiveUrl);
    assert.ok(qrHost.querySelector('svg'));
    const sparkHost = doc.createElement('div');
    mountSparkline(sparkHost, dojoEff.commits30d);
    assert.ok(sparkHost.querySelector('svg'));
    const bezel = createLivePeekBezel({ utils, actions });
    bezel.setRepo(selfEff);
    bezel.openPeek();
    assert.equal(bezel.el.querySelectorAll('iframe').length, 0);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

await runCheck('3.9 Tier-1 snapshot baker offline fallback & bot-commit exclusion (mocked fetch)', async () => {
  assert.equal(
    isAutomatedBakeCommit({
      author: { login: 'github-actions[bot]' },
      commit: { message: 'chore(telemetry): sync foundry snapshot [skip ci]' },
    }),
    true
  );
  assert.equal(
    isAutomatedBakeCommit({
      author: { login: 'krunked-fpv' },
      commit: { message: 'feat: launchpad telemetry' },
    }),
    false
  );

  const baseline = createOfflineBaselineSnapshot({ owner: 'krunked-fpv' });
  assert.equal(baseline.schemaVersion, 'FoundrySnapshotV1');
  assert.equal(baseline.chronoPulse90d.length, 90);
  assert.equal(baseline.repos[0].isSelfDeck, true);

  const offlineRes = await buildSnapshot({
    writeOutput: false,
    fetchImpl: async () => {
      throw new Error('Network disabled in verification suite');
    },
  });
  assert.equal(offlineRes.snapshot.schemaVersion, 'FoundrySnapshotV1');
  assert.equal(offlineRes.snapshot.sourceMode, 'preserved-cache');
  assert.equal(offlineRes.snapshot.chronoPulse90d.length, 90);
});

const failed = results.filter((r) => !r.passed);
console.log(`\nVERIFICATION SUMMARY: ${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
