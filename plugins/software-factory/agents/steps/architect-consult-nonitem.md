# Step: Architect Consult (Non-Item)

## Goal
Resolve an orchestration-level failure, close-up defect, or non-item seam blockage.

## Rules
- Decision options:
  - `fix-item`: Specify an item outline to be scheduled via PM edits to resolve the defect.
  - `accept-with-debt`: Accept current state; track defect as technical debt in subsequent waves/iterations.
  - `human-async`: Route an ambiguous requirement or external dependency blocker to the human operator via `steer/tousertoreview/`.
  - `abort`: Terminate the run if the task is fundamentally compromised or unachievable.
- Root cause diagnosis: Identify why the non-item seam or close-up check failed and select the lowest-impact resolution.

## Task & Seam
Task: {{task}}
Context: {{context}}

## Failure / Review Findings
{{feedback}}

## Tech Debt
{{debt}}
