# Step: QA

## Goal
Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.

## Rules
- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
- Story kind validation:
  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

## Dispositions Criteria
Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
Use ONLY these dispositions; any other disposition value fails validation.
# Review Suggestion Dispositions

Criteria for assigning disposition to review findings:

| Disposition | When to Assign | Engine Action |
|---|---|---|
| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |

## Rules
- Defect requiring code change MUST be `fix`.
- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
- Do NOT use `human-async` when repo context or architecture docs provide the answer.

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

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..21f799e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,151 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 1 new prod stubs with 10 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/review-policy.test.ts
+      newProdFiles:
+        - plugins/software-factory/src/core/review-policy.ts
+      stubProdLines: 10
+  - id: target-red
+    status: fail
+    message: "Expected red test missing from suite:
+      test/review-policy.test.ts::Review policy resolution (§8.7, §18) > falls
+      back to the canonical builtin dispositions (JUnit has 10 cases; ids:
+      Review policy resolution (§8.7, §18).falls back to the canonical builtin
+      dispositions, Review policy resolution (§8.7, §18).prefers a per-agent
+      policy over default and default over builtin, Review policy resolution
+      (§8.7, §18).reads legacy allowedDispositions as the default alias, Review
+      policy resolution (§8.7, §18).appends dismiss for triagers without
+      duplicates, Review policy resolution (§8.7, §18).never grants dismiss to
+      non-triagers, even when configured, Generated review schema gating
+      (§8.7).offers dismiss only when the resolved policy comes from a triager,
+      FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a
+      dismiss suggestion whose id matches a concern, FakeHarness review-step
+      dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss
+      architect concerns, FakeHarness review-step dispositions (§8.7, §18).qa
+      rejects dismiss even when the legacy policy lists it, Item-machine review
+      prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer
+      dispositions when the agent is a triager). Command: cd
+      plugins/software-factory && bun test test/review-policy.test.ts
+      --reporter=junit
+      --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-ru\
+      ntime/tmp/junit-1794114262035-xr3xv7ttly.xml"
+    details:
+      command: cd plugins/software-factory && bun test test/review-policy.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114262035-xr3xv7ttly.xml
+      junitCaseCount: 10
+      junitCaseIds:
+        - Review policy resolution (§8.7, §18).falls back to the canonical
+          builtin dispositions
+        - Review policy resolution (§8.7, §18).prefers a per-agent policy over
+          default and default over builtin
+        - Review policy resolution (§8.7, §18).reads legacy allowedDispositions
+          as the default alias
+        - Review policy resolution (§8.7, §18).appends dismiss for triagers
+          without duplicates
+        - Review policy resolution (§8.7, §18).never grants dismiss to
+          non-triagers, even when configured
+        - Generated review schema gating (§8.7).offers dismiss only when the
+          resolved policy comes from a triager
+        - FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a
+          dismiss suggestion whose id matches a concern
+        - FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a
+          triager and may dismiss architect concerns
+        - FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss
+          even when the legacy policy lists it
+        - Item-machine review prompt uses the canonical resolver (§8.7).renders
+          dismiss in the reviewer dispositions when the agent is a triager
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+    output: >-
+      bun test v1.4.3 (c6da4a4d3)
+
+
+
+      test/review-policy.test.ts:
+
+      49 |   return properties.suggestions.items.properties.disposition.enum;
+
+      50 | }
+
+      51 | 
+
+      52 | describe("Review policy resolution (§8.7, §18)", () => {
+
+      53 |   it("falls back to the canonical builtin dispositions", () => {
+
+      54 |     expect(resolveReviewAllowed(pipelineWith(), "reviewer",
+      false)).toEqual(
+                                                                               ^
+      error: expect(received).toEqual(expected)
+
+
+      - [
+
+      -   "fix",
+
+      -   "optional",
+
+      -   "architect",
+
+      -   "human-awareness",
+
+      -   "human-async",
+
+      - ]
+
+      + []
+
+
+      - Expected  - 7
+
+      + Received  + 1
+
+            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/test/review-policy.test.ts:54:69)
+      (fail) Review policy resolution (§8.7, §18) > falls back to the canonical
+      builtin dispositions [0.58ms]
+
+      63 |     const pipeline = pipelineWith({
+
+      64 |       default: ["fix", "optional"],
+
+      65 |       reviewer: ["architect"],
+
+      66 |     });
+
+      67 | 
+
+      68 |     expect(resolveReviewAllowed(pipeline, "reviewer",
+      false)).toEqual([
+                                                                         ^
+      error: expect(received).toEqual(expected)
+
+
+      - [
+
+      -   "architect",
+
+      - ]
+
+      + []
+
+
+      - Expected  - 3
+
+      + Received  + 1
+
+            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-fun
+      ... [truncated 7138 bytes] ...
+
+      (fail) Item-machine review prompt uses the canonical resolver (§8.7) >
+      renders dismiss in the reviewer dispositions when the agent is a triager
+      [165.40ms]
+
+       0 pass
+       10 fail
+       11 expect() calls
+      Ran 10 tests across 1 file. [678.00ms]
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..4f4e765
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,66 @@
+# Step: Test-First
+
+## Goal
+Author automated tests specifying the required behavior changes BEFORE writing production code.
+
+## Rules
+- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+- Target declaration in yield:
+  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+- Output: yield structured output per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "concerns-contracts-policy",
+  "kind": "dev",
+  "title": "Canonical review-policy resolver",
+  "assignment": "Resolver only (split 3/3, decision 001; deps: types). New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy reviewPolicy.allowedDispositions read-alias for default; append dismiss iff isTriager. Wire single resolver into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, and generateReviewSchema (dismiss enum only for triagers; QA never). Verify: typecheck + FakeHarness review-step behavior (reviewer accepts dismiss id-match; QA rejects dismiss). Prod budget <=100 lines. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-policy",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+]
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..4b16d19
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: test-first
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: rejected
+startedAt: 2026-11-08T04:54:17.504Z
+session: 01a1b981-dc09-74dd-841e-5f94445f8fa5
+endedAt: 2026-11-08T05:04:22.855Z
+usage:
+  inputTokens: 123092
+  outputTokens: 37976
+  costUsd: 0.051609
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T04-54-17-865Z_01a1b981-dc09-74dd-841e-5f94445f8fa5.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..a65e95a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,63 @@
+status: ok
+summary: Authored test/review-policy.test.ts with 10 specs covering the
+  canonical resolver (precedence per-agent > default > legacy
+  allowedDispositions > builtin, dismiss append/dedup only for triagers, QA
+  never), generated-schema dismiss gating, FakeHarness review-step behavior
+  (reviewer/plan-reviewer accept a dismiss suggestion id-matched to a concern;
+  QA rejects dismiss even when the legacy policy lists it), and item-machine
+  review promptVars rendering dismiss for a triager. Added only a new 8-line
+  interface stub src/core/review-policy.ts so the new tests import/typecheck;
+  existing production code is untouched. All 10 specs fail red with assertion
+  errors on the current implementation.
+target:
+  selectors:
+    - test/review-policy.test.ts
+  expectRed:
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18) > falls
+      back to the canonical builtin dispositions
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18) > prefers
+      a per-agent policy over default and default over builtin
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18) > reads
+      legacy allowedDispositions as the default alias
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18) > appends
+      dismiss for triagers without duplicates
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18) > never
+      grants dismiss to non-triagers, even when configured
+    - test/review-policy.test.ts::Generated review schema gating (§8.7) > offers
+      dismiss only when the resolved policy comes from a triager
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18) > reviewer accepts a dismiss suggestion whose id matches a concern
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18) > plan-reviewer is a triager and may dismiss architect concerns
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18) > qa rejects dismiss even when the legacy policy lists it
+    - test/review-policy.test.ts::Item-machine review prompt uses the canonical
+      resolver (§8.7) > renders dismiss in the reviewer dispositions when the
+      agent is a triager
+evidence:
+  - "`TMPDIR=/tmp bun test test/review-policy.test.ts` -> 0 pass, 10 fail; every
+    failure is an assertion error (expect(...).toEqual/toContain/toBe), no
+    import/syntax/compile errors."
+  - Bun JUnit reporter (`--reporter=junit
+    --reporter-outfile=/tmp/review-policy-junit.xml`) confirms all 10 testcases
+    execute and fail with AssertionError under the file/describe suites.
+  - "`bun run typecheck` -> exit 0 with the new interface stub (tests compile;
+    new modules collect)."
+  - "`git status --short` shows only two new files: src/core/review-policy.ts
+    (8-line test-first stub, within the 40-line stub budget) and
+    test/review-policy.test.ts; no existing production file modified."
+concerns:
+  - The iteration plan-review prompt wiring is not directly exercised by an
+    end-to-end runIteration test; its schema path is covered via the
+    plan-reviewer FakeHarness step test, and the promptVar call site will be a
+    one-line resolver substitution verified in the develop step.
+  - QA-never enforcement is asserted at resolver, generated-schema, and
+    runAgentStep levels; if a config explicitly grants dismiss to a non-triager
+    the resolver is expected to strip it (tested).
+  - generateReviewSchema keeps its one-argument signature; gating flows from the
+    resolver's triager-aware disposition list rather than a second schema flag.
+notes: "Test-first red target: all 10 specs in test/review-policy.test.ts fail
+  on current production. The stub `resolveReviewAllowed` deliberately returns []
+  so failures are assertion-based, not import/compile-based. Next step:
+  implement the resolver and wire item-machine promptVars, step-runner schema
+  path, and iteration plan-review prompt+schema."
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/checks.yaml
new file mode 100644
index 0000000..43cf7ff
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/checks.yaml
@@ -0,0 +1,42 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 1 new prod stubs with 10 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/review-policy.test.ts
+      newProdFiles:
+        - plugins/software-factory/src/core/review-policy.ts
+      stubProdLines: 10
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 10 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test test/review-policy.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114998665-my9mbzuj14.xml
+      junitCaseCount: 10
+      junitCaseIds:
+        - Review policy resolution (§8.7, §18).falls back to the canonical
+          builtin dispositions
+        - Review policy resolution (§8.7, §18).prefers a per-agent policy over
+          default and default over builtin
+        - Review policy resolution (§8.7, §18).reads legacy allowedDispositions
+          as the default alias
+        - Review policy resolution (§8.7, §18).appends dismiss for triagers
+          without duplicates
+        - Review policy resolution (§8.7, §18).never grants dismiss to
+          non-triagers, even when configured
+        - Generated review schema gating (§8.7).offers dismiss only when the
+          resolved policy comes from a triager
+        - FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a
+          dismiss suggestion whose id matches a concern
+        - FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a
+          triager and may dismiss architect concerns
+        - FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss
+          even when the legacy policy lists it
+        - Item-machine review prompt uses the canonical resolver (§8.7).renders
+          dismiss in the reviewer dispositions when the agent is a triager
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/input.md
new file mode 100644
index 0000000..945ffe8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/input.md
@@ -0,0 +1,148 @@
+# Step: Test-First
+
+## Goal
+Author automated tests specifying the required behavior changes BEFORE writing production code.
+
+## Rules
+- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+- Target declaration in yield:
+  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+- Output: yield structured output per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "concerns-contracts-policy",
+  "kind": "dev",
+  "title": "Canonical review-policy resolver",
+  "assignment": "Resolver only (split 3/3, decision 001; deps: types). New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy reviewPolicy.allowedDispositions read-alias for default; append dismiss iff isTriager. Wire single resolver into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, and generateReviewSchema (dismiss enum only for triagers; QA never). Verify: typecheck + FakeHarness review-step behavior (reviewer accepts dismiss id-match; QA rejects dismiss). Prod budget <=100 lines. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-policy",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+]
+
+## Review Feedback
+Failing check: target-red
+
+Message: Expected red test missing from suite: test/review-policy.test.ts::Review policy resolution (§8.7, §18) > falls back to the canonical builtin dispositions (JUnit has 10 cases; ids: Review policy resolution (§8.7, §18).falls back to the canonical builtin dispositions, Review policy resolution (§8.7, §18).prefers a per-agent policy over default and default over builtin, Review policy resolution (§8.7, §18).reads legacy allowedDispositions as the default alias, Review policy resolution (§8.7, §18).appends dismiss for triagers without duplicates, Review policy resolution (§8.7, §18).never grants dismiss to non-triagers, even when configured, Generated review schema gating (§8.7).offers dismiss only when the resolved policy comes from a triager, FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a dismiss suggestion whose id matches a concern, FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss architect concerns, FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss even when the legacy policy lists it, Item-machine review prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer dispositions when the agent is a triager). Command: cd plugins/software-factory && bun test test/review-policy.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114262035-xr3xv7ttly.xml
+
+Detail:
+{
+  "command": "cd plugins/software-factory && bun test test/review-policy.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114262035-xr3xv7ttly.xml",
+  "junitCaseCount": 10,
+  "junitCaseIds": [
+    "Review policy resolution (§8.7, §18).falls back to the canonical builtin dispositions",
+    "Review policy resolution (§8.7, §18).prefers a per-agent policy over default and default over builtin",
+    "Review policy resolution (§8.7, §18).reads legacy allowedDispositions as the default alias",
+    "Review policy resolution (§8.7, §18).appends dismiss for triagers without duplicates",
+    "Review policy resolution (§8.7, §18).never grants dismiss to non-triagers, even when configured",
+    "Generated review schema gating (§8.7).offers dismiss only when the resolved policy comes from a triager",
+    "FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a dismiss suggestion whose id matches a concern",
+    "FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss architect concerns",
+    "FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss even when the legacy policy lists it",
+    "Item-machine review prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer dispositions when the agent is a triager"
+  ],
+  "junitTruncated": false,
+  "collected": true,
+  "collectionErrors": []
+}
+
+Output tail:
+bun test v1.4.3 (c6da4a4d3)
+
+
+test/review-policy.test.ts:
+49 |   return properties.suggestions.items.properties.disposition.enum;
+50 | }
+51 | 
+52 | describe("Review policy resolution (§8.7, §18)", () => {
+53 |   it("falls back to the canonical builtin dispositions", () => {
+54 |     expect(resolveReviewAllowed(pipelineWith(), "reviewer", false)).toEqual(
+                                                                         ^
+error: expect(received).toEqual(expected)
+
+- [
+-   "fix",
+-   "optional",
+-   "architect",
+-   "human-awareness",
+-   "human-async",
+- ]
++ []
+
+- Expected  - 7
++ Received  + 1
+
+      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/test/review-policy.test.ts:54:69)
+(fail) Review policy resolution (§8.7, §18) > falls back to the canonical builtin dispositions [0.58ms]
+63 |     const pipeline = pipelineWith({
+64 |       default: ["fix", "optional"],
+65 |       reviewer: ["architect"],
+66 |     });
+67 | 
+68 |     expect(resolveReviewAllowed(pipeline, "reviewer", false)).toEqual([
+                                                                   ^
+error: expect(received).toEqual(expected)
+
+- [
+-   "architect",
+- ]
++ []
+
+- Expected  - 3
++ Received  + 1
+
+      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-fun
+... [truncated 7138 bytes] ...
+(fail) Item-machine review prompt uses the canonical resolver (§8.7) > renders dismiss in the reviewer dispositions when the agent is a triager [165.40ms]
+
+ 0 pass
+ 10 fail
+ 11 expect() calls
+Ran 10 tests across 1 file. [678.00ms]
+
+Budget: 10 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
+
+Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/meta.yaml
new file mode 100644
index 0000000..ff8542e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: test-first
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T05:14:43.286Z
+session: 01a1b994-90e6-7564-a920-bc94d854a7ea
+endedAt: 2026-11-08T05:16:39.123Z
+usage:
+  inputTokens: 29682
+  outputTokens: 9767
+  costUsd: 0.011129
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-14-43-814Z_01a1b994-90e6-7564-a920-bc94d854a7ea.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/output.yaml
new file mode 100644
index 0000000..122164e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/002-test-first-r1-a2/output.yaml
@@ -0,0 +1,58 @@
+status: ok
+summary: "Re-declared the target-red ids in Bun's JUnit node-id form. The test
+  suite itself was already correct: `test/review-policy.test.ts` contains 10 red
+  tests against the `resolveReviewAllowed` stub (returns []), while typecheck
+  passes. The prior rejection was an id-format mismatch — Bun's JUnit joins the
+  describe path and test name with `.`, so the `describe > test` form was not
+  matched by the engine's normalization. All 10 corrected ids now resolve to
+  failing (assertion) JUnit cases."
+target:
+  selectors:
+    - test/review-policy.test.ts
+  expectRed:
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).falls
+      back to the canonical builtin dispositions
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).prefers a
+      per-agent policy over default and default over builtin
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).reads
+      legacy allowedDispositions as the default alias
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).appends
+      dismiss for triagers without duplicates
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).never
+      grants dismiss to non-triagers, even when configured
+    - test/review-policy.test.ts::Generated review schema gating (§8.7).offers
+      dismiss only when the resolved policy comes from a triager
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18).reviewer accepts a dismiss suggestion whose id matches a concern
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18).plan-reviewer is a triager and may dismiss architect concerns
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18).qa rejects dismiss even when the legacy policy lists it
+    - test/review-policy.test.ts::Item-machine review prompt uses the canonical
+      resolver (§8.7).renders dismiss in the reviewer dispositions when the
+      agent is a triager
+evidence:
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/review-policy.test.ts --reporter=junit
+    --reporter-outfile=/tmp/junit-review-policy.xml: exit 1, 0 pass / 10 fail,
+    all failures are assertion failures (no collection or import errors)"
+  - "Parsed the generated JUnit XML with the repo's own `parseJunit`
+    (src/core/checks/junit.ts): 10 test cases, collected=true; ids are
+    `<describe path>.<test name>`"
+  - "Applied the repo's target-red matcher normalization
+    (src/core/checks/runner.ts `normaliseCaseId` + `findMatchingCase`) to all 10
+    declared expectRed ids: 10/10 matched, each with status `fail`"
+  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck (`tsc
+    --noEmit`): exit 0"
+  - "git status --short: clean; no production code changed in this attempt
+    beyond the pre-existing 10-line `resolveReviewAllowed` stub"
+concerns:
+  - Bun's JUnit reporter separates describe/test with `.` (not ` > `), so target
+    ids must use `file::Describe.Test` form; the engine's `normaliseCaseId` only
+    maps `::` and `/` to dots, leaving a literal ` > ` unmatched.
+notes: "Test-first scope only: the 10 cases already specify precedence
+  (per-agent > default > builtin), legacy allowedDispositions alias,
+  triager-only dismiss append/dedup, generated schema gating, FakeHarness
+  step-runner acceptance/rejection, and item-machine prompt dispositions.
+  Production behavior remains unimplemented (stub returns []), which is the
+  intended red state."
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..9953541
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/checks.yaml
@@ -0,0 +1,129 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 3746
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 160978
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-y6fVFg/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1829244
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1829244
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1829244
+
+          test/engine/head-guard.test.ts:
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+          127 |   const stderr = res.stderr;
+          128 |   const code = res.code ?? 0;
+          129 | 
+          130 |   if (code !== 0 && !opts?.allowFail) {
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/src/core/mutex.ts:39:20)
+          (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [57.48ms]
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+          127 |   const stderr = res.stderr;
+          128 |   const code = res.code ?? 0;
+          129 | 
+          130 |   if (code !== 0 && !opts?.allowFail) {
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-policy/plugins/software-factory/src/core/mutex.ts:39:20)
+          (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [50.80ms]
+
+           295 pass
+           2 skip
+           2 fail
+           1167 expect() calls
+          Ran 299 tests across 53 files. [83.15s]
+        failingTests:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: cd plugins/software-factory && bun test test/review-policy.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794116077437-w8acnlnuom.xml
+      junitCaseCount: 10
+      junitCaseIds:
+        - Review policy resolution (§8.7, §18).falls back to the canonical
+          builtin dispositions
+        - Review policy resolution (§8.7, §18).prefers a per-agent policy over
+          default and default over builtin
+        - Review policy resolution (§8.7, §18).reads legacy allowedDispositions
+          as the default alias
+        - Review policy resolution (§8.7, §18).appends dismiss for triagers
+          without duplicates
+        - Review policy resolution (§8.7, §18).never grants dismiss to
+          non-triagers, even when configured
+        - Generated review schema gating (§8.7).offers dismiss only when the
+          resolved policy comes from a triager
+        - FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a
+          dismiss suggestion whose id matches a concern
+        - FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a
+          triager and may dismiss architect concerns
+        - FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss
+          even when the legacy policy lists it
+        - Item-machine review prompt uses the canonical resolver (§8.7).renders
+          dismiss in the reviewer dispositions when the agent is a triager
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 70/300 production lines changed"
+    details:
+      changedLines:
+        added: 64
+        deleted: 6
+        total: 70
+        files:
+          - plugins/software-factory/src/core/flows/item-machine.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/review-policy.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/input.md
new file mode 100644
index 0000000..19f2722
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/input.md
@@ -0,0 +1,81 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "concerns-contracts-policy",
+  "kind": "dev",
+  "title": "Canonical review-policy resolver",
+  "assignment": "Resolver only (split 3/3, decision 001; deps: types). New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy reviewPolicy.allowedDispositions read-alias for default; append dismiss iff isTriager. Wire single resolver into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, and generateReviewSchema (dismiss enum only for triagers; QA never). Verify: typecheck + FakeHarness review-step behavior (reviewer accepts dismiss id-match; QA rejects dismiss). Prod budget <=100 lines. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-policy",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/review-policy.test.ts"
+  ],
+  "expectRed": [
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).falls back to the canonical builtin dispositions",
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).prefers a per-agent policy over default and default over builtin",
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).reads legacy allowedDispositions as the default alias",
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).appends dismiss for triagers without duplicates",
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).never grants dismiss to non-triagers, even when configured",
+    "test/review-policy.test.ts::Generated review schema gating (§8.7).offers dismiss only when the resolved policy comes from a triager",
+    "test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7, §18).reviewer accepts a dismiss suggestion whose id matches a concern",
+    "test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7, §18).plan-reviewer is a triager and may dismiss architect concerns",
+    "test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7, §18).qa rejects dismiss even when the legacy policy lists it",
+    "test/review-policy.test.ts::Item-machine review prompt uses the canonical resolver (§8.7).renders dismiss in the reviewer dispositions when the agent is a triager"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+]
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..e441a0d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T05:23:32.593Z
+session: 01a1b99c-a4cf-7055-be92-eb68fa7809d8
+endedAt: 2026-11-08T05:34:38.339Z
+usage:
+  inputTokens: 65173
+  outputTokens: 15889
+  costUsd: 0.02435
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-23-33-199Z_01a1b99c-a4cf-7055-be92-eb68fa7809d8
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..ef64b11
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-policy/steps/003-develop-r1-a1/output.yaml
@@ -0,0 +1,54 @@
+status: ok
+summary: Implemented the canonical review-policy resolver and wired it into
+  every review surface. `resolveReviewAllowed` now applies per-agent > default >
+  legacy `allowedDispositions` > builtin precedence, dedupes entries, appends
+  `dismiss` only for triagers, and strips `dismiss` for non-triagers.
+  `isTriagerAgent` marks reviewer/plan-reviewer/close-up reviewers. Item-machine
+  review prompts, plan-review prompts, and the step-runner schema path now all
+  resolve dispositions through this single resolver, so generated review schemas
+  offer `dismiss` only to triagers and never to QA. Target tests 10/10 green,
+  typecheck green, full suite 297 pass / 2 skip / 0 fail.
+target:
+  selectors:
+    - test/review-policy.test.ts
+  expectRed:
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).falls
+      back to the canonical builtin dispositions
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).prefers a
+      per-agent policy over default and default over builtin
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).reads
+      legacy allowedDispositions as the default alias
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).appends
+      dismiss for triagers without duplicates
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).never
+      grants dismiss to non-triagers, even when configured
+    - test/review-policy.test.ts::Generated review schema gating (§8.7).offers
+      dismiss only when the resolved policy comes from a triager
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18).reviewer accepts a dismiss suggestion whose id matches a concern
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18).plan-reviewer is a triager and may dismiss architect concerns
+    - test/review-policy.test.ts::FakeHarness review-step dispositions (§8.7,
+      §18).qa rejects dismiss even when the legacy policy lists it
+    - test/review-policy.test.ts::Item-machine review prompt uses the canonical
+      resolver (§8.7).renders dismiss in the reviewer dispositions when the
+      agent is a triager
+evidence:
+  - "`TMPDIR=/tmp bun test test/review-policy.test.ts` -> 10 pass, 0 fail, 28
+    expect() calls."
+  - "`bun run typecheck` (tsc --noEmit) -> exit 0."
+  - "`TMPDIR=/tmp bun test` (full suite) -> 297 pass, 2 skip, 0 fail across 53
+    files."
+  - "Red baseline before implementation: same target file failed 10/10,
+    confirming tests exercised the new behavior."
+  - "`git diff --numstat` -> 59 added / 11 removed lines across 4 prod files,
+    within the <=100 line budget."
+concerns:
+  - "`test/engine/blocked-closeup-iteration.test.ts` runs close to Bun's default
+    5s timeout and failed once while the full suite ran concurrently in the
+    background; it passed in the final clean full-suite run and in repeated
+    isolated runs. This is pre-existing timing sensitivity, not caused by the
+    resolver change."
+notes: "Resolver stub from test-first was replaced; no test files were modified.
+  Triager set follows the documented funnel: reviewer, plan-reviewer,
+  wave-close-up, plan-close-up."
diff --git a/plugins/software-factory/src/core/flows/item-machine.ts b/plugins/software-factory/src/core/flows/item-machine.ts
index d3d0cab..263d64e 100644
--- a/plugins/software-factory/src/core/flows/item-machine.ts
+++ b/plugins/software-factory/src/core/flows/item-machine.ts
@@ -31,6 +31,7 @@ import {
   fingerprintSuggestions,
 } from "../loops.js";
 import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import { runCheck } from "../checks/runner.js";
 import type { CheckContext } from "../checks/types.js";
 import type { BudgetTracker } from "../budget.js";
