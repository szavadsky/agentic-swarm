import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { type BoundaryResult, runBoundary } from "../../src/kernel/boundary.js";
import { type DispatchResult, runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { appendPark } from "../../src/kernel/record.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { cause, causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  editPlan,
  inboxHas,
  outboxOf,
  stateOf,
  writeHold,
  writePlan,
} from "./steer-helpers.js";

/** Where the steer lands relative to the run it interrupts. */
type Arrival = "before-plan" | "architect" | "in-flight";

/** The turns a scenario drove and the state they left, for its own assertions. */
interface ScenarioScope {
  harness: FakeHarness;
  runtime: KernelRuntime;
  dispatched?: DispatchResult;
  boundary?: BoundaryResult;
}

/** One steer scenario from INTENT's list: how it lands, who answers, the answer. */
interface SteerScenario {
  name: string;
  /** The steer file's content; frontmatter when the scenario needs it. */
  steer: string;
  arrival: Arrival;
  /** The task whose implement turn drops an in-flight steer; defaults to alpha. */
  dropsIn?: string;
  /** The PM answers on the spot, or the steer waits for the next architect. */
  answerBy: "pm" | "architect";
  /** The answer the outbox must carry. */
  answer: string;
  /** The scenario's own turns: its PM route, intent agent or stall fallback. */
  script?: (
    harness: FakeHarness,
    runtime: KernelRuntime,
    scenario: SteerScenario,
  ) => void;
  /** State a scenario needs before dispatch starts. */
  prepare?: (runtime: KernelRuntime) => Promise<void>;
  /** Facts beyond the shared outbox assertion. */
  assert?: (scope: ScenarioScope, scenario: SteerScenario) => Promise<void>;
}

const EXPORT_INTENT = "# Goal\n\nTest goal.\nExport is in scope.\n";

const REWORK_TASK = [
  "---",
  "slug: alpha-retry",
  "title: alpha retry",
  "flow: implement-review",
  "deps: []",
  "source: 'steer: s1'",
  "base: alpha",
  "---",
  "",
  "Redo alpha.",
  "Done when: alpha works.",
  "",
].join("\n");

function intentPath(runtime: KernelRuntime): string {
  return path.join(runtime.store.goalDir, "intent.md");
}

/** Free turns for tasks the scenario does not name: write a file, approve it. */
function scriptTaskTurns(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      const slug = fakeTurnIdentity(req).slug!;
      fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }), fallback: true },
  );
}

/** An implement turn that drops the steer mid-iteration, then does its work. */
function steerDropper(
  runtime: KernelRuntime,
  slug: string,
  steer: string,
): FakeTurnHandler {
  return async (req, ctx) => {
    await postSteer(runtime.store, "s1", steer);
    fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
    return fakeTurnResult(req);
  };
}

/** An architect turn the steer arrives during: after the boundary's inbox read. */
function architectDropsSteer(
  runtime: KernelRuntime,
  steer: string,
): FakeTurnHandler {
  return async (req, ctx) => {
    expect(req.prompt).not.toContain(steer);
    await postSteer(runtime.store, "s1", steer);
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({ summary: "planned with the steer held", decision: "continue" }),
    );
    return fakeTurnResult(req);
  };
}

/** The architect's answer to the steer every architect-answered row presents. */
function architectAnswers(
  runtime: KernelRuntime,
  scenario: SteerScenario,
): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md)");
    if (scenario.arrival === "before-plan") writePlan(runtime);
    else editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered the steer",
        decision: "continue",
        steerAnswers: [{ steer: "s1", answer: scenario.answer }],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** A PM steer turn that amends a pending task and answers in the outbox. */
