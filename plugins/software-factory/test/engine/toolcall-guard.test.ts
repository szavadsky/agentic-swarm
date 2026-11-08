import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readJournal } from "../../src/core/journal.js";

// PsPost5 item 10: a step whose transcript exceeds the tool-call threshold
// journals step_tool_call_warning (advisory — the step still completes).

describe("Engine-side guard: tool-call budget warning", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("journals step_tool_call_warning when tool calls exceed the threshold", async () => {
    const task = "toolcall-warning-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Intent text\n", "utf8");
    tmpRepo.commit("Initial setup");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "simple", rationale: "simple change", citations: [] },
      toolCallCount: 75,
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "test", command: "true" }], testRunner: { command: "true" } },
      toolCallCount: 5,
    });
    harness.scriptOutcome(`${task}/runs/simple-implement#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "hello.txt"), "hello\n");
      return {
        ok: true,
        data: { status: "ok", summary: "Implemented simple change", evidence: ["done"] },
      };
    });

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const project = { orchestrationFolder: orchFolder, worktreeRoot };
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
      limits: { maxIterations: 1, stepToolCallWarning: 60 },
    });

    const result = await runTask({ harness, repo: repoObj, project, pipelineFor, prompts }, task);
    expect(result.status).toBe("done");

    const taskWtDir = path.join(worktreeRoot, `topic_${task}`);
    const actualTaskDir = path.join(taskWtDir, orchFolder, task);
    const events = await readJournal(actualTaskDir);
    const warningEvent = events.find((e) => e.type === "step_tool_call_warning");
    expect(warningEvent).toBeDefined();
    expect(warningEvent?.step).toBe("triage");
    expect(warningEvent?.toolCalls).toBe(75);
    expect(warningEvent?.threshold).toBe(60);
  });
});
