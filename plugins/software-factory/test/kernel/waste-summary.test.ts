// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  renderContextData,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { summaryWaste } from "../../src/kernel/waste-summary.js";
import { rec, task } from "./helpers.js";

function pathOf(records: readonly StepRecord[], seq: number): string {
  const turn = records.find((record) => record.seq === seq)!;
  return `records/${recordDirName(turn.seq, turn)}`;
}

describe("waste summary", () => {
  it("carries the summary's waste section into the next pack's data and render", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-waste-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          slug: "alpha",
          step: "implement",
          round: 1,
          alias: "implementer",
          stop: { kind: "infra", cause: "network", details: "reset" },
        }),
      ];
      await writeIterationSummary(store, {
        iteration: 1,
        state: derive([task("alpha")], records),
        records,
        status: "in-progress",
      });
      const summary = (await store.readFile("iterations/1/summary.md"))!;
      const previousWaste = summaryWaste(summary);
      expect(previousWaste).toContain(pathOf(records, 1));
      expect(previousWaste).not.toContain("## Waste");

      const tasks = [task("alpha")];
      const input = {
        goal: "demo",
        iteration: 2,
        intentPath: "/goal/intent.md",
        planPath: "/goal/plan.md",
        checkout: "/wt/demo",
        integrationBranch: "factory/demo",
        headHash: "abcdef1234567890",
        recordsDir: "/goal/records",
        tasksDir: "/goal/tasks",
        previousSummary: "/goal/iterations/1/summary.md",
        previousWaste,
        tasks,
        state: derive(tasks, records),
        steers: [],
        setup: [],
        gates: [],
        forwarded: [],
        debts: [],
      };
      const pack = renderContextPack(input);
      expect(pack).toContain("## Waste (previous iteration summary)");
      expect(pack).toContain(pathOf(records, 1));
      expect(pack).toContain(
        `${pathOf(records, 1)}: implementer/implementer (implement r1) — structure: infra — infra: network (reset)`,
      );
      const data = JSON.parse(renderContextData(input)) as {
        paths: { previousWaste: string | null };
      };
      expect(data.paths.previousWaste).toContain(pathOf(records, 1));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("has no waste section to extract from an older summary", () => {
    expect(
      summaryWaste("# Iteration 1 summary\n\n## Metrics\n- turns: 1\n"),
    ).toBe(undefined);
    expect(summaryWaste("## Waste\n\n## Metrics\n- turns: 1\n")).toBe(
      undefined,
    );
  });
});
