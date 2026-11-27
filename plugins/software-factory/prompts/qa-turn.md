## This turn

- task: `{{task_path}}`
- worktree: `{{worktree}}` — every path you cite is relative to it
- diff range: `{{base_hash}}..{{head_hash}}`
- round: `{{round}}` of `{{max_rounds}}`
- base gates: {{base_gates}} — pre-existing red evidence for a claimed failure
- checks: `{{checks_result}}`
- checks tree: `{{checks_tree}}`
- checks log: `{{checks_log}}`
- gate commands:
  {{gate_commands}}
- prior findings: `{{prior_findings}}` — the last acceptance's numbered findings; empty before the first acceptance
- fix dispositions: `{{fix_dispositions}}` — round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty; each prior finding is judged on its change or reply
  {%- if upscope_ask != '' %}
- standalone upscope: {{upscope_ask}}
  {%- endif %}
- outcome path: `{{outcome_path}}`
