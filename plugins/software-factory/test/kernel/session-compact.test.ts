import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import {
  type CompactResult,
  portable,
  type SessionRef,
} from "../../src/harness/types.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  followUpSession,
  type TurnTarget,
} from "../../src/kernel/flow-context.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

/** Implement, get `changes`, fix, get `approve`: the resume path of a fix round. */
function scriptFixRound(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "needs a fix", verdict: "changes" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v2" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/** A harness whose compaction backend is down; every other behaviour is the fake's. */
class FailingCompactHarness extends FakeHarness {
  attempts = 0;

  override async compact(_ref: SessionRef): Promise<CompactResult> {
    this.attempts += 1;
    throw new Error("compact backend down");
  }
}

function registerEndOfTurnCompactionPart1(): void {
  it("does not compact a turn that ends in an infra stop", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "timeout" } }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "infra",
      );

      expect(harness.compactions).toHaveLength(0);
      const record = (await runtime.store.listRecords()).find(
        (r) => r.step === "implement",
      )!;
      expect(record.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerEndOfTurnCompactionPart2(): void {
  it("does not compact a turn that ends in a refusal", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy" },
        }),
      );
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.compactions).toHaveLength(0);
      const record = (await runtime.store.listRecords()).find(
        (r) => r.step === "implement",
      )!;
      expect(record.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerEndOfTurnCompactionPart3(): void {
  it("keeps the uncompacted ref when compaction fails and still resumes it", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FailingCompactHarness({ id: "fake" });
      scriptFixRound(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      // Implement, QA, review, the fix and its second QA and review: every
      // stored ref stays uncompacted when compaction fails.
      expect(harness.attempts).toBe(6);
      const records = await runtime.store.listRecords();
      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.session?.compacted)).toEqual([
        false,
        false,
      ]);
      expect(review.map((r) => r.session?.compacted)).toEqual([false, false]);
      // The failed compaction cost no session: the implement fix and the
      // second review still resume their step's first session.
      expect(harness.calls[3]!.session?.id).toBe(implement[0]!.session?.id);
      expect(harness.calls[3]!.session?.compacted).toBe(false);
      expect(harness.calls[5]!.session?.id).toBe(review[0]!.session?.id);
      expect(harness.calls[5]!.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerEndOfTurnCompactionPart4(): void {
  it("does not compact or precondition a resume on a harness that cannot compact", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({
        id: "fake",
        caps: { compact: "none" },
      });
      scriptFixRound(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.compactions).toHaveLength(0);
      const implement = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.session?.compacted)).toEqual([
        false,
        false,
      ]);
      expect(harness.calls[3]!.session?.id).toBe(implement[0]!.session?.id);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerEndOfTurnCompactionPart5(): void {
  it("skips a compaction whose turn outlived the cache TTL", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        const result = fakeTurnResult(req);
        // A turn longer than the TTL ends with a cold cache: compacting it
        // would pay full input price for the transcript it was meant to trim.
        result.session = {
          harness: "fake",
          id: "stale-session",
          cwd: req.cwd!,
          model: req.model,
          lastRequestStartedAt: new Date(
            Date.now() - 10 * 60_000,
          ).toISOString(),
          retentionTier: "short",
          compacted: false,
        };
        return result;
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      // The cold implement turn skips; QA and the review still compact.
      expect(harness.compactions.map((c) => c.id)).toHaveLength(2);
      expect(harness.compactions.map((c) => c.id)).not.toContain(
        "stale-session",
      );
      const records = await runtime.store.listRecords();
      const implement = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      const review = records.find(
        (r) => r.slug === "task" && r.step === "review",
      )!;
      expect(implement.session?.compacted).toBe(false);
      expect(implement.compactUsage).toBeUndefined();
      expect(review.session?.compacted).toBe(true);
      expect(harness.compactions.map((c) => c.id)).toContain(
        review.session!.id,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerSessionPortabilityPart1(): void {
  it("admits only same-harness resume edges when none are declared", () => {
    expect(portable("omp", "omp")).toBe(true);
    expect(portable("omp", "agent-c")).toBe(false);
  });

  it("admits a declared edge in its direction only", () => {
    const edges = [{ from: "agent-c", to: "omp" }];
    expect(portable("agent-c", "omp", edges)).toBe(true);
    expect(portable("omp", "agent-c", edges)).toBe(false);
    expect(portable("omp", "omp", edges)).toBe(true);
  });
}

/** Implement and approve on `fake`, returning the compacted session to resume. */
async function resumesRecordingHarnessPart1() {
  const { repo, goal } = setupFlowRepo();
  try {
    const fake = new FakeHarness({ id: "fake" });
    fake.script((req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "done\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "implemented" }));
      return fakeTurnResult(req);
    });
    fake.script((req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    });
    const other = new FakeHarness({ id: "other" });
    const runtime = await makeRuntime(repo, goal, { fake, other });
    await writeTask(runtime, task("task", { scope: ["task.txt"] }));
    await runDispatch(runtime, { iteration: 1 });

    const records = await runtime.store.listRecords();
    const taskFile = (await runtime.store.listTasks()).find(
      (t) => t.slug === "task",
    )!;
    const worktree = (await ensureTaskWorktree(runtime, taskFile)).path;
    const recorded = records.find(
      (r) => r.slug === "task" && r.step === "implement",
    )!.session!;
    expect(recorded.compacted).toBe(true);

    return {
      repo,
      runtime,
      taskFile,
      records,
      worktree,
      recorded,
      fake,
      other,
    };
  } catch (error) {
    cleanupFlowRepo(repo);
    throw error;
  }
}

/** Resume on the recording harness, refuse a harness switch, then admit a declared edge. */
async function resumesRecordingHarnessPart2(
  scope: Awaited<ReturnType<typeof resumesRecordingHarnessPart1>>,
) {
  const { runtime, taskFile, records, worktree, recorded, fake, other } = scope;
  try {
    const target = (harness: FakeHarness): TurnTarget => ({
      prompt: "implementer",
      alias: "implementer",
      harness,
      model: { id: "fake-impl" },
      tiers: [{ harness, model: { id: "fake-impl" } }],
      tierOffset: 0,
    });
    const resumed = await followUpSession(
      runtime,
      taskFile,
      target(fake),
      "implement",
      { iteration: 1, round: 1 },
      records,
      worktree,
    );
    expect(resumed?.id).toBe(recorded.id);

    // A harness switch on the same alias.
    runtime.configs.run.aliases.implementer!.harness = "other";
    expect(
      await followUpSession(
        runtime,
        taskFile,
        target(other),
        "implement",
        { iteration: 1, round: 1 },
        records,
        worktree,
      ),
    ).toBeUndefined();

    // A declared edge admits that crossing; the session resumes.
    runtime.configs.run.portability = [{ from: "fake", to: "other" }];
    expect(
      (
        await followUpSession(
          runtime,
          taskFile,
          target(other),
          "implement",
          { iteration: 1, round: 1 },
          records,
          worktree,
        )
      )?.id,
    ).toBe(recorded.id);
  } finally {
    cleanupFlowRepo(scope.repo);
  }
}

function registerSessionPortabilityPart2(): void {
  it("resumes the recording harness and refuses a session the alias no longer routes to", async () => {
    const scope1 = await resumesRecordingHarnessPart1();
    await resumesRecordingHarnessPart2(scope1);
  }, 60_000);
}

describe("session portability", () => {
  registerSessionPortabilityPart1();

  registerSessionPortabilityPart2();
});

describe("end-of-turn compaction", () => {
  registerEndOfTurnCompactionPart1();

  registerEndOfTurnCompactionPart2();

  registerEndOfTurnCompactionPart3();

  registerEndOfTurnCompactionPart4();

  registerEndOfTurnCompactionPart5();
});
