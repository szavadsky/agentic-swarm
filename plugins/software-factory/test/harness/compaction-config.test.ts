import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { ompOverlay } from "../../src/harness/omp/overlay.js";
import { CACHE_TTLS, type SessionRef } from "../../src/harness/types.js";
import { loadRunConfig } from "../../src/kernel/config.js";
import {
  compactionSchema,
  harnessEntrySchema,
  runConfigSchema,
} from "../../src/kernel/config/run-schema.js";
import { compactSession } from "../../src/kernel/flow-context.js";
import { sessionCacheHot } from "../../src/kernel/sessions.js";
import type { HarnessConfig, KernelRuntime } from "../../src/kernel/types.js";
import { treeFile } from "../helpers/run-configs.js";
import { createAcpxStub } from "./acpx-stub.js";

function session(patch: Partial<SessionRef> = {}): SessionRef {
  return {
    harness: "fake",
    id: "session-1",
    cwd: "/tmp/work",
    model: { id: "fake/model" },
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
    ...patch,
  };
}

/** Only the fields `compactSession` reads: the harness map and its run config. */
function compactRuntime(
  harness: FakeHarness,
  entries: Record<string, HarnessConfig> = {},
): KernelRuntime {
  return {
    harnesses: new Map([[harness.id, harness]]),
    configs: {
      run: {
        harnesses: entries,
        sessions: { dir: "", keepRuns: 1, retention: "short" },
      },
    },
  } as unknown as KernelRuntime;
}

