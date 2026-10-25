import {
  GitHubError,
  GitHubNotConfiguredError,
  GitHubNotFoundError,
  GitHubPageLimitError,
  type GhIssue,
  type GhPull,
  type GhRepo,
  type GitHubClient,
} from "./types";

const API = "https://api.github.com";
// 100 items/page: caps one list at 2,000 items so a huge repo can't drain the rate limit.
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 10_000;

interface RawRepo {
  id: number;
  full_name: string;
}
interface RawIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: Array<string | { name?: string }>;
  created_at: string;
  pull_request?: unknown;
}
interface RawPull {
  number: number;
  title: string;
  state: "open" | "closed";
  user: { login: string } | null;
  merged_at: string | null;
}

// Names come from the DB and are spliced into URL paths: anything that isn't
// `owner/repo` (e.g. `a/../../user`) could reach another endpoint with our token.
// Such a name can't exist on GitHub, so it counts as not found.
const FULL_NAME = /^[\w.-]+\/[\w.-]+$/;
function assertRepoName(fullName: string): void {
  if (
    !FULL_NAME.test(fullName) ||
    fullName.split("/").some((p) => /^\.+$/.test(p))
  )
    throw new GitHubNotFoundError();
}

// Repo ids are far below 2^53, so BigInt(number) from parsed JSON is exact.
export function createGitHubClient({
  token,
}: {
  token: string | undefined;
}): GitHubClient {
  async function request(url: string): Promise<Response> {
    if (!token) throw new GitHubNotConfiguredError();
    // Never send the token off-host (e.g. via a hostile `Link: rel="next"`).
    if (new URL(url).origin !== API) throw new GitHubError(502);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 404) throw new GitHubNotFoundError();
    if (!res.ok) throw new GitHubError(res.status);
    return res;
  }

  async function getAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | undefined =
      `${API}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    for (let page = 1; url; page++) {
      if (page > MAX_PAGES) throw new GitHubPageLimitError();
      const res = await request(url);
      items.push(...((await res.json()) as T[]));
      url = nextLink(res.headers.get("link"));
    }
    return items;
  }

  const toRepo = (r: RawRepo): GhRepo => ({
    id: BigInt(r.id),
    fullName: r.full_name,
  });

  return {
    async getRepo(fullName) {
      assertRepoName(fullName);
      const res = await request(`${API}/repos/${fullName}`);
      return toRepo((await res.json()) as RawRepo);
    },
    async getRepoById(id) {
      const res = await request(`${API}/repositories/${id}`);
      return toRepo((await res.json()) as RawRepo);
    },
    async listIssues(fullName): Promise<GhIssue[]> {
      assertRepoName(fullName);
      const raw = await getAll<RawIssue>(`/repos/${fullName}/issues?state=all`);
      return raw.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        labels: i.labels.flatMap((l) =>
          typeof l === "string" ? [l] : l.name ? [l.name] : [],
        ),
        createdAt: new Date(i.created_at),
        isPullRequest: i.pull_request !== undefined,
      }));
    },
    async listPulls(fullName): Promise<GhPull[]> {
      assertRepoName(fullName);
      const raw = await getAll<RawPull>(`/repos/${fullName}/pulls?state=all`);
      return raw.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        author: p.user?.login ?? "ghost",
        mergedAt: p.merged_at ? new Date(p.merged_at) : null,
      }));
    },
  };
}

function nextLink(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return undefined;
}
