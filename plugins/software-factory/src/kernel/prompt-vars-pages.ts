/** The prompt-variable descriptors' public surface; the data and page renderer are split under `prompt-vars-pages/`. */

export type {
  PromptVariable,
  PromptVariablesPage,
} from "./prompt-vars-pages/types.js";
export { PROMPT_VARIABLES } from "./prompt-vars-pages/data.js";
export { pageVariables } from "./prompt-vars-pages/page.js";
