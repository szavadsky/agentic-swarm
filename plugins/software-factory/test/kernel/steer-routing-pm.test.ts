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
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { causeText, task } from "./helpers.js";
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
  editPlan,
  implementer,
  inboxHas,
  outboxOf,
  stateOf,
  writeHold,
  writePlan,
} from "./steer-helpers.js";

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
  expect(pack).toContain(
    `- probe-page: ${spikeReportPath("probe-page")} (34 bytes)`,
  );
  expect(pack).not.toContain("Cursor pagination wins.");
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

describe("steer PM routing", () => {
  steerPMRoutingPart2();
});
