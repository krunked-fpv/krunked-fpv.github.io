import type { CommitLite, GhEvent, GhRepo, GhUser } from '../types/github';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function projectUser(u: any): GhUser {
  return {
    login: String(u?.login ?? ''),
    name: u?.name ?? null,
    avatar_url: String(u?.avatar_url ?? ''),
    bio: u?.bio ?? null,
    html_url: String(u?.html_url ?? ''),
    public_repos: Number(u?.public_repos ?? 0),
    followers: Number(u?.followers ?? 0),
  };
}

export function projectRepo(r: any): GhRepo {
  return {
    id: Number(r.id),
    name: String(r.name),
    full_name: String(r.full_name ?? r.name),
    html_url: String(r.html_url),
    description: r.description ?? null,
    homepage: r.homepage ?? null,
    has_pages: Boolean(r.has_pages),
    language: r.language ?? null,
    topics: Array.isArray(r.topics) ? r.topics.map(String) : [],
    stargazers_count: Number(r.stargazers_count ?? 0),
    forks_count: Number(r.forks_count ?? 0),
    size: Number(r.size ?? 0),
    default_branch: String(r.default_branch ?? 'main'),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at ?? r.pushed_at ?? r.created_at),
    pushed_at: String(r.pushed_at ?? r.updated_at ?? r.created_at),
    fork: Boolean(r.fork),
    archived: Boolean(r.archived),
  };
}

export const projectRepos = (raw: any): GhRepo[] => (Array.isArray(raw) ? raw.map(projectRepo) : []);

export function projectEvent(e: any): GhEvent {
  const p = e?.payload ?? {};
  return {
    id: String(e.id),
    type: String(e.type),
    repo: { name: String(e?.repo?.name ?? '') },
    payload: {
      ref: p.ref ?? null,
      ref_type: p.ref_type,
      head: p.head,
      before: p.before,
      size: typeof p.size === 'number' ? p.size : undefined,
      action: p.action,
      number: p.number,
      pull_request: p.pull_request
        ? { merged: p.pull_request.merged, title: p.pull_request.title, number: p.pull_request.number }
        : undefined,
      release: p.release ? { tag_name: p.release.tag_name, name: p.release.name } : undefined,
    },
    created_at: String(e.created_at),
  };
}

export const projectEvents = (raw: any): GhEvent[] => (Array.isArray(raw) ? raw.map(projectEvent) : []);

export function projectCommit(c: any): CommitLite {
  return {
    sha: String(c.sha),
    message: String(c?.commit?.message ?? '').split('\n')[0] ?? '',
    date: String(c?.commit?.author?.date ?? c?.commit?.committer?.date ?? ''),
    author: String(c?.commit?.author?.name ?? c?.author?.login ?? ''),
  };
}

export const projectCommits = (raw: any): CommitLite[] => (Array.isArray(raw) ? raw.map(projectCommit) : []);
