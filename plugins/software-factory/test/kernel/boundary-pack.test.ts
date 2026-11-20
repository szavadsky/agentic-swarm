// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import {
  latestPlanReview,
  PLAN_REVIEW_STEP,
} from "../../src/kernel/plan-review.js";
import type { Outcome } from "../../src/kernel/types.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { rec, task } from "./helpers.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  scriptDigest,
  simpleTask,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";

import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  writeTask as writeRuntimeTask,
  whenTurn,
} from "./s2-helpers.js";
import { writeHold } from "./steer-helpers.js";

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

      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      const packPath = path.join(goal.goalDir, contextPackRelPath(1));
      const written = fs.readFileSync(packPath);
      expect(written.length).toBeGreaterThan(0);
      expect(architect?.packBytes).toBe(written.length);
      const pack = fs.readFileSync(packPath, "utf8");
      expect(pack).toContain(
        `- run config: ${path.join(goal.repo.dir, ".factory/run.yaml")}`,
      );
      expect(pack).toContain("## Open records (started, no end)\n- none");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("never truncates the status table with a hundred parked tasks", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir, undefined, {});
      const slugs: string[] = [];
      for (let i = 0; i < 100; i++) {
        const slug = `bulk-${String(i).padStart(3, "0")}`;
        slugs.push(slug);
        writeTask(goal.goalDir, simpleTask(slug, `${slug}.txt`));
        await store.appendRecord(scriptMeta(1, "park", { slug }), {
          ok: true,
          cause: "seeded terminal for pack size",
        });
      }
      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
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

      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      const pack = fs.readFileSync(
        path.join(goal.goalDir, contextPackRelPath(architect!.iteration)),
        "utf8",
      );
      expect(pack.length).toBeGreaterThan(8000);
      for (const slug of slugs) expect(pack).toContain(`| ${slug} |`);
      expect(pack).toContain(
        `- plan (architect edits this): ${path.join(goal.goalDir, "plan.md")}`,
      );
      expect(pack).toContain(
        `- intent: ${path.join(goal.goalDir, "intent.md")}`,
      );
      expect(pack).toContain(
        `- previous-launch digest: ${path.join(goal.goalDir, "iterations/2/digest.md")}`,
      );
      expect(pack).toContain(
        "## Debt register (open debt-kind concerns; own one by citing its id in a plan bullet, or close it with `debtClosed: [{id, reason}]`)\n- none open",
      );
      expect(pack).toContain("## Open records (started, no end)\n- none");
      expect(pack).toContain(
        `- run config: ${path.join(goal.repo.dir, ".factory/run.yaml")}`,
      );
      expect(architect?.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("lists started-without-end records as open and names the run config", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        PLAN,
        "utf8",
      );
      const closed = await runtime.store.startRecord({
        iteration: 1,
        slug: "alpha",
        step: "implement",
        round: 1,
        actor: "agent",
      });
      await closed.finish({ ok: true });
      const open = await runtime.store.startRecord({
        iteration: 1,
        slug: "beta",
        step: "implement",
        round: 1,
        actor: "agent",
      });
      harness.script((req, ctx) => {
        fs.appendFileSync(
          path.join(runtime.store.goalDir, "plan.md"),
          "\n## architect edit\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      const runPath = runtime.configs.files?.run;
      expect(runPath).toBe(path.join(repo.dir, ".factory/run.yaml"));
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        runConfigPath: runPath,
      });
      expect(boundary.decision).toBe("continue");
      const packRel = contextPackRelPath(boundary.iteration);
      expect(boundary.packPath).toBe(packRel);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, packRel),
        "utf8",
      );
      expect(pack).toContain(`- ${open.dir}`);
      expect(pack).not.toContain(closed.dir);
      expect(pack).toContain(`- run config: ${runPath}`);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("drops an owned debt from the pack the architect receives", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const meta = {
        iteration: 1,
        slug: "alpha",
        step: "review",
        round: 1,
        actor: "agent",
      } as const;
      const debtText =
        "env allowlist v2 is dead config and needs a removal task";
      const debtId = `${recordDirName(1, meta)}#1`;
      await runtime.store.appendRecord(meta, {
        ok: true,
        outcome: {
          status: "done",
          summary: "approved with debt",
          concerns: [
            { kind: "debt", calibration: "architect", text: debtText },
          ],
          forward: [],
          verdict: "approve",
        },
      });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(
        planPath,
        `# Plan\n\n- env-allowlist-v2 — Remove the dead allowlist (${debtId})\n`,
        "utf8",
      );
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## next\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "filed the remover", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no new tasks" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      const pack = fs.readFileSync(
        path.join(
          runtime.store.goalDir,
          contextPackRelPath(boundary.iteration),
        ),
        "utf8",
      );
      const register = pack.slice(pack.indexOf("## Debt register"));
      expect(register).toContain("- none open");
      expect(register).not.toContain(debtId);
      expect(register).not.toContain(debtText);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("lists legacy records whose end.yaml still carries packTruncated", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir, undefined, {});
      const turn = await store.startRecord({
        iteration: 1,
        slug: "alpha",
        step: "architect",
        round: 1,
        actor: "agent",
      });
      await turn.finish({ packBytes: 782 });
      // Pre-uncap records committed end.yaml with the retired flag; listRecords
      // must neither throw on nor drop the unknown key. Pre-seal records were
      // written open, so reopen this one to stage history as it exists.
      const endPath = path.join(turn.dir, "end.yaml");
      fs.chmodSync(endPath, 0o644);
      const raw = fs.readFileSync(endPath, "utf8");
      fs.writeFileSync(
        endPath,
        `${raw + (raw.endsWith("\n") ? "" : "\n")}packTruncated: true\n`,
        "utf8",
      );
      const records = await store.listRecords();
      expect(records.length).toBe(1);
      const [record] = records;
      expect(record?.packBytes).toBe(782);
      expect(
        (record as unknown as { packTruncated?: unknown })?.packTruncated,
      ).toBe(true);
    } finally {
      cleanup(goal);
    }
  });
});

