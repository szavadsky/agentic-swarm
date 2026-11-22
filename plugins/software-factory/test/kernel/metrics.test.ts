import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Usage } from "../../src/harness/types.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { Outcome } from "../../src/kernel/types.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { expectDispatch } from "./e2e-helpers.js";
import { rec, script, cause } from "./helpers.js";

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

async function matchesUsageRecordsScriptedRunPart1(
  repo: ReturnType<typeof createTmpRepo>,
) {
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
      "  digest: { harness: fake, model: fake-digest }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  implementer-b: { harness: fake, model: fake-impl-b }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  qa: { harness: fake, model: fake-qa }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  intent: { harness: fake, model: fake-intent }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "limits: { iterations: 1, concurrency: { overall: 1, perSubscription: {}, perModel: {} } }",
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
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");

  return { goalDir, taskDir };
}

async function matchesUsageRecordsScriptedRunPart2(
  repo: ReturnType<typeof createTmpRepo>,
  scope: Awaited<ReturnType<typeof matchesUsageRecordsScriptedRunPart1>>,
) {
  const { goalDir, taskDir } = scope;
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

  const store = createFolderStore(goalDir, undefined, {});
  const records = await store.listRecords();
  const turns = records.filter(
    (r) => r.iteration === 1 && r.endedAt && r.actor === "agent",
  );
  expect(turns).toHaveLength(6);
  const part = (u: Usage | undefined): number =>
    (u?.in ?? 0) +
    (u?.cacheRead ?? 0) +
    (u?.cacheWrite5m ?? 0) +
    (u?.cacheWrite1h ?? 0) +
    (u?.out ?? 0) +
    (u?.reasoningOut ?? 0);

  return { ...scope, store, turns, part };
}

async function matchesUsageRecordsScriptedRunPart3(
  scope: Awaited<ReturnType<typeof matchesUsageRecordsScriptedRunPart2>>,
) {
  const { turns, part, store } = scope;
  const fromRecords = turns.reduce(
    (sum, r) => sum + part(r.usage) + part(r.compactUsage),
    0,
  );
  const costFromRecords = turns.reduce(
    (sum, r) => sum + (r.usage?.costUsd ?? 0) + (r.compactUsage?.costUsd ?? 0),
    0,
  );

  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  expect(metrics.iterations).toHaveLength(1);
  const one = metrics.iterations[0]!;
  expect(one.n).toBe(1);
  expect(one.tokens).toBe(fromRecords);
  // 473 scripted turn tokens plus four recorded compactions (architect,
  // implement, QA, review); the mandatory plan review reports zero usage,
  // and nothing was open, so the plan checker did not turn.
  expect(one.tokens).toBe(34_073);
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
  expect(one.roles.qa).toMatchObject({ turns: 1, tokens: 8_400 });
  expect(one.roles.reviewer).toMatchObject({ turns: 1, tokens: 8_488 });

  return { ...scope, metrics, one };
}

async function matchesUsageRecordsScriptedRunPart4(
  scope: Awaited<ReturnType<typeof matchesUsageRecordsScriptedRunPart3>>,
) {
  const { one, metrics, store } = scope;
  expect(one.architect.launches).toBe(1);
  expect(one.architect.turns).toBe(1);
  expect(one.architect.tokens).toBe(8_510);
  expect(one.architect.costShare).toBeCloseTo(0.1 / 0.43, 10);
  expect(one.architect.tokenShare).toBeCloseTo(8_510 / 34_073, 10);
  expect(one.architect.turnShare).toBeCloseTo(1 / 6, 10);

  expect(metrics.totals.iterations).toBe(1);
  expect(metrics.totals.turns).toBe(6);
  expect(metrics.totals.tokens).toBe(34_073);
  expect(metrics.totals.merged).toEqual(["alpha"]);
  expect(metrics.totals.usage.costUsd).toBeCloseTo(0.43, 10);
  expect(metrics.totals.architect.turns).toBe(1);
  expect(metrics.totals.architect.turnShare).toBeCloseTo(1 / 6, 10);

  const iterationFile = yaml.parse(
    (await store.readFile("iterations/1/metrics.yaml"))!,
  ) as typeof one;
  expect(iterationFile).toEqual(one);
  expect(await store.readFile("mailbox/outbox/metrics.yaml")).toBe(
    "metrics.yaml\n",
  );
}

