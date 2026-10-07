import { prisma } from "../src/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  // Team FKs are Restrict, so delete children first.
  await prisma.pullRequest.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.member.deleteMany();
  await prisma.team.deleteMany();

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
    [api.id, 1, "Crash on empty payload", "OPEN", ["bug"], "URGENT"],
    [api.id, 2, "Add rate limiting", "OPEN", ["enhancement"], "HIGH"],
    [api.id, 3, "Document POST /teams", "CLOSED", ["docs"], "LOW"],
    [api.id, 4, "Slow query on issue list", "OPEN", ["performance", "bug"], "HIGH"],
    [api.id, 5, "Upgrade Express", "CLOSED", ["chore"], "MEDIUM"],
    [web.id, 1, "Dark mode contrast", "OPEN", ["ui"], "MEDIUM"],
    [web.id, 2, "Team page 404", "OPEN", ["bug"], "URGENT"],
    [web.id, 3, "Add loading skeletons", "OPEN", ["ui", "enhancement"], "LOW"],
    [web.id, 4, "Fix hydration warning", "CLOSED", ["bug"], "MEDIUM"],
    [web.id, 5, "Keyboard navigation", "OPEN", ["a11y"], "HIGH"],
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
      { repositoryId: api.id, number: 6, title: "Fix empty payload crash", state: "OPEN", author: "ada", reviewRequestedAt: daysAgo(1) },
      { repositoryId: api.id, number: 7, title: "Add rate limiter", state: "MERGED", author: "grace", reviewRequestedAt: daysAgo(6), mergedAt: daysAgo(4) },
      { repositoryId: api.id, number: 8, title: "Bump Express", state: "MERGED", author: "linus", mergedAt: daysAgo(10) },
      { repositoryId: web.id, number: 6, title: "Contrast tweaks", state: "OPEN", author: "grace", reviewRequestedAt: daysAgo(2) },
      { repositoryId: web.id, number: 7, title: "Fix team 404", state: "OPEN", author: "linus" },
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
