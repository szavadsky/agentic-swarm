import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { forwardedConcerns } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import {
  INFRA_REDISPATCH_DELAYS_MS,
  runDispatch,
} from "../../src/kernel/dispatch.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  twoPartyBarrier,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

function scriptConflict(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "task\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "task side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/**
 * Another task's merge lands on the integration branch before this task starts,
 * so the task branch's squash has a conflicting file when the queue reaches it.
 */
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

/** Scripts implement+review for two slugs; each writes the same conflicted file. */
function scriptConflictPair(harness: FakeHarness): void {
  for (const slug of ["alpha", "beta"]) {
    harness.script(
      (req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "conflict.txt"),
          `${slug}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `${slug} side` }));
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
}

/** A steward turn that writes `text` over the conflicted file. */
function scriptStewardResolve(slug: string, text: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), `${text}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `steward resolved ${slug}` }));
    return fakeTurnResult(req);
  };
}

/**
 * A resolve turn that reports done but leaves the conflict markers in place.
 * The flow parks the branch with the conflict and the wave-end steward owns it:
 * the fallback for a resolution the in-flow turn could not settle.
 */
function scriptResolveLeavesConflict(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "resolve left the conflict" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "resolve" }), fallback: true },
  );
}

/** A resolve turn that writes `text` over the conflicted file. */
function scriptInFlowResolve(text: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the steward (merge agent)");
    expect(req.prompt).toContain("conflict.txt");
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), `${text}\n`, "utf8");
    ctx.writeOutcome(
      outcome({ summary: "resolved the merge conflict in-flow" }),
    );
    return fakeTurnResult(req);
  };
}

/**
 * Two task starts whose branches predate one integration change to the same
 * file: both merges conflict, so the wave-end steward sees two candidates.
 */
async function twoParkedConflicts(
  runtime: KernelRuntime,
  repo: TmpRepo,
  checkout: string,
): Promise<void> {
  const alpha = task("alpha", { scope: ["conflict.txt"] });
  const beta = task("beta", { scope: ["conflict.txt"] });
  await writeTask(runtime, alpha);
  await writeTask(runtime, beta);
  await ensureTaskWorktree(runtime, alpha);
  await ensureTaskWorktree(runtime, beta);
  landIntegrationChange(repo, checkout);
}

describe("merge conflicts", () => {
  registerMergeConflictsPart1();
  registerMergeConflictsPart2();
  registerMergeConflictsPart3();
});

const stewardAliases = {
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

describe("steward", () => {
  registerStewardPart1();
  registerStewardPart2();
  registerStewardPart3();
  registerStewardPart4();
  registerStewardPart5();
  registerStewardPart6();
  registerStewardPart7();
  registerStewardPart8();
});

async function parksRedGateAfterFlowResolvePart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptConflict(harness);
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "broken\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "resolved badly" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "resolve" }) },
  );
  scriptStallLeave(harness, ["task"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["conflict.txt"] });
  await writeTask(runtime, file);
  await ensureTaskWorktree(runtime, file);
  landIntegrationChange(repo, checkout);
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");
  expect(state.tasks.task!.cause).toEqual(cause("gates: content"));
  expect(
    records.filter(
      (r) => r.slug === "task" && r.step === "checks" && r.ok === false,
    ).length,
  ).toBeGreaterThan(0);
  expect(
    records.some(
      (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
    ),
  ).toBe(false);
}

async function parksRedGateAfterFlowResolvePart2(repo: TmpRepo) {
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "integration",
  );
}

