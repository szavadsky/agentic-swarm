import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  latestPlanCheck,
  planCheckBrief,
  planCheckConfigured,
} from "../../src/kernel/plan-check.js";
import { PLAN_CHECK_ROUTES_STEP } from "../../src/kernel/pm.js";
import { appendCancel } from "../../src/kernel/record.js";
import { renderTaskFile } from "../../src/kernel/tasks.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
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
      harness.script((req, ctx) => {
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
                  kind: "continuation",
                  slug: "beta",
                  reason: "mechanical park, runner crashed",
                },
              ],
            },
          }),
        );
        return fakeTurnResult(req);
      });

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
      harness.script((req, ctx) => {
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
      });

      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha\n- beta\n",
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
      harness.script((req, ctx) => {
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
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha\n- beta\n",
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
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "beta can continue",
            planCheck: {
              verdict: "progress",
              evidence: [],
              followUps: [
                {
                  kind: "continuation",
                  slug: "beta",
                  reason: "mechanical park",
                },
              ],
            },
          }),
        );
        return fakeTurnResult(req);
      });

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
        "# Plan\n\n- alpha\n- beta\n",
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

  it("still opens a relaunch with the architect under stale progress evidence", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- alpha\n",
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
      expect(
        (await runtime.store.listRecords()).some(
          (r) => r.step === "architect" && r.iteration === 2,
        ),
      ).toBe(true);
      const pack = await runtime.store.readFile(contextPackRelPath(2));
      expect(pack).toContain("iteration 1, verdict progress");
      expect(pack).toContain("stale claim from the dead launch");
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

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n- alpha\n- beta\n", "utf8");
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      const betaBefore = fs.readFileSync(
        path.join(runtime.store.tasksDir, "beta.md"),
        "utf8",
      );

      harness.script((req, ctx) => {
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
      });

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
      harness.script((req, ctx) => {
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
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("ghost", { scope: ["ghost.txt"] }));
      await writeTask(
        runtime,
        task("app", { scope: ["app.txt"], deps: ["ghost"] }),
      );
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- app\n",
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
      harness.script((req, ctx) => {
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
      });

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
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "beta can continue",
            planCheck: {
              verdict: "progress",
              evidence: [],
              followUps: [
                {
                  kind: "continuation",
                  slug: "beta",
                  reason: "mechanical park",
                },
              ],
            },
          }),
        );
        return fakeTurnResult(req);
      });
      // Both ladder rungs answer without routes; the writes roll back.
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
        "# Plan\n\n- alpha\n- beta\n",
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

  it("skips the checker when the run config has no plan-checker alias", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      expect(planCheckConfigured(runtime)).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("resolves the checker once the alias exists", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      expect(planCheckConfigured(runtime)).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  });

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
});
