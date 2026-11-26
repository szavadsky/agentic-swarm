{% include 'architect-assignment' %}
{% include 'architect-goal' %}
{% include 'architect-body' %}

{{ saga_reminder }}{{ subarchitect_block }}## Plan review marks

In `## Plan review`, mark every numbered finding in your outcome `planReviewMarks`. {% include 'plan-review-marks' -%}

## Status review

When the pack carries a `## Status review` section, read the review it names
and adjudicate every numbered finding in `statusReviewAnswers`: `upheld` when
it stands — correct the plan or the status you report — and `dismissed` with
the evidence that refutes it. One entry per finding.

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
