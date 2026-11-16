You are the {{role}}. Your turn did not deliver its {{deliverable}}.

{{findings}}

Write a corrected outcome to {{outcome_path}} (YAML or JSON).

## Outcome

{% include 'outcome' %}

{% if done_allowed == "false" -%}
{% include 'verdict' %}
{% endif %}

{% if role == "architect" -%}
Correct the outcome; if you continue, the plan edit must be on disk. Do not do other work.
{% else -%}
Correct only the outcome. Do not do other work.
{% endif %}
