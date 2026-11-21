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
import {
  holdsDir,
  postSteer,
  quarantineDir,
} from "../../src/kernel/mailbox.js";
import { scriptMeta } from "../../src/kernel/record.js";
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
  tasks,
  writeHold,
  writePlan,
} from "./steer-holds-helpers.js";

async function ignoresMalformedHoldSteerTurnPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

  // Every turn is bound to its slug and step, so no sleep orders the
  // scripts: whichever turn calls first takes its own handler, and the
  // steer PM turn can never consume a review (or vice versa) under load.
  const implementOnce: FakeTurnHandler = async (req, ctx) => {
    const slug = path.basename(req.cwd!);
    fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
    if (slug === "alpha") await postSteer(runtime.store, "s1", "Structure me.");
    ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
    return fakeTurnResult(req);
  };
  harness.script(implementOnce, {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  harness.script(implementOnce, {
    when: whenTurn({ slug: "beta", step: "implement" }),
  });
  harness.script(
    (req, ctx) => {
      fs.mkdirSync(holdsDir(runtime.store), { recursive: true });
      fs.writeFileSync(
        path.join(holdsDir(runtime.store), "s1.yaml"),
        "slugs: alpha\ngoal: maybe\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "wrote an invalid hold" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(approver("alpha is correct"), {
    when: whenTurn({ slug: "alpha", step: "review" }),
  });
  harness.script(approver("beta is correct"), {
    when: whenTurn({ slug: "beta", step: "review" }),
  });

  return { runtime };
}

async function ignoresMalformedHoldSteerTurnPart2(
  scope: Awaited<ReturnType<typeof ignoresMalformedHoldSteerTurnPart1>>,
) {
  const { runtime } = scope;
  const dispatched = await runDispatch(runtime, {
    iteration: 1,
    seenSteers: [],
  });
  expect(dispatched.reason).toBe("boundary");

  // The malformed hold gates nothing, and dispatch leaves it for the
  // launch sweep: still in place, no quarantine, no record.
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    true,
  );
  expect(
    fs.existsSync(path.join(quarantineDir(runtime.store), "s1.yaml")),
  ).toBe(false);
  const records = await runtime.store.listRecords();
  expect(records.some((record) => record.step === "hold-quarantine")).toBe(
    false,
  );

  // The turn already in flight settled, and the launch kept dispatching.
  expect(
    records.find(
      (record) => record.slug === "beta" && record.step === "implement",
    )?.outcome?.status,
  ).toBe("done");
  const state = await tasks(runtime);
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
}

async function expiresHoldNamesOwnSteerSSpikePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(
    runtime,
    task("no-outcome-forensics-spike", {
      title: "no-outcome forensics spike",
      kind: "spike",
      flow: "spike",
      scope: ["probe.txt"],
      source: "steer: no-outcome-forensics",
      body: "Investigate the outcome detector.\nDone when: findings reported.",
    }),
  );
  await postSteer(
    runtime.store,
    "no-outcome-forensics",
    "Investigate why no-outcome findings are detector-wrong.",
  );
  // The state the pre-fix PM left: the spike route committed, and its hold
  // naming the very task the steer created.
  await runtime.store.appendRecord(
    scriptMeta(1, "steer-routes", { round: 1 }),
    {
      ok: true,
      outcome: outcome({
        summary: "steer routes: no-outcome-forensics=spike",
        steerRoutes: [{ steer: "no-outcome-forensics", route: "spike" }],
      }),
    },
  );
  writeHold(runtime, "no-outcome-forensics", ["no-outcome-forensics-spike"]);
  const holdPath = path.join(
    holdsDir(runtime.store),
    "no-outcome-forensics.yaml",
  );

  // The i5 deadlock: dispatch can start nothing, because the spike is held
  // by the steer that is waiting for that spike.
  const blocked = await runDispatch(runtime, {
    iteration: 1,
    seenSteers: ["no-outcome-forensics"],
  });
  expect(blocked.reason).toBe("boundary");
  expect(blocked.allReadyHeld).toBe(true);

  return { harness, runtime, holdPath, blocked };
}

async function expiresHoldNamesOwnSteerSSpikePart2(
  scope: Awaited<ReturnType<typeof expiresHoldNamesOwnSteerSSpikePart1>>,
) {
  const { blocked, runtime, harness, holdPath } = scope;
  expect(causeText(blocked.cause)).toContain(
    "no-outcome-forensics holds no-outcome-forensics-spike",
  );
  expect(
    (await tasks(runtime)).tasks["no-outcome-forensics-spike"]!.status,
  ).toBe("ready");

  harness.script((req, ctx) => {
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({ summary: "self-hold cleared", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });

  const boundary = await runBoundary(runtime, {
    relaunch: false,
    iteration: 1,
  });
  expect(boundary.decision).toBe("continue");
  // The self-hold is gone, with the record that explains its expiry.
  expect(fs.existsSync(holdPath)).toBe(false);
  const expired = (await runtime.store.listRecords()).filter(
    (record) => record.step === "hold-self-expire",
  );
  expect(expired).toHaveLength(1);
  expect(expired[0]!.slug).toBe("no-outcome-forensics");
  expect(causeText(expired[0]!.cause)).toContain("no-outcome-forensics-spike");

  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "probe.txt"), "finding\n", "utf8");
    const report = path.join(
      req.cwd!,
      spikeReportPath("no-outcome-forensics-spike"),
    );
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, "# Finding\n\nKeep the detector.\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "keep the detector" }));
    return fakeTurnResult(req);
  });

  return { ...scope, boundary };
}

async function expiresHoldNamesOwnSteerSSpikePart3(
  scope: Awaited<ReturnType<typeof expiresHoldNamesOwnSteerSSpikePart2>>,
) {
  const { harness, runtime, boundary } = scope;
  harness.script(approver("finding is solid"));

  const dispatched = await runDispatch(runtime, {
    iteration: 1,
    seenSteers: boundary.seenSteers,
  });
  expect(dispatched.reason).toBe("boundary");
  expect(
    (await tasks(runtime)).tasks["no-outcome-forensics-spike"]!.status,
  ).toBe("finished");
  expect(
    (await runtime.store.listRecords()).some(
      (record) =>
        record.slug === "no-outcome-forensics-spike" &&
        record.step === "implement" &&
        record.outcome?.status === "done",
    ),
  ).toBe(true);
}

function registerMidRunSteerHoldsPart10(): void {
  it("ignores a malformed hold the steer turn writes, leaves it for the launch sweep, and keeps dispatching", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const scope1 = await ignoresMalformedHoldSteerTurnPart1(repo, goal);
      await ignoresMalformedHoldSteerTurnPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("expires a hold that names its own steer's spike and dispatches the spike", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await expiresHoldNamesOwnSteerSSpikePart1(repo, goal);
      const scope2 = await expiresHoldNamesOwnSteerSSpikePart2(scope1);
      await expiresHoldNamesOwnSteerSSpikePart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("mid-run steer holds", () => {
  registerMidRunSteerHoldsPart10();
});
