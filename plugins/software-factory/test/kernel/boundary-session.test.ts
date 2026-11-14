import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, launch, makeGoal, outcome, scriptDigest, stateOf, writePlan } from "./e2e-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

describe("architect session continuity", () => {
  it("stores the compacted ref, re-derives it after a restart, and backfills a missing summary", async () => {
    const goal = makeGoal();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        expect(req.prompt).toContain("- turn: `first`");
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned nothing yet", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, first)).toBe(3);
      const store = createFolderStore(goal.goalDir);
      const records = await store.listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect?.session?.compacted).toBe(true);
      expect(first.compactions).toHaveLength(1);
      const sessionId = architect!.session!.id;

      // A hard kill after the records, before the summary: backfill owns it.
      fs.rmSync(path.join(goal.goalDir, "iterations/1/summary.md"));

      const second = new FakeHarness({ id: "fake" });
      scriptDigest(second, goal.goalDir, 2);
      let seenSession: string | undefined;
      second.script((req, ctx) => {
        seenSession = req.session?.id;
        expect(req.session?.compacted).toBe(true);
        expect(req.prompt).toContain("- turn: `relaunch`");
        const pack = fs.readFileSync(path.join(goal.goalDir, "iterations/2/context-pack.md"), "utf8");
        expect(pack).toContain("iterations/2/digest.md");
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, second)).toBe(0);
      expect(seenSession).toBe(sessionId);

      const state = await stateOf(goal.goalDir);
      expect(state.goal).toBe("done");
      expect(fs.existsSync(path.join(goal.goalDir, "iterations/1/summary.md"))).toBe(true);
      expect(fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8")).toContain(
        "stopped-with-debt"
      );
      const digest = fs.readFileSync(path.join(goal.goalDir, "iterations/2/digest.md"), "utf8");
      expect(digest).toContain("## Cost and turns by role");
      expect(digest).toContain("architect");
      expect(digest).toContain("## Loops");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("does not resume when the harness says it cannot", async () => {
    const goal = makeGoal();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to file" }));
        return fakeTurnResult(req);
      });
      expect(await launch(goal.repo, first)).toBe(3);

      const second = new FakeHarness({ id: "fake", caps: { resume: false } });
      scriptDigest(second, goal.goalDir, 2);
      second.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        ctx.writeOutcome(outcome({ summary: "de novo", decision: "done" }));
        return fakeTurnResult(req);
      });
      expect(await launch(goal.repo, second)).toBe(0);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});