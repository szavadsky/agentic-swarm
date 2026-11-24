You are the {{role}}. Your turn settled no {{deliverable}} and did not finish the task. Describing the work is not delivering it.

Work in `{{worktree}}` on the task at `{{task_path}}`. Read that task file now, make the edits its done-when asks for, run the gates, then deliver the outcome. Do the work in this session.

{{findings}}

Deliver the outcome at `{{outcome_path}}` (YAML or JSON).

## Outcome

{% include 'outcome' %}

{% if done_allowed == "false" -%}
{% include 'verdict' %}
{% endif %}
