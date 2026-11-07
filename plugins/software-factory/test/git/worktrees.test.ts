import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import {
  ensureTaskWorktree,
  ensureChildWorktree,
  removeWorktree,
  resetScratch,
} from "../../src/core/git/worktrees.js";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Worktrees management (§7)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-root-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
      identity: { name: "Test User", email: "test@factory.local" },
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  it("ensureTaskWorktree first-run requires clean main except INTENT and is idempotent", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "# Feature Intent\nBuild feature X\n", "utf8");

    // First run creates task worktree
    const res1 = await ensureTaskWorktree(repo, "feat-x", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    expect(res1.created).toBe(true);
    expect(res1.branch).toBe("topic/feat-x");
    expect(fs.existsSync(res1.path)).toBe(true);

    const destIntent = path.join(res1.path, ".factory", "feat-x", "INTENT.md");
    expect(fs.existsSync(destIntent)).toBe(true);
    expect(fs.readFileSync(destIntent, "utf8")).toBe("# Feature Intent\nBuild feature X\n");

    // Second run is idempotent
    const res2 = await ensureTaskWorktree(repo, "feat-x", {
      intentPath,
      orchestrationFolder: ".factory",
    });
    expect(res2.created).toBe(false);
    expect(res2.path).toBe(res1.path);

    // Main checkout dirty with unrelated file throws
    fs.writeFileSync(path.join(tmpRepo.dir, "unrelated.txt"), "dirty", "utf8");
    await expect(
      ensureTaskWorktree(repo, "feat-y", {
        intentPath,
        orchestrationFolder: ".factory",
      })
    ).rejects.toThrow("Main checkout is dirty");
  });

  it("worktree create/reuse/prune/remove keeps branch", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const taskRes = await ensureTaskWorktree(repo, "task-a", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // Create child worktree
    const child1 = await ensureChildWorktree(repo, taskRes, "item-1");
    expect(child1.created).toBe(true);
    expect(child1.branch).toBe("topic/task-a--item-1");
    expect(fs.existsSync(child1.path)).toBe(true);

    // Reusing child worktree is idempotent
    const childReuse = await ensureChildWorktree(repo, taskRes, "item-1");
    expect(childReuse.created).toBe(false);
    expect(childReuse.path).toBe(child1.path);

    // Remove worktree
    await removeWorktree(repo, child1.path);
    expect(fs.existsSync(child1.path)).toBe(false);

    // Branch must still exist
    const branchCheck = await git(
      repo.mainRoot,
      ["rev-parse", "--verify", `refs/heads/${child1.branch}`],
      { allowFail: true }
    );
    expect(branchCheck.code).toBe(0);

    // ensureChildWorktree on existing branch attaches it again
    const childReattached = await ensureChildWorktree(repo, taskRes, "item-1");
    expect(childReattached.created).toBe(false);
    expect(fs.existsSync(childReattached.path)).toBe(true);
  });

  it("resetScratch recreates worktree and branch fresh from parent tip", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const taskRes = await ensureTaskWorktree(repo, "task-scratch", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // Create simple scratch
    const scratch1 = await ensureChildWorktree(repo, taskRes, "simple");
    fs.writeFileSync(path.join(scratch1.path, "scratch.txt"), "first version", "utf8");
    await git(scratch1.path, ["add", "scratch.txt"]);
    await git(scratch1.path, ["commit", "-m", "scratch work"]);

    // Now reset scratch
    const resetRes = await resetScratch(repo, taskRes, "simple");
    expect(resetRes.branch).toBe("topic/task-scratch--simple");
    expect(fs.existsSync(path.join(resetRes.path, "scratch.txt"))).toBe(false);
  });
});
