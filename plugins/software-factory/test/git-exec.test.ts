import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { git, GitError } from "../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";

describe("Hardened git execution (§2, §7)", () => {
  let repo: TmpRepo;

  beforeAll(() => {
    repo = createTmpRepo();
  });

  afterAll(() => {
    repo.cleanup();
  });

  it("executes git commands and trims trailing newline from stdout", async () => {
    const res = await git(repo.dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("main");
  });

  it("throws GitError on failure unless allowFail: true", async () => {
    await expect(git(repo.dir, ["checkout", "nonexistent-branch"])).rejects.toThrow(
      GitError
    );

    const res = await git(repo.dir, ["checkout", "nonexistent-branch"], {
      allowFail: true,
    });
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("nonexistent-branch");
  });

  it("commits successfully using factory fallback identity when repo lacks config", async () => {
    // Create bare clone without user.name/email
    const unconfiguredDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-unconfigured-repo-")
    );
    try {
      await git(unconfiguredDir, ["init", "-b", "main"]);

      fs.writeFileSync(path.join(unconfiguredDir, "file.txt"), "content\n", "utf8");
      await git(unconfiguredDir, ["add", "file.txt"]);

      // Must succeed via GIT_AUTHOR_*/GIT_COMMITTER_* env without error
      const commitRes = await git(unconfiguredDir, ["commit", "-m", "first commit"]);
      expect(commitRes.code).toBe(0);

      const logRes = await git(unconfiguredDir, ["log", "-1", "--format=%an <%ae>"]);
      expect(logRes.stdout).toBe("Software Factory <factory@local>");
    } finally {
      fs.rmSync(unconfiguredDir, { recursive: true, force: true });
    }
  });
});