describe("boundary ready aging", () => {
  it("names a ready spike held by its own steer at the next boundary", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeRuntimeTask(
        runtime,
        task("landed", { scope: ["alpha-area"] }),
      );
      await writeRuntimeTask(
        runtime,
        task("no-outcome-forensics-spike", {
          kind: "spike",
          flow: "spike",
          scope: ["outcome detector"],
        }),
      );
      // Segment 1 landed a sibling task; the spike started no turn in it.
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "landed" }),
        { ok: true },
      );
      await postSteer(
        runtime.store,
        "no-outcome-forensics",
        "Hold the spike until I answer.",
      );
      writeHold(runtime, "no-outcome-forensics", [
        "no-outcome-forensics-spike",
      ]);

      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n## landed\n", "utf8");
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## next\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "saw the held spike", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no new tasks" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.iteration).toBe(2);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain(
        "## Ready, no turn in the last segment\n- no-outcome-forensics-spike: held by steer no-outcome-forensics\n",
      );
      expect(pack).not.toContain("- landed: held");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("names a ready task whose next alias has no live tier", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeRuntimeTask(runtime, task("landed"));
      await writeRuntimeTask(runtime, task("starved"));
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "landed" }),
        { ok: true },
      );
      // The implementer's only tier sits in a quota cooldown.
      runtime.exhaustedPools.set("fake+fake-impl", Date.now() + 60_000);
      await postSteer(runtime.store, "note", "Take a look at the plan.");

      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n## landed\n", "utf8");
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## next\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "named the dead tier", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no new tasks" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.iteration).toBe(2);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain(
        '- starved: alias "implementer" has no live tier:',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});

const PLAN_REVIEW_ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
};

describe("boundary plan review", () => {
  it("runs a fresh plan review after the architect and packs its findings for the next consult", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: PLAN_REVIEW_ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");

      let reviewPrompt = "";
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("planReviewMarks");
        expect(req.prompt).toContain("helpful");
        expect(req.prompt).toContain("unhelpful");
        fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          reviewPrompt = req.prompt;
          ctx.writeOutcome(
            outcome({
              summary:
                "alpha's done-when names no test; name the command that proves it.",
              planReview: {
                technical: [],
                planNotes: [
                  {
                    planLine: "plan.md:3",
                    finding:
                      "alpha's done-when names no test; name the command that proves it.",
                  },
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

      const reviewCall = harness.calls.find(
        (call) => fakeTurnIdentity(call).step === PLAN_REVIEW_STEP,
      );
      expect(reviewCall).toBeDefined();
      expect(reviewCall!.model.id).toBe("fake-plan-review");
      expect(reviewCall!.session).toBeUndefined();
      expect(reviewPrompt).toContain("You review the architect's plan");
      expect(reviewPrompt).toContain("advisory input, never a veto");
      expect(reviewPrompt).not.toContain("You review the task diff");
      expect(reviewPrompt).toContain(planPath);
      expect(reviewPrompt).toContain(runtime.paths.goalCheckout);

      const records = await runtime.store.listRecords();
      const review = records.find(
        (record) =>
          record.step === PLAN_REVIEW_STEP && record.actor === "agent",
      );
      expect(review?.alias).toBe("plan-reviewer");
      expect(review?.outcome?.summary).toContain("no test");
      // The next consult's pack carries the advisory findings; the architect
      // marks each one in its outcome, and the mark is on the record.
      harness.script((req, ctx) => {
        const pack = fs.readFileSync(
          path.join(runtime.store.goalDir, contextPackRelPath(2)),
          "utf8",
        );
        expect(pack).toContain("## Plan review");
        expect(pack).toContain("iteration 1, reviewers `plan-reviewer`");
        expect(pack).toContain(
          "1. plan.md:3 — alpha's done-when names no test; name the command that proves it.",
        );
        expect(req.prompt).toContain("mark every numbered finding");
        ctx.writeOutcome(
          outcome({
            summary: "marked the review",
            decision: "done",
            planReviewMarks: [{ finding: 1, mark: "helpful" }],
          }),
        );
        return fakeTurnResult(req);
      });
      const second = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(second.decision).toBe("done");
      const architect = (await runtime.store.listRecords())
        .filter(
          (record) =>
            record.step === "architect" &&
            record.iteration === 2 &&
            record.endedAt,
        )
        .at(-1);
      expect(architect?.outcome?.planReviewMarks).toEqual([
        { finding: 1, mark: "helpful" },
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("packs only the latest plan review attempt, never stale findings", () => {
    const older = rec(1, {
      slug: undefined,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        summary: "stale",
        planReview: {
          technical: [{ planLine: "plan.md", finding: "stale finding" }],
          planNotes: [],
        },
      }) as Outcome,
    });
    const newer = rec(2, {
      slug: undefined,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        summary: "fresh",
        planReview: {
          technical: [{ planLine: "plan.md", finding: "fresh finding" }],
          planNotes: [],
        },
      }) as Outcome,
    });
    expect(latestPlanReview([older, newer])?.technical[0]?.finding).toContain(
      "fresh finding",
    );
    const failed = rec(3, {
      slug: undefined,
      iteration: 3,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        status: "failed",
        summary: "invalid outcome",
      }) as Outcome,
    });
    expect(latestPlanReview([older, newer, failed])).toBeUndefined();
  });
});
