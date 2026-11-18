import { describe, expect, it } from "vitest";
import { listCommits, verifyRef } from "../src/releaseNotes/git";

type Call = { file: string; args: string[] };

// Fake for the injected exec (promisified execFile shape): (file, args) => { stdout, stderr }
function fakeExec(stdout: string) {
  const calls: Call[] = [];
  const exec = async (file: string, args: string[]) => {
    calls.push({ file, args });
    return { stdout, stderr: "" };
  };
  return { exec, calls };
}

describe("verifyRef", () => {
  it("resolves for a good ref and calls git with an args array (no shell)", async () => {
    const { exec, calls } = fakeExec("abc123\n");
    await expect(verifyRef("v0.1.0", exec)).resolves.not.toThrow();
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("git");
    expect(calls[0].args).toEqual(
      expect.arrayContaining(["rev-parse", "--verify"]),
    );
  });

  it("passes the ref as its own argv entry after --end-of-options", async () => {
    const { exec, calls } = fakeExec("abc123\n");
    const ref = "--output=/tmp/pwned";
    await verifyRef(ref, exec);
    const { args } = calls[0];
    const eoo = args.indexOf("--end-of-options");
    expect(eoo).toBeGreaterThanOrEqual(0);
    const idx = args.findIndex((a) => a.includes(ref));
    expect(idx).toBeGreaterThan(eoo);
  });

  it("rejects when git fails (bad ref)", async () => {
    const exec = async () => {
      throw new Error("fatal: Needed a single revision");
    };
    await expect(verifyRef("nope", exec)).rejects.toThrow();
  });
});

describe("listCommits", () => {
  const sha1 = "a".repeat(40);
  const sha2 = "b".repeat(40);
  const sha3 = "c".repeat(40);

  it("asks git for from..to with a tab-separated format, via argv", async () => {
    const { exec, calls } = fakeExec("");
    await listCommits("v0.1.0", "HEAD", exec);
    expect(calls[0].file).toBe("git");
    expect(calls[0].args).toContain("log");
    expect(calls[0].args).toContain("v0.1.0..HEAD");
    expect(calls[0].args.some((a) => a.startsWith("--format="))).toBe(true);
  });

  it("parses sha, subject and the trailing (#n) PR number", async () => {
    const { exec } = fakeExec(
      `${sha1}\tfeat: add board (#12)\n${sha2}\tfix: crash on empty team (#7)\n`,
    );
    const commits = await listCommits("a", "b", exec);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      sha: sha1,
      subject: "feat: add board (#12)",
      pr: 12,
    });
    expect(commits[1]).toMatchObject({ sha: sha2, pr: 7 });
  });

  it("leaves pr undefined when the subject has no trailing (#n)", async () => {
    const { exec } = fakeExec(
      `${sha1}\tchore: bump deps\n${sha2}\trefs (#3) in the middle\n`,
    );
    const commits = await listCommits("a", "b", exec);
    expect(commits[0].pr).toBeUndefined();
    expect(commits[1].pr).toBeUndefined();
  });

  it("keeps tabs inside the subject intact", async () => {
    const { exec } = fakeExec(`${sha3}\tfix:\tweird subject (#5)\n`);
    const [c] = await listCommits("a", "b", exec);
    expect(c.sha).toBe(sha3);
    expect(c.subject).toBe("fix:\tweird subject (#5)");
    expect(c.pr).toBe(5);
  });

  it("returns [] for an empty range", async () => {
    const { exec } = fakeExec("");
    await expect(listCommits("a", "b", exec)).resolves.toEqual([]);
  });

  it("ignores blank lines", async () => {
    const { exec } = fakeExec(`\n${sha1}\tfeat: x (#1)\n\n`);
    await expect(listCommits("a", "b", exec)).resolves.toHaveLength(1);
  });
});
