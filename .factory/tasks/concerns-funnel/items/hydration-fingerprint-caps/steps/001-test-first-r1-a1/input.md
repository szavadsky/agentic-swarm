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
  "slug": "hydration-fingerprint-caps",
  "kind": "dev",
  "title": "Unified hydration, caps, fingerprint",
  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
  "outlineRef": "hydration-fingerprint-caps",
  "milestone": "m1-hydration-prompts",
  "wave": 1,
  "scenarioRefs": [
    "m1-hydration-prompts:1",
    "m1-hydration-prompts:2",
    "m1-hydration-prompts:3",
    "m1-hydration-prompts:4",
    "m1-hydration-prompts:6",
    "m1-hydration-prompts:7"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/fingerprint.ts:20-50",
    "plugins/software-factory/src/core/artifacts.ts:313-325"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/fingerprint.ts:20-50",
  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
