import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { mergeItem, readMergeAttempts } from "../../src/core/flows/merge-path.js";
import { runCheck } from "../../src/core/checks/runner.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import type { DerivedItemState } from "../../src/core/derive/item.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import { readJournal } from "../../src/core/journal.js";
import { writeYamlAtomic } from "../../src/core/records/io.js";

// Defect 1: merge-path gate 127 — a `{gate: <id>}` target naming an infra
// gate id that does not exist must NOT be executed as a shell command
// (bash exit 127, unactionable). It must fail loudly naming the unknown id
// plus the known gate ids, and every gate/check failure must carry the
// executed command + stderr tail in error, journal, and checks.yaml details.

function makeCtx(tmpRepo: TmpRepo, infra: any, target: any): { ctx: CheckContext; taskDir: string } {
  const taskDir = path.join(tmpRepo.dir, ".factory", "t1");
  fs.mkdirSync(taskDir, { recursive: true });
  const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
  const pipeline = { limits: {} } as PipelineConfig;
  const project = { orchestrationFolder: ".factory" } as ProjectConfig;
  const ctx: CheckContext = {
    repo: repo as any,
    wt: tmpRepo.dir,
    base: "main",
    project,
    pipeline,
    infra,
    kind: "dev",
    task: "t1",
    taskWt: tmpRepo.dir,
    taskDir,
    target,
    limits: {},
    outputBytes: 4096,
  };
  return { ctx, taskDir };
}

