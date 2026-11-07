# Step: Plan Close-Up

## Goal
Audit completed iteration work against original plan milestones, Gherkin scenarios, and task intent. Deliver an independent completeness assessment.

## Rules
- SKEPTICAL AUDIT: Inspect real code, test suites, and gate results. NEVER rely on developer claims or wave summaries.
- Tracing requirements: Trace each milestone and scenario in the plan to concrete implementing code and passing tests.
- Gap identification: Flag any unimplemented scenarios, skipped edge cases, weakened tests, or unaddressed technical debt.
- Reviewer boundary: Reviewers critique; reviewers NEVER write code fixes. Record all gaps in `suggestions` matching `review.schema.json` with appropriate dispositions:
{{> _shared/dispositions}}

## Task Intent
{{intent}}

## Plan
{{plan}}

## Context
{{context}}
