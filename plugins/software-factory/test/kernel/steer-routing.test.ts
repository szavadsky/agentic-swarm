import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { appendPark, scriptMeta } from "../../src/kernel/record.js";
import {
  spikeReportPath,
  spikeReportRef,
} from "../../src/kernel/spike-report.js";
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
import {
  approver,
  editPlan,
  implementer,
  inboxHas,
  outboxOf,
  stateOf,
  writeHold,
  writePlan,
} from "./steer-helpers.js";

async function doesNotFailSteerTurnFindingGraphPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  // A pre-existing, underivable graph finding: no steer turn can fix it.
  await writeTask(
    runtime,
    task("stuck", { scope: ["stuck.txt"], deps: ["gone"] }),
  );

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "Beta needs edge W.");
    }),
  );
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(runtime.store.tasksDir, "beta.md"),
        "\nPM amended: edge W.\n",
        "utf8",
      );
      writeHold(runtime, "s1", []);
      ctx.writeOutcome(
        outcome({
          summary: "amended beta for s1",
          steerRoutes: [
            {
              steer: "s1",
              route: "task",
              answer: "amended beta with edge W",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(approver("alpha is correct"));
  harness.script(implementer("beta.txt"));
  harness.script(approver("beta is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });

  return { runtime, dispatched };
}

async function doesNotFailSteerTurnFindingGraphPart2(
  scope: Awaited<ReturnType<typeof doesNotFailSteerTurnFindingGraphPart1>>,
) {
  const { dispatched, runtime } = scope;
  expect(dispatched.reason).toBe("boundary");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
  ).toContain("PM amended: edge W.");
  expect(outboxOf(runtime, "s1")).toContain("amended beta with edge W");
  expect(inboxHas(runtime, "s1")).toBe(false);
  const records = await runtime.store.listRecords();
  expect(records.some((r) => r.step === "steer-routes" && r.ok === true)).toBe(
    true,
  );
  expect(records.some((r) => r.step === "pm-validate")).toBe(false);
}

async function taskAmendsPendingTaskFileAnswersPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "Beta needs edge X.");
    }),
  );
  harness.script((req, ctx) => {
    const betaFile = path.join(runtime.store.tasksDir, "beta.md");
    fs.appendFileSync(betaFile, "\nPM amended: edge X.\n", "utf8");
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "amended beta for s1",
        steerRoutes: [
          {
            steer: "s1",
            route: "task",
            answer: "amended beta with edge X",
          },
        ],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("alpha is correct"));
  harness.script(implementer("beta.txt"));
  harness.script(approver("beta is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
  ).toContain("PM amended: edge X.");
  expect(outboxOf(runtime, "s1")).toContain("amended beta with edge X");
  expect(inboxHas(runtime, "s1")).toBe(false);
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    false,
  );
  const beta = (await stateOf(runtime)).tasks.beta!;

  return { harness, runtime, beta };
}

async function taskAmendsPendingTaskFileAnswersPart2(
  scope: Awaited<ReturnType<typeof taskAmendsPendingTaskFileAnswersPart1>>,
) {
  const { beta, harness, runtime } = scope;
  expect(beta.status).toBe("merged");

  // The next boundary never sees the answered steer, but its pack names the answer.
  harness.script((req, ctx) => {
    expect(req.prompt).not.toContain("s1 (mailbox/inbox/s1.md)");
    editPlan(runtime);
    ctx.writeOutcome(outcome({ summary: "no steers", decision: "continue" }));
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
  expect(pack).not.toContain("- s1: mailbox/inbox/s1.md");
  expect(pack).toContain("- s1 [task]: amended beta with edge X");
}

async function taskRedoWritesReworkTaskBaseNextPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await appendPark(
    runtime.store,
    { iteration: 1, slug: "alpha", round: 1, revision: 0 },
    cause("flaky foundation"),
  );
  expect((await stateOf(runtime)).tasks.alpha!.status).toBe("parked");

  harness.script(
    implementer("beta.txt", async () => {
      await postSteer(runtime.store, "s1", "Redo alpha on its branch.");
    }),
  );

  return { harness, runtime };
}

async function taskRedoWritesReworkTaskBaseNextPart2(
  scope: Awaited<ReturnType<typeof taskRedoWritesReworkTaskBaseNextPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(runtime.store.tasksDir, "alpha-retry.md"),
      [
        "---",
        "slug: alpha-retry",
        "title: alpha retry",
        "flow: implement-review",
        "deps: []",
        "scope: [alpha.txt]",
        "source: 'steer: s1'",
        "base: alpha",
        "---",
        "",
        "Redo alpha.",
        "Done when: alpha works.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "wrote alpha-retry for s1",
        steerRoutes: [
          {
            steer: "s1",
            route: "task",
            answer: "wrote alpha-retry on alpha",
          },
        ],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("beta is correct"));
  // beta merged and both alpha and its branch-less retry parked: the
  // wave-end stall leaves them for the boundary.
  scriptStallLeave(harness, ["alpha", "alpha-retry"]);

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
}

async function taskRedoWritesReworkTaskBaseNextPart3(
  scope: Awaited<ReturnType<typeof taskRedoWritesReworkTaskBaseNextPart1>>,
) {
  const { runtime, harness } = scope;
  const retryFile = fs.readFileSync(
    path.join(runtime.store.tasksDir, "alpha-retry.md"),
    "utf8",
  );
  expect(retryFile).toContain("base: alpha");
  expect(retryFile).toContain("steer: s1");
  expect(outboxOf(runtime, "s1")).toContain("wrote alpha-retry");
  expect(inboxHas(runtime, "s1")).toBe(false);

  // The boundary PM derives from the plan, which never names the rework slug;
  // provenance exempts it from the cancel-removed rule.
  harness.script((req, ctx) => {
    editPlan(runtime);
    ctx.writeOutcome(outcome({ summary: "continue", decision: "continue" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  const records = await runtime.store.listRecords();
  expect(
    records.some((r) => r.slug === "alpha-retry" && r.step === "cancel"),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(runtime.store.tasksDir, "alpha-retry.md")),
  ).toBe(true);
}

async function spikeSteerAnsweredWhenItsTaskSettlesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await postSteer(runtime.store, "s1", "How should pagination work?");
  // The PM's committed route: the steer waits for this spike's outcome.
  await runtime.store.appendRecord(
    scriptMeta(1, "steer-routes", { round: 1 }),
    {
      ok: true,
      outcome: outcome({
        summary: "steer routes: s1=spike",
        steerRoutes: [{ steer: "s1", route: "spike" }],
      }),
    },
  );
  await writeTask(
    runtime,
    task("probe-page", {
      title: "probe pagination",
      kind: "spike",
      flow: "spike",
      source: "steer: s1",
      body: "Probe pagination.\nDone when: finding reported.",
    }),
  );

  harness.script((req, ctx) => {
    // The only linked task is still in flight: no answer yet.
    expect(inboxHas(runtime, "s1")).toBe(true);
    expect(
      fs.existsSync(
        path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"),
      ),
    ).toBe(false);
    fs.writeFileSync(path.join(req.cwd!, "probe.txt"), "finding\n", "utf8");
    const report = path.join(req.cwd!, spikeReportPath("probe-page"));
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, "# Finding\n\nCursor pagination wins.\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "cursor pagination wins" }));
    return fakeTurnResult(req);
  });
  harness.script(approver("finding is solid"));

  const dispatched = await runDispatch(runtime, {
    iteration: 1,
    seenSteers: ["s1"],
  });

  return { dispatched, runtime };
}

async function spikeSteerAnsweredWhenItsTaskSettlesPart2(
  scope: Awaited<ReturnType<typeof spikeSteerAnsweredWhenItsTaskSettlesPart1>>,
) {
  const { dispatched, runtime } = scope;
  expect(dispatched.reason).toBe("boundary");
  expect((await stateOf(runtime)).tasks["probe-page"]!.status).toBe("finished");
  // The spike settled during dispatch, so its finding answers the steer there;
  // no boundary ran.
  expect(outboxOf(runtime, "s1")).toContain("Cursor pagination wins.");
  expect(outboxOf(runtime, "s1")).not.toContain("cursor pagination wins");
  expect(inboxHas(runtime, "s1")).toBe(false);
}

async function closedGoalWithSettledSpike(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
  repo.writeFile(
    spikeReportPath("probe-page"),
    "# Finding\n\nCursor pagination wins.\n",
  );
  const commit = repo.commit("seal the spike report", [
    spikeReportPath("probe-page"),
  ]);
  await runtime.store.appendRecord(
    scriptMeta(1, "finish", { slug: "probe-page" }),
    { ok: true, report: spikeReportRef(commit, "probe-page") },
  );
  // Blocked after the spike settled, before its answer: no boundary opens.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect",
      model: { id: "fake-architect" },
    },
    { ok: true, outcome: outcome({ summary: "blocked", decision: "blocked" }) },
  );
}

async function spikeSteerAnsweredOnTerminalResumePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await postSteer(runtime.store, "s1", "How should pagination work?");
  await runtime.store.appendRecord(
    scriptMeta(1, "steer-routes", { round: 1 }),
    {
      ok: true,
      outcome: outcome({
        summary: "steer routes: s1=spike",
        steerRoutes: [{ steer: "s1", route: "spike" }],
      }),
    },
  );
  await writeTask(
    runtime,
    task("probe-page", {
      title: "probe pagination",
      kind: "spike",
      flow: "spike",
      source: "steer: s1",
      body: "Probe pagination.\nDone when: finding reported.",
    }),
  );
  await closedGoalWithSettledSpike(repo, runtime);
  return { runtime };
}

async function spikeSteerAnsweredOnTerminalResumePart2(
  scope: Awaited<ReturnType<typeof spikeSteerAnsweredOnTerminalResumePart1>>,
) {
  const { runtime } = scope;
  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("terminal");
  expect(outboxOf(runtime, "s1")).toContain("Cursor pagination wins.");
  expect(inboxHas(runtime, "s1")).toBe(false);
  expect(await runtime.store.mailbox.files("processed")).toContain("s1.md");
}

function steerPMRoutingPart1() {
  it("task: amends the pending task file and answers in the outbox", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await taskAmendsPendingTaskFileAnswersPart1(repo, goal);
      await taskAmendsPendingTaskFileAnswersPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not fail a steer turn on a finding the graph already had", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await doesNotFailSteerTurnFindingGraphPart1(repo, goal);
      await doesNotFailSteerTurnFindingGraphPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("spike: answers its steer when the linked task settles, without a boundary", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await spikeSteerAnsweredWhenItsTaskSettlesPart1(
        repo,
        goal,
      );
      await spikeSteerAnsweredWhenItsTaskSettlesPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("spike: answers a settled steer on a terminal resume, without a boundary", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await spikeSteerAnsweredOnTerminalResumePart1(repo, goal);
      await spikeSteerAnsweredOnTerminalResumePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("task redo: writes a rework task with base and the next reconcile keeps it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await taskRedoWritesReworkTaskBaseNextPart1(repo, goal);
      await taskRedoWritesReworkTaskBaseNextPart2(scope1);
      await taskRedoWritesReworkTaskBaseNextPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("steer PM routing", () => {
  steerPMRoutingPart1();
});
