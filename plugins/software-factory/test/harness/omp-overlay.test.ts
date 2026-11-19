import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readYaml } from "../../src/core/records/io.js";
import { ompOverlay, writeOmpOverlay } from "../../src/harness/omp/overlay.js";
import { OmpRuntime } from "../../src/harness/omp/runtime.js";

const POLICY = {
  defaultThinkingLevel: "low",
  providers: { cacheRetention: "long" },
  memory: { backend: "off" },
  autolearn: { enabled: false },
  skills: { enabled: false },
  features: { unexpectedStopDetection: false },
  tools: { approvalMode: "yolo", xdev: false },
  compaction: { experimentalContextManagement: false },
  disabledProviders: ["native", "claude"],
  retry: { enabled: false, modelFallback: false },
} as const;

describe("omp overlay", () => {
  it("passes the harness entry's options through untouched", () => {
    const overlay = ompOverlay({ options: { ...POLICY } });
    for (const [key, value] of Object.entries(POLICY)) {
      expect(overlay[key]).toEqual(value);
    }
  });

  it("adds no harness policy when the entry has no options", () => {
    const overlay = ompOverlay();
    for (const key of Object.keys(POLICY)) {
      expect(overlay[key]).toBeUndefined();
    }
  });

  it("pins retention and subagent models over configured options", () => {
    const overlay = ompOverlay({
      subagentModel: "opencode-go/longcat-2.5-free",
      retention: "long",
      options: {
        providers: { cacheRetention: "short" },
        task: { keep: true },
        modelRoles: { keep: true },
      },
    });
    // sessions.retention owns the cache window; the entry's block cannot pin it stale.
    expect(overlay.providers).toEqual({ cacheRetention: "long" });
    expect(overlay.modelRoles).toEqual({
      keep: true,
      task: "opencode-go/longcat-2.5-free",
    });

    const task = overlay.task as Record<string, unknown>;
    expect(task.keep).toBe(true);
    const overrides = task.agentModelOverrides as Record<string, string>;
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

  it("leaves the caller's options unchanged when retention overrides the provider block", () => {
    const options = { providers: { cacheRetention: "long" } };
    const overlay = ompOverlay({ options, retention: "short" });
    expect(overlay.providers).toEqual({ cacheRetention: "short" });
    expect(overlay.providers).not.toBe(options.providers);
    expect(options.providers.cacheRetention).toBe("long");
  });

  it("leaves subagent routing untouched when the caller gives no cheap model", () => {
    const overlay = ompOverlay();
    expect(overlay.task).toBeUndefined();
    expect(overlay.modelRoles).toBeUndefined();
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

  it("writes the runtime's harness options", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-overlay-"));
    try {
      const runtime = new OmpRuntime({
        sessionDir: tmp,
        options: { memory: { backend: "off" }, defaultThinkingLevel: "low" },
      });
      const written = await readYaml<{
        memory: { backend: string };
        defaultThinkingLevel: string;
      }>(await runtime.overlay());
      expect(written.memory).toEqual({ backend: "off" });
      expect(written.defaultThinkingLevel).toBe("low");
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

  it("throws on malformed providers option", () => {
    expect(() =>
      ompOverlay({ options: { providers: "invalid" as any } }),
    ).toThrow(/Invalid "providers" option: expected object, got string/);
  });
});
