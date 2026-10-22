import { cache } from "react";
import {
  issuePageSchema,
  memberSchema,
  pullRequestSchema,
  repositorySchema,
} from "@devpulse/shared";
import { apiGet, fetchAll } from "./api";
import { getStalePrs } from "./stalePrs";

export type StaleRow = {
  id: string;
  number: number;
  title: string;
  repoName: string;
  repoFullName: string;
  authorLogin: string;
  authorName: string;
  reviewRequestedAt: string;
  ageMs: number;
};

export type Dashboard = {
  repoCount: number;
  openIssues: number;
  openPrs: number;
  awaitingReview: number;
  stale: StaleRow[];
};

// 2 + 2×repos requests; no aggregate endpoint exists.
export const getDashboard = cache(
  async (teamId: string): Promise<Dashboard> => {
    const [repos, members] = await Promise.all([
      fetchAll(`/teams/${teamId}/repositories`, repositorySchema),
      fetchAll(`/teams/${teamId}/members`, memberSchema),
    ]);

    const perRepo = await Promise.all(
      repos.map(async (repo) => {
        const [issues, prs] = await Promise.all([
          apiGet(
            `/repositories/${repo.id}/issues?state=OPEN&limit=1`,
            issuePageSchema,
          ),
          fetchAll(
            `/repositories/${repo.id}/pull-requests?state=OPEN&sort=reviewRequestedAt&order=asc`,
            pullRequestSchema,
          ),
        ]);
        return { repo, issueTotal: issues.total, prs };
      }),
    );

    const nameByLogin = new Map(
      members.map((m) => [m.githubLogin.toLowerCase(), m.name]),
    );
    const now = new Date(); // taken once, on the server

    const joined = perRepo.flatMap(({ repo, prs }) =>
      prs.map((pr) => ({
        ...pr,
        repoFullName: repo.githubFullName,
        repoName: repo.githubFullName.split("/")[1] ?? repo.githubFullName,
      })),
    );

    const stale = getStalePrs(joined, now).map(({ pr, ageMs }) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      repoName: pr.repoName,
      repoFullName: pr.repoFullName,
      authorLogin: pr.author,
      authorName: nameByLogin.get(pr.author.toLowerCase()) ?? pr.author,
      reviewRequestedAt: pr.reviewRequestedAt as string,
      ageMs,
    }));

    return {
      repoCount: repos.length,
      openIssues: perRepo.reduce((n, r) => n + r.issueTotal, 0),
      openPrs: joined.length,
      awaitingReview: joined.filter((p) => p.reviewRequestedAt !== null).length,
      stale,
    };
  },
);
