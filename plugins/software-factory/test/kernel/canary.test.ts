import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canaryKey,
  loadCanaryProven,
  markCombinationProven,
  runCanary,
} from "../../src/kernel/canary.js";
import { filterUnprovenRotation } from "../../src/kernel/preflight/run.js";

describe("canary registry", () => {
  registerCanaryRegistry();
  registerCanaryRun();
  registerCanaryPreflight();
});

function registerCanaryRegistry(): void {
  it("records a passing canary where rotation reads it and round-trips", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-registry-"));
    try {
      expect((await loadCanaryProven({ sessionsDir: dir })).size).toBe(0);
      await markCombinationProven({
        paths: { sessionsDir: dir },
        proven: await loadCanaryProven({ sessionsDir: dir }),
        key: canaryKey("fake", "fake-impl"),
      });
      const text = fs.readFileSync(
        path.join(dir, "canary-proven.yaml"),
        "utf8",
      );
      expect(text).toContain("fake+fake-impl");
      const read = await loadCanaryProven({ sessionsDir: dir });
      expect(read.has("fake+fake-impl")).toBe(true);
      expect(read.has("fake+fake-architect")).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects an invalid proven file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-invalid-"));
    try {
      fs.writeFileSync(
        path.join(dir, "canary-proven.yaml"),
        "proven: [1, 2]\n",
        "utf8",
      );
      await expect(loadCanaryProven({ sessionsDir: dir })).rejects.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
}

function registerCanaryRun(): void {
  it("a failed canary leaves the combination unproven; a passing one proves it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-run-"));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canary-cwd-"));
    try {
      const proven = await loadCanaryProven({ sessionsDir: dir });
      const failing = async () => ({
        pass: false as const,
        reason: "quota stop",
      });
      const verdict = await runCanary(
        { harnessId: "fake", modelId: "fake-impl", cwd },
        failing,
        proven,
        { sessionsDir: dir },
      );
      expect(verdict.pass).toBe(false);
      expect(proven.has("fake+fake-impl")).toBe(false);
      const passing = async () => ({ pass: true as const });
      const ok = await runCanary(
        { harnessId: "fake", modelId: "fake-impl", cwd },
        passing,
        proven,
        { sessionsDir: dir },
      );
      expect(ok.pass).toBe(true);
      expect(
        (await loadCanaryProven({ sessionsDir: dir })).has("fake+fake-impl"),
      ).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  it("an architect leg runs the bigger goal as well", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-bigger-"));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canary-cwd-"));
    const kinds: string[] = [];
    try {
      const proven = await loadCanaryProven({ sessionsDir: dir });
      const runner = async (opts: {
        kind: "trivial" | "task" | "bigger";
      }): Promise<{ pass: boolean }> => {
        kinds.push(opts.kind);
        return { pass: true };
      };
      const verdict = await runCanary(
        { harnessId: "fake", modelId: "fake-architect", bigger: true, cwd },
        runner as never,
        proven,
        { sessionsDir: dir },
      );
      expect(verdict.pass).toBe(true);
      expect(kinds).toEqual(["trivial", "task", "bigger"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);
}

function registerCanaryPreflight(): void {
  it("narrows rotation to proven combinations and keeps the primary otherwise", () => {
    const aliases: Record<
      string,
      {
        harness: string;
        model: string;
        rotate?: { harness: string; model: string }[];
      }
    > = {
      implementer: {
        harness: "a",
        model: "ma-base",
        rotate: [
          { harness: "a", model: "ma-zero" },
          { harness: "b", model: "mb-one" },
        ],
      },
    };
    filterUnprovenRotation(aliases, new Set(["b+mb-one"]));
    expect(aliases.implementer!.rotate).toEqual([
      { harness: "b", model: "mb-one" },
    ]);

    filterUnprovenRotation(aliases, new Set(["a+ma-base"]));
    expect(aliases.implementer!.rotate).toBeUndefined();
  });
}
