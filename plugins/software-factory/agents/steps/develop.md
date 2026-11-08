# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

## Assignment
{{assignment}}

## Target
{{target}}

## Context & Citations
{{citations}}

## Open Concerns
{{concernsYaml}}

- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
