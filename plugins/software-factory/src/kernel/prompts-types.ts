/** The prompt library a launch renders through. */

export interface PromptLibrary {
  render(fragment: string, vars: Record<string, string>): string;
  /** Variables the library supplies to every render; a caller never passes them. */
  readonly defaults: Readonly<Record<string, string>>;
  /**
   * Variables a render needs; `vars` resolves a template's dynamic include
   * (the reviewer's author body) that static analysis cannot name.
   */
  placeholders(fragment: string, vars?: Record<string, string>): string[];
}
