// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitAll } from "../../src/core/git/commit.js";
import { git } from "../../src/core/git/exec.js";
import { hasConflictMarkers, unmergedFiles } from "../../src/core/git/merge.js";
import { Repo } from "../../src/core/git/repo.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Merge conflict detection (§7)", () => {
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

  async function addWorktree(
    branch: string,
    startPoint = "HEAD",
  ): Promise<{ branch: string; path: string }> {
    const wtPath = path.join(wtRoot, branch.replace(/[^A-Za-z0-9._-]+/g, "_"));
    await git(repo.mainRoot, [
      "worktree",
      "add",
      "-b",
      branch,
      wtPath,
      startPoint,
    ]);
    return { branch, path: wtPath };
  }

  it("unmergedFiles and hasConflictMarkers report a real merge conflict until it is resolved", async () => {
    const parent = await addWorktree("topic/conflict-task");

    fs.writeFileSync(
      path.join(parent.path, "conflict.txt"),
      "base line\n",
      "utf8",
    );
    await commitAll(repo, parent.path, "feat: add base conflict file");

    const child = await addWorktree(
      "topic/conflict-task--item-conflict",
      parent.branch,
    );

    fs.writeFileSync(
      path.join(parent.path, "conflict.txt"),
      "parent line\n",
      "utf8",
    );
    await commitAll(repo, parent.path, "feat: parent edit");

    fs.writeFileSync(
      path.join(child.path, "conflict.txt"),
      "child line\n",
      "utf8",
    );
    await commitAll(repo, child.path, "feat: child edit");

    const merge = await git(child.path, ["merge", "--no-edit", parent.branch], {
      allowFail: true,
    });
    expect(merge.code).not.toBe(0);

    expect(await unmergedFiles(child.path)).toEqual(["conflict.txt"]);
    expect(await hasConflictMarkers(child.path)).toEqual(["conflict.txt"]);

    // Staging the resolution clears the unmerged entry; the merge-touched file
    // is still scanned but no longer carries a marker pair.
    fs.writeFileSync(
      path.join(child.path, "conflict.txt"),
      "resolved line\n",
      "utf8",
    );
    await git(child.path, ["add", "--", "conflict.txt"]);
    expect(await unmergedFiles(child.path)).toEqual([]);
    expect(await hasConflictMarkers(child.path)).toEqual([]);
  });

  it("hasConflictMarkers ignores legitimate ======= lines in merge-touched files", async () => {
    const parent = await addWorktree("topic/marker-task");

    // Tracked file with a legitimate 7-equals separator line (RST heading).
    fs.writeFileSync(
      path.join(parent.path, "doc.rst"),
      "Title\n=======\n\nBody text\n",
      "utf8",
    );
    await commitAll(repo, parent.path, "feat: add doc");

    const child = await addWorktree(
      "topic/marker-task--item-marker",
      parent.branch,
    );

    // Touch the doc on the parent side so it lands in the merge-touched set.
    fs.writeFileSync(
      path.join(parent.path, "doc.rst"),
      "Title\n=======\n\nParent body\n",
      "utf8",
    );
    await commitAll(repo, parent.path, "feat: parent doc edit");

    fs.writeFileSync(
      path.join(child.path, "other.txt"),
      "child work\n",
      "utf8",
    );
    await commitAll(repo, child.path, "feat: child other file");

    const clean = await git(child.path, ["merge", "--no-edit", parent.branch], {
      allowFail: true,
    });
    expect(clean.code).toBe(0);
    expect(await hasConflictMarkers(child.path)).not.toContain("doc.rst");

    // Sanity: real markers in an unmerged file are still reported.
    fs.writeFileSync(path.join(parent.path, "clash.txt"), "base\n", "utf8");
    await commitAll(repo, parent.path, "feat: base clash");
    const bringBase = await git(
      child.path,
      ["merge", "--no-edit", parent.branch],
      {
        allowFail: true,
      },
    );
    expect(bringBase.code).toBe(0);
    fs.writeFileSync(path.join(parent.path, "clash.txt"), "parent v\n", "utf8");
    await commitAll(repo, parent.path, "feat: parent clash");
    fs.writeFileSync(path.join(child.path, "clash.txt"), "child v\n", "utf8");
    await commitAll(repo, child.path, "feat: child clash");
    const clash = await git(child.path, ["merge", "--no-edit", parent.branch], {
      allowFail: true,
    });
    expect(clash.code).not.toBe(0);
    expect(await hasConflictMarkers(child.path)).toContain("clash.txt");
    // ... but the legitimate separator file is never flagged.
    expect(await hasConflictMarkers(child.path)).not.toContain("doc.rst");
  });
});
