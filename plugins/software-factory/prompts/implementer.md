{%- include 'implementer-body' -%}

## This turn

- task: `{{task_path}}`
- front pack: `{{front_pack}}` — the front's briefing for this goal; read it before the task when not empty
- worktree: `{{worktree}}`{{resume_note}}
- setup command: `{{setup_command}}`
- gate commands: `{{gate_commands}}`
- gate baseline before your turn: `{{baseline_checks}}` — failures here are pre-existing
- previous review findings: `{{findings}}` — review summary, then concerns and forward; empty string before the first review
- outcome path: `{{outcome_path}}`
