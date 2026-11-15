import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { Repo } from "../../src/core/git/repo.js";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Usage } from "../../src/harness/types.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { resolveRole } from "../../src/kernel/flow-context.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import {
  type PriceTable,
  priceTableOnly,
  pricedUsage,
} from "../../src/kernel/pricing.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { finishChecks, startChecks } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { rec, script } from "./helpers.js";

const PLAN = `# Milestone 1 — alpha

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

function usage(costUsd: number, tin: number, out: number): Usage {
  return {
    in: tin,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out,
    reasoningOut: 0,
    costUsd,
  };
}

function handled(
  harness: FakeHarness,
  usageValue: Usage,
  effect?: (
    req: { cwd?: string },
    ctx: { writeOutcome(value: unknown): void },
  ) => void,
): FakeHarness {
  return harness.script((req, ctx) => {
    effect?.(req, ctx);
    return fakeTurnResult(req, { usage: usageValue });
  });
}

describe("iteration metrics", () => {
  it("matches the usage records of a scripted run", async () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
      );
      const base = path.basename(repo.dir);
      repo.writeFile(
        ".factory/run.yaml",
        [
          "aliases:",
          "  architect: { harness: fake, model: fake-architect }",
          "  pm: { harness: fake, model: fake-pm }",
          "  implementer: { harness: fake, model: fake-impl }",
          "  reviewer: { harness: fake, model: fake-review }",
          "limits: { iterations: 1, concurrency: 1 }",
          `worktreeRoot: ../${base}-wt`,
          `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
          "",
        ].join("\n"),
      );
      repo.commit("factory config");
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      const taskDir = path.join(goalDir, "tasks");
      fs.mkdirSync(goalDir, { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "intent.md"),
        "# Goal\n\nCreate alpha.\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: bigger\n",
        "utf8",
      );

      const harness = new FakeHarness({ id: "fake" });
      handled(harness, usage(0.1, 100, 10), (req, ctx) => {
        fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
      });
      handled(harness, usage(0.05, 50, 5), (_req, ctx) => {
        fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
      });
      handled(harness, usage(0.2, 200, 20), (req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
      });
      handled(harness, usage(0.08, 80, 8), (_req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha is correct", verdict: "approve" }),
        );
      });

      await expectDispatch(
        3,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        {
          harnesses: { fake: harness },
        },
      );

      const store = createFolderStore(goalDir);
      const records = await store.listRecords();
      const turns = records.filter(
        (r) => r.iteration === 1 && r.endedAt && r.actor === "agent",
      );
      expect(turns).toHaveLength(4);
      const part = (u: Usage | undefined): number =>
        (u?.in ?? 0) +
        (u?.cacheRead ?? 0) +
        (u?.cacheWrite5m ?? 0) +
        (u?.cacheWrite1h ?? 0) +
        (u?.out ?? 0) +
        (u?.reasoningOut ?? 0);
      // Metrics sum each attempt plus the turn's compaction; the fake's single
      // attempt mirrors the turn counters, so usage plus compaction matches it.
      const fromRecords = turns.reduce(
        (sum, r) => sum + part(r.usage) + part(r.compactUsage),
        0,
      );
      const costFromRecords = turns.reduce(
        (sum, r) =>
          sum + (r.usage?.costUsd ?? 0) + (r.compactUsage?.costUsd ?? 0),
        0,
      );

      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations).toHaveLength(1);
      const one = metrics.iterations[0]!;
      expect(one.n).toBe(1);
      expect(one.tokens).toBe(fromRecords);
      // 473 turn tokens plus three recorded compactions (architect, implement, review).
      expect(one.tokens).toBe(25_673);
      expect(one.usage.costUsd).toBeCloseTo(costFromRecords, 10);
      expect(one.usage.costUsd).toBeCloseTo(0.43, 10);
      expect(one.merged).toEqual(["alpha"]);
      expect(one.parked).toEqual([]);
      expect(one.costPerMergedTask).toBeCloseTo(0.43, 10);
      expect(one.loopIncidents).toBe(0);
      expect(one.humanInterventions).toBe(0);

      // Production seam: the commit the flow made returned its diff stats
      // into the implement agent record via settle, and metrics aggregates it.
      const implement = turns.filter((r) => r.step === "implement");
      expect(implement).toHaveLength(1);
      expect(implement[0]!.edits?.files ?? 0).toBeGreaterThanOrEqual(1);
      expect(one.edits).toBeGreaterThanOrEqual(1);
      expect(one.roles.implementer!.edits).toBeGreaterThanOrEqual(1);
      expect(one.commitWallMs).toBeGreaterThan(0);
      expect(one.roles.architect).toMatchObject({ turns: 1, tokens: 8_510 });
      expect(one.roles.pm).toMatchObject({ turns: 1, tokens: 55 });
      expect(one.roles.implementer).toMatchObject({ turns: 1, tokens: 8_620 });
      expect(one.roles.reviewer).toMatchObject({ turns: 1, tokens: 8_488 });

      expect(one.architect.launches).toBe(1);
      expect(one.architect.tokens).toBe(8_510);
      expect(one.architect.costShare).toBeCloseTo(0.1 / 0.43, 10);
      expect(one.architect.tokenShare).toBeCloseTo(8_510 / 25_673, 10);

      expect(metrics.totals.iterations).toBe(1);
      expect(metrics.totals.turns).toBe(4);
      expect(metrics.totals.tokens).toBe(25_673);
      expect(metrics.totals.merged).toEqual(["alpha"]);
      expect(metrics.totals.usage.costUsd).toBeCloseTo(0.43, 10);

      const iterationFile = yaml.parse(
        (await store.readFile("iterations/1/metrics.yaml"))!,
      ) as typeof one;
      expect(iterationFile).toEqual(one);
      expect(await store.readFile("mailbox/outbox/metrics.yaml")).toBe(
        await store.readFile("metrics.yaml"),
      );
    } finally {
      repo.cleanup();
    }
  }, 60_000);

  it("counts no-progress loop incidents and preserves steer counts across rebuilds", async () => {
    const repo = createTmpRepo();
    try {
      const digit = path.join(repo.dir, "goals", "demo");
      const store = createFolderStore(digit);
      await store.ensureLayout();
      const records = [
        rec(1, { step: "architect", usage: usage(0.02, 20, 2) }),
        rec(2, { step: "implement", slug: "a", usage: usage(0.1, 100, 10) }),
        rec(3, {
          step: "implement",
          slug: "a",
          round: 2,
          usage: usage(0.1, 100, 10),
        }),
        script(4, {
          step: "park",
          slug: "a",
          ok: true,
          cause: "no-progress: same gate failed twice",
        }),
        script(5, { step: "merge", slug: "b", ok: true, commit: "abc" }),
      ];

      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
        humanInterventions: 2,
      });
      let metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations[0]!.loopIncidents).toBe(1);
      expect(metrics.iterations[0]!.humanInterventions).toBe(2);
      expect(metrics.iterations[0]!.parked).toEqual(["a"]);
      expect(metrics.iterations[0]!.merged).toEqual(["b"]);
      expect(metrics.iterations[0]!.costPerMergedTask).toBeCloseTo(0.22, 10);
      expect(metrics.totals.humanInterventions).toBe(2);
      expect(metrics.totals.loopIncidents).toBe(1);

      await writeMetrics(store, {
        iteration: 2,
        status: "goal-met",
        records,
        humanInterventions: 1,
      });
      metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(
        metrics.iterations.map((i) => [i.n, i.status, i.humanInterventions]),
      ).toEqual([
        [1, "in-progress", 2],
        [2, "goal-met", 1],
      ]);
      expect(metrics.totals.humanInterventions).toBe(3);
      expect(metrics.totals.loopIncidents).toBe(1);
      expect(metrics.totals.iterations).toBe(2);
    } finally {
      repo.cleanup();
    }
  });
  it("lists quarantined task files per iteration and in totals", async () => {
    const repo = createTmpRepo();
    try {
      const store = createFolderStore(path.join(repo.dir, "goals", "demo"));
      await store.ensureLayout();
      const records = [
        script(1, {
          iteration: 1,
          slug: "broken",
          step: "task-quarantine",
          ok: false,
          cause:
            'task file "broken.md" quarantined at tasks/quarantine/broken.md: no frontmatter',
        }),
        script(2, {
          iteration: 2,
          slug: "torn",
          step: "task-quarantine",
          ok: false,
          cause:
            'task file "torn.md" is unreadable; left in tasks/ because its slug already has a terminal record (merged): torn',
        }),
      ];
      await writeMetrics(store, {
        iteration: 2,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations.map((i) => [i.n, i.quarantined])).toEqual([
        [1, ["broken"]],
        [2, ["torn"]],
      ]);
      expect(metrics.totals.quarantined).toEqual(["broken", "torn"]);
    } finally {
      repo.cleanup();
    }
  });
});

