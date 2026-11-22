import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task } from "./helpers.js";

function outcome(summary = "ok") {
  return { status: "done" as const, summary, concerns: [], forward: [] };
}

function fixtureRecordsPart1() {
  return [
    rec(1, {
      step: "architect",
      slug: undefined,
      outcome: outcome("planned"),
    }),
    rec(2, {
      step: "pm",
      slug: undefined,
      outcome: outcome("reconciled"),
    }),
    rec(3, {
      step: "implement",
      slug: "a",
      outcome: outcome("implemented"),
    }),
    rec(4, {
      step: "review",
      slug: "a",
      outcome: outcome("approved"),
    }),
    script(5, { slug: "a", step: "merge", ok: true }),
  ];
}

function fixtureRecordsPart3() {
  return [
    rec(1, {
      step: "architect",
      slug: undefined,
      stop: { kind: "infra", cause: "timeout", details: "idle 30m" },
    }),
    rec(2, {
      step: "architect",
      slug: undefined,
      stop: { kind: "cancelled" },
    }),
    rec(3, {
      step: "implement",
      slug: "a",
      outcome: outcome("implemented"),
    }),
  ];
}

function fixtureRecordsPart4() {
  const records1 = [
    rec(1, {
      iteration: 1,
      step: "architect",
      slug: undefined,
      outcome: outcome("planned"),
    }),
    rec(2, {
      iteration: 1,
      step: "implement",
      slug: "a",
      outcome: outcome("implemented"),
    }),
  ];
  const records2 = [
    ...records1,
    rec(3, {
      iteration: 2,
      step: "architect",
      slug: undefined,
      outcome: outcome("planned"),
    }),
    rec(4, {
      iteration: 2,
      step: "pm",
      slug: undefined,
      outcome: outcome("reconciled"),
    }),
    rec(5, {
      iteration: 2,
      step: "implement",
      slug: "b",
      outcome: outcome("implemented"),
    }),
    rec(6, {
      iteration: 2,
      step: "review",
      slug: "b",
      outcome: outcome("approved"),
    }),
  ];
  return { records1, records2 };
}

function registerArchitectTurnSharePart1(): void {
  it("records architect turn count and share in per-iteration metrics and summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-turn-share-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = fixtureRecordsPart1();
      const state = derive([task("a")], records);

      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });

      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations[0]!;
      expect(one.turns).toBe(4);
      expect(one.architect.turns).toBe(1);
      expect(one.architect.turnShare).toBe(0.25);

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(summary).toContain(
        "- turns: 4 agent, 1 script; architect share 25.0%",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerArchitectTurnSharePart2(): void {
  it("sets share 0 and keeps the field when an iteration has no architect turn", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-turn-share-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          step: "implement",
          slug: "a",
          outcome: outcome("implemented"),
        }),
        rec(2, {
          step: "review",
          slug: "a",
          outcome: outcome("approved"),
        }),
      ];
      const state = derive([task("a")], records);

      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });

      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations[0]!;
      expect(one.turns).toBe(2);
      expect(one.architect.turns).toBe(0);
      expect(one.architect.turnShare).toBe(0);

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(summary).toContain(
        "- turns: 2 agent, 0 script; architect share 0.0%",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerArchitectTurnSharePart3(): void {
  it("counts cancelled or infra-stopped architect turns as turns", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-turn-share-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = fixtureRecordsPart3();
      const state = derive([task("a")], records);

      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });

      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations[0]!;
      expect(one.turns).toBe(3);
      expect(one.architect.turns).toBe(2);
      expect(one.architect.turnShare).toBeCloseTo(2 / 3, 10);

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(summary).toContain(
        "- turns: 3 agent, 0 script; architect share 66.7%",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerArchitectTurnSharePart4(): void {
  it("aggregates turn counts across goal totals rather than averaging shares", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-turn-share-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const { records1, records2 } = fixtureRecordsPart4();
      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records: records1,
      });
      await writeMetrics(store, {
        iteration: 2,
        status: "goal-met",
        records: records2,
      });

      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations).toHaveLength(2);
      expect(metrics.iterations[0]!.architect.turnShare).toBe(0.5);
      expect(metrics.iterations[1]!.architect.turnShare).toBe(0.25);

      // Totals: (1 + 1) / (2 + 4) = 2/6 = 33.333% (NOT (0.5 + 0.25)/2 = 37.5%)
      expect(metrics.totals.turns).toBe(6);
      expect(metrics.totals.architect.turns).toBe(2);
      expect(metrics.totals.architect.turnShare).toBeCloseTo(2 / 6, 10);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("architect turn share", () => {
  registerArchitectTurnSharePart1();
  registerArchitectTurnSharePart2();
  registerArchitectTurnSharePart3();
  registerArchitectTurnSharePart4();
});