function registerIterationMetricsPart1(): void {
  it("matches the usage records of a scripted run", async () => {
    const repo = createTmpRepo();
    try {
      const scope1 = await matchesUsageRecordsScriptedRunPart1(repo);
      const scope2 = await matchesUsageRecordsScriptedRunPart2(repo, scope1);
      const scope3 = await matchesUsageRecordsScriptedRunPart3(scope2);
      await matchesUsageRecordsScriptedRunPart4(scope3);
    } finally {
      repo.cleanup();
    }
  }, 60_000);
}

function registerIterationMetricsPart2(): void {
  it("counts plan-review marks in the iteration and in the totals", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-metrics-marks-"),
    );
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();
      const records = [
        rec(1, {
          step: "architect",
          outcome: outcome({
            decision: "continue",
            planReviewMarks: [
              { finding: 1, mark: "helpful" },
              { finding: 2, mark: "unhelpful" },
            ],
          }) as Outcome,
        }),
        rec(2, {
          slug: undefined,
          step: "planreturn",
          outcome: outcome({
            planReviewMarks: [{ finding: 1, mark: "helpful" }],
          }) as Outcome,
        }),
      ];
      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations[0]!.planReviewMarks).toEqual({
        helpful: 2,
        unhelpful: 1,
      });
      expect(metrics.totals.planReviewMarks).toEqual({
        helpful: 2,
        unhelpful: 1,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function noProgressLoopRecords() {
  return [
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
      cause: cause("no-progress: same gate failed twice"),
    }),
    script(5, { step: "merge", slug: "b", ok: true, commit: "abc" }),
  ];
}

async function countsNoProgressLoopIncidentsPart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  const records = noProgressLoopRecords();
  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records,
    humanInterventions: 2,
  });
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  return { store, records, metrics };
}

function countsNoProgressLoopIncidentsPart2(
  scope: Awaited<ReturnType<typeof countsNoProgressLoopIncidentsPart1>>,
) {
  const { metrics } = scope;
  const one = metrics.iterations[0]!;
  expect(one.loopIncidents).toBe(1);
  expect(one.humanInterventions).toBe(2);
  expect(one.parked).toEqual(["a"]);
  expect(one.merged).toEqual(["b"]);
  expect(one.costPerMergedTask).toBeCloseTo(0.22, 10);
  expect(metrics.totals.humanInterventions).toBe(2);
  expect(metrics.totals.loopIncidents).toBe(1);
}

async function countsNoProgressLoopIncidentsPart3(
  scope: Awaited<ReturnType<typeof countsNoProgressLoopIncidentsPart1>>,
) {
  const { store, records } = scope;
  await writeMetrics(store, {
    iteration: 2,
    status: "goal-met",
    records,
    humanInterventions: 1,
  });
  const metrics = yaml.parse(
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
}

function registerIterationMetricsPart3(): void {
  it("counts no-progress loop incidents and preserves steer counts across rebuilds", async () => {
    const repo = createTmpRepo();
    try {
      const digit = path.join(repo.dir, "goals", "demo");
      const store = createFolderStore(digit, undefined, {});
      const scope = await countsNoProgressLoopIncidentsPart1(store);
      countsNoProgressLoopIncidentsPart2(scope);
      await countsNoProgressLoopIncidentsPart3(scope);
    } finally {
      repo.cleanup();
    }
  });
}

describe("iteration metrics", () => {
  registerIterationMetricsPart1();

  registerIterationMetricsPart2();

  registerIterationMetricsPart3();
});