@@ -628,10 +629,11 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
   // Criteria bundle for review prompts (§8.7); allowed dispositions mirror the
   // schema binding in step-runner so prompt and validation agree.
   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
-  const reviewAllowed =
-    pipeline.reviewPolicy?.allowedDispositions ??
-    pipeline.reviewPolicy?.[currentStep.agent] ??
-    ["fix", "optional", "architect", "human-awareness", "human-async"];
+  const reviewAllowed = resolveReviewAllowed(
+    pipeline,
+    currentStep.agent,
+    isTriagerAgent(currentStep.agent)
+  );
 
   const promptVars: Record<string, string> = {
     assignment: assignmentYaml,
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index 43607b6..6c5e013 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -27,6 +27,7 @@ import { deriveWaveState } from "../derive/wave.js";
 import { refreshStateYaml } from "../derive/task.js";
 import { appendJournal } from "../journal.js";
 import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
 import { validateEdits } from "../plan/limits.js";
 import { applyEdits } from "../plan/apply.js";
@@ -459,7 +460,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         limits: JSON.stringify(limits, null, 2),
         dispositionsCriteria: formatDispositionsSection(
           loadCriteriaBundle(pipeline.criteria).dispositions,
-          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
+          resolveReviewAllowed(
+            pipeline,
+            "plan-reviewer",
+            isTriagerAgent("plan-reviewer")
+          )
         ),
       },
       turnsSemaphore,
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index 131e474..93c42f3 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -23,6 +23,7 @@ import {
 } from "../records/step-record.js";
 import { validateAndRepair } from "../records/repair.js";
 import { generateReviewSchema } from "../records/review-schema.js";
