import { describe, it, expect } from "bun:test";
import path from "node:path";
import { formatAmendLimitsBlock } from "../../src/core/plan/limits.js";
import { KNOWN_VARS } from "../../src/core/prompt-vars.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineLimits } from "../../src/core/artifacts.js";

// (c) PM amend cap awareness. Three amendments were rejected with "Total items
// (52) exceeds maximum items limit of 50" because the pm-amend fragment never
// saw the limits or the cap rule — the delta counts against existing history,
// and unknown/intra-wave deps fail too. Teach the fragment and pass the numbers.

describe("formatAmendLimitsBlock: remaining item budget for the delta", () => {
  it("states existing count, cap, and remaining new-item allowance", () => {
    const limits: PipelineLimits = { maxItemsPerPlan: 50, maxAmendmentsPerIteration: 2 };
    const block = formatAmendLimitsBlock(limits, 44);
    expect(block).toContain('"maxItemsPerPlan": 50');
    expect(block).toContain("44 item(s) already exist in task history");
    expect(block).toContain("this delta may add at most 6 NEW item(s)");
    expect(block).toContain("at most 2 amendment(s) per iteration");
  });

  it("clamps to zero when history already meets or exceeds the cap", () => {
    expect(formatAmendLimitsBlock({ maxItemsPerPlan: 50 }, 52)).toContain(
      "at most 0 NEW item(s)"
    );
    expect(formatAmendLimitsBlock({}, 50)).toContain("maxItemsPerPlan=50");
    expect(formatAmendLimitsBlock({}, 50)).toContain("at most 0 NEW item(s)");
  });
});

describe("pm-amend fragment: cap + dependency validity rules reach the PM", () => {
  const lib = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents") });

  it("declares limits and limitViolations for pm-amend in both key forms", () => {
    for (const key of ["steps/pm-amend", "pm-amend"]) {
      expect(KNOWN_VARS[key]).toContain("limits");
      expect(KNOWN_VARS[key]).toContain("limitViolations");
    }
  });

  it("renders the item budget and the dependency rules into the prompt", () => {
    const rendered = lib.render("steps/pm-amend", {
      plan: "PLAN",
      taskStatus: "STATUS",
      feedback: "FEEDBACK",
      waveReport: "REPORT",
      limits: formatAmendLimitsBlock({ maxItemsPerPlan: 50, maxAmendmentsPerIteration: 2 }, 44),
      limitViolations: "none",
    });
    expect(rendered).toContain("Item cap");
    expect(rendered).toContain("TOGETHER with every item that already exists");
    expect(rendered).toContain("this delta may add at most 6 NEW item(s)");
    expect(rendered).toContain("NEVER put an outline slug, an epic slug");
    expect(rendered).toContain("unknown dependencies fail validation");
    expect(rendered).toContain("never depend on the same wave");
    expect(rendered).toContain("## Limits");
    expect(rendered).toContain("## Limit Violations");
  });
});
