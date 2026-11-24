import { CATEGORY_TAGS, sanitizeHttpUrl } from '../telemetry/classifier.js';
import { mountSparkline } from '../graphics/sparkline.js';

/**
 * Mounts the Slide-Over Telemetry Inspector Drawer & Local Curation Form.
 *
 * @param {{ utils: object, actions: object }} deps
 * @returns {{ open: (slug: string, triggerEl?: HTMLElement | null) => void, close: () => void, update: (model: object) => void, isOpen: () => boolean, destroy: () => void }}
 */
export function createInspectorDrawer({ utils, actions }) {
  const {
    el,
    svgIcon,
    createThermalBadge,
    createRepoIcon,
    createLangBar,
    formatRelativeCompact,
    formatDateShort,
    formatSize,
  } = utils;

  const backdrop = el('div', { class: 'drawer-backdrop', hidden: true });
  const drawer = el('aside', {
    class: 'inspector-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'inspector-drawer-title',
    tabindex: '-1',
  });
  backdrop.appendChild(drawer);
  document.body.appendChild(backdrop);

  let currentSlug = null;
  let lastTriggerEl = null;
  let latestModel = null;
  let statusBannerText = '';
  let statusBannerIsError = false;

  function isOpen() {
    return !backdrop.hidden;
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    currentSlug = null;
    statusBannerText = '';
    statusBannerIsError = false;
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
    lastTriggerEl = null;
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      actions.foley.click();
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      actions.foley.click();
      close();
    }
  });

  function render() {
    if (!isOpen() || !currentSlug || !latestModel) return;
    const repo = (latestModel.allRepos || []).find((r) => r.slug === currentSlug);
    if (!repo) {
      close();
      return;
    }

    const curation = latestModel.vaultState?.curated?.[repo.slug] || {};

    const headerLeft = el('div', {}, [
      el('div', { class: 'bento-card__icon' }, [createRepoIcon(repo, 36)]),
      el('div', {}, [
        el('h2', { id: 'inspector-drawer-title', class: 'bento-card__title' }, [
          repo.effectiveTitle,
        ]),
        el('span', { class: 'chip' }, [repo.fullName || repo.slug]),
      ]),
    ]);
    headerLeft.style.display = 'flex';
    headerLeft.style.alignItems = 'center';
    headerLeft.style.gap = '10px';
    headerLeft.style.minWidth = '0';

    const closeBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Close Inspector Drawer',
        title: 'Close (ESC)',
      },
      [svgIcon('close', 14)]
    );
    closeBtn.addEventListener('click', () => {
      actions.foley.click();
      close();
    });

    const topHeader = el('div', {}, [headerLeft, closeBtn]);
    topHeader.style.display = 'flex';
    topHeader.style.alignItems = 'flex-start';
    topHeader.style.justifyContent = 'space-between';
    topHeader.style.gap = '12px';

    const badgeRow = el('div', { class: 'bento-card__actions' }, [
      createThermalBadge(repo.thermal),
      el('span', { class: 'surface-tag' }, [
        repo.isLiveApp ? 'WEB APP' : 'CLI / REPO',
      ]),
      el('span', { class: 'chip' }, [repo.effectiveCategory]),
    ]);
    if (repo.isPrivate) {
      badgeRow.appendChild(
        el('span', { class: 'led-badge led-badge--private' }, [
          el('span', { class: 'led-dot', 'aria-hidden': 'true' }),
          'PRIVATE',
        ])
      );
    }

    const actionRow = el('div', { class: 'hero-forge__actions' });
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

    const qrBtn = el(
      'button',
      {
        type: 'button',
        class: 'hw-btn',
        disabled: !repo.effectiveLiveUrl && !repo.htmlUrl,
      },
      ['MOBILE QR']
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
      ['GITHUB']
    );
    const actionsLink = el(
      'a',
      {
        class: 'hw-btn hw-btn--ghost',
        href: sanitizeHttpUrl(repo.actionsUrl) || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      ['ACTIONS']
    );
    actionRow.append(launchBtn, qrBtn, repoLink, actionsLink);

    // Section 1: Vital Signs
    const sparkHost = el('div');
    mountSparkline(sparkHost, repo.commits30d, {
      width: 180,
      height: 28,
      accentColor: repo.effectiveAccentHex || 'var(--led-hot, #FF4F00)',
    });

    const vitalGrid = el('div', { class: 'diag-grid' }, [
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['SIZE']),
        el('div', { class: 'metric-readout__value' }, [formatSize(repo.sizeKb)]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['CREATED']),
        el('div', { class: 'metric-readout__value' }, [formatDateShort(repo.createdAt)]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['LAST PUSH']),
        el('div', { class: 'metric-readout__value' }, [
          formatRelativeCompact(repo.pushedAt, Date.now()),
        ]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['BRANCH']),
        el('div', { class: 'metric-readout__value' }, [repo.defaultBranch || 'main']),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['OPEN ISSUES']),
        el('div', { class: 'metric-readout__value' }, [String(repo.openIssues ?? 0)]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['STARS']),
        el('div', { class: 'metric-readout__value' }, [String(repo.stars ?? 0)]),
      ]),
    ]);

    const pagesReadout = el('div', { class: 'commit-chip' }, [
      el('span', { class: 'metric-readout__label' }, ['PAGES URL']),
      el('span', {}, [repo.effectiveLiveUrl || repo.pagesCandidateUrl || 'NONE']),
    ]);

    const vitalSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['VITAL SIGNS // 30D VELOCITY']),
      sparkHost,
      vitalGrid,
      pagesReadout,
    ]);

    // Section 2: Language Byte-Share Bar
    const langInfo = createLangBar(repo.languages);
    const langSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['LANGUAGE TELEMETRY']),
    ]);
    if (langInfo.totalBytes > 0) {
      langSection.append(langInfo.barEl, langInfo.legendEl);
    } else {
      langSection.append(el('span', { class: 'chip' }, ['NO LANGUAGE BYTES RECORDED']));
    }

    // Section 3: Recent Commits (up to 10)
    const commitsSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['RECENT COMMITS (UP TO 10)']),
    ]);
    const commits = Array.isArray(repo.recentCommits) ? repo.recentCommits.slice(0, 10) : [];
    if (commits.length > 0) {
      const list = el('ul', { class: 'commit-list' });
      for (const c of commits) {
        const cUrl = sanitizeHttpUrl(c.url) || sanitizeHttpUrl(repo.htmlUrl) || '#';
        const row = el('li', { class: 'commit-row' }, [
          el(
            'a',
            { href: cUrl, target: '_blank', rel: 'noopener noreferrer' },
            [c.sha7 || 'HEAD']
          ),
          el('span', {}, [c.message || 'Commit']),
          el('span', {}, [
            `${formatDateShort(c.date)}${c.author ? ` // ${c.author}` : ''}`,
          ]),
        ]);
        list.appendChild(row);
      }
      commitsSection.appendChild(list);
    } else {
      commitsSection.appendChild(el('span', { class: 'chip' }, ['NO COMMIT LOG AVAILABLE']));
    }

    // Section 4: Local Curation Form
    const titleInput = el('input', {
      id: 'curate-title',
      type: 'text',
      class: 'hw-input',
      maxlength: '72',
      placeholder: repo.title,
      value: curation.title || '',
    });

    const descInput = el('textarea', {
      id: 'curate-desc',
      class: 'hw-input',
      rows: '2',
      maxlength: '200',
      placeholder: repo.description,
    });
    descInput.value = curation.description || '';

    const urlInput = el('input', {
      id: 'curate-url',
      type: 'url',
      class: 'hw-input',
      placeholder: repo.liveUrl || 'https://...',
      value: curation.liveUrl || '',
    });

    const categorySelect = el('select', { id: 'curate-category', class: 'hw-select' }, [
      el('option', { value: '' }, [`AUTO (${repo.category})`]),
      ...CATEGORY_TAGS.map((tag) => el('option', { value: tag }, [tag])),
    ]);
    categorySelect.value = curation.category || '';

    const accentInput = el('input', {
      id: 'curate-accent',
      type: 'text',
      class: 'hw-input',
      maxlength: '7',
      placeholder: '#FF4F00',
      value: curation.accentHex || '',
    });

    const pinToggleBtn = el(
      'button',
      {
        type: 'button',
        class: repo.isPinned ? 'hw-btn is-active' : 'hw-btn hw-btn--ghost',
        'aria-pressed': repo.isPinned ? 'true' : 'false',
      },
      [repo.isPinned ? 'UNPIN FROM TOP' : 'PIN TO TOP']
    );
    pinToggleBtn.addEventListener('click', async () => {
      actions.foley.latch();
      await actions.togglePin(repo.slug);
    });

    const hideToggleBtn = el(
      'button',
      {
        type: 'button',
        class: repo.isHidden ? 'hw-btn is-active' : 'hw-btn hw-btn--ghost',
        'aria-pressed': repo.isHidden ? 'true' : 'false',
      },
      [repo.isHidden ? 'UNHIDE REPO' : 'HIDE FROM DECK']
    );
    hideToggleBtn.addEventListener('click', async () => {
      actions.foley.latch();
      await actions.toggleHide(repo.slug);
    });

    const quickRow = el('div', { class: 'hero-forge__actions' }, [pinToggleBtn, hideToggleBtn]);

    const formFeedback = el('div', { class: 'chip', hidden: !statusBannerText }, [
      statusBannerText,
    ]);
    if (statusBannerIsError) {
      formFeedback.style.borderColor = 'var(--led-hot)';
      formFeedback.style.color = 'var(--led-hot-ink)';
    }

    const saveBtn = el('button', { type: 'submit', class: 'hw-btn hw-btn--primary' }, [
      'SAVE CURATION',
    ]);
    const resetBtn = el('button', { type: 'button', class: 'hw-btn hw-btn--ghost' }, [
      'RESET CURATION',
    ]);

    resetBtn.addEventListener('click', async () => {
      actions.foley.latch();
      await actions.resetCuration(repo.slug);
      statusBannerText = 'CURATION RESET TO TELEMETRY DEFAULTS';
      statusBannerIsError = false;
      render();
    });

    const form = el('form', { class: 'curation-form' }, [
      el('div', { class: 'field-group' }, [
        el('label', { for: 'curate-title' }, ['OVERRIDE TITLE']),
        titleInput,
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'curate-desc' }, ['CUSTOM DESCRIPTION']),
        descInput,
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'curate-url' }, ['CUSTOM LAUNCH URL (HTTPS)']),
        urlInput,
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'curate-category' }, ['CATEGORY TAG']),
        categorySelect,
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'curate-accent' }, ['CUSTOM ACCENT HEX (#RRGGBB)']),
        accentInput,
      ]),
      quickRow,
      formFeedback,
      el('div', { class: 'hero-forge__actions' }, [saveBtn, resetBtn]),
    ]);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawUrl = urlInput.value.trim();
      if (rawUrl && !sanitizeHttpUrl(rawUrl)) {
        actions.foley.click();
        statusBannerText = 'INVALID URL: STRICTLY HTTP OR HTTPS REQUIRED';
        statusBannerIsError = true;
        render();
        return;
      }

      const rawAccent = accentInput.value.trim();
      if (rawAccent && !/^#[0-9a-fA-F]{6}$/.test(rawAccent)) {
        actions.foley.click();
        statusBannerText = 'INVALID ACCENT HEX: EXPECTED #RRGGBB';
        statusBannerIsError = true;
        render();
        return;
      }

      const patch = {};
      if (titleInput.value.trim()) patch.title = titleInput.value.trim();
      if (descInput.value.trim()) patch.description = descInput.value.trim();
      if (rawUrl) patch.liveUrl = sanitizeHttpUrl(rawUrl);
      if (categorySelect.value) patch.category = categorySelect.value;
      if (rawAccent) patch.accentHex = rawAccent.toUpperCase();

      actions.foley.relay();
      if (Object.keys(patch).length === 0) {
        await actions.resetCuration(repo.slug);
        statusBannerText = 'CURATION CLEARED';
      } else {
        await actions.setCuration(repo.slug, patch);
        statusBannerText = 'SAVED TO TRIPLE VAULT';
      }
      statusBannerIsError = false;
      render();
    });

    const curationSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['LOCAL CURATION OVERRIDES']),
      form,
    ]);

    drawer.replaceChildren(
      topHeader,
      badgeRow,
      actionRow,
      vitalSection,
      langSection,
      commitsSection,
      curationSection
    );
  }

  function open(slug, triggerEl = null) {
    currentSlug = slug;
    lastTriggerEl = triggerEl || document.activeElement;
    statusBannerText = '';
    statusBannerIsError = false;
    backdrop.hidden = false;
    render();
    drawer.focus();
  }

  function update(model) {
    latestModel = model;
    if (!isOpen()) return;
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    if (activeEl && drawer.contains(activeEl) && activeEl.closest('.curation-form')) {
      const tag = activeEl.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }
    }
    render();
  }

  function destroy() {
    backdrop.remove();
  }

  return { open, close, update, isOpen, destroy };
}
