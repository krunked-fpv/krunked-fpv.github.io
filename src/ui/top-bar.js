import { mountChronoPulse } from '../graphics/chrono-pulse.js';

const VIEWS = [
  { id: 'deck', label: 'DECK' },
  { id: 'matrix', label: 'MATRIX' },
  { id: 'split', label: 'SPLIT' },
];

/**
 * Mounts the sticky Top Telemetry Chassis Bar, 90-day Chrono-Pulse scrubber,
 * 1000ms live push delta stopwatch, view switcher, and hardware toggles.
 *
 * @param {{ container: HTMLElement, utils: object, actions: object }} deps
 * @returns {{ update: (model: object) => void, destroy: () => void }}
 */
export function createTopBar({ container, utils, actions }) {
  const { el, svgIcon, formatStopwatch } = utils;

  const brandGroup = el('div', { class: 'top-bar__brand' });
  const brandMark = el('div', { class: 'brand-mark', 'aria-hidden': 'true' }, [
    svgIcon('brand', 18),
  ]);
  const brandTitle = el('h1', { class: 'brand-title' }, ['KRUNKED // DECK']);

  const syncLed = el('span', { class: 'sync-pill__led', 'aria-hidden': 'true' });
  const syncLabel = el('span', { class: 'sync-pill__text' }, ['SNAPSHOT CACHE']);
  const syncPill = el(
    'button',
    {
      type: 'button',
      class: 'sync-pill',
      'data-tier': 'cached',
      title: 'Open API Quota & Sync Diagnostics',
      'aria-label': 'Telemetry sync status. Activate to open API Quota and Diagnostics.',
    },
    [syncLed, syncLabel]
  );
  syncPill.addEventListener('click', () => {
    actions.foley.click();
    actions.openSettingsModal(syncPill);
  });

  const syncBtn = el(
    'button',
    {
      type: 'button',
      class: 'hw-btn hw-btn--ghost',
      title: 'Sync GitHub Telemetry Now',
    },
    ['SYNC']
  );
  syncBtn.addEventListener('click', () => {
    actions.foley.click();
    void actions.syncNow({ manual: true });
  });

  brandGroup.append(brandMark, brandTitle, syncPill, syncBtn);

  const chronoGroup = el('div', { class: 'top-bar__chrono' });
  const chronoStripEl = el('div', { class: 'chrono-strip' });
  const clearWindowBtn = el(
    'button',
    {
      type: 'button',
      class: 'chrono-clear-btn',
      hidden: true,
      title: 'Clear active 90-day sprint window filter',
    },
    ['CLEAR WINDOW']
  );
  clearWindowBtn.addEventListener('click', () => {
    actions.foley.latch();
    actions.setSprintWindow(null);
  });
  chronoGroup.append(chronoStripEl, clearWindowBtn);

  const chronoController = mountChronoPulse(chronoStripEl, {
    days90: [],
    activeWindow: null,
    onSelectWindow: (win) => {
      actions.foley.latch();
      actions.setSprintWindow(win);
    },
    onTickSound: () => actions.foley.tick(),
  });

  function createReadout(labelText) {
    const valueEl = el('span', { class: 'metric-readout__value', 'data-tabular': '1' }, ['--']);
    const wrap = el('div', { class: 'metric-readout' }, [
      el('span', { class: 'metric-readout__label' }, [labelText]),
      valueEl,
    ]);
    return { wrap, valueEl };
  }

  const telemetryGroup = el('div', { class: 'top-bar__telemetry' });
  const liveAppsReadout = createReadout('LIVE APPS');
  const totalReposReadout = createReadout('TOTAL REPOS');
  const commits30dReadout = createReadout('30D COMMITS');

  const pushClockValue = el('time', { class: 'metric-readout__value', 'data-tabular': '1' }, ['--']);
  const pushClockReadout = el('div', { class: 'metric-readout' }, [
    el('span', { class: 'metric-readout__label' }, ['LAST PUSH']),
    pushClockValue,
  ]);
  telemetryGroup.append(
    liveAppsReadout.wrap,
    totalReposReadout.wrap,
    commits30dReadout.wrap,
    pushClockReadout
  );

  const actionsGroup = el('div', { class: 'top-bar__actions' });

  const paletteBtn = el(
    'button',
    {
      type: 'button',
      class: 'hw-btn',
      title: 'Open Command Palette (Cmd/Ctrl+K or /)',
      'aria-label': 'Open Command Palette',
    },
    ['\u2318K']
  );
  paletteBtn.addEventListener('click', () => {
    actions.foley.click();
    actions.openCommandPalette(paletteBtn);
  });

  const viewSwitcher = el('div', {
    class: 'view-switcher',
    role: 'group',
    'aria-label': 'Workspace view mode',
  });
  const viewButtons = new Map();
  for (const v of VIEWS) {
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'view-switcher__btn',
        'data-view': v.id,
        'aria-pressed': 'false',
      },
      [v.label]
    );
    btn.addEventListener('click', () => {
      actions.foley.latch();
      actions.setView(v.id);
    });
    viewButtons.set(v.id, btn);
    viewSwitcher.appendChild(btn);
  }

  const installBtn = el(
    'button',
    {
      type: 'button',
      class: 'hw-btn hw-btn--install',
      title: 'Install KRUNKED // DECK as standalone app',
    },
    ['INSTALL DECK']
  );
  installBtn.addEventListener('click', () => {
    actions.foley.relay();
    void actions.triggerInstall();
  });

  const dismissInstallBtn = el(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Dismiss install deck button',
      title: 'Dismiss install prompt',
    },
    [svgIcon('close', 12)]
  );
  dismissInstallBtn.addEventListener('click', () => {
    actions.foley.click();
    actions.dismissInstall();
  });

  const installWrap = el('div', { class: 'install-wrap', hidden: true }, [
    installBtn,
    dismissInstallBtn,
  ]);

  const audioBtn = el(
    'button',
    {
      type: 'button',
      class: 'hw-btn hw-btn--ghost',
      'aria-pressed': 'false',
      title: 'Toggle Hardware Micro-Foley Audio',
    },
    ['SFX: OFF']
  );
  audioBtn.addEventListener('click', () => {
    actions.toggleAudio();
  });

  const themeBtn = el(
    'button',
    {
      type: 'button',
      class: 'hw-btn hw-btn--ghost',
      'aria-pressed': 'false',
      title: 'Switch Theme: Obsidian / Braun Daylight',
    },
    ['OBSIDIAN']
  );
  themeBtn.addEventListener('click', () => {
    actions.foley.latch();
    actions.toggleTheme();
  });

  const settingsBtn = el(
    'button',
    {
      type: 'button',
      class: 'hw-btn hw-btn--ghost',
      title: 'API Quota, Vault Diagnostics & PAT Vault',
      'aria-label': 'Open Settings, Diagnostics, and PAT Vault',
    },
    ['VAULT // PAT']
  );
  settingsBtn.addEventListener('click', () => {
    actions.foley.click();
    actions.openSettingsModal(settingsBtn);
  });

  actionsGroup.append(
    paletteBtn,
    viewSwitcher,
    installWrap,
    audioBtn,
    themeBtn,
    settingsBtn
  );

  container.replaceChildren(brandGroup, chronoGroup, telemetryGroup, actionsGroup);

  let lastPushIso = null;
  let lastChronoRef = null;
  let lastWindowSig = '';

  function refreshPushClock() {
    if (!lastPushIso) {
      pushClockValue.textContent = '--';
      pushClockValue.removeAttribute('datetime');
      return;
    }
    pushClockValue.setAttribute('datetime', lastPushIso);
    pushClockValue.textContent = formatStopwatch(lastPushIso, Date.now());
  }

  const clockTimer = setInterval(refreshPushClock, 1000);

  function update(model) {
    const {
      snapshot,
      syncStatus,
      vaultState,
      activeSprintWindow,
      canInstall,
      isStandalone,
      patConfigured,
    } = model;

    const mode = syncStatus?.mode || 'SNAPSHOT CACHE';
    const tier = syncStatus?.badgeTier || 'cached';
    const isSyncing = mode === 'SYNCING...';

    syncPill.dataset.tier = tier;
    syncPill.classList.toggle('is-syncing', isSyncing);
    syncLabel.textContent = mode;
    syncBtn.disabled = isSyncing;
    syncBtn.textContent = isSyncing ? 'SYNCING' : 'SYNC';

    const totals = snapshot?.totals || {};
    liveAppsReadout.valueEl.textContent = String(totals.liveApps ?? 0);
    totalReposReadout.valueEl.textContent = String(totals.totalRepos ?? 0);
    commits30dReadout.valueEl.textContent = String(totals.commits30d ?? 0);

    lastPushIso = totals.lastPushAt || null;
    refreshPushClock();

    const days90 = snapshot?.chronoPulse90d || [];
    const winSig = activeSprintWindow
      ? `${activeSprintWindow.startDate}:${activeSprintWindow.endDate}`
      : '';
    if (days90 !== lastChronoRef || winSig !== lastWindowSig) {
      lastChronoRef = days90;
      lastWindowSig = winSig;
      chronoController.update({
        days90,
        activeWindow: activeSprintWindow,
      });
    }

    if (activeSprintWindow) {
      clearWindowBtn.hidden = false;
      clearWindowBtn.title = `Clear window ${activeSprintWindow.startDate} to ${activeSprintWindow.endDate}`;
    } else {
      clearWindowBtn.hidden = true;
    }

    const activeView = vaultState?.view || 'deck';
    for (const [id, btn] of viewButtons.entries()) {
      const isCurrent = id === activeView;
      btn.classList.toggle('is-active', isCurrent);
      btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    }

    const showInstall = Boolean(canInstall && !isStandalone && !vaultState?.installDismissed);
    installWrap.hidden = !showInstall;

    const soundOn = !vaultState?.audioMuted;
    audioBtn.textContent = soundOn ? 'SFX: ON' : 'SFX: OFF';
    audioBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    audioBtn.classList.toggle('is-active', soundOn);

    const isDaylight = vaultState?.theme === 'daylight';
    themeBtn.textContent = isDaylight ? 'DAYLIGHT' : 'OBSIDIAN';
    themeBtn.setAttribute('aria-pressed', isDaylight ? 'true' : 'false');

    settingsBtn.textContent = patConfigured ? 'VAULT // PAT*' : 'VAULT // PAT';
  }

  function destroy() {
    clearInterval(clockTimer);
    chronoController.destroy();
    container.replaceChildren();
  }

  return { update, destroy };
}
