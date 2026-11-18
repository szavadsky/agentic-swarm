import { describe, expect, it } from "bun:test";
import { stepFingerprint } from "../../src/kernel/progress.js";
import { rec } from "./helpers.js";

function step(
  seq: number,
  tree: string,
  round = 1,
  verdict?: "approve" | "changes",
) {
  return rec(seq, {
    slug: "task",
    step: "implement",
    round,
    tree,
    outcome: {
      status: "done",
      summary: "step",
      concerns: [],
      forward: [],
      ...(verdict ? { verdict } : {}),
    },
  });
}

describe("no-progress fingerprints", () => {
  it("distinguishes the outcomes and trees of a round and matches a repeated step", () => {
    const a1 = stepFingerprint("development", step(1, "tree-a"), undefined);
    const b1 = stepFingerprint("development", step(2, "tree-b"), undefined);
    const a2 = stepFingerprint("development", step(3, "tree-a"), undefined);
    const b2 = stepFingerprint("development", step(4, "tree-b"), undefined);
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
    expect(a1).not.toBe(b1);

    const changedVerdict = stepFingerprint(
      "development",
      step(5, "tree-a", 1, "changes"),
      undefined,
    );
    expect(changedVerdict).not.toBe(a1);

    const failed = stepFingerprint(
      "development",
      {
        ...step(6, "tree-a"),
        outcome: {
          status: "failed",
          summary: "step",
          concerns: [],
          forward: [],
        },
      },
      undefined,
    );
    expect(failed).not.toBe(a1);
  });
});
