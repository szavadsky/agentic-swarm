- task: `{{task_path}}`
- diff range: `{{base_hash}}..{{head_hash}}` — spans every round of this task
- round: `{{round}}`
- base gates: {{base_gates}} — the base tree's recorded gate result; a failure this record does not list belongs to this task, not the base
- reviewed findings: the review's summary, concerns and forward lines, the only findings you judge:
  {{findings}}
  {%- if upscope_ask != '' %}
- standalone upscope: {{upscope_ask}}
  {%- endif %}
