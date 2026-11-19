import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { cleanup, expectLaunch, makeGoal } from "./e2e-helpers.js";

describe("repair config", () => {
  it("renders the template a step names and names that step's deliverable", async () => {
    const goal = makeGoal({
      classYaml: null,
      processYaml: [
        "boundary:",
        "  front: { prompt: front, alias: pm, repairPrompt: widget-repair, deliverable: widgets }",
        "",
      ].join("\n"),
    });
    try {
      goal.repo.writeFile(
        ".factory/prompts/widget-repair.md",
        [
          "Ask for the {{deliverable}} at {{outcome_path}}.",
          "",
          "{{findings}}",
          "",
          "{% include 'outcome' %}",
          "",
        ].join("\n"),
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => fakeTurnResult(req, { text: "nothing" }));
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      await expectLaunch(1, goal.repo, harness);

      expect(harness.calls).toHaveLength(2);
      expect(harness.calls[1]!.prompt).toContain("Ask for the widgets at");
      expect(harness.calls[1]!.prompt).toContain(
        "missing deliverable: widgets",
      );
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("missing deliverable: widgets");
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("renders the process default template when a step names none", async () => {
    const goal = makeGoal({
      classYaml: null,
      processYaml: "repairPrompt: widget-repair\n",
    });
    try {
      goal.repo.writeFile(
        ".factory/prompts/widget-repair.md",
        "Ask for the {{deliverable}} at {{outcome_path}}.\n\n{{findings}}\n\n{% include 'outcome' %}\n",
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => fakeTurnResult(req, { text: "nothing" }));
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      await expectLaunch(1, goal.repo, harness);

      expect(harness.calls).toHaveLength(2);
      expect(harness.calls[1]!.prompt).toContain(
        "Ask for the class, task, and pack at",
      );
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
