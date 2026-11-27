import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { stepTarget, tierIdentity } from "../../src/kernel/flow-context.js";
import {
  executeTaskAction,
  type TaskActionResult,
} from "../../src/kernel/flow.js";
import type { MergeResult } from "../../src/kernel/integrate.js";
import type {
  Action,
  AdmittedTier,
  KernelRuntime,
  TaskFile,
  TaskState,
} from "../../src/kernel/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

const BASE_ALIASES = {
  architect: { harness: "a", model: "ma-arch" },
  pm: { harness: "a", model: "ma-pm" },
  reviewer: { harness: "b", model: "mb-review" },
  steward: { harness: "a", model: "ma-steward" },
};

type AliasSpec = NonNullable<FlowRepoOptions["aliases"]>[string];

/** A three-leg implementer chain: a/ma, then b/mb, then c/mc. */
const IMPLEMENTER: AliasSpec = {
  harness: "a",
  model: "ma",
  fallbacks: [
    { harness: "b", model: "mb" },
    { harness: "c", model: "mc" },
  ],
};

async function identityRuntime(): Promise<{
  repo: TmpRepo;
  runtime: KernelRuntime;
  a: FakeHarness;
  b: FakeHarness;
  c: FakeHarness;
}> {
  const { repo, goal } = setupFlowRepo({
    aliases: { ...BASE_ALIASES, implementer: IMPLEMENTER },
  });
  const a = new FakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  const c = new FakeHarness({ id: "c" });
  const runtime = await makeRuntime(repo, goal, { a, b, c });
  return { repo, runtime, a, b, c };
}

function latchPool(runtime: KernelRuntime, pool: string): void {
  runtime.exhaustedPools.set(pool, { resetAt: Date.now() + 60_000 });
}

/** The pool is live again: its stored reset is in the past. */
function revivePool(runtime: KernelRuntime, pool: string): void {
  runtime.exhaustedPools.set(pool, { resetAt: Date.now() - 1 });
}

/** Scripts one implement turn that edits the worktree and delivers. */
function scriptImplement(harness: FakeHarness, summary: string): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), `${summary}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary }));
    return fakeTurnResult(req);
  });
}

async function derivedTask(
  runtime: KernelRuntime,
  file: TaskFile,
): Promise<TaskState> {
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return state.tasks[file.slug]!;
}

/** The identity of the leg admission resolves first for this step. */
function admittedTier(
  runtime: KernelRuntime,
  file: TaskFile,
  state: TaskState,
): AdmittedTier {
  const target = stepTarget(runtime, file, state, "implement", []);
  return tierIdentity(target.tiers[0]!);
}

async function startImplement(
  runtime: KernelRuntime,
  file: TaskFile,
  tier: AdmittedTier,
): Promise<TaskActionResult | MergeResult> {
  const action: Action = {
    kind: "step",
    slug: file.slug,
    step: "implement",
    round: 1,
    tier,
  };
  return executeTaskAction(
    runtime,
    file,
    action,
    1,
    await derivedTask(runtime, file),
  );
}

async function implementRecord(runtime: KernelRuntime) {
  return (await runtime.store.listRecords()).find(
    (record) => record.step === "implement" && record.actor === "agent",
  );
}

function registerAdmittedLegPart1(): void {
  it("runs the admitted leg when the chain order changes between admission and start", async () => {
    const t = await identityRuntime();
    try {
      const file = task("task", { flow: "just-implement" });
      await writeTask(t.runtime, file);
      // Admission sees the primary's pool latched: the chain starts on b.
      latchPool(t.runtime, "a+ma");
      const tier = admittedTier(
        t.runtime,
        file,
        await derivedTask(t.runtime, file),
      );
      expect(tier).toEqual({ harness: "b", model: { id: "mb" } });
      // Between admission and start the primary's latch clears and the fresh
      // chain is [a, b, c]: the stored index 0 would now name a.
      revivePool(t.runtime, "a+ma");
      scriptImplement(t.a, "primary");
      scriptImplement(t.b, "admitted");
      scriptImplement(t.c, "second fallback");

      await startImplement(t.runtime, file, tier);

      expect(t.a.calls).toHaveLength(0);
      expect(t.b.calls).toHaveLength(1);
      expect(t.c.calls).toHaveLength(0);
      const record = await implementRecord(t.runtime);
      expect(record?.model).toEqual({ id: "mb" });
      expect(record?.attempts?.map((attempt) => attempt.harness)).toEqual([
        "b",
      ]);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAdmittedLegPart2(): void {
  it("skips an admitted leg that latched since admission and never starts an earlier one", async () => {
    const t = await identityRuntime();
    try {
      const file = task("task", { flow: "just-implement" });
      await writeTask(t.runtime, file);
      latchPool(t.runtime, "a+ma");
      const tier = admittedTier(
        t.runtime,
        file,
        await derivedTask(t.runtime, file),
      );
      expect(tier.harness).toBe("b");
      // The primary comes back but the admitted leg latches: start must move
      // forward to c, never back to the earlier live leg a.
      revivePool(t.runtime, "a+ma");
      latchPool(t.runtime, "b+mb");
      scriptImplement(t.a, "primary");
      scriptImplement(t.b, "admitted");
      scriptImplement(t.c, "next live");

      await startImplement(t.runtime, file, tier);

      expect(t.a.calls).toHaveLength(0);
      expect(t.b.calls).toHaveLength(0);
      expect(t.c.calls).toHaveLength(1);
      const record = await implementRecord(t.runtime);
      expect(record?.model).toEqual({ id: "mc" });
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAdmittedLegPart3(): void {
  it("makes no call when the admitted leg latched and no live leg follows it", async () => {
    const t = await identityRuntime();
    try {
      const file = task("task", { flow: "just-implement" });
      await writeTask(t.runtime, file);
      // Admission sees both leading pools latched: the chain starts on c.
      latchPool(t.runtime, "a+ma");
      latchPool(t.runtime, "b+mb");
      const tier = admittedTier(
        t.runtime,
        file,
        await derivedTask(t.runtime, file),
      );
      expect(tier.harness).toBe("c");
      // The earlier pools come back while the admitted pool latches. Starting
      // a or b would run a leg admission did not choose.
      revivePool(t.runtime, "a+ma");
      revivePool(t.runtime, "b+mb");
      latchPool(t.runtime, "c+mc");
      scriptImplement(t.a, "primary");
      scriptImplement(t.b, "fallback");
      scriptImplement(t.c, "admitted");

      const result = await startImplement(t.runtime, file, tier);

      expect(t.a.calls).toHaveLength(0);
      expect(t.b.calls).toHaveLength(0);
      expect(t.c.calls).toHaveLength(0);
      expect(result.infra?.cause).toBe("unavailable");
      expect(result.infra?.details).toContain("no live tier follows");
      const record = await implementRecord(t.runtime);
      expect(record?.stop).toEqual({
        kind: "infra",
        cause: "unavailable",
        details: expect.stringContaining("no live tier follows"),
      });
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

describe("admitted tier identity", () => {
  registerAdmittedLegPart1();

  registerAdmittedLegPart2();

  registerAdmittedLegPart3();
});
