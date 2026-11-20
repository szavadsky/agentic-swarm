import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Usage } from "../../src/harness/types.js";
import { writeLaunchDigest } from "../../src/kernel/digest.js";
import {
  DEFAULT_ROLE_BY_STEP,
  iterationMetrics,
} from "../../src/kernel/metrics.js";
import { writePriceCache } from "../../src/kernel/openrouter.js";
import type { PriceTable } from "../../src/kernel/pricing.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { runtimeFor, usage } from "./digest-fixtures.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

interface DigestCostRow {
  role: string;
  alias: string;
  costUsd: number | undefined;
  unpricedTurns: number;
}

/** Reads the script-written cost table, not the scout's appended prose. */
function digestCostRows(text: string): DigestCostRow[] {
  const section = text
    .split("## Cost and turns by role")[1]!
    .split("\n## ")[0]!;
  return section
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("| ") &&
        !line.startsWith("| role ") &&
        !line.startsWith("| (none)"),
    )
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim());
      const cost = cells[6]!;
      const dollars = /^\$([\d.]+)/.exec(cost)?.[1];
      const unpriced = /^.*?(\d+) unpriced turn/.exec(cost)?.[1];
      return {
        role: cells[0]!,
        alias: cells[1]!,
        costUsd: dollars === undefined ? undefined : Number(dollars),
        unpricedTurns: unpriced === undefined ? 0 : Number(unpriced),
      };
    });
}

describe("launch digest", () => {
  launchDigestPart1();
  launchDigestPart2();
});

async function writesScriptFactsThenScoutAddsPart1(runtime: KernelRuntime) {
  await runtime.store.ensureLayout();
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect",
      model: { id: "fake-architect" },
    },
    {
      usage: {
        in: 100,
        cacheRead: 40,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 20,
        reasoningOut: 5,
        costUsd: 0.5,
      },
      transcript: "/sessions/demo/launch-1/architect.jsonl",
    },
  );
}

async function writesScriptFactsThenScoutAddsPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
  root: string,
) {
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "implement",
      round: 1,
      actor: "agent",
      alias: "implementer",
      model: { id: "fake-impl" },
    },
    {
      usage: {
        in: 10,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 5,
        reasoningOut: 0,
      },
    },
  );
  const records = await runtime.store.listRecords();

  fake.script((req, ctx) => {
    expect(req.prompt).toContain(
      `transcripts: \`${path.join(root, "sessions")}\``,
    );
    fs.appendFileSync(
      path.join(runtime.store.goalDir, "iterations/2/digest.md"),
      "\n## Loops\n- a implement repeated 2 rounds\n",
      "utf8",
    );
    ctx.writeOutcome({
      status: "done",
      summary: "digest complete",
      concerns: [],
      forward: [],
    });
    return fakeTurnResult(req);
  });

  const result = await writeLaunchDigest(runtime, 2, records);
  expect(result).toBe("iterations/2/digest.md");

  return { result };
}

async function writesScriptFactsThenScoutAddsPart3(
  runtime: KernelRuntime,
  scope: Awaited<ReturnType<typeof writesScriptFactsThenScoutAddsPart2>>,
) {
  const { result } = scope;
  const digest = fs.readFileSync(
    path.join(runtime.store.goalDir, result!),
    "utf8",
  );
  expect(digest).toContain(
    "| architect | architect | 1 | 100 | 40 | 20 | $0.5000 |",
  );
  expect(digest).toContain(
    "| implementer | implementer | 1 | 10 | 0 | 5 | unknown (1 unpriced turn) |",
  );
  expect(digest).toContain("- cost: $0.5000 (partial; 1 unpriced turn)");
  expect(digest).toContain("## Transcripts");
  expect(digest).toContain("/sessions/demo/launch-1/architect.jsonl");
  expect(digest).toContain("## Loops");
}

