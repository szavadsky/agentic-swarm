// biome-ignore-all lint/complexity: split-rest
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitError, git } from "../src/core/git/exec.js";
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
    await expect(
      git(repo.dir, ["checkout", "nonexistent-branch"]),
    ).rejects.toThrow(GitError);

    const res = await git(repo.dir, ["checkout", "nonexistent-branch"], {
      allowFail: true,
    });
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("nonexistent-branch");
  });

  it("commits successfully using factory fallback identity when repo lacks config", async () => {
    // Create bare clone without user.name/email
    const unconfiguredDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-unconfigured-repo-"),
    );
    try {
      await git(unconfiguredDir, ["init", "-b", "main"]);

      fs.writeFileSync(
        path.join(unconfiguredDir, "file.txt"),
        "content\n",
        "utf8",
      );
      await git(unconfiguredDir, ["add", "file.txt"]);

      // Must succeed via GIT_AUTHOR_*/GIT_COMMITTER_* env without error
      const commitRes = await git(unconfiguredDir, [
        "commit",
        "-m",
        "first commit",
      ]);
      expect(commitRes.code).toBe(0);

      const logRes = await git(unconfiguredDir, [
        "log",
        "-1",
        "--format=%an <%ae>",
      ]);
      expect(logRes.stdout).toBe("Software Factory <factory@local>");
    } finally {
      fs.rmSync(unconfiguredDir, { recursive: true, force: true });
    }
  });

  it("engine git calls bypass repo hooks that would reject the commit", async () => {
    // A hostile pre-commit hook that rejects everything.
    const hookPath = path.join(repo.dir, ".git", "hooks", "pre-commit");
    fs.writeFileSync(hookPath, "#!/bin/sh\necho BLOCKED >&2\nexit 1\n", "utf8");
    fs.chmodSync(hookPath, 0o755);
    try {
      repo.writeFile("hooked.txt", "content\n");
      await git(repo.dir, ["add", "hooked.txt"]);
      const res = await git(repo.dir, ["commit", "-m", "hook bypass"]);
      expect(res.code).toBe(0);
      const logRes = await git(repo.dir, ["log", "-1", "--pretty=%s"]);
      expect(logRes.stdout).toBe("hook bypass");
    } finally {
      fs.rmSync(hookPath, { force: true });
    }
  });

  it("read probes leave the index alone so a concurrent reset keeps the lock", async () => {
    const probe = createTmpRepo();
    try {
      probe.writeFile("probe.txt", "probe\n");
      probe.commit("probe");
      // A stale stat entry makes an optional-lock status refresh and rewrite
      // the index while holding index.lock; a merge resetting the same
      // checkout then dies with "Unable to create index.lock" and the launch
      // stops as infra.
      const stale = new Date("2000-01-01T00:00:00Z");
      fs.utimesSync(path.join(probe.dir, "probe.txt"), stale, stale);
      const indexPath = path.join(probe.dir, ".git", "index");
      const before = fs.readFileSync(indexPath);
      await git(probe.dir, ["status", "--porcelain"]);
      expect(fs.readFileSync(indexPath).equals(before)).toBe(true);
    } finally {
      probe.cleanup();
    }
  });

  it("Repo.identityEnv builds the author/committer env once", async () => {
    const { Repo } = await import("../src/core/git/repo.js");
    const withIdentity = new Repo({
      mainRoot: repo.dir,
      worktreeRoot: repo.dir,
      identity: { name: "Id Name", email: "id@example.test" },
    });
    expect(withIdentity.identityEnv()).toEqual({
      GIT_AUTHOR_NAME: "Id Name",
      GIT_AUTHOR_EMAIL: "id@example.test",
      GIT_COMMITTER_NAME: "Id Name",
      GIT_COMMITTER_EMAIL: "id@example.test",
    });
    const withoutIdentity = new Repo({
      mainRoot: repo.dir,
      worktreeRoot: repo.dir,
    });
    expect(withoutIdentity.identityEnv()).toBeUndefined();
  });
});
