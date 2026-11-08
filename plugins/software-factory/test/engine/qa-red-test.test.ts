import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml } from "../../src/core/records/io.js";

describe("QA before-check red-test derives testFirstCommit durably", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("dev item with test-first ok runs red-test against real testFirstCommit (passes when tests fail without prod change)", async () => {
    const task = "qa-red-test-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Implement math calculator feature\n", "utf8");

    // Create a mock test runner script in repo
    const runnerScript = path.join(tmpRepo.dir, "run-tests.sh");
    fs.writeFileSync(
      runnerScript,
      `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
  esac
done

if grep -q "implemented" src/math.txt 2>/dev/null; then
cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="tests" tests="1" failures="0">
  <testcase classname="test_math" name="test_add" />
</testsuite>
EOF
exit 0
else
cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="tests" tests="1" failures="1">
  <testcase classname="test_math" name="test_add">
    <failure message="test failed without prod change" />
  </testcase>
</testsuite>
EOF
exit 1
fi
`,
      { mode: 0o755 }
    );

    // Initial files
    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "stub\n", "utf8");
    tmpRepo.commit("Initial setup with test runner and stub prod");

    const harness = new FakeHarness();

    // 1. Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Needs tests and dev", citations: [] },
    });

    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: `sh "${runnerScript}"` }],
        testRunner: {
          command: `sh "${runnerScript}"`,
          selectorArgs: ["-k"],
          junitArg: "--junitxml={path}",
        },
      },
    });

    // 2. Iteration plan & review
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "Math feature" }],
        itemOutlines: [{ slug: "calc-item", kind: "dev", title: "Calc item", milestoneId: "m1", deps: [] }],
      },
    });

    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });

    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "calc-item",
            outlineRef: "calc-item",
            kind: "dev",
            title: "Calc item",
            assignment: "Implement math addition",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });

    // 3. Item execution:
    // Step 1: test-first writes test and targets expectRed
    harness.scriptOutcome(`${task}/items/calc-item/test-first#a1`, (run) => {
      fs.mkdirSync(path.join(run.cwd, "tests"), { recursive: true });
      fs.writeFileSync(path.join(run.cwd, "tests", "test_math.txt"), "test_add\n");
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Created red test",
          target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
        },
      };
    });

    // Step 2: develop writes prod code (makes target green)
    harness.scriptOutcome(`${task}/items/calc-item/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "src", "math.txt"), "implemented\n");
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Implemented math",
        },
      };
    });

    // Step 3: qa runs before-checks (red-test and test-diff)
    let qaBeforeChecksRan = false;
    harness.scriptOutcome(`${task}/items/calc-item/qa#a1`, () => {
      qaBeforeChecksRan = true;
      return {
        ok: true,
        data: { status: "approved", summary: "QA verified", suggestions: [] },
      };
    });

    // Step 4: review
    harness.scriptOutcome(`${task}/items/calc-item/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Code looks good", suggestions: [] },
    });

    // Closeups
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done" },
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
      paths: { prod: ["src/**"], tests: ["tests/**"] },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const pipelineFor = async () => ({
      models: { roles: { workhorse: { model: "m" } } } as any,
      agents: {} as any,
      flows: {
        simple: { steps: [] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "test-first", agent: "developer", checks: [] },
              { id: "develop", agent: "developer", checks: ["target-green"] },
              { id: "qa", agent: "qa", checks: ["red-test", "test-diff"] },
              { id: "review", agent: "reviewer", checks: [] },
            ],
          },
        },
        spike: {},
      } as any,
      limits: { maxIterations: 1 },
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
    if (result.status !== "done") {
      console.log("FAILED RESULT:", result);
    }
    expect(result.status).toBe("done");
    expect(result.exitCode).toBe(0);
    expect(qaBeforeChecksRan).toBe(true);

    // Verify QA step record checks.yaml contains passing red-test check
    const qaRecordDir = path.join(worktreeRoot, `topic_${task}`, orchFolder, task, "items", "calc-item", "steps", "003-qa-r1-a1");
    const qaChecksPath = path.join(qaRecordDir, "checks.yaml");
    expect(fs.existsSync(qaChecksPath)).toBe(true);
    const checksData = await readYaml<{ checks?: Array<{ id: string; status: string; message?: string }> }>(qaChecksPath);
    const redTestCheck = checksData.checks?.find((c) => c.id === "red-test");
    expect(redTestCheck).toBeDefined();
    expect(redTestCheck?.status).toBe("pass");
    expect(redTestCheck?.message).toContain("red-test passed");
  });

  it("red-test fails when tests pass even without prod change (tautological tests)", async () => {
    const task = "qa-tautology-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Tautology test intent\n", "utf8");

    // Runner script that always reports tests passing (regardless of prod changes!)
    const runnerScript = path.join(tmpRepo.dir, "run-tautology.sh");
    fs.writeFileSync(
      runnerScript,
      `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
  esac
done
cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="tests" tests="1" failures="0">
  <testcase classname="test_math" name="test_add" />
</testsuite>
EOF
exit 0
`,
      { mode: 0o755 }
    );

    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "stub\n", "utf8");
    tmpRepo.commit("Setup tautology repo");

    const harness = new FakeHarness();

    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "story", citations: [] },
    });

    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: `sh "${runnerScript}"` }],
        testRunner: {
          command: `sh "${runnerScript}"`,
          selectorArgs: ["-k"],
          junitArg: "--junitxml={path}",
        },
      },
    });

    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "taut-item", kind: "dev", title: "Taut item", milestoneId: "m1", deps: [] }],
      },
    });

    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });

    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "taut-item",
            outlineRef: "taut-item",
            kind: "dev",
            title: "Taut item",
            assignment: "Tautology",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });

    // test-first
    harness.scriptOutcome(`${task}/items/taut-item/test-first#a1`, (run) => {
      fs.mkdirSync(path.join(run.cwd, "tests"), { recursive: true });
      fs.writeFileSync(path.join(run.cwd, "tests", "test_math.txt"), "test_add\n");
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Created test",
          target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
        },
      };
    });

    // develop
    harness.scriptOutcome(`${task}/items/taut-item/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "src", "math.txt"), "implemented\n");
      return { ok: true, data: { status: "ok", summary: "Implemented" } };
    });

    // qa prompt receives failed before-checks!
    let receivedPromptWithFailingCheck = false;
    harness.scriptOutcome(`${task}/items/taut-item/qa#a1`, (run) => {
      if (run.prompt.includes("passes even without production code changes") || run.prompt.includes("[red-test]")) {
        receivedPromptWithFailingCheck = true;
      }
      return {
        ok: true,
        data: {
          status: "rejected",
          summary: "QA rejected due to failing red-test",
          suggestions: [{ disposition: "fix", summary: "Test passes without prod changes" }],
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/consult-taut-item#a1`, {
      ok: true,
      data: { decision: "replan", why: "Tautology" },
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
      paths: { prod: ["src/**"], tests: ["tests/**"] },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const pipelineFor = async () => ({
      models: { roles: { workhorse: { model: "m" } } } as any,
      agents: {} as any,
      flows: {
        simple: { steps: [] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "test-first", agent: "developer", checks: [] },
              { id: "develop", agent: "developer", checks: ["target-green"] },
              { id: "qa", agent: "qa", checks: ["red-test", "test-diff"] },
              { id: "review", agent: "reviewer", checks: [] },
            ],
          },
        },
        spike: {},
      } as any,
      limits: { maxIterations: 1, maxFixRounds: 1 },
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
    const childWtDir = path.join(worktreeRoot, `topic_${task}--taut-item`);
    const qaRecordDir = path.join(childWtDir, orchFolder, task, "items", "taut-item", "steps", "003-qa-r1-a1");

    const qaChecksPath = path.join(qaRecordDir, "checks.yaml");
    expect(fs.existsSync(qaChecksPath)).toBe(true);
    const checksData = await readYaml<{ checks?: Array<{ id: string; status: string; message?: string }> }>(qaChecksPath);
    const redTestCheck = checksData.checks?.find((c) => c.id === "red-test");
    expect(redTestCheck).toBeDefined();
    expect(redTestCheck?.status).toBe("fail");
    expect(redTestCheck?.message).toContain("passes even without production code changes");
  });

  it("derives testFirstCommit durably and runs red-test successfully across a process restart", async () => {
    const task = "qa-restart-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Restart test intent\n", "utf8");

    // Create test runner script
    const runnerScript = path.join(tmpRepo.dir, "run-restart-tests.sh");
    fs.writeFileSync(
      runnerScript,
      `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
  esac
done

if grep -q "implemented" src/math.txt 2>/dev/null; then
cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="tests" tests="1" failures="0">
  <testcase classname="test_math" name="test_add" />
</testsuite>
EOF
exit 0
else
cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="tests" tests="1" failures="1">
  <testcase classname="test_math" name="test_add">
    <failure message="test failed without prod change" />
  </testcase>
</testsuite>
EOF
exit 1
fi
`,
      { mode: 0o755 }
    );

    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "stub\n", "utf8");
    tmpRepo.commit("Setup restart test repo");

    const harness = new FakeHarness();

    // Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: `sh "${runnerScript}"` }],
        testRunner: {
          command: `sh "${runnerScript}"`,
          selectorArgs: ["-k"],
          junitArg: "--junitxml={path}",
        },
      },
    });

    // Iteration 1
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "restart-item", kind: "dev", title: "Restart item", milestoneId: "m1", deps: [] }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "restart-item",
            outlineRef: "restart-item",
            kind: "dev",
            title: "Restart item",
            assignment: "Restart item test",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });

    // Step 1: test-first
    harness.scriptOutcome(`${task}/items/restart-item/test-first#a1`, (run) => {
      fs.mkdirSync(path.join(run.cwd, "tests"), { recursive: true });
      fs.writeFileSync(path.join(run.cwd, "tests", "test_math.txt"), "test_add\n");
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Created red test",
          target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
        },
      };
    });

    // Step 2: develop
    harness.scriptOutcome(`${task}/items/restart-item/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "src", "math.txt"), "implemented\n");
      return { ok: true, data: { status: "ok", summary: "Implemented" } };
    });

    // Step 3: qa
    harness.scriptOutcome(`${task}/items/restart-item/qa#a1`, {
      ok: true,
      data: { status: "approved", summary: "QA approved", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/items/restart-item/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Review approved", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done" },
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
      paths: { prod: ["src/**"], tests: ["tests/**"] },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const pipelineFor = async () => ({
      models: { roles: { workhorse: { model: "m" } } } as any,
      agents: {} as any,
      flows: {
        simple: { steps: [] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "test-first", agent: "developer", checks: [] },
              { id: "develop", agent: "developer", checks: ["target-green"] },
              { id: "qa", agent: "qa", checks: ["red-test", "test-diff"] },
              { id: "review", agent: "reviewer", checks: [] },
            ],
          },
        },
        spike: {},
      } as any,
      limits: { maxIterations: 1 },
    });

    // PHASE 1: Run until develop finishes (maxTicks: 3)
    await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor,
        prompts,
      },
      task,
      { maxTicks: 3 }
    );

    // PHASE 2: Simulate restart with fresh engine run
    const restartResult = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor,
        prompts,
      },
      task
    );

    expect(restartResult.status).toBe("done");
    expect(restartResult.exitCode).toBe(0);

    // Verify QA step record has passing red-test check derived from testFirstCommit
    const qaRecordDir = path.join(worktreeRoot, `topic_${task}`, orchFolder, task, "items", "restart-item", "steps", "003-qa-r1-a1");
    const qaChecksPath = path.join(qaRecordDir, "checks.yaml");
    expect(fs.existsSync(qaChecksPath)).toBe(true);
    const checksData = await readYaml<{ checks?: Array<{ id: string; status: string; message?: string }> }>(qaChecksPath);
    const redTestCheck = checksData.checks?.find((c) => c.id === "red-test");
    expect(redTestCheck).toBeDefined();
    expect(redTestCheck?.status).toBe("pass");
    expect(redTestCheck?.message).toContain("red-test passed");
  });
});
