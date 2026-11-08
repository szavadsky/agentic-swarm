import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

/**
 * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
 *
 * The schema is the write gate: a valid concern payload must reach the
 * canonical artifact writer, while an unknown `kind` must be rejected by
 * validation and never reach that writer. `detail` and `severity` are
 * optional in JSON; the runtime concern store fills defaults.
 */
describe("Concern funnel schemas", () => {
  let tmpRepo: TmpRepo;
  let repoObj: Repo;
  let pipeline: PipelineConfig;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    project = {
      orchestrationFolder: ".factory",
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    };
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: project.worktreeRoot });
    pipeline = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {},
        spike: {},
      },
      limits: {},
    };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  async function runConcernStep(opts: {
    task: string;
    item: string;
    stepFragment: "poc" | "test-assumptions";
    data: Record<string, unknown>;
    markerPath: string;
  }) {
    const taskDir = path.join(tmpRepo.dir, ".factory", opts.task);
    const recordsDir = path.join(taskDir, "items", opts.item, "steps");
    fs.mkdirSync(recordsDir, { recursive: true });
    const childWt = tmpRepo.createWorktree(`topic/${opts.task}--${opts.item}`);

    const harness = new FakeHarness();
    const label = `${opts.task}/items/${opts.item}/develop#a1`;
    harness.scriptOutcome(label, { ok: true, data: opts.data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
    harness.scriptComplete(() => opts.data);

    let writes = 0;
    const result = await runAgentStep({
      task: opts.task,
      item: opts.item,
      stepId: "develop",
      stepFragment: opts.stepFragment,
      agent: "developer",
      cwd: childWt,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        assignment: "Exercise concern schema",
        context: "Concern funnel test context",
      },
      writeArtifact: async (output) => {
        writes++;
        fs.writeFileSync(opts.markerPath, JSON.stringify(output), "utf8");
      },
    });

    return { result, writes };
  }

  it("valid concerns pass validation and unknown kinds reject with no artifact write", async () => {
    // Valid payload: minimal concern (detail/severity omitted) plus a fully populated one.
    const validMarker = path.join(tmpRepo.dir, "valid-concern-write.json");
    const validData = {
      status: "ok",
      summary: "PoC completed",
      evidence: ["poc/attempt.ts ran"],
      concerns: [
        { kind: "assumption", summary: "Provider retries are safe" },
        {
          kind: "risk",
          summary: "PoC relies on an unstable API",
          detail: "The endpoint shape may change",
          severity: "medium",
          location: { file: "poc/attempt.ts", line: 12 },
          affects: ["concerns-funnel"],
        },
      ],
    };

    const valid = await runConcernStep({
      task: "concern-valid",
      item: "poc-item",
      stepFragment: "poc",
      data: validData,
      markerPath: validMarker,
    });

    expect(valid.result.ok).toBe(true);
    expect(valid.result.status).toBe("ok");
    expect(valid.writes).toBe(1);
    expect(fs.existsSync(validMarker)).toBe(true);
    const written = JSON.parse(fs.readFileSync(validMarker, "utf8"));
    expect(written.concerns.map((c: any) => c.kind)).toEqual(["assumption", "risk"]);

    // Invalid payload: unknown concern kind must be rejected by the schema,
    // and the canonical artifact writer must never run.
    const invalidMarker = path.join(tmpRepo.dir, "invalid-concern-write.json");
    const invalidData = {
      status: "ok",
      summary: "Assumptions tested",
      evidence: ["tests/assumption.test.ts passed"],
      concerns: [{ kind: "bug", summary: "Unknown concern kind" }],
    };

    const invalid = await runConcernStep({
      task: "concern-invalid",
      item: "assumption-item",
      stepFragment: "test-assumptions",
      data: invalidData,
      markerPath: invalidMarker,
    });

    expect(invalid.result.ok).toBe(false);
    expect(invalid.result.status).toBe("rejected");
    expect(invalid.writes).toBe(0);
    expect(fs.existsSync(invalidMarker)).toBe(false);
    expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
  });
});
