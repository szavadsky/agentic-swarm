import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runStallPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { renderTaskFile } from "../../src/kernel/tasks.js";
import { outcome } from "./e2e-helpers.js";
import { cause, causeText } from "./helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

async function stallFixture(slugs: string[], cancelled: string[] = []) {
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
  for (const slug of cancelled) {
    await runtime.store.writeTask(
      task(slug, {
        scope: [`${slug}.txt`],
        body: `Do ${slug}.\nDone when: ${slug} works.`,
      }),
    );
    await runtime.store.appendRecord(
      scriptMeta(1, "cancel", { slug, round: 1 }),
      { ok: true, cause: cause(`${slug} was superseded`) },
    );
  }
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return { repo, runtime, harness, state };
}

async function keepsStallContinuationNextBoundaryPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  harness: FakeHarness,
) {
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n## alpha\nParked work.\n",
    "utf8",
  );
  await runtime.store.writeTask(
    task("alpha", {
      scope: ["alpha.txt"],
      body: "Do alpha.\nDone when: alpha works.",
    }),
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "alpha", round: 1 }),
    { ok: true, cause: cause("blocked: alpha stuck") },
  );
  await runtime.store.writeTask(
    task("beta", {
      scope: ["alpha.txt"],
      base: "alpha",
      source: "stall: 1",
      body: "Retry.\nDone when: alpha works.",
    }),
  );
  // Unplanned and ready: no bullet means no cancellation; it stays open.
  await runtime.store.writeTask(
    task("gamma", {
      scope: ["gamma.txt"],
      body: "Do gamma.\nDone when: gamma works.",
    }),
  );
  harness.script((req, ctx) => {
    fs.appendFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      "\n## note\nThe stall continuation stands.\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "plan stands", decision: "continue" }));
    return fakeTurnResult(req);
  });

  return { runtime };
}

async function keepsStallContinuationNextBoundaryPart2(
  harness: FakeHarness,
  scope: Awaited<ReturnType<typeof keepsStallContinuationNextBoundaryPart1>>,
) {
  const { runtime } = scope;
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "files stand" }));
    return fakeTurnResult(req);
  });

  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain("| beta |");
  const records = await runtime.store.listRecords();
  expect(records.some((r) => r.step === "cancel" && r.slug === "beta")).toBe(
    false,
  );
  expect(records.some((r) => r.step === "cancel" && r.slug === "gamma")).toBe(
    false,
  );
}

