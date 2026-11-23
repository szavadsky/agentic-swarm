import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { MAX_QA_CATCH_SAMPLES, qaOnlyCatches } from "../../src/kernel/qa.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script } from "./helpers.js";

function qaOutcome(
  verdict: "accept" | "changes",
  findings: string[] = [],
): StepRecord["outcome"] {
  return {
    status: "done",
    summary: "qa outcome",
    concerns: [],
    forward: [],
    qa: { verdict, findings },
  } as unknown as StepRecord["outcome"];
}

function reviewOutcome(
  verdict: "approve" | "changes" | "reject",
  summary = "review outcome",
): StepRecord["outcome"] {
  return {
    status: "done",
    summary,
    concerns: [],
    forward: [],
    verdict,
  } as unknown as StepRecord["outcome"];
}

function check(name: string, ok: boolean, summary: string, output = "") {
  return { name, ok, summary, output, fingerprint: name };
}

function qaRecord(
  seq: number,
  slug: string,
  round: number,
  findings: string[],
  iteration = 1,
): StepRecord {
  return rec(seq, {
    iteration,
    slug,
    round,
    step: "qa",
    alias: "qa",
    outcome: qaOutcome(findings.length > 0 ? "changes" : "accept", findings),
  });
}

function reviewRecord(
  seq: number,
  slug: string,
  round: number,
  summary: string,
  iteration = 1,
): StepRecord {
  return rec(seq, {
    iteration,
    slug,
    round,
    step: "review",
    alias: "reviewer",
    outcome: reviewOutcome("changes", summary),
  });
}

function checksRecord(
  seq: number,
  slug: string,
  round: number,
  checks: ReturnType<typeof check>[],
  iteration = 1,
): StepRecord {
  return script(seq, {
    iteration,
    slug,
    round,
    step: "checks",
    ok: checks.every((entry) => entry.ok),
    checks,
  });
}

/** One checks → QA round; clean QA carries the task on to review. */
function taskRound(
  seq: number,
  iteration: number,
  slug: string,
  findings: string[],
): StepRecord[] {
  const checks = checksRecord(
    seq,
    slug,
    1,
    [check("tests", true, "pass")],
    iteration,
  );
  const qa = qaRecord(seq + 1, slug, 1, findings, iteration);
  if (findings.length > 0) {
    return [checks, qa];
  }
  return [
    checks,
    qa,
    rec(seq + 2, {
      iteration,
      slug,
      round: 1,
      step: "review",
      alias: "reviewer",
      outcome: reviewOutcome("approve"),
    }),
  ];
}

function registerCountsQAOnlyFindingsPerTask() {
  it("counts QA-only findings per task and records zero for a task with none", () => {
    const records = [
      ...taskRound(1, 1, "task-a", [
        "src/a.ts:10 null deref in the parser fallback",
      ]),
      ...taskRound(4, 1, "task-b", []),
    ];
    const result = qaOnlyCatches(records);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1, "task-b": 0 });
    expect(result.sample).toEqual([
      {
        task: "task-a",
        finding: "src/a.ts:10 null deref in the parser fallback",
        record: "records/00002-i1-task-a-qa-r1",
        round: 1,
      },
    ]);
  });
}

function registerExcludesDuplicateGateFailure() {
  it("excludes a QA finding that duplicates a gate failure but keeps the others", () => {
    const duplicate = "test/parser.test.ts:12 expected 2 but got 3";
    const records = [
      checksRecord(1, "task-a", 1, [
        check("tests", false, duplicate, "FAIL test/parser.test.ts"),
      ]),
      qaRecord(2, "task-a", 1, [
        duplicate,
        "src/a.ts:40 missing bounds check in decoder",
      ]),
    ];
    const result = qaOnlyCatches(records);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1 });
    expect(result.sample[0]!.finding).toBe(
      "src/a.ts:40 missing bounds check in decoder",
    );
  });
}

function registerExcludesReviewerRaisedFinding() {
  it("excludes a QA finding a reviewer already raised in an earlier round", () => {
    const repeated = "src/a.ts:10 null deref in the parser fallback";
    const records = [
      reviewRecord(
        1,
        "task-a",
        1,
        `1.   ${repeated.toUpperCase()}  extra trailing words`,
      ),
      checksRecord(2, "task-a", 2, [check("tests", true, "pass")]),
      qaRecord(3, "task-a", 2, [
        repeated,
        "src/a.ts:50 swallowed error in the retry loop",
      ]),
    ];
    const result = qaOnlyCatches(records);
    expect(result.count).toBe(1);
    expect(result.sample[0]!.finding).toBe(
      "src/a.ts:50 swallowed error in the retry loop",
    );
  });
}

