import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnIdentity } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { openWork, PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { cause, script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

describe("plan-check openWork with retired parks", () => {
  it("excludes a retired park and cancelled slug from openWork while keeping a live park", () => {
    const tasks = [
      task("retired"),
      task("retired-next", { base: "retired" }),
      task("live-park"),
      task("dropped"),
      task("ready-task"),
      task("pending-task", { deps: ["ready-task"] }),
    ];
    const records = [
      script(1, {
        slug: "retired",
        step: "park",
        ok: true,
        cause: cause("gates: unit"),
      }),
      script(2, {
        slug: "retired-next",
        step: "merge",
        ok: true,
        commit: "deadbeef",
      }),
      script(3, {
        slug: "live-park",
        step: "park",
        ok: true,
        cause: cause("gates: unit"),
      }),
      script(4, {
        slug: "dropped",
        step: "cancel",
        ok: true,
        cause: cause("cancelled"),
      }),
    ];
    const state = derive(tasks, records);

    expect(state.tasks.retired!.supersededBy).toBe("retired-next");
    expect(openWork(state)).toEqual([
      "live-park",
      "pending-task",
      "ready-task",
    ]);
  });

  it("does not draw the plan checker at wave end when only a retired park remains", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("retired", { scope: ["retired.txt"] }));
      await writeTask(
        runtime,
        task("retired-next", { base: "retired", scope: ["retired.txt"] }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "retired" }),
        { ok: true, cause: cause("gates: unit") },
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "retired-next" }),
        { ok: true, commit: "deadbeef" },
      );
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- retired — Retired.\n- retired-next — Landed.\n",
        "utf8",
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const checks = harness.calls.filter(
        (call) => fakeTurnIdentity(call).step === PLAN_CHECK_STEP,
      );
      expect(checks).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
