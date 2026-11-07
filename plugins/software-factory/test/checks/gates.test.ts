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
import { git } from "../../src/core/git/exec.js";

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

  describe("Per-test ratchet for test runner gates with junitArg (§9)", () => {
    let testRunnerScript: string;

    beforeEach(() => {
      testRunnerScript = path.join(tmpRepo.dir, "test-runner-junit.sh");
      fs.writeFileSync(
        testRunnerScript,
        `#!/bin/sh
JUNIT_FILE=""
for arg in "$@"; do
  case "$arg" in
    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
  esac
done

if [ -z "$JUNIT_FILE" ]; then
  exit 1
fi

if [ -f "collection-error.flag" ]; then
  cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="suite" errors="1" tests="0">
  <error message="Collection error in tests/test_sample.py">ImportError: No module named foo</error>
</testsuite>
EOF
  exit 1
fi

FAIL_1=0
FAIL_2=0
if [ -f "fail_test1.flag" ]; then
  FAIL_1=1
fi
if [ -f "fail_test2.flag" ]; then
  FAIL_2=1
fi

FAIL_TOTAL=$((FAIL_1 + FAIL_2))

cat <<EOF > "$JUNIT_FILE"
<testsuite name="tests" tests="2" failures="\${FAIL_TOTAL}">
  <testcase classname="test_mod" name="test_one">
$( [ "$FAIL_1" -eq 1 ] && echo '    <failure message="assertion error">assert 1 == 0</failure>' )
  </testcase>
  <testcase classname="test_mod" name="test_two">
$( [ "$FAIL_2" -eq 1 ] && echo '    <failure message="assertion error">assert 2 == 0</failure>' )
  </testcase>
</testsuite>
EOF

if [ "$FAIL_TOTAL" -gt 0 ]; then
  exit 1
else
  exit 0
fi
`,
        { mode: 0o755 }
      );
    });

    it("baseline recording captures failing test ids with junitArg", async () => {
      fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
      const ctx = makeContext({
        infra: {
          setup: [],
          gates: [{ id: "test", command: `sh "${testRunnerScript}"` }],
          testRunner: {
            command: `sh "${testRunnerScript}"`,
            junitArg: "--junitxml={path}",
          },
        },
      });

      const res = await runGates(ctx, { record: true });
      expect(res.ok).toBe(false);
      const testGate = res.results.find((r) => r.id === "test");
      expect(testGate).toBeDefined();
      expect(testGate?.status).toBe("fail");
      expect(testGate?.failingTests).toEqual(["test_mod.test_one"]);
    });

    it("red baseline with 1 failing test -> breaking another test fails the gate", async () => {
      // In baseline: test_mod.test_one was failing
      // Now: both test_mod.test_one and test_mod.test_two are failing
      fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
      fs.writeFileSync(path.join(tmpRepo.dir, "fail_test2.flag"), "1");

      const ctx = makeContext({
        infra: {
          setup: [],
          gates: [{ id: "test", command: `sh "${testRunnerScript}"` }],
          testRunner: {
            command: `sh "${testRunnerScript}"`,
            junitArg: "--junitxml={path}",
          },
        },
        baseline: {
          gates: [
            {
              id: "test",
              status: "fail",
              failingTests: ["test_mod.test_one"],
            },
          ],
        },
      });

      const res = await runGates(ctx);
      expect(res.ok).toBe(false);
      const testGate = res.results.find((r) => r.id === "test");
      expect(testGate?.status).toBe("fail");
      expect(testGate?.details).toContain("test_mod.test_two");

      const checkRes = await runCheck("gates", ctx);
      expect(checkRes.ok).toBe(false);
      expect(checkRes.summary).toContain("Gate regressions: test");
    });

    it("red baseline with 1 failing test -> fixing the baseline failure passes and reports it", async () => {
      // In baseline: test_mod.test_one was failing
      // Now: both tests pass (no fail flags)
      const ctx = makeContext({
        infra: {
          setup: [],
          gates: [{ id: "test", command: `sh "${testRunnerScript}"` }],
          testRunner: {
            command: `sh "${testRunnerScript}"`,
            junitArg: "--junitxml={path}",
          },
        },
        baseline: {
          gates: [
            {
              id: "test",
              status: "fail",
              failingTests: ["test_mod.test_one"],
            },
          ],
        },
      });

      const res = await runGates(ctx);
      expect(res.ok).toBe(true);
      const testGate = res.results.find((r) => r.id === "test");
      expect(testGate?.status).toBe("pass");
      expect(testGate?.improvements).toEqual(["test_mod.test_one"]);

      const checkRes = await runCheck("gates", ctx);
      expect(checkRes.ok).toBe(true);
      expect(checkRes.improvements).toEqual(["test_mod.test_one"]);
      expect(checkRes.summary).toContain("improvements: test_mod.test_one");
    });

    it("red baseline with 1 failing test -> unchanged failure passes under ratchet", async () => {
      // In baseline: test_mod.test_one was failing
      // Now: only test_mod.test_one still fails (no new failures)
      fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");

      const ctx = makeContext({
        infra: {
          setup: [],
          gates: [{ id: "test", command: `sh "${testRunnerScript}"` }],
          testRunner: {
            command: `sh "${testRunnerScript}"`,
            junitArg: "--junitxml={path}",
          },
        },
        baseline: {
          gates: [
            {
              id: "test",
              status: "fail",
              failingTests: ["test_mod.test_one"],
            },
          ],
        },
      });

      const res = await runGates(ctx);
      expect(res.ok).toBe(true);
      const testGate = res.results.find((r) => r.id === "test");
      expect(testGate?.status).toBe("pass");

      const checkRes = await runCheck("gates", ctx);
      expect(checkRes.ok).toBe(true);
      expect(checkRes.summary).toContain("Gates passed");
    });

    it("collection error not in baseline fails the gate", async () => {
      fs.writeFileSync(path.join(tmpRepo.dir, "collection-error.flag"), "1");

      const ctx = makeContext({
        infra: {
          setup: [],
          gates: [{ id: "test", command: `sh "${testRunnerScript}"` }],
          testRunner: {
            command: `sh "${testRunnerScript}"`,
            junitArg: "--junitxml={path}",
          },
        },
        baseline: {
          gates: [
            {
              id: "test",
              status: "fail",
              failingTests: ["test_mod.test_one"],
            },
          ],
        },
      });

      const res = await runGates(ctx);
      expect(res.ok).toBe(false);
      const testGate = res.results.find((r) => r.id === "test");
      expect(testGate?.status).toBe("fail");
      expect(testGate?.details).toContain("Collection error");
    });

    it("old-format baseline without failing ids: re-derives at baseline commit, persists, commits, and fails on new broken test", async () => {
      // At baseline commit: only fail_test1.flag exists
      fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
      const task = "old-baseline-task";
      const taskDir = path.join(tmpRepo.dir, ".factory", task);
      fs.mkdirSync(taskDir, { recursive: true });

      // Write old-format gates-baseline.yaml (red gate, NO failingTests field)
      const baselineFile = path.join(taskDir, "gates-baseline.yaml");
      const oldBaseline = {
        timestamp: "2026-01-01T00:00:00.000Z",
        gates: [
          {
            id: "test",
            command: `sh "${testRunnerScript}"`,
            status: "fail",
            durationMs: 100,
            details: "pre-existing failure",
          },
        ],
      };
      fs.writeFileSync(baselineFile, JSON.stringify(oldBaseline, null, 2), "utf8");

      // Commit gates-baseline.yaml at this baseline state
      await git(tmpRepo.dir, ["add", "-A"]);
      await git(tmpRepo.dir, ["commit", "-m", "factory: record baseline"]);

      // Now simulate a change that breaks another test (fail_test2.flag)
      fs.writeFileSync(path.join(tmpRepo.dir, "fail_test2.flag"), "1");

      const ctx = makeContext({
        task,
        taskDir,
        taskWt: tmpRepo.dir,
        infra: {
          setup: [`echo setup-ok > /dev/null`],
          gates: [{ id: "test", command: `sh "${testRunnerScript}"` }],
          testRunner: {
            command: `sh "${testRunnerScript}"`,
            junitArg: "--junitxml={path}",
          },
        },
        baseline: {
          gates: [
            {
              id: "test",
              command: `sh "${testRunnerScript}"`,
              status: "fail",
              // Notice: no failingTests! (old format)
            },
          ],
        },
      });

      // Evaluate gates: must NOT be silently disabled.
      // It must re-derive baseline failing ids (test_mod.test_one), persist & commit,
      // and then fail because test_mod.test_two broke!
      const res = await runGates(ctx);
      expect(res.ok).toBe(false);
      const testGate = res.results.find((r) => r.id === "test");
      expect(testGate?.status).toBe("fail");
      expect(testGate?.details).toContain("test_mod.test_two");

      // Verify gates-baseline.yaml on disk was updated with the derived failing test ids
      const updatedBaselineContent = fs.readFileSync(baselineFile, "utf8");
      expect(updatedBaselineContent).toContain("test_mod.test_one");

      // Verify commit was made via factory commit path
      const logRes = await git(tmpRepo.dir, ["log", "-1", "--format=%s"]);
      expect(logRes.stdout.trim()).toContain("factory: backfill gates-baseline failing tests");

      // Now remove both fail flags (fixing the baseline failure)
      fs.unlinkSync(path.join(tmpRepo.dir, "fail_test1.flag"));
      fs.unlinkSync(path.join(tmpRepo.dir, "fail_test2.flag"));

      const resFixed = await runGates(ctx);
      expect(resFixed.ok).toBe(true);
      const testGateFixed = resFixed.results.find((r) => r.id === "test");
      expect(testGateFixed?.status).toBe("pass");
      expect(testGateFixed?.improvements).toEqual(["test_mod.test_one"]);
    });
  });
});
