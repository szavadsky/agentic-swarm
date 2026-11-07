# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Decision options:
  - `complete`: The task's `INTENT.md` is fully satisfied with verified working code, comprehensive tests, and green gates.
  - `next-iteration`: Scope remains unfulfilled; proceed to iteration $N+1$ with updated requirements and hydrated context.
  - `blocked`: Execution cannot proceed without human operator resolution. Formulate a precise, answerable question for the operator.
- Rationale required: Ground your decision in the plan close-up audit findings, verifying whether all milestones and Gherkin scenarios are genuinely delivered.

## Plan Close-Up Audit
{{closeup}}

## Current Plan
{{plan}}

## Task Intent
{{intent}}
