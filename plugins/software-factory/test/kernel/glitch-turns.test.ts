/**
 * A zero-usage, zero-output turn is a technical glitch: a launch class that is
 * retried or failed over, never waste, never a reminder.
 */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { reportsUsage, zeroUsage } from "../../src/harness/usage.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
  StepRecord,
} from "../../src/kernel/types.js";
import {
  TEST_ARCHITECTURE,
  TEST_BOUNDARY,
  cause,
  rec,
  script,
  task,
} from "./helpers.js";

function runtimeForPart1() {
  const process: ProcessConfig = {
    taskTypes: {},
    flows: {},
    boundary: TEST_BOUNDARY,
    architecture: TEST_ARCHITECTURE,
    reminders: 1,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: {
      architect: { harness: "fake", model: "fake-architect" },
      pm: { harness: "fake", model: "fake-pm" },
      implementer: { harness: "fake", model: "fake-implementer" },
      reviewer: { harness: "fake", model: "fake-reviewer" },
      steward: { harness: "fake", model: "fake-steward" },
      "plan-checker": { harness: "fake", model: "fake-check" },
      intent: { harness: "fake", model: "fake-intent" },
      "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      front: { harness: "fake", model: "fake-front" },
    },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 1,
      planCheckRounds: 2,
    },
    sessions: { dir: "", keepRuns: 1, retention: "short" },
  };
  return { process, repo, run };
}

function runtimeForPart2(
  root: string,
  fake: FakeHarness,
  scope: ReturnType<typeof runtimeForPart1>,
): KernelRuntime {
  const { repo, process, run } = scope;
  return {
    paths: {
      repoRoot: root,
      goalDir: path.join(root, "goal"),
      goalCheckout: root,
      integrationBranch: "factory/g",
      worktreeRoot: root,
      sessionsDir: path.join(root, "sessions"),
      artifacts: { backend: "folder", root },
    },
    configs: { repo, process, run },
    repo: new Repo({ mainRoot: root, worktreeRoot: root }),
    store: createFolderStore(path.join(root, "goal"), undefined, {}),
    harnesses: new Map([["fake", fake]]),
    prompts: loadPrompts(process, root, {}),
    limits: {
      flows: {},
      iterations: 1,
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      planCheckRounds: 2,
    },
    exhaustedPools: new Map(),
    // Hermetic prices: the test-local cache, never the network.
    priceSource: {
      cachePath: path.join(root, "price-cache.json"),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
    },
  };
}

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  return runtimeForPart2(root, fake, runtimeForPart1());
}

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-glitch-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

const implementerVars = {
  task_path: "/g/tasks/a.md",
  report_path: "",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  base_gates: "not recorded",
  findings: "",
};

/** The stop the omp adapter reports for a turn that consumed nothing. */
const GLITCH_STOP = {
  kind: "infra",
  cause: "glitch",
  details: "zero-usage, no-output",
} as const;

function glitchTarget(runtime: KernelRuntime, fake: FakeHarness) {
  return {
    ...resolveTurn(runtime, "implementer", "implementer"),
    tiers: [
      { harness: fake, model: { id: "fake-a" } },
      { harness: fake, model: { id: "fake-b" } },
    ],
  };
}