function registerCountsFindingOnce() {
  it("counts a finding once when the reviewer repeats it later", () => {
    const repeated = "src/a.ts:10 null deref in the parser fallback";
    const records = [
      ...taskRound(1, 1, "task-a", [repeated]),
      rec(3, {
        slug: "task-a",
        round: 2,
        step: "implement",
        alias: "implementer",
      }),
      checksRecord(4, "task-a", 2, [check("tests", true, "pass")]),
      qaRecord(5, "task-a", 2, []),
      reviewRecord(6, "task-a", 2, `1. ${repeated}`),
      rec(7, {
        slug: "task-a",
        round: 3,
        step: "implement",
        alias: "implementer",
      }),
      checksRecord(8, "task-a", 3, [check("tests", true, "pass")]),
      qaRecord(9, "task-a", 3, [repeated]),
    ];
    const result = qaOnlyCatches(records);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1 });
    expect(result.sample).toHaveLength(1);
  });
}

function registerBoundsSampleDeterministically() {
  it("bounds the sample deterministically while counting every catch", () => {
    const records: StepRecord[] = [];
    let seq = 1;
    for (const task of ["a", "b", "c", "d", "e", "f"]) {
      for (let round = 1; round <= 5; round++) {
        records.push(
          checksRecord(seq++, task, round, [check("tests", true, "pass")]),
          qaRecord(seq++, task, round, [
            `src/${task}.ts:${round} missing bounds check in decoder`,
          ]),
        );
      }
    }
    const result = qaOnlyCatches(records);
    expect(result.count).toBe(30);
    expect(result.sample).toHaveLength(MAX_QA_CATCH_SAMPLES);
    expect(result.sample[0]!.task).toBe("a");
    expect(result.byTask).toEqual({
      a: 5,
      b: 5,
      c: 5,
      d: 5,
      e: 5,
      f: 5,
    });
    expect(qaOnlyCatches(records)).toEqual(result);
  });
}

describe("QA-only catches", () => {
  registerCountsQAOnlyFindingsPerTask();
  registerExcludesDuplicateGateFailure();
  registerExcludesReviewerRaisedFinding();
  registerCountsFindingOnce();
  registerBoundsSampleDeterministically();
});

describe("QA-only catches in metrics", () => {
  it("writes per-task counts into iteration metrics and sums them in totals", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-qa-catches-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        ...taskRound(1, 1, "task-a", [
          "src/a.ts:10 null deref in the parser fallback",
          "src/a.ts:20 missing bounds check in decoder",
        ]),
        ...taskRound(4, 1, "task-b", []),
        ...taskRound(7, 2, "task-a", [
          "src/a.ts:30 swallowed error in the retry loop",
        ]),
        ...taskRound(10, 2, "task-c", []),
      ];
      await writeMetrics(store, {
        iteration: 2,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;

      expect(metrics.iterations[0]!.qaOnlyCatches).toMatchObject({
        count: 2,
        byTask: { "task-a": 2, "task-b": 0 },
      });
      expect(metrics.iterations[1]!.qaOnlyCatches).toMatchObject({
        count: 1,
        byTask: { "task-a": 1, "task-c": 0 },
      });
      expect(metrics.totals.qaOnlyCatches.count).toBe(3);
      expect(metrics.totals.qaOnlyCatches.byTask).toEqual({
        "task-a": 3,
        "task-b": 0,
        "task-c": 0,
      });
      expect(metrics.totals.qaOnlyCatches.sample).toHaveLength(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("QA-only catches in the summary", () => {
  it("renders the per-task counts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-qa-summary-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        ...taskRound(1, 1, "task-a", [
          "src/a.ts:10 null deref in the parser fallback",
          "src/a.ts:20 missing bounds check in decoder",
        ]),
        ...taskRound(4, 1, "task-b", []),
      ];
      await writeIterationSummary(store, {
        iteration: 1,
        state: derive([], records),
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(
        path.join(store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(text).toContain("- QA-only catches: 2 (task-a: 2, task-b: 0)");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders zero when the iteration had a QA step but no catches", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-qa-summary-zero-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = taskRound(1, 1, "task-b", []);
      await writeIterationSummary(store, {
        iteration: 1,
        state: derive([], records),
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(
        path.join(store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(text).toContain("- QA-only catches: 0 (task-b: 0)");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
