{%- if report_path != '' -%}
Commit the report at `{{ report_path }}` first, then refine it.

{% endif -%}
{%- include 'implementer-body' -%}

## This turn

- task: `{{task_path}}`
- front pack: `{{front_pack}}` — read before the task when not empty
- worktree: `{{worktree}}`{{resume_note}}
- spike report: `{{report_path}}` — a spike commits its finding here; the spike-report check is red until the commit carries it non-empty. Empty on any other task
- setup command: `{{setup_command}}`
- gate commands: `{{gate_commands}}`
- base gates: {{base_gates}} — the base tree's recorded gate result; a failure it lists was red before any task, and any red it does not list is this task's to fix
- previous acceptance findings: `{{findings}}` — empty before the first acceptance; each is answered by a change, a reply in `replies`, or both, and a reply-only round is `done`.
- outcome path: `{{outcome_path}}`
