// biome-ignore-all lint/complexity: split-rest
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
  followUpSession,
  type TurnTarget,
} from "../../src/kernel/flow-context.js";
import { iterationMetrics } from "../../src/kernel/metrics.js";
import { sessionCacheHot } from "../../src/kernel/sessions.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { rec, task } from "./helpers.js";
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

/** The implement step's fix switches to a second harness and keeps the transcript. */
const crossHarnessFlow = {
  process: {
    flows: {
      "implement-review": {
        steps: [
          {
            id: "implement",
            prompt: "implementer",
            alias: "implementer",
            followUp: {
              mode: "different-model",
              alias: "implementer-strong",
              keepSession: true,
            },
          },
          {
            id: "review",
            prompt: "reviewer",
            alias: "reviewer",
            review: true,
            changeRequests: 2,
            deliverable: "verdict",
          },
        ],
      },
    },
  },
  aliases: {
    architect: { harness: "fake", model: "fake-architect" },
    pm: { harness: "fake", model: "fake-pm" },
    implementer: { harness: "fake", model: "fake-impl" },
    reviewer: { harness: "fake", model: "fake-review" },
    steward: { harness: "fake", model: "fake-steward" },
    "plan-checker": { harness: "fake", model: "fake-check" },
    "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
    "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
    "implementer-strong": { harness: "other", model: "fake-strong" },
  },
};

/** Implement and both reviews on `fake`; the fix runs on `other`. */
function scriptCrossHarness(fake: FakeHarness, other: FakeHarness): void {
  fake.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  fake.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "needs a fix", verdict: "changes" }));
    return fakeTurnResult(req);
  });
  other.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v2" }));
    return fakeTurnResult(req);
  });
  fake.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

