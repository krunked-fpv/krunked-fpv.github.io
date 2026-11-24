import { CATEGORY_TAGS } from '../telemetry/classifier.js';
import { mountSparkline } from '../graphics/sparkline.js';

const SORT_OPTIONS = [
  { value: 'latest', label: 'LATEST SHIPPED' },
  { value: 'velocity', label: 'COMMIT VELOCITY (30D)' },
  { value: 'alpha', label: 'ALPHABETICAL' },
  { value: 'created', label: 'RECENTLY CREATED' },
];

function computeFilterCounts(pool) {
  const counts = {
    ALL: pool.length,
    HOT_7D: 0,
    PINNED: 0,
  };
  for (const tag of CATEGORY_TAGS) {
    counts[tag] = 0;
  }
  for (const repo of pool) {
    if (repo.thermal?.tier === 'hot' || repo.thermal?.tier === 'active') {
      counts.HOT_7D += 1;
    }
    if (repo.isPinned) {
      counts.PINNED += 1;
    }
    if (Object.prototype.hasOwnProperty.call(counts, repo.effectiveCategory)) {
      counts[repo.effectiveCategory] += 1;
    }
  }
  return counts;
}

function sortLiveApps(repos, sortKey) {
  const list = repos.slice();
  list.sort((a, b) => {
    if (sortKey === 'velocity') {
      const diff = (b.commits30dTotal || 0) - (a.commits30dTotal || 0);
      if (diff !== 0) return diff;
      return (Date.parse(b.pushedAt || '') || 0) - (Date.parse(a.pushedAt || '') || 0);
    }
    if (sortKey === 'alpha') {
      return a.effectiveTitle.localeCompare(b.effectiveTitle, 'en', { sensitivity: 'base' });
    }
    if (sortKey === 'created') {
      return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
    }
    // Default 'latest': pinned apps float first, then newest pushedAt
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return (Date.parse(b.pushedAt || '') || 0) - (Date.parse(a.pushedAt || '') || 0);
  });
  return list;
}

function findSpatialNeighbor(cards, currentCard, key) {
  const currentIdx = cards.indexOf(currentCard);
  if (currentIdx === -1 || cards.length <= 1) return null;

  const rects = cards.map((card) => card.getBoundingClientRect());
  const hasLayout = rects.some((r) => r.width > 0 && r.height > 0);

  if (!hasLayout) {
    const stride = 3;
    if (key === 'ArrowRight') return cards[Math.min(cards.length - 1, currentIdx + 1)];
    if (key === 'ArrowLeft') return cards[Math.max(0, currentIdx - 1)];
    if (key === 'ArrowDown') return cards[Math.min(cards.length - 1, currentIdx + stride)];
    if (key === 'ArrowUp') return cards[Math.max(0, currentIdx - stride)];
    return null;
  }

  const items = cards.map((card, i) => {
    const r = rects[i];
    return {
      card,
      rect: r,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  });

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const visualOrder = items.slice().sort((a, b) => {
      const rowDiff = a.rect.top - b.rect.top;
      if (Math.abs(rowDiff) > 16) return rowDiff;
      return a.rect.left - b.rect.left;
    });
    const vIdx = visualOrder.findIndex((it) => it.card === currentCard);
    if (vIdx === -1) return null;
    const nextIdx = key === 'ArrowRight'
      ? Math.min(visualOrder.length - 1, vIdx + 1)
      : Math.max(0, vIdx - 1);
    return visualOrder[nextIdx].card;
  }

  const cur = items[currentIdx];
  const candidates = items.filter((it) => {
    if (it.card === currentCard) return false;
    if (key === 'ArrowDown') {
      return it.rect.top >= cur.rect.bottom - 10 || it.cy > cur.cy + cur.rect.height * 0.45;
    }
    return it.rect.bottom <= cur.rect.top + 10 || it.cy < cur.cy - cur.rect.height * 0.45;
  });

  if (!candidates.length) return null;

  const minDy = Math.min(...candidates.map((it) => Math.abs(it.cy - cur.cy)));
  const rowBand = candidates.filter((it) => Math.abs(Math.abs(it.cy - cur.cy) - minDy) <= 28);

  rowBand.sort((a, b) => {
    const overlapA = cur.cx >= a.rect.left && cur.cx <= a.rect.right ? 0 : Math.abs(a.cx - cur.cx);
    const overlapB = cur.cx >= b.rect.left && cur.cx <= b.rect.right ? 0 : Math.abs(b.cx - cur.cx);
    if (overlapA !== overlapB) return overlapA - overlapB;
    return Math.abs(a.cx - cur.cx) - Math.abs(b.cx - cur.cx);
  });

  return rowBand[0]?.card || null;
}

