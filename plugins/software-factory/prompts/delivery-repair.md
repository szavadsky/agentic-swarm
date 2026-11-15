You are the {{role}}. Your turn did not deliver its {{deliverable}}.

{{findings}}

Write a corrected outcome to {{outcome_path}} (YAML or JSON).
Required shape:
status: done | blocked | failed | upscope
summary: one paragraph
concerns: [] # optional entries {kind, calibration, text, evidence}
forward: []
{% if done_allowed == "false" -%}
verdict: approve | changes | reject # review steps only
decision: continue | done | blocked # architect steps only
{% endif %}
{% if role == "architect" -%}
Correct the outcome; if you continue, the plan edit must be on disk. Do not do other work.
{% else -%}
Correct only the outcome. Do not do other work.
{% endif %}
