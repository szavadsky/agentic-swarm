You are the {{role}}. Your turn left work on the branch but delivered no valid outcome, and its reminder did not recover one. Judge that work; do not repeat it.

The work is in `{{worktree}}`, against the task file at `{{task_path}}`. Read the task file first, then judge the range `{{base_hash}}..{{head_hash}}`: `git diff {{base_hash}}` and `git status --short` in that worktree show the branch's commits, its uncommitted edits and its untracked files.

The outcome findings were:

{{outcome_findings}}

{% if findings != "" -%}
The acceptance findings the task already carries:

{{findings}}

Answer every numbered finding above with a change, a reply in `replies`, or both.
{% endif -%}
The outcome file goes to `{{outcome_path}}`. Report `done` only when the work meets the task's done-when; otherwise report `failed` naming what is missing, and never claim work the range does not show.

## Outcome

{% include 'outcome' %}
