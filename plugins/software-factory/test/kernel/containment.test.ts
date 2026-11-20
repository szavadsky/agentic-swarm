import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { writeYamlAtomic } from "../../src/core/records/io.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { appendFinish } from "../../src/kernel/record.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { sealRecord, unsealRecord } from "../../src/kernel/store.js";
import type { Action, KernelRuntime } from "../../src/kernel/types.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
} from "../../src/kernel/worktree.js";
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
import { formatCause } from "../../src/kernel/cause.js";

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
  registerAgentContainmentPart10();
  registerAgentContainmentPart11();
  registerAgentContainmentPart12();
  registerAgentContainmentPart13();
  registerAgentContainmentPart14();
  registerAgentContainmentPart15();
  registerAgentContainmentPart16();
  registerAgentContainmentPart17();
  registerAgentContainmentPart18();
  registerAgentContainmentPart19();
});

async function ignoresSiblingRecordOpensAcrossPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["task.txt"] });
  await writeTask(runtime, file);
  const ensured = await ensureTaskWorktree(runtime, file);

  // A sibling commit record that opens across the snapshot's record
  // read: stamped before the snapshot, its files land after. The read
  // misses it (filtered here; under load the directory read wins the
  // race), so the check must clear it by sequence, not by timestamp.
  const open = await runtime.store.startRecord({
    iteration: 1,
    step: "commit",
    round: 1,
    actor: "script",
    slug: "other",
    commit: "0".repeat(40),
  });
  const past = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(
    path.join(open.dir, "started.yaml"),
    yaml.stringify({ ...open.meta, startedAt: past }),
    "utf8",
  );
  const filteredStore = Object.assign(
    Object.create(Object.getPrototypeOf(runtime.store)),
    runtime.store,
    {
      listRecords: async () => {
        const records = await runtime.store.listRecords();
        return records.filter((r) => r.seq !== open.meta.seq);
      },
    },
  );
  const snapshot = await containmentSnapshot(
    { ...runtime, store: filteredStore },
    ensured.path,
  );

  return { runtime, ensured, open, past, snapshot };
}

async function ignoresSiblingRecordOpensAcrossPart2(
  scope: Awaited<ReturnType<typeof ignoresSiblingRecordOpensAcrossPart1>>,
) {
  const { open, past, runtime, ensured, snapshot } = scope;
  fs.writeFileSync(
    path.join(open.dir, "end.yaml"),
    yaml.stringify({
      ok: true,
      commit: "0".repeat(40),
      tree: "1".repeat(40),
      endedAt: past,
    }),
    "utf8",
  );

  expect(
    await containmentViolation(runtime, ensured.path, ensured.branch, snapshot),
  ).toBeUndefined();
}

async function refusesMergeWhoseIntegrationHeadPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  checkout: string,
) {
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
  const file = task("task", { scope: ["task.txt"] });
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
  // Differ the merged tree so the merge gates run: without a concurrent
  // landing the merge would skip them on the already-judged tree.
  fs.writeFileSync(path.join(checkout, "other.txt"), "other\n", "utf8");
  repo.git(["add", "other.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent landing"], { cwd: checkout });
  await drive({ kind: "merge", slug: "task" });
  scriptStallLeave(harness, ["task"]);
  await runDispatch(runtime, { iteration: 1 });

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");

  return { records, state };
}

async function refusesMergeWhoseIntegrationHeadPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof refusesMergeWhoseIntegrationHeadPart1>>,
) {
  const { state, records } = scope;
  expect(state.tasks.task!.cause?.kind).toBe("merge-failed");
  expect(causeText(state.tasks.task!.cause)).toContain(
    "merge-failed: integration-moved: expected ",
  );
  const failed = records.filter(
    (r) => r.slug === "task" && r.step === "merge" && r.ok === false,
  );
  expect(failed).toHaveLength(1);
  expect(failed[0]!.cause?.kind).toBe("integration-moved");
  expect(causeText(failed[0]!.cause)).toMatch(/^integration-moved: expected /);
  expect(
    repo.git(["log", "-1", "--format=%s", "factory/demo"]).stdout.trim(),
  ).toBe("outside");
}

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

