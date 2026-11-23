import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { cause, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  editPlan,
  implementer,
  tasks,
  writeHold,
  writePlan,
} from "./steer-holds-helpers.js";

async function holdsUnstartedTasksWithoutParkingPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(
    runtime,
    task("beta", { scope: ["beta.txt"], deps: ["alpha"] }),
  );
  await writeTask(runtime, task("delta", { scope: ["delta.txt"] }));
  await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(
        runtime.store,
        "s1",
        "Keep alpha unmerged until I answer.\nSecond line with details.",
      );
    }),
  );
  harness.script((req, ctx) => {
    expect(req.prompt).toContain(
      "- s1 (mailbox/inbox/s1.md):\n  Keep alpha unmerged",
    );
    expect(req.prompt).toContain("Second line with details.");
    writeHold(runtime, "s1", ["alpha", "beta", "delta"]);
    ctx.writeOutcome(outcome({ summary: "structured s1" }));
    return fakeTurnResult(req);
  });
  // Alpha already started, so its hold never blocks it mid-flow.
  harness.script(approver("alpha is correct"));
  harness.script(implementer("gamma.txt"));
  harness.script(approver("gamma is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");

  const held = await tasks(runtime);
  expect(held.tasks.alpha!.status).toBe("merged");
  expect(held.tasks.beta!.status).toBe("ready");
  expect(held.tasks.delta!.status).toBe("ready");
  expect(held.tasks.gamma!.status).toBe("merged");

  const records = await runtime.store.listRecords();
  expect(records.filter((r) => r.step === "pm")).toHaveLength(1);

  return { harness, runtime, records };
}

