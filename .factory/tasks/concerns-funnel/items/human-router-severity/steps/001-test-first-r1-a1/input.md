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
  "slug": "human-router-severity",
  "kind": "dev",
  "title": "Human router and severity policy",
  "assignment": "Requires hydration-fingerprint-caps (consumes hydrateStepConcerns/listHydratedConcerns sets). Own triage routeHumanDisposition + ingest gates + derive threading per adr-human-router-single + adr-severity-policy-active + adr-hydrated-sets rm rules. Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (q-concern-/q-escalated-), never blocking/halting; dedup by existence. item-machine raw path skips ALL concern-id human-* (no double-write). Severity: gate key source.agent (never fragment): developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, architect covers architect-*; shipped 8-agent allowlist already complete — no entries added, commentary documents fragment->agent mapping. Effective defaults medium/high (code fallback identical). Order: schema validation first, then ingest allowlist skip+journal with step ok. Digest iff severity>=minDigest; blocks iff severity>=minBlocking else downgrade to digest (stop loses exit-10); rm-* exempt. Own derive: collectRoutedBlockers(taskDir,minBlocking) blocks only kind=blocker+routed+severity>=minBlocking; deriveTaskState/withRoutedBlocking thread pipeline.concerns.minBlockingSeverity (fallback high); debt predicate unchanged. Explicit fixture severities keep suite green. Behavior tests: plan/close-up routing, routed architect visible in next architect hydration, dismiss keeps file with dismissReason and no effects, rm digest blocks=[] never halts, async no exit-10 vs blocking stop single q + exit-10, allowlist skip+journal+ok, downgrade + derive unblocked, no double-write, low blocker not blocked but hydrated/digested. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~280 prod lines.",
  "outlineRef": "human-router-severity",
  "milestone": "m3-routing-lifecycle",
  "wave": 2,
  "deps": [
    "hydration-fingerprint-caps"
  ],
  "scenarioRefs": [
    "m3-routing-lifecycle:1",
    "m3-routing-lifecycle:2",
    "m3-routing-lifecycle:3",
    "m3-routing-lifecycle:4",
    "m3-routing-lifecycle:5",
    "m3-routing-lifecycle:6",
    "m3-routing-lifecycle:7"
  ],
  "citations": [
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
  ],
  "escalate": true
}

## Context & Citations
[
  "plugins/software-factory/src/core/steer.ts:59-88",
  "plugins/software-factory/src/core/derive/task.ts:167-205",
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
