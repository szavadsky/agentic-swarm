import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

async function containsTurnTriesRewriteSealedPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const sealed = await runtime.store.startRecord({
    iteration: 1,
    step: "review",
    round: 1,
    actor: "agent",
    slug: "other",
  });
  await sealed.finish({
    ok: true,
    outcome: outcome({ summary: "other approved", verdict: "approve" }),
  });
  const before = fs.readFileSync(sealed.outcomePath, "utf8");
  const probe: { writeError: NodeJS.ErrnoException | undefined } = {
    writeError: undefined,
  };

  harness.script(
    (req, ctx) => {
      // A resumed turn still holding the sealed record's stale path.
      try {
        fs.writeFileSync(
          sealed.outcomePath,
          "status: failed\nsummary: stale\n",
          "utf8",
        );
      } catch (err) {
        probe.writeError = err as NodeJS.ErrnoException;
      }
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "task", step: "implement" }) },
  );

  return { harness, runtime, sealed, before, probe };
}

async function containsTurnTriesRewriteSealedPart2(
  scope: Awaited<ReturnType<typeof containsTurnTriesRewriteSealedPart1>>,
) {
  const { harness, runtime, probe, sealed, before } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "task", step: "review" }) },
  );

  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  await runDispatch(runtime, { iteration: 1 });

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(probe.writeError?.code).toBe("EACCES");
  expect(fs.statSync(sealed.outcomePath).mode & 0o777).toBe(0o444);
  expect(fs.readFileSync(sealed.outcomePath, "utf8")).toBe(before);
  expect(state.tasks.task!.status).toBe("merged");
  expect(
    records.filter((r) => r.slug === "task" && r.step === "park"),
  ).toHaveLength(0);
  expect(records.filter((r) => r.step === "containment")).toHaveLength(0);
}

function registerAgentContainmentPart1(): void {
  it("parks a turn that writes outside its worktree and switches branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const checkout = goalCheckout(repo, goal);
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(checkout, "OUTSIDE.txt"), "rogue\n", "utf8");
        repo.git(["checkout", "-b", "rogue"], { cwd: req.cwd! });
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
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
      expect(causeText(state.tasks.task!.cause)).toContain("containment:");
      expect(causeText(state.tasks.task!.cause)).toContain(
        'not the task branch "factory-task/demo/task"',
      );
      expect(causeText(state.tasks.task!.cause)).toContain(
        "files changed outside the worktree",
      );
      expect(harness.calls.length).toBe(2);
      expect(records.filter((r) => r.step === "merge")).toHaveLength(0);
      expect(fs.existsSync(path.join(checkout, "OUTSIDE.txt"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart2(): void {
  it("accepts a turn contained to its worktree", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
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
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart3(): void {
  it("merges a contained turn when the operator commits in the main checkout mid-turn", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        repo.writeFile("operator.txt", "operator\n");
        repo.commit("operator edit");
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
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
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
      const incidents = records.filter(
        (r) => r.slug === "task" && r.step === "containment",
      );
      expect(incidents).toHaveLength(1);
      expect(causeText(incidents[0]!.cause)).toContain("HEAD moved in");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart4(): void {
  it("parks a turn that writes into the goal artifacts directory", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(goalDir, "plan.md"),
          "# Forged plan\n\n## intruder\n",
          "utf8",
        );
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "goal artifacts changed outside the worktree",
      );
      expect(causeText(state.tasks.task!.cause)).toContain("created plan.md");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(1);
      expect(records.filter((r) => r.step === "merge")).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart5(): void {
  it("parks a turn that writes a task file", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.appendFileSync(path.join(goalDir, "tasks/task.md"), "\n", "utf8");
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "goal artifacts changed outside the worktree",
      );
      expect(causeText(state.tasks.task!.cause)).toContain(
        "changed tasks/task.md",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart6(): void {
  it("contains a turn that tries to rewrite a sealed record", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await containsTurnTriesRewriteSealedPart1(repo, goal);
      await containsTurnTriesRewriteSealedPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart7(): void {
  it("parks a turn that forges a record directory", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        const forged = path.join(goalDir, "records/00099-i1-task-merge-r1");
        fs.mkdirSync(forged, { recursive: true });
        fs.writeFileSync(path.join(forged, "end.yaml"), "ok: true\n", "utf8");
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "goal artifacts changed outside the worktree",
      );
      expect(causeText(state.tasks.task!.cause)).toContain(
        "created records/00099-i1-task-merge-r1/end.yaml",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart8(): void {
  it("parks a turn that commits in the integration checkout", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const checkout = goalCheckout(repo, goal);
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        repo.git(["commit", "--allow-empty", "-m", "rogue"], { cwd: checkout });
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "commit on the integration checkout",
      );
      expect(causeText(state.tasks.task!.cause)).toContain(checkout);
      expect(records.filter((r) => r.step === "merge")).toHaveLength(0);
      expect(
        repo.git(["log", "-1", "--format=%s", "factory/demo"]).stdout.trim(),
      ).toBe("rogue");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart9(): void {
  it("parks a turn that moves the integration ref without checking it out", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        repo.writeFile("outside.txt", "outside\n");
        const commit = repo.commit("outside");
        repo.git(["update-ref", "refs/heads/factory/demo", commit]);
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "integration branch moved outside the merge queue",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("agent containment", () => {
  registerAgentContainmentPart1();

  registerAgentContainmentPart2();

  registerAgentContainmentPart3();

  registerAgentContainmentPart4();

  registerAgentContainmentPart5();

  registerAgentContainmentPart6();

  registerAgentContainmentPart7();

  registerAgentContainmentPart8();

  registerAgentContainmentPart9();
});
