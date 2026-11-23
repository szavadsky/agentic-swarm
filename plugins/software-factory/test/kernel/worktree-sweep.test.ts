import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { runGoal } from "../../src/kernel/launch.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  prepareIntegrationCheckout,
  sweepWorktrees,
} from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  DEFAULT_RUN_YAML,
  type E2EGoal,
  cleanup,
  makeGoal,
  outcome,
  simpleTask,
  writePlan,
  writeTask as writeGoalTask,
} from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function externalRoot(kind: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `factory-${kind}-root-`));
}

/** A run config whose worktreeRoot is outside the repo and the default root. */
function configuredRunYaml(root: string): string {
  return `${DEFAULT_RUN_YAML}worktreeRoot: ${JSON.stringify(root)}\n`;
}

function goalPaths(goal: E2EGoal) {
  return resolveGoalPaths(loadConfigs(goal.repo.dir), goal.repo.dir, "demo");
}

function taskWt(goal: E2EGoal, slug: string): string {
  return path.join(goalPaths(goal).worktreeRoot, "demo-tasks", slug);
}

/** Scripts the plan checker so the architect runs in the same boundary turn. */
function scriptPlanCheckProgress(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "plan check ok",
          planCheck: { verdict: "progress", evidence: [], followUps: [] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }), fallback: true },
  );
}

/** One architect turn per decision; `continue` edits the plan it was given. */
function scriptArchitect(
  harness: FakeHarness,
  goal: E2EGoal,
  decisions: readonly ("continue" | "done")[],
): void {
  let turn = 0;
  harness.script(
    (req, ctx) => {
      const decision = decisions[turn] ?? "done";
      turn += 1;
      if (decision === "continue") {
        fs.appendFileSync(
          path.join(goal.goalDir, "plan.md"),
          "\n<!-- planned -->\n",
          "utf8",
        );
      }
      ctx.writeOutcome(outcome({ summary: `architect ${decision}`, decision }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }), fallback: true },
  );
}

function scriptImplement(
  harness: FakeHarness,
  slug: string,
  file: string,
): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
      ctx.writeOutcome(outcome({ summary: `${slug} done` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "implement" }) },
  );
}

function scriptParked(harness: FakeHarness, slug: string): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "blocked", summary: `${slug} needs an input` }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "implement" }) },
  );
}

/** The boundary PM and the wave-end stall both answer on this step. */
function scriptPmLeaves(harness: FakeHarness, slug: string): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: `left ${slug} parked`,
          stallRoutes: [{ slug, action: "leave", reason: "left for later" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }), fallback: true },
  );
}

function writeDoneGoal(goal: E2EGoal): { alphaWt: string; betaWt: string } {
  writePlan(
    goal.goalDir,
    "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n\n" +
      "## beta\nCreate beta.txt.\nDone when: beta.txt exists.\n",
  );
  writeGoalTask(
    goal.goalDir,
    simpleTask("alpha", "alpha.txt", { flow: "just-implement" }),
  );
  writeGoalTask(
    goal.goalDir,
    simpleTask("beta", "beta.txt", { flow: "just-implement" }),
  );
  return { alphaWt: taskWt(goal, "alpha"), betaWt: taskWt(goal, "beta") };
}

function doneGoalHarness(goal: E2EGoal): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  scriptArchitect(harness, goal, ["continue", "done"]);
  scriptPlanCheckProgress(harness);
  scriptImplement(harness, "alpha", "alpha.txt");
  scriptParked(harness, "beta");
  scriptPmLeaves(harness, "beta");
  return withKernelRoleFallbacks(harness);
}