/**
 * Mounts the Asymmetric Bento Launchpad with category filter rail, sort selector,
 * lazy harvested icon + Swiss emblem fallback, 30d sparklines, and 2D spatial keyboard nav.
 *
 * @param {{ container: HTMLElement, utils: object, actions: object }} deps
 * @returns {{ update: (model: object) => void, destroy: () => void }}
 */
export function createBentoDeck({ container, utils, actions }) {
  const {
    el,
    svgIcon,
    createThermalBadge,
    createRepoIcon,
    formatRelativeCompact,
    sanitizeHttpUrl,
  } = utils;

  const root = el('div', { class: 'bento-deck' });
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '14px';

  const filterPillsWrap = el('div', {
    class: 'filter-pills',
    role: 'group',
    'aria-label': 'Filter live applications',
  });

  const sortSelect = el('select', {
    class: 'sort-select',
    'aria-label': 'Sort live applications',
  });
  for (const opt of SORT_OPTIONS) {
    sortSelect.appendChild(el('option', { value: opt.value }, [opt.label]));
  }
  sortSelect.addEventListener('change', () => {
    actions.foley.latch();
    actions.setSort(sortSelect.value);
  });

  const filterRail = el('div', { class: 'filter-rail' }, [filterPillsWrap, sortSelect]);
  const gridEl = el('div', { class: 'bento-grid', role: 'grid', 'aria-label': 'Live App Launchpad' });

  root.append(filterRail, gridEl);

  let focusedSlug = null;
  let visibleCardsData = [];
  const cardBySlug = new Map();

  function applyFocusedSlug(slug, { moveDomFocus = false } = {}) {
    focusedSlug = slug;
    for (const [cardSlug, cardNode] of cardBySlug.entries()) {
      cardNode.classList.toggle('bento-card--focused', cardSlug === focusedSlug);
    }
    if (moveDomFocus && focusedSlug && cardBySlug.has(focusedSlug)) {
      const target = cardBySlug.get(focusedSlug);
      target.focus({ preventScroll: false });
    }
  }

  gridEl.addEventListener('keydown', (e) => {
    const card = e.target?.closest?.('.bento-card');
    if (!card || e.target !== card) return;

    const slug = card.dataset.slug;
    const repo = visibleCardsData.find((r) => r.slug === slug);

    if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp'
    ) {
      e.preventDefault();
      const cards = Array.from(gridEl.querySelectorAll('.bento-card'));
      const neighbor = findSpatialNeighbor(cards, card, e.key);
      if (neighbor && neighbor.dataset.slug) {
        actions.foley.tick();
        applyFocusedSlug(neighbor.dataset.slug, { moveDomFocus: true });
      }
      return;
    }

    if (e.key === 'Enter' && repo) {
      e.preventDefault();
      actions.launchRepo(repo);
      return;
    }

    if (e.key === ' ' && repo) {
      e.preventDefault();
      actions.foley.click();
      actions.openInspector(repo.slug, card);
    }
  });

  gridEl.addEventListener('focusin', (e) => {
    const card = e.target?.closest?.('.bento-card');
    if (card && card.dataset.slug) {
      applyFocusedSlug(card.dataset.slug, { moveDomFocus: false });
    }
  });

  function renderFilterPills(pool, activeFilter, activeSprintWindow) {
    const counts = computeFilterCounts(pool);
    const definitions = [
      { id: 'ALL', label: 'ALL LIVE APPS', count: counts.ALL },
      { id: 'HOT_7D', label: 'HOT (< 7D)', count: counts.HOT_7D },
      { id: 'PINNED', label: 'PINNED', count: counts.PINNED },
      ...CATEGORY_TAGS.map((tag) => ({
        id: tag,
        label: tag,
        count: counts[tag] || 0,
      })),
    ];

    const nodes = definitions.map((def) => {
      const isActive = activeFilter === def.id;
      const btn = el(
        'button',
        {
          type: 'button',
          class: isActive ? 'filter-pill is-active' : 'filter-pill',
          'aria-pressed': isActive ? 'true' : 'false',
        },
        [
          el('span', {}, [def.label]),
          el('span', { class: 'filter-pill__count' }, [String(def.count)]),
        ]
      );
      btn.addEventListener('click', () => {
        actions.foley.click();
        actions.setFilter(def.id);
      });
      return btn;
    });

    if (activeSprintWindow) {
      const sprintChip = el(
        'button',
        {
          type: 'button',
          class: 'chrono-clear-btn',
          title: `Sprint Window ${activeSprintWindow.startDate} to ${activeSprintWindow.endDate}`,
        },
        [`WINDOW ${activeSprintWindow.startDate.slice(5)}..${activeSprintWindow.endDate.slice(5)} x`]
      );
      sprintChip.addEventListener('click', () => {
        actions.foley.latch();
        actions.setSprintWindow(null);
      });
      nodes.push(sprintChip);
    }

    filterPillsWrap.replaceChildren(...nodes);
  }

  function buildCardElement(repo) {
    const isWide = repo.isPinned || repo.thermal?.tier === 'hot';
    const isFocused = focusedSlug === repo.slug;

    const classes = ['bento-card'];
    if (isWide) classes.push('bento-card--wide');
    if (isFocused) classes.push('bento-card--focused');

    const card = el('article', {
      class: classes.join(' '),
      tabindex: '0',
      role: 'gridcell',
      'data-slug': repo.slug,
      'aria-label': `${repo.effectiveTitle}, ${repo.effectiveCategory}`,
    });

    const sheen = el('div', { class: 'bento-card__sheen', 'aria-hidden': 'true' });

    const iconWrap = el('div', { class: 'bento-card__icon' }, [createRepoIcon(repo, 36)]);
    if (repo.effectiveAccentHex) {
      iconWrap.style.borderColor = repo.effectiveAccentHex;
    }
    const badgeCluster = el('div', { class: 'bento-card__actions' }, [
      createThermalBadge(repo.thermal),
    ]);
    if (repo.effectiveAccentHex) {
      const accentPip = el('span', { class: 'led-dot', title: `Curated accent ${repo.effectiveAccentHex}`, 'aria-hidden': 'true' });
      accentPip.style.backgroundColor = repo.effectiveAccentHex;
      badgeCluster.appendChild(accentPip);
    }
    if (repo.isPrivate) {
      badgeCluster.appendChild(
        el('span', { class: 'led-badge led-badge--private' }, [
          el('span', { class: 'led-dot', 'aria-hidden': 'true' }),
          'PRIVATE',
        ])
      );
    }
    if (repo.isPinned) {
      badgeCluster.appendChild(el('span', { class: 'chip' }, ['PINNED']));
    }
    if (repo.isHidden) {
      badgeCluster.appendChild(el('span', { class: 'chip' }, ['HIDDEN']));
    }

    const topRow = el('div', { class: 'bento-card__top' }, [iconWrap, badgeCluster]);

    const titleEl = el('h3', { class: 'bento-card__title' }, [repo.effectiveTitle]);
    const tagLineRow = el('div', { class: 'bento-card__actions' }, [
      el('span', { class: 'chip' }, [repo.effectiveCategory]),
    ]);
    if (repo.primaryLanguage) {
      tagLineRow.appendChild(el('span', { class: 'chip' }, [repo.primaryLanguage]));
    }

    const descEl = el('p', { class: 'bento-card__desc' }, [repo.effectiveDescription]);

    const sparkContainer = el('div', { class: 'bento-card__spark' });
    mountSparkline(sparkContainer, repo.commits30d, {
      width: 112,
      height: 24,
      accentColor: repo.effectiveAccentHex || 'var(--led-hot, #FF4F00)',
    });

    const metaStats = el('div', {}, [
      el('span', {}, [`${repo.commits30dTotal || 0} COMMITS`]),
      el(
        'time',
        {
          datetime: repo.pushedAt || '',
          'data-tabular': '1',
        },
        [formatRelativeCompact(repo.pushedAt, Date.now())]
      ),
    ]);
    metaStats.style.display = 'flex';
    metaStats.style.alignItems = 'center';
    metaStats.style.gap = '10px';

    const metaRow = el('div', { class: 'bento-card__meta' }, [sparkContainer, metaStats]);

    const launchBtn = el(
      'button',
      {
        type: 'button',
        class: 'hw-btn hw-btn--primary',
      },
      ['LAUNCH \u21B5']
    );
    launchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.launchRepo(repo);
    });

    const pinBtn = el(
      'button',
      {
        type: 'button',
        class: repo.isPinned ? 'icon-btn is-active' : 'icon-btn',
        'aria-pressed': repo.isPinned ? 'true' : 'false',
        'aria-label': repo.isPinned
          ? `Unpin ${repo.effectiveTitle}`
          : `Pin ${repo.effectiveTitle}`,
        title: repo.isPinned ? 'Unpin module' : 'Pin module',
      },
      [svgIcon('pin', 14)]
    );
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.foley.latch();
      void actions.togglePin(repo.slug);
    });

    const inspectBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': `Inspect and curate ${repo.effectiveTitle}`,
        title: 'Inspect & Curate',
      },
      [svgIcon('inspect', 14)]
    );
    inspectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.foley.click();
      actions.openInspector(repo.slug, inspectBtn);
    });

    const qrBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': `Mobile QR code for ${repo.effectiveTitle}`,
        title: 'Mobile QR',
      },
      [svgIcon('qr', 14)]
    );
    qrBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.foley.click();
      actions.openQrModal(repo, qrBtn);
    });

    const safeRepoUrl = sanitizeHttpUrl(repo.htmlUrl) || '#';
    const sourceBtn = el(
      'a',
      {
        class: 'icon-btn',
        href: safeRepoUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': `GitHub source for ${repo.effectiveTitle}`,
        title: 'GitHub Source',
      },
      [svgIcon('source', 14)]
    );
    sourceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.foley.click();
    });

    const cornerActions = el('div', { class: 'bento-card__actions' }, [
      pinBtn,
      inspectBtn,
      qrBtn,
      sourceBtn,
    ]);

    const footer = el('div', { class: 'bento-card__footer' }, [launchBtn, cornerActions]);

    card.addEventListener('click', () => {
      actions.foley.tick();
      applyFocusedSlug(repo.slug, { moveDomFocus: true });
    });

    card.append(sheen, topRow, titleEl, tagLineRow, descEl, metaRow, footer);
    return card;
  }

  function update(model) {
    const {
      liveAppsPool = [],
      activeFilter = 'ALL',
      vaultState,
      activeSprintWindow = null,
    } = model;

    const sortKey = vaultState?.sort || 'latest';
    sortSelect.value = sortKey;

    renderFilterPills(liveAppsPool, activeFilter, activeSprintWindow);

    const filtered = liveAppsPool.filter((repo) => {
      if (activeFilter === 'HOT_7D') {
        return repo.thermal?.tier === 'hot' || repo.thermal?.tier === 'active';
      }
      if (activeFilter === 'PINNED') {
        return repo.isPinned;
      }
      if (activeFilter !== 'ALL') {
        return repo.effectiveCategory === activeFilter;
      }
      return true;
    });

    visibleCardsData = sortLiveApps(filtered, sortKey);
    cardBySlug.clear();

    if (visibleCardsData.length === 0) {
      const resetFilterBtn = el(
        'button',
        { type: 'button', class: 'hw-btn hw-btn--primary' },
        ['RESET FILTERS']
      );
      resetFilterBtn.addEventListener('click', () => {
        actions.foley.latch();
        actions.setFilter('ALL');
        actions.setSprintWindow(null);
      });

      const emptyState = el('div', { class: 'bezel-blueprint' }, [
        el('span', { class: 'chip' }, ['NO MATCHING MODULES']),
        el('p', {}, ['No live applications match the active filter or sprint window.']),
        resetFilterBtn,
      ]);
      emptyState.style.gridColumn = '1 / -1';
      gridEl.replaceChildren(emptyState);
      return;
    }

    if (focusedSlug && !visibleCardsData.some((r) => r.slug === focusedSlug)) {
      focusedSlug = null;
    }

    const wasFocusedCard =
      typeof document !== 'undefined' &&
      gridEl.contains(document.activeElement) &&
      document.activeElement?.classList?.contains('bento-card');

    const fragment = document.createDocumentFragment();
    for (const repo of visibleCardsData) {
      const cardNode = buildCardElement(repo);
      cardBySlug.set(repo.slug, cardNode);
      fragment.appendChild(cardNode);
    }
    gridEl.replaceChildren(fragment);

    if (wasFocusedCard && focusedSlug && cardBySlug.has(focusedSlug)) {
      cardBySlug.get(focusedSlug).focus({ preventScroll: true });
    }
  }

  function mount() {
    container.replaceChildren(root);
  }

  function destroy() {
    cardBySlug.clear();
    container.replaceChildren();
  }

  return { mount, update, destroy, el: root };
}
