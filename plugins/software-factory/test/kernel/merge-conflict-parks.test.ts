import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { forwardedConcerns } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { runSteward } from "../../src/kernel/steward/run.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { cause, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const GATED_POOL = "gated-pool";

/**
 * The flow's single conflict resolve turn runs on its own alias, as a repo may
 * configure. The test drains that alias's pool, so the wave cannot run the
 * turn and the conflict is left to the wave-end steward.
 */
const gatedResolveFlow = {
  flows: {
    "implement-review": {
      steps: [
        { id: "implement", prompt: "implementer", alias: "implementer" },
        { id: "qa", prompt: "qa", alias: "qa", qa: true },
        { id: "review", prompt: "reviewer", alias: "reviewer", review: true },
        { id: "resolve", prompt: "steward", alias: "gated-resolve" },
      ],
    },
  },
};

const aliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  qa: { harness: "fake", model: "fake-qa" },
  steward: { harness: "fake", model: "fake-steward" },
  "gated-resolve": {
    harness: "fake",
    model: "fake-gated-resolve",
    subscription: GATED_POOL,
  },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

function gatedRepo(limits: Record<string, unknown> = {}) {
  return setupFlowRepo({ aliases, process: gatedResolveFlow, limits });
}

/** Another task's merge lands on the integration head before this task starts. */
function landIntegrationChange(repo: TmpRepo, checkout: string): void {
  fs.writeFileSync(
    path.join(checkout, "conflict.txt"),
    "integration\n",
    "utf8",
  );
  repo.git(["add", "conflict.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent integration change"], {
    cwd: checkout,
  });
}

function scriptImplement(
  harness: FakeHarness,
  slug: string,
  file: string,
  text: string,
): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, file), `${text}\n`, "utf8");
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "review" }) },
  );
}

