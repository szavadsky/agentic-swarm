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

  it("first-run accepts INTENT inside an untracked .factory/tasks/<task>/ folder", async () => {
    // INTENT nested in a brand-new untracked folder: default porcelain
    // collapses this to one `?? .factory/` folder entry.
    const intentPath = path.join(tmpRepo.dir, ".factory", "tasks", "nested-task", "INTENT.md");
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, "# Nested Intent\n", "utf8");

    const res = await ensureTaskWorktree(repo, "nested-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });
    expect(res.created).toBe(true);
    expect(fs.readFileSync(path.join(res.path, ".factory", "nested-task", "INTENT.md"), "utf8")).toBe(
      "# Nested Intent\n"
    );
  });

  it("second task starts with first task's INTENT untracked in main checkout", async () => {
    const orchFolder = ".factory/tasks";
    // Task 1's untracked INTENT.md left in main checkout
    const task1Intent = path.join(tmpRepo.dir, orchFolder, "task-1", "INTENT.md");
    fs.mkdirSync(path.dirname(task1Intent), { recursive: true });
    fs.writeFileSync(task1Intent, "# Task 1 Intent\n", "utf8");

    // Task 2's intent
    const task2Intent = path.join(tmpRepo.dir, orchFolder, "task-2", "INTENT.md");
    fs.mkdirSync(path.dirname(task2Intent), { recursive: true });
    fs.writeFileSync(task2Intent, "# Task 2 Intent\n", "utf8");

    // Ensure task 2 starts cleanly despite task 1's untracked INTENT.md
    const res = await ensureTaskWorktree(repo, "task-2", {
      intentPath: task2Intent,
      orchestrationFolder: orchFolder,
    });
    expect(res.created).toBe(true);
    expect(fs.readFileSync(path.join(res.path, orchFolder, "task-2", "INTENT.md"), "utf8")).toBe(
      "# Task 2 Intent\n"
    );
  });

  it("first-run still rejects unrelated dirt and stray INTENT-named files", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");
    // Same basename in another folder must NOT pass the exact-path check.
    fs.mkdirSync(path.join(tmpRepo.dir, "other"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "other", "INTENT.md"), "impostor", "utf8");

    await expect(
      ensureTaskWorktree(repo, "reject-task", {
        intentPath,
        orchestrationFolder: ".factory",
      })
    ).rejects.toThrow("Main checkout is dirty");
  });

  it("prunes a stale unregistered folder before re-adding the worktree", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const taskRes = await ensureTaskWorktree(repo, "stale-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });
    const child = await ensureChildWorktree(repo, taskRes, "item-stale");

    // Simulate a crash: unregister the worktree but leave junk in the folder.
    await git(repo.mainRoot, ["worktree", "remove", "--force", child.path]);
    await git(repo.mainRoot, ["worktree", "prune"]);
    fs.mkdirSync(child.path, { recursive: true });
    fs.writeFileSync(path.join(child.path, "crash-junk.txt"), "junk", "utf8");

    // Branch still exists; ensure must drop the stale folder and re-attach.
    const reattached = await ensureChildWorktree(repo, taskRes, "item-stale");
    expect(reattached.created).toBe(false);
    expect(reattached.path).toBe(child.path);
    expect(fs.existsSync(path.join(child.path, "crash-junk.txt"))).toBe(false);
    const listRes = await git(repo.mainRoot, ["worktree", "list", "--porcelain"]);
    expect(listRes.stdout).toContain(`worktree ${child.path}`);
  });

  it("registration check does not confuse sibling worktree prefixes", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const taskRes = await ensureTaskWorktree(repo, "prefix-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });
    // Longer slug first so its path is a superstring of the shorter one.
    const longChild = await ensureChildWorktree(repo, taskRes, "item-longer");
    expect(longChild.created).toBe(true);

    const shortChild = await ensureChildWorktree(repo, taskRes, "item");
    expect(shortChild.created).toBe(true);
    expect(fs.existsSync(shortChild.path)).toBe(true);
    // Both registered exactly.
    const listRes = await git(repo.mainRoot, ["worktree", "list", "--porcelain"]);
    expect(listRes.stdout).toContain(`worktree ${longChild.path}`);
    expect(listRes.stdout).toContain(`worktree ${shortChild.path}`);
  });
});
