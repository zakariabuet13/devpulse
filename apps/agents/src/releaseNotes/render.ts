import type { ReleaseNotes } from "./schema";

const SECTIONS = [
  ["Features", "features"],
  ["Fixes", "fixes"],
  ["Internal", "internal"],
] as const;

export function render(version: string, notes: ReleaseNotes): string {
  const parts = [`# ${version}`];
  for (const [title, key] of SECTIONS) {
    const items = notes[key];
    if (items.length === 0) continue;
    parts.push(
      `## ${title}\n\n${items.map((i) => `- ${i.text} (#${i.pr})`).join("\n")}`,
    );
  }
  return parts.join("\n\n") + "\n";
}