function pmAmends(
  runtime: KernelRuntime,
  slug: string,
  amendment: string,
  answer: string,
): FakeTurnHandler {
  return (req, ctx) => {
    fs.appendFileSync(
      path.join(runtime.store.tasksDir, `${slug}.md`),
      `\nPM amended: ${amendment}.\n`,
      "utf8",
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: answer,
        steerRoutes: [{ steer: "s1", route: "task", answer }],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** A PM steer turn that writes a rework task and answers in the outbox. */
function pmRework(runtime: KernelRuntime, answer: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(
      path.join(runtime.store.tasksDir, "alpha-retry.md"),
      REWORK_TASK,
      "utf8",
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: answer,
        steerRoutes: [{ steer: "s1", route: "task", answer }],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** A PM steer turn that stalls the goal, which drains dispatch. */
function pmStalls(runtime: KernelRuntime): FakeTurnHandler {
  return (req, ctx) => {
    writeHold(runtime, "s1", [], true);
    ctx.writeOutcome(
      outcome({
        summary: "the steer stalls the goal",
        steerRoutes: [{ steer: "s1", route: "stall" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** A PM steer turn that routes the amendment into the intent, holding beta. */
function pmRoutesIntent(runtime: KernelRuntime): FakeTurnHandler {
  return (req, ctx) => {
    writeHold(runtime, "s1", ["beta"]);
    ctx.writeOutcome(
      outcome({
        summary: "the steer amends the intent",
        steerRoutes: [{ steer: "s1", route: "intent" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

function intentAgent(runtime: KernelRuntime): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(intentPath(runtime), EXPORT_INTENT, "utf8");
    ctx.writeOutcome(outcome({ summary: "intent now covers export" }));
    return fakeTurnResult(req);
  };
}

/** Scripts where this scenario's steer lands. */
function scriptArrival(
  harness: FakeHarness,
  runtime: KernelRuntime,
  scenario: SteerScenario,
): void {
  if (scenario.arrival === "in-flight") {
    const slug = scenario.dropsIn ?? "alpha";
    harness.script(steerDropper(runtime, slug, scenario.steer), {
      when: whenTurn({ slug, step: "implement" }),
    });
  }
  if (scenario.arrival === "architect") {
    harness.script(architectDropsSteer(runtime, scenario.steer), {
      when: whenTurn({ step: "architect" }),
    });
  }
}

/** The PM steer turn for `steer`: its prompt carries the text; a plan PM turn does not. */
function steerPm(steer: string): (req: TurnRequest) => boolean {
  return (req) => whenTurn({ step: "pm" })(req) && req.prompt.includes(steer);
}

/**
 * Runs one scenario end to end: the steer lands at its arrival, its route or
 * the next architect answers, and the shared tail asserts the outbox.
 */
async function runSteerScenario(scenario: SteerScenario): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1 } },
  });
  try {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    scriptTaskTurns(harness);
    if (scenario.arrival !== "before-plan") {
      writePlan(runtime);
      await writeTask(runtime, task("alpha"));
      await writeTask(runtime, task("beta"));
    }
    await scenario.prepare?.(runtime);
    scriptArrival(harness, runtime, scenario);
    scenario.script?.(harness, runtime, scenario);
    if (scenario.answerBy === "architect") {
      harness.script(architectAnswers(runtime, scenario), {
        when: whenTurn({ step: "architect" }),
      });
    }
    // Every boundary ends its architect flow with a plan PM turn.
    if (scenario.arrival !== "in-flight" || scenario.answerBy === "architect") {
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
    }
    if (scenario.arrival === "before-plan") {
      await postSteer(runtime.store, "s1", scenario.steer);
    }

    const scope: ScenarioScope = { harness, runtime };
    if (scenario.arrival === "before-plan") {
      scope.boundary = await runBoundary(runtime, { relaunch: false });
    } else {
      // A steer landing mid-architect waits beside the flow it interrupted; the
      // dispatch that follows gives it the PM turn with the ready plan.
      if (scenario.arrival === "architect") {
        scope.boundary = await runBoundary(runtime, { relaunch: false });
      }
      scope.dispatched = await runDispatch(runtime, { iteration: 1 });
      if (scenario.answerBy === "architect") {
        scope.boundary = await runBoundary(runtime, { relaunch: false });
      }
    }

    if (scope.boundary) expect(scope.boundary.decision).toBe("continue");
    expect(outboxOf(runtime, "s1")).toContain(scenario.answer);
    expect(inboxHas(runtime, "s1")).toBe(false);
    expect(await runtime.store.mailbox.files("processed")).toContain("s1.md");
    await scenario.assert?.(scope, scenario);
  } finally {
    cleanupFlowRepo(repo);
  }
}

function pmSteerRouteTurns(records: readonly StepRecord[]) {
  return records.filter(
    (record) => record.step === "pm" && record.outcome?.steerRoutes,
  );
}

/**
 * Asserts a plancheck turn ran before the architect that answers the steer.
 */
function planCheckPrecedesArchitect(harness: FakeHarness): void {
  const steps = harness.calls.map((call) => fakeTurnIdentity(call).step);
  const lastPlanCheck = steps.lastIndexOf("plancheck");
  const firstArchitect = steps.indexOf("architect");
  expect(lastPlanCheck).toBeGreaterThanOrEqual(0);
  expect(firstArchitect).toBeGreaterThanOrEqual(0);
  expect(lastPlanCheck).toBeLessThan(firstArchitect);
}

const SCENARIOS: SteerScenario[] = [
  {
    name: "pre-launch: the first architect takes the steer into the plan and answers it",
    steer: "Take the export requirement into the whole plan.",
    arrival: "before-plan",
    answerBy: "architect",
    answer: "the plan takes the export requirement whole",
    assert: async ({ runtime }) => {
      // No plan yet: the PM is never launched and the architect owns the steer.
      expect(pmSteerRouteTurns(await runtime.store.listRecords())).toHaveLength(
        0,
      );
    },
  },
  {
    name: "during architect flow: the steer waits for the PM with the ready plan and is answered",
    steer: "Widen beta for the edge case.",
    arrival: "architect",
    answerBy: "pm",
    answer: "amended beta for the edge case",
    script: (harness, runtime, scenario) => {
      harness.script(
        pmAmends(runtime, "beta", "edge W", "amended beta for the edge case"),
        { when: steerPm(scenario.steer) },
      );
    },
    assert: async ({ dispatched, harness, runtime }, scenario) => {
      expect(dispatched!.reason).toBe("boundary");
      const architect = harness.calls.findIndex(
        (call) => fakeTurnIdentity(call).step === "architect",
      );
      const steerTurn = harness.calls.findIndex((call) =>
        call.prompt.includes(scenario.steer),
      );
      expect(architect).toBeGreaterThanOrEqual(0);
      expect(steerTurn).toBeGreaterThan(architect);
      expect(fakeTurnIdentity(harness.calls[steerTurn]!).step).toBe("pm");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
      ).toContain("PM amended: edge W.");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("merged");
    },
  },
  {
    name: "task redo: the PM writes a rework task with its base and answers the steer",
    steer: "Redo alpha on its branch.",
    arrival: "in-flight",
    dropsIn: "beta",
    answerBy: "pm",
    answer: "wrote alpha-retry on alpha",
    prepare: async (runtime) => {
      await appendPark(
        runtime.store,
        { iteration: 1, slug: "alpha", round: 1, revision: 0 },
        cause("flaky foundation"),
      );
    },
    script: (harness, runtime, scenario) => {
      harness.script(pmRework(runtime, "wrote alpha-retry on alpha"), {
        when: steerPm(scenario.steer),
      });
      scriptStallLeave(harness, ["alpha", "alpha-retry"]);
    },
    assert: async ({ dispatched, runtime }) => {
      expect(dispatched!.reason).toBe("boundary");
      const retry = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha-retry.md"),
        "utf8",
      );
      expect(retry).toContain("base: alpha");
      expect(retry).toContain("steer: s1");
    },
  },
  {
    name: "stall: the PM stalls the goal, dispatch drains, then the architect answers",
    steer: "Stop: new priority first.",
    arrival: "in-flight",
    answerBy: "architect",
    answer: "replanned around the new priority",
    script: (harness, runtime, scenario) => {
      harness.script(pmStalls(runtime), { when: steerPm(scenario.steer) });
    },
    assert: async ({ dispatched, harness, runtime }) => {
      expect(dispatched!.reason).toBe("drained");
      expect(causeText(dispatched!.cause)).toBe("steer: s1 goal hold");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("ready");
      planCheckPrecedesArchitect(harness);
    },
  },
  {
    name: "urgent drain: dispatch drains without a PM turn and the next consult answers",
    steer: "---\nurgent: true\n---\nStop the rollout and consult me.",
    arrival: "in-flight",
    answerBy: "architect",
    answer: "rolling back the rollout",
    assert: async ({ dispatched, harness, runtime }) => {
      expect(dispatched!.reason).toBe("drained");
      expect(causeText(dispatched!.cause)).toBe("steer: s1 marked urgent");
      // Urgency is the owner's exception: no PM turn ever routes this steer.
      expect(pmSteerRouteTurns(await runtime.store.listRecords())).toHaveLength(
        0,
      );
      planCheckPrecedesArchitect(harness);
    },
  },
  {
    name: "intent change: the PM carries the steer into the intent, the architect answers it",
    steer: "Amend intent: export is in scope.",
    arrival: "in-flight",
    answerBy: "architect",
    answer: "carried the amendment into the intent",
    script: (harness, runtime, scenario) => {
      harness.script(pmRoutesIntent(runtime), {
        when: steerPm(scenario.steer),
      });
      harness.script(intentAgent(runtime), {
        when: whenTurn({ slug: "s1", step: "intent" }),
      });
    },
    assert: async ({ runtime }) => {
      expect(fs.readFileSync(intentPath(runtime), "utf8")).toContain(
        "Export is in scope.",
      );
      const intentTurns = (await runtime.store.listRecords()).filter(
        (record) => record.step === "intent" && record.slug === "s1",
      );
      expect(intentTurns).toHaveLength(1);
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("ready");
    },
  },
];

describe("every steer scenario ends with an outbox answer", () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, () => runSteerScenario(scenario), 60_000);
  }
});
