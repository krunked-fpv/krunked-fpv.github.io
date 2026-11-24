import { beforeEach, describe, expect, it } from 'vitest';
import { VAULT_KEY } from '../config/site';
import { loadVault, saveVault, type VaultData } from '../vault/cookieVault';

function clearStorageAndCookies() {
  localStorage.clear();
  document.cookie = `${VAULT_KEY}=; path=/; max-age=0`;
}

describe('krunked-cookie-vault-v1 bidirectional healing', () => {
  beforeEach(() => clearStorageAndCookies());

  it('heals missing or corrupt cookie from localStorage', () => {
    const data: VaultData = {
      v: 1,
      pins: ['maul-forge', 'dojo'],
      prefs: { view: 'grid', sort: 'velocity', filter: 'live' },
      seen: { dojo: 'abc1234' },
      updatedAt: 5000,
    };
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
    document.cookie = `${VAULT_KEY}=corrupt-json; path=/`;

    const loaded = loadVault();
    expect(loaded.pins).toEqual(['maul-forge', 'dojo']);
    expect(loaded.prefs.view).toBe('grid');
    expect(document.cookie).toContain('maul-forge');
  });

  it('heals missing or older localStorage from newer cookie', () => {
    const older: VaultData = {
      v: 1,
      pins: ['old-app'],
      prefs: { view: 'bento', sort: 'push', filter: 'live' },
      seen: {},
      updatedAt: 1000,
    };
    const newer: VaultData = {
      v: 1,
      pins: ['krunked_skymap'],
      prefs: { view: 'matrix', sort: 'alpha', filter: 'all' },
      seen: {},
      updatedAt: 9000,
    };
    localStorage.setItem(VAULT_KEY, JSON.stringify(older));
    document.cookie = `${VAULT_KEY}=${encodeURIComponent(JSON.stringify(newer))}; path=/`;

    const loaded = loadVault();
    expect(loaded.pins).toEqual(['krunked_skymap']);
    expect(loaded.prefs.view).toBe('matrix');
    expect(JSON.parse(localStorage.getItem(VAULT_KEY)!).pins).toEqual(['krunked_skymap']);
  });

  it('drops large seen map in cookie mirror while keeping full localStorage copy', () => {
    const seen: Record<string, string> = {};
    for (let i = 0; i < 200; i++) seen[`repo-${i}`] = 'a'.repeat(40);
    const saved = saveVault({
      v: 1,
      pins: ['bitforge-80'],
      prefs: { view: 'bento', sort: 'push', filter: 'live' },
      seen,
      updatedAt: 0,
    });
    expect(Object.keys(saved.seen)).toHaveLength(200);
    expect(JSON.parse(localStorage.getItem(VAULT_KEY)!).seen['repo-1']).toBe('a'.repeat(40));
    expect(document.cookie).toContain('bitforge-80');
    expect(document.cookie).not.toContain('repo-199');
  });
});