const PRICES: PriceTable = {
  "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
};

function priced(light: Partial<Usage> = {}): Usage {
  return {
    in: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
    ...light,
  };
}

describe("record cost truth", () => {
  it("keeps the harness figure and adds the list-price equivalent", () => {
    // A subscription-style zero is repriced for cost but stays visible as the
    // harness figure; the list column always shows the table price.
    const paid = pricedUsage(
      priced({ costUsd: 0, in: 1_000_000 }),
      "paid/one",
      PRICES,
    );
    expect(paid.costKnown).toBe(true);
    expect(paid.usage.costUsd).toBeCloseTo(4, 10);
    expect(paid.usage.listCostUsd).toBeCloseTo(4, 10);
    expect(paid.usage.harnessCostUsd).toBe(0);

    // A non-zero harness figure wins for cost; the list still shows the table.
    const discounted = pricedUsage(
      priced({ costUsd: 0.05, in: 1_000_000 }),
      "paid/one",
      PRICES,
    );
    expect(discounted.usage.costUsd).toBe(0.05);
    expect(discounted.usage.listCostUsd).toBeCloseTo(4, 10);
    expect(discounted.usage.harnessCostUsd).toBe(0.05);

    // Repricing is idempotent: the harness figure is not lost to the priced cost.
    const again = pricedUsage(paid.usage, "paid/one", PRICES);
    expect(again.usage.costUsd).toBeCloseTo(4, 10);
    expect(again.usage.harnessCostUsd).toBe(0);
  });

  it("prices a resumed unsplit prefix at the cached rate", () => {
    const fresh = priceTableOnly(priced({ in: 1_000_000 }), "paid/one", PRICES);
    const resumed = priceTableOnly(
      priced({ in: 1_000_000 }),
      "paid/one",
      PRICES,
      { cachedPrefix: true },
    );
    expect(fresh).toBeCloseTo(4, 10);
    expect(resumed).toBeCloseTo(0.2, 10);
    // A split cache already names its cached prefix; the flag changes nothing.
    const split = priceTableOnly(
      priced({ in: 500_000, cacheRead: 500_000 }),
      "paid/one",
      PRICES,
      { cachedPrefix: true },
    );
    expect(split).toBeCloseTo(2.1, 10);
  });

  it("aggregates per-model cost, work, gate time and operator acts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-models-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      const check = (name: string) => ({
        name,
        ok: true,
        summary: "pass",
        output: "ok",
        fingerprint: name,
      });
      const records = [
        rec(1, {
          step: "architect",
          slug: undefined,
          model: { id: "paid/one" },
          usage: priced({ in: 1_000_000 }),
          edits: { files: 2, added: 10, removed: 5 },
          promptBytes: 100,
        }),
        rec(2, {
          slug: "a",
          model: { id: "paid/one" },
          usage: priced({ costUsd: 0, in: 1_000_000 }),
          edits: { files: 1, added: 20, removed: 0 },
        }),
        rec(3, {
          slug: "a",
          step: "review",
          model: { id: "mystery/model" },
          usage: priced({ in: 1_000_000 }),
        }),
        rec(4, {
          slug: "b",
          model: { id: "paid/one" },
          cachedPrefix: true,
          usage: priced({ in: 1_000_000 }),
        }),
        script(5, {
          slug: "b",
          step: "checks",
          ok: true,
          checks: [check("typecheck"), check("tests")],
          testRuns: 2,
          wallMs: 5000,
          startedAt: new Date(0).toISOString(),
          endedAt: new Date(5000).toISOString(),
        }),
        script(6, {
          slug: "a",
          step: "commit",
          ok: true,
          commit: "abc",
          tree: "def",
          wallMs: 100,
        }),
        script(7, { slug: "a", step: "merge", ok: true }),
        script(8, {
          slug: "wt-a",
          step: "containment",
          ok: true,
          cause: "outside-change: files changed in /repo",
        }),
        script(9, {
          slug: "b",
          step: "merge",
          ok: false,
          cause:
            "integration moved: expected aaa, found bbb; an outside commit is on the integration branch and this merge left it untouched",
        }),
      ];
      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
        prices: PRICES,
        humanInterventions: 2,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations[0]!;

      // Per-model cost: architect 4 + implement 4 (repriced zero) + resumed 0.2.
      expect(one.models["paid/one"]!.turns).toBe(3);
      expect(one.models["paid/one"]!.usage.costUsd).toBeCloseTo(8.2, 10);
      expect(one.models["paid/one"]!.usage.listCostUsd).toBeCloseTo(8.2, 10);
      expect(one.models["paid/one"]!.usage.harnessCostUsd).toBe(0);
      expect(one.models["paid/one"]!.unpricedTurns).toBe(0);
      expect(one.models["mystery/model"]!.turns).toBe(1);
      expect(one.models["mystery/model"]!.unpricedTurns).toBe(1);

      // Work: edits from agent commits, test runs attributed to the b turn.
      expect(one.models["paid/one"]!.edits).toBe(3);
      expect(one.models["paid/one"]!.testRuns).toBe(2);
      expect(one.edits).toBe(3);
      expect(one.testRuns).toBe(2);
      expect(one.gateRuns).toBe(1);

      // Gate/commit wall comes from the script stamps, not zero-length windows.
      expect(one.gateWallMs).toBe(5000);
      expect(one.commitWallMs).toBe(100);

      // Partial per-merged cost: the priced numerator covers priced turns only.
      expect(one.unpricedTurns).toBe(1);
      expect(one.costPerMergedTask).toBeCloseTo(8.2, 10);
      expect(one.listCostPerMergedTask).toBeCloseTo(8.2, 10);

      // Operator acts: steers plus the two outside records.
      expect(one.humanInterventions).toBe(2);
      expect(one.operatorActs).toBe(4);
      expect(metrics.totals.operatorActs).toBe(4);
      expect(metrics.totals.models["paid/one"]!.turns).toBe(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stamps gate wall time around the run", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-gate-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      const gate = await startChecks(store, {
        iteration: 1,
        slug: "a",
        round: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      const done = await finishChecks(gate, [
        {
          name: "tests",
          ok: true,
          summary: "pass",
          output: "",
          fingerprint: "t",
        },
      ]);
      expect(done.testRuns).toBe(1);
      expect(done.wallMs).toBeGreaterThanOrEqual(10);
      expect(
        Date.parse(done.endedAt!) - Date.parse(done.startedAt),
      ).toBeGreaterThanOrEqual(10);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes priced cost and list price into every agent record", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-priced-"));
    const fake = new FakeHarness({ id: "fake" });
    const process: ProcessConfig = {
      flows: {},
      roles: { implementer: { prompt: "implementer" } },
      itemTurns: 8,
    };
    const repo: RepoConfig = {
      baseBranch: "main",
      artifactRoot: ".factory/artifacts",
      setup: [],
      gates: [],
    };
    const run: RunConfig = {
      aliases: { implementer: { harness: "fake", model: "paid/one" } },
      prices: PRICES,
      limits: { concurrency: 1, perHarness: {}, iterations: 1 },
      sessions: { dir: "", keepRuns: 1, retention: "short" },
    };
    const runtime: KernelRuntime = {
      paths: {
        repoRoot: root,
        goalDir: path.join(root, "goal"),
        goalCheckout: root,
        integrationBranch: "factory/g",
        worktreeRoot: root,
        sessionsDir: path.join(root, "sessions"),
      },
      configs: { repo, process, run },
      repo: new Repo({ mainRoot: root, worktreeRoot: root }),
      store: createFolderStore(path.join(root, "goal")),
      harnesses: new Map([["fake", fake]]),
      prompts: loadPrompts(process, root),
      limits: {
        itemTurns: 8,
        flows: {},
        iterations: 1,
        concurrency: 1,
        perHarness: {},
      },
    };
    try {
      await runtime.store.ensureLayout();
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "ok",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req, {
          usage: { in: 1_000_000, costUsd: 0 },
          model: { id: "paid/one" },
        });
      });
      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: {
          task_path: "tasks/a.md",
          front_pack: "none",
          worktree: root,
          resume_note: "",
          setup_command: "true",
          gate_commands: "true",
          baseline_checks: "none",
          findings: "none",
        },
        expectation: "any",
      });
      expect(result.record.model?.id).toBe("paid/one");
      expect(result.record.usage?.costUsd).toBeCloseTo(4, 10);
      expect(result.record.usage?.listCostUsd).toBeCloseTo(4, 10);
      expect(result.record.usage?.harnessCostUsd).toBe(0);
      expect(result.record.attempts?.[0]?.usage.costUsd).toBeCloseTo(4, 10);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
