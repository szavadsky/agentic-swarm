import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type { Stop, Usage } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import {
  deriveLaunchKind,
  type GoalMetrics,
  writeMetrics,
} from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task, cause } from "./helpers.js";

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

function attempt(
  model: string,
  stop: Stop,
  usageValue?: Usage,
  harness?: string,
) {
  return {
    model: { id: model },
    stop,
    usage: usageValue ?? usage(0, 0, 0),
    ...(harness ? { harness } : {}),
  };
}

const OK: Stop = { kind: "done" };

function registerIterationMetricsIncidentsAndSpendTablesPart4(): void {
  it("counts zero loop incidents and zero unpriced turns when no signal is present", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-incidents-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          step: "architect",
          slug: undefined,
          usage: usage(0.01, 10, 1),
        }),
        // A spike's knowledge-only turn and its normal finish record.
        rec(2, { slug: "probe", usage: usage(0.02, 20, 2) }),
        script(3, { slug: "probe", step: "finish", ok: true }),
        script(4, {
          slug: "b",
          step: "park",
          ok: true,
          cause: cause("review rejected: missing test"),
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
      expect(metrics.iterations[0]!.loopIncidents).toBe(0);
      expect(metrics.totals.loopIncidents).toBe(0);
      expect(metrics.iterations[0]!.unpricedTurns).toBe(0);
      expect(metrics.iterations[0]!.incidents).toEqual({
        infraRetries: 0,
        fallbackHops: 0,
        outcomeRepairs: 0,
        mergeConflicts: 0,
        mergedGateFailures: 0,
        gateFlakes: 0,
        roundLimitParks: 0,
        noProgressParks: 0,
        emptyDiffParks: 0,
        overflowParks: 0,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerIterationMetricsIncidentsAndSpendTablesPart5(): void {
  it("counts each outcome repair on one record", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-incidents-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          slug: "a",
          usage: usage(0.02, 20, 2),
          attempts: [
            attempt("model-a", OK, usage(0.01, 10, 1)),
            attempt("model-a", OK, usage(0.01, 10, 1)),
            attempt("model-a", OK, usage(0.01, 10, 1)),
            attempt("model-a", OK, usage(0.01, 10, 1)),
          ],
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
      expect(metrics.iterations[0]!.incidents.outcomeRepairs).toBe(3);
      expect(metrics.totals.incidents.outcomeRepairs).toBe(3);
      expect(metrics.iterations[0]!.incidents.infraRetries).toBe(0);
      expect(metrics.iterations[0]!.incidents.fallbackHops).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function launchKindTurnRecords(): StepRecord[] {
  return [
    rec(1, {
      slug: "a",
      alias: "cheap",
      usage: usage(0.01, 10, 1),
      launchKind: "glitch",
      stop: { kind: "infra", cause: "quota" },
    }),
    rec(2, {
      slug: "a",
      step: "review",
      alias: "reviewer",
      usage: usage(0.01, 10, 1),
      launchKind: "change-request",
      outcome: {
        status: "done",
        summary: "needs work",
        concerns: [],
        forward: [],
        verdict: "changes",
      },
    }),
    rec(3, {
      slug: "b",
      alias: "cheap",
      usage: usage(0.01, 10, 1),
      launchKind: "failure",
      outcome: {
        status: "failed",
        summary: "broken",
        concerns: [],
        forward: [],
      },
    }),
  ];
}

function launchKindLateRecords(): StepRecord[] {
  return [
    rec(4, {
      slug: "c",
      alias: "cheap",
      usage: usage(0.01, 10, 1),
      outcome: {
        status: "failed",
        summary: "old failure",
        concerns: [],
        forward: [],
      },
    }),
    rec(5, { slug: "d", alias: "cheap", usage: usage(0.01, 10, 1) }),
    rec(6, {
      slug: "e",
      step: "qa",
      alias: "qa",
      usage: usage(0.01, 10, 1),
      launchKind: "qa-finding",
      outcome: {
        status: "done",
        summary: "needs work",
        concerns: [],
        forward: [],
        qa: { verdict: "changes", findings: ["task.txt:1 needs v2"] },
      } as never,
    }),
  ];
}

/** Asserts the per-role/alias launch-kind tables. */
function expectLaunchKinds(metrics: GoalMetrics): void {
  const one = metrics.iterations[0]!;
  expect(one.aliases.cheap!.launches).toEqual({
    glitch: 1,
    "change-request": 0,
    "qa-finding": 0,
    failure: 1,
    unknown: 1,
  });
  expect(one.aliases.reviewer!.launches).toEqual({
    glitch: 0,
    "change-request": 1,
    "qa-finding": 0,
    failure: 0,
    unknown: 0,
  });
  expect(one.roles.implementer!.launches).toEqual({
    glitch: 1,
    "change-request": 0,
    "qa-finding": 0,
    failure: 1,
    unknown: 1,
  });
  expect(metrics.totals.aliases.cheap!.launches).toEqual({
    glitch: 1,
    "change-request": 0,
    "qa-finding": 0,
    failure: 1,
    unknown: 1,
  });
  expect(one.roles.qa!.launches).toEqual({
    glitch: 0,
    "change-request": 0,
    "qa-finding": 1,
    failure: 0,
    unknown: 0,
  });
  expect(one.aliases.qa!.launches).toEqual({
    glitch: 0,
    "change-request": 0,
    "qa-finding": 1,
    failure: 0,
    unknown: 0,
  });
}

/** Asserts the summary's launch tables name every observed launch kind. */
function expectLaunchTableText(text: string): void {
  expect(text).toContain("## Launches by role");
  expect(text).toContain("## Launches by alias");
  expect(text).toContain(
    "| alias | glitch | change-request | qa-finding | failure | unknown |",
  );
  expect(text).toContain("| cheap | 1 | 0 | 0 | 1 | 1 |");
  expect(text).toContain("| reviewer | 0 | 1 | 0 | 0 | 0 |");
  expect(text).toContain("| qa | 0 | 0 | 1 | 0 | 0 |");
}

function registerIterationMetricsIncidentsAndSpendTablesPart6(): void {
  it("counts launches per agent per kind and old incidents as unknown", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-launches-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [...launchKindTurnRecords(), ...launchKindLateRecords()];

      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expectLaunchKinds(metrics);

      const state = derive(
        [task("a"), task("b"), task("c"), task("d")],
        records,
      );
      await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(
        path.join(store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expectLaunchTableText(text);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerIterationMetricsIncidentsAndSpendTablesPart7(): void {
  it("counts an undelivered reminder as an incident, never one that delivered", () => {
    // Legacy records carry no stored launch kind: the delivery decides.
    const delivered = rec(1, {
      outcome: {
        status: "done",
        summary: "repaired",
        concerns: [],
        forward: [],
      },
      repairFindings: ["no outcome written to the outcome path"],
      attempts: [
        attempt("model-a", OK, usage(0.01, 10, 1)),
        attempt("model-a", OK, usage(0.01, 10, 1)),
      ],
    });
    expect(deriveLaunchKind(delivered)).toBeUndefined();

    const undelivered = rec(2, {
      stop: { kind: "refusal", details: "declined" },
      repairFindings: ["no outcome written to the outcome path"],
      attempts: [
        attempt("model-a", OK, usage(0.01, 10, 1)),
        attempt("model-a", { kind: "refusal", details: "declined" }),
      ],
    });
    expect(deriveLaunchKind(undelivered)).toBe("unknown");
  });
}

describe("iteration metrics incidents and spend tables", () => {
  registerIterationMetricsIncidentsAndSpendTablesPart4();

  registerIterationMetricsIncidentsAndSpendTablesPart5();

  registerIterationMetricsIncidentsAndSpendTablesPart6();

  registerIterationMetricsIncidentsAndSpendTablesPart7();
});
