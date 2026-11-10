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
  "slug": "target-green-ratchet-fix",
  "kind": "dev",
  "title": "Apply baseline ratchet to target-green gate targets",
  "assignment": "Dev fix, tests-first, small prod diff (~60 lines hint) in plugins/software-factory/src/core/checks/runner.ts checkTargetGreen gate-target branch (lines 644-676): apply the same baseline ratchet runGates uses. When the gate command fails, load gates-baseline.yaml, derive the failing-test set (with JUnit re-derivation parity where runGates does it), and PASS when failures are a subset of baseline; otherwise FAIL with actionable evidence (new failing tests + command + output, same evidence shape as gate failures). No behavior change when baseline is absent/empty or target is fully green. Behavior tests-first with tmp-repo fixtures (cwd=plugins/software-factory, no network): (1) gate target failing ONLY on baseline-listed tests passes via ratchet; (2) gate target with one NEW failing test outside baseline still fails naming the new test; (3) fully green gate target passes without invoking ratchet. Record selector targets (new spec selector) — NEVER a gate target — so this item itself merges cleanly on the red baseline (td-baseline-disk). Verify the new spec file is green.",
  "outlineRef": "target-green-ratchet-fix",
  "milestone": "m1-omp-de-risk",
  "wave": 3
}

## Context & Citations
[]

## Review Feedback


## Open Concerns
- id: rm-02fe59eb65
  kind: remarkable
  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
- id: rm-61c10c8318
  kind: remarkable
  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
- id: rm-63922d9635
  kind: remarkable
  summary: Configure omp via a generated YAML overlay per turn


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
