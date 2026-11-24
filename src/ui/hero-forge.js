import { sanitizeHttpUrl } from '../telemetry/classifier.js';
import { mountSparkline } from '../graphics/sparkline.js';

const SANDBOX_TOKENS = 'allow-scripts allow-same-origin allow-forms allow-popups';

function normalizePathname(pathname) {
  const cleaned = String(pathname || '/').replace(/\/index\.html$/i, '/').replace(/\/+$/, '');
  return cleaned || '/';
}

/**
 * Recursive Self-Frame Guard.
 * Blocks iframe creation if the repo is the self-deck or if the candidate URL
 * normalizes to the active origin+pathname or the canonical krunked-fpv.github.io root.
 *
 * @param {object | null} repo
 * @param {string | null | undefined} candidateUrl
 * @returns {{ blocked: boolean, reason: string | null, normalizedUrl: string | null }}
 */
export function isSelfHostedPeekTarget(repo, candidateUrl) {
  const safeUrl = sanitizeHttpUrl(candidateUrl);

  if (repo?.isSelfDeck) {
    return {
      blocked: true,
      reason: 'SELF_DECK_REPO',
      normalizedUrl: safeUrl || 'https://krunked-fpv.github.io/',
    };
  }

  if (!safeUrl) {
    return {
      blocked: true,
      reason: 'NO_LIVE_ENDPOINT',
      normalizedUrl: null,
    };
  }

  try {
    const parsed = new URL(safeUrl);
    const normPath = normalizePathname(parsed.pathname);

    if (parsed.origin.toLowerCase() === 'https://krunked-fpv.github.io' && normPath === '/') {
      return {
        blocked: true,
        reason: 'CANONICAL_SELF_ROOT',
        normalizedUrl: safeUrl,
      };
    }

    if (
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ) {
      const winNormPath = normalizePathname(window.location.pathname);
      if (parsed.origin === window.location.origin && normPath === winNormPath) {
        return {
          blocked: true,
          reason: 'ACTIVE_ORIGIN_MATCH',
          normalizedUrl: safeUrl,
        };
      }
    }

    return {
      blocked: false,
      reason: null,
      normalizedUrl: safeUrl,
    };
  } catch {
    return {
      blocked: true,
      reason: 'INVALID_URL',
      normalizedUrl: null,
    };
  }
}

/**
 * Shared sandboxed Live Peek bezel controller used by Hero Forge and Split Control view.
 * Enforces the Recursive Self-Frame Guard before creating any <iframe> element.
 *
 * @param {{ utils: object, actions: object, onStateChange?: () => void }} deps
 * @returns {{ el: HTMLElement, setRepo: (repo: object | null) => void, openPeek: () => void, closePeek: () => void, isOpen: () => boolean }}
 */
