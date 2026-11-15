import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { formatOutputSchemaSection } from "./records/schema-format.js";

export interface PromptLibrary {
  agentDefinition(agent: string): {
    body: string;
    // undefined when the definition carries no tools list (frontmatter.tools
    // absent); [] only when explicitly empty (yield-only). Lets `??` in
    // callers distinguish "missing" (→ pipeline.tools.defaults) from "none".
    tools?: string[];
    description: string;
  };
  render(fragment: string, vars: Record<string, string>): string;
  renderStepPrompt(
    fragment: string,
    vars: Record<string, string>,
    schema?: Record<string, unknown>,
  ): string;
  placeholders(fragment: string): string[];
}

/**
 * Searches directories for a prompt fragment or agent definition file.
 */
function resolveFragmentPath(fragment: string, dirs: string[]): string | null {
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
      `criteria/${cleanFrag}.md`,
    );
  } else if (cleanFrag.startsWith("agents/")) {
    const stripped = cleanFrag.slice("agents/".length);
    candidateSuffixes.push(
      stripped,
      stripped.endsWith(".md") ? stripped : `${stripped}.md`,
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
  seen = new Set<string>(),
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
      (fragment.startsWith("steps/")
        ? fragment.slice(6)
        : `steps/${fragment}`) + ".md",
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
      new Set(seen),
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
      tools?: string[];
      description: string;
    } {
      const targetFrag = agent.endsWith(".md") ? agent : `${agent}.md`;
      const filePath = resolveFragmentPath(targetFrag, searchDirs);

      let content: string;
      if (
        inMemoryOverrides &&
        (agent in inMemoryOverrides || targetFrag in inMemoryOverrides)
      ) {
        const val = inMemoryOverrides[agent] ?? inMemoryOverrides[targetFrag];
        if (typeof val === "string") {
          content = val;
        } else if (val && typeof val === "object") {
          const record = val as Record<string, unknown>;
          const body = typeof record.body === "string" ? record.body : "";
          const tools = Array.isArray(record.tools)
            ? (record.tools as string[])
            : undefined;
          const description =
            typeof record.description === "string" ? record.description : "";
          const resolvedBody = body.replace(
            /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
            (_m, inc) =>
              loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides),
          );
          return tools === undefined
            ? { body: resolvedBody.trim(), description }
            : { body: resolvedBody.trim(), tools, description };
        } else {
          content = "";
        }
      } else if (filePath) {
        content = fs.readFileSync(filePath, "utf8");
      } else {
        throw new Error(`Agent definition "${agent}" not found`);
      }

      // Parse frontmatter
      const fmMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/,
      );
      if (fmMatch) {
        let frontmatter: Record<string, unknown> = {};
        try {
          frontmatter =
            (yaml.parse(fmMatch[1] ?? "") as Record<string, unknown>) ?? {};
        } catch {
          // Fall back to empty frontmatter
        }

        const rawBody = fmMatch[2] ?? "";
        const resolvedBody = rawBody.replace(
          /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
          (_m, inc) =>
            loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides),
        );
        let finalBody = resolvedBody.trim();
        if (!finalBody.includes("Workspace Containment")) {
          try {
            const containment = loadAndResolveIncludes(
              "_shared/containment",
              searchDirs,
              inMemoryOverrides,
            );
            if (containment) {
              finalBody = `${finalBody}\n\n${containment.trim()}`;
            }
          } catch {}
        }

        const tools = Array.isArray(frontmatter.tools)
          ? (frontmatter.tools as string[])
          : undefined;
        const description =
          typeof frontmatter.description === "string"
            ? frontmatter.description
            : "";

        return tools === undefined
          ? { body: finalBody, description }
          : {
              body: finalBody,
              tools,
              description,
            };
      }

      // Without frontmatter
      const resolvedBody = content.replace(
        /\{\{>\s*([a-zA-Z0-9_./-]+)\s*\}\}/g,
        (_m, inc) => loadAndResolveIncludes(inc, searchDirs, inMemoryOverrides),
      );
      let finalBody = resolvedBody.trim();
      if (!finalBody.includes("Workspace Containment")) {
        try {
          const containment = loadAndResolveIncludes(
            "_shared/containment",
            searchDirs,
            inMemoryOverrides,
          );
          if (containment) {
            finalBody = `${finalBody}\n\n${containment.trim()}`;
          }
        } catch {}
      }

      return {
        body: finalBody,
        description: "",
      };
    },

    placeholders(fragment: string): string[] {
      const resolved = loadAndResolveIncludes(
        fragment,
        searchDirs,
        inMemoryOverrides,
      );

      // Match {{var}}, excluding include markers {{> ...}}
      const varRegex = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
      const matches: string[] = [];
      let match: RegExpExecArray | null;

      while (true) {
        match = varRegex.exec(resolved);
        if (match === null) break;
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
        inMemoryOverrides,
      );

      // Check for missing variables
      const varRegex = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
      const missingVars: string[] = [];
      let match: RegExpExecArray | null;

      while (true) {
        match = varRegex.exec(resolved);
        if (match === null) break;
        const varName = match[1];
        if (
          varName &&
          vars[varName] === undefined &&
          !missingVars.includes(varName)
        ) {
          missingVars.push(varName);
        }
      }

      if (missingVars.length > 0) {
        throw new Error(
          `Missing required prompt variables for "${fragment}": ${missingVars.join(
            ", ",
          )}`,
        );
      }

      return resolved.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_m, varName) =>
        varName in vars ? (vars[varName] ?? "") : "",
      );
    },

    renderStepPrompt(
      fragment: string,
      vars: Record<string, string>,
      schema?: Record<string, unknown>,
    ): string {
      const basePrompt = this.render(fragment, vars);
      if (
        !schema ||
        typeof schema !== "object" ||
        Object.keys(schema).length === 0
      ) {
        return basePrompt;
      }
      const outputSection = formatOutputSchemaSection(schema);
      return `${basePrompt.trimEnd()}\n\n${outputSection}\n`;
    },
  };
}
