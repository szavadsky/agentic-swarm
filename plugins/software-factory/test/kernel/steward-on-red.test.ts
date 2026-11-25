import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { CheckResult } from "../../src/core/checks/types.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  judgeGoalHead,
  type GoalHeadJudgement,
} from "../../src/kernel/integrate.js";
import {
  stewardCandidates,
  stewardParks,
} from "../../src/kernel/steward/candidates.js";
import type {
  KernelRuntime,
  State,
  StepRecord,
} from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { cause, rec, script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptDecider,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

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

/** The gate names the repair in its own output, so the log proves what failed. */
const GATE = {
  id: "check",
  command:
    "test -f check.txt || (echo 'check.txt vanished from the merged result'; exit 1)",
};

/**
 * Implement writes a fresh feature file per turn — the gate-fix turn commits a
 * tip the review's approve no longer covers — the review approves, and the
 * steward restores the file the red merge gate wants.
 */
function scriptRedAfterMerge(
  harness: FakeHarness,
  onStewardTurn: (prompt: string) => void,
): void {
  let implementTurns = 0;
  harness.script(
    (req, ctx) => {
      implementTurns += 1;
      fs.writeFileSync(
        path.join(req.cwd!, "feature.txt"),
        `feature-${implementTurns}\n`,
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "feature implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }), fallback: true },
  );
  scriptDecider(harness, {
    summary: "the merged result is red; the steward owns the repair",
    verdict: "reject",
  });
  harness.script(
    (req, ctx) => {
      onStewardTurn(req.prompt ?? "");
      fs.writeFileSync(path.join(req.cwd!, "check.txt"), "repair\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "steward restored the gate file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "steward" }) },
  );
}

/** A green feature task: implement writes the file, the review approves. */
function scriptGreenWave(harness: FakeHarness): void {
  let implementTurns = 0;
  harness.script(
    (req, ctx) => {
      implementTurns += 1;
      fs.writeFileSync(
        path.join(req.cwd!, "feature.txt"),
        `feature-${implementTurns}\n`,
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "feature implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }), fallback: true },
  );
}

/** The steward prompt's gate log path. */
function gateLogOf(prompt: string): string {
  const line = prompt
    .split("\n")
    .find((text) => text.startsWith("- gate log:"));
  if (!line) throw new Error("steward prompt names no gate log");
  return line.slice("- gate log: `".length, line.indexOf("`", 25));
}

async function stateOf(runtime: KernelRuntime) {
  const records = await runtime.store.listRecords();
  const tasks = await runtime.store.listTasks();
  return derive(tasks, records, runtime.configs.process.flows);
}

/** Seeds the gated file on the base branch the goal branch is cut from. */
function seedGateFile(repo: ReturnType<typeof setupFlowRepo>["repo"]): void {
  repo.writeFile("check.txt", "base\n");
  repo.git(["add", "check.txt"]);
  repo.git(["commit", "-m", "seed the gate file on the base"]);
}

/** The goal head's tree, as the gate record keys it. */
function headTreeOf(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  cwd: string,
) {
  return repo.git(["rev-parse", "HEAD^{tree}"], { cwd }).stdout.trim();
}

/** Runs a wave whose head lost the gated file after the task branched. */
async function redHeadRun(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const prompts: string[] = [];
  scriptRedAfterMerge(harness, (prompt) => prompts.push(prompt));

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("alpha", { scope: ["feature.txt"] });
  await writeTask(runtime, file);
  await ensureTaskWorktree(runtime, file);

  fs.rmSync(path.join(checkout, "check.txt"));
  repo.git(["add", "-A"], { cwd: checkout });
  repo.git(["commit", "-m", "remove the gate file on the integration head"], {
    cwd: checkout,
  });
  const headTree = headTreeOf(repo, checkout);
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  return { runtime, prompts, headTree };
}

/** The steward turn reads the head's own gate log, not a merge-check. */
async function redHeadAssert(
  checkout: string,
  scope: Awaited<ReturnType<typeof redHeadRun>>,
) {
  const { runtime, prompts, headTree } = scope;
  const records = await runtime.store.listRecords();
  expect(prompts).toHaveLength(1);
  const judged = records.filter((record) => record.step === "goal-head");
  expect(judged).toHaveLength(1);
  expect(judged[0]!.tree).toBe(headTree);
  const headLog = runtime.store.records.file(judged[0]!, "end.yaml");
  expect(fs.readFileSync(headLog, "utf8")).toContain(
    "check.txt vanished from the merged result",
  );
  expect(gateLogOf(prompts[0]!)).toBe(headLog);
  const lastRed = records
    .filter(
      (r) => r.slug === "alpha" && r.step === "merge-checks" && r.ok === false,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1)!;
  expect(lastRed.seq).toBeLessThan(judged[0]!.seq);
  expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
  expect(fs.existsSync(path.join(checkout, "check.txt"))).toBe(true);
}

function registerRedAfterMerge(): void {
  it("runs a steward turn on the goal head's own red gate log", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      gates: [GATE],
    });
    const checkout = goalCheckout(repo, goal);
    seedGateFile(repo);
    try {
      await redHeadAssert(checkout, await redHeadRun(repo, goal, checkout));
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerGreenWave(): void {
  it("records no steward turn when the wave merges green and conflict-free", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      gates: [GATE],
    });
    seedGateFile(repo);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptGreenWave(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["feature.txt"] }));

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
      expect(
        records.some((r) => r.step === "steward" && r.actor === "agent"),
      ).toBe(false);
      // Nothing parked on a gate: the head is never gated for the steward.
      expect(records.some((r) => r.step === "goal-head")).toBe(false);
      const skip = records.find((r) => r.step === "steward");
      expect(skip?.cause).toEqual(cause("skipped: no conflicts"));
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function check(
  name: string,
  ok: boolean,
  extra: Partial<CheckResult> = {},
): CheckResult {
  return {
    name,
    ok,
    summary: ok ? "pass" : "fail",
    output: "",
    fingerprint: name,
    ...extra,
  };
}

/** The pre-flight base-gate record: the base was green, or red on its gate. */
function baseGates(ok: boolean) {
  return script(1, {
    slug: "alpha",
    step: "baseline",
    base: "base1",
    ok,
    checks: [check("check", ok)],
  });
}

/** A parked task in a one-task wave, whose gate fix is spent. */
function parkedState(park = "gates: check"): State {
  return {
    goal: "active",
    iteration: 1,
    terminal: false,
    interrupted: false,
    epics: {},
    tasks: {
      alpha: {
        status: "parked",
        cause: cause(park),
        turns: 3,
        round: 1,
        kind: "development",
        flow: "implement-review",
        phase: "parked",
      },
    },
  };
}

/** The merge gate ran on the merged result and failed. */
function redMergeChecks(gate: CheckResult, seq = 6) {
  return script(seq, {
    slug: "alpha",
    step: "merge-checks",
    ok: false,
    checks: [gate],
  });
}

/** The goal head's gate verdict: the record that judged its tree, and its red. */
function headJudgement(gate: CheckResult | undefined): GoalHeadJudgement {
  return {
    record: script(9, {
      step: "goal-head",
      checks: gate ? [gate] : [check("check", true)],
    }),
    red: gate ? [gate] : [],
  };
}

function candidatesFor(
  records: StepRecord[],
  goalHead: GoalHeadJudgement | undefined,
  state: State = parkedState(),
) {
  return stewardCandidates(
    [task("alpha", { scope: ["feature.txt"] })],
    state,
    new Set(),
    undefined,
    [rec(3, { slug: "alpha", step: "implement", commit: "c1" }), ...records],
    undefined,
    goalHead,
  );
}

function registerRedHeadCandidate(): void {
  it("takes a gates park when the goal head's own gate run is red", () => {
    const candidates = candidatesFor(
      [baseGates(true)],
      headJudgement(check("check", false)),
    );

    expect(candidates.map((c) => [c.slug, c.kind])).toEqual([
      ["alpha", "red-after-merge"],
    ]);
  });
}

function registerMergedRedCandidate(): void {
  it("takes the branch's red merged result when the head is green", () => {
    const candidates = candidatesFor(
      [baseGates(true), redMergeChecks(check("check", false))],
      headJudgement(undefined),
    );

    expect(candidates.map((c) => [c.slug, c.kind])).toEqual([
      ["alpha", "red-after-merge"],
    ]);
  });
}

function registerNoRedCandidate(): void {
  it("leaves a gates park with no red on the head or the merged result", () => {
    expect(candidatesFor([baseGates(true)], headJudgement(undefined))).toEqual(
      [],
    );
  });
}

function registerInheritedRedCandidate(): void {
  it("leaves a red the base already showed to the baseline handling", () => {
    expect(
      candidatesFor(
        [baseGates(false), redMergeChecks(check("check", false))],
        headJudgement(undefined),
      ),
    ).toEqual([]);
  });
}

function registerInfraRedCandidate(): void {
  it("leaves a gate that could not start to the infra path", () => {
    const infra = check("check", false, {
      summary: "exit 127",
      details: { kind: "infra", cause: "missing-runner" },
    });

    expect(
      candidatesFor(
        [baseGates(true), redMergeChecks(infra)],
        headJudgement(undefined),
      ),
    ).toEqual([]);
  });
}

function registerBaseConflictCandidate(): void {
  it("takes a base-conflict park as a branch the head must merge into", () => {
    const state = parkedState("base-conflict: clash.txt");
    const tasks = [task("alpha", { scope: ["clash.txt"] })];

    expect(stewardParks(tasks, state, new Set(), undefined)).toEqual([
      { slug: "alpha", kind: "conflict" },
    ]);
    expect(
      candidatesFor([baseGates(true)], headJudgement(undefined), state),
    ).toEqual([{ slug: "alpha", kind: "conflict" }]);
    expect(stewardParks(tasks, state, new Set(["alpha"]), undefined)).toEqual(
      [],
    );
    expect(stewardParks(tasks, state, new Set(), new Set(["alpha"]))).toEqual(
      [],
    );
  });
}

function registerKeptLandSkip(): void {
  it("leaves a gates park the kept-land can land on its own", () => {
    const records = [
      baseGates(true),
      rec(4, {
        slug: "alpha",
        step: "review",
        commit: "c1",
        outcome: outcome({ verdict: "approve" }),
      }),
    ];

    expect(
      candidatesFor(records, headJudgement(check("check", false))),
    ).toEqual([]);
  });
}

describe("steward on red", () => {
  registerRedAfterMerge();

  registerGreenWave();
});

describe("steward candidate selection", () => {
  registerRedHeadCandidate();

  registerMergedRedCandidate();

  registerNoRedCandidate();

  registerInheritedRedCandidate();

  registerInfraRedCandidate();

  registerBaseConflictCandidate();

  registerKeptLandSkip();
});
