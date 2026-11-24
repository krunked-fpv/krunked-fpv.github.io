import {
  CATEGORY_TAGS,
  getThermalState,
  sanitizeHttpUrl,
  stripEmojisAndDecodeHtml,
} from './telemetry/classifier.js';
import { createSyncEngine } from './telemetry/sync-engine.js';
import { vault } from './vault/cookie-vault.js';
import {
  getAuthHeadersForUrl,
  getPatStatus,
  loadRawPatForInternalSync,
  savePat,
  wipePat,
} from './vault/pat-vault.js';
import {
  downloadDeckConfig,
  importDeckConfigFromFile,
} from './vault/config-io.js';
import { createSwissEmblemElement } from './graphics/swiss-emblem.js';
import { mountFilmGrain } from './graphics/film-grain.js';
import { foley } from './audio/micro-foley.js';
import { createTopBar } from './ui/top-bar.js';
import { createHeroForge } from './ui/hero-forge.js';
import { createBentoDeck } from './ui/bento-deck.js';
import { createInspectorDrawer } from './ui/inspector-drawer.js';
import { createFoundryMatrix } from './ui/foundry-matrix.js';
import { createCommandPalette } from './ui/command-palette.js';
import { createModals } from './ui/modals.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LANGUAGE_COLORS = Object.freeze({
  JavaScript: '#F59E0B',
  TypeScript: '#38BDF8',
  HTML: '#FF4F00',
  CSS: '#10B981',
  Python: '#A78BFA',
  Shell: '#8590A2',
  PowerShell: '#60A5FA',
  GLSL: '#F472B6',
  Rust: '#FB923C',
  Go: '#22D3EE',
});

const FALLBACK_LANG_PALETTE = [
  '#FF4F00',
  '#10B981',
  '#F59E0B',
  '#38BDF8',
  '#A78BFA',
  '#94A3B8',
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  if (attrs && typeof attrs === 'object') {
    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined || val === null || val === false) continue;
      if (key === 'hidden' || key === 'disabled' || key === 'checked' || key === 'selected') {
        if (val === true || val === '') node[key] = true;
        continue;
      }
      if (key === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option')) {
        node.value = String(val);
        continue;
      }
      node.setAttribute(key, val === true ? '' : String(val));
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function svgIcon(name, size = 14) {
  const svg = svgNode('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'square',
    'stroke-linejoin': 'miter',
    'aria-hidden': 'true',
  });

  if (name === 'brand') {
    svg.append(
      svgNode('rect', { x: 3, y: 3, width: 3.5, height: 18, fill: 'currentColor', stroke: 'none' }),
      svgNode('polygon', { points: '6.5,11 13.5,3 17,3 9.5,12 17,21 13.5,21 6.5,13', fill: 'currentColor', stroke: 'none' }),
      svgNode('rect', { x: 16.5, y: 3, width: 5, height: 5, fill: '#FF4F00', stroke: 'none' }),
      svgNode('rect', { x: 16.5, y: 11, width: 5, height: 2, fill: 'currentColor', stroke: 'none', opacity: '0.6' }),
      svgNode('rect', { x: 16.5, y: 15.5, width: 3.5, height: 2, fill: 'currentColor', stroke: 'none', opacity: '0.85' })
    );
    return svg;
  }

  if (name === 'pin') {
    svg.append(
      svgNode('polygon', { points: '12,3 18,9 14,13 14,16 10,16 10,13 6,9' }),
      svgNode('line', { x1: 12, y1: 16, x2: 12, y2: 21 })
    );
    return svg;
  }

  if (name === 'inspect') {
    svg.append(
      svgNode('line', { x1: 4, y1: 7, x2: 20, y2: 7 }),
      svgNode('line', { x1: 4, y1: 12, x2: 20, y2: 12 }),
      svgNode('line', { x1: 4, y1: 17, x2: 20, y2: 17 }),
      svgNode('rect', { x: 7, y: 5, width: 3, height: 4, fill: 'currentColor' }),
      svgNode('rect', { x: 14, y: 10, width: 3, height: 4, fill: 'currentColor' }),
      svgNode('rect', { x: 9, y: 15, width: 3, height: 4, fill: 'currentColor' })
    );
    return svg;
  }

  if (name === 'qr') {
    svg.append(
      svgNode('rect', { x: 4, y: 4, width: 6, height: 6 }),
      svgNode('rect', { x: 14, y: 4, width: 6, height: 6 }),
      svgNode('rect', { x: 4, y: 14, width: 6, height: 6 }),
      svgNode('rect', { x: 15, y: 15, width: 4, height: 4, fill: 'currentColor' })
    );
    return svg;
  }

  if (name === 'source') {
    svg.append(
      svgNode('polyline', { points: '9,7 4,12 9,17' }),
      svgNode('polyline', { points: '15,7 20,12 15,17' }),
      svgNode('line', { x1: 13.5, y1: 6, x2: 10.5, y2: 18 })
    );
    return svg;
  }

  if (name === 'close') {
    svg.append(
      svgNode('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
      svgNode('line', { x1: 18, y1: 6, x2: 6, y2: 18 })
    );
    return svg;
  }

  svg.append(svgNode('circle', { cx: 12, cy: 12, r: 6 }));
  return svg;
}

function pad2(num) {
  return String(Math.max(0, Math.floor(num))).padStart(2, '0');
}

function formatStopwatch(isoString, nowMs = Date.now()) {
  const ts = Date.parse(isoString || '');
  if (!Number.isFinite(ts)) return '--';
  const totalSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) {
    return `${days}D ${pad2(hours)}H ${pad2(mins)}M ${pad2(secs)}S AGO`;
  }
  return `${pad2(hours)}H ${pad2(mins)}M ${pad2(secs)}S AGO`;
}

