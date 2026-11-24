import { describe, expect, it } from "bun:test";
import { runCleanlinessCheck } from "../../src/kernel/cleanliness.js";
import { derive } from "../../src/kernel/derive.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { git } from "../../src/core/git/exec.js";

async function setupTest(config?: {
  maxFileSizeBytes?: number;
  allowedExtensions?: string[];
  allowedFiles?: string[];
}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "factory-cleanliness-test-"),
  );
  // Initialize git repo
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test User"]);

  // Create an initial file in base
  fs.writeFileSync(path.join(root, "base.ts"), "export const a = 1;\n");
  await git(root, ["add", "base.ts"]);
  await git(root, ["commit", "-m", "start"]);

  const configs = {
    repo: { cleanliness: config },
  } as any;
  const runtime = { configs } as unknown as KernelRuntime;

  return { root, runtime };
}

function writeRepoConfig(root: string, body: string): void {
  fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
  fs.writeFileSync(path.join(root, ".factory", "repo.yaml"), body);
}

/**
 * A repo whose integration branch landed a disallowed file, and a task branch
 * cut from the head as it stood at dispatch, carrying one clean file of its own.
 */
async function setupHeadAndTask() {
  const { root, runtime } = await setupTest(undefined);
  await git(root, ["checkout", "-b", "factory/g"]);
  fs.writeFileSync(path.join(root, "landed.tmp"), "other task");
  await git(root, ["add", "landed.tmp"]);
  await git(root, ["commit", "-m", "head lands an artifact"]);

  const start = (await git(root, ["rev-parse", "HEAD~1"])).stdout.trim();
  await git(root, ["checkout", "-b", "factory/task", start]);
  fs.writeFileSync(path.join(root, "mine.ts"), "export const mine = 1;\n");
  await git(root, ["add", "mine.ts"]);
  await git(root, ["commit", "-m", "task work"]);
  return { root, runtime, start };
}

/** Lands another file on the integration branch and returns to the task branch. */
async function landOnHead(root: string, file: string, body: string) {
  await git(root, ["checkout", "factory/g"]);
  fs.writeFileSync(path.join(root, file), body);
  await git(root, ["add", file]);
  await git(root, ["commit", "-m", `head lands ${file}`]);
  await git(root, ["checkout", "factory/task"]);
}

describe("runCleanlinessCheck with repo config", () => {
  it("flags large file and disallowed extension with repo config", async () => {
    const { root, runtime } = await setupTest({
      maxFileSizeBytes: 10,
      allowedExtensions: ["ts"],
    });
    const largeFile = path.join(root, "large.ts");
    fs.writeFileSync(largeFile, "a".repeat(20));
    const badExtFile = path.join(root, "bad.js");
    fs.writeFileSync(badExtFile, "console.log('test')");

    // Stage files
    await git(root, ["add", "large.ts", "bad.js"]);
    await git(root, ["commit", "-m", "init"]);

    // Create a new file
    const newFile = path.join(root, "new.ts");
    fs.writeFileSync(newFile, "code");
    await git(root, ["add", "new.ts"]);
    await git(root, ["commit", "-m", "new"]);

    // HEAD~2 is "start" commit.
    const result = await runCleanlinessCheck(runtime, root, "HEAD~2", "HEAD~2");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Large file: large.ts");
    expect(result.output).toContain("Disallowed extension: bad.js");
  });
});

