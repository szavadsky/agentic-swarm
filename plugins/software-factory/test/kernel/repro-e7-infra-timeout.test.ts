import { describe, expect, it } from "bun:test";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  scriptStallLeave,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/**
 * E7 inverted: an infra timeout or crash counts as a turn and parks the step
 * after two repeats on the same step, so a launch never re-dispatches a
 * deterministically failing step without bound. A reported quota/auth stop is
 * not timeout/crash and still counts nothing.
 */
describe("E7 inverted — infra timeouts and crashes count as turn repeats", () => {
  for (const cause of ["timeout", "crash"] as const) {
    it(`parks infra-repeat on the same step after two ${cause} stops`, async () => {
      const { repo, goal } = setupFlowRepo({
        limits: { concurrency: { overall: 1 } },
      });
      try {
        const harness = new FakeHarness({ id: "fake" });
        harness.script((req) =>
          fakeTurnResult(req, {
            stop: {
              kind: "infra",
              cause,
              details: cause === "timeout" ? "idle 30m" : "session not found",
            },
          }),
        );
        harness.script((req) =>
          fakeTurnResult(req, {
            stop: {
              kind: "infra",
              cause,
              details: cause === "timeout" ? "idle 30m" : "session not found",
            },
          }),
        );
        scriptStallLeave(harness, ["alpha"]);
        const runtime = await makeRuntime(repo, goal, { fake: harness });
        await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

        const first = await runDispatch(runtime, { iteration: 1 });
        expect(first.reason).toBe("infra");
        let records = await runtime.store.listRecords();
        let state = derive(
          await runtime.store.listTasks(),
          records,
          runtime.configs.process.flows,
        );
        expect(state.tasks.alpha!.turns).toBe(1);
        expect(state.tasks.alpha!.phase).toBe("implement");
        expect(state.tasks.alpha!.park).toBeUndefined();

        const second = await runDispatch(runtime, { iteration: 2 });
        expect(second.reason).toBe("infra");
        records = await runtime.store.listRecords();
        state = derive(
          await runtime.store.listTasks(),
          records,
          runtime.configs.process.flows,
        );
        expect(state.tasks.alpha!.turns).toBe(2);
        expect(state.tasks.alpha!.phase).toBe("parked");
        expect(state.tasks.alpha!.park).toContain(`infra-repeat: ${cause}`);

        // The parked step is not re-dispatched by a third launch.
        const third = await runDispatch(runtime, { iteration: 3 });
        expect(third.reason).toBe("boundary");
        expect(harness.calls).toHaveLength(3);
        const turns = (await runtime.store.listRecords()).filter(
          (r) => r.slug === "alpha" && r.actor === "agent",
        );
        expect(turns).toHaveLength(2);
      } finally {
        cleanupFlowRepo(repo);
      }
    }, 60_000);
  }

  it("defers a quota stop without spending the turn budget", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req) =>
          fakeTurnResult(req, {
            stop: {
              kind: "infra",
              cause: "quota",
              details: "quota exceeded",
            },
          }),
        {
          when: whenTurn({ slug: "alpha", step: "implement" }),
          fallback: true,
        },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      const result = await runDispatch(runtime, {
        iteration: 1,
        sleep: async () => {},
      });
      // The only implementer tier answered quota: the alias is unavailable, so
      // dispatch defers the task and names the dead alias instead of spending
      // a re-dispatch on it.
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain('alias "implementer" has no live tier');
      expect(result.cause).toContain("fake+fake-impl resets at");
      expect(harness.calls).toHaveLength(1);

      const records = await runtime.store.listRecords();
      const implementRecords = records.filter(
        (r) => r.slug === "alpha" && r.step === "implement",
      );
      expect(implementRecords).toHaveLength(1);
      expect(implementRecords[0]!.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: "quota exceeded",
      });
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      // A quota stop spends no turn, and the deferred task waits unscheduled.
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.park).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
