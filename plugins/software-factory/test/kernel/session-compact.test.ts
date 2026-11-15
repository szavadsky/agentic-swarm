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
  compactSession,
  resumeSessionFor,
} from "../../src/kernel/flow-context.js";
import { iterationMetrics } from "../../src/kernel/metrics.js";
import { sessionCacheHot } from "../../src/kernel/sessions.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
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

describe("session portability", () => {
  it("admits only same-harness resume edges", () => {
    expect(portable("omp", "omp")).toBe(true);
    expect(portable("omp", "opencode")).toBe(false);
  });

  it("resumes the recording harness and refuses a session the alias no longer routes to", async () => {
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
      const runtime = await makeRuntime(repo, goal, {
        fake,
        other: new FakeHarness({ id: "other" }),
      });
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

      const resumed = await resumeSessionFor(
        runtime,
        taskFile,
        "implementer",
        records,
        worktree,
      );
      expect(resumed?.id).toBe(recorded.id);

      // Rotation: the same alias now routes to a different harness.
      runtime.configs.run.aliases.implementer!.harness = "other";
      expect(
        await resumeSessionFor(
          runtime,
          taskFile,
          "implementer",
          records,
          worktree,
        ),
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("end-of-turn compaction", () => {
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

  it("does not compact a turn that ends in a refusal", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy" },
        }),
      );

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

  it("keeps the uncompacted ref when compaction fails and still resumes it", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FailingCompactHarness({ id: "fake" });
      scriptFixRound(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      // The two implement turns attempted; review sessions are never compacted.
      expect(harness.attempts).toBe(2);
      const implement = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.session?.compacted)).toEqual([
        false,
        false,
      ]);
      // The failed compaction cost no session: the fix turn still resumed it.
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session?.id);
      expect(harness.calls[2]!.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

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
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session?.id);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

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

      expect(harness.compactions).toHaveLength(0);
      const implement = (await runtime.store.listRecords()).find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      expect(implement.session?.compacted).toBe(false);
      expect(implement.compactUsage).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("compaction timing and cost", () => {
  const PRICES = {
    "fake-impl": { input: 1, cachedInput: 0.5, output: 2, reasoning: 2 },
    "fake-review": { input: 1, cachedInput: 0.5, output: 2, reasoning: 2 },
  };

  it("compacts the resumed session at its end, records the cost, and the fix resumes fewer input tokens", async () => {
    const { repo, goal } = setupFlowRepo({ prices: PRICES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req, { usage: { in: 10_000, out: 100 } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "needs a fix", verdict: "changes" }),
        );
        return fakeTurnResult(req, { usage: { in: 5_000, out: 50 } });
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        // A compacted transcript restarts small; an uncompacted resume rereads
        // the whole prefix. The recorded input proves which ref the kernel sent.
        const resumed = req.session?.compacted === true;
        return fakeTurnResult(req, {
          usage: { in: resumed ? 1_500 : 10_000, out: 100 },
        });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req, { usage: { in: 5_000, out: 50 } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);

      // Only the resumed session compacts: review sessions have no reader.
      expect(harness.compactions.map((c) => c.id)).toEqual([
        implement[0]!.session!.id,
        implement[1]!.session!.id,
      ]);
      expect(implement.map((r) => r.session?.compacted)).toEqual([true, true]);
      expect(review.map((r) => r.session?.compacted)).toEqual([false, false]);
      expect(sessionCacheHot(implement[0]!.session!)).toBe(true);

      // The turn's counters stay the turn's; the compaction is priced beside them.
      expect(implement[0]!.usage).toMatchObject({ in: 10_000, out: 100 });
      expect(implement[0]!.usage?.costUsd).toBeCloseTo(0.0102, 10);
      expect(implement[0]!.compactUsage).toMatchObject({
        in: 0,
        cacheRead: 8_000,
        out: 400,
      });
      expect(implement[0]!.compactUsage?.costUsd).toBeCloseTo(0.0048, 10);
      expect(review.map((r) => r.compactUsage)).toEqual([undefined, undefined]);

      // The fix resumed the compacted ref, so it reread a trimmed prefix.
      expect(harness.calls[2]!.session?.compacted).toBe(true);
      expect(implement[1]!.usage?.in).toBe(1_500);
      expect(implement[1]!.usage!.in).toBeLessThan(implement[0]!.usage!.in);

      // Metrics price the compaction on top of every attempt.
      const metrics = iterationMetrics(
        1,
        "in-progress",
        records,
        {},
        0,
        PRICES,
      );
      expect(metrics.usage.costUsd).toBeCloseTo(0.03095, 10);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("compacts a cold-resumed session on its next end", async () => {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = {
      harnesses: new Map([["fake", harness]]),
    } as unknown as KernelRuntime;
    const cold: SessionRef = {
      harness: "fake",
      id: "cold-session",
      cwd: "/tmp",
      model: { id: "fake-impl" },
      lastRequestStartedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      retentionTier: "short",
      compacted: true,
    };

    // Cold at session end: skip, keep the ref as it is.
    expect(sessionCacheHot(cold)).toBe(false);
    expect(await compactSession(runtime, cold)).toBeUndefined();
    expect(harness.compactions).toHaveLength(0);

    // The cold resume still runs, and its request restarts the cache lifetime.
    harness.scriptResult({});
    const resumed = await harness.turn({
      model: { id: "fake-impl" },
      cwd: "/tmp",
      prompt: "fix it",
      session: cold,
      timeouts: { idleMs: 1_000, wallMs: 10_000 },
    });
    expect(resumed.session?.id).toBe("cold-session");
    expect(sessionCacheHot(resumed.session!)).toBe(true);

    // Hot again at its next end: compact, with the cost attached.
    const compacted = await compactSession(runtime, resumed.session!);
    expect(compacted?.session.compacted).toBe(true);
    expect(compacted?.usage?.cacheRead).toBeGreaterThan(0);
  });
});