describe("runCleanlinessCheck default rules hit", () => {
  it("default cleanliness rules are active without repo config", async () => {
    const { root, runtime } = await setupTest(undefined);

    // 1. Large file > 1MB
    const largeFile = path.join(root, "large.ts");
    fs.writeFileSync(largeFile, Buffer.alloc(1048576 + 10));

    // 2. Disallowed artifact (weights / temp)
    const weightsFile = path.join(root, "model.pt");
    fs.writeFileSync(weightsFile, "weights");

    const tempFile = path.join(root, "cache.tmp");
    fs.writeFileSync(tempFile, "temp");

    // 3. New extension not in base tree (.xyz, whereas base had only .ts)
    const newExtFile = path.join(root, "notes.xyz");
    fs.writeFileSync(newExtFile, "text");

    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "dirty"]);

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Large file: large.ts");
    expect(result.output).toContain("Disallowed artifact: model.pt");
    expect(result.output).toContain("Disallowed artifact: cache.tmp");
    expect(result.output).toContain("New extension: notes.xyz (.xyz)");
    expect(result.output).not.toContain("outside task scope");
  });
});

describe("runCleanlinessCheck default rules pass", () => {
  it("passes when the change adheres to the default rules", async () => {
    const { root, runtime } = await setupTest(undefined);

    const validFile = path.join(root, "clean.ts");
    fs.writeFileSync(validFile, "export const clean = true;\n");

    await git(root, ["add", "clean.ts"]);
    await git(root, ["commit", "-m", "clean"]);

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("pass");
  });

  it("passes a multi-file change: no task scope is judged", async () => {
    const { root, runtime } = await setupTest(undefined);

    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(
        path.join(root, `out${i}.ts`),
        `export const v${i} = 1;\n`,
      );
    }

    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "multi-file"]);

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(result.ok).toBe(true);
    expect(result.output).toBe("Clean");
  });
});

describe("runCleanlinessCheck allowed-file override", () => {
  it("passes a file the tracked repo config names", async () => {
    const { root, runtime } = await setupTest({ allowedFiles: ["data.csv"] });

    fs.writeFileSync(path.join(root, "data.csv"), "x".repeat(1048576 + 10));
    await git(root, ["add", "data.csv"]);
    await git(root, ["commit", "-m", "data"]);

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(result.ok).toBe(true);
  });

  it("passes a file the worktree repo config names", async () => {
    const { root, runtime } = await setupTest(undefined);

    fs.writeFileSync(path.join(root, "data.csv"), "x".repeat(1048576 + 10));
    await git(root, ["add", "data.csv"]);
    await git(root, ["commit", "-m", "data"]);

    const before = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(before.ok).toBe(false);
    expect(before.output).toContain("Large file: data.csv");
    expect(before.output).toContain("New extension: data.csv (.csv)");

    // The revision turn adds the override without reloading the launch config.
    writeRepoConfig(root, "cleanliness:\n  allowedFiles:\n    - data.csv\n");
    await git(root, ["add", ".factory/repo.yaml"]);
    await git(root, ["commit", "-m", "override"]);

    const after = await runCleanlinessCheck(runtime, root, "HEAD~2", "HEAD~2");
    expect(after.ok).toBe(true);
  });

  it("fails loudly when the worktree override is malformed", async () => {
    const { root, runtime } = await setupTest(undefined);

    writeRepoConfig(root, "cleanliness:\n  allowedFiles: data.csv\n");
    fs.writeFileSync(path.join(root, "clean.ts"), "export const c = 1;\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "bad override"]);

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(result.ok).toBe(false);
    expect(result.output).toContain(
      "cleanliness.allowedFiles must be a list of paths",
    );
  });
});

describe("runCleanlinessCheck ignored files", () => {
  it("passes a gitignored large file", async () => {
    const { root, runtime } = await setupTest(undefined);

    fs.writeFileSync(path.join(root, ".gitignore"), "ignored.log\n");
    await git(root, ["add", ".gitignore"]);
    await git(root, ["commit", "-m", "ignore"]);

    fs.writeFileSync(path.join(root, "ignored.log"), "x".repeat(2 * 1048576));

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", "HEAD~1");
    expect(result.ok).toBe(true);
  });
});

describe("runCleanlinessCheck against the absorbed integration head", () => {
  it("keeps the recorded base while the branch has not absorbed the head", async () => {
    const { root, runtime, start } = await setupHeadAndTask();

    const result = await runCleanlinessCheck(runtime, root, start, "factory/g");
    expect(result.ok).toBe(true);
  });

  it("does not charge the head's files once the branch absorbs it", async () => {
    const { root, runtime, start } = await setupHeadAndTask();

    await git(root, ["merge", "--no-edit", "factory/g"]);
    const absorbed = await runCleanlinessCheck(
      runtime,
      root,
      start,
      "factory/g",
    );
    expect(absorbed.ok).toBe(true);
    expect(absorbed.output).toBe("Clean");

    // A head that moves past the absorbed commit stays out of the range: the
    // merge base follows, not the head's tip.
    await landOnHead(root, "later.log", "another task's log");

    const moved = await runCleanlinessCheck(runtime, root, start, "factory/g");
    expect(moved.ok).toBe(true);
  });

  it("still charges a disallowed file the task adds itself", async () => {
    const { root, runtime, start } = await setupHeadAndTask();

    await git(root, ["merge", "--no-edit", "factory/g"]);
    fs.writeFileSync(path.join(root, "own.tmp"), "mine");
    await git(root, ["add", "own.tmp"]);
    await git(root, ["commit", "-m", "own artifact"]);

    const result = await runCleanlinessCheck(runtime, root, start, "factory/g");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Disallowed artifact: own.tmp");
    expect(result.output).not.toContain("landed.tmp");
  });
});

describe("runCleanlinessCheck with a recorded base ahead of the merge base", () => {
  it("charges a revision's own rework", async () => {
    const { root, runtime } = await setupHeadAndTask();
    const head = (await git(root, ["rev-parse", "factory/g"])).stdout.trim();
    fs.writeFileSync(path.join(root, "mine.tmp"), "mine");
    await git(root, ["add", "mine.tmp"]);
    await git(root, ["commit", "-m", "revision work"]);

    // The amend stamps the head it could not merge as the revision base.
    const result = await runCleanlinessCheck(runtime, root, head, "factory/g");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Disallowed artifact: mine.tmp");
    expect(result.output).not.toContain("landed.tmp");
  });
});

const flow = {
  "implement-review": {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      { id: "review", prompt: "reviewer", alias: "reviewer", review: true },
    ],
  },
} as any;

