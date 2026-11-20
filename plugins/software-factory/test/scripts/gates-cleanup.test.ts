import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evictStaleTmp } from "../../scripts/gates.js";

const HOUR_MS = 60 * 60 * 1000;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gates-evict-test-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Plants a directory with an explicit mtime `ageMs` in the past. */
function plantAged(name: string, ageMs: number): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(dir, "nested", "file"), "x");
  const stamp = new Date(Date.now() - ageMs);
  fs.utimesSync(dir, stamp, stamp);
  return dir;
}

function plant(name: string, ageHours: number): string {
  return plantAged(name, ageHours * HOUR_MS);
}

describe("gates evictStaleTmp", () => {
  it("removes factory-* and acpx-stub-* dirs older than the age, keeps younger ones", () => {
    const staleGates = plant("factory-gates.stale", 7);
    const staleRepo = plant("factory-test-repo-stale", 7);
    const staleStub = plant("acpx-stub-stale", 7);
    const freshGates = plant("factory-gates.fresh", 1);
    const freshStub = plant("acpx-stub-fresh", 1);

    evictStaleTmp(root, 360);

    expect(fs.existsSync(staleGates)).toBe(false);
    expect(fs.existsSync(staleRepo)).toBe(false);
    expect(fs.existsSync(staleStub)).toBe(false);
    expect(fs.existsSync(freshGates)).toBe(true);
    expect(fs.existsSync(freshStub)).toBe(true);
  });

  it("leaves old dirs and files that do not match the factory patterns", () => {
    const foreignDir = plant("someone-else", 48);
    const foreignFile = path.join(root, "factory-file");
    fs.writeFileSync(foreignFile, "x");
    const stamp = new Date(Date.now() - 48 * HOUR_MS);
    fs.utimesSync(foreignFile, stamp, stamp);

    evictStaleTmp(root, 360);

    expect(fs.existsSync(foreignDir)).toBe(true);
    expect(fs.existsSync(foreignFile)).toBe(true);
  });

  it("spares the named current run dir even when its mtime is old", () => {
    const current = plant("factory-gates.current", 48);
    const other = plant("factory-gates.other", 48);

    evictStaleTmp(root, 360, "factory-gates.current");

    expect(fs.existsSync(current)).toBe(true);
    expect(fs.existsSync(other)).toBe(false);
  });

  it("honors the age parameter", () => {
    const threeHours = plant("factory-gates.three", 3);

    evictStaleTmp(root, 360);
    expect(fs.existsSync(threeHours)).toBe(true);

    evictStaleTmp(root, 120);
    expect(fs.existsSync(threeHours)).toBe(false);
  });
});

describe("gates evictStaleTmp thresholds", () => {
  it("removes a dir one second past the age and keeps one a second short", () => {
    const threshold = 360 * 60 * 1000;
    const justOver = plantAged("factory-gates.over", threshold + 1000);
    const justUnder = plantAged("factory-gates.under", threshold - 1000);

    evictStaleTmp(root, 360);

    expect(fs.existsSync(justOver)).toBe(false);
    expect(fs.existsSync(justUnder)).toBe(true);
  });

  it("keeps a fresh run dir intact while removing a stale one", () => {
    const fresh = plant("factory-gates.fresh", 1);
    const stale = plant("factory-gates.stale", 7);

    evictStaleTmp(root, 360);

    expect(fs.existsSync(path.join(fresh, "nested", "file"))).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
  });
});
