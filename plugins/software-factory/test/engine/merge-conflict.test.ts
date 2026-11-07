import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { mergeItem } from "../../src/core/flows/merge-path.js";
import { AsyncMutex, KeyedMutex } from "../../src/core/mutex.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import type { DerivedItemState } from "../../src/core/derive/item.js";

describe("Engine: Merge path conflict -> integrate (§7)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("handles merge conflict when merging parent into child and resolves via developer integrate step", async () => {
    const task = "merge-conflict-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-conflict";

    // 1. Base commit on main
    tmpRepo.writeFile("shared.txt", "Base initial content\n");
    tmpRepo.commit("Add shared.txt on main");

    // 2. Create child worktree from main BEFORE parent commits
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const { git: execGit } = await import("../../src/core/git/exec.js");
    fs.writeFileSync(path.join(childWt, "shared.txt"), "Child line 1\nChild line 2\n", "utf8");
    await execGit(childWt, ["add", "shared.txt"]);
    await execGit(childWt, ["commit", "-m", "Child commit on shared.txt"]);

    // 3. Now branch parentBranch from main and make conflicting commit
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("shared.txt", "Parent line 1\nParent line 2\n");
    tmpRepo.commit("Parent commit modifying shared.txt");

    const repoObj = {
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
      writeLock: new AsyncMutex(),
      mergeLocks: new KeyedMutex(),
    };

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      limits: {},
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    const harness = new FakeHarness();

    // Script developer integrate step to resolve conflict in childWt
    let integrateRan = false;
    harness.scriptOutcome(`${task}/items/${itemSlug}/integrate#a1`, async (run) => {
      integrateRan = true;
      // Developer resolves conflict in working tree
      fs.writeFileSync(
        path.join(run.cwd, "shared.txt"),
        "Resolved: Parent line 1 + Child line 2\n",
        "utf8"
      );
      return {
        ok: true,
        data: { status: "ok", summary: "Conflict resolved" },
      };
    });

    const item: DerivedItemState = {
      slug: itemSlug,
      kind: "dev",
      title: "Conflict item",
      wave: 1,
      deps: [],
      status: "ready",
      branch: childBranch,
      records: [],
      currentAttempt: 1,
      currentFixRound: 1,
      isEscalated: false,
      interruptionCount: 0,
      suggestionFingerprints: [],
      decisionFingerprints: [],
    };

    const taskWt = tmpRepo.dir;
    tmpRepo.git(["checkout", parentBranch]);

    const result = await mergeItem({
      task,
      item,
      parentBranch,
      taskWt,
      childWt,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      taskDir,
    });

    expect(result.ok).toBe(true);
    expect(result.conflictResolved).toBe(true);
    expect(integrateRan).toBe(true);

    // Verify parent branch has the resolved content
    const mergedContent = fs.readFileSync(path.join(taskWt, "shared.txt"), "utf8");
    expect(mergedContent).toContain("Resolved: Parent line 1 + Child line 2");
  });
});
