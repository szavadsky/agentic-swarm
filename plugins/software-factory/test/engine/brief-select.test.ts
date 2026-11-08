import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readJournal } from "../../src/core/journal.js";
import { writeYamlAtomic } from "../../src/core/records/io.js";
import {
  buildArchitectBrief,
  buildArchitectBriefSkeleton,
  renderBriefSkeleton,
} from "../../src/core/brief.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

const builtinDir = path.resolve(import.meta.dir, "../../agents");

function unitPipeline(): PipelineConfig {
  return {
    models: { roles: { simpler: { model: "fake-simpler" } } },
    agents: {},
    flows: { simple: { steps: [] }, story: {}, spike: {} },
    limits: {},
  };
}

interface Fixture {
  dir: string;
  taskDir: string;
}

function writeFixture(): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-skel-"));
  const taskDir = path.join(dir, ".factory", "brief-task");
  fs.mkdirSync(path.join(taskDir, "items", "alpha"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "plan"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "decisions"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "steer", "tousertoreview"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "waves"), { recursive: true });
  fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Brief fixture\n", "utf8");
  fs.writeFileSync(
    path.join(taskDir, "items", "alpha", "assignment.yaml"),
    [
      "slug: alpha",
      "kind: dev",
      "title: Alpha feature",
      "assignment: Implement alpha",
      "milestone: m1",
      "wave: 1",
      "deps: []",
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "plan", "plan-1.yaml"),
    [
      "iteration: 1",
      "milestones:",
      "  - id: m1",
      "    title: M1 title",
      '    scenarios: ["s1"]',
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "plan", "edits-1.0.yaml"),
    ["iteration: 1", "items:", "  - slug: alpha", "    kind: dev", "    title: Alpha feature", ""].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "closeup-1.yaml"),
    ["iteration: 1", "status: complete", "summary: All milestones done", ""].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "decisions", "001-split-alpha.yaml"),
    ["id: d1", "context: item", "decision: split", "text: Split alpha into two parts", "timestamp: 2026-01-01T00:00:00.000Z", ""].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "steer", "tousertoreview", "q-alpha.yaml"),
    [
      "id: q-alpha",
      "ref: alpha",
      "disposition: human-async",
      "question: Which option, A or B?",
      "status: open",
      "",
    ].join("\n"),
    "utf8"
  );
  fs.mkdirSync(path.join(taskDir, "steer", "fromusertaken"), { recursive: true });
  fs.writeFileSync(path.join(taskDir, "steer", "fromusertaken", "dir-1.txt"), "Use tabs for indentation.\n", "utf8");
  fs.writeFileSync(
    path.join(taskDir, "steer", "fromusertaken", "dir-1.txt.classification.yaml"),
    ["kind: directive", "urgency: next-architect-call", 'refs: ["alpha"]', "summary: Tabs directive", ""].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "waves", "wave-1.1.yaml"),
    ["wave: 1", "iteration: 1", "status: complete", 'mergedItems: ["alpha"]', "summary: Wave done", ""].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "state.yaml"),
    [
      "task: brief-task",
      "status: active",
      "iteration: 1",
      "currentWave: 1",
      "items:",
      "  alpha:",
      "    kind: dev",
      "    status: ready",
      "debt:",
      "  - stale debt note",
      "lastUpdated: 2026-01-01T00:00:00.000Z",
      "",
    ].join("\n"),
    "utf8"
  );
  return { dir, taskDir };
}

