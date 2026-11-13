import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { promptVars, stepTarget } from "../../src/kernel/flow-context.js";
import { task } from "./helpers.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

describe("front prompt handoff", () => {
  it("leaves front_pack empty and the implementer target unchanged without class.yaml", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: new FakeHarness({ id: "fake" }) });
      const taskFile = task("task", { scope: ["task.txt"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const state = derive([taskFile], [], runtime.configs.process.flows).tasks.task!;
      const records = await runtime.store.listRecords();

      const vars = promptVars(runtime, taskFile, "/worktrees/demo-tasks/task", records, 1, flow);

      expect(vars.front_pack).toBe("");
      expect(stepTarget(runtime, taskFile, state, "implement").alias).toBe("implementer");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("points front_pack at the front record's iteration and keeps the front target on a fix turn", async () => {
    const aliases = {
      architect: { harness: "fake", model: "fake-architect" },
      front: { harness: "fake", model: "fake-front" },
      pm: { harness: "fake", model: "fake-pm" },
      implementer: { harness: "fake", model: "fake-impl" },
      reviewer: { harness: "fake", model: "fake-review" },
    };
    const { repo, goalDir } = setupFlowRepo({ aliases });
    try {
      const runtime = await makeRuntime(repo, "demo", { fake: new FakeHarness({ id: "fake" }) });
      fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: trivial\nslug: tiny\n", "utf8");
      await runtime.store.appendRecord(
        { iteration: 3, step: "front", round: 1, actor: "agent", alias: "front", model: { id: "fake-front" } },
        {}
      );
      const taskFile = task("tiny", { flow: "just-implement" });
      const flow = runtime.configs.process.flows["just-implement"]!;
      const state = derive([taskFile], [], runtime.configs.process.flows).tasks.tiny!;
      const records = await runtime.store.listRecords();

      const vars = promptVars(runtime, taskFile, "/worktrees/demo-tasks/tiny", records, 2, flow);
      const fixTarget = stepTarget(runtime, taskFile, { ...state, round: 2 }, "implement");

      expect(vars.front_pack).toBe(path.join(goalDir, "iterations/3/context-pack.md"));
      expect(fixTarget.alias).toBe("front");
      expect(fixTarget.model.id).toBe("fake-front");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
