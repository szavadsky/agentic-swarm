import { describe, it, expect } from "bun:test";
import {
  extractAgentBody,
  extractJsonFromText,
} from "../../src/harness/omp/harness.js";

describe("OmpHarness helper functions", () => {
  it("extractAgentBody strips YAML frontmatter cleanly", () => {
    const withFrontmatter = `---
name: developer
tools: [bash, edit]
description: Developer agent
---

# Developer Instructions
Follow engineering philosophy.
`;
    expect(extractAgentBody(withFrontmatter)).toBe(
      "# Developer Instructions\nFollow engineering philosophy."
    );

    const withoutFrontmatter = "# Pure Agent\nNo frontmatter here.";
    expect(extractAgentBody(withoutFrontmatter)).toBe(withoutFrontmatter);
  });

  it("extractJsonFromText parses plain JSON, fenced JSON, and substring JSON", () => {
    // 1. Plain JSON
    expect(extractJsonFromText('{"status":"ok","count":42}')).toEqual({
      status: "ok",
      count: 42,
    });

    // 2. Fenced ```json ... ```
    const fenced = `
Here is the result:
\`\`\`json
{
  "status": "ok",
  "evidence": ["gate passed"]
}
\`\`\`
Done!
`;
    expect(extractJsonFromText(fenced)).toEqual({
      status: "ok",
      evidence: ["gate passed"],
    });

    // 3. Substring without fences
    const conversational = `
I have verified the results. The payload is:
{"status":"ok","items":["a","b"]}
Hope this helps.
`;
    expect(extractJsonFromText(conversational)).toEqual({
      status: "ok",
      items: ["a", "b"],
    });
  });

  it("extractJsonFromText throws when no JSON structure is found", () => {
    expect(() => extractJsonFromText("Not JSON at all")).toThrow();
  });
});
