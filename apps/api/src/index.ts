import express from "express";
import { createTeamSchema, healthSchema, teamSchema } from "@devpulse/shared";
import { prisma } from "./db";

const app = express();

app.use(express.json());

const port = Number(process.env.PORT ?? 4000);

app.get("/health", (_req, res) => {
  res.json(healthSchema.parse({ status: "ok" }));
});

app.get("/teams", async (_req, res) => {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  res.json(teams.map((t) => teamSchema.parse({ id: t.id, name: t.name })));
});

app.post("/teams", async (req, res) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const team = await prisma.team.create({ data: { name: parsed.data.name } });
  res.status(201).json(teamSchema.parse({ id: team.id, name: team.name }));
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
