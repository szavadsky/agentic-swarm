import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml } from "../../src/core/records/io.js";
import type {
  PipelineConfig,
  ProjectConfig,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Act-phase routing (docs/factory.v2.md §18; adr-routing-derived-state).
 *
 * Derive owns the blocking effect of a `routed` blocker concern. The act phase
 * owns the architect turn: when a wave act observes an item blocked by such a
 * concern, it consults the architect once per concern and writes
 * `decisions/concern-<cid>.yaml`. Existence of that canonical artifact is the
 * guard, so a restart after a mid-iteration failure neither consults nor
 * rewrites. Architect hydration (plan and wave report inputs) carries routed
 * concerns as a terse `{id, summary, ...}` digest.
 *
 * Test-first contract for the new consult step: it runs an orchestration step
 * named `consult-concern-<cid>` (harness label `<task>/runs/consult-concern-<cid>#a1`)
 * and its rendered prompt names the concern id and summary.
 */

const ORCH = ".factory";
const BLOCKER_CID = "c-0123456789";
const ARCHITECT_CID = "c-9876543210";
const BLOCKER_SUMMARY = "Database schema migration is pending";
const ARCHITECT_SUMMARY = "Cache TTL assumption is unverified";

type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };

function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
  return {
    kind: "blocker",
    summary: `Concern ${overrides.id}`,
    detail: "detail",
    // Routed blocking defaults to high (concerns.minBlockingSeverity).
    severity: "high",
    status: "routed",
    disposition: "architect",
    source: { record: "seed-concern", agent: "test" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function writeConcern(taskDir: string, concern: StoredConcernArtifact): void {
  const dir = path.join(taskDir, "concerns");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(concern, null, 2), "utf8");
}

function makePipeline(): PipelineConfig {
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
      reviewer: { role: "task-reviewer" },
      "wave-close-up": { role: "wave-close-up" },
      "plan-close-up": { role: "plan-close-up" },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {
        dev: {
          fixLoopTo: "develop",
          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
        },
      },
      spike: {},
    },
    limits: {
      maxParallelItems: 2,
      maxParallelTurns: 4,
      maxStepAttempts: 2,
      maxFixRounds: 2,
      maxPlanReviewRounds: 1,
      maxIterations: 3,
    },
  };
}