/** The boundary routes the structured steer, the architect answers it, and its PM tail leaves it alone. */
function scriptBoundarySteerAnswer(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): void {
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("Second line with details.");
    ctx.writeOutcome(
      outcome({
        summary: "s1 goes to the architect",
        steerRoutes: [{ steer: "s1", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain(
      "- s1 (mailbox/inbox/s1.md): Keep alpha unmerged until I answer.",
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered the steer",
        decision: "continue",
        forward: ["steer s1: hold alpha; I will review the branch"],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).not.toContain("Second line with details.");
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
}

async function holdsUnstartedTasksWithoutParkingPart2(
  scope: Awaited<ReturnType<typeof holdsUnstartedTasksWithoutParkingPart1>>,
) {
  const { records, harness, runtime } = scope;
  expect(
    records.find(
      (r) =>
        r.slug === "alpha" && r.actor === "agent" && r.step === "implement",
    )?.outcome?.status,
  ).toBe("done");
  expect(records.some((r) => r.slug === "alpha" && r.step === "park")).toBe(
    false,
  );
  expect(records.some((r) => r.slug === "alpha" && r.step === "merge")).toBe(
    true,
  );
  expect(records.some((r) => r.slug === "beta" && r.actor === "agent")).toBe(
    false,
  );
  expect(records.some((r) => r.slug === "delta")).toBe(false);
  const steerTurns = (): number =>
    harness.calls.filter((call) =>
      call.prompt.includes("Second line with details."),
    ).length;
  expect(steerTurns()).toBe(1);
  expect(
    fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
  ).toBe(true);

  // The steer then takes the boundary path: the boundary's steer turn routes
  // it to the architect, who answers it.
  scriptBoundarySteerAnswer(harness, runtime);

  return { ...scope, steerTurns };
}

async function holdsUnstartedTasksWithoutParkingPart3(
  scope: Awaited<ReturnType<typeof holdsUnstartedTasksWithoutParkingPart2>>,
) {
  const { runtime, steerTurns, harness } = scope;
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect(
    fs.readdirSync(path.join(runtime.store.goalDir, "mailbox/inbox")),
  ).not.toContain("s1.md");
  expect(
    fs.readdirSync(path.join(runtime.store.goalDir, "mailbox/processed")),
  ).toContain("s1.md");
  expect(
    fs.readFileSync(
      path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"),
      "utf8",
    ),
  ).toContain("hold alpha; I will review the branch");

  const after = await tasks(runtime);
  expect(after.tasks.alpha!.status).toBe("merged");
  expect(after.tasks.beta!.status).toBe("ready");
  expect(after.tasks.delta!.status).toBe("ready");
  expect(after.tasks.gamma!.status).toBe("merged");
  // An answered steer's hold file is gone after the boundary.
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    false,
  );
  // The mid-iteration turn structured it and the boundary's steer turn routed
  // it once; the boundary's PM tail does not restructure it.
  expect(steerTurns()).toBe(2);

  // The hold is gone: the tasks that waited now run.
  harness.script(implementer("beta.txt"));
  harness.script(approver("beta is correct"));
  harness.script(implementer("delta.txt"));
  harness.script(approver("delta is correct"));
  const resumed = await runDispatch(runtime, { iteration: 2 });
  expect(resumed.reason).toBe("boundary");
  expect((await tasks(runtime)).tasks.beta!.status).toBe("merged");
  expect((await tasks(runtime)).tasks.delta!.status).toBe("merged");
  expect(steerTurns()).toBe(2);
}

function registerMidRunSteerHoldsPart1(): void {
  it("holds unstarted tasks without parking the in-flight one, and still reaches the architect", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await holdsUnstartedTasksWithoutParkingPart1(repo, goal);
      const scope2 = await holdsUnstartedTasksWithoutParkingPart2(scope1);
      await holdsUnstartedTasksWithoutParkingPart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart2(): void {
  it("parks a held in-flight task with the cause it earned, not the steer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      // The step commits nothing, so derive has already decided alpha must
      // park; the steer arrives in that same turn and must not hide the cause.
      harness.script(async (req, ctx) => {
        await postSteer(runtime.store, "s1", "Hold alpha.");
        ctx.writeOutcome(outcome({ summary: "alpha unchanged" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha"]);
        ctx.writeOutcome(outcome({ summary: "held alpha" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.alpha!.cause).toEqual(
        cause("empty-diff: implement r1 committed no changes"),
      );
      const records = await runtime.store.listRecords();
      expect(
        records.filter((r) => r.slug === "alpha" && r.step === "park"),
      ).toHaveLength(1);
      expect(
        records.find((r) => r.slug === "alpha" && r.step === "park")?.cause,
      ).toEqual(cause("empty-diff: implement r1 committed no changes"));
      expect(
        records.some((r) => r.slug === "alpha" && r.step === "merge"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart3(): void {
  it("does not run a steer PM turn for a steer already present at the boundary", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await postSteer(runtime.store, "s1", "Already seen by the architect.");

      harness.script(implementer("alpha.txt"));
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: ["s1"],
      });
      expect(dispatched.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(3);
      expect(
        (await runtime.store.listRecords()).filter((r) => r.step === "pm"),
      ).toEqual([]);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");
      expect(
        fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart4(): void {
  it("a steer holding nothing changes nothing", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "No tasks wait.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(outcome({ summary: "structures nothing" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("merged");
      expect(
        (await runtime.store.listRecords()).filter((r) => r.step === "pm"),
      ).toHaveLength(1);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      );
      expect(hold).toEqual({ slugs: [], goal: false });
      expect(
        fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart5(): void {
  it("a goal hold drains dispatch while started tasks run to the end, never parked", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Stop the goal.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", [], true);
        ctx.writeOutcome(outcome({ summary: "goal held" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toEqual(cause("steer: s1 goal hold"));
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.alpha!.park).toBeUndefined();
      expect(state.tasks.gamma!.status).toBe("ready");
      expect(
        (await runtime.store.listRecords()).some((r) => r.slug === "gamma"),
      ).toBe(false);
      expect(
        (await runtime.store.listRecords()).some(
          (r) => r.slug === "alpha" && r.step === "park",
        ),
      ).toBe(false);
      expect(harness.calls).toHaveLength(4);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("mid-run steer holds", () => {
  registerMidRunSteerHoldsPart1();

  registerMidRunSteerHoldsPart2();

  registerMidRunSteerHoldsPart3();

  registerMidRunSteerHoldsPart4();

  registerMidRunSteerHoldsPart5();
});
