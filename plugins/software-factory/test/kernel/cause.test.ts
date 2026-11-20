// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { writeYamlAtomic } from "../../src/core/records/io.js";
import { formatCause, makeCause, readCause } from "../../src/kernel/cause.js";
import { derive } from "../../src/kernel/derive.js";
import { iterationMetrics } from "../../src/kernel/metrics.js";
import { appendPark } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { Cause, CauseKind, StepRecord } from "../../src/kernel/types.js";
import { task } from "./helpers.js";

/** Every legacy text shape a stored record carries, and the kind it becomes. */
const LEGACY: Array<[text: string, kind: CauseKind, detail: string]> = [
  ["gates: unit, lint", "gates", "unit, lint"],
  ["conflict: a.ts, b.ts", "conflict", "a.ts, b.ts"],
  ["base-conflict: a.ts", "base-conflict", "a.ts"],
  [
    "no-progress: implement r2 repeats r1 (deadbeef)",
    "no-progress",
    "implement r2 repeats r1 (deadbeef)",
  ],
  [
    "empty-diff: implement r1 committed no changes",
    "empty-diff",
    "implement r1 committed no changes",
  ],
  [
    'review round limit reached after verdict "changes" (2 rounds)',
    "change-requests-exhausted",
    'after verdict "changes" (2 rounds)',
  ],
  ["round limit reached", "round-limit", ""],
  ["overflow", "overflow", ""],
  ["overflow in implement", "overflow", "in implement"],
  ["infra-repeat: timeout: socket", "infra-repeat", "timeout: socket"],
  [
    "infra: gate could not start: typecheck",
    "infra",
    "gate could not start: typecheck",
  ],
  [
    "containment: goal artifacts changed outside the worktree",
    "containment",
    "goal artifacts changed outside the worktree",
  ],
  [
    "outside-change: HEAD moved in /repo",
    "outside-change",
    "HEAD moved in /repo",
  ],
  [
    "integration moved: expected a, found b",
    "integration-moved",
    "expected a, found b",
  ],
  [
    "budget: item budget exhausted after 8 turns",
    "budget",
    "item budget exhausted after 8 turns",
  ],
  ["steer: steer-x", "steer", "steer-x"],
  [
    'unanswered steer "s1" in mailbox/inbox/s1.md; hold expired',
    "steer",
    '"s1" in mailbox/inbox/s1.md; hold expired',
  ],
  [
    "blocked: the API cannot express this",
    "blocked",
    "the API cannot express this",
  ],
  ["upscope: needs a second seam", "upscope", "needs a second seam"],
  ["failed: no work", "failed", "no work"],
  ["review rejected: premise is wrong", "review-rejected", "premise is wrong"],
  ["refused: content policy", "refused", "content policy"],
  [
    "invalid outcome: no outcome after repair",
    "invalid-outcome",
    "no outcome after repair",
  ],
  [
    'merge failed: branch "x" does not exist',
    "merge-failed",
    'branch "x" does not exist',
  ],
  ["worktree setup failed: npm ERR", "setup", "npm ERR"],
  ["skipped: no conflicts", "note", "skipped: no conflicts"],
  ["held: gates: tests", "held", "gates: tests"],
  [
    'stuck: no next action for phase "done"',
    "stuck",
    'no next action for phase "done"',
  ],
  ["recovered merge after crash", "note", "recovered merge after crash"],
  [
    "removed from the plan at iteration 15",
    "note",
    "removed from the plan at iteration 15",
  ],
  ["anything else", "unknown", "anything else"],
];

