import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, launch, makeGoal, outcome, scriptDigest, simpleTask, stateOf, writePlan, writeTask } from "./e2e-helpers.js";

const PLAN = "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n";

describe("E7: an implement step that always ends in infra timeout", () => {
  it("runs on three relaunches, never parks, and never moves the item turn counter", async () => {
    const goal = makeGoal();
    try {
      // A tight item budget: three counted turns would park, so a zero
      // counter proves the infra records are excluded, not just below the cap.
      fs.writeFileSync(path.join(goal.repo.dir, ".factory/process.yaml"), "itemTurns: 2\n", "utf8");
      goal.repo.commit("item budget 2");

      for (let n = 1; n <= 3; n++) {
        const harness = new FakeHarness({ id: "fake" });
        if (n > 1) scriptDigest(harness, goal.goalDir, n);
        harness.script((req, ctx) => {
          if (n === 1) writePlan(goal.goalDir, PLAN);
          ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
          return fakeTurnResult(req);
        });
        harness.script((req, ctx) => {
          if (n === 1) writeTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
          ctx.writeOutcome(outcome({ summary: "filed alpha" }));
          return fakeTurnResult(req);
        });
        harness.script((req) =>
          fakeTurnResult(req, { stop: { kind: "infra", cause: "timeout", details: "idle 30m" } })
        );

        const exit = await launch(goal.repo, harness);
        const state = await stateOf(goal.goalDir);
        const task = state.tasks.alpha!;
        const summary = fs
          .readFileSync(path.join(goal.goalDir, `iterations/${n}/summary.md`), "utf8")
          .split("\n")
          .filter((line) => /^status: |^- boundary: /.test(line))
          .map((line) => line.trim())
          .join("\n");
        console.log(
          `E7 launch ${n}:`,
          JSON.stringify({
            exit,
            status: task.status,
            turns: task.turns,
            round: task.round,
            phase: task.phase,
            park: task.park ?? null,
            cause: task.cause ?? null,
            summary,
          })
        );
        expect(exit).toBe(1);
        expect(task.status).toBe("ready");
        expect(task.turns).toBe(0);
        expect(task.park).toBeUndefined();
        expect(task.cause).toBeUndefined();
        expect(summary).toContain("status: stopped-with-debt");
        expect(summary).toContain(`boundary: infrastructure stop during iteration ${n}: alpha: timeout`);
      }

      const final = await stateOf(goal.goalDir);
      expect(final.tasks.alpha!.turns).toBe(0);
      const store = createFolderStore(goal.goalDir);
      const all = await store.listRecords();
      const implRecords = all.filter((r) => r.slug === "alpha" && r.step === "implement");
      console.log(
        "E7 records:",
        JSON.stringify({
          implRecords: implRecords.length,
          stops: implRecords.map((r) => `${r.stop?.kind}:${r.stop && "cause" in r.stop ? r.stop.cause : ""}`),
          parks: all.filter((r) => r.slug === "alpha" && r.step === "park").length,
          budgetParks: all.filter((r) => (r.cause ?? "").startsWith("budget:")).length,
          implementOutcomes: implRecords.filter((r) => r.outcome !== undefined).length,
        })
      );
      expect(implRecords).toHaveLength(3);
      for (const rec of implRecords) expect(rec.stop?.kind).toBe("infra");
      expect(all.filter((r) => r.slug === "alpha" && r.step === "park")).toHaveLength(0);
      expect(all.filter((r) => (r.cause ?? "").startsWith("budget:"))).toHaveLength(0);
    } finally {
      cleanup(goal);
    }
  }, 180_000);
});
