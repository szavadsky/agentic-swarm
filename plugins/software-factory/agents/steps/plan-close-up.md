# Step: Plan Close-Up

## Goal
Audit completed iteration work against original plan milestones, Gherkin scenarios, and task intent. Deliver an independent completeness assessment.

## Rules
- SKEPTICAL AUDIT: inspect real code, test suites, and gate results. NEVER rely on developer claims or wave summaries.
- Tracing requirements: trace each milestone and scenario in the plan to concrete implementing code and passing tests.
- Gap identification: flag any unimplemented scenarios, skipped edge cases, weakened tests, or unaddressed technical debt.
- Output: yield the audit matching `plan-closeup.schema.json`.
- Status semantics (your AUDIT verdict; the architect decides the iteration): `complete` (every milestone verified delivered), `next-iteration` (verified gaps remain for another iteration), `blocked` (you cannot assess without operator input; set `question`).
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes.

## Task Intent
{{intent}}

## Plan
{{plan}}

## Context
{{context}}

## Human involvement
{{humanInvolvementCriteria}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; triage pre-existing ids with the allowed dispositions and condense or dismiss stale ones.
