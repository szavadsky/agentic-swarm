# Step: Architect Consult (Non-Item)

## Goal
Resolve an orchestration-level failure, close-up defect, or non-item seam blockage.

## Rules
- Exploration budget: evaluate the non-item issue using seam context, failure logs, and the prepared context pack (`{{contextPack}}`). Read code ONLY to verify specific failure details (few targeted reads). Unknowns → `fix-item`, spike outline, or `human-async` instead of broad code exploration. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "non-item"`):
  - `fix-item`: specify an item outline to be scheduled via PM edits to resolve the defect.
  - `accept-with-debt`: accept current state; track defect as technical debt in subsequent waves/iterations.
  - `human-async`: route an ambiguous requirement or external dependency blocker to the human operator via `steer/tousertoreview/`.
  - `abort`: terminate the run if the task is fundamentally compromised or unachievable.
- Root cause diagnosis: identify why the non-item seam or close-up check failed and select the lowest-impact resolution.

## Task & Seam
Task: {{task}}
Context: {{context}}

## Failure / Review Findings
{{feedback}}

## Tech Debt
{{debt}}

## Context Pack
{{contextPack}}

## Human involvement
{{humanInvolvementCriteria}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; condense stale detail instead of repeating it.
