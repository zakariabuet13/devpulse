export interface GhRepo {
  id: bigint;
  fullName: string;
}

export interface GhIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  createdAt: Date;
  // GitHub's /issues also lists PRs; the sync service skips these.
  isPullRequest: boolean;
}

export interface GhPull {
  number: number;
  title: string;
  state: "open" | "closed";
  author: string;
  mergedAt: Date | null;
}

export interface GitHubClient {
  getRepo(fullName: string): Promise<GhRepo>;
  getRepoById(id: bigint): Promise<GhRepo>;
  listIssues(fullName: string): Promise<GhIssue[]>;
  listPulls(fullName: string): Promise<GhPull[]>;
}

export class GitHubNotFoundError extends Error {
  constructor() {
    super("GitHub resource not found");
    this.name = "GitHubNotFoundError";
  }
}

// A server misconfiguration, not a per-repo failure: the sync aborts with 503.
export class GitHubNotConfiguredError extends Error {
  constructor() {
    super("GITHUB_TOKEN is not configured");
    this.name = "GitHubNotConfiguredError";
  }
}

// Thrown instead of truncating: a partial fetch would make the sync delete rows.
export class GitHubPageLimitError extends Error {
  constructor() {
    super("GitHub pagination limit exceeded");
    this.name = "GitHubPageLimitError";
  }
}

// Message carries the status only: never the token or the response body.
export class GitHubError extends Error {
  constructor(readonly status: number) {
    super(`GitHub request failed with status ${status}`);
    this.name = "GitHubError";
  }
}
