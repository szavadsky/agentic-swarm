import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import { commitAll } from "../../src/core/git/commit.js";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Scope, size, simple-guard, and custom checks (§9)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;
  let baseSha: string;

  beforeEach(async () => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-scope-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });

    // Create initial repo structure: src/ and tests/
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
        limits: {
          stubMaxProdLines: 10,
          storyMaxProdLines: 20,
          simpleMaxProdLines: 5,
        },
      },
      limits: {
        stubMaxProdLines: 10,
        storyMaxProdLines: 20,
        simpleMaxProdLines: 5,
      },
      outputBytes: 4000,
      ...overrides,
    };
  }

  it("test-first-scope accepts small new stub, rejects modified prod file and oversize stubs", async () => {
    // 1. Accepts test change + small new prod stub
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "new.test.ts"), "test\n", "utf8");
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "stub.ts"), "export interface Stub {}\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "test-first valid");

    const ctxValid = makeContext();
    const resValid = await runCheck("test-first-scope", ctxValid);
    expect(resValid.ok).toBe(true);

    // 2. Rejects modification of an existing prod file
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "index.ts"), "export const a = 2;\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "modified existing prod");

    const ctxMod = makeContext();
    const resMod = await runCheck("test-first-scope", ctxMod);
    expect(resMod.ok).toBe(false);
    expect(resMod.summary).toContain("Modified prod file not allowed");

    // 3. Rejects oversize stub (> stubMaxProdLines)
    await git(tmpRepo.dir, ["reset", "--hard", baseSha]);
    const largeStub = Array.from({ length: 15 }, (_, i) => `// line ${i}`).join("\n") + "\n";
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "large.ts"), largeStub, "utf8");
    await commitAll(repo, tmpRepo.dir, "large stub");

    const ctxLarge = makeContext();
    const resLarge = await runCheck("test-first-scope", ctxLarge);
    expect(resLarge.ok).toBe(false);
    expect(resLarge.summary).toContain("exceeded limit");
  });

  it("tests-only requires all changes under paths.tests", async () => {
    // Modify test file -> ok
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "index.test.ts"), "// updated test\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "test change");

    const ctxOk = makeContext();
    const resOk = await runCheck("tests-only", ctxOk);
    expect(resOk.ok).toBe(true);

    // Modify prod file -> fail
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "index.ts"), "// prod change\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "prod change");

    const ctxFail = makeContext();
    const resFail = await runCheck("tests-only", ctxFail);
    expect(resFail.ok).toBe(false);
    expect(resFail.summary).toContain("Changes outside test paths");
  });

  it("test-diff generates diff for QA", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "index.test.ts"), "// new test line\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "update test");

    const ctx = makeContext();
    const res = await runCheck("test-diff", ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("test-diff generated");
    expect(res.output).toContain("+// new test line");
  });

  it("size checks prod lines vs storyMaxProdLines / simpleMaxProdLines depending on kind", async () => {
    // Add 8 lines to src/
    const content = Array.from({ length: 8 }, (_, i) => `const x${i} = ${i};`).join("\n") + "\n";
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "code.ts"), content, "utf8");
    await commitAll(repo, tmpRepo.dir, "add code");

    // For story kind: limit is 20 -> 8 lines is OK
    const ctxStory = makeContext({ kind: "story" });
    const resStory = await runCheck("size", ctxStory);
    expect(resStory.ok).toBe(true);

    // For simple kind: limit is 5 -> 8 lines exceeds limit!
    const ctxSimple = makeContext({ kind: "simple" });
    const resSimple = await runCheck("size", ctxSimple);
    expect(resSimple.ok).toBe(false);
    expect(resSimple.summary).toContain("exceeded limit");
  });

  it("simple-guard checks simple scratch limits, rejects test content modifications and new deps", async () => {
    // 1. Clean small prod change
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "tiny.ts"), "export const x = 1;\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "tiny prod change");

    const ctxOk = makeContext({ kind: "simple" });
    const resOk = await runCheck("simple-guard", ctxOk);
    expect(resOk.ok).toBe(true);

    // 2. Reject modifying test logic in simple task
    fs.writeFileSync(path.join(tmpRepo.dir, "tests", "index.test.ts"), "// modified test logic\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "modify test");

    const ctxTestFail = makeContext({ kind: "simple" });
    const resTestFail = await runCheck("simple-guard", ctxTestFail);
    expect(resTestFail.ok).toBe(false);
    expect(resTestFail.summary).toContain("not rename-only");

    // 3. Reject adding new dependency or config file in simple task
    await git(tmpRepo.dir, ["reset", "--hard", baseSha]);
    fs.writeFileSync(path.join(tmpRepo.dir, "package.json"), "{}", "utf8");
    await commitAll(repo, tmpRepo.dir, "add package.json");

    const ctxDepFail = makeContext({ kind: "simple" });
    const resDepFail = await runCheck("simple-guard", ctxDepFail);
    expect(resDepFail.ok).toBe(false);
    expect(resDepFail.summary).toContain("added new dependency or config file");
  });

  it("poc-scope restricts changes to poc/", async () => {
    // 1. Changes inside items/poc-1/poc/
    fs.mkdirSync(path.join(tmpRepo.dir, "items", "poc-1", "poc"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRepo.dir, "items", "poc-1", "poc", "experiment.py"),
      "print('poc')\n",
      "utf8"
    );
    await commitAll(repo, tmpRepo.dir, "poc changes");

    const ctxOk = makeContext({ item: "poc-1" });
    const resOk = await runCheck("poc-scope", ctxOk);
    expect(resOk.ok).toBe(true);

    // 2. Changes outside poc/
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "outside.ts"), "data", "utf8");
    await commitAll(repo, tmpRepo.dir, "outside poc change");

    const ctxFail = makeContext({ item: "poc-1" });
    const resFail = await runCheck("poc-scope", ctxFail);
    expect(resFail.ok).toBe(false);
    expect(resFail.summary).toContain("changes outside poc/");
  });

  it("custom check evaluates command and replaces {{placeholders}}", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "custom-file.ts"), "custom code\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "add custom file");

    const ctx = makeContext({
      item: "item-custom",
      pipeline: {
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: {},
        checks: {
          "verify-prod-placeholder": {
            run: "test -n \"{{changedProd}}\"",
            expect: "pass",
          },
          "verify-item-placeholder": {
            run: "test \"{{item}}\" = \"item-custom\"",
            expect: "pass",
          },
        },
      },
    });

    const res1 = await runCheck("verify-prod-placeholder", ctx);
    expect(res1.ok).toBe(true);

    const res2 = await runCheck("verify-item-placeholder", ctx);
    expect(res2.ok).toBe(true);
  });
});
