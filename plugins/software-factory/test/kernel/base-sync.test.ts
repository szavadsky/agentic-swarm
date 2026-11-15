import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function head(repo: TmpRepo, dir: string): string {
  return repo.git(["rev-parse", "HEAD"], { cwd: dir }).stdout.trim();
}

/** An integration commit, as the merge queue leaves one after a task lands. */
function commitIn(
  repo: TmpRepo,
  dir: string,
  file: string,
  content: string,
  message: string,
): string {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content, "utf8");
  repo.git(["add", "-A"], { cwd: dir });
  repo.git(["commit", "-m", message], { cwd: dir });
  return head(repo, dir);
}

/** Scripts one implemented-then-rejected alpha turn, leaving alpha parked. */
function parkAlpha(harness: FakeHarness, file: string, content: string): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), content, "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is not acceptable", verdict: "reject" }),
    );
    return fakeTurnResult(req);
  });
}

describe("parked continuation syncs to the integration head", () => {
  it("sees a commit merged after the park and reviews from that head", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "alpha.txt", "alpha\n");

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

      let laterVisible = false;
      let alphaVisible = false;
      let carriedDiff: string[] = [];
      let reviewerSawHead = false;
      harness.script((req, ctx) => {
        laterVisible = fs.existsSync(path.join(req.cwd!, "merged-since.txt"));
        alphaVisible = fs.existsSync(path.join(req.cwd!, "alpha.txt"));
        carriedDiff = repo
          .git(["diff", "--name-only", `${integrationSha}..HEAD`], {
            cwd: req.cwd!,
          })
          .stdout.split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta on the synced head" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        reviewerSawHead = req.prompt.includes(`${integrationSha}..`);
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

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
      const firstAgent = (slug: string) =>
        records
          .filter(
            (r) =>
              r.slug === slug && r.step === "implement" && r.actor === "agent",
          )
          .sort((a, b) => a.seq - b.seq)[0];

      expect(state.tasks.beta!.status).toBe("merged");
      expect(laterVisible).toBe(true);
      expect(alphaVisible).toBe(true);
      expect(carriedDiff).toEqual(["alpha.txt"]);
      expect(reviewerSawHead).toBe(true);
      expect(firstAgent("beta")?.base).toBe(integrationSha);
      // A task without `base` still starts at the integration head of its dispatch.
      expect(firstAgent("alpha")?.base).toBe(alphaStart);
      // The parked branch is never rewritten, only the continuation branch moves.
      expect(
        repo.git(["rev-parse", "factory-task/demo/alpha"]).stdout.trim(),
      ).toBe(alphaTip);
      expect(
        repo.git(["show", "factory/demo:merged-since.txt"]).stdout.trim(),
      ).toBe("later");
      expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
        "beta",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not resync a continuation worktree that already exists", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
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

  it("resolves a first-turn creation conflict in the turn and proceeds to review", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
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
      let sawAsk = false;
      let sawMergeHead = false;
      harness.script((req, ctx) => {
        sawAsk =
          req.prompt.includes("Conflicted files: clash.txt") &&
          req.prompt.includes("Resolve the conflict");
        sawMergeHead =
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
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
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
      expect(sawAsk).toBe(true);
      expect(sawMergeHead).toBe(true);
      const betaAgents = records.filter(
        (r) => r.slug === "beta" && r.actor === "agent" && r.endedAt,
      );
      expect(betaAgents).toHaveLength(2);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "merge-attempt"),
      ).toHaveLength(0);
      expect(state.tasks.beta!.turns).toBe(2);
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
      const betaWt = path.join(
        runtime.paths.worktreeRoot,
        `${goal}-tasks`,
        "beta",
      );
      expect(fs.readFileSync(path.join(betaWt, "clash.txt"), "utf8")).toBe(
        "alpha\nintegration\n",
      );
      const impl = records
        .filter(
          (r) =>
            r.slug === "beta" && r.step === "implement" && r.actor === "agent",
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
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks base-conflict when markers remain after the first resolve turn", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
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
      expect(sawAsk).toBe(true);
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toContain("base-conflict: clash.txt");
      expect(
        records.filter((r) => r.slug === "beta" && r.actor === "agent"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toHaveLength(0);
      const betaWt = path.join(
        runtime.paths.worktreeRoot,
        `${goal}-tasks`,
        "beta",
      );
      expect(repo.git(["status", "--porcelain"], { cwd: betaWt }).stdout).toBe(
        "",
      );
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: betaWt,
          allowFail: true,
        }).code,
      ).not.toBe(0);
      expect(fs.readFileSync(path.join(betaWt, "clash.txt"), "utf8")).toBe(
        "alpha\n",
      );
      expect(
        repo.git(["rev-parse", "factory-task/demo/beta"]).stdout.trim(),
      ).toBe(alphaTip);
      expect(head(repo, checkout)).toBe(integrationSha);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks base-conflict when the first resolve turn leaves the conflict unmerged", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
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
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toContain("base-conflict: clash.txt");
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

  it("resolves a reused-worktree first-turn conflict in the turn", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
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
      let sawAsk = false;
      harness.script((req, ctx) => {
        sawAsk = req.prompt.includes("Conflicted files: clash.txt");
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
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      await runDispatch(runtime, { iteration: 2 });
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(sawAsk).toBe(true);
      expect(state.tasks.beta!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("resumes a first-turn resolve after a crash without committing markers", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
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
      ).toBe(0);
      expect(
        repo.git(["rev-parse", "factory-task/demo/beta"]).stdout.trim(),
      ).toBe(alphaTip);
      let sawAsk = false;
      harness.script((req, ctx) => {
        sawAsk = req.prompt.includes("Conflicted files: clash.txt");
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
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await runDispatch(runtime, { iteration: 3 });
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(sawAsk).toBe(true);
      expect(state.tasks.beta!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("still parks a fix-turn conflict instead of resolving", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "alpha.txt", "alpha\n");
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
      expect(state.tasks.beta!.cause).toContain("base-conflict: beta.txt");
      expect(
        records.filter(
          (r) =>
            r.slug === "beta" &&
            r.step === "implement" &&
            r.actor === "agent" &&
            r.endedAt,
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("advances a reused base worktree to the integration head before the fix turn", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "alpha.txt", "alpha\n");
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

      let sawSince = false;
      harness.script((req, ctx) => {
        sawSince = fs.existsSync(path.join(req.cwd!, "merged-since.txt"));
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta fixed" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
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
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks empty-diff when a red-checks fix turn after a base-advance writes nothing, never merges", async () => {
    // No review awaits an answer here: the fix turn loops on red task checks,
    // so an empty fix still parks instead of deferring to a reviewer.
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "no-beta", command: "test ! -f beta.txt" }],
      limits: { concurrency: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "alpha.txt", "alpha\n");
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
      // No review scripted: beta's checks stay red, so the fix turn loops on
      // the implement step in the same round.
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
      // A missed park would loop the implementer into an exhausted-harness
      // crash instead of parking; the assertions below catch that.
      await runDispatch(runtime, { iteration: 3 });

      expect(sawSince).toBe(true);
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toContain("empty-diff");
      expect(state.tasks.beta!.cause).toContain(
        "after red checks: no-beta (exit 1)",
      );
      // The fix turn never reached review, so no merge ran.
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

      // The advance hides the no-change turn from a last-turn comparison:
      // first tree != post-advance tree == fix tree.
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
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
