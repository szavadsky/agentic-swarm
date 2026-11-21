import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  writeTask,
} from "./s2-helpers.js";

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

describe("dispatch admission", () => {
  registerDispatchAdmissionPart5();

  registerDispatchAdmissionPart6();
});

describe("script crash budget", () => {
  registerScriptCrashBudgetPart1();

  registerScriptCrashBudgetPart2();

  registerScriptCrashBudgetPart3();
});
