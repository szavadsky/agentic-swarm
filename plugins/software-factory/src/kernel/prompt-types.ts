/** The prompt shapes a render and its reference share. */

export interface PromptRender {
  /** Prompt template name the kernel renders. */
  name: string;
  text: string;
}

/** A prompt and the partials it composes, in the reference's order. */
export interface PromptComposition {
  prompt: string;
  partials: readonly string[];
}
