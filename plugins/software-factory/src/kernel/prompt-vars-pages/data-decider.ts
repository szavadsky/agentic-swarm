/** The decide turn's prompt page: a kernel-raised turn on a mechanical signal. */

import type { PromptVariablesPage } from "./types.js";

export const DECIDER_PAGE: PromptVariablesPage = {
  file: "decider.md",
  prompt: "decider",
  intro:
    "The decide turn's prompt: a mechanical signal (an empty diff, a spent round bound, or red gates that survived their fixes) stopped the task and the kernel raised it instead of parking. The decider reads the signal, the branch, the checks log and the prior findings, then answers through its outcome verdict: approve continues past the stopped point and ships (accepting a red on a gates signal), changes grants the next fix round or fix budget, reject parks. It reuses the reviewer alias and session.",
  variables: {
    pending_signal:
      "the raised signal as `<kind>: <evidence>`; the sentence the kernel would have parked with",
    task_path:
      "path to the task file whose done-when the branch is judged against",
    worktree: "path to the task worktree holding the branch",
    base_hash:
      "commit hash before this task's first turn; the range spans every round",
    head_hash: "commit hash after the latest turn",
    findings: "the latest acceptance or red-check handoff; empty when none",
    prior_findings:
      "the last review's numbered summary and concerns; empty before the first review",
    checks_result:
      "latest checks record's failing-check text, or `pass` when green; `no checks run` without a checks record",
    checks_tree: "the checked tree's hash; `unknown` without a checks record",
    checks_log:
      "the checks record's directory; `unknown` without a checks record",
    outcome_path:
      "path where the outcome file must be written when the harness asks for a file",
    validate_cmd:
      "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
    outcome_schema:
      "outcome YAML skeleton from the kernel schema; renderer default",
  },
};
