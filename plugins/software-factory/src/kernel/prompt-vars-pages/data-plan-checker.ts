/** The plan-checker prompt variables, split out so the role page list stays under the size limit. */

import type { PromptVariablesPage } from "./types.js";

export const PLAN_CHECKER_PAGE: PromptVariablesPage = {
  file: "plan-checker.md",
  prompt: "plan-checker",
  variables: {
    iteration: "1-based iteration number of this launch",
    intent_path: "path to the goal's `intent.md`, for resolving wording only",
    plans:
      "the active plans, one `- goal: <path>` or ``- epic `<epic>`: <path>`` line each; verify every plan against the repo; read-only to the checker",
    checkout: "path to the stable goal checkout (integration worktree)",
    tasks_dir: "directory holding one `<slug>.md` task file per task",
    existing_tasks:
      "existing task files as `- slug | status | hash | deps: a,b` lines (`none` when empty), then parked slugs with their cause",
    open_concerns:
      "the open concerns a merged follow-up or an earlier check has not answered, one `- <id> [kind/calibration]: <text> — <source>` line each; debt-kind concerns stay in the pack's debt register, not this list; `none` when empty",
    gate_record_path:
      "`end.yaml` of the newest record that ran gates, to read instead of running them; `none recorded` when no gate has run",
    outcome_path:
      "path where the outcome file must be written when the harness asks for a file",
    validate_cmd:
      "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
    outcome_schema:
      "outcome YAML skeleton from the kernel schema; renderer default",
  },
};
