# Step: Simple Implement

## Goal
Implement a small, isolated change directly on the item branch as a continuation of the triage session.

## Rules
- Direct implementation: Execute required code edits and minimal test updates.
- Sizing budget: Production code changes MUST NOT exceed `simpleMaxProdLines` (default 150 lines).
- Test constraint: Test modifications must be rename-only or minimal updates (`simple-guard`). Do NOT write complex new test suites. If requirements demand extensive testing, task should have triaged as `story`.
- Gate verification: Run project gates via `bash`; all gates MUST succeed with exit code 0.
- Evidence mandatory: Yield `status: ok` with non-empty `evidence` (array of strings) matching `developer-output.schema.json`.

## Intent
{{intent}}

## Context & Citations
{{citations}}
