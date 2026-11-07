import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  generateOmpConfigOverlay,
  writeOmpConfigOverlay,
  ensureThinkingSuffix,
} from "../../src/harness/omp/overlay.js";
import { loadPipelineConfig } from "../../src/core/config/loader.js";

describe("OMP config overlay generation", () => {
  it("ensures :max thinking suffix when absent", () => {
    expect(ensureThinkingSuffix("opencode-go/deepseek-v4.1-flash")).toBe(
      "opencode-go/deepseek-v4.1-flash:max"
    );
    expect(ensureThinkingSuffix("google-antigravity/gemini-3.8-flash:high")).toBe(
      "google-antigravity/gemini-3.8-flash:high"
    );
    expect(ensureThinkingSuffix("anthropic/claude-opus-5-5:max")).toBe(
      "anthropic/claude-opus-5-5:max"
    );
  });

  it("generates correct overlay from pipeline.default.yaml", () => {
    const pluginRoot = path.resolve(import.meta.dir, "../..");
    const { config } = loadPipelineConfig({ pluginRoot });

    const overlay = generateOmpConfigOverlay(config) as any;

    // 1. Roles mapped
    expect(overlay.modelRoles).toBeDefined();
    expect(overlay.modelRoles.workhorse).toBe("opencode-go/deepseek-v4.1-flash:max");
    expect(overlay.modelRoles["alt-workhorse"]).toBe("opencode-go/muse-spark-1.3-contributor:max");
    // Alias task-reviewer should resolve to alt-workhorse primary
    expect(overlay.modelRoles["task-reviewer"]).toBe("opencode-go/muse-spark-1.3-contributor:max");

    // 2. Retry and fallback chains
    expect(overlay.retry.modelFallback).toBe(true);
    expect(overlay.retry.maxRetries).toBe(3);
    expect(overlay.retry.usageAwareFallback).toBe(true);
    expect(overlay.retry.fallbackChains).toBeDefined();
    expect(overlay.retry.fallbackChains.workhorse).toEqual([
      "opencode-go/muse-spark-1.3-contributor:max",
    ]);

    // 3. Unattended keys
    expect(overlay.eval.autoBackground.enabled).toBe(false);
    expect(overlay.title.generator).toBe("none");
    expect(overlay.checkpoint.enabled).toBe(false);
    expect(overlay.advisor.enabled).toBe(false);
    expect(overlay.bash.gitGuard).toBe(false);
    expect(overlay.bash.allowCompoundCommands).toBe(true);
    expect(overlay.mnemopi.polyphonicRecall).toBe(false);
    expect(overlay.update.auto).toBe(false);
  });

  it("writes valid YAML to disk via writeOmpConfigOverlay", () => {
    const pluginRoot = path.resolve(import.meta.dir, "../..");
    const { config } = loadPipelineConfig({ pluginRoot });

    const tmpFile = path.join(os.tmpdir(), `test-overlay-${Date.now()}.yaml`);
    try {
      writeOmpConfigOverlay(config, tmpFile);
      expect(fs.existsSync(tmpFile)).toBe(true);

      const parsed = yaml.parse(fs.readFileSync(tmpFile, "utf8"));
      expect(parsed.modelRoles.workhorse).toBe("opencode-go/deepseek-v4.1-flash:max");
      expect(parsed.eval.autoBackground.enabled).toBe(false);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
