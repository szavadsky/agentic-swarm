import { describe, it, expect } from "bun:test";
import { validateStructural } from "../src/core/config/validate.js";
import { loadPipelineConfig } from "../src/core/config/loader.js";
import type { PipelineConfig } from "../src/core/artifacts.js";

describe("Seam & Hook validation (§5, §8.10)", () => {
  const { config: baseConfig } = loadPipelineConfig({
    skipStructuralValidation: true,
  });

  it("accepts valid seams across ingest, plan, item, wave, and iteration", () => {
    const validConfig: PipelineConfig = {
      ...baseConfig,
      hooks: {
        "before:ingest.triage": [{ check: "schema" }],
        "after:item.step.develop": [{ check: "gates" }],
        "after:wave.merge": [{ agent: "wave-close-up" }],
      },
    };

    const { errors } = validateStructural(validConfig);
    expect(errors).toEqual([]);
  });

  it("rejects unknown seam in hooks", () => {
    const invalidConfig: PipelineConfig = {
      ...baseConfig,
      hooks: {
        "after:unknown.nonexistent.seam": [{ check: "gates" }],
      },
    };

    const { errors } = validateStructural(invalidConfig);
    expect(errors.some((e) => e.includes(`Unknown seam "unknown.nonexistent.seam"`))).toBe(true);
  });

  it("rejects self-triggering synthetic hooks (§8.10)", () => {
    // Agent with output: "developer" is code-writing.
    // Hooking it at a non-item seam (e.g. wave.merge) creates a synthetic item.
    // If item seams also run code-writing hooks, that creates self-triggering synthetic hooks!
    const recursiveHookConfig: PipelineConfig = {
      ...baseConfig,
      agents: {
        ...baseConfig.agents,
        "custom-coder": {
          role: "workhorse",
          output: "developer",
        },
      },
      hooks: {
        "after:wave.merge": [{ agent: "custom-coder" }], // creates synthetic item
        "after:item.step.develop": [{ agent: "custom-coder" }], // runs on items
      },
    };

    const { errors } = validateStructural(recursiveHookConfig);
    expect(
      errors.some((e) =>
        e.includes("Self-triggering synthetic hook rejected")
      )
    ).toBe(true);
  });

  it("enforces diversity rules when configured as error", () => {
    // Configure workhorse and task-reviewer to share same primary model
    const noDiversityConfig: PipelineConfig = {
      ...baseConfig,
      diversity: "error",
      models: {
        roles: {
          ...baseConfig.models.roles,
          workhorse: { model: "same/model-v1" },
          "alt-workhorse": { model: "same/model-v1" },
          "task-reviewer": { alias: "alt-workhorse" },
        },
      },
    };

    const { errors } = validateStructural(noDiversityConfig);
    expect(errors.some((e) => e.includes("Diversity violation"))).toBe(true);
  });
});
