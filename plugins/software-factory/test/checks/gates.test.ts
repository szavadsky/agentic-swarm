import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { runGates } from "../../src/core/checks/gates.js";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { readJournal } from "../../src/core/journal.js";

describe("Gates check & ratchet (§9, §12.3)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-gates-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  function makeContext(overrides?: Partial<CheckContext>): CheckContext {
    return {
      repo,
      wt: tmpRepo.dir,
      base: "HEAD",
      project: { orchestrationFolder: ".factory", worktreeRoot: wtRoot },
      pipeline: {
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: { gateRetries: 1 },
      },
      limits: { gateRetries: 1 },
      outputBytes: 4000,
      ...overrides,
    };
  }

  it("ratchet: baseline green must stay green", async () => {
    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [
          { id: "lint", command: "true" },
          { id: "typecheck", command: "false" },
        ],
        testRunner: { command: "true" },
      },
      baseline: {
        gates: [
          { id: "lint", status: "pass" },
          { id: "typecheck", status: "pass" }, // typecheck was green in baseline!
        ],
      },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(false); // typecheck broke ratchet
    const typecheckResult = res.results.find((r) => r.id === "typecheck");
    expect(typecheckResult?.status).toBe("fail");

    // Also verify via runCheck("gates")
    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(false);
    expect(checkRes.summary).toContain("typecheck");
  });

  it("ratchet: non-baseline-green gates are reported but do not fail", async () => {
    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [
          { id: "lint", command: "true" },
          { id: "legacy-broken", command: "false" },
        ],
        testRunner: { command: "true" },
      },
      baseline: {
        gates: [
          { id: "lint", status: "pass" },
          { id: "legacy-broken", status: "fail" }, // Was already failing in baseline
        ],
      },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(true); // Ratchet not broken because legacy-broken was not green
    const broken = res.results.find((r) => r.id === "legacy-broken");
    expect(broken?.status).toBe("fail");

    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(true);
  });

  it("flaky: retries failed gate and marks flaky if retry succeeds", async () => {
    // Write a tiny script that fails once then succeeds (counter outside worktree)
    const counterFile = path.join(os.tmpdir(), `factory-test-counter-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    const scriptPath = path.join(tmpRepo.dir, "flaky.sh");
    fs.writeFileSync(
      scriptPath,
      `#!/bin/sh
if [ ! -f "${counterFile}" ]; then
  echo 1 > "${counterFile}"
  exit 1
else
  exit 0
fi
`,
      { mode: 0o755 }
    );

    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [{ id: "flaky-gate", command: `sh "${scriptPath}"` }],
        testRunner: { command: "true" },
      },
      baseline: {
        gates: [{ id: "flaky-gate", status: "pass" }],
      },
      limits: { gateRetries: 2 },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(true);
    const gateEntry = res.results.find((r) => r.id === "flaky-gate");
    expect(gateEntry?.status).toBe("flaky");

    // runCheck reports flaky gates in check result
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile); // Reset counter
    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(true);
    expect(checkRes.flaky).toContain("flaky-gate");
  });

  it("gate timeout uses gateTimeoutSec and reports distinctly", async () => {
    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [{ id: "slow", command: "sleep 5" }],
        testRunner: { command: "true" },
      },
      limits: { gateRetries: 0, gateTimeoutSec: 1 },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(false);
    expect(res.results[0]?.status).toBe("fail");
    expect(res.results[0]?.details).toContain("timed out");

    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(false);
    expect(checkRes.summary).toContain("slow");
  });

  it("gate details are tail-capped to outputBytes", async () => {
    // ~100KB of output must be capped to outputBytes in the stored baseline entry
    const scriptPath = path.join(tmpRepo.dir, "noisy.sh");
    fs.writeFileSync(
      scriptPath,
      `#!/bin/sh\nyes "log-line-padding-0123456789" | head -n 4000\n`,
      { mode: 0o755 }
    );
    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [{ id: "noisy", command: `sh "${scriptPath}"` }],
        testRunner: { command: "true" },
      },
      limits: { gateRetries: 0 },
      outputBytes: 1000,
    });

    const res = await runGates(ctx, { record: true });
    const details = res.results[0]?.details ?? "";
    expect(Buffer.byteLength(details, "utf8")).toBeLessThanOrEqual(1000);
    expect(details).toContain("log-line-padding");
  });

  it("mutation guard: gate that rewrites a tracked file and creates an untracked file fails, restores worktree, and journals it", async () => {
    // 1. Commit tracked file in tmpRepo
    const trackedRel = path.join("src", "tracked.txt");
    const trackedPath = path.join(tmpRepo.dir, trackedRel);
    fs.mkdirSync(path.dirname(trackedPath), { recursive: true });
    fs.writeFileSync(trackedPath, "initial-tracked-content\n", "utf8");
    tmpRepo.git(["add", "src/tracked.txt"]);
    tmpRepo.git(["commit", "-m", "add tracked file"]);

    const untrackedRel = "untracked-artifact.txt";
    const untrackedPath = path.join(tmpRepo.dir, untrackedRel);

    // Prepare task dir for journal recording
    const task = "task-mut";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });

    // Mutating gate command: rewrites tracked file AND creates untracked file
    const mutateCmd = `sh -c 'echo "mutated-by-gate" > src/tracked.txt && echo "untracked-output" > untracked-artifact.txt'`;

    const ctx = makeContext({
      wt: tmpRepo.dir,
      task,
      taskDir,
      infra: {
        setup: [],
        gates: [{ id: "mutating-gate", command: mutateCmd }],
        testRunner: { command: "true" },
      },
      limits: { gateRetries: 0 },
    });

    // Run gates with record: true (baseline recording)
    const res = await runGates(ctx, { record: true });
    expect(res.ok).toBe(false);
    const entry = res.results.find((r) => r.id === "mutating-gate");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("fail");
    expect(entry?.mutatesWorktree).toBe(true);
    expect(entry?.details).toContain("Worktree mutation detected");
    expect(entry?.details).toContain("src/tracked.txt");
    expect(entry?.details).toContain("untracked-artifact.txt");

    // Invariant: worktree restored exactly!
    expect(fs.readFileSync(trackedPath, "utf8")).toBe("initial-tracked-content\n");
    expect(fs.existsSync(untrackedPath)).toBe(false);

    // Invariant: journaled to task journal.ndjson
    const journal = await readJournal(taskDir);
    const mutationEvent = journal.find((e) => e.type === "worktree_mutation_detected");
    expect(mutationEvent).toBeDefined();
    expect(mutationEvent?.gate).toBe("mutating-gate");
    expect(mutationEvent?.tracked).toContain("src/tracked.txt");
    expect(mutationEvent?.untracked).toContain("untracked-artifact.txt");

    // Also verify via runCheck("gates")
    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(false);
    expect(checkRes.mutatesWorktree).toBe(true);
    expect(checkRes.summary).toContain("Gate mutations detected");

    // Worktree still clean after runCheck
    expect(fs.readFileSync(trackedPath, "utf8")).toBe("initial-tracked-content\n");
    expect(fs.existsSync(untrackedPath)).toBe(false);
  });

  it("mutation guard: custom check that mutates worktree fails, restores worktree, and journals it", async () => {
    const trackedRel = path.join("src", "tracked-custom.txt");
    const trackedPath = path.join(tmpRepo.dir, trackedRel);
    fs.mkdirSync(path.dirname(trackedPath), { recursive: true });
    fs.writeFileSync(trackedPath, "initial-custom-content\n", "utf8");
    tmpRepo.git(["add", "src/tracked-custom.txt"]);
    tmpRepo.git(["commit", "-m", "add custom tracked file"]);

    const untrackedRel = "untracked-custom.txt";
    const untrackedPath = path.join(tmpRepo.dir, untrackedRel);

    const task = "task-custom-mut";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });

    const mutateCmd = `sh -c 'echo "corrupted" > src/tracked-custom.txt && echo "extra" > untracked-custom.txt'`;

    const ctx = makeContext({
      wt: tmpRepo.dir,
      task,
      taskDir,
      pipeline: {
        checks: {
          "custom-mutator": {
            run: mutateCmd,
            expect: "pass",
          },
        },
      } as any,
    });

    const checkRes = await runCheck("custom-mutator", ctx);
    expect(checkRes.ok).toBe(false);
    expect(checkRes.mutatesWorktree).toBe(true);
    expect(checkRes.summary).toContain("mutated worktree");
    expect(checkRes.output).toContain("Worktree mutation detected");

    // Restored
    expect(fs.readFileSync(trackedPath, "utf8")).toBe("initial-custom-content\n");
    expect(fs.existsSync(untrackedPath)).toBe(false);

    // Journaled
    const journal = await readJournal(taskDir);
    const mutationEvent = journal.find((e) => e.type === "worktree_mutation_detected" && e.check === "custom-mutator");
    expect(mutationEvent).toBeDefined();
  });
});
