import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { cause, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { writeHold } from "./steer-helpers.js";

const PLAN = "# Plan\n\n## alpha\nDo alpha.\n";

/** The plan a mid-run dispatch starts from before the steer adds a task. */
const MIDRUN_PLAN = "# Plan\n\nNo tasks filed yet.\n";

/** Fallback work turns: implement writes `<slug>.txt` (and the spike report for `probe`), review approves. */
function scriptWork(harness: FakeHarness): void {
  const handler: FakeTurnHandler = (req, ctx) => {
    const slug = path.basename(req.cwd!);
    if (req.prompt.startsWith("You review")) {
      ctx.writeOutcome(
        outcome({ summary: `${slug} approved`, verdict: "approve" }),
      );
    } else {
      fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
      if (slug === "probe") {
        const report = path.join(req.cwd!, spikeReportPath("probe"));
        fs.mkdirSync(path.dirname(report), { recursive: true });
        fs.writeFileSync(report, "# Finding\n\nIt works.\n", "utf8");
      }
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
    }
    return fakeTurnResult(req);
  };
  for (const step of ["implement", "review"]) {
    harness.script(handler, { when: whenTurn({ step }), fallback: true });
  }
}

function stepsCalled(harness: FakeHarness, step: string): number {
  return harness.calls.filter((call) => fakeTurnIdentity(call).step === step)
    .length;
}

async function countsOnlyImplementQAReviewTurnsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptWork(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(
    runtime,
    task("probe", { kind: "spike", flow: "spike", scope: ["probe.txt"] }),
  );
  // A pending task behind a missing dep keeps open work at exhaustion, so
  // the checker has something to judge.
  await writeTask(
    runtime,
    task("beta", { deps: ["ghost"], scope: ["beta.txt"] }),
  );

  const result = await runDispatch(runtime, { iteration: 1 });

  expect(result.reason).toBe("boundary");
  const records = await runtime.store.listRecords();
  const ran = (step: string, slug?: string) =>
    records.some(
      (r) => r.step === step && (slug === undefined || r.slug === slug),
    );
  // Script steps ran for both flows, and the plan checker took a turn.
  expect(ran("checks", "alpha")).toBe(true);
  expect(ran("merge", "alpha")).toBe(true);
  expect(ran("finish", "probe")).toBe(true);
  expect(stepsCalled(harness, "plancheck")).toBe(1);
  // alpha ran implement, QA and review; the spike ran implement and review.
  expect(
    records.filter(
      (r) =>
        r.actor === "agent" &&
        (r.step === "implement" || r.step === "qa" || r.step === "review"),
    ),
  ).toHaveLength(5);
  expect(result.taskTurnsStarted).toBe(5);
  // A spike's implement turn opens with the report commit: the kernel
  // hands the implementer prompt the task's report path.
  const probeTurn = harness.calls.find((call) => {
    const identity = fakeTurnIdentity(call);
    return identity.slug === "probe" && identity.step === "implement";
  });

  return { probeTurn };
}

async function countsOnlyImplementQAReviewTurnsPart2(
  scope: Awaited<ReturnType<typeof countsOnlyImplementQAReviewTurnsPart1>>,
) {
  const { probeTurn } = scope;
  expect(probeTurn?.prompt).toStartWith(
    "Commit the report at `.factory/spikes/probe.md` first, then refine it.\n",
  );
}

async function dispatchesTaskSteerPMTurnCreatedPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptWork(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  // Mid-run dispatch: the first architect flow already delivered a plan, so
  // the steer takes the PM's steer-routing turn.
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    MIDRUN_PLAN,
    "utf8",
  );
  await postSteer(runtime.store, "s1", "Add gamma.");
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "gamma.md"),
        [
          "---",
          "slug: gamma",
          "title: gamma",
          "flow: implement-review",
          "deps: []",
          "scope: [gamma.txt]",
          "source: 'steer: s1'",
          "---",
          "",
          "Add gamma.",
          "Done when: gamma exists.",
          "",
        ].join("\n"),
        "utf8",
      );
      writeHold(runtime, "s1", []);
      ctx.writeOutcome(
        outcome({
          summary: "wrote gamma for s1",
          steerRoutes: [
            { steer: "s1", route: "task", answer: "gamma written" },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  // No task existed when the pass began: only re-deriving after the steer
  // PM turn lets gamma run before the boundary.
  const result = await runDispatch(runtime, { iteration: 1 });

  expect(result.reason).toBe("boundary");
  expect(stepsCalled(harness, "pm")).toBe(1);
  const records = await runtime.store.listRecords();

  return { runtime, result, records };
}

async function dispatchesTaskSteerPMTurnCreatedPart2(
  scope: Awaited<ReturnType<typeof dispatchesTaskSteerPMTurnCreatedPart1>>,
) {
  const { records, runtime, result } = scope;
  for (const step of ["implement", "qa", "review"]) {
    expect(records.some((r) => r.slug === "gamma" && r.step === step)).toBe(
      true,
    );
  }
  expect(
    derive(
      await runtime.store.listTasks(),
      records,
      runtime.configs.process.flows,
    ).tasks.gamma!.status,
  ).toBe("merged");
  // gamma's implement, QA and review; the PM turn, checks and merge add none.
  expect(result.taskTurnsStarted).toBe(3);
}

function registerDispatchPassSignalsPart1(): void {
  it("dispatches a task a steer PM turn created within the same pass, and its turns are the only ones counted", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await dispatchesTaskSteerPMTurnCreatedPart1(repo, goal);
      await dispatchesTaskSteerPMTurnCreatedPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("counts only implement, QA and review turns: checks, merge, finish, plancheck and boundary work do not count", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, planCheckRounds: 1 },
    });
    try {
      const scope1 = await countsOnlyImplementQAReviewTurnsPart1(repo, goal);
      await countsOnlyImplementQAReviewTurnsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchPassSignalsPart2(): void {
  it("spends no checker turn when every task landed", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, planCheckRounds: 2 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptWork(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        PLAN,
        "utf8",
      );
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });

      expect(result.reason).toBe("boundary");
      expect(stepsCalled(harness, "plancheck")).toBe(0);
      expect(result.planCheck).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchPassSignalsPart3(): void {
  it("stalls a park that shares its iteration with a merge", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptWork(harness);
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "failed", summary: "runner crashed mid-turn" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta", step: "implement" }) },
      );
      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        "utf8",
      );
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });

      expect(result.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      expect(
        records.some(
          (r) => r.step === "merge" && r.slug === "alpha" && r.ok === true,
        ),
      ).toBe(true);
      // The wave merged alpha and still parked beta; the stall turn owns it.
      const stalls = records.filter(
        (r) => r.step === "stall-routes" && r.endedAt,
      );
      expect(stalls).toHaveLength(1);
      expect(stalls[0]!.outcome?.stallRoutes).toEqual([
        {
          slug: "beta",
          action: "leave",
          reason: "left for the architect",
        },
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchPassSignalsPart4(): void {
  it("reports taskTurnsStarted 0 when nothing ran", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });

      const result = await runDispatch(runtime, { iteration: 1 });

      expect(result.reason).toBe("boundary");
      expect(result.taskTurnsStarted).toBe(0);
      expect(result.allReadyHeld).toBe(false);
      expect(harness.calls).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchPassSignalsPart5(): void {
  it("carries the iteration's latest plancheck verdict once the rounds are exhausted", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, planCheckRounds: 2 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        PLAN,
        "utf8",
      );
      // Open work: without it the checker is not called and there is no
      // verdict to carry.
      await writeTask(
        runtime,
        task("beta", { deps: ["ghost"], scope: ["beta.txt"] }),
      );
      for (const verdict of ["architect", "progress"] as const) {
        await runtime.store.appendRecord(
          {
            iteration: 1,
            step: "plancheck",
            round: verdict === "architect" ? 1 : 2,
            actor: "agent",
            alias: "plan-checker",
            model: { id: "fake" },
          },
          {
            ok: true,
            outcome: outcome({
              summary: `checked ${verdict}`,
              planCheck: { verdict, evidence: [] },
            }),
          },
        );
      }

      const result = await runDispatch(runtime, { iteration: 1 });

      // No further checker turn ran; the newest record, not the older one, wins.
      expect(stepsCalled(harness, "plancheck")).toBe(0);
      expect(result.planCheck).toBe("progress");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchPassSignalsPart6(): void {
  it("reports allReadyHeld when a pending steer holds every ready task, and not when the hold has expired", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptWork(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      await writeTask(runtime, task("b", { scope: ["b-area"] }));

      // The hold names both tasks, but s1 is not pending: the hold is expired.
      writeHold(runtime, "s1", ["a", "b"]);
      const expired = await runDispatch(runtime, { iteration: 1 });
      expect(expired.reason).toBe("boundary");
      expect(expired.allReadyHeld).toBe(false);
      expect(expired.taskTurnsStarted).toBe(6);
    } finally {
      cleanupFlowRepo(repo);
    }

    const held = setupFlowRepo({ limits: { concurrency: { overall: 1 } } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptWork(harness);
      const runtime = await makeRuntime(held.repo, held.goal, {
        fake: harness,
      });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      await writeTask(runtime, task("b", { scope: ["b-area"] }));
      await postSteer(runtime.store, "s1", "Hold a and b.");
      writeHold(runtime, "s1", ["a", "b"]);

      const result = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: ["s1"],
      });

      expect(result.reason).toBe("boundary");
      expect(result.cause).toEqual(cause("steer: s1 holds a, b"));
      expect(result.allReadyHeld).toBe(true);
      expect(result.taskTurnsStarted).toBe(0);
      expect(harness.calls).toHaveLength(0);
    } finally {
      cleanupFlowRepo(held.repo);
    }
  }, 60_000);
}

describe("dispatch pass signals", () => {
  registerDispatchPassSignalsPart1();

  registerDispatchPassSignalsPart2();

  registerDispatchPassSignalsPart3();

  registerDispatchPassSignalsPart4();

  registerDispatchPassSignalsPart5();

  registerDispatchPassSignalsPart6();
});
