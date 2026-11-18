{%- include 'implementer-body' -%}

## This turn

- task: `{{task_path}}`
- front pack: `{{front_pack}}` — read before the task when not empty
- worktree: `{{worktree}}`{{resume_note}}
- spike report: `{{report_path}}` — a spike commits its finding here; the spike-report check is red until the commit carries it non-empty. Empty on any other task
- setup command: `{{setup_command}}`
- gate commands: `{{gate_commands}}`
- gate baseline: `{{baseline_checks}}` — failures here are pre-existing
- previous review findings: `{{findings}}` — empty before the first review; each is answered by a change, a reply in `replies`, or both, and a reply-only round is `done`.
- outcome path: `{{outcome_path}}`