describe("Architect brief: deterministic skeleton + relevance pass", () => {
  let fixtures: Fixture[] = [];

  afterEach(() => {
    for (const f of fixtures) {
      fs.rmSync(f.dir, { recursive: true, force: true });
    }
    fixtures = [];
  });

  function fixture(): Fixture {
    const f = writeFixture();
    fixtures.push(f);
    return f;
  }

  it("skeleton contains items/plans/decisions/questions with file paths", async () => {
    const { taskDir } = fixture();
    const skeleton = await buildArchitectBriefSkeleton({
      taskDir,
      task: "brief-task",
      taskWt: taskDir,
      parentBranch: "topic/brief-task",
      pipeline: unitPipeline(),
      iteration: 1,
    });

    expect(skeleton.task).toBe("brief-task");
    expect(skeleton.iteration).toBe(1);
    expect(skeleton.entries.length).toBeGreaterThan(0);

    const byId = new Map(skeleton.entries.map((e) => [e.id, e]));
    // Items table (slug, kind, wave, status, branch)
    expect(byId.get("item:alpha")?.path).toBe("items/alpha/assignment.yaml");
    expect(byId.get("item:alpha")?.headline).toContain("dev");
    expect(byId.get("item:alpha")?.headline).toContain("branch=topic/brief-task--alpha");
    // Plan files with milestone headlines
    expect(byId.get("plan:plan-1.yaml")?.path).toBe("plan/plan-1.yaml");
    expect(byId.get("plan:plan-1.yaml")?.headline).toContain("M1 title");
    // Close-ups with one-line summary
    expect(byId.get("closeup:closeup-1.yaml")?.headline).toContain("All milestones done");
    // Decisions with file + decision + text head
    expect(byId.get("decision:001-split-alpha.yaml")?.headline).toContain("split");
    expect(byId.get("decision:001-split-alpha.yaml")?.headline).toContain("Split alpha");
    // Open steer questions with id/disposition/ref/question head
    expect(byId.get("steer:q-alpha")?.headline).toContain("human-async");
    expect(byId.get("steer:q-alpha")?.headline).toContain("Which option");
    // Taken directives with id/kind/urgency/refs/summary head + file path
    expect(byId.get("taken:dir-1.txt")?.path).toBe("steer/fromusertaken/dir-1.txt");
    expect(byId.get("taken:dir-1.txt")?.section).toBe("taken");
    expect(byId.get("taken:dir-1.txt")?.headline).toContain("directive/next-architect-call");
    expect(byId.get("taken:dir-1.txt")?.headline).toContain("alpha");
    expect(byId.get("taken:dir-1.txt")?.headline).toContain("Tabs directive");
    expect(byId.get("taken:dir-1.txt")?.headline).toContain("Use tabs");
    // Debt + wave entries
    expect(skeleton.entries.some((e) => e.section === "debt")).toBe(true);
    expect(byId.get("wave:wave-1.1.yaml")?.path).toBe("waves/wave-1.1.yaml");

    // Stable ids: no duplicates
    expect(new Set(skeleton.entries.map((e) => e.id)).size).toBe(skeleton.entries.length);
  });

  it("concerns dir absent means no concerns section and no error", async () => {
    const { taskDir } = fixture();
    expect(fs.existsSync(path.join(taskDir, "concerns"))).toBe(false);
    const skeleton = await buildArchitectBriefSkeleton({
      taskDir,
      task: "brief-task",
      taskWt: taskDir,
      parentBranch: "topic/brief-task",
      pipeline: unitPipeline(),
      iteration: 1,
    });
    expect(skeleton.entries.some((e) => e.section === "concerns")).toBe(false);
    const rendered = renderBriefSkeleton(skeleton);
    expect(rendered).not.toContain("concerns");
  });

  it("concerns dir present adds kind/severity/summary entries", async () => {
    const { taskDir } = fixture();
    fs.mkdirSync(path.join(taskDir, "concerns"), { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "concerns", "c1.yaml"),
      ["kind: finding", "severity: major", "summary: Flaky gate on retry", ""].join("\n"),
      "utf8"
    );
    const skeleton = await buildArchitectBriefSkeleton({
      taskDir,
      task: "brief-task",
      taskWt: taskDir,
      parentBranch: "topic/brief-task",
      pipeline: unitPipeline(),
      iteration: 1,
    });
    const entry = skeleton.entries.find((e) => e.id === "concern:c1.yaml");
    expect(entry?.path).toBe("concerns/c1.yaml");
    expect(entry?.headline).toContain("major");
    expect(entry?.headline).toContain("Flaky gate");
  });

  it("empty skeleton skips the judge: header only, no complete call, no journal noise", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-empty-"));
    fixtures.push({ dir, taskDir: path.join(dir, ".factory", "empty-task") });
    const taskDir = path.join(dir, ".factory", "empty-task");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Fresh task\n", "utf8");
    const prompts = loadPromptLibrary({ builtinDir, overrideDirs: [] });
    const harness = new FakeHarness();
    let completeCalls = 0;
    harness.defaultCompleteHandler = async () => {
      completeCalls++;
      throw new Error("judge must not be called on an empty skeleton");
    };

    const brief = await buildArchitectBrief({
      taskDir,
      task: "empty-task",
      taskWt: taskDir,
      parentBranch: "topic/empty-task",
      pipeline: unitPipeline(),
      iteration: 1,
      goal: "architect-plan-1: draft the iteration execution plan",
      harness,
      prompts,
    });

    expect(completeCalls).toBe(0);
    expect(brief).toContain("# Architect brief");
    expect(brief.split("\n").filter((l) => l.startsWith("- [")).length).toBe(0);
    expect(await readJournal(taskDir)).toEqual([]);
  });

  it("root mailbox entries are marked [root] and root-relative, never ../-prefixed", async () => {
    const { dir, taskDir } = fixture();
    const rootTaskDir = path.join(dir, ".factory", "root-task");
    const childTaskDir = path.join(rootTaskDir, "child-epic");
    fs.mkdirSync(path.join(rootTaskDir, "steer", "tousertoreview"), { recursive: true });
    fs.mkdirSync(path.join(rootTaskDir, "steer", "fromusertaken"), { recursive: true });
    fs.writeFileSync(
      path.join(rootTaskDir, "steer", "tousertoreview", "rq.yaml"),
      ["id: rq", "ref: child-epic/i9", "disposition: human-async", "question: Root question?", "status: open", ""].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(rootTaskDir, "steer", "fromusertaken", "root-dir.txt"), "Root directive text.\n", "utf8");
    fs.writeFileSync(
      path.join(rootTaskDir, "steer", "fromusertaken", "root-dir.txt.classification.yaml"),
      ["kind: directive", "urgency: next-architect-call", 'refs: ["i9"]', "summary: Root summary", ""].join("\n"),
      "utf8"
    );
    // Child sees an empty task dir but the populated root mailbox.
    fs.mkdirSync(childTaskDir, { recursive: true });
    const skeleton = await buildArchitectBriefSkeleton({
      taskDir: childTaskDir,
      task: "child-epic",
      taskWt: childTaskDir,
      parentBranch: "topic/child-epic",
      pipeline: unitPipeline(),
      iteration: 1,
      rootTaskDir,
    });
    const byId = new Map(skeleton.entries.map((e) => [e.id, e]));
    expect(byId.get("steer:rq")?.path).toBe("[root] steer/tousertoreview/rq.yaml");
    expect(byId.get("taken:root-dir.txt")?.path).toBe("[root] steer/fromusertaken/root-dir.txt");
    for (const e of skeleton.entries) {
      expect(e.path).not.toContain("..");
    }
  });

  it("judge include filters and orders entries; header always kept", async () => {
    const { taskDir } = fixture();
    const prompts = loadPromptLibrary({ builtinDir, overrideDirs: [] });
    const harness = new FakeHarness();
    let seenSystem = "";
    let seenRole = "";
    let seenPrompt = "";
    harness.scriptComplete((params) => {
      seenSystem = params.system;
      seenRole = params.role;
      seenPrompt = params.prompt;
      return { include: ["steer:q-alpha", "item:alpha"] };
    });

    const brief = await buildArchitectBrief({
      taskDir,
      task: "brief-task",
      taskWt: taskDir,
      parentBranch: "topic/brief-task",
      pipeline: unitPipeline(),
      iteration: 1,
      goal: "architect-plan-1: draft the iteration execution plan",
      harness,
      prompts,
    });

    // @simpler role resolution + system fragment rendering (mirrors steer classify)
    expect(seenRole).toBe("simpler");
    expect(seenSystem).toContain("relevance filter");
    expect(seenPrompt).toContain("architect-plan-1");

    const lines = brief.split("\n");
    expect(lines[0]).toContain("# Architect brief");
    expect(lines[0]).toContain("brief-task");
    // Relevance order kept, everything else dropped
    expect(brief.indexOf("[steer:q-alpha]")).toBeLessThan(brief.indexOf("[item:alpha]"));
    expect(brief).not.toContain("[decision:001-split-alpha.yaml]");
    expect(brief).not.toContain("[plan:plan-1.yaml]");
    // Kept entries still carry file paths
    expect(brief).toContain("items/alpha/assignment.yaml");
  });

  it("judge failure falls back to the full skeleton with a journal event", async () => {
    const { taskDir } = fixture();
    const prompts = loadPromptLibrary({ builtinDir, overrideDirs: [] });
    const harness = new FakeHarness();
    harness.scriptComplete(() => {
      throw new Error("judge exploded");
    });

    const brief = await buildArchitectBrief({
      taskDir,
      task: "brief-task",
      taskWt: taskDir,
      parentBranch: "topic/brief-task",
      pipeline: unitPipeline(),
      iteration: 1,
      goal: "architect-plan-1: draft the iteration execution plan",
      harness,
      prompts,
    });

    // Fail open: full skeleton injected (headlines are small)
    expect(brief).toContain("[item:alpha]");
    expect(brief).toContain("[plan:plan-1.yaml]");
    expect(brief).toContain("[decision:001-split-alpha.yaml]");
    expect(brief).toContain("[steer:q-alpha]");
    const events = await readJournal(taskDir);
    const fallback = events.find((e) => e.type === "brief_select_fallback");
    expect(fallback).toBeDefined();
    expect(String(fallback?.reason)).toContain("judge_error");
  });

  it("empty include falls back to the full skeleton with a journal event", async () => {
    const { taskDir } = fixture();
    const prompts = loadPromptLibrary({ builtinDir, overrideDirs: [] });
    const harness = new FakeHarness();
    harness.scriptComplete(() => ({ include: [] }));

    const brief = await buildArchitectBrief({
      taskDir,
      task: "brief-task",
      taskWt: taskDir,
      parentBranch: "topic/brief-task",
      pipeline: unitPipeline(),
      iteration: 1,
      goal: "architect-wave-report-1-1: evaluate wave 1",
      harness,
      prompts,
    });

    expect(brief).toContain("[item:alpha]");
    expect(brief).toContain("[steer:q-alpha]");
    const events = await readJournal(taskDir);
    const fallback = events.find((e) => e.type === "brief_select_fallback");
    expect(fallback).toBeDefined();
    expect(String(fallback?.reason)).toContain("empty_include");
  });
});

