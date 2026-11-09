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
  "slug": "schema-detail-normalize-v2",
  "kind": "dev",
  "title": "Lowercase detail in producer schemas + merge fix",
  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
  "outlineRef": "schema-detail-normalize-v2",
  "milestone": "m0-detail-normalize",
  "wave": 1,
  "scenarioRefs": [
    "m0-detail-normalize:s1",
    "m0-detail-normalize:s2",
    "m0-detail-normalize:s3"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/artifacts.ts:313-325",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
