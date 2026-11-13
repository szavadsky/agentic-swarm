import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type { Stop, Usage } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { writeMetrics, type GoalMetrics, type IncidentCounts } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task } from "./helpers.js";

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

function attempt(model: string, stop: Stop) {
  return { model: { id: model }, stop, usage: usage(0, 1, 0) };
}

const OK: Stop = { kind: "done" };
const QUOTA: Stop = { kind: "infra", cause: "quota" };

/** One record per incident kind, with alias groups distinct from role groups. */
function incidentRecords() {
  return [
    // One infra stop retried on the same model.
    rec(1, {
      step: "architect",
      slug: undefined,
      alias: "architect",
      usage: usage(0.01, 10, 1),
      promptBytes: 100,
      attempts: [attempt("model-a", QUOTA), attempt("model-a", OK)],
    }),
    // A repair turn (prev stop done) whose own first call was retried.
    rec(2, {
      slug: "a",
      alias: "cheap",
      usage: usage(0.02, 20, 2),
      promptBytes: 200,
      attempts: [attempt("model-a", OK), attempt("model-a", QUOTA), attempt("model-a", OK)],
    }),
    // An infra stop that moved to the next model in the chain.
    rec(3, {
      slug: "a",
      round: 2,
      alias: "escalated",
      usage: usage(0.03, 30, 3),
      promptBytes: 300,
      attempts: [attempt("model-a", QUOTA), attempt("model-b", OK)],
    }),
    // A final infra stop without a retry is not an infra retry.
    rec(4, {
      slug: "a",
      step: "review",
      alias: "reviewer",
      usage: usage(0.04, 40, 4),
      promptBytes: 400,
      attempts: [attempt("model-a", QUOTA)],
    }),
    script(5, { slug: "a", step: "merge", ok: false, cause: "conflict: alpha.txt" }),
    script(6, { slug: "a", step: "merge-checks", ok: false, checks: [] }),
    script(7, { slug: "b", step: "park", ok: true, cause: 'review round limit reached after verdict "changes" (2 rounds)' }),
    script(8, { slug: "c", step: "park", ok: true, cause: "no-progress: implement r2 repeats r1 (deadbeef)" }),
    script(9, { slug: "d", step: "park", ok: true, cause: "budget: item budget exhausted after 8 turns" }),
  ];
}

const EXPECTED_INCIDENTS = {
  infraRetries: 2,
  fallbackHops: 1,
  outcomeRepairs: 1,
  mergeConflicts: 1,
  mergedGateFailures: 1,
  roundLimitParks: 1,
  noProgressParks: 1,
  budgetParks: 1,
};

const SUMMARY_LABELS = {
  "infra retries": "infraRetries",
  "fallback hops": "fallbackHops",
  "outcome-repair turns": "outcomeRepairs",
  "merge conflicts": "mergeConflicts",
  "merged-gate failures": "mergedGateFailures",
  "round-limit parks": "roundLimitParks",
  "no-progress parks": "noProgressParks",
  "budget parks": "budgetParks",
} as const;

function summaryIncidents(text: string): IncidentCounts {
  const counts = {} as IncidentCounts;
  for (const [label, key] of Object.entries(SUMMARY_LABELS)) {
    const match = new RegExp(`^- ${label}: (\\d+)$`, "m").exec(text);
    expect(match).not.toBeNull();
    counts[key as keyof IncidentCounts] = Number(match![1]);
  }
  return counts;
}

describe("iteration metrics incidents and spend tables", () => {
  it("counts each incident kind and reports identical counts and spend tables in the summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-incidents-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      const records = incidentRecords();
      await writeMetrics(store, { iteration: 1, status: "in-progress", records });

      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      const one = metrics.iterations[0]!;
      expect(one.incidents).toEqual(EXPECTED_INCIDENTS);
      expect(metrics.totals.incidents).toEqual(EXPECTED_INCIDENTS);
      expect(one.loopIncidents).toBe(1);
      expect(one.turns).toBe(4);
      expect(one.tokens).toBe(110);

      expect(one.roles.architect).toMatchObject({ turns: 1, tokens: 11, promptBytes: 100, unpricedTurns: 0 });
      expect(one.roles.implementer).toMatchObject({ turns: 2, tokens: 55, promptBytes: 500, unpricedTurns: 0 });
      expect(one.roles.reviewer).toMatchObject({ turns: 1, tokens: 44, promptBytes: 400, unpricedTurns: 0 });
      expect(one.roles.implementer!.usage.costUsd).toBeCloseTo(0.05, 10);
      expect(one.aliases.cheap).toMatchObject({ turns: 1, tokens: 22, promptBytes: 200 });
      expect(one.aliases.escalated).toMatchObject({ turns: 1, tokens: 33, promptBytes: 300 });
      expect(one.aliases.cheap!.usage.costUsd).toBeCloseTo(0.02, 10);
      expect(metrics.totals.aliases.cheap).toMatchObject({ turns: 1, tokens: 22, promptBytes: 200 });

      const state = derive([task("a"), task("b"), task("c"), task("d")], records);
      await writeIterationSummary(store, { iteration: 1, state, records, status: "in-progress" });
      const text = fs.readFileSync(path.join(store.goalDir, "iterations/1/summary.md"), "utf8");

      expect(summaryIncidents(text)).toEqual(one.incidents);
      expect(text).toContain("| role | turns | tokens | cost | prompt bytes |");
      expect(text).toContain("| implementer | 2 | 55 | $0.0500 | 500 |");
      expect(text).toContain("| architect | 1 | 11 | $0.0100 | 100 |");
      expect(text).toContain("| reviewer | 1 | 44 | $0.0400 | 400 |");
      expect(text).toContain("| alias | turns | tokens | cost | prompt bytes |");
      expect(text).toContain("| cheap | 1 | 22 | $0.0200 | 200 |");
      expect(text).toContain("| escalated | 1 | 33 | $0.0300 | 300 |");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