function registerDoneGoalSweep(): void {
  it("sweeps a done goal's merged worktree and keeps the parked one", async () => {
    const root = externalRoot("configured");
    const goal = makeGoal({ runYaml: configuredRunYaml(root) });
    try {
      const { alphaWt, betaWt } = writeDoneGoal(goal);
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: doneGoalHarness(goal) },
        baseGates: false,
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("done");
      expect(result.state.tasks.alpha!.status).toBe("merged");
      expect(result.state.tasks.beta!.status).toBe("parked");
      expect(fs.existsSync(alphaWt)).toBe(false);
      expect(fs.existsSync(betaWt)).toBe(true);
      expect(
        goal.repo.git([
          "rev-parse",
          "--verify",
          "--quiet",
          "refs/heads/factory-task/demo/beta",
        ]).code,
      ).toBe(0);
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 90_000);
}

async function record(
  runtime: KernelRuntime,
  slug: string,
  step: string,
  ok: boolean,
): Promise<void> {
  await runtime.store.records.append(
    { iteration: 1, step, round: 1, actor: "script", slug },
    { ok },
  );
}

interface SweepFixture {
  merged: string;
  finished: string;
  cancelled: string;
  parked: string;
  midrun: string;
  dirty: string;
  otherGoal: string;
  user: string;
}

function place(
  repo: TmpRepo,
  root: string,
  slug: string,
  branch: string,
): string {
  const wt = path.join(root, slug);
  repo.createWorktree(branch, wt);
  return wt;
}

/** Worktrees under two roots that are neither the repo nor the goal checkout. */
async function placeTerminalWorktrees(
  repo: TmpRepo,
  runtime: KernelRuntime,
  goal: string,
  roots: readonly string[],
): Promise<Pick<SweepFixture, "merged" | "finished" | "cancelled" | "dirty">> {
  const merged = place(
    repo,
    roots[0]!,
    "merged",
    `factory-task/${goal}/merged`,
  );
  await writeTask(runtime, task("merged"));
  await record(runtime, "merged", "merge", true);

  const finished = place(
    repo,
    roots[0]!,
    "finished",
    `factory-task/${goal}/finished`,
  );
  await writeTask(runtime, task("finished", { kind: "spike", flow: "spike" }));
  await record(runtime, "finished", "finish", true);

  const cancelled = place(
    repo,
    roots[1]!,
    "cancelled",
    `factory-task/${goal}/cancelled`,
  );
  await writeTask(runtime, task("cancelled"));
  await record(runtime, "cancelled", "cancel", true);

  const dirty = place(repo, roots[1]!, "dirty", `factory-task/${goal}/dirty`);
  await writeTask(runtime, task("dirty"));
  await record(runtime, "dirty", "merge", true);
  fs.writeFileSync(path.join(dirty, "uncommitted.txt"), "keep me\n", "utf8");
  return { merged, finished, cancelled, dirty };
}

async function placeKeptWorktrees(
  repo: TmpRepo,
  runtime: KernelRuntime,
  goal: string,
  roots: readonly string[],
): Promise<Pick<SweepFixture, "parked" | "midrun" | "otherGoal" | "user">> {
  const parked = place(
    repo,
    roots[1]!,
    "parked",
    `factory-task/${goal}/parked`,
  );
  await writeTask(runtime, task("parked"));
  await record(runtime, "parked", "park", false);

  const midrun = place(
    repo,
    roots[0]!,
    "midrun",
    `factory-task/${goal}/midrun`,
  );
  await writeTask(runtime, task("midrun"));

  return {
    parked,
    midrun,
    otherGoal: place(
      repo,
      roots[0]!,
      "other-goal",
      "factory-task/other-goal/merged",
    ),
    user: place(repo, roots[1]!, "user", "user-branch"),
  };
}

async function placeWorktrees(
  repo: TmpRepo,
  runtime: KernelRuntime,
  goal: string,
  roots: readonly string[],
): Promise<SweepFixture> {
  return {
    ...(await placeTerminalWorktrees(repo, runtime, goal, roots)),
    ...(await placeKeptWorktrees(repo, runtime, goal, roots)),
  };
}

function expectLaunchSweep(fixture: SweepFixture): void {
  expect(fs.existsSync(fixture.merged)).toBe(false);
  expect(fs.existsSync(fixture.finished)).toBe(false);
  expect(fs.existsSync(fixture.cancelled)).toBe(false);
  expect(fs.existsSync(fixture.parked)).toBe(true);
  expect(fs.existsSync(fixture.midrun)).toBe(true);
  expect(fs.existsSync(fixture.dirty)).toBe(true);
  expect(fs.existsSync(fixture.otherGoal)).toBe(true);
  expect(fs.existsSync(fixture.user)).toBe(true);
}

function registerAllRootsSweep(): void {
  it("removes terminal worktrees under every registered root and keeps the rest", async () => {
    const { repo, goal } = setupFlowRepo({ goal: "sweep-demo" });
    const roots = [externalRoot("legacy"), externalRoot("configured")];
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const fixture = await placeWorktrees(repo, runtime, goal, roots);
      await prepareIntegrationCheckout(runtime);
      expectLaunchSweep(fixture);

      await record(runtime, "midrun", "merge", true);
      await sweepWorktrees(runtime);
      expect(fs.existsSync(fixture.midrun)).toBe(false);
      expect(fs.existsSync(fixture.parked)).toBe(true);
      expect(fs.existsSync(fixture.dirty)).toBe(true);
      expect(
        repo.git([
          "rev-parse",
          "--verify",
          "--quiet",
          `refs/heads/factory-task/${goal}/parked`,
        ]).code,
      ).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
      for (const root of roots)
        fs.rmSync(root, { recursive: true, force: true });
    }
  }, 90_000);
}

function stoppedGoalHarness(goal: E2EGoal): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  scriptArchitect(harness, goal, ["continue"]);
  scriptPlanCheckProgress(harness);
  scriptImplement(harness, "alpha", "alpha.txt");
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "nothing to route" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }), fallback: true },
  );
  return withKernelRoleFallbacks(harness);
}

function registerStoppedGoalKeeps(): void {
  it("keeps every worktree when the goal stops without done", async () => {
    const goal = makeGoal();
    try {
      writePlan(
        goal.goalDir,
        "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n",
      );
      writeGoalTask(
        goal.goalDir,
        simpleTask("alpha", "alpha.txt", { flow: "just-implement" }),
      );
      const alphaWt = taskWt(goal, "alpha");
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: stoppedGoalHarness(goal) },
        baseGates: false,
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("iteration-limit");
      expect(result.state.tasks.alpha!.status).toBe("merged");
      expect(fs.existsSync(alphaWt)).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

describe("worktree sweep at launch and goal end", () => {
  registerDoneGoalSweep();
  registerAllRootsSweep();
  registerStoppedGoalKeeps();
});
