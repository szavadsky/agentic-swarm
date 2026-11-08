import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { PipelineConfig } from "./artifacts.js";
import { KNOWN_VARS } from "./prompt-vars.js";
import { formatOutputSchemaSection } from "./records/schema-format.js";

export interface PromptLibrary {
  agentDefinition(agent: string): {
    body: string;
    tools: string[];
    description: string;
  };
  render(fragment: string, vars: Record<string, string>): string;
  renderStepPrompt(
    fragment: string,
    vars: Record<string, string>,
    schema?: Record<string, unknown>
  ): string;
  placeholders(fragment: string): string[];
}

/**
 * Resolves the effective tool list for an agent step (§5, §10).
 *
 * `pipeline.agents.<name>.tools`, when present, OVERRIDES the agent
 * definition's frontmatter tools (arrays replace per config merge semantics).
 * An explicit empty array means yield-only: the agent gets no tools and the
 * harness still appends `yield` for structured output.
 */
export function resolveAgentTools(
  agent: string,
  frontmatterTools: string[],
  pipeline?: Pick<PipelineConfig, "agents">
): string[] {
  const override = pipeline?.agents?.[agent]?.tools;
  if (override !== undefined) return [...override];
  return [...frontmatterTools];
}

/**
 * File-reading and code-search tools. A yield-only agent (e.g. PM) MUST NOT
 * carry any of these after tool resolution; the step-runner rejects such
 * steps deterministically before launch so the PM stays non-technical by
 * construction.
 */
export const FILE_TOOL_IDS = new Set([
  "read",
  "grep",
  "glob",
  "find",
  "lsp",
  "ast_grep",
]);
export interface CriteriaBundle {
  triage?: string;
  dispositions?: string;
  storyKinds?: string;
}

/**
 * Loads criteria markdown files (§8.7) declared in `pipeline.criteria`.
 * Returns file contents keyed by criteria section; missing/empty entries are skipped.
 * The engine is expected to wire these into triage/PM/review prompts
 * (e.g. append to promptVars as `triageCriteria`, `dispositionsCriteria`, `storyKindsCriteria`).
 */
export function loadCriteriaBundle(
  criteria: Record<string, string> | undefined,
  opts?: { readFile?: (p: string) => string }
): CriteriaBundle {
  const bundle: CriteriaBundle = {};
  if (!criteria) return bundle;
  const readFile = opts?.readFile ?? ((p: string) => fs.readFileSync(p, "utf8"));
  const mapping: Array<[string, keyof CriteriaBundle]> = [
    ["triage", "triage"],
    ["dispositions", "dispositions"],
    ["story-kinds", "storyKinds"],
  ];
  for (const [key, field] of mapping) {
    const filePath = criteria[key];
    if (typeof filePath !== "string" || filePath.length === 0) continue;
    try {
      const content = readFile(filePath).trim();
      if (content.length > 0) bundle[field] = content;
    } catch {
      // Missing criteria file: skip silently; prompts still render without it.
    }
  }
  return bundle;
}

/**
 * Formats the dispositions criteria section for review prompts (§8.7).
 * Drops `human-stop` rows unless the agent's allowed dispositions include it.
 */
export function formatDispositionsSection(
  dispositionsCriteria: string | undefined,
  allowedDispositions: string[]
): string {
  const lines = [
    `Allowed dispositions for this review: ${allowedDispositions.join(", ")}.`,
    `Use ONLY these dispositions; any other disposition value fails validation.`,
  ];
  if (dispositionsCriteria && dispositionsCriteria.trim().length > 0) {
    let criteriaText = dispositionsCriteria;
    if (!allowedDispositions.includes("human-stop")) {
      criteriaText = criteriaText
        .split("\n")
        .filter((line) => !line.includes("human-stop"))
        .join("\n")
        .trim();
    }
    if (criteriaText.length > 0) lines.push(criteriaText);
  }
  return lines.join("\n");
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
        let finalBody = resolvedBody.trim();
        if (!finalBody.includes("Workspace Containment")) {
          try {
            const containment = loadAndResolveIncludes("_shared/containment", searchDirs, inMemoryOverrides);
            if (containment) {
              finalBody = `${finalBody}\n\n${containment.trim()}`;
            }
          } catch {}
        }

        const tools = Array.isArray(frontmatter.tools)
          ? (frontmatter.tools as string[])
          : [];
        const description =
          typeof frontmatter.description === "string"
            ? frontmatter.description
            : "";

        return {
          body: finalBody,
          tools,
          description,
        };
      }

      // Without frontmatter
      const resolvedBody = content.replace(
        /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
        (_m, inc) => loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides)
      );
      let finalBody = resolvedBody.trim();
      if (!finalBody.includes("Workspace Containment")) {
        try {
          const containment = loadAndResolveIncludes("_shared/containment", searchDirs, inMemoryOverrides);
          if (containment) {
            finalBody = `${finalBody}\n\n${containment.trim()}`;
          }
        } catch {}
      }

      return {
        body: finalBody,
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

    renderStepPrompt(
      fragment: string,
      vars: Record<string, string>,
      schema?: Record<string, unknown>
    ): string {
      const basePrompt = this.render(fragment, vars);
      if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) {
        return basePrompt;
      }
      const outputSection = formatOutputSchemaSection(schema);
      return `${basePrompt.trimEnd()}\n\n${outputSection}\n`;
    },
  };
}

