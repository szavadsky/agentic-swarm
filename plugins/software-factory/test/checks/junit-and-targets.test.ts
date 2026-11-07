import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { parseJunit, buildTargetCommand } from "../../src/core/checks/junit.js";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import { commitAll } from "../../src/core/git/commit.js";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("JUnit XML parsing and test targets (§9)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;
  let runnerScript: string;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-targets-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });

    // Write a tiny shell-based test runner that outputs JUnit XML based on repo files
    runnerScript = path.join(tmpRepo.dir, "fake-runner.sh");
    fs.writeFileSync(
      runnerScript,
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

# Collection error mode
if [ -f "collection-error.flag" ]; then
  cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="suite" errors="1" tests="0">
  <error message="Collection error in tests/test_sample.py">ImportError: No module named foo</error>
</testsuite>
EOF
  exit 1
fi

# Behavior testing mode
FAIL_ASSERT=0
TEST_A_STATUS="pass"
TEST_B_STATUS="pass"

# If test_fail.flag exists, test_a fails assertion
if [ -f "test_fail.flag" ]; then
  TEST_A_STATUS="fail"
  FAIL_ASSERT=1
fi

# If prod.txt does NOT contain "implemented", test_math.test_add fails assertion
if [ -f "src/math.txt" ]; then
  if ! grep -q "implemented" src/math.txt 2>/dev/null; then
    TEST_A_STATUS="fail"
    FAIL_ASSERT=1
  fi
fi

cat <<EOF > "$JUNIT_FILE"
<testsuite name="tests" tests="2" failures="\${FAIL_ASSERT}">
  <testcase classname="test_math" name="test_add">
EOF

if [ "$TEST_A_STATUS" = "fail" ]; then
  cat <<'EOF' >> "$JUNIT_FILE"
    <failure message="AssertionError: expected true but got false">Traceback...</failure>
EOF
fi

cat <<'EOF' >> "$JUNIT_FILE"
  </testcase>
  <testcase classname="test_math" name="test_sub" />
</testsuite>
EOF

if [ "$FAIL_ASSERT" -eq 1 ]; then
  exit 1
else
  exit 0
fi
`,
      { mode: 0o755 }
    );

    // Commit runner script into repo
    tmpRepo.commit("chore: add test runner", ["fake-runner.sh"]);
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
      base: "HEAD~1",
      project: {
        orchestrationFolder: ".factory",
        worktreeRoot: wtRoot,
        paths: { tests: "tests/**", prod: "src/**" },
      },
      pipeline: {
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: {},
      },
      infra: {
        setup: [],
        gates: [],
        testRunner: {
          command: `sh "${runnerScript}"`,
          junitArg: "--junitxml={path}",
        },
      },
      limits: {},
      outputBytes: 4000,
      ...overrides,
    };
  }

  it("parseJunit parses passing, failing, errored, and skipped tests", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuite name="unit" tests="4" failures="1" errors="1" skipped="1">
  <testcase classname="test_mod" name="test_one" />
  <testcase classname="test_mod" name="test_two">
    <failure message="assertion failed">Traceback</failure>
  </testcase>
  <testcase classname="test_mod" name="test_three">
    <error message="runtime crash">Exception</error>
  </testcase>
  <testcase classname="test_mod" name="test_four">
    <skipped message="not ready" />
  </testcase>
</testsuite>`;

    const parsed = parseJunit(xml);
    expect(parsed.collected).toBe(true);
    expect(parsed.cases.length).toBe(4);
    expect(parsed.cases.find((c) => c.id === "test_mod.test_one")?.status).toBe("pass");
    expect(parsed.cases.find((c) => c.id === "test_mod.test_two")?.status).toBe("fail");
    expect(parsed.cases.find((c) => c.id === "test_mod.test_three")?.status).toBe("error");
    expect(parsed.cases.find((c) => c.id === "test_mod.test_four")?.status).toBe("skip");
  });

  it("parseJunit detects collection errors", () => {
    const xml = `<testsuite name="pytest" errors="1">
  <error message="Collection error in test_a.py">SyntaxError: invalid syntax</error>
</testsuite>`;

    const parsed = parseJunit(xml);
    expect(parsed.collected).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("buildTargetCommand produces quoting safe command with selectors and junit", () => {
    const infra = {
      setup: [],
      gates: [],
      testRunner: {
        command: "pytest",
        selectorArgs: ["-k"],
        junitArg: "--junitxml={path}",
      },
    };

    const cmd = buildTargetCommand(
      infra,
      { selectors: ["test_special name", "test_b"], expectRed: ["test_special name", "test_b"] },
      "/tmp/out with space/junit.xml"
    );

    expect(cmd).toContain("pytest");
    expect(cmd).toContain("-k 'test_special name'");
    expect(cmd).toContain("-k test_b");
    expect(cmd).toContain("--junitxml='/tmp/out with space/junit.xml'");
  });

  it("target-red passes when expectRed ids fail with assertion", async () => {
    // test_fail.flag causes test_math.test_add to fail assertion
    fs.writeFileSync(path.join(tmpRepo.dir, "test_fail.flag"), "1", "utf8");

    const ctx = makeContext({
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
    });

    const res = await runCheck("target-red", ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("assertion failure");
  });

  it("target-red rejects collection errors and missing ids", async () => {
    // 1. Missing test id
    const ctxMissing = makeContext({
      target: { selectors: ["test_nonexistent"], expectRed: ["test_nonexistent"] },
    });
    const resMissing = await runCheck("target-red", ctxMissing);
    expect(resMissing.ok).toBe(false);
    expect(resMissing.summary).toContain("missing from suite");

    // 2. Collection error
    fs.writeFileSync(path.join(tmpRepo.dir, "collection-error.flag"), "1", "utf8");
    const ctxError = makeContext({
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
    });
    const resError = await runCheck("target-red", ctxError);
    expect(resError.ok).toBe(false);
    expect(resError.summary).toContain("failed collection");
  });

  it("target-green passes when tests pass", async () => {
    // Remove failure flag; tests now pass
    const flag = path.join(tmpRepo.dir, "test_fail.flag");
    if (fs.existsSync(flag)) fs.unlinkSync(flag);
    const colFlag = path.join(tmpRepo.dir, "collection-error.flag");
    if (fs.existsSync(colFlag)) fs.unlinkSync(colFlag);

    const ctx = makeContext({
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
    });

    const res = await runCheck("target-green", ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("selected tests passed");
  });

  it("red-test catches a test that passes without the prod change", async () => {
    // Setup test-first commit:
    // Create test file and un-implemented prod file (or no prod file)
    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "stub\n", "utf8");
    const testFirstSha = (await commitAll(repo, tmpRepo.dir, "test-first commit"))!;

    // Develop step adds the implementation
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "implemented\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "develop: implement feature");

    // Case 1: Real red-test -> tests pass WITH prod code, but FAIL when prod restored to testFirstCommit!
    const ctx = makeContext({
      testFirstCommit: testFirstSha,
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
    });

    const res = await runCheck("red-test", ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("red-test passed");

    // Case 2: Tautological test -> test passes even WITHOUT prod change!
    // Modify fake runner so it passes regardless of src/math.txt
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
    await commitAll(repo, tmpRepo.dir, "update runner for tautology test");

    const tautologyRes = await runCheck("red-test", ctx);
    expect(tautologyRes.ok).toBe(false);
    expect(tautologyRes.summary).toContain("passes even without production code changes");
  });

  it("target-red matches pytest-style node ids against junit ids", async () => {
    // Runner reports classname="test_math" name="test_add"; declare pytest node id instead
    fs.writeFileSync(path.join(tmpRepo.dir, "test_fail.flag"), "1", "utf8");

    const ctx = makeContext({
      // junit id file is fake-runner based: test_math.test_add
      target: { selectors: ["tests/test_math.py::test_add"], expectRed: ["tests/test_math.py::test_add"] },
    });

    const res = await runCheck("target-red", ctx);
    expect(res.ok).toBe(true);
  });

  it("target commands time out with a clear summary", async () => {
    // Gate target that hangs: bounded by limits.gateTimeoutSec
    const ctxGate = makeContext({
      target: { gate: "slow" },
      infra: {
        setup: [],
        gates: [{ id: "slow", command: "sleep 5" }],
        testRunner: { command: "true" },
      },
      limits: { gateTimeoutSec: 1 },
    });
    const resGate = await runCheck("target-red", ctxGate);
    expect(resGate.ok).toBe(false);
    expect(resGate.summary).toContain("timed out");

    // Standard selector target that hangs
    const hangScript = path.join(tmpRepo.dir, "hang-runner.sh");
    fs.writeFileSync(hangScript, "#!/bin/sh\nsleep 5\n", { mode: 0o755 });
    const ctxHang = makeContext({
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
      infra: {
        setup: [],
        gates: [],
        testRunner: { command: `sh "${hangScript}"`, junitArg: "--junitxml={path}" },
      },
      limits: { gateTimeoutSec: 1 },
    });
    const resHang = await runCheck("target-green", ctxHang);
    expect(resHang.ok).toBe(false);
    expect(resHang.summary).toContain("timed out");
  });

  it("red-test handles bootstrap gate/custom targets without expectRed", async () => {
    // Gate target that is red (non-zero) -> passes; green gate -> fails
    const ctxRed = makeContext({ target: { gate: "failing-gate" } });
    ctxRed.infra = {
      setup: [],
      gates: [{ id: "failing-gate", command: "false" }],
      testRunner: { command: "true" },
    };
    const resRed = await runCheck("red-test", ctxRed);
    expect(resRed.ok).toBe(true);
    expect(resRed.summary).toContain("failed as expected");

    const ctxGreen = makeContext({ target: { gate: "passing-gate" } });
    ctxGreen.infra = {
      setup: [],
      gates: [{ id: "passing-gate", command: "true" }],
      testRunner: { command: "true" },
    };
    const resGreen = await runCheck("red-test", ctxGreen);
    expect(resGreen.ok).toBe(false);
    expect(resGreen.summary).toContain("expected red");

    // Custom command target: red passes, green fails
    const ctxCustomRed = makeContext({ target: { command: "false", customTarget: true } });
    const resCustomRed = await runCheck("red-test", ctxCustomRed);
    expect(resCustomRed.ok).toBe(true);

    const ctxCustomGreen = makeContext({ target: { command: "true", customTarget: true } });
    const resCustomGreen = await runCheck("red-test", ctxCustomGreen);
    expect(resCustomGreen.ok).toBe(false);
  });

  it("red-test runs infra.setup in the temp worktree", async () => {
    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "stub\n", "utf8");
    const testFirstSha = (await commitAll(repo, tmpRepo.dir, "test-first commit"))!;
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "math.txt"), "implemented\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "develop: implement feature");

    // Setup writes a marker file; the runner requires it before producing XML
    fs.writeFileSync(
      runnerScript,
      `#!/bin/sh
JUNIT_FILE=""
for arg in "$@"; do
  case "$arg" in
    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
  esac
done
if [ ! -f "setup-marker.txt" ]; then
  exit 3
fi
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
    <failure message="AssertionError">red</failure>
  </testcase>
</testsuite>
EOF
  exit 1
fi
`,
      { mode: 0o755 }
    );
    await commitAll(repo, tmpRepo.dir, "setup-dependent runner");

    const ctx = makeContext({
      testFirstCommit: testFirstSha,
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
      infra: {
        setup: ["touch setup-marker.txt"],
        gates: [],
        testRunner: { command: `sh "${runnerScript}"`, junitArg: "--junitxml={path}" },
      },
    });
    const res = await runCheck("red-test", ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("red-test passed");
  });

  it("red-test restores renamed prod files (old path back, new path gone)", async () => {
    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "old.txt"), "stub\n", "utf8");
    const testFirstSha = (await commitAll(repo, tmpRepo.dir, "test-first commit"))!;

    // Rename + implement in the develop step
    await git(tmpRepo.dir, ["mv", "src/old.txt", "src/new.txt"]);
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "new.txt"), "implemented\n", "utf8");
    await commitAll(repo, tmpRepo.dir, "develop: rename and implement");

    // Runner passes iff the new (implemented) path exists — i.e. iff red-test
    // failed to delete it when restoring prod to the test-first commit.
    fs.writeFileSync(
      runnerScript,
      `#!/bin/sh
JUNIT_FILE=""
for arg in "$@"; do
  case "$arg" in
    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
  esac
done
if [ -f "src/new.txt" ]; then
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
    <failure message="AssertionError">red</failure>
  </testcase>
</testsuite>
EOF
  exit 1
fi
`,
      { mode: 0o755 }
    );
    await commitAll(repo, tmpRepo.dir, "rename-aware runner");

    const ctx = makeContext({
      testFirstCommit: testFirstSha,
      target: { selectors: ["test_math"], expectRed: ["test_math.test_add"] },
    });
    const res = await runCheck("red-test", ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("red-test passed");
  });
});
