// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { commitAll } from "../../src/core/git/commit.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type {
  Action,
  KernelRuntime,
  TaskFile,
  TaskState,
} from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
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

describe("delivery guard", () => {
  it("parks an implement turn that delivers no outcome, naming the outcome", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "work\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      scriptStallLeave(harness, ["task"]);
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("no outcome after repair");
      expect(harness.calls).toHaveLength(3);
      expect(harness.calls[1]!.prompt).toContain(
        "You are the implementer. Your turn did not deliver its outcome.",
      );
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a review that delivers no verdict, naming the verdict", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no verdict yet" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "still no verdict" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("verdict is required");
      expect(harness.calls).toHaveLength(4);
      expect(harness.calls[2]!.prompt).toContain(
        "You are the reviewer. Your turn did not deliver its verdict.",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges after the second repair delivers the implement outcome", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "v1 recovered" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt"], repairTurns: 2 }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(4);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      const implement = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      expect(implement.attempts).toHaveLength(3);
      expect(state.tasks.task!.turns).toBe(4);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("honours a task repairTurns override of zero", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "work\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt"], repairTurns: 0 }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(2);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("no outcome");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("gate flake re-run", () => {
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

  /** Red once with a bun-style failure, then green on the same tree. */
  function flakyCommand(probe: GateProbe): string {
    return (
      `echo run >> ${quote(probe.count)}; ` +
      `if [ -f ${quote(probe.marker)} ]; then exit 0; ` +
      `else touch ${quote(probe.marker)}; ` +
      `printf 'src/a.test.ts:\\n(fail) suite > flaky test\\n'; exit 1; fi`
    );
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

  /**
   * A bun-style red report longer than the `tail -25` the implementer used
   * live: the `(fail)` line sits above 30 detail lines, so a truncated run
   * loses the only line that names the failure.
   */
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

  it("re-runs a red gate once and merges with a gate-flake record when the re-run is green", async () => {
    const green = makeProbe();
    const flaky = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "flaky", command: flakyCommand(flaky) },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      // No fix turn: one implement turn plus its review.
      expect(harness.calls).toHaveLength(2);

      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(true);
      expect(typeof checks[0]!.tree).toBe("string");

      const flakes = records.filter(
        (r) => r.slug === "task" && r.step === "gate-flake",
      );
      expect(flakes).toHaveLength(1);
      expect(flakes[0]!.cause).toContain("flaky");
      expect(flakes[0]!.cause).toContain("src/a.test.ts");
      expect(flakes[0]!.cause).toContain("flaky test");

      // Only the red gate re-ran, and the merge skipped its gates on the
      // already-judged tree: flaky ran first + re-run, green ran checks.
      expect(runs(flaky)).toBe(2);
      expect(runs(green)).toBe(1);

      await writeMetrics(runtime.store, {
        iteration: 1,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await runtime.store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations[0]!.incidents.gateFlakes).toBe(1);
      expect(metrics.totals.incidents.gateFlakes).toBe(1);

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("- gate flakes: 1");
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(flaky);
    }
  }, 60_000);

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

  it("keeps infra reds on their own path without a re-run", async () => {
    const probe = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "typecheck", command: infraCommand(probe) }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
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
      expect(runs(probe)).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(probe);
    }
  }, 60_000);

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
});

describe("standalone upscope", () => {
  function writeClass(goalDir: string, text: string): void {
    fs.writeFileSync(path.join(goalDir, "class.yaml"), text, "utf8");
  }

  function readClass(goalDir: string): unknown {
    return yaml.parse(
      fs.readFileSync(path.join(goalDir, "class.yaml"), "utf8"),
    );
  }

  it("parks on review upscope=yes, rewrites the class to bigger, and the next launch runs the architect", async () => {
    const goal = makeGoal({ classYaml: "class: task\nslug: solo\n" });
    try {
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
      expect(escalated.tasks.solo!.status).toBe("parked");
      expect(escalated.tasks.solo!.cause).toMatch(/^upscope: /);
      expect(escalated.goal).toBe("active");
      expect(escalated.terminal).toBe(false);
      expect(readClass(goal.goalDir)).toEqual({ class: "bigger" });
      expect(
        (await store.listRecords()).filter((r) => r.step === "front-stop"),
      ).toEqual([]);

      // The next launch reads the bigger class and runs the architect.
      const second = new FakeHarness({ id: "fake" });
      scriptDigest(second, goal.goalDir, 2);
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
      expect(first.calls).toHaveLength(3);
      expect(second.calls).toHaveLength(2);
    } finally {
      cleanupGoal(goal);
    }
  }, 90_000);

  it("keeps the normal verdict path on review upscope=no", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "looks right",
            verdict: "approve",
            upscope: "no",
          }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writeClass(goalDir, "class: task\nslug: solo\n");
      await writeTask(runtime, task("solo", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.solo!.status).toBe("merged");
      expect(readClass(goalDir)).toEqual({ class: "task", slug: "solo" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("never escalates tasks inside an architect plan", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "hallucinated escalation",
            verdict: "approve",
            upscope: "yes",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["planned"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("planned", { scope: ["task.txt"] });
      await writeTask(runtime, file);

      const vars = promptVars(
        runtime,
        file,
        "/worktrees/demo-tasks/planned",
        [],
        1,
        runtime.configs.process.flows["implement-review"]!,
      );
      expect(vars.upscope_ask).toBe("");

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.planned!.status).toBe("parked");
      expect(state.tasks.planned!.cause).toMatch(/^upscope: /);
      expect(fs.existsSync(path.join(goalDir, "class.yaml"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
