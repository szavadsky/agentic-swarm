import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  PIN_GATE_FILE,
  pinGateSchema,
  pinRefusal,
  type PinGate,
} from "../../src/kernel/preflight/pin.js";
import { treeFile } from "../helpers/run-configs.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");
const WRITER = path.join(PACKAGE_ROOT, "scripts/pin-gate.ts");
const OK_TEST =
  'import { expect, it } from "bun:test";\nit("ok", () => { expect(1).toBe(1); });\n';
const RED_TEST =
  'import { expect, it } from "bun:test";\nit("red", () => { expect(1).toBe(2); });\n';
const TREE_TEST = [
  'import { expect, it } from "bun:test";',
  'import fs from "node:fs";',
  'import path from "node:path";',
  'it("gates against the rev tree", () => {',
  "  const tree = process.env.FACTORY_TREE_ROOT!;",
  '  expect(fs.existsSync(path.join(tree, "bootstrap/run/tree.yaml"))).toBe(true);',
  "});",
  "",
].join("\n");

/**
 * The real promote.sh this test promotes with, copied into a fake repo. A
 * package-only export with no tree named carries no script to exercise.
 */
const PROMOTE = treeFile("bootstrap/promote.sh");

/** A repo whose package gates pass or fail with only bun builtins. */
function fakeRepo(): TmpRepo {
  const repo = createTmpRepo();
  repo.writeFile(
    "plugins/software-factory/package.json",
    `${JSON.stringify(
      {
        name: "fake-pin",
        private: true,
        type: "module",
        scripts: { typecheck: "true" },
      },
      null,
      2,
    )}\n`,
  );
  // The writer is the same script promote invokes; type imports stay erased.
  repo.writeFile(
    "plugins/software-factory/scripts/pin-gate.ts",
    fs.readFileSync(WRITER, "utf8"),
  );
  repo.writeFile("plugins/software-factory/test/ok.test.ts", OK_TEST);
  repo.writeFile("plugins/software-factory/test/tree.test.ts", TREE_TEST);
  repo.writeFile("bootstrap/run/tree.yaml", "aliases: {}\n");
  repo.writeFile("bootstrap/promote.sh", fs.readFileSync(PROMOTE!, "utf8"));
  repo.commit("fake pin package");
  return repo;
}

function promote(
  repo: TmpRepo,
  pins: string,
): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    "bash",
    [path.join(repo.dir, "bootstrap", "promote.sh")],
    {
      cwd: repo.dir,
      env: {
        ...process.env,
        FACTORY_PIN_ROOT: pins,
        FACTORY_PINS_KEPT: "2",
      },
      encoding: "utf8",
    },
  );
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gateAt(build: string): PinGate {
  return pinGateSchema.parse(
    yaml.parse(fs.readFileSync(path.join(build, PIN_GATE_FILE), "utf8")),
  );
}

describe.skipIf(PROMOTE === undefined)("promote records its gate", () => {
  it("writes an all-pass gate on the clean export and links it as current", () => {
    const repo = fakeRepo();
    const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
    try {
      const rev = repo.git(["rev-parse", "--short=12", "HEAD"]).stdout.trim();
      // Never the working tree: an uncommitted file must not reach the pin.
      repo.writeFile("plugins/software-factory/UNCOMMITTED.txt", "worktree\n");
      const run = promote(repo, pins);
      expect(run.code).toBe(0);
      const build = path.join(pins, rev);
      expect(run.stdout.trim().split("\n").at(-1)).toBe(build);
      expect(gateAt(build)).toMatchObject({
        rev,
        typecheck: "pass",
        tests: "pass",
      });
      expect(pinRefusal(build)).toBeUndefined();
      expect(fs.existsSync(path.join(build, "UNCOMMITTED.txt"))).toBe(false);
      expect(fs.realpathSync(path.join(pins, "current"))).toBe(
        fs.realpathSync(build),
      );
    } finally {
      repo.cleanup();
      fs.rmSync(pins, { recursive: true, force: true });
    }
  }, 120_000);
});

describe.skipIf(PROMOTE === undefined)("promote records a red build", () => {
  it("keeps it off current and leaves the last green pin linked", () => {
    const repo = fakeRepo();
    const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
    try {
      const greenRev = repo
        .git(["rev-parse", "--short=12", "HEAD"])
        .stdout.trim();
      expect(promote(repo, pins).code).toBe(0);
      const green = path.join(pins, greenRev);

      repo.writeFile("plugins/software-factory/test/red.test.ts", RED_TEST);
      const redRev = repo.commit("red pin package").slice(0, 12);
      const red = promote(repo, pins);
      expect(red.code).toBe(1);
      expect(red.stderr).toContain("not linked as current");

      const build = path.join(pins, redRev);
      expect(gateAt(build)).toMatchObject({
        rev: redRev,
        typecheck: "pass",
        tests: "fail",
      });
      expect(pinRefusal(build)).toContain("gate red: tests fail");
      // A red build is recorded, never linked: the launch would read this pin.
      expect(fs.realpathSync(path.join(pins, "current"))).toBe(
        fs.realpathSync(green),
      );
    } finally {
      repo.cleanup();
      fs.rmSync(pins, { recursive: true, force: true });
    }
  }, 120_000);
});

describe.skipIf(PROMOTE === undefined)(
  "promote re-gates an existing pin",
  () => {
    it("recreates a missing record and replaces a stale one", () => {
      const repo = fakeRepo();
      const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
      try {
        const rev = repo.git(["rev-parse", "--short=12", "HEAD"]).stdout.trim();
        expect(promote(repo, pins).code).toBe(0);
        const build = path.join(pins, rev);
        fs.rmSync(path.join(build, PIN_GATE_FILE));
        expect(pinRefusal(build)).toContain("gate.yaml is missing");

        expect(promote(repo, pins).code).toBe(0);
        expect(gateAt(build)).toMatchObject({ rev, tests: "pass" });
        const staleAt = new Date(Date.now() - 60_000).toISOString();
        fs.writeFileSync(
          path.join(build, PIN_GATE_FILE),
          JSON.stringify({
            rev,
            typecheck: "fail",
            tests: "fail",
            at: staleAt,
          }),
        );
        expect(pinRefusal(build)).toContain("gate red");
        expect(promote(repo, pins).code).toBe(0);
        const gate = gateAt(build);
        expect(gate).toMatchObject({ rev, typecheck: "pass", tests: "pass" });
        expect(Date.parse(gate.at)).toBeGreaterThan(Date.parse(staleAt));
        expect(fs.realpathSync(path.join(pins, "current"))).toBe(
          fs.realpathSync(build),
        );
      } finally {
        repo.cleanup();
        fs.rmSync(pins, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
