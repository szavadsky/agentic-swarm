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
  "slug": "concerns-contracts-policy",
  "kind": "dev",
  "title": "Canonical review-policy resolver",
  "assignment": "Resolver only (split 3/3, decision 001; deps: types). New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy reviewPolicy.allowedDispositions read-alias for default; append dismiss iff isTriager. Wire single resolver into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, and generateReviewSchema (dismiss enum only for triagers; QA never). Verify: typecheck + FakeHarness review-step behavior (reviewer accepts dismiss id-match; QA rejects dismiss). Prod budget <=100 lines. Run TMPDIR=/tmp bun test + typecheck.",
  "outlineRef": "concerns-contracts-policy",
  "milestone": "m1-contracts-aggregate",
  "wave": 3,
  "deps": [
    "concerns-contracts-types"
  ],
  "scenarioRefs": [
    "m1-contracts-aggregate:s7"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
  ]
}

## Target
{
  "selectors": [
    "test/review-policy.test.ts"
  ],
  "expectRed": [
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).falls back to the canonical builtin dispositions",
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).prefers a per-agent policy over default and default over builtin",
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).reads legacy allowedDispositions as the default alias",
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).appends dismiss for triagers without duplicates",
    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).never grants dismiss to non-triagers, even when configured",
    "test/review-policy.test.ts::Generated review schema gating (§8.7).offers dismiss only when the resolved policy comes from a triager",
    "test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a dismiss suggestion whose id matches a concern",
    "test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss architect concerns",
    "test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss even when the legacy policy lists it",
    "test/review-policy.test.ts::Item-machine review prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer dispositions when the agent is a triager"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
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
