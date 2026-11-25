import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GATE_OUTPUT_CAP } from "../../src/kernel/gates.js";
import { interfaceLintProblems, SCOPE } from "../../scripts/interface-lint.js";
import { MANIFEST } from "../../scripts/plugin-manifest.js";

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

/** A scoped folder the fixtures use; its membership pins the check's reach. */
const SCOPED_DIR = "kernel/agent";

let root: string;

function writeFixture(file: string, text: string): void {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

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

describe("check-file-size", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "file-size-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  registerCheckFileSizePart1();
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

function registerCheckFileSizePart1(): void {
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
}

describe("interface lint", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "interface-lint-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("fails an exported type declared in a scoped implementation module", () => {
    expect(SCOPE).toContain(SCOPED_DIR);
    writeFixture(
      `src/${SCOPED_DIR}/run.ts`,
      [
        'const id = "x";',
        "export interface Handle {",
        "  id: string;",
        "}",
        "export type Runner = () => void;",
        "",
      ].join("\n"),
    );

    expect(interfaceLintProblems(root)).toEqual([
      `interface lint: src/${SCOPED_DIR}/run.ts:2 exports interface "Handle"; a type module carries the declaration`,
      `interface lint: src/${SCOPED_DIR}/run.ts:5 exports type "Runner"; a type module carries the declaration`,
    ]);
  });

  it("accepts the declarations in a type module and a re-export from the implementation module", () => {
    writeFixture(
      `src/${SCOPED_DIR}/types.ts`,
      [
        "export interface Handle {",
        "  id: string;",
        "}",
        "export type Runner = () => void;",
        "",
      ].join("\n"),
    );
    writeFixture(
      `src/${SCOPED_DIR}/run.ts`,
      'export type { Handle, Runner } from "./types.js";\n',
    );

    expect(interfaceLintProblems(root)).toEqual([]);
  });

  it("ignores an exported type in a folder outside the scope", () => {
    writeFixture(
      "src/kernel/run.ts",
      ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
    );

    expect(interfaceLintProblems(root)).toEqual([]);
  });
});

describe("interface lint scope", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "interface-lint-scope-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("covers core, cli and harness without exclusions", () => {
    for (const dir of ["core", "cli", "harness"] as const) {
      expect(SCOPE).toContain(dir);
      writeFixture(
        `src/${dir}/run.ts`,
        ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
      );
    }

    expect(interfaceLintProblems(root)).toEqual([
      'interface lint: src/cli/run.ts:1 exports interface "Handle"; a type module carries the declaration',
      'interface lint: src/core/run.ts:1 exports interface "Handle"; a type module carries the declaration',
      'interface lint: src/harness/run.ts:1 exports interface "Handle"; a type module carries the declaration',
    ]);
  });

  it("reaches every nested folder of the three, so none is excluded", () => {
    const dirs = ["cli", "core", "harness"].flatMap((dir) =>
      nestedDirs(path.join(PACKAGE, "src", dir)),
    );

    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      writeFixture(
        `src/${dir}/run.ts`,
        ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
      );
    }

    expect(interfaceLintProblems(root)).toEqual(
      [...dirs]
        .sort()
        .map(
          (dir) =>
            `interface lint: src/${dir}/run.ts:1 exports interface "Handle"; a type module carries the declaration`,
        ),
    );
  });
});

/** Every directory below `dir`, `src`-relative, so a fixture follows the real tree. */
function nestedDirs(dir: string): string[] {
  const src = path.join(PACKAGE, "src");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const child = path.join(dir, entry.name);
      return [
        path.relative(src, child).split(path.sep).join("/"),
        ...nestedDirs(child),
      ];
    });
}

describe("interface lint scope widening", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "interface-lint-scope-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("covers the task-side kernel direct files by pattern", () => {
    // Each migrated file, one exported type apiece: the pattern must reach all.
    const files = [
      "src/kernel/flow-context-front.ts",
      "src/kernel/derive-task-facts.ts",
      "src/kernel/dispatch-state.ts",
      "src/kernel/next.ts",
      "src/kernel/gates-normalise.ts",
    ];
    for (const file of files) {
      writeFixture(
        file,
        ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
      );
    }

    expect(interfaceLintProblems(root)).toEqual(
      [...files]
        .sort()
        .map(
          (file) =>
            `interface lint: ${file}:1 exports interface "Handle"; a type module carries the declaration`,
        ),
    );
  });

  it("leaves the remaining kernel direct files and the migrated type modules alone", () => {
    // A pattern covers its own files only: a sibling the rest of the migration
    // owns is not pulled in, and the `-types.ts` modules stay clean.
    writeFixture(
      "src/kernel/baseline.ts",
      ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
    );
    writeFixture(
      "src/kernel/flow-types.ts",
      ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
    );

    expect(interfaceLintProblems(root)).toEqual([]);
  });
});

describe("interface lint on the package", () => {
  it("holds every kernel subfolder in scope with no exclusion", () => {
    const kernelDirs = fs
      .readdirSync(path.join(PACKAGE, "src", "kernel"), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `kernel/${entry.name}`);

    expect(kernelDirs.length).toBeGreaterThan(0);
    const scope: readonly string[] = SCOPE;
    for (const dir of kernelDirs) expect(scope).toContain(dir);
  });

  it("holds the whole scope clean, the task-side kernel files included", () => {
    expect(interfaceLintProblems(PACKAGE)).toEqual([]);
  }, 30_000);
});
/** Exit-0 biome and knip stand-ins and a sound manifest, so the gate reaches the interface check. */
function stubLintGate(): void {
  writeFixture(
    MANIFEST,
    JSON.stringify({ name: "fixture-plugin", skills: "./skills/" }),
  );
  writeFixture(
    "skills/run/SKILL.md",
    "---\nname: run\ndescription: Run it.\n---\n",
  );
  for (const tool of ["biome", "knip"]) {
    writeFixture(`node_modules/.bin/${tool}`, "#!/usr/bin/env bash\nexit 0\n");
    fs.chmodSync(path.join(root, "node_modules", ".bin", tool), 0o755);
  }
}

function lintGate(): { code: number; output: string } {
  const result = spawnSync(process.execPath, [LINT_GATE, root], {
    encoding: "utf8",
  });
  return {
    code: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("interface lint in the lint gate", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "interface-lint-gate-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("passes a clean scoped folder and rejects a new exported type in it", () => {
    stubLintGate();
    expect(lintGate().code).toBe(0);

    writeFixture(
      `src/${SCOPED_DIR}/run.ts`,
      ["export interface Handle {", "  id: string;", "}", ""].join("\n"),
    );
    const result = lintGate();

    expect(result.code).toBe(1);
    expect(result.output).toContain(
      `interface lint: src/${SCOPED_DIR}/run.ts:1`,
    );
  }, 20_000);
});
