// Single source of truth for branding & tuning. Browser-API free (imported by vite.config).
export const GITHUB_USER = 'krunked-fpv';

export const BRAND = {
  primary: 'KRUNKED',
  separator: '//',
  secondary: 'FORGE DECK',
  shortName: 'Forge Deck',
  tagline: 'Live builds, fresh off the forge.',
} as const;

export const FULL_BRAND = `${BRAND.primary} ${BRAND.separator} ${BRAND.secondary}`;
export const PAGES_ORIGIN = `https://${GITHUB_USER.toLowerCase()}.github.io`;
export const API_ORIGIN = 'https://api.github.com';

export const SPOTLIGHT_COUNT = 5;
export const POLL_MS = 90_000;
export const QUOTA_RESERVE = 5;
export const STALE_USER_MS = 30 * 60_000;
export const DEEP_HISTORY_MS = 6 * 3_600_000;

export const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const;

export const THEME_COLOR = '#07080A';
export const STORAGE_NS = 'forge-deck';
export const VAULT_KEY = 'krunked-cookie-vault-v1';
