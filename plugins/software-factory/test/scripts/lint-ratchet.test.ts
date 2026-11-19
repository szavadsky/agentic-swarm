// biome-ignore-all lint/complexity: split-rest
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GATE_OUTPUT_CAP } from "../../src/kernel/gates.js";

const PACKAGE = path.join(import.meta.dir, "..", "..");
const BIOME = path.join(PACKAGE, "node_modules", ".bin", "biome");
const LINT_GATE = path.join(PACKAGE, "scripts", "lint.ts");
const SIZE_CHECK = path.join(PACKAGE, "scripts", "check-file-size.ts");

/** A fresh directory under `scripts/` so the real biome.json includes the fixture. */
function fixtureDir(): string {
  const dir = path.join(
    PACKAGE,
    "scripts",
    `.lint-ratchet-${process.pid}-${Date.now()}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function lint(file: string) {
  return spawnSync(BIOME, ["lint", "--colors=off", file], {
    cwd: PACKAGE,
    encoding: "utf8",
  });
}

function nestedIfs(lines: number): string {
  const body = Array.from(
    { length: lines },
    (_, i) => `${"  ".repeat(i + 1)}if (x) {`,
  );
  const close = Array.from(
    { length: lines },
    (_, i) => `${"  ".repeat(lines - i)}}`,
  );
  return [`export function complex(x: boolean) {`, ...body, ...close, "}"].join(
    "\n",
  );
}

function straightLines(lines: number): string {
  const body = Array.from({ length: lines }, () => "  console.log(x);");
  return [`export function long(x: boolean) {`, ...body, "}"].join("\n");
}

describe("lint ratchet", () => {
  let fixtures: string[] = [];

  beforeEach(() => {
    fixtures = [];
  });

  afterEach(() => {
    for (const dir of fixtures)
      fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails a fixture over the complexity threshold", () => {
    const dir = fixtureDir();
    fixtures.push(dir);
    const file = path.join(dir, "complex.ts");
    fs.writeFileSync(file, nestedIfs(16));

    const result = lint(file);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("noExcessiveCognitiveComplexity");
    expect(output).not.toContain("noExcessiveLinesPerFunction");
  });

  it("fails a fixture over the function-length threshold", () => {
    const dir = fixtureDir();
    fixtures.push(dir);
    const file = path.join(dir, "long.ts");
    fs.writeFileSync(file, straightLines(60));

    const result = lint(file);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("noExcessiveLinesPerFunction");
    expect(output).not.toContain("noExcessiveCognitiveComplexity");
  });

  it("passes a fixture under both thresholds", () => {
    const dir = fixtureDir();
    fixtures.push(dir);
    const file = path.join(dir, "ok.ts");
    fs.writeFileSync(file, nestedIfs(1));

    const result = lint(file);

    expect(result.status).toBe(0);
  });
});

describe("check-file-size", () => {
  let root: string;

  function run(): ReturnType<typeof spawnSync> {
    return spawnSync(process.execPath, [SIZE_CHECK, root], {
      encoding: "utf8",
    });
  }

  function writeAllowlist(entries: Record<string, string>): void {
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "config", "file-size-allowlist.json"),
      JSON.stringify(entries),
    );
  }

  function writeLines(file: string, lines: number): void {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "const x = 1;\n".repeat(lines));
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "file-size-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("fails an over-limit file that is not allowlisted and names the file", () => {
    writeLines("src/big.ts", 501);
    writeAllowlist({});

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/big.ts: 501 lines");
  });

  it("passes when every over-limit file is allowlisted and a file at the limit is not", () => {
    writeLines("src/big.ts", 501);
    writeLines("src/fits.ts", 500);
    writeAllowlist({ "src/big.ts": "split-rest" });

    const result = run();

    expect(result.status).toBe(0);
  });

  it("fails a stale allowlist entry", () => {
    writeLines("src/fits.ts", 500);
    writeAllowlist({ "src/fits.ts": "split-rest" });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "src/fits.ts: allowlisted but not over 500 lines",
    );
  });

  it("fails an allowlist entry that names no split task", () => {
    writeLines("src/big.ts", 501);
    writeAllowlist({ "src/big.ts": "later" });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('remover "later" is not a split-* task');
  });
});

describe("lint gate order", () => {
  /**
   * The shape the merge-checks log showed: a report whose diagnostics cap
   * prints warnings only, and a separate error-only pass that prints the error.
   */
  function writeOrderFixture(root: string): void {
    const bin = path.join(root, "node_modules", ".bin");
    fs.mkdirSync(bin, { recursive: true });
    const biome = path.join(bin, "biome");
    fs.writeFileSync(
      biome,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        "  *--diagnostic-level=error*)",
        '    echo "a000.ts:1:17 lint/complexity/noExcessiveCognitiveComplexity"; exit 1 ;;',
        '  *) echo "a001.ts:2:3 lint/style/useConst"; exit 1 ;;',
        "esac",
      ].join("\n"),
    );
    fs.chmodSync(biome, 0o755);
  }

  it("prints the errors last, so a record's capped tail holds them", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-order-"));
    try {
      writeOrderFixture(root);

      const result = spawnSync(process.execPath, [LINT_GATE, root], {
        encoding: "utf8",
      });
      const output = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(1);
      expect(output).toContain("useConst");
      expect(
        output.lastIndexOf("noExcessiveCognitiveComplexity"),
      ).toBeGreaterThan(output.lastIndexOf("useConst"));
      expect(output.slice(-GATE_OUTPUT_CAP)).toContain(
        "noExcessiveCognitiveComplexity",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
