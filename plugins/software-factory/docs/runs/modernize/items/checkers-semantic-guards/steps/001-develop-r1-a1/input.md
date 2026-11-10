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
  "slug": "checkers-semantic-guards",
  "kind": "test-only",
  "title": "Guard heuristic checker tests with SEMANTIC=0",
  "assignment": "Tests-only, first writer of 2 files wholly (test_suppression_justification_checker.py + test_bare_except_comment_checker.py). Red-test-exempt. Recount heuristic tests at HEAD (40 W9704 + 11 W9738 per pack, verify) then add monkeypatched SEMANTIC=0 guards to all heuristic tests; leave TestSuppressionRerankerPipeline block untouched for M4 second writer (serialized via dep on this item, not parallel). Outcomes pinned. Verify: tests only; guarded tests pass; no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "checkers-semantic-guards",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Threshold deduped plus guards pinned"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_base.py:142-158",
    "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
    "CodingRules.md:230-306"
  ]
}

## Target
tests

## Context & Citations
[
  "src/python_setup_lint/checkers/_base.py:142-158",
  "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
  "CodingRules.md:230-306"
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
