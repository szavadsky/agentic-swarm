import { describe, expect, it } from "bun:test";
import { unifiedDiff } from "../../src/kernel/intent-diff.js";

const NOTE = "# Goal\n\nTest goal.\nDrop the export requirement.\n";

function numbered(count: number): string {
  const lines = Array.from(
    { length: count },
    (_, index) => `line ${index + 1}`,
  );
  return `${lines.join("\n")}\n`;
}

/** The `@@ ... @@` headings in the diff's order. */
function hunkHeaders(diff: string): string[] {
  return diff.split("\n").filter((line) => line.startsWith("@@ "));
}

describe("intent unified diff", () => {
  it("shows the note's final newline as the trailing context line", () => {
    const after = NOTE.replace(
      "Drop the export requirement.",
      "Export is in scope.",
    );
    expect(unifiedDiff(NOTE, after, "intent.md")).toBe(
      [
        "--- intent.md",
        "+++ intent.md",
        "@@ -1,5 +1,5 @@",
        " # Goal",
        " ",
        " Test goal.",
        "-Drop the export requirement.",
        "+Export is in scope.",
        " ",
      ].join("\n"),
    );
  });

  it("keeps separate hunks when more than six unchanged lines separate the changes", () => {
    const before = numbered(20);
    const after = before
      .replace("line 3\n", "line three\n")
      .replace("line 11\n", "line eleven\n");
    const diff = unifiedDiff(before, after, "INTENT.md");
    expect(hunkHeaders(diff)).toEqual(["@@ -1,6 +1,6 @@", "@@ -8,7 +8,7 @@"]);
    expect(diff).toContain("-line 3\n+line three\n");
    expect(diff).toContain("-line 11\n+line eleven\n");
  });

  it("merges changes six unchanged lines apart into one hunk", () => {
    const before = numbered(20);
    const after = before
      .replace("line 3\n", "line three\n")
      .replace("line 10\n", "line ten\n");
    const diff = unifiedDiff(before, after, "INTENT.md");
    expect(hunkHeaders(diff)).toEqual(["@@ -1,13 +1,13 @@"]);
    expect(diff).toContain(" line 7\n line 8\n line 9\n");
  });

  it("diffs text without a trailing newline without a no-newline marker", () => {
    expect(unifiedDiff("a\nb\nc", "a\nB\nc", "intent.md")).toBe(
      [
        "--- intent.md",
        "+++ intent.md",
        "@@ -1,3 +1,3 @@",
        " a",
        "-b",
        "+B",
        " c",
      ].join("\n"),
    );
  });
});
