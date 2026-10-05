import { prisma } from "../src/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  await prisma.team.deleteMany(); // cascades to everything below

  const team = await prisma.team.create({
    data: {
      name: "Platform",
      members: {
        create: [
          { name: "Ada Lovelace", githubLogin: "ada" },
          { name: "Grace Hopper", githubLogin: "grace" },
          { name: "Linus Torvalds", githubLogin: "linus" },
        ],
      },
    },
  });

  const [api, web] = await Promise.all([
    prisma.repository.create({ data: { teamId: team.id, githubFullName: "devpulse/api" } }),
    prisma.repository.create({ data: { teamId: team.id, githubFullName: "devpulse/web" } }),
  ]);

  const issues = [
    [api.id, 1, "Crash on empty payload", "open", ["bug"], "URGENT"],
    [api.id, 2, "Add rate limiting", "open", ["enhancement"], "HIGH"],
    [api.id, 3, "Document POST /teams", "closed", ["docs"], "LOW"],
    [api.id, 4, "Slow query on issue list", "open", ["performance", "bug"], "HIGH"],
    [api.id, 5, "Upgrade Express", "closed", ["chore"], "MEDIUM"],
    [web.id, 1, "Dark mode contrast", "open", ["ui"], "MEDIUM"],
    [web.id, 2, "Team page 404", "open", ["bug"], "URGENT"],
    [web.id, 3, "Add loading skeletons", "open", ["ui", "enhancement"], "LOW"],
    [web.id, 4, "Fix hydration warning", "closed", ["bug"], "MEDIUM"],
    [web.id, 5, "Keyboard navigation", "open", ["a11y"], "HIGH"],
  ] as const;

  await prisma.issue.createMany({
    data: issues.map(([repositoryId, number, title, state, labels, priority], i) => ({
      repositoryId,
      number,
      title,
      state,
      labels: [...labels],
      priority,
      githubCreatedAt: daysAgo(30 - i),
    })),
  });

  await prisma.pullRequest.createMany({
    data: [
      { repositoryId: api.id, number: 6, title: "Fix empty payload crash", state: "open", author: "ada", reviewRequestedAt: daysAgo(1) },
      { repositoryId: api.id, number: 7, title: "Add rate limiter", state: "merged", author: "grace", reviewRequestedAt: daysAgo(6), mergedAt: daysAgo(4) },
      { repositoryId: api.id, number: 8, title: "Bump Express", state: "merged", author: "linus", mergedAt: daysAgo(10) },
      { repositoryId: web.id, number: 6, title: "Contrast tweaks", state: "open", author: "grace", reviewRequestedAt: daysAgo(2) },
      { repositoryId: web.id, number: 7, title: "Fix team 404", state: "open", author: "linus" },
    ],
  });

  console.log("seeded team", team.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
