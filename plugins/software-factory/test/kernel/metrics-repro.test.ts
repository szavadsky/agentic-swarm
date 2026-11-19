import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { rec, script } from "./helpers.js";

describe("metrics test attribution", () => {
  it("credits script gate runs to the script, not the agent", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-metrics-repro-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, { step: "implement", model: { id: "model-a" } }),
        script(2, { step: "checks", ok: true, testRuns: 10 }),
        script(3, { step: "merge-checks", ok: true, testRuns: 2 }),
      ];
      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations[0]!;

      // Gate runs are the script's work; the implement turn keeps none.
      expect(one.roles["implementer"]!.testRuns).toBe(0);
      expect(one.models["model-a"]!.testRuns).toBe(0);
      expect(one.roles["script"]!.testRuns).toBe(12);
      expect(one.testRuns).toBe(12);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
