import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { commitAll } from "../../src/core/git/commit.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { infraPath } from "../../src/kernel/infra.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  Action,
  KernelRuntime,
  TaskFile,
  TaskState,
} from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { workCalls } from "./fake-defaults.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  cleanup as cleanupGoal,
  expectLaunch,
  makeGoal,
  scriptDigest,
  simpleTask,
  stateOf,
  writeTask as writeGoalTask,
} from "./e2e-helpers.js";

interface GateProbe {
  dir: string;
  count: string;
  marker: string;
}

function makeProbe(): GateProbe {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flake-"));
  return {
    dir,
    count: path.join(dir, "count"),
    marker: path.join(dir, "marker"),
  };
}

function runs(probe: GateProbe): number {
  try {
    const text = fs.readFileSync(probe.count, "utf8").trim();
    return text === "" ? 0 : text.split("\n").length;
  } catch {
    return 0;
  }
}

function cleanupProbe(probe: GateProbe): void {
  fs.rmSync(probe.dir, { recursive: true, force: true });
}

const quote = (value: string): string => `'${value}'`;

/** Always green; its count proves green gates never re-run. */
function greenCommand(probe: GateProbe): string {
  return `echo run >> ${quote(probe.count)}`;
}

function redCommand(probe: GateProbe): string {
  return (
    `echo run >> ${quote(probe.count)}; ` +
    `printf 'src/b.test.ts:\\n(fail) suite > broken test\\n'; exit 1`
  );
}

function infraCommand(probe: GateProbe): string {
  return `echo run >> ${quote(probe.count)}; exit 127`;
}

function longRedCommand(probe: GateProbe): string {
  const detail = Array.from(
    { length: 30 },
    (_, i) => `    at src/long.test.ts:${i + 1}:3`,
  ).join("\n");
  return (
    `echo run >> ${quote(probe.count)}; ` +
    `printf 'src/long.test.ts:\n(fail) suite > hidden red [1.2ms]\n${detail}\n'; exit 1`
  );
}

/** Drives one real action and returns the freshly derived state. */
async function driveAction(
  runtime: KernelRuntime,
  file: TaskFile,
  action: Action,
): Promise<TaskState> {
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  await executeTaskAction(runtime, file, action, 1, state.tasks[file.slug]!);
  const after = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return after.tasks[file.slug]!;
}

function readClass(goalDir: string): unknown {
  return yaml.parse(fs.readFileSync(path.join(goalDir, "class.yaml"), "utf8"));
}

async function parksReviewUpscopeYesRewritesClassPart1(
  goal: ReturnType<typeof makeGoal>,
  readClass: (goalDir: string) => unknown,
) {
  writeGoalTask(goal.goalDir, simpleTask("solo", "solo.txt"));
  const first = new FakeHarness({ id: "fake" });
  let reviewPrompt = "";
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "solo.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "implemented" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    reviewPrompt = req.prompt;
    ctx.writeOutcome(
      outcome({
        summary: "needs an architect: two services, not one",
        verdict: "approve",
        upscope: "yes",
      }),
    );
    return fakeTurnResult(req);
  });
  scriptStallLeave(first, ["solo"]);

  // Iteration 1 escalates through the launch: the class rewrite skips the
  // front stop, so the goal stays active instead of blocking on the park.
  await expectLaunch(3, goal.repo, first, 1);
  expect(reviewPrompt).toContain("standalone task");

  const store = createFolderStore(goal.goalDir, undefined, {});
  const escalated = await stateOf(goal.goalDir);
  // The review approved the work and recorded the escalation park: the wave
  // end lands the green branch, so the next launch plans from landed state.
  expect(escalated.tasks.solo!.status).toBe("merged");
  const parks = (await store.listRecords()).filter(
    (r) => r.slug === "solo" && r.step === "park",
  );
  expect(parks).toHaveLength(1);
  expect(causeText(parks[0]!.cause)).toMatch(/^upscope: /);
  expect(escalated.goal).toBe("active");
  expect(escalated.terminal).toBe(false);
  expect(readClass(goal.goalDir)).toEqual({ class: "bigger" });
  expect(
    (await store.listRecords()).filter((r) => r.step === "front-stop"),
  ).toEqual([]);

  // The next launch reads the bigger class and runs the architect.
  const second = new FakeHarness({ id: "fake" });
  scriptDigest(second, goal.goalDir, 2);

  return { first, store, second };
}

async function parksReviewUpscopeYesRewritesClassPart2(
  goal: ReturnType<typeof makeGoal>,
  scope: Awaited<ReturnType<typeof parksReviewUpscopeYesRewritesClassPart1>>,
) {
  const { second, store, first } = scope;
  second.script((req, ctx) => {
    expect(req.prompt).toContain("You are the architect");
    ctx.writeOutcome(outcome({ summary: "planned", decision: "done" }));
    return fakeTurnResult(req);
  });
  await expectLaunch(0, goal.repo, second, 1);

  const records = await store.listRecords();
  const architect = records.find((r) => r.step === "architect");
  expect(architect).toBeDefined();
  expect(architect?.iteration).toBe(2);
  expect((await stateOf(goal.goalDir)).goal).toBe("done");
  expect(workCalls(first)).toHaveLength(4);
  // digest, the pack preparer and the architect: iteration 2 prepares its
  // index from the script data before the consult; the bigger relaunch also
  // scouted the plan-less goal first.
  expect(second.calls).toHaveLength(4);
}

