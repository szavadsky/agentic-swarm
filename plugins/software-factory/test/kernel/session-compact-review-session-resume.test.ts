import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { type SessionRef } from "../../src/harness/types.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { followUpSession } from "../../src/kernel/flow-context.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

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
    intent: { harness: "fake", model: "fake-intent" },
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

async function startsDeNovoReasonLoggedAliasPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
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

  return { fake, runtime, taskFile, worktree, records, movedRecords };
}

async function startsDeNovoReasonLoggedAliasPart2(
  warnings: string[],
  scope: Awaited<ReturnType<typeof startsDeNovoReasonLoggedAliasPart1>>,
) {
  const { runtime, taskFile, fake, records, worktree, movedRecords } = scope;
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
}

function registerReviewSessionResumePart4(): void {
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
}

function registerReviewSessionResumePart5(): void {
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
}

function registerReviewSessionResumePart6(): void {
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
}

function registerReviewSessionResumePart7(): void {
  it("starts de novo with the reason logged on an alias change or cwd mismatch", async () => {
    const { repo, goal } = setupFlowRepo();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const scope1 = await startsDeNovoReasonLoggedAliasPart1(repo, goal);
      await startsDeNovoReasonLoggedAliasPart2(warnings, scope1);
    } finally {
      console.warn = originalWarn;
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("review session resume", () => {
  registerReviewSessionResumePart4();

  registerReviewSessionResumePart5();

  registerReviewSessionResumePart6();

  registerReviewSessionResumePart7();
});
