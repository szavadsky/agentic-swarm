import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { TurnResult } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { causeText, task } from "./helpers.js";
import {
  makeRuntime,
  outcome,
  type setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

export async function recordsThrowingTaskAsInfraCrashPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  // Each turn is bound to its slug and step, so the thrower can never be
  // consumed by the sibling's turn (or vice versa) under load.
  harness.script(
    (): TurnResult => {
      throw new Error("simulated kill in a");
    },
    { when: whenTurn({ slug: "a", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "b.txt"), "b\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "b implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "b", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "b approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "b", step: "review" }) },
  );
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("a", { scope: ["a.txt"] }));
  await writeTask(runtime, task("b", { scope: ["b.txt"] }));

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("infra");
  expect(causeText(result.cause)).toContain("a: crash: simulated kill in a");
  const records = await runtime.store.listRecords();
  const aCrash = records.find(
    (r) => r.slug === "a" && r.step === "implement" && r.actor === "script",
  );
  expect(aCrash?.ok).toBe(false);
  expect(aCrash?.cause).toEqual({
    kind: "error",
    detail: "crash: simulated kill in a",
  });

  return { runtime, records, aCrash };
}

export async function recordsThrowingTaskAsInfraCrashPart2(
  scope: Awaited<ReturnType<typeof recordsThrowingTaskAsInfraCrashPart1>>,
) {
  const { aCrash, runtime, records } = scope;
  expect(aCrash?.stop).toEqual({
    kind: "infra",
    cause: "crash",
    details: "simulated kill in a",
  });
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.b!.status).toBe("merged");
  expect(state.tasks.a!.status).not.toBe("merged");
}
