import { sanitizeHttpUrl } from '../telemetry/classifier.js';

function fuzzyScore(query, haystack) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const text = String(haystack || '').toLowerCase();
  if (!text) return 0;

  if (text.startsWith(q)) return 200;
  const directIdx = text.indexOf(q);
  if (directIdx !== -1) {
    return 140 - Math.min(directIdx, 60);
  }

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let i = 0; i < text.length && qi < q.length; i += 1) {
    if (text[i] === q[qi]) {
      qi += 1;
      consecutive += 1;
      score += 4 + consecutive * 2;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? score : 0;
}

/**
 * Mounts the Raycast-Grade Command Palette (Cmd+K, Ctrl+K, /), supporting
 * fuzzy search across all repositories and the 11 system commands, plus
 * keyboard chords (Enter, Shift+Enter, Alt+Enter, Ctrl/Cmd+P, ESC).
 *
 * @param {{ utils: object, actions: object }} deps
 * @returns {{ open: (triggerEl?: HTMLElement | null) => void, close: () => void, update: (model: object) => void, isOpen: () => boolean, destroy: () => void }}
 */
export function createCommandPalette({ utils, actions }) {
  const { el } = utils;

  const backdrop = el('div', { class: 'palette-backdrop', hidden: true });
  const dialog = el('div', {
    class: 'command-palette',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Command Palette',
  });

  const input = el('input', {
    type: 'text',
    class: 'hw-input',
    placeholder: 'Type a command or search apps & repos...',
    'aria-label': 'Command Palette search',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const inputRow = el('div', { class: 'palette-input-row' }, [
    el('span', { class: 'keycap', 'aria-hidden': 'true' }, ['\u2318K']),
    input,
    el('span', { class: 'keycap', 'aria-hidden': 'true' }, ['ESC']),
  ]);

  const resultsEl = el('div', {
    class: 'palette-results',
    role: 'listbox',
    'aria-label': 'Command and module results',
  });

  const hintsBar = el('div', { class: 'bezel-toolbar' }, [
    el('span', {}, ['\u21B5 Launch']),
    el('span', {}, ['Shift+\u21B5 Repo']),
    el('span', {}, ['Alt+\u21B5 Live Peek']),
    el('span', {}, ['Ctrl/\u2318+P Pin']),
    el('span', {}, ['ESC Close']),
  ]);

  dialog.append(inputRow, resultsEl, hintsBar);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  let latestModel = null;
  let lastTriggerEl = null;
  let visibleItems = [];
  let activeIndex = 0;

  function buildSystemCommands() {
    return [
      {
        kind: 'command',
        id: 'sync-now',
        title: 'Sync GitHub Telemetry Now',
        meta: 'ETAG DELTA',
        run: () => {
          actions.foley.relay();
          void actions.syncNow({ manual: true });
        },
      },
      {
        kind: 'command',
        id: 'toggle-theme',
        title: 'Switch Theme: Obsidian / Braun Daylight',
        meta: 'THEME',
        run: () => {
          actions.foley.latch();
          actions.toggleTheme();
        },
      },
      {
        kind: 'command',
        id: 'view-deck',
        title: 'View: App Deck',
        meta: 'VIEW',
        run: () => {
          actions.foley.latch();
          actions.setView('deck');
        },
      },
      {
        kind: 'command',
        id: 'view-matrix',
        title: 'View: Foundry Matrix',
        meta: 'VIEW',
        run: () => {
          actions.foley.latch();
          actions.setView('matrix');
        },
      },
      {
        kind: 'command',
        id: 'view-split',
        title: 'View: Split Control',
        meta: 'VIEW',
        run: () => {
          actions.foley.latch();
          actions.setView('split');
        },
      },
      {
        kind: 'command',
        id: 'filter-hot',
        title: 'Filter: Hot (<7d)',
        meta: 'FILTER',
        run: () => {
          actions.foley.latch();
          actions.setView('deck');
          actions.setFilter('HOT_7D');
        },
      },
      {
        kind: 'command',
        id: 'show-hidden',
        title: 'Show Hidden Repos',
        meta: latestModel?.vaultState?.showHidden ? 'ON' : 'OFF',
        run: () => {
          actions.foley.latch();
          const cur = Boolean(latestModel?.vaultState?.showHidden);
          void actions.setPreference('showHidden', !cur);
        },
      },
      {
        kind: 'command',
        id: 'toggle-audio',
        title: 'Toggle Hardware Click Audio',
        meta: latestModel?.vaultState?.audioMuted ? 'MUTED' : 'ACTIVE',
        run: () => {
          actions.toggleAudio();
        },
      },
      {
        kind: 'command',
        id: 'export-config',
        title: 'Export Deck Config JSON',
        meta: 'VAULT',
        run: () => {
          actions.foley.click();
          actions.exportConfig();
        },
      },
      {
        kind: 'command',
        id: 'import-config',
        title: 'Import Deck Config JSON',
        meta: 'VAULT',
        run: () => {
          actions.foley.click();
          actions.openImportConfigPicker();
        },
      },
      {
        kind: 'command',
        id: 'open-settings',
        title: 'Open API Quota & PAT Vault',
        meta: 'DIAG // PAT',
        run: () => {
          actions.foley.click();
          actions.openSettingsModal(lastTriggerEl);
        },
      },
    ];
  }

  function buildRankedItems(query) {
    const commands = buildSystemCommands();
    const repos = Array.isArray(latestModel?.allRepos) ? latestModel.allRepos : [];

    const scoredCommands = [];
    for (const cmd of commands) {
      const score = fuzzyScore(query, `${cmd.title} ${cmd.meta}`);
      if (score > 0) {
        scoredCommands.push({ ...cmd, score: query.trim() ? score + 10 : score });
      }
    }

    const scoredRepos = [];
    for (const repo of repos) {
      const searchStr = [
        repo.effectiveTitle,
        repo.slug,
        repo.effectiveCategory,
        repo.primaryLanguage,
        repo.effectiveDescription,
        ...(repo.topics || []),
      ]
        .filter(Boolean)
        .join(' ');
      const titleScore = fuzzyScore(query, repo.effectiveTitle);
      const slugScore = fuzzyScore(query, repo.slug);
      const bodyScore = fuzzyScore(query, searchStr);
      const best = Math.max(titleScore * 1.25, slugScore * 1.15, bodyScore);
      if (best > 0) {
        scoredRepos.push({
          kind: 'repo',
          id: `repo:${repo.slug}`,
          repo,
          score: best,
        });
      }
    }

    if (!query.trim()) {
      return [...scoredCommands, ...scoredRepos];
    }

    return [...scoredCommands, ...scoredRepos].sort((a, b) => b.score - a.score);
  }

  function renderResults() {
    visibleItems = buildRankedItems(input.value);
    if (activeIndex >= visibleItems.length) {
      activeIndex = Math.max(0, visibleItems.length - 1);
    }

    if (visibleItems.length === 0) {
      resultsEl.replaceChildren(
        el('div', { class: 'bezel-blueprint' }, [
          el('span', { class: 'chip' }, ['NO COMMANDS OR MODULES MATCH']),
        ])
      );
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleItems.forEach((item, idx) => {
      const isActive = idx === activeIndex;
      let leftText = '';
      let rightChips = [];

      if (item.kind === 'command') {
        leftText = item.title;
        rightChips = [
          el('span', { class: 'chip' }, ['CMD']),
          el('span', { class: 'keycap' }, [item.meta]),
        ];
      } else {
        const r = item.repo;
        leftText = `${r.effectiveTitle} (${r.slug})`;
        if (r.isPinned) {
          rightChips.push(el('span', { class: 'chip' }, ['PINNED']));
        }
        if (r.isHidden) {
          rightChips.push(el('span', { class: 'chip' }, ['HIDDEN']));
        }
        rightChips.push(
          el('span', { class: 'surface-tag' }, [
            r.isLiveApp ? 'WEB APP' : 'CLI / REPO',
          ])
        );
      }

      const rowBtn = el(
        'button',
        {
          type: 'button',
          role: 'option',
          class: isActive ? 'palette-item palette-item--active' : 'palette-item',
          'aria-selected': isActive ? 'true' : 'false',
        },
        [
          el('span', {}, [leftText]),
          el('span', { class: 'bento-card__actions' }, rightChips),
        ]
      );

      rowBtn.addEventListener('mouseenter', () => {
        if (activeIndex !== idx) {
          activeIndex = idx;
          updateActiveHighlight();
        }
      });

      rowBtn.addEventListener('click', (e) => {
        activeIndex = idx;
        executeActiveItem(e);
      });

      fragment.appendChild(rowBtn);
    });

    resultsEl.replaceChildren(fragment);
  }

  function updateActiveHighlight() {
    const items = Array.from(resultsEl.querySelectorAll('.palette-item'));
    items.forEach((node, idx) => {
      const isActive = idx === activeIndex;
      node.classList.toggle('palette-item--active', isActive);
      node.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isActive) {
        node.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function executeActiveItem(event) {
    const item = visibleItems[activeIndex];
    if (!item) return;

    if (item.kind === 'command') {
      close();
      item.run();
      return;
    }

    const repo = item.repo;
    if (event?.shiftKey) {
      actions.foley.click();
      const repoUrl = sanitizeHttpUrl(repo.htmlUrl);
      close();
      if (repoUrl) {
        window.open(repoUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (event?.altKey) {
      actions.foley.latch();
      close();
      actions.openInlinePeek(repo);
      return;
    }

    close();
    actions.launchRepo(repo);
  }

  function isOpen() {
    return !backdrop.hidden;
  }

  function open(triggerEl = null) {
    if (isOpen()) {
      input.focus();
      input.select();
      return;
    }
    lastTriggerEl = triggerEl || document.activeElement;
    input.value = '';
    activeIndex = 0;
    backdrop.hidden = false;
    renderResults();
    input.focus();
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
    lastTriggerEl = null;
  }

  input.addEventListener('input', () => {
    activeIndex = 0;
    renderResults();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      actions.foley.click();
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        activeIndex = (activeIndex + 1) % visibleItems.length;
        actions.foley.tick();
        updateActiveHighlight();
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
        actions.foley.tick();
        updateActiveHighlight();
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeActiveItem(e);
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      const item = visibleItems[activeIndex];
      if (item?.kind === 'repo') {
        e.preventDefault();
        actions.foley.latch();
        void actions.togglePin(item.repo.slug);
      }
    }
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      actions.foley.click();
      close();
    }
  });

  function handleGlobalKeydown(e) {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 'k') {
      e.preventDefault();
      if (isOpen()) {
        actions.foley.click();
        close();
      } else {
        actions.foley.click();
        open();
      }
      return;
    }

    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isOpen()) {
      const target = e.target;
      const tagName = target?.tagName?.toUpperCase() || '';
      const isEditable =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);
      if (isEditable || actions.hasBlockingOverlayOpen()) {
        return;
      }
      e.preventDefault();
      actions.foley.click();
      open();
    }
  }

  document.addEventListener('keydown', handleGlobalKeydown);

  function update(model) {
    latestModel = model;
    if (isOpen()) {
      renderResults();
    }
  }

  function destroy() {
    document.removeEventListener('keydown', handleGlobalKeydown);
    backdrop.remove();
  }

  return { open, close, update, isOpen, destroy };
}
