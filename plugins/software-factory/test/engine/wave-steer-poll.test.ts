import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, SteerItemArtifact } from "../../src/core/artifacts.js";
import { readYaml } from "../../src/core/records/io.js";

// Behavior: §8.8 requires the active run to poll the root mailbox during wave
// execution: a message dropped mid-wave must be classified and committed before
// the wave ends. `stop` stops after running steps; answers unblock immediately.

const TS = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makePipeline(extraLimits: Record<string, unknown> = {}): PipelineConfig {
  return {
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
            { id: "develop", agent: "developer", role: "workhorse" },
            { id: "review", agent: "reviewer", role: "task-reviewer" },
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
      ...extraLimits,
    },
  };
}

function scriptIngestAndPlan(
  harness: FakeHarness,
  task: string,
  items: { slug: string; kind: string; title: string }[]
) {
  harness.scriptOutcome(`${task}/runs/triage#a1`, {
    ok: true,
    data: { kind: "story", rationale: "wave steer poll test", citations: [] },
  });
  harness.scriptOutcome(`${task}/runs/infra#a1`, {
    ok: true,
    data: {
      setup: [],
      gates: [{ id: "t", command: "true" }],
      testRunner: { command: "true" },
    },
  });
  harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
    ok: true,
    data: {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: items.map((i) => ({
        slug: i.slug, kind: i.kind, title: i.title, milestoneId: "m1",
      })),
    },
  });
  harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
    ok: true,
    data: { status: "approved", summary: "Plan ok", suggestions: [] },
  });
  harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
    ok: true,
    data: {
      iteration: 1,
      items: items.map((i) => ({
        slug: i.slug,
        outlineRef: i.slug,
        kind: i.kind,
        title: i.title,
        assignment: `Work on ${i.slug}`,
        milestone: "m1",
        wave: 1,
        deps: [],
      })),
    },
  });
}

function scriptCloseups(harness: FakeHarness, task: string) {
  harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
    ok: true,
    data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
  });
  harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
    ok: true,
    data: { id: "dec-1", context: "wave", decision: "continue", timestamp: TS() },
  });
  harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "Plan satisfied" },
  });
  harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "Done" },
  });
}