export function createLivePeekBezel({ utils, actions }) {
  const { el, createRepoIcon } = utils;

  const bezel = el('div', { class: 'hero-forge__bezel' });

  const statusText = el('span', { class: 'bezel-status-text' }, ['STANDBY']);
  const urlReadout = el('span', { class: 'bezel-url-text' }, ['--']);
  urlReadout.style.overflow = 'hidden';
  urlReadout.style.textOverflow = 'ellipsis';
  urlReadout.style.whiteSpace = 'nowrap';
  urlReadout.style.maxWidth = '240px';

  const leftInfo = el('div', {}, [statusText, urlReadout]);
  leftInfo.style.display = 'flex';
  leftInfo.style.alignItems = 'center';
  leftInfo.style.gap = '10px';
  leftInfo.style.minWidth = '0';

  const peekToggleBtn = el('button', { type: 'button', class: 'hw-btn' }, ['LIVE PEEK']);
  const aspectToggleBtn = el('button', { type: 'button', class: 'hw-btn hw-btn--ghost' }, [
    'DESKTOP (16:10)',
  ]);
  const reloadBtn = el(
    'button',
    { type: 'button', class: 'hw-btn hw-btn--ghost', disabled: true },
    ['RELOAD']
  );

  const rightControls = el('div', {}, [aspectToggleBtn, reloadBtn, peekToggleBtn]);
  rightControls.style.display = 'flex';
  rightControls.style.alignItems = 'center';
  rightControls.style.gap = '6px';
  rightControls.style.flexWrap = 'wrap';

  const toolbar = el('div', { class: 'bezel-toolbar' }, [leftInfo, rightControls]);
  const viewport = el('div', { class: 'bezel-viewport' });

  bezel.append(toolbar, viewport);

  let currentRepo = null;
  let peekOpen = false;
  let mobileAspect = false;
  let activeIframe = null;
  let renderedUrl = null;
  let renderedKey = null;

  function renderViewportContent() {
    viewport.classList.toggle('bezel-viewport--mobile', mobileAspect);
    aspectToggleBtn.textContent = mobileAspect ? 'MOBILE (390x844)' : 'DESKTOP (16:10)';
    aspectToggleBtn.classList.toggle('is-active', mobileAspect);
    aspectToggleBtn.setAttribute('aria-pressed', mobileAspect ? 'true' : 'false');

    if (!currentRepo) {
      activeIframe = null;
      renderedUrl = null;
      renderedKey = null;
      statusText.textContent = 'NO MODULE';
      urlReadout.textContent = '--';
      peekToggleBtn.textContent = 'LIVE PEEK';
      peekToggleBtn.disabled = true;
      reloadBtn.disabled = true;
      viewport.replaceChildren(
        el('div', { class: 'bezel-blueprint' }, [
          el('span', { class: 'chip' }, ['TELEMETRY STANDBY']),
          el('p', {}, ['No active module selected.']),
        ])
      );
      return;
    }

    const candidateUrl = currentRepo.effectiveLiveUrl;
    const guard = isSelfHostedPeekTarget(currentRepo, candidateUrl);
    const hasEndpoint = Boolean(candidateUrl);

    peekToggleBtn.disabled = !hasEndpoint && !currentRepo.isSelfDeck;
    peekToggleBtn.textContent = peekOpen ? 'CLOSE PEEK' : 'LIVE PEEK';
    peekToggleBtn.classList.toggle('hw-btn--primary', !peekOpen && hasEndpoint);
    peekToggleBtn.classList.toggle('hw-btn--ghost', peekOpen);
    urlReadout.textContent = candidateUrl || currentRepo.htmlUrl || '--';

    if (!peekOpen) {
      activeIframe = null;
      renderedUrl = null;
      renderedKey = null;
      reloadBtn.disabled = true;
      statusText.textContent = hasEndpoint ? 'STANDBY' : 'CLI // REPO';

      const blueprint = el('div', { class: 'bezel-blueprint' }, [
        el('div', { class: 'bento-card__icon' }, [createRepoIcon(currentRepo, 36)]),
        el('span', { class: 'chip' }, [
          hasEndpoint ? 'SANDBOXED LIVE PEEK READY' : 'CLI / REPOSITORY MODULE',
        ]),
        el('strong', {}, [currentRepo.effectiveTitle]),
        el('span', {}, [candidateUrl || currentRepo.htmlUrl || 'No live endpoint published']),
      ]);

      if (hasEndpoint || currentRepo.isSelfDeck) {
        const triggerBtn = el(
          'button',
          { type: 'button', class: 'hw-btn hw-btn--primary' },
          ['LIVE PEEK']
        );
        triggerBtn.addEventListener('click', () => {
          actions.foley.latch();
          openPeek();
        });
        blueprint.appendChild(triggerBtn);
      } else {
        const openRepoLink = el(
          'a',
          {
            class: 'hw-btn',
            href: sanitizeHttpUrl(currentRepo.htmlUrl) || '#',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          ['OPEN GITHUB REPO']
        );
        blueprint.appendChild(openRepoLink);
      }

      viewport.replaceChildren(blueprint);
      return;
    }

    if (guard.blocked) {
      activeIframe = null;
      renderedUrl = null;
      renderedKey = null;
      reloadBtn.disabled = true;
      statusText.textContent =
        guard.reason === 'NO_LIVE_ENDPOINT' ? 'NO ENDPOINT' : 'SELF-FRAME GUARD';

      const notice = el('div', { class: 'bezel-guard-notice' }, [
        el('span', { class: 'led-badge led-badge--hot' }, [
          el('span', { class: 'led-dot', 'aria-hidden': 'true' }),
          guard.reason === 'NO_LIVE_ENDPOINT'
            ? 'LIVE ENDPOINT UNAVAILABLE'
            : 'RECURSIVE SELF-IFRAME BLOCKED',
        ]),
        el('strong', {}, [
          guard.reason === 'NO_LIVE_ENDPOINT'
            ? 'NO LIVE PAGES ENDPOINT // OPEN REPO DIRECT'
            : 'SELF-HOSTED TELEMETRY SURFACE // LAUNCH DIRECT',
        ]),
        el('span', {}, [guard.normalizedUrl || currentRepo.htmlUrl || currentRepo.slug]),
      ]);

      const btnRow = el('div', { class: 'hero-forge__actions' });
      const launchDirectBtn = el(
        'button',
        { type: 'button', class: 'hw-btn hw-btn--primary' },
        ['LAUNCH APP \u21B5']
      );
      launchDirectBtn.addEventListener('click', () => {
        actions.launchRepo(currentRepo);
      });
      const closeBtn = el(
        'button',
        { type: 'button', class: 'hw-btn hw-btn--ghost' },
        ['CLOSE PEEK']
      );
      closeBtn.addEventListener('click', () => {
        actions.foley.click();
        closePeek();
      });
      btnRow.append(launchDirectBtn, closeBtn);
      notice.appendChild(btnRow);

      viewport.replaceChildren(notice);
      return;
    }

    reloadBtn.disabled = false;
    statusText.textContent = 'SANDBOX STREAM';

    const nextKey = `${currentRepo.slug}::${guard.normalizedUrl}`;
    if (activeIframe && renderedKey === nextKey && activeIframe.parentNode === viewport) {
      activeIframe.style.maxWidth = mobileAspect ? '390px' : '100%';
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'bezel-iframe';
    iframe.setAttribute('sandbox', SANDBOX_TOKENS);
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('loading', 'eager');
    iframe.title = `${currentRepo.effectiveTitle} live preview`;
    iframe.src = guard.normalizedUrl;
    if (mobileAspect) {
      iframe.style.maxWidth = '390px';
    }

    iframe.addEventListener('load', () => {
      if (activeIframe === iframe) {
        statusText.textContent = 'LIVE SANDBOX';
      }
    });
    iframe.addEventListener('error', () => {
      if (activeIframe === iframe) {
        statusText.textContent = 'FRAME ERROR';
      }
    });

    activeIframe = iframe;
    renderedUrl = guard.normalizedUrl;
    renderedKey = nextKey;
    viewport.replaceChildren(iframe);
  }

  peekToggleBtn.addEventListener('click', () => {
    actions.foley.latch();
    peekOpen = !peekOpen;
    renderViewportContent();
  });

  aspectToggleBtn.addEventListener('click', () => {
    actions.foley.click();
    mobileAspect = !mobileAspect;
    renderViewportContent();
  });

  reloadBtn.addEventListener('click', () => {
    if (!activeIframe || !renderedUrl) return;
    actions.foley.click();
    statusText.textContent = 'RELOADING...';
    try {
      activeIframe.contentWindow?.location.reload();
    } catch {
      activeIframe.src = renderedUrl;
    }
  });

  function setRepo(repo) {
    currentRepo = repo || null;
    renderViewportContent();
  }

  function openPeek() {
    peekOpen = true;
    renderViewportContent();
  }

  function closePeek() {
    peekOpen = false;
    renderViewportContent();
  }

  return {
    el: bezel,
    setRepo,
    openPeek,
    closePeek,
    isOpen: () => peekOpen,
  };
}

/**
 * Mounts the "FRESH OFF THE FORGE" Hero Stage with a 4-slot quick-select rail
 * for the Top 4 Most Recently Shipped live apps, defaulting to the #1 non-self
 * runnable live app while keeping KRUNKED // DECK in the rail.
 *
 * @param {{ container: HTMLElement, utils: object, actions: object }} deps
 * @returns {{ update: (model: object) => void, openPeekForRepo: (repo: object) => void, destroy: () => void }}
 */
export function createHeroForge({ container, utils, actions }) {
  const { el, createThermalBadge, createRepoIcon, formatStopwatch } = utils;

  const section = el('div', { class: 'hero-forge' });

  const eyebrow = el('div', { class: 'hero-forge__eyebrow' }, ['FRESH OFF THE FORGE']);
  const railEl = el('div', {
    class: 'hero-forge__rail',
    role: 'tablist',
    'aria-label': 'Top 4 recently shipped live apps',
  });
  const header = el('div', { class: 'hero-forge__header' }, [eyebrow, railEl]);

  const bezel = createLivePeekBezel({ utils, actions });

  const badgesRow = el('div', { class: 'bento-card__actions' });
  const iconSlot = el('div', { class: 'bento-card__icon' });
  const titleEl = el('h2', { class: 'hero-forge__title' }, ['--']);
  const titleWrap = el('div', {}, [iconSlot, titleEl]);
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'center';
  titleWrap.style.gap = '12px';
  titleWrap.style.minWidth = '0';

  const descEl = el('p', { class: 'hero-forge__desc' }, ['']);

  const sparkWrap = el('div', { class: 'hero-forge__spark' });
  const commitsCountEl = el('span', {}, ['0 COMMITS (30D)']);
  const pushClockEl = el('time', { 'data-tabular': '1' }, ['--']);
  const commitChipEl = el('div', { class: 'commit-chip' });

  const telemetryBox = el('div', { class: 'hero-forge__telemetry' }, [
    sparkWrap,
    commitsCountEl,
    pushClockEl,
    commitChipEl,
  ]);

  const launchBtn = el(
    'button',
    { type: 'button', class: 'hw-btn hw-btn--primary' },
    ['LAUNCH APP \u21B5']
  );
  const qrBtn = el('button', { type: 'button', class: 'hw-btn' }, ['MOBILE QR']);
  const inspectBtn = el('button', { type: 'button', class: 'hw-btn' }, ['INSPECT']);
  const sourceLink = el(
    'a',
    {
      class: 'hw-btn hw-btn--ghost',
      href: '#',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    ['SOURCE']
  );

  const actionsRow = el('div', { class: 'hero-forge__actions' }, [
    launchBtn,
    qrBtn,
    inspectBtn,
    sourceLink,
  ]);

  const metaCol = el('div', { class: 'hero-forge__meta' }, [
    el('div', {}, [badgesRow, titleWrap, descEl]),
    telemetryBox,
    actionsRow,
  ]);
  metaCol.firstElementChild.style.display = 'flex';
  metaCol.firstElementChild.style.flexDirection = 'column';
  metaCol.firstElementChild.style.gap = '10px';

  const grid = el('div', { class: 'hero-forge__grid' }, [bezel.el, metaCol]);
  section.append(header, grid);
  container.replaceChildren(section);

  let selectedSlug = null;
  let userSelected = false;
  let overrideRepo = null;
  let currentTop4 = [];
  let activeRepo = null;

  launchBtn.addEventListener('click', () => {
    if (activeRepo) actions.launchRepo(activeRepo);
  });
  qrBtn.addEventListener('click', () => {
    if (activeRepo) {
      actions.foley.click();
      actions.openQrModal(activeRepo, qrBtn);
    }
  });
  inspectBtn.addEventListener('click', () => {
    if (activeRepo) {
      actions.foley.click();
      actions.openInspector(activeRepo.slug, inspectBtn);
    }
  });

  function refreshPushClock() {
    if (!activeRepo?.pushedAt) {
      pushClockEl.textContent = '--';
      pushClockEl.removeAttribute('datetime');
      return;
    }
    pushClockEl.setAttribute('datetime', activeRepo.pushedAt);
    pushClockEl.textContent = formatStopwatch(activeRepo.pushedAt, Date.now());
  }

  const clockTimer = setInterval(refreshPushClock, 1000);

  function renderActiveRepo() {
    const repo = activeRepo;
    if (!repo) {
      titleEl.textContent = 'NO LIVE MODULES';
      descEl.textContent = 'Sync telemetry or adjust filters to inspect repositories.';
      badgesRow.replaceChildren();
      iconSlot.replaceChildren();
      sparkWrap.replaceChildren();
      commitChipEl.replaceChildren();
      commitsCountEl.textContent = '0 COMMITS (30D)';
      launchBtn.disabled = true;
      qrBtn.disabled = true;
      inspectBtn.disabled = true;
      bezel.setRepo(null);
      refreshPushClock();
      return;
    }

    launchBtn.disabled = !repo.effectiveLiveUrl;
    qrBtn.disabled = !repo.effectiveLiveUrl && !repo.htmlUrl;
    inspectBtn.disabled = false;

    const badges = [
      createThermalBadge(repo.thermal),
      el('span', { class: 'chip' }, [repo.effectiveCategory]),
    ];
    if (repo.isSelfDeck) {
      badges.push(el('span', { class: 'chip' }, ['SELF SURFACE']));
    }
    if (repo.isPrivate) {
      badges.push(
        el('span', { class: 'led-badge led-badge--private' }, [
          el('span', { class: 'led-dot', 'aria-hidden': 'true' }),
          'PRIVATE',
        ])
      );
    }
    badgesRow.replaceChildren(...badges);

    iconSlot.replaceChildren(createRepoIcon(repo, 36));
    titleEl.textContent = repo.effectiveTitle;
    descEl.textContent = repo.effectiveDescription;

    mountSparkline(sparkWrap, repo.commits30d, {
      width: 156,
      height: 28,
      accentColor: repo.effectiveAccentHex || 'var(--led-hot, #FF4F00)',
    });

    commitsCountEl.textContent = `${repo.commits30dTotal || 0} COMMITS (30D)`;
    refreshPushClock();

    const latest = Array.isArray(repo.recentCommits) ? repo.recentCommits[0] : null;
    if (latest) {
      const shaUrl = sanitizeHttpUrl(latest.url) || sanitizeHttpUrl(repo.htmlUrl) || '#';
      const shaLink = el(
        'a',
        { href: shaUrl, target: '_blank', rel: 'noopener noreferrer' },
        [latest.sha7 || 'HEAD']
      );
      shaLink.style.color = 'var(--led-hot-ink)';
      shaLink.style.textDecoration = 'none';
      const msgSpan = el('span', {}, [latest.message || 'Commit recorded']);
      msgSpan.style.overflow = 'hidden';
      msgSpan.style.textOverflow = 'ellipsis';
      commitChipEl.replaceChildren(shaLink, msgSpan);
      commitChipEl.hidden = false;
    } else {
      commitChipEl.replaceChildren(el('span', {}, ['NO RECENT COMMITS']));
    }

    const safeRepoUrl = sanitizeHttpUrl(repo.htmlUrl);
    if (safeRepoUrl) {
      sourceLink.href = safeRepoUrl;
      sourceLink.removeAttribute('aria-disabled');
    } else {
      sourceLink.href = '#';
      sourceLink.setAttribute('aria-disabled', 'true');
    }

    bezel.setRepo(repo);
  }

  function renderRail() {
    const buttons = currentTop4.map((repo, idx) => {
      const isSelected = activeRepo && repo.slug === activeRepo.slug;
      const dotColor =
        repo.thermal?.tier === 'hot'
          ? 'var(--led-hot)'
          : repo.thermal?.tier === 'active'
            ? 'var(--led-active)'
            : 'var(--led-online)';
      const dot = el('span', { class: 'led-dot', 'aria-hidden': 'true' });
      dot.style.backgroundColor = dotColor;

      const slotTag = repo.isSelfDeck ? 'SELF' : `0${idx + 1}`;
      const slotBtn = el(
        'button',
        {
          type: 'button',
          class: isSelected ? 'rail-slot is-active' : 'rail-slot',
          role: 'tab',
          'aria-selected': isSelected ? 'true' : 'false',
          title: `${repo.effectiveTitle} (${repo.slug})`,
        },
        [dot, el('span', {}, [`[${slotTag}] ${repo.effectiveTitle}`])]
      );

      slotBtn.addEventListener('click', () => {
        actions.foley.click();
        userSelected = true;
        overrideRepo = null;
        selectedSlug = repo.slug;
        activeRepo = repo;
        renderRail();
        renderActiveRepo();
      });

      return slotBtn;
    });

    railEl.replaceChildren(...buttons);
  }

  function update(model) {
    currentTop4 = Array.isArray(model.top4Repos) ? model.top4Repos.slice(0, 4) : [];

    if (overrideRepo) {
      const refreshed = (model.allRepos || []).find((r) => r.slug === overrideRepo.slug);
      activeRepo = refreshed || overrideRepo;
    } else if (userSelected && selectedSlug) {
      activeRepo =
        currentTop4.find((r) => r.slug === selectedSlug) ||
        currentTop4.find((r) => !r.isSelfDeck) ||
        currentTop4[0] ||
        null;
      selectedSlug = activeRepo?.slug || null;
    } else {
      activeRepo = currentTop4.find((r) => !r.isSelfDeck) || currentTop4[0] || null;
      selectedSlug = activeRepo?.slug || null;
    }

    renderRail();
    renderActiveRepo();
  }

  function openPeekForRepo(repo) {
    if (!repo) return;
    userSelected = true;
    selectedSlug = repo.slug;
    overrideRepo = currentTop4.some((r) => r.slug === repo.slug) ? null : repo;
    activeRepo = repo;
    renderRail();
    renderActiveRepo();
    bezel.openPeek();
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function destroy() {
    clearInterval(clockTimer);
    container.replaceChildren();
  }

  return { update, openPeekForRepo, destroy };
}
