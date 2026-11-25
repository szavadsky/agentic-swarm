import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { judgeGoalHead } from "../../src/kernel/integrate.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  setupFlowRepo,
} from "./s2-helpers.js";

const aliases = {
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

/**
 * A gate that passes its tree once: the marker lives in the shared git dir, so
 * a second run on any tree fails. A judged tree that reuses its run stays
 * green; a re-gate turns red.
 */
const GATE_ONCE = {
  id: "once",
  command:
    'mark="$(git rev-parse --git-common-dir)/goal-head-ran"; test ! -e "$mark" && touch "$mark"',
};

/** A gate that fails its tree once: the first run is red, a re-gate is green. */
const GATE_RED_ONCE = {
  id: "red-once",
  command:
    'mark="$(git rev-parse --git-common-dir)/goal-head-ran-red"; test ! -e "$mark" && touch "$mark" && exit 1; exit 0',
};

/** The goal head's tree, as the gate record keys it. */
function headTreeOf(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  cwd: string,
): string {
  return repo.git(["rev-parse", "HEAD^{tree}"], { cwd }).stdout.trim();
}

/** The head's judgement for a tree, and the next wave end's reuse of it. */
async function judgedTwice(runtime: KernelRuntime) {
  const first = await judgeGoalHead(
    runtime,
    1,
    await runtime.store.listRecords(),
  );
  if (!first) throw new Error("the goal head was not judged");
  const again = await judgeGoalHead(
    runtime,
    1,
    await runtime.store.listRecords(),
  );
  if (!again) throw new Error("the reused judgement is missing");
  return { first, again };
}

function registerReuse(): void {
  it("reuses the run that judged the head tree and gates a new head", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, gates: [GATE_ONCE] });
    const checkout = goalCheckout(repo, goal);
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const { first, again } = await judgedTwice(runtime);
      expect(first.red).toEqual([]);
      expect(first.record.tree).toBe(headTreeOf(repo, checkout));
      expect(again.record.seq).toBe(first.record.seq);
      expect(again.red).toEqual([]);
      expect(
        (await runtime.store.listRecords()).filter(
          (record) => record.step === "goal-head",
        ),
      ).toHaveLength(1);

      // The head moves to a tree no run has judged: the gates run again and
      // the once-passing gate is red.
      fs.writeFileSync(path.join(checkout, "head.txt"), "head\n", "utf8");
      repo.git(["add", "head.txt"], { cwd: checkout });
      repo.git(["commit", "-m", "move the goal head"], { cwd: checkout });
      const moved = await judgeGoalHead(
        runtime,
        1,
        await runtime.store.listRecords(),
      );
      expect(moved?.record.tree).toBe(headTreeOf(repo, checkout));
      expect(moved?.record.seq).toBeGreaterThan(first.record.seq);
      expect(moved?.red.map((check) => check.name)).toEqual([GATE_ONCE.id]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerRedReuse(): void {
  it("reuses the run that judged the head tree red", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, gates: [GATE_RED_ONCE] });
    const checkout = goalCheckout(repo, goal);
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const first = await judgeGoalHead(
        runtime,
        1,
        await runtime.store.listRecords(),
      );
      if (!first) throw new Error("the goal head was not judged");
      const again = await judgeGoalHead(
        runtime,
        2,
        await runtime.store.listRecords(),
      );
      if (!again) throw new Error("the reused judgement is missing");
      expect(first.record.tree).toBe(headTreeOf(repo, checkout));
      expect(first.red.map((check) => check.name)).toEqual([GATE_RED_ONCE.id]);
      expect(again.record.seq).toBe(first.record.seq);
      expect(again.red.map((check) => check.name)).toEqual([GATE_RED_ONCE.id]);
      expect(
        (await runtime.store.listRecords()).filter(
          (record) => record.step === "goal-head",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerInfra(): void {
  it("records a gate that could not start without calling the head red", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases,
      gates: [{ id: "broken", command: "exit 127" }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const judged = await judgeGoalHead(
        runtime,
        1,
        await runtime.store.listRecords(),
      );
      expect(judged).toBeDefined();
      expect(judged!.red).toEqual([]);
      expect(judged!.record.ok).toBe(false);

      // An infra run is no verdict: the next wave end gates the tree again.
      const rejudged = await judgeGoalHead(
        runtime,
        1,
        await runtime.store.listRecords(),
      );
      expect(rejudged!.record.seq).toBeGreaterThan(judged!.record.seq);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("goal head gates", () => {
  registerReuse();

  registerRedReuse();

  registerInfra();
});
