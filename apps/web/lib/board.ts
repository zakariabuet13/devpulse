import { cache } from "react";
import { issueSchema, repositorySchema, type Issue } from "@devpulse/shared";
import { fetchAll } from "./api";

export type BoardIssue = Issue & { repoName: string; repoFullName: string };

export type Board = { repoCount: number; issues: BoardIssue[] };

// 1 + repos requests; no aggregate endpoint exists.
export const getBoard = cache(async (teamId: string): Promise<Board> => {
  const repos = await fetchAll(`/teams/${teamId}/repositories`, repositorySchema);

  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      const issues = await fetchAll(`/repositories/${repo.id}/issues?state=OPEN`, issueSchema);
      const repoName = repo.githubFullName.split("/")[1] ?? repo.githubFullName;
      return issues.map((i) => ({ ...i, repoName, repoFullName: repo.githubFullName }));
    }),
  );

  // Newest first across repos (each repo's page is already sorted; ISO strings compare as dates).
  const issues = perRepo.flat().sort((a, b) => b.githubCreatedAt.localeCompare(a.githubCreatedAt));
  return { repoCount: repos.length, issues };
});
