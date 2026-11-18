import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  implementerTurn,
  makeGoal,
  outcome,
  scriptDigest,
  simpleTask,
  stateOf,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";

const PLAN_1 = `# Milestone 1

## alpha
Create alpha.txt.
Done when: alpha.txt exists.

## p
Create p.txt; it will turn out to be blocked.
Done when: p.txt exists.

## beta
Depends on p landing first; create beta.txt.
Done when: beta.txt exists.

## gamma
Depends on p landing first; create gamma.txt.
Done when: gamma.txt exists.
`;

const PLAN_2 = `# Milestone 1

## alpha
Merged; keeps alpha.txt.

## beta
Create beta2.txt instead of the old beta direction.
Done when: beta2.txt exists.

## delta
Create delta.txt, independent of the parked work.
Done when: delta.txt exists.
`;

const ALPHA = simpleTask("alpha", "alpha.txt");
const P = simpleTask("p", "p.txt");
const BETA_1 = simpleTask("beta", "beta.txt", { deps: ["p"] });
const GAMMA = simpleTask("gamma", "gamma.txt", { deps: ["p"] });
const BETA_2 = simpleTask("beta", "beta2.txt", {
  title: "Create beta2",
  body: "The plan changed: beta2.txt replaces the old beta direction.",
});
const DELTA = simpleTask("delta", "delta.txt");

function scriptFirstIteration(harness: FakeHarness, goalDir: string): void {
  harness.script((req, ctx) => {
    writePlan(goalDir, PLAN_1);
    ctx.writeOutcome(
      outcome({ summary: "planned four tasks", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("existing task files");
    for (const task of [ALPHA, P, BETA_1, GAMMA]) writeTask(goalDir, task);
    ctx.writeOutcome(outcome({ summary: "filed four tasks" }));
    return fakeTurnResult(req);
  });
  harness.script(implementerTurn("alpha.txt"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ status: "blocked", summary: "p needs an owner decision" }),
    );
    return fakeTurnResult(req);
  });
}

function scriptSecondIteration(harness: FakeHarness, goalDir: string): void {
  scriptDigest(harness, goalDir, 2);
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("- turn: `relaunch`");
    writePlan(goalDir, PLAN_2);
    ctx.writeOutcome(
      outcome({
        summary: "changed beta, dropped gamma, added delta",
        decision: "continue",
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    writeTask(goalDir, BETA_2);
    writeTask(goalDir, DELTA);
    fs.appendFileSync(
      path.join(goalDir, "tasks/alpha.md"),
      "\nEdited by the PM.\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "filed the plan change" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain('frozen task "alpha" was edited; restored');
    expect(fs.readFileSync(path.join(goalDir, "tasks/alpha.md"), "utf8")).toBe(
      ALPHA,
    );
    // The failed rung's task writes were rolled back; the retry re-derives them.
    writeTask(goalDir, BETA_2);
    writeTask(goalDir, DELTA);
    ctx.writeOutcome(outcome({ summary: "repair acknowledged" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(
      fs.readFileSync(path.join(goalDir, "tasks/beta.md"), "utf8"),
    ).toContain("beta2.txt");
    fs.writeFileSync(path.join(req.cwd!, "beta2.txt"), "beta2\n", "utf8");
    ctx.writeOutcome(
      outcome({ summary: "beta2 created from the changed task" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "beta2 is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  harness.script(implementerTurn("delta.txt"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "delta is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("- turn: `boundary`");
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
}

describe("KERNEL0 scenario 7 — plan edit between iterations", () => {
  it("re-reads a changed pending task, cancels a removed one, adds one, and restores frozen work", async () => {
    const goal = makeGoal();
    try {
      const first = new FakeHarness({ id: "fake" });
      scriptFirstIteration(first, goal.goalDir);
      await expectLaunch(3, goal.repo, first);

      let state = await stateOf(goal.goalDir);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.p!.status).toBe("parked");
      expect(state.tasks.beta!.status).toBe("pending");
      expect(state.tasks.gamma!.status).toBe("pending");

      const second = new FakeHarness({ id: "fake" });
      scriptSecondIteration(second, goal.goalDir);
      await expectLaunch(0, goal.repo, second, 2);

      state = await stateOf(goal.goalDir);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");
      expect(state.tasks.delta!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("cancelled");
      expect(state.tasks.p!.status).toBe("parked");
      expect(
        fs.readFileSync(path.join(goal.goalDir, "tasks/alpha.md"), "utf8"),
      ).toBe(ALPHA);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      const cancel = records.find(
        (r) => r.step === "cancel" && r.slug === "gamma",
      );
      expect(cancel?.cause).toContain("removed from the plan");
      const reconcile = records.find((r) => r.step === "pm-reconcile");
      expect(reconcile?.cause).toContain(
        'frozen task "alpha" was edited; restored',
      );
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/2/summary.md"),
        "utf8",
      );
      expect(summary).toContain("pm-reconcile");
      expect(summary).toContain("cancelled");
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/2/digest.md")),
      ).toBe(true);
      expect(
        goal.repo.git(["show", "factory/demo:beta2.txt"]).stdout.trim(),
      ).toBe("beta2");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});
