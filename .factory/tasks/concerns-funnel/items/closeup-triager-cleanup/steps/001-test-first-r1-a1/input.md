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
  "slug": "closeup-triager-cleanup",
  "kind": "dev",
  "title": "Close-up triager cleanup + dismiss resolutions",
  "assignment": "Per adr-closeup-no-suggestions-triage: drop wave-close-up/plan-close-up from isTriagerAgent so composed resolveReviewAllowed(p,a,isTriagerAgent(a)) excludes dismiss for close-ups and triager set equals {reviewer,plan-reviewer}. Add dismiss to CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action enums. ingestStepConcerns MUST pre-flight before any mutate: every accept confirm whose pending.action==dismiss requires non-empty pending.note else throw TriageValidationError (step errors; all statuses+pendings preserved, no partial transitions). applyConcernConfirms itself never throws TriageValidationError (avoids concerns<->triage cycle). accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared. Wave fallback never assigns dismiss; kind=blocker stays open. Close-up schemas carry no suggestions[]; re-triage honored solely via concernResolutions + architect concernConfirms + fallback. Tests: review-policy composed triager-set exclusion, closeup-lifecycle dismiss accept (with note) + error (without note, preserved state), closeup dismiss enum contract case. Verify: typecheck + targeted suites + TMPDIR=/tmp full gates.",
  "outlineRef": "closeup-triager-cleanup",
  "milestone": "m1-contracts-consistency",
  "wave": 1,
  "scenarioRefs": [
    "m1-contracts-consistency:3",
    "m1-contracts-consistency:4",
    "m1-contracts-consistency:5",
    "m1-contracts-consistency:6"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/artifacts.ts:313-325",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
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
