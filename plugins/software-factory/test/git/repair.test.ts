import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { repairWorktree } from "../../src/core/git/repair.js";
import { ensureTaskWorktree, ensureChildWorktree } from "../../src/core/git/worktrees.js";
import { commitAll } from "../../src/core/git/commit.js";
import { mergeParentInto } from "../../src/core/git/merge.js";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Start-up repair (§6.3.6)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-repair-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
      identity: { name: "Repair Tester", email: "repair@factory.local" },
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  it("aborts in-progress merge if MERGE_HEAD exists", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "abort-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    fs.writeFileSync(path.join(parent.path, "shared.txt"), "base\n", "utf8");
    await commitAll(repo, parent.path, "base");

    const child = await ensureChildWorktree(repo, parent, "item-abort");

    fs.writeFileSync(path.join(parent.path, "shared.txt"), "parent edit\n", "utf8");
    await commitAll(repo, parent.path, "parent edit");

    fs.writeFileSync(path.join(child.path, "shared.txt"), "child edit\n", "utf8");
    await commitAll(repo, child.path, "child edit");

    // Produce conflict state
    await mergeParentInto(repo, child.path, parent.branch);

    const mhCheckBefore = await git(
      child.path,
      ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      { allowFail: true }
    );
    expect(mhCheckBefore.code).toBe(0);

    // Run repairWorktree on child (item)
    const repairRes = await repairWorktree(repo, child.path, "item", {
      operatorEditable: [],
    });
    expect(repairRes.actions).toContain("abort_merge");

    // MERGE_HEAD is now gone
    const mhCheckAfter = await git(
      child.path,
      ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      { allowFail: true }
    );
    expect(mhCheckAfter.code).not.toBe(0);
  });

  it("item worktree commits uncommitted changes as interrupted", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "item-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    const child = await ensureChildWorktree(repo, parent, "item-dirt");

    // Leave dirty files in item worktree
    fs.writeFileSync(path.join(child.path, "dirty.txt"), "half-done work", "utf8");

    const repairRes = await repairWorktree(repo, child.path, "item", {
      operatorEditable: [],
    });
    expect(repairRes.actions).toContain("commit_interrupted");

    const logRes = await git(child.path, ["log", "-1", "--pretty=%s"]);
    expect(logRes.stdout.trim()).toBe("interrupted");

    const statusRes = await git(child.path, ["status", "--porcelain"]);
    expect(statusRes.stdout.trim()).toBe("");
  });

  it("task worktree commits operator-editable files and stashes stray dirt", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "op-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // 1. Edit operator-editable file (.factory/op-task/INTENT.md)
    const taskIntent = path.join(parent.path, ".factory", "op-task", "INTENT.md");
    fs.writeFileSync(taskIntent, "# Updated Intent\nOperator edit\n", "utf8");

    // 2. Add stray dirt file (e.g. random tmp or log)
    const strayFile = path.join(parent.path, "stray.log");
    fs.writeFileSync(strayFile, "stray agent dirt\n", "utf8");

    const operatorGlobs = [
      "INTENT.md",
      ".factory/**/INTENT.md",
      "**/*.yaml",
    ];

    const repairRes = await repairWorktree(repo, parent.path, "task", {
      operatorEditable: operatorGlobs,
    });

    expect(repairRes.actions).toContain("commit_operator_edits");
    const stashAction = repairRes.actions.find((a) => a.startsWith("stash_stray:"));
    expect(stashAction).toBeDefined();

    // Check git log for operator edits commit
    const logRes = await git(parent.path, ["log", "-1", "--pretty=%s"]);
    expect(logRes.stdout.trim()).toBe("factory: operator edits");

    // Working directory is now completely clean
    const statusRes = await git(parent.path, ["status", "--porcelain"]);
    expect(statusRes.stdout.trim()).toBe("");

    // Stray dirt is safely preserved in stash
    const stashList = await git(parent.path, ["stash", "list"]);
    expect(stashList.stdout).toContain("factory-stray-");
  });
});