describe("typed causes", () => {
  it("maps every legacy record text through the one reader", () => {
    for (const [text, kind, detail] of LEGACY) {
      expect(readCause(text)).toEqual({ kind, detail });
    }
  });

  it("passes a typed cause through and keeps malformed history readable", () => {
    expect(readCause({ kind: "gates", detail: "unit" })).toEqual(
      makeCause("gates", "unit"),
    );
    expect(readCause({ kind: "bogus", detail: "x" })).toEqual({
      kind: "unknown",
      detail: '{"kind":"bogus","detail":"x"}',
    });
    expect(readCause(undefined)).toBeUndefined();
    expect(readCause("   ")).toBeUndefined();
  });

  it("renders a cause as its kind and detail, and notes alone", () => {
    expect(formatCause(makeCause("gates", "unit"))).toBe("gates: unit");
    expect(formatCause(makeCause("overflow", ""))).toBe("overflow");
    expect(formatCause(makeCause("note", "auto-merged alpha"))).toBe(
      "auto-merged alpha",
    );
    expect(formatCause(makeCause("unknown", "prose cause"))).toBe(
      "prose cause",
    );
    expect(formatCause(makeCause("boundary", "PM ladder routed"))).toBe(
      "PM ladder routed",
    );
    expect(formatCause(makeCause("error", "store boom"))).toBe("store boom");
  });

  it("reads a record written before causes were typed and derives its kind", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cause-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const dir = path.join(store.recordsDir, "00001-i1-alpha-park-r1");
      fs.mkdirSync(dir, { recursive: true });
      await writeYamlAtomic(path.join(dir, "started.yaml"), {
        seq: 1,
        iteration: 1,
        slug: "alpha",
        step: "park",
        round: 1,
        actor: "script",
        startedAt: new Date(0).toISOString(),
      });
      await writeYamlAtomic(path.join(dir, "end.yaml"), {
        ok: true,
        cause: "gates: unit",
        endedAt: new Date(1000).toISOString(),
      });

      const records = await store.listRecords();
      expect(records[0]!.cause).toEqual(makeCause("gates", "unit"));
      const state = derive([task("alpha")], records);
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.alpha!.cause).toEqual(makeCause("gates", "unit"));
      expect(state.tasks.alpha!.park).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a typed cause to the record and never a message prefix", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cause-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      await appendPark(
        store,
        { iteration: 1, slug: "alpha", round: 1, revision: 0 },
        makeCause("gates", "unit"),
      );
      const [record] = await store.listRecords();
      const stored = yaml.parse(
        fs.readFileSync(
          path.join(store.recordsDir, "00001-i1-alpha-park-r1", "end.yaml"),
          "utf8",
        ),
      );
      expect(stored.cause).toEqual({ kind: "gates", detail: "unit" });
      expect(record!.cause).toEqual(makeCause("gates", "unit"));
      expect(record!.launchKind).toBe("failure");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes a merge failure by its kind, not by the words in its detail", () => {
    const merge = (seq: number, cause: Cause): StepRecord => ({
      seq,
      iteration: 1,
      slug: "alpha",
      step: "merge",
      round: 1,
      actor: "script",
      ok: false,
      cause,
      startedAt: new Date(seq).toISOString(),
      endedAt: new Date(seq + 1).toISOString(),
    });
    // A blocked kind whose detail quotes a conflict stays a merge failure.
    const blocked = derive(
      [task("alpha")],
      [merge(1, makeCause("blocked", "conflict: a.ts"))],
    );
    expect(blocked.tasks.alpha!.phase).toBe("parked");
    expect(blocked.tasks.alpha!.park).toEqual(
      makeCause("merge-failed", "blocked: conflict: a.ts"),
    );
    // A conflict kind routes to the resolve step whatever its detail says.
    const conflict = derive(
      [task("alpha")],
      [merge(1, makeCause("conflict", "the files look unrelated"))],
    );
    expect(conflict.tasks.alpha!.status).toBe("ready");
    expect(conflict.tasks.alpha!.phase).toBe("resolve");
  });

  it("counts incidents by kind, not by words in the detail", () => {
    const all = [
      {
        seq: 1,
        iteration: 1,
        slug: "a",
        step: "park",
        round: 1,
        actor: "script" as const,
        ok: true,
        cause: makeCause(
          "blocked",
          "empty-diff: the detail names another kind",
        ),
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(1000).toISOString(),
      },
      {
        seq: 2,
        iteration: 1,
        slug: "b",
        step: "park",
        round: 1,
        actor: "script" as const,
        ok: true,
        cause: makeCause("empty-diff", "no-progress wording in the detail"),
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(1000).toISOString(),
      },
    ];
    const metrics = iterationMetrics(1, "in-progress", all, {}, 0, {});
    expect(metrics.incidents.emptyDiffParks).toBe(1);
    expect(metrics.incidents.noProgressParks).toBe(0);
    expect(metrics.incidents.roundLimitParks).toBe(0);
  });
});
