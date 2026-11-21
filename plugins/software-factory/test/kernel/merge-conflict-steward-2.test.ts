import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  FakeHarness,
  type FakeTurnHandler,
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
import { task } from "./helpers.js";
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

describe("steward", () => {
  registerStewardPart3();

  registerStewardPart4();
});
