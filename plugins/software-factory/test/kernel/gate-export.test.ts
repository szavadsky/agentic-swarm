import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKAGE_ROOT = path.join(import.meta.dir, "..", "..");
const GATES = path.join(PACKAGE_ROOT, "scripts", "gates.sh");

interface Run {
  code: number;
  output: string;
}

function run(cwd: string, cmd: string, args: string[]): Run {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
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
 * A fixture package that fails its typecheck in place (a sibling marker
 * exists) and its tests in the export (the export drops that sibling): each
 * gate fails only for the tree it runs on.
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
      scripts: { typecheck: `test ! -e ../${marker}`, test: "bun test" },
    })}\n`
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
    ].join("\n")
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
  });

  it("keeps the gates separate: red tests do not fail the typecheck gate", () => {
    expect(gate(fixture, "typecheck").code).toBe(0);
    expect(gate(fixture, "tests").code).not.toBe(0);
  });

  it("runs both gates when no gate id is given", () => {
    const all = gate(fixture);
    expect(all.code).not.toBe(0);
    expect(all.output).toContain(fixture.marker);
  });

  it("rejects an unknown gate id before exporting", () => {
    const rejected = gate(fixture, "lint");
    expect(rejected.code).toBe(2);
    expect(rejected.output).toContain("unknown gate 'lint'");
  });
});