describe("session portability", () => {
  it("admits only same-harness resume edges when none are declared", () => {
    expect(portable("omp", "omp")).toBe(true);
    expect(portable("omp", "opencode")).toBe(false);
  });

  it("admits a declared edge in its direction only", () => {
    const edges = [{ from: "opencode", to: "omp" }];
    expect(portable("opencode", "omp", edges)).toBe(true);
    expect(portable("omp", "opencode", edges)).toBe(false);
    expect(portable("omp", "omp", edges)).toBe(true);
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
        records,
        worktree,
      );
      expect(resumed?.id).toBe(recorded.id);

      // Rotation: the same alias now routes to a different harness.
      runtime.configs.run.aliases.implementer!.harness = "other";
      expect(
        await followUpSession(
          runtime,
          taskFile,
          target(other),
          "implement",
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
            records,
            worktree,
          )
        )?.id,
      ).toBe(recorded.id);
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

  it("keeps the uncompacted ref when compaction fails and still resumes it", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FailingCompactHarness({ id: "fake" });
      scriptFixRound(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      // All four turns attempted; every stored ref stays uncompacted.
      expect(harness.attempts).toBe(4);
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
      // The failed compaction cost no session: both follow-ups still resumed it.
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session?.id);
      expect(harness.calls[2]!.session?.compacted).toBe(false);
      expect(harness.calls[3]!.session?.id).toBe(review[0]!.session?.id);
      expect(harness.calls[3]!.session?.compacted).toBe(false);
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

      // The cold implement turn skips; the hot review turn still compacts.
      expect(harness.compactions.map((c) => c.id)).toHaveLength(1);
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
      expect(harness.compactions[0]!.id).toBe(review.session!.id);
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
    const { repo, goal } = setupFlowRepo({ priceTable: PRICES });
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

      // Every turn compacts at its end; both follow-ups resume a compacted ref.
      expect(harness.compactions.map((c) => c.id)).toEqual([
        implement[0]!.session!.id,
        review[0]!.session!.id,
        implement[1]!.session!.id,
        review[1]!.session!.id,
      ]);
      expect(implement.map((r) => r.session?.compacted)).toEqual([true, true]);
      expect(review.map((r) => r.session?.compacted)).toEqual([true, true]);
      expect(sessionCacheHot(implement[0]!.session!)).toBe(true);
      expect(sessionCacheHot(review[0]!.session!)).toBe(true);

      // The turn's counters stay the turn's; the compaction is priced beside them.
      expect(implement[0]!.usage).toMatchObject({ in: 10_000, out: 100 });
      expect(implement[0]!.usage?.costUsd).toBeCloseTo(0.0102, 10);
      expect(implement[0]!.compactUsage).toMatchObject({
        in: 0,
        cacheRead: 8_000,
        out: 400,
      });
      expect(implement[0]!.compactUsage?.costUsd).toBeCloseTo(0.0048, 10);
      expect(review[0]!.compactUsage).toMatchObject({
        in: 0,
        cacheRead: 8_000,
        out: 400,
      });
      expect(review[0]!.compactUsage?.costUsd).toBeCloseTo(0.0048, 10);

      // Both follow-ups resumed a compacted ref; the fix reread a trimmed prefix.
      expect(harness.calls[2]!.session?.compacted).toBe(true);
      expect(harness.calls[3]!.session?.compacted).toBe(true);
      expect(harness.calls[3]!.session?.id).toBe(review[0]!.session!.id);
      expect(implement[1]!.usage?.in).toBe(1_500);
      expect(implement[1]!.usage!.in).toBeLessThan(implement[0]!.usage!.in);
      // A resumed review prices its unsplit prefix at the cached rate.
      expect(review[1]!.usage?.costUsd).toBeCloseTo(0.0026, 10);

      // Metrics price the compaction on top of every attempt.
      const metrics = iterationMetrics(
        1,
        "in-progress",
        records,
        {},
        0,
        PRICES,
      );
      expect(metrics.usage.costUsd).toBeCloseTo(0.03805, 10);
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

describe("review session resume", () => {
  it("review r2 resumes the compacted r1 session on the same alias with a delta prompt", async () => {
    const { repo, goal } = setupFlowRepo();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFixRound(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const impl = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);

      // r1 ends compacted and stored; r2 resumes it on the same alias.
      expect(review[0]!.session?.compacted).toBe(true);
      expect(harness.compactions.map((c) => c.id)).toContain(
        review[0]!.session!.id,
      );
      expect(harness.calls[1]!.session).toBeUndefined();
      expect(harness.calls[3]!.session?.id).toBe(review[0]!.session!.id);
      expect(harness.calls[3]!.session?.compacted).toBe(true);
      expect(review.map((r) => r.alias)).toEqual(["reviewer", "reviewer"]);
      // The r2 record names the resumed session.
      expect(review[1]!.session?.id).toBe(review[0]!.session!.id);
      expect(review[1]!.cachedPrefix).toBe(true);
      // Never the implementer's session, although the fix is more recent.
      expect(review[0]!.session!.id).not.toBe(impl[0]!.session!.id);
      expect(harness.calls[3]!.session?.id).not.toBe(impl[1]!.session!.id);

      // The delta prompt: the diff since r1 plus the fix dispositions.
      const r1Prompt = harness.calls[1]!.prompt;
      const r2Prompt = harness.calls[3]!.prompt;
      expect(r1Prompt).toContain(`${impl[0]!.base}..${impl[0]!.commit}`);
      expect(r2Prompt).toContain(`${review[0]!.commit}..${impl[1]!.commit}`);
      expect(review[0]!.commit).not.toBe(impl[0]!.base);
      expect(r2Prompt).toContain("needs a fix");
      expect(r2Prompt).toContain("v2");
      expect(warnings).toEqual([]);
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("starts de novo with the reason logged when the alias harness changed", async () => {
    const { repo, goal } = setupFlowRepo();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const fake = new FakeHarness({ id: "fake" });
      const other = new FakeHarness({ id: "other" });
      const runtime = await makeRuntime(repo, goal, { fake, other });
      fake.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "needs a fix", verdict: "changes" }),
        );
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        runtime.configs.run.aliases.reviewer!.harness = "other";
        return fakeTurnResult(req);
      });
      other.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(fake.calls).toHaveLength(3);
      expect(other.calls).toHaveLength(1);
      expect(other.calls[0]!.session).toBeUndefined();
      const review = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      expect(review[1]!.session?.harness).toBe("other");
      expect(review[1]!.session?.id).not.toBe(review[0]!.session?.id);
      expect(review[1]!.cachedPrefix).toBeUndefined();
      expect(warnings.join("\n")).toContain("starts de novo");
      expect(warnings.join("\n")).toContain("is not portable to");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("starts de novo with the reason logged when the harness cannot resume", async () => {
    const { repo, goal } = setupFlowRepo();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const harness = new FakeHarness({ id: "fake", caps: { resume: false } });
      scriptFixRound(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.calls[3]!.session).toBeUndefined();
      const review = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      expect(review[1]!.session?.id).not.toBe(review[0]!.session?.id);
      expect(review[1]!.cachedPrefix).toBeUndefined();
      expect(warnings.join("\n")).toContain("starts de novo");
      expect(warnings.join("\n")).toContain("cannot resume");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("resumes reviews while an implement different-model follow-up starts de novo", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: {
          "implement-review": {
            steps: [
              {
                id: "implement",
                prompt: "implementer",
                alias: "implementer",
                followUp: {
                  mode: "different-model",
                  alias: "implementer-strong",
                },
              },
              {
                id: "review",
                prompt: "reviewer",
                alias: "reviewer",
                review: true,
                changeRequests: 2,
                deliverable: "verdict",
              },
            ],
          },
        },
      },
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "fake-impl" },
        reviewer: { harness: "fake", model: "fake-review" },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
        "implementer-strong": { harness: "fake", model: "fake-strong" },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFixRound(harness);
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
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer-strong",
      ]);
      expect(harness.calls[2]!.session).toBeUndefined();
      expect(harness.calls[3]!.session?.id).toBe(review[0]!.session!.id);
      expect(review.map((r) => r.session?.compacted)).toEqual([true, true]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the compacted transcript across a declared cross-harness switch", async () => {
    const { repo, goal } = setupFlowRepo(crossHarnessFlow);
    try {
      const fake = new FakeHarness({ id: "fake" });
      const other = new FakeHarness({ id: "other" });
      scriptCrossHarness(fake, other);
      const runtime = await makeRuntime(repo, goal, { fake, other });
      runtime.configs.run.portability = [{ from: "fake", to: "other" }];
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const implement = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer-strong",
      ]);
      expect(other.calls).toHaveLength(1);
      expect(other.calls[0]!.model.id).toBe("fake-strong");
      // The declared edge admits the compacted session; the fix continues it.
      expect(other.calls[0]!.session?.id).toBe(implement[0]!.session!.id);
      expect(other.calls[0]!.session?.compacted).toBe(true);
      // A resumed ref keeps the harness that recorded it.
      expect(implement[1]!.session?.id).toBe(implement[0]!.session!.id);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("starts de novo with the reason logged on an undeclared harness edge", async () => {
    const { repo, goal } = setupFlowRepo(crossHarnessFlow);
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const fake = new FakeHarness({ id: "fake" });
      const other = new FakeHarness({ id: "other" });
      scriptCrossHarness(fake, other);
      const runtime = await makeRuntime(repo, goal, { fake, other });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const implement = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer-strong",
      ]);
      expect(other.calls).toHaveLength(1);
      expect(other.calls[0]!.session).toBeUndefined();
      // No session crosses: the fix records a fresh session on the new harness.
      expect(implement[1]!.session?.harness).toBe("other");
      expect(implement[1]!.session?.compacted).toBe(true);
      expect(warnings.join("\n")).toContain("starts de novo");
      expect(warnings.join("\n")).toContain(
        'harness "fake" is not portable to "other"',
      );
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("resumes only its own step session, never the implementer's on a shared alias", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const fake = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake });
      const taskFile = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, taskFile);
      const worktree = (await ensureTaskWorktree(runtime, taskFile)).path;
      const now = new Date().toISOString();
      const session = (id: string): SessionRef => ({
        harness: "fake",
        id,
        cwd: worktree,
        model: { id: "fake-review" },
        lastRequestStartedAt: now,
        retentionTier: "short",
        compacted: true,
      });
      const records = [
        rec(1, {
          slug: "task",
          step: "implement",
          alias: "reviewer",
          session: session("impl-session"),
        }),
        rec(2, {
          slug: "task",
          step: "review",
          alias: "reviewer",
          session: session("review-session"),
        }),
        rec(3, {
          slug: "task",
          step: "implement",
          alias: "reviewer",
          session: session("impl-fix-session"),
        }),
      ];
      const resumed = await followUpSession(
        runtime,
        taskFile,
        {
          prompt: "reviewer",
          alias: "reviewer",
          harness: fake,
          model: { id: "fake-review" },
          tiers: [{ harness: fake, model: { id: "fake-review" } }],
          tierOffset: 0,
        },
        "review",
        records,
        worktree,
      );
      expect(resumed?.id).toBe("review-session");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("starts de novo with the reason logged on an alias change or cwd mismatch", async () => {
    const { repo, goal } = setupFlowRepo();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const fake = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake });
      const taskFile = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, taskFile);
      const worktree = (await ensureTaskWorktree(runtime, taskFile)).path;
      const now = new Date().toISOString();
      const prior: SessionRef = {
        harness: "fake",
        id: "review-session",
        cwd: worktree,
        model: { id: "fake-review" },
        lastRequestStartedAt: now,
        retentionTier: "short",
        compacted: true,
      };
      const records = [
        rec(1, {
          slug: "task",
          step: "review",
          alias: "reviewer",
          session: prior,
        }),
      ];
      const moved: SessionRef = { ...prior, cwd: "/tmp/elsewhere" };
      const movedRecords = [
        rec(1, {
          slug: "task",
          step: "review",
          alias: "reviewer",
          session: moved,
        }),
      ];
      expect(
        await followUpSession(
          runtime,
          taskFile,
          {
            prompt: "reviewer",
            alias: "implementer",
            harness: fake,
            model: { id: "fake-review" },
            tiers: [{ harness: fake, model: { id: "fake-review" } }],
            tierOffset: 0,
          },
          "review",
          records,
          worktree,
        ),
      ).toBeUndefined();
      expect(
        await followUpSession(
          runtime,
          taskFile,
          {
            prompt: "reviewer",
            alias: "reviewer",
            harness: fake,
            model: { id: "fake-review" },
            tiers: [{ harness: fake, model: { id: "fake-review" } }],
            tierOffset: 0,
          },
          "review",
          movedRecords,
          worktree,
        ),
      ).toBeUndefined();
      expect(warnings.join("\n")).toContain("alias changed");
      expect(warnings.join("\n")).toContain("does not match worktree");
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
