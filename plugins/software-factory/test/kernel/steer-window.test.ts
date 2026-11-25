import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  cleanup,
  implementerTurn,
  launch,
  makeGoal,
  outcome,
  simpleTask,
  stateOf,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome as flowOutcome,
  setupFlowRepo,
  whenTurn,
  writeTask as writeFlowTask,
} from "./s2-helpers.js";
import {
  approver,
  tasks as flowTasks,
  writePlan as writeFlowPlan,
} from "./steer-holds-helpers.js";

const PLAN = `# Milestone 1

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = simpleTask("alpha", "alpha.txt");

describe("steer dropped between the boundary read and dispatch start", () => {
  it("gets a PM steer turn in dispatch", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const steer = "Keep alpha unmerged until I answer.";
      const store = createFolderStore(goal.goalDir, undefined, {});

      harness.script(async (req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        // The boundary scanned the inbox before this turn; the drop is after
        // its read and must still be structured before tasks run.
        await postSteer(store, "s1", steer);
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(async (req, ctx) => {
        expect(req.prompt).not.toContain(steer);
        writeTask(goal.goalDir, ALPHA);
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(steer);
        ctx.writeOutcome(outcome({ summary: "structured the late steer" }));
        return fakeTurnResult(req);
      });
      harness.script(implementerTurn("alpha.txt"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha is correct", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness, 1);

      expect((await stateOf(goal.goalDir)).tasks.alpha!.status).toBe("merged");
      expect(
        harness.calls.filter((call) => call.prompt.includes(steer)),
      ).toHaveLength(1);
      const records = await store.listRecords();
      expect(records.filter((record) => record.step === "pm")).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

async function boundaryReadSteerPart1() {
  const goal = makeGoal();
  const harness = new FakeHarness({ id: "fake" });
  const steer = "Keep alpha unmerged until I answer.";
  const store = createFolderStore(goal.goalDir, undefined, {});
  await store.ensureLayout();
  await postSteer(store, "s1", steer);

  harness.script((req, ctx) => {
    expect(req.prompt).toContain(steer);
    writePlan(goal.goalDir, PLAN);
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });

  return { goal, harness, store, steer };
}

async function boundaryReadSteerPart2(
  scope: Awaited<ReturnType<typeof boundaryReadSteerPart1>>,
) {
  const { goal, harness, store, steer } = scope;
  harness.script((req, ctx) => {
    writeTask(goal.goalDir, ALPHA);
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  });
  harness.script(implementerTurn("alpha.txt"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });

  await launch(goal.repo, harness, 1);

  expect((await stateOf(goal.goalDir)).tasks.alpha!.status).toBe("merged");
  // No plan before launch: no PM steer turn; the architect saw the steer and
  // dispatch handed the same id back without a steer turn over it.
  const pm = (await store.listRecords()).filter(
    (record) => record.step === "pm",
  );
  expect(pm.filter((record) => record.outcome?.steerRoutes)).toHaveLength(0);
  expect(pm).toHaveLength(1);
  expect(
    harness.calls
      .filter((call) => call.prompt.includes(steer))
      .map((call) => fakeTurnIdentity(call).step),
  ).toEqual(["architect"]);
}

describe("steer dropped before launch", () => {
  it("goes to the first architect turn with no PM turn and is not steered again when dispatch starts", async () => {
    const scope = await boundaryReadSteerPart1();
    try {
      await boundaryReadSteerPart2(scope);
    } finally {
      cleanup(scope.goal);
    }
  }, 60_000);
});

async function idleIntentSteerPart1(goal: ReturnType<typeof makeGoal>) {
  const harness = new FakeHarness({ id: "fake" });
  const store = createFolderStore(goal.goalDir, undefined, {});
  await store.ensureLayout();
  writePlan(
    goal.goalDir,
    "# Milestone 0\n\n## setup\nPrepare the demo.\nDone when: the demo builds.\n",
  );
  const steer = "Amend intent: drop the export requirement.";
  await postSteer(store, "s1", steer);
  const intentPath = path.join(goal.goalDir, "intent.md");
  fs.writeFileSync(
    intentPath,
    "# Goal\n\nBuild the demo.\nDrop the export requirement.\n",
    "utf8",
  );

  // A plan exists: the boundary PM routes the idle steer before the architect.
  harness.script((req, ctx) => {
    expect(fakeTurnIdentity(req).step).toBe("pm");
    expect(req.prompt).toContain(steer);
    ctx.writeOutcome(
      outcome({
        summary: "s1 amends the intent",
        steerRoutes: [{ steer: "s1", route: "intent" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(
    (req, ctx) => {
      expect(fakeTurnIdentity(req).step).toBe("intent");
      expect(req.prompt).toContain(steer);
      fs.writeFileSync(
        intentPath,
        "# Goal\n\nBuild the demo.\nExport is in scope.\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "intent carries the steer" }));
      return fakeTurnResult(req);
    },
    { when: (req) => fakeTurnIdentity(req).step === "intent" },
  );

  return { harness, store, intentPath };
}

async function idleIntentSteerPart2(
  goal: ReturnType<typeof makeGoal>,
  scope: Awaited<ReturnType<typeof idleIntentSteerPart1>>,
) {
  const { harness, store, intentPath } = scope;
  harness.script((req, ctx) => {
    expect(fakeTurnIdentity(req).step).toBe("architect");
    expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md)");
    expect(fs.readFileSync(intentPath, "utf8")).toContain(
      "Export is in scope.",
    );
    const pack = fs.readFileSync(
      path.join(goal.goalDir, "iterations/1/context-pack.md"),
      "utf8",
    );
    expect(pack).toContain(
      "## Intent changes (carried by the intent agent; the plan follows the diff)",
    );
    expect(pack).toContain("- s1 (mailbox/inbox/s1.md) — intent turn ");
    expect(pack).toContain("-Drop the export requirement.");
    expect(pack).toContain("+Export is in scope.");
    writePlan(goal.goalDir, PLAN);
    ctx.writeOutcome(
      outcome({
        summary: "planned from the amended intent",
        decision: "continue",
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
    return fakeTurnResult(req);
  });

  await launch(goal.repo, harness, 1);

  expect(fs.readFileSync(intentPath, "utf8")).toBe(
    "# Goal\n\nBuild the demo.\nExport is in scope.\n",
  );
  const records = await store.listRecords();
  expect(
    records.filter((record) => record.step === "steer-routes"),
  ).toHaveLength(1);
  const intentTurn = records.find(
    (record) => record.step === "intent" && record.slug === "s1",
  );
  expect(intentTurn?.diff).toContain("+Export is in scope.");
  expect(intentTurn?.diff).toContain("-Drop the export requirement.");
  const steps = harness.calls.map((call) => fakeTurnIdentity(call).step);
  expect(steps.indexOf("intent")).toBeLessThan(steps.indexOf("architect"));
}

describe("steer dropped with nothing in flight after the first plan", () => {
  it("is routed at the boundary, carried into the intent, and shown to the architect", async () => {
    const goal = makeGoal();
    try {
      const scope = await idleIntentSteerPart1(goal);
      await idleIntentSteerPart2(goal, scope);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

/**
 * A watch a test can wait out: it looks every 20ms, and the run config's
 * `limits.steerDebounceSeconds` settles a steer after 30ms.
 */
const TICK_MS = 20;
const DEBOUNCE_SECONDS = 0.03;

/** Resolves the promise, or throws the named failure after `ms`. */
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

interface SteerScope {
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: KernelRuntime;
  harness: FakeHarness;
  /** Resolves once the scripted PM steer turn ran. */
  pmRan: Promise<void>;
  markPmRan: () => void;
}

/** A direct-runtime goal with one task and, optionally, a plan. */
async function steerScope(plan: boolean): Promise<SteerScope> {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: { overall: 1 },
      steerDebounceSeconds: DEBOUNCE_SECONDS,
    },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  // The scenario below waits out `steerDebounceSeconds`, so the run config's
  // mapping to the watch's window must hold.
  expect(runtime.limits.steerDebounceMs).toBe(DEBOUNCE_SECONDS * 1000);
  if (plan) writeFlowPlan(runtime);
  await writeFlowTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  let markPmRan!: () => void;
  const pmRan = new Promise<void>((resolve) => {
    markPmRan = resolve;
  });
  return { repo, runtime, harness, pmRan, markPmRan };
}

/**
 * An implement turn that drops its steers and stays open until the PM steer
 * turn ran: only the watch can hand a steer over while it is in flight.
 */
function longImplementTurn(
  scope: SteerScope,
  steers: string[],
  opened?: () => Promise<void>,
): FakeTurnHandler {
  return async (req, ctx) => {
    for (const [index, text] of steers.entries()) {
      await postSteer(scope.runtime.store, `s${index + 1}`, text);
    }
    await opened?.();
    ctx.writeOutcome(flowOutcome({ summary: "alpha implemented" }));
    await within(
      scope.pmRan,
      10_000,
      "the steer PM turn did not run before the implement turn ended",
    );
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    return fakeTurnResult(req);
  };
}

/** The PM steer turn: every steer reached it, and each waits for the architect. */
function steerTurnPm(
  ids: string[],
  texts: string[],
  ran: () => void,
): FakeTurnHandler {
  return (req, ctx) => {
    for (const text of texts) expect(req.prompt).toContain(text);
    ctx.writeOutcome(
      flowOutcome({
        summary: `routed ${ids.join(", ")}`,
        steerRoutes: ids.map((steer) => ({ steer, route: "architect" })),
      }),
    );
    ran();
    return fakeTurnResult(req);
  };
}

async function runSteerScenario(
  scope: SteerScope,
  steers: string[],
  opened?: () => Promise<void>,
) {
  const { harness, runtime } = scope;
  harness.script(longImplementTurn(scope, steers, opened), {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  harness.script(
    steerTurnPm(
      steers.map((_, index) => `s${index + 1}`),
      steers,
      scope.markPmRan,
    ),
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(approver("alpha is correct"), {
    when: whenTurn({ slug: "alpha", step: "review" }),
  });
  return runDispatch(runtime, {
    iteration: 1,
    seenSteers: [],
    steerWatchTickMs: TICK_MS,
  });
}

function registerLongTurnSteerPart1(): void {
  it("gets its PM steer turn before that turn ends", async () => {
    const scope = await steerScope(true);
    try {
      const steer = "Keep alpha unmerged until I answer.";
      const dispatched = await runSteerScenario(scope, [steer]);

      expect(dispatched.reason).toBe("boundary");
      const pm = (await scope.runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
      expect(pm).toHaveLength(1);
      expect((await flowTasks(scope.runtime)).tasks.alpha!.status).toBe(
        "merged",
      );
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

function registerLongTurnSteerPart2(): void {
  it("gets one PM turn for the whole batch", async () => {
    const scope = await steerScope(true);
    try {
      const batch = [
        "Keep alpha unmerged until I answer.",
        "Then add a note to the plan.",
      ];
      const dispatched = await runSteerScenario(scope, batch);

      expect(dispatched.reason).toBe("boundary");
      const pm = scope.harness.calls.filter(
        (call) => fakeTurnIdentity(call).step === "pm",
      );
      expect(pm).toHaveLength(1);
      for (const text of batch) expect(pm[0]!.prompt).toContain(text);
      expect((await flowTasks(scope.runtime)).tasks.alpha!.status).toBe(
        "merged",
      );
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

function registerLongTurnSteerPart3(): void {
  it("waits in the inbox for the plan, then takes its turn", async () => {
    const scope = await steerScope(false);
    try {
      const steer = "Amend the plan before alpha starts.";
      const dispatched = await runSteerScenario(scope, [steer], async () => {
        // Watch ticks pass with the steer stable and due; without a plan it is
        // not claimed and no PM turn runs for it.
        await sleep(200);
        expect(
          (await scope.runtime.store.listRecords()).filter(
            (record) => record.step === "pm",
          ),
        ).toHaveLength(0);
        writeFlowPlan(scope.runtime);
      });

      expect(dispatched.reason).toBe("boundary");
      const pm = (await scope.runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
      expect(pm).toHaveLength(1);
      expect(
        fs.existsSync(
          path.join(scope.runtime.store.goalDir, "mailbox/inbox/s1.md"),
        ),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

describe("steer dropped during a long turn", () => {
  registerLongTurnSteerPart1();

  registerLongTurnSteerPart2();

  registerLongTurnSteerPart3();
});
