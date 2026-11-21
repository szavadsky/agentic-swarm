import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runStallPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { outcome } from "./e2e-helpers.js";
import { cause, causeText } from "./helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  scriptStallLeave,
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

async function stallFixture(slugs: string[]) {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    },
  });
  const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n",
    "utf8",
  );
  for (const slug of slugs) {
    await runtime.store.writeTask(
      task(slug, {
        scope: [`${slug}.txt`],
        body: `Do ${slug}.\nDone when: ${slug} works.`,
      }),
    );
    await runtime.store.appendRecord(
      scriptMeta(1, "park", { slug, round: 1 }),
      { ok: true, cause: cause(`blocked: ${slug} stuck`) },
    );
  }
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return { repo, runtime, harness, state };
}

async function refusesAmendMergedTaskRestoresFilePart1(runtime: KernelRuntime) {
  await runtime.store.writeTask(
    task("done", {
      scope: ["done.txt"],
      body: "Done.\nDone when: done works.",
    }),
  );
  await runtime.store.appendRecord(scriptMeta(1, "merge", { slug: "done" }), {
    ok: true,
    commit: "abc123",
  });
  const merged = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(merged.tasks.done!.status).toBe("merged");
  const donePath = path.join(runtime.store.tasksDir, "done.md");
  const before = fs.readFileSync(donePath, "utf8");

  return { merged, donePath, before };
}

async function refusesAmendMergedTaskRestoresFilePart2(
  runtime: KernelRuntime,
  harness: FakeHarness,
  scope: Awaited<ReturnType<typeof refusesAmendMergedTaskRestoresFilePart1>>,
) {
  const { donePath, merged } = scope;
  for (let i = 0; i < 2; i++) {
    harness.script(
      (req, ctx) => {
        const current = parseTaskFile(
          fs.readFileSync(donePath, "utf8"),
          "done",
        );
        fs.writeFileSync(
          donePath,
          renderTaskFile({
            ...current,
            revision: 1,
            body: "Amended.\nDone when: done still works.",
          }),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary: "leave alpha",
            stallRoutes: [
              {
                slug: "alpha",
                action: "leave",
                reason: "needs the architect",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "pm" }) },
    );
  }
  const result = await runStallPm(runtime, {
    iteration: 1,
    state: merged,
    slugs: ["alpha"],
    cwd: runtime.paths.goalCheckout,
  });
  expect(result.continued).toEqual([]);
}

async function refusesAmendMergedTaskRestoresFilePart3(
  runtime: KernelRuntime,
  scope: Awaited<ReturnType<typeof refusesAmendMergedTaskRestoresFilePart1>>,
) {
  const { donePath, before } = scope;
  const validations = (await runtime.store.listRecords()).filter(
    (r) => r.step === "pm-validate",
  );
  expect(causeText(validations[0]!.cause)).toContain(
    'frozen task "done" was edited',
  );
  expect(fs.readFileSync(donePath, "utf8")).toBe(before);
}

async function acceptsFreshTaskWithoutBaseWhenPart1(
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
        path.join(runtime.store.tasksDir, "alpha-fresh.md"),
        renderTaskFile(
          task("alpha-fresh", {
            scope: ["alpha.txt"],
            source: "stall: 1",
            body: `Apply the kept diff onto the head.\nDone when: alpha.txt holds alpha.`,
          }),
        ),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "fresh task for alpha",
          stallRoutes: [
            {
              slug: "alpha",
              action: "replace",
              reason: "kept branch conflicts; apply the diff fresh",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  return { runtime };
}

async function acceptsFreshTaskWithoutBaseWhenPart2(
  harness: FakeHarness,
  scope: Awaited<ReturnType<typeof acceptsFreshTaskWithoutBaseWhenPart1>>,
) {
  const { runtime } = scope;
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha-fresh implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha-fresh", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "alpha-fresh approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha-fresh", step: "review" }) },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("parked");
  expect(state.tasks["alpha-fresh"]!.status).toBe("merged");
  const fresh = parseTaskFile(
    fs.readFileSync(
      path.join(runtime.store.tasksDir, "alpha-fresh.md"),
      "utf8",
    ),
    "alpha-fresh",
  );
  expect(fresh.base).toBeUndefined();
  expect(fresh.source).toBe("stall: 1");
}

function registerStallPMZeroMergeStallInTheRunningIterationPart7(): void {
  it("accepts a fresh task without base when the kept branch conflicts with the head", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const scope1 = await acceptsFreshTaskWithoutBaseWhenPart1(
        repo,
        goal,
        harness,
        ALPHA_BODY,
      );
      await acceptsFreshTaskWithoutBaseWhenPart2(harness, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart1(): void {
  it("commits the routes a turn wrote past a finding the graph already had", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      // A pre-existing, underivable graph finding: no stall route can fix it.
      await runtime.store.writeTask(
        task("stuck", { scope: ["stuck.txt"], deps: ["gone"] }),
      );
      scriptStallLeave(harness, ["alpha"]);

      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.left).toEqual(["alpha"]);
      const records = await runtime.store.listRecords();
      expect(
        records.some((record) => record.step === "stall-routes" && record.ok),
      ).toBe(true);
      expect(records.some((record) => record.step === "pm-validate")).toBe(
        false,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart2(): void {
  it("rejects a replace that changes the done-when", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            fs.writeFileSync(
              path.join(runtime.store.tasksDir, "alpha-2.md"),
              renderTaskFile(
                task("alpha-2", {
                  scope: ["alpha.txt"],
                  base: "alpha",
                  source: "stall: 1",
                  body: "New goal.\nDone when: something else works.",
                }),
              ),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "continue alpha",
                stallRoutes: [
                  { slug: "alpha", action: "replace", reason: "retry" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha"]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(validations).toHaveLength(2);
      expect(causeText(validations[0]!.cause)).toContain("done-when");
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "alpha-2.md")),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart3(): void {
  it("rejects an amend that does not bump the revision", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            fs.appendFileSync(
              path.join(runtime.store.tasksDir, "alpha.md"),
              "\nRetry with more direction.\n",
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "amend alpha",
                stallRoutes: [
                  {
                    slug: "alpha",
                    action: "amend",
                    reason: "retry with direction",
                  },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain('bumps "revision"');
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
      ).not.toContain("Retry with more direction.");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart4(): void {
  it("refuses an amend of a merged task and restores its file", async () => {
    const { repo, runtime, harness } = await stallFixture(["alpha"]);
    try {
      const scope1 = await refusesAmendMergedTaskRestoresFilePart1(runtime);
      await refusesAmendMergedTaskRestoresFilePart2(runtime, harness, scope1);
      await refusesAmendMergedTaskRestoresFilePart3(runtime, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("stall PM — zero-merge stall in the running iteration", () => {
  registerStallPMZeroMergeStallInTheRunningIterationPart7();
});

describe("stall PM validation", () => {
  registerStallPMValidationPart1();

  registerStallPMValidationPart2();

  registerStallPMValidationPart3();

  registerStallPMValidationPart4();
});
