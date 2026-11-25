import { isBotCommit, sanitizeHttpUrl, stripHtmlAndEmojis } from '../domain/sanitize';
import type { CommitLite, GhEvent, GhRepo, GhUser } from '../types/github';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function projectUser(u: any): GhUser {
  const name = u?.name != null ? stripHtmlAndEmojis(u.name) : '';
  const bio = u?.bio != null ? stripHtmlAndEmojis(u.bio) : '';
  return {
    login: stripHtmlAndEmojis(u?.login ?? ''),
    name: name || null,
    avatar_url: sanitizeHttpUrl(u?.avatar_url) ?? '',
    bio: bio || null,
    html_url: sanitizeHttpUrl(u?.html_url) ?? '',
    public_repos: Number.isFinite(Number(u?.public_repos)) ? Number(u.public_repos) : 0,
    followers: Number.isFinite(Number(u?.followers)) ? Number(u.followers) : 0,
  };
}

export function projectRepo(r: any): GhRepo {
  const desc = r?.description != null ? stripHtmlAndEmojis(r.description) : '';
  const lang = r?.language != null ? stripHtmlAndEmojis(r.language) : '';
  return {
    id: Number(r.id),
    name: stripHtmlAndEmojis(r.name),
    full_name: stripHtmlAndEmojis(r.full_name ?? r.name),
    html_url: sanitizeHttpUrl(r.html_url) ?? '',
    description: desc || null,
    homepage: sanitizeHttpUrl(r.homepage, undefined, { allowBareDomain: true }),
    has_pages: Boolean(r.has_pages),
    language: lang || null,
    topics: Array.isArray(r.topics) ? r.topics.map((t: unknown) => stripHtmlAndEmojis(t)).filter(Boolean) : [],
    stargazers_count: Number.isFinite(Number(r.stargazers_count)) ? Number(r.stargazers_count) : 0,
    forks_count: Number.isFinite(Number(r.forks_count)) ? Number(r.forks_count) : 0,
    size: Number.isFinite(Number(r.size)) ? Number(r.size) : 0,
    default_branch: stripHtmlAndEmojis(r.default_branch ?? 'main') || 'main',
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? r.pushed_at ?? r.created_at ?? ''),
    pushed_at: String(r.pushed_at ?? r.updated_at ?? r.created_at ?? ''),
    fork: Boolean(r.fork),
    archived: Boolean(r.archived),
  };
}

export const projectRepos = (raw: any): GhRepo[] => (Array.isArray(raw) ? raw.map(projectRepo).filter((r) => !!r.name) : []);

export function projectEvent(e: any): GhEvent {
  const p = e?.payload ?? {};
  return {
    id: String(e.id),
    type: String(e.type),
    repo: { name: stripHtmlAndEmojis(e?.repo?.name ?? '') },
    payload: {
      ref: p.ref != null ? stripHtmlAndEmojis(p.ref) : null,
      ref_type: p.ref_type != null ? stripHtmlAndEmojis(p.ref_type) : undefined,
      head: typeof p.head === 'string' ? p.head : undefined,
      before: typeof p.before === 'string' ? p.before : undefined,
      size: typeof p.size === 'number' ? p.size : undefined,
      action: p.action != null ? stripHtmlAndEmojis(p.action) : undefined,
      number: typeof p.number === 'number' ? p.number : undefined,
      pull_request: p.pull_request
        ? {
            merged: Boolean(p.pull_request.merged),
            title: stripHtmlAndEmojis(p.pull_request.title ?? ''),
            number: typeof p.pull_request.number === 'number' ? p.pull_request.number : undefined,
          }
        : undefined,
      release: p.release
        ? {
            tag_name: stripHtmlAndEmojis(p.release.tag_name ?? ''),
            name: stripHtmlAndEmojis(p.release.name ?? ''),
          }
        : undefined,
    },
    created_at: String(e.created_at ?? ''),
  };
}

export const projectEvents = (raw: any): GhEvent[] => (Array.isArray(raw) ? raw.map(projectEvent) : []);

export function projectCommit(c: any): CommitLite {
  const rawMsg = typeof c?.message === 'string' ? c.message : String(c?.commit?.message ?? '');
  const firstLine = rawMsg.split(/\r?\n/)[0] ?? '';
  const author =
    typeof c?.author === 'string'
      ? c.author
      : String(c?.commit?.author?.name ?? c?.author?.login ?? c?.commit?.committer?.name ?? '');
  const date = typeof c?.date === 'string' ? c.date : String(c?.commit?.author?.date ?? c?.commit?.committer?.date ?? '');
  const url = sanitizeHttpUrl(c?.url ?? c?.html_url);

  const out: CommitLite = {
    sha: String(c?.sha ?? ''),
    message: stripHtmlAndEmojis(firstLine).slice(0, 160),
    date,
    author: stripHtmlAndEmojis(author),
  };
  if (url) out.url = url;
  return out;
}

/** Project commits and exclude CI/dependency bot & [skip ci] commits. */
export const projectCommits = (raw: any): CommitLite[] =>
  Array.isArray(raw)
    ? raw
        .map(projectCommit)
        .filter((c) => Boolean(c.sha) && !isBotCommit(c))
    : [];

/** Sanitize GitHub /languages byte map (`{ TypeScript: 42100 }`). */
export function projectLanguages(raw: any): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const name = stripHtmlAndEmojis(k);
    const bytes = Number(v);
    if (name && Number.isFinite(bytes) && bytes > 0) {
      out[name] = Math.floor(bytes);
    }
  }
  return out;
}
