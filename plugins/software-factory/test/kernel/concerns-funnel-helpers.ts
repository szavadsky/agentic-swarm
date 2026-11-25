/** Fixtures and fake turns shared by the concerns-funnel tests. */

import fs from "node:fs";
import path from "node:path";
import { recordedConcernId } from "../../src/core/concerns.js";
import {
  type FakeTurnHandler,
  FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { openConcernIds } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { activeHolds } from "../../src/kernel/dispatch-holds.js";
import { readHolds, type Hold } from "../../src/kernel/mailbox.js";
import { runStallPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { cause, task } from "./helpers.js";
import {
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { writeHold, writePlan } from "./steer-holds-helpers.js";

/** The open concern a task turn leaves behind, as `openConcerns` reads it. */
export const CONCERN_TEXT = "the retry window drops head names";
export const CONCERN_ID = recordedConcernId({
  kind: "risk",
  text: CONCERN_TEXT,
});

/** A stale mark: an id no record raises. */
export const STALE_ID = recordedConcernId({
  kind: "risk",
  text: "already fixed",
});

/** One task turn raising a non-FYI concern the wave-end turn must judge. */
export async function recordConcern(
  runtime: KernelRuntime,
  slug: string,
): Promise<StepRecord> {
  return runtime.store.appendRecord(
    { iteration: 1, slug, step: "implement", round: 1, actor: "agent" },
    {
      ok: true,
      outcome: {
        status: "done",
        summary: `${slug} shipped with a risk`,
        concerns: [
          { kind: "risk", calibration: "architect", text: CONCERN_TEXT },
        ],
        forward: [],
      },
    },
  );
}

/** A hold as one read renders it; the name is the steer id or concern id. */
export function hold(steer: string, slugs: string[], goal = false): Hold {
  return { steer, slugs, goal };
}

/** The live holds of one dispatch read: pending steers and open concerns. */
export async function liveHolds(
  runtime: KernelRuntime,
): Promise<ReturnType<typeof activeHolds>> {
  const records = await runtime.store.listRecords();
  return activeHolds(
    (await readHolds(runtime.store)).holds,
    new Set(),
    openConcernIds(records),
  );
}

/** The wave-end fixture: one undecided park, two tasks, one open concern. */
export async function stallWithConcern() {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1, perSubscription: {}, perModel: {} } },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  for (const slug of ["alpha", "gamma"]) {
    await writeTask(
      runtime,
      task(slug, {
        scope: [`${slug}.txt`],
        body: `Do ${slug}.\nDone when: ${slug} works.`,
      }),
    );
  }
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "alpha", round: 1 }),
    { ok: true, cause: cause("blocked: alpha stuck") },
  );
  await recordConcern(runtime, "alpha");
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return { repo, runtime, harness, state };
}

/** A PM turn that routes the park to the architect, optionally writing a mark. */
export function stallLeave(
  runtime: KernelRuntime,
  mark?: { id: string; slugs: string[] },
): FakeTurnHandler {
  return (req, ctx) => {
    if (mark) writeHold(runtime, mark.id, mark.slugs);
    ctx.writeOutcome(
      outcome({
        summary: "left alpha for the architect",
        stallRoutes: [
          { slug: "alpha", action: "leave", reason: "needs a ruling" },
        ],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** One wave-end PM turn on the fixture's undecided park. */
export async function runStall(
  runtime: KernelRuntime,
  state: Awaited<ReturnType<typeof stallWithConcern>>["state"],
) {
  return runStallPm(runtime, {
    iteration: 1,
    state,
    slugs: ["alpha"],
    cwd: runtime.paths.goalCheckout,
  });
}

type WaveFixture = Awaited<ReturnType<typeof openWave>>;

/**
 * One merged task whose turn raised the concern, and the given ready tasks;
 * a mark names a task that has not started, the merged one is history.
 */
async function openWave(slugs: readonly string[]) {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1, perSubscription: {}, perModel: {} } },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  for (const slug of [...slugs, "beta"]) {
    await writeTask(
      runtime,
      task(slug, {
        scope: [`${slug}.txt`],
        body: `Do ${slug}.\nDone when: ${slug} works.`,
      }),
    );
  }
  await recordConcern(runtime, "beta");
  await runtime.store.appendRecord(
    { iteration: 1, slug: "beta", step: "merge", round: 1, actor: "script" },
    { ok: true },
  );
  return { repo, runtime, harness };
}

export function heldWave(): Promise<WaveFixture> {
  return openWave(["alpha", "gamma"]);
}

/** A parked task, and a merged one whose turn left the concern open. */
export async function parkedWave() {
  const { repo, runtime, harness } = await openWave([]);
  await writeTask(
    runtime,
    task("alpha", {
      scope: ["alpha.txt"],
      body: "Do alpha.\nDone when: alpha works.",
    }),
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "alpha", round: 1 }),
    { ok: true, cause: cause("blocked: alpha stuck") },
  );
  return { repo, runtime, harness };
}

/** Scripts one task's implement and review turns for the fake harness. */
export function scriptTask(harness: FakeHarness, slug: string): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(req.cwd!, `${slug}.txt`),
        `${slug}.txt\n`,
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: `${slug} approved`, verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "review" }) },
  );
}

/** Every task's status in slug order, as one comparable list. */
export async function mergedStatuses(
  runtime: KernelRuntime,
): Promise<string[]> {
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return Object.entries(state.tasks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, entry]) => `${slug}:${entry.status}`);
}

/** The wave-end turn rewrites alpha's brief and marks the concern holding it. */
export function amendWithMark(runtime: KernelRuntime): FakeTurnHandler {
  return (req, ctx) => {
    const file = path.join(runtime.store.tasksDir, "alpha.md");
    const current = parseTaskFile(fs.readFileSync(file, "utf8"), "alpha");
    fs.writeFileSync(
      file,
      renderTaskFile({
        ...current,
        revision: 1,
        body: "Amended brief: say which alpha line is kept.\nDone when: alpha works.",
      }),
      "utf8",
    );
    writeHold(runtime, CONCERN_ID, ["alpha"]);
    ctx.writeOutcome(
      outcome({
        summary: "amended alpha",
        stallRoutes: [
          { slug: "alpha", action: "amend", reason: "the brief was thin" },
        ],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** A marked concern and a plan the boundary's architect can rule on. */
export async function markedBoundary() {
  const { repo, runtime, harness } = await openWave(["alpha"]);
  writeHold(runtime, CONCERN_ID, ["alpha"]);
  return { repo, runtime, harness: withKernelRoleFallbacks(harness) };
}
