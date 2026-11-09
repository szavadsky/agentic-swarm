# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

## Assignment
{
  "slug": "schema-detail-normalize-v4",
  "kind": "dev",
  "title": "Lowercase detail in producer schemas + merge fix (final retry)",
  "assignment": "FINAL RETRY (closes QA-exhausted v3 per decision 026). Baseline is RED. Normalize concern Detail (capital-D) to detail (lowercase-d) in 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json BOTH occurrences: suggestions[].Detail (~:33) AND newConcerns[].Detail (~:65) to match generated review-schema.ts which already emits lowercase-d for both. TS fix at plugins/software-factory/src/core/concerns.ts:74: change guard's existing?.Detail capital-D read to lowercase-d detail read, restoring longest-wins and StoredConcernArtifact typing. Fix ALL positive stored reads to lowercase-d via :raw verification (never rely on grep alone): plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 and plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep funnel-text-budget.test.ts + any other :raw Detail reads. PRESERVE capital-D in all negative-casing fixtures: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip; rejection/absence/expect-error stay capital-D. Do NOT add duplicate longest-wins tests (they exist). Add suggestions-casing assertion to reference-review-schema contract test: suggestions[].properties.detail exists lowercase-d AND suggestions[].properties.Detail absent. Do NOT touch triage/infra/pm-edit. Interfaces: step-runner validation -> runtime schemas (lowercase accepted, capital rejected pre-write); aggregateConcerns/mergeConcern carry lowercase longest-wins; contract suites assert schemas + StoredConcernArtifact. Verify: tsc --noEmit clean, TMPDIR=/tmp bun test contracts + longest-wins + epic-saga green, then TMPDIR=/tmp full suite green.",
  "outlineRef": "schema-detail-normalize-v4",
  "milestone": "m0-detail-normalize",
  "wave": 1,
  "scenarioRefs": [
    "m0-detail-normalize:1",
    "m0-detail-normalize:2",
    "m0-detail-normalize:3",
    "m0-detail-normalize:4"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Target
{
  "selectors": [
    "test/contracts/schema-detail-normalize.test.ts"
  ],
  "expectRed": [
    "legacy capital-D stored concerns normalize to lowercase detail.lists a legacy capital-D detail as lowercase detail without the legacy key",
    "legacy capital-D stored concerns normalize to lowercase detail.keeps the legacy capital-D stored detail when a shorter lowercase detail is re-emitted"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/artifacts.ts:313-325",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
]

## Review Feedback

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
- summary (string, required): Concise summary of implementation actions and test results
- target (object, optional): Target test selectors, gate, or custom command for red/green verification
  - Option 1:
    - selectors (array of string, required)
    - expectRed (array of string, required, minItems: 1)
  - Option 2:
    - gate (string, required)
  - Option 3:
    - command (string, required)
    - customTarget (boolean, required)
- evidence (array of string, optional): List of executed checks and verification commands proving correctness
- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
- notes (string, optional): Optional developer notes, implementation observations, or comments
