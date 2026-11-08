import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import { commitAll } from "../../src/core/git/commit.js";
import { untrackedFiles } from "../../src/core/git/diff.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

// PsPost5 item 5: scope checks must union untracked files — new test/prod
// files are untracked until the step commits, so tracked-only diffs undercount
// (tests-only "0 files", test-first-scope 1-vs-3) and miss new prod files.

describe("Scope checks union untracked files (PsPost5 item 5)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;
  let baseSha: string;

  beforeEach(async () => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-untracked-"));
    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: wtRoot });
    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo.dir, "tests"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "index.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "index.test.ts"), "// test\n", "utf8");
    baseSha = (await commitAll(repo, tmpRepo.dir, "initial commit"))!;
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  function makeContext(overrides?: Partial<CheckContext>): CheckContext {
    return {
      repo,
      wt: tmpRepo.dir,
      base: baseSha,
      project: {
        orchestrationFolder: ".factory",
        worktreeRoot: wtRoot,
        paths: { tests: "tests/**", prod: "src/**" },
      },
      pipeline: {
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: { stubMaxProdLines: 10, storyMaxProdLines: 20, simpleMaxProdLines: 5 },
      },
      limits: { stubMaxProdLines: 10, storyMaxProdLines: 20, simpleMaxProdLines: 5 },
      outputBytes: 4000,
      ...overrides,
    };
  }

  it("untrackedFiles lists new files with status ?", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "new.test.ts"), "// new\n", "utf8");
    const untracked = await untrackedFiles(tmpRepo.dir);
    expect(untracked.map((f) => f.path)).toContain("tests/new.test.ts");
    expect(untracked.find((f) => f.path === "tests/new.test.ts")?.status).toBe("?");
  });

  it("tests-only counts untracked test files (not 0)", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "a.test.ts"), "// a\n", "utf8");
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "b.test.ts"), "// b\n", "utf8");
    const res = await runCheck("tests-only", makeContext());
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("2 test files");
  });

  it("tests-only fails on untracked non-test files", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "sneaky.ts"), "export const s = 1;\n", "utf8");
    const res = await runCheck("tests-only", makeContext());
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("sneaky.ts");
  });

  it("test-first-scope counts untracked tests and stubs", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "a.test.ts"), "// a\n", "utf8");
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "b.test.ts"), "// b\n", "utf8");
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "stub.ts"), "export const s = 1;\n", "utf8");
    const res = await runCheck("test-first-scope", makeContext());
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("2 test files");
    expect(res.summary).toContain("1 new prod stubs");
  });

  it("test-first-scope counts untracked stub lines against the budget", async () => {
    const big = Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "big-stub.ts"), big, "utf8");
    const res = await runCheck("test-first-scope", makeContext());
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("exceeded limit");
  });

  it("size counts untracked prod lines", async () => {
    const big = Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "big.ts"), big, "utf8");
    const res = await runCheck("size", makeContext({ kind: "story" }));
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("exceeded limit");
  });

  it("test-diff names untracked test files and includes content", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "new.test.ts"), "assert(newFeature);\n", "utf8");
    const res = await runCheck("test-diff", makeContext());
    expect(res.ok).toBe(true);
    const details = res.details as { files: string[]; diff: string };
    expect(details.files).toContain("tests/new.test.ts");
    expect(details.diff).toContain("assert(newFeature);");
  });

  it("tests-only rejects untracked non-test additions", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "extra.ts"), "export const e = 1;\n", "utf8");
    const res = await runCheck("tests-only", makeContext());
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("extra.ts");
  });

  it("poc-scope sees untracked files outside poc/", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "oops.ts"), "export const o = 1;\n", "utf8");
    const res = await runCheck("poc-scope", makeContext({ kind: "poc", task: "t", item: "i" }));
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("oops.ts");
  });
});
