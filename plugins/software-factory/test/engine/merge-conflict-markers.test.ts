import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { mergeItem } from "../../src/core/flows/merge-path.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { git } from "../../src/core/git/exec.js";
import { scanConflictMarkers } from "../../src/core/git/merge.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import type { DerivedItemState } from "../../src/core/derive/item.js";
import { readJournal } from "../../src/core/journal.js";

// (b) Post-integrate conflict-marker scan. An integrate turn can yield `ok`
// while leaving `<<<<<<<` / `>>>>>>>` in the tree. concludeMerge only scans
// merge-touched paths, so markers in a file outside that set were staged by
// `git add -A` and committed (modernize journal :2232/:2187: markers left in
// tests/runner/test_self_lint_clean.py + test_pyright_noise_filter.py). The
// merge step must fail on markers, not pass.

const MARKERS = "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> parent\n";

function basePipeline(): PipelineConfig {
  return {
    models: {
      roles: { workhorse: { model: "m" }, simpler: { model: "m" } },
    },
    agents: { developer: { role: "workhorse" } },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {},
      spike: {},
    },
    limits: {},
  };
}

function makeItem(slug: string, branch: string): DerivedItemState {
  return {
    slug,
    kind: "dev",
    title: "T",
    wave: 1,
    deps: [],
    status: "ready",
    branch,
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
}

describe("merge path: conflict markers after integrate fail the merge", () => {
  let tmpRepo: TmpRepo;
  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });
  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("scanConflictMarkers flags marker pairs in changed/untracked files, not lookalikes", async () => {
    tmpRepo.writeFile("clean.txt", "nothing to see\n");
    tmpRepo.commit("clean");
    fs.writeFileSync(path.join(tmpRepo.dir, "leftover.md"), MARKERS, "utf8");
    expect(await scanConflictMarkers(tmpRepo.dir)).toEqual(["leftover.md"]);

    // Only one half of the pair: not a conflict.
    tmpRepo.writeFile("half.md", "<<<<<<< HEAD\nours\n");
    fs.rmSync(path.join(tmpRepo.dir, "leftover.md"));
    expect(await scanConflictMarkers(tmpRepo.dir)).toEqual([]);

    // Indented marker text (docs/tests mentioning markers) is not flagged.
    tmpRepo.writeFile("doc.md", "    <<<<<<< HEAD\n    =======\n    >>>>>>> other\n");
    tmpRepo.commit("doc");
    fs.rmSync(path.join(tmpRepo.dir, "half.md"));
    expect(await scanConflictMarkers(tmpRepo.dir)).toEqual([]);
  });

  it("integrate yielding ok with markers in a new file fails the merge instead of concluding", async () => {
    const task = "marker-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-markers";

    tmpRepo.writeFile("shared.txt", "Base initial content\n");
    tmpRepo.commit("Add shared.txt on main");

    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    fs.writeFileSync(path.join(childWt, "shared.txt"), "Child line 1\nChild line 2\n", "utf8");
    await git(childWt, ["add", "shared.txt"]);
    await git(childWt, ["commit", "-m", "Child commit on shared.txt"]);

    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("shared.txt", "Parent line 1\nParent line 2\n");
    tmpRepo.commit("Parent commit modifying shared.txt");

    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    });
    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/items/${itemSlug}/integrate#a1`, async (run) => {
      // Resolve the conflicted file correctly...
      fs.writeFileSync(
        path.join(run.cwd, "shared.txt"),
        "Resolved: Parent line 1 + Child line 2\n",
        "utf8"
      );
      // ...but leave markers in a file outside the merge-touched set.
      fs.writeFileSync(path.join(run.cwd, "leftover.py"), MARKERS, "utf8");
      return { ok: true, data: { status: "ok", summary: "Resolved (with leftovers)" } };
    });

    const result = await mergeItem({
      task,
      item: makeItem(itemSlug, childBranch),
      parentBranch,
      taskWt: tmpRepo.dir,
      childWt,
      repo: repoObj,
      harness,
      pipeline: basePipeline(),
      project,
      prompts,
      taskDir,
    });

    expect(result.ok).toBe(false);
    expect(result.error!).toContain("leftover.py");
    expect(result.error!).toContain("conflict markers");
    const journal = await readJournal(taskDir);
    const markerEvents = journal.filter((e) => e.type === "integrate_conflict_markers_left");
    expect(markerEvents.length).toBe(1);
    expect(markerEvents[0]!.files).toEqual(["leftover.py"]);
    // Merge aborted: no MERGE_HEAD left behind, and nothing merged to parent.
    const mh = await git(childWt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { allowFail: true });
    expect(mh.code).not.toBe(0);
    const parentLog = tmpRepo.git(["log", "--oneline", parentBranch]);
    expect(parentLog.stdout).not.toContain("factory: merge item");
  });

  it("committed markers on the item branch block the child->parent merge", async () => {
    const task = "committed-marker-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    const itemSlug = "item-committed-markers";

    tmpRepo.writeFile("base.txt", "base\n");
    tmpRepo.commit("base");
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    fs.writeFileSync(path.join(childWt, "bad.txt"), MARKERS, "utf8");
    await git(childWt, ["add", "bad.txt"]);
    await git(childWt, ["commit", "-m", "commit markers"]);

    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("parent.txt", "parent\n");
    tmpRepo.commit("parent side change");

    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    });
    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const result = await mergeItem({
      task,
      item: makeItem(itemSlug, childBranch),
      parentBranch,
      taskWt: tmpRepo.dir,
      childWt,
      repo: repoObj,
      harness: new FakeHarness(),
      pipeline: basePipeline(),
      project,
      prompts,
      taskDir,
    });

    expect(result.ok).toBe(false);
    expect(result.error!).toContain("conflict markers remain in bad.txt");
    const journal = await readJournal(taskDir);
    const ev = journal.find((e) => e.type === "conflict_markers_present");
    expect(ev?.files).toEqual(["bad.txt"]);
    const parentLog = tmpRepo.git(["log", "--oneline", parentBranch]);
    expect(parentLog.stdout).not.toContain("factory: merge item");
  });
});