function implementRecord(seq: number): StepRecord {
  return rec(seq, {
    step: "implement",
    tree: "tree-1",
    commit: "c1",
    base: "c0",
    outcome: {
      status: "done",
      summary: "implemented",
      concerns: [],
      forward: [],
    },
  });
}

const hitCases = [
  {
    name: "large file",
    write: (root: string) =>
      fs.writeFileSync(path.join(root, "large.ts"), Buffer.alloc(1048576 + 10)),
    output: "Large file: large.ts",
  },
  {
    name: "temp file",
    write: (root: string) =>
      fs.writeFileSync(path.join(root, "cache.tmp"), "temp"),
    output: "Disallowed artifact: cache.tmp",
  },
  {
    name: "new extension",
    write: (root: string) =>
      fs.writeFileSync(path.join(root, "notes.xyz"), "text"),
    output: "New extension: notes.xyz (.xyz)",
  },
];

describe("cleanliness hit routing", () => {
  for (const hit of hitCases) {
    it(`a ${hit.name} earns exactly one cleanliness follow-up`, async () => {
      const { root, runtime } = await setupTest(undefined);
      hit.write(root);
      await git(root, ["add", "."]);
      await git(root, ["commit", "-m", "hit"]);

      const result = await runCleanlinessCheck(
        runtime,
        root,
        "HEAD~1",
        "HEAD~1",
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain(hit.output);

      const state = derive(
        [task("a")],
        [
          implementRecord(1),
          script(2, { step: "checks", ok: false, checks: [result] }),
        ],
        flow,
      );
      expect(state.tasks.a!.phase).toBe("implement");
      expect(state.tasks.a!.cleanlinessRevision).toBe(true);
      expect(state.tasks.a!.gateFix).toBeUndefined();
    });
  }
});
