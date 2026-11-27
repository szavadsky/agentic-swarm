import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import type { Action } from "../../src/kernel/types.js";
import { integrationHead } from "../../src/kernel/worktree.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptDecider,
  setupFlowRepo,
  scriptStallLeave,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

// One coarse gate, like the self repo's former single `package` gate: it is red
// for whichever file is present and names the reason on stdout.
const GATE =
  'if [ -e task-broken.txt ]; then echo "reason Y: task-broken.txt"; exit 1; fi; ' +
  'if [ -e base-broken.txt ]; then echo "reason X: base-broken.txt"; exit 1; fi';

function runGate(cwd: string, gate = GATE): { code: number; out: string } {
  const p = Bun.spawnSync(["bash", "-c", gate], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: p.exitCode ?? -1,
    out: `${p.stdout.toString()}${p.stderr.toString()}`.trim(),
  };
}

describe("E5 inverted — inherited red is matched per failing signature", () => {
  it("fails a merge whose new failure hides behind an inherited red gate", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await failsMergeWhoseNewFailureHidesPart1(repo, goal);
      const scope2 = await failsMergeWhoseNewFailureHidesPart2(
        repo,
        checkout,
        scope1,
      );
      await failsMergeWhoseNewFailureHidesPart3(repo, scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("fails a task whose new failure hides behind an inherited red gate", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      const scope1 = await failsTaskWhoseNewFailureHidesPart1(repo, goal);
      const scope2 = await failsTaskWhoseNewFailureHidesPart2(scope1);
      await failsTaskWhoseNewFailureHidesPart3(repo, scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges a task that fixes the inherited red", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      const scope1 = await mergesTaskFixesInheritedRedPart1(repo, goal);
      await mergesTaskFixesInheritedRedPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("drives three differing red fixes and parks on the third", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      const scope1 = await drivesThreeDifferingRedFixesParksPart1(repo, goal);
      await drivesThreeDifferingRedFixesParksPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

async function mergesTaskFixesInheritedRedPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  repo.writeFile("base-broken.txt", "X\n");
  repo.commit("base broken for reason X");

  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.rmSync(path.join(req.cwd!, "base-broken.txt"));
    ctx.writeOutcome(outcome({ summary: "removed the broken file" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const head = await integrationHead(runtime);
  const baseRun = runGate(runtime.paths.goalCheckout);
  await runtime.store.appendRecord(
    {
      iteration: 0,
      step: "baseline",
      round: 1,
      actor: "script",
      base: head,
    },
    {
      ok: false,
      checks: [
        {
          name: "package",
          ok: false,
          summary: `exit ${baseRun.code}`,
          output: baseRun.out,
          fingerprint: "red-X",
        },
      ],
    },
  );
  await writeTask(runtime, task("task", { scope: ["base-broken.txt"] }));

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();

  return { runtime, records };
}

async function mergesTaskFixesInheritedRedPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof mergesTaskFixesInheritedRedPart1>>,
) {
  const { runtime, records } = scope;
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  const mergeChecks = records.filter(
    (r) => r.slug === "task" && r.step === "merge-checks",
  );
  expect(state.tasks.task!.status).toBe("merged");
  expect(
    records.filter((r) => r.slug === "task" && r.step === "park"),
  ).toHaveLength(0);
  expect(mergeChecks).toHaveLength(0);
  const merges = records.filter(
    (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
  );
  expect(merges).toHaveLength(1);
  expect(causeText(merges[0]!.cause)).toContain("skipped merge-checks");
  expect(
    repo.git(["show", "factory/demo:base-broken.txt"], { allowFail: true })
      .code,
  ).not.toBe(0);
}

async function drivesThreeDifferingRedFixesParksPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const promptsSeen: string[] = [];

  // Each turn adds a file but keeps task-broken.txt, so every red repeats.
  const turns = [
    ["task-broken.txt", "Y\n", "feature broken implemented"],
    ["fix-1.txt", "fix 1\n", "fix 1 attempt"],
    ["fix-2.txt", "fix 2\n", "fix 2 attempt"],
    ["fix-3.txt", "fix 3\n", "fix 3 attempt"],
  ] as const;
  for (const [file, text, summary] of turns) {
    harness.script((req, ctx) => {
      promptsSeen.push(req.prompt ?? "");
      fs.writeFileSync(path.join(req.cwd!, file), text, "utf8");
      ctx.writeOutcome(outcome({ summary }));
      return fakeTurnResult(req);
    });
  }
  scriptDecider(harness, {
    summary: "the task broke the package gate and the fixes did not restore it",
    verdict: "reject",
  });
  scriptStallLeave(harness, ["task"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("task", {
      scope: ["task-broken.txt", "fix-1.txt", "fix-2.txt", "fix-3.txt"],
    }),
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );

  return { promptsSeen, records, runtime, state };
}

async function drivesThreeDifferingRedFixesParksPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof drivesThreeDifferingRedFixesParksPart1>>,
) {
  const { state, promptsSeen, records, runtime } = scope;
  const lastCallText = runtime.prompts.render("gate-last-call", {}).trim();
  expect(state.tasks.task!.status).toBe("parked");
  expect(state.tasks.task!.cause?.kind).toBe("gates");
  expect(formatCause(state.tasks.task!.cause!)).toContain("package");

  // Verify harness was called 4 times (1 initial + 3 fixes)
  expect(promptsSeen).toHaveLength(4);

  // Fix 1 and 2 prompts do NOT have last call text
  expect(promptsSeen[1]).not.toContain(lastCallText);
  expect(promptsSeen[2]).not.toContain(lastCallText);

  // Fix 3 (last call) prompt MUST have last call text
  expect(promptsSeen[3]).toContain(lastCallText);

  // Verify checks ran 4 times and all 4 failed
  const checks = records.filter(
    (r) => r.slug === "task" && r.step === "checks",
  );
  expect(checks).toHaveLength(4);
  expect(checks.every((r) => r.ok === false)).toBe(true);

  // Branch was kept (branch exists)
  const head = repo.git(["rev-parse", "factory-task/demo/task"], {
    allowFail: true,
  });
  expect(head.code).toBe(0);
}

async function failsTaskWhoseNewFailureHidesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  repo.writeFile("base-broken.txt", "X\n");
  repo.commit("base broken for reason X");

  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task-broken.txt"), "Y\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "feature implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(req.cwd!, "fix-attempt.txt"),
      "still red\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "fix attempt" }));
    return fakeTurnResult(req);
  });
  // A fix that changes nothing leaves the same red: the checks that follow
  // decide, and the inherited-red rule parks it as a deterministic red.
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no change to make" }));
    return fakeTurnResult(req);
  });
  scriptDecider(harness, { summary: "package red", verdict: "reject" });
  scriptStallLeave(harness, ["task"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const head = await integrationHead(runtime);
  const baseRun = runGate(runtime.paths.goalCheckout);
  expect(baseRun.code).not.toBe(0);
  expect(baseRun.out).toContain("reason X");

  return { runtime, head, baseRun };
}

async function failsTaskWhoseNewFailureHidesPart2(
  scope: Awaited<ReturnType<typeof failsTaskWhoseNewFailureHidesPart1>>,
) {
  const { runtime, head, baseRun } = scope;
  await runtime.store.appendRecord(
    {
      iteration: 0,
      step: "baseline",
      round: 1,
      actor: "script",
      base: head,
    },
    {
      ok: false,
      checks: [
        {
          name: "package",
          ok: false,
          summary: `exit ${baseRun.code}`,
          output: baseRun.out,
          fingerprint: "red-X",
        },
      ],
    },
  );
  await writeTask(
    runtime,
    task("task", { scope: ["task-broken.txt", "fix-attempt.txt"] }),
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  const checks = records.filter(
    (r) => r.slug === "task" && r.step === "checks",
  );

  expect(state.tasks.task!.status).toBe("parked");
  expect(causeText(state.tasks.task!.cause)).toContain("package red");
  // Reason Y is absent from base, so the first branch check is the task's own.
  expect(checks).toHaveLength(3);
  expect(checks.every((r) => r.ok === false)).toBe(true);

  return { ...scope, records, checks };
}

async function failsTaskWhoseNewFailureHidesPart3(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof failsTaskWhoseNewFailureHidesPart2>>,
) {
  const { checks, records } = scope;
  expect(checks[0]!.checks![0]!.name).toBe("package");
  expect(checks[0]!.checks![0]!.output).toContain("reason Y");
  expect(
    records.filter((r) => r.slug === "task" && r.step === "merge"),
  ).toHaveLength(0);
  expect(
    repo.git(["show", "factory/demo:task-broken.txt"], { allowFail: true })
      .code,
  ).not.toBe(0);
}

async function failsMergeWhoseNewFailureHidesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  repo.writeFile("base-broken.txt", "X\n");
  repo.commit("base broken for reason X");

  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "feature.txt"), "feature\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "feature implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "fix.txt"), "fix\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "gate fix attempt" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const head = await integrationHead(runtime);
  const baseRun = runGate(runtime.paths.goalCheckout, GATE);
  expect(baseRun.code).not.toBe(0);
  expect(baseRun.out).toContain("reason X");

  return { harness, runtime, head, baseRun };
}

async function failsMergeWhoseNewFailureHidesPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  checkout: string,
  scope: Awaited<ReturnType<typeof failsMergeWhoseNewFailureHidesPart1>>,
) {
  const { runtime, head, baseRun } = scope;
  await runtime.store.appendRecord(
    {
      iteration: 0,
      step: "baseline",
      round: 1,
      actor: "script",
      base: head,
    },
    {
      ok: false,
      checks: [
        {
          name: "package",
          ok: false,
          summary: "exit 1",
          output: baseRun.out,
          fingerprint: "red-X",
        },
      ],
    },
  );
  const file = task("task", { scope: ["feature.txt", "fix.txt"] });
  await writeTask(runtime, file);
  const drive = async (action: Action): Promise<void> => {
    const before = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    await executeTaskAction(runtime, file, action, 1, before.tasks[file.slug]!);
  };
  await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
  await drive({ kind: "step", slug: "task", step: "review", round: 1 });
  // A concurrent landing adds the new failure after the branch checks ran
  // green on the inherited red alone: the merged tree differs, so the
  // merge gates run and see reason Y hiding behind the red gate.
  fs.writeFileSync(path.join(checkout, "task-broken.txt"), "Y\n", "utf8");
  repo.git(["add", "task-broken.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent breakage"], { cwd: checkout });

  return { ...scope, drive };
}

async function failsMergeWhoseNewFailureHidesPart3(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof failsMergeWhoseNewFailureHidesPart2>>,
) {
  const { drive, harness, runtime } = scope;
  await drive({ kind: "merge", slug: "task" });
  await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
  await drive({ kind: "merge", slug: "task" });
  // The gate fix is spent; the decider leaves the red merged result to the steward.
  scriptDecider(harness, {
    summary: "the merged result is red; the steward owns the repair",
    verdict: "reject",
  });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "steward found no repair" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "steward" }) },
  );
  scriptStallLeave(harness, ["task"]);
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  const merges = records.filter((r) => r.slug === "task" && r.step === "merge");
  const mergeChecks = records.filter(
    (r) => r.slug === "task" && r.step === "merge-checks",
  );

  expect(state.tasks.task!.status).toBe("parked");
  expect(state.tasks.task!.cause?.kind).toBe("gates");
  expect(formatCause(state.tasks.task!.cause!)).toContain("package");
  expect(merges.map((r) => r.ok)).toEqual([false, false]);
  expect(mergeChecks.map((r) => r.ok)).toEqual([false, false]);
  expect(mergeChecks[0]!.checks![0]!.output).toContain("reason Y");
  expect(harness.calls.length).toBe(6);
  expect(
    repo.git(["show", "factory/demo:feature.txt"], { allowFail: true }).code,
  ).not.toBe(0);
}
