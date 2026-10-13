import { prisma } from "../src/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

async function main() {
  // Team FKs are Restrict, so delete children first.
  await prisma.pullRequest.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.member.deleteMany();
  await prisma.team.deleteMany();

  const team = await prisma.team.create({
    data: {
      name: "Platform Engineering",
      members: {
        create: [
          { name: "Ada Lovelace", githubLogin: "ada" },
          { name: "Grace Hopper", githubLogin: "grace" },
          { name: "Linus Torvalds", githubLogin: "linus" },
          { name: "Maya Chen", githubLogin: "mayac" },
          { name: "Alex Rivera", githubLogin: "arivera" },
          { name: "Sam Patel", githubLogin: "spatel" },
          { name: "Jordan Lee", githubLogin: "jlee" },
          { name: "Nina Park", githubLogin: "ninap" },
        ],
      },
    },
  });

  const [api, web, gateway, infra, auth, cli, bus, obs] = await Promise.all(
    [
      "api",
      "web",
      "api-gateway",
      "infra",
      "auth-service",
      "developer-cli",
      "event-bus",
      "observability",
    ].map((r) =>
      prisma.repository.create({ data: { teamId: team.id, githubFullName: `devpulse/${r}` } }),
    ),
  );

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
      // Stale: review requested > 3 days ago (hour offsets avoid the exact-3d boundary).
      { repositoryId: gateway.id, number: 482, title: "Add rate limiting for public endpoints", state: "OPEN", author: "mayac", reviewRequestedAt: hoursAgo(170) },
      { repositoryId: infra.id, number: 219, title: "Rotate production database credentials", state: "OPEN", author: "arivera", reviewRequestedAt: hoursAgo(148) },
      { repositoryId: auth.id, number: 356, title: "Handle expired refresh tokens gracefully", state: "OPEN", author: "spatel", reviewRequestedAt: hoursAgo(121) },
      { repositoryId: gateway.id, number: 491, title: "Propagate trace IDs to downstream services", state: "OPEN", author: "jlee", reviewRequestedAt: hoursAgo(114) },
      { repositoryId: cli.id, number: 128, title: "Add dry-run support to deploy command", state: "OPEN", author: "ninap", reviewRequestedAt: hoursAgo(102) },
      // Author is not a team member: exercises the login fallback.
      { repositoryId: bus.id, number: 274, title: "Retry failed deliveries with exponential backoff", state: "OPEN", author: "obrooks", reviewRequestedAt: hoursAgo(80) },
      // Not stale.
      { repositoryId: infra.id, number: 220, title: "Pin terraform provider versions", state: "OPEN", author: "arivera", reviewRequestedAt: hoursAgo(20) },
      { repositoryId: auth.id, number: 357, title: "Add session audit log", state: "OPEN", author: "spatel" },
      { repositoryId: bus.id, number: 275, title: "Document topic naming", state: "OPEN", author: "obrooks", reviewRequestedAt: hoursAgo(50) },
    ],
  });

  await prisma.issue.createMany({
    data: [
      [gateway.id, 1, "Latency spike on /v1/search"],
      [gateway.id, 2, "Support HTTP/2 upstreams"],
      [infra.id, 1, "Drift in staging VPC"],
      [auth.id, 1, "Refresh token race condition"],
      [cli.id, 1, "Windows path handling"],
      [bus.id, 1, "Dead-letter queue alerting"],
    ].map(([repositoryId, number, title], i) => ({
      repositoryId: repositoryId as string,
      number: number as number,
      title: title as string,
      state: "OPEN" as const,
      labels: ["bug"],
      priority: "MEDIUM" as const,
      githubCreatedAt: daysAgo(10 - i),
    })),
  });

  // Issues board design (docs/design/board.png). Listed column by column, top to bottom, and
  // created hours ago so they sort above the older issues (board order is newest first).
  const boardIssues = [
    [cli.id, 142, "Document local development setup", ["documentation", "good first issue"], "LOW"],
    [infra.id, 226, "Remove unused Terraform outputs", ["cleanup", "infrastructure"], "LOW"],
    [obs.id, 317, "Improve empty-state copy in logs", ["enhancement", "ux"], "LOW"],
    [gateway.id, 508, "Add pagination to audit log endpoint", ["enhancement", "api"], "MEDIUM"],
    [bus.id, 281, "Expose dead-letter queue metrics", ["observability", "enhancement"], "MEDIUM"],
    [cli.id, 148, "Add shell completions for deploy", ["enhancement", "developer-experience"], "MEDIUM"],
    [auth.id, 364, "Refresh tokens fail after key rotation", ["bug", "authentication"], "HIGH"],
    [gateway.id, 512, "Rate limiter drops valid requests", ["bug", "api"], "HIGH"],
    [bus.id, 287, "Retry worker exceeds memory limit", ["bug", "reliability"], "HIGH"],
    [infra.id, 231, "Database backups miss daily window", ["infrastructure", "reliability"], "HIGH"],
    [gateway.id, 518, "Production gateway returns 502s", ["incident", "production"], "URGENT"],
    [auth.id, 369, "SSO login blocked for team accounts", ["bug", "authentication"], "URGENT"],
  ] as const;

  await prisma.issue.createMany({
    data: boardIssues.map(([repositoryId, number, title, labels, priority], i) => ({
      repositoryId,
      number,
      title,
      state: "OPEN" as const,
      labels: [...labels],
      priority,
      githubCreatedAt: hoursAgo(i + 1),
    })),
  });

  console.log("seeded team", team.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
