import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitAll, isAncestor } from "../../src/core/git/commit.js";
import { git } from "../../src/core/git/exec.js";
import { Repo } from "../../src/core/git/repo.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Git commit and revision inspection (§7)", () => {
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

  it("isAncestor distinguishes older from newer commits", async () => {
    const head1 = (await git(tmpRepo.dir, ["rev-parse", "HEAD"])).stdout.trim();
    expect(head1.length).toBe(40);

    fs.writeFileSync(
      path.join(tmpRepo.dir, "ancestor-test.txt"),
      "data\n",
      "utf8",
    );
    const sha2 = (await commitAll(repo, tmpRepo.dir, "feat: next commit"))!;

    expect(await isAncestor(tmpRepo.dir, head1, sha2)).toBe(true);
    expect(await isAncestor(tmpRepo.dir, sha2, head1)).toBe(false);
  });
});
