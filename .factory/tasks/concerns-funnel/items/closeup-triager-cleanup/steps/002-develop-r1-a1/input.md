# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

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

## Target
{
  "selectors": [
    "test/review-policy.test.ts",
    "test/contracts/concern-schemas.test.ts",
    "test/contracts/concern-artifact-types.test.ts",
    "test/engine/closeup-lifecycle-resolve.test.ts"
  ],
  "expectRed": [
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).restricts the triager set to reviewer and plan-reviewer",
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).composed triager resolution excludes dismiss for close-ups",
    "test/contracts/concern-schemas.test.ts::Concern producer schemas.adds concernResolutions with resolve, carry, propagate, and dismiss to close-up schemas",
    "test/contracts/concern-artifact-types.test.ts::Concern artifact types.stores concern lifecycle metadata including pending resolution and escalation",
    "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle: dismiss resolutions.accept dismisses with the trimmed pending note and clears the proposal",
    "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle: dismiss resolutions.errors before any transition when an accepted dismiss proposal has no note"
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