export { formatOutputSchemaSection } from "./records/schema-format.js";

export function renderStepPrompt(opts: {
  prompts: PromptLibrary;
  fragment: string;
  vars: Record<string, string>;
  schema?: Record<string, unknown>;
}): string {
  return opts.prompts.renderStepPrompt(opts.fragment, opts.vars, opts.schema);
}

/**
 * Standard orchestration step fragments invoked directly by the engine
 * (outside flows.* step lists). Preflight checks these for existence and
 * placeholder validity exactly like flow step fragments.
 */
export const ENGINE_STEP_FRAGMENTS: string[] = [
  "steps/triage",
  "steps/infra",
  "steps/context-pack",
  "steps/integrate",
  "steps/fix-round",
  "steps/pm-edits",
  "steps/pm-amend",
  "steps/pm-single-item",
  "steps/architect-plan",
  "steps/architect-revise",
  "steps/architect-resume",
  "steps/architect-wave-report",
  "steps/architect-closeup",
  "steps/architect-consult-item",
  "steps/architect-consult-nonitem",
  "steps/plan-review",
  "steps/wave-close-up",
  "steps/plan-close-up",
];

export const SYSTEM_FRAGMENTS: string[] = ["system/steer-classify", "system/brief-select", "system/repair"];

/**
 * Validates prompt configuration at preflight (§10, §11).
 *
 * Checks:
 * 1. Every agent declared in `pipeline.agents` has a loadable definition
 * 2. Every step in `pipeline.flows` references an existing step fragment
 * 3. Every placeholder in referenced step fragments is known to the engine (in KNOWN_VARS)
 * 4. Engine-invoked orchestration fragments (ENGINE_STEP_FRAGMENTS) exist with valid placeholders
 * 5. System fragments exist and have valid placeholders
 * 6. Full render check: every checked fragment renders with dummy KNOWN_VARS values
 *
 * Returns list of validation error strings (empty if all valid).
 */
export function preflightPrompts(
  lib: PromptLibrary,
  pipeline: PipelineConfig
): string[] {
  const errors: string[] = [];
  const checkedFragments = new Set<string>();

  function knownVarsFor(fragmentName: string): string[] | undefined {
    return (
      KNOWN_VARS[fragmentName] ??
      KNOWN_VARS[`steps/${fragmentName}`] ??
      KNOWN_VARS[fragmentName.replace(/^steps\//, "")]
    );
  }

  // Helper to validate a step fragment
  function checkStepFragment(stepId: string, fragmentName: string, label = "Step"): void {
    checkedFragments.add(fragmentName);
    let phs: string[];
    try {
      phs = lib.placeholders(fragmentName);
    } catch (err) {
      errors.push(
        `${label} fragment "${fragmentName}" for step "${stepId}" not found: ${(err as Error).message}`
      );
      return;
    }
    const known = knownVarsFor(fragmentName);
    if (!known) {
      errors.push(
        `${label} fragment "${fragmentName}" for step "${stepId}" has no KNOWN_VARS registration`
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
    // Full render check with dummy values for every KNOWN_VARS entry.
    try {
      const sampleVars: Record<string, string> = {};
      for (const v of known) sampleVars[v] = `sample-${v}`;
      lib.render(fragmentName, sampleVars);
    } catch (err) {
      errors.push(
        `Render check failed for fragment "${fragmentName}": ${(err as Error).message}`
      );
    }
  }

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

  // 3. Check engine-invoked orchestration fragments
  for (const frag of ENGINE_STEP_FRAGMENTS) {
    if (checkedFragments.has(frag)) continue;
    checkStepFragment("engine", frag, "Engine");
  }

  // 4. Check system fragments
  for (const sysFrag of SYSTEM_FRAGMENTS) {
    let phs: string[];
    try {
      phs = lib.placeholders(sysFrag);
    } catch (err) {
      errors.push(
        `System fragment "${sysFrag}" not found: ${(err as Error).message}`
      );
      continue;
    }
    const known = KNOWN_VARS[sysFrag] ?? [];
    for (const ph of phs) {
      if (!known.includes(ph)) {
        errors.push(
          `Unknown placeholder "${ph}" in system fragment "${sysFrag}" (engine does not supply it)`
        );
      }
    }
    try {
      lib.render(sysFrag, {});
    } catch (err) {
      errors.push(
        `Render check failed for system fragment "${sysFrag}": ${(err as Error).message}`
      );
    }
  }

  return errors;
}
