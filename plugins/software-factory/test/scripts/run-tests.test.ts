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

function run(cwd: string, ...patterns: string[]): Run {
  const result = spawnSync("bun", [RUNNER, ...patterns], {
    cwd,
    encoding: "utf8",
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
function expectCapturedWall(result: Run): void {
  expect(result.stdout).not.toMatch(WALL);
  const tail = result.stderr.slice(-4000);
  expect(tail).toMatch(WALL);
  expect(tail.trimEnd().split("\n").at(-1) ?? "").toMatch(WALL);
}

/**
 * Fixtures live outside the package so discovery does not pick them up; the
 * runner forwards the patterns to `bun test` in this cwd, which runs each file
 * in a parallel worker exactly as the gate does.
 */
let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-"));
  fs.writeFileSync(
    path.join(root, "green.test.ts"),
    [
      'import { expect, it } from "bun:test";',
      "",
      'it("passes", () => {',
      "  expect(1).toBe(1);",
      "});",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "red.test.ts"),
    [
      'import { expect, it } from "bun:test";',
      "",
      'it("fails", () => {',
      "  expect(1).toBe(2);",
      "});",
      "",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("tests gate runner", () => {
  it("exits zero and prints the wall time when every worker is green", () => {
    const green = run(root, "green.test.ts");
    expect(green.code).toBe(0);
    expect(green.output).toContain("1 pass");
    expectCapturedWall(green);
  });

  it("fails the gate and names the file when one worker is red", () => {
    const red = run(root, "green.test.ts", "red.test.ts");
    expect(red.code).not.toBe(0);
    expect(red.output).toContain("red.test.ts:");
    expect(red.output).toContain("(fail) fails");
    expect(red.output).not.toContain("(fail) passes");
    expect(red.output).toContain("1 pass");
    expect(red.output).toContain("1 fail");
    expectCapturedWall(red);
  });
});
