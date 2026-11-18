# Step: Test-First

## Goal
Author automated tests specifying the required behavior changes BEFORE writing production code.

## Rules
- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
- Target declaration in yield:
  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
- Output: yield structured output per `developer-output.schema.json`.

## Assignment
{
  "slug": "usage-cache-tokens",
  "kind": "dev",
  "title": "Cache-token usage plumbing end to end",
  "assignment": "Dev item, tests-first, prod budget ~180 lines. Extend Usage/StepUsage types with optional cacheReadTokens/cacheWriteTokens/totalTokens plus cost breakdown {costUsd?, cost?: {input?, output?, cacheRead?, cacheWrite?}}; parse them in the NDJSON usage parser tolerating absent keys; persist in step meta records; aggregate with zero-defaults in budget/derive helpers; surface cache columns in status output. All new fields optional; historical records without cache keys remain valid (missing->0, no migration); schemas gain optional properties only. Behavior tests (write failing first): fixture NDJSON turn carrying usage.cacheRead/cacheWrite and cost sub-fields parses and persists; old-record backward compat; budget sums include cache with zero-defaults; status shows cache columns. Constraints: cwd=plugins/software-factory, fixtures repo-relative; baseline red disk-space test accepted as-is, ratchet on no NEW failures. Acceptance: M2 scenarios 1-2 (parse/persist/aggregate + backward compat).",
  "outlineRef": "usage-cache-tokens",
  "milestone": "m2-measure-stabilize",
  "wave": 2,
  "scenarioRefs": [
    "m2-measure-stabilize:scenario-1",
    "m2-measure-stabilize:scenario-2"
  ],
  "citations": [
    "docs/factory.v2.md:114-120",
    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
    "plugins/software-factory/src/cli/status.ts:24-70"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:114-120",
  "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
  "plugins/software-factory/src/cli/status.ts:24-70"
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
