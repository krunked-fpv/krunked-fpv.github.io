import { DECK_CONFIG_SCHEMA } from '../config/site';
import type { KrunkedDeckConfigV2, VaultData } from '../types/vault';
import { normalizeVault } from './cookieVault';

export { DECK_CONFIG_SCHEMA };
export type { KrunkedDeckConfigV2 };

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB

const textEncoder = new TextEncoder();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Exports vault state as a formatted `KrunkedDeckConfigV2` JSON string.
 * Reconstructs the state strictly via field allowlist (`normalizeVault`),
 * guaranteeing zero PAT, token, or secret fields can ever be emitted.
 */
export function exportDeckConfigJson(vaultState: VaultData | unknown): string {
  const payload: KrunkedDeckConfigV2 = {
    schema: DECK_CONFIG_SCHEMA,
    exportedAt: new Date().toISOString(),
    state: normalizeVault(vaultState),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and strictly validates a `KrunkedDeckConfigV2` JSON payload.
 * Enforces the 2 MB byte cap, schema version check, prototype-pollution protection,
 * rogue PAT/unknown key stripping, HTML/emoji stripping, and http(s) URL safety.
 */
export function parseDeckConfigJson(jsonText: string): {
  config: KrunkedDeckConfigV2;
  state: VaultData;
} {
  if (typeof jsonText !== 'string') {
    throw new Error('Deck config JSON must be a non-empty string');
  }

  if (textEncoder.encode(jsonText).length > MAX_IMPORT_BYTES) {
    throw new Error('Deck config payload exceeds 2MB size limit');
  }

  if (!jsonText.trim()) {
    throw new Error('Deck config JSON must be a non-empty string');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Syntax error';
    throw new Error(`Malformed deck config JSON: ${msg}`);
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

  const rawState = parsed.state;
  if (rawState.v !== undefined && rawState.v !== 2) {
    throw new Error(`Unsupported vault state version: ${String(rawState.v)}`);
  }

  const exportedAt =
    typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt))
      ? parsed.exportedAt
      : new Date().toISOString();

  const state = normalizeVault(rawState);
  const config: KrunkedDeckConfigV2 = {
    schema: DECK_CONFIG_SCHEMA,
    exportedAt,
    state,
  };

  return { config, state };
}

/**
 * Triggers a browser JSON download of the sanitized `KrunkedDeckConfigV2` file
 * with deferred `URL.revokeObjectURL` cleanup. Safely no-ops outside DOM environments.
 */
export function downloadDeckConfig(vaultState: VaultData): void {
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

  const host = document.body ?? document.documentElement;
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

export interface DeckConfigFileLike {
  size?: number;
  text?: () => Promise<string>;
}

async function readFileText(file: File | Blob | DeckConfigFileLike): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  if (typeof FileReader !== 'undefined' && file instanceof Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read config file'));
      reader.readAsText(file);
    });
  }
  throw new Error('Unsupported file input: unable to read text');
}

/**
 * Reads, enforces the 2 MB ceiling on, and validates a `KrunkedDeckConfigV2` File/Blob.
 */
export async function importDeckConfigFromFile(
  file: File | Blob | DeckConfigFileLike | null | undefined,
): Promise<{ config: KrunkedDeckConfigV2; state: VaultData }> {
  if (!file || typeof file !== 'object') {
    throw new Error('No deck config file provided');
  }
  if (typeof file.size === 'number' && file.size > MAX_IMPORT_BYTES) {
    throw new Error('Deck config file exceeds 2MB size limit');
  }
  const text = await readFileText(file);
  if (textEncoder.encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error('Deck config payload exceeds 2MB size limit');
  }
  return parseDeckConfigJson(text);
}
