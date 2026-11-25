import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { MAX_QA_CATCH_SAMPLES, qaCatches } from "../../src/kernel/qa.js";
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

function registerQaOnlyCount() {
  it("counts a QA-only finding per task and records zero for a task with none", () => {
    const records = [
      ...taskRound(1, 1, "task-a", [
        "src/a.ts:10 null deref in the parser fallback",
      ]),
      ...taskRound(4, 1, "task-b", []),
    ];
    const result = qaCatches(records);
    expect(result.total).toBe(1);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1, "task-b": 0 });
    expect(result.sample).toEqual([
      {
        task: "task-a",
        finding: "src/a.ts:10 null deref in the parser fallback",
        record: "records/00002-i1-task-a-qa-r1",
        round: 1,
        alsoCaughtBy: "none",
      },
    ]);
  });
}

function registerGateScope() {
  it("classifies a gate failure from the same task and ignores another task's gate", () => {
    const duplicate = "test/parser.test.ts:12 expected 2 but got 3";
    const otherTask = "test/b.test.ts:3 expected 1 but got 2";
    const records = [
      checksRecord(1, "task-a", 1, [check("tests", false, duplicate)]),
      checksRecord(2, "task-b", 1, [check("tests", false, otherTask)]),
      qaRecord(3, "task-a", 1, [
        duplicate,
        "src/a.ts:40 missing bounds check in decoder",
      ]),
      qaRecord(4, "task-b", 1, [otherTask]),
    ];
    const result = qaCatches(records);
    expect(result.total).toBe(3);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1, "task-b": 0 });
    expect(result.sample.map((entry) => entry.alsoCaughtBy)).toEqual([
      "gate",
      "none",
      "gate",
    ]);
  });
}

function registerEarlierReviewer() {
  it("classifies a QA finding an earlier reviewer already raised", () => {
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
    const result = qaCatches(records);
    expect(result.total).toBe(2);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1 });
    expect(result.sample.map((entry) => entry.alsoCaughtBy)).toEqual([
      "reviewer",
      "none",
    ]);
  });
}

function registerReviewerAfter() {
  it("does not count a finding the reviewer repeats after QA as QA-only", () => {
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
    ];
    const result = qaCatches(records);
    expect(result.total).toBe(1);
    expect(result.count).toBe(0);
    expect(result.byTask).toEqual({ "task-a": 0 });
    expect(result.sample).toEqual([
      {
        task: "task-a",
        finding: repeated,
        record: "records/00002-i1-task-a-qa-r1",
        round: 1,
        alsoCaughtBy: "reviewer-after",
      },
    ]);
  });
}

function registerDedupeAcrossRounds() {
  it("counts a finding once when QA raises it in several rounds", () => {
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
      qaRecord(5, "task-a", 2, [repeated]),
    ];
    const result = qaCatches(records);
    expect(result.total).toBe(1);
    expect(result.count).toBe(1);
    expect(result.byTask).toEqual({ "task-a": 1 });
    expect(result.sample).toHaveLength(1);
  });
}

function registerBoundsSample() {
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
    const result = qaCatches(records);
    expect(result.total).toBe(30);
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
    expect(qaCatches(records)).toEqual(result);
  });
}

describe("QA catches", () => {
  registerQaOnlyCount();
  registerGateScope();
  registerEarlierReviewer();
  registerReviewerAfter();
  registerDedupeAcrossRounds();
  registerBoundsSample();
});

function registerMetricsSums() {
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

      expect(metrics.iterations[0]!.qaCatches).toMatchObject({
        total: 2,
        count: 2,
        byTask: { "task-a": 2, "task-b": 0 },
      });
      expect(metrics.iterations[1]!.qaCatches).toMatchObject({
        total: 1,
        count: 1,
        byTask: { "task-a": 1, "task-c": 0 },
      });
      expect(metrics.totals.qaCatches.total).toBe(3);
      expect(metrics.totals.qaCatches.count).toBe(3);
      expect(metrics.totals.qaCatches.byTask).toEqual({
        "task-a": 3,
        "task-b": 0,
        "task-c": 0,
      });
      expect(metrics.totals.qaCatches.sample).toHaveLength(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("QA catches in metrics", () => {
  registerMetricsSums();
});

function registerSummaryProvenance() {
  it("renders each sampled catch with its record and who else carried it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-qa-summary-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    const duplicate = "test/parser.test.ts:12 expected 2 but got 3";
    try {
      await store.ensureLayout();
      const records = [
        checksRecord(1, "task-a", 1, [check("tests", false, duplicate)]),
        qaRecord(2, "task-a", 1, [
          duplicate,
          "src/a.ts:40 missing bounds check in decoder",
        ]),
        reviewRecord(
          3,
          "task-a",
          1,
          "1. src/a.ts:40 missing bounds check in decoder",
        ),
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
      expect(text).toContain(
        "- QA-only catches: 0 of 2 QA findings (task-a: 0)",
      );
      expect(text).toContain("- QA catch sample:");
      expect(text).toContain(
        `  - task-a records/00002-i1-task-a-qa-r1: ${duplicate} (also a gate failure)`,
      );
      expect(text).toContain(
        "  - task-a records/00002-i1-task-a-qa-r1: src/a.ts:40 missing bounds check in decoder (repeated by the reviewer after QA)",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerSummaryZero() {
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
      expect(text).toContain(
        "- QA-only catches: 0 of 0 QA findings (task-b: 0)",
      );
      expect(text).not.toContain("- QA catch sample:");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("QA catches in the summary", () => {
  registerSummaryProvenance();
  registerSummaryZero();
});