function cacheTtlSchemaTests(): void {
  it("matches omp's providers.cacheRetention enum and needs a value in a declared block", () => {
    expect(CACHE_TTLS).toEqual(["auto", "short", "long", "none"]);
    for (const retention of CACHE_TTLS) {
      const parsed = runConfigSchema.safeParse({
        sessions: { dir: "", keepRuns: 1, retention },
      });
      expect(parsed.success).toBe(true);
    }
    const missing = runConfigSchema.safeParse({
      sessions: { dir: "", keepRuns: 1 },
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues[0]?.path).toEqual(["sessions", "retention"]);
    }
    expect(
      runConfigSchema.safeParse({
        sessions: { dir: "", keepRuns: 1, retention: "forever" },
      }).success,
    ).toBe(false);
  });

  it("the run loader rejects a sessions block without a TTL", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-compaction-"));
    try {
      const file = path.join(dir, "run.yaml");
      fs.writeFileSync(file, "sessions: { dir: sessions }\n", "utf8");
      expect(() => loadRunConfig(file)).toThrow(/sessions\.retention/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function cacheTtlRuntimeTests(): void {
  it("forwards every enum value to omp's overlay", () => {
    for (const retention of CACHE_TTLS) {
      expect(ompOverlay({ retention }).providers).toEqual({
        cacheRetention: retention,
      });
    }
  });

  it("treats auto and none as no hot window; short and long by their windows", () => {
    const now = new Date("2026-11-23T12:00:00.000Z");
    const ago = (minutes: number) =>
      new Date(now.getTime() - minutes * 60_000).toISOString();
    for (const tier of ["auto", "none"] as const) {
      expect(
        sessionCacheHot(
          session({ retentionTier: tier, lastRequestStartedAt: ago(0) }),
          now,
        ),
      ).toBe(false);
    }
    expect(
      sessionCacheHot(
        session({ retentionTier: "short", lastRequestStartedAt: ago(4) }),
        now,
      ),
    ).toBe(true);
    expect(
      sessionCacheHot(
        session({ retentionTier: "short", lastRequestStartedAt: ago(30) }),
        now,
      ),
    ).toBe(false);
    expect(
      sessionCacheHot(
        session({ retentionTier: "long", lastRequestStartedAt: ago(30) }),
        now,
      ),
    ).toBe(true);
  });
}

describe("cache TTL config", () => {
  cacheTtlSchemaTests();
  cacheTtlRuntimeTests();
});

function compactionSchemaTests(): void {
  it("requires a reason when compaction is disabled", () => {
    expect(compactionSchema.safeParse({ enabled: false }).success).toBe(false);
    expect(
      compactionSchema.safeParse({ enabled: false, reason: "  " }).success,
    ).toBe(false);
    expect(
      compactionSchema.safeParse({
        enabled: false,
        reason: "the agent forwards /compact to the model",
      }).success,
    ).toBe(true);
    expect(compactionSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(
      compactionSchema.safeParse({ enabled: true, reason: "not needed" })
        .success,
    ).toBe(true);
  });

  it("rejects an acpx entry that enables compaction without the command", () => {
    expect(
      harnessEntrySchema.safeParse({
        acpx: { agent: "some-agent" },
        compaction: { enabled: true },
      }).success,
    ).toBe(false);
    expect(
      harnessEntrySchema.safeParse({
        acpx: { agent: "some-agent", compact: true },
        compaction: { enabled: true },
      }).success,
    ).toBe(true);
    expect(
      harnessEntrySchema.safeParse({
        acpx: { agent: "some-agent" },
        compaction: { enabled: false, reason: "no command" },
      }).success,
    ).toBe(true);
    // A native adapter's compaction is its own; no acpx flag applies.
    expect(
      harnessEntrySchema.safeParse({
        binary: "omp",
        compaction: { enabled: true },
      }).success,
    ).toBe(true);
  });
}

function compactionRequiredTests(): void {
  it("requires every harness entry to declare a compaction policy", () => {
    expect(harnessEntrySchema.safeParse({ binary: "omp" }).success).toBe(false);
    expect(
      harnessEntrySchema.safeParse({
        binary: "omp",
        compaction: { enabled: true },
      }).success,
    ).toBe(true);
  });

  it("rejects a run config whose harness entry omits compaction", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-compaction-"));
    try {
      const file = path.join(dir, "run.yaml");
      fs.writeFileSync(file, "harnesses:\n  omp:\n    binary: omp\n", "utf8");
      expect(() => loadRunConfig(file)).toThrow(/harnesses\.omp\.compaction/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function compactionRuntimeTests(): void {
  it("skips compaction when the harness entry disables it", async () => {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = compactRuntime(harness, {
      fake: { compaction: { enabled: false, reason: "no reuse" } },
    });
    expect(await compactSession(runtime, session())).toBeUndefined();
    expect(harness.compactions).toHaveLength(0);
  });

  it("applies reviewIterations only to review steps", async () => {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = compactRuntime(harness, {
      fake: { compaction: { enabled: true, reviewIterations: [2] } },
    });
    expect(
      await compactSession(runtime, session(), { review: true, round: 1 }),
    ).toBeUndefined();
    expect(harness.compactions).toHaveLength(0);

    const second = await compactSession(runtime, session(), {
      review: true,
      round: 2,
    });
    expect(second?.session.compacted).toBe(true);
    expect(harness.compactions).toHaveLength(1);

    // An implement turn in the same round is not a review step: the rule does not apply.
    const implement = await compactSession(runtime, session(), {
      review: false,
      round: 1,
    });
    expect(implement?.session.compacted).toBe(true);
    expect(harness.compactions).toHaveLength(2);
  });

  it("skips a cold session and a config with no hot window", async () => {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = compactRuntime(harness, {
      fake: { compaction: { enabled: true } },
    });
    const stale = new Date(Date.now() - 30 * 60_000).toISOString();
    expect(
      await compactSession(runtime, session({ lastRequestStartedAt: stale })),
    ).toBeUndefined();
    expect(
      await compactSession(
        runtime,
        session({ retentionTier: "none", lastRequestStartedAt: stale }),
      ),
    ).toBeUndefined();
    expect(
      await compactSession(
        runtime,
        session({ retentionTier: "auto", lastRequestStartedAt: stale }),
      ),
    ).toBeUndefined();
    expect(harness.compactions).toHaveLength(0);
  });
}

describe("harness compaction policy", () => {
  compactionSchemaTests();
  compactionRequiredTests();
  compactionRuntimeTests();
});

describe("shipped compaction config", () => {
  const dir = treeFile("bootstrap/run");
  if (dir === undefined) throw new Error("bootstrap/run not found");
  const configs = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => ({
      name,
      run: loadRunConfig(path.join(dir, name)),
    }));

  it("declares compaction on every shipped harness entry", () => {
    for (const { name, run } of configs) {
      for (const [id, entry] of Object.entries(run.harnesses ?? {})) {
        expect(
          entry.compaction,
          `${name}: harnesses.${id} has no compaction block`,
        ).toBeDefined();
      }
    }
  });

  it("records why an adapter-less harness does not compact", () => {
    const agentless = configs.flatMap(({ name, run }) =>
      Object.entries(run.harnesses ?? {})
        .filter(([, entry]) => entry.compaction?.enabled === false)
        .map(([id, entry]) => ({ name: `${name}: ${id}`, entry })),
    );
    expect(agentless.length).toBeGreaterThan(0);
    for (const { name, entry } of agentless) {
      expect(entry.compaction!.enabled).toBe(false);
      expect(typeof entry.compaction!.reason).toBe("string");
      expect(entry.compaction!.reason!.trim()).not.toBe("");
      // The adapter must not claim a command the harness does not have.
      expect(entry.acpx?.compact).not.toBe(true);
    }
  });
});

describe("acpx session cache TTL", () => {
  it("stamps the configured TTL instead of a hardcoded tier", async () => {
    const stub = createAcpxStub();
    const cwd = path.dirname(stub.binary);
    const harness = new AcpxHarness({
      id: "agent-a",
      retention: "long",
      binary: stub.binary,
      sessionDir: cwd,
      acpx: { agent: "agent-a" },
    });
    try {
      const result = await harness.turn({
        model: { id: "fake/model" },
        cwd,
        prompt: "hello",
        timeouts: { idleMs: 10_000, wallMs: 30_000 },
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.session?.retentionTier).toBe("long");
    } finally {
      stub.cleanup();
    }
  });
});
