import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import {
  contextDataRelPath,
  contextPackRelPath,
  renderContextData,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { writeMetrics } from "../../src/kernel/metrics.js";
import {
  readWasteMetrics,
  type WasteSpikeMetrics,
  wasteSpikeProposals,
} from "../../src/kernel/metrics/recurring.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { emptyWasteCounts } from "../../src/kernel/waste.js";
import type { WasteCounts } from "../../src/kernel/waste.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

/** Metrics with the given per-iteration waste counts and every other reason zero. */
function metricsOf(
  ...iterations: { n: number; counts: Partial<WasteCounts> }[]
): WasteSpikeMetrics {
  return {
    iterations: iterations.map((iteration) => ({
      n: iteration.n,
      waste: { counts: { ...emptyWasteCounts(), ...iteration.counts } },
    })),
  };
}

/** An implement turn that landed nothing: the implementer-failure waste. */
function failedTurn(iteration: number, seq: number, slug: string): StepRecord {
  return rec(seq, {
    iteration,
    slug,
    step: "implement",
    outcome: outcome({ status: "failed", summary: "landed nothing" }),
  });
}

/** An implement turn an infra stop cut off: the structure-infra waste. */
function infraTurn(iteration: number, seq: number, slug: string): StepRecord {
  return rec(seq, {
    iteration,
    slug,
    step: "implement",
    stop: { kind: "infra", cause: "network" },
  });
}

function registerProposalCounting(): void {
  describe("waste spike proposals", () => {
    it("proposes nothing below the threshold", () => {
      const metrics = metricsOf({
        n: 1,
        counts: { implementerFailure: 1 },
      });
      expect(wasteSpikeProposals(metrics, 2)).toEqual([]);
    });

    it("keeps distinct causes apart", () => {
      const metrics = metricsOf({
        n: 1,
        counts: { implementerFailure: 1, structureInfra: 1 },
      });
      expect(wasteSpikeProposals(metrics, 2)).toEqual([]);
    });

    it("counts one cause across iterations, not the latest only", () => {
      const metrics = metricsOf(
        { n: 1, counts: { implementerFailure: 1 } },
        { n: 2, counts: { implementerFailure: 1 } },
      );
      expect(wasteSpikeProposals(metrics, 2)).toEqual([
        {
          reason: "implementerFailure",
          label: "complete implementer failure",
          count: 2,
          iterations: [1, 2],
          threshold: 2,
        },
      ]);
    });

    it("yields one entry for a cause above the threshold", () => {
      const metrics = metricsOf({
        n: 1,
        counts: { implementerFailure: 3 },
      });
      expect(wasteSpikeProposals(metrics, 2)).toHaveLength(1);
    });

    it("proposes nothing without metrics", () => {
      expect(wasteSpikeProposals(undefined, 2)).toEqual([]);
    });
  });
}

/** A fresh goal store, removed after one metrics-read case. */
async function withMetricsStore(
  run: (store: ReturnType<typeof createFolderStore>) => Promise<void>,
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-waste-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  try {
    await store.ensureLayout();
    await run(store);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function registerMetricsRead(): void {
  describe("waste spike proposals from metrics.yaml", () => {
    it("reads the same cause summed across the written iterations", async () => {
      await withMetricsStore(async (store) => {
        await writeMetrics(store, {
          iteration: 2,
          status: "in-progress",
          records: [
            failedTurn(1, 1, "alpha"),
            failedTurn(1, 2, "beta"),
            infraTurn(1, 3, "gamma"),
            failedTurn(2, 4, "delta"),
            failedTurn(2, 5, "epsilon"),
            infraTurn(2, 6, "zeta"),
          ],
        });
        const metrics = await readWasteMetrics(store);
        expect(metrics).toBeDefined();
        const proposals = wasteSpikeProposals(metrics, 3);
        expect(proposals).toHaveLength(1);
        expect(proposals[0]).toMatchObject({
          reason: "implementerFailure",
          count: 4,
          iterations: [1, 2],
          threshold: 3,
        });
        expect(wasteSpikeProposals(metrics, 5)).toEqual([]);
      });
    });

    it("returns undefined before any metrics write", async () => {
      await withMetricsStore(async (store) => {
        expect(await readWasteMetrics(store)).toBeUndefined();
      });
    });

    it("reads a metrics file that is not metrics as none", async () => {
      await withMetricsStore(async (store) => {
        await store.writeFile("metrics.yaml", "notes: not metrics\n");
        expect(await readWasteMetrics(store)).toBeUndefined();
      });
    });
  });
}

function registerMetricsDegrade(): void {
  describe("waste spike proposals from invalid metrics.yaml", () => {
    it("reads malformed or empty YAML as none", async () => {
      await withMetricsStore(async (store) => {
        await store.writeFile("metrics.yaml", "iterations: [unterminated\n");
        expect(await readWasteMetrics(store)).toBeUndefined();
        await store.writeFile("metrics.yaml", "");
        expect(await readWasteMetrics(store)).toBeUndefined();
      });
    });
    it("reads a null iteration as none", async () => {
      await withMetricsStore(async (store) => {
        await store.writeFile("metrics.yaml", "iterations:\n  - null\n");
        expect(await readWasteMetrics(store)).toBeUndefined();
      });
    });

    it("reads an iteration without numeric n or counts as none", async () => {
      await withMetricsStore(async (store) => {
        await store.writeFile(
          "metrics.yaml",
          "iterations:\n  - waste:\n      counts:\n        implementerFailure: 3\n",
        );
        expect(await readWasteMetrics(store)).toBeUndefined();
        await store.writeFile(
          "metrics.yaml",
          "iterations:\n  - n: 1\n    waste:\n      counts:\n        implementerFailure: many\n",
        );
        expect(await readWasteMetrics(store)).toBeUndefined();
      });
    });

    it("reads an iteration that omits waste", async () => {
      await withMetricsStore(async (store) => {
        await store.writeFile("metrics.yaml", "iterations:\n  - n: 7\n");
        expect(await readWasteMetrics(store)).toEqual({
          iterations: [{ n: 7 }],
        });
      });
    });
  });
}

/** A pack input with one task and no other sections, for render assertions. */
function packInput(proposals: ReturnType<typeof wasteSpikeProposals>) {
  const tasks = [task("alpha")];
  const records: StepRecord[] = [];
  return {
    goal: "demo",
    iteration: 3,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks,
    state: derive(tasks, records),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [],
    spikeProposals: proposals,
  };
}

function registerPackRendering(): void {
  describe("spike proposals in the pack", () => {
    it("renders one line per cause and carries them as data", () => {
      const proposals = [
        {
          reason: "implementerFailure" as const,
          label: "complete implementer failure",
          count: 4,
          iterations: [1, 2],
          threshold: 3,
        },
        {
          reason: "structureInfra" as const,
          label: "structure: infra",
          count: 1,
          iterations: [2],
          threshold: 1,
        },
      ];
      const input = packInput(proposals);
      const pack = renderContextPack(input);
      expect(pack).toContain(
        "## Spike proposals (recurring waste at the configured threshold)",
      );
      expect(pack).toContain(
        "- complete implementer failure: 4 wasted turns in iterations 1, 2 (threshold 3)",
      );
      expect(pack).toContain(
        "- structure: infra: 1 wasted turn in iteration 2 (threshold 1)",
      );
      expect(pack).toContain("never a task");
      const data = JSON.parse(renderContextData(input)) as {
        spikeProposals: unknown[];
      };
      expect(data.spikeProposals).toEqual(proposals);
    });

    it("renders no section without proposals", () => {
      const pack = renderContextPack(packInput([]));
      expect(pack).not.toContain("## Spike proposals");
    });
  });
}

async function seedWasteMetrics(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
  await writeMetrics(runtime.store, {
    iteration: 2,
    status: "in-progress",
    records: [
      failedTurn(1, 1, "alpha"),
      failedTurn(1, 2, "beta"),
      infraTurn(1, 3, "gamma"),
      failedTurn(2, 4, "delta"),
      failedTurn(2, 5, "epsilon"),
      infraTurn(2, 6, "zeta"),
    ],
  });
}

function scriptBoundaryFollowThrough(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): void {
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "\n## architect edit\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function packAtThreshold(
  opts: { threshold?: number; metricsText?: string } = {},
) {
  const { repo, goalDir, goal } = setupFlowRepo(
    opts.threshold === undefined
      ? {}
      : { process: { wasteSpikeThreshold: opts.threshold } },
  );
  try {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    await seedWasteMetrics(runtime);
    if (opts.metricsText !== undefined) {
      fs.writeFileSync(path.join(goalDir, "metrics.yaml"), opts.metricsText);
    }
    scriptBoundaryFollowThrough(harness, runtime);

    const boundary = await runBoundary(runtime, {
      relaunch: false,
      iteration: 2,
    });
    expect(boundary.decision).toBe("continue");
    const data = JSON.parse(
      fs.readFileSync(path.join(goalDir, contextDataRelPath(2)), "utf8"),
    ) as { spikeProposals: unknown[] };
    return {
      pack: fs.readFileSync(path.join(goalDir, contextPackRelPath(2)), "utf8"),
      data: data.spikeProposals,
      // The entry is a proposal: the boundary created no task from it.
      tasks: await runtime.store.listTasks(),
    };
  } finally {
    cleanupFlowRepo(repo);
  }
}

function registerNextPack(): void {
  describe("the next pack", () => {
    it("carries a cause that reaches the configured threshold", async () => {
      const { pack, data, tasks } = await packAtThreshold({ threshold: 3 });
      expect(pack).toContain("## Spike proposals");
      expect(pack).toContain(
        "- complete implementer failure: 4 wasted turns in iterations 1, 2 (threshold 3)",
      );
      expect(pack).not.toContain("structure: infra: 2");
      expect(tasks).toHaveLength(0);
      expect(data).toHaveLength(1);
    });

    it("keeps a cause below the configured threshold out", async () => {
      const { pack, data } = await packAtThreshold({ threshold: 5 });
      expect(pack).not.toContain("## Spike proposals");
      expect(data).toHaveLength(0);
    });

    it("falls back to the default threshold when the config is silent", async () => {
      const { pack } = await packAtThreshold();
      expect(pack).toContain("## Spike proposals");
      expect(pack).toContain("(threshold 2)");
    });

    it("degrades to no spike proposals when metrics.yaml is corrupt", async () => {
      const { pack, data } = await packAtThreshold({
        threshold: 3,
        metricsText: "notes: not metrics\n",
      });
      expect(pack).not.toContain("## Spike proposals");
      expect(data).toHaveLength(0);
    });
  });
}

function registerWasteSpikeProposals(): void {
  registerProposalCounting();
  registerMetricsRead();
  registerMetricsDegrade();
  registerPackRendering();
  registerNextPack();
}

registerWasteSpikeProposals();
