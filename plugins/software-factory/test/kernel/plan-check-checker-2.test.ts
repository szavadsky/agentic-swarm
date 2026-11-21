import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { PLAN_CHECK_ROUTES_STEP, runPlanCheckPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

async function amendsParkedTaskThroughPlanCheckPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
    { ok: true, cause: cause("failed: runner crashed mid-turn") },
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("parked");
  const betaPath = path.join(runtime.store.tasksDir, "beta.md");

  return { harness, runtime, state, betaPath };
}

async function amendsParkedTaskThroughPlanCheckPart2(
  scope: Awaited<ReturnType<typeof amendsParkedTaskThroughPlanCheckPart1>>,
) {
  const { harness, betaPath } = scope;
  harness.script(
    (req, ctx) => {
      const current = parseTaskFile(fs.readFileSync(betaPath, "utf8"), "beta");
      fs.writeFileSync(
        betaPath,
        renderTaskFile({
          ...current,
          revision: 1,
          body: "Amended brief.\nDone when: beta.txt holds beta and a test reads it.",
        }),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "amended beta",
          planCheckRoutes: [
            {
              slug: "beta",
              action: "continue",
              reason: "the brief was too vague to retry",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function amendsParkedTaskThroughPlanCheckPart3(
  scope: Awaited<ReturnType<typeof amendsParkedTaskThroughPlanCheckPart1>>,
) {
  const { runtime, state, betaPath } = scope;
  const result = await runPlanCheckPm(runtime, {
    iteration: 1,
    state,
    followUps: [
      {
        kind: "amend",
        slug: "beta",
        reason: "the brief was too vague to retry",
      },
    ],
    cwd: runtime.paths.goalCheckout,
  });
  expect(result.continued).toEqual(["beta"]);
  const amended = parseTaskFile(fs.readFileSync(betaPath, "utf8"), "beta");
  expect(amended.revision).toBe(1);
  expect(amended.body).toContain("a test reads it");
  const after = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(after.tasks.beta!.status).toBe("ready");
  expect(after.tasks.beta!.turns).toBe(0);
}

async function refusesLeaveRouteEditsSlugOrWritesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  const alphaPath = path.join(runtime.store.tasksDir, "alpha.md");
  const before = fs.readFileSync(alphaPath, "utf8");

  return { harness, runtime, state, alphaPath, before };
}

async function refusesLeaveRouteEditsSlugOrWritesPart2(
  scope: Awaited<ReturnType<typeof refusesLeaveRouteEditsSlugOrWritesPart1>>,
) {
  const { harness, alphaPath, runtime } = scope;
  for (let i = 0; i < 2; i++)
    harness.script(
      (req, ctx) => {
        const current = parseTaskFile(
          fs.readFileSync(alphaPath, "utf8"),
          "alpha",
        );
        fs.writeFileSync(
          alphaPath,
          renderTaskFile({ ...current, revision: 1 }),
          "utf8",
        );
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "beta-2.md"),
          renderTaskFile(
            task("beta-2", {
              base: "beta",
              scope: ["beta.txt"],
              source: "plan-check: 1",
            }),
          ),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary: "left both",
            planCheckRoutes: [
              { slug: "alpha", action: "leave", reason: "stays" },
              { slug: "beta", action: "leave", reason: "stays" },
            ],
          }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "pm" }) },
    );
}

async function refusesLeaveRouteEditsSlugOrWritesPart3(
  scope: Awaited<ReturnType<typeof refusesLeaveRouteEditsSlugOrWritesPart1>>,
) {
  const { runtime, state, alphaPath, before } = scope;
  const result = await runPlanCheckPm(runtime, {
    iteration: 1,
    state,
    followUps: [
      { kind: "amend", slug: "alpha", reason: "retry the brief" },
      { kind: "replace", slug: "beta", reason: "one new task" },
    ],
    cwd: runtime.paths.goalCheckout,
  });

  expect(result.status).toBe("exhausted");
  const validations = (await runtime.store.listRecords()).filter(
    (record) => record.step === "pm-validate",
  );
  expect(validations).toHaveLength(2);
  for (const { cause } of validations) {
    expect(causeText(cause)).toContain(
      'task "alpha" was edited; a plan-check turn never edits a slug it does not amend, and leave keeps this file as it was',
    );
    expect(causeText(cause)).toContain(
      'new task "beta-2" continues "beta", which was routed leave; only replace and split write new tasks',
    );
  }
  expect(fs.readFileSync(alphaPath, "utf8")).toBe(before);
  expect(fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md"))).toBe(
    false,
  );
}

function registerPlanCheckerPart3(): void {
  it("amends a parked task through a plan-check follow-up", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await amendsParkedTaskThroughPlanCheckPart1(repo, goal);
      await amendsParkedTaskThroughPlanCheckPart2(scope1);
      await amendsParkedTaskThroughPlanCheckPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPlanCheckerPart4(): void {
  it("leaves amend, replace and split follow-ups with no write at rung 1", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        ...ALIASES,
        pm: { ...ALIASES.pm, escalateTo: "pm-2" },
        "pm-2": { harness: "fake", model: "fake-pm-2" },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      for (const slug of ["alpha", "beta", "gamma"])
        await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "left all three for the architect",
              planCheckRoutes: ["alpha", "beta", "gamma"].map((slug) => ({
                slug,
                action: "leave",
                reason: "the plan does not settle it",
              })),
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          { kind: "amend", slug: "alpha", reason: "retry the brief" },
          { kind: "replace", slug: "beta", reason: "one new task" },
          { kind: "split", slug: "gamma", reason: "two outcomes" },
        ],
        cwd: runtime.paths.goalCheckout,
      });

      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
      expect(result.status).toBe("routed");
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha", "beta", "gamma"]);
      const records = await runtime.store.listRecords();
      expect(
        records.filter((record) => record.step === "pm-validate"),
      ).toHaveLength(0);
      expect(
        records.some((record) => record.step === PLAN_CHECK_ROUTES_STEP),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPlanCheckerPart5(): void {
  it("still refuses a continue on amend, replace and split with no write", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      for (const slug of ["alpha", "beta", "gamma"])
        await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      for (let i = 0; i < 2; i++)
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({
                summary: "continued all three",
                planCheckRoutes: ["alpha", "beta", "gamma"].map((slug) => ({
                  slug,
                  action: "continue",
                  reason: "carry the checker's kind out",
                })),
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );

      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [
          { kind: "amend", slug: "alpha", reason: "retry the brief" },
          { kind: "replace", slug: "beta", reason: "one new task" },
          { kind: "split", slug: "gamma", reason: "two outcomes" },
        ],
        cwd: runtime.paths.goalCheckout,
      });

      expect(result.status).toBe("exhausted");
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm-validate",
      );
      expect(validations).toHaveLength(2);
      for (const { cause } of validations) {
        expect(causeText(cause)).toContain(
          'slug "alpha" is amended but its file is unchanged',
        );
        expect(causeText(cause)).toContain(
          'slug "beta" is replaced but has no task',
        );
        expect(causeText(cause)).toContain(
          'slug "gamma" is split into nothing',
        );
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPlanCheckerPart6(): void {
  it("refuses a leave route that edits its slug or writes a task for it", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await refusesLeaveRouteEditsSlugOrWritesPart1(repo, goal);
      await refusesLeaveRouteEditsSlugOrWritesPart2(scope1);
      await refusesLeaveRouteEditsSlugOrWritesPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPlanCheckerPart7(): void {
  it("refuses a follow-up that amends merged work", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "beta" }),
        { ok: true, commit: "abc123" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      const betaPath = path.join(runtime.store.tasksDir, "beta.md");
      const before = fs.readFileSync(betaPath, "utf8");
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            const current = parseTaskFile(
              fs.readFileSync(betaPath, "utf8"),
              "beta",
            );
            fs.writeFileSync(
              betaPath,
              renderTaskFile({ ...current, revision: 1 }),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "amended beta",
                planCheckRoutes: [
                  { slug: "beta", action: "continue", reason: "retry" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: [{ kind: "amend", slug: "beta", reason: "retry" }],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain("amend is refused");
      expect(fs.readFileSync(betaPath, "utf8")).toBe(before);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart3();

  registerPlanCheckerPart4();

  registerPlanCheckerPart5();

  registerPlanCheckerPart6();

  registerPlanCheckerPart7();
});
