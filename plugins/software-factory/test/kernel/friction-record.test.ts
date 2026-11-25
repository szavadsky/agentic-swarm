/** The iteration summary's friction section: a stalled steer, kept branch, fallback chain. */

import { describe, expect, it } from "bun:test";
import type { FrictionEntry } from "../../src/kernel/metrics.js";
import type { StepRecord } from "../../src/kernel/types.js";
import {
  parkRecord,
  written,
  writtenSummary,
  zero,
} from "./friction-metrics-helpers.js";
import { rec, script, task } from "./helpers.js";

/** Usage with a cost the harness reported, so the friction cost is known. */
function paid(inTokens: number, costUsd: number) {
  return {
    in: inTokens,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 100,
    reasoningOut: 0,
    costUsd,
  };
}

/** A PM turn that stalled one steer and routed another to a task. */
function stalledSteerRecords(): StepRecord[] {
  const steer = "20260101T000000000Z-aaaa1111";
  const ordinary = "20260101T000000000Z-bbbb2222";
  const routes = [
    { steer, route: "stall" as const },
    { steer: ordinary, route: "task" as const, answer: "do the work" },
  ];
  return [
    rec(1, {
      slug: undefined,
      step: "pm",
      alias: "pm",
      usage: paid(1000, 0.05),
      outcome: {
        status: "done",
        summary: "route the steer",
        concerns: [],
        forward: [],
        steerRoutes: routes,
      },
    }),
    script(2, {
      slug: undefined,
      step: "steer-routes",
      startedAt: "2026-01-01T00:00:02.000Z",
      endedAt: "2026-01-01T00:00:02.000Z",
      ok: true,
      outcome: {
        status: "done",
        summary: "steer routes",
        concerns: [],
        forward: [],
        steerRoutes: routes,
      },
    }),
  ];
}

/** A parked development task and a parked spike. */
function parkRecords(): StepRecord[] {
  return [
    rec(3, {
      step: "implement",
      slug: "kept",
      usage: paid(1000, 0.1),
      edits: { files: 2, added: 4, removed: 1 },
    }),
    parkRecord(4, "kept"),
    rec(5, {
      step: "implement",
      slug: "probe",
      usage: paid(100, 0.01),
      edits: zero,
    }),
    parkRecord(6, "probe"),
  ];
}

/** One turn that fell over to a second model, then one incident launch. */
function fallbackRecords(): StepRecord[] {
  return [
    rec(7, {
      step: "implement",
      slug: "chain",
      launchKind: "glitch",
      usage: paid(200, 0.3),
      attempts: [
        {
          model: { id: "primary" },
          harness: "first",
          stop: { kind: "infra", cause: "quota" },
          usage: paid(100, 0.2),
        },
        {
          model: { id: "fallback" },
          harness: "second",
          stop: { kind: "done" },
          usage: paid(200, 0.3),
        },
      ],
      edits: { files: 1, added: 1, removed: 0 },
    }),
    rec(8, {
      step: "review",
      slug: "chain",
      launchKind: "change-request",
      usage: paid(50, 0.02),
      outcome: {
        status: "done",
        summary: "changes requested",
        concerns: [],
        forward: [],
        verdict: "changes",
      },
    }),
  ];
}

function frictionRecords(): StepRecord[] {
  return [
    ...stalledSteerRecords(),
    ...parkRecords(),
    ...fallbackRecords(),
  ].sort((a, b) => a.seq - b.seq);
}

function frictionTasks() {
  return [task("kept"), task("probe", { kind: "spike" }), task("chain")];
}

const EXPECTED_FRICTION: FrictionEntry[] = [
  {
    kind: "stalled steer",
    record: "records/00002-i1-steer-routes-r1",
    detail: "steer 20260101T000000000Z-aaaa1111 routed stall",
    costUsd: 0.05,
    unpricedTurns: 0,
  },
  {
    kind: "kept branch",
    record: "records/00004-i1-kept-park-r1",
    detail: "parked kept — failed",
    costUsd: 0.1,
    unpricedTurns: 0,
  },
  {
    kind: "park",
    record: "records/00006-i1-probe-park-r1",
    detail: "parked probe — failed",
    costUsd: 0.01,
    unpricedTurns: 0,
  },
  {
    kind: "fallback chain",
    record: "records/00007-i1-chain-implement-r1",
    detail: "primary/first -> fallback/second (2 attempts)",
    costUsd: 0.5,
    unpricedTurns: 0,
  },
  {
    kind: "dispatch",
    record: "records/00008-i1-chain-review-r1",
    detail: "launched again: change-request",
    costUsd: 0.02,
    unpricedTurns: 0,
  },
];

