import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  PIN_GATE_FILE,
  pinGateSchema,
  pinRefusal,
} from "../../src/kernel/preflight/pin.js";
import { writePinGate } from "../../src/cli/commands/promote.js";
import { promotePin } from "../../src/cli/commands/promote.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const OK_TEST =
  'import { expect, it } from "bun:test";\nit("ok", () => { expect(1).toBe(1); });\n';

/** A repo whose plugin gates pass with only bun builtins. */
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
  repo.writeFile("plugins/software-factory/test/ok.test.ts", OK_TEST);
  repo.writeFile("bootstrap/run/tree.yaml", "aliases: {}\n");
  repo.writeFile("bootstrap/promote.sh", 'exec true "$@"\n');
  repo.commit("fake pin package");
  return repo;
}

function gateAt(build: string): unknown {
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

describe("writePinGate", () => {
  it("writes the gate and rejects a bad verdict", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-gate-"));
    try {
      writePinGate(dir, "0123456789ab", "pass", "fail");
      expect(gateAt(dir)).toMatchObject({
        rev: "0123456789ab",
        typecheck: "pass",
        tests: "fail",
      });
      expect(() => writePinGate(dir, "x", "yes" as never, "pass")).toThrow(
        "--typecheck must be pass or fail",
      );
      expect(() => writePinGate(dir, "x", "pass", "no" as never)).toThrow(
        "--tests must be pass or fail",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
