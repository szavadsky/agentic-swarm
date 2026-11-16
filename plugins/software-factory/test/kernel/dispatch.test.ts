import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { areasOverlap, runDispatch } from "../../src/kernel/dispatch.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { task } from "./helpers.js";
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
  it("knows which declared areas overlap", () => {
    expect(areasOverlap(["dispatch"], ["dispatch"])).toBe(true);
    expect(areasOverlap(["auth", "billing"], ["billing"])).toBe(true);
    expect(areasOverlap(["auth"], ["billing"])).toBe(false);
    expect(areasOverlap(["shared/file.ts"], ["shared/**"])).toBe(false);
    expect(areasOverlap([], ["billing"])).toBe(false);
    expect(areasOverlap(["auth"], [])).toBe(false);
  });

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

  it("never runs two tasks with the same area at once", async () => {
    const run = await runPair({
      scopeA: ["shared-area"],
      scopeB: ["shared-area"],
      limits: { concurrency: { overall: 2 } },
    });
    expect(run.max).toBe(1);
  }, 60_000);

  it("runs disjoint areas concurrently even when their diffs touch the same file", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 2 } },
    });
    try {
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
            fs.writeFileSync(
              path.join(req.cwd!, "shared.txt"),
              "shared\n",
              "utf8",
            );
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
      await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));
      await writeTask(runtime, task("beta", { scope: ["beta-area"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(counter.max).toBe(2);
      // Admission is about areas, not files: both implement turns ran even
      // though both diffs touch shared.txt. The second merge parks as a
      // no-progress empty diff; that is the merge queue's verdict, not dispatch.
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.slug === "alpha" && r.step === "implement"),
      ).toBe(true);
      expect(
        records.some((r) => r.slug === "beta" && r.step === "implement"),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

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
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      },
    });
    expect(run.max).toBe(1);
  }, 60_000);

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
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
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
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
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
      expect(result.turns).toBe(2);
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("drains on the first signal: the in-flight task finishes its flow and no unstarted task starts", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const controller = createDrainController();
      const harness = new FakeHarness({ id: "fake" });
      const starts: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        harness.script((req, ctx) => {
          const slug = path.basename(req.cwd!);
          if (req.prompt.startsWith("You review")) {
            ctx.writeOutcome(
              outcome({ summary: `${slug} approved`, verdict: "approve" }),
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
      expect(result.cause).toBe("signal: drain requested");
      expect(starts).toEqual(["a"]);
      expect(harness.calls.length).toBe(2);
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
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the second signal a hard stop: the aborted turn returns cancelled and nothing else starts", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const controller = createDrainController();
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
});

describe("script crash budget", () => {
  it("parks a deterministically throwing step after the same budget as a harness crash, across relaunches", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
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
      expect(first.cause).toContain(
        "alpha: crash: simulated pre-harness throw",
      );
      // Script crashes spend the item budget but never the iteration turn
      // budget: the drain still sees an unstarted task as free.
      expect(first.turns).toBe(0);
      let records = await runtime.store.listRecords();
      let state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.turns).toBe(1);
      expect(state.tasks.alpha!.phase).toBe("implement");
      expect(state.tasks.alpha!.park).toBeUndefined();

      const second = await runDispatch(runtime, { iteration: 2 });
      expect(second.reason).toBe("infra");
      expect(second.turns).toBe(0);
      records = await runtime.store.listRecords();
      state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.turns).toBe(2);
      expect(state.tasks.alpha!.phase).toBe("parked");
      expect(state.tasks.alpha!.park).toContain("infra-repeat: crash");
      expect(state.tasks.alpha!.park).toContain("simulated pre-harness throw");

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
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

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
      let crashRecords = 0;
      runtime.store.appendRecord = (async (
        ...args: [
          Parameters<typeof runtime.store.appendRecord>[0],
          Parameters<typeof runtime.store.appendRecord>[1],
        ]
      ) => {
        crashRecords += 1;
        throw new Error("store boom");
      }) as typeof runtime.store.appendRecord;

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("a: crash: simulated kill");
      expect(result.cause).not.toContain("store boom");
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
      runtime.store.appendRecord = (async () => {
        const failure: unknown = "store string boom";
        throw failure;
      }) as typeof runtime.store.appendRecord;

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("a: crash: simulated kill");
      const logged = warnings.find((w) => w.includes("recordCrash"));
      expect(logged).toBeDefined();
      expect(logged).toContain("store string boom");
      expect(logged).not.toContain("undefined");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
