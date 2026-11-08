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

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
]

## Review Feedback
Failing check: target-red

Message: Expected red test missing from suite: test/review-policy.test.ts::Review policy resolution (§8.7, §18) > falls back to the canonical builtin dispositions (JUnit has 10 cases; ids: Review policy resolution (§8.7, §18).falls back to the canonical builtin dispositions, Review policy resolution (§8.7, §18).prefers a per-agent policy over default and default over builtin, Review policy resolution (§8.7, §18).reads legacy allowedDispositions as the default alias, Review policy resolution (§8.7, §18).appends dismiss for triagers without duplicates, Review policy resolution (§8.7, §18).never grants dismiss to non-triagers, even when configured, Generated review schema gating (§8.7).offers dismiss only when the resolved policy comes from a triager, FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a dismiss suggestion whose id matches a concern, FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss architect concerns, FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss even when the legacy policy lists it, Item-machine review prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer dispositions when the agent is a triager). Command: cd plugins/software-factory && bun test test/review-policy.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114262035-xr3xv7ttly.xml

Detail:
{
  "command": "cd plugins/software-factory && bun test test/review-policy.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114262035-xr3xv7ttly.xml",
  "junitCaseCount": 10,
  "junitCaseIds": [
    "Review policy resolution (§8.7, §18).falls back to the canonical builtin dispositions",
    "Review policy resolution (§8.7, §18).prefers a per-agent policy over default and default over builtin",
    "Review policy resolution (§8.7, §18).reads legacy allowedDispositions as the default alias",
    "Review policy resolution (§8.7, §18).appends dismiss for triagers without duplicates",
    "Review policy resolution (§8.7, §18).never grants dismiss to non-triagers, even when configured",
    "Generated review schema gating (§8.7).offers dismiss only when the resolved policy comes from a triager",
    "FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a dismiss suggestion whose id matches a concern",
    "FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss architect concerns",
    "FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss even when the legacy policy lists it",
    "Item-machine review prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer dispositions when the agent is a triager"
  ],
  "junitTruncated": false,
  "collected": true,
  "collectionErrors": []
}

Output tail:
bun test v1.4.3 (c6da4a4d3)


test/review-policy.test.ts:
49 |   return properties.suggestions.items.properties.disposition.enum;
50 | }
51 | 
52 | describe("Review policy resolution (§8.7, §18)", () => {
53 |   it("falls back to the canonical builtin dispositions", () => {
54 |     expect(resolveReviewAllowed(pipelineWith(), "reviewer", false)).toEqual(
                                                                         ^
error: expect(received).toEqual(expected)

- [
-   "fix",
-   "optional",
-   "architect",
-   "human-awareness",
-   "human-async",
- ]
+ []

- Expected  - 7
+ Received  + 1

      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/test/review-policy.test.ts:54:69)
(fail) Review policy resolution (§8.7, §18) > falls back to the canonical builtin dispositions [0.58ms]
63 |     const pipeline = pipelineWith({
64 |       default: ["fix", "optional"],
65 |       reviewer: ["architect"],
66 |     });
67 | 
68 |     expect(resolveReviewAllowed(pipeline, "reviewer", false)).toEqual([
                                                                   ^
error: expect(received).toEqual(expected)

- [
-   "architect",
- ]
+ []

- Expected  - 3
+ Received  + 1

      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-fun
... [truncated 7138 bytes] ...
(fail) Item-machine review prompt uses the canonical resolver (§8.7) > renders dismiss in the reviewer dispositions when the agent is a triager [165.40ms]

 0 pass
 10 fail
 11 expect() calls
Ran 10 tests across 1 file. [678.00ms]

Budget: 10 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

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
