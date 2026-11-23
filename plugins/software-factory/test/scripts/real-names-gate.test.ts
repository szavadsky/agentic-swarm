import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PKG = path.resolve(import.meta.dir, "../..");
const GATE = path.join(PKG, "scripts", "real-names-gate.ts");

function runGate(args: string[]): { status: number; out: string } {
  const r = spawnSync("bun", [GATE, ...args], { encoding: "utf8" });
  return { status: r.status ?? 1, out: `${r.stdout}\n${r.stderr}` };
}

/** A minimal package tree the gate can scan. */
function makeFixture(target: string, files: Record<string, string>): void {
  const root = path.join(target);
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config", "real-names.json"),
    JSON.stringify({
      harnesses: ["realharness"],
      models: ["realmodel"],
      providers: [],
      subscriptions: [],
    }),
  );
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

describe("real-names gate", () => {
  it("passes on fake names and fails on a real one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-names-gate-"));
    try {
      makeFixture(dir, {
        "src/fake.ts": 'export const F = "fake-host/fake-model";\n',
        "test/fake.test.ts": 'it("x", () => { expect(1).toBe(1); });\n',
      });
      expect(runGate([dir]).status).toBe(0);

      fs.writeFileSync(
        path.join(dir, "test", "fake.test.ts"),
        'it("x", () => { expect(1).toBe(1); }); // realmodel\n',
      );
      const red = runGate([dir]);
      expect(red.status).toBe(1);
      expect(red.out).toContain("test/fake.test.ts:1");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("excludes the omp adapter and the name list itself", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-names-gate-"));
    try {
      makeFixture(dir, {
        "src/harness/omp/turn.ts": 'export const X = "realmodel";\n',
        "src/ok.ts": 'export const X = "fake-model";\n',
      });
      expect(runGate([dir]).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("empty name list is a gate failure, never a silent pass", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-names-gate-"));
    try {
      fs.mkdirSync(path.join(dir, "config"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "config", "real-names.json"),
        JSON.stringify({
          harnesses: [],
          models: [],
          providers: [],
          subscriptions: [],
        }),
      );
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      expect(runGate([dir]).status).not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
