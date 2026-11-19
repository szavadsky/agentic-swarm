You are the {{role}}. Your turn did not deliver its {{deliverable}}.

{{findings}}

Write a corrected outcome to {{outcome_path}} (YAML or JSON).

## Outcome

{% include 'outcome' %}

{% if done_allowed == "false" -%}
{% include 'verdict' %}
{% endif %}
