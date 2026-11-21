import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  collectSteerRoutes,
  holdsDir,
  postSteer,
} from "../../src/kernel/mailbox.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
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

async function architectIdNamesRejectedTargetedPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(
        runtime.store,
        "s1",
        "The auth interface needs a ruling.",
      );
    }),
  );
  harness.script(async (req, ctx) => {
    await writeTask(
      runtime,
      task("s1-note", {
        scope: ["note.txt"],
        source: "steer: s1",
      }),
    );
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "s1 goes to auth and writes a task",
        steerRoutes: [{ steer: "s1", route: { architect: "auth" } }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "s1 goes to the auth architect",
        steerRoutes: [{ steer: "s1", route: { architect: "auth" } }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("alpha is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });

  return { runtime, dispatched };
}

async function architectIdNamesRejectedTargetedPart2(
  scope: Awaited<ReturnType<typeof architectIdNamesRejectedTargetedPart1>>,
) {
  const { dispatched, runtime } = scope;
  expect(dispatched.reason).toBe("boundary");
  const records = await runtime.store.listRecords();
  const validates = records.filter((record) => record.step === "pm-validate");
  expect(validates).toHaveLength(1);
  const finding = causeText(validates[0]!.cause);
  expect(finding).toContain("routed architect auth");
  expect(finding).not.toContain("[object Object]");
  expect(collectSteerRoutes(records).get("s1")).toEqual({
    route: { architect: "auth" },
  });
}

async function stallDrainsGoalThenArchitectPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "Stop: new priority first.");
    }),
  );
  harness.script((req, ctx) => {
    writeHold(runtime, "s1", [], true);
    ctx.writeOutcome(
      outcome({
        summary: "s1 stalls the goal",
        steerRoutes: [{ steer: "s1", route: "stall" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("alpha is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("drained");
  expect(dispatched.cause).toEqual(cause("steer: s1 goal hold"));
  const after = await stateOf(runtime);
  expect(after.tasks.alpha!.status).toBe("merged");
  expect(after.tasks.gamma!.status).toBe("ready");
  expect(inboxHas(runtime, "s1")).toBe(true);

  harness.script((req, ctx) => {
    expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "replanned after stall",
        decision: "continue",
        forward: ["steer s1: replanned around the new priority"],
      }),
    );
    return fakeTurnResult(req);
  });

  return { harness, runtime };
}

async function stallDrainsGoalThenArchitectPart2(
  scope: Awaited<ReturnType<typeof stallDrainsGoalThenArchitectPart1>>,
) {
  const { harness, runtime } = scope;
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
  expect(pack).toContain("- s1 [stall]");
  expect(outboxOf(runtime, "s1")).toContain("replanned around");
  expect(inboxHas(runtime, "s1")).toBe(false);
}

async function architectIntentAmendmentHoldsPart1(
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
      await postSteer(
        runtime.store,
        "s1",
        "Amend intent: drop beta, keep alpha.",
      );
    }),
  );
  harness.script((req, ctx) => {
    writeHold(runtime, "s1", ["beta"]);
    ctx.writeOutcome(
      outcome({
        summary: "s1 voids beta",
        steerRoutes: [{ steer: "s1", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("alpha is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(causeText(dispatched.cause)).toContain("s1");
  expect(causeText(dispatched.cause)).toContain("beta");
  const held = await stateOf(runtime);
  expect(held.tasks.alpha!.status).toBe("merged");
  expect(held.tasks.beta!.status).toBe("ready");
  const records = await runtime.store.listRecords();
  expect(records.some((r) => r.slug === "beta" && r.actor === "agent")).toBe(
    false,
  );
  expect(records.some((r) => r.step === "steer-routes")).toBe(true);
  expect(records.filter((r) => r.step === "pm-validate")).toHaveLength(0);
  const hold = yaml.parse(
    fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
  ) as { slugs: string[]; goal: boolean };
  expect(hold.slugs).toEqual(["beta"]);

  return { harness, runtime, hold };
}

async function architectIntentAmendmentHoldsPart2(
  scope: Awaited<ReturnType<typeof architectIntentAmendmentHoldsPart1>>,
) {
  const { hold, runtime, harness } = scope;
  expect(hold.goal).toBe(false);
  expect(inboxHas(runtime, "s1")).toBe(true);

  harness.script((req, ctx) => {
    expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered s1",
        decision: "continue",
        forward: ["steer s1: beta dropped from intent"],
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
  const steerLine = pack.indexOf("- s1: mailbox/inbox/s1.md");
  const holdsLine = pack.indexOf("holds: beta");
  expect(holdsLine).toBeGreaterThan(steerLine);
  expect(pack).toContain("- s1 [architect]");
  expect(outboxOf(runtime, "s1")).toContain("beta dropped");
  expect(inboxHas(runtime, "s1")).toBe(false);
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    false,
  );

  harness.script(implementer("beta.txt"));
  harness.script(approver("beta is correct"));
  const resumed = await runDispatch(runtime, { iteration: 2 });
  expect(resumed.reason).toBe("boundary");
  expect((await stateOf(runtime)).tasks.beta!.status).toBe("merged");
}

function registerSteerArchitectRoutingPart3(): void {
  it("architect {id}: names a rejected targeted route in the PM finding", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await architectIdNamesRejectedTargetedPart1(repo, goal);
      await architectIdNamesRejectedTargetedPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stall: drains the goal, then the architect answers", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await stallDrainsGoalThenArchitectPart1(repo, goal);
      await stallDrainsGoalThenArchitectPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: an intent amendment holds the voided task while the other runs, and the pack shows it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await architectIntentAmendmentHoldsPart1(repo, goal);
      await architectIntentAmendmentHoldsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("steer architect routing", () => {
  registerSteerArchitectRoutingPart3();
});
