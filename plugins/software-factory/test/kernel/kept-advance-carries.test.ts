import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { commitIn } from "./base-sync-helpers.js";
import { causeText, task } from "./helpers.js";
import { bumpRevision } from "./park-recover-moved-head.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptDecider,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

type Repo = ReturnType<typeof setupFlowRepo>["repo"];

/**
 * Parks beta in revision 0 with `beta.txt` kept on its branch, optionally
 * landing a commit on the head first, then bumps the revision so its first
 * turn can commit nothing.
 */
async function parkKeptRevision(
  repo: Repo,
  goal: string,
  landOnHead?: (checkout: string) => void,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "beta written, then stopped" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  scriptStallLeave(harness, ["beta"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await runDispatch(runtime, { iteration: 1 });
  if (landOnHead) landOnHead(goalCheckout(repo, goal));
  bumpRevision(runtime, "beta");
  scriptStallLeave(harness, ["beta"]);
  return { harness, runtime };
}

/** The revision's zero-edit first turn and an approving review. */
function scriptZeroEditRevision(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      expect(fs.readFileSync(path.join(req.cwd!, "beta.txt"), "utf8")).toBe(
        "beta\n",
      );
      ctx.writeOutcome(
        outcome({ summary: "the kept work already meets the done-when" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
  scriptDecider(harness, {
    summary: "the kept work is already on the head",
    verdict: "reject",
  });
}

/** Runs the revision to the boundary and returns its records and state. */
async function runRevision(runtime: KernelRuntime) {
  const result = await runDispatch(runtime, { iteration: 2 });
  expect(result.reason).toBe("boundary");
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  return { records, state };
}

/** The records beta wrote after the park that ended revision 0. */
function revisionRecords(
  records: readonly StepRecord[],
  match: (rec: StepRecord) => boolean,
): StepRecord[] {
  const parked = records.find(
    (r) => r.slug === "beta" && r.step === "park" && r.revision === 0,
  )!;
  return records.filter(
    (r) => r.slug === "beta" && r.seq > parked.seq && match(r),
  );
}

function revisionAdvance(records: readonly StepRecord[]): StepRecord {
  const found = revisionRecords(records, (r) => r.step === "base-advance");
  expect(found).toHaveLength(1);
  return found[0]!;
}

async function expectNoMoveAdvanceCarried(repo: Repo, goal: string) {
  const { harness, runtime } = await parkKeptRevision(repo, goal);
  scriptZeroEditRevision(harness);
  const { records, state } = await runRevision(runtime);

  const advance = revisionAdvance(records);
  expect(advance.headTree).toBeDefined();
  expect(advance.tree).not.toBe(advance.headTree);
  // The turn committed nothing: its tree is still the post-advance one.
  const turn = revisionRecords(
    records,
    (r) => r.step === "implement" && r.actor === "agent",
  ).at(-1)!;
  expect(turn.tree).toBe(advance.tree);
  expect(state.tasks.beta!.status).toBe("merged");
  expect(revisionRecords(records, (r) => r.step === "review")).toHaveLength(1);
}

async function expectMovedAdvanceCarried(repo: Repo, goal: string) {
  let landed = "";
  const { harness, runtime } = await parkKeptRevision(
    repo,
    goal,
    (checkout) => {
      landed = commitIn(
        repo,
        checkout,
        "landed.txt",
        "landed\n",
        "factory: land another task",
      );
    },
  );
  scriptZeroEditRevision(harness);
  const { records, state } = await runRevision(runtime);

  const advance = revisionAdvance(records);
  expect(advance.headTree).toBe(
    repo.git(["rev-parse", `${landed}^{tree}`]).stdout.trim(),
  );
  expect(advance.tree).not.toBe(advance.headTree);
  expect(state.tasks.beta!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
    "beta",
  );
}

async function expectEqualTreeParks(repo: Repo, goal: string) {
  const { harness, runtime } = await parkKeptRevision(
    repo,
    goal,
    (checkout) => {
      commitIn(
        repo,
        checkout,
        "beta.txt",
        "beta\n",
        "factory: land the same beta",
      );
    },
  );
  scriptZeroEditRevision(harness);
  const { records, state } = await runRevision(runtime);

  const advance = revisionAdvance(records);
  expect(advance.tree).toBe(advance.headTree);
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain(
    "the kept work is already on the head",
  );
  expect(revisionRecords(records, (r) => r.step === "decide")).toHaveLength(1);
  expect(revisionRecords(records, (r) => r.step === "review")).toEqual([]);
  expect(revisionRecords(records, (r) => r.step === "merge")).toEqual([]);
}

function withFlowRepo(run: (repo: Repo, goal: string) => Promise<void>) {
  return async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      await run(repo, goal);
    } finally {
      cleanupFlowRepo(repo);
    }
  };
}

describe("kept advance carries", () => {
  it(
    "carries kept work past checks when the first-turn advance moves nothing",
    withFlowRepo(expectNoMoveAdvanceCarried),
    60_000,
  );

  it(
    "carries kept work when the advance moves the branch to a new head",
    withFlowRepo(expectMovedAdvanceCarried),
    60_000,
  );

  it(
    "parks when the advanced kept tree already equals the head's",
    withFlowRepo(expectEqualTreeParks),
    60_000,
  );
});
