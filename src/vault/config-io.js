/**
 * Deck Configuration Export / Import (`KrunkedDeckConfigV1`).
 *
 * Strictly whitelists schema fields, guarantees PAT/token omission on export
 * and stripping on import, sanitizes all strings, and restricts URLs to
 * `http:` / `https:`.
 */

import { DEFAULT_VAULT_STATE, normalizeVaultState } from './cookie-vault.js';

export const DECK_CONFIG_SCHEMA = 'KrunkedDeckConfigV1';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Exports the deck vault state as a formatted `KrunkedDeckConfigV1` JSON string,
 * strictly stripping all non-schema, PAT, or credential keys.
 *
 * @param {object} vaultState
 * @returns {string}
 */
export function exportDeckConfigJson(vaultState) {
  const payload = {
    schema: DECK_CONFIG_SCHEMA,
    exportedAt: new Date().toISOString(),
    state: normalizeVaultState(vaultState),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and validates a `KrunkedDeckConfigV1` JSON string.
 * Rejects malformed JSON or invalid schemas, strips any rogue PAT/token/unknown keys,
 * trims strings, and rejects unsafe URLs (`javascript:`, `data:`, etc.).
 *
 * @param {string} jsonText
 * @returns {{ state: object }}
 */
export function parseAndValidateDeckConfigJson(jsonText) {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    throw new Error('Deck config JSON must be a non-empty string');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Malformed deck config JSON: ${err.message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Invalid deck config: root value must be an object');
  }

  if (parsed.schema !== DECK_CONFIG_SCHEMA) {
    throw new Error(`Invalid deck config schema: expected "${DECK_CONFIG_SCHEMA}"`);
  }

  if (!isPlainObject(parsed.state)) {
    throw new Error('Invalid deck config: missing "state" object');
  }

  if (
    parsed.state.v !== undefined &&
    parsed.state.v !== DEFAULT_VAULT_STATE.v
  ) {
    throw new Error(`Unsupported vault state version: ${String(parsed.state.v)}`);
  }

  return {
    state: normalizeVaultState(parsed.state),
  };
}

/**
 * Triggers a client-side JSON file download of the sanitized deck config in browsers.
 * Safely no-ops in non-DOM environments.
 *
 * @param {object} vaultState
 */
export function downloadDeckConfig(vaultState) {
  const json = exportDeckConfigJson(vaultState);
  if (
    typeof document === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `krunked-deck-config-${dateStamp}.json`;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  const host = document.body || document.documentElement;
  if (host && typeof host.appendChild === 'function') {
    host.appendChild(anchor);
    anchor.click();
    if (typeof anchor.remove === 'function') {
      anchor.remove();
    } else if (typeof host.removeChild === 'function') {
      host.removeChild(anchor);
    }
  } else {
    anchor.click();
  }

  if (typeof URL.revokeObjectURL === 'function') {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore cleanup failure
      }
    }, 1000);
  }
}

async function readFileAsText(file) {
  if (typeof file.text === 'function') {
    return file.text();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read config file'));
      reader.readAsText(file);
    });
  }
  throw new Error('Unsupported file input: unable to read text');
}

/**
 * Reads, parses, and validates a `KrunkedDeckConfigV1` File/Blob.
 *
 * @param {File | Blob | { text: () => Promise<string>, size?: number }} file
 * @returns {Promise<{ state: object }>}
 */
export async function importDeckConfigFromFile(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('No deck config file provided');
  }
  if (typeof file.size === 'number' && file.size > MAX_IMPORT_BYTES) {
    throw new Error('Deck config file exceeds 2MB size limit');
  }
  const text = await readFileAsText(file);
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error('Deck config payload exceeds 2MB size limit');
  }
  return parseAndValidateDeckConfigJson(text);
}
