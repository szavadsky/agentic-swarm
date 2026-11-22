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
  tasks,
  writeHold,
  writePlan,
} from "./steer-holds-helpers.js";

/** The boundary's steer turn: route each pending steer before the architect. */
function routesSteers(
  routes: { steer: string; route: "architect" | "stall" }[],
): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: `routed ${routes.map((entry) => entry.steer).join(", ")}`,
        steerRoutes: routes,
      }),
    );
    return fakeTurnResult(req);
  };
}

async function leavesTaskAloneWhenSteerIdEqualsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  // The steer id collides with the task slug. Its hold blocks nothing, so
  // any effect on alpha comes from the steer records keyed by that slug.
  await postSteer(runtime.store, "alpha", "A steer sharing the task slug.");
  writeHold(runtime, "alpha", []);

  const ignoreSteer: FakeTurnHandler = (req, ctx) => {
    expect(req.prompt).toContain(
      "- alpha (mailbox/inbox/alpha.md): A steer sharing the task slug.",
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({ summary: "ignored the steer", decision: "continue" }),
    );
    return fakeTurnResult(req);
  };
  const unchanged: FakeTurnHandler = (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  };

  harness.script(routesSteers([{ steer: "alpha", route: "architect" }]));
  harness.script(ignoreSteer);
  harness.script(unchanged);
  expect((await runBoundary(runtime, { relaunch: false })).decision).toBe(
    "continue",
  );
  harness.script(ignoreSteer);
  harness.script(unchanged);
  expect((await runBoundary(runtime, { relaunch: false })).decision).toBe(
    "continue",
  );

  const records = await runtime.store.listRecords();
  expect(
    records.filter((r) => r.step === "steer-presented" && r.slug === "alpha"),
  ).toHaveLength(1);
  expect(
    records.filter((r) => r.step === "steer-unanswered" && r.slug === "alpha"),
  ).toHaveLength(1);

  // The steer records share the task's slug but carry no task state.
  const state = await tasks(runtime);

  return { harness, runtime, state };
}

async function leavesTaskAloneWhenSteerIdEqualsPart2(
  scope: Awaited<ReturnType<typeof leavesTaskAloneWhenSteerIdEqualsPart1>>,
) {
  const { state, harness, runtime } = scope;
  const outbox = fs.readFileSync(
    path.join(runtime.store.goalDir, "mailbox/outbox/steer-alpha.md"),
    "utf8",
  );
  expect(outbox).toContain("# Steer alpha");
  expect(outbox).toContain(
    "steer alpha was left unanswered at two boundaries; its hold expired",
  );
  expect(outbox).toContain("Source: mailbox/inbox/alpha.md");
  expect(state.tasks.alpha!.status).toBe("ready");
  expect(state.tasks.alpha!.turns).toBe(0);
  expect(state.tasks.alpha!.round).toBe(1);
  expect(state.tasks.alpha!.phase).toBe("implement");
  expect(state.tasks.alpha!.park).toBeUndefined();
  expect(state.tasks.alpha!.cause).toBeUndefined();

  // The task still runs its flow to the end through the same records.
  harness.script(implementer("alpha.txt"));
  harness.script(approver("alpha is correct"));
  const dispatched = await runDispatch(runtime, {
    iteration: 3,
    seenSteers: ["alpha"],
  });
  expect(dispatched.reason).toBe("boundary");
  expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");
}

function registerMidRunSteerHoldsPart5(): void {
  it("answers two different steers that carry identical text", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await postSteer(runtime.store, "s1", "Keep the API stable.");
      await postSteer(runtime.store, "s2", "Keep the API stable.");

      harness.script(
        routesSteers([
          { steer: "s1", route: "architect" },
          { steer: "s2", route: "architect" },
        ]),
      );
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Keep the API stable.",
        );
        expect(req.prompt).toContain(
          "- s2 (mailbox/inbox/s2.md): Keep the API stable.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered both steers",
            decision: "continue",
            forward: ["steer s1: names stay", "steer s2: internals only"],
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
      for (const id of ["s1", "s2"]) {
        expect(
          fs.existsSync(
            path.join(runtime.store.goalDir, `mailbox/processed/${id}.md`),
          ),
        ).toBe(true);
        expect(
          fs.existsSync(
            path.join(runtime.store.goalDir, `mailbox/outbox/steer-${id}.md`),
          ),
        ).toBe(true);
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart6(): void {
  it("leaves a task alone when a steer id equals its slug", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await leavesTaskAloneWhenSteerIdEqualsPart1(repo, goal);
      await leavesTaskAloneWhenSteerIdEqualsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("mid-run steer holds", () => {
  registerMidRunSteerHoldsPart5();

  registerMidRunSteerHoldsPart6();
});
