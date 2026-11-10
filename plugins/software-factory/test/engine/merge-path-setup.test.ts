import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { mergeItem } from "../../src/core/flows/merge-path.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, InfraArtifact } from "../../src/core/artifacts.js";
import type { DerivedItemState } from "../../src/core/derive/item.js";
import { readJournal } from "../../src/core/journal.js";
import { writeYamlAtomic } from "../../src/core/records/io.js";
import { git } from "../../src/core/git/exec.js";

// (e) Fresh item worktrees have no dependencies. Merge-path gates ran
// `typecheck` in a worktree without node_modules -> TS2688 "Cannot find type
// definition file for 'bun'" -> all four wave-1 spikes died at merge with an
// environment error unrelated to their diffs. infra.setup must run in the
// worktree before gates/target-green.

const setupCommand = "mkdir -p deps && echo ready > deps/ready.txt";
const gateNeedsSetup = "test -f deps/ready.txt";

async function scaffold(tmpRepo: TmpRepo) {
  const task = "merge-setup";
  const orchFolder = ".factory";
  const taskDir = path.join(tmpRepo.dir, orchFolder, task);
  fs.mkdirSync(taskDir, { recursive: true });

  tmpRepo.writeFile("base.txt", "Base\n");
  tmpRepo.commit("Add base.txt on main");

  const itemSlug = "item-setup";
  const childBranch = `topic/${task}--${itemSlug}`;
  const childWt = tmpRepo.createWorktree(childBranch);
  fs.writeFileSync(path.join(childWt, "child.txt"), "Child content\n", "utf8");
  await git(childWt, ["add", "child.txt"]);
  await git(childWt, ["commit", "-m", "Child commit"]);

  const parentBranch = `topic/${task}`;
  tmpRepo.createBranch(parentBranch, "main");
  tmpRepo.git(["checkout", parentBranch]);
  tmpRepo.writeFile("parent.txt", "Parent content\n");
  tmpRepo.commit("Parent commit");

  const repoObj = new Repo({
    mainRoot: tmpRepo.dir,
    worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
  });
  const project: ProjectConfig = {
    orchestrationFolder: orchFolder,
    worktreeRoot: repoObj.worktreeRoot,
  };
  const pipeline: PipelineConfig = {
    models: { roles: { workhorse: { model: "m" } } },
    agents: { developer: { role: "workhorse" } },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {},
      spike: {},
    },
    limits: {},
  };
  const prompts = loadPromptLibrary({
    builtinDir: path.resolve(import.meta.dir, "../../agents"),
    overrideDirs: [],
  });
  const item: DerivedItemState = {
    slug: itemSlug,
    kind: "dev",
    title: "T",
    wave: 1,
    deps: [],
    status: "ready",
    branch: childBranch,
    records: [],
    currentAttempt: 1,
    currentFixRound: 1,
    isEscalated: false,
    freshSeries: false,
    interruptionCount: 0,
    suggestionFingerprints: [],
    decisionFingerprints: [],
    failingCheckFingerprints: [],
    consultCount: 0,
  };

  return {
    task,
    taskDir,
    parentBranch,
    childWt,
    repoObj,
    project,
    pipeline,
    prompts,
    item,
    merge: () =>
      mergeItem({
        task,
        item,
        parentBranch,
        taskWt: tmpRepo.dir,
        childWt,
        repo: repoObj,
        harness: new FakeHarness(),
        pipeline,
        project,
        prompts,
        taskDir,
      }),
    writeInfra: (artifact: InfraArtifact) =>
      writeYamlAtomic(path.join(taskDir, "infra.yaml"), artifact),
  };
}

describe("merge path: infra.setup runs in the fresh worktree before gates", () => {
  let tmpRepo: TmpRepo;
  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });
  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("runs declared setup before gates, so a dependency-dependent gate passes", async () => {
    const s = await scaffold(tmpRepo);
    await s.writeInfra({
      setup: [setupCommand],
      gates: [{ id: "typecheck", command: gateNeedsSetup }],
      testRunner: { command: "true" },
    });

    const result = await s.merge();
    expect(result.ok).toBe(true);
    const journal = await readJournal(s.taskDir);
    const setupEvents = journal.filter((e) => e.type === "item_merge_setup");
    expect(setupEvents.length).toBe(1);
    expect(setupEvents[0]!.commands).toEqual([setupCommand]);
    expect(setupEvents[0]!.ran).toEqual([setupCommand]);
    // Gate ran after setup and passed: no gate failure event.
    expect(journal.some((e) => e.type === "item_merge_gates_failed")).toBe(false);
    // Setup ran BEFORE gates: both event types present, setup first.
    const idxSetup = journal.findIndex((e) => e.type === "item_merge_setup");
    const idxGates = journal.findIndex((e) => e.type === "item_merge_phase" && e.phase === "verify-checks");
    expect(idxGates).toBeGreaterThanOrEqual(0);
    expect(idxSetup).toBeGreaterThan(idxGates);
  });

  it("a failing setup command fails the merge with evidence and never runs gates", async () => {
    const infra: InfraArtifact = {
      setup: ["exit 7"],
      gates: [{ id: "typecheck", command: gateNeedsSetup }],
      testRunner: { command: "true" },
    };
    const s = await scaffold(tmpRepo);
    await s.writeInfra(infra);

    const result = await s.merge();
    expect(result.ok).toBe(false);
    expect(result.error!).toContain("infra.setup failed on merge path");
    expect(result.error!).toContain("exit 7");
    const journal = await readJournal(s.taskDir);
    const failed = journal.filter((e) => e.type === "item_merge_setup_failed");
    expect(failed.length).toBe(1);
    expect(failed[0]!.failedCommand).toBe("exit 7");
    expect(journal.some((e) => e.type === "item_merge_gates_failed")).toBe(false);
    // Nothing merged into the parent branch.
    const log = tmpRepo.git(["log", "--oneline", s.parentBranch]);
    expect(log.stdout).not.toContain("factory: merge item");
  });

  it("without setup the dependency-dependent gate fails (the TS2688 class)", async () => {
    const infra: InfraArtifact = {
      setup: [],
      gates: [{ id: "typecheck", command: gateNeedsSetup }],
      testRunner: { command: "true" },
    };
    const s = await scaffold(tmpRepo);
    await s.writeInfra(infra);

    const result = await s.merge();
    expect(result.ok).toBe(false);
    expect(result.error!).toContain("Quality gates failed");
    expect(result.error!).toContain("typecheck");
  });
});
