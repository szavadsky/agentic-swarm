import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
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
