import { describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { tmpHeadroom } from "../../src/kernel/preflight.js";
import { testPriceSource } from "../helpers/price-source.js";
import { cleanup, makeGoal } from "./e2e-helpers.js";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

function statfsOf(freeMiB: number) {
  return (_path: string) =>
    ({ bavail: BigInt(freeMiB), bsize: BigInt(MIB) }) as ReturnType<
      typeof fs.statfsSync
    >;
}

describe("tmpHeadroom", () => {
  it("refuses below the threshold, naming the directory, the free bytes and the operator action", () => {
    expect(tmpHeadroom("/scratch/tmp", statfsOf(1000), 5 * GIB)).toEqual({
      ok: false,
      cause: `temporary directory "/scratch/tmp" has insufficient headroom: ${1000 * MIB} bytes free, need ${5 * GIB} bytes. operator: purge /scratch/tmp`,
    });
  });

  it("passes at exactly the threshold and above it", () => {
    expect(tmpHeadroom("/scratch/tmp", statfsOf(2048), 2 * GIB)).toEqual({
      ok: true,
    });
    expect(tmpHeadroom("/scratch/tmp", statfsOf(6000), 5 * GIB)).toEqual({
      ok: true,
    });
  });

  it("refuses one byte short of the threshold", () => {
    const result = tmpHeadroom("/scratch/tmp", statfsOf(2048), 2 * GIB + 1);
    expect(result.ok).toBe(false);
  });

  it("refuses when the directory cannot be stat'd, rather than passing", () => {
    const result = tmpHeadroom(
      "/scratch/tmp",
      () => {
        throw new Error("ENOENT");
      },
      GIB,
    );
    expect(result).toEqual({
      ok: false,
      cause: `failed to stat "/scratch/tmp": ENOENT`,
    });
  });
});

describe("run with a nearly full temp filesystem", () => {
  async function run(freeMiB: number) {
    const goal = makeGoal();
    const statfs = spyOn(fs, "statfsSync").mockImplementation(
      statfsOf(freeMiB) as unknown as typeof fs.statfsSync,
    );
    const errors: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      const code = await dispatch(
        ["run", "--repo", goal.repo.dir, "--goal", "demo", "--iterations", "1"],
        {
          harnesses: { fake: new FakeHarness({ id: "fake" }) },
          priceSource: testPriceSource(goal.repo.dir),
        },
      );
      return { goal, code, errors };
    } finally {
      console.error = realError;
      statfs.mockRestore();
    }
  }

  it("exits 1 before any session, lock or record exists", async () => {
    const { goal, code, errors } = await run(100);
    try {
      expect(code).toBe(1);
      expect(errors).toEqual([
        `Error: temporary directory "${os.tmpdir()}" has insufficient headroom: ${100 * MIB} bytes free, need ${2 * GIB} bytes. operator: purge ${os.tmpdir()}`,
      ]);
      expect(fs.readdirSync(goal.goalDir).sort()).toEqual([
        "class.yaml",
        "intent.md",
      ]);
    } finally {
      cleanup(goal);
    }
  });
});
