import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { LiveAgents } from "../../src/harness/types.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  implementer,
  inboxHas,
  outboxOf,
  stateOf,
  writePlan,
} from "./steer-helpers.js";

/** Watch cadence and settle window for the two mid-PM steer tests. */
const WATCH_TICK_MS = 20;
const DEBOUNCE_SECONDS = 0.03;

async function within<T>(
  promise: Promise<T>,
  ms: number,
  failure: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(failure)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Counts PM turns and records whether two ever overlapped. */
function pmTurns() {
  return {
    calls: 0,
    active: 0,
    maxActive: 0,
    enter() {
      this.calls += 1;
      this.active += 1;
      this.maxActive = Math.max(this.maxActive, this.active);
    },
    leave() {
      this.active -= 1;
    },
  };
}

/** A task-steer needs a task-file change to be accepted. */
function amendAlpha(runtime: KernelRuntime, note: string): void {
  fs.appendFileSync(
    path.join(runtime.store.tasksDir, "alpha.md"),
    `\nPM amendment: ${note}\n`,
    "utf8",
  );
}

/** A plan and one task; the steer tests start from a dispatchable goal. */
async function steerDispatchScope(
  opts: { live?: () => LiveAgents; debounceSeconds?: number } = {},
) {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: { overall: 1 },
      steerDebounceSeconds: opts.debounceSeconds ?? DEBOUNCE_SECONDS,
    },
  });
  const harness = new FakeHarness({
    id: "fake",
    ...(opts.live ? { live: opts.live } : {}),
  });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  return { repo, runtime, harness };
}

/** A promise and the setter that settles it. */
function deferred<T>() {
  let mark!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    mark = resolve;
  });
  return { promise, mark };
}

/**
 * The PM turn that gets steered mid-flight: it posts a second steer, waits for
 * the watch's injection, then routes the batch and the late steer together.
 */
function injectedPmTurn(
  runtime: KernelRuntime,
  pm: ReturnType<typeof pmTurns>,
  injectedOnce: Promise<string>,
  holdMs = 0,
): FakeTurnHandler {
  return async (req, ctx) => {
    pm.enter();
    try {
      expect(req.prompt).toContain("s1");
      expect(req.prompt).not.toContain("Add a beta note.");
      await postSteer(runtime.store, "s2", "Add a beta note.");
      const message = await within(
        injectedOnce,
        10_000,
        "the running PM turn was not steered",
      );
      if (holdMs > 0) await sleep(holdMs);
      expect(message).toContain("s2");
      expect(message).toContain("Add a beta note.");
      amendAlpha(runtime, "alpha stays small, beta note added");
      ctx.writeOutcome(
        outcome({
          summary: "routed s1 and s2",
          steerRoutes: [
            { steer: "s1", route: "task", answer: "alpha kept small" },
            { steer: "s2", route: "task", answer: "beta note added" },
          ],
        }),
      );
      return fakeTurnResult(req);
    } finally {
      pm.leave();
    }
  };
}

/** One queued-path PM turn: checks the prompt, then routes its own steer. */
function queuedPmTurn(
  runtime: KernelRuntime,
  pm: ReturnType<typeof pmTurns>,
  opts: {
    steer: string;
    answer: string;
    check: (prompt: string) => void;
    before?: () => Promise<void>;
  },
): FakeTurnHandler {
  return async (req, ctx) => {
    pm.enter();
    try {
      opts.check(req.prompt);
      await opts.before?.();
      amendAlpha(runtime, opts.answer);
      ctx.writeOutcome(
        outcome({
          summary: `routed ${opts.steer}`,
          steerRoutes: [
            { steer: opts.steer, route: "task", answer: opts.answer },
          ],
        }),
      );
      return fakeTurnResult(req);
    } finally {
      pm.leave();
    }
  };
}

/**
 * The harness steers its own session: the watch hands the late steer to the
 * running PM turn, which routes it in the same outcome.
 */
