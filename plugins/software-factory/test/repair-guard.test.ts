import { describe, it, expect } from "bun:test";
import { validateAndRepair, checkLeafValuePresence } from "../src/core/records/repair.js";
import { generateReviewSchema } from "../src/core/records/review-schema.js";

describe("Output repair pipeline & leaf-value presence guard (§6.4)", () => {
  const reviewSchema = generateReviewSchema(["fix", "optional", "architect"]);

  it("accepts valid JSON output directly", async () => {
    const validJson = JSON.stringify({
      status: "approved",
      summary: "All checks passed cleanly.",
      suggestions: [],
    });

    const result = await validateAndRepair({
      rawOutput: validJson,
      schema: reviewSchema,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe("direct");
      expect((result.data as any).status).toBe("approved");
    }
  });

  it("accepts structural repair when all leaf values were present in raw output", async () => {
    // Malformed output missing brackets, but text contains status "changes_requested"
    const rawBrokenOutput = `
      status: changes_requested
      summary: Found issues in implementation
      suggestions:
        - id: s1
          disposition: fix
          summary: Fix off-by-one error
    `;

    const result = await validateAndRepair({
      rawOutput: rawBrokenOutput,
      schema: reviewSchema,
      completeSimpler: async () => ({
        status: "changes_requested",
        summary: "Found issues in implementation",
        suggestions: [
          {
            id: "s1",
            disposition: "fix",
            summary: "Fix off-by-one error",
          },
        ],
      }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe("simpler_repair");
      expect((result.data as any).status).toBe("changes_requested");
    }
  });

  it("REJECTS repair when @simpler invents a verdict/status not present in raw output", async () => {
    // Raw output is uninformative or lacks a verdict/status entirely
    const rawAmbiguousOutput = "The code looks somewhat okay, check line 40.";

    // Simpler tries to 'repair' by inventing status: "approved"
    const result = await validateAndRepair({
      rawOutput: rawAmbiguousOutput,
      schema: reviewSchema,
      completeSimpler: async () => ({
        status: "approved", // "approved" does NOT appear anywhere in rawAmbiguousOutput!
        summary: "The code looks somewhat okay, check line 40.",
        suggestions: [],
      }),
    });

    // Guard MUST reject the invented verdict
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Repair rejected by leaf-value guard");
      expect(result.error).toContain("approved");
    }
  });

  it("leaf presence checker accurately spots missing status token", () => {
    const repaired = {
      status: "approved",
      summary: "Good progress",
    };

    // Raw text missing "approved"
    const guardFail = checkLeafValuePresence(repaired, "Good progress, continuing work");
    expect(guardFail.ok).toBe(false);
    expect(guardFail.missingLeaf?.value).toBe("approved");

    // Raw text containing "approved"
    const guardPass = checkLeafValuePresence(repaired, "Overall approved. Good progress.");
    expect(guardPass.ok).toBe(true);
  });
});
