import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readYaml } from "../../src/core/records/io.js";
import { ompOverlay, writeOmpOverlay } from "../../src/harness/omp/overlay.js";
import { OmpRuntime } from "../../src/harness/omp/runtime.js";

describe("omp overlay", () => {
  it("pins cache retention, unattended switches and pinned subagent models", () => {
    const overlay = ompOverlay({
      subagentModel: "opencode-go/longcat-2.5-free",
    });
    expect(overlay.providers).toEqual({ cacheRetention: "short" });
    expect(overlay.memory).toEqual({ backend: "off" });
    expect(overlay.autolearn).toEqual({ enabled: false });
    expect(overlay.features).toEqual({ unexpectedStopDetection: false });
    expect(overlay.retry).toEqual({ enabled: false, modelFallback: false });
    expect(overlay.modelRoles).toEqual({
      task: "opencode-go/longcat-2.5-free",
    });

    const overrides = (overlay.task as any).agentModelOverrides;
    for (const agent of [
      "task",
      "scout",
      "reviewer",
      "sonic",
      "security-reviewer",
    ]) {
      expect(overrides[agent]).toBe("opencode-go/longcat-2.5-free");
    }
  });

  it("leaves subagent routing untouched when the caller gives no cheap model", () => {
    const overlay = ompOverlay();
    expect(overlay.task).toBeUndefined();
    expect(overlay.modelRoles).toBeUndefined();
  });

  it("honours an explicit retention tier and top-level test overrides", () => {
    const overlay = ompOverlay({
      retention: "long",
      extra: { compaction: { keepRecentTokens: 1, reserveTokens: 1 } },
    });
    expect(overlay.providers).toEqual({ cacheRetention: "long" });
    expect(overlay.compaction).toEqual({
      keepRecentTokens: 1,
      reserveTokens: 1,
    });
  });

  it("writes a content-addressed overlay under the session store", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-overlay-"));
    try {
      const opts = { subagentModel: "opencode-go/longcat-2.5-free" };
      const first = await writeOmpOverlay(opts, tmp);
      const second = await writeOmpOverlay(opts, tmp);
      expect(first).toBe(second);
      expect(first.startsWith(tmp)).toBe(true);
      expect(fs.readFileSync(first, "utf8")).toContain("agentModelOverrides");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes cacheRetention short from a runtime built without a retention", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-overlay-"));
    try {
      const runtime = new OmpRuntime({ sessionDir: tmp });
      const overlayPath = await runtime.overlay();
      const written = await readYaml<{
        providers: { cacheRetention: string };
      }>(overlayPath);
      expect(written.providers).toEqual({ cacheRetention: "short" });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes cacheRetention long from a runtime built with long", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-overlay-"));
    try {
      const runtime = new OmpRuntime({ sessionDir: tmp, retention: "long" });
      const overlayPath = await runtime.overlay();
      const written = await readYaml<{
        providers: { cacheRetention: string };
      }>(overlayPath);
      expect(written.providers).toEqual({ cacheRetention: "long" });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
