{%- include 'implementer-body' -%}

## This turn

- task: `{{task_path}}`
- front pack: `{{front_pack}}` — read before the task when not empty
- worktree: `{{worktree}}`{{resume_note}}
- setup command: `{{setup_command}}`
- gate commands: `{{gate_commands}}`
- gate baseline: `{{baseline_checks}}` — failures here are pre-existing
- previous review findings: `{{findings}}` — empty before the first review
- outcome path: `{{outcome_path}}`
