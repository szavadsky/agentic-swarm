import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GATES = path.join(import.meta.dir, "..", "..", "scripts", "gates.sh");
const HOUR_MS = 60 * 60 * 1000;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gates-evict-test-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Plants a directory with an explicit mtime `ageHours` in the past. */
function plant(name: string, ageHours: number): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(dir, "nested", "file"), "x");
  const stamp = new Date(Date.now() - ageHours * HOUR_MS).toISOString();
  const touched = spawnSync("touch", ["-d", stamp, dir]);
  expect(touched.status).toBe(0);
  return dir;
}

/** Sources gates.sh and calls evict_stale_tmp against the test-owned root. */
function evict(minutes: number, keep?: string) {
  return spawnSync(
    "bash",
    [
      "-c",
      'source "$1" && evict_stale_tmp "$2" "$3" ${4:+"$4"}',
      "evict",
      GATES,
      root,
      String(minutes),
      keep ?? "",
    ],
    { encoding: "utf8" },
  );
}

describe("gates.sh evict_stale_tmp", () => {
  it("removes factory-* and acpx-stub-* dirs older than the age, keeps younger ones", () => {
    const staleGates = plant("factory-gates.stale", 7);
    const staleRepo = plant("factory-test-repo-stale", 7);
    const staleStub = plant("acpx-stub-stale", 7);
    const freshGates = plant("factory-gates.fresh", 1);
    const freshStub = plant("acpx-stub-fresh", 1);

    const result = evict(360);

    expect(result.status).toBe(0);
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
    spawnSync("touch", ["-d", "2000-01-01", foreignFile]);

    const result = evict(360);

    expect(result.status).toBe(0);
    expect(fs.existsSync(foreignDir)).toBe(true);
    expect(fs.existsSync(foreignFile)).toBe(true);
  });

  it("spares the named current run dir even when its mtime is old", () => {
    const current = plant("factory-gates.current", 48);
    const other = plant("factory-gates.other", 48);

    const result = evict(360, "factory-gates.current");

    expect(result.status).toBe(0);
    expect(fs.existsSync(current)).toBe(true);
    expect(fs.existsSync(other)).toBe(false);
  });

  it("honors the age parameter", () => {
    const threeHours = plant("factory-gates.three", 3);

    expect(evict(360).status).toBe(0);
    expect(fs.existsSync(threeHours)).toBe(true);

    expect(evict(120).status).toBe(0);
    expect(fs.existsSync(threeHours)).toBe(false);
  });

  it("is a no-op that succeeds when nothing is stale", () => {
    expect(evict(360).status).toBe(0);
  });
});
