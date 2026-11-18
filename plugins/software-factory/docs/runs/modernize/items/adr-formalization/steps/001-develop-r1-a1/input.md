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
  "slug": "adr-formalization",
  "kind": "no-behavior",
  "title": "Formalize ADRs 009-012 and reconcile stale ADRs",
  "assignment": "Root-owned ADR lifecycle, docs only (no-behavior: tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). Overwrite docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences matching plan (009 no-go-gated infra-first, 010 spike contracts + PYTEST_CURRENT_TEST-only dotted path with loader test, 011 validated-map decomposition with AGENTS split + single-writer table + shift handoff); create docs/adr/ADR-012.md for register() missing-beartype exemption (PyLinter circular import, no @beartype, mixin misc attempt-with-fallback); add staleness notes to ADR-001/005/006; add locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify 12 ADR files each carry Context/Decision/Consequences or explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment). Covers TD3-A1 root-owned rows.",
  "outlineRef": "adr-formalization",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Epic kickoff gated on validated artifacts"
  ],
  "citations": [
    "docs/semantic-justification.md:5-14",
    "AGENTS.md:79-85",
    "pyproject.toml:28-31"
  ]
}

## Target
tests

## Context & Citations
[
  "docs/semantic-justification.md:5-14",
  "AGENTS.md:79-85",
  "pyproject.toml:28-31"
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