/** A steward turn that writes `text` over the conflicted file. */
function scriptStewardResolve(text: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), `${text}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: "steward resolved the conflict" }));
    return fakeTurnResult(req);
  };
}

interface ConflictScope {
  runtime: KernelRuntime;
  repo: TmpRepo;
  reason: string;
}

/**
 * One wave whose resolve turn cannot run: the conflict is left to the wave
 * end. The task worktrees exist before the integration change lands, so the
 * conflict happens with the task branch's base already moved.
 */
async function dispatchConflict(
  repo: TmpRepo,
  goal: string,
  checkout: string,
  harness: FakeHarness,
  scopes: Record<string, string[]>,
): Promise<ConflictScope> {
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  runtime.exhaustedPools.set(GATED_POOL, Date.now() + 3_600_000);
  for (const [slug, scope] of Object.entries(scopes))
    await writeTask(runtime, task(slug, { scope }));
  for (const slug of Object.keys(scopes))
    await ensureTaskWorktree(runtime, task(slug));
  landIntegrationChange(repo, checkout);
  const reason = (await runDispatch(runtime, { iteration: 1 })).reason;
  return { runtime, repo, reason };
}

async function stateOf(scope: { runtime: KernelRuntime }) {
  return derive(
    await scope.runtime.store.listTasks(),
    await scope.runtime.store.listRecords(),
    scope.runtime.configs.process.flows,
  );
}

function recordsOf(scope: { runtime: KernelRuntime }) {
  return scope.runtime.store.listRecords();
}

function stewardTurns(records: Awaited<ReturnType<typeof recordsOf>>) {
  return records.filter((r) => r.step === "steward" && r.actor === "agent");
}

async function handsOffToStewardPart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplement(harness, "task", "conflict.txt", "task");
  harness.script(scriptStewardResolve("steward-resolved"), {
    when: whenTurn({ step: "steward" }),
  });
  const scope = await dispatchConflict(repo, goal, checkout, harness, {
    task: ["conflict.txt"],
  });
  return { scope, records: await recordsOf(scope) };
}

async function handsOffToStewardPart2(
  scope: ConflictScope,
  records: Awaited<ReturnType<typeof recordsOf>>,
) {
  const state = await stateOf(scope);
  // The in-flow resolve turn never ran; the merge conflict is the park.
  expect(
    records.filter(
      (r) => r.slug === "task" && r.step === "resolve" && r.actor === "agent",
    ),
  ).toHaveLength(0);
  const park = records.find((r) => r.slug === "task" && r.step === "park");
  expect(park?.cause).toEqual(cause("conflict: conflict.txt"));
  // The wave-end steward was invoked and landed the resolution.
  expect(stewardTurns(records)).toHaveLength(1);
  expect(state.tasks.task!.status).toBe("merged");
  expect(
    scope.repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
  ).toBe("steward-resolved");
}

async function parksWhenStewardCannotSettlePart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplement(harness, "task", "conflict.txt", "task");
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "steward could not settle" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "steward" }) },
  );
  scriptStallLeave(harness, ["task"]);
  const scope = await dispatchConflict(repo, goal, checkout, harness, {
    task: ["conflict.txt"],
  });
  return { scope, records: await recordsOf(scope) };
}

async function parksWhenStewardCannotSettlePart2(
  scope: ConflictScope,
  records: Awaited<ReturnType<typeof recordsOf>>,
) {
  const state = await stateOf(scope);
  expect(state.tasks.task!.status).toBe("parked");
  expect(state.tasks.task!.cause).toEqual(cause("conflict: conflict.txt"));
  expect(stewardTurns(records)).toHaveLength(1);
  expect(
    forwardedConcerns(records).filter((c) =>
      c.text.startsWith("steward: task unmerged"),
    ),
  ).toHaveLength(1);
}

async function routesOnlyTheConflictPart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplement(harness, "alpha", "conflict.txt", "alpha");
  scriptImplement(harness, "beta", "clean.txt", "beta");
  harness.script(scriptStewardResolve("steward-resolved"), {
    when: whenTurn({ step: "steward" }),
  });
  const scope = await dispatchConflict(repo, goal, checkout, harness, {
    alpha: ["conflict.txt"],
    beta: ["clean.txt"],
  });
  return { scope, records: await recordsOf(scope) };
}

async function routesOnlyTheConflictPart2(
  scope: ConflictScope,
  records: Awaited<ReturnType<typeof recordsOf>>,
) {
  const state = await stateOf(scope);
  // The clean task never parks and never reaches the steward; the conflicted
  // one does both.
  expect(records.filter((r) => r.slug === "beta" && r.step === "park")).toEqual(
    [],
  );
  expect(stewardTurns(records).map((r) => r.slug)).toEqual(["alpha"]);
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  expect(
    scope.repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
  ).toBe("steward-resolved");
  expect(scope.repo.git(["show", "factory/demo:clean.txt"]).stdout.trim()).toBe(
    "beta",
  );
}

/** alpha's branch changes the file the integration head later changes too. */
function commitAlphaConflict(repo: TmpRepo, checkout: string): void {
  fs.writeFileSync(path.join(checkout, "conflict.txt"), "alpha\n", "utf8");
  repo.git(["add", "conflict.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "alpha conflict"], { cwd: checkout });
}

/**
 * alpha amended past a revision-0 park, then conflicted at revision 1; beta's
 * revision-0 park lands after that conflict in the store. revisionStart must
 * read alpha's own records, or beta's park starts the scan past the merge.
 */
async function amendedConflictPart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(scriptStewardResolve("steward-resolved"), {
    when: whenTurn({ step: "steward" }),
  });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const alpha = task("alpha", { revision: 1, scope: ["conflict.txt"] });
  await writeTask(runtime, alpha);
  await writeTask(runtime, task("beta", { scope: ["clean.txt"] }));
  const ensured = await ensureTaskWorktree(runtime, alpha);
  commitAlphaConflict(repo, ensured.path);
  landIntegrationChange(repo, checkout);
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "alpha", round: 1, revision: 0 }),
    { ok: true, cause: cause("stalled: prior revision") },
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "merge", { slug: "alpha", round: 1, revision: 1 }),
    { ok: false, cause: cause("conflict: conflict.txt") },
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
    { ok: true, cause: cause("stalled: beta") },
  );
  return { runtime, repo };
}

async function amendedConflictPart2(scope: {
  runtime: KernelRuntime;
  repo: TmpRepo;
}) {
  await runSteward(scope.runtime, 1);
  const records = await recordsOf(scope);
  const parks = records
    .filter((r) => r.slug === "alpha" && r.step === "park")
    .sort((a, b) => a.seq - b.seq);
  expect(parks.at(-1)?.cause).toEqual(cause("conflict: conflict.txt"));
  expect(stewardTurns(records).map((r) => r.slug)).toEqual(["alpha"]);
  const state = await stateOf(scope);
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(
    scope.repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
  ).toBe("steward-resolved");
}

function registerAmendedConflict(): void {
  it("parks an amended task when another task parks after its conflict", async () => {
    const { repo, goal } = gatedRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const scope = await amendedConflictPart1(repo, goal, checkout);
      await amendedConflictPart2(scope);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerHandsOff(): void {
  it("parks a conflict the resolve turn could not take, then the wave-end steward lands it", async () => {
    const { repo, goal } = gatedRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const { scope, records } = await handsOffToStewardPart1(
        repo,
        goal,
        checkout,
      );
      await handsOffToStewardPart2(scope, records);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParksWithSteward(): void {
  it("ends parked on the conflict when the wave-end steward cannot settle it", async () => {
    const { repo, goal } = gatedRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const { scope, records } = await parksWhenStewardCannotSettlePart1(
        repo,
        goal,
        checkout,
      );
      expect(scope.reason).toBe("boundary");
      await parksWhenStewardCannotSettlePart2(scope, records);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerRoutesOnlyTheConflict(): void {
  it("routes only the conflicted task of a wave to the steward", async () => {
    const { repo, goal } = gatedRepo({ concurrency: { overall: 2 } });
    const checkout = goalCheckout(repo, goal);
    try {
      const { scope, records } = await routesOnlyTheConflictPart1(
        repo,
        goal,
        checkout,
      );
      expect(scope.reason).toBe("boundary");
      await routesOnlyTheConflictPart2(scope, records);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("merge-conflict-parks", () => {
  registerHandsOff();

  registerParksWithSteward();

  registerRoutesOnlyTheConflict();

  registerAmendedConflict();
});
