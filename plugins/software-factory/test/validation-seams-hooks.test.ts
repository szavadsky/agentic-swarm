import { describe, it, expect } from "bun:test";
import {
  validateStructural,
  ATTACHABLE_BUILTIN_CHECK_IDS,
  ENGINE_INTERNAL_CHECK_IDS,
  BUILTIN_CHECK_IDS,
} from "../src/core/config/validate.js";
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
        "before:ingest.triage": [{ check: "gates" }],
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

  it("rejects unknown role references in agents and steps (e.g. alt-workhose)", () => {
    const typoConfig: PipelineConfig = {
      ...baseConfig,
      agents: {
        ...baseConfig.agents,
        reviewer: { role: "alt-workhose" },
      },
      flows: {
        ...baseConfig.flows,
        story: {
          ...baseConfig.flows.story,
          dev: {
            ...baseConfig.flows.story.dev,
            steps: [
              ...(baseConfig.flows.story.dev?.steps ?? []).map((s) =>
                s.id === "develop" ? { ...s, retryRole: "alt-workhose" } : s
              ),
            ],
          },
        },
      },
    };

    const { errors } = validateStructural(typoConfig);
    expect(
      errors.some((e) =>
        e.includes('Agent "reviewer" references unknown role "alt-workhose"')
      )
    ).toBe(true);
    expect(
      errors.some((e) =>
        e.includes('step "develop"') &&
        e.includes('unknown retryRole "alt-workhose"')
      )
    ).toBe(true);
  });

  it("rejects unknown step.role overrides", () => {
    const badRoleConfig: PipelineConfig = {
      ...baseConfig,
      flows: {
        ...baseConfig.flows,
        simple: {
          steps: [
            { id: "develop", agent: "developer", role: "no-such-role" },
          ],
        },
      },
    };

    const { errors } = validateStructural(badRoleConfig);
    expect(
      errors.some((e) =>
        e.includes('Flow "flows.simple" step "develop"') &&
        e.includes('unknown role "no-such-role"')
      )
    ).toBe(true);
  });

  it("rejects fixLoopTo that names no step of the same kind", () => {
    const badLoopConfig: PipelineConfig = {
      ...baseConfig,
      flows: {
        ...baseConfig.flows,
        story: {
          ...baseConfig.flows.story,
          dev: {
            ...baseConfig.flows.story.dev,
            steps: baseConfig.flows.story.dev?.steps ?? [],
            fixLoopTo: "qa",
          },
          "test-only": {
            ...baseConfig.flows.story["test-only"],
            steps: baseConfig.flows.story["test-only"]?.steps ?? [],
            fixLoopTo: "research",
          },
        },
      },
    };

    const { errors } = validateStructural(badLoopConfig);
    // dev has no "qa" step is false here (dev HAS qa) — assert only the real failure:
    expect(
      errors.some((e) =>
        e.includes('Flow "flows.story.test-only"') &&
        e.includes('fixLoopTo "research" does not match any step id')
      )
    ).toBe(true);
    expect(
      errors.some((e) => e.includes('Flow "flows.story.dev" fixLoopTo'))
    ).toBe(false);
  });

  it("rejects engine-internal checks attached to steps and hooks", () => {
    const internalConfig: PipelineConfig = {
      ...baseConfig,
      flows: {
        ...baseConfig.flows,
        simple: {
          steps: [
            { id: "develop", agent: "developer", checks: ["schema", "gates"] },
          ],
        },
      },
      hooks: {
        "after:item.merge": [{ check: "citations" }],
      },
    };

    const { errors } = validateStructural(internalConfig);
    expect(
      errors.some((e) =>
        e.includes('step "develop"') &&
        e.includes('engine-internal check "schema"')
      )
    ).toBe(true);
    expect(
      errors.some((e) =>
        e.includes('Hook "after:item.merge"') &&
        e.includes('engine-internal check "citations"')
      )
    ).toBe(true);
    // Attachable builtins still accepted
    expect(errors.some((e) => e.includes('"gates"'))).toBe(false);
  });

  it("still rejects unknown checks on steps and hooks", () => {
    const unknownConfig: PipelineConfig = {
      ...baseConfig,
      flows: {
        ...baseConfig.flows,
        simple: {
          steps: [
            { id: "develop", agent: "developer", checks: ["no-such-check"] },
          ],
        },
      },
      hooks: {
        "after:wave.merge": [{ check: "no-such-check" }],
      },
    };

    const { errors } = validateStructural(unknownConfig);
    expect(
      errors.filter((e) => e.includes('unknown check "no-such-check"')).length
    ).toBe(2);
  });

  it("splits builtin check ids into attachable vs engine-internal", () => {
    expect([...ENGINE_INTERNAL_CHECK_IDS].sort()).toEqual([
      "citations",
      "plan-limits",
      "schema",
    ]);
    expect(ATTACHABLE_BUILTIN_CHECK_IDS.has("gates")).toBe(true);
    expect(ATTACHABLE_BUILTIN_CHECK_IDS.has("test-first-scope")).toBe(true);
    expect(ATTACHABLE_BUILTIN_CHECK_IDS.has("schema")).toBe(false);
    for (const id of ATTACHABLE_BUILTIN_CHECK_IDS) {
      expect(ENGINE_INTERNAL_CHECK_IDS.has(id)).toBe(false);
    }
    expect(BUILTIN_CHECK_IDS).toEqual(
      new Set([...ENGINE_INTERNAL_CHECK_IDS, ...ATTACHABLE_BUILTIN_CHECK_IDS])
    );
  });
});
