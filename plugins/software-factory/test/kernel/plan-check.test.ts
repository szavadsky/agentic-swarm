// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runGoal } from "../../src/kernel/launch.js";
import {
  latestPlanCheck,
  PLAN_CHECK_STEP,
  planCheckBrief,
  planSlugs,
  runPlanCheck,
  validatePlanCheck,
} from "../../src/kernel/plan-check.js";
import { PLAN_CHECK_ROUTES_STEP, runPlanCheckPm } from "../../src/kernel/pm.js";
import { appendCancel, scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import { testPriceSource } from "../helpers/price-source.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

/** `ALIASES` plus the roles launch pre-flight demands but this goal never runs. */
const LAUNCH_ALIASES = {
  ...ALIASES,
  digest: { harness: "fake", model: "fake-digest" },
  "implementer-b": { harness: "fake", model: "fake-impl-b" },
  researcher: { harness: "fake", model: "fake-research" },
};

function writeFileTurn(file: string, summary: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary }));
    return fakeTurnResult(req);
  };
}

describe("plan checker", () => {
  it("resumes dispatch on progress and re-runs the checker after", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      // Beta's runner crashes mid-turn: a mechanical park with turns left.
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "runner crashed mid-turn" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "beta can continue",
              planCheck: {
                verdict: "progress",
                evidence: [
                  {
                    item: "beta",
                    status: "missing",
                    evidence: "beta implement turn failed; runner crashed",
                  },
                ],
                followUps: [
                  {
                    kind: "replace",
                    slug: "beta",
                    reason: "mechanical park, runner crashed",
                  },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      harness.script((req, ctx) => {
        const cont = task("beta-2", {
          base: "beta",
          scope: ["beta.txt"],
          source: "plan-check: 1",
        });
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "beta-2.md"),
          renderTaskFile(cont),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary: "continued beta",
            planCheckRoutes: [
              { slug: "beta", action: "continue", reason: "mechanical park" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(writeFileTurn("beta.txt", "beta-2 implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta-2 approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "nothing left to continue",
              planCheck: {
                verdict: "architect",
                evidence: [
                  {
                    item: "beta",
                    status: "done",
                    evidence: "beta.txt on the head",
                  },
                ],
                followUps: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        "utf8",
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks["beta-2"]!.status).toBe("merged");
      const checks = records.filter(
        (r) => r.iteration === 1 && r.step === "plancheck" && r.endedAt,
      );
      expect(checks).toHaveLength(2);
      const routes = records.filter(
        (r) =>
          r.iteration === 1 && r.step === PLAN_CHECK_ROUTES_STEP && r.endedAt,
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]!.ok).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("consults the architect on an architect verdict and packs the evidence", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(writeFileTurn("beta.txt", "beta implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "direction problem",
              planCheck: {
                verdict: "architect",
                evidence: [
                  {
                    item: "beta",
                    status: "below-standard",
                    evidence: "review rejected the design twice running",
                  },
                ],
                followUps: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        "utf8",
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(boundary.decision).toBe("done");
      const pack = await runtime.store.readFile(contextPackRelPath(2));
      expect(pack).toContain("## Plan check");
      expect(pack).toContain("iteration 1, verdict architect");
      expect(pack).toContain("- beta (below-standard): review rejected");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("stops checking once its rounds are exhausted", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "runner crashed mid-turn" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "beta can continue",
              planCheck: {
                verdict: "progress",
                evidence: [],
                followUps: [
                  {
                    kind: "replace",
                    slug: "beta",
                    reason: "mechanical park",
                  },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      harness.script((req, ctx) => {
        const cont = task("beta-2", {
          base: "beta",
          scope: ["beta.txt"],
          source: "plan-check: 1",
        });
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "beta-2.md"),
          renderTaskFile(cont),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary: "continued beta",
            planCheckRoutes: [
              { slug: "beta", action: "continue", reason: "mechanical park" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(writeFileTurn("beta.txt", "beta-2 implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta-2 approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        "utf8",
      );

      // No second checker script: an exhausted checker must not turn again.
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const checks = (await runtime.store.listRecords()).filter(
        (r) => r.iteration === 1 && r.step === "plancheck" && r.endedAt,
      );
      expect(checks).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("re-checks a relaunch instead of trusting stale progress evidence, then consults", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha — Alpha.\n",
        "utf8",
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "architect",
          round: 1,
          actor: "agent",
          alias: "architect",
          model: { id: "fake-architect" },
        },
        {
          ok: true,
          outcome: outcome({ summary: "first plan", decision: "continue" }),
        },
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "plancheck",
          round: 1,
          actor: "agent",
          alias: "plan-checker",
          model: { id: "fake-check" },
        },
        {
          ok: true,
          outcome: outcome({
            summary: "stale progress",
            planCheck: {
              verdict: "progress",
              evidence: [
                {
                  item: "alpha",
                  status: "missing",
                  evidence: "stale claim from the dead launch",
                },
              ],
              followUps: [],
            },
          }),
        },
      );

      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "fresh check",
              planCheck: {
                verdict: "architect",
                evidence: [
                  {
                    item: "alpha",
                    status: "missing",
                    evidence: "fresh check after the relaunch",
                  },
                ],
                followUps: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "debt reviewed", decision: "done" }),
        );
        return fakeTurnResult(req);
      });
      const boundary = await runBoundary(runtime, {
        relaunch: true,
        iteration: 2,
      });
      expect(boundary.decision).toBe("done");
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.step === "architect" && r.iteration === 2),
      ).toBe(true);
      // The dead launch's progress claim is not the evidence the consult
      // acts on: the gate checked again, and the fresh architect verdict
      // opened the consult.
      expect(
        records.filter(
          (r) => r.step === PLAN_CHECK_STEP && r.iteration === 2 && r.endedAt,
        ),
      ).toHaveLength(1);
      const pack = await runtime.store.readFile(contextPackRelPath(2));
      expect(pack).toContain("iteration 2, verdict architect");
      expect(pack).toContain("fresh check after the relaunch");
      expect(pack).not.toContain("stale claim from the dead launch");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("discards whatever the checker writes outside its outcome", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "runner crashed mid-turn" }),
        );
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(
        planPath,
        "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        "utf8",
      );
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      const betaBefore = fs.readFileSync(
        path.join(runtime.store.tasksDir, "beta.md"),
        "utf8",
      );

      harness.script(
        (req, ctx) => {
          fs.writeFileSync(planPath, "# Plan\n\nHACKED\n", "utf8");
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "beta.md"),
            "HACKED\n",
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "direction problem",
              planCheck: { verdict: "architect", evidence: [], followUps: [] },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(fs.readFileSync(planPath, "utf8")).toContain("- beta");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
      ).toBe(betaBefore);
      const reconciled = (await runtime.store.listRecords()).filter(
        (r) => r.iteration === 1 && r.step === "plan-check-reconcile",
      );
      expect(reconciled).toHaveLength(1);
      expect(reconciled[0]!.cause).toContain("plan.md");
      expect(reconciled[0]!.cause).toContain("beta");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("unblocks a task waiting on a dead dep through the PM", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "app waits on a dropped dep",
              planCheck: {
                verdict: "progress",
                evidence: [
                  {
                    item: "app",
                    status: "missing",
                    evidence: "app never dispatched; ghost is cancelled",
                  },
                ],
                followUps: [
                  {
                    kind: "missing-dep",
                    slug: "app",
                    dep: "ghost",
                    reason: "ghost is cancelled, app waits forever",
                  },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("ghost", { scope: ["ghost.txt"] }));
      await writeTask(
        runtime,
        task("app", { scope: ["app.txt"], deps: ["ghost"] }),
      );
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- app — App works.\n",
        "utf8",
      );
      await appendCancel(
        runtime.store,
        { iteration: 1, slug: "ghost", round: 1 },
        "dropped from the plan",
      );
      harness.script((req, ctx) => {
        const fixed = task("app", { scope: ["app.txt"], deps: [] });
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "app.md"),
          renderTaskFile(fixed),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary: "dropped the dead dep",
            planCheckRoutes: [
              { slug: "app", action: "continue", reason: "dead dep dropped" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(writeFileTurn("app.txt", "app implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "app approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "nothing left to continue",
              planCheck: {
                verdict: "architect",
                evidence: [],
                followUps: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.app!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("amends a parked task through a plan-check follow-up", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
        { ok: true, cause: "failed: runner crashed mid-turn" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      const betaPath = path.join(runtime.store.tasksDir, "beta.md");
      harness.script(
        (req, ctx) => {
          const current = parseTaskFile(
            fs.readFileSync(betaPath, "utf8"),
            "beta",
          );
          fs.writeFileSync(
            betaPath,
            renderTaskFile({
              ...current,
              revision: 1,
              body: "Amended brief.\nDone when: beta.txt holds beta and a test reads it.",
            }),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "amended beta",
              planCheckRoutes: [
                {
                  slug: "beta",
                  action: "continue",
                  reason: "the brief was too vague to retry",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          {
            kind: "amend",
            slug: "beta",
            reason: "the brief was too vague to retry",
          },
        ],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual(["beta"]);
      const amended = parseTaskFile(fs.readFileSync(betaPath, "utf8"), "beta");
      expect(amended.revision).toBe(1);
      expect(amended.body).toContain("a test reads it");
      const after = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(after.tasks.beta!.status).toBe("ready");
      expect(after.tasks.beta!.turns).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("leaves amend, replace and split follow-ups with no write at rung 1", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        ...ALIASES,
        pm: { ...ALIASES.pm, escalateTo: "pm-2" },
        "pm-2": { harness: "fake", model: "fake-pm-2" },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      for (const slug of ["alpha", "beta", "gamma"])
        await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "left all three for the architect",
              planCheckRoutes: ["alpha", "beta", "gamma"].map((slug) => ({
                slug,
                action: "leave",
                reason: "the plan does not settle it",
              })),
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          { kind: "amend", slug: "alpha", reason: "retry the brief" },
          { kind: "replace", slug: "beta", reason: "one new task" },
          { kind: "split", slug: "gamma", reason: "two outcomes" },
        ],
        cwd: runtime.paths.goalCheckout,
      });

      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
      expect(result.status).toBe("routed");
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha", "beta", "gamma"]);
      const records = await runtime.store.listRecords();
      expect(
        records.filter((record) => record.step === "pm-validate"),
      ).toHaveLength(0);
      expect(
        records.some((record) => record.step === PLAN_CHECK_ROUTES_STEP),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("still refuses a continue on amend, replace and split with no write", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      for (const slug of ["alpha", "beta", "gamma"])
        await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      for (let i = 0; i < 2; i++)
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({
                summary: "continued all three",
                planCheckRoutes: ["alpha", "beta", "gamma"].map((slug) => ({
                  slug,
                  action: "continue",
                  reason: "carry the checker's kind out",
                })),
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          { kind: "amend", slug: "alpha", reason: "retry the brief" },
          { kind: "replace", slug: "beta", reason: "one new task" },
          { kind: "split", slug: "gamma", reason: "two outcomes" },
        ],
        cwd: runtime.paths.goalCheckout,
      });

      expect(result.status).toBe("exhausted");
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm-validate",
      );
      expect(validations).toHaveLength(2);
      for (const { cause } of validations) {
        expect(cause).toContain(
          'slug "alpha" is amended but its file is unchanged',
        );
        expect(cause).toContain('slug "beta" is replaced but has no task');
        expect(cause).toContain('slug "gamma" is split into nothing');
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses a leave route that edits its slug or writes a task for it", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      const alphaPath = path.join(runtime.store.tasksDir, "alpha.md");
      const before = fs.readFileSync(alphaPath, "utf8");
      for (let i = 0; i < 2; i++)
        harness.script(
          (req, ctx) => {
            const current = parseTaskFile(
              fs.readFileSync(alphaPath, "utf8"),
              "alpha",
            );
            fs.writeFileSync(
              alphaPath,
              renderTaskFile({ ...current, revision: 1 }),
              "utf8",
            );
            fs.writeFileSync(
              path.join(runtime.store.tasksDir, "beta-2.md"),
              renderTaskFile(
                task("beta-2", {
                  base: "beta",
                  scope: ["beta.txt"],
                  source: "plan-check: 1",
                }),
              ),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "left both",
                planCheckRoutes: [
                  { slug: "alpha", action: "leave", reason: "stays" },
                  { slug: "beta", action: "leave", reason: "stays" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          { kind: "amend", slug: "alpha", reason: "retry the brief" },
          { kind: "replace", slug: "beta", reason: "one new task" },
        ],
        cwd: runtime.paths.goalCheckout,
      });

      expect(result.status).toBe("exhausted");
      const validations = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm-validate",
      );
      expect(validations).toHaveLength(2);
      for (const { cause } of validations) {
        expect(cause).toContain(
          'task "alpha" was edited; a plan-check turn never edits a slug it does not amend, and leave keeps this file as it was',
        );
        expect(cause).toContain(
          'new task "beta-2" continues "beta", which was routed leave; only replace and split write new tasks',
        );
      }
      expect(fs.readFileSync(alphaPath, "utf8")).toBe(before);
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md")),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses a follow-up that amends merged work", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "beta" }),
        { ok: true, commit: "abc123" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      const betaPath = path.join(runtime.store.tasksDir, "beta.md");
      const before = fs.readFileSync(betaPath, "utf8");
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            const current = parseTaskFile(
              fs.readFileSync(betaPath, "utf8"),
              "beta",
            );
            fs.writeFileSync(
              betaPath,
              renderTaskFile({ ...current, revision: 1 }),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "amended beta",
                planCheckRoutes: [
                  { slug: "beta", action: "continue", reason: "retry" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [{ kind: "amend", slug: "beta", reason: "retry" }],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(validations[0]!.cause).toContain("amend is refused");
      expect(fs.readFileSync(betaPath, "utf8")).toBe(before);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  /** The graph finding a task file raises when it names a dep nothing declares. */
  const missingDepFinding = (slug: string, dep: string): string =>
    `task "${slug}" depends on missing task "${dep}"`;

  /** A checker report that routes beta to the PM over its dead dep. */
  const scriptPlanCheckProgress = (harness: FakeHarness): void => {
    harness.script(
      (req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "beta's dep is dead",
            planCheck: {
              verdict: "progress",
              evidence: [
                {
                  item: "beta",
                  status: "missing",
                  evidence: "beta depends on gone, which no task declares",
                },
              ],
              followUps: [
                {
                  kind: "cancel",
                  slug: "beta",
                  reason: "the dead dep is not derivable from the plan",
                },
              ],
            },
          }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: PLAN_CHECK_STEP }) },
    );
  };

  /** The PM's clean turn: leave beta, write nothing, keep the ladder's exit. */
  const scriptPlanCheckLeave = (harness: FakeHarness): void => {
    harness.script(
      (req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "left beta for the architect",
            planCheckRoutes: [
              {
                slug: "beta",
                action: "leave",
                reason: "the dead dep is not the plan's to derive",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "pm" }) },
    );
  };

  it("surfaces the architect exit from a dispatch-lane plan check", async () => {
    const { repo, goal, goalDir } = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
      );
      fs.writeFileSync(
        path.join(goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );
      scriptPlanCheckProgress(harness);
      scriptPlanCheckLeave(harness);

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(result.cause).toBe(
        `PM ladder routed to the architect: ${missingDepFinding("beta", "gone")}`,
      );
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
      const records = await runtime.store.listRecords();
      expect(records.some((record) => record.step === "pm-validate")).toBe(
        false,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("carries the boundary lane's architect finding into the next consult", async () => {
    const { repo, goal, goalDir } = setupFlowRepo({
      aliases: LAUNCH_ALIASES,
      limits: { iterations: 2, planCheckRounds: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
      );
      fs.writeFileSync(
        path.join(goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );
      scriptPlanCheckProgress(harness);
      scriptPlanCheckLeave(harness);
      harness.script(
        (req, ctx) => {
          const summary = fs.readFileSync(
            path.join(goalDir, "iterations/1/summary.md"),
            "utf8",
          );
          expect(summary).toContain(
            `PM ladder routed to the architect: ${missingDepFinding("beta", "gone")}`,
          );
          const pack = fs.readFileSync(
            path.join(goalDir, contextPackRelPath(2)),
            "utf8",
          );
          expect(pack).toContain("previous iteration summary");
          ctx.writeOutcome(
            outcome({ summary: "read the finding", decision: "done" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "architect" }) },
      );

      const result = await runGoal({
        repo: repo.dir,
        goal,
        iterations: 2,
        harnesses: { fake: harness },
        priceSource: testPriceSource(repo.dir),
      });
      expect(result.stop).toBe("done");
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "architect",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("keeps a clean plan-check turn and routes a pre-existing finding to the architect", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
        { ok: true, cause: "failed: runner crashed mid-turn" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      const betaPath = path.join(runtime.store.tasksDir, "beta.md");
      harness.script(
        (req, ctx) => {
          const current = parseTaskFile(
            fs.readFileSync(betaPath, "utf8"),
            "beta",
          );
          fs.writeFileSync(
            betaPath,
            renderTaskFile({
              ...current,
              revision: 1,
              body: "Amended brief.\nDone when: beta.txt holds beta.",
            }),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "amended beta; the dead dep is not the plan's to derive",
              planCheckRoutes: [
                {
                  slug: "beta",
                  action: "continue",
                  reason: "the brief was too vague to retry",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          {
            kind: "amend",
            slug: "beta",
            reason: "the brief was too vague to retry",
          },
        ],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.status).toBe("architect");
      if (result.status === "architect")
        expect(result.findings).toEqual([missingDepFinding("beta", "gone")]);
      expect(result.continued).toEqual(["beta"]);
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
      // The amend stands: only a finding no rung can fix stopped the ladder.
      expect(
        parseTaskFile(fs.readFileSync(betaPath, "utf8"), "beta").revision,
      ).toBe(1);
      const records = await runtime.store.listRecords();
      expect(records.some((record) => record.step === "pm-validate")).toBe(
        false,
      );
      expect(
        records.some(
          (record) =>
            record.step === PLAN_CHECK_ROUTES_STEP && record.ok === true,
        ),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("still escalates on a finding a plan-check turn introduced", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        ...ALIASES,
        pm: { ...ALIASES.pm, escalateTo: "pm-2" },
        "pm-2": { harness: "fake", model: "fake-pm-2" },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
        { ok: true, cause: "failed: runner crashed mid-turn" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      for (const summary of ["wrote a self dep", "wrote it again"]) {
        harness.script(
          (req, ctx) => {
            fs.writeFileSync(
              path.join(runtime.store.tasksDir, "beta-2.md"),
              renderTaskFile(
                task("beta-2", {
                  base: "beta",
                  scope: ["beta.txt"],
                  deps: ["beta-2"],
                  source: "plan-check: 1",
                }),
              ),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary,
                planCheckRoutes: [
                  {
                    slug: "beta",
                    action: "continue",
                    reason: "retry on a fresh branch",
                  },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      harness.script(
        (req, ctx) => {
          expect(req.model.id).toBe("fake-pm-2");
          ctx.writeOutcome(
            outcome({
              summary: "left beta",
              planCheckRoutes: [
                {
                  slug: "beta",
                  action: "leave",
                  reason: "needs the architect",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          {
            kind: "cancel",
            slug: "beta",
            reason: "the architect must rule on the dead dep",
          },
        ],
        cwd: runtime.paths.goalCheckout,
      });
      expect(harness.calls.map((call) => call.model.id)).toEqual([
        "fake-pm",
        "fake-pm",
        "fake-pm-2",
      ]);
      expect(result.status).toBe("architect");
      if (result.status === "architect")
        expect(result.findings).toEqual([missingDepFinding("beta", "gone")]);
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["beta"]);
      const validations = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm-validate",
      );
      expect(validations).toHaveLength(2);
      for (const record of validations) {
        expect(record.cause).toContain('task "beta-2" depends on itself');
        expect(record.cause).not.toContain(missingDepFinding("beta", "gone"));
      }
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md")),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("falls back to the boundary when the PM routes nothing", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "runner crashed mid-turn" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "beta can continue",
              planCheck: {
                verdict: "progress",
                evidence: [],
                followUps: [
                  {
                    kind: "replace",
                    slug: "beta",
                    reason: "mechanical park",
                  },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );
      // Both ladder rungs answer without routes; the writes roll back.
      scriptStallLeave(harness, ["beta"]);
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no routes" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "still no routes" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        "utf8",
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md")),
      ).toBe(false);
      const routes = (await runtime.store.listRecords()).filter(
        (r) =>
          r.iteration === 1 && r.step === PLAN_CHECK_ROUTES_STEP && r.endedAt,
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]!.ok).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("skips the checker when the goal has no plan", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "runner crashed mid-turn" }),
        );
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      // No plan on disk and no checker script: the front path dispatches
      // through exhaustion without spending a checker turn.
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const checks = (await runtime.store.listRecords()).filter(
        (r) => r.step === "plancheck",
      );
      expect(checks).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("defaults planCheckRounds to 2 and honours the knob", async () => {
    const plain = setupFlowRepo({ aliases: ALIASES });
    try {
      const runtime = await makeRuntime(plain.repo, plain.goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      expect(runtime.limits.planCheckRounds).toBe(2);
    } finally {
      cleanupFlowRepo(plain.repo);
    }
    const tuned = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 5 },
    });
    try {
      const runtime = await makeRuntime(tuned.repo, tuned.goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      expect(runtime.limits.planCheckRounds).toBe(5);
    } finally {
      cleanupFlowRepo(tuned.repo);
    }
  });

  it("briefs the checker with parked causes", () => {
    const tasks = [task("a"), task("b")];
    const state = derive(tasks, [
      rec(1, { slug: "a", step: "park", ok: true, cause: "blocked: stuck" }),
    ]);
    const brief = planCheckBrief(state, tasks);
    expect(brief).toContain("- a | parked |");
    expect(brief).toContain("- a: blocked: stuck");
  });

  it("packs the latest reported check", () => {
    const stale = rec(1, {
      slug: undefined,
      step: "plancheck",
      outcome: outcome({
        planCheck: {
          verdict: "progress",
          evidence: [{ item: "a", status: "missing", evidence: "old" }],
          followUps: [],
        },
      }),
    });
    const fresh = rec(2, {
      slug: undefined,
      step: "plancheck",
      outcome: outcome({
        planCheck: {
          verdict: "architect",
          evidence: [{ item: "a", status: "done", evidence: "new" }],
          followUps: [],
        },
      }),
    });
    const silent = rec(3, { slug: undefined, step: "plancheck" });
    expect(latestPlanCheck([stale, silent, fresh])?.verdict).toBe("architect");
    expect(latestPlanCheck([stale, silent, fresh])?.evidence).toEqual([
      { item: "a", status: "done", evidence: "new" },
    ]);
    expect(latestPlanCheck([silent])).toBeUndefined();
    expect(latestPlanCheck([])).toBeUndefined();
  });

  it("bounds follow-up slugs by plan bullets and exempts a dead dep", () => {
    const plan = [
      "# Plan",
      "",
      "- app — App works.",
      "- beta — Beta works.",
      "",
      "Retired: gamma was merged.",
    ].join("\n");
    expect([...planSlugs(plan)].sort()).toEqual(["app", "beta"]);
    const check = outcome({
      planCheck: {
        verdict: "progress",
        evidence: [],
        followUps: [
          {
            kind: "missing-dep",
            slug: "app",
            dep: "ghost",
            reason: "ghost is gone",
          },
          { kind: "amend", slug: "gamma", reason: "retry the old slug" },
        ],
      },
    });
    expect(validatePlanCheck(plan, check)).toEqual([
      'follow-up slug "gamma" has no "- gamma —" bullet in the plan; merged and retired slugs are history',
    ]);
  });

  it("repairs a follow-up outside the plan and briefs the PM with the rest", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );

      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "beta can continue",
              planCheck: {
                verdict: "progress",
                evidence: [],
                followUps: [
                  {
                    kind: "cancel",
                    slug: "beta",
                    reason: "no longer worth it",
                  },
                  { kind: "amend", slug: "retired", reason: "old slug" },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );
      let repairPrompt = "";
      harness.script(
        (req, ctx) => {
          repairPrompt = req.prompt;
          ctx.writeOutcome(
            outcome({
              summary: "beta can continue",
              planCheck: {
                verdict: "progress",
                evidence: [],
                followUps: [
                  {
                    kind: "cancel",
                    slug: "beta",
                    reason: "no longer worth it",
                  },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      const checked = await runPlanCheck(runtime, {
        iteration: 1,
        round: 1,
        state,
      });
      expect(checked.verdict).toBe("progress");
      expect(checked.followUps.map((item) => item.slug)).toEqual(["beta"]);
      expect(repairPrompt).toContain(
        'follow-up slug "retired" has no "- retired —" bullet in the plan',
      );
      expect(repairPrompt).not.toContain('follow-up slug "beta"');

      let pmPrompt = "";
      harness.script(
        (req, ctx) => {
          pmPrompt = req.prompt;
          ctx.writeOutcome(
            outcome({
              summary: "left beta",
              planCheckRoutes: [
                {
                  slug: "beta",
                  action: "leave",
                  reason: "needs the architect",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const followed = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: checked.followUps,
        cwd: runtime.paths.goalCheckout,
      });
      expect(followed.left).toEqual(["beta"]);
      expect(pmPrompt).toContain("- beta (cancel)");
      expect(pmPrompt).not.toContain("retired");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("checks before the architect at a boundary, resumes dispatch on progress, and consults at the bound", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
        { ok: true, cause: "failed: runner crashed mid-turn" },
      );
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );

      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "beta can continue",
              planCheck: {
                verdict: "progress",
                evidence: [],
                followUps: [
                  {
                    kind: "replace",
                    slug: "beta",
                    reason: "mechanical park",
                  },
                ],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "beta-2.md"),
            renderTaskFile(
              task("beta-2", {
                scope: ["beta.txt"],
                source: "plan-check: 1",
              }),
            ),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "continued beta",
              planCheckRoutes: [
                {
                  slug: "beta",
                  action: "continue",
                  reason: "mechanical park",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      scriptStallLeave(harness, ["beta"]);
      // Boundary 1: the checker runs first; its progress resumes dispatch
      // through the PM without an architect turn.
      const first = await runBoundary(runtime, {
        relaunch: false,
        iteration: 1,
      });
      expect(first.decision).toBe("continue");
      expect(
        harness.calls.some(
          (call) => fakeTurnIdentity(call).step === "architect",
        ),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md")),
      ).toBe(true);

      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "beta-2 implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta-2", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "beta-2 approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta-2", step: "review" }) },
      );
      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(
        derive(
          await runtime.store.listTasks(),
          await runtime.store.listRecords(),
          runtime.configs.process.flows,
        ).tasks["beta-2"]!.status,
      ).toBe("merged");

      // Boundary 2: the single allowed round is spent, so the architect runs.
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to file" }));
        return fakeTurnResult(req);
      });
      const second = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(second.decision).toBe("done");
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "architect",
        ),
      ).toHaveLength(1);
      // One checker turn: the gate's. The bound stopped dispatch re-checking.
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === PLAN_CHECK_STEP,
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("hands the checker the last gate record and no gate command", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      const checks = (summary: string) => [
        {
          name: "readme",
          ok: true,
          summary,
          output: "",
          fingerprint: "abc123",
        },
      ];
      await runtime.store.appendRecord(
        scriptMeta(1, "checks", { slug: "alpha", round: 1 }),
        { ok: true, checks: checks("pass") },
      );
      const last = await runtime.store.appendRecord(
        scriptMeta(1, "merge-checks", { slug: "alpha", round: 1 }),
        { ok: true, checks: checks("pass on the merged tree") },
      );
      let prompt = "";
      harness.script(
        (req, ctx) => {
          prompt = req.prompt;
          ctx.writeOutcome(
            outcome({
              summary: "nothing to add",
              planCheck: {
                verdict: "architect",
                evidence: [],
                followUps: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      await runPlanCheck(runtime, { iteration: 1, round: 1, state });

      const record = path.join(
        runtime.store.recordsDir,
        `00002-i1-alpha-merge-checks-r1`,
        "end.yaml",
      );
      expect(prompt).toContain(record);
      expect(last.seq).toBe(2);
      // The checker reads the record; the configured gate commands stay out.
      expect(prompt).not.toContain("test -f README.md");
      expect(prompt).not.toContain("Run the gate commands");
      expect(prompt).toContain("never run a gate, test or lint command");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
