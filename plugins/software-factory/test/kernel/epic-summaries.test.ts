import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { latestEpicSummaries } from "../../src/kernel/epic-summary.js";
import { createFolderStore } from "../../src/kernel/store.js";

/** One epic summary in the shape `writeEpicSummaries` writes it. */
function summary(
  iteration: number,
  epic: string,
  rollup: string | undefined,
): string {
  return [
    `# Iteration ${iteration} summary — epic \`${epic}\``,
    "",
    "status: in-progress",
    "decision: continue",
    `architect: ${epic}`,
    "",
    ...(rollup === undefined ? [] : ["## Epic", `- summary: ${rollup}`, ""]),
    "## Tasks",
    "- pending (0): none",
    "",
    "## Concerns",
    "- none",
    "",
    "## Upward brief",
    "- none",
    "",
  ].join("\n");
}

describe("epic summary links", () => {
  it("links each epic's latest summary and skips an epic with none", async () => {
    const goalDir = fs.mkdtempSync(path.join(os.tmpdir(), "epic-summaries-"));
    try {
      const store = createFolderStore(goalDir, undefined, {});
      const write = (iteration: number, epic: string, rollup?: string) =>
        store.writeFile(
          `iterations/${iteration}/epics/${epic}/summary.md`,
          summary(iteration, epic, rollup),
        );
      await write(1, "alpha", "  alpha   shipped ");
      await write(1, "beta", "beta shipped");
      await write(2, "beta", "beta fixed");
      await write(2, "delta");

      const refs = await latestEpicSummaries(store, 3, {
        epics: {
          alpha: { tasks: [], done: true },
          beta: { tasks: [], done: false },
          delta: { tasks: [], done: false },
          gamma: { tasks: [], done: false },
        },
      });

      expect(refs).toEqual([
        {
          epic: "alpha",
          path: path.join(goalDir, "iterations/1/epics/alpha/summary.md"),
          rollup: "alpha shipped",
        },
        {
          epic: "beta",
          path: path.join(goalDir, "iterations/2/epics/beta/summary.md"),
          rollup: "beta fixed",
        },
        {
          epic: "delta",
          path: path.join(goalDir, "iterations/2/epics/delta/summary.md"),
        },
      ]);
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  });
});
