import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { formatCause } from "../../src/kernel/cause.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import {
  commitIn,
  head,
  parkAlpha,
  runImplementStep,
} from "./base-sync-helpers.js";
import {
  expectSyncedContinuation,
  scriptSyncedHeadTurns,
} from "./base-sync-probes.js";
import { causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("parked continuation syncs to the integration head", () => {
  registerParkedContinuationSyncsToTheIntegrationHeadPart1();
  registerParkedContinuationSyncsToTheIntegrationHeadPart2();
  registerParkedContinuationSyncsToTheIntegrationHeadPart3();
  registerParkedContinuationSyncsToTheIntegrationHeadPart4();
  registerParkedContinuationSyncsToTheIntegrationHeadPart5();
});

async function parksBaseConflictWhenMarkersRemainPart1(
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
  const integrationSha = commitIn(
    repo,
    checkout,
    "clash.txt",
    "integration\n",
    "factory: merge clashing task",
  );
  let sawAsk = false;
  harness.script((req, ctx) => {
    sawAsk = req.prompt.includes("Conflicted files: clash.txt");
    fs.writeFileSync(
      path.join(req.cwd!, "clash.txt"),
      "<<<<<<< HEAD\nalpha\n=======\nintegration\n>>>>>>> head\n",
      "utf8",
    );
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta tried" }));
    return fakeTurnResult(req);
  });
  const beta = task("beta", { base: "alpha", scope: ["beta.txt"] });
  await writeTask(runtime, beta);
  await runImplementStep(runtime, beta, 2);
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(sawAsk).toBe(true);

  return { runtime, checkout, alphaTip, integrationSha, records, state };
}

async function parksBaseConflictWhenMarkersRemainPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof parksBaseConflictWhenMarkersRemainPart1>>,
) {
  const { state, records, runtime, alphaTip, checkout, integrationSha } = scope;
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain(
    "base-conflict: clash.txt",
  );
  const park = records.find(
    (record) => record.slug === "beta" && record.step === "park",
  );
  expect(park?.architect).toBe("main");
  expect(
    records.filter((r) => r.slug === "beta" && r.actor === "agent"),
  ).toHaveLength(1);
  expect(
    records.filter((r) => r.slug === "beta" && r.step === "review"),
  ).toHaveLength(0);
  const betaWt = path.join(runtime.paths.worktreeRoot, `${goal}-tasks`, "beta");
  expect(repo.git(["status", "--porcelain"], { cwd: betaWt }).stdout).toBe("");
  expect(
    repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
      cwd: betaWt,
      allowFail: true,
    }).code,
  ).not.toBe(0);
  expect(fs.readFileSync(path.join(betaWt, "clash.txt"), "utf8")).toBe(
    "alpha\n",
  );
  expect(repo.git(["rev-parse", "factory-task/demo/beta"]).stdout.trim()).toBe(
    alphaTip,
  );
  expect(head(repo, checkout)).toBe(integrationSha);
}

async function resolvesFirstTurnCreationConflictPart1(
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
  const integrationSha = commitIn(
    repo,
    checkout,
    "clash.txt",
    "integration\n",
    "factory: merge clashing task",
  );
  const probe = { sawAsk: false, sawMergeHead: false };
  harness.script((req, ctx) => {
    probe.sawAsk =
      req.prompt.includes("Conflicted files: clash.txt") &&
      req.prompt.includes("Resolve the conflict");
    probe.sawMergeHead =
      repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
        cwd: req.cwd!,
        allowFail: true,
      }).code === 0;
    fs.writeFileSync(
      path.join(req.cwd!, "clash.txt"),
      "alpha\nintegration\n",
      "utf8",
    );
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta resolved and implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  return { runtime, integrationSha, probe };
}

async function resolvesFirstTurnCreationConflictPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof resolvesFirstTurnCreationConflictPart1>>,
) {
  const { runtime, probe, integrationSha } = scope;
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );
  await runDispatch(runtime, { iteration: 2 });
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("merged");
  expect(probe.sawAsk).toBe(true);
  expect(probe.sawMergeHead).toBe(true);
  const betaAgents = records.filter(
    (r) => r.slug === "beta" && r.actor === "agent" && r.endedAt,
  );
  expect(betaAgents).toHaveLength(3);
  // A continuation counts its own turns only; alpha's spend does not carry.
  expect(state.tasks.beta!.turns).toBe(3);
  const betaTip = repo
    .git(["rev-parse", "factory-task/demo/beta"])
    .stdout.trim();
  const parents = repo
    .git(["log", "--format=%P", "-1", betaTip])
    .stdout.trim()
    .split(" ");
  expect(parents).toHaveLength(2);
  expect(
    repo.git(["merge-base", "--is-ancestor", integrationSha, betaTip], {
      allowFail: true,
    }).code,
  ).toBe(0);
  const betaWt = path.join(runtime.paths.worktreeRoot, `${goal}-tasks`, "beta");
  expect(fs.readFileSync(path.join(betaWt, "clash.txt"), "utf8")).toBe(
    "alpha\nintegration\n",
  );

  return { ...scope, records };
}