describe("Engine: mid-wave steering mailbox polling (§8.8)", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let project: ProjectConfig;
  let prompts: any;
  const orchFolder = ".factory";

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

  function setup(t: string) {
    const str = path.join(tmpRepo.dir, orchFolder, t);
    fs.mkdirSync(str, { recursive: true });
    fs.writeFileSync(path.join(str, "INTENT.md"), "Wave steer poll test\n", "utf8");
    tmpRepo.commit("Add intent");
    return path.join(worktreeRoot, `topic_${t}`);
  }

  // Test 1: timer polls during a long step; directive classified+committed mid-wave.
  it("a directive dropped mid-wave is classified and committed before the wave ends", async () => {
    const task = "wave-poll-test";
    const taskWtPath = setup(task);
    const harness = new FakeHarness();
    const pipeline = makePipeline({ steerPollSec: 1 });

    scriptIngestAndPlan(harness, task, [
      { slug: "item-x", kind: "dev", title: "Long item" },
    ]);
    scriptCloseups(harness, task);

    let msgDropped = false;
    harness.scriptOutcome(`${task}/items/item-x/develop#a1`, async () => {
      const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
      const pendingDir = path.join(deployedTaskDir, "steer", "fromuserpending");
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, "mid-wave.txt"), "Use tabs for indentation.");
      msgDropped = true;
      // Stay busy so the periodic poller (1s) fires mid-step, repeatedly.
      await sleep(2500);
      return { ok: true, data: { status: "ok", summary: "Developed" } };
    });
    harness.scriptOutcome(`${task}/items/item-x/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "LGTM", suggestions: [] },
    });
    // NB: the architect brief judge shares harness.complete with steer-classify.
    // Dispatch on the system prompt so each consumer gets a schema-valid reply.
    harness.defaultCompleteHandler = async ({ system }) => {
      if (system.includes("relevance filter")) return { include: ["item:item-x"] };
      return {
        refs: ["item-x"],
        kind: "directive",
        urgency: "next-architect-call",
        summary: "Use tabs",
      };
    };

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 10 }
    );

    expect(msgDropped).toBe(true);
    expect(res.status).toBe("done");

    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    // Moved out of pending, classified, committed
    expect(fs.existsSync(path.join(deployedTaskDir, "steer", "fromuserpending", "mid-wave.txt"))).toBe(false);
    const taken = path.join(deployedTaskDir, "steer", "fromusertaken", "mid-wave.txt");
    expect(fs.existsSync(taken)).toBe(true);
    const clsPath = `${taken}.classification.yaml`;
    expect(fs.existsSync(clsPath)).toBe(true);
    const cls = yaml.parse(fs.readFileSync(clsPath, "utf8"));
    expect(cls.kind).toBe("directive");

    // Committed on the task branch, journaled
    const logRes = tmpRepo.git(
      ["log", "--oneline", `topic/${task}`],
      { cwd: tmpRepo.dir, allowFail: true }
    );
    expect(logRes.stdout).toContain("process steering message mid-wave.txt");
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("steer_processed");
  }, 60000);

  // Test 2: stop directive stops after running steps finish.
  it("a stop directive stops after running steps finish; no new steps start", async () => {
    const task = "wave-stop-test";
    const taskWtPath = setup(task);
    const harness = new FakeHarness();
    const pipeline = makePipeline({ steerPollSec: 1 });

    scriptIngestAndPlan(harness, task, [
      { slug: "item-s", kind: "dev", title: "Stop item" },
    ]);

    harness.scriptOutcome(`${task}/items/item-s/develop#a1`, async () => {
      const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
      const pendingDir = path.join(deployedTaskDir, "steer", "fromuserpending");
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, "stop-now.txt"), "Stop everything now.");
      await sleep(2500); // timer processes stop mid-step
      return { ok: true, data: { status: "ok", summary: "Developed" } };
    });
    let reviewRan = false;
    harness.scriptOutcome(`${task}/items/item-s/review#a1`, () => {
      reviewRan = true;
      return { ok: true, data: { status: "approved", summary: "x", suggestions: [] } };
    });
    harness.defaultCompleteHandler = async ({ system }) => {
      if (system.includes("relevance filter")) return { include: ["item:item-s"] };
      return {
        refs: [],
        kind: "stop",
        urgency: "now",
        summary: "Operator stop",
      };
    };

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 10 }
    );

    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);
    expect(reviewRan).toBe(false); // no new steps after stop
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    expect(fs.existsSync(path.join(deployedTaskDir, "steer", "fromusertaken", "stop-now.txt"))).toBe(true);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("task_stopped_by_user");
  }, 60000);

  // Test 3: answer dropped mid-wave unblocks an item within the same run.
  it("an answer dropped mid-wave unblocks its item before the wave ends", async () => {
    const task = "wave-answer-test";
    const taskWtPath = setup(task);
    const harness = new FakeHarness();
    const pipeline = makePipeline({ maxParallelItems: 1, steerPollSec: 1 });

    scriptIngestAndPlan(harness, task, [
      { slug: "item-q", kind: "dev", title: "Question item" },
      { slug: "item-l", kind: "dev", title: "Long item" },
    ]);
    scriptCloseups(harness, task);

    // Item-q: develop ok, review raises human-async, develop#2 after answer
    harness.scriptOutcome(`${task}/items/item-q/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "some code");
      return { ok: true, data: { status: "ok", summary: "Developed" } };
    });
    harness.scriptOutcome(`${task}/items/item-q/review#a1`, [
      {
        ok: true,
        data: {
          status: "changes_requested",
          summary: "Need human input",
          suggestions: [
            { id: "s1", disposition: "human-async", summary: "A or B?", detail: "Choice of algorithm" },
          ],
        },
      },
      { ok: true, data: { status: "approved", summary: "Approved", suggestions: [] } },
    ]);
    harness.scriptOutcome(`${task}/items/item-q/develop#a2`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "option A code");
      return { ok: true, data: { status: "ok", summary: "Option A implemented" } };
    });

    // Item-l: develop drops the operator answer mid-wave and stays busy
    harness.scriptOutcome(`${task}/items/item-l/develop#a1`, async () => {
      const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
      const pendingDir = path.join(deployedTaskDir, "steer", "fromuserpending");
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, "answer-01.txt"), "Use Option A please.");
      await sleep(2500);
      return { ok: true, data: { status: "ok", summary: "Developed" } };
    });
    harness.scriptOutcome(`${task}/items/item-l/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "LGTM", suggestions: [] },
    });
    harness.defaultCompleteHandler = async ({ system }) => {
      if (system.includes("relevance filter")) return { include: ["item:item-q"] };
      return {
        refs: ["item-q"],
        kind: "answer",
        urgency: "now",
        summary: "Use Option A",
      };
    };

    // Single run: the mid-wave answer must unblock item-q before the wave ends
    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 10 }
    );

    expect(res.status).toBe("done");
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const qPath = path.join(deployedTaskDir, "steer", "tousertoreview", "q-item-q-s1.yaml");
    const q = await readYaml<SteerItemArtifact>(qPath);
    expect(q.status).toBe("answered");
    expect(fs.existsSync(path.join(deployedTaskDir, "steer", "fromusertaken", "answer-01.txt"))).toBe(true);
  }, 90000);

  // Test 4: epic child wave polls the ROOT mailbox (not its own taskDir).
  it("an epic child task polls the root mailbox during its wave", async () => {
    const task = "wave-epic-test";
    const taskWtPath = setup(task);
    const harness = new FakeHarness();
    const pipeline = makePipeline({ steerPollSec: 1 });
    const epicSlug = "big-epic";

    // Parent ingest: epic kind, plan with one epic
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "epic", rationale: "epic", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: epicSlug, kind: "epic", title: "Big epic", milestoneId: "m1" }],
        epics: [{ slug: epicSlug, intent: "Epic intent: build the big feature.\n" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          { slug: epicSlug, outlineRef: epicSlug, kind: "epic", title: "Big epic", assignment: "Run epic", milestone: "m1", wave: 1 },
        ],
      },
    });

    // Child task turns
    const childTask = `${task}--${epicSlug}`;
    harness.scriptOutcome(`${childTask}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "Child M1" }],
        itemOutlines: [{ slug: "child-item", kind: "dev", title: "Child item", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${childTask}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "child plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${childTask}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          { slug: "child-item", outlineRef: "child-item", kind: "dev", title: "Child item", assignment: "Child work", milestone: "m1", wave: 1 },
        ],
      },
    });
    harness.scriptOutcome(`${childTask}/items/child-item/develop#a1`, async (run) => {
      fs.writeFileSync(path.join(run.cwd, "epic-feature.ts"), "export const epic = true;\n");
      // Operator drops a message into the ROOT mailbox while the child wave runs
      const rootTaskDir = path.join(taskWtPath, orchFolder, task);
      const pendingDir = path.join(rootTaskDir, "steer", "fromuserpending");
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, "root-msg.txt"), "Root directive for child.");
      await sleep(2500);
      return { ok: true, data: { status: "ok", summary: "Epic feature done" } };
    });
    harness.scriptOutcome(`${childTask}/items/child-item/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "child review ok", suggestions: [] },
    });
    harness.scriptOutcome(`${childTask}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["child-item"], summary: "Child wave ok" },
    });
    harness.scriptOutcome(`${childTask}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-c1", context: "wave", decision: "continue", timestamp: TS() },
    });
    harness.scriptOutcome(`${childTask}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Child milestones done" },
    });
    harness.scriptOutcome(`${childTask}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Child task delivered" },
    });
    scriptCloseups(harness, task);
    harness.defaultCompleteHandler = async ({ system }) => {
      if (system.includes("relevance filter")) return { include: ["item:big-epic", "item:child-item"] };
      return {
        refs: ["child-item"],
        kind: "directive",
        urgency: "next-architect-call",
        summary: "Root directive",
      };
    };

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 10 }
    );

    expect(res.status).toBe("done");
    const rootTaskDir = path.join(taskWtPath, orchFolder, task);
    const taken = path.join(rootTaskDir, "steer", "fromusertaken", "root-msg.txt");
    expect(fs.existsSync(taken)).toBe(true);
    expect(fs.existsSync(`${taken}.classification.yaml`)).toBe(true);
    // Journal entry landed in the ROOT taskDir
    const journal = fs.readFileSync(path.join(rootTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("steer_processed");
  }, 90000);
});