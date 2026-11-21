import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function writeClass(goalDir: string, text: string): void {
  fs.writeFileSync(path.join(goalDir, "class.yaml"), text, "utf8");
}

function readClass(goalDir: string): unknown {
  return yaml.parse(fs.readFileSync(path.join(goalDir, "class.yaml"), "utf8"));
}

function registerStandaloneUpscopePart2(): void {
  it("keeps the normal verdict path on review upscope=no", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "looks right",
            verdict: "approve",
            upscope: "no",
          }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writeClass(goalDir, "class: task\nslug: solo\n");
      await writeTask(runtime, task("solo", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.solo!.status).toBe("merged");
      expect(readClass(goalDir)).toEqual({ class: "task", slug: "solo" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStandaloneUpscopePart3(): void {
  it("never escalates tasks inside an architect plan", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "hallucinated escalation",
            verdict: "approve",
            upscope: "yes",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["planned"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("planned", { scope: ["task.txt"] });
      await writeTask(runtime, file);

      const vars = promptVars(
        runtime,
        file,
        "/worktrees/demo-tasks/planned",
        [],
        1,
        runtime.configs.process.flows["implement-review"]!,
      );
      expect(vars.upscope_ask).toBe("");

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.planned!.status).toBe("parked");
      expect(causeText(state.tasks.planned!.cause)).toMatch(/^upscope: /);
      expect(fs.existsSync(path.join(goalDir, "class.yaml"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("standalone upscope", () => {
  registerStandaloneUpscopePart2();

  registerStandaloneUpscopePart3();
});
