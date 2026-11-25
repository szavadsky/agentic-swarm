import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { promotePin, writePinGate } from "../../src/cli/commands/promote.js";
import {
  PIN_GATE_FILE,
  pinGateSchema,
  pinRefusal,
} from "../../src/kernel/preflight/pin.js";
import type { PinGate } from "../../src/kernel/preflight/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const OK_TEST =
  'import { expect, it } from "bun:test";\nit("ok", () => { expect(1).toBe(1); });\n';

/** The fake package's gate scripts; every gate is green unless overridden. */
const GREEN_SCRIPTS: Record<string, string> = {
  typecheck: "true",
  "test:gate": "bun test",
  format: "true",
  lint: "true",
  "schema-validation": "true",
};

/** Writes the fake package's gate scripts, one override making a gate red. */
function writeScripts(repo: TmpRepo, scripts: Record<string, string>): void {
  repo.writeFile(
    "plugins/software-factory/package.json",
    `${JSON.stringify(
      {
        name: "fake-pin",
        private: true,
        type: "module",
        scripts: { ...GREEN_SCRIPTS, ...scripts },
      },
      null,
      2,
    )}\n`,
  );
}

/** A repo whose plugin gates pass with only bun builtins. */
function fakeRepo(scripts: Record<string, string> = {}): TmpRepo {
  const repo = createTmpRepo();
  writeScripts(repo, scripts);
  repo.writeFile("plugins/software-factory/test/ok.test.ts", OK_TEST);
  repo.writeFile("bootstrap/run/tree.yaml", "aliases: {}\n");
  repo.writeFile("bootstrap/promote.sh", 'exec true "$@"\n');
  repo.commit("fake pin package");
  return repo;
}

function gateAt(build: string): PinGate {
  return pinGateSchema.parse(
    yaml.parse(fs.readFileSync(path.join(build, PIN_GATE_FILE), "utf8")),
  );
}

/** Run one promote with the operator env overridden, returning its code. */
async function runPromote(
  repo: TmpRepo,
  pins: string,
  kept?: string,
  lines?: string[],
): Promise<number> {
  const log = console.log;
  const captured: string[] = lines ?? [];
  console.log = (msg: string) => captured.push(msg);
  try {
    return promotePin({
      repo: repo.dir,
      env: {
        ...process.env,
        FACTORY_PIN_ROOT: pins,
        FACTORY_PINS_KEPT: kept ?? "2",
      },
    });
  } finally {
    console.log = log;
  }
}

describe("promote gates a clean export", () => {
  it("writes gate.yaml and links it as current", async () => {
    const repo = fakeRepo();
    const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
    const lines: string[] = [];
    try {
      const rev = repo.git(["rev-parse", "--short=12", "HEAD"]).stdout.trim();
      // An uncommitted file must not reach the pin.
      repo.writeFile("plugins/software-factory/UNCOMMITTED.txt", "worktree\n");
      expect(await runPromote(repo, pins, undefined, lines)).toBe(0);
      const build = path.join(pins, rev);
      expect(lines.at(-1)).toBe(build);
      expect(gateAt(build)).toMatchObject({
        rev,
        typecheck: "pass",
        tests: "pass",
        format: "pass",
        lint: "pass",
        schemaValidation: "pass",
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
  }, 60_000);
});

describe("promote prunes old builds", () => {
  it("keeps only the newest build beyond the kept count", async () => {
    const repo = fakeRepo();
    const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
    try {
      for (let i = 0; i < 3; i++) {
        repo.writeFile(`marker-${i}.txt`, `${i}\n`);
        repo.commit(`commit ${i}`);
        expect(await runPromote(repo, pins, "1")).toBe(0);
      }
      const builds = fs
        .readdirSync(pins)
        .filter((name) => name !== "current" && !name.startsWith("."));
      // The oldest two are pruned; only the last build and the link remain.
      expect(builds.length).toBe(1);
      const current = fs.realpathSync(path.join(pins, "current"));
      expect(current).toBe(path.join(pins, builds[0] ?? ""));
      expect(pinRefusal(current)).toBeUndefined();
    } finally {
      repo.cleanup();
      fs.rmSync(pins, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("promote runs every declared gate", () => {
  it("keeps a format-red tree off current and records the red gate", async () => {
    const repo = fakeRepo();
    const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
    try {
      const greenRev = repo
        .git(["rev-parse", "--short=12", "HEAD"])
        .stdout.trim();
      expect(await runPromote(repo, pins)).toBe(0);
      const green = path.join(pins, greenRev);

      writeScripts(repo, { format: "false" });
      const redRev = repo.commit("format-red pin package").slice(0, 12);

      expect(await runPromote(repo, pins)).toBe(1);
      const build = path.join(pins, redRev);
      expect(gateAt(build)).toMatchObject({
        rev: redRev,
        typecheck: "pass",
        tests: "pass",
        format: "fail",
        lint: "pass",
        schemaValidation: "pass",
      });
      expect(pinRefusal(build)).toContain("gate red: format fail");
      // A red build is recorded, never linked: the launch would read this pin.
      expect(fs.realpathSync(path.join(pins, "current"))).toBe(
        fs.realpathSync(green),
      );
    } finally {
      repo.cleanup();
      fs.rmSync(pins, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps a lint-red or schema-red tree off current too", async () => {
    const reds = [
      { script: "lint", key: "lint" },
      { script: "schema-validation", key: "schemaValidation" },
    ] as const;
    for (const { script, key } of reds) {
      const repo = fakeRepo({ [script]: "false" });
      const pins = fs.mkdtempSync(path.join(os.tmpdir(), "factory-promote-"));
      try {
        const rev = repo.git(["rev-parse", "--short=12", "HEAD"]).stdout.trim();
        expect(await runPromote(repo, pins)).toBe(1);
        const build = path.join(pins, rev);
        expect(gateAt(build)[key]).toBe("fail");
        expect(pinRefusal(build)).toContain("gate red");
        expect(fs.existsSync(path.join(pins, "current"))).toBe(false);
      } finally {
        repo.cleanup();
        fs.rmSync(pins, { recursive: true, force: true });
      }
    }
  }, 60_000);
});

describe("writePinGate", () => {
  it("writes the gate and rejects a bad verdict", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-gate-"));
    const green = {
      typecheck: "pass",
      tests: "pass",
      format: "pass",
      lint: "pass",
      schemaValidation: "pass",
    } as const;
    try {
      writePinGate(dir, "0123456789ab", {
        ...green,
        tests: "fail",
        lint: "fail",
      });
      expect(gateAt(dir)).toMatchObject({
        rev: "0123456789ab",
        typecheck: "pass",
        tests: "fail",
        format: "pass",
        lint: "fail",
        schemaValidation: "pass",
      });
      expect(() =>
        writePinGate(dir, "x", { ...green, typecheck: "yes" as never }),
      ).toThrow("typecheck must be pass or fail");
      expect(() =>
        writePinGate(dir, "x", { ...green, schemaValidation: "no" as never }),
      ).toThrow("schemaValidation must be pass or fail");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
