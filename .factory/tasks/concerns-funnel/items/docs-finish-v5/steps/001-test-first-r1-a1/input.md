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
  "slug": "docs-finish-v5",
  "kind": "dev",
  "title": "Docs and suite consolidation",
  "assignment": "Docs closure over landed behavior; depends on wave-1 schema-detail-normalize-v2 + prompts-dismiss-filter — read their landed code for Detail/dismiss contracts (prod budget ~150 lines docs/yaml). Repo sources ONLY (no orchestration artifacts): all files under docs/adr/ (esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed, adr-autonomous-immediate-halt, adr-epic-config-root-only, adr-funnel-triage-coverage, adr-remarkable-counts-semantics, adr-dismiss-criteria-row), src/core/{concerns,triage,review-policy,prompts}.ts, src/core/flows/{step-runner,iteration,epic-propagation,adrs}.ts, src/cli/status.ts, config/pipeline.default.yaml:359-432. Update docs/ARCHITECTURE.md: S1 row 18 -> implemented + 5 deviations (epic-config root-only, close-up-dismiss via resolutions, saga open-only, immediate-halt, triage-coverage) with no 'Deliberately not hand-built'; new S8.11 per m2 scenarios (store layout, fingerprint/dedup, remarkable aggregation/triage + threshold-exemption, triage contract, routing table, byte caps as code constants, engine-owned concerns/ note; close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, c-only counts, no-retention digest; immediate-halt, triage-coverage limitation incl consult/wave-report/closeup via hydration+fallback and simple-task stays open, epic-config root-only, close-up-dismiss, saga semantics); S3 modules, S5 config sample + root-only fix, S6.2 concerns/ + engine-owned, S8.7 dismiss row, S10 outputs, S11 status, S13 suites; canonical ADR format vs historical notes. README: Concerns & human involvement section with per-task principal/detailed examples + status counts/digest output, plus S5 range update. pipeline.default.yaml: reviewPolicy dismiss auto-append + concerns fragment->agent mapping commentary. DO NOT touch agents/criteria/human-involvement.md. Add test/docs-concerns.test.ts with base-failing sentinels per Decision 022 (each needle names added content; verify fail on base via git show HEAD, pass on branch). Verify: TMPDIR=/tmp typecheck + bun test green.",
  "outlineRef": "docs-finish-v5",
  "milestone": "m2-docs-gates",
  "wave": 2,
  "deps": [
    "prompts-dismiss-filter",
    "schema-detail-normalize-v2"
  ],
  "scenarioRefs": [
    "m2-docs-gates:s1",
    "m2-docs-gates:s2",
    "m2-docs-gates:s3",
    "m2-docs-gates:s4",
    "m2-docs-gates:s5",
    "m2-docs-gates:s6",
    "m2-docs-gates:s7",
    "m2-docs-gates:s8"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/docs/ARCHITECTURE.md:39",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/cli/status.ts:83-105",
    "plugins/software-factory/src/core/fingerprint.ts:20-50"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/docs/ARCHITECTURE.md:39",
  "plugins/software-factory/src/core/flows/iteration.ts:439-485",
  "plugins/software-factory/src/core/steer.ts:59-88",
  "plugins/software-factory/src/core/derive/task.ts:167-205",
  "plugins/software-factory/src/cli/status.ts:83-105",
  "plugins/software-factory/src/core/fingerprint.ts:20-50"
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