describe("Architect brief at runTask level", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let project: ProjectConfig;
  let prompts: any;
  const orchFolder = ".factory";
  const task = "brief-run-task";

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    project = { orchestrationFolder: orchFolder, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("architect prompt input.md contains the relevance-filtered brief", async () => {
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Brief run task\n", "utf8");
    tmpRepo.commit("Add intent for brief-run-task");

    const harness = new FakeHarness();
    // Judge keeps only the plan entry; everything else is dropped from the brief.
    harness.defaultCompleteHandler = async ({ system }) => {
      if (system.includes("relevance filter")) return { include: ["plan:plan-1.yaml"] };
      throw new Error(`unexpected complete() call: ${system.slice(0, 80)}`);
    };

    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Requires steps", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
        itemOutlines: [{ slug: "item-1", kind: "dev", title: "Item 1 feature", milestoneId: "m1", deps: [] }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan looks great", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "item-1",
            outlineRef: "item-1",
            kind: "dev",
            title: "Item 1 feature",
            assignment: "Write item 1 feature",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/item-1/test-first#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "feature.test.ts"), "// tests\n");
      return { ok: true, data: { status: "ok", summary: "Tests created" } };
    });
    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "feature.ts"), "export const hello = () => 'world';\n");
      return { ok: true, data: { status: "ok", summary: "Feature implemented" } };
    });
    harness.scriptOutcome(`${task}/items/item-1/qa#a1`, {
      ok: true,
      data: { status: "approved", summary: "QA pass", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Review pass", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["item-1"], summary: "Wave 1 complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-wave-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "All milestones satisfied" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
    });

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          "alt-workhorse": { model: "deepseek-chat" },
          architect: { model: "deepseek-reasoner" },
          "alt-architect": { model: "deepseek-reasoner" },
          "task-reviewer": { model: "deepseek-chat" },
          "wave-close-up": { model: "deepseek-chat" },
          "plan-close-up": { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        triage: { role: "workhorse" },
        infra: { role: "workhorse" },
        architect: { role: "architect" },
        "plan-reviewer": { role: "alt-architect" },
        pm: { role: "alt-workhorse" },
        developer: { role: "workhorse" },
        qa: { role: "task-reviewer" },
        reviewer: { role: "task-reviewer" },
        "wave-close-up": { role: "wave-close-up" },
        "plan-close-up": { role: "plan-close-up" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "test-first", agent: "developer", role: "workhorse" },
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "qa", agent: "qa", role: "alt-workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        maxParallelItems: 2,
        maxParallelTurns: 4,
        maxStepAttempts: 3,
        maxFixRounds: 3,
        maxPlanReviewRounds: 3,
        maxIterations: 3,
      },
    };

    const result = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(result.status).toBe("done");

    // The plan turn runs on an empty skeleton (fresh iteration: no items, plans,
    // close-ups, decisions, or steer records yet), so it skips the judge and
    // injects the header directly. Only the wave-report turn pays for a judge.
    const completes = harness.calls.filter((c) => c.type === "complete");
    expect(completes.length).toBe(1);
    for (const c of completes) {
      expect((c as any).complete.role).toBe("simpler");
      expect((c as any).complete.system).toContain("relevance filter");
    }

    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, orchFolder, task);
    const runsDir = path.join(deployedTaskDir, "runs");
    const recordInput = (stepFragment: string): string => {
      const dir = fs
        .readdirSync(runsDir)
        .find((d) => d.includes(stepFragment));
      expect(dir).toBeDefined();
      return fs.readFileSync(path.join(runsDir, dir!, "input.md"), "utf8");
    };

    // Plan turn: empty skeleton, judge skipped, header-only brief, no fallback.
    const planInput = recordInput("architect-plan-1");
    expect(planInput).toContain("# Architect brief");

    // Wave-report turn: the judge's include keeps only the plan entry.
    const waveInput = recordInput("architect-wave-report-1-1");
    expect(waveInput).toContain("# Architect brief");
    expect(waveInput).toContain("[plan:plan-1.yaml]");
    expect(waveInput).toContain("plan/plan-1.yaml");
    expect(waveInput).not.toContain("[item:item-1]");

    // No fallback journaled: the plan turn skipped the judge, the wave-report
    // turn matched its include.
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).not.toContain("brief_select_fallback");

    // Rerun on the completed task: done with no new turns and no new judge calls —
    // the plan turn is skipped because the plan already exists.
    const callsBefore = harness.calls.length;
    const res2 = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res2.status).toBe("done");
    expect(res2.exitCode).toBe(0);
    expect(harness.calls.length).toBe(callsBefore);
  });
});
