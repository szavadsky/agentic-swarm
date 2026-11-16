import fs from "node:fs";
import path from "node:path";
import { Liquid, type FS } from "liquidjs";
import { packageRoot } from "./config.js";
import {
  flowNamesVar,
  outcomeSchemaVar,
  taskFrontmatterVar,
  tierNamesVar,
} from "./prompt-schema.js";
import type { ProcessConfig } from "./types.js";

/**
 * Prompt templates render through LiquidJS in strict mode: an unknown variable
 * or filter is a render error. Templates live in the package `prompts/` dir; a
 * repo may shadow any template under `.factory/prompts/` and replace the
 * calibration partial with process-config text.
 */

export interface PromptLibrary {
  render(fragment: string, vars: Record<string, string>): string;
  /**
   * Variables a render needs; `vars` resolves a template's dynamic include
   * (the reviewer's author body) that static analysis cannot name.
   */
  placeholders(fragment: string, vars?: Record<string, string>): string[];
}

function resolveWithExt(dir: string, file: string, ext: string): string {
  return path.resolve(dir, path.extname(file) ? file : file + ext);
}

function layeredFs(roots: string[], overrides: Record<string, string>): FS {
  // In-memory partials shadow every root; one candidate path per root keeps
  // the loader from ever falling through to disk for an overridden fragment.
  const overrideFiles = new Map<string, string>();
  for (const [name, content] of Object.entries(overrides)) {
    for (const root of roots)
      overrideFiles.set(resolveWithExt(root, name, ".md"), content);
  }
  const exists = (file: string) =>
    overrideFiles.has(file) || fs.existsSync(file);
  const contains = (root: string, file: string): boolean => {
    if (overrideFiles.has(file)) return true;
    try {
      const rel = path.relative(fs.realpathSync(root), fs.realpathSync(file));
      return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    } catch {
      return false;
    }
  };
  return {
    sep: path.sep,
    dirname: (file) => path.dirname(file),
    resolve: resolveWithExt,
    existsSync: exists,
    readFileSync: (file) =>
      overrideFiles.get(file) ?? fs.readFileSync(file, "utf8"),
    exists: async (file) => exists(file),
    readFile: async (file) =>
      overrideFiles.get(file) ?? fs.promises.readFile(file, "utf8"),
    containsSync: contains,
    contains: async (root, file) => contains(root, file),
  };
}

function createEngine(
  roots: string[],
  overrides: Record<string, string>,
): { engine: Liquid; fs: FS } {
  const layered = layeredFs(roots, overrides);
  const engine = new Liquid({
    root: roots,
    extname: ".md",
    strictVariables: true,
    strictFilters: true,
    fs: layered,
  });
  return { engine, fs: layered };
}

function loadFragment(
  layers: FS,
  roots: string[],
  fragment: string,
): { text: string; filepath: string } {
  for (const root of roots) {
    const filepath = resolveWithExt(root, fragment, ".md");
    if (layers.existsSync(filepath)) {
      return { text: layers.readFileSync(filepath), filepath };
    }
  }
  throw new Error(`Prompt fragment "${fragment}" not found`);
}

/**
 * Loads and renders prompt templates through LiquidJS. Lookup order (shadowing):
 * 1. In-memory `overrides`
 * 2. `overrideDirs` in order
 * 3. `builtinDir`
 *
 * `defaults` are launch-wide variables merged under every render's own vars:
 * an explicit var wins, so callers that do not know a default still render.
 */
