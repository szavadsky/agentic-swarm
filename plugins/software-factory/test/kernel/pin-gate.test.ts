import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { parseCliArgs } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import {
  PIN_GATE_FILE,
  pinBuildOf,
  pinGateSchema,
  pinRefusal,
  type PinGate,
} from "../../src/kernel/preflight/pin.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  cleanup,
  DEFAULT_RUN_YAML,
  makeGoal,
  outcome,
  type E2EGoal,
} from "./e2e-helpers.js";
import { scriptKernelRoleFallbacks } from "./fake-defaults.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");
const WRITER = path.join(PACKAGE_ROOT, "scripts/pin-gate.ts");
const GREEN_AT = "2026-11-23T00:00:00.000Z";
const REV = "0123456789ab";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeGate(build: string, gate: Partial<PinGate>): void {
  const record: PinGate = {
    rev: path.basename(build),
    typecheck: "pass",
    tests: "pass",
    at: GREEN_AT,
    ...gate,
  };
  fs.writeFileSync(path.join(build, PIN_GATE_FILE), JSON.stringify(record));
}

/** A pin build dir named by its rev, with the given gate record. */
function pinDir(
  root: string,
  rev = REV,
  gate: Partial<PinGate> | null = {},
): string {
  const build = path.join(root, "pins", rev);
  fs.mkdirSync(build, { recursive: true });
  if (gate !== null) writeGate(build, gate);
  return build;
}

function withoutArchitectAlias(): string {
  return DEFAULT_RUN_YAML.replace(
    "  architect: { harness: fake, model: fake-architect }\n",
    "",
  );
}

function recordsIn(goalDir: string): Promise<StepRecord[]> {
  return createFolderStore(goalDir, undefined, {}).listRecords();
}

function doneHarness(): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  scriptKernelRoleFallbacks(harness);
  return harness;
}

/** A real pin copy: the spawned CLI resolves its package root inside it. */
function fakePin(pins: string, rev: string): string {
  const pin = path.join(pins, rev);
  fs.mkdirSync(pin, { recursive: true });
  for (const entry of ["bin", "src", "config", "prompts", "package.json"]) {
    fs.cpSync(path.join(PACKAGE_ROOT, entry), path.join(pin, entry), {
      recursive: true,
    });
  }
  fs.symlinkSync(
    path.join(PACKAGE_ROOT, "node_modules"),
    path.join(pin, "node_modules"),
    "dir",
  );
  return pin;
}

function writePin(
  build: string,
  typecheck: string,
  tests: string,
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [
    WRITER,
    "write",
    "--dir",
    build,
    "--rev",
    REV,
    "--typecheck",
    typecheck,
    "--tests",
    tests,
  ]);
}

function runPin(
  pin: string,
  goal: E2EGoal,
  args: string[] = [],
): { code: number | null; err: string } {
  const result = spawnSync(
    process.execPath,
    [
      path.join(pin, "bin/factory.ts"),
      "run",
      "--repo",
      goal.repo.dir,
      "--goal",
      "demo",
      "--iterations",
      "1",
      ...args,
    ],
    {
      env: { ...process.env, FACTORY_PIN_ROOT: path.dirname(pin) },
      encoding: "utf8",
    },
  );
  return { code: result.status, err: result.stderr };
}

function overrideRecord(
  goalDir: string,
): { cause?: { detail?: string } } | undefined {
  return fs
    .readdirSync(path.join(goalDir, "records"))
    .filter((name) => name.endsWith("-pin-gate-override-r1"))
    .map(
      (name) =>
        yaml.parse(
          fs.readFileSync(
            path.join(goalDir, "records", name, "end.yaml"),
            "utf8",
          ),
        ) as { cause?: { detail?: string } },
    )[0];
}

