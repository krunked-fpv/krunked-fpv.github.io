import { PAGES_ORIGIN, GITHUB_USER } from '../config/site';
import type { GhRepo } from '../types/github';

function validHttp(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = u.trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Override → homepage → GitHub Pages → null (code-only). */
export function resolveLaunch(
  repo: Pick<GhRepo, 'name' | 'homepage' | 'has_pages'>,
  overrideUrl?: string,
  user: string = GITHUB_USER,
  origin: string = PAGES_ORIGIN,
): string | null {
  const o = validHttp(overrideUrl);
  if (o) return o;
  const home = validHttp(repo.homepage);
  if (home) return home;
  if (repo.has_pages) {
    if (repo.name.toLowerCase() === `${user.toLowerCase()}.github.io`) return `${origin}/`;
    return `${origin}/${repo.name}/`;
  }
  return null;
}
