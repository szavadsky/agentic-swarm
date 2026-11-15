import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  simpleTask,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";

describe("crashed iteration", () => {
  it("still writes the iteration summary", async () => {
    const goal = makeGoal();
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.appendFileSync(goal.planPath, "\n## architect edit\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      harness.script(() => {
        throw new Error("harness process died mid-turn");
      });

      expect(await launch(goal.repo, harness)).toBe(1);
      const summaryPath = path.join(goal.goalDir, "iterations/1/summary.md");
      expect(fs.existsSync(summaryPath)).toBe(true);
      const summary = fs.readFileSync(summaryPath, "utf8");
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain("architect: planned alpha");
      expect(
        fs.existsSync(
          path.join(goal.goalDir, "mailbox/outbox/iteration-1-summary.md"),
        ),
      ).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
