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
  "slug": "closeup-lifecycle-resolve",
  "kind": "dev",
  "title": "Close-up lifecycle and unblock",
  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
  "outlineRef": "closeup-lifecycle-resolve",
  "milestone": "m3-routing-lifecycle",
  "wave": 3,
  "deps": [
    "contracts-drift-fix",
    "epic-saga-propagate",
    "human-router-severity"
  ],
  "scenarioRefs": [
    "m3-routing-lifecycle:8",
    "m3-routing-lifecycle:9",
    "m3-routing-lifecycle:10"
  ],
  "citations": [
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
  ],
  "escalate": true
}

## Context & Citations
[
  "plugins/software-factory/src/core/derive/task.ts:167-205",
  "plugins/software-factory/src/core/steer.ts:59-88",
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
