// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type FakeTurnHandler,
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { task } from "./helpers.js";
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
import type { KernelRuntime } from "../../src/kernel/types.js";

function intentPath(runtime: KernelRuntime): string {
  return path.join(runtime.store.goalDir, "intent.md");
}

const BEFORE = "# Goal\n\nTest goal.\nDrop the export requirement.\n";

function readIntent(runtime: KernelRuntime): string {
  return fs.readFileSync(intentPath(runtime), "utf8");
}

/** One steer PM turn: hold beta as mooted and route the steer to the intent agent. */
function routeIntent(runtime: KernelRuntime): FakeTurnHandler {
  return (req, ctx) => {
    writeHold(runtime, "s1", ["beta"]);
    ctx.writeOutcome(
      outcome({
        summary: "s1 amends intent",
        steerRoutes: [{ steer: "s1", route: "intent" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

function intentAgent(runtime: KernelRuntime, text: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the intent agent");
    expect(req.prompt).toContain("Amend intent: export is in scope.");
    expect(req.model.id).toBe("fake-intent");
    fs.writeFileSync(intentPath(runtime), text, "utf8");
    ctx.writeOutcome(outcome({ summary: "intent now covers export" }));
    return fakeTurnResult(req);
  };
}

/**
 * Drives one iteration to its boundary with a pending intent-routed steer:
 * alpha merges, the held beta never starts, and the plan check falls through
 * to the boundary. Returns the dispatch result.
 */
async function dispatchWithIntentSteer(
  harness: FakeHarness,
  runtime: KernelRuntime,
) {
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(intentPath(runtime), BEFORE, "utf8");

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "Amend intent: export is in scope.");
    }),
  );
  harness.script(routeIntent(runtime));
  harness.script(approver("alpha is correct"));
  return runDispatch(runtime, { iteration: 1 });
}

/** Waits for a condition while other fake turns keep the dispatch loop moving. */
async function waitUntil(check: () => boolean, timeoutMs = 10_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("intent-change steer", () => {
  it("carries the steer into the intent and shows the architect the diff and the steer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      harness.script(
        intentAgent(runtime, "# Goal\n\nTest goal.\nExport is in scope.\n"),
        { when: whenTurn({ slug: "s1", step: "intent" }) },
      );

      const dispatched = await dispatchWithIntentSteer(harness, runtime);
      expect(dispatched.reason).toBe("boundary");
      // The PM routed and held; the intent agent carried the steer before
      // dispatch returned, and the held beta never starts.
      expect(readIntent(runtime)).toBe(
        "# Goal\n\nTest goal.\nExport is in scope.\n",
      );
      expect(inboxHas(runtime, "s1")).toBe(true);
      const held = fs.readFileSync(
        path.join(holdsDir(runtime.store), "s1.yaml"),
        "utf8",
      );
      expect(held).toContain("beta");
      const records = await runtime.store.listRecords();
      expect(
        records.some(
          (record) => record.slug === "beta" && record.actor === "agent",
        ),
      ).toBe(false);
      const routes = records.find((record) => record.step === "steer-routes");
      expect(routes?.outcome?.steerRoutes).toEqual([
        { steer: "s1", route: "intent" },
      ]);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "plan follows the amended intent",
            decision: "continue",
            steerAnswers: [
              {
                steer: "s1",
                answer: "intent carried; the export work is dropped",
              },
            ],
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
      expect(readIntent(runtime)).toBe(
        "# Goal\n\nTest goal.\nExport is in scope.\n",
      );
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).toContain(
        "## Intent changes (carried by the intent agent; the plan follows the diff)",
      );
      expect(pack).toContain("- s1 (mailbox/inbox/s1.md) — intent turn ");
      expect(pack).toContain("@@ -1,5 +1,5 @@");
      expect(pack).toContain("-Drop the export requirement.");
      expect(pack).toContain("+Export is in scope.");
      expect(pack).toContain("- s1: mailbox/inbox/s1.md");
      expect(pack).toContain("- s1 [intent]");
      expect(outboxOf(runtime, "s1")).toContain(
        "intent carried; the export work is dropped",
      );
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );

      const after = await runtime.store.listRecords();
      const intentTurns = after.filter(
        (record) =>
          record.step === "intent" && record.slug === "s1" && record.endedAt,
      );
      expect(intentTurns).toHaveLength(1);
      expect(intentTurns[0]!.outcome?.status).toBe("done");
      expect(intentTurns[0]!.diff).toContain("+Export is in scope.");
      expect(intentTurns[0]!.alias).toBe("intent");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("restores the intent and hands the steer to the architect when the agent carries nothing", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      harness.script(
        (req, ctx) => {
          // A partial write followed by a blocked outcome must not survive:
          // the architect plans from the intent the owner still has.
          fs.appendFileSync(intentPath(runtime), "\nHalf an edit.\n", "utf8");
          ctx.writeOutcome(
            outcome({
              status: "blocked",
              summary: "the steer does not say what to remove",
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "s1", step: "intent" }) },
      );

      const dispatched = await dispatchWithIntentSteer(harness, runtime);
      expect(dispatched.reason).toBe("boundary");

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "amended the intent myself",
            decision: "continue",
            steerAnswers: [{ steer: "s1", answer: "intent edited by hand" }],
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
      expect(readIntent(runtime)).toBe(BEFORE);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).toContain("- s1 (mailbox/inbox/s1.md) — intent turn ");
      expect(pack).toContain("not carried: blocked:");
      expect(pack).toContain("the steer still needs the architect");
      expect(pack).toContain("- s1: mailbox/inbox/s1.md");
      expect(outboxOf(runtime, "s1")).toContain("intent edited by hand");
      expect(inboxHas(runtime, "s1")).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("applies a carried steer once: a second consult reads its record instead of editing again", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      harness.script(
        intentAgent(runtime, "# Goal\n\nTest goal.\nExport is in scope.\n"),
        { when: whenTurn({ slug: "s1", step: "intent" }) },
      );

      const dispatched = await dispatchWithIntentSteer(harness, runtime);
      expect(dispatched.reason).toBe("boundary");

      // The first consult leaves the steer unanswered: it stays pending.
      harness.script((req, ctx) => {
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "noted, plan pending", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });
      const first = await runBoundary(runtime, { relaunch: false });
      expect(first.decision).toBe("continue");
      expect(inboxHas(runtime, "s1")).toBe(true);
      const firstPack = fs.readFileSync(
        path.join(runtime.store.goalDir, first.packPath!),
        "utf8",
      );
      expect(firstPack).toContain("+Export is in scope.");

      // A relaunch consult finds the carried record: no second intent turn,
      // and the architect still sees the same diff beside the pending steer.
      harness.script((req, ctx) => {
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered on the relaunch",
            decision: "continue",
            steerAnswers: [{ steer: "s1", answer: "carried; plan updated" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });
      const second = await runBoundary(runtime, { relaunch: false });
      expect(second.decision).toBe("continue");
      const secondPack = fs.readFileSync(
        path.join(runtime.store.goalDir, second.packPath!),
        "utf8",
      );
      expect(secondPack).toContain("+Export is in scope.");
      expect(outboxOf(runtime, "s1")).toContain("carried; plan updated");
      expect(inboxHas(runtime, "s1")).toBe(false);

      const after = await runtime.store.listRecords();
      expect(
        after.filter(
          (record) => record.step === "intent" && record.slug === "s1",
        ),
      ).toHaveLength(1);
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "intent",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not blame a concurrent task turn for the intent edit", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
      fs.writeFileSync(intentPath(runtime), BEFORE, "utf8");

      // Alpha is in flight when the steer lands and the intent agent writes:
      // the intent edit must not read as alpha's containment breach.
      harness.script(
        async (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
          await postSteer(
            runtime.store,
            "s1",
            "Amend intent: export is in scope.",
          );
          await waitUntil(() =>
            readIntent(runtime).includes("Export is in scope."),
          );
          ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(implementer("gamma.txt"), {
        when: whenTurn({ slug: "gamma", step: "implement" }),
      });
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });
      harness.script(approver("gamma is correct"), {
        when: whenTurn({ slug: "gamma", step: "review" }),
      });
      harness.script(routeIntent(runtime));
      harness.script(
        intentAgent(runtime, "# Goal\n\nTest goal.\nExport is in scope.\n"),
        {
          when: whenTurn({ slug: "s1", step: "intent" }),
        },
      );

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(readIntent(runtime)).toBe(
        "# Goal\n\nTest goal.\nExport is in scope.\n",
      );
      const state = await stateOf(runtime);
      expect(state.tasks.alpha?.status).toBe("merged");
      expect(state.tasks.gamma?.status).toBe("merged");
      const records = await runtime.store.listRecords();
      expect(records.some((record) => record.step === "containment")).toBe(
        false,
      );

      harness.script((req, ctx) => {
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "plan follows the amended intent",
            decision: "continue",
            steerAnswers: [{ steer: "s1", answer: "carried" }],
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
      expect(outboxOf(runtime, "s1")).toContain("carried");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
