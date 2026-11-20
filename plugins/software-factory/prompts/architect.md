{% include 'architect-assignment' %}
{% include 'architect-goal' %}
{% include 'architect-body' %}

{{ subarchitect_block }}## Plan review marks

In `## Plan review`, mark every numbered finding in your outcome `planReviewMarks`. {% include 'plan-review-marks' -%}

{% include 'verdict' %}

## This turn

- turn: `{{turn}}`
- iteration: `{{iteration}}`
- intent: `{{intent_path}}`
- plan: `{{plan_path}}` (edit this file)
- goal checkout: `{{checkout}}`
- context pack: `{{pack_path}}`
- previous-launch digest: `{{digest_path}}` — empty on a first launch
- pending steers: `{{steers}}`
- outcome path: `{{outcome_path}}`