async function agreesMetricsAllZeroMultiAttemptPart1(runtime: KernelRuntime) {
  await runtime.store.ensureLayout();
  // pi via acpx: all-zero counters are no usage report, even on a priced model.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect",
      model: { id: "paid/one" },
    },
    { usage: usage() },
  );
  // A retry: both calls reported input, and rec.usage repeats the last one.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "implement",
      round: 1,
      actor: "agent",
      alias: "implementer",
      model: { id: "paid/one" },
    },
    {
      usage: usage({ in: 1_000_000 }),
      attempts: [
        {
          model: { id: "paid/one" },
          stop: { kind: "infra", cause: "quota" },
          usage: usage({ in: 1_000_000 }),
        },
        {
          model: { id: "paid/one" },
          stop: { kind: "done" },
          usage: usage({ in: 1_000_000 }),
        },
      ],
    },
  );
}

async function agreesMetricsAllZeroMultiAttemptPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
  prices: PriceTable,
) {
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "review",
      round: 1,
      actor: "agent",
      alias: "reviewer",
      model: { id: "mystery/model" },
    },
    { usage: usage({ costUsd: 0.05 }) },
  );
  const records = await runtime.store.listRecords();
  fake.scriptResult({});

  const rel = await writeLaunchDigest(runtime, 2, records);
  const digest = fs.readFileSync(
    path.join(runtime.store.goalDir, rel!),
    "utf8",
  );

  expect(digest).toContain(
    "| architect | architect | 1 | 0 | 0 | 0 | unknown (1 unpriced turn) |",
  );
  expect(digest).toContain(
    "| implementer | implementer | 1 | 2000000 | 0 | 0 | $8.0000 |",
  );
  expect(digest).toContain("| reviewer | reviewer | 1 | 0 | 0 | 0 | $0.0500 |");
  expect(digest).toContain("- cost: $8.0500 (partial; 1 unpriced turn)");

  const metrics = iterationMetrics(
    1,
    "in-progress",
    records,
    DEFAULT_ROLE_BY_STEP,
    0,
    prices,
  );
  const rows = digestCostRows(digest);

  return { metrics, rows };
}

async function agreesMetricsAllZeroMultiAttemptPart3(
  scope: Awaited<ReturnType<typeof agreesMetricsAllZeroMultiAttemptPart2>>,
) {
  const { metrics, rows } = scope;
  for (const [role, expected] of Object.entries(metrics.roles)) {
    const rowsForRole = rows.filter((row) => row.role === role);
    const known = rowsForRole.flatMap((row) =>
      row.costUsd === undefined ? [] : [row.costUsd],
    );
    const cost =
      known.length === 0
        ? undefined
        : known.reduce((sum, value) => sum + value, 0);
    if (expected.usage.costUsd === undefined) expect(cost).toBeUndefined();
    else expect(cost).toBeCloseTo(expected.usage.costUsd, 10);
    expect(rowsForRole.reduce((sum, row) => sum + row.unpricedTurns, 0)).toBe(
      expected.unpricedTurns,
    );
  }
  expect(metrics.usage.costUsd).toBeCloseTo(8.05, 10);
  expect(metrics.unpricedTurns).toBe(1);
}

async function pricesCostTableLikeMetricsKeepsPart1(runtime: KernelRuntime) {
  await runtime.store.ensureLayout();
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect",
      model: { id: "paid/one" },
    },
    { usage: usage({ in: 1_000_000 }) },
  );
  // A second alias for the same role; its rows must sum to the role's cost.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect-fallback",
      model: { id: "paid/one" },
    },
    { usage: usage({ in: 500_000 }) },
  );
  // A harness zero on an absent model is unknown, not $0.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "implement",
      round: 1,
      actor: "agent",
      alias: "implementer",
      model: { id: "mystery/model" },
    },
    { usage: usage({ costUsd: 0, in: 10 }) },
  );
}

async function pricesCostTableLikeMetricsKeepsPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
) {
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "review",
      round: 1,
      actor: "agent",
      alias: "reviewer",
      model: { id: "mystery/model" },
    },
    { usage: usage({ costUsd: 0.05 }) },
  );
  // A crash-sealed record has no usage; the table cannot price it.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "pm",
      round: 1,
      actor: "agent",
      alias: "pm",
      model: { id: "paid/one" },
    },
    {},
  );
  const records = await runtime.store.listRecords();
  fake.scriptResult({});

  const rel = await writeLaunchDigest(runtime, 2, records);
  const digest = fs.readFileSync(
    path.join(runtime.store.goalDir, rel!),
    "utf8",
  );

  expect(digest).toContain(
    "| architect | architect | 1 | 1000000 | 0 | 0 | $4.0000 |",
  );
  expect(digest).toContain(
    "| architect | architect-fallback | 1 | 500000 | 0 | 0 | $2.0000 |",
  );
  expect(digest).toContain(
    "| implementer | implementer | 1 | 10 | 0 | 0 | unknown (1 unpriced turn) |",
  );
  expect(digest).toContain("| reviewer | reviewer | 1 | 0 | 0 | 0 | $0.0500 |");

  return { records, digest };
}

async function pricesCostTableLikeMetricsKeepsPart3(
  prices: PriceTable,
  scope: Awaited<ReturnType<typeof pricesCostTableLikeMetricsKeepsPart2>>,
) {
  const { digest, records } = scope;
  expect(digest).toContain(
    "| pm | pm | 1 | 0 | 0 | 0 | unknown (1 unpriced turn) |",
  );
  expect(digest).toContain("- cost: $6.0500 (partial; 2 unpriced turns)");

  const metrics = iterationMetrics(
    1,
    "in-progress",
    records,
    DEFAULT_ROLE_BY_STEP,
    0,
    prices,
  );
  const rows = digestCostRows(digest);
  for (const [role, expected] of Object.entries(metrics.roles)) {
    const rowsForRole = rows.filter((row) => row.role === role);
    const known = rowsForRole.flatMap((row) =>
      row.costUsd === undefined ? [] : [row.costUsd],
    );
    const cost =
      known.length === 0
        ? undefined
        : known.reduce((sum, value) => sum + value, 0);
    if (expected.usage.costUsd === undefined) expect(cost).toBeUndefined();
    else expect(cost).toBeCloseTo(expected.usage.costUsd, 10);
    expect(rowsForRole.reduce((sum, row) => sum + row.unpricedTurns, 0)).toBe(
      expected.unpricedTurns,
    );
  }
}

function launchDigestPart1() {
  it("writes the script facts, then a scout adds loops from transcripts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-digest-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    try {
      await writesScriptFactsThenScoutAddsPart1(runtime);
      const scope2 = await writesScriptFactsThenScoutAddsPart2(
        runtime,
        fake,
        root,
      );
      await writesScriptFactsThenScoutAddsPart3(runtime, scope2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prices the cost table like metrics and keeps unknown distinct from $0", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-digest-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    const prices: PriceTable = {
      "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
    };
    writePriceCache(path.join(root, "price-cache.json"), prices);
    try {
      await pricesCostTableLikeMetricsKeepsPart1(runtime);
      const scope2 = await pricesCostTableLikeMetricsKeepsPart2(runtime, fake);
      await pricesCostTableLikeMetricsKeepsPart3(prices, scope2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function launchDigestPart2() {
  it("agrees with metrics on all-zero and multi-attempt turns", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-digest-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    const prices: PriceTable = {
      "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
    };
    writePriceCache(path.join(root, "price-cache.json"), prices);
    try {
      await agreesMetricsAllZeroMultiAttemptPart1(runtime);
      const scope2 = await agreesMetricsAllZeroMultiAttemptPart2(
        runtime,
        fake,
        prices,
      );
      await agreesMetricsAllZeroMultiAttemptPart3(scope2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does nothing when there is no previous launch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-digest-"));
    const runtime = runtimeFor(new FakeHarness({ id: "fake" }), root);
    try {
      await runtime.store.ensureLayout();
      expect(await writeLaunchDigest(runtime, 1, [])).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
