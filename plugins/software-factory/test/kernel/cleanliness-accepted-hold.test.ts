import { describe, expect, it } from "bun:test";
import type {
  CheckAttribution,
  CheckResult,
} from "../../src/core/checks/types.js";
import { derive } from "../../src/kernel/derive.js";
import { DEFAULT_FLOWS } from "../../src/kernel/derive-task.js";
import { fixDispositions } from "../../src/kernel/flow-context-history.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

const FLOWS = DEFAULT_FLOWS;

const LINE = "Large file: data.bin (2000000 bytes)";
const SECOND_LINE = "Disallowed artifact: benchmark cache.tmp";

function gate(
  name: string,
  ok: boolean,
  output: string,
  attribution?: CheckAttribution,
): CheckResult {
  return {
    name,
    ok,
    summary: ok ? "pass" : "failed",
    output,
    fingerprint: name,
    ...(attribution === undefined ? {} : { attribution }),
  };
}

function cleanlinessRed(
  output = LINE,
  attribution?: CheckAttribution,
): CheckResult {
  return gate("cleanliness", false, output, attribution);
}

function checks(seq: number, reds: CheckResult[]): StepRecord {
  return script(seq, {
    step: "checks",
    ok: false,
    checks: reds,
    startedAt: new Date(seq).toISOString(),
  });
}

function implement(
  seq: number,
  patch: Partial<StepRecord> = {},
  outcome: Partial<NonNullable<StepRecord["outcome"]>> = {
    status: "done",
    summary: "implemented",
    concerns: [],
    forward: [],
  },
): StepRecord {
  return rec(seq, {
    step: "implement",
    round: 1,
    startedAt: new Date(seq).toISOString(),
    outcome: outcome as StepRecord["outcome"],
    ...patch,
  });
}

function answer(
  seq: number,
  outcome: Partial<NonNullable<StepRecord["outcome"]>>,
): StepRecord {
  // A reply-only answer: the tree is the one the red judged.
  return implement(seq, { tree: "tree-1", commit: "c1", base: "c0" }, outcome);
}

function qaAccept(seq: number, tree: string): StepRecord {
  return rec(seq, {
    step: "qa",
    round: 1,
    tree,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: "accepted",
      concerns: [],
      forward: [],
      qa: { verdict: "accept", findings: [] },
    } as StepRecord["outcome"],
  });
}

const firstTurn = implement(1, { tree: "tree-1", commit: "c1", base: "c0" });
const justifiedAnswer = answer(3, {
  status: "done",
  summary: "kept data.bin for the benchmark",
  concerns: [],
  forward: [],
  replies: [{ finding: 1, reply: "the benchmark needs data.bin" }],
});

/** Hit, justified reply-only answer, the pre-QA rerun, the QA accept. */
function beforePostQaChecks(qaTree: string): StepRecord[] {
  return [
    firstTurn,
    checks(2, [cleanlinessRed()]),
    justifiedAnswer,
    checks(4, [cleanlinessRed()]),
    qaAccept(5, qaTree),
  ];
}

function stateOf(records: StepRecord[]) {
  return derive([task("a")], records, FLOWS).tasks.a!;
}

describe("an accepted cleanliness red holds after QA", () => {
  it("QA edits nothing: the identical red reaches review, no implement turn", () => {
    const records = [
      ...beforePostQaChecks("tree-1"),
      checks(6, [cleanlinessRed()]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("review");
    expect(state.gateFix).toBeUndefined();
    expect(state.park).toBeUndefined();
  });

  it("QA edits tests: the acceptance survives the changed tree", () => {
    const records = [
      ...beforePostQaChecks("tree-2"),
      checks(6, [cleanlinessRed()]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("review");
    expect(state.gateFix).toBeUndefined();
    expect(state.park).toBeUndefined();
  });

  it("keeps the justification visible to the reviewer after QA", () => {
    const records = [
      ...beforePostQaChecks("tree-1"),
      checks(6, [cleanlinessRed()]),
    ];
    const state = stateOf(records);
    expect(state.cleanlinessJustified).toBe(true);
    const dispositions = fixDispositions(
      records,
      "a",
      FLOWS["implement-review"]!,
      1,
      state,
    );
    expect(dispositions).toContain("kept data.bin for the benchmark");
    expect(dispositions).toContain("- finding 1: the benchmark needs data.bin");
  });
});

describe("the cleanliness finding is a set of lines", () => {
  it("a later red keeping only accepted lines still holds", () => {
    const acceptedRed = cleanlinessRed(`${LINE}\n${SECOND_LINE}`);
    const records = [
      firstTurn,
      checks(2, [acceptedRed]),
      justifiedAnswer,
      checks(4, [acceptedRed]),
      qaAccept(5, "tree-1"),
      checks(6, [cleanlinessRed(LINE)]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("review");
    expect(state.gateFix).toBeUndefined();
  });

  it("the finding comparison ignores line order", () => {
    const acceptedRed = cleanlinessRed(`${LINE}\n${SECOND_LINE}`);
    const records = [
      firstTurn,
      checks(2, [acceptedRed]),
      justifiedAnswer,
      checks(4, [acceptedRed]),
      qaAccept(5, "tree-1"),
      checks(6, [cleanlinessRed(`${SECOND_LINE}\n${LINE}`)]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("review");
  });
});

describe("a changed cleanliness red after QA reopens a fix", () => {
  it("a new finding line goes to a fix turn", () => {
    const records = [
      ...beforePostQaChecks("tree-1"),
      checks(6, [cleanlinessRed(`${LINE}\n${SECOND_LINE}`)]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("implement");
    expect(state.gateFix).toBe(true);
  });

  it("an unanswered red is never accepted", () => {
    const records = [
      firstTurn,
      checks(2, [cleanlinessRed()]),
      // The revision turn changed the tree but answered nothing.
      implement(
        3,
        { tree: "tree-2", commit: "c2", base: "c0" },
        { status: "done", summary: "", concerns: [], forward: [], replies: [] },
      ),
      checks(4, [cleanlinessRed()]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("implement");
    expect(state.gateFix).toBe(true);
  });
});

describe("an accepted cleanliness red does not excuse another charged red", () => {
  it("a new gate failure beside the accepted line goes to a fix", () => {
    const records = [
      ...beforePostQaChecks("tree-1"),
      checks(6, [
        cleanlinessRed(LINE, "new"),
        gate("typecheck", false, "TS2322: bad type", "new"),
      ]),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("implement");
    expect(state.gateFix).toBe(true);
  });

  it("an inherited red beside the accepted line keeps the hold", () => {
    const reds = [
      cleanlinessRed(LINE, "new"),
      gate("package", false, "(fail) suite > old case", "inherited"),
    ];
    const records = [
      firstTurn,
      checks(2, reds),
      justifiedAnswer,
      checks(4, reds),
      qaAccept(5, "tree-1"),
      checks(6, reds),
    ];
    const state = stateOf(records);
    expect(state.phase).toBe("review");
    expect(state.gateFix).toBeUndefined();
  });
});
