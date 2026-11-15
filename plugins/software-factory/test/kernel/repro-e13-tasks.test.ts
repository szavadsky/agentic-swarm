import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, makeGoal, outcome, writePlan } from "./e2e-helpers.js";

describe("E13: a half-written task file does not wedge the launch", () => {
  it("quarantines the file, records the report, and runs the iteration", async () => {
    const goal = makeGoal();
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      fs.mkdirSync(goal.tasksDir, { recursive: true });
      fs.writeFileSync(
        path.join(goal.tasksDir, "broken.md"),
        "half-written task body with no frontmatter\n",
        "utf8",
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "the plan needs nothing yet",
            decision: "blocked",
          }),
        );
        return fakeTurnResult(req);
      });

      const run = () =>
        runGoal({
          repo: goal.repo.dir,
          goal: "demo",
          iterations: 1,
          harnesses: { fake: harness },
          baseGates: false,
        });
      expect((await run()).stop).toBe("blocked");
      expect(
        fs.readFileSync(
          path.join(goal.tasksDir, "quarantine", "broken.md"),
          "utf8",
        ),
      ).toContain("half-written");
      const report = (await createFolderStore(goal.goalDir).listRecords()).find(
        (record) => record.step === "task-quarantine",
      );
      expect(report?.ok).toBe(false);
      expect(report?.cause).toContain('task file "broken.md" quarantined at');
      // The next launch must find no unreadable file left to wedge it.
      expect((await run()).stop).toBe("blocked");
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
