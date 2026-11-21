/** The prompt-variable descriptor shapes. */

/**
 * The prompt-variable descriptor: one typed page per prompt template, beside
 * the builders that supply the variables. `prompt-vars.ts` renders the
 * reference from these pages; the prompt tests fail when a page and its
 * template's placeholders disagree.
 */

/** One documented prompt variable: the name a template reads and its meaning. */
export interface PromptVariable {
  name: string;
  meaning: string;
}

/** One page of the reference: a template file and the variables it renders. */
export interface PromptVariablesPage {
  /** Template file under `prompts/`, extension included; the page's heading. */
  file: string;
  /**
   * Prompt name the kernel renders this file as, for the placeholder gate.
   * Absent on a partial no turn renders directly.
   */
  prompt?: string;
  /**
   * Reviewer author variant this page belongs to. Absent means the page joins
   * every variant of its prompt.
   */
  author?: string;
  /** Prose before the variable list. */
  intro?: string;
  /** One line per variable, in render order; empty when the template reads none. */
  variables?: Readonly<Record<string, string>>;
  /** Page whose variables this one shares, instead of repeating the list. */
  shares?: string;
  /** Prose after the variable list. */
  note?: string;
}
