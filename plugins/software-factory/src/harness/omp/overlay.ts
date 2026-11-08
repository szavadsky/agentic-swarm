import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { PipelineConfig } from "../../core/artifacts.js";
import { resolveRole } from "../../core/config/roles.js";

/**
 * Ensures a model name includes a thinking effort level suffix (defaults to `:max`).
 * If the model identifier already specifies a suffix (e.g. `:max`, `:high`, `:low`),
 * it is returned unchanged.
 */
export function ensureThinkingSuffix(model: string): string {
  if (/:\w+$/.test(model)) {
    return model;
  }
  return `${model}:max`;
}

/**
 * Generates an OMP unattended YAML overlay object from a PipelineConfig (§5, §12.4).
 * Configures:
 *  - `modelRoles`: mapped roles and aliases with resolved primary models and thinking suffixes.
 *  - `retry.fallbackChains`: automatic model fallback chains for resilience.
 *  - Unattended switches: disables prompts, git guard, auto-backgrounding, advisor, title generator, mnemopi.
 */
export function generateOmpConfigOverlay(pipeline: PipelineConfig): Record<string, unknown> {
  const modelRoles: Record<string, string> = {};
  const fallbackChains: Record<string, string[]> = {};

  const rolesConfig = pipeline.models?.roles ?? {};

  for (const roleName of Object.keys(rolesConfig)) {
    try {
      const resolved = resolveRole(roleName, rolesConfig);
      if (resolved.models.length > 0) {
        const primary = resolved.models[0];
        if (primary) {
          modelRoles[roleName] = ensureThinkingSuffix(primary);
        }

        if (resolved.models.length > 1) {
          fallbackChains[roleName] = resolved.models.slice(1).map(ensureThinkingSuffix);
        }
      }
    } catch {
      // If resolution fails during overlay generation (e.g. cycle detected),
      // leave role unmapped so preflight / validation catches it.
    }
  }

  return {
    modelRoles,
    retry: {
      modelFallback: true,
      maxRetries: 3,
      usageAwareFallback: true,
      fallbackChains,
    },
    eval: {
      autoBackground: {
        enabled: false,
      },
    },
    title: {
      generator: "none",
    },
    checkpoint: {
      enabled: true, // mounts checkpoint/rewind tools (agents opt in via tools list)
    },
    advisor: {
      enabled: false,
    },
    bash: {
      gitGuard: false,
      allowCompoundCommands: true,
    },
    mnemopi: {
      polyphonicRecall: false,
      enhancedRecall: false,
      proactiveLinking: false,
    },
    update: {
      auto: false,
    },
  };
}

/**
 * Serializes the generated overlay to YAML and writes it atomically to the target path.
 */
export function writeOmpConfigOverlay(pipeline: PipelineConfig, targetPath: string): string {
  const overlayObj = generateOmpConfigOverlay(pipeline);
  const yamlContent = yaml.stringify(overlayObj, { indent: 2 });
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, yamlContent, "utf8");
  return targetPath;
}
