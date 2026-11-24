const ACRONYMS = new Set(['ai', 'sre', 'fpv', 'ui', 'api', 'cli', 'ml', 'rpg', 'pwa']);

export function humanizeName(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function fallbackTagline(category: string, language: string | null): string {
  return language ? `${category} build · ${language}` : `${category} build`;
}
