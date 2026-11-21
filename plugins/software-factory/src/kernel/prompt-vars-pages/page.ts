/** Rendering one variable-reference page. */

import type { PromptVariable, PromptVariablesPage } from "./types.js";
import { PROMPT_VARIABLES } from "./data.js";

/** Variables a page documents, following one `shares` hop. */
export function pageVariables(
  page: PromptVariablesPage,
  pages: readonly PromptVariablesPage[] = PROMPT_VARIABLES,
): readonly PromptVariable[] {
  if (page.shares) {
    const shared = pages.find((candidate) => candidate.file === page.shares);
    if (!shared)
      throw new Error(
        `prompt-vars: page "${page.file}" shares missing page "${page.shares}"`,
      );
    if (shared.shares)
      throw new Error(
        `prompt-vars: page "${page.file}" shares "${page.shares}", which shares another page`,
      );
    return Object.entries(shared.variables ?? {}).map(([name, meaning]) => ({
      name,
      meaning,
    }));
  }
  return Object.entries(page.variables ?? {}).map(([name, meaning]) => ({
    name,
    meaning,
  }));
}
