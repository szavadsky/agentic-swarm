import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { renderSkeleton } from "../../src/kernel/prompt-schema.js";

describe("prompt schema block scalars", () => {
  it("renders a free-text leaf and the field holding it as block scalars", () => {
    const report = z.object({
      summary: z.string().describe("one paragraph"),
      replies: z.array(
        z.object({ finding: z.number().int(), reply: z.string() }),
      ),
      plain: z.string(),
    });
    expect(renderSkeleton(report)).toBe(
      [
        "summary: |",
        "  one paragraph",
        "replies:",
        "  - finding: 0",
        "    reply: |",
        "      ...",
        "plain: ...",
      ].join("\n"),
    );
  });

  it("refuses free text the block form cannot indent", () => {
    const report = z.object({
      replies: z.array(
        z.object({
          reply: z.string(),
          inner: z.object({ summary: z.string() }),
        }),
      ),
    });
    expect(() => renderSkeleton(report)).toThrow(
      "skeleton cannot nest free text under inner",
    );
  });
});
