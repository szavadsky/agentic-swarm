import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  filePerTaskHandler,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

interface PromoteWave {
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: Awaited<ReturnType<typeof makeRuntime>>;
  result: Awaited<ReturnType<typeof runDispatch>>;
}

/** Resolves once the named task's merge record lands; a broken run cannot hang. */
async function waitForMerge(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  slug: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const merge = (await runtime.store.listRecords()).find(
      (record) => record.slug === slug && record.step === "merge",
    );
    if (merge) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`task "${slug}" never merged while a peer turn waited`);
}

/** A development turn for `own` that starts writing only once `after` merged. */
function writesAfterMerge(
  own: string,
  after: string,
  holds: { runtime?: Awaited<ReturnType<typeof makeRuntime>> },
): FakeTurnHandler {
  return async (req, ctx) => {
    await waitForMerge(holds.runtime!, after);
    fs.writeFileSync(path.join(req.cwd!, `${own}.txt`), `${own}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${own} implemented` }));
    return fakeTurnResult(req);
  };
}

/**
 * A wave with alpha blocking the promote gate while a peer turn is in flight:
 * the peer holds the second slot until alpha merges, so the tasks after it
 * wait unstarted and only a drain can explain the stop.
 */
async function readyPromoteWave(): Promise<PromoteWave> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 2 } },
  });
  const harness = new FakeHarness({ id: "fake" });
  const held: { runtime?: Awaited<ReturnType<typeof makeRuntime>> } = {};
  for (const slug of ["beta", "delta"]) {
    harness.script(writesAfterMerge(slug, "alpha", held), {
      when: whenTurn({ slug, step: "implement" }),
    });
  }
  const counter = { active: 0, max: 0 };
  for (let i = 0; i < 5; i += 1) {
    harness.script(filePerTaskHandler(counter, 10), {
      when: whenTurn({ step: "implement" }),
    });
    harness.script(filePerTaskHandler(counter, 10), {
      when: whenTurn({ step: "review" }),
    });
  }
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  held.runtime = runtime;
  // Alpha lands in one flow (implement, checks, merge), so the slot its checks
  // free admits the blocked peers and leaves the rest waiting for the barrier.
  await writeTask(
    runtime,
    task("alpha", { flow: "just-implement", scope: ["alpha.txt"] }),
  );
  for (const slug of ["beta", "gamma", "delta", "epsilon"]) {
    await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));
  }
  await writeTask(runtime, task("gate", { type: "promote", deps: ["alpha"] }));
  const result = await runDispatch(runtime, { iteration: 1 });
  return { repo, runtime, result };
}

/** The wave drained before stopping: started work landed, waiting work did not. */
async function expectPromoteStop(wave: PromoteWave): Promise<void> {
  const { result, runtime } = wave;
  expect(result.reason).toBe("promote");
  expect(result.cause?.detail).toContain("promote task gate");
  expect(result.cause?.detail).toContain("awaits promotion");
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  expect(state.tasks.delta!.status).toBe("merged");
  expect(state.tasks.gamma!.status).toBe("ready");
  expect(state.tasks.epsilon!.status).toBe("ready");
  expect(state.tasks.gate!.status).toBe("finished");
  expect(
    records.filter(
      (r) =>
        ["gate", "gamma", "epsilon"].includes(r.slug ?? "") &&
        r.actor === "agent",
    ),
  ).toEqual([]);
  const finish = records.find((r) => r.slug === "gate" && r.step === "finish");
  expect(finish?.ok).toBe(true);
  // The drain waited: beta's merge settled before the promote stop landed.
  for (const started of ["beta", "delta"]) {
    const merge = records.find(
      (r) => r.slug === started && r.step === "merge",
    )!;
    expect(finish!.seq).toBeGreaterThan(merge.seq);
  }
}

/** A relaunch continues past the finished barrier and runs the dependent work. */
async function expectRelaunchContinues(wave: PromoteWave): Promise<void> {
  const relaunch = await runDispatch(wave.runtime, { iteration: 2 });
  expect(relaunch.reason).not.toBe("promote");
  const after = derive(
    await wave.runtime.store.listTasks(),
    await wave.runtime.store.listRecords(),
    wave.runtime.configs.process.flows,
  );
  expect(after.tasks.gamma!.status).toBe("merged");
  expect(after.tasks.epsilon!.status).toBe("merged");
}

describe("promote barrier", () => {
  it("drains the wave at a ready promote task and stops for the operator", async () => {
    const wave = await readyPromoteWave();
    try {
      await expectPromoteStop(wave);
      await expectRelaunchContinues(wave);
    } finally {
      cleanupFlowRepo(wave.repo);
    }
  }, 60_000);
});
