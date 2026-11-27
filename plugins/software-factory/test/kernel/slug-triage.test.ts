import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runFront } from "../../src/kernel/front.js";
import { triageIntentSlugs } from "../../src/kernel/intent.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { Outcome, StepRecord } from "../../src/kernel/types.js";
import {
  cleanup,
  type E2EGoal,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
  writePlan,
} from "./e2e-helpers.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

const ANNOTATED = "# Goal\n\n[[TestGoal]] Test goal.\n";

function intentPath(goalDir: string): string {
  return path.join(goalDir, "intent.md");
}

async function recordsOf(goalDir: string): Promise<StepRecord[]> {
  return createFolderStore(goalDir, undefined, {}).listRecords();
}

/** The front's bigger classification: class and pack, never the intent. */
function classifyBigger(goal: E2EGoal): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    expect(req.prompt).toContain("no `[[Slug]]` annotation");
    const pack = path.join(goal.goalDir, "iterations/1/context-pack.md");
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(
      pack,
      "# Front pack\n\n- the intent has no `[[Slug]]` annotations\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(goal.goalDir, "class.yaml"),
      "class: bigger\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "classified bigger" }));
    return fakeTurnResult(req);
  };
}

/** The architect's turn: prove the annotations landed, then plan and stop. */
function planAfterTriage(goal: E2EGoal): FakeTurnHandler {
  return (req, ctx) => {
    expect(fakeTurnIdentity(req).step).toBe("architect");
    expect(fs.readFileSync(intentPath(goal.goalDir), "utf8")).toContain(
      "[[BuildDemo]]",
    );
    writePlan(goal.goalDir, "# Plan\n\n## demo\nBuild the demo.\n");
    ctx.writeOutcome(
      outcome({
        summary: "planned",
        decision: "done",
        intentStatus: [{ slug: "BuildDemo", status: "works" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

describe("front slug triage", () => {
  it("annotates an unannotated bigger goal's intent before the architect reads it", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(classifyBigger(goal));
      harness.script((req, ctx) => {
        expect(fakeTurnIdentity(req).step).toBe("intent");
        expect(req.model.id).toBe("fake-intent");
        expect(req.prompt).toContain("## Annotate");
        expect(req.prompt).toContain("- annotate: `true`");
        expect(req.prompt).toContain(
          "the goal intent carries no [[Slug]] annotations",
        );
        fs.writeFileSync(
          intentPath(goal.goalDir),
          "# Goal\n\n[[BuildDemo]] Build the demo.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "annotated the intent" }));
        return fakeTurnResult(req);
      });
      harness.script(planAfterTriage(goal));

      await expectLaunch(0, goal.repo, harness);

      expect(fs.readFileSync(intentPath(goal.goalDir), "utf8")).toContain(
        "[[BuildDemo]]",
      );
      // The front's note reached the pack the architect read.
      expect(
        fs.readFileSync(
          path.join(goal.goalDir, "iterations/1/context-pack.md"),
          "utf8",
        ),
      ).toContain("no `[[Slug]]` annotations");
      const records = await recordsOf(goal.goalDir);
      const front = records.find((record) => record.step === "front");
      const triage = records.find((record) => record.step === "intent");
      expect(triage?.slug).toBeUndefined();
      const architect = records.find((record) => record.step === "architect");
      expect(triage?.outcome?.status).toBe("done");
      expect(triage?.diff).toContain("[[BuildDemo]]");
      expect(front?.seq).toBeLessThan(triage!.seq);
      expect(triage?.seq).toBeLessThan(architect!.seq);
      expect(
        harness.calls
          .map((call) => fakeTurnIdentity(call).step)
          .filter(
            (step) =>
              step === "front" || step === "intent" || step === "architect",
          ),
      ).toEqual(["front", "intent", "architect"]);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("runs no triage turn for an intent that already carries annotations", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      fs.writeFileSync(
        intentPath(goal.goalDir),
        "# Goal\n\n[[BuildDemo]] Build the demo.\n",
        "utf8",
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script(classifyBigger(goal));
      harness.script(planAfterTriage(goal));

      await expectLaunch(0, goal.repo, harness);

      const records = await recordsOf(goal.goalDir);
      expect(records.filter((record) => record.step === "intent")).toEqual([]);
      expect(
        harness.calls.map((call) => fakeTurnIdentity(call).step),
      ).not.toContain("intent");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});

describe("slug triage turn", () => {
  it("adds annotations in place, then skips the annotated intent on a relaunch", async () => {
    const { repo, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(fakeTurnIdentity(req).step).toBe("intent");
        expect(req.model.id).toBe("fake-intent");
        expect(req.prompt).toContain("## Annotate");
        fs.writeFileSync(intentPath(goalDir), ANNOTATED, "utf8");
        ctx.writeOutcome(outcome({ summary: "annotated" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });

      expect(await triageIntentSlugs(runtime, 1)).toBeUndefined();
      expect(fs.readFileSync(intentPath(goalDir), "utf8")).toBe(ANNOTATED);
      expect(harness.calls).toHaveLength(1);
      // The intent now carries an annotation: a relaunch runs no second turn.
      expect(await triageIntentSlugs(runtime, 1)).toBeUndefined();
      expect(harness.calls).toHaveLength(1);
      const triage = (await runtime.store.listRecords()).filter(
        (record) => record.step === "intent",
      );
      expect(triage).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("retries triage on a relaunch that already carries the front's class", async () => {
    const { repo, goalDir } = setupFlowRepo({ classYaml: "class: bigger\n" });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(intentPath(goalDir), ANNOTATED, "utf8");
        ctx.writeOutcome(outcome({ summary: "annotated" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });
      await runtime.store.appendRecord(
        { iteration: 1, step: "front", round: 1, actor: "agent" },
        { outcome: outcome({ summary: "classified bigger" }) as Outcome },
      );

      const result = await runFront(runtime, {
        iteration: 1,
        state: await stateOf(goalDir),
      });

      expect(result.action).toBe("boundary");
      expect(fs.readFileSync(intentPath(goalDir), "utf8")).toBe(ANNOTATED);
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "intent",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("retries triage on a relaunch whose front turn crashed before sealing its record", async () => {
    const { repo, goalDir } = setupFlowRepo({ classYaml: "class: bigger\n" });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(intentPath(goalDir), ANNOTATED, "utf8");
        ctx.writeOutcome(outcome({ summary: "annotated" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });
      // Killed after writing class.yaml and before end.yaml sealed the record.
      await runtime.store.startRecord({
        iteration: 1,
        step: "front",
        round: 1,
        actor: "agent",
      });

      const result = await runFront(runtime, {
        iteration: 1,
        state: await stateOf(goalDir),
      });

      expect(result.action).toBe("boundary");
      expect(fs.readFileSync(intentPath(goalDir), "utf8")).toBe(ANNOTATED);
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "intent",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stops the front as blocked with step intent when triage returns blocked", async () => {
    const { repo, goalDir } = setupFlowRepo({ classYaml: "class: bigger\n" });
    try {
      const before = fs.readFileSync(intentPath(goalDir), "utf8");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(fakeTurnIdentity(req).step).toBe("intent");
        ctx.writeOutcome(
          outcome({
            status: "blocked",
            summary: "no separable slice to annotate",
          }),
        );
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });
      await runtime.store.appendRecord(
        { iteration: 1, step: "front", round: 1, actor: "agent" },
        { outcome: outcome({ summary: "classified bigger" }) as Outcome },
      );

      const result = await runFront(runtime, {
        iteration: 1,
        state: await stateOf(goalDir),
      });

      expect(result.action).toBe("blocked");
      expect(result.step).toBe("intent");
      expect(result.cause).toContain("no separable slice to annotate");
      expect(fs.readFileSync(intentPath(goalDir), "utf8")).toBe(before);
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "architect",
        ),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stops the front as infra with step intent and restores the intent when prose repair fails twice", async () => {
    const { repo, goalDir } = setupFlowRepo({ classYaml: "class: bigger\n" });
    try {
      const before = fs.readFileSync(intentPath(goalDir), "utf8");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          intentPath(goalDir),
          "# Goal\n\n[[TestGoal]] Rewritten once.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "annotated" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("changed beyond its slug annotations");
        fs.writeFileSync(
          intentPath(goalDir),
          "# Goal\n\n[[TestGoal]] Rewritten twice.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "annotated again" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });
      await runtime.store.appendRecord(
        { iteration: 1, step: "front", round: 1, actor: "agent" },
        { outcome: outcome({ summary: "classified bigger" }) as Outcome },
      );

      const result = await runFront(runtime, {
        iteration: 1,
        state: await stateOf(goalDir),
      });

      expect(result.action).toBe("infra");
      expect(result.step).toBe("intent");
      expect(result.cause).toContain("slug triage ended failed");
      expect(fs.readFileSync(intentPath(goalDir), "utf8")).toBe(before);
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does nothing when the goal has no intent file", async () => {
    const { repo, goalDir } = setupFlowRepo();
    try {
      fs.rmSync(intentPath(goalDir));
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });

      expect(await triageIntentSlugs(runtime, 1)).toBeUndefined();
      expect(harness.calls).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("repairs an edit that rewrites the intent, keeping the wording", async () => {
    const { repo, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          intentPath(goalDir),
          "# Goal\n\n[[TestGoal]] Rewritten goal.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "annotated" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("changed beyond its slug annotations");
        fs.writeFileSync(intentPath(goalDir), ANNOTATED, "utf8");
        ctx.writeOutcome(outcome({ summary: "kept the wording" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, "demo", { fake: harness });

      expect(await triageIntentSlugs(runtime, 1)).toBeUndefined();
      expect(fs.readFileSync(intentPath(goalDir), "utf8")).toBe(ANNOTATED);
      expect(harness.calls).toHaveLength(2);
      const [triage] = (await runtime.store.listRecords()).filter(
        (record) => record.step === "intent",
      );
      expect(triage?.outcome?.status).toBe("done");
      expect(
        triage?.repairFindings?.some((finding) =>
          finding.includes("changed beyond its slug annotations"),
        ),
      ).toBe(true);
      expect(triage?.repairFindingsResolved).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
