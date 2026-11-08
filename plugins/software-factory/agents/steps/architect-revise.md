# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- ADRs: preserve `blocking: true` only when the active human-involvement table needs a human decision; remarkable ADRs go to the digest and never wait.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{{plan}}

## Plan Review Feedback
{{planReview}}
