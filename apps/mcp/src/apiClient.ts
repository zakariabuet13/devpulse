import type {
  Issue,
  IssueState,
  Page,
  Priority,
  PrState,
  PullRequest,
  Repository,
  Team,
  TeamStats,
} from "@devpulse/shared";

export interface TeamOverview {
  team: Team;
  stats: TeamStats;
  repositories: Repository[];
}

export interface IssueQuery {
  q?: string;
  state?: IssueState;
  priority?: Priority;
  label?: string;
  limit?: number;
  offset?: number;
}

export interface PrQuery {
  state?: PrState;
  limit?: number;
  offset?: number;
}

export interface DevPulseApi {
  listTeams(): Promise<Team[]>;
  teamOverview(teamId: string): Promise<TeamOverview>;
  searchIssues(teamId: string, q: IssueQuery): Promise<Page<Issue>>;
  listPullRequests(teamId: string, q: PrQuery): Promise<Page<PullRequest>>;
}

/** Non-2xx from the API. Carries only the status: never the response body. */
export class ApiHttpError extends Error {
  constructor(readonly status: number) {
    super(`DevPulse API responded with HTTP ${status}`);
    this.name = "ApiHttpError";
  }
}

/** Network failure / timeout / unparsable body. Deliberately drops the original error. */
export class ApiUnreachableError extends Error {
  constructor() {
    super("DevPulse API is unreachable");
    this.name = "ApiUnreachableError";
  }
}

const DEFAULT_BASE_URL = "http://localhost:4000";
const TIMEOUT_MS = 10_000;
const PAGE_LIMIT = 100;

export function createApiClient(opts: { baseUrl?: string } = {}): DevPulseApi {
  const base = (
    opts.baseUrl ||
    process.env.DEVPULSE_API_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  // GET only. `path` is pre-encoded by the caller; `params` skips undefined values.
  async function get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) search.set(k, String(v));
    }
    const qs = search.toString();
    let res: Response;
    try {
      res = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ApiUnreachableError();
    }
    if (!res.ok) throw new ApiHttpError(res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiUnreachableError();
    }
  }

  // Follows limit/offset until `total` is reached. When `limit` is omitted the first request
  // carries no query string (API default page size) and later ones send only `offset`.
  async function getAll<T>(path: string, limit?: number): Promise<T[]> {
    const all: T[] = [];
    for (;;) {
      const page = await get<Page<T>>(path, {
        limit,
        offset: all.length === 0 ? undefined : all.length,
      });
      all.push(...page.items);
      if (page.items.length === 0 || all.length >= page.total) return all;
    }
  }

  const teamPath = (id: string) => `/teams/${encodeURIComponent(id)}`;

  return {
    listTeams: () => getAll<Team>("/teams", PAGE_LIMIT),

    async teamOverview(teamId) {
      const p = teamPath(teamId);
      const [team, stats, repositories] = await Promise.all([
        get<Team>(p),
        get<TeamStats>(`${p}/stats`),
        getAll<Repository>(`${p}/repositories`),
      ]);
      return { team, stats, repositories };
    },

    searchIssues: (teamId, q) =>
      get<Page<Issue>>(`${teamPath(teamId)}/issues`, {
        q: q.q,
        state: q.state,
        priority: q.priority,
        label: q.label,
        limit: q.limit,
        offset: q.offset,
      }),

    listPullRequests: (teamId, q) =>
      get<Page<PullRequest>>(`${teamPath(teamId)}/pull-requests`, {
        state: q.state,
        limit: q.limit,
        offset: q.offset,
      }),
  };
}