async function resolvesFirstTurnCreationConflictPart3(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof resolvesFirstTurnCreationConflictPart2>>,
) {
  const { records, integrationSha } = scope;
  const impl = records
    .filter(
      (r) => r.slug === "beta" && r.step === "implement" && r.actor === "agent",
    )
    .sort((a, b) => a.seq - b.seq)[0]!;
  const advance = records
    .filter((r) => r.slug === "beta" && r.step === "base-advance")
    .sort((a, b) => a.seq - b.seq)[0]!;
  expect(advance.tree).toBe(impl.tree);
  const headTree = repo
    .git(["rev-parse", `${integrationSha}^{tree}`])
    .stdout.trim();
  expect(advance.headTree).toBe(headTree);
  expect(impl.base).toBe(integrationSha);
}

/** What the continuation's implement and review turns observe on the synced head. */
function registerParkedContinuationSyncsToTheIntegrationHeadPart1(): void {
  it("sees a commit merged after the park and reviews from that head", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "alpha.txt", "alpha\n");
      scriptStallLeave(harness, ["alpha"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      const alphaStart = head(repo, checkout);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      const alphaTip = repo
        .git(["rev-parse", "factory-task/demo/alpha"])
        .stdout.trim();

      const integrationSha = commitIn(
        repo,
        checkout,
        "merged-since.txt",
        "later\n",
        "factory: merge later task",
      );
      const probe = scriptSyncedHeadTurns(harness, repo, integrationSha);

      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expectSyncedContinuation(
        repo,
        records,
        state,
        probe,
        integrationSha,
        alphaStart,
        alphaTip,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart2(): void {
  it("stamps the architect on a checks-created base conflict", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = goalCheckout(repo, goal);
      repo.git(["checkout", "-b", "factory-task/demo/alpha", "main"], {
        cwd: repo.dir,
      });
      fs.writeFileSync(path.join(repo.dir, "clash.txt"), "alpha\n", "utf8");
      repo.git(["add", "clash.txt"], { cwd: repo.dir });
      repo.git(["commit", "-m", "alpha clash"], { cwd: repo.dir });
      repo.git(["checkout", "main"], { cwd: repo.dir });
      commitIn(
        repo,
        checkout,
        "clash.txt",
        "integration\n",
        "factory: integration clash",
      );

      const taskFile = task("beta", {
        base: "alpha",
        scope: ["clash.txt"],
        epic: "auth",
      });
      await writeTask(runtime, taskFile);
      const state = derive(
        await runtime.store.listTasks(),
        [],
        runtime.configs.process.flows,
      ).tasks.beta!;
      await executeTaskAction(
        runtime,
        taskFile,
        { kind: "checks", slug: "beta" },
        1,
        state,
      );

      const park = (await runtime.store.listRecords()).find(
        (record) => record.slug === "beta" && record.step === "park",
      );
      expect(park?.cause?.kind).toBe("base-conflict");
      expect(park?.architect).toBe("auth");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart3(): void {
  it("does not resync a continuation worktree that already exists", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = goalCheckout(repo, goal);
      repo.git(["branch", "factory-task/demo/alpha", head(repo, checkout)]);

      const first = await ensureTaskWorktree(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      expect(first.created).toBe(true);
      expect(first.error).toBeUndefined();
      const synced = head(repo, first.path);

      const laterSha = commitIn(
        repo,
        checkout,
        "after.txt",
        "after\n",
        "factory: merge after the worktree",
      );
      const second = await ensureTaskWorktree(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      expect(second.created).toBe(false);
      // ensureTaskWorktree never rewrites an existing worktree; the advance to
      // the current integration head happens at the turn seam (runStep), only
      // for a clean tree, and is covered by the turn-failures tests.
      expect(head(repo, second.path)).toBe(synced);
      expect(fs.existsSync(path.join(second.path, "after.txt"))).toBe(false);
      expect(second.startPoint).toBe(laterSha);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart4(): void {
  it("resolves a first-turn creation conflict in the turn and proceeds to review", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await resolvesFirstTurnCreationConflictPart1(repo, goal);
      const scope2 = await resolvesFirstTurnCreationConflictPart2(
        repo,
        goal,
        scope1,
      );
      await resolvesFirstTurnCreationConflictPart3(repo, scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks base-conflict when markers remain after the first resolve turn", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await parksBaseConflictWhenMarkersRemainPart1(repo, goal);
      await parksBaseConflictWhenMarkersRemainPart2(repo, goal, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerParkedContinuationSyncsToTheIntegrationHeadPart5(): void {
  it("parks base-conflict when the first resolve turn leaves the conflict unmerged", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
      scriptStallLeave(harness, ["alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      commitIn(
        repo,
        checkout,
        "clash.txt",
        "integration\n",
        "factory: merge clashing task",
      );
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta ignored the conflict" }));
        return fakeTurnResult(req);
      });
      const beta = task("beta", { base: "alpha", scope: ["beta.txt"] });
      await writeTask(runtime, beta);
      await runImplementStep(runtime, beta, 2);
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      expect(causeText(state.tasks.beta!.cause)).toContain(
        "base-conflict: clash.txt",
      );
      const betaWt = path.join(
        runtime.paths.worktreeRoot,
        `${goal}-tasks`,
        "beta",
      );
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: betaWt,
          allowFail: true,
        }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
