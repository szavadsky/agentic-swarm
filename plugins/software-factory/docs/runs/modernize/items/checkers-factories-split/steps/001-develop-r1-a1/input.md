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
  "slug": "checkers-factories-split",
  "kind": "test-only",
  "title": "Split checkers factories by domain",
  "assignment": "Tests-only (tests/checkers/_factories*.py + importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Recount importers at HEAD via grep (from tests.checkers._factories import|from ._factories import; reviewer names 8 families: beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer — item reports actual paths, 8 vs 9 resolved by recount). Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate all importers; delete unused helpers with survivor notes; touched files toward test naming + no_external_api/with_real_api markers. Verify: tests only; no new failures vs M1 table (exits/counts cited); golden hash-equal; format-clean; grep zero too-many-lines in split.",
  "outlineRef": "checkers-factories-split",
  "milestone": "M2",
  "wave": 2,
  "scenarioRefs": [
    "M2: Factories split without behavior change"
  ],
  "citations": [
    "CodingRules.md:139-159",
    "CodingRules.md:230-306",
    "CodingRules.md:90-107"
  ]
}

## Target
tests

## Context & Citations
[
  "CodingRules.md:139-159",
  "CodingRules.md:230-306",
  "CodingRules.md:90-107"
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
