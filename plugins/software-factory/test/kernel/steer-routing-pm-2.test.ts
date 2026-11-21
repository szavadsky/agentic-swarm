import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  editPlan,
  implementer,
  inboxHas,
  outboxOf,
  writeHold,
  writePlan,
} from "./steer-helpers.js";

async function frozenSteerTurnCannotEditMergedPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "alpha",
      step: "merge",
      round: 1,
      actor: "script",
    },
    { ok: true },
  );
  const frozenBefore = fs.readFileSync(
    path.join(runtime.store.tasksDir, "alpha.md"),
    "utf8",
  );

  harness.script(
    implementer("beta.txt", async () => {
      await postSteer(runtime.store, "s1", "Gamma needs edge Z.");
    }),
  );

  return { harness, runtime, frozenBefore };
}

async function frozenSteerTurnCannotEditMergedPart2(
  scope: Awaited<ReturnType<typeof frozenSteerTurnCannotEditMergedPart1>>,
) {
  const { harness, runtime, frozenBefore } = scope;
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("- alpha | merged");
    expect(req.prompt).toContain("frozen (read-only)");
    fs.appendFileSync(
      path.join(runtime.store.tasksDir, "alpha.md"),
      "\nPM broke frozen.\n",
      "utf8",
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "tried frozen",
        steerRoutes: [{ steer: "s1", route: "task", answer: "edited alpha" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("frozen");
    const gammaFile = path.join(runtime.store.tasksDir, "gamma.md");
    fs.appendFileSync(gammaFile, "\nPM amended: edge Z.\n", "utf8");
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "amended gamma for s1",
        steerRoutes: [{ steer: "s1", route: "task", answer: "amended gamma" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("beta is correct"));
  harness.script(implementer("gamma.txt"));
  harness.script(approver("gamma is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
  ).toBe(frozenBefore);
}

async function frozenSteerTurnCannotEditMergedPart3(
  scope: Awaited<ReturnType<typeof frozenSteerTurnCannotEditMergedPart1>>,
) {
  const { runtime } = scope;
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "gamma.md"), "utf8"),
  ).toContain("PM amended: edge Z.");
  expect(outboxOf(runtime, "s1")).toContain("amended gamma");
  const records = await runtime.store.listRecords();
  expect(records.filter((r) => r.step === "pm")).toHaveLength(2);
  expect(records.some((r) => r.step === "pm-reconcile")).toBe(true);
}

async function exhaustedFailedTaskRouteReachesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  const betaBefore = fs.readFileSync(
    path.join(runtime.store.tasksDir, "beta.md"),
    "utf8",
  );

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "Beta needs edge X.");
    }),
  );
  // Both rungs amend beta and answer, but route an unclaimed extra steer:
  // validation fails, the ladder exhausts, and the writes roll back.
  const badPm: FakeTurnHandler = (req, ctx) => {
    fs.appendFileSync(
      path.join(runtime.store.tasksDir, "beta.md"),
      "\nPM amended: edge X.\n",
      "utf8",
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "amended beta for s1",
        steerRoutes: [
          { steer: "s1", route: "task", answer: "amended beta" },
          { steer: "sX", route: "architect" },
        ],
      }),
    );
    return fakeTurnResult(req);
  };
  harness.script(badPm);
  harness.script(badPm);
  harness.script(approver("alpha is correct"));
  harness.script(implementer("beta.txt"));
  harness.script(approver("beta is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
  ).toBe(betaBefore);

  return { harness, runtime };
}

async function exhaustedFailedTaskRouteReachesPart2(
  scope: Awaited<ReturnType<typeof exhaustedFailedTaskRouteReachesPart1>>,
) {
  const { runtime, harness } = scope;
  const records = await runtime.store.listRecords();
  expect(
    records.filter((r) => r.step === "pm-validate" && r.ok === false),
  ).toHaveLength(2);
  expect(records.some((r) => r.step === "steer-routes")).toBe(false);
  expect(
    fs.existsSync(
      path.join(runtime.store.goalDir, "mailbox/outbox", "steer-s1.md"),
    ),
  ).toBe(false);
  expect(inboxHas(runtime, "s1")).toBe(true);

  // The architect sees the steer verbatim and answers it; the failed
  // rung's answer claims an amendment that never happened, so the
  // boundary must never read it. The boundary first routes the still-
  // unrouted steer to the architect.
  harness.script((req, ctx) => {
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "s1 goes to the architect",
        steerRoutes: [{ steer: "s1", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered s1",
        decision: "continue",
        forward: ["steer s1: beta gets edge X next iteration"],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, boundary.packPath!),
    "utf8",
  );
  expect(pack).toContain("- s1: mailbox/inbox/s1.md");
  expect(pack).not.toContain("- s1 [task]");
  expect(outboxOf(runtime, "s1")).toContain("beta gets edge X");
  expect(outboxOf(runtime, "s1")).not.toContain("amended beta");
  expect(inboxHas(runtime, "s1")).toBe(false);
}

function steerPMRoutingPart3() {
  it("frozen: a steer turn cannot edit a merged task and retries the ladder", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await frozenSteerTurnCannotEditMergedPart1(repo, goal);
      await frozenSteerTurnCannotEditMergedPart2(scope1);
      await frozenSteerTurnCannotEditMergedPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("exhausted: a failed task route reaches the architect with no outbox answer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await exhaustedFailedTaskRouteReachesPart1(repo, goal);
      await exhaustedFailedTaskRouteReachesPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("steer PM routing", () => {
  steerPMRoutingPart3();
});
