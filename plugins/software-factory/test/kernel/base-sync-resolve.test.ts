import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptDecider,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { commitIn, parkAlpha } from "./base-sync-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("parked continuation syncs to the integration head", () => {
  registerParkedContinuationSyncsToTheIntegrationHeadPart1();
  registerParkedContinuationSyncsToTheIntegrationHeadPart2();
  registerParkedContinuationSyncsToTheIntegrationHeadPart3();
  registerParkedContinuationSyncsToTheIntegrationHeadPart4();
  registerParkedContinuationSyncsToTheIntegrationHeadPart5();
});

async function stillParksFixTurnConflictInsteadPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  parkAlpha(harness, "alpha.txt", "alpha\n");
  scriptStallLeave(harness, ["alpha"]);
  scriptStallLeave(harness, ["beta"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const checkout = goalCheckout(repo, goal);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await runDispatch(runtime, { iteration: 1 });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "beta needs changes", verdict: "changes" }),
    );
    return fakeTurnResult(req);
  });
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  await runDispatch(runtime, { iteration: 2 });
  commitIn(
    repo,
    checkout,
    "beta.txt",
    "integration owns beta\n",
    "factory: merge beta clash",
  );
  await runDispatch(runtime, { iteration: 3 });
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain(
    "base-conflict: beta.txt",
  );

  return { records };
}

async function stillParksFixTurnConflictInsteadPart2(
  scope: Awaited<ReturnType<typeof stillParksFixTurnConflictInsteadPart1>>,
) {
  const { records } = scope;
  expect(
    records.filter(
      (r) =>
        r.slug === "beta" &&
        r.step === "implement" &&
        r.actor === "agent" &&
        r.endedAt,
    ),
  ).toHaveLength(1);
}

async function resolvesReusedWorktreeFirstTurnPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  parkAlpha(harness, "clash.txt", "alpha\n");
  scriptStallLeave(harness, ["alpha"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const checkout = goalCheckout(repo, goal);
  await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
  await runDispatch(runtime, { iteration: 1 });
  const early = await ensureTaskWorktree(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  expect(early.created).toBe(true);
  expect(early.mergeConflict).toBeUndefined();
  commitIn(
    repo,
    checkout,
    "clash.txt",
    "integration\n",
    "factory: merge clashing task",
  );
  const probe = { sawAsk: false };
  harness.script((req, ctx) => {
    probe.sawAsk = req.prompt.includes("Conflicted files: clash.txt");
    fs.writeFileSync(
      path.join(req.cwd!, "clash.txt"),
      "alpha\nintegration\n",
      "utf8",
    );
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta resolved on reuse" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );

  return { runtime, probe };
}

async function resolvesReusedWorktreeFirstTurnPart2(
  scope: Awaited<ReturnType<typeof resolvesReusedWorktreeFirstTurnPart1>>,
) {
  const { runtime, probe } = scope;
  await runDispatch(runtime, { iteration: 2 });
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(probe.sawAsk).toBe(true);
  expect(state.tasks.beta!.status).toBe("merged");
}

async function parksEmptyDiffWhenRedChecksFixTurnPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  parkAlpha(harness, "alpha.txt", "alpha\n");
  scriptStallLeave(harness, ["alpha"]);
  scriptStallLeave(harness, ["beta"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const checkout = goalCheckout(repo, goal);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await runDispatch(runtime, { iteration: 1 });

  // Beta's first tree: one file on top of the parked branch.
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta implemented" }));
    return fakeTurnResult(req);
  });
  // No review scripted: beta's checks stay red and its fix loops on implement.
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  await runDispatch(runtime, { iteration: 2 });

  // Integration moves after beta's worktree was created.
  commitIn(
    repo,
    checkout,
    "merged-since.txt",
    "later\n",
    "factory: merge later task",
  );

  let sawSince = false;
  harness.script((req, ctx) => {
    sawSince = fs.existsSync(path.join(req.cwd!, "merged-since.txt"));
    // Writes nothing: the tree stays at the post-advance head.
    ctx.writeOutcome(outcome({ summary: "beta fixed" }));
    return fakeTurnResult(req);
  });
  scriptDecider(harness, { summary: "repeated red", verdict: "reject" });
  // A missed park would loop the implementer into an exhausted-harness crash.
  await runDispatch(runtime, { iteration: 3 });
  return { runtime, sawSince };
}

async function parksEmptyDiffWhenRedChecksFixTurnPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof parksEmptyDiffWhenRedChecksFixTurnPart1>>,
) {
  const { sawSince, runtime } = scope;
  expect(sawSince).toBe(true);
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain("repeated red");
  // The decider saw the repeated-red signal; the fix never reached review and
  // no merge ran.
  expect(
    records.find((r) => r.slug === "beta" && r.step === "decide"),
  ).toBeDefined();
  expect(
    records.find(
      (r) =>
        r.slug === "beta" && r.step === "decide" && (r.promptBytes ?? 0) > 0,
    ),
  ).toBeDefined();
  expect(
    records.filter((r) => r.slug === "beta" && r.step === "review"),
  ).toHaveLength(0);
  expect(
    records.filter(
      (r) => r.slug === "beta" && r.step === "merge" && r.ok === true,
    ),
  ).toHaveLength(0);
  expect(
    repo.git(["show", "factory/demo:beta.txt"], { allowFail: true }).code,
  ).not.toBe(0);

  return scope;
}

async function parksEmptyDiffWhenRedChecksFixTurnPart3(
  scope: Awaited<ReturnType<typeof parksEmptyDiffWhenRedChecksFixTurnPart2>>,
) {
  // The advance hides the no-change turn from a last-turn comparison:
  // first tree != post-advance tree == fix tree.
  const records = await scope.runtime.store.listRecords();
  const betaImplements = records
    .filter(
      (r) =>
        r.slug === "beta" &&
        r.step === "implement" &&
        r.actor === "agent" &&
        r.endedAt,
    )
    .sort((a, b) => a.seq - b.seq);
  const advances = records
    .filter((r) => r.slug === "beta" && r.step === "base-advance")
    .sort((a, b) => a.seq - b.seq);
  expect(betaImplements).toHaveLength(2);
  expect(advances.length).toBeGreaterThanOrEqual(2);
  const firstTree = betaImplements[0]!.tree;
  const fixTree = betaImplements[1]!.tree;
  const postAdvance = advances[advances.length - 1]!.tree;
  expect(firstTree).toBeDefined();
  expect(fixTree).toBeDefined();
  expect(postAdvance).toBeDefined();
  expect(fixTree).toBe(postAdvance);
  expect(firstTree).not.toBe(postAdvance);
}

async function resumesFirstTurnResolveAfterCrashPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  parkAlpha(harness, "clash.txt", "alpha\n");
  scriptStallLeave(harness, ["alpha"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const checkout = goalCheckout(repo, goal);
  await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
  await runDispatch(runtime, { iteration: 1 });
  const alphaTip = repo
    .git(["rev-parse", "factory-task/demo/alpha"])
    .stdout.trim();
  commitIn(
    repo,
    checkout,
    "clash.txt",
    "integration\n",
    "factory: merge clashing task",
  );
  harness.script((req, _ctx) => {
    return fakeTurnResult(req, { stop: { kind: "infra", cause: "crash" } });
  });
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  await runDispatch(runtime, { iteration: 2 });

  return { runtime, harness, alphaTip };
}

async function resumesFirstTurnResolveAfterCrashPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof resumesFirstTurnResolveAfterCrashPart1>>,
) {
  const { runtime, harness, alphaTip } = scope;
  const betaWt = path.join(runtime.paths.worktreeRoot, `${goal}-tasks`, "beta");
  expect(
    repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
      cwd: betaWt,
      allowFail: true,
    }).code,
  ).toBe(0);
  expect(repo.git(["rev-parse", "factory-task/demo/beta"]).stdout.trim()).toBe(
    alphaTip,
  );
  const probe = { sawAsk: false };
  harness.script((req, ctx) => {
    probe.sawAsk = req.prompt.includes("Conflicted files: clash.txt");
    fs.writeFileSync(
      path.join(req.cwd!, "clash.txt"),
      "alpha\nintegration\n",
      "utf8",
    );
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta resolved after crash" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  await runDispatch(runtime, { iteration: 3 });
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(probe.sawAsk).toBe(true);
  expect(state.tasks.beta!.status).toBe("merged");
}

async function advancesReusedBaseWorktreeToIntegrationHeadPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  parkAlpha(harness, "alpha.txt", "alpha\n");
  scriptStallLeave(harness, ["alpha"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const checkout = goalCheckout(repo, goal);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await runDispatch(runtime, { iteration: 1 });

  // Beta runs one round; the reviewer asks for changes, so the reused
  // worktree survives into the fix turn.
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "beta needs changes", verdict: "changes" }),
    );
    return fakeTurnResult(req);
  });
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  await runDispatch(runtime, { iteration: 2 });

  // The integration branch moves after beta's worktree was created.
  commitIn(
    repo,
    checkout,
    "merged-since.txt",
    "later\n",
    "factory: merge later task",
  );

  return { runtime, harness };
}

