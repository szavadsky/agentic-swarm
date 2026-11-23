{% if branch != "" %}

- branch: `{{ branch }}`
  {% endif %}
  {% if reason == "trivial" %}
- resume: this turn continues your front session; your tools run in `{{ session_cwd }}`, not the worktree. Do all work under the absolute worktree path `{{ worktree }}` — relative paths land in the session directory, outside your assignment. Never write outside the worktree: the script rejects the turn on any change there.
  {% else %}
- resume: assess status first, keep going
  {% endif %}
