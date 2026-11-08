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
  "slug": "epic-saga-propagate",
  "kind": "dev",
  "title": "Epic to saga propagation",
  "assignment": "Requires hydration-fingerprint-caps (saga hydration must show epic copies). Own engine.runChildTask -> propagateEpicConcerns per adr-epic-push-condensed; spike-saga-commit/Decision 002 authoritative; no ingest/confirm logic. Call propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt,epic}) after runIteration before child-closeup write, every status: push open+routed (skip dismissed); c-* copies get summary [epic] <child summary>, id=recomputed fingerprint, status open, source {epic, record epic:<epic>/<child-record>}; child rm-* propagate as parent rm-* with chosen prefixed [epic], id recomputed, why condensed. Condense UTF-8 char-safe: detail<=120B verbatim; else cut to min(500B,half) on char boundary (strictly shorter). Writes use aggregate opts {commit:false}; parent-side propagate+closeup+add+commit serialized under KeyedMutex(parentWt) (never repo.writeLock); existing single commit covers copies+closeup; restart-idempotent merge preserving parent triage. Forward childTaskDir/steer/tousertoreview entries with blocks.length>0 to parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig>, blocks mapped (child item slugs->epic; child-task-level->parent task slug; default [epic]). No back-sync (child complete, forwarded parent-owned). Copies open/unrouted -> no parent halt; halt only via forwarded questions. Behavior tests: one condensed copy incl rm-*, dismissed local, tiny-detail verbatim, 800B detail <=500B strictly shorter char-safe, saga architect concernsYaml contains epic id+summary, restart no dup, forwarded q-epic-* with mapped blocks, no parent exit-10 from copies. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~190 prod lines.",
  "outlineRef": "epic-saga-propagate",
  "milestone": "m2-contracts-epic",
  "wave": 2,
  "deps": [
    "hydration-fingerprint-caps"
  ],
  "scenarioRefs": [
    "m2-contracts-epic:2",
    "m2-contracts-epic:3"
  ],
  "citations": [
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/fingerprint.ts:20-50",
    "docs/factory.v2.md:89-103"
  ],
  "escalate": true
}

## Context & Citations
[
  "plugins/software-factory/src/core/steer.ts:59-88",
  "plugins/software-factory/src/core/fingerprint.ts:20-50",
  "docs/factory.v2.md:89-103"
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
