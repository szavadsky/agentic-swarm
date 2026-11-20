import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "../../src/kernel/config.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import {
  PROMPT_VARIABLES,
  type PromptVariablesPage,
  pageVariables,
} from "../../src/kernel/prompt-vars-pages.js";
import {
  renderPromptVariables,
  variablesDocPath,
} from "../../src/kernel/prompt-vars.js";

const PROMPTS_DIR = path.join(packageRoot, "prompts");

/** Statically included fragments; the reviewer's dynamic names are pages themselves. */
const INCLUDE = /\{%-?\s*include\s+['"]([^'"]+)['"]/g;

function library() {
  return loadPromptLibrary({ builtinDir: PROMPTS_DIR });
}

function promptFiles(): string[] {
  return fs
    .readdirSync(PROMPTS_DIR)
    .filter((file) => file.endsWith(".md") && file !== "VARIABLES.md")
    .sort();
}

/** Every file a prompt includes, directly or through a documented page. */
function reachableTemplates(): Set<string> {
  const files = new Set(promptFiles());
  const reached = new Set<string>();
  const queue = PROMPT_VARIABLES.map((page) => page.file);
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined) continue;
    if (reached.has(file)) continue;
    reached.add(file);
    if (!files.has(file)) continue;
    const text = fs.readFileSync(path.join(PROMPTS_DIR, file), "utf8");
    for (const match of text.matchAll(INCLUDE)) {
      const included = `${match[1]}.md`;
      if (files.has(included)) queue.push(included);
    }
  }
  return reached;
}

interface PromptGroup {
  prompt: string;
  author?: string;
  pages: PromptVariablesPage[];
}

/**
 * The pages a rendered prompt's placeholders must equal: every page for the
 * prompt, plus the pages of one author variant when the prompt has variants.
 */
function promptGroups(pages: readonly PromptVariablesPage[]): PromptGroup[] {
  const byPrompt = new Map<string, PromptVariablesPage[]>();
  for (const page of pages) {
    if (!page.prompt) continue;
    byPrompt.set(page.prompt, [...(byPrompt.get(page.prompt) ?? []), page]);
  }
  const groups: PromptGroup[] = [];
  for (const [prompt, list] of byPrompt) {
    const variants = [
      ...new Set(list.flatMap((page) => (page.author ? [page.author] : []))),
    ].sort();
    if (variants.length === 0) {
      groups.push({ prompt, pages: list });
      continue;
    }
    for (const author of variants)
      groups.push({
        prompt,
        author,
        pages: list.filter((page) => !page.author || page.author === author),
      });
  }
  return groups;
}

describe("prompt variables reference", () => {
  it("matches the descriptor's render, so the file is never hand-edited", () => {
    const file = path.relative(packageRoot, variablesDocPath());
    expect(
      fs.readFileSync(variablesDocPath(), "utf8"),
      `${file} is generated: run \`bun bin/factory.ts variables --out ${file}\``,
    ).toBe(renderPromptVariables());
  });

  it("has no padded columns", () => {
    expect(
      renderPromptVariables()
        .split("\n")
        .filter((line) => line.startsWith("|")),
    ).toEqual([]);
  });

  it("names a template file on every page", () => {
    const missing = PROMPT_VARIABLES.filter(
      (page) => !fs.existsSync(path.join(PROMPTS_DIR, page.file)),
    ).map((page) => page.file);
    expect(missing).toEqual([]);
  });

  it("documents every prompt template or reaches it from a page", () => {
    const reached = reachableTemplates();
    expect(
      promptFiles().filter((file) => !reached.has(file)),
      "add a page to PROMPT_VARIABLES for the new template, or include it from a documented one",
    ).toEqual([]);
  });
});

describe("prompt variable descriptor", () => {
  for (const group of promptGroups(PROMPT_VARIABLES)) {
    const label = group.author
      ? `${group.prompt} (author: ${group.author})`
      : group.prompt;
    it(`documents exactly the variables ${label} renders`, () => {
      const documented = group.pages.flatMap((page) =>
        pageVariables(page).map((variable) => variable.name),
      );
      const rendered = library().placeholders(
        group.prompt,
        group.author ? { author: group.author } : {},
      );
      expect(
        documented.filter((name) => !rendered.includes(name)),
        `documented on a page but never rendered by ${label}`,
      ).toEqual([]);
      expect(
        rendered.filter((name) => !documented.includes(name)),
        `rendered by ${label} but undocumented`,
      ).toEqual([]);
      expect(
        documented.length,
        `a variable is documented twice across the ${label} pages`,
      ).toBe(new Set(documented).size);
    });
  }
});
