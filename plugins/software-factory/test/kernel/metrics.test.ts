import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { dispatch } from "../../src/cli/index.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeMetrics, type GoalMetrics } from "../../src/kernel/metrics.js";
import { rec, script } from "./helpers.js";
import type { Usage } from "../../src/harness/types.js";

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
  effect?: (req: { cwd?: string }, ctx: { writeOutcome(value: unknown): void }) => void
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
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n"
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
        ].join("\n")
      );
      repo.commit("factory config");
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      const taskDir = path.join(goalDir, "tasks");
      fs.mkdirSync(goalDir, { recursive: true });
      fs.writeFileSync(path.join(goalDir, "intent.md"), "# Goal\n\nCreate alpha.\n", "utf8");
      fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");

      const harness = new FakeHarness({ id: "fake" });
      handled(harness, usage(0.1, 100, 10), (req, ctx) => {
        fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
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
        ctx.writeOutcome(outcome({ summary: "alpha is correct", verdict: "approve" }));
      });

      const code = await dispatch(["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"], {
        harnesses: { fake: harness },
      });
      expect(code).toBe(3);

      const store = createFolderStore(goalDir);
      const records = await store.listRecords();
      const turns = records.filter((r) => r.iteration === 1 && r.endedAt && r.actor === "agent");
      expect(turns).toHaveLength(4);
      const fromRecords = turns.reduce(
        (sum, r) => sum + (r.usage?.in ?? 0) + (r.usage?.out ?? 0),
        0
      );
      const costFromRecords = turns.reduce((sum, r) => sum + (r.usage?.costUsd ?? 0), 0);

      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      expect(metrics.iterations).toHaveLength(1);
      const one = metrics.iterations[0]!;
      expect(one.n).toBe(1);
      expect(one.turns).toBe(4);
      expect(one.tokens).toBe(fromRecords);
      expect(one.tokens).toBe(473);
      expect(one.usage.costUsd).toBeCloseTo(costFromRecords, 10);
      expect(one.usage.costUsd).toBeCloseTo(0.43, 10);
      expect(one.merged).toEqual(["alpha"]);
      expect(one.parked).toEqual([]);
      expect(one.costPerMergedTask).toBeCloseTo(0.43, 10);
      expect(one.loopIncidents).toBe(0);
      expect(one.humanInterventions).toBe(0);

      expect(one.roles.architect).toMatchObject({ turns: 1, tokens: 110 });
      expect(one.roles.pm).toMatchObject({ turns: 1, tokens: 55 });
      expect(one.roles.implementer).toMatchObject({ turns: 1, tokens: 220 });
      expect(one.roles.reviewer).toMatchObject({ turns: 1, tokens: 88 });

      expect(one.architect.launches).toBe(1);
      expect(one.architect.tokens).toBe(110);
      expect(one.architect.costShare).toBeCloseTo(0.1 / 0.43, 10);
      expect(one.architect.tokenShare).toBeCloseTo(110 / 473, 10);

      expect(metrics.totals.iterations).toBe(1);
      expect(metrics.totals.turns).toBe(4);
      expect(metrics.totals.tokens).toBe(473);
      expect(metrics.totals.merged).toEqual(["alpha"]);
      expect(metrics.totals.usage.costUsd).toBeCloseTo(0.43, 10);

      const iterationFile = yaml.parse((await store.readFile("iterations/1/metrics.yaml"))!) as typeof one;
      expect(iterationFile).toEqual(one);
      expect(await store.readFile("mailbox/outbox/metrics.yaml")).toBe(await store.readFile("metrics.yaml"));
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
        rec(3, { step: "implement", slug: "a", round: 2, usage: usage(0.1, 100, 10) }),
        script(4, { step: "park", slug: "a", ok: true, cause: "no-progress: same gate failed twice" }),
        script(5, { step: "merge", slug: "b", ok: true, commit: "abc" }),
      ];

      await writeMetrics(store, { iteration: 1, status: "in-progress", records, humanInterventions: 2 });
      let metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      expect(metrics.iterations[0]!.loopIncidents).toBe(1);
      expect(metrics.iterations[0]!.humanInterventions).toBe(2);
      expect(metrics.iterations[0]!.parked).toEqual(["a"]);
      expect(metrics.iterations[0]!.merged).toEqual(["b"]);
      expect(metrics.iterations[0]!.costPerMergedTask).toBeCloseTo(0.22, 10);
      expect(metrics.totals.humanInterventions).toBe(2);
      expect(metrics.totals.loopIncidents).toBe(1);

      await writeMetrics(store, { iteration: 2, status: "goal-met", records, humanInterventions: 1 });
      metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      expect(metrics.iterations.map((i) => [i.n, i.status, i.humanInterventions])).toEqual([
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
});
