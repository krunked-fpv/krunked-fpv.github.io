import { sanitizeHttpUrl } from '../telemetry/classifier.js';
import { mountQrSvg } from '../graphics/qr-svg.js';

/**
 * Mounts the Mobile QR Modal and Settings / Diagnostics / PAT Vault Modal.
 * Never exposes or renders the raw PAT string in DOM or exports.
 *
 * @param {{ utils: object, actions: object }} deps
 * @returns {{
 *   openQr: (repo: object, triggerEl?: HTMLElement | null) => void,
 *   openSettings: (triggerEl?: HTMLElement | null) => void,
 *   openImportConfigPicker: () => void,
 *   close: () => void,
 *   update: (model: object) => void,
 *   isOpen: () => boolean,
 *   destroy: () => void
 * }}
 */
export function createModals({ utils, actions }) {
  const { el, svgIcon, formatCountdown } = utils;

  const backdrop = el('div', { class: 'modal-backdrop', hidden: true });
  const modal = el('div', {
    class: 'hw-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'hw-modal-title',
    tabindex: '-1',
  });
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    'aria-hidden': 'true',
  });
  document.body.appendChild(fileInput);

  let mode = null; // 'qr' | 'settings' | null
  let qrRepo = null;
  let lastTriggerEl = null;
  let latestModel = null;
  let statusNotice = '';
  let resetCountdownEl = null;

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      await actions.importConfigFile(file);
      actions.foley.relay();
      statusNotice = 'CONFIG IMPORTED & RECONCILED ACROSS TRIPLE VAULT';
    } catch (err) {
      actions.foley.click();
      statusNotice = `IMPORT FAILED: ${err?.message || 'INVALID CONFIG'}`;
    }
    if (isOpen() && mode === 'settings') {
      render();
    }
  });

  function isOpen() {
    return !backdrop.hidden;
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    mode = null;
    qrRepo = null;
    resetCountdownEl = null;
    statusNotice = '';
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

  function refreshRateResetClock() {
    if (!resetCountdownEl) return;
    const resetAt = latestModel?.syncStatus?.rateLimit?.resetAt;
    if (!resetAt) {
      resetCountdownEl.textContent = '--';
      return;
    }
    resetCountdownEl.textContent = formatCountdown(resetAt, Date.now());
  }

  const countdownTimer = setInterval(refreshRateResetClock, 1000);

  function buildModalHeader(titleText) {
    const closeBtn = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Close dialog',
        title: 'Close (ESC)',
      },
      [svgIcon('close', 14)]
    );
    closeBtn.addEventListener('click', () => {
      actions.foley.click();
      close();
    });

    const row = el('div', {}, [
      el('h2', { id: 'hw-modal-title', class: 'bento-card__title' }, [titleText]),
      closeBtn,
    ]);
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '12px';
    return row;
  }

  function renderQrModal() {
    if (!qrRepo) return;
    const targetUrl =
      sanitizeHttpUrl(qrRepo.effectiveLiveUrl) ||
      sanitizeHttpUrl(qrRepo.htmlUrl) ||
      'https://krunked-fpv.github.io/';

    const header = buildModalHeader(`MOBILE QR // ${qrRepo.effectiveTitle}`);

    const qrStage = el('div', { class: 'qr-stage' });
    mountQrSvg(qrStage, targetUrl, {
      size: 220,
      ecLevel: 'M',
      ariaLabel: `QR code for ${qrRepo.effectiveTitle}`,
    });

    const urlChip = el('div', { class: 'commit-chip' }, [targetUrl]);
    urlChip.style.width = '100%';
    urlChip.style.justifyContent = 'center';

    const copyBtn = el('button', { type: 'button', class: 'hw-btn hw-btn--primary' }, [
      'COPY URL',
    ]);
    copyBtn.addEventListener('click', async () => {
      actions.foley.latch();
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(targetUrl);
          copyBtn.textContent = 'COPIED';
        } else {
          copyBtn.textContent = 'SELECT URL ABOVE';
        }
      } catch {
        copyBtn.textContent = 'COPY BLOCKED';
      }
    });

    const openLink = el(
      'a',
      {
        class: 'hw-btn',
        href: targetUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      ['OPEN URL']
    );

    const actionsRow = el('div', { class: 'hero-forge__actions' }, [copyBtn, openLink]);
    actionsRow.style.justifyContent = 'center';

    modal.replaceChildren(header, qrStage, urlChip, actionsRow);
  }

  function renderSettingsModal() {
    const syncStatus = latestModel?.syncStatus || {};
    const rate = syncStatus.rateLimit || {};
    const vaultState = latestModel?.vaultState || {};
    const diag = actions.getVaultDiagnostics();
    const patStatus = actions.getPatStatus();

    const header = buildModalHeader('DIAGNOSTICS // QUOTA // PAT VAULT');

    // Section 1: Sync & API Quota
    resetCountdownEl = el('div', { class: 'metric-readout__value', 'data-tabular': '1' }, ['--']);
    refreshRateResetClock();

    const quotaGrid = el('div', { class: 'diag-grid' }, [
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['SYNC MODE']),
        el('div', { class: 'metric-readout__value' }, [syncStatus.mode || 'SNAPSHOT CACHE']),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['RATE LIMIT']),
        el('div', { class: 'metric-readout__value' }, [
          rate.limit !== null && rate.limit !== undefined ? String(rate.limit) : '--',
        ]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['REMAINING']),
        el('div', { class: 'metric-readout__value' }, [
          rate.remaining !== null && rate.remaining !== undefined ? String(rate.remaining) : '--',
        ]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['RESET IN']),
        resetCountdownEl,
      ]),
    ]);

    const syncNowBtn = el('button', { type: 'button', class: 'hw-btn' }, ['SYNC TELEMETRY NOW']);
    syncNowBtn.addEventListener('click', () => {
      actions.foley.click();
      void actions.syncNow({ manual: true });
    });

    const syncSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['GITHUB TELEMETRY & QUOTA']),
      quotaGrid,
      syncStatus.lastError
        ? el('div', { class: 'chip' }, [`LAST NOTICE: ${syncStatus.lastError}`])
        : el('div', { class: 'chip' }, [
            `LAST CHECKED: ${syncStatus.lastCheckedAt || 'BOOT CACHE'}`,
          ]),
      el('div', { class: 'hero-forge__actions' }, [syncNowBtn]),
    ]);

    // Section 2: Triple-Vault A/B/C Diagnostics
    const vaultGrid = el('div', { class: 'diag-grid' }, [
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['VAULT REV']),
        el('div', { class: 'metric-readout__value' }, [String(diag.rev ?? 1)]),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['STORE A (LOCAL)']),
        el('div', { class: 'metric-readout__value' }, [diag.storeAOk ? 'OK' : 'MISSING']),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['STORE B (IDB)']),
        el('div', { class: 'metric-readout__value' }, [diag.storeBOk ? 'OK' : 'MISSING']),
      ]),
      el('div', {}, [
        el('span', { class: 'metric-readout__label' }, ['STORE C (COOKIE)']),
        el('div', { class: 'metric-readout__value' }, [
          `${diag.storeCOk ? 'OK' : 'MISSING'} (${diag.cookieBytes || 0}B)`,
        ]),
      ]),
    ]);

    const reconcileBtn = el('button', { type: 'button', class: 'hw-btn' }, [
      'RECONCILE TRIPLE VAULT',
    ]);
    reconcileBtn.addEventListener('click', async () => {
      actions.foley.latch();
      const res = await actions.reconcileVault();
      statusNotice =
        res.repairedStores?.length > 0
          ? `HEALED FROM ${res.healedFrom.toUpperCase()} -> REPAIRED: ${res.repairedStores.join(', ')}`
          : 'ALL 3 STORES IN SYNC (NO REPAIR NEEDED)';
      render();
    });

    const vaultSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, [
        `TRIPLE VAULT DIAGNOSTICS // LAST HEALED: ${String(diag.lastHealedFrom || 'none').toUpperCase()}`,
      ]),
      vaultGrid,
      el('div', { class: 'hero-forge__actions' }, [reconcileBtn]),
    ]);

    // Section 3: Launch Target & Private Repo Toggle
    const newTabBtn = el(
      'button',
      {
        type: 'button',
        class:
          vaultState.launchTarget !== 'same_tab'
            ? 'filter-pill is-active'
            : 'filter-pill',
      },
      ['LAUNCH: NEW TAB']
    );
    newTabBtn.addEventListener('click', () => {
      actions.foley.latch();
      void actions.setPreference('launchTarget', 'new_tab');
    });

    const sameTabBtn = el(
      'button',
      {
        type: 'button',
        class:
          vaultState.launchTarget === 'same_tab'
            ? 'filter-pill is-active'
            : 'filter-pill',
      },
      ['LAUNCH: SAME TAB']
    );
    sameTabBtn.addEventListener('click', () => {
      actions.foley.latch();
      void actions.setPreference('launchTarget', 'same_tab');
    });

    const unlockPrivateBtn = el(
      'button',
      {
        type: 'button',
        class: vaultState.unlockPrivate ? 'hw-btn is-active' : 'hw-btn hw-btn--ghost',
        'aria-pressed': vaultState.unlockPrivate ? 'true' : 'false',
      },
      [vaultState.unlockPrivate ? 'UNLOCK PRIVATE REPOS: ON' : 'UNLOCK PRIVATE REPOS: OFF']
    );
    unlockPrivateBtn.addEventListener('click', () => {
      actions.foley.latch();
      void actions.setPreference('unlockPrivate', !vaultState.unlockPrivate);
    });

    const showHiddenBtn = el(
      'button',
      {
        type: 'button',
        class: vaultState.showHidden ? 'hw-btn is-active' : 'hw-btn hw-btn--ghost',
        'aria-pressed': vaultState.showHidden ? 'true' : 'false',
      },
      [vaultState.showHidden ? 'SHOW HIDDEN: ON' : 'SHOW HIDDEN: OFF']
    );
    showHiddenBtn.addEventListener('click', () => {
      actions.foley.latch();
      void actions.setPreference('showHidden', !vaultState.showHidden);
    });

    const prefsSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['LAUNCH & VISIBILITY PREFERENCES']),
      el('div', { class: 'hero-forge__actions' }, [
        newTabBtn,
        sameTabBtn,
        showHiddenBtn,
        unlockPrivateBtn,
      ]),
    ]);

    // Section 4: Device-Local PAT Firewall
    const patInput = el('input', {
      id: 'pat-vault-input',
      type: 'password',
      class: 'hw-input',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: patStatus.configured
        ? `Configured (${patStatus.maskedHint}) — paste new PAT to rotate`
        : 'ghp_... (device-local only, sent strictly to api.github.com)',
    });

    const savePatBtn = el('button', { type: 'button', class: 'hw-btn hw-btn--primary' }, [
      'SAVE PAT',
    ]);
    savePatBtn.addEventListener('click', async () => {
      const raw = patInput.value;
      patInput.value = '';
      const res = await actions.savePat(raw);
      actions.foley.relay();
      statusNotice = res.saved
        ? `DEVICE PAT SAVED (${res.maskedHint})`
        : 'INVALID PAT FORMAT (MIN 4 NON-WHITESPACE CHARS)';
      render();
    });

    const wipePatBtn = el('button', { type: 'button', class: 'hw-btn hw-btn--ghost' }, [
      'WIPE PAT',
    ]);
    wipePatBtn.addEventListener('click', async () => {
      patInput.value = '';
      await actions.wipePat();
      actions.foley.latch();
      statusNotice = 'DEVICE PAT WIPED FROM LOCAL STORAGE & IDB';
      render();
    });

    const patSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, [
        `DEVICE-LOCAL PAT FIREWALL // ${patStatus.configured ? `ACTIVE (${patStatus.maskedHint})` : 'NOT CONFIGURED'}`,
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'pat-vault-input' }, ['GITHUB PERSONAL ACCESS TOKEN (READ-ONLY)']),
        patInput,
      ]),
      el('div', { class: 'hero-forge__actions' }, [savePatBtn, wipePatBtn]),
      el('span', { class: 'metric-readout__label' }, [
        'Stored strictly in device-local storage. Sent only to https://api.github.com. Never written to cookies or JSON exports.',
      ]),
    ]);

    // Section 5: Deck Config Export / Import
    const exportBtn = el('button', { type: 'button', class: 'hw-btn' }, [
      'EXPORT CONFIG JSON',
    ]);
    exportBtn.addEventListener('click', () => {
      actions.foley.click();
      actions.exportConfig();
      statusNotice = 'EXPORTED KRUNKED DECK CONFIG JSON (PAT EXCLUDED)';
      render();
    });

    const importBtn = el('button', { type: 'button', class: 'hw-btn' }, [
      'IMPORT CONFIG JSON',
    ]);
    importBtn.addEventListener('click', () => {
      actions.foley.click();
      openImportConfigPicker();
    });

    const ioSection = el('section', { class: 'drawer-section' }, [
      el('span', { class: 'metric-readout__label' }, ['DECK CONFIGURATION PORTABILITY']),
      el('div', { class: 'hero-forge__actions' }, [exportBtn, importBtn]),
    ]);

    const children = [header];
    if (statusNotice) {
      const banner = el('div', { class: 'led-badge led-badge--hot' }, [statusNotice]);
      children.push(banner);
    }
    children.push(syncSection, vaultSection, prefsSection, patSection, ioSection);
    modal.replaceChildren(...children);
  }

  function render() {
    if (!isOpen()) return;
    if (mode === 'qr') renderQrModal();
    else if (mode === 'settings') renderSettingsModal();
  }

  function openQr(repo, triggerEl = null) {
    if (!repo) return;
    mode = 'qr';
    qrRepo = repo;
    lastTriggerEl = triggerEl || document.activeElement;
    statusNotice = '';
    backdrop.hidden = false;
    render();
    modal.focus();
  }

  function openSettings(triggerEl = null) {
    mode = 'settings';
    qrRepo = null;
    lastTriggerEl = triggerEl || document.activeElement;
    statusNotice = '';
    backdrop.hidden = false;
    render();
    modal.focus();
  }

  function openImportConfigPicker() {
    fileInput.click();
  }

  function update(model) {
    latestModel = model;
    if (!isOpen()) return;
    if (
      mode === 'settings' &&
      typeof document !== 'undefined' &&
      document.activeElement?.id === 'pat-vault-input'
    ) {
      return;
    }
    render();
  }

  function destroy() {
    clearInterval(countdownTimer);
    backdrop.remove();
    fileInput.remove();
  }

  return {
    openQr,
    openSettings,
    openImportConfigPicker,
    close,
    update,
    isOpen,
    destroy,
  };
}
