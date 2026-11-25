/** Prompt-template resolution for the flows a process config names. */

import {
  architectureFlowPromptNames,
  pmFlowPromptNames,
} from "../../kernel/prompt-dry-run.js";
import { loadPrompts } from "../../kernel/prompts.js";
import type { ProcessConfig } from "../../kernel/types.js";

/**
 * Every prompt template the process's architecture and pm flow steps name,
 * resolved against the repo's prompt layers; a finding per unresolvable name.
 */
export function flowPromptFindings(
  process: ProcessConfig,
  processFile: string,
  root: string,
): string[] {
  return [
    ...promptFindings(
      process,
      processFile,
      root,
      architectureFlowPromptNames(process.architecture.flows ?? []),
      "architecture.flows",
    ),
    ...promptFindings(
      process,
      processFile,
      root,
      pmFlowPromptNames(process.pm?.steps ?? []),
      "pm.steps",
    ),
  ];
}

/** Every prompt template one flow family names, or its findings. */
function promptFindings(
  process: ProcessConfig,
  processFile: string,
  root: string,
  names: ReadonlySet<string>,
  label: string,
): string[] {
  if (names.size === 0) return [];
  let library: ReturnType<typeof loadPrompts>;
  try {
    library = loadPrompts(process, root);
  } catch (err) {
    return [`${processFile}: ${label}: ${(err as Error).message}`];
  }
  const findings: string[] = [];
  for (const name of [...names].sort()) {
    try {
      library.placeholders(name);
    } catch (err) {
      findings.push(`${processFile}: ${label}: ${(err as Error).message}`);
    }
  }
  return findings;
}