function scriptSpanningMergeImplementTurns(
  harness: FakeHarness,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  checkout: string,
  headWatch: { initial: string; observed: string },
): void {
  // Each turn is bound to its slug and step: alpha's implement waits on
  // beta's merge of the shared checkout, so a swapped handler would
  // write alpha.txt into the wrong worktree. The poll below is a latch
  // on that real merge, not turn ordering.
  harness.script(
    async (req, ctx) => {
      for (
        let i = 0;
        i < 500 && headWatch.observed === headWatch.initial;
        i += 1
      ) {
        const head = repo
          .git(["rev-parse", "HEAD"], { cwd: checkout })
          .stdout.trim();
        if (head !== headWatch.initial) headWatch.observed = head;
        else await new Promise((resolve) => setTimeout(resolve, 10));
      }
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "beta implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
}

function scriptSpanningMergeReviewTurns(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "beta approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "alpha approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );
}

function registerAgentContainmentPart10(): void {
  it("merges a task whose turn spans another task's merge of the shared checkout", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const checkout = goalCheckout(repo, goal);
      const headWatch = { initial: "", observed: "" };
      const harness = new FakeHarness({ id: "fake" });
      scriptSpanningMergeImplementTurns(harness, repo, checkout, headWatch);
      scriptSpanningMergeReviewTurns(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      headWatch.initial = repo
        .git(["rev-parse", "HEAD"], { cwd: checkout })
        .stdout.trim();
      headWatch.observed = headWatch.initial;
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(headWatch.observed).not.toBe(headWatch.initial);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");
      expect(records.filter((r) => r.step === "containment")).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart11(): void {
  it("ignores the operator mailbox and a concurrent PM turn's writes", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const ensured = await ensureTaskWorktree(runtime, file);
      const snapshot = await containmentSnapshot(runtime, ensured.path);

      // A steer arrives while the turn runs and a PM turn structures it before
      // the turn settles. The plan, task file and hold are the PM's writes.
      fs.writeFileSync(
        path.join(goalDir, "mailbox/inbox/s1.md"),
        "steer\n",
        "utf8",
      );
      await runtime.store.appendRecord(
        { iteration: 1, step: "pm", round: 1, actor: "agent" },
        { ok: true },
      );
      fs.writeFileSync(
        path.join(goalDir, "plan.md"),
        "# Plan\n\n## other\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "task.md"),
        "# the PM rewrote this\n",
        "utf8",
      );
      fs.mkdirSync(path.join(goalDir, "mailbox/holds"), { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "mailbox/holds/s1.yaml"),
        "slugs: []\n",
        "utf8",
      );

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      expect(fs.existsSync(path.join(goalDir, "mailbox/inbox/s1.md"))).toBe(
        true,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart12(): void {
  it("ignores a sealed record the kernel reopens and rewrites", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const ensured = await ensureTaskWorktree(runtime, file);
      const sealed = await runtime.store.startRecord({
        iteration: 1,
        step: "checks",
        round: 1,
        actor: "script",
        slug: "task",
      });
      await sealed.finish({
        ok: true,
        outcome: outcome({ summary: "gates green" }),
      });
      const snapshot = await containmentSnapshot(runtime, ensured.path);

      // A kernel-owned rewrite reopens the sealed record and seals it again.
      const rewritten = outcome({ summary: "gates green after a rewrite" });
      await unsealRecord(sealed.dir);
      await writeYamlAtomic(sealed.outcomePath, rewritten);
      await sealRecord(sealed.dir);

      expect(fs.statSync(sealed.outcomePath).mode & 0o777).toBe(0o444);
      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      expect((await runtime.store.listRecords())[0]!.outcome).toEqual(
        rewritten,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart13(): void {
  it("ignores a record that closes after the turn started", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const ensured = await ensureTaskWorktree(runtime, file);

      const open = await runtime.store.startRecord({
        iteration: 1,
        step: "merge",
        round: 1,
        actor: "script",
        slug: "other",
      });
      const snapshot = await containmentSnapshot(runtime, ensured.path);
      await open.finish({ ok: true });

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart14(): void {
  it("ignores another spike's finish landing inside a turn's window", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const running = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, running);
      const ensured = await ensureTaskWorktree(runtime, running);
      const probe = task("probe", {
        kind: "spike",
        flow: "spike",
        scope: ["spike area"],
      });
      await writeTask(runtime, probe);
      const probeTree = await ensureTaskWorktree(runtime, probe);
      const snapshot = await containmentSnapshot(runtime, ensured.path);

      // A sibling spike commits its report and finishes while this turn runs.
      const report = "# Finding\nOne copy.\n";
      const reportFile = path.join(probeTree.path, spikeReportPath("probe"));
      fs.mkdirSync(path.dirname(reportFile), { recursive: true });
      fs.writeFileSync(reportFile, report, "utf8");
      repo.git(["add", "-A"], { cwd: probeTree.path });
      repo.git(["commit", "-m", "spike report"], { cwd: probeTree.path });
      const commit = repo
        .git(["rev-parse", "HEAD"], { cwd: probeTree.path })
        .stdout.trim();
      await appendFinish(
        runtime.store,
        { iteration: 1, slug: "probe", round: 1 },
        probe,
        commit,
      );

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      const finish = (await runtime.store.listRecords()).find(
        (r) => r.slug === "probe" && r.step === "finish",
      )!;
      expect(finish.report).toBe(`${commit}:${spikeReportPath("probe")}`);
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "finish/probe/report.md"),
        ),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart15(): void {
  it("ignores a sibling kernel write under the goal dir during a turn", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      let runtime!: KernelRuntime;
      harness.script(async (req, ctx) => {
        // 00728: a sibling kernel step wrote finish/<slug>/report.md while a
        // qa turn ran, and containment blamed the turn. The kernel's writer
        // declares the path; a declared write is never the turn's.
        await runtime.store.writeFile(
          "finish/probe/report.md",
          "# Finding\nOne copy.\n",
        );
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "finish/probe/report.md"),
        ),
      ).toBe(true);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart16(): void {
  it("parks a turn whose undeclared write to the same goal path lands during the turn", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.mkdirSync(path.join(goalDir, "finish/probe"), { recursive: true });
        fs.writeFileSync(
          path.join(goalDir, "finish/probe/report.md"),
          "# Forged\n",
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
      expect(causeText(state.tasks.task!.cause)).toContain(
        "created finish/probe/report.md",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart17(): void {
  it("parks a turn that rewrites a goal file the kernel wrote before the turn", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(goalDir, "iterations/1/summary.md"),
          "# Forged summary\n",
          "utf8",
        );
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeFile(
        "iterations/1/summary.md",
        "# Summary\nengine wrote this\n",
      );
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
        "changed iterations/1/summary.md",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

async function openSiblingMergeBeforeTurn(runtime: KernelRuntime) {
  // A sibling merge that opened before the turn. Its close is stamped
  // before the snapshot but lands between the snapshot's artifact walk
  // and its record read: the dispatch interleaving where a script merge
  // and an agent turn start in the same poll round.
  const open = await runtime.store.startRecord({
    iteration: 1,
    step: "merge",
    round: 1,
    actor: "script",
    slug: "other",
    commit: "0".repeat(40),
  });
  const past = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(
    path.join(open.dir, "started.yaml"),
    yaml.stringify({ ...open.meta, startedAt: past }),
    "utf8",
  );
  return { open, past };
}

async function startGatedContainmentSnapshot(
  runtime: KernelRuntime,
  worktree: string,
) {
  // Gate the snapshot's record read so the close lands after the walk
  // but before the read, deterministically.
  let entered = false;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gatedStore = Object.assign(
    Object.create(Object.getPrototypeOf(runtime.store)),
    runtime.store,
    {
      listRecords: async () => {
        entered = true;
        await released;
        return runtime.store.listRecords();
      },
    },
  );
  const snapshot = containmentSnapshot(
    { ...runtime, store: gatedStore },
    worktree,
  );
  const deadline = Date.now() + 30_000;
  while (!entered && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!entered) throw new Error("snapshot never reached its record read");
  return { snapshot, release: () => release() };
}

function closeSiblingMergeRecord(open: { dir: string }, past: string): void {
  fs.writeFileSync(
    path.join(open.dir, "end.yaml"),
    yaml.stringify({
      ok: true,
      commit: "0".repeat(40),
      cause: "recovered merge after crash",
      endedAt: past,
    }),
    "utf8",
  );
}

function registerAgentContainmentPart18(): void {
  it("ignores a sibling record whose close lands between the snapshot walk and its record read", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const ensured = await ensureTaskWorktree(runtime, file);

      const { open, past } = await openSiblingMergeBeforeTurn(runtime);
      const { snapshot, release } = await startGatedContainmentSnapshot(
        runtime,
        ensured.path,
      );
      closeSiblingMergeRecord(open, past);
      release();
      const walked = await snapshot;

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          walked,
        ),
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart19(): void {
  it("ignores a sibling record that opens across the snapshot's record read", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await ignoresSiblingRecordOpensAcrossPart1(repo, goal);
      await ignoresSiblingRecordOpensAcrossPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses a merge whose integration head moved during the gate", async () => {
    const gate =
      'if [ "$(git rev-parse --abbrev-ref HEAD)" = "HEAD" ]; then ' +
      "git -C ../demo commit --allow-empty -m outside; fi";
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "detached", command: gate }],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await refusesMergeWhoseIntegrationHeadPart1(
        repo,
        goal,
        checkout,
      );
      await refusesMergeWhoseIntegrationHeadPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
