import { describe, expect, it } from "bun:test";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  implementerTurn,
  launch,
  makeGoal,
  outcome,
  simpleTask,
  stateOf,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";

const PLAN = `# Milestone 1

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = simpleTask("alpha", "alpha.txt");

describe("steer dropped between the boundary read and dispatch start", () => {
  it("gets a PM steer turn in dispatch", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const steer = "Keep alpha unmerged until I answer.";
      const store = createFolderStore(goal.goalDir);

      harness.script(async (req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        // The boundary scanned the inbox before this turn; the drop is after
        // its read and must still be structured before tasks run.
        await postSteer(store, "s1", steer);
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script(async (req, ctx) => {
        expect(req.prompt).not.toContain(steer);
        writeTask(goal.goalDir, ALPHA);
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(steer);
        ctx.writeOutcome(outcome({ summary: "structured the late steer" }));
        return fakeTurnResult(req);
      });
      harness.script(implementerTurn("alpha.txt"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "alpha is correct", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness, 1);

      expect((await stateOf(goal.goalDir)).tasks.alpha!.status).toBe("merged");
      expect(harness.calls.filter((call) => call.prompt.includes(steer))).toHaveLength(1);
      const records = await store.listRecords();
      expect(records.filter((record) => record.step === "pm")).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

describe("steer read by the boundary", () => {
  it("is not steered again when dispatch starts", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const steer = "Keep alpha unmerged until I answer.";
      const store = createFolderStore(goal.goalDir);
      await store.ensureLayout();
      await postSteer(store, "s1", steer);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain(steer);
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeTask(goal.goalDir, ALPHA);
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      harness.script(implementerTurn("alpha.txt"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "alpha is correct", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness, 1);

      expect((await stateOf(goal.goalDir)).tasks.alpha!.status).toBe("merged");
      // The architect saw the steer; dispatch handed the same id back and ran
      // no second PM turn over it.
      expect((await store.listRecords()).filter((record) => record.step === "pm")).toHaveLength(1);
      expect(harness.calls.filter((call) => call.prompt.includes(steer))).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
