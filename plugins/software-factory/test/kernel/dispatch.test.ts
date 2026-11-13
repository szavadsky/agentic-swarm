import { describe, expect, it } from "bun:test";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch, scopesOverlap } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  filePerTaskHandler,
  makeRuntime,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

async function runPair(opts: {
  scopeA: string[];
  scopeB: string[];
  limits: Record<string, unknown>;
}): Promise<{ max: number; reason: string }> {
  const { repo, goal } = setupFlowRepo({ limits: opts.limits });
  try {
    const counter = { active: 0, max: 0 };
    const harness = new FakeHarness({ id: "fake" });
    for (let i = 0; i < 4; i += 1) harness.script(filePerTaskHandler(counter));
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    await writeTask(runtime, task("alpha", { scope: opts.scopeA }));
    await writeTask(runtime, task("beta", { scope: opts.scopeB }));
    const result = await runDispatch(runtime, { iteration: 1 });
    const state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
    expect(state.tasks.alpha!.status).toBe("merged");
    expect(state.tasks.beta!.status).toBe("merged");
    return { max: counter.max, reason: result.reason };
  } finally {
    cleanupFlowRepo(repo);
  }
}

describe("dispatch admission", () => {
  it("knows which scope globs overlap", () => {
    expect(scopesOverlap(["src/a.ts"], ["src/a.ts"])).toBe(true);
    expect(scopesOverlap(["src/**"], ["src/kernel/a.ts"])).toBe(true);
    expect(scopesOverlap(["src/a/*.ts"], ["src/a/b.ts"])).toBe(true);
    expect(scopesOverlap(["src/a/*.ts"], ["src/ab/b.ts"])).toBe(false);
    expect(scopesOverlap(["src/a.ts"], ["src/b.ts"])).toBe(false);
    expect(scopesOverlap([], ["src/b.ts"])).toBe(false);
  });

  it("runs disjoint scopes concurrently up to the absolute limit", async () => {
    const run = await runPair({
      scopeA: ["a.txt"],
      scopeB: ["b.txt"],
      limits: { concurrency: 2 },
    });
    expect(run.reason).toBe("boundary");
    expect(run.max).toBe(2);
  }, 60_000);

  it("never runs two tasks with overlapping scopes at once", async () => {
    const run = await runPair({
      scopeA: ["shared/**"],
      scopeB: ["shared/file.ts"],
      limits: { concurrency: 2 },
    });
    expect(run.max).toBe(1);
  }, 60_000);

  it("honours the per-harness limit even when the absolute limit allows more", async () => {
    const run = await runPair({
      scopeA: ["a.txt"],
      scopeB: ["b.txt"],
      limits: { concurrency: 2, perHarness: { fake: 1 } },
    });
    expect(run.max).toBe(1);
  }, 60_000);

  it("honours the absolute limit", async () => {
    const run = await runPair({
      scopeA: ["a.txt"],
      scopeB: ["b.txt"],
      limits: { concurrency: 1 },
    });
    expect(run.max).toBe(1);
  }, 60_000);
});
