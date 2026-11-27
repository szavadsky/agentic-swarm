import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  type ContextPackInput,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { packageRoot } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { task } from "./helpers.js";

/** A pack carrying every section whose heading now renders from a fragment. */
function packInput(): ContextPackInput {
  const tasks = [task("alpha")];
  return {
    goal: "demo",
    iteration: 3,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks,
    state: derive(tasks, []),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [
      {
        id: "r1#1",
        text: "tidy the register",
        calibration: "architect",
        source: "alpha implement r1",
        iteration: 1,
        seq: 1,
      },
    ],
    planReview: {
      iteration: 2,
      reviewers: ["reviewer"],
      technical: [{ planLine: "step 1", finding: "name the test" }],
      planNotes: [],
    },
    codeMap: ["src/kernel/ — 8 files"],
    spikeProposals: [
      {
        reason: "implementerFailure",
        label: "complete implementer failure",
        count: 3,
        iterations: [1],
        threshold: 3,
      },
    ],
  };
}

describe("context pack prompt fragments", () => {
  it("renders the instruction headings and rule unchanged", () => {
    const pack = renderContextPack(packInput());
    expect(pack).toContain(
      "## Plan review (advisory findings; mark each finding helpful or unhelpful in planReviewMarks)",
    );
    expect(pack).toContain("## Code map (shallow; read paths directly)");
    expect(pack).toContain(
      "## Debt register (open debt-kind concerns; own one by citing its id in a plan bullet, or close it with `debtClosed: [{id, reason}]`)",
    );
    expect(pack).toContain(
      "- each line is a proposal, never a task: plan a spike into the cause, or a named fix",
    );
  });

  it("renders pack headings through the supplied prompt library", () => {
    const library = loadPromptLibrary({
      builtinDir: path.join(packageRoot, "prompts"),
      overrides: { "pack-debt-register": "## Custom debt register" },
    });
    const pack = renderContextPack(packInput(), library);
    expect(pack).toContain("## Custom debt register");
    expect(pack).not.toContain(
      "## Debt register (open debt-kind concerns; own one by citing its id in a plan bullet, or close it with `debtClosed: [{id, reason}]`)",
    );
  });
});
