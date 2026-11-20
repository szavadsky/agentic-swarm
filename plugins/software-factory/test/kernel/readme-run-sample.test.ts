import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRunConfig } from "../../src/kernel/config.js";

const README = path.resolve(import.meta.dir, "../../README.md");
const RUN_HEADING = "**Run**";

/** The first fenced YAML block after `heading`, fence markers excluded. */
function sampleAfter(readme: string, heading: string): string {
  const at = readme.indexOf(heading);
  const open = at < 0 ? -1 : readme.indexOf("```yaml\n", at);
  const close = open < 0 ? -1 : readme.indexOf("\n```", open);
  if (close < 0) throw new Error(`README: no YAML sample under ${heading}`);
  return readme.slice(open + "```yaml\n".length, close + 1);
}

describe("README run-layer sample", () => {
  it("composes over its base and passes the strict run schema", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-readme-"));
    try {
      // The sample names `base.yaml`; the shipped base lives outside the
      // package, so the test stands in one whose key proves the merge ran.
      fs.writeFileSync(
        path.join(dir, "base.yaml"),
        "limits: { wallMinutes: 90 }\n",
      );
      fs.writeFileSync(
        path.join(dir, "run.yaml"),
        sampleAfter(fs.readFileSync(README, "utf8"), RUN_HEADING),
      );

      const run = loadRunConfig(path.join(dir, "run.yaml"));

      expect(run.limits.wallMinutes).toBe(90);
      expect(run.priceIds).not.toEqual({});
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
