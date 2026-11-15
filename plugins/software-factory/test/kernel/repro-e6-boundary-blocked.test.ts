import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  type E2EGoal,
  expectLaunch,
  makeGoal,
  outcome,
  scriptDigest,
  writePlan,
} from "./e2e-helpers.js";

const PLAN =
  "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n";

/** The status line plus the boundary remark; enough to see what the summary says. */
function facts(goalDir: string, iteration: number): string {
  const summary = fs.readFileSync(
    path.join(goalDir, `iterations/${iteration}/summary.md`),
    "utf8",
  );
  return summary
    .split("\n")
    .filter((line) =>
      /^status: |^- boundary: |^- no architect outcome|^## Architect/.test(
        line,
      ),
    )
    .map((line) => line.trim())
    .join("\n");
}

/** An architect turn that dies before it can write a decision. */
function diesOn(
  cause: "quota" | "crash" | "auth" | "overflow",
  details: string,
): FakeTurnHandler {
  return (req) =>
    fakeTurnResult(req, { stop: { kind: "infra", cause, details } });
}

/**
 * A first launch that plans and files no tasks: it ends iteration-limit and
 * leaves a compacted architect session the next launch resumes.
 */
async function seedResumableSession(goal: E2EGoal): Promise<SessionRef> {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    writePlan(goal.goalDir, PLAN);
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
    return fakeTurnResult(req);
  });
  await expectLaunch(3, goal.repo, harness);
  const architect = (await createFolderStore(goal.goalDir).listRecords())
    .filter((record) => record.step === "architect")
    .at(-1);
  if (!architect?.session)
    throw new Error("first launch left no architect session");
  return architect.session;
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

describe("E6 inverted: an architect infra death is infra, not blocked-by-user", () => {
  it("retries a quota death once, then stops the launch as infra with the cause", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(diesOn("quota", "quota exceeded for fake-architect"));
      harness.script(diesOn("quota", "quota exceeded for fake-architect"));
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 1);
      expect(result.stop).toBe("infra");
      expect(result.cause).toContain("quota");
      expect(result.cause).toContain("quota exceeded for fake-architect");
      expect(result.iterations).toBe(1);
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).not.toContain("blocked-by-user");
      expect(summary).toContain(
        "architect turn stopped on infrastructure: quota: quota exceeded for fake-architect",
      );
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md")),
      ).toBe(false);
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("treats a crash the same way and exits 1 through the CLI", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(diesOn("crash", "session not found"));
      harness.script(diesOn("crash", "session not found"));
      await expectLaunch(1, goal.repo, harness);
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("a single transient death is retried de novo, not on the resumed session", async () => {
    const goal = makeGoal();
    try {
      const resumed = await seedResumableSession(goal);
      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
      harness.script(diesOn("quota", "quota exceeded for fake-architect"));
      harness.script((req, ctx) => {
        fs.appendFileSync(
          goal.planPath,
          "\n## architect edit after retry\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 2);
      expect(harness.calls[1]?.session?.id).toBe(resumed.id);
      expect(harness.calls[2]?.session).toBeUndefined();
      expect(result.stop).toBe("iteration-limit");
      expect(summary).not.toContain("blocked-by-user");
      expect(summary).not.toContain("stopped-with-debt");
      const architect = (
        await createFolderStore(goal.goalDir).listRecords()
      ).filter((record) => record.step === "architect");
      expect(architect).toHaveLength(3);
      expect(architect.at(-1)?.outcome?.decision).toBe("continue");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("does not retry a resumed session that overflowed past the harness's de-novo retry", async () => {
    const goal = makeGoal();
    try {
      const resumed = await seedResumableSession(goal);
      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
      // The first two are the resumed turn and the harness's own de-novo retry.
      // The third makes an unguarded boundary retry fail as a call count, not
      // as an unscripted-turn error.
      harness.script(diesOn("overflow", "context window exceeded"));
      harness.script(diesOn("overflow", "context window exceeded"));
      harness.script(diesOn("overflow", "context window exceeded"));
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 2);
      expect(result.stop).toBe("infra");
      expect(result.cause).toContain("overflow");
      expect(harness.calls[1]?.session?.id).toBe(resumed.id);
      expect(harness.calls[2]?.session).toBeUndefined();
      expect(harness.calls).toHaveLength(3);
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).not.toContain("blocked-by-user");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("a real owner block (the escalated PM asks) is still blocked-by-user with exit 3", async () => {
    const goal = makeGoal({ runYaml: PM_CHAIN_YAML });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "cannot derive" },
        }),
      );
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "cannot derive" },
        }),
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "blocked", summary: "which alpha did you mean?" }),
        );
        return fakeTurnResult(req);
      });
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
      });
      const summary = facts(goal.goalDir, 1);
      expect(result.stop).toBe("iteration-limit");
      expect(result.cause).toBeUndefined();
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain(
        "boundary: PM escalated and asked: which alpha did you mean?",
      );
      expect(harness.calls).toHaveLength(4);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
