import { describe, expect, it } from "bun:test";
import { runCleanlinessCheck } from "../../src/kernel/cleanliness.js";
import type { KernelRuntime, TaskFile } from "../../src/kernel/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { git } from "../../src/core/git/exec.js";

async function setupTest(config?: {
  maxFileSizeBytes?: number;
  allowedExtensions?: string[];
  maxOutOfScopeFiles?: number;
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
    const result = await runCleanlinessCheck(runtime, root, "HEAD~2");
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

    // 4. Too many files out of task scope
    for (let i = 1; i <= 4; i++) {
      fs.writeFileSync(path.join(root, `out${i}.ts`), `code ${i}`);
    }

    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "dirty"]);

    const task: TaskFile = {
      slug: "test-task",
      title: "Test task",
      kind: "development",
      flow: "implement-review",
      deps: [],
      scope: ["src/main.ts"],
      revision: 0,
      source: "M5",
      body: "Test body",
    };

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", task);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Large file: large.ts");
    expect(result.output).toContain("Disallowed artifact: model.pt");
    expect(result.output).toContain("Disallowed artifact: cache.tmp");
    expect(result.output).toContain("New extension: notes.xyz (.xyz)");
    expect(result.output).toContain("Too many files outside task scope");
  });
});

describe("runCleanlinessCheck default rules pass", () => {
  it("passes when diff adheres to default cleanliness rules without repo config", async () => {
    const { root, runtime } = await setupTest(undefined);

    // Add a normal small .ts file matching scope and existing extension
    const validFile = path.join(root, "clean.ts");
    fs.writeFileSync(validFile, "export const clean = true;\n");

    await git(root, ["add", "clean.ts"]);
    await git(root, ["commit", "-m", "clean"]);

    const task: TaskFile = {
      slug: "test-task",
      title: "Test task",
      kind: "development",
      flow: "implement-review",
      deps: [],
      scope: ["clean.ts"],
      revision: 0,
      source: "M5",
      body: "Test body",
    };

    const result = await runCleanlinessCheck(runtime, root, "HEAD~1", task);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("pass");
  });
});
