import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { writeQuestion } from "../../src/core/steer.js";
import { deriveItemState } from "../../src/core/derive/item.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import type {
  PipelineConfig,
  ProjectConfig,
  StateArtifact,
  SteerItemArtifact,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Human mailbox + debt routing (docs/factory.v2.md §18; ADRs
 * adr-routing-derived-state, adr-digest-mailbox).
 *
 * Dispositions route differently:
 * - human-async blocks [item] and lets the task continue without exit 10.
 * - human-stop blocks task/item, derives a blocked task and halts with exit 10.
 * - human-awareness is digest-only: blocks [] and never blocks or exits.
 * Tech-debt concerns (routed/resolved) and routed `optional` concerns feed the
 * task debt list as `[item] summary`.
 */
const ORCH = ".factory";

describe("Human mailbox and debt routing (§8.7, §18)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function taskDirFor(task: string): string {
    const dir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
    tmpRepo.commit(`add ${task} intent`);
    return dir;
  }

  function writeAssignment(taskDir: string, slug: string): void {
    const itemDir = path.join(taskDir, "items", slug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify(
        {
          slug,
          kind: "dev",
          title: `Item ${slug}`,
          assignment: `Implement ${slug}`,
          milestone: "m1",
          wave: 1,
          deps: [],
        },
        null,
        2
      )
    );
  }

  async function clearMailbox(taskDir: string): Promise<void> {
    await fs.promises.rm(path.join(taskDir, "steer", "tousertoreview"), {
      recursive: true,
      force: true,
    });
  }

  async function mailboxQuestions(taskDir: string): Promise<SteerItemArtifact[]> {
    const dir = path.join(taskDir, "steer", "tousertoreview");
    if (!fs.existsSync(dir)) return [];
    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
    return Promise.all(
      names.map((n) => readYaml<SteerItemArtifact>(path.join(dir, n)))
    );
  }

  it("derives item blocking and task continuation per human disposition", async () => {
    const task = "dispositions";
    const taskDir = taskDirFor(task);
    writeAssignment(taskDir, "item-1");

    const derive = async () => ({
      item: await deriveItemState({
        taskDir,
        itemSlug: "item-1",
        parentBranch: `topic/${task}`,
      }),
      task: await deriveTaskState({ taskDir, task, parentBranch: `topic/${task}` }),
    });

    // human-async: the item blocks; the task keeps running (no exit-10 derive).
    await writeQuestion(tmpRepo.dir, taskDir, {
      id: "q-async",
      ref: "item-1",
      disposition: "human-async",
      question: "Which retry strategy?",
      blocks: ["item-1"],
    });
    const asyncState = await derive();
    expect(asyncState.item.status).toBe("blocked");
    expect(asyncState.task.status).not.toBe("blocked");

    // human-stop: both the item and the task derive blocked.
    await clearMailbox(taskDir);
    await writeQuestion(tmpRepo.dir, taskDir, {
      id: "q-stop",
      ref: "item-1",
      disposition: "human-stop",
      question: "Irreversible data-loss hazard",
      blocks: ["item-1", "task"],
    });
    const stopState = await derive();
    expect(stopState.item.status).toBe("blocked");
    expect(stopState.task.status).toBe("blocked");

    // human-awareness: digest-only, never blocking.
    await clearMailbox(taskDir);
    await writeQuestion(tmpRepo.dir, taskDir, {
      id: "q-awareness",
      ref: "item-1",
      disposition: "human-awareness",
      question: "Notable tradeoff recorded for the operator",
      blocks: [],
    });
    const awarenessState = await derive();
    expect(awarenessState.item.status).not.toBe("blocked");
    expect(awarenessState.task.status).not.toBe("blocked");
  });

  it("halts with exit 10 and writes a task/item human-stop mailbox entry", async () => {
    const task = "stop-flow";
    const taskDir = taskDirFor(task);
    const worktreeRoot = path.join(tmpRepo.dir + "-stop-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const harness = new FakeHarness();
    const { pipeline, project, prompts } = engineFixture(task, worktreeRoot, harness, [
      { slug: "item-1", title: "Item 1" },
    ], {
      "item-1": {
        status: "changes_requested",
        summary: "Fatal safety hazard",
        suggestions: [
          {
            id: "stop-1",
            disposition: "human-stop",
            summary: "Irreversible data loss hazard",
            detail: "Stop before writing anything else",
          },
        ],
      },
    });

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 20 }
    );

    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);

    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, ORCH, task);
    const questions = await mailboxQuestions(deployedTaskDir);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.disposition).toBe("human-stop");
    expect([...(questions[0]!.blocks ?? [])].sort()).toEqual(["item-1", "task"]);

    const state = await readYaml<StateArtifact>(
      path.join(deployedTaskDir, "state.yaml")
    );
    expect(state.status).toBe("blocked");
    expect(state.items["item-1"]?.status).toBe("blocked");
  });

  it("writes a digest-only human-awareness entry and continues to completion", async () => {
    const task = "awareness-flow";
    const taskDir = taskDirFor(task);
    const worktreeRoot = path.join(tmpRepo.dir + "-awareness-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const harness = new FakeHarness();
    const { pipeline, project, prompts } = engineFixture(task, worktreeRoot, harness, [
      { slug: "item-1", title: "Item 1" },
    ], {
      "item-1": {
        status: "changes_requested",
        summary: "Notable tradeoff",
        suggestions: [
          {
            id: "aware-1",
            disposition: "human-awareness",
            summary: "Chose an in-memory index over a database",
            detail: "Operator should know, but no decision is needed now",
          },
        ],
      },
    });

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 20 }
    );

    expect(res.status).toBe("done");
    expect(res.exitCode).toBe(0);

    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, ORCH, task);
    const questions = await mailboxQuestions(deployedTaskDir);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.disposition).toBe("human-awareness");
    expect(questions[0]!.blocks ?? []).toEqual([]);

    const state = await readYaml<StateArtifact>(
      path.join(deployedTaskDir, "state.yaml")
    );
    expect(state.status).toBe("done");
    expect(state.items["item-1"]?.status).toBe("merged");
  });

  it("keeps running other items while one item waits on human-async", async () => {
    const task = "async-flow";
    const taskDir = taskDirFor(task);
    const worktreeRoot = path.join(tmpRepo.dir + "-async-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const harness = new FakeHarness();
    const { pipeline, project, prompts } = engineFixture(task, worktreeRoot, harness, [
      { slug: "item-a", title: "Item A" },
      { slug: "item-b", title: "Item B" },
    ], {
      "item-a": {
        status: "changes_requested",
        summary: "Needs an operator answer",
        suggestions: [
          {
            id: "async-1",
            disposition: "human-async",
            summary: "Which storage backend?",
            detail: "Operator must choose before this item proceeds",
          },
        ],
      },
      "item-b": { status: "approved", summary: "Approved", suggestions: [] },
    });

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 30 }
    );

    // human-async must not halt the run with exit 10 while other work remains.
    expect(res.status).toBe("done");
    expect(res.exitCode).toBe(0);

    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, ORCH, task);
    const questions = await mailboxQuestions(deployedTaskDir);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.disposition).toBe("human-async");
    expect(questions[0]!.blocks ?? []).toEqual(["item-a"]);

    const state = await readYaml<StateArtifact>(
      path.join(deployedTaskDir, "state.yaml")
    );
    expect(state.items["item-a"]?.status).toBe("blocked");
    expect(state.items["item-b"]?.status).toBe("merged");
  });

  it("collects debt with [item] prefixes for routed/resolved tech-debt and routed optional concerns", async () => {
    const task = "debt-task";
    const taskDir = taskDirFor(task);
    writeAssignment(taskDir, "item-1");

    const concernDir = path.join(taskDir, "concerns");
    fs.mkdirSync(concernDir, { recursive: true });

    const concern = (
      id: string,
      overrides: Partial<StoredConcernArtifact>
    ): StoredConcernArtifact => ({
      id,
      kind: "tech-debt",
      summary: `Concern ${id}`,
      detail: "detail",
      severity: "medium",
      status: "routed",
      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
      affects: ["item-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });

    await writeYamlAtomic(
      path.join(concernDir, "c-routed.yaml"),
      concern("c-routed", { summary: "Routed tech debt" })
    );
    await writeYamlAtomic(
      path.join(concernDir, "c-resolved.yaml"),
      concern("c-resolved", { summary: "Resolved tech debt", status: "resolved" })
    );
    await writeYamlAtomic(
      path.join(concernDir, "c-optional.yaml"),
      concern("c-optional", {
        kind: "risk",
        summary: "Optional risk",
        status: "routed",
        disposition: "optional",
      })
    );
    await writeYamlAtomic(
      path.join(concernDir, "c-open.yaml"),
      concern("c-open", { summary: "Open tech debt", status: "open" })
    );
    await writeYamlAtomic(
      path.join(concernDir, "c-dismissed.yaml"),
      concern("c-dismissed", { summary: "Dismissed tech debt", status: "dismissed" })
    );
    await writeYamlAtomic(
      path.join(concernDir, "c-fix.yaml"),
      concern("c-fix", {
        kind: "risk",
        summary: "Fixed risk",
        status: "routed",
        disposition: "fix",
      })
    );

    const state = await deriveTaskState({
      taskDir,
      task,
      parentBranch: `topic/${task}`,
    });

    expect(state.debt.slice().sort()).toEqual(
      [
        "[item-1] Optional risk",
        "[item-1] Resolved tech debt",
        "[item-1] Routed tech debt",
      ].sort()
    );
  });

  /**
   * Builds a real task/repo fixture and scripts ingest, plan, PM edits, both
   * items' steps and the wave/plan close-ups so any non-halting path finishes.
   */
  function engineFixture(
    task: string,
    worktreeRoot: string,
    harness: FakeHarness,
    items: { slug: string; title: string }[],
    reviewData: Record<string, unknown>
  ): {
    pipeline: PipelineConfig;
    project: ProjectConfig;
    prompts: ReturnType<typeof loadPromptLibrary>;
  } {
    const project: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot };
    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "model-workhorse" },
          "alt-workhorse": { model: "model-alt-workhorse" },
          architect: { model: "model-architect" },
          "alt-architect": { model: "model-alt-architect" },
          simpler: { model: "model-simpler" },
        },
      },
      agents: {
        triage: { role: "workhorse" },
        infra: { role: "workhorse" },
        architect: { role: "architect" },
        "plan-reviewer": { role: "alt-architect" },
        pm: { role: "alt-workhorse" },
        developer: { role: "workhorse" },
        reviewer: { role: "alt-workhorse" },
        "wave-close-up": { role: "alt-workhorse" },
        "plan-close-up": { role: "alt-workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      reviewPolicy: {
        default: [
          "fix",
          "optional",
          "architect",
          "human-awareness",
          "human-async",
          "human-stop",
        ],
      },
      limits: {
        maxParallelItems: 2,
        maxParallelTurns: 4,
        maxStepAttempts: 3,
        maxFixRounds: 3,
      },
    };
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Routing flow", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true" },
      },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: items.map((it) => ({
          slug: it.slug,
          kind: "dev",
          title: it.title,
          milestoneId: "m1",
          deps: [],
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
        items: items.map((it) => ({
          slug: it.slug,
          outlineRef: it.slug,
          kind: "dev",
          title: it.title,
          assignment: `Implement ${it.title}`,
          milestone: "m1",
          wave: 1,
          deps: [],
        })),
      },
    });

    for (const it of items) {
      harness.scriptOutcome(`${task}/items/${it.slug}/develop#a1`, (run) => {
        fs.writeFileSync(path.join(run.cwd, `${it.slug}.ts`), `export const ${it.slug.replace(/-/g, "_")} = 1;\n`);
        return { ok: true, data: { status: "ok", summary: `Developed ${it.slug}` } };
      });
      harness.scriptOutcome(`${task}/items/${it.slug}/review#a1`, {
        ok: true,
        data: reviewData[it.slug] ?? {
          status: "approved",
          summary: "Approved",
          suggestions: [],
        },
      });
    }

    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: {
        wave: 1,
        iteration: 1,
        status: "complete",
        mergedItems: [],
        summary: "Wave report",
      },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-wave-1",
        context: "wave",
        decision: "continue",
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Iteration complete" },
    });

    return { pipeline, project, prompts };
  }
});
