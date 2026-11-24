export interface GhUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  has_pages: boolean;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  size: number;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
}

export interface GhEvent {
  id: string;
  type: string;
  repo: { name: string };
  payload: {
    ref?: string | null;
    ref_type?: string;
    head?: string;
    before?: string;
    size?: number;
    action?: string;
    number?: number;
    pull_request?: { merged?: boolean; title?: string; number?: number };
    release?: { tag_name?: string; name?: string };
  };
  created_at: string;
}

export interface CommitLite {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export interface CommitsEntry {
  pushedAt: string;
  commits: CommitLite[];
}

export interface SnapshotFile {
  generatedAt: string;
  user: GhUser | null;
  repos: GhRepo[];
  events: GhEvent[];
  commits: Record<string, CommitsEntry>;
}
