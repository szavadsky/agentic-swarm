import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { dispatch } from "../../src/cli/index.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { addUsage, zeroUsage } from "../../src/harness/usage.js";
import type { Usage } from "../../src/harness/types.js";
import { modelPriceSchema, runConfigSchema } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { writeMetrics, type GoalMetrics } from "../../src/kernel/metrics.js";
import { priceUsage, type PriceTable } from "../../src/kernel/pricing.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task } from "./helpers.js";

const TABLE: PriceTable = {
  "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
  "free/zero": { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
};

function usage(patch: Partial<Usage> = {}): Usage {
  return {
    in: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
    ...patch,
  };
}

describe("price usage at aggregation time", () => {
  it("prices every token counter at its table rate per Mtok", () => {
    const cost = priceUsage(
      usage({
        in: 1_000_000,
        cacheRead: 2_000_000,
        cacheWrite5m: 500_000,
        cacheWrite1h: 500_000,
        out: 1_000_000,
        reasoningOut: 1_000_000,
      }),
      "paid/one",
      TABLE
    );
    // input 4 + cached 0.4 + writes 4 (1M at the input rate) + output 20 + reasoning 20.
    expect(cost).toBeCloseTo(48.4, 10);
  });

  it("keeps known zero distinct from unknown and lets a non-zero harness cost win", () => {
    expect(priceUsage(usage({ costUsd: 0 }), "free/zero", TABLE)).toBe(0);
    expect(priceUsage(usage({ costUsd: 0 }), "mystery/model", TABLE)).toBe(0);
    expect(priceUsage(usage({ costUsd: 0.05, in: 1_000_000 }), "paid/one", TABLE)).toBe(0.05);
    expect(priceUsage(usage({ in: 1_000_000 }), "mystery/model", TABLE)).toBeUndefined();
    expect(priceUsage(usage({ in: 1 }), "free/zero", TABLE)).toBe(0);
  });

  it("reprices a harness zero that contradicts a table entry", () => {
    // opencode reports a literal 0 for turns it cannot price; the table fills it in.
    expect(priceUsage(usage({ costUsd: 0, in: 1_000_000 }), "paid/one", TABLE)).toBeCloseTo(4, 10);
    // An explicit free entry still yields a known zero.
    expect(priceUsage(usage({ costUsd: 0, in: 1_000_000 }), "free/zero", TABLE)).toBe(0);
  });

  it("sums costs without turning a known zero into unknown", () => {
    expect(addUsage(zeroUsage(), usage({ costUsd: 0 })).costUsd).toBe(0);
    expect(addUsage(zeroUsage(), zeroUsage()).costUsd).toBeUndefined();
    expect(addUsage(usage({ costUsd: 0.2 }), usage({ costUsd: 0 })).costUsd).toBe(0.2);
  });
});

describe("priced metrics and summary", () => {
  it("prices per-role cost and counts unpriced turns in metrics", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      const records = [
        rec(1, { step: "architect", slug: undefined, model: { id: "paid/one" }, usage: usage({ in: 1_000_000 }) }),
        rec(2, { slug: "a", model: { id: "free/zero" }, usage: usage({ in: 1_000_000 }) }),
        rec(3, { slug: "a", step: "review", model: { id: "mystery/model" }, usage: usage({ in: 1_000_000 }) }),
        // A harness zero on a paid model is repriced from its tokens.
        rec(4, {
          step: "pm",
          slug: undefined,
          model: { id: "paid/one" },
          usage: usage({ costUsd: 0, in: 1_000_000 }),
        }),
        // A harness figure for a model outside the table is still known.
        rec(5, { step: "digest", slug: undefined, model: { id: "mystery/model" }, usage: usage({ costUsd: 0.05 }) }),
        script(6, { slug: "a", step: "merge", ok: true }),
      ];

      await writeMetrics(store, { iteration: 1, status: "in-progress", records, prices: TABLE });
      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      const one = metrics.iterations[0]!;

      expect(one.roles.architect!.usage.costUsd).toBeCloseTo(4, 10);
      expect(one.roles.implementer!.usage.costUsd).toBe(0);
      expect(one.roles.reviewer!.usage.costUsd).toBeUndefined();
      expect(one.roles.reviewer!.unpricedTurns).toBe(1);
      expect(one.roles.pm!.usage.costUsd).toBeCloseTo(4, 10);
      expect(one.roles.digest!.usage.costUsd).toBeCloseTo(0.05, 10);
      expect(one.unpricedTurns).toBe(1);
      expect(one.usage.costUsd).toBeCloseTo(8.05, 10);
      expect(one.costPerMergedTask).toBeNull();
      expect(one.architect.costShare).toBeCloseTo(4 / 8.05, 10);
      expect(metrics.totals.unpricedTurns).toBe(1);
      expect(metrics.totals.usage.costUsd).toBeCloseTo(8.05, 10);

      // Aggregation prices copies; the records themselves stay raw.
      expect(records[0]!.usage?.costUsd).toBeUndefined();
      expect(records[1]!.usage?.costUsd).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows per-role priced cost and unknown with an unpriced count in the summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      const records = [
        rec(1, { step: "architect", slug: undefined, model: { id: "paid/one" }, usage: usage({ in: 1_000_000 }) }),
        rec(2, { slug: "a", model: { id: "free/zero" }, usage: usage({ in: 1_000_000 }) }),
        rec(3, { slug: "a", step: "review", model: { id: "mystery/model" }, usage: usage({ in: 1_000_000 }) }),
        script(4, { slug: "a", step: "merge", ok: true }),
      ];
      const state = derive([task("a")], records);

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
        prices: TABLE,
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");

      expect(text).toContain("- cost: $4.0000 (partial; 1 unpriced turn)");
      expect(text).toContain(
        "- cost by role: architect $4.0000; implementer $0.0000; reviewer unknown (1 unpriced turn)"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("says unknown rather than $0 when every turn is unpriced", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      const records = [
        rec(1, { step: "architect", slug: undefined, model: { id: "mystery/one" }, usage: usage({ in: 10 }) }),
        rec(2, { slug: "a", model: { id: "mystery/two" }, usage: usage({ in: 20 }) }),
      ];
      const state = derive([task("a")], records);

      await writeMetrics(store, { iteration: 1, status: "in-progress", records });
      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      expect(metrics.iterations[0]!.usage.costUsd).toBeUndefined();
      expect(metrics.iterations[0]!.unpricedTurns).toBe(2);
      expect(metrics.iterations[0]!.costPerMergedTask).toBeNull();

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(text).toContain("- cost: unknown (2 unpriced turns)");
      expect(text).toContain(
        "- cost by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)"
      );
      expect(text).not.toContain("- cost: $0.0000");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pricing in a launch", () => {
  it("wires the run-config table into the summary and metrics of an unpriced turn", async () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n"
      );
      const base = path.basename(repo.dir);
      repo.writeFile(
        ".factory/run.yaml",
        [
          "aliases:",
          "  architect: { harness: fake, model: paid/one }",
          "  pm: { harness: fake, model: paid/one }",
          "  implementer: { harness: fake, model: paid/one }",
          "  reviewer: { harness: fake, model: paid/one }",
          "prices:",
          "  paid/one: { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 }",
          "limits: { iterations: 1, concurrency: 1 }",
          `worktreeRoot: ../${base}-wt`,
          `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
          "",
        ].join("\n")
      );
      repo.commit("factory config");
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      fs.mkdirSync(goalDir, { recursive: true });
      fs.writeFileSync(path.join(goalDir, "intent.md"), "# Goal\n\nPrice the run.\n", "utf8");

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "nothing to do", concerns: [], forward: [], decision: "done" });
        // Mirror opencode: the harness reports a literal 0 it cannot price.
        return fakeTurnResult(req, { usage: usage({ in: 1_000_000, out: 1_000_000, costUsd: 0 }) });
      });

      const code = await dispatch(["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"], {
        harnesses: { fake: harness },
      });
      expect(code).toBe(0);

      const store = createFolderStore(goalDir);
      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as GoalMetrics;
      expect(metrics.iterations[0]!.usage.costUsd).toBeCloseTo(24, 10);
      expect(metrics.iterations[0]!.roles.architect!.usage.costUsd).toBeCloseTo(24, 10);
      expect(metrics.iterations[0]!.unpricedTurns).toBe(0);

      const summary = (await store.readFile("iterations/1/summary.md"))!;
      expect(summary).toContain("- cost: $24.0000");
      expect(summary).toContain("- cost by role: architect $24.0000");
    } finally {
      repo.cleanup();
    }
  }, 60_000);
});

describe("run-config price table", () => {
  it("requires every rate and prices every model the self run uses", () => {
    expect(runConfigSchema.parse({}).prices).toEqual({});
    expect(() =>
      modelPriceSchema.parse({ input: -1, cachedInput: 0, output: 0, reasoning: 0 })
    ).toThrow();
    expect(() => modelPriceSchema.parse({ input: 1, cachedInput: 0, output: 0 })).toThrow();

    const selfPath = path.resolve(import.meta.dir, "../../../../bootstrap/run/self.yaml");
    const run = runConfigSchema.parse(yaml.parse(fs.readFileSync(selfPath, "utf8")));
    expect(run.aliases.architect!.model).toBe("anthropic/claude-opus-5-5");
    for (const alias of Object.values(run.aliases)) {
      expect(run.prices[alias.model]).toBeDefined();
    }
  });
});
