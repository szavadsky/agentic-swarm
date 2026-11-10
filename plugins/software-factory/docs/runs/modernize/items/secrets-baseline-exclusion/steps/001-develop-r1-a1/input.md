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
  "slug": "secrets-baseline-exclusion",
  "kind": "no-behavior",
  "title": "Add .factory/ exclusion to .secrets.baseline",
  "assignment": "Land operator-approved .factory/ exclusion (no-behavior: config-only change with no prod behavior change; tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). First pre-validate filters_used schema against installed detect-secrets version (should_exclude_file signature; list-pattern vs scalar form) and use version-correct form. Then insert ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. No other baseline edits. Verify on clean checkout: full git-ls-files detect-secrets scan exits 0 while planted control secret still exits 1 (reviewer-replicated procedure). Keep residual-risk caveat in report (write-time redaction + periodic unfiltered audits). M1 acceptance cites mechanism + pinned HEAD, not finding counts. Covers TD3-I2.",
  "outlineRef": "secrets-baseline-exclusion",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Secrets gate green by mechanism"
  ],
  "citations": [
    "lint.baseline:1-1",
    "AGENTS.md:121-139"
  ]
}

## Target
tests

## Context & Citations
[
  "lint.baseline:1-1",
  "AGENTS.md:121-139"
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
