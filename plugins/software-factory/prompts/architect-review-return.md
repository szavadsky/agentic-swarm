{% include 'architect-assignment' %}

## Plan review return

The plan review raised technical concerns. This is your one turn on them; it is not a consult and takes no goal decision.

### What to do

- Address every technical finding: edit the plan, or leave the plan and say why in your summary. A finding you judge wrong is still answered, with your reason.
- Use the plan notes where they improve the plan; they are advisory.
- Mark every finding, 1..{{finding_count}}, in `planReviewMarks`. {% include 'plan-review-marks' -%}
- Edit the plan in place.
- No decision and no verdict this turn.

### Technical findings

{{technical_findings}}

### Plan notes

{{plan_notes}}

{% include 'calibration' %}

{% include 'outcome' %}

## This turn

- iteration: `{{iteration}}`
- intent: `{{intent_path}}`
- plan: `{{plan_path}}` (edit this file)
- context pack: `{{pack_path}}`
- reviewers: {{reviewers}}
- outcome path: `{{outcome_path}}`
