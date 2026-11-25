// Single source of truth for branding, theming & storage constants.
// Browser-API free (safely imported by vite.config.ts and Node scripts).
export const GITHUB_USER = 'krunked-fpv';

export const BRAND = {
  primary: 'KRUNKED',
  separator: '//',
  secondary: 'FORGE DECK',
  shortName: 'Forge Deck',
  mobileShort: 'DECK',
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

/** Braun / Teenage Engineering mechanical detent spring. */
export const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;

export const THEME_COLORS = {
  obsidian: '#08090B',
  daylight: '#ECEAE4',
} as const;

/** Default dark theme-color for PWA manifest & legacy imports. */
export const THEME_COLOR = THEME_COLORS.obsidian;

export const STORAGE_NS = 'forge-deck';
export const TELEMETRY_IDB_NAME = 'krunked_deck_telemetry_v2';
export const VAULT_KEY = 'krunked-cookie-vault-v1';
export const VAULT_IDB_NAME = 'krunked_vault_v1';
export const VAULT_COOKIE_MAX_BYTES = 3800;
export const PAT_STORAGE_KEY = 'krunked-local-pat-v1';
export const DECK_CONFIG_SCHEMA = 'KrunkedDeckConfigV2' as const;
