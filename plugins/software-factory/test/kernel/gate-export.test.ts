import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTmpRepo } from "../helpers/tmp-repo.js";

const PACKAGE_ROOT = path.join(import.meta.dir, "..", "..");
const GATES = path.join(PACKAGE_ROOT, "scripts", "gates.sh");

interface Run {
  code: number;
  output: string;
}

function run(cwd: string, cmd: string, args: string[]): Run {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return {
    code: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function gate(fixture: Fixture, id?: string): Run {
  return run(fixture.root, "bash", [GATES, "pkg", ...(id ? [id] : [])]);
}

interface Fixture {
  root: string;
  pkg: string;
  /** The sibling file the fixture's package may not reach from the export. */
  marker: string;
}

/**
 * A fixture package that fails its typecheck, tests, format, lint and
 * schema-validation gates in place (a sibling marker exists) and passes them
 * in the export (the export drops that sibling): each gate fails only for
 * the tree it runs on.
 */
let fixture: Fixture;

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-export-"));
  const pkg = path.join(root, "pkg");
  const marker = `outside-${path.basename(root)}.txt`;
  fs.mkdirSync(path.join(pkg, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, marker), "present\n");
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    `${JSON.stringify({
      name: "gate-export-fixture",
      private: true,
      scripts: {
        typecheck: `test ! -e ../${marker}`,
        test: "bun test",
        format: `test ! -e ../${marker}`,
        lint: `test ! -e ../${marker}`,
        "schema-validation": `test ! -e ../${marker}`,
      },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(pkg, "test", "outside.test.ts"),
    [
      'import { expect, it } from "bun:test";',
      'import fs from "node:fs";',
      'import path from "node:path";',
      "",
      'it("reads a file beside the package", () => {',
      `  const outside = path.join(import.meta.dir, "..", "..", ${JSON.stringify(marker)});`,
      '  expect(fs.readFileSync(outside, "utf8")).toBe("present\\n");',
      "});",
      "",
    ].join("\n"),
  );
  fixture = { root, pkg, marker };
});

afterAll(() => {
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

describe("package-only export gate", () => {
  it("runs typecheck on the export, not in the package's source tree", () => {
    expect(run(fixture.pkg, "bun", ["run", "typecheck"]).code).not.toBe(0);
    expect(gate(fixture, "typecheck").code).toBe(0);
  });

  it("fails the tests gate on a test reading outside the package", () => {
    expect(run(fixture.pkg, "bun", ["test"]).code).toBe(0);
    const exported = gate(fixture, "tests");
    expect(exported.code).not.toBe(0);
    expect(exported.output).toContain(fixture.marker);
    // The marker alone also matches the typecheck echo (`$ test ! -e ...`),
    // so pin bun's failure line for the outside read: a gates.sh that ran
    // typecheck in place instead of the export would exit non-zero with the
    // marker but without this line.
    expect(exported.output).toContain("(fail) reads a file beside the package");
    expect(exported.output).not.toContain("test ! -e");
  });

  it("keeps the gates separate: red tests do not fail the typecheck gate", () => {
    expect(gate(fixture, "typecheck").code).toBe(0);
    expect(gate(fixture, "tests").code).not.toBe(0);
  });

  it("runs every gate when no gate id is given", () => {
    const all = gate(fixture);
    expect(all.code).not.toBe(0);
    expect(all.output).toContain(fixture.marker);
  });

  it("runs the format, lint and schema-validation gates green in the export and red in place", () => {
    for (const id of ["format", "lint", "schema-validation"]) {
      expect(run(fixture.pkg, "bun", ["run", id]).code).not.toBe(0);
      expect(gate(fixture, id).code).toBe(0);
    }
  });

  it("accepts the schema gate as alias of schema-validation", () => {
    expect(gate(fixture, "schema").code).toBe(0);
  });

  it("rejects an unknown gate id before exporting", () => {
    const rejected = gate(fixture, "spot-check");
    expect(rejected.code).toBe(2);
    expect(rejected.output).toContain("unknown gate 'spot-check'");
  });

  it("passes a caller-provided FACTORY_REPO_ROOT through to the gate", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-repo-root-"));
    const pkg = path.join(root, "pkg");
    const elsewhere = path.join(root, "elsewhere");
    try {
      fs.mkdirSync(pkg, { recursive: true });
      fs.mkdirSync(elsewhere, { recursive: true });
      // Only `elsewhere` carries the marker the gate checks for, so the gate
      // can see which repo root it was pointed at.
      fs.writeFileSync(path.join(elsewhere, "schema-marker"), "ok\n");
      fs.writeFileSync(
        path.join(pkg, "package.json"),
        `${JSON.stringify({
          name: "gate-repo-root",
          private: true,
          scripts: {
            "schema-validation":
              'test -n "$FACTORY_REPO_ROOT" && test -f "$FACTORY_REPO_ROOT/schema-marker"',
          },
        })}\n`,
      );
      const baseEnv = { ...process.env };
      delete baseEnv.FACTORY_REPO_ROOT;
      const defaulted = spawnSync("bash", [GATES, pkg, "schema-validation"], {
        cwd: root,
        encoding: "utf8",
        env: baseEnv,
      });
      // Default: the invoking directory, which carries no marker.
      expect(defaulted.status).not.toBe(0);
      const honored = spawnSync("bash", [GATES, pkg, "schema-validation"], {
        cwd: root,
        encoding: "utf8",
        env: { ...baseEnv, FACTORY_REPO_ROOT: elsewhere },
      });
      expect(honored.status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports the tree under test to the gate", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-tree-root-"));
    const pkg = path.join(root, "pkg");
    const elsewhere = path.join(root, "elsewhere");
    try {
      fs.mkdirSync(pkg, { recursive: true });
      fs.mkdirSync(elsewhere, { recursive: true });
      fs.writeFileSync(
        path.join(pkg, "package.json"),
        `${JSON.stringify({
          name: "gate-tree-root",
          private: true,
          scripts: {
            "schema-validation": 'echo "tree-root:$FACTORY_TREE_ROOT"',
          },
        })}\n`,
      );
      const baseEnv = { ...process.env };
      delete baseEnv.FACTORY_TREE_ROOT;
      const defaulted = spawnSync("bash", [GATES, pkg, "schema-validation"], {
        cwd: root,
        encoding: "utf8",
        env: baseEnv,
      });
      // Default outside a git checkout: the invoking directory.
      expect(defaulted.status).toBe(0);
      expect(defaulted.stdout).toContain(`tree-root:${root}`);
      const honored = spawnSync("bash", [GATES, pkg, "schema-validation"], {
        cwd: root,
        encoding: "utf8",
        env: { ...baseEnv, FACTORY_TREE_ROOT: elsewhere },
      });
      expect(honored.status).toBe(0);
      expect(honored.stdout).toContain(`tree-root:${elsewhere}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("defaults the tree root to the git toplevel of the invoking directory", () => {
    const repo = createTmpRepo();
    try {
      const subdir = path.join(repo.dir, "nested", "deep");
      const pkg = path.join(repo.dir, "pkg");
      fs.mkdirSync(subdir, { recursive: true });
      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(
        path.join(pkg, "package.json"),
        `${JSON.stringify({
          name: "gate-tree-toplevel",
          private: true,
          scripts: {
            "schema-validation": 'echo "tree-root:$FACTORY_TREE_ROOT"',
          },
        })}\n`,
      );
      const baseEnv = { ...process.env };
      delete baseEnv.FACTORY_TREE_ROOT;
      const result = spawnSync("bash", [GATES, pkg, "schema-validation"], {
        cwd: subdir,
        encoding: "utf8",
        env: baseEnv,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`tree-root:${repo.dir}`);
    } finally {
      repo.cleanup();
    }
  });
});
