import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task, cause, causeText } from "./helpers.js";
import { commitIn, parkAlpha } from "./base-sync-helpers.js";
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

/** Parks a continuation on base-conflict, then runs the wave end steward. */
async function baseConflictRun(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  parkAlpha(harness, "clash.txt", "alpha\n");
  scriptStallLeave(harness, ["alpha"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
  await runDispatch(runtime, { iteration: 1 });

  // The head gains a change the continuation branch cannot take in, and the
  // first turn leaves the markers: the branch parks on base-conflict.
  commitIn(
    repo,
    checkout,
    "clash.txt",
    "integration\n",
    "factory: merge clashing task",
  );
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta left the conflict" }));
    return fakeTurnResult(req);
  });
  const prompts: string[] = [];
  harness.script(
    (req, ctx) => {
      prompts.push(req.prompt ?? "");
      fs.writeFileSync(
        path.join(req.cwd!, "clash.txt"),
        "steward-resolved\n",
        "utf8",
      );
      ctx.writeOutcome(
        outcome({ summary: "steward resolved the base conflict" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "steward" }) },
  );
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  await runDispatch(runtime, { iteration: 2 });
  return { runtime, prompts };
}

/** The park is the steward's, and its turn lands the resolution. */
async function baseConflictAssert(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof baseConflictRun>>,
) {
  const { runtime, prompts } = scope;
  const records = await runtime.store.listRecords();
  const parked = records.find((r) => r.slug === "beta" && r.step === "park");
  expect(parked?.cause?.kind).toBe("base-conflict");
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain("You are the steward (merge agent)");
  expect(prompts[0]).toContain("clash.txt");
  expect(
    records.find(
      (r) => r.slug === "beta" && r.step === "steward" && r.actor === "agent",
    ),
  ).toBeDefined();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:clash.txt"]).stdout.trim()).toBe(
    "steward-resolved",
  );
}

function registerBaseConflict(): void {
  it("takes a base-conflict park at wave end and lands the resolution", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      limits: { concurrency: { overall: 1 } },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      await baseConflictAssert(
        repo,
        await baseConflictRun(repo, goal, checkout),
      );
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

describe("steward", () => {
  registerStewardPart2();
});

describe("steward base conflict", () => {
  registerBaseConflict();
});
