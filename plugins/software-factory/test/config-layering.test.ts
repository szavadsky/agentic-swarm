import { describe, it, expect } from "bun:test";
import { mergeLayers } from "../src/core/config/merge.js";
 import { loadPipelineConfig } from "../src/core/config/loader.js";
import { resolveRole } from "../src/core/config/roles.js";
describe("Config layering semantics (§5)", () => {
  it("merges maps deeply, replaces arrays, and deletes keys on explicit null", () => {
    const defaults = {
      limits: {
        maxParallel: 4,
        maxIterations: 6,
        obsoleteLimit: 10,
      },
      tags: ["alpha", "beta"],
      nested: {
        keep: "yes",
        dropMe: "yes",
      },
    };

    const projectLayer = {
      limits: {
        maxParallel: 8,
        obsoleteLimit: null, // null deletes key
      },
      tags: ["gamma"], // array replaces
    };

    const taskLayer = {
      nested: {
        dropMe: null, // null deletes nested key
        added: "new",
      },
    };

    const merged = mergeLayers<typeof defaults>(defaults, projectLayer, taskLayer);

    expect(merged.limits.maxParallel).toBe(8);
    expect(merged.limits.maxIterations).toBe(6);
    expect("obsoleteLimit" in merged.limits).toBe(false);

    // Arrays replace, not concat
    expect(merged.tags).toEqual(["gamma"]);

    // Nested object merge and null delete
    expect(merged.nested.keep).toBe("yes");
    expect("dropMe" in merged.nested).toBe(false);
    expect((merged.nested as any).added).toBe("new");
  });

  it("loads pipeline config with layer overrides and null deletion", () => {
    const { config } = loadPipelineConfig({
      skipStructuralValidation: true,
      overrides: {
        limits: {
          maxParallel: 12,
          hydrationBytes: null,
        },
      },
    });

    expect(config.limits.maxParallel).toBe(12);
    expect(config.limits.maxParallelItems).toBe(4);
    expect(config.limits.maxParallelTurns).toBe(6);
    expect(config.limits.stubMaxProdLines).toBe(40);
    expect("hydrationBytes" in config.limits).toBe(false);
    expect(config.models.roles.workhorse).toBeDefined();
   });

  it("task layer aliasing a role over a default model role resolves to the alias target", () => {
    const { config } = loadPipelineConfig({
      overrides: {
        models: {
          roles: {
            architect: { alias: "alt-architect" },
            "alt-architect": { model: "claude-haiku" },
          },
        },
      },
    });

    // Atomically replaced by alias-only object
    expect(config.models.roles.architect).toEqual({ alias: "alt-architect" });
    expect("model" in (config.models.roles.architect as any)).toBe(false);
    expect("fallbacks" in (config.models.roles.architect as any)).toBe(false);

    // Resolves role to alias target
    const resolved = resolveRole("architect", config.models.roles);
    expect(resolved.role).toBe("alt-architect");
    expect(resolved.models).toEqual(["claude-haiku"]);
  });
 });
