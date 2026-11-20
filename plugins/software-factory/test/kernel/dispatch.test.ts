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
import { createDrainController } from "../../src/kernel/signals.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  filePerTaskHandler,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  twoPartyBarrier,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { writeHold } from "./steer-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

async function runPair(opts: {
  scopeA: string[];
  scopeB: string[];
  limits: Record<string, unknown>;
  rendezvous?: boolean;
  aliases?: FlowRepoOptions["aliases"];
  tierA?: string;
  tierB?: string;
}): Promise<{ max: number; reason: string }> {
  const { repo, goal } = setupFlowRepo({
    limits: opts.limits,
    ...(opts.aliases ? { aliases: opts.aliases } : {}),
  });
  try {
    const counter = { active: 0, max: 0 };
    const barrier = opts.rendezvous ? twoPartyBarrier() : undefined;
    const harness = new FakeHarness({ id: "fake" });
    // Bound by step so either task's turn takes an implement or review
    // handler no matter which calls first; the handler itself keys off the
    // worktree it runs in. Concurrent pairs rendezvous instead of sleeping
    // so the overlap assertion cannot miss under load; serialized pairs
    // keep the sleep (a barrier would deadlock them).
    for (let i = 0; i < 2; i += 1) {
      harness.script(filePerTaskHandler(counter, 20, barrier), {
        when: whenTurn({ step: "implement" }),
      });
      harness.script(filePerTaskHandler(counter, 20, barrier), {
        when: whenTurn({ step: "review" }),
      });
    }
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    await writeTask(
      runtime,
      task("alpha", {
        scope: opts.scopeA,
        ...(opts.tierA ? { tier: opts.tierA } : {}),
      }),
    );
    await writeTask(
      runtime,
      task("beta", {
        scope: opts.scopeB,
        ...(opts.tierB ? { tier: opts.tierB } : {}),
      }),
    );
    const result = await runDispatch(runtime, { iteration: 1 });
    const state = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    expect(state.tasks.alpha!.status).toBe("merged");
    expect(state.tasks.beta!.status).toBe("merged");
    return { max: counter.max, reason: result.reason };
  } finally {
    cleanupFlowRepo(repo);
  }
}

describe("dispatch admission", () => {
  registerDispatchAdmissionPart1();
  registerDispatchAdmissionPart2();
  registerDispatchAdmissionPart3();
  registerDispatchAdmissionPart4();
  registerDispatchAdmissionPart5();
  registerDispatchAdmissionPart6();
});

describe("script crash budget", () => {
  registerScriptCrashBudgetPart1();
  registerScriptCrashBudgetPart2();
  registerScriptCrashBudgetPart3();
});

const PLAN = "# Plan\n\n## alpha\nDo alpha.\n";

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

describe("dispatch pass signals", () => {
  registerDispatchPassSignalsPart1();
  registerDispatchPassSignalsPart2();
  registerDispatchPassSignalsPart3();
  registerDispatchPassSignalsPart4();
  registerDispatchPassSignalsPart5();
  registerDispatchPassSignalsPart6();
  registerDispatchPassSignalsPart7();
});

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

async function doesNotChargeArchitectPMOrInfraPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
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
  await writeTask(runtime, task("task", { scope: ["task-area"] }));
  const model = { id: "fake" };
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect",
      model,
    },
    {
      stop: { kind: "done" },
      outcome: outcome({ summary: "go", decision: "continue" }),
    },
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "pm",
      round: 1,
      actor: "agent",
      alias: "pm",
      model,
    },
    { stop: { kind: "done" }, outcome: outcome({ summary: "filed" }) },
  );

  return { runtime, model };
}

async function doesNotChargeArchitectPMOrInfraPart2(
  scope: Awaited<ReturnType<typeof doesNotChargeArchitectPMOrInfraPart1>>,
) {
  const { runtime, model } = scope;
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "task",
      step: "implement",
      round: 1,
      actor: "agent",
      alias: "implementer",
      model,
    },
    { stop: { kind: "infra", cause: "rate" } },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("drained");
  // Implement, QA and review are the task's turns; architect, PM and the
  // infra record are not charged.
  expect(result.turns).toBe(3);
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
}

async function drainsFirstSignalFlightTaskPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const controller = createDrainController(() => Promise.resolve());
  const harness = new FakeHarness({ id: "fake" });
  const starts: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    harness.script((req, ctx) => {
      const slug = path.basename(req.cwd!);
      const step = fakeTurnIdentity(req).step;
      if (step === "review") {
        ctx.writeOutcome(
          outcome({ summary: `${slug} approved`, verdict: "approve" }),
        );
      } else if (step === "qa") {
        ctx.writeOutcome(
          outcome({
            summary: `${slug} qa accepted`,
            qa: { verdict: "accept" },
          }),
        );
      } else {
        starts.push(slug);
        if (slug === "a") controller.handleSignal("SIGINT");
        fs.writeFileSync(
          path.join(req.cwd!, `${slug}.txt`),
          `${slug}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      }
      return fakeTurnResult(req);
    });
  }

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("a", { scope: ["a-area"] }));
  await writeTask(runtime, task("b", { scope: ["b-area"] }));

  const result = await runDispatch(runtime, {
    iteration: 1,
    signals: controller,
  });

  expect(result.reason).toBe("drained");

  return { harness, starts, runtime, result };
}

async function drainsFirstSignalFlightTaskPart2(
  scope: Awaited<ReturnType<typeof drainsFirstSignalFlightTaskPart1>>,
) {
  const { result, starts, harness, runtime } = scope;
  expect(result.cause).toEqual({
    kind: "boundary",
    detail: "signal: drain requested",
  });
  expect(starts).toEqual(["a"]);
  expect(harness.calls.length).toBe(3);
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.a!.status).toBe("merged");
  expect(state.tasks.b!.status).toBe("ready");
  expect(state.tasks.b!.turns).toBe(0);
  expect(records.filter((r) => r.slug === "b")).toEqual([]);
}

async function runsDisjointAreasConcurrentlyEvenPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const counter = { active: 0, max: 0 };
  const arrive = twoPartyBarrier();
  const harness = new FakeHarness({ id: "fake" });
  const handler: FakeTurnHandler = async (req, ctx) => {
    counter.active += 1;
    counter.max = Math.max(counter.max, counter.active);
    try {
      await arrive();
      const slug = path.basename(req.cwd!);
      if (req.prompt.startsWith("You review")) {
        ctx.writeOutcome(
          outcome({ summary: `${slug} approved`, verdict: "approve" }),
        );
      } else {
        fs.writeFileSync(path.join(req.cwd!, "shared.txt"), "shared\n", "utf8");
        ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      }
      return fakeTurnResult(req);
    } finally {
      counter.active -= 1;
    }
  };
  // Bound by step so either task's turn takes the matching handler no
  // matter which calls first; the rendezvous (not a sleep) is what the
  // max-concurrency assertion measures.
  for (let i = 0; i < 2; i += 1) {
    harness.script(handler, { when: whenTurn({ step: "implement" }) });
    harness.script(handler, { when: whenTurn({ step: "review" }) });
  }
  const runtime = await makeRuntime(repo, goal, { fake: harness });

  return { counter, harness, runtime };
}

async function runsDisjointAreasConcurrentlyEvenPart2(
  scope: Awaited<ReturnType<typeof runsDisjointAreasConcurrentlyEvenPart1>>,
) {
  const { harness, runtime, counter } = scope;
  harness.script(
    async (req, ctx) => {
      const tasks = await runtime.store.listTasks();
      const state = derive(
        tasks,
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      const slugs = Object.keys(state.tasks)
        .filter((slug) => state.tasks[slug]!.status === "parked")
        .sort();
      ctx.writeOutcome(
        outcome({
          summary: "left the park for the architect",
          stallRoutes: slugs.map((slug) => ({
            slug,
            action: "leave",
            reason: "merge queue parked it",
          })),
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));
  await writeTask(runtime, task("beta", { scope: ["beta-area"] }));
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  expect(counter.max).toBe(2);
  // Admission gates on limits, not files: both implement turns ran even
  // though both diffs touch shared.txt. The second merge parks as a
  // no-progress empty diff; that is the merge queue's verdict, not dispatch.
  const records = await runtime.store.listRecords();
  expect(
    records.some((r) => r.slug === "alpha" && r.step === "implement"),
  ).toBe(true);
  expect(records.some((r) => r.slug === "beta" && r.step === "implement")).toBe(
    true,
  );
}

function registerDispatchAdmissionPart1(): void {
  it("runs disjoint areas concurrently up to the absolute limit", async () => {
    const run = await runPair({
      scopeA: ["alpha-area"],
      scopeB: ["beta-area"],
      limits: { concurrency: { overall: 2 } },
      rendezvous: true,
    });
    expect(run.reason).toBe("boundary");
    expect(run.max).toBe(2);
  }, 60_000);

  it("runs overlapping scopes concurrently when no dep orders them", async () => {
    const run = await runPair({
      scopeA: ["shared-area"],
      scopeB: ["shared-area"],
      limits: { concurrency: { overall: 2 } },
      rendezvous: true,
    });
    expect(run.reason).toBe("boundary");
    expect(run.max).toBe(2);
  }, 60_000);

  it("runs disjoint areas concurrently even when their diffs touch the same file", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const scope1 = await runsDisjointAreasConcurrentlyEvenPart1(repo, goal);
      await runsDisjointAreasConcurrentlyEvenPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchAdmissionPart2(): void {
  it("throttles one subscription even when the overall limit allows more", async () => {
    const run = await runPair({
      scopeA: ["alpha-area"],
      scopeB: ["beta-area"],
      limits: { concurrency: { overall: 2, perSubscription: { pool: 1 } } },
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: {
          harness: "fake",
          model: "fake-impl",
          subscription: "pool",
        },
        reviewer: {
          harness: "fake",
          model: "fake-review",
          subscription: "pool",
        },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        intent: { harness: "fake", model: "fake-intent" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      },
    });
    expect(run.max).toBe(1);
  }, 60_000);
}

function registerDispatchAdmissionPart3(): void {
  it("runs separate subscriptions in parallel within the overall limit", async () => {
    const run = await runPair({
      scopeA: ["alpha-area"],
      scopeB: ["beta-area"],
      limits: {
        concurrency: {
          overall: 2,
          perSubscription: { "pool-a": 1, "pool-b": 1 },
        },
      },
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "fake-impl" },
        reviewer: { harness: "fake", model: "fake-review" },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        intent: { harness: "fake", model: "fake-intent" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
        "tier-a": { harness: "fake", model: "fake-a", subscription: "pool-a" },
        "tier-b": { harness: "fake", model: "fake-b", subscription: "pool-b" },
      },
      tierA: "tier-a",
      tierB: "tier-b",
      rendezvous: true,
    });
    expect(run.reason).toBe("boundary");
    expect(run.max).toBe(2);
  }, 60_000);
}

function registerDispatchAdmissionPart4(): void {
  it("throttles one model even when the overall limit allows more", async () => {
    const run = await runPair({
      scopeA: ["alpha-area"],
      scopeB: ["beta-area"],
      limits: { concurrency: { overall: 2, perModel: { shared: 1 } } },
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "shared" },
        reviewer: { harness: "fake", model: "shared" },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        intent: { harness: "fake", model: "fake-intent" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      },
    });
    expect(run.max).toBe(1);
  }, 60_000);

  it("honours the absolute limit", async () => {
    const run = await runPair({
      scopeA: ["alpha-area"],
      scopeB: ["beta-area"],
      limits: { concurrency: { overall: 1 } },
    });
    expect(run.max).toBe(1);
  }, 60_000);

  it("does not charge architect, PM or infra records to the iteration turn limit", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { turns: 1 } });
    try {
      const scope1 = await doesNotChargeArchitectPMOrInfraPart1(repo, goal);
      await doesNotChargeArchitectPMOrInfraPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchAdmissionPart5(): void {
  it("drains on the first signal: the in-flight task finishes its flow and no unstarted task starts", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const scope1 = await drainsFirstSignalFlightTaskPart1(repo, goal);
      await drainsFirstSignalFlightTaskPart2(scope1);
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDispatchAdmissionPart6(): void {
  it("keeps the second signal a hard stop: the aborted turn returns cancelled and nothing else starts", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const controller = createDrainController(() => Promise.resolve());
      const harness = new FakeHarness({ id: "fake" });
      const starts: string[] = [];
      harness.script((req) => {
        const slug = path.basename(req.cwd!);
        starts.push(slug);
        controller.handleSignal("SIGINT");
        controller.handleSignal("SIGINT");
        return fakeTurnResult(req, { stop: { kind: "cancelled" } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      await writeTask(runtime, task("b", { scope: ["b-area"] }));

      const result = await runDispatch(runtime, {
        iteration: 1,
        signals: controller,
      });

      expect(result.reason).toBe("cancelled");
      expect(starts).toEqual(["a"]);
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).not.toBe("merged");
      expect(state.tasks.b!.status).toBe("ready");
      expect(records.filter((r) => r.slug === "b")).toEqual([]);
      expect(
        records.find((r) => r.slug === "a" && r.step === "implement")?.stop
          ?.kind,
      ).toBe("cancelled");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerScriptCrashBudgetPart1(): void {
  it("parks a deterministically throwing step after the same budget as a harness crash, across relaunches", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope = await scriptCrashBudgetFirstLaunch(repo, goal);
      await scriptCrashBudgetRelaunches(scope);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

async function scriptCrashBudgetFirstLaunch(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const throwing = () => {
    throw new Error("simulated pre-harness throw");
  };
  harness.script(throwing);
  harness.script(throwing);
  scriptStallLeave(harness, ["alpha"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));

  const first = await runDispatch(runtime, { iteration: 1 });
  expect(first.reason).toBe("infra");
  expect(causeText(first.cause)).toContain(
    "alpha: crash: simulated pre-harness throw",
  );
  // Script crashes count as a turn but never spend the iteration turn
  // budget: the drain still sees an unstarted task as free.
  expect(first.turns).toBe(0);
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.turns).toBe(1);
  expect(state.tasks.alpha!.phase).toBe("implement");
  expect(state.tasks.alpha!.park).toBeUndefined();

  return { harness, runtime };
}

async function scriptCrashBudgetRelaunches(
  scope: Awaited<ReturnType<typeof scriptCrashBudgetFirstLaunch>>,
) {
  const { harness, runtime } = scope;
  const second = await runDispatch(runtime, { iteration: 2 });
  expect(second.reason).toBe("infra");
  expect(second.turns).toBe(0);
  let records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.turns).toBe(2);
  expect(state.tasks.alpha!.phase).toBe("parked");
  expect(causeText(state.tasks.alpha!.park)).toContain("infra-repeat: crash");
  expect(causeText(state.tasks.alpha!.park)).toContain(
    "simulated pre-harness throw",
  );

  // The parked step is not re-dispatched by a third launch.
  const third = await runDispatch(runtime, { iteration: 3 });
  expect(third.reason).toBe("boundary");
  expect(harness.calls).toHaveLength(3);
  records = await runtime.store.listRecords();
  const scriptCrashes = records.filter(
    (r) =>
      r.slug === "alpha" &&
      r.actor === "script" &&
      r.step === "implement" &&
      r.stop?.kind === "infra" &&
      r.stop.cause === "crash",
  );
  expect(scriptCrashes).toHaveLength(2);
  const settledAgentTurns = records.filter(
    (r) => r.slug === "alpha" && r.actor === "agent" && r.endedAt,
  );
  expect(settledAgentTurns).toHaveLength(0);
}

function registerScriptCrashBudgetPart2(): void {
  it("logs a store failure from recordCrash instead of swallowing it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(" "));
    };
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(() => {
        throw new Error("simulated kill");
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      const append = runtime.store.appendRecord.bind(runtime.store);
      let crashRecords = 0;
      // Only the crash record's append fails: the wave-end steward record is
      // not what this test is about.
      runtime.store.appendRecord = (async (
        meta: Parameters<typeof runtime.store.appendRecord>[0],
        end: Parameters<typeof runtime.store.appendRecord>[1],
      ) => {
        if (meta.step === "implement") {
          crashRecords += 1;
          throw new Error("store boom");
        }
        return append(meta, end);
      }) as typeof runtime.store.appendRecord;

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(causeText(result.cause)).toContain("a: crash: simulated kill");
      expect(causeText(result.cause)).not.toContain("store boom");
      expect(crashRecords).toBe(1);
      expect(
        warnings.some(
          (w) =>
            w.includes("recordCrash") &&
            w.includes("store boom") &&
            w.includes("simulated kill"),
        ),
      ).toBe(true);
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerScriptCrashBudgetPart3(): void {
  it("logs a non-Error store failure with its text, never undefined", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(" "));
    };
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(() => {
        throw new Error("simulated kill");
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      const append = runtime.store.appendRecord.bind(runtime.store);
      runtime.store.appendRecord = (async (
        meta: Parameters<typeof runtime.store.appendRecord>[0],
        end: Parameters<typeof runtime.store.appendRecord>[1],
      ) => {
        if (meta.step === "implement") {
          const failure: unknown = "store string boom";
          throw failure;
        }
        return append(meta, end);
      }) as typeof runtime.store.appendRecord;

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(causeText(result.cause)).toContain("a: crash: simulated kill");
      const logged = warnings.find((w) => w.includes("recordCrash"));
      expect(logged).toBeDefined();
      expect(logged).toContain("store string boom");
      expect(logged).not.toContain("undefined");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
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

function registerDispatchPassSignalsPart7(): void {
  it("reports allReadyHeld after the unheld work ran and only held tasks remain", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptWork(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      await writeTask(runtime, task("b", { scope: ["b-area"] }));
      await postSteer(runtime.store, "s1", "Hold a.");
      writeHold(runtime, "s1", ["a"]);

      const result = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: ["s1"],
      });

      // Boundary after work: b's implement, QA and review ran, a stays held.
      expect(result.reason).toBe("boundary");
      expect(result.cause).toEqual(cause("steer: s1 holds a"));
      expect(result.allReadyHeld).toBe(true);
      expect(result.taskTurnsStarted).toBe(3);
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.b!.status).toBe("merged");
      expect(state.tasks.a!.turns).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