const EXPECTED_FRICTION_LINES = [
  "- stalled steer: records/00002-i1-steer-routes-r1 — steer 20260101T000000000Z-aaaa1111 routed stall; cost $0.0500",
  "- kept branch: records/00004-i1-kept-park-r1 — parked kept — failed; cost $0.1000",
  "- park: records/00006-i1-probe-park-r1 — parked probe — failed; cost $0.0100",
  "- fallback chain: records/00007-i1-chain-implement-r1 — primary/first -> fallback/second (2 attempts); cost $0.5000",
  "- dispatch: records/00008-i1-chain-review-r1 — launched again: change-request; cost $0.0200",
];

function registerFrictionRecordList(): void {
  it("lists a stalled steer, a kept branch, a park and a fallback chain with record and cost", async () => {
    const { one, summary } = await writtenSummary(
      frictionRecords(),
      frictionTasks(),
    );
    expect(one.friction).toEqual(EXPECTED_FRICTION);
    expect(summary).toContain("## Friction");
    for (const line of EXPECTED_FRICTION_LINES) {
      expect(summary).toContain(line);
    }
  });
}

function registerFrictionCosts(): void {
  it("counts a kept branch's whole spend across revisions", async () => {
    const { one } = await written(
      [
        rec(1, {
          step: "implement",
          slug: "a",
          revision: 0,
          usage: paid(100, 0.1),
          edits: zero,
        }),
        rec(2, {
          step: "implement",
          slug: "a",
          revision: 1,
          usage: paid(100, 0.2),
          edits: zero,
        }),
        parkRecord(3, "a", { revision: 1 }),
      ],
      [task("a", { revision: 1 })],
    );
    expect(one.friction[0]?.costUsd).toBeCloseTo(0.3, 10);
  });

  it("keeps an unpriced friction partial", async () => {
    const { one, summary } = await writtenSummary(
      [
        rec(1, { step: "implement", slug: "a", usage: undefined, edits: zero }),
        parkRecord(2, "a"),
      ],
      [task("a")],
    );
    expect(one.friction).toEqual([
      {
        kind: "kept branch",
        record: "records/00002-i1-a-park-r1",
        detail: "parked a — failed",
        unpricedTurns: 1,
      },
    ]);
    expect(summary).toContain(
      "- kept branch: records/00002-i1-a-park-r1 — parked a — failed; cost unknown (1 unpriced turn)",
    );
  });

  it("reports n/a when no turn behind a friction was priced", async () => {
    const { one, summary } = await writtenSummary(
      [parkRecord(1, "unworked")],
      [task("unworked")],
    );
    expect(one.friction[0]?.costUsd).toBeUndefined();
    expect(summary).toContain(
      "- kept branch: records/00001-i1-unworked-park-r1 — parked unworked — failed; cost n/a",
    );
  });
}

function registerFrictionMerges(): void {
  it("lists failed merges and kept-branch landings, not a successful merge with a note", async () => {
    const records = [
      script(1, {
        slug: "ok",
        step: "merge",
        ok: true,
        cause: { kind: "note", detail: "auto-merged" },
      }),
      script(2, {
        slug: "bad",
        step: "merge",
        ok: false,
        cause: { kind: "conflict", detail: "head moved" },
      }),
      script(3, {
        slug: "kept",
        step: "kept-land",
        ok: false,
        cause: { kind: "merge-failed", detail: "red gates" },
      }),
      script(4, {
        slug: "landed",
        step: "kept-land",
        ok: true,
        cause: { kind: "note", detail: "approved tip landed as abc123" },
      }),
    ];
    const { one } = await written(records, [
      task("ok"),
      task("bad"),
      task("kept"),
      task("landed"),
    ]);
    expect(one.friction.map((entry) => [entry.kind, entry.record])).toEqual([
      ["merge", "records/00002-i1-bad-merge-r1"],
      ["kept branch", "records/00003-i1-kept-kept-land-r1"],
      ["kept branch", "records/00004-i1-landed-kept-land-r1"],
    ]);
  });
}

describe("iteration friction records", () => {
  registerFrictionRecordList();
  registerFrictionCosts();
  registerFrictionMerges();
});
