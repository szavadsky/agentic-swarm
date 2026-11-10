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
  "slug": "semantic-threshold-consolidation",
  "kind": "test-only",
  "title": "Consolidate semantic heuristic tables",
  "assignment": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Recount lists at HEAD (30/33 + 50 + 35 per pack, verify actual overlaps) then merge into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched; modules <=500 with no suppressions; fix stale 504-vs-506 header. M4 preserves this deduped table (handoff via deps; M4 rewrites reranker classes only, must not discard dedup). Verify: tests only; parametrized IDs + outcomes identical in report; no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "semantic-threshold-consolidation",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Threshold deduped plus guards pinned"
  ],
  "citations": [
    "tests/checkers/test_semantic_check.py:1-7",
    "tests/checkers/test_semantic_check.py:159-257",
    "tests/checkers/test_semantic_threshold.py:19-25",
    "CodingRules.md:139-159",
    "CodingRules.md:230-306"
  ]
}

## Target
tests

## Context & Citations
[
  "tests/checkers/test_semantic_check.py:1-7",
  "tests/checkers/test_semantic_check.py:159-257",
  "tests/checkers/test_semantic_threshold.py:19-25",
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
