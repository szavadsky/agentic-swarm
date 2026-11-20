// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { PLAN_REVIEW_STEP } from "../../src/kernel/plan-review.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectDispatch,
  expectLaunch,
  makeGoal,
  outcome,
  scriptDigest,
  stateOf,
  writePlan,
} from "./e2e-helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";
import { causeText } from "./helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

/**
 * The architect rotates across harnesses with the same model id, so iteration 1
 * runs on `fake` and iteration 2 on `other`; the declared edge admits the
 * crossing in that direction only.
 */
const CROSS_HARNESS_ARCHITECT_RUN = [
  "aliases:",
  "  architect:",
  "    harness: other",
  "    model: fake-architect",
  "    rotate:",
  "      - { harness: other, model: fake-architect }",
  "      - { harness: fake, model: fake-architect }",
  "  pm: { harness: fake, model: fake-pm }",
  "  digest: { harness: fake, model: fake-digest }",
  "  intent: { harness: fake, model: fake-intent }",
  "  implementer: { harness: fake, model: fake-impl }",
  "  implementer-b: { harness: fake, model: fake-impl-b }",
  "  researcher: { harness: fake, model: fake-research }",
  "  reviewer: { harness: fake, model: fake-review }",
  "  qa: { harness: fake, model: fake-qa }",
  "  steward: { harness: fake, model: fake-steward }",
  "  plan-checker: { harness: fake, model: fake-check }",
  "  plan-reviewer: { harness: fake, model: fake-plan-review }",
  "  pack-preparer: { harness: fake, model: fake-pack-prep }",
  "portability:",
  "  - { from: fake, to: other }",
  "limits: { iterations: 1, concurrency: { overall: 1 } }",
  "",
].join("\n");

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
      const store = createFolderStore(goal.goalDir, undefined, {});
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

  it("resumes the architect across a declared portability edge", async () => {
    const goal = makeGoal({ runYaml: CROSS_HARNESS_ARCHITECT_RUN });
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
      await expectDispatch(
        3,
        ["run", "--repo", goal.repo.dir, "--goal", "demo"],
        { harnesses: { fake: first, other: new FakeHarness({ id: "other" }) } },
      );

      const store = createFolderStore(goal.goalDir, undefined, {});
      const prior = (await store.listRecords()).find(
        (r) => r.step === "architect",
      )?.session;
      expect(prior?.harness).toBe("fake");
      expect(prior?.compacted).toBe(true);

      const second = new FakeHarness({ id: "fake" });
      const other = new FakeHarness({ id: "other" });
      scriptDigest(second, goal.goalDir, 2);
      let resumedHarness: string | undefined;
      let resumedId: string | undefined;
      other.script((req, ctx) => {
        resumedHarness = req.session?.harness;
        resumedId = req.session?.id;
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectDispatch(
        0,
        ["run", "--repo", goal.repo.dir, "--goal", "demo"],
        { harnesses: { fake: second, other } },
      );

      // The second iteration's architect runs on `other` and continues the
      // compacted session the first iteration recorded on `fake`.
      expect(resumedHarness).toBe("fake");
      expect(resumedId).toBe(prior?.id);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
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

      await expectLaunch(3, goal.repo, harness);
      expect(harness.calls).toHaveLength(2);
      expect(harness.calls[1]!.prompt).toContain("plan edit or stop decision");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("plan.md does not exist");
      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
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

      await expectLaunch(3, goal.repo, harness);
      expect(harness.calls).toHaveLength(2);
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
      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
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

      await expectLaunch(1, goal.repo, harness);
      expect(harness.calls).toHaveLength(2);
      expect(harness.calls[1]!.prompt).toContain(
        "You are the front. Your turn did not deliver its class, task, and pack.",
      );
      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
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

const PLAN_REVIEW_ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

describe("plan review session hygiene", () => {
  it("starts every plan review fresh, discards its writes, and never blocks on its failure", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: PLAN_REVIEW_ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");
      const reviewSessions: (string | undefined)[] = [];

      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          reviewSessions.push(req.session?.id);
          fs.writeFileSync(planPath, "# Plan\n\nHACKED\n", "utf8");
          ctx.writeOutcome(
            outcome({
              summary: "alpha needs a test",
              planReview: {
                technical: [],
                planNotes: [
                  { planLine: "# Plan", finding: "alpha needs a test" },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_REVIEW_STEP }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      const first = await runBoundary(runtime, { relaunch: false });
      expect(first.decision).toBe("continue");
      expect(fs.readFileSync(planPath, "utf8")).toContain("- alpha");
      const reconciled = (await runtime.store.listRecords()).find(
        (record) => record.step === "plan-review-reconcile",
      );
      expect(reconciled?.ok).toBe(false);
      expect(causeText(reconciled?.cause)).toContain("plan.md");

      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## beta\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned beta", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          reviewSessions.push(req.session?.id);
          return fakeTurnResult(req, {
            stop: { kind: "infra", cause: "quota" },
          });
        },
        { when: whenTurn({ step: PLAN_REVIEW_STEP }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      const second = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(second.decision).toBe("continue");
      // The first review left a session on the same alias and cwd; the second
      // still starts de novo.
      expect(reviewSessions).toEqual([undefined, undefined]);
      const records = await runtime.store.listRecords();
      const missing = records.find(
        (record) =>
          record.step === "plan-review-missing" && record.iteration === 2,
      );
      expect(missing?.ok).toBe(false);
      expect(causeText(missing?.cause)).toContain("infrastructure: quota");
      expect(
        records.some(
          (record) =>
            record.step === PLAN_REVIEW_STEP &&
            record.iteration === 2 &&
            record.endedAt,
        ),
      ).toBe(true);
      // Advisory: the PM still ran after the failed review.
      expect(
        records.some(
          (record) => record.step === "pm" && record.iteration === 2,
        ),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});
