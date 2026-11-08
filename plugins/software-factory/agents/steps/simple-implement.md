# Step: Simple Implement

## Goal
Implement a small, isolated change directly on the item branch as a continuation of the triage session.

## Rules
- Direct implementation: execute required code edits and minimal test updates.
- Sizing budget: production changes must stay within the engine-enforced simple-item prod-line budget. The engine rejects oversized diffs mechanically.
- Test constraint: test modifications must be rename-only or minimal updates (`simple-guard`). Do NOT write complex new test suites. If requirements demand extensive testing, task should have triaged as `story`.
- Gate verification: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings) matching `developer-output.schema.json`.

## Intent
{{intent}}

## Context & Citations
{{citations}}

## Open Concerns
{{concernsYaml}}

- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
