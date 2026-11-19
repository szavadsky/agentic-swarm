import { describe, expect, it } from "bun:test";
import { runCleanlinessCheck } from "../../src/kernel/cleanliness.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { git } from "../../src/core/git/exec.js";

async function setupTest() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "factory-cleanliness-test-"),
  );
  // Initialize git repo
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test User"]);
  await git(root, ["commit", "--allow-empty", "-m", "start"]);

  const configs = {
    repo: { cleanliness: { maxFileSizeBytes: 10, allowedExtensions: ["ts"] } },
  } as any;
  const runtime = { configs } as unknown as KernelRuntime;

  return { root, runtime };
}

describe("runCleanlinessCheck", () => {
  it("flags large file and disallowed extension", async () => {
    const { root, runtime } = await setupTest();
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

    // HEAD~2 is "start" commit. So diff will include everything committed since then.
    const result = await runCleanlinessCheck(runtime, root, "HEAD~2");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Large file: large.ts");
    expect(result.output).toContain("Disallowed extension: bad.js");
  });
});