function registerInjectedSteerPart1(): void {
  it("injects a steer dropped during the PM turn into that turn", async () => {
    const injected: string[] = [];
    const injectedOnce = deferred<string>();
    // The fake's live handle is the harness surface: `steerSession` is the
    // root-session injection this test proves the watch uses.
    const agents: LiveAgents = {
      list: async () => [],
      steer: async () => {},
      steerSession: async (message) => {
        injected.push(message);
        injectedOnce.mark(message);
      },
    };
    const { repo, runtime, harness } = await steerDispatchScope({
      live: () => agents,
    });
    try {
      const pm = pmTurns();

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Keep alpha small.");
        }),
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(injectedPmTurn(runtime, pm, injectedOnce.promise), {
        when: whenTurn({ step: "pm" }),
      });
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      expect(pm.calls).toBe(1);
      expect(pm.maxActive).toBe(1);
      expect(injected).toHaveLength(1);
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(inboxHas(runtime, "s2")).toBe(false);
      expect(outboxOf(runtime, "s1")).toContain("alpha kept small");
      expect(outboxOf(runtime, "s2")).toContain("beta note added");
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/**
 * Overlapping watch ticks must offer a steer once: the watch claims it when it
 * is selected, not when a slow delivery finally returns.
 */
function registerSlowDeliveryPart1(): void {
  it("injects a steer once when ticks overlap a slow delivery", async () => {
    const injected: string[] = [];
    const firstInjection = deferred<string>();
    const agents: LiveAgents = {
      list: async () => [],
      steer: async () => {},
      steerSession: async (message) => {
        injected.push(message);
        firstInjection.mark(message);
        await sleep(100);
      },
    };
    const { repo, runtime, harness } = await steerDispatchScope({
      live: () => agents,
      debounceSeconds: 0.01,
    });
    try {
      const pm = pmTurns();

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Keep alpha small.");
        }),
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      // Hold the turn past the delivery sleep so a duplicate tick's injection
      // has time to land before the outcome is written.
      harness.script(injectedPmTurn(runtime, pm, firstInjection.promise, 250), {
        when: whenTurn({ step: "pm" }),
      });
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      expect(pm.calls).toBe(1);
      expect(pm.maxActive).toBe(1);
      expect(injected).toHaveLength(1);
      expect(inboxHas(runtime, "s2")).toBe(false);
      expect(outboxOf(runtime, "s2")).toContain("beta note added");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/**
 * The harness cannot inject: the late steer queues and gets its own PM turn
 * after the running one ends, never beside it.
 */
function registerQueuedSteerPart1(): void {
  it("queues a steer for the next PM turn when the harness cannot inject", async () => {
    const { repo, runtime, harness } = await steerDispatchScope();
    try {
      await postSteer(runtime.store, "s1", "Keep alpha small.");
      const pm = pmTurns();

      harness.script(
        queuedPmTurn(runtime, pm, {
          steer: "s1",
          answer: "alpha amended",
          check: (prompt) => {
            expect(prompt).toContain("Keep alpha small.");
            expect(prompt).not.toContain("Second steer: keep beta.");
          },
          before: async () => {
            await postSteer(runtime.store, "s2", "Second steer: keep beta.");
            // Longer than the debounce: the watch has announced s2, but the
            // blocked loop cannot run its PM turn until this one ends.
            await sleep(250);
          },
        }),
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        queuedPmTurn(runtime, pm, {
          steer: "s2",
          answer: "beta kept",
          check: (prompt) => {
            expect(prompt).toContain("Second steer: keep beta.");
          },
        }),
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(implementer("alpha.txt"), {
        when: whenTurn({ slug: "alpha", step: "implement" }),
      });
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      expect(pm.calls).toBe(2);
      expect(pm.maxActive).toBe(1);
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(inboxHas(runtime, "s2")).toBe(false);
      expect(outboxOf(runtime, "s1")).toContain("alpha amended");
      expect(outboxOf(runtime, "s2")).toContain("beta kept");
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** A live handle that refuses every injection, recording the attempt. */
function refusingAgents(onRefused: () => void): {
  agents: LiveAgents;
  attempts: () => number;
} {
  let attempts = 0;
  const agents: LiveAgents = {
    list: async () => [],
    steer: async () => {},
    steerSession: async () => {
      attempts += 1;
      onRefused();
      throw new Error("harness refused");
    },
  };
  return { agents, attempts: () => attempts };
}

/** Scripts both PM turns and the task turns for the refused-steer test. */
function scriptRefusedSteer(
  harness: FakeHarness,
  runtime: KernelRuntime,
  pm: ReturnType<typeof pmTurns>,
  attempted: Promise<void>,
): void {
  harness.script(
    queuedPmTurn(runtime, pm, {
      steer: "s1",
      answer: "alpha amended",
      check: (prompt) => {
        expect(prompt).toContain("Keep alpha small.");
        expect(prompt).not.toContain("Second steer: keep beta.");
      },
      before: async () => {
        await postSteer(runtime.store, "s2", "Second steer: keep beta.");
        await within(
          attempted,
          10_000,
          "the live session was never offered the steer",
        );
        // Let the refused delivery's wake land before this turn ends.
        await sleep(50);
      },
    }),
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(
    queuedPmTurn(runtime, pm, {
      steer: "s2",
      answer: "beta kept",
      check: (prompt) => {
        expect(prompt).toContain("Second steer: keep beta.");
      },
    }),
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(implementer("alpha.txt"), {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  harness.script(approver("alpha is correct"), {
    when: whenTurn({ slug: "alpha", step: "review" }),
  });
}

/**
 * The harness exposes a live session but refuses the injection: the watch
 * wakes the loop, which claims the steer for its own PM turn instead.
 */
function registerRefusedSteerPart1(): void {
  it("queues a steer when the live session refuses it", async () => {
    const attempted = deferred<void>();
    const refused = refusingAgents(() => attempted.mark(undefined));
    const { repo, runtime, harness } = await steerDispatchScope({
      live: () => refused.agents,
    });
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => {
      warnings.push(msg);
    };
    try {
      await postSteer(runtime.store, "s1", "Keep alpha small.");
      const pm = pmTurns();
      scriptRefusedSteer(harness, runtime, pm, attempted.promise);

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      expect(refused.attempts()).toBe(1);
      expect(warnings.some((w) => w.includes('steer "s2" not injected'))).toBe(
        true,
      );
      expect(pm.calls).toBe(2);
      expect(pm.maxActive).toBe(1);
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(inboxHas(runtime, "s2")).toBe(false);
      expect(outboxOf(runtime, "s1")).toContain("alpha amended");
      expect(outboxOf(runtime, "s2")).toContain("beta kept");
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
describe("steer injected into a running PM", () => {
  registerInjectedSteerPart1();
  registerSlowDeliveryPart1();
  registerQueuedSteerPart1();
  registerRefusedSteerPart1();
});
