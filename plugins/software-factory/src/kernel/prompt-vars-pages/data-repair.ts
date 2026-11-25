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
        "outcome examples from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask",
    },
  },
  {
    file: "unfinished-turn.md",
    prompt: "unfinished-turn",
    intro:
      "The finish-the-task ask, named by a step's `unfinishedPrompt`. The kernel sends it instead of the outcome-only repair when the settled read found no outcome at all and no halted stop ended the turn, so the turn explored or planned but never delivered. It is not a role prompt: it is rendered directly and stands alone, naming the task path and worktree because the repair may land in a session that did not survive. A step that names no `unfinishedPrompt` keeps `delivery-repair`.",
    variables: {
      role: "the prompt (the role) whose turn settled no outcome",
      deliverable:
        "the product the turn must deliver; process config names it, else a review turn's verdict, else the outcome",
      done_allowed:
        "`true` when a bare `status: done` delivers (no verdict or decision required), else `false`",
      findings: "the missing or invalid findings as `- ` bullet lines",
      task_path: "path to the task file the turn must finish",
      worktree: "the worktree the turn must do the work in",
      outcome_path: "path where the outcome must be written",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask",
    },
  },
  {
    file: "rescue-turn.md",
    prompt: "rescue-turn",
    intro:
      "The fresh-session ask the flow renders when an implement turn left work on its branch but delivered no valid outcome after its reminders. The kernel sends it once, without a session, so the ask stands alone: it names the task, the worktree and the diff range the new turn must judge, then the outcome findings the hook passed and the acceptance findings from the turn's own vars that `replies` must answer. It is not a role prompt: it is rendered directly by the flow, never included by another prompt.",
    variables: {
      role: "the prompt (the role) whose turn left the work",
      worktree: "the worktree holding the branch's work",
      task_path: "path to the task file the work answers",
      base_hash: "commit hash the branch's work is judged from",
      head_hash: "commit hash the branch reached before the rescue call",
      outcome_findings:
        "the surviving outcome findings the kernel passed to the hook, as `- ` bullet lines",
      findings:
        "the acceptance findings the turn already answers, as the implementer's vars render them; empty when none",
      outcome_path: "path where the outcome must be written",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; supplied by the turn",
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
