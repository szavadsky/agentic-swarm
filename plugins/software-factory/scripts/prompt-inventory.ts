/** The template inventory: every prompt fragment and the fragments it includes. */

import fs from "node:fs";
import path from "node:path";
import { Liquid, type Template } from "liquidjs";
import {
  DEFAULT_PROMPT_AUTHOR,
  dynamicPromptIncludes,
} from "../src/kernel/prompts.js";

/** Markdown files in `prompts/` that document the templates instead of being one. */
const DOC_FILES = new Set(["README.md", "VARIABLES.md"]);

/** One template file and the partial names it can include. */
export interface PromptFragment {
  /** Template name used by `{% include %}` and `render`, without `.md`. */
  name: string;
  /** Path relative to the prompts root, for diagnostics. */
  file: string;
  /** Raw template text. */
  text: string;
  /**
   * Every partial this template can include, whatever branch renders: literal
   * includes from all branches plus the reviewer's computed author partials.
   */
  includes: readonly string[];
}

export interface PromptInventory {
  fragments: readonly PromptFragment[];
}

function fragmentName(promptsDir: string, file: string): string {
  const relative = path.relative(promptsDir, file).split(path.sep).join("/");
  return relative.endsWith(".md") ? relative.slice(0, -".md".length) : relative;
}

function walkMarkdown(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md") && !DOC_FILES.has(entry.name)) {
      found.push(full);
    }
  }
  return found.sort();
}

/**
 * A template's children live in the generator's return value, not its yields:
 * Liquid's analyzer walks them the same way.
 */
function childTemplates(template: Template): Template[] {
  const children = template.children?.(false, true);
  if (children === undefined) return [];
  const found: Template[] = [];
  let step = children.next();
  while (!step.done) {
    if (step.value) found.push(step.value as Template);
    step = children.next();
  }
  found.push(...step.value);
  return found;
}

function literalIncludes(template: Template, found: Set<string>): void {
  const name = template.partialScope?.()?.name;
  if (name !== undefined) {
    found.add(name.endsWith(".md") ? name.slice(0, -".md".length) : name);
  }
  for (const child of childTemplates(template)) literalIncludes(child, found);
}

/**
 * Reads every template through the same strict parser the renderer uses:
 * literal includes come from all branches, and the reviewer's assigned
 * author partials are resolved from its `{% assign %}` names.
 */
export function readPromptInventory(promptsDir: string): PromptInventory {
  const root = path.resolve(promptsDir);
  if (!fs.existsSync(root)) return { fragments: [] };
  const engine = new Liquid({
    root: [root],
    extname: ".md",
    strictVariables: true,
    strictFilters: true,
  });
  const fragments = walkMarkdown(root).map((file) => {
    const text = fs.readFileSync(file, "utf8");
    const templates = engine.parse(text, file);
    const includes = new Set<string>();
    for (const template of templates) literalIncludes(template, includes);
    const analysis = engine.parseAndAnalyzeSync(text, file, {
      partials: false,
    });
    for (const name of dynamicPromptIncludes(
      analysis.locals,
      DEFAULT_PROMPT_AUTHOR,
    )) {
      includes.add(name);
    }
    return {
      name: fragmentName(root, file),
      file: path.relative(root, file).split(path.sep).join("/"),
      text,
      includes: [...includes].sort(),
    };
  });
  return { fragments };
}