function decisionFiles(taskDir: string): string[] {
  const dir = path.join(taskDir, "decisions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
}

function consultPrompts(harness: FakeHarness): string[] {
  return harness.calls
    .filter(
      (call): call is Extract<typeof call, { type: "run" }> =>
        call.type === "run" && call.run.label.includes("consult-concern-")
    )
    .map((call) => call.run.prompt);
}

describe("Routing: architect consult and hydration", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let pipeline: PipelineConfig;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    pipeline = makePipeline();
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
      // The single hydration source is concernsYaml; prompt fragments gain the
      // placeholder in the prompt-fragments item, so this test supplies it here.
      overrides: {
        "steps/architect-plan":
          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
        "steps/architect-wave-report":
          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
      },
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  /**
   * Seeds a task whose wave 1 has one routable item and one routed-blocker
   * seed, and whose wave 2 holds the declared dependent of that seed.
   */
  function seedTask(task: string): string {
    const taskDir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Routing consult for ${task}\n`, "utf8");
    writeConcern(
      taskDir,
      storedConcern({
        id: BLOCKER_CID,
        kind: "blocker",
        summary: BLOCKER_SUMMARY,
        affects: ["seed"],
      })
    );
    writeConcern(
      taskDir,
      storedConcern({
        id: ARCHITECT_CID,
        kind: "risk",
        summary: ARCHITECT_SUMMARY,
        affects: [],
      })
    );
    tmpRepo.commit(`seed routed concerns for ${task}`);
    return taskDir;
  }

  function scriptIngestAndPlan(
    harness: FakeHarness,
    task: string,
    captured: { planPrompt?: string }
  ): void {
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Routed concerns need an architect turn", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
      captured.planPrompt = run.prompt;
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1" }],
          itemOutlines: [
            { slug: "keep", kind: "dev", title: "Keep", milestoneId: "m1" },
            { slug: "seed", kind: "dev", title: "Seed", milestoneId: "m1" },
            {
              slug: "dependent",
              kind: "dev",
              title: "Dependent",
              milestoneId: "m1",
              deps: ["seed"],
            },
          ],
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan approved", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "keep",
            outlineRef: "keep",
            kind: "dev",
            title: "Keep",
            assignment: "Keep the wave progressing",
            milestone: "m1",
            wave: 1,
          },
          {
            slug: "seed",
            outlineRef: "seed",
            kind: "dev",
            title: "Seed",
            assignment: "Work named by the routed blocker",
            milestone: "m1",
            wave: 1,
          },
          {
            slug: "dependent",
            outlineRef: "dependent",
            kind: "dev",
            title: "Dependent",
            assignment: "Declared dependent of the blocked seed",
            milestone: "m1",
            wave: 2,
            deps: ["seed"],
          },
        ],
      },
    });
  }

  function scriptConcernConsult(
    harness: FakeHarness,
    task: string,
    promptsSeen: string[]
  ): void {
    harness.scriptOutcome(`${task}/runs/consult-concern-${BLOCKER_CID}#a1`, (run) => {
      promptsSeen.push(run.prompt);
      return {
        ok: true,
        data: {
          id: `decision-concern-${BLOCKER_CID}`,
          context: "wave",
          decision: "continue",
          rationale: "Mitigate the migration before dependents run",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      };
    });
  }

  function scriptWaveCeremony(
    harness: FakeHarness,
    task: string,
    captured: { waveReports: string[] },
    opts: { failReportAt?: 1 | 2 } = {}
  ): void {
    let wave1ReportCalls = 0;
    let wave2ReportCalls = 0;
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["keep"], summary: "Wave 1" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
      wave1ReportCalls++;
      if (opts.failReportAt === 1 && wave1ReportCalls === 1) {
        return { ok: false, error: "architect wave report crashed" };
      }
      captured.waveReports.push(run.prompt);
      return {
        ok: true,
        data: {
          id: "dec-wave-1",
          context: "wave",
          decision: "continue",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "blocked", mergedItems: [], blockedItems: ["dependent"], summary: "Wave 2 blocked" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
      wave2ReportCalls++;
      if (opts.failReportAt === 2 && wave2ReportCalls === 1) {
        return { ok: false, error: "architect wave report crashed" };
      }
      captured.waveReports.push(run.prompt);
      return {
        ok: true,
        data: {
          id: "dec-wave-2",
          context: "wave",
          decision: "continue",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Iteration verified" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Delivery complete" },
    });
  }

  it("writes one concern decision file and hydrates architect turns with routed concerns", async () => {
    const task = "routing-consult";
    seedTask(task);
    const harness = new FakeHarness();
    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
    const consultPromptsSeen: string[] = [];

    scriptIngestAndPlan(harness, task, captured);
    scriptConcernConsult(harness, task, consultPromptsSeen);
    scriptWaveCeremony(harness, task, captured);
    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Kept the wave moving" },
    });

    const result = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(result.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, ORCH, task);

    // Exactly one canonical consult artifact, named by the routed concern.
    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
    const decision = await readYaml<Record<string, any>>(
      path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`)
    );
    expect(decision.decision).toBe("continue");

    // One architect turn for the blocker concern, no turn for the risk concern.
    expect(consultPromptsSeen).toHaveLength(1);
    expect(consultPrompts(harness)).toHaveLength(1);
    expect(consultPromptsSeen[0]).toContain(BLOCKER_CID);
    expect(consultPromptsSeen[0]).toContain(BLOCKER_SUMMARY);

    // Routed concerns reach the architect hydration for the plan and wave
    // report turns without changing the open-only reviewer hydration.
    expect(captured.planPrompt).toBeDefined();
    expect(captured.planPrompt).toContain(BLOCKER_CID);
    expect(captured.planPrompt).toContain(BLOCKER_SUMMARY);
    expect(captured.planPrompt).toContain(ARCHITECT_CID);
    expect(captured.planPrompt).toContain(ARCHITECT_SUMMARY);

    expect(captured.waveReports).toHaveLength(2);
    expect(captured.waveReports[0]).toContain(BLOCKER_CID);
    expect(captured.waveReports[0]).toContain(BLOCKER_SUMMARY);
  }, 30_000);

  it("restart after a mid-iteration failure neither repeats the consult nor rewrites the decision", async () => {
    const task = "routing-consult-restart";
    seedTask(task);
    const harness = new FakeHarness();
    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
    const consultPromptsSeen: string[] = [];

    scriptIngestAndPlan(harness, task, captured);
    scriptConcernConsult(harness, task, consultPromptsSeen);
    scriptWaveCeremony(harness, task, captured, { failReportAt: 2 });
    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Kept the wave moving" },
    });

    // Run 1 dies on wave 2's architect report, after the wave act consulted on
    // the routed blocker and committed the decision artifact, but before the
    // iteration finished.
    const first = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(first.status).toBe("failed");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
    const decisionPath = path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`);
    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
    expect(fs.existsSync(decisionPath)).toBe(true);
    const beforeRestart = fs.readFileSync(decisionPath, "utf8");
    expect(consultPrompts(harness)).toHaveLength(1);

    // Run 2 restarts the same iteration; the existing decision artifact is the
    // idempotency guard, so act phase must not consult or rewrite.
    const second = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(second.status).toBe("done");

    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
    expect(fs.readFileSync(decisionPath, "utf8")).toBe(beforeRestart);
    expect(consultPrompts(harness)).toHaveLength(1);

    // The restarted architect turn is hydrated with the routed concern.
    expect(captured.waveReports.length).toBeGreaterThanOrEqual(1);
    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_CID);
    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_SUMMARY);
  }, 30_000);
});
