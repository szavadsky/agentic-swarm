import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createTmpRepo } from "./helpers/tmp-repo.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import { Repo } from "../src/core/git/repo.js";
import { ensureTaskWorktree } from "../src/core/git/worktrees.js";
import { loadPromptLibrary } from "../src/core/prompts.js";
import { runAgentStep } from "../src/core/flows/step-runner.js";
import { validateAndRepair } from "../src/core/records/repair.js";
import { readYaml } from "../src/core/records/io.js";
import { readJournal } from "../src/core/journal.js";
import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";

// ShPost3 #3: extra-key output is either rejected or stripped-with-warning
// (journal event), never silently kept. On current HEAD the fact-finder
// schema accepts contextPack (added later, legitimate), but truly unknown
// keys still fail direct validation.

describe("Schema/validation drift: unknown keys rejected or journaled (ShPost3 #3)", () => {
  const pluginRoot = path.resolve(import.meta.dir, "..");
  const builtinDir = path.resolve(pluginRoot, "agents");

  it("fact-finder schema accepts contextPack but rejects unknown keys", async () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, "config/schemas/fact-finder-output.schema.json"), "utf8")
    );
    const okRes = await validateAndRepair({
      rawOutput: { status: "ok", summary: "s", findings: "f", contextPack: "pack" },
      schema,
    });
    expect(okRes.ok).toBe(true);

    const badRes = await validateAndRepair({
      rawOutput: { status: "ok", summary: "s", findings: "f", bogusKey: 1 },
      schema,
    });
    expect(badRes.ok).toBe(false);
    expect((badRes as { error: string }).error).toContain("bogusKey");
  });

  it("repaired (non-direct) output journals step_output_repaired", async () => {
    const tmpRepo = createTmpRepo();
    const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repair-journal-wt-"));
    try {
      const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: wtRoot });
      const task = "test-repair-journal";
      const orchFolder = ".factory/tasks";
      const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
      fs.mkdirSync(path.dirname(intentPath), { recursive: true });
      fs.writeFileSync(intentPath, "# Intent\n", "utf8");
      const taskWtRes = await ensureTaskWorktree(repo, task, { intentPath, orchestrationFolder: orchFolder });
      const taskDir = path.join(taskWtRes.path, orchFolder, task);
      const runsDir = path.join(taskDir, "runs");
      await fs.promises.mkdir(runsDir, { recursive: true });
      const prompts = loadPromptLibrary({ builtinDir });
      const harness = new FakeHarness();

      harness.scriptOutcome(`${task}/runs/triage#a1`, () => ({
        ok: false as const,
        error: "Agent output failed schema validation: /citations/0/lines: must be string",
        // lines as number fails direct validation; @simpler repairs to "5".
        data: { kind: "simple", rationale: "r", citations: [{ file: "R", lines: 5, anchors: ["t"], summary: "s" }] },
      }));
      harness.scriptComplete(() => ({
        kind: "simple",
        rationale: "r",
        citations: [{ file: "R", lines: "5", anchors: ["t"], summary: "s" }],
      }));
      const pipeline: PipelineConfig = {
        models: { roles: { workhorse: { model: "fake-workhorse" }, simpler: { model: "fake-simpler" } } },
        agents: { triage: { role: "workhorse" } },
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: {},
      };
      const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: wtRoot };

      const stepRes = await runAgentStep({
        task, stepId: "triage", stepFragment: "steps/triage", agent: "triage",
        cwd: taskWtRes.path, taskWt: taskWtRes.path, taskDir, recordsDir: runsDir,
        repo, harness, pipeline, project, prompts,
        promptVars: { task, intent: "Fix doc typo", triageCriteria: "simple vs story" },
      });
      expect(stepRes.ok).toBe(true);

      const events = await readJournal(taskDir);
      const repaired = events.find((e) => e.type === "step_output_repaired");
      expect(repaired).toBeDefined();
      expect(repaired?.method).toBe("simpler_repair");
      expect(repaired?.step).toBe("triage");
    } finally {
      tmpRepo.cleanup();
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });
});
