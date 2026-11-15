import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  scriptDigest,
  stateOf,
  writePlan,
} from "./e2e-helpers.js";

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
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(3, goal.repo, first);
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
        const pack = fs.readFileSync(
          path.join(goal.goalDir, "iterations/2/context-pack.md"),
          "utf8",
        );
        expect(pack).toContain("iterations/2/digest.md");
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, second);
      expect(seenSession).toBe(sessionId);

      const state = await stateOf(goal.goalDir);
      expect(state.goal).toBe("done");
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/1/summary.md")),
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(goal.goalDir, "iterations/1/summary.md"),
          "utf8",
        ),
      ).toContain("stopped-with-debt");
      const digest = fs.readFileSync(
        path.join(goal.goalDir, "iterations/2/digest.md"),
        "utf8",
      );
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
      await expectLaunch(3, goal.repo, first);

      const second = new FakeHarness({ id: "fake", caps: { resume: false } });
      scriptDigest(second, goal.goalDir, 2);
      second.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        ctx.writeOutcome(outcome({ summary: "de novo", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectLaunch(0, goal.repo, second);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

describe("delivery guard", () => {
  it("repairs an architect continue with no plan, then blocks naming the plan", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "go", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(3, goal.repo, harness);
      expect(harness.calls).toHaveLength(4);
      expect(harness.calls[1]!.prompt).toContain("plan edit or stop decision");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("plan.md does not exist");
      const records = await createFolderStore(goal.goalDir).listRecords();
      expect(records.some((r) => r.step === "pm")).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("repairs an architect continue over an untouched plan, then blocks naming the plan edit", async () => {
    const goal = makeGoal();
    try {
      writePlan(goal.goalDir, PLAN);
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "go", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(3, goal.repo, harness);
      expect(harness.calls).toHaveLength(4);
      expect(harness.calls[1]!.prompt).toContain("plan edit or stop decision");
      expect(harness.calls[1]!.prompt).toContain(
        "is unchanged since the turn started",
      );
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("is unchanged since the turn started");
      const records = await createFolderStore(goal.goalDir).listRecords();
      expect(records.some((r) => r.step === "pm")).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("repairs a front turn with no outcome, then fails the launch naming the deliverable", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => fakeTurnResult(req, { text: "nothing" }));
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      await expectLaunch(1, goal.repo, harness);
      expect(harness.calls).toHaveLength(4);
      expect(harness.calls[1]!.prompt).toContain(
        "You are the front. Your turn did not deliver its class, task, and pack.",
      );
      const records = await createFolderStore(goal.goalDir).listRecords();
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("front turn ended the launch as infra");
      expect(summary).toContain("missing deliverable: class, task, and pack");
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
