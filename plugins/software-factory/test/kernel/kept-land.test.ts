import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runKeptLand } from "../../src/kernel/integrate.js";
import { runSteward } from "../../src/kernel/steward.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { task, cause, causeText } from "./helpers.js";
import type { Cause } from "../../src/kernel/types.js";
import {
  implementThenLand,
  scriptImplementApprove,
  stateOf,
} from "./continuation-helpers.js";

/** Appends an agent review turn approving `commit`. */
async function approveAt(
  runtime: KernelRuntime,
  slug: string,
  commit: string,
): Promise<void> {
  await runtime.store.appendRecord(
    { iteration: 1, slug, round: 1, step: "review", actor: "agent", commit },
    {
      ok: true,
      outcome: {
        status: "done",
        summary: "ok",
        verdict: "approve",
        concerns: [],
        forward: [],
      },
    },
  );
}

/** Appends a script park record carrying `parkCause`. */
async function parkAt(
  runtime: KernelRuntime,
  slug: string,
  commit: string,
  parkCause: Cause,
): Promise<void> {
  await runtime.store.appendRecord(
    { iteration: 1, slug, round: 1, step: "park", actor: "script", commit },
    { ok: true, cause: parkCause },
  );
}

/** The reported failure for a kept branch that does not exist. */
async function expectMissingBranchRecord(runtime: KernelRuntime) {
  const result = await runKeptLand(runtime, 1);
  expect(result.attempted).toContain("task");
  expect(result.landed).not.toContain("task");

  const records = await runtime.store.listRecords();
  const keptLand = records.find(
    (r) => r.slug === "task" && r.step === "kept-land" && r.iteration === 1,
  );
  expect(keptLand).toBeDefined();
  expect(keptLand?.ok).toBe(false);
  expect(causeText(keptLand?.cause)).toContain("does not exist");
}

/** Two identical merge-gate reds after the tip: kept-land skips the attempt. */
async function expectDeterministicSkip(runtime: KernelRuntime, tip: string) {
  await parkAt(runtime, "deterministic", tip, cause("gates: unit (exit 1)"));
  const red = {
    ok: false,
    checks: [
      {
        name: "unit",
        ok: false,
        summary: "exit 1",
        output: "",
        fingerprint: "unit",
      },
    ],
  };
  for (const _ of [0, 1]) {
    await runtime.store.appendRecord(
      {
        iteration: 1,
        slug: "deterministic",
        round: 1,
        step: "merge-checks",
        actor: "script",
      },
      red,
    );
  }

  const result = await runKeptLand(runtime, 1);
  expect(result.attempted).toContain("deterministic");
  expect(result.landed).not.toContain("deterministic");

  const records = await runtime.store.listRecords();
  const skipped = records.filter(
    (r) => r.slug === "deterministic" && r.step === "kept-land",
  );
  expect(skipped).toHaveLength(1);
  expect(skipped[0]?.ok).toBe(true);
  expect(skipped[0]?.cause).toEqual(cause("skipped: deterministic-red"));
  expect(
    records.filter((r) => r.slug === "deterministic" && r.step === "merge"),
  ).toHaveLength(0);
}

/** Kept-land cannot land the conflict; the steward's turn resolves and lands it. */
async function expectConflictHandover(
  runtime: KernelRuntime,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
) {
  const kept = await runKeptLand(runtime, 1);
  expect(kept.attempted).toContain("alpha");
  expect(kept.landed).not.toContain("alpha");

  const steward = await runSteward(runtime, 1);
  expect(steward.landed).toContain("alpha");
  expect((await stateOf(runtime)).tasks.alpha?.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:shared.txt"]).stdout.trim()).toBe(
    "resolved",
  );

  const records = await runtime.store.listRecords();
  const keptRecords = records.filter(
    (r) => r.slug === "alpha" && r.step === "kept-land",
  );
  expect(keptRecords).toHaveLength(1);
  expect(keptRecords[0]?.cause?.kind).toBe("conflict");
  const stewardTurns = records.filter(
    (r) => r.slug === "alpha" && r.step === "steward" && r.actor === "agent",
  );
  expect(stewardTurns).toHaveLength(1);
}

describe("kept-land", () => {
  it("writes a kept-land record when branch does not exist", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const commit = repo.git(["rev-parse", "main"]).stdout.trim();
      await approveAt(runtime, "task", commit);
      await parkAt(runtime, "task", commit, cause("parked"));

      await expectMissingBranchRecord(runtime);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("skips a red that already proved deterministic on the tip", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "feature\n");
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("deterministic", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      await implementThenLand(runtime, file, ["implement", "review"], repo);
      const tip = repo
        .git(["rev-parse", "factory-task/demo/deterministic"])
        .stdout.trim();

      await expectDeterministicSkip(runtime, tip);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("hands a conflicting kept branch to the steward at wave end", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "shared.txt", "alpha\n");
      scriptConflictSteward(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("alpha", { scope: ["shared.txt"] });
      await writeTask(runtime, file);
      await implementThenLand(runtime, file, ["implement", "review"], repo);
      const tip = repo
        .git(["rev-parse", "factory-task/demo/alpha"])
        .stdout.trim();
      await parkAt(runtime, "alpha", tip, cause("gates: unit (exit 1)"));
      await moveHeadUnder(runtime, repo);

      await expectConflictHandover(runtime, repo);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 120_000);
});

/** The steward turn that resolves the shared file's conflict. */
function scriptConflictSteward(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "shared.txt"), "resolved\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "steward resolved the conflict" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "steward" }) },
  );
}

/** Moves the integration head under the parked branch on the shared file. */
async function moveHeadUnder(
  runtime: KernelRuntime,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
): Promise<void> {
  const checkout = runtime.paths.goalCheckout;
  fs.writeFileSync(path.join(checkout, "shared.txt"), "integration\n", "utf8");
  repo.git(["add", "shared.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent integration change"], {
    cwd: checkout,
  });
}
