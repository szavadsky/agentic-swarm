import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { PipelineConfig } from "./artifacts.js";
import { KNOWN_VARS } from "./prompt-vars.js";

export interface PromptLibrary {
  agentDefinition(agent: string): {
    body: string;
    tools: string[];
    description: string;
  };
  render(fragment: string, vars: Record<string, string>): string;
  placeholders(fragment: string): string[];
}

/**
 * Searches directories for a prompt fragment or agent definition file.
 */
function resolveFragmentPath(
  fragment: string,
  dirs: string[]
): string | null {
  const cleanFrag = fragment.replace(/\\/g, "/");

  const candidateSuffixes: string[] = [
    cleanFrag,
    cleanFrag.endsWith(".md") ? cleanFrag : `${cleanFrag}.md`,
  ];

  // If bare name without directory prefix, test standard subdirectories
  if (!cleanFrag.includes("/")) {
    candidateSuffixes.push(
      `steps/${cleanFrag}`,
      `steps/${cleanFrag}.md`,
      `system/${cleanFrag}`,
      `system/${cleanFrag}.md`,
      `_shared/${cleanFrag}`,
      `_shared/${cleanFrag}.md`,
      `criteria/${cleanFrag}`,
      `criteria/${cleanFrag}.md`
    );
  } else if (cleanFrag.startsWith("agents/")) {
    const stripped = cleanFrag.slice("agents/".length);
    candidateSuffixes.push(
      stripped,
      stripped.endsWith(".md") ? stripped : `${stripped}.md`
    );
  }

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    for (const suffix of candidateSuffixes) {
      const fullPath = path.resolve(dir, suffix);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Loads and resolves template content, including `{{> _shared/name}}` includes recursively.
 */
function loadAndResolveIncludes(
  fragment: string,
  dirs: string[],
  inMemoryOverrides: Record<string, unknown> | undefined,
  seen = new Set<string>()
): string {
  if (seen.has(fragment)) {
    throw new Error(`Circular include detected for "${fragment}"`);
  }
  seen.add(fragment);

  let rawContent: string | null = null;

  // 1. Check in-memory overrides
  if (inMemoryOverrides) {
    const candidates = [
      fragment,
      fragment.endsWith(".md") ? fragment : `${fragment}.md`,
      fragment.replace(/\.md$/, ""),
      fragment.startsWith("steps/") ? fragment.slice(6) : `steps/${fragment}`,
      (fragment.startsWith("steps/") ? fragment.slice(6) : `steps/${fragment}`) + ".md",
    ];
    for (const key of candidates) {
      if (key in inMemoryOverrides) {
        const val = inMemoryOverrides[key];
        if (typeof val === "string") {
          rawContent = val;
          break;
        } else if (val && typeof val === "object" && "body" in val) {
          const record = val as Record<string, unknown>;
          rawContent =
            typeof record.body === "string"
              ? record.body
              : String(record.body ?? "");
          break;
        }
      }
    }
  }

  // 2. Search directories
  if (rawContent === null) {
    const filePath = resolveFragmentPath(fragment, dirs);
    if (!filePath) {
      throw new Error(`Prompt fragment "${fragment}" not found`);
    }
    rawContent = fs.readFileSync(filePath, "utf8");
  }

  // 3. Resolve {{> path}} includes
  const includeRegex = /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g;
  const resolved = rawContent.replace(includeRegex, (_match, includeTarget) => {
    return loadAndResolveIncludes(
      includeTarget,
      dirs,
      inMemoryOverrides,
      new Set(seen)
    );
  });

  return resolved;
}

/**
 * Loads the prompt library from built-in and override directories (§10).
 *
 * Lookup order (shadowing):
 * 1. In-memory `overrides`
 * 2. `overrideDirs` in order
 * 3. `builtinDir`
 */
export function loadPromptLibrary(opts: {
  builtinDir: string;
  overrideDirs?: string[];
  overrides?: Record<string, unknown>;
}): PromptLibrary {
  const overrideDirs = opts.overrideDirs ?? [];
  const searchDirs = [...overrideDirs, opts.builtinDir];
  const inMemoryOverrides = opts.overrides;

  return {
    agentDefinition(agent: string): {
      body: string;
      tools: string[];
      description: string;
    } {
      const targetFrag = agent.endsWith(".md") ? agent : `${agent}.md`;
      const filePath = resolveFragmentPath(targetFrag, searchDirs);

      let content: string;
      if (inMemoryOverrides && (agent in inMemoryOverrides || targetFrag in inMemoryOverrides)) {
        const val = inMemoryOverrides[agent] ?? inMemoryOverrides[targetFrag];
        if (typeof val === "string") {
          content = val;
        } else if (val && typeof val === "object") {
          const record = val as Record<string, unknown>;
          const body = typeof record.body === "string" ? record.body : "";
          const tools = Array.isArray(record.tools)
            ? (record.tools as string[])
            : [];
          const description =
            typeof record.description === "string" ? record.description : "";
          const resolvedBody = body.replace(
            /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
            (_m, inc) => loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides)
          );
          return { body: resolvedBody.trim(), tools, description };
        } else {
          content = "";
        }
      } else if (filePath) {
        content = fs.readFileSync(filePath, "utf8");
      } else {
        throw new Error(`Agent definition "${agent}" not found`);
      }

      // Parse frontmatter
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (fmMatch) {
        let frontmatter: Record<string, unknown> = {};
        try {
          frontmatter = (yaml.parse(fmMatch[1] ?? "") as Record<string, unknown>) ?? {};
        } catch {
          // Fall back to empty frontmatter
        }

        const rawBody = fmMatch[2] ?? "";
        const resolvedBody = rawBody.replace(
          /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
          (_m, inc) => loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides)
        );

        const tools = Array.isArray(frontmatter.tools)
          ? (frontmatter.tools as string[])
          : [];
        const description =
          typeof frontmatter.description === "string"
            ? frontmatter.description
            : "";

        return {
          body: resolvedBody.trim(),
          tools,
          description,
        };
      }

      // Without frontmatter
      const resolvedBody = content.replace(
        /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
        (_m, inc) => loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides)
      );

      return {
        body: resolvedBody.trim(),
        tools: [],
        description: "",
      };
    },

    placeholders(fragment: string): string[] {
      const resolved = loadAndResolveIncludes(
        fragment,
        searchDirs,
        inMemoryOverrides
      );

      // Match {{var}}, excluding include markers {{> ...}}
      const varRegex = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
      const matches: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = varRegex.exec(resolved)) !== null) {
        const varName = match[1];
        if (varName && !matches.includes(varName)) {
          matches.push(varName);
        }
      }

      return matches;
    },

    render(fragment: string, vars: Record<string, string>): string {
      const resolved = loadAndResolveIncludes(
        fragment,
        searchDirs,
        inMemoryOverrides
      );

      // Check for missing variables
      const varRegex = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
      const missingVars: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = varRegex.exec(resolved)) !== null) {
        const varName = match[1];
        if (varName && vars[varName] === undefined && !missingVars.includes(varName)) {
          missingVars.push(varName);
        }
      }

      if (missingVars.length > 0) {
        throw new Error(
          `Missing required prompt variables for "${fragment}": ${missingVars.join(
            ", "
          )}`
        );
      }

      return resolved.replace(
        /\{\{([a-zA-Z0-9_.-]+)\}\}/g,
        (_m, varName) => (varName in vars ? vars[varName] ?? "" : "")
      );
    },
  };
}

