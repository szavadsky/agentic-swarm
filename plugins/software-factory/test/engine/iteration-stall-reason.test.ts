import { describe, it, expect } from "bun:test";
import {
  MAX_ITERATION_REDRIVES,
  formatIterationStallReason,
  lastIterationFailureEvidence,
} from "../../src/core/flows/iteration.js";
import { isIterationTerminal, isWaveTerminal } from "../../src/core/derive/wave.js";
import type { JournalEvent } from "../../src/core/journal.js";

// (d) Plan-close-up refusal on ready stragglers. Decision: the refusal is
// CORRECT — `ready` means review-passed but UNMERGED, so closing the iteration
// would strand that work off the integration branch. The redrive merges ready
// items before re-deriving; repeated refusal is a real merge-verify stall. The
// fix is the stall report: name each status plus its last failure evidence
// instead of re-listing slugs with no reason.

describe("plan-close-up gate: ready items are iteration-open by design", () => {
  it("ready is wave-terminal but NOT iteration-terminal", () => {
    expect(isWaveTerminal("ready")).toBe(true);
    expect(isIterationTerminal("ready")).toBe(false);
    // Terminal statuses still pass the iteration gate.
    for (const status of ["merged", "failed", "blocked", "superseded"] as const) {
      expect(isIterationTerminal(status)).toBe(true);
    }
    expect(isIterationTerminal("running")).toBe(false);
    expect(isIterationTerminal("pending")).toBe(false);
  });

  it("uses a bounded re-drive budget", () => {
    expect(MAX_ITERATION_REDRIVES).toBe(5);
  });
});

describe("stall report carries per-item status and failure evidence", () => {
  const events: JournalEvent[] = [
    { ts: "1", type: "item_merge_failed", item: "cache-design-spike", error: "unknown gate target: x" },
    { ts: "2", type: "item_merge_failed", item: "golden-regen-hatch", error: "first failure" },
    { ts: "3", type: "merge_failed_terminal", item: "golden-regen-hatch", reason: "attempts exhausted" },
    { ts: "4", type: "item_merge_failed", item: "unrelated-item", error: "ignored" },
    { ts: "5", type: "step_finished", item: "cache-design-spike", status: "ok" },
  ];

  it("keeps the LAST actionable failure per requested item only", () => {
    const evidence = lastIterationFailureEvidence(events, ["cache-design-spike", "golden-regen-hatch"]);
    expect(evidence["cache-design-spike"]).toBe("unknown gate target: x");
    expect(evidence["golden-regen-hatch"]).toBe("attempts exhausted");
    expect(evidence["unrelated-item"]).toBeUndefined();
  });

  it("names statuses, evidence, the refusal reason, and the remediation", () => {
    const msg = formatIterationStallReason(
      5,
      [
        { slug: "cache-design-spike", status: "ready" },
        { slug: "consolidate-integration-helpers-v3", status: "running" },
      ],
      { "cache-design-spike": "target-green failed: unknown gate target" }
    );
    expect(msg).toContain("Iteration 5 stalled");
    expect(msg).toContain("cache-design-spike (ready; last failure: target-green failed: unknown gate target)");
    expect(msg).toContain("consolidate-integration-helpers-v3 (running; no failure evidence recorded)");
    expect(msg).toContain("Ready items are review-passed but UNMERGED");
    expect(msg).toContain("Refusing plan-close-up");
    expect(msg).toContain("Fix the named failure");
  });

  it("explains a mid-flow stall when no ready items are involved", () => {
    const msg = formatIterationStallReason(2, [{ slug: "x", status: "pending" }]);
    expect(msg).toContain("Pending/running items never reached a terminal state");
    expect(msg).not.toContain("Ready items are review-passed");
  });
});
