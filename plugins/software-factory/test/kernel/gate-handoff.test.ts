import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("gate-handoff-log", () => {
  it("passes the checks result, tree and log to the reviewer", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "test -f fixed.txt" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const prompts: string[] = [];

      // The initial turn leaves the gate red.
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "broken.txt"), "bad\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "wrote broken" }));
        return fakeTurnResult(req);
      });
      // The gate-fix turn makes the gate green and gives the branch a real diff.
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "fixed.txt"), "fixed\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "fixed the gate" }));
        return fakeTurnResult(req);
      });
      // Review turn.
      harness.script((req, ctx) => {
        prompts.push(req.prompt ?? "");
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["broken.txt"] }));

      await runDispatch(runtime, { iteration: 1 });

      const checks = (await runtime.store.listRecords())
        .filter(
          (record) =>
            record.slug === "task" &&
            record.step === "checks" &&
            record.ok === true,
        )
        .at(-1);
      expect(checks?.tree).toBeTruthy();
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("- checks: `pass`");
      expect(prompts[0]).toContain(`- checks tree: \`${checks!.tree}\``);
      expect(prompts[0]).toContain(
        `- checks log: \`${path.join(
          runtime.store.recordsDir,
          String(checks!.iteration),
          "task",
          "checks",
        )}\``,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
