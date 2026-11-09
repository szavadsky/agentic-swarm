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

  it("item worktree commits orchestration dirt as recovery and stashes outside dirt", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "item-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    const child = await ensureChildWorktree(repo, parent, "item-dirt");

    // Orchestration dirt (task slice) + outside dirt.
    fs.mkdirSync(path.join(child.path, ".factory", "item-task", "items", "item-dirt", "steps"), { recursive: true });
    fs.writeFileSync(path.join(child.path, ".factory", "item-task", "journal.ndjson"), '{"type":"x"}\n', "utf8");
    fs.writeFileSync(path.join(child.path, "dirty.txt"), "half-done work", "utf8");

    const repairRes = await repairWorktree(repo, child.path, "item", {
      orchestrationFolder: ".factory",
      operatorEditable: [],
    });
    expect(repairRes.actions).toContain("commit_recovery");
    expect(repairRes.actions.find((a) => a.startsWith("stash_stray:"))).toBeDefined();

    const logRes = await git(child.path, ["log", "-1", "--pretty=%s"]);
    expect(logRes.stdout.trim()).toBe("factory: restart recovery");
    const showRes = await git(child.path, ["show", "HEAD:.factory/item-task/journal.ndjson"]);
    expect(showRes.stdout).toContain('"type":"x"');

    const statusRes = await git(child.path, ["status", "--porcelain"]);
    expect(statusRes.stdout.trim()).toBe("");

    // Outside dirt preserved in stash, recovery evidence NOT stashed.
    const stashShow = await git(child.path, ["stash", "show", "--include-untracked", "--name-only", "stash@{0}"]);
    expect(stashShow.stdout).toContain("dirty.txt");
    expect(stashShow.stdout).not.toContain("journal.ndjson");
  });

  it("task worktree commits orchestration dirt as recovery and stashes outside stray dirt", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "op-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // 1. Orchestration dirt: operator edit + uncommitted journal + runs record.
    const taskIntent = path.join(parent.path, ".factory", "op-task", "INTENT.md");
    fs.writeFileSync(taskIntent, "# Updated Intent\nOperator edit\n", "utf8");
    fs.writeFileSync(path.join(parent.path, ".factory", "op-task", "journal.ndjson"), '{"type":"pm_edits_validation_failed"}\n', "utf8");
    fs.mkdirSync(path.join(parent.path, ".factory", "op-task", "runs", "001-pm-edits-1-a1"), { recursive: true });
    fs.writeFileSync(path.join(parent.path, ".factory", "op-task", "runs", "001-pm-edits-1-a1", "input.md"), "seeded\n", "utf8");

    // 2. Outside stray dirt (target src edit + editor backup).
    fs.writeFileSync(path.join(parent.path, "src-file.ts"), "target edit\n", "utf8");
    fs.writeFileSync(path.join(parent.path, "notes.ts~"), "editor backup\n", "utf8");

    const repairRes = await repairWorktree(repo, parent.path, "task", {
      orchestrationFolder: ".factory",
      operatorEditable: ["INTENT.md", ".factory/**/INTENT.md", "**/*.yaml"],
    });

    expect(repairRes.actions).toContain("commit_recovery");
    const stashAction = repairRes.actions.find((a) => a.startsWith("stash_stray:"));
    expect(stashAction).toBeDefined();

    // Recovery commit contains orchestration evidence.
    const logRes = await git(parent.path, ["log", "-1", "--pretty=%s"]);
    expect(logRes.stdout.trim()).toBe("factory: restart recovery");
    const showJournal = await git(parent.path, ["show", "HEAD:.factory/op-task/journal.ndjson"]);
    expect(showJournal.stdout).toContain("pm_edits_validation_failed");
    const showIntent = await git(parent.path, ["show", "HEAD:.factory/op-task/INTENT.md"]);
    expect(showIntent.stdout).toContain("Operator edit");

    // Working directory is now completely clean.
    const statusRes = await git(parent.path, ["status", "--porcelain"]);
    expect(statusRes.stdout.trim()).toBe("");

    // Outside dirt stashed, orchestration evidence NOT in stash.
    const stashShow = await git(parent.path, ["stash", "show", "--include-untracked", "--name-only", "stash@{0}"]);
    expect(stashShow.stdout).toContain("src-file.ts");
    expect(stashShow.stdout).toContain("notes.ts~");
    expect(stashShow.stdout).not.toContain("journal.ndjson");
    expect(stashShow.stdout).not.toContain("INTENT.md");
  });

  it("task worktree commits a new steer/fromuserpending file instead of stashing it", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "steer-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // Brand-new untracked folder with the operator's message inside.
    const pendingFile = path.join(
      parent.path, ".factory", "steer-task", "steer", "fromuserpending", "msg-1.md"
    );
    fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
    fs.writeFileSync(pendingFile, "# Answer\nYes, proceed.\n", "utf8");

    const repairRes = await repairWorktree(repo, parent.path, "task", {
      orchestrationFolder: ".factory",
      operatorEditable: [".factory/steer-task/steer/fromuserpending/**"],
    });

    expect(repairRes.actions).toContain("commit_recovery");
    expect(repairRes.actions.find((a) => a.startsWith("stash_stray:"))).toBeUndefined();

    // The message is committed, not stashed away.
    const logRes = await git(parent.path, ["log", "-1", "--pretty=%s"]);
    expect(logRes.stdout.trim()).toBe("factory: restart recovery");
    const showRes = await git(
      parent.path,
      ["show", "HEAD:.factory/steer-task/steer/fromuserpending/msg-1.md"]
    );
    expect(showRes.stdout).toContain("Yes, proceed.");
    const stashList = await git(parent.path, ["stash", "list"]);
    expect(stashList.stdout.trim()).toBe("");
  });

});
