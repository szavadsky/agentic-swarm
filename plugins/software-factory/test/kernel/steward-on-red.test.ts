import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { CheckResult } from "../../src/core/checks/types.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { stewardCandidates } from "../../src/kernel/steward/candidates.js";
import type { KernelRuntime, State } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { cause, rec, script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
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

function registerRedAfterMerge(): void {
  it("runs a steward turn with the red gate log when the merged result is red", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      gates: [GATE],
    });
    const checkout = goalCheckout(repo, goal);
    seedGateFile(repo);
    try {
      const harness = new FakeHarness({ id: "fake" });
      const prompts: string[] = [];
      scriptRedAfterMerge(harness, (prompt) => prompts.push(prompt));

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("alpha", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);

      // The goal branch loses the gated file after the task branched, so the
      // task's own checks stay green and only the merged result runs red.
      fs.rmSync(path.join(checkout, "check.txt"));
      repo.git(["add", "-A"], { cwd: checkout });
      repo.git(
        ["commit", "-m", "remove the gate file on the integration head"],
        {
          cwd: checkout,
        },
      );

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      expect(prompts).toHaveLength(1);
      const lastRed = records
        .filter(
          (r) =>
            r.slug === "alpha" && r.step === "merge-checks" && r.ok === false,
        )
        .sort((a, b) => a.seq - b.seq)
        .at(-1)!;
      const log = gateLogOf(prompts[0]!);
      expect(log).toBe(runtime.store.records.file(lastRed, "end.yaml"));
      expect(fs.readFileSync(log, "utf8")).toContain(
        "check.txt vanished from the merged result",
      );

      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
      expect(fs.existsSync(path.join(checkout, "check.txt"))).toBe(true);
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
function parkedState(): State {
  return {
    goal: "active",
    iteration: 1,
    terminal: false,
    interrupted: false,
    epics: {},
    tasks: {
      alpha: {
        status: "parked",
        cause: cause("gates: check"),
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

function candidatesFor(records: ReturnType<typeof script>[]) {
  return stewardCandidates(
    [task("alpha", { scope: ["feature.txt"] })],
    parkedState(),
    new Set(),
    undefined,
    [rec(3, { slug: "alpha", step: "implement", commit: "c1" }), ...records],
  );
}

function registerNewRedCandidate(): void {
  it("takes the red merged result when the base was green", () => {
    const candidates = candidatesFor([
      baseGates(true),
      redMergeChecks(check("check", false)),
    ]);

    expect(candidates.map((c) => [c.slug, c.kind])).toEqual([
      ["alpha", "red-after-merge"],
    ]);
  });
}

function registerInheritedRedCandidate(): void {
  it("leaves a red the base already showed to the baseline handling", () => {
    expect(
      candidatesFor([baseGates(false), redMergeChecks(check("check", false))]),
    ).toEqual([]);
  });
}

function registerInfraRedCandidate(): void {
  it("leaves a gate that could not start to the infra path", () => {
    const infra = check("check", false, {
      summary: "exit 127",
      details: { kind: "infra", cause: "missing-runner" },
    });

    expect(candidatesFor([baseGates(true), redMergeChecks(infra)])).toEqual([]);
  });
}

describe("steward on red", () => {
  registerRedAfterMerge();

  registerGreenWave();
});

describe("steward candidate selection", () => {
  registerNewRedCandidate();

  registerInheritedRedCandidate();

  registerInfraRedCandidate();
});
