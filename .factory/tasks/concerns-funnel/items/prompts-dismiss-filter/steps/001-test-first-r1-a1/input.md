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
  "slug": "prompts-dismiss-filter",
  "kind": "dev",
  "title": "Dismiss criteria row + prompt filtering",
  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
  "outlineRef": "prompts-dismiss-filter",
  "milestone": "m1-dismiss-contract",
  "wave": 1,
  "scenarioRefs": [
    "m1-dismiss-contract:s1",
    "m1-dismiss-contract:s2",
    "m1-dismiss-contract:s3",
    "m1-dismiss-contract:s4"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
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
