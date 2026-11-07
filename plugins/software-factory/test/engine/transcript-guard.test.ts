import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readJournal } from "../../src/core/journal.js";

describe("Engine-side guard: transcript/stdout size threshold warning", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("journals a step_transcript_size_warning when step transcript/stdout exceeds threshold", async () => {
    const task = "transcript-warning-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Intent text\n", "utf8");
    tmpRepo.commit("Initial setup");

    const harness = new FakeHarness();

    // Ingest: triage with stdoutBytes exceeding threshold (threshold set to 1000 bytes)
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "simple", rationale: "simple change", citations: [] },
      stdoutBytes: 50_000, // 50 KB exceeds 1000 bytes
    });

    // Ingest: infra
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "test", command: "true" }], testRunner: { command: "true" } },
      stdoutBytes: 200, // 200 bytes does not exceed 1000 bytes
    });

    // Simple implement
    harness.scriptOutcome(`${task}/runs/simple-implement#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "hello.txt"), "hello\n");
      return {
        ok: true,
        data: { status: "ok", summary: "Implemented simple change", evidence: ["done"] },
      };
    });

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });

    const project = {
      orchestrationFolder: orchFolder,
      worktreeRoot,
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const pipelineFor = async () => ({
      models: { roles: { workhorse: { model: "m" } } } as any,
      agents: {} as any,
      flows: {
        simple: { steps: [{ id: "simple-implement", agent: "developer" }] },
        story: {} as any,
        spike: {} as any,
      },
      limits: {
        maxIterations: 1,
        stepTranscriptWarningBytes: 1000, // 1 KB threshold
      },
    });

    const result = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor,
        prompts,
      },
      task
    );
    expect(result.status).toBe("done");

    // Read journal from task worktree
    const taskWtDir = path.join(worktreeRoot, `topic_${task}`);
    const actualTaskDir = path.join(taskWtDir, orchFolder, task);
    const events = await readJournal(actualTaskDir);

    const warningEvent = events.find((e) => e.type === "step_transcript_size_warning");
    expect(warningEvent).toBeDefined();
    expect(warningEvent?.step).toBe("triage");
    expect(warningEvent?.sizeBytes).toBe(50_000);
    expect(warningEvent?.thresholdBytes).toBe(1000);
  });
});