describe("pin gate record", () => {
  it("passes an all-pass pin and names the red gates", () => {
    const root = tmpDir("factory-pin-read-");
    try {
      const build = pinDir(root);
      expect(pinRefusal(build)).toBeUndefined();

      writeGate(build, { typecheck: "fail" });
      const typecheckRed = pinRefusal(build)!;
      expect(typecheckRed).toContain(`pin ${build} cannot launch`);
      expect(typecheckRed).toContain("gate red: typecheck fail");
      expect(typecheckRed).not.toContain("tests fail");
      expect(typecheckRed).toContain("--pin-gate-override");

      writeGate(build, { typecheck: "fail", tests: "fail" });
      expect(pinRefusal(build)).toContain("typecheck fail, tests fail");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a missing record, including a pin built before it existed", () => {
    const root = tmpDir("factory-pin-missing-");
    try {
      const build = pinDir(root, REV, null);
      const refusal = pinRefusal(build)!;
      expect(refusal).toContain(
        `pin ${build} cannot launch: gate.yaml is missing`,
      );
      expect(refusal).toContain("built before the gate record");
      expect(refusal).toContain("--pin-gate-override");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pin gate record validation", () => {
  it("refuses an unreadable, malformed or copied record instead of trusting it", () => {
    const root = tmpDir("factory-pin-bad-");
    try {
      const build = pinDir(root);
      fs.writeFileSync(path.join(build, PIN_GATE_FILE), "{not: yaml", "utf8");
      expect(pinRefusal(build)).toContain("gate.yaml is invalid");

      writeGate(build, { typecheck: "maybe" as PinGate["typecheck"] });
      expect(pinRefusal(build)).toContain("gate.yaml is invalid");

      writeGate(build, { rev: "deadbeefcafe" });
      expect(pinRefusal(build)).toContain(
        `records rev deadbeefcafe, not this build ${REV}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes the shape promote records and rejects a bad verdict", () => {
    const root = tmpDir("factory-pin-write-");
    const build = path.join(root, REV);
    try {
      fs.mkdirSync(build, { recursive: true });
      expect(writePin(build, "pass", "fail").status).toBe(0);
      const gate = pinGateSchema.parse(
        yaml.parse(fs.readFileSync(path.join(build, PIN_GATE_FILE), "utf8")),
      );
      expect(gate).toMatchObject({
        rev: REV,
        typecheck: "pass",
        tests: "fail",
      });
      expect(Date.parse(gate.at)).toBeGreaterThan(Date.now() - 60_000);
      expect(pinRefusal(build)).toContain("gate red: tests fail");

      const rejected = writePin(build, "maybe", "pass");
      expect(rejected.status).toBe(2);
      expect(rejected.stderr.toString()).toContain(
        "--typecheck must be pass or fail",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pin gate override flag", () => {
  it("requires a reason and trims it", () => {
    expect(
      parseCliArgs(["run", "--pin-gate-override", " owner ruling "])
        .pinGateOverride,
    ).toBe("owner ruling");
    expect(() => parseCliArgs(["run", "--pin-gate-override"])).toThrow(
      "--pin-gate-override requires a reason",
    );
  });
});

describe("pin build detection", () => {
  it("recognises a build only in the pins root or beside current", () => {
    const root = tmpDir("factory-pin-detect-");
    try {
      const build = pinDir(root);
      const pins = path.join(root, "pins");
      expect(pinBuildOf(build, pins)).toBe(build);
      expect(
        pinBuildOf(
          path.join(root, "checkout", "plugins/software-factory"),
          pins,
        ),
      ).toBeUndefined();

      const relocated = path.join(root, "relocated");
      const moved = path.join(relocated, REV);
      fs.mkdirSync(moved, { recursive: true });
      fs.symlinkSync(moved, path.join(relocated, "current"), "dir");
      expect(pinBuildOf(moved, path.join(root, "other-pins"))).toBe(moved);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("factory run under a pin gate", () => {
  it("runs a green pin", async () => {
    const root = tmpDir("factory-pin-run-");
    const goal = makeGoal();
    try {
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        pinBuild: pinDir(root),
        harnesses: { fake: doneHarness() },
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("done");
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("refuses a red pin before it writes any goal artifact", async () => {
    const root = tmpDir("factory-pin-refuse-");
    const goal = makeGoal();
    try {
      const build = pinDir(root, REV, { tests: "fail" });
      await expect(
        runGoal({
          repo: goal.repo.dir,
          goal: "demo",
          iterations: 1,
          pinBuild: build,
          harnesses: { fake: doneHarness() },
          priceSource: testPriceSource(goal.repo.dir),
        }),
      ).rejects.toThrow(/gate red: tests fail/);
      expect(fs.existsSync(path.join(goal.goalDir, "records"))).toBe(false);
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("pin gate override record", () => {
  it("records the reason in the run's records and continues", async () => {
    const root = tmpDir("factory-pin-override-");
    const goal = makeGoal({ runYaml: withoutArchitectAlias() });
    try {
      await expect(
        runGoal({
          repo: goal.repo.dir,
          goal: "demo",
          iterations: 1,
          pinBuild: pinDir(root, REV, { typecheck: "fail" }),
          pinGateOverride: "known red snapshot test, owner promotion ruling",
          harnesses: { fake: doneHarness() },
          priceSource: testPriceSource(goal.repo.dir),
        }),
      ).rejects.toThrow(/aliases\.architect/);

      const override = (await recordsIn(goal.goalDir)).find(
        (record) => record.step === "pin-gate-override",
      );
      expect(override?.iteration).toBe(0);
      expect(override?.endedAt).toBeDefined();
      expect(override?.cause?.detail).toContain(
        "known red snapshot test, owner promotion ruling",
      );
      expect(override?.cause?.detail).toContain("gate red: typecheck fail");
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("factory run, the binary", () => {
  it("exits non-zero before any goal write when its pin has no gate", () => {
    const root = tmpDir("factory-pin-cli-");
    const goal = makeGoal();
    try {
      const pin = fakePin(path.join(root, "pins"), REV);
      const { code, err } = runPin(pin, goal);
      expect(code).toBe(1);
      expect(err).toContain(`pin ${pin} cannot launch: gate.yaml is missing`);
      expect(err).toContain("--pin-gate-override");
      expect(fs.existsSync(path.join(goal.goalDir, "records"))).toBe(false);
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("exits non-zero with the red gates when its pin is recorded red", () => {
    const root = tmpDir("factory-pin-cli-red-");
    const goal = makeGoal();
    try {
      const pin = fakePin(path.join(root, "pins"), REV);
      writeGate(pin, { typecheck: "pass", tests: "fail" });
      const { code, err } = runPin(pin, goal);
      expect(code).toBe(1);
      expect(err).toContain("gate red: tests fail");
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("pin gate override, the binary", () => {
  it("continues past the refusal and records the reason", () => {
    const root = tmpDir("factory-pin-cli-override-");
    const goal = makeGoal();
    try {
      const pin = fakePin(path.join(root, "pins"), REV);
      writeGate(pin, { typecheck: "fail" });
      const { code, err } = runPin(pin, goal, [
        "--pin-gate-override",
        "known red snapshot test, owner promotion ruling",
      ]);
      // The fake harness is not registered in a real launch: pre-flight stops
      // after the override record proves the pin check was passed.
      expect(code).toBe(1);
      expect(err).toContain("pre-flight refused");
      expect(overrideRecord(goal.goalDir)?.cause?.detail).toContain(
        "known red snapshot test, owner promotion ruling",
      );
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