/** A glitch on every tier: failed over, then halted with no usage or output. */
async function runGlitchTurn(
  root: string,
  fake: FakeHarness,
  runtime: KernelRuntime,
) {
  fake.script((req) => fakeTurnResult(req, { stop: GLITCH_STOP }), {
    fallback: true,
  });
  return runAgentTurn(runtime, {
    target: glitchTarget(runtime, fake),
    cwd: root,
    meta: { iteration: 1, slug: "glitchy", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
}

/** The park a repeated glitch ends: infra, naming the turn it ended. */
function glitchPark(seq: number, round: number): StepRecord {
  return script(seq, {
    slug: "glitchy",
    step: "park",
    ok: true,
    cause: cause(`infra-repeat: implement r${round} zero-usage, no-output`),
  });
}

async function metricsOf(
  runtime: KernelRuntime,
  records: StepRecord[],
): Promise<GoalMetrics> {
  await writeMetrics(runtime.store, {
    iteration: 1,
    status: "in-progress",
    records,
  });
  return yaml.parse(
    (await runtime.store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
}

function registerGlitchTurnPart(): void {
  it("counts a zero-usage, zero-output turn as glitch, not waste, and spends no reminder", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const turn = await runGlitchTurn(root, fake, runtime);
      // The tier walk retried the glitch; the reminder budget stayed untouched.
      expect(fake.calls).toHaveLength(2);
      expect(turn.record.repairFindings).toBeUndefined();
      expect(turn.record.launchKind).toBe("glitch");
      expect(reportsUsage(turn.record.usage!)).toBe(false);

      const metrics = await metricsOf(runtime, [
        turn.record,
        glitchPark(turn.record.seq + 1, turn.record.round),
      ]);
      const one = metrics.iterations[0]!;

      // Glitch is a launch class, never a waste reason: neither the turn nor
      // the park that ended it may reach the waste ledger.
      expect(one.waste.turns).toBe(0);
      expect(one.waste.counts.structureInfra).toBe(0);
      expect(one.waste.entries).toEqual([]);
      expect(one.roles.implementer!.launches.glitch).toBe(1);
      expect(metrics.totals.aliases.implementer!.launches.glitch).toBe(1);
      // No reminder ran; the tier walk is still a counted fallback hop.
      expect(one.incidents.outcomeRepairs).toBe(0);
      expect(one.incidents.fallbackHops).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

/** One tier only: nothing to fail over to, so no fallback hop can excuse it. */
async function runSingleTierTurn(
  root: string,
  fake: FakeHarness,
  runtime: KernelRuntime,
  stop: StepRecord["stop"],
  slug: string,
) {
  fake.script((req) => fakeTurnResult(req, { stop }));
  return runAgentTurn(runtime, {
    target: {
      ...resolveTurn(runtime, "implementer", "implementer"),
      tiers: [{ harness: fake, model: { id: "fake-a" } }],
    },
    cwd: root,
    meta: { iteration: 1, slug, step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
}

/** Both classes come from the one predicate, on a turn with no fallback hop. */
function registerSingleTierGlitchParts(): void {
  it("keeps a single-tier zero-usage glitch a glitch with no waste", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const turn = await runSingleTierTurn(
        root,
        fake,
        runtime,
        GLITCH_STOP,
        "glitchy",
      );
      expect(fake.calls).toHaveLength(1);
      expect(turn.record.launchKind).toBe("glitch");

      const metrics = await metricsOf(runtime, [turn.record]);
      const one = metrics.iterations[0]!;
      expect(one.waste.turns).toBe(0);
      expect(one.waste.counts.structureInfra).toBe(0);
      expect(one.waste.entries).toEqual([]);
      expect(one.roles.implementer!.launches.glitch).toBe(1);
      expect(one.incidents.fallbackHops).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("counts a genuine crash as waste and stores no glitch kind", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const turn = await runSingleTierTurn(
        root,
        fake,
        runtime,
        { kind: "infra", cause: "crash", details: "exit 1, signal none" },
        "crashed",
      );
      // No tier to fail over to: the crash ends the turn itself, so it is no
      // fallback hop that could excuse the launch as a glitch.
      expect(fake.calls).toHaveLength(1);
      expect(turn.record.stop).toMatchObject({
        kind: "infra",
        cause: "crash",
      });
      expect(reportsUsage(turn.record.usage!)).toBe(false);
      expect(turn.record.launchKind).toBeUndefined();

      const metrics = await metricsOf(runtime, [turn.record]);
      const one = metrics.iterations[0]!;
      expect(one.waste.turns).toBe(1);
      expect(one.waste.counts.structureInfra).toBe(1);
      expect(one.waste.entries.map((entry) => entry.reason)).toEqual([
        "structureInfra",
      ]);
      expect(one.roles.implementer!.launches.glitch).toBe(0);
      expect(metrics.totals.aliases.implementer!.launches.glitch).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerGlitchBoundaryPart(): void {
  it("keeps a genuine infra failure and an outcome-bearing zero-usage turn out of the glitch class", async () => {
    const { root, runtime } = await setup();
    try {
      const genuine = rec(1, {
        slug: "genuine",
        step: "implement",
        alias: "implementer",
        usage: zeroUsage(),
        stop: { kind: "infra", cause: "crash", details: "exit 1, signal none" },
      });
      const delivered = rec(2, {
        slug: "delivered",
        step: "implement",
        alias: "implementer",
        usage: zeroUsage(),
        outcome: {
          status: "failed",
          summary: "wrote the outcome but delivered nothing",
          concerns: [],
          forward: [],
        },
      });
      const metrics = await metricsOf(runtime, [genuine, delivered]);
      const one = metrics.iterations[0]!;

      // Genuine infra keeps its own classification; a delivered outcome is
      // judged by that outcome, never excused as a glitch.
      expect(one.waste.counts.structureInfra).toBe(1);
      expect(one.waste.counts.implementerFailure).toBe(1);
      expect(one.waste.entries.map((entry) => entry.reason)).toEqual([
        "structureInfra",
        "implementerFailure",
      ]);
      expect(one.waste.turns).toBe(2);
      expect(one.aliases.implementer!.launches.glitch).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("glitch turns", () => {
  registerGlitchTurnPart();

  registerSingleTierGlitchParts();

  registerGlitchBoundaryPart();
});

const reviewChanges = (seq: number, round: number): StepRecord =>
  rec(seq, {
    step: "review",
    round,
    tree: `tree-${round}`,
    outcome: {
      status: "done",
      summary: `1. finding ${round}`,
      concerns: [],
      forward: [],
      verdict: "changes",
    },
  });

const fallbackAttempts: StepRecord["attempts"] = [
  {
    model: { id: "fake-a" },
    stop: { kind: "infra", cause: "quota", details: "quota spent" },
    usage: zeroUsage(),
    harness: "first",
  },
  {
    model: { id: "fake-b" },
    stop: { kind: "done" },
    usage: zeroUsage(),
    harness: "second",
  },
];

function registerFallbackLaunchPart(): void {
  it("keeps a fallback launch out of the review's change-request budget", () => {
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const records = [
      reviewChanges(1, 1),
      rec(2, {
        step: "review",
        round: 2,
        tree: "tree-2",
        attempts: fallbackAttempts,
        outcome: {
          status: "done",
          summary: "1. finding 2",
          concerns: [],
          forward: [],
          verdict: "changes",
        },
      }),
      reviewChanges(3, 3),
    ];
    const reduction = reduceTask(task("a"), records, flow);
    expect(reduction.phase).toBe("implement");
    expect(reduction.launches.review).toEqual({
      glitches: 1,
      changeRequests: 2,
      failures: 0,
    });

    const lastCall = reduceTask(
      task("a"),
      [...records, reviewChanges(4, 4)],
      flow,
    );
    expect(lastCall.phase).toBe("parked");
    expect(lastCall.park?.kind).toBe("invalid-outcome");
  });
}

function registerGlitchFailureLaunchPart(): void {
  it("counts glitches and failures apart from change requests", () => {
    const reduction = reduceTask(
      task("a"),
      [
        rec(1, {
          step: "review",
          round: 1,
          usage: zeroUsage(),
          stop: {
            kind: "infra",
            cause: "glitch",
            details: "zero-usage, no-output",
          },
        }),
        rec(2, {
          step: "review",
          round: 1,
          outcome: {
            status: "failed",
            summary: "the review could not run",
            concerns: [],
            forward: [],
          },
        }),
      ],
      DEFAULT_FLOWS["implement-review"]!,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.launches.review).toEqual({
      glitches: 1,
      changeRequests: 0,
      failures: 1,
    });
  });
}

describe("per-agent launch counts", () => {
  registerFallbackLaunchPart();
  registerGlitchFailureLaunchPart();
});