function registerStallPMValidationPart5(): void {
  it("cancels a parked slug with a kernel record and writes no task", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "cancel alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "cancel",
                  reason: "the direction is gone",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result).toEqual({ continued: [], left: ["alpha"] });
      const records = await runtime.store.listRecords();
      const cancel = records.find(
        (r) => r.step === "cancel" && r.slug === "alpha",
      );
      expect(cancel?.cause).toEqual({
        kind: "note",
        detail: "the direction is gone",
      });
      expect(await runtime.store.listDir("tasks")).toEqual(["alpha.md"]);
      const after = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(after.tasks.alpha!.status).toBe("cancelled");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart6(): void {
  it("rejects editing the parked task file", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      const before = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        "utf8",
      );
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            fs.appendFileSync(
              path.join(runtime.store.tasksDir, "alpha.md"),
              "\nEdited by the stall turn.\n",
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "leave alpha",
                stallRoutes: [
                  { slug: "alpha", action: "leave", reason: "stays" },
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
      expect(causeText(validations[0]!.cause)).toContain("never edits");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
      ).toBe(before);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart7(): void {
  it("requires one route per parked slug", async () => {
    const { repo, runtime, harness, state } = await stallFixture([
      "alpha",
      "beta",
    ]);
    try {
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({
                summary: "route alpha only",
                stallRoutes: [
                  { slug: "alpha", action: "leave", reason: "stays" },
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
        slugs: ["alpha", "beta"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha", "beta"]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain(
        'slug "beta" has no route',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart8(): void {
  it("keeps the stall continuation for the next boundary's pack instead of cancelling it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    try {
      const scope1 = await keepsStallContinuationNextBoundaryPart1(
        repo,
        goal,
        harness,
      );
      await keepsStallContinuationNextBoundaryPart2(harness, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** The stall turn's continuation of the parked alpha, with its dependencies. */
function stallTask(
  slug: string,
  deps: string[],
): { slug: string; text: string } {
  return {
    slug,
    text: renderTaskFile(
      task(slug, {
        scope: ["alpha.txt"],
        base: "alpha",
        deps,
        source: "stall: 1",
        body: "Retry with the records.\nDone when: alpha works.",
      }),
    ),
  };
}

/**
 * A scripted stall route that writes the given task files, so a rejected rung
 * rolls them back like any other turn write.
 */
function scriptStallWrite(
  runtime: Awaited<ReturnType<typeof stallFixture>>["runtime"],
  harness: FakeHarness,
  files: { slug: string; text: string }[],
  stallRoutes: { slug: string; action: string; reason: string }[],
): void {
  for (let i = 0; i < 2; i++) {
    harness.script(
      (req, ctx) => {
        for (const file of files) {
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, `${file.slug}.md`),
            file.text,
            "utf8",
          );
        }
        ctx.writeOutcome(outcome({ summary: "route the park", stallRoutes }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "pm" }) },
    );
  }
}

function registerStallPMValidationPart9(): void {
  it("rejects a replacement chained behind the parked slug it continues", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      scriptStallWrite(
        runtime,
        harness,
        [stallTask("alpha-2", ["alpha"])],
        [
          {
            slug: "alpha",
            action: "replace",
            reason: "retry with the records",
          },
        ],
      );
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result).toEqual({ continued: [], left: ["alpha"] });
      expect(await runtime.store.listDir("tasks")).toEqual(["alpha.md"]);
      const finding =
        'task "alpha-2" depends on "alpha", which is parked with no landed continuation; a parked dependency is satisfied only by one that landed';
      const records = await runtime.store.listRecords();
      expect(
        causeText(records.find((r) => r.step === "pm-validate")!.cause),
      ).toContain(finding);
      // The refused rung's finding is what the retry turn repairs.
      expect(harness.calls.some((call) => call.prompt.includes(finding))).toBe(
        true,
      );
      expect(
        records.filter((r) => r.step === "stall-routes").every((r) => !r.ok),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart10(): void {
  it("rejects a dependency on a cancelled slug no continuation carries", async () => {
    const { repo, runtime, harness, state } = await stallFixture(
      ["alpha"],
      ["gamma"],
    );
    try {
      expect(state.tasks.gamma!.status).toBe("cancelled");
      scriptStallWrite(
        runtime,
        harness,
        [stallTask("alpha-2", ["gamma"])],
        [
          {
            slug: "alpha",
            action: "replace",
            reason: "retry with the records",
          },
        ],
      );
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result).toEqual({ continued: [], left: ["alpha"] });
      expect(await runtime.store.listDir("tasks")).toEqual([
        "alpha.md",
        "gamma.md",
      ]);
      expect(
        causeText(
          (await runtime.store.listRecords()).find(
            (r) => r.step === "pm-validate",
          )!.cause,
        ),
      ).toContain(
        'task "alpha-2" depends on "gamma", which is cancelled with no continuation that can land; the edge can never be satisfied',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMValidationPart11(): void {
  it("rejects a split whose parts depend on each other", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      scriptStallWrite(
        runtime,
        harness,
        [
          stallTask("alpha-one", ["alpha-two"]),
          stallTask("alpha-two", ["alpha-one"]),
        ],
        [
          {
            slug: "alpha",
            action: "split",
            reason: "two separable outcomes",
          },
        ],
      );
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result).toEqual({ continued: [], left: ["alpha"] });
      expect(await runtime.store.listDir("tasks")).toEqual(["alpha.md"]);
      expect(
        causeText(
          (await runtime.store.listRecords()).find(
            (r) => r.step === "pm-validate",
          )!.cause,
        ),
      ).toContain("dependency cycle");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("stall PM validation", () => {
  registerStallPMValidationPart5();

  registerStallPMValidationPart6();

  registerStallPMValidationPart7();

  registerStallPMValidationPart8();

  registerStallPMValidationPart9();

  registerStallPMValidationPart10();

  registerStallPMValidationPart11();
});
