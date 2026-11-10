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
  "slug": "transport-byte-stability",
  "kind": "test-only",
  "title": "Transport byte-stability characterization tests",
  "assignment": "Test-only item, no prod code; edits confined to test paths. Add test/harness/transport-stability.test.ts rendering the same agent prompt twice and asserting byte-equality of system-prompt content and generated overlay bytes, while pinning currently unstable argv parts (timestamped/randomized prompt filename) as documented behavior with explicit assertions plus comments. Tests must assume cwd=plugins/software-factory and resolve fixtures repo-relatively; must pass on clean checkout and skip cleanly only if omp binary is absent (no paid turns). Do not stabilize transport; stabilization decision deferred to M7 after spike-cache-key. Acceptance: M2 scenario 3 (byte-equality where stable, instability pinned where not).",
  "outlineRef": "transport-byte-stability",
  "milestone": "m2-measure-stabilize",
  "wave": 2,
  "scenarioRefs": [
    "m2-measure-stabilize:scenario-3"
  ],
  "citations": [
    "docs/factory.v2.md:114-120",
    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
    "plugins/software-factory/src/cli/preflight.ts:365-393"
  ]
}

## Target
tests

## Context & Citations
[
  "docs/factory.v2.md:114-120",
  "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
  "plugins/software-factory/src/cli/preflight.ts:365-393"
]

## Review Feedback


## Open Concerns
- id: c-552344216d
  kind: blocker
  severity: high
  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
  affects:
    - "19.2"
    - wave-merge
- id: c-f972360209
  kind: tech-debt
  severity: medium
  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
  affects:
    - redrive
    - wave-merge


- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.

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
- concerns (array of object, optional): Structured concerns raised during implementation
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- notes (string, optional): Optional developer notes, implementation observations, or comments
