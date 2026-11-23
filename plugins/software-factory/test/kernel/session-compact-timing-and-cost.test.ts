import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { type SessionRef } from "../../src/harness/types.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { compactSession } from "../../src/kernel/flow-context.js";
import { iterationMetrics } from "../../src/kernel/metrics.js";
import { sessionCacheHot } from "../../src/kernel/sessions.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
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

async function resumesReviewsWhileImplementPart1() {
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
      intent: { harness: "fake", model: "fake-intent" },
      "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      "implementer-strong": { harness: "fake", model: "fake-strong" },
    },
  });

  return { repo, goal };
}

async function resumesReviewsWhileImplementPart2(
  scope: Awaited<ReturnType<typeof resumesReviewsWhileImplementPart1>>,
) {
  const { repo, goal } = scope;
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
}

async function compactsResumedSessionAtEndRecordsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req, { usage: { in: 10_000, out: 100 } });
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "needs a fix", verdict: "changes" }));
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
  const qa = records
    .filter((r) => r.slug === "task" && r.step === "qa")
    .sort((a, b) => a.seq - b.seq);

  return { harness, records, implement, review, qa };
}

async function compactsResumedSessionAtEndRecordsPart2(
  PRICES: {
    "fake-impl": {
      input: number;
      cachedInput: number;
      output: number;
      reasoning: number;
    };
    "fake-review": {
      input: number;
      cachedInput: number;
      output: number;
      reasoning: number;
    };
  },
  scope: Awaited<ReturnType<typeof compactsResumedSessionAtEndRecordsPart1>>,
) {
  const { harness, implement, qa, review, records } = scope;
  expect(harness.compactions.map((c) => c.id)).toEqual([
    implement[0]!.session!.id,
    qa[0]!.session!.id,
    review[0]!.session!.id,
    implement[1]!.session!.id,
    qa[1]!.session!.id,
    review[1]!.session!.id,
  ]);
  expect(implement.map((r) => r.session?.compacted)).toEqual([true, true]);
  expect(qa.map((r) => r.session?.compacted)).toEqual([true, true]);
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

  // The follow-ups resumed a compacted ref; the fix reread a trimmed prefix.
  expect(harness.calls[3]!.session?.compacted).toBe(true);
  expect(harness.calls[5]!.session?.compacted).toBe(true);
  expect(harness.calls[3]!.session?.id).toBe(implement[0]!.session!.id);
  expect(harness.calls[5]!.session?.id).toBe(review[0]!.session!.id);
  expect(implement[1]!.usage?.in).toBe(1_500);
  expect(implement[1]!.usage!.in).toBeLessThan(implement[0]!.usage!.in);
  // A resumed review prices its unsplit prefix at the cached rate.
  expect(review[1]!.usage?.costUsd).toBeCloseTo(0.0026, 10);

  // Metrics price the compaction on top of every attempt.
  const metrics = iterationMetrics(1, "in-progress", records, {}, 0, PRICES);

  return { ...scope, metrics };
}

async function compactsResumedSessionAtEndRecordsPart3(
  scope: Awaited<ReturnType<typeof compactsResumedSessionAtEndRecordsPart2>>,
) {
  const { metrics } = scope;
  expect(metrics.usage.costUsd).toBeCloseTo(0.03805, 10);
}

function registerReviewSessionResumePart1(): void {
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
      expect(harness.calls[2]!.session).toBeUndefined();
      expect(harness.calls[5]!.session?.id).toBe(review[0]!.session!.id);
      expect(harness.calls[5]!.session?.compacted).toBe(true);
      expect(review.map((r) => r.alias)).toEqual(["reviewer", "reviewer"]);
      // The r2 record names the resumed session.
      expect(review[1]!.session?.id).toBe(review[0]!.session!.id);
      expect(review[1]!.cachedPrefix).toBe(true);
      // Never the implementer's session, although the fix is more recent.
      expect(review[0]!.session!.id).not.toBe(impl[0]!.session!.id);
      expect(harness.calls[5]!.session?.id).not.toBe(impl[1]!.session!.id);

      // The delta prompt: the diff since r1 plus the fix dispositions.
      const r1Prompt = harness.calls[2]!.prompt;
      const r2Prompt = harness.calls[5]!.prompt;
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
}

function registerReviewSessionResumePart2(): void {
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

      expect(fake.calls).toHaveLength(5);
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
}

function registerReviewSessionResumePart3(): void {
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

      expect(harness.calls[5]!.session).toBeUndefined();
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
    const scope1 = await resumesReviewsWhileImplementPart1();
    await resumesReviewsWhileImplementPart2(scope1);
  }, 60_000);
}

function registerReviewSessionResumePart4(): void {
  it("compacts only the configured review iterations", async () => {
    const { repo, goal } = await resumesReviewsWhileImplementPart1();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFixRound(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      runtime.configs.run.harnesses = {
        fake: { compaction: { enabled: true, reviewIterations: [2] } },
      };
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const review = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      expect(review.map((r) => r.session?.compacted)).toEqual([false, true]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("compaction timing and cost", () => {
  const PRICES = {
    "fake-impl": { input: 1, cachedInput: 0.5, output: 2, reasoning: 2 },
    "fake-review": { input: 1, cachedInput: 0.5, output: 2, reasoning: 2 },
  };

  it("compacts the resumed session at its end, records the cost, and the fix resumes fewer input tokens", async () => {
    const { repo, goal } = setupFlowRepo({ priceTable: PRICES });
    try {
      const scope1 = await compactsResumedSessionAtEndRecordsPart1(repo, goal);
      const scope2 = await compactsResumedSessionAtEndRecordsPart2(
        PRICES,
        scope1,
      );
      await compactsResumedSessionAtEndRecordsPart3(scope2);
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
  registerReviewSessionResumePart1();

  registerReviewSessionResumePart2();

  registerReviewSessionResumePart3();

  registerReviewSessionResumePart4();
});
