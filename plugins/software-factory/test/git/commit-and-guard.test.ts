import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { commitAll, headOf, isAncestor } from "../../src/core/git/commit.js";
import { captureHead, enforceHead } from "../../src/core/git/guard.js";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Git commit, headOf, isAncestor, and HEAD guard (§7)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-commit-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
      identity: { name: "Commit Tester", email: "tester@factory.local" },
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  it("commitAll returns sha on changes and null on no changes", async () => {
    const filePath = path.join(tmpRepo.dir, "hello.txt");
    fs.writeFileSync(filePath, "Hello World\n", "utf8");

    const sha1 = await commitAll(repo, tmpRepo.dir, "feat: add hello");
    expect(sha1).toBeString();
    expect(sha1?.length).toBe(40);

    // No changes to commit -> returns null
    const sha2 = await commitAll(repo, tmpRepo.dir, "empty commit");
    expect(sha2).toBeNull();

    // allowEmpty creates commit even with no changes
    const shaEmpty = await commitAll(repo, tmpRepo.dir, "chore: empty commit", {
      allowEmpty: true,
    });
    expect(shaEmpty).toBeString();
    expect(shaEmpty).not.toBe(sha1);
  });

  it("headOf and isAncestor inspect revision state accurately", async () => {
    const head1 = await headOf(tmpRepo.dir);
    expect(head1.branch).toBe("main");
    expect(head1.sha.length).toBe(40);

    fs.writeFileSync(path.join(tmpRepo.dir, "ancestor-test.txt"), "data\n", "utf8");
    const sha2 = (await commitAll(repo, tmpRepo.dir, "feat: next commit"))!;

    expect(await isAncestor(tmpRepo.dir, head1.sha, sha2)).toBe(true);
    expect(await isAncestor(tmpRepo.dir, sha2, head1.sha)).toBe(false);
  });

  it("HEAD guard restores branch and soft-resets moved HEAD keeping changes", async () => {
    const before = await captureHead(tmpRepo.dir);

    // Case 1: Agent commits on the same branch (HEAD moved)
    fs.writeFileSync(path.join(tmpRepo.dir, "agent-work.txt"), "agent changes", "utf8");
    await git(tmpRepo.dir, ["add", "agent-work.txt"]);
    await git(tmpRepo.dir, ["commit", "-m", "agent unauthorized commit"]);

    const afterMoved = await headOf(tmpRepo.dir);
    expect(afterMoved.sha).not.toBe(before.sha);

    const guardResult1 = await enforceHead(repo, tmpRepo.dir, before);
    expect(guardResult1.headMoved).toBe(true);
    expect(guardResult1.branchChanged).toBe(false);

    // HEAD was soft-reset back to before.sha
    const current1 = await headOf(tmpRepo.dir);
    expect(current1.sha).toBe(before.sha);
    expect(current1.branch).toBe(before.branch);

    // Changes remain staged in working tree
    const status1 = await git(tmpRepo.dir, ["status", "--porcelain"]);
    expect(status1.stdout).toContain("agent-work.txt");

    // Clear changes for next case
    await git(tmpRepo.dir, ["reset", "--hard", before.sha]);

    // Case 2: Agent checks out another branch without committing
    await git(tmpRepo.dir, ["checkout", "-b", "rogue-branch"]);
    fs.writeFileSync(path.join(tmpRepo.dir, "uncommitted.txt"), "dirty work", "utf8");

    const guardResult2 = await enforceHead(repo, tmpRepo.dir, before);
    expect(guardResult2.branchChanged).toBe(true);
    expect(guardResult2.headMoved).toBe(false);

    const current2 = await headOf(tmpRepo.dir);
    expect(current2.branch).toBe(before.branch);
    expect(fs.readFileSync(path.join(tmpRepo.dir, "uncommitted.txt"), "utf8")).toBe(
      "dirty work"
    );
  });
});
