import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { OmpHarness, isModelResolutionError, buildModelCandidates } from "../../src/harness/omp/harness.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { processSteeringMailbox } from "../../src/core/steer.js";
import { deriveDeadSteerFiles } from "../../src/core/derive/task.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { Repo } from "../../src/core/git/repo.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("D3: model-resolution detection + candidate walk", () => {
  it("isModelResolutionError matches branch evidence, rejects other failures", () => {
    const err = `OMP complete failed with exit code 1: error: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)`;
    expect(isModelResolutionError(err, 1)).toBe(true);
    expect(isModelResolutionError(`Model "foo/bar" not found\n\nRun \`omp models find\``, 1)).toBe(true);
    expect(isModelResolutionError("unknown model 'x'", 1)).toBe(true);
    expect(isModelResolutionError("boom", 1)).toBe(false);
    expect(isModelResolutionError("No API key found for x", 0)).toBe(false);
  });

  it("buildModelCandidates: primary @role first, literal models, role-shaped via resolveName", () => {
    expect(buildModelCandidates({ role: "simpler", models: ["m1", "m2"] })).toEqual([
      "@simpler",
      "m1",
      "m2",
    ]);
    // role-shaped fallback resolves to @role
    expect(
      buildModelCandidates({ role: "simpler", models: ["workhorse"], resolveName: (n) => n === "workhorse" })
    ).toEqual(["@simpler", "@workhorse"]);
    // duplicates collapse
    expect(buildModelCandidates({ role: "@simpler", models: ["@simpler", "m1", "m1"] })).toEqual([
      "@simpler",
      "m1",
    ]);
  });

  it("complete() walks fallbacks: unresolvable primary -> fallback success, journal callback fires", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-fallback-"));
    const stateFile = path.join(tmpDir, "calls.txt");
    fs.writeFileSync(stateFile, "", "utf8");
    const mockBinary = path.join(tmpDir, "mock-omp.sh");
    // First call (@simpler) fails like the branch: exit 1 + model text.
    // Second call (literal fallback) emits a valid yield.
    fs.writeFileSync(
      mockBinary,
      `#!/bin/sh\nCALLS_FILE="${stateFile}"\nif [ -f "$CALLS_FILE" ]; then n=$(wc -l < "$CALLS_FILE"); else n=0; fi\necho "$*" >> "$CALLS_FILE"\nif [ "$n" -eq 0 ]; then echo "error: No API key found for google-antigravity." >&2; echo "Use /model to select a model." >&2; exit 1; fi\necho '{"type":"session","id":"s-1"}'\necho '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"ok\\":true}"}],"stopReason":"stop"}}'\n`,
      { mode: 0o755 }
    );
    try {
      const harness = new OmpHarness({ ompBinary: mockBinary, runtimeDir: tmpDir });
      const seen: Array<{ from: string; to: string }> = [];
      const out = await harness.complete({
        role: "simpler",
        models: ["fallback-model:max"],
        system: "sys",
        prompt: "p",
        schema: { type: "object" },
        onModelFallback: async ({ from, to }) => {
          seen.push({ from, to });
        },
      });
      expect(out).toEqual({ ok: true });
      expect(seen).toEqual([{ from: "@simpler", to: "fallback-model:max" }]);
      const calls = fs.readFileSync(stateFile, "utf8");
      expect(calls).toContain("@simpler");
      expect(calls).toContain("fallback-model:max");
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("complete() throws at once on non-model failure (no fallback walk)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-nofallback-"));
    const mockBinary = path.join(tmpDir, "mock-omp.sh");
    fs.writeFileSync(mockBinary, `#!/bin/sh\necho "boom" >&2; exit 2\n`, { mode: 0o755 });
    try {
      const harness = new OmpHarness({ ompBinary: mockBinary, runtimeDir: tmpDir });
      let seen = 0;
      let thrown: Error | undefined;
      try {
        await harness.complete({
          role: "simpler",
          models: ["fallback-model:max"],
          system: "s",
          prompt: "p",
          schema: { type: "object" },
          onModelFallback: async () => { seen++; },
        });
      } catch (err: any) {
        thrown = err;
      }
      expect(thrown?.message).toContain("exit code 2");
      expect(seen).toBe(0);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("run() falls back pre-session, never mid-session", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-runfb-"));
    const stateFile = path.join(tmpDir, "calls.txt");
    fs.writeFileSync(stateFile, "", "utf8");
    const mockBinary = path.join(tmpDir, "mock-omp.sh");
    // Fail whenever --model @simpler is passed (like the branch), succeed otherwise.
    fs.writeFileSync(
      mockBinary,
      `#!/bin/sh\nCALLS_FILE="${stateFile}"\necho "$*" >> "$CALLS_FILE"\ncase "$*" in\n*--model\\ @simpler*) echo "Model \\"x\\" not found" >&2; exit 1;;\nesac\necho '{"type":"session","id":"sess-9"}'\necho '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"ok\\":true}"}],"stopReason":"stop"}}'\n`,
      { mode: 0o755 }
    );
    try {
      const harness = new OmpHarness({ ompBinary: mockBinary, runtimeDir: tmpDir });
      const seen: string[] = [];
      const outcome = await harness.run({
        agent: "developer",
        definition: "# D",
        prompt: "hi",
        role: "simpler",
        models: ["fallback-model:max"],
        tools: [],
        cwd: tmpDir,
        outputSchema: { type: "object" },
        label: "t/run",
        session: { keep: false },
        onModelFallback: async ({ from, to }) => { seen.push(`${from}->${to}`); },
      });
      expect(outcome.ok).toBe(true);
      expect(seen).toEqual(["@simpler->fallback-model:max"]);

      // Mid-session resume keeps the recorded model: single candidate, no fallback walk.
      fs.writeFileSync(stateFile, "", "utf8");
      const seen2: string[] = [];
      const outcome2 = await harness.run({
        agent: "developer",
        definition: "# D",
        prompt: "hi",
        role: "simpler",
        models: ["fallback-model:max"],
        tools: [],
        cwd: tmpDir,
        outputSchema: { type: "object" },
        label: "t/run2",
        session: { resume: "sess-9", keep: true },
        onModelFallback: async ({ from, to }) => { seen2.push(`${from}->${to}`); },
      });
      // The recorded model (@simpler) is dead here, so the turn fails — but
      // with NO fallback walk (never switch models mid-session).
      expect(outcome2.ok).toBe(false);
      expect(seen2).toEqual([]);
      const calls = fs.readFileSync(stateFile, "utf8");
      expect(calls).toContain("@simpler");
      expect(calls).toContain("sess-9");
      expect(calls).not.toContain("fallback-model");
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
});

describe("D3: steer dead-letter after 5 consecutive errors + status surface", () => {
  let tmpRepo: TmpRepo;
  let repoObj: Repo;
  let prompts: any;
  const orchFolder = ".factory";

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents") });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("journals steer_poll_dead after 5 consecutive errors on the same file", async () => {
    const task = "dead-letter-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const pendingDir = path.join(taskDir, "steer", "fromuserpending");
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, "1794100866341.md"), "operator says hi\n", "utf8");
    tmpRepo.commit("task setup");
    const pipeline: any = { models: { roles: { simpler: { model: "dead-model" } } } };
    const harness = new FakeHarness();
    harness.defaultCompleteHandler = async () => {
      throw new Error("OMP complete failed with exit code 1: No API key found for google-antigravity.");
    };

    for (let i = 0; i < 5; i++) {
      const res = await processSteeringMailbox({
        taskWt: tmpRepo.dir,
        taskDir,
        harness,
        pipeline,
        prompts,
        repo: repoObj,
        task,
      });
      expect(res.skippedCount).toBe(1);
    }
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("steer_poll_dead");
    const dead = await deriveDeadSteerFiles(taskDir);
    expect(dead).toEqual([{ file: "1794100866341.md", errors: 5 }]);
    // A 6th error does not duplicate the dead event (already dead).
    await processSteeringMailbox({
      taskWt: tmpRepo.dir,
      taskDir,
      harness,
      pipeline,
      prompts,
      repo: repoObj,
      task,
    });
    const dead2 = await deriveDeadSteerFiles(taskDir);
    expect(dead2).toEqual([{ file: "1794100866341.md", errors: 5 }]);
  });
});
