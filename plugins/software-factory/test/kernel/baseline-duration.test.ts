import { describe, expect, it } from "bun:test";
import { checkBase } from "../../src/kernel/baseline.js";
import { iterationMetrics } from "../../src/kernel/metrics.js";
import type {
  RecordEnd,
  RecordStart,
  StepRecord,
} from "../../src/kernel/types.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

type FlowRuntime = Awaited<ReturnType<typeof makeRuntime>>;
type ScriptMeta = Omit<RecordStart, "round" | "actor">;

function baselineRecord(records: readonly StepRecord[]): StepRecord {
  const baseline = records.find((record) => record.step === "baseline");
  if (!baseline) throw new Error("no baseline record");
  return baseline;
}

async function appendScriptRecord(
  runtime: FlowRuntime,
  meta: ScriptMeta,
  end: RecordEnd,
): Promise<void> {
  const start: RecordStart = { ...meta, round: 1, actor: "script" };
  await runtime.store.appendRecord(start, end);
}

async function appendBaseline(
  runtime: FlowRuntime,
  commit: string,
  wallMs: number,
): Promise<void> {
  await appendScriptRecord(
    runtime,
    { iteration: 0, step: "baseline", base: commit },
    { ok: true, checks: [], wallMs },
  );
}

async function appendChecks(runtime: FlowRuntime): Promise<void> {
  await appendScriptRecord(
    runtime,
    { iteration: 1, slug: "task", step: "checks" },
    { ok: true, checks: [], wallMs: 0 },
  );
}

async function gateShare(runtime: FlowRuntime) {
  return iterationMetrics(
    1,
    "in-progress",
    await runtime.store.listRecords(),
    {},
    0,
    {},
  );
}

/** Lets a later record's start clear the previous record's end. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("baseline gate wall", () => {
  it("stamps the gate wall on the record and counts it in the iteration's gate share", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "slow", command: "sleep 0.3" }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const commit = repo.git(["rev-parse", "HEAD"]).stdout.trim();
      const result = await checkBase(
        runtime.configs,
        runtime.store,
        repo.dir,
        "main",
        commit,
      );
      expect(result.ok).toBe(true);
      const baseline = baselineRecord(await runtime.store.listRecords());
      expect(baseline.wallMs).toBeGreaterThanOrEqual(200);
      expect(
        Date.parse(baseline.endedAt!) - Date.parse(baseline.startedAt),
      ).toBeGreaterThanOrEqual(200);

      // The iteration's share reads the baseline's own wall, not the append
      // window. A zero-wall checks record leaves only that share.
      await appendChecks(runtime);
      const first = await gateShare(runtime);
      expect(first.gateWallMs).toBe(baseline.wallMs!);
      expect(first.gateRuns).toBe(2);
      expect(first.testRuns).toBe(1);

      // A resumed launch's pre-flight runs inside the iteration: its wall still
      // belongs to this iteration's share.
      await tick();
      await appendBaseline(runtime, commit, 50);
      await appendChecks(runtime);
      expect((await gateShare(runtime)).gateWallMs).toBe(baseline.wallMs! + 50);

      // A run after the iteration's last record is the next launch's setup and
      // is not charged to this iteration.
      await tick();
      await appendBaseline(runtime, commit, 75);
      expect((await gateShare(runtime)).gateWallMs).toBe(baseline.wallMs! + 50);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
