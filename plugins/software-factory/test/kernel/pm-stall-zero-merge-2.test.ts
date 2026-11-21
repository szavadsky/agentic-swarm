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
import { causeText } from "./helpers.js";
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

async function startsAmendedTaskFreshWhenParkKeptPart1(
  goal: string,
  harness: FakeHarness,
  ALPHA_BODY: "Write alpha.txt.\nDone when: alpha.txt holds alpha.",
  repo: ReturnType<typeof stallSetup>["repo"],
) {
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await runtime.store.writeTask(
    task("alpha", {
      scope: ["alpha.txt"],
      flow: "no-such-flow",
      body: ALPHA_BODY,
    }),
  );

  return { runtime };
}

async function startsAmendedTaskFreshWhenParkKeptPart2(
  harness: FakeHarness,
  repo: ReturnType<typeof stallSetup>["repo"],
  scope: Awaited<ReturnType<typeof startsAmendedTaskFreshWhenParkKeptPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      // The park never dispatched a turn, so there is no branch to keep.
      expect(
        repo.git(
          ["rev-parse", "--verify", "refs/heads/factory-task/demo/alpha"],
          {
            allowFail: true,
          },
        ).code,
      ).not.toBe(0);
      const file = path.join(runtime.store.tasksDir, "alpha.md");
      const current = parseTaskFile(fs.readFileSync(file, "utf8"), "alpha");
      fs.writeFileSync(
        file,
        renderTaskFile({
          ...current,
          flow: "just-implement",
          revision: 1,
          body: "Retry on a real flow.\nDone when: alpha.txt holds alpha.",
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
              reason: "the flow name was never configured",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function startsAmendedTaskFreshWhenParkKeptPart3(
  harness: FakeHarness,
  repo: ReturnType<typeof stallSetup>["repo"],
  scope: Awaited<ReturnType<typeof startsAmendedTaskFreshWhenParkKeptPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  // One agent turn only: the amendment started the work, nothing preceded it.
  expect(
    records.filter(
      (r) =>
        r.slug === "alpha" && r.actor === "agent" && r.step === "implement",
    ),
  ).toHaveLength(1);
  expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
    "alpha",
  );
}

async function splitsParkedParkIntoOneTaskPerPart1(
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
      ctx.writeOutcome(
        outcome({ status: "blocked", summary: "alpha too big" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );

  return { runtime };
}

async function splitsParkedParkIntoOneTaskPerPart2(
  harness: FakeHarness,
  scope: Awaited<ReturnType<typeof splitsParkedParkIntoOneTaskPerPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "alpha-a.md"),
        renderTaskFile(
          task("alpha-a", {
            scope: ["alpha-a.txt"],
            base: "alpha",
            source: "stall: 1",
            body: `First half.\nDone when: alpha-a.txt holds a.`,
          }),
        ),
        "utf8",
      );
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "alpha-b.md"),
        renderTaskFile(
          task("alpha-b", {
            scope: ["alpha-b.txt"],
            base: "alpha",
            source: "stall: 1",
            body: `Second half.\nDone when: alpha-b.txt holds b.`,
          }),
        ),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "split alpha",
          stallRoutes: [
            {
              slug: "alpha",
              action: "split",
              reason: "two separable outcomes",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function splitsParkedParkIntoOneTaskPerPart3(
  repo: ReturnType<typeof stallSetup>["repo"],
  harness: FakeHarness,
  scope: Awaited<ReturnType<typeof splitsParkedParkIntoOneTaskPerPart1>>,
) {
  const { runtime } = scope;
  for (const half of ["alpha-a", "alpha-b"]) {
    harness.script(
      (req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, `${half}.txt`),
          `${half}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `${half} implemented` }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ slug: half, step: "implement" }) },
    );
    harness.script(
      (req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: `${half} approved`, verdict: "approve" }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ slug: half, step: "review" }) },
    );
  }

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("parked");
  expect(state.tasks["alpha-a"]!.status).toBe("merged");
  expect(state.tasks["alpha-b"]!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:alpha-a.txt"]).stdout).toContain(
    "alpha-a",
  );
  expect(repo.git(["show", "factory/demo:alpha-b.txt"]).stdout).toContain(
    "alpha-b",
  );
}

function registerStallPMZeroMergeStallInTheRunningIterationPart4(): void {
  it("starts an amended task fresh when its park kept no branch", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const scope1 = await startsAmendedTaskFreshWhenParkKeptPart1(
        goal,
        harness,
        ALPHA_BODY,
        repo,
      );
      await startsAmendedTaskFreshWhenParkKeptPart2(harness, repo, scope1);
      await startsAmendedTaskFreshWhenParkKeptPart3(harness, repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("splits a parked park into one task per outcome, each on its kept branch", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const scope1 = await splitsParkedParkIntoOneTaskPerPart1(
        repo,
        goal,
        harness,
        ALPHA_BODY,
      );
      await splitsParkedParkIntoOneTaskPerPart2(harness, scope1);
      await splitsParkedParkIntoOneTaskPerPart3(repo, harness, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMZeroMergeStallInTheRunningIterationPart5(): void {
  it("never runs the stall turn on a drained iteration", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
        turns: 1,
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(pmCalls(harness)).toBe(0);
      const records = await runtime.store.listRecords();
      expect(records.some((r) => r.step === "stall-routes")).toBe(false);
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMZeroMergeStallInTheRunningIterationPart6(): void {
  it("falls back to the boundary when the stall turn never validates", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      // Two rungs, one alias: both omit stallRoutes, so the ladder exhausts.
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(outcome({ summary: "no routes" }));
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(pmCalls(harness)).toBe(2);
      const routes = (await runtime.store.listRecords()).filter(
        (r) => r.step === "stall-routes",
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]!.ok).toBe(false);
      expect(causeText(routes[0]!.cause)).toContain("stallRoutes");
      const files = await runtime.store.listDir("tasks");
      expect(files).toEqual(["alpha.md"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("stall PM — zero-merge stall in the running iteration", () => {
  registerStallPMZeroMergeStallInTheRunningIterationPart4();

  registerStallPMZeroMergeStallInTheRunningIterationPart5();

  registerStallPMZeroMergeStallInTheRunningIterationPart6();
});