export function loadPromptLibrary(opts: {
  builtinDir: string;
  overrideDirs?: string[];
  overrides?: Record<string, string>;
  defaults?: Record<string, string>;
}): PromptLibrary {
  const overrideDirs = opts.overrideDirs ?? [];
  const roots = [...overrideDirs, opts.builtinDir];
  const overrides = opts.overrides ?? {};
  const defaults = opts.defaults ?? {};
  for (const [name, content] of Object.entries(overrides)) {
    if (typeof content !== "string") {
      throw new TypeError(`prompt override "${name}" must be a string`);
    }
  }
  const { engine, fs: layers } = createEngine(roots, overrides);

  const requiredVariables = (
    fragment: string,
    vars: Record<string, string>,
  ): string[] => {
    const { text, filepath } = loadFragment(layers, roots, fragment);
    const analysis = engine.parseAndAnalyzeSync(text, filepath);
    // `locals` are assigned inside the template (`{% assign %}`), so they are
    // not inputs the caller must pass. The reviewer assigns `author_body` and
    // `review_duties` to include its author's `<role>-body` and `review-<role>`
    // partials; Liquid cannot resolve those includes statically, so the
    // fragments they name are analyzed here (a missing one fails by name).
    const names = new Set(Object.keys(analysis.globals));
    if (vars.author !== undefined) {
      const dynamic = [
        ...(analysis.locals.author_body ? [`${vars.author}-body`] : []),
        ...(analysis.locals.review_duties ? [`review-${vars.author}`] : []),
      ];
      for (const included of dynamic) {
        for (const name of requiredVariables(included, vars)) names.add(name);
      }
    }
    return [...names];
  };

  const requireVars = (fragment: string, vars: Record<string, string>) => {
    const missing = requiredVariables(fragment, vars).filter(
      (v) => !(v in vars),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required prompt variables for "${fragment}": ${missing.join(
          ", ",
        )}`,
      );
    }
  };

  return {
    placeholders(
      fragment: string,
      vars: Record<string, string> = {},
    ): string[] {
      return requiredVariables(fragment, { ...defaults, ...vars });
    },

    render(fragment: string, vars: Record<string, string>): string {
      loadFragment(layers, roots, fragment);
      const merged = { ...defaults, ...vars };
      requireVars(fragment, merged);
      try {
        return engine.renderFileSync(fragment, merged);
      } catch (error) {
        const message = (error as Error).message ?? "";
        if (message.includes("ENOENT")) {
          throw new Error(`Prompt fragment "${fragment}" not found`);
        }
        throw error;
      }
    },
  };
}

/**
 * Double-quotes a shell word only when it needs it; backslash-escapes the
 * characters a double-quoted word still interprets.
 */
function shellQuote(word: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) return word;
  return `"${word.replace(/([\\"$`!])/g, "\\$1")}"`;
}

/**
 * The `validate_cmd` prompt variable: the running build's `bin/factory.ts
 * validate`, absolute, so it runs from any task worktree. Resolved from the
 * running build (packageRoot), never from PATH or cwd. The optional path
 * exists for tests; production always uses the running build.
 */
export function validateCmd(
  binPath: string = path.join(packageRoot, "bin", "factory.ts"),
): string {
  return `bun ${shellQuote(binPath)} validate`;
}

/**
 * Templates live in the package `prompts/` dir; a repo may shadow any
 * template under `.factory/prompts/` and replace the calibration partial with
 * process-config text. Schema and config names render as launch-wide defaults
 * so turn code never passes them: the outcome and task-frontmatter skeletons
 * from the kernel schemas, flow names from the process config, tier names
 * from the run-config aliases.
 */
export function loadPrompts(
  process: ProcessConfig,
  repoRoot: string,
  aliases?: Record<string, unknown>,
): PromptLibrary {
  const overrideDirs: string[] = [];
  if (process.promptsDir)
    overrideDirs.push(path.resolve(repoRoot, process.promptsDir));
  overrideDirs.push(path.join(repoRoot, ".factory", "prompts"));
  const overrides: Record<string, string> = {};
  if (process.calibration !== undefined)
    overrides.calibration = process.calibration;
  return loadPromptLibrary({
    builtinDir: path.join(packageRoot, "prompts"),
    overrideDirs,
    overrides,
    // Round 1 has no fix to judge; promptVars overrides this with the current
    // fix round's dispositions wherever they exist.
    // A reviewer includes its author's `<role>-body` fragment; the diff
    // reviewer's author is the implementer unless the turn names another.
    defaults: {
      validate_cmd: validateCmd(),
      author: "implementer",
      fix_dispositions: "",
      outcome_schema: outcomeSchemaVar(),
      task_frontmatter: taskFrontmatterVar(),
      flows: flowNamesVar(process.flows),
      tiers: tierNamesVar(aliases),
    },
  });
}

export function renderRolePrompt(
  library: PromptLibrary,
  process: ProcessConfig,
  role: string,
  vars: Record<string, string>,
): string {
  const config = process.roles[role];
  if (!config) throw new Error(`process config has no role "${role}"`);
  return library.render(config.prompt, vars);
}
