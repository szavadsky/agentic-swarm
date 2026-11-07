import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import {
  mergeParentInto,
  hasConflictMarkers,
  concludeMerge,
  mergeChildIntoParent,
  treeOf,
} from "../../src/core/git/merge.js";
import { ensureTaskWorktree, ensureChildWorktree } from "../../src/core/git/worktrees.js";
import { commitAll } from "../../src/core/git/commit.js";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Merge path primitives (§7)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-merge-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
      identity: { name: "Merge Tester", email: "merge@factory.local" },
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  it("treeOf returns valid git tree sha", async () => {
    const tree = await treeOf(tmpRepo.dir, "HEAD");
    expect(tree).toBeString();
    expect(tree.length).toBe(40);
  });

  it("mergeParentInto cleanly merges when no conflicts exist", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "clean-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    const child = await ensureChildWorktree(repo, parent, "item-clean");

    // Parent adds file A
    fs.writeFileSync(path.join(parent.path, "file-a.txt"), "parent content", "utf8");
    await commitAll(repo, parent.path, "feat: parent change");

    // Child adds file B
    fs.writeFileSync(path.join(child.path, "file-b.txt"), "child content", "utf8");
    await commitAll(repo, child.path, "feat: child change");

    // Merge parent into child
    const mergeRes = await mergeParentInto(repo, child.path, parent.branch);
    expect(mergeRes.ok).toBe(true);
    if (mergeRes.ok) {
      expect(mergeRes.sha).toBeString();
      expect(fs.existsSync(path.join(child.path, "file-a.txt"))).toBe(true);
      expect(fs.existsSync(path.join(child.path, "file-b.txt"))).toBe(true);
    }
  });

  it("mergeParentInto conflict state leaves conflicts on disk + concludeMerge commits once resolved", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "conflict-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // Create a base file
    fs.writeFileSync(path.join(parent.path, "conflict.txt"), "base line\n", "utf8");
    await commitAll(repo, parent.path, "feat: add base conflict file");

    const child = await ensureChildWorktree(repo, parent, "item-conflict");

    // Parent edits conflict.txt
    fs.writeFileSync(path.join(parent.path, "conflict.txt"), "parent line\n", "utf8");
    await commitAll(repo, parent.path, "feat: parent edit");

    // Child edits conflict.txt differently
    fs.writeFileSync(path.join(child.path, "conflict.txt"), "child line\n", "utf8");
    await commitAll(repo, child.path, "feat: child edit");

    // Merge parent into child -> conflict
    const mergeRes = await mergeParentInto(repo, child.path, parent.branch);
    expect(mergeRes.ok).toBe(false);
    if (!mergeRes.ok) {
      expect(mergeRes.conflicts).toContain("conflict.txt");
    }

    // hasConflictMarkers detects the conflicted file
    const markers = await hasConflictMarkers(child.path);
    expect(markers).toContain("conflict.txt");

    // concludeMerge throws while conflict markers remain
    await expect(
      concludeMerge(repo, child.path, "resolve merge")
    ).rejects.toThrow("Cannot conclude merge");

    // Resolve conflict by writing resolved content WITHOUT staging:
    // concludeMerge stages the resolution itself (integrate may not run git).
    fs.writeFileSync(path.join(child.path, "conflict.txt"), "resolved line\n", "utf8");

    // concludeMerge succeeds and stages + commits the resolution
    const resolvedSha = await concludeMerge(repo, child.path, "integrate: resolve conflicts");
    expect(resolvedSha).toBeString();
    expect(resolvedSha.length).toBe(40);

    // Resolution is committed; tree contains the resolved content
    const committed = await git(child.path, ["show", `${resolvedSha}:conflict.txt`]);
    expect(committed.stdout).toBe("resolved line");
  });

  it("mergeChildIntoParent performs --no-ff merge into parent worktree", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "noff-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    const child = await ensureChildWorktree(repo, parent, "item-noff");

    fs.writeFileSync(path.join(child.path, "feature.txt"), "feature data", "utf8");
    await commitAll(repo, child.path, "feat: add feature");

    const mergeSha = await mergeChildIntoParent(
      repo,
      parent.path,
      child.branch,
      "factory(item-noff): merge"
    );
    expect(mergeSha).toBeString();
    expect(fs.existsSync(path.join(parent.path, "feature.txt"))).toBe(true);
  });

  it("hasConflictMarkers ignores legitimate ======= lines in merge-touched files", async () => {
    const intentPath = path.join(tmpRepo.dir, "INTENT.md");
    fs.writeFileSync(intentPath, "Intent", "utf8");

    const parent = await ensureTaskWorktree(repo, "marker-task", {
      intentPath,
      orchestrationFolder: ".factory",
    });

    // Tracked file with a legitimate 7-equals separator line (RST heading).
    fs.writeFileSync(path.join(parent.path, "doc.rst"), "Title\n=======\n\nBody text\n", "utf8");
    await commitAll(repo, parent.path, "feat: add doc");

    const child = await ensureChildWorktree(repo, parent, "item-marker");

    // Touch the doc on the parent side so it lands in the merge-touched set.
    fs.writeFileSync(path.join(parent.path, "doc.rst"), "Title\n=======\n\nParent body\n", "utf8");
    await commitAll(repo, parent.path, "feat: parent doc edit");

    fs.writeFileSync(path.join(child.path, "other.txt"), "child work\n", "utf8");
    await commitAll(repo, child.path, "feat: child other file");

    const mergeRes = await mergeParentInto(repo, child.path, parent.branch);
    expect(mergeRes.ok).toBe(true);

    // Sanity: real markers in an unmerged file are still reported.
    fs.writeFileSync(path.join(parent.path, "clash.txt"), "base\n", "utf8");
    await commitAll(repo, parent.path, "feat: base clash");
    await git(child.path, ["merge", "--no-edit", parent.branch]);
    fs.writeFileSync(path.join(parent.path, "clash.txt"), "parent v\n", "utf8");
    await commitAll(repo, parent.path, "feat: parent clash");
    fs.writeFileSync(path.join(child.path, "clash.txt"), "child v\n", "utf8");
    await commitAll(repo, child.path, "feat: child clash");
    const clashRes = await mergeParentInto(repo, child.path, parent.branch);
    expect(clashRes.ok).toBe(false);
    if (!clashRes.ok) {
      expect(clashRes.conflicts).toContain("clash.txt");
    }
    expect(await hasConflictMarkers(child.path)).toContain("clash.txt");
    // ... but the legitimate separator file is never flagged.
    expect(await hasConflictMarkers(child.path)).not.toContain("doc.rst");
  });
});