/**
 * Validates prompt configuration at preflight (§10, §11).
 *
 * Checks:
 * 1. Every agent declared in `pipeline.agents` has a loadable definition
 * 2. Every step in `pipeline.flows` references an existing step fragment
 * 3. Every placeholder in referenced step fragments is known to the engine (in KNOWN_VARS)
 * 4. System fragments exist and have valid placeholders
 *
 * Returns list of validation error strings (empty if all valid).
 */
export function preflightPrompts(
  lib: PromptLibrary,
  pipeline: PipelineConfig
): string[] {
  const errors: string[] = [];

  // 1. Check all agents defined in pipeline
  if (pipeline.agents) {
    for (const agentName of Object.keys(pipeline.agents)) {
      try {
        lib.agentDefinition(agentName);
      } catch (err) {
        errors.push(`Agent definition "${agentName}" not found: ${(err as Error).message}`);
      }
    }
  }

  // Helper to validate a step fragment
  function checkStepFragment(stepId: string, fragmentName: string): void {
    try {
      const phs = lib.placeholders(fragmentName);
      const known =
        KNOWN_VARS[fragmentName] ??
        KNOWN_VARS[`steps/${fragmentName}`] ??
        KNOWN_VARS[fragmentName.replace(/^steps\//, "")];

      if (!known) {
        errors.push(
          `Step fragment "${fragmentName}" for step "${stepId}" has no KNOWN_VARS registration`
        );
        return;
      }

      for (const ph of phs) {
        if (!known.includes(ph)) {
          errors.push(
            `Unknown placeholder "${ph}" in fragment "${fragmentName}" (engine does not supply it)`
          );
        }
      }
    } catch (err) {
      errors.push(
        `Step fragment "${fragmentName}" for step "${stepId}" not found: ${(err as Error).message}`
      );
    }
  }

  // 2. Check flow steps
  if (pipeline.flows) {
    // Simple flow
    if (pipeline.flows.simple?.steps) {
      for (const step of pipeline.flows.simple.steps) {
        const frag = step.stepFragment ?? step.id;
        checkStepFragment(step.id, frag);
      }
    }

    // Story flows
    if (pipeline.flows.story) {
      for (const kindConfig of Object.values(pipeline.flows.story)) {
        if (kindConfig?.steps) {
          for (const step of kindConfig.steps) {
            const frag = step.stepFragment ?? step.id;
            checkStepFragment(step.id, frag);
          }
        }
      }
    }

    // Spike flows
    if (pipeline.flows.spike) {
      for (const kindConfig of Object.values(pipeline.flows.spike)) {
        if (kindConfig?.steps) {
          for (const step of kindConfig.steps) {
            const frag = step.stepFragment ?? step.id;
            checkStepFragment(step.id, frag);
          }
        }
      }
    }
  }

  // 3. Check system fragments
  const systemFragments = ["system/steer-classify", "system/repair"];
  for (const sysFrag of systemFragments) {
    try {
      const phs = lib.placeholders(sysFrag);
      const known = KNOWN_VARS[sysFrag] ?? [];
      for (const ph of phs) {
        if (!known.includes(ph)) {
          errors.push(
            `Unknown placeholder "${ph}" in system fragment "${sysFrag}" (engine does not supply it)`
          );
        }
      }
    } catch (err) {
      errors.push(
        `System fragment "${sysFrag}" not found: ${(err as Error).message}`
      );
    }
  }

  return errors;
}
