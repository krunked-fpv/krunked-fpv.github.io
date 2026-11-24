import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const USER = 'krunked-fpv';
const API = 'https://api.github.com';
const OUT = join(process.cwd(), 'public', 'snapshot.json');
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'krunked-forge-deck-snapshot',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function gh(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json();
}

const projectUser = (u) => ({
  login: String(u?.login ?? ''),
  name: u?.name ?? null,
  avatar_url: String(u?.avatar_url ?? ''),
  bio: u?.bio ?? null,
  html_url: String(u?.html_url ?? ''),
  public_repos: Number(u?.public_repos ?? 0),
  followers: Number(u?.followers ?? 0),
});

const projectRepo = (r) => ({
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
});

const projectEvent = (e) => {
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
};

const projectCommit = (c) => ({
  sha: String(c.sha),
  message: String(c?.commit?.message ?? '').split('\n')[0] ?? '',
  date: String(c?.commit?.author?.date ?? c?.commit?.committer?.date ?? ''),
  author: String(c?.commit?.author?.name ?? c?.author?.login ?? ''),
});

try {
  const [rawUser, rawRepos, rawEvents] = await Promise.all([
    gh(`/users/${USER}`),
    gh(`/users/${USER}/repos?per_page=100&sort=pushed`),
    gh(`/users/${USER}/events/public?per_page=100`),
  ]);

  const user = projectUser(rawUser);
  const repos = Array.isArray(rawRepos) ? rawRepos.map(projectRepo) : [];
  const events = Array.isArray(rawEvents) ? rawEvents.map(projectEvent) : [];

  const top = repos
    .filter((r) => !r.fork && !r.archived && r.name.toLowerCase() !== `${USER}.github.io`)
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    .slice(0, 5);

  const commits = {};
  for (const r of top) {
    try {
      const list = await gh(`/repos/${USER}/${r.name}/commits?per_page=30`);
      commits[r.name] = {
        pushedAt: r.pushed_at,
        commits: Array.isArray(list) ? list.map(projectCommit) : [],
      };
    } catch (err) {
      console.warn(`snapshot: skipped commits for ${r.name}: ${err.message}`);
    }
  }

  mkdirSync(join(process.cwd(), 'public'), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      user,
      repos,
      events,
      commits,
    }),
  );
  console.log(`snapshot: wrote ${repos.length} repos, ${events.length} events, ${Object.keys(commits).length} commit feeds`);
} catch (err) {
  console.warn(`snapshot: failed (${err.message}); keeping existing snapshot if present`);
  process.exit(0);
}
