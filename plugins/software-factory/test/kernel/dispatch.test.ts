import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  filePerTaskHandler,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
  twoPartyBarrier,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

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

describe("dispatch admission", () => {
  registerDispatchAdmissionPart1();

  registerDispatchAdmissionPart2();

  registerDispatchAdmissionPart3();

  registerDispatchAdmissionPart4();
});
