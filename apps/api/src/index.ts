import express from "express";
import { randomUUID } from "node:crypto";
import { createTeamSchema, healthSchema, type Team } from "@devpulse/shared";

const app = express();
const teams: Team[] = [];

app.use(express.json());

const port = Number(process.env.PORT ?? 4000);

app.get("/health", (_req, res) => {
  res.json(healthSchema.parse({ status: "ok" }));
});

app.post("/teams", (req, res) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const team: Team = { id: randomUUID(), name: parsed.data.name };
  teams.push(team);
  res.status(201).json(team);
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
