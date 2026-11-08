import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { deriveTaskState, refreshStateYaml } from "../../src/core/derive/task.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import type { PipelineConfig, StateArtifact } from "../../src/core/artifacts.js";

/**
 * `StateArtifact.concerns` surfaces concern-store counts (docs/factory.v2.md
 * §18: "status/state.yaml shows counts"). Counts cover the four store statuses;
 * a missing `concerns/` directory reports zeros, and corrupt entries are
 * skipped with a warning instead of breaking state derivation.
 */
const ORCH = ".factory";

interface ConcernCounts {
  open: number;
  dismissed: number;
  routed: number;
  resolved: number;
}

type StateWithCounts = StateArtifact & { concerns: ConcernCounts };

const ZERO_COUNTS: ConcernCounts = {
  open: 0,
  dismissed: 0,
  routed: 0,
  resolved: 0,
};

describe("StateArtifact concern counts (§18)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function taskDirFor(task: string): string {
    const taskDir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
    tmpRepo.commit(`add ${task} intent`);
    return taskDir;
  }

  function writeConcern(
    taskDir: string,
    id: string,
    status: keyof ConcernCounts
  ): void {
    const concernDir = path.join(taskDir, "concerns");
    fs.mkdirSync(concernDir, { recursive: true });
    writeYamlAtomic(path.join(concernDir, `${id}.yaml`), {
      id,
      kind: status === "routed" ? "blocker" : "risk",
      summary: `Concern ${id}`,
      detail: "concern detail",
      severity: "medium",
      status,
      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
      affects: ["item-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  function minimalPipeline(): PipelineConfig {
    return {
      models: { roles: {} },
      agents: {},
      flows: { simple: { steps: [] }, story: {}, spike: {} },
      limits: {},
    };
  }

  async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    const originalError = console.error;
    const capture = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    console.warn = capture;
    console.error = capture;
    try {
      await fn();
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }
    return warnings;
  }

  it("counts stored concerns by status", async () => {
    const task = "concern-counts";
    const taskDir = taskDirFor(task);

    writeConcern(taskDir, "c-open-1", "open");
    writeConcern(taskDir, "c-open-2", "open");
    writeConcern(taskDir, "c-dismissed", "dismissed");
    writeConcern(taskDir, "c-routed", "routed");
    writeConcern(taskDir, "c-resolved", "resolved");

    const state = await deriveTaskState({
      taskDir,
      task,
      parentBranch: `topic/${task}`,
    });

    expect((state.toStateArtifact() as StateWithCounts).concerns).toEqual({
      open: 2,
      dismissed: 1,
      routed: 1,
      resolved: 1,
    });
  });

  it("reports zero counts when the concerns directory is missing", async () => {
    const task = "concern-counts-missing";
    const taskDir = taskDirFor(task);

    const state = await deriveTaskState({
      taskDir,
      task,
      parentBranch: `topic/${task}`,
    });

    expect((state.toStateArtifact() as StateWithCounts).concerns).toEqual(ZERO_COUNTS);
  });

  it("skips corrupt concern files and warns instead of failing derivation", async () => {
    const task = "concern-counts-corrupt";
    const taskDir = taskDirFor(task);
    writeConcern(taskDir, "c-open", "open");

    const corruptPath = path.join(taskDir, "concerns", "c-broken.yaml");
    fs.writeFileSync(corruptPath, "open: [unterminated\n", "utf8");

    let artifact: StateWithCounts | undefined;
    const warnings = await captureWarnings(async () => {
      const state = await deriveTaskState({
        taskDir,
        task,
        parentBranch: `topic/${task}`,
      });
      artifact = state.toStateArtifact() as StateWithCounts;
    });

    expect(artifact?.concerns).toEqual({ ...ZERO_COUNTS, open: 1 });
    expect(warnings.some((warning) => warning.includes("c-broken.yaml"))).toBe(true);
  });

  it("refreshStateYaml materializes the counts into state.yaml", async () => {
    const task = "concern-counts-refresh";
    const taskDir = taskDirFor(task);
    writeConcern(taskDir, "c-open", "open");
    writeConcern(taskDir, "c-dismissed", "dismissed");
    fs.writeFileSync(
      path.join(taskDir, "concerns", "c-broken.yaml"),
      "open: [unterminated\n",
      "utf8"
    );

    const warnings = await captureWarnings(async () => {
      await refreshStateYaml({
        taskDir,
        task,
        parentBranch: `topic/${task}`,
        taskWt: tmpRepo.dir,
        pipeline: minimalPipeline(),
      });
    });

    const state = await readYaml<StateWithCounts>(path.join(taskDir, "state.yaml"));
    expect(state.concerns).toEqual({
      open: 1,
      dismissed: 1,
      routed: 0,
      resolved: 0,
    });
    expect(warnings.some((warning) => warning.includes("c-broken.yaml"))).toBe(true);
  });
});
