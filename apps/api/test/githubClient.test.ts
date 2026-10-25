import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "../src/github/client";
import {
  GitHubError,
  GitHubNotConfiguredError,
  GitHubNotFoundError,
  GitHubPageLimitError,
} from "../src/github/types";

const API = "https://api.github.com";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const rawIssue = (number: number) => ({
  number,
  title: `Issue ${number}`,
  state: "open",
  labels: [{ name: "bug" }, "plain", {}],
  created_at: "2025-01-01T00:00:00Z",
});

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("createGitHubClient", () => {
  it("throws GitHubNotConfiguredError without a token, before any request", async () => {
    const fetchMock = stubFetch();
    const client = createGitHubClient({ token: undefined });

    await expect(client.getRepo("o/r")).rejects.toBeInstanceOf(
      GitHubNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token and maps the repo", async () => {
    const fetchMock = stubFetch(json({ id: 5_000_000_000, full_name: "o/r" }));
    const client = createGitHubClient({ token: "tok" });

    const repo = await client.getRepo("o/r");

    expect(repo).toEqual({ id: 5_000_000_000n, fullName: "o/r" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/repos/o/r`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("looks a repo up by id", async () => {
    const fetchMock = stubFetch(json({ id: 42, full_name: "o/renamed" }));
    const client = createGitHubClient({ token: "tok" });

    await client.getRepoById(42n);

    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/repositories/42`);
  });

  it.each(["../user", "a/b/../../user", "noslash", "a/b/c", "a/b?x=1", ""])(
    "treats the malformed name %j as not found without a request",
    async (name) => {
      const fetchMock = stubFetch();
      const client = createGitHubClient({ token: "tok" });

      await expect(client.getRepo(name)).rejects.toBeInstanceOf(
        GitHubNotFoundError,
      );
      await expect(client.listIssues(name)).rejects.toBeInstanceOf(
        GitHubNotFoundError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("maps 404 to GitHubNotFoundError and other failures to GitHubError", async () => {
    stubFetch(
      new Response("{}", { status: 404 }),
      new Response("secret body", { status: 500 }),
    );
    const client = createGitHubClient({ token: "tok" });

    await expect(client.getRepo("o/r")).rejects.toBeInstanceOf(
      GitHubNotFoundError,
    );
    const err = await client.getRepo("o/r").catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(500);
    expect(err.message).not.toContain("secret body");
  });

  it("follows rel=next across pages and normalizes issues", async () => {
    const next = `${API}/repos/o/r/issues?state=all&per_page=100&page=2`;
    const fetchMock = stubFetch(
      json([{ ...rawIssue(1), pull_request: {} }], {
        headers: { link: `<${next}>; rel="next", <${API}/x>; rel="last"` },
      }),
      json([rawIssue(2)]),
    );
    const client = createGitHubClient({ token: "tok" });

    const issues = await client.listIssues("o/r");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/repos/o/r/issues?state=all&per_page=100`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(next);
    expect(issues.map((i) => [i.number, i.isPullRequest])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(issues[1].labels).toEqual(["bug", "plain"]);
    expect(issues[1].createdAt.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("maps pulls: merged_at, ghost author", async () => {
    stubFetch(
      json([
        {
          number: 1,
          title: "t",
          state: "closed",
          user: null,
          merged_at: "2025-02-02T00:00:00Z",
        },
      ]),
    );
    const client = createGitHubClient({ token: "tok" });

    const [p] = await client.listPulls("o/r");

    expect(p.author).toBe("ghost");
    expect(p.mergedAt?.toISOString()).toBe("2025-02-02T00:00:00.000Z");
  });

  it("refuses a rel=next on another host and never sends the token there", async () => {
    const fetchMock = stubFetch(
      json([rawIssue(1)], {
        headers: { link: '<https://evil.example/steal>; rel="next"' },
      }),
    );
    const client = createGitHubClient({ token: "tok" });

    await expect(client.listIssues("o/r")).rejects.toBeInstanceOf(GitHubError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws GitHubPageLimitError instead of truncating after 20 pages", async () => {
    const fetchMock = vi.fn(async () =>
      json([rawIssue(1)], {
        headers: { link: `<${API}/repos/o/r/issues?page=2>; rel="next"` },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGitHubClient({ token: "tok" });

    await expect(client.listIssues("o/r")).rejects.toBeInstanceOf(
      GitHubPageLimitError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});
