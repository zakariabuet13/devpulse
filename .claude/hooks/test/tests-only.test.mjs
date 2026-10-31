import assert from "node:assert/strict";
import { join } from "node:path";
import { before, test } from "node:test";
import { makeRepo, runHook, tempDir } from "./helpers.mjs";

let repo;

before(() => {
  repo = makeRepo({ "apps/api/src/app.ts": "export {};\n" });
});

const pre = (tool_name, file_path, cwd = repo) => ({
  hook_event_name: "PreToolUse",
  tool_name,
  tool_input: { file_path },
  cwd,
});

function assertDenied(r, reasonPattern = /apps\/api\/test/) {
  assert.equal(r.code, 2);
  assert.equal(r.stdout.trim(), ""); // exit 2 uses stderr only; stdout JSON would be ignored
  assert.match(r.stderr, reasonPattern);
}

function assertAllowed(r) {
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "");
}

const hook = (input) => runHook("tests-only.mjs", input);

for (const tool of ["Edit", "Write"]) {
  test(`${tool} allows a file under apps/api/test (absolute)`, () => {
    assertAllowed(hook(pre(tool, join(repo, "apps/api/test/teams.test.ts"))));
  });

  test(`${tool} allows a nested and not-yet-existing dir`, () => {
    assertAllowed(
      hook(pre(tool, join(repo, "apps/api/test/new/deep/x.test.ts"))),
    );
  });

  test(`${tool} allows a relative path`, () => {
    assertAllowed(hook(pre(tool, "apps/api/test/teams.test.ts")));
  });

  test(`${tool} allows a path with backslashes`, () => {
    const file = join(repo, "apps", "api", "test", "teams.test.ts").replaceAll(
      "/",
      "\\",
    );
    assertAllowed(hook(pre(tool, file)));
    assertAllowed(hook(pre(tool, "apps\\api\\test\\teams.test.ts")));
  });

  test(`${tool} allows the test-writer memory folder`, () => {
    assertAllowed(
      hook(pre(tool, join(repo, ".claude/agent-memory/test-writer/MEMORY.md"))),
    );
    assertAllowed(
      hook(pre(tool, ".claude\\agent-memory\\test-writer\\notes.md")),
    );
  });

  test(`${tool} allows apps/mcp/test but not other mcp files`, () => {
    assertAllowed(hook(pre(tool, join(repo, "apps/mcp/test/server.test.ts"))));
    assertAllowed(hook(pre(tool, "apps\\mcp\\test\\new\\x.test.ts")));
    assertDenied(hook(pre(tool, join(repo, "apps/mcp/src/server.ts"))));
    assertDenied(hook(pre(tool, join(repo, "apps/mcp/test"))));
    assertDenied(hook(pre(tool, join(repo, "apps/mcp/test-utils/x.ts"))));
    assertDenied(hook(pre(tool, "apps/mcp/test/../src/server.ts")));
  });

  test(`${tool} allows .. that stays inside the folder`, () => {
    assertAllowed(
      hook(pre(tool, `${repo}/apps/api/test/sub/../teams.test.ts`)),
    );
  });

  test(`${tool} denies source files`, () => {
    assertDenied(hook(pre(tool, join(repo, "apps/api/src/app.ts"))));
    assertDenied(hook(pre(tool, join(repo, "packages/shared/src/index.ts"))));
    assertDenied(hook(pre(tool, join(repo, "apps/api/prisma/schema.prisma"))));
    assertDenied(hook(pre(tool, join(repo, "package.json"))));
  });

  test(`${tool} denies a backslash path outside the folder`, () => {
    assertDenied(hook(pre(tool, "apps\\api\\src\\app.ts")));
  });

  test(`${tool} denies .. that escapes the folder`, () => {
    assertDenied(hook(pre(tool, `${repo}/apps/api/test/../src/app.ts`)));
    assertDenied(hook(pre(tool, "apps/api/test/../../../package.json")));
    assertDenied(hook(pre(tool, "apps\\api\\test\\..\\src\\app.ts")));
    assertDenied(
      hook(
        pre(
          tool,
          `${repo}/.claude/agent-memory/test-writer/../../settings.json`,
        ),
      ),
    );
  });

  test(`${tool} denies look-alike sibling folders`, () => {
    assertDenied(hook(pre(tool, join(repo, "apps/api/test-utils/x.ts"))));
    assertDenied(hook(pre(tool, join(repo, "apps/api/tests/x.ts"))));
    assertDenied(hook(pre(tool, join(repo, "apps/web/apps/api/test/x.ts"))));
    assertDenied(
      hook(pre(tool, join(repo, ".claude/agent-memory/test-writer-2/x.md"))),
    );
    assertDenied(
      hook(pre(tool, join(repo, ".claude/agent-memory/other/x.md"))),
    );
  });

  test(`${tool} denies the folder itself and other .claude files`, () => {
    assertDenied(hook(pre(tool, join(repo, "apps/api/test"))));
    assertDenied(hook(pre(tool, join(repo, ".claude/settings.json"))));
    assertDenied(hook(pre(tool, join(repo, ".claude/agents/test-writer.md"))));
  });

  test(`${tool} denies a path outside the repo`, () => {
    assertDenied(hook(pre(tool, join(tempDir(), "apps/api/test/x.ts"))));
  });
}

test("denies a missing or non-string file_path", () => {
  assertDenied(
    hook({ tool_name: "Write", tool_input: {}, cwd: repo }),
    /tests-only/,
  );
  assertDenied(
    hook({ tool_name: "Write", tool_input: { file_path: 42 }, cwd: repo }),
    /tests-only/,
  );
  assertDenied(hook(pre("Write", "")), /tests-only/);
});

test("denies when the repo cannot be determined (not a repo)", () => {
  const dir = tempDir();
  assertDenied(
    hook(pre("Write", join(dir, "apps/api/test/x.ts"), dir)),
    /tests-only/,
  );
});

test("denies on malformed stdin", () => {
  assertDenied(hook("not json"), /tests-only/);
  assertDenied(hook(""), /tests-only/);
});
