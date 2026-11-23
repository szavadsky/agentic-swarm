/** The repair-ask prompt variable pages, appended after the role pages. */

import type { PromptVariablesPage } from "./types.js";

export const REPAIR_PROMPT_VARIABLES: readonly PromptVariablesPage[] = [
  {
    file: "delivery-repair.md",
    prompt: "delivery-repair",
    intro:
      "The default in-session repair ask, rendered by the kernel when a turn delivers no outcome, no verdict or decision, or (architect) no plan. Process config names the template per step (`repairPrompt`); a step that names none renders this one. A repo may shadow it like any template. It is not a role prompt: it is rendered directly, never included by another prompt, and it includes `repair-ask` for the header, findings and outcome contract, then adds its closing instruction. It includes `outcome` for the contract and, unless a bare done delivers, `verdict` for the verdict/decision usage line. Its `outcome_schema` is narrowed to the fields that turn delivers — the base shape, the prompt's reporting fields, and the one field its expectation gates — so a bare done is never asked for a verdict.",
    variables: {
      role: "the prompt (the role) whose turn missed its deliverable",
      deliverable:
        "the product the turn must deliver; process config names it, else a review turn's verdict, else the outcome",
      done_allowed:
        "`true` when a bare `status: done` delivers (no verdict or decision required), else `false`",
      findings: "the missing or invalid findings as `- ` bullet lines",
      outcome_path: "path where the corrected outcome must be written",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome YAML skeleton from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask",
    },
  },
  {
    file: "architect-repair.md",
    prompt: "architect-repair",
    intro:
      "The architect's repair ask, named by the architect boundary step's `repairPrompt`. Same variables as `delivery-repair.md`; it adds that a continued turn must have its plan edit on disk, so the generic template stays free of role branches.",
    shares: "delivery-repair.md",
  },
];
