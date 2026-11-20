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
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { appendPark } from "../../src/kernel/record.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task, cause, causeText } from "./helpers.js";
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
  writePlan,
  editPlan,
  writeHold,
  stateOf,
  implementer,
  approver,
  outboxOf,
  inboxHas,
} from "./steer-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("steer PM routing", () => {
  steerPMRoutingPart1();
  steerPMRoutingPart2();
  steerPMRoutingPart3();
});

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

async function packListsOnlyArchitectRoutedSteersPart1(
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
      await postSteer(runtime.store, "s-task", "Beta needs edge Y.");
      await postSteer(runtime.store, "s-arch", "Should we split beta?");
    }),
  );
  harness.script((req, ctx) => {
    const betaFile = path.join(runtime.store.tasksDir, "beta.md");
    fs.appendFileSync(betaFile, "\nPM amended: edge Y.\n", "utf8");
    writeHold(runtime, "s-task", []);
    writeHold(runtime, "s-arch", []);
    ctx.writeOutcome(
      outcome({
        summary: "routed one task and one architect",
        steerRoutes: [
          { steer: "s-task", route: "task", answer: "amended beta" },
          { steer: "s-arch", route: "architect" },
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
  expect(inboxHas(runtime, "s-task")).toBe(false);
  expect(inboxHas(runtime, "s-arch")).toBe(true);

  return { harness, runtime };
}

async function packListsOnlyArchitectRoutedSteersPart2(
  scope: Awaited<ReturnType<typeof packListsOnlyArchitectRoutedSteersPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("s-arch (mailbox/inbox/s-arch.md)");
    expect(req.prompt).not.toContain("s-task");
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered architect steer",
        decision: "continue",
        forward: ["steer s-arch: keep beta whole"],
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
  expect(pack).toContain("- s-arch: mailbox/inbox/s-arch.md");
  expect(pack).not.toContain("s-task: mailbox/inbox/s-task.md");
  expect(pack).toContain("- s-task [task]: amended beta");
  expect(pack).toContain("- s-arch [architect]");
  expect(outboxOf(runtime, "s-arch")).toContain("keep beta whole");
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

async function refusesHoldNamingSpikeTaskOwnSteerPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  const spikeFile = path.join(
    runtime.store.tasksDir,
    "no-outcome-forensics-spike.md",
  );
  const writeSpikeHoldingItself: FakeTurnHandler = (req, ctx) => {
    fs.writeFileSync(
      spikeFile,
      [
        "---",
        "slug: no-outcome-forensics-spike",
        "title: no-outcome forensics spike",
        "kind: spike",
        "flow: spike",
        "deps: []",
        "scope: [probe.txt]",
        "source: 'steer: no-outcome-forensics'",
        "---",
        "",
        "Investigate the outcome detector.",
        "Done when: findings reported.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeHold(runtime, "no-outcome-forensics", ["no-outcome-forensics-spike"]);
    ctx.writeOutcome(
      outcome({
        summary: "wrote the spike",
        steerRoutes: [{ steer: "no-outcome-forensics", route: "spike" }],
      }),
    );
    return fakeTurnResult(req);
  };

  return { harness, runtime, spikeFile, writeSpikeHoldingItself };
}

async function refusesHoldNamingSpikeTaskOwnSteerPart2(
  scope: Awaited<ReturnType<typeof refusesHoldNamingSpikeTaskOwnSteerPart1>>,
) {
  const { harness, runtime, writeSpikeHoldingItself, spikeFile } = scope;
  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(
        runtime.store,
        "no-outcome-forensics",
        "Investigate why no-outcome findings are detector-wrong.",
      );
    }),
  );
  // Both rungs write the self-hold: each is refused, so the route is never
  // committed and the created task is rolled back with the rung.
  harness.script(writeSpikeHoldingItself, {
    when: whenTurn({ step: "pm" }),
  });
  harness.script(writeSpikeHoldingItself, {
    when: whenTurn({ step: "pm" }),
  });
  harness.script(approver("alpha is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const refused = records.filter(
    (record) => record.step === "pm-validate" && record.ok === false,
  );
  expect(refused).toHaveLength(2);
  for (const record of refused) {
    expect(causeText(record.cause)).toContain(
      "hold names task(s) it creates: no-outcome-forensics-spike",
    );
  }
  expect(records.some((record) => record.step === "steer-routes")).toBe(false);
  expect(fs.existsSync(spikeFile)).toBe(false);
  expect(inboxHas(runtime, "no-outcome-forensics")).toBe(true);
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
  // boundary must never read it.
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

async function spikeWritesStandaloneTaskWhosePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "How should pagination work?");
    }),
  );
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(runtime.store.tasksDir, "probe-page.md"),
      [
        "---",
        "slug: probe-page",
        "title: probe pagination",
        "kind: spike",
        "flow: spike",
        "deps: []",
        "scope: [probe.txt]",
        "source: 'steer: s1'",
        "---",
        "",
        "Probe pagination.",
        "Done when: finding reported.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "wrote probe-page for s1",
        steerRoutes: [{ steer: "s1", route: "spike" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("alpha is correct"));

  return { harness, runtime };
}

async function spikeWritesStandaloneTaskWhosePart2(
  scope: Awaited<ReturnType<typeof spikeWritesStandaloneTaskWhosePart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "probe.txt"), "finding\n", "utf8");
    const report = path.join(req.cwd!, spikeReportPath("probe-page"));
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, "# Finding\n\nCursor pagination wins.\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "cursor pagination wins" }));
    return fakeTurnResult(req);
  });
  harness.script(approver("finding is solid"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect((await stateOf(runtime)).tasks["probe-page"]!.status).toBe("finished");
  // The spike steer stays pending with no answer until its task lands.
  expect(inboxHas(runtime, "s1")).toBe(true);
  expect(
    fs.existsSync(
      path.join(runtime.store.goalDir, "mailbox/outbox", "steer-s1.md"),
    ),
  ).toBe(false);

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
  // The sealed report, not the outcome summary, answers the owner.
  expect(outboxOf(runtime, "s1")).toContain("Cursor pagination wins.");
  expect(outboxOf(runtime, "s1")).not.toContain("cursor pagination wins");
  expect(inboxHas(runtime, "s1")).toBe(false);

  return { ...scope, boundary };
}

async function spikeWritesStandaloneTaskWhosePart3(
  scope: Awaited<ReturnType<typeof spikeWritesStandaloneTaskWhosePart2>>,
) {
  const { runtime, boundary } = scope;
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, boundary.packPath!),
    "utf8",
  );
  expect(pack).not.toContain("- s1: mailbox/inbox/s1.md");
  expect(pack).toContain("- s1 [spike]");
  expect(pack).toContain("## Spike findings");
  expect(pack).toContain("  Cursor pagination wins.");
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

function steerPMRoutingPart2() {
  it("spike: writes a standalone task whose landed outcome is answered to the owner", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await spikeWritesStandaloneTaskWhosePart1(repo, goal);
      const scope2 = await spikeWritesStandaloneTaskWhosePart2(scope1);
      await spikeWritesStandaloneTaskWhosePart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses a hold naming the spike task its own steer creates", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await refusesHoldNamingSpikeTaskOwnSteerPart1(repo, goal);
      await refusesHoldNamingSpikeTaskOwnSteerPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("pack lists only architect-routed steers plus every PM answer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await packListsOnlyArchitectRoutedSteersPart1(repo, goal);
      await packListsOnlyArchitectRoutedSteersPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
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
