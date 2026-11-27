/** The infra ingestion prompt's variables. */

import type { PromptVariablesPage } from "./types.js";

export const INFRA_PROMPT_VARIABLES: PromptVariablesPage = {
  file: "infra.md",
  prompt: "infra",
  intro:
    "The ingestion gate discovery: with repo-config gates present it copies them exactly and reports their status; with none it discovers the project's commands. Its output is `infra.yaml`, the kernel schema the gates the kernel runs are read from.",
  variables: {
    iteration: "1-based iteration number of this launch",
    intent_path: "path to the goal's `intent.md`; a pointer, never pasted",
    checkout:
      "path to the stable goal checkout (integration worktree) the gates run in",
    setup_command: "repository setup command; `none` when not needed",
    gate_commands:
      "configured gate commands as `- id: command` lines with any recorded status; `none` when the repo config declares none, which is when discovery is allowed",
    current_infra:
      "contents of the existing `infra.yaml`, or `none` when absent",
    incident_evidence:
      "gate timeout or cannot-start failure evidence on an incident turn; `none` during goal-start ingestion",
    infra_path:
      "path of the `infra.yaml` to write, naming each gate's command, speed and observed status; the one artifact the turn authors (the outcome file is the other)",
    outcome_path:
      "path where the outcome file must be written when the harness asks for a file",
    validate_cmd:
      "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
    outcome_schema:
      "outcome YAML skeleton from the kernel schema; renderer default",
  },
};