async function retriesTransientlyDeadStewardLegPart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptConflictPair(harness);
  scriptResolveLeavesConflict(harness);
  let alphaStewardCalls = 0;
  harness.script(
    (req, ctx) => {
      alphaStewardCalls += 1;
      if (alphaStewardCalls === 1)
        return fakeTurnResult(req, {
          stop: { kind: "infra", cause: "network", details: "ECONNRESET" },
        });
      return scriptStewardResolve("alpha", "alpha-resolved")(req, ctx);
    },
    {
      when: whenTurn({ slug: "alpha", step: "steward" }),
      fallback: true,
    },
  );
  harness.script(scriptStewardResolve("beta", "beta-resolved"), {
    when: whenTurn({ slug: "beta", step: "steward" }),
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await twoParkedConflicts(runtime, repo, checkout);
  const sleeps: number[] = [];
  const result = await runDispatch(runtime, {
    iteration: 1,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  // The first leg died, beta still landed in that wave, and the re-dispatch
  // spent the same bounded backoff a task turn would before resolving.
  expect(result.reason).toBe("boundary");
  expect(sleeps).toEqual([INFRA_REDISPATCH_DELAYS_MS[0]!]);
  expect(alphaStewardCalls).toBe(2);

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");

  return { records };
}

async function retriesTransientlyDeadStewardLegPart2(
  repo: TmpRepo,
  scope: Awaited<ReturnType<typeof retriesTransientlyDeadStewardLegPart1>>,
) {
  const { records } = scope;
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "alpha-resolved",
  );
  const alphaTurns = records.filter(
    (r) => r.slug === "alpha" && r.step === "steward" && r.actor === "agent",
  );
  expect(alphaTurns.map((r) => r.stop)).toEqual([
    { kind: "infra", cause: "network", details: "ECONNRESET" },
    { kind: "done" },
  ]);
}

async function keepsWaveGoingWhenOneConflictPart1(
  repo: TmpRepo,
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptConflictPair(harness);
  scriptResolveLeavesConflict(harness);
  harness.script(
    (req) =>
      fakeTurnResult(req, {
        stop: { kind: "infra", cause: "auth", details: "no route" },
      }),
    { when: whenTurn({ slug: "alpha", step: "steward" }) },
  );
  harness.script(scriptStewardResolve("beta", "steward-resolved"), {
    when: whenTurn({ slug: "beta", step: "steward" }),
  });
  scriptStallLeave(harness, ["alpha"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await twoParkedConflicts(runtime, repo, checkout);
  const result = await runDispatch(runtime, { iteration: 1 });

  // Alpha's leg died first, but beta's conflict was still resolved and
  // landed; only then does the launch stop, naming the dead candidate.
  expect(result.reason).toBe("infra");
  expect(result.cause).toEqual({
    kind: "boundary",
    detail: "alpha: auth: no route",
  });

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("parked");
  expect(state.tasks.alpha!.cause?.kind === "conflict").toBe(true);
  expect(state.tasks.beta!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "steward-resolved",
  );

  const deadTurn = records.find(
    (r) => r.slug === "alpha" && r.step === "steward" && r.actor === "agent",
  )!;

  return { records, deadTurn };
}

async function keepsWaveGoingWhenOneConflictPart2(
  scope: Awaited<ReturnType<typeof keepsWaveGoingWhenOneConflictPart1>>,
) {
  const { deadTurn, records } = scope;
  expect(deadTurn.stop).toEqual({
    kind: "infra",
    cause: "auth",
    details: "no route",
  });
  const betaTurn = records.find(
    (r) => r.slug === "beta" && r.step === "steward" && r.actor === "agent",
  )!;
  expect(betaTurn.seq).toBeGreaterThan(deadTurn.seq);
  // A dead leg is a deferral, not an unresolvable hold: no pointer.
  expect(
    forwardedConcerns(records).filter((c) =>
      c.text.startsWith("steward: alpha unmerged"),
    ),
  ).toHaveLength(0);
}

async function readiesDependentsAfterLandingPart1(repo: TmpRepo, goal: string) {
  const harness = new FakeHarness({ id: "fake" });
  scriptResolveLeavesConflict(harness);
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "task\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(req.cwd!, "conflict.txt"),
      "steward-resolved\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "steward resolved beta" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "gamma.txt"), "gamma\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "gamma side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  const beta = task("beta", { scope: ["conflict.txt"] });
  await writeTask(runtime, beta);

  return { runtime, beta };
}

async function readiesDependentsAfterLandingPart2(
  repo: TmpRepo,
  checkout: string,
  scope: Awaited<ReturnType<typeof readiesDependentsAfterLandingPart1>>,
) {
  const { runtime, beta } = scope;
  await writeTask(
    runtime,
    task("gamma", { deps: ["beta"], scope: ["gamma.txt"] }),
  );
  await ensureTaskWorktree(runtime, beta);
  landIntegrationChange(repo, checkout);
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  expect(state.tasks.gamma!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "steward-resolved",
  );
  const stewardSeq = records.find(
    (r) => r.slug === "beta" && r.step === "steward",
  )!.seq;
  const gammaSeq = records.find(
    (r) => r.slug === "gamma" && r.step === "implement",
  )!.seq;
  expect(gammaSeq).toBeGreaterThan(stewardSeq);
}

async function resolvesParallelConflictFlowLandsPart1(
  repo: TmpRepo,
  goal: string,
) {
  const arrive = twoPartyBarrier();
  const harness = new FakeHarness({ id: "fake" });
  const implement: FakeTurnHandler = async (req, ctx) => {
    await arrive();
    fs.writeFileSync(
      path.join(req.cwd!, "conflict.txt"),
      `${path.basename(req.cwd!)}\n`,
      "utf8",
    );
    ctx.writeOutcome(
      outcome({ summary: `${path.basename(req.cwd!)} implemented` }),
    );
    return fakeTurnResult(req);
  };
  const review: FakeTurnHandler = async (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  };
  for (let i = 0; i < 2; i += 1) {
    harness.script(implement, { when: whenTurn({ step: "implement" }) });
    harness.script(review, { when: whenTurn({ step: "review" }) });
  }
  harness.script(scriptInFlowResolve("in-flow-resolved"), {
    when: whenTurn({ step: "resolve" }),
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["conflict.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["conflict.txt"] }));
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "in-flow-resolved",
  );

  return { records };
}

async function resolvesParallelConflictFlowLandsPart2(
  scope: Awaited<ReturnType<typeof resolvesParallelConflictFlowLandsPart1>>,
) {
  const { records } = scope;
  const conflicts = records.filter((r) => r.step === "merge" && r.ok === false);
  expect(conflicts).toHaveLength(1);
  const loser = conflicts[0]!.slug!;
  expect(conflicts[0]!.cause?.kind === "conflict").toBe(true);
  expect(causeText(conflicts[0]!.cause)).toContain("conflict.txt");

  const resolveTurns = records.filter(
    (r) => r.slug === loser && r.step === "resolve" && r.actor === "agent",
  );
  expect(resolveTurns).toHaveLength(1);
  expect(resolveTurns[0]!.seq).toBeGreaterThan(conflicts[0]!.seq);
  expect(resolveTurns[0]!.outcome?.status).toBe("done");
  expect(resolveTurns[0]!.commit).toBeDefined();
  const resolved = records.find(
    (r) =>
      r.slug === loser &&
      r.step === "checks" &&
      r.seq > resolveTurns[0]!.seq &&
      r.ok === true,
  );
  expect(resolved).toBeDefined();
  const landed = records.find(
    (r) => r.slug === loser && r.step === "merge" && r.ok === true,
  );
  expect(landed).toBeDefined();
  expect(landed!.seq).toBeGreaterThan(resolved!.seq);
  expect(
    records.filter((r) => r.step === "steward" && r.actor === "agent"),
  ).toHaveLength(0);
}

async function sendsResolveTurnSOutsideChangesPart1(
  repo: TmpRepo,
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptConflict(harness);
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(req.cwd!, "conflict.txt"),
        "resolved\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(req.cwd!, "outside.txt"),
        "unreviewed\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "resolved and touched a new file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "resolve" }) },
  );
  const probe = { sawReview: false };
  harness.script(
    (req, ctx) => {
      probe.sawReview = true;
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    {
      when: (req) => {
        const identity = fakeTurnIdentity(req);
        return identity.step === "review" && identity.record.endsWith("-r2");
      },
    },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["conflict.txt", "outside.txt"] });

  return { probe, runtime, file };
}

async function sendsResolveTurnSOutsideChangesPart2(
  repo: TmpRepo,
  checkout: string,
  scope: Awaited<ReturnType<typeof sendsResolveTurnSOutsideChangesPart1>>,
) {
  const { runtime, file, probe } = scope;
  await writeTask(runtime, file);
  await ensureTaskWorktree(runtime, file);
  landIntegrationChange(repo, checkout);
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(probe.sawReview).toBe(true);
  expect(state.tasks.task!.status).toBe("merged");
  const resolveTurn = records.find(
    (r) => r.slug === "task" && r.step === "resolve" && r.actor === "agent",
  )!;
  expect(resolveTurn.outside).toEqual(["outside.txt"]);
  const review = records
    .filter(
      (r) => r.slug === "task" && r.step === "review" && r.actor === "agent",
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1)!;
  expect(review.seq).toBeGreaterThan(resolveTurn.seq);
  expect(review.round).toBe(2);
  expect(repo.git(["show", "factory/demo:outside.txt"]).stdout.trim()).toBe(
    "unreviewed",
  );
}

async function parksSecondConflictInsteadPart1(
  repo: TmpRepo,
  checkout: string,
  goal: string,
) {
  const repoYaml = yaml.parse(repo.readFile(".factory/repo.yaml"));
  const move = [
    `if grep -q resolved conflict.txt; then`,
    `printf "moved\\n" > "${checkout}/conflict.txt" &&`,
    `git -C "${checkout}" add conflict.txt &&`,
    `git -C "${checkout}" commit -m moved &&`,
    `git -C "${checkout}" checkout -- conflict.txt;`,
    `fi`,
  ].join(" ");
  repoYaml.gates = [
    { id: "move", command: `sh -c '${move}'` },
    { id: "readme", command: "test -f README.md" },
  ];
  repo.writeFile(".factory/repo.yaml", yaml.stringify(repoYaml));
  repo.commit("factory gates");

  const harness = new FakeHarness({ id: "fake" });
  scriptConflict(harness);
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(req.cwd!, "conflict.txt"),
        "resolved\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "resolved the first head" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "resolve" }) },
  );
  // The wave-end steward is the fallback; it cannot settle this either.
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "steward could not settle" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "steward" }) },
  );
  scriptStallLeave(harness, ["task"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["conflict.txt"] });

  return { runtime, file };
}

