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
import { testPriceSource } from "../helpers/price-source.js";
import { withKernelRoleFallbacks, workCalls } from "./fake-defaults.js";

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
  cause: "quota" | "rate" | "crash" | "auth" | "overflow",
  details: string,
): FakeTurnHandler {
  return (req) =>
    fakeTurnResult(req, { stop: { kind: "infra", cause, details } });
}

/** Architect turns only: the boundary's digest and pack preparer also call the harness. */
function architectCalls(harness: FakeHarness) {
  return harness.calls.filter(
    (call) => fakeTurnIdentity(call).step === "architect",
  );
}

/**
 * A first launch that plans and files no tasks: it ends iteration-limit and
 * leaves a compacted architect session the next launch resumes.
 */
async function seedResumableSession(goal: E2EGoal): Promise<SessionRef> {
  const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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
  const architect = (
    await createFolderStore(goal.goalDir, undefined, {}).listRecords()
  )
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
  "  implementer-b: { harness: fake, model: fake-impl-b }",
  "  researcher: { harness: fake, model: fake-research }",
  "  reviewer: { harness: fake, model: fake-review }",
  "  qa: { harness: fake, model: fake-qa }",
  "  steward: { harness: fake, model: fake-steward }",
  "  plan-checker: { harness: fake, model: fake-check }",
  "  plan-reviewer: { harness: fake, model: fake-plan-review }",
  "  pack-preparer: { harness: fake, model: fake-pack-prep }",
  "  digest: { harness: fake, model: fake-digest }",
  "limits: { iterations: 1, concurrency: { overall: 1 } }",
  "",
].join("\n");

describe("E6 inverted: an architect infra death is infra, not blocked-by-user", () => {
  it("stops the launch as infra with the dead architect alias, not a retry on it", async () => {
    const goal = makeGoal();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script(diesOn("quota", "quota exceeded for fake-architect"));
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      const summary = facts(goal.goalDir, 1);
      expect(result.stop).toBe("infra");
      // The only architect tier answered quota: the alias is unavailable, so
      // the de-novo retry never probes it again.
      expect(result.cause).toContain("unavailable");
      expect(result.cause).toContain('alias "architect" has no live tier');
      expect(result.cause).toContain("fake+fake-architect resets at");
      expect(result.iterations).toBe(1);
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).not.toContain("blocked-by-user");
      expect(summary).toContain(
        'architect turn stopped on infrastructure: unavailable: alias "architect" has no live tier',
      );
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md")),
      ).toBe(false);
      expect(workCalls(harness)).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("treats a crash the same way and exits 1 through the CLI", async () => {
    const goal = makeGoal();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script(diesOn("crash", "session not found"));
      harness.script(diesOn("crash", "session not found"));
      await expectLaunch(1, goal.repo, harness);
      expect(workCalls(harness)).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("a single transient death is retried de novo, not on the resumed session", async () => {
    const goal = makeGoal();
    try {
      const resumed = await seedResumableSession(goal);
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      scriptDigest(harness, goal.goalDir, 2);
      // A transient loss, not quota: the alias stays live for the de-novo retry.
      harness.script(diesOn("rate", "rate limited for fake-architect"));
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
        priceSource: testPriceSource(goal.repo.dir),
      });
      const summary = facts(goal.goalDir, 2);
      const architects = architectCalls(harness);
      expect(architects[0]?.session?.id).toBe(resumed.id);
      expect(architects[1]?.session).toBeUndefined();
      expect(result.stop).toBe("iteration-limit");
      expect(summary).not.toContain("blocked-by-user");
      expect(summary).not.toContain("stopped-with-debt");
      const architect = (
        await createFolderStore(goal.goalDir, undefined, {}).listRecords()
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
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      scriptDigest(harness, goal.goalDir, 2);
      // The first two are the resumed turn and the harness's own de-novo retry.
      // The third makes an unguarded boundary retry fail as a call count, not
      // as an unscripted-turn error. The digest scout is background, so
      // `workCalls` counts only the architect attempts.
      harness.script(diesOn("overflow", "context window exceeded"));
      harness.script(diesOn("overflow", "context window exceeded"));
      harness.script(diesOn("overflow", "context window exceeded"));
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      const summary = facts(goal.goalDir, 2);
      expect(result.stop).toBe("infra");
      expect(result.cause).toContain("overflow");
      const architects = architectCalls(harness);
      expect(architects[0]?.session?.id).toBe(resumed.id);
      expect(architects[1]?.session).toBeUndefined();
      expect(workCalls(harness)).toHaveLength(2);
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).not.toContain("blocked-by-user");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("a real owner block (the escalated PM asks) is still blocked-by-user with exit 3", async () => {
    const goal = makeGoal({ runYaml: PM_CHAIN_YAML });
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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
        priceSource: testPriceSource(goal.repo.dir),
      });
      const summary = facts(goal.goalDir, 1);
      expect(result.stop).toBe("iteration-limit");
      expect(result.cause).toBeUndefined();
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain(
        "boundary: PM escalated and asked: which alpha did you mean?",
      );
      expect(workCalls(harness)).toHaveLength(4);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
