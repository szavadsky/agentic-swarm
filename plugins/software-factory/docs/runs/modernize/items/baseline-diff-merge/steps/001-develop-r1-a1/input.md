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
  "slug": "baseline-diff-merge",
  "kind": "test-only",
  "title": "Merge baseline-diff test overlap",
  "assignment": "Tests-only (tests/runner/test_baseline_diff.py + test_baseline_diff_edge.py + test_baseline_diff_parsers.py ONLY, 249+308+486 per pack, verify at HEAD). Red-test-exempt. Merge overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Shim-removal serializes after this item (applies onto merged shape). Verify: tests only; no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "baseline-diff-merge",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Baseline merged with survivors"
  ],
  "citations": [
    "CodingRules.md:139-159",
    "CodingRules.md:230-306"
  ]
}

## Target
tests

## Context & Citations
[
  "CodingRules.md:139-159",
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
