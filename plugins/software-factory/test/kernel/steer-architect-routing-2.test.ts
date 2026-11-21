import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { workCalls } from "./fake-defaults.js";
import {
  writePlan,
  editPlan,
  writeHold,
  stateOf,
  implementer,
  approver,
  outboxOf,
} from "./steer-helpers.js";

async function architectVoidingEveryPendingTaskPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await postSteer(
    runtime.store,
    "s1",
    "Amend intent: drop both, new direction.",
  );

  harness.script((req, ctx) => {
    writeHold(runtime, "s1", ["alpha", "beta"]);
    ctx.writeOutcome(
      outcome({
        summary: "s1 voids all",
        steerRoutes: [{ steer: "s1", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(causeText(dispatched.cause)).toContain("s1");
  expect(causeText(dispatched.cause)).toContain("alpha");
  expect(causeText(dispatched.cause)).toContain("beta");
  const state = await stateOf(runtime);
  expect(state.tasks.alpha!.status).toBe("ready");
  expect(state.tasks.beta!.status).toBe("ready");
  const records = await runtime.store.listRecords();
  expect(records.some((r) => r.actor === "agent" && r.slug === "alpha")).toBe(
    false,
  );
  expect(records.some((r) => r.actor === "agent" && r.slug === "beta")).toBe(
    false,
  );
  expect(workCalls(harness)).toHaveLength(1);

  return { harness, runtime };
}

async function architectVoidingEveryPendingTaskPart2(
  scope: Awaited<ReturnType<typeof architectVoidingEveryPendingTaskPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered s1",
        decision: "continue",
        forward: ["steer s1: new direction set"],
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
  expect(pack).toContain("holds: alpha, beta");
  expect(outboxOf(runtime, "s1")).toContain("new direction");
}

async function architectAfterNextPlanPMDerivePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await postSteer(
    runtime.store,
    "s1",
    "Amend intent: drop alpha, rework beta.",
  );

  harness.script((req, ctx) => {
    writeHold(runtime, "s1", ["alpha", "beta"]);
    ctx.writeOutcome(
      outcome({
        summary: "s1 voids both pending",
        steerRoutes: [{ steer: "s1", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect((await stateOf(runtime)).tasks.alpha!.status).toBe("ready");
  expect((await stateOf(runtime)).tasks.beta!.status).toBe("ready");

  harness.script((req, ctx) => {
    expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      "# Milestone 1 — files\n\n## beta\nReworked beta.txt for new intent.\n\ncancelled: alpha — the steer voids it\n",
      "utf8",
    );
    ctx.writeOutcome(
      outcome({
        summary: "replanned after s1",
        decision: "continue",
        forward: ["steer s1: alpha dropped, beta reworked"],
      }),
    );
    return fakeTurnResult(req);
  });

  return { harness, runtime };
}

async function architectAfterNextPlanPMDerivePart2(
  scope: Awaited<ReturnType<typeof architectAfterNextPlanPMDerivePart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    const betaFile = path.join(runtime.store.tasksDir, "beta.md");
    fs.appendFileSync(betaFile, "\nPM reworked: new intent.\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "reworked beta, alpha dropped" }));
    return fakeTurnResult(req);
  });

  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect(outboxOf(runtime, "s1")).toContain("alpha dropped");
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    false,
  );
  const after = await stateOf(runtime);
  expect(after.tasks.alpha!.status).toBe("cancelled");
  expect(after.tasks.alpha!.cause).toEqual({
    kind: "note",
    detail: "the steer voids it",
  });
  expect(after.tasks.beta!.status).toBe("ready");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
  ).toContain("PM reworked: new intent.");

  harness.script(implementer("beta.txt"));
  harness.script(approver("beta is correct"));
  const resumed = await runDispatch(runtime, { iteration: 2 });
  expect(resumed.reason).toBe("boundary");
  expect((await stateOf(runtime)).tasks.beta!.status).toBe("merged");
  expect((await stateOf(runtime)).tasks.alpha!.status).toBe("cancelled");
}

function registerSteerArchitectRoutingPart4(): void {
  it("architect: voiding every pending task exhausts dispatch with cause naming the steer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await architectVoidingEveryPendingTaskPart1(repo, goal);
      await architectVoidingEveryPendingTaskPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: after the next plan the PM derive reworks and retires held slugs", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await architectAfterNextPlanPMDerivePart1(repo, goal);
      await architectAfterNextPlanPMDerivePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerSteerArchitectRoutingPart5(): void {
  it("architect: goal:true still fails validation and the retry holds slugs with goal:false", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Amend intent: drop beta.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["beta"], true);
        ctx.writeOutcome(
          outcome({
            summary: "routed s1",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("goal: true stays reserved for stall");
        writeHold(runtime, "s1", ["beta"], false);
        ctx.writeOutcome(
          outcome({
            summary: "routed s1",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const validates = records.filter((r) => r.step === "pm-validate");
      expect(validates).toHaveLength(1);
      expect(causeText(validates[0]!.cause)).toContain(
        "goal: true stays reserved for stall",
      );
      expect(records.some((r) => r.step === "steer-routes")).toBe(true);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      ) as { slugs: string[]; goal: boolean };
      expect(hold.slugs).toEqual(["beta"]);
      expect(hold.goal).toBe(false);
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("ready");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerSteerArchitectRoutingPart6(): void {
  it("architect: a hold listing the in-flight task never parks it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
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
            "Amend intent: reconsider both.",
          );
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha", "beta"]);
        ctx.writeOutcome(
          outcome({
            summary: "s1 holds both",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const state = await stateOf(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("ready");
      const records = await runtime.store.listRecords();
      expect(records.some((r) => r.slug === "alpha" && r.step === "park")).toBe(
        false,
      );
      expect(
        records.some((r) => r.slug === "beta" && r.actor === "agent"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("steer architect routing", () => {
  registerSteerArchitectRoutingPart4();

  registerSteerArchitectRoutingPart5();

  registerSteerArchitectRoutingPart6();
});