describe("Defect 1: gate-target 127 + gate/check evidence", () => {
  let tmpRepo: TmpRepo;
  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });
  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("target-green with a dangling gate id fails loudly (no exit-127 shell exec)", async () => {
    const { ctx } = makeCtx(
      tmpRepo,
      { setup: [], gates: [{ id: "lint", command: "true" }], testRunner: { command: "true" } },
      { gate: "tests" }
    );
    const res = await runCheck("target-green", ctx);
    expect(res.ok).toBe(false);
    // Names the dangling id and the known ids — never "exit code 127".
    expect(res.summary).toContain('Unknown gate target: "tests"');
    expect(res.summary).toContain("lint");
    expect(res.summary).toContain("Command: tests");
    expect((res.details as { command: string }).command).toBe("tests");
  });

  it("target-red with a dangling gate id fails loudly (no exit-127 shell exec)", async () => {
    const { ctx } = makeCtx(
      tmpRepo,
      { setup: [], gates: [{ id: "lint", command: "true" }], testRunner: { command: "true" } },
      { gate: "tests" }
    );
    const res = await runCheck("target-red", ctx);
    expect(res.ok).toBe(false);
    expect(res.summary).toContain('Unknown gate target: "tests"');
    expect(res.summary).toContain("Command: tests");
  });

  it("red-test with a dangling gate id fails loudly (no exit-127 shell exec)", async () => {
    const { ctx } = makeCtx(
      tmpRepo,
      { setup: [], gates: [{ id: "lint", command: "true" }], testRunner: { command: "true" } },
      { gate: "tests" }
    );
    const res = await runCheck("red-test", ctx);
    expect(res.ok).toBe(false);
    expect(res.summary).toContain('Unknown gate target: "tests"');
  });

  it("mergeItem target-green failure carries command + output evidence in error and journal", async () => {
    const task = "merge-evidence";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    // Infra with a REAL testRunner; the item target names a missing gate.
    await writeYamlAtomic(path.join(taskDir, "infra.yaml"), {
      setup: [],
      gates: [{ id: "lint", command: "true" }],
      testRunner: { command: "true" },
    });
    tmpRepo.writeFile("base.txt", "Base\n");
    tmpRepo.commit("Add base.txt on main");
    const itemSlug = "item-ev";
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const { git: execGit } = await import("../../src/core/git/exec.js");
    fs.writeFileSync(path.join(childWt, "child.txt"), "Child content\n", "utf8");
    await execGit(childWt, ["add", "child.txt"]);
    await execGit(childWt, ["commit", "-m", "Child commit"]);
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("parent.txt", "Parent new content\n");
    tmpRepo.commit("Parent new file modifying tree");

    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
    const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: repoObj.worktreeRoot };
    const pipeline: PipelineConfig = {
      models: { roles: { workhorse: { model: "m" } } },
      agents: { developer: { role: "workhorse" } },
      flows: { simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
      limits: {},
    };
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const item: DerivedItemState = {
      slug: itemSlug, kind: "dev", title: "T", wave: 1, deps: [], status: "ready",
      branch: childBranch,
      records: [{
        dirName: "001-develop-r1-a1", seq: 1, name: "develop", attempt: 1, fixRound: 1,
        meta: { seq: 1, name: "develop", attempt: 1, fixRound: 1, agent: "developer", role: "workhorse", models: ["m"], status: "ok", startedAt: new Date().toISOString() },
        output: { status: "ok", summary: "Done", target: { gate: "tests" } },
      }],
      currentAttempt: 1, currentFixRound: 1, isEscalated: false, freshSeries: false,
      interruptionCount: 0, suggestionFingerprints: [], decisionFingerprints: [],
      failingCheckFingerprints: [], consultCount: 0,
    };
    const result = await mergeItem({
      task, item, parentBranch, taskWt: tmpRepo.dir, childWt,
      repo: repoObj, harness: new FakeHarness(), pipeline, project, prompts, taskDir,
    });
    expect(result.ok).toBe(false);
    // Error carries the dangling command + known gates (actionable, not bare 127).
    expect(result.error!).toContain('Unknown gate target: "tests"');
    expect(result.error!).toContain("Command: tests");
    // Journal carries structured evidence.
    const journal = await readJournal(taskDir);
    const failEv = journal.find((e) => e.type === "item_merge_failed" && (e as any).item === itemSlug);
    expect(failEv).toBeDefined();
    expect((failEv as any).command).toBe("tests");
    // Attempt ledger persisted (Defect 2 bound survives restarts).
    expect(await readMergeAttempts(taskDir, itemSlug, "1")).toBe(1);
    expect(result.mergeAttempt).toBe(1);
  });

  it("gates failure in merge path journals failing-gate evidence with command + details", async () => {
    const task = "merge-gates-ev";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "infra.yaml"), {
      setup: [],
      gates: [{ id: "badgate", command: "false" }],
    });
    tmpRepo.writeFile("base.txt", "Base\n");
    tmpRepo.commit("Add base.txt on main");
    const itemSlug = "item-gev";
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const { git: execGit } = await import("../../src/core/git/exec.js");
    fs.writeFileSync(path.join(childWt, "child.txt"), "Child content\n", "utf8");
    await execGit(childWt, ["add", "child.txt"]);
    await execGit(childWt, ["commit", "-m", "Child commit"]);
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("parent.txt", "Parent new content\n");
    tmpRepo.commit("Parent new file modifying tree");

    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
    const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: repoObj.worktreeRoot };
    const pipeline: PipelineConfig = {
      models: { roles: { workhorse: { model: "m" } } },
      agents: { developer: { role: "workhorse" } },
      flows: { simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
      limits: {},
    };
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const item: DerivedItemState = {
      slug: itemSlug, kind: "dev", title: "T", wave: 1, deps: [], status: "ready",
      branch: childBranch, records: [],
      currentAttempt: 1, currentFixRound: 1, isEscalated: false, freshSeries: false,
      interruptionCount: 0, suggestionFingerprints: [], decisionFingerprints: [],
      failingCheckFingerprints: [], consultCount: 0,
    };
    const result = await mergeItem({
      task, item, parentBranch, taskWt: tmpRepo.dir, childWt,
      repo: repoObj, harness: new FakeHarness(), pipeline, project, prompts, taskDir,
    });
    expect(result.ok).toBe(false);
    expect(result.error!).toContain("badgate");
    expect(result.error!).toContain("Command: false");
    const journal = await readJournal(taskDir);
    const gatesEv = journal.find((e) => e.type === "item_merge_gates_failed");
    expect(gatesEv).toBeDefined();
    expect(JSON.stringify((gatesEv as any).evidence)).toContain("false");
  });
});