function formatRelativeCompact(isoString, nowMs = Date.now()) {
  const ts = Date.parse(isoString || '');
  if (!Number.isFinite(ts)) return '--';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return `${diffSec}S AGO`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}M AGO`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}H AGO`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}D AGO`;
}

function formatCountdown(isoString, nowMs = Date.now()) {
  const ts = Date.parse(isoString || '');
  if (!Number.isFinite(ts)) return '--';
  const remSec = Math.max(0, Math.ceil((ts - nowMs) / 1000));
  if (remSec === 0) return 'READY';
  const mins = Math.floor(remSec / 60);
  const secs = remSec % 60;
  return `${pad2(mins)}M ${pad2(secs)}S`;
}

function formatDateShort(isoString) {
  const ts = Date.parse(isoString || '');
  if (!Number.isFinite(ts)) return '--';
  return new Date(ts).toISOString().slice(0, 10);
}

function formatSize(sizeKb) {
  const kb = Number(sizeKb);
  if (!Number.isFinite(kb) || kb <= 0) return '0 KB';
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function createThermalBadge(thermal) {
  const tier = thermal?.tier || 'online';
  const label = thermal?.label || 'ONLINE';
  const cls =
    tier === 'hot'
      ? 'led-badge led-badge--hot'
      : tier === 'active'
        ? 'led-badge led-badge--active'
        : 'led-badge led-badge--online';
  return el('span', { class: cls }, [
    el('span', { class: 'led-dot', 'aria-hidden': 'true' }),
    label,
  ]);
}

function createRepoIcon(repo, size = 36) {
  const safeIcon = sanitizeHttpUrl(repo?.manifest?.iconUrl);
  if (!safeIcon) {
    return (
      createSwissEmblemElement(repo?.slug || 'krunked', {
        size,
        accentHex: repo?.effectiveAccentHex || undefined,
      }) || document.createElement('span')
    );
  }

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  img.width = size;
  img.height = size;
  img.src = safeIcon;

  img.addEventListener(
    'error',
    () => {
      const emblem = createSwissEmblemElement(repo?.slug || 'krunked', {
        size,
        accentHex: repo?.effectiveAccentHex || undefined,
      });
      if (emblem && img.parentNode) {
        img.replaceWith(emblem);
      }
    },
    { once: true }
  );

  return img;
}

function createLangBar(languages) {
  const entries = Object.entries(languages && typeof languages === 'object' ? languages : {})
    .map(([lang, bytes]) => [lang, Number(bytes) || 0])
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1]);

  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  const barEl = el('div', { class: 'lang-bar', role: 'img', 'aria-label': 'Language composition' });
  const legendEl = el('div', { class: 'lang-legend' });

  if (totalBytes <= 0) {
    return { barEl, legendEl, totalBytes: 0 };
  }

  entries.forEach(([lang, bytes], idx) => {
    const pct = (bytes / totalBytes) * 100;
    const color =
      LANGUAGE_COLORS[lang] || FALLBACK_LANG_PALETTE[idx % FALLBACK_LANG_PALETTE.length];

    const seg = el('div', {
      class: 'lang-bar__seg',
      title: `${lang}: ${pct.toFixed(1)}%`,
    });
    seg.style.width = `${pct.toFixed(2)}%`;
    seg.style.backgroundColor = color;
    barEl.appendChild(seg);

    const pip = el('span', { 'aria-hidden': 'true' });
    pip.style.display = 'inline-block';
    pip.style.width = '8px';
    pip.style.height = '8px';
    pip.style.borderRadius = '2px';
    pip.style.backgroundColor = color;
    pip.style.marginRight = '5px';

    const legendItem = el('span', {}, [pip, `${lang} ${pct.toFixed(1)}%`]);
    legendItem.style.display = 'inline-flex';
    legendItem.style.alignItems = 'center';
    legendEl.appendChild(legendItem);
  });

  return { barEl, legendEl, totalBytes };
}

function applyTheme(theme) {
  const normalized = theme === 'daylight' ? 'daylight' : 'obsidian';
  document.documentElement.dataset.theme = normalized;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', normalized === 'daylight' ? '#ECEAE4' : '#08090B');
  }
}

function buildEffectiveModel(snapshot, syncStatus, vaultState, activeFilter, activeSprintWindow, canInstall, isStandalone) {
  const nowMs = Date.now();
  const pinnedSet = new Set(vaultState.pinned || []);
  const hiddenSet = new Set(vaultState.hidden || []);
  const curatedMap = vaultState.curated || {};
  const unlockPrivate = Boolean(vaultState.unlockPrivate);
  const showHidden = Boolean(vaultState.showHidden);

  const rawRepos = Array.isArray(snapshot?.repos) ? snapshot.repos : [];
  const allUnlocked = [];

  for (const repo of rawRepos) {
    if (repo.isPrivate && !unlockPrivate) continue;
    const curation = curatedMap[repo.slug] || null;
    const curatedUrl = curation?.liveUrl ? sanitizeHttpUrl(curation.liveUrl) : null;
    const baseLiveUrl = sanitizeHttpUrl(repo.liveUrl);
    const effectiveLiveUrl = repo.isSelfDeck
      ? baseLiveUrl || 'https://krunked-fpv.github.io/'
      : curatedUrl || baseLiveUrl;
    const isLiveApp = Boolean(repo.isLiveApp || effectiveLiveUrl);

    allUnlocked.push({
      ...repo,
      isLiveApp,
      isPinned: pinnedSet.has(repo.slug),
      isHidden: hiddenSet.has(repo.slug),
      effectiveTitle: stripEmojisAndDecodeHtml(curation?.title || repo.title || repo.slug),
      effectiveDescription: stripEmojisAndDecodeHtml(
        curation?.description || repo.description || ''
      ),
      effectiveCategory: CATEGORY_TAGS.includes(curation?.category)
        ? curation.category
        : repo.category,
      effectiveAccentHex: curation?.accentHex || null,
      effectiveLiveUrl,
      thermal: getThermalState(repo.pushedAt, nowMs),
    });
  }

  const hiddenCount = allUnlocked.filter((r) => r.isHidden).length;

  const sprintSlugs = activeSprintWindow
    ? new Set((activeSprintWindow.slugs || []).map((s) => String(s).toLowerCase()))
    : null;

  const visibleRepos = allUnlocked.filter((repo) => {
    if (repo.isHidden && !showHidden) return false;
    if (sprintSlugs && !sprintSlugs.has(repo.slug.toLowerCase())) return false;
    return true;
  });

  const liveAppsPool = visibleRepos.filter((r) => r.isLiveApp);
  const top4Repos = allUnlocked
    .filter((r) => r.isLiveApp && !r.isHidden)
    .sort((a, b) => (Date.parse(b.pushedAt || '') || 0) - (Date.parse(a.pushedAt || '') || 0))
    .slice(0, 4);

  return {
    snapshot,
    syncStatus,
    vaultState,
    activeFilter,
    activeSprintWindow,
    canInstall,
    isStandalone,
    patConfigured: getPatStatus().configured,
    allRepos: allUnlocked,
    top4Repos,
    liveAppsPool,
    matrixReposPool: visibleRepos,
    hiddenCount,
  };
}

function setupPointerSheenTracker(deckRoot) {
  if (!deckRoot || typeof window === 'undefined') return () => {};
  let rafId = 0;
  let lastX = 0;
  let lastY = 0;
  let lastTarget = null;
  let activeCard = null;

  function commitFrame() {
    rafId = 0;
    const vw = Math.max(1, window.innerWidth || 1);
    const vh = Math.max(1, window.innerHeight || 1);
    deckRoot.style.setProperty('--cursor-x', `${((lastX / vw) * 100).toFixed(2)}%`);
    deckRoot.style.setProperty('--cursor-y', `${((lastY / vh) * 100).toFixed(2)}%`);

    const hoveredCard = lastTarget?.closest?.('.bento-card, .hero-forge') || null;
    if (activeCard && activeCard !== hoveredCard) {
      activeCard.style.removeProperty('--cursor-x');
      activeCard.style.removeProperty('--cursor-y');
    }
    activeCard = hoveredCard;
    if (activeCard) {
      const rect = activeCard.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        activeCard.style.setProperty('--cursor-x', `${(lastX - rect.left).toFixed(1)}px`);
        activeCard.style.setProperty('--cursor-y', `${(lastY - rect.top).toFixed(1)}px`);
      }
    }
  }

  function onPointerMove(e) {
    lastX = e.clientX;
    lastY = e.clientY;
    lastTarget = e.target;
    if (!rafId) {
      rafId = window.requestAnimationFrame(commitFrame);
    }
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onPointerMove);
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}

function registerServiceWorker() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    typeof window === 'undefined' ||
    (window.location.protocol !== 'http:' && window.location.protocol !== 'https:')
  ) {
    return;
  }
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

async function bootDeck() {
  const deckRoot = document.getElementById('deck-root');
  const topBarEl = document.getElementById('top-bar');
  const heroStageEl = document.getElementById('hero-stage');
  const primaryStageEl = document.getElementById('primary-stage');
  const announcerEl = document.getElementById('live-announcer');

  if (!deckRoot || !topBarEl || !heroStageEl || !primaryStageEl) return;

  mountFilmGrain(deckRoot);
  setupPointerSheenTracker(deckRoot);
  registerServiceWorker();

  let vaultState = await vault.init();
  applyTheme(vaultState.theme);
  foley.setMuted(vaultState.audioMuted);

  let activeFilter = vaultState.category || 'ALL';
  let activeSprintWindow = null;
  let deferredInstallPrompt = null;
  let lastView = vaultState.view || 'deck';

  function isStandaloneMode() {
    if (typeof window === 'undefined') return false;
    const mq = window.matchMedia?.('(display-mode: standalone)');
    return Boolean(mq?.matches || window.navigator?.standalone === true);
  }

  const sync = createSyncEngine({
    snapshotUrl: './data/foundry-snapshot.json',
    owner: 'krunked-fpv',
    getAuthHeaders: (url) => {
      const token = loadRawPatForInternalSync();
      return getAuthHeadersForUrl(url, token);
    },
    getUnlockPrivate: () => vault.getState().unlockPrivate,
  });

  window.__KRUNKED_DECK__ = Object.freeze({
    reconcileVault: () => vault.reconcile(),
    syncNow: (options) => sync.syncNow(options),
  });

  const utils = {
    el,
    svgIcon,
    formatStopwatch,
    formatRelativeCompact,
    formatCountdown,
    formatDateShort,
    formatSize,
    createThermalBadge,
    createRepoIcon,
    createLangBar,
    sanitizeHttpUrl,
    CATEGORY_TAGS,
  };

  let topBar;
  let heroForge;
  let bentoDeck;
  let foundryMatrix;
  let inspectorDrawer;
  let commandPalette;
  let modals;

  function announce(message) {
    if (announcerEl) {
      announcerEl.textContent = message;
    }
  }

  function runViewTransition(callback) {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof document.startViewTransition === 'function' && !prefersReduced) {
      document.startViewTransition(callback);
    } else {
      callback();
    }
  }

  const actions = {
    foley,
    syncNow: (opts) => sync.syncNow(opts),
    setView: (nextView) => {
      const normalized =
        nextView === 'matrix' || nextView === 'split' ? nextView : 'deck';
      if (normalized === vaultState.view) return;
      runViewTransition(() => {
        void vault.setPreference('view', normalized);
      });
    },
    setTheme: (theme) => {
      const normalized = theme === 'daylight' ? 'daylight' : 'obsidian';
      applyTheme(normalized);
      void vault.setPreference('theme', normalized);
    },
    toggleTheme: () => {
      const nextTheme = vaultState.theme === 'daylight' ? 'obsidian' : 'daylight';
      applyTheme(nextTheme);
      void vault.setPreference('theme', nextTheme);
    },
    toggleAudio: () => {
      const nextMuted = !vaultState.audioMuted;
      foley.setMuted(nextMuted);
      if (!nextMuted) {
        foley.latch();
      }
      void vault.setPreference('audioMuted', nextMuted);
    },
    setSort: (sortKey) => {
      void vault.setPreference('sort', sortKey);
    },
    setFilter: (filterId) => {
      activeFilter = filterId;
      if (filterId === 'ALL' || CATEGORY_TAGS.includes(filterId)) {
        void vault.setPreference('category', filterId);
      }
      renderAll();
    },
    setSprintWindow: (winObj) => {
      activeSprintWindow = winObj || null;
      renderAll();
    },
    launchRepo: (repo) => {
      if (!repo) return;
      const targetUrl = sanitizeHttpUrl(repo.effectiveLiveUrl) || sanitizeHttpUrl(repo.htmlUrl);
      if (!targetUrl) return;
      foley.relay();
      announce(`Launching ${repo.effectiveTitle}`);
      if (vaultState.launchTarget === 'same_tab') {
        window.location.assign(targetUrl);
      } else {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    },
    openInspector: (slug, triggerEl) => {
      inspectorDrawer.open(slug, triggerEl);
    },
    openQrModal: (repo, triggerEl) => {
      modals.openQr(repo, triggerEl);
    },
    openSettingsModal: (triggerEl) => {
      modals.openSettings(triggerEl);
    },
    openCommandPalette: (triggerEl) => {
      commandPalette.open(triggerEl);
    },
    openInlinePeek: (repo) => {
      if (!repo) return;
      if (vaultState.view === 'split') {
        foundryMatrix.openPeekForRepo(repo);
        return;
      }
      if (vaultState.view !== 'deck') {
        syncPrimaryStageMount('deck');
        void vault.setPreference('view', 'deck');
      }
      heroForge.openPeekForRepo(repo);
    },
    togglePin: (slug) => vault.togglePin(slug),
    toggleHide: (slug) => vault.toggleHide(slug),
    setCuration: (slug, patch) => vault.setCuration(slug, patch),
    resetCuration: (slug) => vault.resetCuration(slug),
    setPreference: (key, value) => vault.setPreference(key, value),
    reconcileVault: () => vault.reconcile(),
    savePat: async (rawToken) => {
      const res = await savePat(rawToken);
      renderAll();
      if (res.saved && vaultState.unlockPrivate) {
        void sync.syncNow({ manual: true });
      }
      return res;
    },
    wipePat: async () => {
      await wipePat();
      renderAll();
    },
    getPatStatus: () => getPatStatus(),
    getVaultDiagnostics: () => vault.getDiagnostics(),
    exportConfig: () => downloadDeckConfig(vault.getState()),
    importConfigFile: async (file) => {
      const parsed = await importDeckConfigFromFile(file);
      await vault.importState(parsed);
      return parsed;
    },
    openImportConfigPicker: () => {
      modals.openImportConfigPicker();
    },
    triggerInstall: async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch {
        // Ignore cancelled prompt errors
      }
      deferredInstallPrompt = null;
      renderAll();
    },
    dismissInstall: () => {
      void vault.setPreference('installDismissed', true);
    },
    hasBlockingOverlayOpen: () =>
      Boolean(inspectorDrawer?.isOpen() || modals?.isOpen()),
  };

  topBar = createTopBar({ container: topBarEl, utils, actions });
  heroForge = createHeroForge({ container: heroStageEl, utils, actions });
  bentoDeck = createBentoDeck({ container: primaryStageEl, utils, actions });
  foundryMatrix = createFoundryMatrix({ container: primaryStageEl, utils, actions });
  inspectorDrawer = createInspectorDrawer({ utils, actions });
  commandPalette = createCommandPalette({ utils, actions });
  modals = createModals({ utils, actions });

  function syncPrimaryStageMount(view) {
    if (view === 'matrix' || view === 'split') {
      heroStageEl.hidden = true;
      foundryMatrix.mount();
    } else {
      heroStageEl.hidden = false;
      bentoDeck.mount();
    }
  }

  syncPrimaryStageMount(vaultState.view);

  function renderAll() {
    const model = buildEffectiveModel(
      sync.getSnapshot(),
      sync.getStatus(),
      vaultState,
      activeFilter,
      activeSprintWindow,
      Boolean(deferredInstallPrompt),
      isStandaloneMode()
    );

    if (vaultState.view !== lastView) {
      lastView = vaultState.view;
      syncPrimaryStageMount(vaultState.view);
    }

    topBar.update(model);

    if (vaultState.view === 'matrix' || vaultState.view === 'split') {
      foundryMatrix.update(model);
    } else {
      heroForge.update(model);
      bentoDeck.update(model);
    }

    inspectorDrawer.update(model);
    commandPalette.update(model);
    modals.update(model);
  }

  vault.subscribe((nextState) => {
    const prevUnlock = vaultState.unlockPrivate;
    vaultState = nextState;
    applyTheme(vaultState.theme);
    foley.setMuted(vaultState.audioMuted);
    if (
      activeFilter !== 'HOT_7D' &&
      activeFilter !== 'PINNED' &&
      vaultState.category !== activeFilter
    ) {
      activeFilter = vaultState.category;
    }
    renderAll();

    if (!prevUnlock && vaultState.unlockPrivate && getPatStatus().configured) {
      void sync.syncNow({ manual: true });
    }
  });

  sync.addEventListener('update', () => renderAll());
  sync.addEventListener('status', () => renderAll());

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      renderAll();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      renderAll();
    });
    const standaloneMq = window.matchMedia?.('(display-mode: standalone)');
    if (standaloneMq && typeof standaloneMq.addEventListener === 'function') {
      standaloneMq.addEventListener('change', () => renderAll());
    }
  }

  await sync.boot();
  renderAll();
}

if (typeof document !== 'undefined') {
  void bootDeck();
}