+import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
 import { captureHead, enforceHead } from "../git/guard.js";
 import { commitAll } from "../git/commit.js";
@@ -219,7 +220,11 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
 
   // 3. Resolve schema
   const pluginRoot = path.resolve(import.meta.dir ?? __dirname, "../../..");
-  const allowedDispositions = pipeline.reviewPolicy?.allowedDispositions;
+  const allowedDispositions = resolveReviewAllowed(
+    pipeline,
+    agent,
+    isTriagerAgent(agent)
+  );
   const outputSchema =
     opts.customSchema ??
     resolveStepSchema(pluginRoot, agent, stepId, allowedDispositions);
diff --git a/plugins/software-factory/src/core/review-policy.ts b/plugins/software-factory/src/core/review-policy.ts
new file mode 100644
index 0000000..33ef9db
--- /dev/null
+++ b/plugins/software-factory/src/core/review-policy.ts
@@ -0,0 +1,46 @@
+import type { PipelineConfig } from "./artifacts.js";
+
+/** Builtin review dispositions when the pipeline config sets no policy (§8.7). */
+export const BUILTIN_REVIEW_DISPOSITIONS = [
+  "fix",
+  "optional",
+  "architect",
+  "human-awareness",
+  "human-async",
+] as const;
+
+/**
+ * Agents that triage worker concerns and may dismiss them (§8.7, §18):
+ * the step's reviewer plus plan and close-up reviewers.
+ */
+export function isTriagerAgent(agent: string): boolean {
+  return (
+    agent === "reviewer" ||
+    agent === "plan-reviewer" ||
+    agent === "wave-close-up" ||
+    agent === "plan-close-up"
+  );
+}
+
+/**
+ * Resolves dispositions a review agent may emit (§8.7, §18).
+ * Precedence: per-agent list > default > legacy `allowedDispositions` alias > builtin.
+ * Triagers additionally get `dismiss`; non-triagers never do.
+ */
+export function resolveReviewAllowed(
+  pipeline: PipelineConfig,
+  agent: string,
+  isTriager: boolean
+): string[] {
+  const policy = pipeline.reviewPolicy;
+  const configured = [policy?.[agent], policy?.default, policy?.allowedDispositions].find(
+    (list): list is string[] => Array.isArray(list) && list.length > 0
+  );
+  const dispositions = Array.from(
+    new Set<string>(configured ?? BUILTIN_REVIEW_DISPOSITIONS)
+  );
+  if (!isTriager) return dispositions.filter((d) => d !== "dismiss");
+  return dispositions.includes("dismiss")
+    ? dispositions
+    : [...dispositions, "dismiss"];
+}
diff --git a/plugins/software-factory/test/review-policy.test.ts b/plugins/software-factory/test/review-policy.test.ts
new file mode 100644
index 0000000..53f9fcb
--- /dev/null
+++ b/plugins/software-factory/test/review-policy.test.ts
@@ -0,0 +1,431 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
+import { FakeHarness } from "../src/harness/fake/fake-harness.js";
+import { Repo } from "../src/core/git/repo.js";
+import { loadPromptLibrary } from "../src/core/prompts.js";
+import { runAgentStep } from "../src/core/flows/step-runner.js";
+import { tickItemMachine } from "../src/core/flows/item-machine.js";
+import { generateReviewSchema } from "../src/core/records/review-schema.js";
+import { resolveReviewAllowed } from "../src/core/review-policy.js";
+import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";
+
+const CANONICAL = [
+  "fix",
+  "optional",
+  "architect",
+  "human-awareness",
+  "human-async",
+];
+
+function pipelineWith(
+  reviewPolicy?: PipelineConfig["reviewPolicy"]
+): PipelineConfig {
+  return {
+    models: {
+      roles: {
+        workhorse: { model: "model-workhorse" },
+        "alt-workhorse": { model: "model-alt-workhorse" },
+        architect: { model: "model-architect" },
+        "alt-architect": { model: "model-alt-architect" },
+        simpler: { model: "model-simpler" },
+      },
+    },
+    agents: {
+      developer: { role: "workhorse" },
+      reviewer: { role: "alt-workhorse" },
+      qa: { role: "alt-workhorse" },
+      "plan-reviewer": { role: "alt-architect" },
+    },
+    flows: { simple: { steps: [] }, story: {}, spike: {} },
+    limits: {},
+    reviewPolicy,
+  };
+}
+
+function dispositionEnum(schema: Record<string, unknown>): string[] {
+  const properties = schema.properties as any;
+  return properties.suggestions.items.properties.disposition.enum;
+}
+
+describe("Review policy resolution (§8.7, §18)", () => {
+  it("falls back to the canonical builtin dispositions", () => {
+    expect(resolveReviewAllowed(pipelineWith(), "reviewer", false)).toEqual(
+      CANONICAL
+    );
+    expect(resolveReviewAllowed(pipelineWith({}), "qa", false)).toEqual(
+      CANONICAL
+    );
+  });
+
+  it("prefers a per-agent policy over default and default over builtin", () => {
+    const pipeline = pipelineWith({
+      default: ["fix", "optional"],
+      reviewer: ["architect"],
+    });
+
+    expect(resolveReviewAllowed(pipeline, "reviewer", false)).toEqual([
+      "architect",
+    ]);
+    expect(resolveReviewAllowed(pipeline, "qa", false)).toEqual([
+      "fix",
+      "optional",
+    ]);
+    expect(
+      resolveReviewAllowed(pipelineWith({ default: ["fix"] }), "qa", false)
+    ).toEqual(["fix"]);
+  });
+
+  it("reads legacy allowedDispositions as the default alias", () => {
+    expect(
+      resolveReviewAllowed(
+        pipelineWith({ allowedDispositions: ["fix", "human-stop"] }),
+        "reviewer",
+        false
+      )
+    ).toEqual(["fix", "human-stop"]);
+
+    expect(
+      resolveReviewAllowed(
+        pipelineWith({ default: ["architect"], allowedDispositions: ["fix"] }),
+        "reviewer",
+        false
+      )
+    ).toEqual(["architect"]);
+  });
+
+  it("appends dismiss for triagers without duplicates", () => {
+    expect(resolveReviewAllowed(pipelineWith(), "reviewer", true)).toEqual([
+      ...CANONICAL,
+      "dismiss",
+    ]);
+    expect(
+      resolveReviewAllowed(
+        pipelineWith({ reviewer: ["fix", "dismiss"] }),
+        "reviewer",
+        true
+      )
+    ).toEqual(["fix", "dismiss"]);
+    expect(
+      resolveReviewAllowed(
+        pipelineWith({ default: ["fix", "dismiss"] }),
+        "plan-reviewer",
+        true
+      )
+    ).toEqual(["fix", "dismiss"]);
+  });
+
+  it("never grants dismiss to non-triagers, even when configured", () => {
+    expect(
+      resolveReviewAllowed(
+        pipelineWith({ qa: ["fix", "dismiss"] }),
+        "qa",
+        false
+      )
+    ).toEqual(["fix"]);
+    expect(
+      resolveReviewAllowed(
+        pipelineWith({ default: ["fix", "dismiss"] }),
+        "reviewer",
+        false
+      )
+    ).toEqual(["fix"]);
+  });
+});
+
+describe("Generated review schema gating (§8.7)", () => {
+  it("offers dismiss only when the resolved policy comes from a triager", () => {
+    const triagerSchema = generateReviewSchema(
+      resolveReviewAllowed(pipelineWith(), "reviewer", true)
+    );
+    expect(dispositionEnum(triagerSchema)).toContain("dismiss");
+
+    const qaSchema = generateReviewSchema(
+      resolveReviewAllowed(pipelineWith({ default: ["fix"] }), "qa", false)
+    );
+    expect(dispositionEnum(qaSchema)).not.toContain("dismiss");
+    expect(dispositionEnum(qaSchema)).toEqual(["fix"]);
+  });
+});
+
+describe("FakeHarness review-step dispositions (§8.7, §18)", () => {
+  let tmpRepo: TmpRepo;
+  let repoObj: Repo;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+  let project: ProjectConfig;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    prompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../agents"),
+      overrideDirs: [],
+    });
+    project = { orchestrationFolder: ".factory", worktreeRoot };
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  async function runStep(options: {
+    task: string;
+    agent: string;
+    stepId: string;
+    stepFragment: string;
+    pipeline: PipelineConfig;
+    data: unknown;
+    promptVars: Record<string, string>;
+  }) {
+    const taskDir = path.join(tmpRepo.dir, ".factory", options.task);
+    const recordsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(recordsDir, { recursive: true });
+
+    const harness = new FakeHarness();
+    harness.scriptOutcome(`${options.task}/runs/${options.stepId}#a1`, {
+      ok: true,
+      data: options.data,
+    });
+
+    const res = await runAgentStep({
+      task: options.task,
+      stepId: options.stepId,
+      stepFragment: options.stepFragment,
+      agent: options.agent,
+      cwd: tmpRepo.dir,
+      taskWt: tmpRepo.dir,
+      taskDir,
+      recordsDir,
+      repo: repoObj,
+      harness,
+      pipeline: options.pipeline,
+      project,
+      prompts,
+      promptVars: options.promptVars,
+    });
+
+    return { res, harness };
+  }
+
+  const reviewPromptVars = {
+    assignment: "Implement the feature",
+    checks: "",
+    diff: "",
+    dispositionsCriteria: "",
+  };
+  const planReviewPromptVars = {
+    plan: "{}",
+    intent: "Intent",
+    context: "",
+    limits: "{}",
+    dispositionsCriteria: "",
+  };
+
+  it("reviewer accepts a dismiss suggestion whose id matches a concern", async () => {
+    const concernId = "c-0123456789";
+    const { res, harness } = await runStep({
+      task: "reviewer-dismiss",
+      agent: "reviewer",
+      stepId: "review",
+      stepFragment: "steps/review",
+      pipeline: pipelineWith({ default: ["fix"] }),
+      promptVars: reviewPromptVars,
+      data: {
+        status: "approved",
+        summary: "Triaged worker concerns",
+        suggestions: [
+          {
+            id: concernId,
+            disposition: "dismiss",
+            summary: "Not a real finding",
+            detail: "Duplicate of an existing concern",
+          },
+        ],
+      },
+    });
+
+    expect(res.ok).toBe(true);
+    expect(res.status).toBe("ok");
+    const suggestion = (res.output as any).suggestions[0];
+    expect(suggestion.id).toBe(concernId);
+    expect(suggestion.disposition).toBe("dismiss");
+    const schema = (harness.calls[0] as any).run.outputSchema;
+    expect(dispositionEnum(schema)).toContain("dismiss");
+  });
+
+  it("plan-reviewer is a triager and may dismiss architect concerns", async () => {
+    const { res, harness } = await runStep({
+      task: "plan-reviewer-dismiss",
+      agent: "plan-reviewer",
+      stepId: "plan-review-1-1",
+      stepFragment: "steps/plan-review",
+      pipeline: pipelineWith({ default: ["fix"] }),
+      promptVars: planReviewPromptVars,
+      data: {
+        status: "approved",
+        summary: "Triaged architect concerns",
+        suggestions: [
+          {
+            id: "c-abcdef",
+            disposition: "dismiss",
+            summary: "Not a real finding",
+            detail: "Already resolved in the plan",
+          },
+        ],
+      },
+    });
+
+    expect(res.ok).toBe(true);
+    expect(res.status).toBe("ok");
+    const schema = (harness.calls[0] as any).run.outputSchema;
+    expect(dispositionEnum(schema)).toContain("dismiss");
+  });
+
+  it("qa rejects dismiss even when the legacy policy lists it", async () => {
+    const { res, harness } = await runStep({
+      task: "qa-rejects-dismiss",
+      agent: "qa",
+      stepId: "qa",
+      stepFragment: "steps/qa",
+      pipeline: pipelineWith({ allowedDispositions: ["fix", "dismiss"] }),
+      promptVars: {
+        assignment: "Implement the feature",
+        checks: "",
+        testDiff: "",
+        diff: "",
+        dispositionsCriteria: "",
+      },
+      data: {
+        status: "approved",
+        summary: "QA triage attempt",
+        suggestions: [
+          {
+            id: "c-0123456789",
+            disposition: "dismiss",
+            summary: "Not a real finding",
+            detail: "Duplicate of an existing concern",
+          },
+        ],
+      },
+    });
+
+    expect(res.ok).toBe(false);
+    expect(res.status).toBe("rejected");
+    const schema = (harness.calls[0] as any).run.outputSchema;
+    expect(dispositionEnum(schema)).not.toContain("dismiss");
+  });
+});
+
+describe("Item-machine review prompt uses the canonical resolver (§8.7)", () => {
+  let tmpRepo: TmpRepo;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  it("renders dismiss in the reviewer dispositions when the agent is a triager", async () => {
+    const task = "policy-prompt-task";
+    const orchFolder = ".factory";
+    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
+    const itemSlug = "policy-item";
+    const itemDir = path.join(taskDir, "items", itemSlug);
+    fs.mkdirSync(itemDir, { recursive: true });
+    fs.writeFileSync(
+      path.join(itemDir, "assignment.yaml"),
+      JSON.stringify(
+        {
+          slug: itemSlug,
+          kind: "dev",
+          title: "Review policy item",
+          assignment: "Implement the feature",
+          milestone: "m1",
+          wave: 1,
+          deps: [],
+        },
+        null,
+        2
+      )
+    );
+
+    const childBranch = `topic/${task}--${itemSlug}`;
+    const childWt = tmpRepo.createWorktree(childBranch);
+    const repoObj = new Repo({
+      mainRoot: tmpRepo.dir,
+      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
+    });
+    const project: ProjectConfig = {
+      orchestrationFolder: orchFolder,
+      worktreeRoot: repoObj.worktreeRoot,
+    };
+    const pipeline = pipelineWith({ reviewer: ["fix"] });
+    pipeline.flows.story = {
+      dev: {
+        fixLoopTo: "develop",
+        steps: [{ id: "review", agent: "reviewer", role: "alt-workhorse" }],
+      },
+    };
+
+    const prompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../agents"),
+      overrideDirs: [],
+    });
+    const harness = new FakeHarness();
+    const reviewData = {
+      status: "approved",
+      summary: "Triaged worker concerns",
+      suggestions: [
+        {
+          id: "c-0123456789",
+          disposition: "dismiss",
+          summary: "Not a real finding",
+          detail: "Duplicate of an existing concern",
+        },
+      ],
+    };
+    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
+      ok: true,
+      data: reviewData,
+    });
+    // Reuse mode retries the same session when the output is schema-invalid;
+    // keep the replay valid-shaped for the red run without crashing the fake.
+    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1#repair-ask`, {
+      ok: true,
+      data: reviewData,
+    });
+
+    await tickItemMachine({
+      task,
+      itemSlug,
+      parentBranch: `topic/${task}`,
+      taskWt: tmpRepo.dir,
+      childWt,
+      taskDir,
+      repo: repoObj,
+      harness,
+      pipeline,
+      project,
+      prompts,
+    });
+
+    const inputPath = path.join(
+      childWt,
+      orchFolder,
+      task,
+      "items",
+      itemSlug,
+      "steps",
+      "001-review-a1",
+      "input.md"
+    );
+    expect(fs.existsSync(inputPath)).toBe(true);
+    const input = fs.readFileSync(inputPath, "utf8");
+    expect(input).toContain("Allowed dispositions for this review: fix, dismiss.");
+  });
+});

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["approved","changes_requested"])
- summary (string, required)
- suggestions (array of object, required)
  - id (string, required)
  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
  - summary (string, required)
  - detail (string, optional)
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
