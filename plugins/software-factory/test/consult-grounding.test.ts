import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { buildConsultFailureContext } from "../src/core/flows/consult-context.js";
import { buildGateDiffSection } from "../src/core/checks/gates.js";
import { checkOutlineBudgets } from "../src/core/plan/limits.js";
import { checkStepAttempts } from "../src/core/loops.js";
import { isAwarenessAck } from "../src/core/steer.js";

// PsPost5 items 2/3/9 + ShPost3 consult-blindness/budget-hint/awareness-ack:
// consult context builder, gate diff builder, outline budget check,
// no-progress detector wiring, and ack detection.

describe("Consult grounding and plan-budget helpers (PsPost5/ShPost3)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("buildConsultFailureContext diffs parentBranch..HEAD and hydrates the failing check", async () => {
    fs.writeFileSync(path.join(tmpRepo.dir, "src.ts"), "line1\nline2\n", "utf8");
    const base = tmpRepo.commit("base");
    fs.writeFileSync(path.join(tmpRepo.dir, "src.ts"), "line1\nline2\nline3\n", "utf8");
    tmpRepo.commit("work");

    const recordDir = fs.mkdtempSync(path.join(tmpRepo.dir, "rec-"));
    fs.writeFileSync(
      path.join(recordDir, "checks.yaml"),
      JSON.stringify({
        checks: [
          { id: "size", status: "pass", message: "size passed: 1/300" },
          {
            id: "target-red",
            status: "fail",
            message: "Expected red test missing from suite: t::x. Command: pytest t::x",
            details: { command: "pytest t::x", junitCaseCount: 2, junitCaseIds: ["a", "b"] },
            output: "tail of output",
          },
        ],
      }),
      "utf8"
    );

    const ctx = await buildConsultFailureContext({
      wt: tmpRepo.dir,
      base,
      recordDir,
      fallbackError: "Step failed repeatedly",
    });
    expect(ctx.diffstat).toContain("src.ts");
    expect(ctx.failingCheckSummaries).toHaveLength(1);
    expect(ctx.failingCheckSummaries[0]).toContain("[target-red]");
    expect(ctx.feedbackText).toContain("Failing check: target-red");
    expect(ctx.feedbackText).toContain("pytest t::x");
    expect(ctx.feedbackText).toContain("tail of output");
    expect(ctx.feedbackText).not.toContain("Step failed repeatedly");
  });

  it("buildConsultFailureContext falls back to generic text without checks.yaml", async () => {
    const recordDir = fs.mkdtempSync(path.join(tmpRepo.dir, "rec-"));
    const ctx = await buildConsultFailureContext({
      wt: tmpRepo.dir,
      base: "HEAD",
      recordDir,
      fallbackError: "boom",
    });
    expect(ctx.failingCheckSummaries).toHaveLength(0);
    expect(ctx.feedbackText).toBe("boom");
  });

  it("buildGateDiffSection renders baseline-vs-now verdicts deterministically", () => {
    const baseline = {
      gates: [
        { id: "lint", status: "pass" as const },
        { id: "test", status: "fail" as const, failingTests: ["t1"] },
      ],
    };
    const section = buildGateDiffSection(baseline, [
      { id: "lint", command: "lint", status: "fail" },
      { id: "test", command: "test", status: "pass", improvements: ["t1"] },
    ]);
    expect(section).toContain("REGRESSION");
    expect(section).toContain("IMPROVED");
    expect(section).toContain("ONLY from this table");
    // Deterministic on empty baseline
    const empty = buildGateDiffSection(undefined, [{ id: "lint", status: "pass" }]);
    expect(empty).toContain("(no baseline entry)");
    expect(buildGateDiffSection(undefined, [{ id: "lint", status: "pass" }])).toBe(empty);
  });

  it("checkOutlineBudgets flags missing hints and over-budget hints", () => {
    const plan: any = {
      itemOutlines: [
        { slug: "a", kind: "dev", title: "A" },
        { slug: "b", kind: "dev", title: "B", prodBudgetHint: 359 },
        { slug: "c", kind: "dev", title: "C", prodBudgetHint: 100 },
        { slug: "s", kind: "fact-finder", title: "S" },
      ],
    };
    const warnings = checkOutlineBudgets(plan, { limits: { storyMaxProdLines: 300 } });
    expect(warnings.some((w) => w.includes('"a"') && w.includes("Advisory") && w.includes("no prodBudgetHint"))).toBe(true);
    expect(warnings.some((w) => w.includes('"b"') && w.includes("359") && w.includes("Advisory"))).toBe(true);
    expect(warnings.some((w) => w.includes('"c"'))).toBe(false);
    expect(warnings.some((w) => w.includes('"s"'))).toBe(false);
  });

  it("checkStepAttempts fires noProgress on same-failure-twice", () => {
    const fp = "abc123";
    expect(checkStepAttempts(2, 3, [fp], fp).noProgress).toBe(true);
    expect(checkStepAttempts(2, 3, [fp], fp).exhausted).toBe(false);
    expect(checkStepAttempts(2, 3, ["other"], fp).noProgress).toBe(false);
    expect(checkStepAttempts(2, 3, [fp]).noProgress).toBe(false);
  });

  it("isAwarenessAck matches bare acks only", () => {
    for (const ack of ["ack", "Ack.", "ok", "noted", "thanks", "LGTM", "will do"]) {
      expect(isAwarenessAck(ack)).toBe(true);
    }
    expect(isAwarenessAck("please change the plan to use tabs instead")).toBe(false);
    expect(isAwarenessAck("")).toBe(false);
    expect(isAwarenessAck("x".repeat(500))).toBe(false);
  });
});
