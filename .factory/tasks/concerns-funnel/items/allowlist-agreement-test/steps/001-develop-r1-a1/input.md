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
  "slug": "allowlist-agreement-test",
  "kind": "test-only",
  "title": "Raise-allowlist agreement contract test",
  "assignment": "Test-only, no prod changes. In test/human-involvement-config.test.ts ONLY, delete the local DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) and import DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts so the existing assertion (:154-157) directly compares the code constant vs shipped concerns.raiseAllowlist in config/pipeline.default.yaml. DO NOT create a new test file, a third copy, or touch any prod path. Verify: typecheck + targeted suite (human-involvement-config) green.",
  "outlineRef": "allowlist-agreement-test",
  "milestone": "m2-docs-gates",
  "wave": 1,
  "scenarioRefs": [
    "m2-docs-gates:s7"
  ],
  "citations": [
    "docs/factory.v2.md:89-103"
  ]
}

## Target
tests

## Context & Citations
[
  "docs/factory.v2.md:89-103"
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
