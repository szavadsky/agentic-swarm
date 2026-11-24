import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { task, causeText } from "./helpers.js";
import {
  cleanup as cleanupGoal,
  expectLaunch,
  makeGoal,
  scriptDigest,
  simpleTask,
  stateOf,
  writeTask as writeGoalTask,
} from "./e2e-helpers.js";
import { workCalls } from "./fake-defaults.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function writeClass(goalDir: string, text: string): void {
  fs.writeFileSync(path.join(goalDir, "class.yaml"), text, "utf8");
}

function readClass(goalDir: string): unknown {
  return yaml.parse(fs.readFileSync(path.join(goalDir, "class.yaml"), "utf8"));
}

function registerStandaloneUpscopePart2(): void {
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
}

function registerStandaloneUpscopePart3(): void {
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
      expect(causeText(state.tasks.planned!.cause)).toMatch(/^upscope: /);
      expect(causeText(state.tasks.planned!.cause)).toContain(
        "hallucinated escalation",
      );
      expect(fs.existsSync(path.join(goalDir, "class.yaml"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStandaloneUpscopePart4(): void {
  it("records why and parks without a rewrite when class.yaml is missing", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(
          outcome({
            status: "upscope",
            summary: "needs architecture input",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["solo"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("solo", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.solo!.status).toBe("parked");
      expect(causeText(state.tasks.solo!.cause)).toMatch(/^upscope: /);
      expect(causeText(state.tasks.solo!.cause)).toContain(
        "no bigger class to escalate to",
      );
      expect(causeText(state.tasks.solo!.cause)).toContain(
        "needs architecture input",
      );
      expect(fs.existsSync(path.join(goalDir, "class.yaml"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStandaloneUpscopePart5(): void {
  it("refuses dispatch when class.yaml is invalid", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(
          outcome({
            status: "upscope",
            summary: "needs architecture input",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["solo"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("solo", { scope: ["task.txt"] }));

      // An invalid class.yaml throws at admission, before any turn or
      // outcome settle: dispatch's firewall, not parkUpscope.
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: nope\n",
        "utf8",
      );

      await expect(runDispatch(runtime, { iteration: 1 })).rejects.toThrow(
        "class.yaml is invalid",
      );
      expect(fs.readFileSync(path.join(goalDir, "class.yaml"), "utf8")).toBe(
        "class: nope\n",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStandaloneUpscopePart6(): void {
  it("does not relaunch when the task is already in the bigger class", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(
          outcome({
            status: "upscope",
            summary: "needs architecture input",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["planned"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writeClass(goalDir, "class: bigger\n");
      await writeTask(runtime, task("planned", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.planned!.status).toBe("parked");
      expect(causeText(state.tasks.planned!.cause)).toMatch(/^upscope: /);
      expect(readClass(goalDir)).toEqual({ class: "bigger" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("standalone upscope", () => {
  registerStandaloneUpscopePart2();

  registerStandaloneUpscopePart3();

  registerStandaloneUpscopePart4();

  registerStandaloneUpscopePart5();

  registerStandaloneUpscopePart6();
});

async function parksImplementerUpscopeRewritesClassPart1(
  goal: ReturnType<typeof makeGoal>,
) {
  writeGoalTask(goal.goalDir, simpleTask("solo", "solo.txt"));
  const first = new FakeHarness({ id: "fake" });
  let implementerPrompt = "";
  first.script((req, ctx) => {
    implementerPrompt = req.prompt;
    fs.writeFileSync(path.join(req.cwd!, "solo.txt"), "v1\n", "utf8");
    ctx.writeOutcome(
      outcome({
        status: "upscope",
        summary: "needs an architect: two services, not one",
      }),
    );
    return fakeTurnResult(req);
  });
  scriptStallLeave(first, ["solo"]);

  // Iteration 1 escalates through the launch: the class rewrite skips the
  // front stop, so the goal stays active instead of blocking on the park.
  await expectLaunch(3, goal.repo, first, 1);
  expect(implementerPrompt.length).toBeGreaterThan(0);

  const store = createFolderStore(goal.goalDir, undefined, {});
  const escalated = await stateOf(goal.goalDir);
  expect(escalated.tasks.solo!.status).toBe("parked");
  expect(causeText(escalated.tasks.solo!.cause)).toMatch(/^upscope: /);
  expect(escalated.goal).toBe("active");
  expect(escalated.terminal).toBe(false);
  expect(readClass(goal.goalDir)).toEqual({ class: "bigger" });
  expect(
    (await store.listRecords()).filter((r) => r.step === "front-stop"),
  ).toEqual([]);

  // The task's branch is kept: the implementer's commit survives the park.
  const taskBranch = goal.repo
    .git(["rev-parse", "--verify", "factory-task/demo/solo"])
    .stdout.trim();
  expect(taskBranch.length).toBeGreaterThan(0);

  // The next launch reads the bigger class and runs the architect.
  const second = new FakeHarness({ id: "fake" });
  scriptDigest(second, goal.goalDir, 2);

  return { first, store, second };
}

async function parksImplementerUpscopeRewritesClassPart2(
  goal: ReturnType<typeof makeGoal>,
  scope: Awaited<ReturnType<typeof parksImplementerUpscopeRewritesClassPart1>>,
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
  // One implement turn and the stall PM: the review never runs.
  expect(workCalls(first)).toHaveLength(2);
  // digest, the scout, the pack preparer and the architect: iteration 2
  // prepares its index from the script data before the consult.
  expect(second.calls).toHaveLength(4);
}

function registerStandaloneUpscopePart7(): void {
  it("parks on implementer status=upscope, rewrites the class to bigger, and the next launch runs the architect", async () => {
    const goal = makeGoal({ classYaml: "class: task\nslug: solo\n" });
    try {
      const scope1 = await parksImplementerUpscopeRewritesClassPart1(goal);
      await parksImplementerUpscopeRewritesClassPart2(goal, scope1);
    } finally {
      cleanupGoal(goal);
    }
  }, 90_000);
}

describe("standalone implementer upscope", () => {
  registerStandaloneUpscopePart7();
});
