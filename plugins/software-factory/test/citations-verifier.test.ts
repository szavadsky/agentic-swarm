import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { verifyCitation, verifyCitations } from "../src/core/records/citations.js";
import type { Citation } from "../src/core/artifacts.js";

describe("Citation verifier (§8.1.2)", () => {
  let tempDir: string;
  const sampleContent = [
    "// Header comments",
    "export function calculateTotal(items: number[]): number {",
    "  let sum = 0;",
    "  for (const item of items) {",
    "    sum += item;",
    "  }",
    "  return sum;",
    "}",
    "// Footer notes with specialAnchor",
  ].join("\n");

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-citation-test-"));
    fs.writeFileSync(path.join(tempDir, "sample.ts"), sampleContent, "utf8");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("verifies citation when file, lines, and anchors match", () => {
    const validCitation: Citation = {
      file: "sample.ts",
      lines: "2-7",
      anchors: ["calculateTotal", "return sum"],
      summary: "Function summing an array of numbers",
    };

    const failure = verifyCitation(validCitation, tempDir);
    expect(failure).toBeNull();
  });

  it("rejects citation when file does not exist", () => {
    const citation: Citation = {
      file: "nonexistent.ts",
      lines: "1-5",
      anchors: ["calculateTotal"],
      summary: "Missing file",
    };

    const failure = verifyCitation(citation, tempDir);
    expect(failure).not.toBeNull();
    expect(failure?.reason).toBe("file_not_found");
  });

  it("rejects citation when line range is out of range", () => {
    // sample.ts has 9 lines; lines 10-20 are out of range
    const citation: Citation = {
      file: "sample.ts",
      lines: "10-20",
      anchors: [],
      summary: "Out of bounds lines",
    };

    const failure = verifyCitation(citation, tempDir);
    expect(failure).not.toBeNull();
    expect(failure?.reason).toBe("out_of_range");
  });

  it("rejects citation when anchor is not within the specified line range", () => {
    // "specialAnchor" is on line 9, NOT in lines 2-5!
    const citation: Citation = {
      file: "sample.ts",
      lines: "2-5",
      anchors: ["specialAnchor"],
      summary: "Anchor outside specified range",
    };

    const failure = verifyCitation(citation, tempDir);
    expect(failure).not.toBeNull();
    expect(failure?.reason).toBe("missing_anchor");
    expect(failure?.message).toContain("specialAnchor");
  });

  it("verifyCitations separates valid and failed citations", () => {
    const citations: Citation[] = [
      {
        file: "sample.ts",
        lines: "2-4",
        anchors: ["calculateTotal"],
        summary: "Valid one",
      },
      {
        file: "sample.ts",
        lines: "50-60",
        anchors: [],
        summary: "Invalid out of range",
      },
    ];

    const result = verifyCitations(citations, tempDir);
    expect(result.valid.length).toBe(1);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.reason).toBe("out_of_range");
  });
});