async function parksSecondConflictInsteadPart2(
  repo: TmpRepo,
  checkout: string,
  scope: Awaited<ReturnType<typeof parksSecondConflictInsteadPart1>>,
) {
  const { runtime, file } = scope;
  await writeTask(runtime, file);
  await ensureTaskWorktree(runtime, file);
  landIntegrationChange(repo, checkout);
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");
  expect(state.tasks.task!.cause?.kind === "conflict").toBe(true);
  // One resolve turn: the second conflict at the re-merge is the park.
  expect(
    records.filter(
      (r) => r.slug === "task" && r.step === "resolve" && r.actor === "agent",
    ),
  ).toHaveLength(1);
  expect(
    records.filter(
      (r) => r.slug === "task" && r.step === "merge" && r.ok === false,
    ).length,
  ).toBeGreaterThanOrEqual(2);
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "moved",
  );
}

function registerMergeConflictsPart1(): void {
  it("defers a steward leg that stops on infra and names it at the stop", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "auth",
            details:
              "provider.no-route Model unavailable: opencode/does-not-exist-free",
          },
        }),
      );
      // The dead leg leaves the conflict parked, so the wave-end stall PM
      // still decides it before the launch reports the fault.
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      // The dead candidate is named: the launch stops for its slug, not for a
      // bare cause that outlived the wave.
      expect(result.cause).toEqual({
        kind: "boundary",
        detail:
          "task: auth: provider.no-route Model unavailable: opencode/does-not-exist-free",
      });
      // Implement, QA and review compacted; the infra-stopped steward turn did not.
      expect(harness.compactions).toHaveLength(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMergeConflictsPart2(): void {
  it("does not compact a steward turn that ends in a refusal", async () => {
    const { repo, goal } = setupFlowRepo({
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
      },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy" },
        }),
      );
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      // Implement, QA and review compacted; the refused steward turn did not.
      expect(harness.compactions).toHaveLength(3);
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.step === "steward" && r.slug === "task"),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMergeConflictsPart3(): void {
  it("parks with the conflict and hands the branch to the steward", async () => {
    const { repo, goal } = setupFlowRepo({
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
      },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "steward could not resolve" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause?.kind === "conflict").toBe(true);
      expect(
        records.filter(
          (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
        ).length,
      ).toBe(0);
      expect(
        repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
      ).toBe("integration");
      expect(
        records.some((r) => r.step === "steward" && r.slug === "task"),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart1(): void {
  it("skips (and records) when the wave merges clean and green", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "clean.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "clean task" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["clean.txt"] }));
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      const skip = records.find((r) => r.step === "steward" && !r.slug);
      expect(skip?.ok).toBe(true);
      expect(skip?.cause).toEqual(cause("skipped: no conflicts"));
      expect(records.some((r) => r.step === "steward" && r.slug)).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart2(): void {
  it("resolves a parallel conflict in-flow and lands it without a steward turn", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const scope1 = await resolvesParallelConflictFlowLandsPart1(repo, goal);
      await resolvesParallelConflictFlowLandsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a red gate after the in-flow resolve instead of merging", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      gates: [
        { id: "content", command: "! grep -q broken conflict.txt" },
        { id: "readme", command: "test -f README.md" },
      ],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      await parksRedGateAfterFlowResolvePart1(repo, goal, checkout);
      await parksRedGateAfterFlowResolvePart2(repo);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("sends a resolve turn's outside changes through review before the re-merge", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await sendsResolveTurnSOutsideChangesPart1(repo, goal);
      await sendsResolveTurnSOutsideChangesPart2(repo, checkout, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart3(): void {
  it("parks a second conflict instead of resolving twice", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await parksSecondConflictInsteadPart1(
        repo,
        checkout,
        goal,
      );
      await parksSecondConflictInsteadPart2(repo, checkout, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the wave going when one conflict candidate's steward leg dies", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      limits: { concurrency: { overall: 2 } },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await keepsWaveGoingWhenOneConflictPart1(
        repo,
        goal,
        checkout,
      );
      await keepsWaveGoingWhenOneConflictPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart4(): void {
  it("retries a transiently dead steward leg after its backoff", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      limits: { concurrency: { overall: 2 } },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await retriesTransientlyDeadStewardLegPart1(
        repo,
        goal,
        checkout,
      );
      await retriesTransientlyDeadStewardLegPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart5(): void {
  it("resolves the parked conflict, then merges", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the steward (merge agent)");
        expect(req.prompt).toContain("conflict.txt");
        fs.writeFileSync(
          path.join(req.cwd!, "conflict.txt"),
          "steward-resolved\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "steward resolved" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(
        repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
      ).toBe("steward-resolved");
      const stewardTurn = records.find(
        (r) => r.slug === "task" && r.step === "steward" && r.actor === "agent",
      )!;
      expect(stewardTurn.session?.compacted).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart6(): void {
  it("leaves an architect pointer when the conflict is unresolvable", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "steward could not resolve" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const pointers = forwardedConcerns(records).filter((c) =>
        c.text.startsWith("steward: task unmerged"),
      );
      expect(pointers.length).toBe(1);
      expect(pointers[0]!.calibration).toBe("architect");
      expect(pointers[0]!.text).toContain("factory-task/demo/task");
      expect(pointers[0]!.text).toContain("worktree");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart7(): void {
  it("readies dependents after landing: unmerged work relaunches on the new head", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      limits: { concurrency: { overall: 1 } },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await readiesDependentsAfterLandingPart1(repo, goal);
      await readiesDependentsAfterLandingPart2(repo, checkout, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** Scripts the conflict, a red gate on the steward's resolve, and the continuation fix. */
function scriptGatedStewardResolve(harness: FakeHarness): void {
  scriptConflict(harness);
  scriptResolveLeavesConflict(harness);
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(req.cwd!, "conflict.txt"),
      "steward-resolved\n",
      "utf8",
    );
    ctx.writeOutcome(
      outcome({ summary: "steward resolved, gates will judge" }),
    );
    return fakeTurnResult(req);
  });
  scriptStallLeave(harness, ["task"]);
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "fixed\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "continuation fix" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/** The red gate holds the merge and leaves exactly one architect pointer. */
async function expectRedMergeHeldWithPointer(
  runtime: KernelRuntime,
): Promise<void> {
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  // The resolved merge went red, so the steward held with a pointer.
  expect(state.tasks.task!.status).toBe("parked");
  expect(
    records.some(
      (r) => r.slug === "task" && r.step === "merge-checks" && r.ok === false,
    ),
  ).toBe(true);
  expect(
    forwardedConcerns(records).filter((c) =>
      c.text.startsWith("steward: task unmerged"),
    ).length,
  ).toBe(1);
}

/** The relaunch ports onto the head the steward left and lands. */
async function expectContinuationMergesOnStewardHead(
  runtime: KernelRuntime,
  repo: TmpRepo,
): Promise<void> {
  await writeTask(
    runtime,
    task("task-fix", { base: "task", scope: ["conflict.txt"] }),
  );
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks["task-fix"]!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "fixed",
  );
}

function registerStewardPart8(): void {
  it("runs gates on the resolved merge: red holds, a continuation relaunches on the new head", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      gates: [
        { id: "content", command: "! grep -q steward-resolved conflict.txt" },
      ],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptGatedStewardResolve(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      await expectRedMergeHeldWithPointer(runtime);
      await expectContinuationMergesOnStewardHead(runtime, repo);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
