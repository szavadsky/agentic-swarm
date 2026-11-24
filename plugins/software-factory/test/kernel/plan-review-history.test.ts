import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { loadConfigs, packageRoot } from "../../src/kernel/config.js";
import { staleMergedFindings } from "../../src/kernel/pm.js";
import { dryRunPrompts } from "../../src/kernel/prompt-dry-run.js";
import { PLAN_RETURN_STEP } from "../../src/kernel/plan-review.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { simpleTask } from "./e2e-helpers.js";
import { ALIASES } from "./plan-review-fixtures.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

describe("merged plan history", () => {
  mergedBulletFindingsTest();
  mergedBulletRuleTest();
  mergedBulletReturnTest();
});

function mergedBulletFindingsTest(): void {
  it("flags a merged bullet still in full and leaves its collapsed and open siblings alone", () => {
    const plan = [
      "# Plan",
      "",
      "- `alpha` — Create alpha.",
      "  Done-when: alpha.txt exists.",
      "- `beta` — merged.",
      "- `gamma` — Create gamma.",
      "- `delta` — merged",
      "- `epsilon` — merged.",
      "  Unknown: leftover detail",
      "",
    ].join("\n");
    const merged = new Set(["alpha", "beta", "delta", "epsilon"]);

    expect(staleMergedFindings("plan.md", plan, merged)).toEqual([
      {
        planLine: "plan.md:3 (alpha)",
        finding:
          'merged task "alpha" is still carried in full; collapse it to the one line `- alpha — merged.` and keep its what and done-when in the records',
      },
      {
        planLine: "plan.md:8 (epsilon)",
        finding:
          'merged task "epsilon" is still carried in full; collapse it to the one line `- epsilon — merged.` and keep its what and done-when in the records',
      },
    ]);
  });
}

function mergedBulletRuleTest(): void {
  it("carries the merged-work rule once from one fragment in the dry-run prompts", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-plan-history-"),
    );
    try {
      const renders = dryRunPrompts(loadConfigs(root), root);
      const rule =
        "A merged task's bullet is history: the plan carries open work only.";
      const count = (text: string) => text.split(rule).length - 1;
      for (const name of ["architect", "subarchitect", "review-architect"]) {
        const text = renders.find((render) => render.name === name)?.text;
        expect(text, `${name} renders`).toBeDefined();
        expect(count(text!), `${name} carries the rule once`).toBe(1);
      }
      const owners = fs
        .readdirSync(path.join(packageRoot, "prompts"))
        .filter((file) => file.endsWith(".md"))
        .filter((file) =>
          fs
            .readFileSync(path.join(packageRoot, "prompts", file), "utf8")
            .includes(rule),
        );
      expect(owners).toEqual(["plan-history.md"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function mergedBulletReturnTest(): void {
  it("raises a merged bullet still in full on the plan return", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES_WITH_PACK });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, mergedBulletPlan(), "utf8");
      for (const slug of ["alpha", "beta"]) {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, `${slug}.md`),
          simpleTask(slug, `${slug}.txt`),
        );
      }
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "alpha" }),
        { ok: true, commit: "abc123" },
      );
      let returnPrompt = "";
      scriptMergedBulletFlow(harness, planPath, (prompt) => {
        returnPrompt = prompt;
      });

      const result = await runBoundary(runtime, { relaunch: false });
      expect(result.decision).toBe("continue");
      expect(returnPrompt).toContain("plan.md:3 (alpha)");
      expect(returnPrompt).toContain(
        'merged task "alpha" is still carried in full',
      );
      expect(returnPrompt).not.toContain('merged task "beta"');
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

const ALIASES_WITH_PACK = {
  ...ALIASES,
  digest: { harness: "fake", model: "fake-digest" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

/** A plan whose merged alpha bullet is still full and whose beta bullet is open. */
function mergedBulletPlan(): string {
  return [
    "# Plan",
    "",
    "- `alpha` — Create alpha.",
    "  Done-when: alpha.txt exists.",
    "- `beta` — Create beta.",
    "  Done-when: beta.txt exists.",
    "",
  ].join("\n");
}

/** Scripts the architect edit, the return on the stale bullet and the PM. */
function scriptMergedBulletFlow(
  harness: FakeHarness,
  planPath: string,
  onReturnPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(planPath, "\n## beta follows\n", "utf8");
      ctx.writeOutcome(
        outcome({ summary: "planned beta", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      onReturnPrompt(req.prompt);
      ctx.writeOutcome(
        outcome({
          summary: "collapsed the merged bullet",
          planReviewMarks: [{ finding: 1, mark: "helpful" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_RETURN_STEP }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}
