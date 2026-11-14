import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import { cleanup, launch, makeGoal, outcome, writePlan } from "./e2e-helpers.js";

const PLAN = "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n";

/** The status line plus the boundary remark; enough to see what the summary says. */
function facts(goalDir: string, iteration: number): string {
  const summary = fs.readFileSync(path.join(goalDir, `iterations/${iteration}/summary.md`), "utf8");
  return summary
    .split("\n")
    .filter((line) => /^status: |^- boundary: |^- no architect outcome|^## Architect/.test(line))
    .map((line) => line.trim())
    .join("\n");
}

/** PM ladder with one escalation tier, so rung 3 is the escalated-first turn. */
const PM_CHAIN_YAML = [
  "aliases:",
  "  architect: { harness: fake, model: fake-architect }",
  "  pm: { harness: fake, model: fake-pm, escalateTo: pm-strong }",
  "  pm-strong: { harness: fake, model: fake-pm-strong }",
  "  implementer: { harness: fake, model: fake-impl }",
  "  reviewer: { harness: fake, model: fake-review }",
  "  digest: { harness: fake, model: fake-digest }",
  "limits: { iterations: 1, concurrency: 1 }",
  "",
].join("\n");

describe("E6: boundary ends blocked, launch reports iteration-limit / exit 3 / no cause", () => {
  it("architect turn stops on infra quota", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "infra", cause: "quota", details: "quota exceeded for fake-architect" },
        })
      );
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 1);
      console.log(
        "E6 architect-infra result:",
        JSON.stringify({ stop: result.stop, cause: result.cause ?? null, iterations: result.iterations })
      );
      console.log("E6 architect-infra summary:", JSON.stringify(summary));
      expect(result.stop).toBe("iteration-limit");
      expect(result.cause).toBeUndefined();
      expect(result.iterations).toBe(1);
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("boundary: architect turn produced no decision: no outcome");
      expect(fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md"))).toBe(false);
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("same architect infra stop (auth) through the CLI exits 3", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "auth", details: "401 unauthorized" } })
      );
      const code = await launch(goal.repo, harness);
      console.log("E6 architect-auth exit code:", code);
      expect(code).toBe(3);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("PM escalated ask: launch reports iteration-limit, exit 3", async () => {
    const goal = makeGoal({ runYaml: PM_CHAIN_YAML });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req) => fakeTurnResult(req, { stop: { kind: "refusal", details: "cannot derive" } }));
      harness.script((req) => fakeTurnResult(req, { stop: { kind: "refusal", details: "cannot derive" } }));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ status: "blocked", summary: "which alpha did you mean?" }));
        return fakeTurnResult(req);
      });
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 1);
      console.log(
        "E6 pm-asked result:",
        JSON.stringify({ stop: result.stop, cause: result.cause ?? null, calls: harness.calls.length })
      );
      console.log("E6 pm-asked summary:", JSON.stringify(summary));
      expect(result.stop).toBe("iteration-limit");
      expect(result.cause).toBeUndefined();
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("boundary: PM escalated and asked: which alpha did you mean?");
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("PM exhausted ladder: launch reports iteration-limit, exit 3", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ status: "failed", summary: "cannot split the plan" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ status: "failed", summary: "cannot split the plan" }));
        return fakeTurnResult(req);
      });
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 1);
      console.log(
        "E6 pm-exhausted result:",
        JSON.stringify({ stop: result.stop, cause: result.cause ?? null, calls: harness.calls.length })
      );
      console.log("E6 pm-exhausted summary:", JSON.stringify(summary));
      expect(result.stop).toBe("iteration-limit");
      expect(result.cause).toBeUndefined();
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("boundary: PM ladder exhausted:");
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("PM rung stops on infra quota (pm-infra-stop): launch stop=infra, exit 1, summary stopped-with-debt", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "infra", cause: "quota", details: "quota exceeded for fake-pm" },
        })
      );
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 1);
      console.log(
        "E6 pm-infra result:",
        JSON.stringify({ stop: result.stop, cause: result.cause ?? null })
      );
      console.log("E6 pm-infra summary:", JSON.stringify(summary));
      expect(result.stop).toBe("infra");
      expect(result.cause).toContain("quota");
      expect(result.cause).toContain("quota exceeded for fake-pm");
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain("quota exceeded for fake-pm");
      expect(harness.calls).toHaveLength(2);
      expect(fs.existsSync(path.join(goal.tasksDir, "alpha.md"))).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("PM infra quota through the CLI exits 1", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "quota", details: "quota" } })
      );
      const code = await launch(goal.repo, harness);
      console.log("E6 pm-infra exit code:", code);
      expect(code).toBe(1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