async function advancesReusedBaseWorktreeToIntegrationHeadPart2(
  scope: Awaited<
    ReturnType<typeof advancesReusedBaseWorktreeToIntegrationHeadPart1>
  >,
) {
  const { runtime, harness } = scope;
  let sawSince = false;
  harness.script((req, ctx) => {
    sawSince = fs.existsSync(path.join(req.cwd!, "merged-since.txt"));
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta fixed" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  await runDispatch(runtime, { iteration: 3 });

  expect(sawSince).toBe(true);
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("merged");
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart1(): void {
  it("resolves a reused-worktree first-turn conflict in the turn", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await resolvesReusedWorktreeFirstTurnPart1(repo, goal);
      await resolvesReusedWorktreeFirstTurnPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart2(): void {
  it("resumes a first-turn resolve after a crash without committing markers", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await resumesFirstTurnResolveAfterCrashPart1(repo, goal);
      await resumesFirstTurnResolveAfterCrashPart2(repo, goal, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart3(): void {
  it("still parks a fix-turn conflict instead of resolving", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await stillParksFixTurnConflictInsteadPart1(repo, goal);
      await stillParksFixTurnConflictInsteadPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart4(): void {
  it("advances a reused base worktree to the integration head before the fix turn", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await advancesReusedBaseWorktreeToIntegrationHeadPart1(
        repo,
        goal,
      );
      await advancesReusedBaseWorktreeToIntegrationHeadPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart5(): void {
  it("parks empty-diff when a red-checks fix turn after a base-advance writes nothing, never merges", async () => {
    // No review awaits an answer here: the fix turn loops on red task checks,
    // so an empty fix still parks instead of deferring to a reviewer.
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "no-beta", command: "test ! -f beta.txt" }],
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await parksEmptyDiffWhenRedChecksFixTurnPart1(repo, goal);
      const scope2 = await parksEmptyDiffWhenRedChecksFixTurnPart2(
        repo,
        scope1,
      );
      await parksEmptyDiffWhenRedChecksFixTurnPart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
