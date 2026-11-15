import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  writePlan,
} from "./e2e-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

describe("boundary context pack", () => {
  it("writes the pack where the architect record measures it", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness);

      const records = await createFolderStore(goal.goalDir).listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      const written = fs.readFileSync(
        path.join(goal.goalDir, contextPackRelPath(1)),
      );
      expect(written.length).toBeGreaterThan(0);
      expect(architect?.packBytes).toBe(written.length);
      expect(architect?.packTruncated).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});
