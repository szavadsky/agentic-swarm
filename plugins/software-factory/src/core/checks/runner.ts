import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runProcess } from "../proc.js";
import { fingerprintText } from "../fingerprint.js";
import { changedFiles, numstat, changedLines, diffText, matchGlobs } from "../git/diff.js";
import { headOf } from "../git/commit.js";
import { git } from "../git/exec.js";
import { parseBranch } from "../git/naming.js";
import { runGates } from "./gates.js";
import { parseJunit, buildTargetCommand } from "./junit.js";
import { tailCap, type CheckContext, type CheckResult } from "./types.js";

const DEFAULT_TEST_GLOBS = ["test/**", "tests/**", "**/*.test.*", "**/*.spec.*"];
const DEFAULT_PROD_GLOBS = ["src/**", "lib/**"];
const CONFIG_FILE_GLOBS = [
  "package.json",
  "package-lock.json",
  "bun.lockb",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "*.config.*",
  "tsconfig*.json",
];

function getGlobs(configured?: string | string[], defaults: string[] = []): string[] {
  if (!configured) return defaults;
  return Array.isArray(configured) ? configured : [configured];
}

function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_\-\.\/:=]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function findMatchingCase(
  cases: { id: string; status: "pass" | "fail" | "error" | "skip" }[],
  expectId: string
) {
  return cases.find(
    (c) =>
      c.id === expectId ||
      c.id.endsWith("." + expectId) ||
      c.id.endsWith("::" + expectId) ||
      c.id.split(".").pop() === expectId ||
      c.id.split("::").pop() === expectId
  );
}

/**
 * Runs a mechanical check by name (built-in or custom command check from pipeline.checks).
 */
export async function runCheck(name: string, ctx: CheckContext): Promise<CheckResult> {
  switch (name) {
    case "gates":
      return checkGates(ctx);
    case "test-first-scope":
      return checkTestFirstScope(ctx);
    case "tests-only":
      return checkTestsOnly(ctx);
    case "target-red":
      return checkTargetRed(ctx);
    case "target-green":
      return checkTargetGreen(ctx);
    case "red-test":
      return checkRedTest(ctx);
    case "test-diff":
      return checkTestDiff(ctx);
    case "size":
      return checkSize(ctx);
    case "simple-guard":
      return checkSimpleGuard(ctx);
    case "poc-scope":
      return checkPocScope(ctx);
    default: {
      const custom = ctx.pipeline.checks?.[name];
      if (custom) {
        return checkCustom(name, custom, ctx);
      }
      const summary = `Unknown check: ${name}`;
      return {
        name,
        ok: false,
        summary,
        output: "",
        fingerprint: fingerprintText(summary),
      };
    }
  }
}

async function checkGates(ctx: CheckContext): Promise<CheckResult> {
  const { results, ok } = await runGates(ctx);
  const flaky = results.filter((r) => r.status === "flaky").map((r) => r.id);
  const failed = results.filter((r) => r.status === "fail").map((r) => r.id);

  let summary: string;
  if (ok) {
    summary = `Gates passed (${results.length} gates${flaky.length > 0 ? `, flaky: ${flaky.join(", ")}` : ""})`;
  } else {
    summary = `Gate regressions: ${failed.join(", ")}`;
  }

  const rawOutput = results
    .map((r) => `[${r.id}] ${r.status}${r.details ? `:\n${r.details}` : ""}`)
    .join("\n\n");
  const output = tailCap(rawOutput, ctx.outputBytes);
  const fingerprint = ok ? fingerprintText("gates ok") : fingerprintText(summary);

  return {
    name: "gates",
    ok,
    summary,
    output,
    fingerprint,
    flaky: flaky.length > 0 ? flaky : undefined,
    details: results,
  };
}

