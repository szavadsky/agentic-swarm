import path from "node:path";
import { loadPromptLibrary, type PromptLibrary } from "../core/prompts.js";
import { packageRoot } from "./config.js";
import type { ProcessConfig } from "./types.js";

/**
 * Prompt templates live in the package `prompts/` dir; a repo may shadow any
 * template under `.factory/prompts/` and replace the calibration partial with
 * process-config text. Undefined variables are render errors.
 */
export function loadPrompts(
  process: ProcessConfig,
  repoRoot: string,
): PromptLibrary {
  const overrideDirs: string[] = [];
  if (process.promptsDir)
    overrideDirs.push(path.resolve(repoRoot, process.promptsDir));
  overrideDirs.push(path.join(repoRoot, ".factory", "prompts"));
  const overrides: Record<string, string> = {};
  if (process.calibration !== undefined)
    overrides._calibration = process.calibration;
  return loadPromptLibrary({
    builtinDir: path.join(packageRoot, "prompts"),
    overrideDirs,
    overrides,
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
