import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import { outcome } from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

function stallSetup() {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    },
  });
  const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  return { repo, goal, harness };
}

const ALPHA_BODY = "Write alpha.txt.\nDone when: alpha.txt holds alpha.";

function pmCalls(harness: FakeHarness): number {
  return harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm")
    .length;
}

async function amendsParkedTaskUnderSlugResumesPart1(
  repo: ReturnType<typeof stallSetup>["repo"],
  goal: string,
  harness: FakeHarness,
  ALPHA_BODY: "Write alpha.txt.\nDone when: alpha.txt holds alpha.",
) {
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await runtime.store.writeTask(
    task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "1. alpha.txt needs a test that reads it",
          verdict: "changes",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(path.join(req.cwd!, "alpha.txt"), "more\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "added the test",
          replies: [{ finding: 1, reply: "added a test that reads alpha.txt" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );

  return { runtime };
}

async function amendsParkedTaskUnderSlugResumesPart2(
  harness: FakeHarness,
  scope: Awaited<ReturnType<typeof amendsParkedTaskUnderSlugResumesPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "1. alpha.txt still misses the alpha line",
          verdict: "reject",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      const file = path.join(runtime.store.tasksDir, "alpha.md");
      const current = parseTaskFile(fs.readFileSync(file, "utf8"), "alpha");
      fs.writeFileSync(
        file,
        renderTaskFile({
          ...current,
          revision: 1,
          body: `Amended brief: keep the alpha line.\nDone when: alpha.txt holds the alpha line and a test reads it.`,
        }),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "amended alpha",
          stallRoutes: [
            {
              slug: "alpha",
              action: "amend",
              reason: "the brief never said the alpha line must stay",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function amendsParkedTaskUnderSlugResumesPart3(
  harness: FakeHarness,
  pmCalls: (harness: FakeHarness) => number,
  scope: Awaited<ReturnType<typeof amendsParkedTaskUnderSlugResumesPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      // The kept branch is the worktree: revision 0's commit is still here.
      expect(
        fs.readFileSync(path.join(req.cwd!, "alpha.txt"), "utf8"),
      ).toContain("alpha");
      // The review history rides the prompt: the last review's findings.
      expect(req.prompt).toContain("alpha.txt still misses the alpha line");
      fs.appendFileSync(path.join(req.cwd!, "alpha.txt"), "test\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "amended brief implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "alpha approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  expect(pmCalls(harness)).toBe(1);
  const records = await runtime.store.listRecords();
  expect(records.filter((r) => r.step === "stall-routes")).toHaveLength(1);
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  // The amend restarts the counts: implement and review return to round 1.
  expect(
    records
      .filter((r) => r.slug === "alpha" && r.step === "implement")
      .sort((a, b) => a.seq - b.seq)
      .map((r) => r.round),
  ).toEqual([1, 2, 1]);

  return { ...scope, records };
}

async function amendsParkedTaskUnderSlugResumesPart4(
  repo: ReturnType<typeof stallSetup>["repo"],
  scope: Awaited<ReturnType<typeof amendsParkedTaskUnderSlugResumesPart3>>,
) {
  const { records, runtime } = scope;
  expect(
    records
      .filter((r) => r.slug === "alpha" && r.step === "review")
      .sort((a, b) => a.seq - b.seq)
      .map((r) => r.round),
  ).toEqual([1, 2, 1]);
  const amended = parseTaskFile(
    fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
    "alpha",
  );
  expect(amended.revision).toBe(1);
  expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout).toContain("test");
}

async function runsSecondStallWhenContinuationPart1(
  repo: ReturnType<typeof stallSetup>["repo"],
  goal: string,
  harness: FakeHarness,
  ALPHA_BODY: "Write alpha.txt.\nDone when: alpha.txt holds alpha.",
) {
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await runtime.store.writeTask(
    task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ status: "blocked", summary: "alpha stuck" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "alpha-2.md"),
        renderTaskFile(
          task("alpha-2", {
            scope: ["alpha.txt"],
            base: "alpha",
            source: "stall: 1",
            body: `Retry.\nDone when: alpha.txt holds alpha.`,
          }),
        ),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "continue alpha",
          stallRoutes: [{ slug: "alpha", action: "replace", reason: "retry" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  return { runtime };
}

async function runsSecondStallWhenContinuationPart2(
  harness: FakeHarness,
  pmCalls: (harness: FakeHarness) => number,
  scope: Awaited<ReturnType<typeof runsSecondStallWhenContinuationPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "blocked", summary: "alpha-2 stuck too" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha-2", step: "implement" }) },
  );
  let secondBrief = "";
  harness.script(
    (req, ctx) => {
      secondBrief = req.prompt;
      ctx.writeOutcome(
        outcome({
          summary: "leave alpha-2 for the architect",
          stallRoutes: [
            {
              slug: "alpha-2",
              action: "leave",
              reason: "the continuation hit the same blocker",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  // Each park gets one decision: alpha was replaced, and the new park of
  // alpha-2 got its own turn before the boundary.
  expect(pmCalls(harness)).toBe(2);
  const records = await runtime.store.listRecords();
  const routes = records.filter((r) => r.step === "stall-routes");

  return { ...scope, secondBrief, records, routes };
}

async function runsSecondStallWhenContinuationPart3(
  scope: Awaited<ReturnType<typeof runsSecondStallWhenContinuationPart2>>,
) {
  const { routes, secondBrief, runtime, records } = scope;
  expect(routes.map((r) => r.outcome?.stallRoutes)).toEqual([
    [{ slug: "alpha", action: "replace", reason: "retry" }],
    [
      {
        slug: "alpha-2",
        action: "leave",
        reason: "the continuation hit the same blocker",
      },
    ],
  ]);
  expect(secondBrief).toContain("cause: blocked: alpha-2 stuck too");
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("parked");
  expect(state.tasks["alpha-2"]!.status).toBe("parked");
}

function registerStallPMZeroMergeStallInTheRunningIterationPart3(): void {
  it("runs a second stall when the continuation parks again in the same iteration", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const scope1 = await runsSecondStallWhenContinuationPart1(
        repo,
        goal,
        harness,
        ALPHA_BODY,
      );
      const scope2 = await runsSecondStallWhenContinuationPart2(
        harness,
        pmCalls,
        scope1,
      );
      await runsSecondStallWhenContinuationPart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("amends a parked task under its slug and resumes it on its kept branch", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const scope1 = await amendsParkedTaskUnderSlugResumesPart1(
        repo,
        goal,
        harness,
        ALPHA_BODY,
      );
      await amendsParkedTaskUnderSlugResumesPart2(harness, scope1);
      const scope3 = await amendsParkedTaskUnderSlugResumesPart3(
        harness,
        pmCalls,
        scope1,
      );
      await amendsParkedTaskUnderSlugResumesPart4(repo, scope3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("stall PM — zero-merge stall in the running iteration", () => {
  registerStallPMZeroMergeStallInTheRunningIterationPart3();
});