async function checkTestFirstScope(ctx: CheckContext): Promise<CheckResult> {
  const testGlobs = getGlobs(ctx.project.paths?.tests, DEFAULT_TEST_GLOBS);
  const prodGlobs = getGlobs(ctx.project.paths?.prod, DEFAULT_PROD_GLOBS);
  const maxStubLines = ctx.limits.stubMaxProdLines ?? 40;

  const changed = await changedFiles(ctx.wt, ctx.base, ctx.head);
  const stats = await numstat(ctx.wt, ctx.base, ctx.head);

  const testFiles: string[] = [];
  const newProdFiles: string[] = [];
  let stubProdLines = 0;

  for (const f of changed) {
    if (matchGlobs(f.path, testGlobs)) {
      testFiles.push(f.path);
    } else if (matchGlobs(f.path, prodGlobs)) {
      if (f.status !== "A") {
        const summary = `Modified prod file not allowed in test-first: ${f.path} (status: ${f.status})`;
        return {
          name: "test-first-scope",
          ok: false,
          summary,
          output: "",
          fingerprint: fingerprintText(summary),
        };
      }
      newProdFiles.push(f.path);
      const stat = stats.find((s) => s.path === f.path);
      if (stat && stat.added !== undefined && !Number.isNaN(stat.added)) {
        stubProdLines += stat.added;
      }
    } else {
      const summary = `File outside test and prod paths changed in test-first: ${f.path}`;
      return {
        name: "test-first-scope",
        ok: false,
        summary,
        output: "",
        fingerprint: fingerprintText(summary),
      };
    }
  }

  if (stubProdLines > maxStubLines) {
    const summary = `New prod stub lines (${stubProdLines}) exceeded limit of ${maxStubLines}`;
    return {
      name: "test-first-scope",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const summary = `test-first-scope passed (${testFiles.length} test files, ${newProdFiles.length} new prod stubs with ${stubProdLines} lines)`;
  return {
    name: "test-first-scope",
    ok: true,
    summary,
    output: "",
    fingerprint: fingerprintText("test-first-scope ok"),
    details: { testFiles, newProdFiles, stubProdLines },
  };
}

async function checkTestsOnly(ctx: CheckContext): Promise<CheckResult> {
  const testGlobs = getGlobs(ctx.project.paths?.tests, DEFAULT_TEST_GLOBS);
  const changed = await changedFiles(ctx.wt, ctx.base, ctx.head);

  const nonTestFiles: string[] = [];
  for (const f of changed) {
    if (!matchGlobs(f.path, testGlobs)) {
      nonTestFiles.push(f.path);
    }
  }

  if (nonTestFiles.length > 0) {
    const summary = `Changes outside test paths found: ${nonTestFiles.join(", ")}`;
    return {
      name: "tests-only",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const summary = `tests-only passed (${changed.length} test files changed)`;
  return {
    name: "tests-only",
    ok: true,
    summary,
    output: "",
    fingerprint: fingerprintText("tests-only ok"),
  };
}

async function checkTargetRed(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.target) {
    const summary = "No target specified for target-red check";
    return {
      name: "target-red",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  // Bootstrap story target by gate
  if ("gate" in ctx.target && ctx.target.gate) {
    const gateId = ctx.target.gate;
    const gate = ctx.infra?.gates.find((g) => g.id === gateId);
    const cmd = gate ? gate.command : gateId;
    const res = await runProcess({ cmd, cwd: ctx.wt });
    const ok = res.code !== 0;
    const summary = ok
      ? `Gate ${gateId} failed as expected (red)`
      : `Gate ${gateId} passed but was expected red`;
    const output = tailCap((res.stdout + "\n" + res.stderr).trim(), ctx.outputBytes);
    return {
      name: "target-red",
      ok,
      summary,
      output,
      fingerprint: ok ? fingerprintText("target-red gate ok") : fingerprintText(summary),
    };
  }

  // Bootstrap story custom command target
  if ("customTarget" in ctx.target && ctx.target.customTarget) {
    const res = await runProcess({ cmd: ctx.target.command, cwd: ctx.wt });
    const ok = res.code !== 0;
    const summary = ok
      ? `Custom target command failed as expected (red)`
      : `Custom target command passed but was expected red`;
    const output = tailCap((res.stdout + "\n" + res.stderr).trim(), ctx.outputBytes);
    return {
      name: "target-red",
      ok,
      summary,
      output,
      fingerprint: ok ? fingerprintText("target-red custom ok") : fingerprintText(summary),
    };
  }

  // Standard story with expectRed
  const expectRed =
    "expectRed" in ctx.target && ctx.target.expectRed ? ctx.target.expectRed : [];
  if (expectRed.length === 0) {
    const summary = "target-red requires non-empty target.expectRed list";
    return {
      name: "target-red",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  if (!ctx.infra) {
    const summary = "Missing infra configuration for testRunner";
    return {
      name: "target-red",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const tmpJunit = path.join(
    os.tmpdir(),
    `junit-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`
  );

  try {
    const cmd = buildTargetCommand(ctx.infra, ctx.target, tmpJunit);
    const procRes = await runProcess({ cmd, cwd: ctx.wt });
    const procOutput = (procRes.stdout + "\n" + procRes.stderr).trim();

    let xml = "";
    if (fs.existsSync(tmpJunit)) {
      xml = await fs.promises.readFile(tmpJunit, "utf8");
    }

    if (!xml.trim()) {
      // Junit was not generated; check if suite crashed during collection
      const summary = `Test execution produced no JUnit XML (exit code ${procRes.code})`;
      return {
        name: "target-red",
        ok: false,
        summary,
        output: tailCap(procOutput, ctx.outputBytes),
        fingerprint: fingerprintText(summary),
      };
    }

    const parsed = parseJunit(xml);

    if (!parsed.collected) {
      const summary = `Test suite failed collection: ${parsed.errors.join("; ") || "collection error"}`;
      return {
        name: "target-red",
        ok: false,
        summary,
        output: tailCap(procOutput, ctx.outputBytes),
        fingerprint: fingerprintText(summary),
      };
    }

    for (const expectId of expectRed) {
      const match = findMatchingCase(parsed.cases, expectId);
      if (!match) {
        const summary = `Expected red test missing from suite: ${expectId}`;
        return {
          name: "target-red",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }

      if (match.status === "error") {
        const summary = `Expected red test errored instead of failing assertion: ${expectId}`;
        return {
          name: "target-red",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }

      if (match.status === "pass") {
        const summary = `Expected red test passed: ${expectId}`;
        return {
          name: "target-red",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }

      if (match.status === "skip") {
        const summary = `Expected red test was skipped: ${expectId}`;
        return {
          name: "target-red",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }
    }

    const summary = `target-red passed: all ${expectRed.length} expected tests failed with assertion failures`;
    return {
      name: "target-red",
      ok: true,
      summary,
      output: tailCap(procOutput, ctx.outputBytes),
      fingerprint: fingerprintText("target-red ok"),
    };
  } finally {
    if (fs.existsSync(tmpJunit)) {
      await fs.promises.rm(tmpJunit, { force: true });
    }
  }
}

async function checkTargetGreen(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.target) {
    const summary = "No target specified for target-green check";
    return {
      name: "target-green",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  if ("gate" in ctx.target && ctx.target.gate) {
    const gateId = ctx.target.gate;
    const gate = ctx.infra?.gates.find((g) => g.id === gateId);
    const cmd = gate ? gate.command : gateId;
    const res = await runProcess({ cmd, cwd: ctx.wt });
    const ok = res.code === 0;
    const summary = ok
      ? `Gate ${gateId} passed (green)`
      : `Gate ${gateId} failed with exit code ${res.code}`;
    const output = tailCap((res.stdout + "\n" + res.stderr).trim(), ctx.outputBytes);
    return {
      name: "target-green",
      ok,
      summary,
      output,
      fingerprint: ok ? fingerprintText("target-green gate ok") : fingerprintText(summary),
    };
  }

  if ("customTarget" in ctx.target && ctx.target.customTarget) {
    const res = await runProcess({ cmd: ctx.target.command, cwd: ctx.wt });
    const ok = res.code === 0;
    const summary = ok
      ? `Custom target command passed (green)`
      : `Custom target command failed with exit code ${res.code}`;
    const output = tailCap((res.stdout + "\n" + res.stderr).trim(), ctx.outputBytes);
    return {
      name: "target-green",
      ok,
      summary,
      output,
      fingerprint: ok ? fingerprintText("target-green custom ok") : fingerprintText(summary),
    };
  }

  if (!ctx.infra) {
    const summary = "Missing infra configuration for testRunner";
    return {
      name: "target-green",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const tmpJunit = path.join(
    os.tmpdir(),
    `junit-green-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`
  );

  try {
    const cmd = buildTargetCommand(ctx.infra, ctx.target, tmpJunit);
    const procRes = await runProcess({ cmd, cwd: ctx.wt });
    const procOutput = (procRes.stdout + "\n" + procRes.stderr).trim();

    if (procRes.code !== 0 && !fs.existsSync(tmpJunit)) {
      const summary = `Target test command failed with exit code ${procRes.code}`;
      return {
        name: "target-green",
        ok: false,
        summary,
        output: tailCap(procOutput, ctx.outputBytes),
        fingerprint: fingerprintText(summary),
      };
    }

    if (fs.existsSync(tmpJunit)) {
      const xml = await fs.promises.readFile(tmpJunit, "utf8");
      const parsed = parseJunit(xml);

      if (!parsed.collected) {
        const summary = `Test suite failed collection: ${parsed.errors.join("; ") || "collection error"}`;
        return {
          name: "target-green",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }

      const failing = parsed.cases.filter((c) => c.status === "fail" || c.status === "error");
      if (failing.length > 0) {
        const summary = `Tests failed: ${failing.map((c) => c.id).join(", ")}`;
        return {
          name: "target-green",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }
    }

    if (procRes.code !== 0) {
      const summary = `Target command failed with exit code ${procRes.code}`;
      return {
        name: "target-green",
        ok: false,
        summary,
        output: tailCap(procOutput, ctx.outputBytes),
        fingerprint: fingerprintText(summary),
      };
    }

    const summary = "target-green passed: selected tests passed";
    return {
      name: "target-green",
      ok: true,
      summary,
      output: tailCap(procOutput, ctx.outputBytes),
      fingerprint: fingerprintText("target-green ok"),
    };
  } finally {
    if (fs.existsSync(tmpJunit)) {
      await fs.promises.rm(tmpJunit, { force: true });
    }
  }
}

async function checkRedTest(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.testFirstCommit) {
    const summary = "red-test requires testFirstCommit";
    return {
      name: "red-test",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const expectRed =
    ctx.target && "expectRed" in ctx.target && ctx.target.expectRed
      ? ctx.target.expectRed
      : [];
  if (expectRed.length === 0) {
    const summary = "red-test requires target.expectRed";
    return {
      name: "red-test",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  if (!ctx.infra) {
    const summary = "red-test requires infra testRunner configuration";
    return {
      name: "red-test",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const { sha: itemTip } = await headOf(ctx.wt);
  const tempWtDir = fs.mkdtempSync(path.join(os.tmpdir(), "red-test-wt-"));
  const tmpJunit = path.join(
    os.tmpdir(),
    `junit-redtest-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`
  );

  try {
    // Create temporary detached worktree at item tip
    await ctx.repo.writeLock.runExclusive(async () => {
      await git(ctx.repo.mainRoot, ["worktree", "add", "--detach", tempWtDir, itemTip]);
    });

    // Restore paths.prod to testFirstCommit
    const prodGlobs = getGlobs(ctx.project.paths?.prod, DEFAULT_PROD_GLOBS);
    const changed = await changedFiles(tempWtDir, ctx.testFirstCommit, itemTip);

    for (const f of changed) {
      if (matchGlobs(f.path, prodGlobs)) {
        if (f.status === "A") {
          // File was added after test-first commit: remove it
          await fs.promises.rm(path.join(tempWtDir, f.path), { force: true });
        } else {
          // File was modified or deleted: restore from testFirstCommit
          const restorePath = f.from ?? f.path;
          await git(tempWtDir, ["checkout", ctx.testFirstCommit, "--", restorePath], {
            allowFail: true,
          });
        }
      }
    }

    // Run target tests in temp worktree
    const cmd = buildTargetCommand(ctx.infra, ctx.target!, tmpJunit);
    const procRes = await runProcess({ cmd, cwd: tempWtDir });
    const procOutput = (procRes.stdout + "\n" + procRes.stderr).trim();

    if (!fs.existsSync(tmpJunit)) {
      const summary = `red-test: tests failed to produce JUnit XML (exit code ${procRes.code})`;
      return {
        name: "red-test",
        ok: false,
        summary,
        output: tailCap(procOutput, ctx.outputBytes),
        fingerprint: fingerprintText(summary),
      };
    }

    const xml = await fs.promises.readFile(tmpJunit, "utf8");
    const parsed = parseJunit(xml);

    if (!parsed.collected) {
      const summary = `red-test: suite failed collection when prod restored: ${parsed.errors.join("; ")}`;
      return {
        name: "red-test",
        ok: false,
        summary,
        output: tailCap(procOutput, ctx.outputBytes),
        fingerprint: fingerprintText(summary),
      };
    }

    for (const expectId of expectRed) {
      const match = findMatchingCase(parsed.cases, expectId);
      if (!match) {
        const summary = `red-test: expected test missing from suite: ${expectId}`;
        return {
          name: "red-test",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }

      if (match.status === "pass") {
        const summary = `red-test failed: test ${expectId} passes even without production code changes`;
        return {
          name: "red-test",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }

      if (match.status !== "fail") {
        const summary = `red-test: test ${expectId} did not fail with assertion failure (status: ${match.status})`;
        return {
          name: "red-test",
          ok: false,
          summary,
          output: tailCap(procOutput, ctx.outputBytes),
          fingerprint: fingerprintText(summary),
        };
      }
    }

    const summary = `red-test passed: all ${expectRed.length} tests fail when prod changes are restored to test-first commit`;
    return {
      name: "red-test",
      ok: true,
      summary,
      output: tailCap(procOutput, ctx.outputBytes),
      fingerprint: fingerprintText("red-test ok"),
    };
  } finally {
    // Clean up temp worktree always
    await ctx.repo.writeLock.runExclusive(async () => {
      await git(ctx.repo.mainRoot, ["worktree", "remove", "--force", tempWtDir], {
        allowFail: true,
      });
      await git(ctx.repo.mainRoot, ["worktree", "prune"], { allowFail: true });
    });
    if (fs.existsSync(tempWtDir)) {
      await fs.promises.rm(tempWtDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tmpJunit)) {
      await fs.promises.rm(tmpJunit, { force: true });
    }
  }
}

async function checkTestDiff(ctx: CheckContext): Promise<CheckResult> {
  const diffBase = ctx.testFirstCommit ?? ctx.base;
  const diffHead = ctx.head ?? "HEAD";
  const testGlobs = getGlobs(ctx.project.paths?.tests, DEFAULT_TEST_GLOBS);

  const changed = await changedFiles(ctx.wt, diffBase, diffHead);
  const testFiles = changed.filter((f) => matchGlobs(f.path, testGlobs)).map((f) => f.path);

  let rawDiff = "";
  if (testFiles.length > 0) {
    rawDiff = await diffText(ctx.wt, diffBase, diffHead, testFiles);
  }

  const summary = `test-diff generated (${testFiles.length} test files, ${rawDiff.length} bytes)`;
  const output = tailCap(rawDiff, ctx.outputBytes);
  return {
    name: "test-diff",
    ok: true,
    summary,
    output,
    fingerprint: fingerprintText("test-diff ok"),
    details: { diff: rawDiff, files: testFiles },
  };
}

async function checkSize(ctx: CheckContext): Promise<CheckResult> {
  const isSimple = ctx.kind === "simple";
  const limit = isSimple
    ? (ctx.limits.simpleMaxProdLines ?? 150)
    : (ctx.limits.storyMaxProdLines ?? 300);

  const prodGlobs = getGlobs(ctx.project.paths?.prod, DEFAULT_PROD_GLOBS);
  const lines = await changedLines(ctx.wt, ctx.base, ctx.head, prodGlobs);

  if (lines.total > limit) {
    const summary = `Production changes (${lines.total} lines) exceeded limit (${limit} lines) for kind ${ctx.kind ?? "story"}`;
    return {
      name: "size",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
      details: { changedLines: lines, limit },
    };
  }

  const summary = `size passed: ${lines.total}/${limit} production lines changed`;
  return {
    name: "size",
    ok: true,
    summary,
    output: "",
    fingerprint: fingerprintText("size ok"),
    details: { changedLines: lines, limit },
  };
}

async function checkSimpleGuard(ctx: CheckContext): Promise<CheckResult> {
  const limit = ctx.limits.simpleMaxProdLines ?? 150;
  const prodGlobs = getGlobs(ctx.project.paths?.prod, DEFAULT_PROD_GLOBS);
  const testGlobs = getGlobs(ctx.project.paths?.tests, DEFAULT_TEST_GLOBS);

  // 1. Prod line count limit
  const lines = await changedLines(ctx.wt, ctx.base, ctx.head, prodGlobs);
  if (lines.total > limit) {
    const summary = `Simple task prod lines (${lines.total}) exceeded simpleMaxProdLines (${limit})`;
    return {
      name: "simple-guard",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  // 2. Test changes rename-only (diff -M)
  const changed = await changedFiles(ctx.wt, ctx.base, ctx.head);
  for (const f of changed) {
    if (matchGlobs(f.path, testGlobs)) {
      if (f.status !== "R") {
        const summary = `Simple task test change not rename-only: ${f.path} (status: ${f.status})`;
        return {
          name: "simple-guard",
          ok: false,
          summary,
          output: "",
          fingerprint: fingerprintText(summary),
        };
      }
    }
  }

  // 3. No new deps or modified dependency configurations
  for (const f of changed) {
    if (matchGlobs(f.path, CONFIG_FILE_GLOBS)) {
      if (f.status === "A") {
        const summary = `Simple task added new dependency or config file: ${f.path}`;
        return {
          name: "simple-guard",
          ok: false,
          summary,
          output: "",
          fingerprint: fingerprintText(summary),
        };
      }
      if (
        f.status === "M" &&
        (f.path.endsWith("package.json") ||
          f.path.endsWith("requirements.txt") ||
          f.path.endsWith("pyproject.toml"))
      ) {
        const summary = `Simple task modified dependencies in ${f.path}`;
        return {
          name: "simple-guard",
          ok: false,
          summary,
          output: "",
          fingerprint: fingerprintText(summary),
        };
      }
    }
  }

  const summary = `simple-guard satisfied (${lines.total} prod lines, no test logic changes or new deps)`;
  return {
    name: "simple-guard",
    ok: true,
    summary,
    output: "",
    fingerprint: fingerprintText("simple-guard ok"),
  };
}

async function checkPocScope(ctx: CheckContext): Promise<CheckResult> {
  const pocGlobs = ctx.item
    ? [`items/${ctx.item}/poc/**`, `**/${ctx.item}/poc/**`, "**/poc/**"]
    : ["**/poc/**"];

  const changed = await changedFiles(ctx.wt, ctx.base, ctx.head);
  const outsideFiles: string[] = [];

  for (const f of changed) {
    if (!matchGlobs(f.path, pocGlobs)) {
      outsideFiles.push(f.path);
    }
  }

  if (outsideFiles.length > 0) {
    const summary = `poc-scope violation: changes outside poc/ found: ${outsideFiles.join(", ")}`;
    return {
      name: "poc-scope",
      ok: false,
      summary,
      output: "",
      fingerprint: fingerprintText(summary),
    };
  }

  const summary = `poc-scope satisfied: all changes confined to poc/`;
  return {
    name: "poc-scope",
    ok: true,
    summary,
    output: "",
    fingerprint: fingerprintText("poc-scope ok"),
  };
}

async function checkCustom(
  name: string,
  config: NonNullable<CheckContext["pipeline"]["checks"]>[string],
  ctx: CheckContext
): Promise<CheckResult> {
  const prodGlobs = getGlobs(ctx.project.paths?.prod, DEFAULT_PROD_GLOBS);
  const testGlobs = getGlobs(ctx.project.paths?.tests, DEFAULT_TEST_GLOBS);

  const changed = await changedFiles(ctx.wt, ctx.base, ctx.head);
  const changedProd = changed
    .filter((f) => matchGlobs(f.path, prodGlobs))
    .map((f) => shellQuote(f.path))
    .join(" ");
  const changedTests = changed
    .filter((f) => matchGlobs(f.path, testGlobs))
    .map((f) => shellQuote(f.path))
    .join(" ");

  const { branch } = await headOf(ctx.wt);
  const parsed = parseBranch(branch);
  const task = parsed?.task ?? path.basename(ctx.wt).replace(/^topic_/, "").split("--")[0] ?? "";
  const item = ctx.item ?? (parsed?.items ? parsed.items[parsed.items.length - 1] ?? "" : "");
  const headRev = ctx.head ?? "HEAD";

  let cmd = config.run;
  cmd = cmd.replace(/\{\{worktree\}\}/g, shellQuote(ctx.wt));
  cmd = cmd.replace(/\{\{wt\}\}/g, shellQuote(ctx.wt));
  cmd = cmd.replace(/\{\{base\}\}/g, shellQuote(ctx.base));
  cmd = cmd.replace(/\{\{head\}\}/g, shellQuote(headRev));
  cmd = cmd.replace(/\{\{item\}\}/g, shellQuote(item));
  cmd = cmd.replace(/\{\{task\}\}/g, shellQuote(task));
  cmd = cmd.replace(/\{\{changedProd\}\}/g, changedProd);
  cmd = cmd.replace(/\{\{changedTests\}\}/g, changedTests);

  const cwd = config.cwd === "task" ? ctx.repo.worktreeRoot : ctx.wt;
  const res = await runProcess({
    cmd,
    cwd,
    timeoutSec: config.timeoutSec ?? 60,
  });

  const expectPass = (config.expect ?? "pass") === "pass";
  const ok = expectPass ? res.code === 0 : res.code !== 0;

  let summary: string;
  if (ok) {
    summary = expectPass
      ? `Custom check ${name} passed (exit code 0)`
      : `Custom check ${name} failed as expected (exit code ${res.code})`;
  } else {
    summary = expectPass
      ? `Custom check ${name} failed with exit code ${res.code}`
      : `Custom check ${name} passed but expected failure`;
  }

  const rawOutput = (res.stdout + (res.stderr ? "\n" + res.stderr : "")).trim();
  const output = tailCap(rawOutput, ctx.outputBytes);
  const fingerprint = ok ? fingerprintText(`custom check ${name} ok`) : fingerprintText(summary);

  return {
    name,
    ok,
    summary,
    output,
    fingerprint,
  };
}
