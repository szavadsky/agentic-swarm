import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RUNNER = path.resolve(import.meta.dir, "../../scripts/run-tests.ts");
const WALL = /^tests gate: wall \d+(?:\.\d+)?s \(/m;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  output: string;
}

function run(
  cwd: string,
  patterns: string[],
  env: Record<string, string> = {},
): Run {
  // The factory gate sets the report variable for the outer runner; a nested
  // runner must not inherit it or the outer gate's report is overwritten.
  const baseEnv = { ...process.env };
  delete baseEnv.FACTORY_JUNIT_PATH;
  const result = spawnSync("bun", [RUNNER, ...patterns], {
    cwd,
    encoding: "utf8",
    env: { ...baseEnv, ...env },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    code: result.status ?? -1,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

/**
 * Gate capture keeps the last 4000 bytes of stdout+stderr, stdout first, so
 * the wall report only survives to the checks record as the final stderr line;
 * printed to stdout it is truncated away behind bun's report.
 */
function expectCapturedWall(result: Run, checkLastLine = true): void {
  expect(result.stdout).not.toMatch(WALL);
  const tail = result.stderr.slice(-4000);
  expect(tail).toMatch(WALL);
  if (checkLastLine) {
    expect(tail.trimEnd().split("\n").at(-1) ?? "").toMatch(WALL);
  }
}

/**
 * Fixtures live outside the package so discovery does not pick them up; the
 * runner forwards the patterns to `bun test` in this cwd, which runs each file
 * in a parallel worker exactly as the gate does.
 */
let root: string;
function writeFixture(name: string, lines: string[]): void {
  fs.writeFileSync(path.join(root, name), lines.join("\n"));
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-"));
  writeFixture("green.test.ts", [
    'import { expect, it } from "bun:test";',
    "",
    'it("passes", () => {',
    "  expect(1).toBe(1);",
    "});",
    "",
  ]);
  writeFixture("red.test.ts", [
    'import { expect, it } from "bun:test";',
    "",
    'it("fails", () => {',
    "  expect(1).toBe(2);",
    "});",
    "",
  ]);
  fs.mkdirSync(path.join(root, "sweep"));
  fs.copyFileSync(
    path.join(root, "green.test.ts"),
    path.join(root, "sweep", "only.test.ts"),
  );
  writeFixture("flaky.test.ts", [
    'import { expect, it } from "bun:test";',
    'import fs from "node:fs";',
    'import path from "node:path";',
    "",
    'const marker = path.join(import.meta.dir, "flaky-once.marker");',
    'it("fails once", () => {',
    "  if (!fs.existsSync(marker)) return;",
    "  fs.rmSync(marker);",
    "  expect(1).toBe(2);",
    "});",
    "",
  ]);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("tests gate runner", () => {
  it("exits zero and prints the wall time when every worker is green", () => {
    const green = run(root, ["green.test.ts"]);
    expect(green.code).toBe(0);
    expect(green.output).toContain("1 pass");
    expectCapturedWall(green, true);
  });

  it("fails the gate and names the file when one worker is red", () => {
    const red = run(root, ["green.test.ts", "red.test.ts"]);
    expect(red.code).not.toBe(0);
    expect(red.output).toContain("red.test.ts:");
    expect(red.output).toContain("(fail) fails");
    expect(red.output).not.toContain("(fail) passes");
    expect(red.output).toContain("1 pass");
    expect(red.output).toContain("1 fail");
    expectCapturedWall(red, false);
    expect(red.stderr).toContain("red.test.ts > fails");
  });

  it("writes the report at the gate's declared path for the kernel to read", () => {
    const report = path.join(root, "declared-junit.xml");
    const red = run(root, ["green.test.ts", "red.test.ts"], {
      FACTORY_JUNIT_PATH: report,
    });
    try {
      expect(red.code).not.toBe(0);
      const xml = fs.readFileSync(report, "utf8");
      expect(xml).toContain('name="fails"');
      expect(xml).toContain("<failure");
    } finally {
      fs.rmSync(report, { force: true });
    }
  });

  it("rewrites the report on the one retry so a flake no longer reads red", () => {
    fs.writeFileSync(path.join(root, "flaky-once.marker"), "once\n");
    const report = path.join(root, "flaky-junit.xml");
    const flaky = run(root, ["flaky.test.ts"], {
      FACTORY_JUNIT_PATH: report,
    });
    try {
      expect(flaky.code).toBe(0);
      // The first run's report was red; the retry passed and replaced it, so a
      // kernel reading the declared path sees the gate's final colour.
      expect(fs.readFileSync(report, "utf8")).not.toContain("<failure");
    } finally {
      fs.rmSync(report, { force: true });
    }
  });

  it("runs a test file that no pattern names when the gate sweeps", () => {
    const sweep = run(path.join(root, "sweep"), []);
    expect(sweep.code).toBe(0);
    expect(sweep.output).toContain("1 pass");
    expect(sweep.output).toContain("only.test.ts");
    expectCapturedWall(sweep, true);
  });
});
