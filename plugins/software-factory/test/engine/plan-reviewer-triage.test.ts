import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runIteration } from "../../src/core/flows/iteration.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import { concernFingerprint } from "../../src/core/concerns.js";
import type {
  PipelineConfig,
  ProjectConfig,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Plan-reviewer triage (docs/factory.v2.md §18; m2-triage-modes).
 *
 * Architect plan/revise output feeds the taskWt concern store (concerns[] and
 * remarkable[]), steps/plan-review is hydrated with the open concerns YAML,
 * and the plan reviewer triages those exact ids with the same vocabulary as
 * the item reviewer: `dismiss` (requires detail) keeps the file dismissed,
 * every other disposition routes it. Triage ids never count as plan findings,
 * so they neither request a plan revision nor influence approval.
 */
describe("Plan-reviewer triage", () => {
  const ORCH = ".factory";
  const TASK = "plan-reviewer-triage";

  let tmpRepo: TmpRepo;
  let repo: Repo;
  let taskDir: string;
  let taskWt: string;
  let worktreeRoot: string;
  let pipeline: PipelineConfig;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    taskWt = tmpRepo.dir;
    taskDir = path.join(taskWt, ORCH, TASK);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Plan reviewer triage\n", "utf8");
    tmpRepo.commit("add plan-reviewer triage task");

    pipeline = {
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
        architect: { role: "architect" },
        "plan-reviewer": { role: "alt-architect" },
        pm: { role: "alt-workhorse" },
      },
      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
      limits: { maxPlanReviewRounds: 2 },
    };
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function planData(extra: Record<string, unknown> = {}) {
    return {
      iteration: 1,
      milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
      itemOutlines: [],
      ...extra,
    };
  }

  function concernsDir(): string {
    return path.join(taskDir, "concerns");
  }

  function concernIds(prefix: "c-" | "rm-"): string[] {
    const dir = concernsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length))
      .sort();
  }

  async function storedConcern(id: string): Promise<StoredConcernArtifact> {
    return readYaml<StoredConcernArtifact>(path.join(concernsDir(), `${id}.yaml`));
  }

  async function runPlanReview(opts: {
    harness: FakeHarness;
    planStep?: Record<string, unknown>;
    planReview: (run: { prompt: string }) => Record<string, unknown>;
  }): Promise<{ prompts: string[]; result: Awaited<ReturnType<typeof runIteration>> }> {
    const harness = opts.harness;
    harness.scriptOutcome(
      `${TASK}/runs/architect-plan-1#a1`,
      { ok: true, data: opts.planStep ?? planData() }
    );

    const hydratedPrompts: string[] = [];
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, (run) => {
      hydratedPrompts.push(run.prompt);
      return { ok: true, data: opts.planReview(run) };
    });

    // Stops the iteration right after the plan-review loop: empty PM edits are
    // rejected without touching waves or item worktrees.
    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
      ok: true,
      data: { iteration: 1, items: [] },
    });

    const result = await runIteration({
      task: TASK,
      taskDir,
      taskWt,
      repo,
      harness,
      pipeline,
      project,
      prompts,
    });
    return { prompts: hydratedPrompts, result };
  }

  function runLabels(harness: FakeHarness): string[] {
    return harness.calls
      .filter((call): call is Extract<(typeof harness.calls)[number], { type: "run" }> => call.type === "run")
      .map((call) => call.run.label);
  }

  it("hydrates plan-review with plan concerns and triages dismiss vs routed ids", async () => {
    const harness = new FakeHarness();
    const dismissedId = concernFingerprint({
      kind: "tech-debt",
      summary: "Plan retry glue duplicates the adapter",
      affects: ["m1"],
    });
    const routedId = concernFingerprint({
      kind: "risk",
      summary: "Milestone boundary depends on an unbuilt adapter",
      affects: ["m1"],
    });

    const reviewRun = await runPlanReview({
      harness,
      planStep: planData({
        concerns: [
          {
            kind: "tech-debt",
            summary: "Plan retry glue duplicates the adapter",
            detail: "Extract one shared retry helper",
            severity: "medium",
            affects: ["m1"],
          },
          {
            kind: "risk",
            summary: "Milestone boundary depends on an unbuilt adapter",
            detail: "Risk of imaginary interfaces",
            severity: "high",
            affects: ["m1"],
          },
        ],
        remarkable: [
          {
            chosen: "File-per-concern YAML store",
            alternatives: ["One aggregate file", "Embed in state.yaml"],
            why: "conflict-free task worktree commits",
          },
        ],
      }),
      planReview: () => {
        const [rmId] = concernIds("rm-");
        return {
          status: "approved",
          summary: "Plan and concern triage",
          suggestions: [
            {
              id: dismissedId,
              disposition: "dismiss",
              summary: "Duplicate of the shared retry helper",
              detail: "covered by the plan ADR",
            },
            { id: routedId, disposition: "optional", summary: "Track as debt" },
            {
              id: rmId,
              disposition: "dismiss",
              summary: "Standard storage choice",
              detail: "documented alternative is enough",
            },
            { id: "s-not-a-concern", disposition: "optional", summary: "Ordinary finding" },
          ],
        };
      },
    });

    // Aggregation: architect plan concerns and remarkable decisions reach taskWt.
    expect(concernIds("c-")).toEqual([dismissedId, routedId].sort());
    expect(concernIds("rm-")).toHaveLength(1);

    // Same vocabulary as the item reviewer: dismiss keeps the reason, other
    // dispositions route, and ordinary finding ids are ignored.
    const dismissed = await storedConcern(dismissedId);
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.dismissReason).toBe("covered by the plan ADR");

    const routed = await storedConcern(routedId);
    expect(routed.status).toBe("routed");
    expect(routed.disposition).toBe("optional");

    const [rmId] = concernIds("rm-");
    const remarkable = await readYaml<Record<string, any>>(
      path.join(concernsDir(), `${rmId}.yaml`)
    );
    expect(remarkable.status).toBe("dismissed");
    expect(remarkable.dismissReason).toBe("documented alternative is enough");
    expect(fs.existsSync(path.join(concernsDir(), "s-not-a-concern.yaml"))).toBe(false);

    // Hydration: the plan reviewer sees every open concern id before triage.
    expect(reviewRun.prompts).toHaveLength(1);
    for (const id of [dismissedId, routedId, ...concernIds("rm-")]) {
      expect(reviewRun.prompts[0]).toContain(id);
    }
  });

  it("aggregates architect-revise concerns and remarkable rm-* for the next review round", async () => {
    const harness = new FakeHarness();
    const reviseConcernId = concernFingerprint({
      kind: "assumption",
      summary: "Plan assumes an in-memory queue survives restart",
      affects: ["m1"],
    });
    let secondPrompt = "";

    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
      ok: true,
      data: planData(),
    });
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "Plan needs a durability story",
        suggestions: [
          { id: "s-plan-gap", disposition: "fix", summary: "Add durability to the plan" },
        ],
      },
    });
    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, {
      ok: true,
      data: planData({
        concerns: [
          {
            kind: "assumption",
            summary: "Plan assumes an in-memory queue survives restart",
            detail: "Persist the queue before acknowledging",
            severity: "high",
            affects: ["m1"],
          },
        ],
        remarkable: [
          {
            chosen: "Lease-based queue",
            alternatives: ["In-memory queue", "External broker"],
            why: "restart safety without a new dependency",
          },
        ],
      }),
    });
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, (run) => {
      secondPrompt = run.prompt;
      const [rmId] = concernIds("rm-");
      return {
        ok: true,
        data: {
          status: "approved",
          summary: "Revised plan approved",
          suggestions: [
            { id: reviseConcernId, disposition: "architect", summary: "Carry to architect" },
            { id: rmId, disposition: "optional", summary: "Keep as debt" },
          ],
        },
      };
    });
    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
      ok: true,
      data: { iteration: 1, items: [] },
    });

    await runIteration({
      task: TASK,
      taskDir,
      taskWt,
      repo,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Revise producer output aggregated into the same store as the plan output.
    const reviseConcern = await storedConcern(reviseConcernId);
    expect(reviseConcern.source.agent).toBe("architect");
    expect(reviseConcern.source.step).toBe("architect-revise-1-1");
    const rmId = concernIds("rm-")[0]!;
    expect(rmId).toMatch(/^rm-[0-9a-f]{10}$/);

    // Non-dismiss dispositions route; the remarkable file routes too.
    const routedConcern = await storedConcern(reviseConcernId);
    expect(routedConcern.status).toBe("routed");
    expect(routedConcern.disposition).toBe("architect");
    const remarkable = await readYaml<Record<string, any>>(
      path.join(concernsDir(), `${rmId}.yaml`)
    );
    expect(remarkable.status).toBe("routed");
    expect(remarkable.disposition).toBe("optional");

    // Round two is hydrated with the revise concern and remarkable id.
    expect(secondPrompt).toContain(reviseConcernId);
    expect(secondPrompt).toContain(rmId);
  });

  it("keeps triage ids out of the plan fix loop so they never trigger a revision", async () => {
    const harness = new FakeHarness();
    const concernId = concernFingerprint({
      kind: "tech-debt",
      summary: "Plan duplicates the retry helper",
      affects: ["m1"],
    });
    let revised = false;

    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
      ok: true,
      data: planData({
        concerns: [
          {
            kind: "tech-debt",
            summary: "Plan duplicates the retry helper",
            detail: "Use one shared helper",
            severity: "medium",
            affects: ["m1"],
          },
        ],
      }),
    });
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "Triage only",
        suggestions: [
          { id: concernId, disposition: "fix", summary: "Resolve the plan debt" },
        ],
      },
    });
    // Scripted so a regression that revises is observable rather than crashing.
    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, () => {
      revised = true;
      return { ok: true, data: planData() };
    });
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, {
      ok: true,
      data: { status: "approved", summary: "Second round", suggestions: [] },
    });
    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
      ok: true,
      data: { iteration: 1, items: [] },
    });

    await runIteration({
      task: TASK,
      taskDir,
      taskWt,
      repo,
      harness,
      pipeline,
      project,
      prompts,
    });

    const triaged = await storedConcern(concernId);
    expect(triaged.status).toBe("routed");
    expect(triaged.disposition).toBe("fix");

    expect(revised).toBe(false);
    const labels = runLabels(harness);
    expect(labels).not.toContain(`${TASK}/runs/architect-revise-1-1#a1`);
    expect(labels).not.toContain(`${TASK}/runs/plan-review-1-2#a1`);
  });

  it("derives debt from routed tech-debt concerns and routed optional dispositions only", async () => {
    const dir = concernsDir();
    const stored = (
      id: string,
      overrides: Partial<StoredConcernArtifact>
    ): StoredConcernArtifact => ({
      id,
      kind: "risk",
      summary: `Concern ${id}`,
      detail: `Detail ${id}`,
      severity: "medium",
      status: "open",
      source: { record: "001-plan-review-a1", agent: "plan-reviewer" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });

    await writeYamlAtomic(
      path.join(dir, "c-debtrouted.yaml"),
      stored("c-debtrouted", {
        kind: "tech-debt",
        summary: "Plan duplicated the retry helper",
        status: "routed",
      })
    );
    await writeYamlAtomic(
      path.join(dir, "c-optionalrouted.yaml"),
      stored("c-optionalrouted", {
        kind: "risk",
        summary: "Defer contract hardening",
        status: "routed",
        disposition: "optional",
      })
    );
    await writeYamlAtomic(
      path.join(dir, "c-debtopen.yaml"),
      stored("c-debtopen", {
        kind: "tech-debt",
        summary: "Open debt stays a concern",
        status: "open",
      })
    );
    await writeYamlAtomic(
      path.join(dir, "c-optionaldismissed.yaml"),
      stored("c-optionaldismissed", {
        kind: "risk",
        summary: "Dismissed optional is not debt",
        status: "dismissed",
        disposition: "dismiss",
        dismissReason: "not worth tracking",
      })
    );

    const state = await deriveTaskState({
      taskDir,
      task: TASK,
      taskWt,
      pipeline,
      project,
    });

    expect(state.debt).toContain("Plan duplicated the retry helper");
    expect(state.debt).toContain("Defer contract hardening");
    expect(state.debt).not.toContain("Open debt stays a concern");
    expect(state.debt).not.toContain("Dismissed optional is not debt");
  });
});
