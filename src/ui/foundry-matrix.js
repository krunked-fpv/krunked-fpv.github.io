import { createLivePeekBezel } from './hero-forge.js';

const SORTABLE_COLUMNS = [
  { key: 'title', label: 'MODULE' },
  { key: 'surface', label: 'SURFACE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'thermal', label: 'STATUS' },
  { key: 'commits30d', label: '30D' },
  { key: 'pushedAt', label: 'LAST PUSH' },
  { key: 'sizeKb', label: 'SIZE' },
];

/**
 * Mounts both MATRIX (full-repo SRE table) and SPLIT (42% rail + 58% Live Sandbox Peek
 * with recursive self-iframe guard & commit inspector) secondary views.
 *
 * @param {{ container: HTMLElement, utils: object, actions: object }} deps
 * @returns {{ mount: () => void, update: (model: object) => void, openPeekForRepo: (repo: object) => void, destroy: () => void }}
 */
export function createFoundryMatrix({ container, utils, actions }) {
  const {
    el,
    svgIcon,
    createThermalBadge,
    createRepoIcon,
    createLangBar,
    formatRelativeCompact,
    formatDateShort,
    formatSize,
    sanitizeHttpUrl,
  } = utils;

  const wrapper = el('div', { class: 'foundry-matrix-host' });

  let currentMode = 'matrix';
  let latestModel = null;
  let searchQuery = '';
  let surfaceFilter = 'ALL'; // 'ALL' | 'WEB_APP' | 'CLI_REPO'
  let sortKey = 'pushedAt';
  let sortDir = 'desc';
  let selectedSlug = null;

  // Shared Split View right-pane Live Peek bezel (enforces self-iframe guard)
  const splitBezel = createLivePeekBezel({ utils, actions });

  function getFilteredRepos(model) {
    const repos = Array.isArray(model?.matrixReposPool) ? model.matrixReposPool : [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = repos.filter((repo) => {
      if (surfaceFilter === 'WEB_APP' && !repo.isLiveApp) return false;
      if (surfaceFilter === 'CLI_REPO' && repo.isLiveApp) return false;
      if (!q) return true;
      const haystack = [
        repo.effectiveTitle,
        repo.slug,
        repo.effectiveCategory,
        repo.primaryLanguage,
        repo.effectiveDescription,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    const sorted = filtered.slice().sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') {
        cmp = a.effectiveTitle.localeCompare(b.effectiveTitle, 'en', { sensitivity: 'base' });
      } else if (sortKey === 'surface') {
        cmp = (a.isLiveApp ? 1 : 0) - (b.isLiveApp ? 1 : 0);
      } else if (sortKey === 'category') {
        cmp = a.effectiveCategory.localeCompare(b.effectiveCategory, 'en', { sensitivity: 'base' });
      } else if (sortKey === 'thermal') {
        const order = { hot: 3, active: 2, online: 1 };
        cmp = (order[a.thermal?.tier] || 0) - (order[b.thermal?.tier] || 0);
      } else if (sortKey === 'commits30d') {
        cmp = (a.commits30dTotal || 0) - (b.commits30dTotal || 0);
      } else if (sortKey === 'sizeKb') {
        cmp = (a.sizeKb || 0) - (b.sizeKb || 0);
      } else {
        cmp = (Date.parse(a.pushedAt || '') || 0) - (Date.parse(b.pushedAt || '') || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }

  // Persistent Matrix View nodes
  const searchInput = el('input', {
    type: 'search',
    class: 'hw-input',
    placeholder: 'Search modules, slugs, languages...',
    'aria-label': 'Filter matrix repositories',
  });
  searchInput.style.maxWidth = '260px';

  const surfaceBtns = new Map();
  const surfaceGroup = el('div', { class: 'filter-pills', role: 'group', 'aria-label': 'Surface type filter' });
  for (const sDef of [
    { id: 'ALL', label: 'ALL SURFACES' },
    { id: 'WEB_APP', label: 'WEB APP' },
    { id: 'CLI_REPO', label: 'CLI / REPO' },
  ]) {
    const btn = el('button', { type: 'button', class: 'filter-pill' }, [sDef.label]);
    btn.addEventListener('click', () => {
      actions.foley.click();
      surfaceFilter = sDef.id;
      renderView();
    });
    surfaceBtns.set(sDef.id, btn);
    surfaceGroup.appendChild(btn);
  }

  const showHiddenBtn = el('button', { type: 'button', class: 'filter-pill' }, ['SHOW HIDDEN (0)']);
  showHiddenBtn.addEventListener('click', () => {
    actions.foley.latch();
    const current = Boolean(latestModel?.vaultState?.showHidden);
    void actions.setPreference('showHidden', !current);
  });

  const matrixCountChip = el('span', { class: 'chip', 'data-tabular': '1' }, ['0 / 0']);
  const matrixToolbar = el('div', { class: 'matrix-toolbar' }, [
    searchInput,
    surfaceGroup,
    showHiddenBtn,
    matrixCountChip,
  ]);

  const theadRow = el('tr');
  const tbody = el('tbody');
  const matrixTable = el('table', { class: 'matrix-table' }, [
    el('thead', {}, [theadRow]),
    tbody,
  ]);
  const matrixViewEl = el('div', { class: 'matrix-view' }, [
    matrixToolbar,
    el('div', { class: 'matrix-table-wrap' }, [matrixTable]),
  ]);

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderView();
  });

  // Persistent Split View nodes
  const splitRailHeader = el('div', { class: 'bento-card__footer' });
  const splitRailList = el('div', {
    role: 'listbox',
    'aria-label': 'Split view repository selector',
  });
  splitRailList.style.display = 'flex';
  splitRailList.style.flexDirection = 'column';
  splitRailList.style.gap = '4px';

  const splitRail = el('div', { class: 'split-view__rail', tabindex: '0' }, [
    splitRailHeader,
    splitRailList,
  ]);
  const splitInspectorBox = el('div', { class: 'drawer-section' });
  splitInspectorBox.style.borderRadius = '0';
  splitInspectorBox.style.borderLeft = '0';
  splitInspectorBox.style.borderRight = '0';
  splitInspectorBox.style.borderBottom = '0';

  const splitPane = el('div', { class: 'split-view__pane' }, [
    splitBezel.el,
    splitInspectorBox,
  ]);
  const splitViewEl = el('div', { class: 'split-view' }, [splitRail, splitPane]);

  function applySplitGridProportion() {
    const isWide = typeof window !== 'undefined' ? window.innerWidth > 960 : true;
    splitViewEl.style.gridTemplateColumns = isWide
      ? 'minmax(280px, 42%) minmax(0, 58%)'
      : 'minmax(0, 1fr)';
  }
  applySplitGridProportion();
  const handleResize = () => applySplitGridProportion();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize, { passive: true });
  }

  let splitVisibleRepos = [];

  splitRail.addEventListener('keydown', (e) => {
    if (!splitVisibleRepos.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = splitVisibleRepos.findIndex((r) => r.slug === selectedSlug);
      const curIdx = idx >= 0 ? idx : 0;
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(splitVisibleRepos.length - 1, curIdx + 1)
          : Math.max(0, curIdx - 1);
      if (nextIdx !== curIdx || idx === -1) {
        actions.foley.tick();
        selectedSlug = splitVisibleRepos[nextIdx].slug;
        renderSplit();
        const activeRow = splitRailList.querySelector('.matrix-row--selected');
        activeRow?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    if (e.key === 'Enter') {
      const repo = splitVisibleRepos.find((r) => r.slug === selectedSlug);
      if (repo) {
        e.preventDefault();
        actions.launchRepo(repo);
      }
      return;
    }

    if (e.key === ' ') {
      const repo = splitVisibleRepos.find((r) => r.slug === selectedSlug);
      if (repo) {
        e.preventDefault();
        actions.foley.click();
        actions.openInspector(repo.slug, splitRail);
      }
    }
  });

  function renderMatrix() {
    const model = latestModel;
    if (!model) return;
    const repos = getFilteredRepos(model);
    const totalAll = model.allRepos?.length || 0;
    const hiddenCount = model.hiddenCount || 0;
    const showHidden = Boolean(model.vaultState?.showHidden);

    for (const [id, btn] of surfaceBtns.entries()) {
      const active = surfaceFilter === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    showHiddenBtn.textContent = `SHOW HIDDEN (${hiddenCount})`;
    showHiddenBtn.classList.toggle('is-active', showHidden);
    showHiddenBtn.setAttribute('aria-pressed', showHidden ? 'true' : 'false');
    matrixCountChip.textContent = `${repos.length} / ${totalAll} MODULES`;

    const headers = SORTABLE_COLUMNS.map((col) => {
      const isSorted = sortKey === col.key;
      const indicator = isSorted ? (sortDir === 'asc' ? ' [ASC]' : ' [DESC]') : '';
      const sortBtn = el(
        'button',
        {
          type: 'button',
          class: 'hw-btn hw-btn--ghost',
          'aria-label': `Sort by ${col.label}`,
        },
        [`${col.label}${indicator}`]
      );
      sortBtn.style.minHeight = '24px';
      sortBtn.style.padding = '2px 6px';
      sortBtn.style.fontSize = '0.6875rem';
      sortBtn.addEventListener('click', () => {
        actions.foley.click();
        if (sortKey === col.key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = col.key;
          sortDir = col.key === 'title' || col.key === 'category' ? 'asc' : 'desc';
        }
        renderMatrix();
      });
      return el('th', { scope: 'col' }, [sortBtn]);
    });
    headers.push(el('th', { scope: 'col' }, ['ACTIONS']));
    theadRow.replaceChildren(...headers);

    if (repos.length === 0) {
      const emptyCell = el('td', { colspan: '8' }, [
        'No repositories match the current Matrix filters.',
      ]);
      emptyCell.style.textAlign = 'center';
      emptyCell.style.padding = '24px';
      tbody.replaceChildren(el('tr', {}, [emptyCell]));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const repo of repos) {
      const isSelected = repo.slug === selectedSlug;
      const row = el('tr', {
        class: isSelected ? 'matrix-row matrix-row--selected' : 'matrix-row',
      });

      const titleStack = el('div', {}, [
        el('strong', {}, [repo.effectiveTitle]),
        el('div', { class: 'chip' }, [repo.slug]),
      ]);
      titleStack.style.display = 'flex';
      titleStack.style.flexDirection = 'column';
      titleStack.style.alignItems = 'flex-start';
      titleStack.style.gap = '4px';

      if (repo.isPrivate) {
        titleStack.appendChild(
          el('span', { class: 'led-badge led-badge--private' }, [
            el('span', { class: 'led-dot', 'aria-hidden': 'true' }),
            'PRIVATE',
          ])
        );
      }
      if (repo.isHidden) {
        titleStack.appendChild(el('span', { class: 'chip' }, ['HIDDEN']));
      }

      const launchAction = el(
        'button',
        {
          type: 'button',
          class: repo.effectiveLiveUrl ? 'hw-btn hw-btn--primary' : 'hw-btn hw-btn--ghost',
          disabled: !repo.effectiveLiveUrl,
          title: repo.effectiveLiveUrl ? 'Launch live app' : 'No live URL published',
        },
        ['LAUNCH']
      );
      launchAction.style.minHeight = '26px';
      launchAction.style.padding = '2px 8px';
      launchAction.style.fontSize = '0.6875rem';
      launchAction.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.launchRepo(repo);
      });

      const inspectAction = el(
        'button',
        { type: 'button', class: 'icon-btn', title: 'Inspect & Curate', 'aria-label': `Inspect ${repo.effectiveTitle}` },
        [svgIcon('inspect', 13)]
      );
      inspectAction.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.foley.click();
        actions.openInspector(repo.slug, inspectAction);
      });

      const qrAction = el(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          title: 'Mobile QR',
          'aria-label': `QR for ${repo.effectiveTitle}`,
          disabled: !repo.effectiveLiveUrl && !repo.htmlUrl,
        },
        [svgIcon('qr', 13)]
      );
      qrAction.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.foley.click();
        actions.openQrModal(repo, qrAction);
      });

      const repoLink = el(
        'a',
        {
          class: 'hw-btn hw-btn--ghost',
          href: sanitizeHttpUrl(repo.htmlUrl) || '#',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        ['REPO']
      );
      repoLink.style.minHeight = '26px';
      repoLink.style.padding = '2px 8px';
      repoLink.style.fontSize = '0.6875rem';
      repoLink.addEventListener('click', (e) => e.stopPropagation());

      const actLink = el(
        'a',
        {
          class: 'hw-btn hw-btn--ghost',
          href: sanitizeHttpUrl(repo.actionsUrl) || '#',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        ['ACTIONS']
      );
      actLink.style.minHeight = '26px';
      actLink.style.padding = '2px 8px';
      actLink.style.fontSize = '0.6875rem';
      actLink.addEventListener('click', (e) => e.stopPropagation());

      const actionsCell = el('td', {}, [
        el('div', { class: 'bento-card__actions' }, [
          launchAction,
          inspectAction,
          qrAction,
          repoLink,
          actLink,
        ]),
      ]);

      row.append(
        el('td', {}, [titleStack]),
        el('td', {}, [
          el('span', { class: 'surface-tag' }, [
            repo.isLiveApp ? 'WEB APP' : 'CLI / REPO',
          ]),
        ]),
        el('td', {}, [el('span', { class: 'chip' }, [repo.effectiveCategory])]),
        el('td', {}, [createThermalBadge(repo.thermal)]),
        el('td', { 'data-tabular': '1' }, [String(repo.commits30dTotal || 0)]),
        el('td', { 'data-tabular': '1' }, [formatRelativeCompact(repo.pushedAt, Date.now())]),
        el('td', { 'data-tabular': '1' }, [formatSize(repo.sizeKb)]),
        actionsCell
      );

      row.addEventListener('click', () => {
        actions.foley.tick();
        selectedSlug = repo.slug;
        renderMatrix();
      });

      fragment.appendChild(row);
    }

    tbody.replaceChildren(fragment);
  }

  function renderSplitInspector(repo) {
    if (!repo) {
      splitInspectorBox.replaceChildren(
        el('span', { class: 'chip' }, ['SELECT A REPOSITORY FROM THE LEFT RAIL'])
      );
      return;
    }

    const headerRow = el('div', { class: 'bento-card__top' }, [
      el('div', {}, [
        el('div', { class: 'bento-card__icon' }, [createRepoIcon(repo, 32)]),
        el('div', {}, [
          el('strong', {}, [repo.effectiveTitle]),
          el('div', { class: 'bento-card__actions' }, [
            createThermalBadge(repo.thermal),
            el('span', { class: 'surface-tag' }, [
              repo.isLiveApp ? 'WEB APP' : 'CLI / REPO',
            ]),
            el('span', { class: 'chip' }, [repo.effectiveCategory]),
          ]),
        ]),
      ]),
    ]);
    headerRow.firstElementChild.style.display = 'flex';
    headerRow.firstElementChild.style.alignItems = 'center';
    headerRow.firstElementChild.style.gap = '10px';

    const btnRow = el('div', { class: 'hero-forge__actions' });
    const launchBtn = el(
      'button',
      {
        type: 'button',
        class: 'hw-btn hw-btn--primary',
        disabled: !repo.effectiveLiveUrl,
      },
      ['LAUNCH APP \u21B5']
    );
    launchBtn.addEventListener('click', () => actions.launchRepo(repo));

    const inspectBtn = el('button', { type: 'button', class: 'hw-btn' }, ['INSPECT & CURATE']);
    inspectBtn.addEventListener('click', () => {
      actions.foley.click();
      actions.openInspector(repo.slug, inspectBtn);
    });

    const qrBtn = el(
      'button',
      {
        type: 'button',
        class: 'hw-btn hw-btn--ghost',
        disabled: !repo.effectiveLiveUrl && !repo.htmlUrl,
      },
      ['QR']
    );
    qrBtn.addEventListener('click', () => {
      actions.foley.click();
      actions.openQrModal(repo, qrBtn);
    });

    const repoLink = el(
      'a',
      {
        class: 'hw-btn hw-btn--ghost',
        href: sanitizeHttpUrl(repo.htmlUrl) || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      ['REPO']
    );
    const actLink = el(
      'a',
      {
        class: 'hw-btn hw-btn--ghost',
        href: sanitizeHttpUrl(repo.actionsUrl) || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      ['ACTIONS']
    );
    btnRow.append(launchBtn, inspectBtn, qrBtn, repoLink, actLink);

    const langInfo = createLangBar(repo.languages);
    const commits = Array.isArray(repo.recentCommits) ? repo.recentCommits.slice(0, 5) : [];
    const commitList = el('ul', { class: 'commit-list' });
    if (commits.length > 0) {
      for (const c of commits) {
        const cUrl = sanitizeHttpUrl(c.url) || sanitizeHttpUrl(repo.htmlUrl) || '#';
        commitList.appendChild(
          el('li', { class: 'commit-row' }, [
            el(
              'a',
              { href: cUrl, target: '_blank', rel: 'noopener noreferrer' },
              [c.sha7 || 'HEAD']
            ),
            el('span', {}, [c.message || 'Commit']),
            el('span', {}, [formatDateShort(c.date)]),
          ])
        );
      }
    } else {
      commitList.appendChild(
        el('li', { class: 'commit-row' }, [
          el('span', {}, ['--']),
          el('span', {}, ['No recent commit history']),
        ])
      );
    }

    const parts = [headerRow, btnRow];
    if (langInfo.totalBytes > 0) {
      parts.push(langInfo.barEl, langInfo.legendEl);
    }
    parts.push(
      el('span', { class: 'metric-readout__label' }, ['COMMIT INSPECTOR (LATEST 5)']),
      commitList
    );
    splitInspectorBox.replaceChildren(...parts);
  }

  function renderSplit() {
    const model = latestModel;
    if (!model) return;
    splitVisibleRepos = getFilteredRepos(model);

    const hiddenCount = model.hiddenCount || 0;
    const showHidden = Boolean(model.vaultState?.showHidden);

    const railToggleBtn = el(
      'button',
      {
        type: 'button',
        class: showHidden ? 'filter-pill is-active' : 'filter-pill',
        'aria-pressed': showHidden ? 'true' : 'false',
      },
      [`HIDDEN (${hiddenCount})`]
    );
    railToggleBtn.addEventListener('click', () => {
      actions.foley.latch();
      void actions.setPreference('showHidden', !showHidden);
    });

    splitRailHeader.replaceChildren(
      el('span', { class: 'metric-readout__label' }, [
        `RAIL (${splitVisibleRepos.length}) // ARROWS TO TRIAGE`,
      ]),
      railToggleBtn
    );

    if (
      !selectedSlug ||
      !splitVisibleRepos.some((r) => r.slug === selectedSlug)
    ) {
      const firstNonSelf = splitVisibleRepos.find((r) => !r.isSelfDeck);
      selectedSlug = firstNonSelf?.slug || splitVisibleRepos[0]?.slug || null;
    }

    const railNodes = splitVisibleRepos.map((repo) => {
      const isSelected = repo.slug === selectedSlug;
      const itemBtn = el(
        'button',
        {
          type: 'button',
          role: 'option',
          class: isSelected
            ? 'palette-item matrix-row--selected'
            : 'palette-item',
          'aria-selected': isSelected ? 'true' : 'false',
        },
        [
          el('span', {}, [repo.effectiveTitle]),
          el('span', { class: 'surface-tag' }, [
            repo.isLiveApp ? 'WEB' : 'CLI',
          ]),
        ]
      );
      itemBtn.addEventListener('click', () => {
        actions.foley.tick();
        selectedSlug = repo.slug;
        renderSplit();
      });
      return itemBtn;
    });

    splitRailList.replaceChildren(...railNodes);

    const activeRepo = splitVisibleRepos.find((r) => r.slug === selectedSlug) || null;
    splitBezel.setRepo(activeRepo);
    renderSplitInspector(activeRepo);
  }

  function renderView() {
    if (!latestModel) return;
    if (currentMode === 'split') {
      wrapper.replaceChildren(splitViewEl);
      renderSplit();
    } else {
      wrapper.replaceChildren(matrixViewEl);
      renderMatrix();
    }
  }

  function mount() {
    container.replaceChildren(wrapper);
  }

  function update(model) {
    latestModel = model;
    currentMode = model.vaultState?.view === 'split' ? 'split' : 'matrix';
    renderView();
  }

  function openPeekForRepo(repo) {
    if (!repo) return;
    selectedSlug = repo.slug;
    currentMode = 'split';
    renderView();
    splitBezel.openPeek();
  }

  function destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
    }
    wrapper.replaceChildren();
    container.replaceChildren();
  }

  return { mount, update, openPeekForRepo, destroy };
}