function registerStandaloneUpscopePart1(): void {
  it("parks on review upscope=yes, rewrites the class to bigger, and the next launch runs the architect", async () => {
    const goal = makeGoal({ classYaml: "class: task\nslug: solo\n" });
    try {
      const scope1 = await parksReviewUpscopeYesRewritesClassPart1(
        goal,
        readClass,
      );
      await parksReviewUpscopeYesRewritesClassPart2(goal, scope1);
    } finally {
      cleanupGoal(goal);
    }
  }, 90_000);
}

function registerGateFlakeReRunPart2(): void {
  it("sends a still-red gate to the existing fix route with no gate-flake record", async () => {
    const green = makeProbe();
    const red = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "unit", command: redCommand(red) },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const after = await driveAction(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      expect(after.phase).toBe("implement");
      expect(after.round).toBe(1);

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(false);
      expect(typeof checks[0]!.tree).toBe("string");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "gate-flake"),
      ).toHaveLength(0);
      expect(runs(red)).toBe(2);
      expect(runs(green)).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(red);
    }
  }, 60_000);
}

function registerGateFlakeReRunPart3(): void {
  it("names a red test above the last 25 lines in the fix turn's prompt", async () => {
    const red = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: longRedCommand(red) }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      let fixPrompt = "";
      harness.script((req, ctx) => {
        fixPrompt = req.prompt;
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const after = await driveAction(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      expect(after.phase).toBe("implement");
      expect(after.gateFix).toBe(true);

      const records = await runtime.store.listRecords();
      const redRun = records.find(
        (r) => r.slug === "task" && r.step === "checks" && r.ok === false,
      );
      const output = redRun?.checks?.[0]?.output ?? "";
      const lines = output.split("\n");
      expect(lines.length).toBeGreaterThan(25);
      // The report fits a `tail -25` without the line that names the failure.
      expect(lines.slice(-25).join("\n")).not.toContain("hidden red");

      await driveAction(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      expect(harness.calls).toHaveLength(2);
      expect(fixPrompt).toContain("### unit: exit 1");
      expect(fixPrompt).toContain("(fail) suite > hidden red");
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(red);
    }
  }, 60_000);
}

function registerGateFlakeReRunPart4(): void {
  it("keeps infra reds off the gate-flake re-run and routes to infra adjudication", async () => {
    const probe = makeProbe();
    const { repo, goalDir, goal } = setupFlowRepo({
      gates: [{ id: "typecheck", command: infraCommand(probe) }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(
            infraPath(goalDir),
            "gates: []\nincident:\n  verdict: infra\n  handling: stop\n",
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: "infra stop" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "infra" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("a", { scope: ["a.txt"] });
      await writeTask(runtime, file);
      await driveAction(runtime, file, { kind: "checks", slug: "a" });

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "a" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(false);
      expect(checks[0]!.checks?.[0]?.details).toMatchObject({ kind: "infra" });
      expect(
        records.filter((r) => r.slug === "a" && r.step === "gate-flake"),
      ).toHaveLength(0);
      expect(harness.calls).toHaveLength(1);
      expect(runs(probe)).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(probe);
    }
  }, 60_000);
}

function registerGateFlakeReRunPart5(): void {
  it("re-runs once per tree: a repeat checks on the same tree skips it, a new commit re-arms it", async () => {
    const green = makeProbe();
    const red = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "unit", command: redCommand(red) },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const file = task("a", { scope: ["a.txt"] });
      await writeTask(runtime, file);

      await driveAction(runtime, file, { kind: "checks", slug: "a" });
      expect(runs(red)).toBe(2);
      expect(runs(green)).toBe(1);

      await driveAction(runtime, file, { kind: "checks", slug: "a" });
      expect(runs(red)).toBe(3);
      expect(runs(green)).toBe(2);

      const ensured = await ensureTaskWorktree(runtime, file);
      expect(ensured.error).toBeUndefined();
      fs.writeFileSync(path.join(ensured.path!, "a.txt"), "a\n", "utf8");
      await commitAll(runtime.repo, ensured.path!, "factory: test change");

      await driveAction(runtime, file, { kind: "checks", slug: "a" });
      expect(runs(red)).toBe(5);
      expect(runs(green)).toBe(3);

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "a" && r.step === "checks",
      );
      expect(checks).toHaveLength(3);
      expect(checks[0]!.tree).toBe(checks[1]!.tree);
      expect(checks[2]!.tree).not.toBe(checks[0]!.tree);
      expect(
        records.filter((r) => r.slug === "a" && r.step === "gate-flake"),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(red);
    }
  }, 60_000);
}

describe("gate flake re-run", () => {
  registerGateFlakeReRunPart2();

  registerGateFlakeReRunPart3();

  registerGateFlakeReRunPart4();

  registerGateFlakeReRunPart5();
});

describe("standalone upscope", () => {
  registerStandaloneUpscopePart1();
});
