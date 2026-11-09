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

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/decisions/023-item-schema-detail-normalize.yaml b/.factory/tasks/concerns-funnel/decisions/023-item-schema-detail-normalize.yaml
deleted file mode 100644
index 586a80f..0000000
--- a/.factory/tasks/concerns-funnel/decisions/023-item-schema-detail-normalize.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: decision-schema-detail-normalize-1794206496998
-context: item
-item: schema-detail-normalize
-afterRecord: 002-test-first-r1-a2
-decision: retry-with-guidance
-timestamp: 2026-11-09T06:41:36.998Z
-rationale: Both test-first attempts wrote the new test file but yielded output
-  with no `target` field, so the mechanical target-red check fails at
-  runner.ts:333 before running anything ('No target specified'). This is a
-  yield-shape omission, not a code problem. The item is small and well-scoped;
-  no split or escalation needed.
-text: "Retry test-first. Root cause of both rejections: your yield omitted
-  `target`. You MUST yield `target: { selectors:
-  ['test/contracts/schema-detail-normalize.test.ts'], expectRed: ['<exact
-  it/test name 1>', '<exact it/test name 2>', ...] }` where every expectRed
-  string is the EXACT name from an it()/test() block in your new file (bun-junit
-  matching is by test-name segment; minItems 1). Scope: touch ONLY paths.tests
-  (new file). Do NOT touch schemas, src, or epic-saga-propagate.test.ts in this
-  step — test-first-scope rejects prod changes; the 3 .Detail read fixes +
-  schemas + concerns.ts:72 belong to the develop step. Red semantics: each
-  expectRed id must FAIL by assertion on current prod (lowercase-detail contract
-  assertions fail against capital-D schemas; longest-wins fails because merge
-  reads existing?.Detail). Collection/import/syntax errors do NOT count as red.
-  Prove locally before yielding: cd plugins/software-factory && TMPDIR=/tmp bun
-  test test/contracts/schema-detail-normalize.test.ts and confirm your declared
-  ids fail with assertion failures."
-persist: true
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..a03130e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,101 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+        - plugins/software-factory/test/contracts/concern-schemas.test.ts
+        - plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
+        - plugins/software-factory/test/review-policy.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 6 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test test/review-policy.test.ts
+        test/contracts/concern-schemas.test.ts
+        test/contracts/concern-artifact-types.test.ts
+        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794204819628-yvpsb8si1e.xml
+      junitCaseCount: 38
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
+        - Review policy resolution (§8.7, §18).restricts the triager set to
+          reviewer and plan-reviewer
+        - Review policy resolution (§8.7, §18).composed triager resolution
+          excludes dismiss for close-ups
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
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          propagate, and dismiss to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern producer schemas.adds remarkable and lowercase detail to
+          reviewer, plan-reviewer, QA, and file review schemas
+        - Concern producer schemas.adds concernConfirms and concernResolution to
+          architect report decisions
+        - Concern producer schemas.adds concernConfirms to plan close-up outputs
+          while preserving concernResolutions
+        - Concern producer schemas.accepts structured concerns and remarkable
+          across every developer, fact-finder, and plan step
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+        - Concern artifact types.types structured concerns and remarkable
+          decisions on every producer artifact
+        - Concern artifact types.types concern confirmations and decision
+          resolutions with strict vocabularies
+        - "Close-up lifecycle: architect confirmations.accept resolves a pending
+          resolve and derive exposes the resolved status"
+        - "Close-up lifecycle: architect confirmations.accept carries a pending
+          carry to the architect"
+        - "Close-up lifecycle: architect confirmations.accept propagates a
+          pending propagate to the parent concern store"
+        - "Close-up lifecycle: architect confirmations.reject clears the pending
+          resolution, preserving open status and disposition"
+        - "Close-up lifecycle: dismiss resolutions.accept dismisses with the
+          trimmed pending note and clears the proposal"
+        - "Close-up lifecycle: dismiss resolutions.errors before any transition
+          when an accepted dismiss proposal has no note"
+        - "Close-up lifecycle: consult unblock.consult resolve unblocks the
+          affected item on the next derive"
+        - "Close-up lifecycle: consult unblock.ignores concernResolution from an
+          item consult and journals the drop"
+        - "Close-up lifecycle: wave fallback.falls back over triage-less open
+          concerns and lists tech-debt as derived debt"
+        - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
+          explicit triage"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..cbba824
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,68 @@
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
+  "slug": "closeup-triager-cleanup",
+  "kind": "dev",
+  "title": "Close-up triager cleanup + dismiss resolutions",
+  "assignment": "Per adr-closeup-no-suggestions-triage: drop wave-close-up/plan-close-up from isTriagerAgent so composed resolveReviewAllowed(p,a,isTriagerAgent(a)) excludes dismiss for close-ups and triager set equals {reviewer,plan-reviewer}. Add dismiss to CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action enums. ingestStepConcerns MUST pre-flight before any mutate: every accept confirm whose pending.action==dismiss requires non-empty pending.note else throw TriageValidationError (step errors; all statuses+pendings preserved, no partial transitions). applyConcernConfirms itself never throws TriageValidationError (avoids concerns<->triage cycle). accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared. Wave fallback never assigns dismiss; kind=blocker stays open. Close-up schemas carry no suggestions[]; re-triage honored solely via concernResolutions + architect concernConfirms + fallback. Tests: review-policy composed triager-set exclusion, closeup-lifecycle dismiss accept (with note) + error (without note, preserved state), closeup dismiss enum contract case. Verify: typecheck + targeted suites + TMPDIR=/tmp full gates.",
+  "outlineRef": "closeup-triager-cleanup",
+  "milestone": "m1-contracts-consistency",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-contracts-consistency:3",
+    "m1-contracts-consistency:4",
+    "m1-contracts-consistency:5",
+    "m1-contracts-consistency:6"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
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
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..27bc564
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/meta.yaml
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
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T06:07:38.783Z
+session: 01a1beeb-61e2-7540-93fb-4bed19acde09
+endedAt: 2026-11-09T06:13:43.822Z
+usage:
+  inputTokens: 60544
+  outputTokens: 26396
+  costUsd: 0.035585
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-07-39-490Z_01a1beeb-61e2-7540-93fb-4bed19acde09
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..5edcfb5
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,83 @@
+status: ok
+summary: "Authored the red tests for close-up triager cleanup and dismiss
+  resolutions without touching production code. Added: (1) review-policy tests
+  asserting the triager set is exactly {reviewer, plan-reviewer} and that
+  composed resolveReviewAllowed(p,a,isTriagerAgent(a)) excludes dismiss for
+  wave-close-up/plan-close-up while retaining it for reviewer/plan-reviewer; (2)
+  closeup-lifecycle tests where architect accept of a pending dismiss with a
+  note yields status dismissed + disposition dismiss + trimmed dismissReason +
+  cleared pending, and accept of a pending dismiss without a note errors the
+  step while preserving both the dismiss proposal and a co-emitted resolve
+  proposal (no partial transitions); (3) contract tests accepting dismiss in
+  wave/plan/architect close-up concernResolutions action enums and in
+  CloseupConcernResolution/PendingConcernResolution types, plus asserting
+  close-up schemas carry no suggestions[]. Targeted run: 6 fail / 32 pass, all
+  six failures are assertion failures (JUnit <failure>, no <error>), matching
+  the declared expectRed ids. Full TMPDIR=/tmp suite: 439 pass, 2 skip, 6 fail
+  (exactly the new target tests, no regressions)."
+target:
+  selectors:
+    - test/review-policy.test.ts
+    - test/contracts/concern-schemas.test.ts
+    - test/contracts/concern-artifact-types.test.ts
+    - test/engine/closeup-lifecycle-resolve.test.ts
+  expectRed:
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).restricts
+      the triager set to reviewer and plan-reviewer
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).composed
+      triager resolution excludes dismiss for close-ups
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas.adds
+      concernResolutions with resolve, carry, propagate, and dismiss to close-up
+      schemas
+    - test/contracts/concern-artifact-types.test.ts::Concern artifact
+      types.stores concern lifecycle metadata including pending resolution and
+      escalation
+    - "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle:
+      dismiss resolutions.accept dismisses with the trimmed pending note and
+      clears the proposal"
+    - "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle:
+      dismiss resolutions.errors before any transition when an accepted dismiss
+      proposal has no note"
+evidence:
+  - cd plugins/software-factory && bun install --frozen-lockfile -> dependencies
+    installed (yaml, ajv, typescript); test runner usable
+  - "Baseline before edits: TMPDIR=/tmp bun test test/review-policy.test.ts
+    test/contracts/concern-artifact-types.test.ts
+    test/contracts/concern-schemas.test.ts
+    test/engine/closeup-lifecycle-resolve.test.ts -> 34 pass, 0 fail (runner
+    healthy, fixtures work)"
+  - "After edits: same targeted command -> 32 pass, 6 fail; failures are
+    behavior assertions: isTriagerAgent includes close-ups, schema rejects
+    dismiss, types reject dismiss, accept leaves status open, no-note accept
+    does not error"
+  - "JUnit verification: bun test <4 files> --reporter=junit -> exactly 6
+    <failure> testcases and 0 <error>/collection failures; ids match all six
+    declared expectRed entries"
+  - cd plugins/software-factory && TMPDIR=/tmp bun test (full suite) -> 439
+    pass, 2 skip, 6 fail across 69 files; the only failures are the six new
+    target tests, so no existing suite regressed
+  - git status --short -> only the four test files modified; no production files
+    touched
+concerns:
+  - bun run typecheck is currently red only because the new tests reference the
+    not-yet-added `dismiss` member of
+    PendingConcernResolution/CloseupConcernResolution and the close-up schemas'
+    action enum; the green step adds those type/schema members. Runtime bun test
+    red is assertion-based, not compilation-based.
+  - The pre-flight test asserts result.meta.error matches /dismiss/i and
+    /note/i, so the implementation's TriageValidationError message must name
+    both the dismiss action and the missing note.
+  - The dismiss-accept test uses a padded note ('  Superseded by ADR-1  ') to
+    pin the trimmed dismissReason requirement.
+notes: "Implementation guidance: (1) isTriagerAgent -> only reviewer and
+  plan-reviewer; (2) add \"dismiss\" to CloseupConcernResolution,
+  PendingConcernResolution, and the local ConcernResolution in concerns.ts:16
+  plus wave/plan-closeup schema action enums (architect-closeup shares
+  plan-closeup); (3) in ingestStepConcerns, before
+  aggregateConcerns/applyReviewTriage/applyCloseupResolutions, when
+  source.agent==='architect' scan accept confirms against stored
+  pendingResolution and throw TriageValidationError for action==='dismiss' with
+  blank/absent note; (4) in applyConcernConfirms add an accept+dismiss branch
+  returning status dismissed, disposition dismiss, dismissReason pending.note
+  trimmed, pendingResolution cleared, without importing triage.ts; (5) leave
+  wave fallback untouched (never dismiss, blockers stay open)."
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..b9cf8ff
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,82 @@
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
+  "slug": "closeup-triager-cleanup",
+  "kind": "dev",
+  "title": "Close-up triager cleanup + dismiss resolutions",
+  "assignment": "Per adr-closeup-no-suggestions-triage: drop wave-close-up/plan-close-up from isTriagerAgent so composed resolveReviewAllowed(p,a,isTriagerAgent(a)) excludes dismiss for close-ups and triager set equals {reviewer,plan-reviewer}. Add dismiss to CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action enums. ingestStepConcerns MUST pre-flight before any mutate: every accept confirm whose pending.action==dismiss requires non-empty pending.note else throw TriageValidationError (step errors; all statuses+pendings preserved, no partial transitions). applyConcernConfirms itself never throws TriageValidationError (avoids concerns<->triage cycle). accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared. Wave fallback never assigns dismiss; kind=blocker stays open. Close-up schemas carry no suggestions[]; re-triage honored solely via concernResolutions + architect concernConfirms + fallback. Tests: review-policy composed triager-set exclusion, closeup-lifecycle dismiss accept (with note) + error (without note, preserved state), closeup dismiss enum contract case. Verify: typecheck + targeted suites + TMPDIR=/tmp full gates.",
+  "outlineRef": "closeup-triager-cleanup",
+  "milestone": "m1-contracts-consistency",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-contracts-consistency:3",
+    "m1-contracts-consistency:4",
+    "m1-contracts-consistency:5",
+    "m1-contracts-consistency:6"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/review-policy.test.ts",
+    "test/contracts/concern-schemas.test.ts",
+    "test/contracts/concern-artifact-types.test.ts",
+    "test/engine/closeup-lifecycle-resolve.test.ts"
+  ],
+  "expectRed": [
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).restricts the triager set to reviewer and plan-reviewer",
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).composed triager resolution excludes dismiss for close-ups",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas.adds concernResolutions with resolve, carry, propagate, and dismiss to close-up schemas",
+    "test/contracts/concern-artifact-types.test.ts::Concern artifact types.stores concern lifecycle metadata including pending resolution and escalation",
+    "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle: dismiss resolutions.accept dismisses with the trimmed pending note and clears the proposal",
+    "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle: dismiss resolutions.errors before any transition when an accepted dismiss proposal has no note"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
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
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..6b0c3bb
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,22 @@
+seq: 2
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: rejected
+startedAt: 2026-11-09T06:29:57.459Z
+session: 01a1bf04-4dd2-72d8-8294-ed5fdff9bc7d
+endedAt: 2026-11-09T06:37:00.125Z
+usage:
+  inputTokens: 83596
+  outputTokens: 19606
+  costUsd: 0.030458
+error: |-
+  Output validation and repair failed: Agent output failed schema validation:
+  /: must be object ({"type":"object"})
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-29-57-891Z_01a1beff-ce03-72a5-9088-677c6dcc87b0
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..bbc4d00
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/checks.yaml
@@ -0,0 +1,159 @@
+checks:
+  - id: gates
+    status: pass
+    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
+      (§7).detects when an agent commits and resets --soft to before.sha,
+      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
+      agent switches branch and restores original branch, keeping changes)"
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 4498
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 102490
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-DkbZfI/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+          ----------------------------------------------------------------
+          Blocking Questions:
+            (none)
+          ----------------------------------------------------------------
+          Digest Questions:
+            (none)
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1374460
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1374460
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1374460
+
+           445 pass
+           2 skip
+           0 fail
+           2468 expect() calls
+          Ran 447 tests across 69 files. [102.32s]
+          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
+        improvements:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: cd plugins/software-factory && bun test test/review-policy.test.ts
+        test/contracts/concern-schemas.test.ts
+        test/contracts/concern-artifact-types.test.ts
+        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794206783584-wu0tnnlrd5.xml
+      junitCaseCount: 38
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
+        - Review policy resolution (§8.7, §18).restricts the triager set to
+          reviewer and plan-reviewer
+        - Review policy resolution (§8.7, §18).composed triager resolution
+          excludes dismiss for close-ups
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
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          propagate, and dismiss to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern producer schemas.adds remarkable and lowercase detail to
+          reviewer, plan-reviewer, QA, and file review schemas
+        - Concern producer schemas.adds concernConfirms and concernResolution to
+          architect report decisions
+        - Concern producer schemas.adds concernConfirms to plan close-up outputs
+          while preserving concernResolutions
+        - Concern producer schemas.accepts structured concerns and remarkable
+          across every developer, fact-finder, and plan step
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+        - Concern artifact types.types structured concerns and remarkable
+          decisions on every producer artifact
+        - Concern artifact types.types concern confirmations and decision
+          resolutions with strict vocabularies
+        - "Close-up lifecycle: architect confirmations.accept resolves a pending
+          resolve and derive exposes the resolved status"
+        - "Close-up lifecycle: architect confirmations.accept carries a pending
+          carry to the architect"
+        - "Close-up lifecycle: architect confirmations.accept propagates a
+          pending propagate to the parent concern store"
+        - "Close-up lifecycle: architect confirmations.reject clears the pending
+          resolution, preserving open status and disposition"
+        - "Close-up lifecycle: dismiss resolutions.accept dismisses with the
+          trimmed pending note and clears the proposal"
+        - "Close-up lifecycle: dismiss resolutions.errors before any transition
+          when an accepted dismiss proposal has no note"
+        - "Close-up lifecycle: consult unblock.consult resolve unblocks the
+          affected item on the next derive"
+        - "Close-up lifecycle: consult unblock.ignores concernResolution from an
+          item consult and journals the drop"
+        - "Close-up lifecycle: wave fallback.falls back over triage-less open
+          concerns and lists tech-debt as derived debt"
+        - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
+          explicit triage"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 58/300 production lines changed"
+    details:
+      changedLines:
+        added: 43
+        deleted: 15
+        total: 58
+        files:
+          - plugins/software-factory/config/schemas/plan-closeup.schema.json
+          - plugins/software-factory/config/schemas/wave-closeup.schema.json
+          - plugins/software-factory/src/core/artifacts.ts
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/review-policy.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/input.md
new file mode 100644
index 0000000..193fa35
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/input.md
@@ -0,0 +1,88 @@
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
+  "slug": "closeup-triager-cleanup",
+  "kind": "dev",
+  "title": "Close-up triager cleanup + dismiss resolutions",
+  "assignment": "Per adr-closeup-no-suggestions-triage: drop wave-close-up/plan-close-up from isTriagerAgent so composed resolveReviewAllowed(p,a,isTriagerAgent(a)) excludes dismiss for close-ups and triager set equals {reviewer,plan-reviewer}. Add dismiss to CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action enums. ingestStepConcerns MUST pre-flight before any mutate: every accept confirm whose pending.action==dismiss requires non-empty pending.note else throw TriageValidationError (step errors; all statuses+pendings preserved, no partial transitions). applyConcernConfirms itself never throws TriageValidationError (avoids concerns<->triage cycle). accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared. Wave fallback never assigns dismiss; kind=blocker stays open. Close-up schemas carry no suggestions[]; re-triage honored solely via concernResolutions + architect concernConfirms + fallback. Tests: review-policy composed triager-set exclusion, closeup-lifecycle dismiss accept (with note) + error (without note, preserved state), closeup dismiss enum contract case. Verify: typecheck + targeted suites + TMPDIR=/tmp full gates.",
+  "outlineRef": "closeup-triager-cleanup",
+  "milestone": "m1-contracts-consistency",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-contracts-consistency:3",
+    "m1-contracts-consistency:4",
+    "m1-contracts-consistency:5",
+    "m1-contracts-consistency:6"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/review-policy.test.ts",
+    "test/contracts/concern-schemas.test.ts",
+    "test/contracts/concern-artifact-types.test.ts",
+    "test/engine/closeup-lifecycle-resolve.test.ts"
+  ],
+  "expectRed": [
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).restricts the triager set to reviewer and plan-reviewer",
+    "test/review-policy.test.ts::Review policy resolution (§8.7, §18).composed triager resolution excludes dismiss for close-ups",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas.adds concernResolutions with resolve, carry, propagate, and dismiss to close-up schemas",
+    "test/contracts/concern-artifact-types.test.ts::Concern artifact types.stores concern lifecycle metadata including pending resolution and escalation",
+    "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle: dismiss resolutions.accept dismisses with the trimmed pending note and clears the proposal",
+    "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle: dismiss resolutions.errors before any transition when an accepted dismiss proposal has no note"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+]
+
+## Review Feedback
+Output validation and repair failed: Agent output failed schema validation:
+/: must be object ({"type":"object"})
+
+Budget: 58 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..98b6f43
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/meta.yaml
@@ -0,0 +1,20 @@
+seq: 3
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T06:40:18.729Z
+session: 01a1bf09-48f4-758e-8573-ca197ad514ac
+endedAt: 2026-11-09T06:46:27.517Z
+usage:
+  inputTokens: 22432
+  outputTokens: 6192
+  costUsd: 0.008538
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-40-19-188Z_01a1bf09-48f4-758e-8573-ca197ad514ac
diff --git a/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..43becd1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2/output.yaml
@@ -0,0 +1,68 @@
+status: ok
+summary: "Close-up triager cleanup + dismiss resolutions implemented and
+  verified: isTriagerAgent restricted to {reviewer, plan-reviewer} (composed
+  resolveReviewAllowed excludes dismiss for close-ups); dismiss added to
+  CloseupConcernResolution, PendingConcernResolution, local ConcernResolution,
+  and wave/plan-closeup schema action enums; ingestStepConcerns pre-flights
+  accepted dismiss confirms before any mutation (TriageValidationError, state
+  preserved) while applyConcernConfirms never throws; accept+dismiss sets
+  dismissed/disposition dismiss/dismissReason from trimmed pending note and
+  clears the proposal; wave fallback never assigns dismiss and blockers stay
+  open. All four target suites green (38 pass, 0 fail), typecheck clean, full
+  gate suite green (445 pass, 2 skip, 0 fail)."
+target:
+  selectors:
+    - test/review-policy.test.ts
+    - test/contracts/concern-schemas.test.ts
+    - test/contracts/concern-artifact-types.test.ts
+    - test/engine/closeup-lifecycle-resolve.test.ts
+  expectRed:
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).restricts
+      the triager set to reviewer and plan-reviewer
+    - test/review-policy.test.ts::Review policy resolution (§8.7, §18).composed
+      triager resolution excludes dismiss for close-ups
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas.adds
+      concernResolutions with resolve, carry, propagate, and dismiss to close-up
+      schemas
+    - test/contracts/concern-artifact-types.test.ts::Concern artifact
+      types.stores concern lifecycle metadata including pending resolution and
+      escalation
+    - "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle:
+      dismiss resolutions.accept dismisses with the trimmed pending note and
+      clears the proposal"
+    - "test/engine/closeup-lifecycle-resolve.test.ts::Close-up lifecycle:
+      dismiss resolutions.errors before any transition when an accepted dismiss
+      proposal has no note"
+evidence:
+  - cd plugins/software-factory && bun test test/review-policy.test.ts
+    test/contracts/concern-schemas.test.ts
+    test/contracts/concern-artifact-types.test.ts
+    test/engine/closeup-lifecycle-resolve.test.ts -> 38 pass, 0 fail, 147
+    expect() calls across 4 files
+  - cd plugins/software-factory && bun run typecheck (tsc --noEmit) -> exit 0,
+    TYPECHECK_OK
+  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 445 pass, 2 skip, 0
+    fail, 2468 expect() calls, 447 tests across 69 files
+  - "Source inspection: plugins/software-factory/src/core/review-policy.ts
+    isTriagerAgent returns agent === 'reviewer' || agent === 'plan-reviewer';
+    resolveReviewAllowed filters dismiss for non-triagers"
+  - "Source inspection: artifacts.ts
+    CloseupConcernResolution/PendingConcernResolution and concerns.ts local
+    ConcernResolution include 'dismiss'; config/schemas/wave-closeup.schema.json
+    and plan-closeup.schema.json enums include 'dismiss'"
+  - "Source inspection: plugins/software-factory/src/core/flows/step-runner.ts
+    ingestStepConcerns pre-flights architect accept confirms against
+    listConcerns pendingResolution.dismiss notes before
+    aggregateConcerns/applyReviewTriage/applyConcernConfirms, throwing
+    TriageValidationError without mutating"
+  - "Source inspection: concerns.ts applyConcernConfirms handles dismiss with
+    trimmed pending note, never throws TriageValidationError;
+    applyWaveCloseupFallback skips blockers/open pending concerns and only
+    assigns optional/architect"
+concerns:
+  - applyConcernConfirms silently leaves the proposal intact when called
+    directly with a missing dismissal note; the step-level pre-flight is the
+    enforcing gate, as required to avoid the concerns<->triage module cycle.
+notes: Working tree contains only the engine-managed step meta.yaml
+  modification; implementation changes were already committed on the branch (58
+  prod lines, well under the 300-line budget).
diff --git a/.factory/tasks/concerns-funnel/journal.ndjson b/.factory/tasks/concerns-funnel/journal.ndjson
index 1cb392e..9785e84 100644
--- a/.factory/tasks/concerns-funnel/journal.ndjson
+++ b/.factory/tasks/concerns-funnel/journal.ndjson
@@ -1882,31 +1882,3 @@
 {"type":"step_started","task":"concerns-funnel","step":"pm-edits-3","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/073-pm-edits-3-a1","ts":"2026-11-09T06:06:57.120Z"}
 {"type":"step_timeout_armed","task":"concerns-funnel","step":"pm-edits-3","timeoutSec":2700,"ts":"2026-11-09T06:06:57.124Z"}
 {"type":"step_finished","task":"concerns-funnel","step":"pm-edits-3","attempt":1,"status":"ok","sessionId":"01a1beea-bda1-73a3-bdae-5f5ac2f60d7f","usage":{"inputTokens":17327,"outputTokens":5095,"costUsd":0.002752},"ts":"2026-11-09T06:07:36.646Z"}
-{"type":"wave_started","wave":1,"iteration":3,"ts":"2026-11-09T06:07:37.965Z"}
-{"type":"step_started","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--schema-detail-normalize/.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/001-test-first-r1-a1","ts":"2026-11-09T06:07:38.929Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T06:07:38.933Z"}
-{"type":"step_started","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--closeup-triager-cleanup/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/001-test-first-r1-a1","ts":"2026-11-09T06:07:39.128Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T06:07:39.133Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"test-first","attempt":1,"sizeBytes":7160530,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-07-39-490Z_01a1beeb-61e2-7540-93fb-4bed19acde09","ts":"2026-11-09T06:13:39.590Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"test-first","attempt":1,"toolCalls":91,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-07-39-490Z_01a1beeb-61e2-7540-93fb-4bed19acde09","ts":"2026-11-09T06:13:39.590Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1beeb-61e2-7540-93fb-4bed19acde09","usage":{"inputTokens":60544,"outputTokens":26396,"costUsd":0.035585},"ts":"2026-11-09T06:13:43.876Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":1,"sizeBytes":12171400,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-07-39-289Z_01a1beeb-6119-730d-aa0f-66c0c4e70c19","ts":"2026-11-09T06:22:40.860Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":1,"toolCalls":152,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-07-39-289Z_01a1beeb-6119-730d-aa0f-66c0c4e70c19","ts":"2026-11-09T06:22:40.860Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T06:22:43.566Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T06:22:46.348Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":1,"status":"rejected","sessionId":"01a1beeb-6119-730d-aa0f-66c0c4e70c19","usage":{"inputTokens":176118,"outputTokens":103115,"costUsd":0.124302},"ts":"2026-11-09T06:29:54.331Z"}
-{"type":"step_started","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--closeup-triager-cleanup/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/002-develop-r1-a1","ts":"2026-11-09T06:29:57.509Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","timeoutSec":5400,"ts":"2026-11-09T06:29:57.513Z"}
-{"type":"step_started","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--schema-detail-normalize/.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/002-test-first-r1-a2","ts":"2026-11-09T06:29:57.549Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T06:29:57.555Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","attempt":1,"sizeBytes":5482477,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-29-57-891Z_01a1beff-ce03-72a5-9088-677c6dcc87b0","ts":"2026-11-09T06:33:13.593Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T06:33:16.119Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T06:33:18.710Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1beff-ce03-72a5-9088-677c6dcc87b0","usage":{"inputTokens":83596,"outputTokens":19606,"costUsd":0.030458},"ts":"2026-11-09T06:37:00.187Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":2,"sizeBytes":7874761,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T06-29-57-902Z_01a1beff-ce0e-7110-bbf5-a63ad0273d01","ts":"2026-11-09T06:40:14.836Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"schema-detail-normalize","step":"test-first","attempt":2,"status":"rejected","sessionId":"01a1beff-ce0e-7110-bbf5-a63ad0273d01","usage":{"inputTokens":82318,"outputTokens":37998,"costUsd":0.038859},"ts":"2026-11-09T06:40:14.937Z"}
-{"type":"step_started","task":"concerns-funnel","step":"consult-schema-detail-normalize","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1","ts":"2026-11-09T06:40:18.760Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","step":"consult-schema-detail-normalize","timeoutSec":7200,"ts":"2026-11-09T06:40:18.766Z"}
-{"type":"step_started","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--closeup-triager-cleanup/.factory/tasks/concerns-funnel/items/closeup-triager-cleanup/steps/003-develop-r1-a2","ts":"2026-11-09T06:40:18.805Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"closeup-triager-cleanup","step":"develop","timeoutSec":5400,"ts":"2026-11-09T06:40:18.812Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","step":"consult-schema-detail-normalize","attempt":1,"sizeBytes":10740074,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-34-47-765Z_01a1b894-4755-7787-a1ed-8df6c7a062a2.jsonl","ts":"2026-11-09T06:41:36.990Z"}
diff --git a/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/input.md b/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/input.md
deleted file mode 100644
index 8eb16ef..0000000
--- a/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/input.md
+++ /dev/null
@@ -1,881 +0,0 @@
-# Step: Architect Consult (Item)
-
-## Goal
-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
-
-## Rules
-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)
-
-## 0. Snapshot (verified 2026-11-09)
-
-- Repository: `plugins/software-factory` inside worktree `topic_concerns-funnel`; Bun 1.4.4; TypeScript ESM, no build step; deps only `ajv`, `ajv-formats`, `yaml` (`plugins/software-factory/package.json`).
-- Baseline: `cd plugins/software-factory && bun test` → **441 pass, 2 skip, 0 fail** (443 tests / 69 files, 91.3 s).
-- Worktree is clean except engine-owned `.factory/tasks/concerns-funnel/journal.ndjson` (not code).
-- Acceptance definition: `docs/factory.v2.md:89-103` (item 18, concerns + remarkable decisions funnel, human-involvement modes).
-- **Current state: item 18 is substantially implemented.** Store, triage, routing, close-up lifecycle, epic→saga propagation, ADRs, presets, status/state surfacing and prompts exist and are tested. The main visible remainder is documentation:
-  - `docs/ARCHITECTURE.md:39` still marks item 18 as “**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only.”
-  - Neither `docs/ARCHITECTURE.md` (409 lines) nor `README.md` (122 lines) contains any concerns/funnel/human-involvement section (verified by grep; only hits are line 39 and the developer-output row at line 348).
-- Prior iterations recorded their decisions as 14 terse ADRs in `docs/adr/` (3 lines each), directly relevant to the docs work: `adr-concern-store-taskwt.md`, `adr-triage-suggestions-dismiss.md`, `adr-routing-derived-state.md`, `adr-epic-push-condensed.md`, `adr-humaninvolvement-config.md`, `adr-human-router-single.md`, `adr-severity-policy-active.md`, `adr-hydration-single-cap.md`, `adr-funnel-text-budget.md`, `adr-fingerprint-affects-union.md`, `adr-prompt-fragment-matrix.md`, `adr-digest-mailbox.md`, `adr-closeup-lifecycle-resolved.md`, `adr-autonomous-immediate-halt.md`.
-
-## 1. Module Map
-
-| Path | Responsibility | Key refs |
-|---|---|---|
-| `src/core/concerns.ts` | Concern store: fingerprint identity, merge/dedup, one file per id under `{taskDir}/concerns/`, list/count, reviewer triage patches, close-up pending/confirm/resolve, wave fallback, reconcile from committed records. | `:35-44`, `:46`, `:58-60`, `:69-87`, `:122-167`, `:169-215`, `:250-261`, `:264-317`, `:326-342`, `:380-397` |
-| `src/core/triage.ts` | Reviewer triage over `suggestions[]` by exact concern id; the single human-disposition router with severity thresholds and digest semantics; step-role hydration + byte-capped YAML rendering; debt predicate. | `:16-30`, `:35-50`, `:56-75`, `:93-136`, `:143-150`, `:152-165`, `:219-251`, `:254-291`, `:293-349` |
-| `src/core/review-policy.ts` | Triager set (reviewer, plan-reviewer, wave/plan close-up) and allowed-disposition resolution; `dismiss` is added only for triagers, never for non-triagers. | `:4-12`, `:16-24`, `:30-46` |
-| `src/core/flows/step-runner.ts` | Generic ingest of any step output into the concern store (`concerns`/`newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution`), allowlist gate, prompt-var hydration, schema selection. | `:194-306`, `:391-430` |
-| `src/core/flows/item-machine.ts` | Per-step review wiring (`reviewAllowed`, `dispositionsCriteria`), raw human-* question write guarded for concern ids, blocking decision for concern-routed human dispositions. | `:630-650`, `:664-666`, `:712-740`, `:786-806` |
-| `src/core/flows/iteration.ts` | Plan review triage partition (triage ids never request a revision), ADR persistence at plan/revise, autonomous blocking-ADR halt before waves, routed-blocker architect consults per wave. | `:200-229`, `:439-476`, `:514`, `:542-567`, `:600-628`, `:820-846` |
-| `src/core/flows/consults.ts` | `runConcernConsult`: one architect consult per routed blocker; `decisions/concern-<cid>.yaml` is the idempotency guard and the direct resolution carrier. | `:297-370` |
-| `src/core/flows/adrs.ts` | Blocking/non-blocking ADR table (`autonomous`→`human-stop`, `principal`/`detailed`→`human-async`), markdown rendering, mailbox routing (blocking question vs `human-awareness` digest). | `:8-19`, `:23-45`, `:46-72` |
-| `src/core/flows/epic-propagation.ts` | Epic→saga push of open/routed concerns and open remarkables as condensed copies (verbatim ≤120 B; else ≤500 B and half size), blocked-question forwarding, idempotent merge. | `:26-38`, `:40-64`, `:97-130`, `:141-185` |
-| `src/core/derive/task.ts` | Routed blockers (kind `blocker`, status `routed`, severity ≥ threshold) → blocked items + deps; debt collection incl. `isDebtConcern`; `state.yaml` concern counts. | `:52-65`, `:177-197`, `:219-265`, `:369-390`, `:431-440` |
-| `src/core/derive/wave.ts`, `src/core/plan/scheduler.ts` | Blocked-by-concern fixpoint and transitive dependency cascade used by derive, waves and iteration. | `derive/wave.ts:27-57`, `plan/scheduler.ts:68-78` |
-| `src/core/artifacts.ts` | Concern/remarkable/confirm/resolution/source/stored types, `ConcernCounts`, `StateArtifact`, pipeline config fields. | `:124-131`, `:301-378`, `:560-566`, `:568-582` |
-| `src/cli/status.ts` | `factory status` concern counts + separate “Blocking Questions” / “Digest Questions” sections + debt list. | `:83-115`, `:107` |
-| `config/pipeline.default.yaml` | Shipped `humanInvolvement: autonomous`, `concerns` block, commented `autonomous`/`principal`/`detailed` presets, blocking table, `criteria.human-involvement`, `reviewPolicy.default`. | `:370-376`, `:378-425`, `:440-456` |
-| `config/schemas/*.schema.json` | Output contracts carrying concerns: `developer-output`, `review` (`newConcerns`), `plan` (`concerns`, `remarkable`, `adrs`), `decisions`, `fact-finder-output`, `plan-closeup` (+ `concernConfirms`, `concernResolutions`), `wave-closeup` (+ `concernResolutions`), `state` (`concerns` required). | see §2 |
-| `agents/criteria/human-involvement.md` | Mode sections + shared ADR/concern blocking table, filtered to the active mode at render time. | `:1-30` |
-| `agents/criteria/dispositions.md` | Review disposition criteria table (**no `dismiss` row**). | `:1-20` |
-| `agents/steps/*.md` | Terse producer/triager instructions and `{{concernsYaml}}` sections; `review.md:19-24`, `plan-review.md:15`, `qa.md:33-35`, `develop.md:20-24`, `wave-close-up.md:21-24`, `architect-closeup.md:24-27`, `architect-plan.md:14,41`. | — |
-| `test/**` | 18 concerns-related behavior/contract suites (see §4). | — |
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Types (`src/core/artifacts.ts`)
-
-```ts
-export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
-export type ConcernSeverity = "low" | "medium" | "high";
-export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
-
-export interface Concern {
-  id?: string; kind: ConcernKind; summary: string; detail: string;
-  location?: { file: string; line?: number };
-  severity: ConcernSeverity; affects?: string[];
-}
-export interface RemarkableDecision { chosen: string; alternatives: string[]; why: string; }
-export interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string; }
-export interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string; }
-export interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string; }
-export interface ConcernSource { record: string; agent: string; epic?: string; step?: string; item?: string; iteration?: number; escalated?: boolean; lastSeen?: string; }
-export interface PendingConcernResolution { action: "resolve" | "carry" | "propagate"; note?: string; by: string; at: string; }
-export interface StoredConcernArtifact extends Concern {
-  id: string; status: ConcernStatus; disposition?: ReviewDisposition; dismissReason?: string;
-  source: ConcernSource; pendingResolution?: PendingConcernResolution;
-  createdAt: string; updatedAt: string;
-}
-export interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number; }
-```
-`src/core/artifacts.ts:301-378`, `:560-566`; `StateArtifact.concerns` required (`:568-582`).
-
-Pipeline config surface (`src/core/artifacts.ts:124-131`, schema `config/schemas/pipeline.schema.json:202-227`):
-
-```ts
-humanInvolvement?: "autonomous" | "principal" | "detailed";
-concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
-reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
-```
-
-### 2.2 Store API (`src/core/concerns.ts`)
-
-```ts
-export const DEFAULT_RAISE_ALLOWLIST = ["developer","fact-finder","architect","qa","reviewer","plan-reviewer","wave-close-up","plan-close-up"] as const;
-export function severityAtLeast(severity: ConcernSeverity, min: ConcernSeverity): boolean;
-export function concernFingerprint(c: ConcernInput): string;                 // c-<sha256[0..10]>
-export async function aggregateConcerns(ctx, concerns, remarkables = [], opts?): Promise<StoredConcernArtifact[]>;
-export async function listConcerns(taskDir): Promise<StoredConcernArtifact[]>;
-export async function listOpenConcerns(taskDir): Promise<StoredConcernArtifact[]>;
-export async function countConcerns(taskDir): Promise<ConcernCounts>;
-export async function listConcernIds(taskDir): Promise<string[]>;
-export async function applyConcernTriage(ctx: { suggestions; isTriager }): Promise<StoredConcernArtifact[]>;
-export function applyCloseupResolutions(ctx: { resolutions; by }): Promise<StoredConcernArtifact[]>;
-export function applyConcernConfirms(ctx: { confirms }): Promise<StoredConcernArtifact[]>;
-export function applyConcernResolution(ctx: { resolution: {id; action: "resolve"|"carry"; note?}; by }): Promise<StoredConcernArtifact[]>;
-export async function applyWaveCloseupFallback(ctx: { ids?: Iterable<string> }): Promise<StoredConcernArtifact[]>;
-export function partitionSuggestions(suggestions, concernIds): { triage; findings };
-export async function reconcileConcerns(ctx): Promise<StoredConcernArtifact[]>;  // rebuild from committed step records
-```
-Refs: `:35-44`, `:58-60`, `:122-167`, `:169-215`, `:218-228`, `:250-261`, `:264-317`, `:326-342`, `:345-353`, `:380-397`.
-
-### 2.3 Triage / routing / hydration (`src/core/triage.ts`)
-
-```ts
-export interface TriagePartition { triage: ReviewSuggestion[]; findings: ReviewSuggestion[]; fixRequired: boolean }
-export interface ReviewTriageOutcome extends TriagePartition { routed; dismissed; mailboxIds: string[] }
-export class TriageValidationError extends Error {}
-export function partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition;
-export function concernMailboxId(concernId: string): string;                 // q-concern-<id>
-export const DEFAULT_CONCERN_SEVERITY_POLICY = { minDigestSeverity: "medium", minBlockingSeverity: "high" };
-export function resolveConcernSeverityPolicy(concerns?): ConcernSeverityPolicy;
-export async function routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>;
-export function isDebtConcern(c): boolean;
-export async function listHydratedConcerns(taskDir, consumer): Promise<Array<Record<string, unknown>>>;
-export async function hydrateStepConcerns(taskDir, request: { stepRole; inputBytes?; diffBytes?; taskDiffBytes?; consumer? }): Promise<string>;
-export function renderConcernsYaml(records, maxBytes = 8000): string;
-export async function applyReviewTriage(ctx): Promise<ReviewTriageOutcome>;
-```
-Refs: `:16-30`, `:32`, `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-150`, `:219-251`, `:254-291`, `:293-349`.
-
-### 2.4 Review policy (`src/core/review-policy.ts`)
-
-```ts
-export const BUILTIN_REVIEW_DISPOSITIONS = ["fix","optional","architect","human-awareness","human-async"] as const;
-export function isTriagerAgent(agent: string): boolean;   // reviewer | plan-reviewer | wave-close-up | plan-close-up
-export function resolveReviewAllowed(pipeline, agent, isTriager): string[]; // + dismiss iff triager
-```
-`:4-12`, `:16-24`, `:30-46`.
-
-### 2.5 ADR + propagation APIs
-
-```ts
-// src/core/flows/adrs.ts
-export function blockingAdrDisposition(mode): "human-stop" | "human-async";  // principal|detailed -> human-async
-export function renderAdrMarkdown(adr: PlanAdr): string;                     // # title / ## Context / ## Decision / ## Consequences / ## Blocking
-export async function persistAdrs(opts: { taskWt; taskDir; adrFolder?; adrs: PlanAdr[]; mode }): Promise<void>;
-
-// src/core/flows/epic-propagation.ts
-export interface PropagateEpicConcernsOptions { childTaskDir; parentTaskDir; parentWt; epic; concernIds?: Iterable<string> }
-export async function propagateEpicConcerns(opts): Promise<void>;
-```
-`adrs.ts:8-72`; `epic-propagation.ts:26-185`.
-
-### 2.6 Step-runner wiring
-
-`runAgentStep` resolves `allowedDispositions = resolveReviewAllowed(pipeline, agent, isTriagerAgent(agent))` and the output schema (`step-runner.ts:391-396`), then hydrates `concernsYaml` when the fragment declares it and the caller did not supply it (`:400-430`): review/QA by `diffBytes`; wave/plan close-ups by the task-branch diff; everything else by the sum of non-excluded prompt vars. After a successful step, `ingestStepConcerns` (`:194-306`) is the single write path.
-
-## 3. Relevant Excerpts
-
-### 3.1 Identity and merge (fingerprint excludes `affects`; union merge)
-`src/core/concerns.ts:51-60`, `:69-87`
-
-```ts
-const hash = (prefix, parts) => `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
-export function concernFingerprint(c: ConcernInput): string {
-  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
-}
-// mergeConcern: detail = longer of existing/incoming; severity = max;
-// escalated = prior escalated || incoming severity > existing;
-// affects = union; status/disposition preserved; source.lastSeen advanced
-```
-Same code computes `rm-<sha>` for remarkables from `[chosen, alternatives]` (`:53`).
-
-### 3.2 Aggregation commits to the task worktree
-`src/core/concerns.ts:122-167`
-
-```ts
-export async function aggregateConcerns(ctx, concerns, remarkables = [], opts = {}) {
-  // validates kind/summary/severity and remarkable chosen/alternatives/why
-  // KeyedMutex per taskDir; one <id>.yaml per fingerprint; legacy rename-merge
-  if (dirty && opts.commit !== false) {
-    if (!ctx.repo) throw new Error("aggregateConcerns requires repo when committing");
-    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
-  }
-}
-```
-Store location is `path.join(taskDir, "concerns")` (`:47`); item steps still write it on the task worktree (ADR `adr-concern-store-taskwt.md`). Startup commits a pre-existing `concerns/` before stray-dirt repair and calls `reconcileConcerns` (`src/core/engine.ts:342-346`, `:384-393`).
-
-### 3.3 Dismiss keeps the file, requires a reason
-`src/core/concerns.ts:250-261`
-
-```ts
-export async function applyConcernTriage(ctx) {
-  if (!ctx.isTriager) return [];
-  const ops = ctx.suggestions.map((s) => [s.id, (record) => s.disposition === "dismiss"
-    ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
-    : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }]);
-  return mutate(ctx, ops, "factory: concerns triaged");
-}
-```
-`applyReviewTriage` rejects `dismiss` without detail before any write (`triage.ts:304-310`) and routes human/remarkable dispositions through one router (`:317-345`).
-
-### 3.4 Single human router with severity thresholds
-`src/core/triage.ts:98-136`
-
-```ts
-const isRemarkable = suggestion.id.startsWith("rm-");
-const isHuman = ["human-awareness","human-async","human-stop"].includes(suggestion.disposition);
-const dismissedEscalated = suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
-if (!isHuman && !isRemarkable && !dismissedEscalated) return undefined;
-const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
-const blocking = !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
-// below minDigestSeverity -> no mailbox entry (rm-* exempt)
-// blocks: human-stop -> [item, task] / task; human-async -> [item] / task; others []
-```
-Mailbox ids are `q-concern-<concernId>` (`:52-54`) or `q-escalated-<id>` for a dismissed escalated concern (`:117-119`).
-
-### 3.5 Hydration caps and rendering
-`src/core/triage.ts:234-291`
-
-```ts
-const cap = role === "review" || role === "qa" ? Math.min(request.diffBytes ?? 0, 2000)
-  : role === "wave-close-up" || role === "plan-close-up" ? Math.min(request.taskDiffBytes ?? 0, 2000)
-  : Math.min(request.inputBytes ?? 0, 500);
-// renderConcernsYaml: try full, then drop affects, then shrink summaries (80→1 chars), shedding trailing records
-```
-Consumers (`:219-232`): `review`/`develop`/`qa`/`plan-review` see open; `closeup`/`architect` also see routed; only `architect` sees dismissed-but-escalated. Terse records omit `detail` (`:152-165`).
-
-### 3.6 Step ingest order (allowlist → existing ids → aggregate → triage → resolutions → confirms → fallback)
-`src/core/flows/step-runner.ts:194-306`
-
-```ts
-const allowlist = opts.pipeline.concerns?.raiseAllowlist ?? DEFAULT_RAISE_ALLOWLIST;
-if (concerns.length > 0 && !allowlist.includes(opts.source.agent)) {
-  await appendJournal(opts.taskDir, { type: "concern_ingest_skipped", ... }); concerns = [];
-}
-// triage only ids that existed before this step, so new concerns cannot self-dismiss
-const existing = <concerns/*.yaml basenames>;
-await aggregateConcerns(...);
-const triage = suggestions.length ? await applyReviewTriage({ ...ctx, concernIds: existing, isTriager: isTriagerAgent(agent), ... });
-// concernResolution honored only for consult-concern-<id>, architect-closeup*, architect-wave-report*
-// concernConfirms applied only for agent === "architect"; accepted propagate ids pushed to the parent task
-// wave-close-up: applyWaveCloseupFallback({ ids: existing })
-```
-
-### 3.7 Item-machine guards (single-writer for concern-id human dispositions)
-`src/core/flows/item-machine.ts:664-666`, `:712-740`, `:786-806`
-
-```ts
-const concernIds = new Set(await listConcernIds(taskDir));
-// raw human-* question writer skips ids in concernIds
-// hasHumanBlock: human-async/stop is decided by whether the router wrote an open blocking question
-// hasIssues: any fix suggestion, or human-stop for a non-concern id
-```
-
-### 3.8 Routed blockers: derive blocks, iteration consults
-`src/core/derive/task.ts:52-65`, `src/core/plan/scheduler.ts:68-78`, `src/core/flows/iteration.ts:200-229`, `:820-846`
-
-```ts
-export async function collectRoutedBlockers(taskDir, minBlockingSeverity = "high") {
-  for (const concern of await listConcerns(taskDir)) {
-    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
-    if (!severityAtLeast(concern.severity, minBlockingSeverity)) continue;
-    for (const slug of concern.affects ?? []) affected.add(slug);
-  }
-}
-// blockedByConcern seeds pending items named by routed blockers, then cascadePendingBlocked;
-// consultRoutedBlockers runs one runConcernConsult per blocker affecting a blocked wave item.
-```
-A consult's decision file `decisions/concern-<cid>.yaml` is created once (`consults.ts:319-324`); `concernResolution` is applied on commit, so the next derive unblocks (ADR `adr-closeup-lifecycle-resolved.md`).
-
-### 3.9 Tech debt derivation
-`src/core/derive/task.ts:219-265`
-
-```ts
-if (plan?.techDebt) debtSet.add(d.description);
-// decisions: accept-with-debt -> d.debt
-for (const concern of await listConcerns(taskDir)) {
-  if (!isDebtConcern(concern)) continue;
-  const item = concern.source?.item ?? concern.affects?.[0];
-  debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
-}
-// review suggestions disposition === "optional" -> `[<item>] <summary>`
-```
-`isDebtConcern` = non-open `tech-debt` concern or `optional` disposition (`triage.ts:143-150`); outstanding debt is passed to architect prompts as `debt` and printed by `factory status`.
-
-### 3.10 ADRs at plan time
-`src/core/flows/adrs.ts:8-19`, `:46-72`; `src/core/flows/iteration.ts:439-455`, `:469-476`, `:614-628`
-
-```ts
-export function blockingAdrDisposition(mode) {
-  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
-}
-// persistAdrs: markdown into project.adrFolder when configured; always writes a question —
-// blocking: disposition per mode + blocks:["task"]; remarkable: disposition "human-awareness" (no blocks)
-// iteration: after plan/revise, if refreshStateYaml.status === "blocked" -> return blocked before waves
-```
-`project.adrFolder` defaults to `docs/adr` (`plugins/software-factory/config/project.template.yaml:11`).
-
-### 3.11 Epic → saga propagation
-`src/core/flows/epic-propagation.ts:40-64`, `:141-185`
-
-```ts
-function condenseText(text) {
-  const size = utf8Bytes(text);
-  return size <= VERBATIM_BYTES /*120*/ ? text
-    : truncateUtf8(text, Math.min(CONDENSED_CAP_BYTES /*500*/, Math.floor(size / 2)));
-}
-// push: open|routed child concerns + open remarkables -> parent store via aggregateConcerns(commit:false)
-// summary prefixed "[epic] "; source {epic, record: `epic:<epic>/<record>`, agent}; copies stay "open"
-// questions with blocks forwarded as q-epic-<epic>-<id> with blocks remapped to the parent item/task
-```
-Called from `runTaskChild` after the child iteration, inside the parent close-up lock/commit (`src/core/engine.ts:271-292`).
-
-### 3.12 Surfacing: status, state, close-ups, prompts
-`src/cli/status.ts:107`; `src/core/derive/task.ts:369-390`
-
-```ts
-console.log(`Concerns: open ${derived.concerns.open} | dismissed ${...} | routed ${...} | resolved ${...}`);
-// state.yaml: concerns: countConcerns(taskDir) (schema requires open/dismissed/routed/resolved)
-```
-`state.schema.json:1-15`, `:72-100`; close-up prompts carry `{{concernsYaml}}` and resolution fields (`agents/steps/wave-close-up.md:21-24`, `plan-close-up.md:24`, `architect-closeup.md:24-27`); architect/hydration consumers receive terse open/routed records (`triage.ts:219-232`).
-
-### 3.13 Shipped config and presets
-`config/pipeline.default.yaml:378-425`
-
-```yaml
-humanInvolvement: autonomous
-concerns:
-  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
-  minDigestSeverity: medium
-  minBlockingSeverity: high
-# Presets — copy the desired mode block into `.factory/pipeline.yaml` or a task `pipeline.yaml` override:
-# humanInvolvement: principal   (+ minDigestSeverity: low, minBlockingSeverity: medium)
-# humanInvolvement: detailed    (+ minDigestSeverity: low, minBlockingSeverity: low)
-# ADR blocking table ...
-```
-Criteria mapping at `:440-456` (`human-involvement: agents/criteria/human-involvement.md`); mode filtering in `formatHumanInvolvementCriteria` (`src/core/prompts.ts:66-88`), dispositions filtering in `formatDispositionsSection` (`:90-113`).
-
-## 4. Existing Tests & Conventions
-
-- Runner: `bun test` (`package.json` scripts). Tests are **behavioral**: real temp git repos + `FakeHarness`; no mocks of the store.
-- Helper `test/helpers/tmp-repo.ts:12-29` (`createTmpRepo`: `writeFile`, `commit`, `git`, `cleanup`) and `FakeHarness.scriptOutcome(label, outcome)` / `scriptComplete(handler)` (`src/harness/fake/fake-harness.ts:34-89`).
-- Engine-level tests call `runTask`/`runAgentStep` with `PipelineConfig` + `ProjectConfig` literals and assert on YAML artifacts, journal events and `git status --porcelain === ""` (no stray files after commits), e.g. `test/engine/concerns-funnel.test.ts:37-124`, `:194-220`, `:347-467`.
-- Contract tests (`test/contracts/`) compile schemas with `createAjv` and compare against `resolveStepSchema` output, asserting inline (no `$ref`) concern/remarkable definitions and strict enums (`test/contracts/concern-schemas.test.ts:10-25`).
-- Tests cite the governing ADR id in their header comment (e.g. `funnel-text-budget.test.ts:1-22`, `hydration-fingerprint-caps.test.ts:30-36`, `closeup-lifecycle-resolve.test.ts:19-30`), which is the project convention for traceability.
-- Concerns-related suites (18):
-
-| Test | Focus |
-|---|---|
-| `test/engine/concerns-funnel.test.ts` | schema gate, fingerprint/merge, aggregation/commit, dismiss, close-up pending, remarkable, concurrency, producer wiring |
-| `test/engine/reviewer-triage.test.ts` | item reviewer triage, allowed dispositions, debt predicate, mailbox ids |
-| `test/engine/plan-reviewer-triage.test.ts` | architect plan concerns triaged by plan-reviewer; triage ids don't request revision |
-| `test/engine/routing-blocker-derive.test.ts` | pure derive blocking of affected items + deps, no writes |
-| `test/engine/routing-architect-consult.test.ts` | routed blocker → one architect consult before wave work |
-| `test/engine/routing-human-debt.test.ts` | human-* routing and tech-debt to plan/status |
-| `test/engine/closeup-lifecycle-resolve.test.ts` | propose/confirm/resolve/carry/propagate, consult unblocks, fallback |
-| `test/engine/epic-saga-propagate.test.ts` | condensed epic→saga copies, byte caps, idempotency, question forwarding |
-| `test/engine/hydration-fingerprint-caps.test.ts` | step-role caps, hydrated sets, fingerprint identity |
-| `test/engine/funnel-text-budget.test.ts` | byte-budget contract (spike-finding test, helpers only) |
-| `test/engine/human-router-severity.test.ts` | severity downgrade/suppression, digest vs blocking, escalated dismiss |
-| `test/engine/state-concern-counts.test.ts` | state.yaml counts |
-| `test/cli/status-concerns.test.ts` | status counts + blocking/digest sections |
-| `test/contracts/concern-schemas.test.ts` | producer schema coverage |
-| `test/contracts/concern-artifact-types.test.ts` | artifact type contract |
-| `test/contracts/state-concern-schema.test.ts` | state schema contract |
-| `test/human-involvement-config.test.ts` | mode config, criteria filtering, presets, per-task layering |
-| `test/review-policy.test.ts` | allowed dispositions incl. triager-only `dismiss` |
-
-- No test asserts documentation content (grep for `ARCHITECTURE` in `test/` only finds fixture files), so docs edits are not test-gated.
-
-## 5. Implementation Status vs Intent (`docs/factory.v2.md:89-103`)
-
-| Intent bullet | Status | Evidence |
-|---|---|---|
-| Structured `concerns[]` in agent outputs | **Done** for developer, fact-finder, architect (plan/decisions), close-ups; reviews use `newConcerns[]` | `config/schemas/developer-output.schema.json:61-90`, `fact-finder-output.schema.json:22-48`, `plan.schema.json:135-159`, `decisions.schema.json:48-72`, `review.schema.json:60-75`, `wave-closeup.schema.json:35-58`, `plan-closeup.schema.json:27-50` |
-| Remarkable decisions/tradeoffs in structured output | **Done** (`remarkable: [{chosen, alternatives, why}]`, `rm-*` store ids) | schemas above; `concerns.ts:53`, `:89-97` |
-| Aggregation under task folder, fingerprint ids, dedup, status, source record | **Done** | `concerns.ts:47-60`, `:122-167`, `:169-215`; statuses open/dismissed/routed/resolved |
-| Reviewer triage with review vocabulary + `dismiss` (reason, kept) | **Done** for reviewer/plan-reviewer | `triage.ts:35-50`, `:293-349`; `review-policy.ts:30-46`; `concerns.ts:250-261` |
-| blocker → dependent items blocked + architect consult | **Done** | `derive/task.ts:52-65`, `plan/scheduler.ts:68-78`, `iteration.ts:200-229`, `consults.ts:319-370` |
-| `architect` → next architect turn | **Done** (routed status + hydration for architect/close-up consumers) | `triage.ts:219-232`, `step-runner.ts:404-430` |
-| `human-*` → steer mailbox per policy | **Done** (severity thresholds; digest-only entries; blocks task/item) | `triage.ts:93-136`; `steer.ts:59-88` |
-| tech debt → plan tech-debt list | **Done** (plan `techDebt`, accept-with-debt, optional suggestions, routed tech-debt concerns) | `derive/task.ts:219-265` |
-| Wave/plan close-ups list concerns, re-triage, architect resolves/carries | **Done via `concernResolutions` + architect `concernConfirms` + wave fallback** (not via review dispositions; see open question 3) | `concerns.ts:264-317`, `:326-342`; `step-runner.ts:257-302`; close-up schemas |
-| Funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text than code | **Done** (hydration byte caps; epic copies condensed to ≤half/≤500 B; open copies) | `triage.ts:234-291`; `epic-propagation.ts:40-64`, `:141-185`; `funnel-text-budget.test.ts` |
-| Saga architect reviews epic items, steers or propagates | **Done generically**: epic copies land in the parent (saga) task store, hydrated to its architect; steering via the root mailbox; proposals confirmed by the architect | `engine.ts:271-292`, `step-runner.ts:308-325`, `epic-propagation.ts:152-185` |
-| Blocking vs non-blocking ADRs; remarkable digest never waits | **Done** (blocking question with `blocks:["task"]` vs `human-awareness`, no blocks) | `adrs.ts:8-72`; `iteration.ts:439-476`, `:614-628` |
-| Presets `autonomous`/`principal`/`detailed` shipped as commented config examples, prompt fragments, per-task selectable | **Done** for config examples + fragment + root-task layer; **epic children do not inherit the parent task layer** (see open question 2) | `pipeline.default.yaml:378-425`; `prompts.ts:66-113`; `agents/criteria/human-involvement.md`; `loader.ts:92-100`; `run.ts:127-133`; `engine.ts:247` |
-| Surfaced in close-ups, `factory status`, state.yaml counts | **Done** | `status.ts:107`; `derive/task.ts:369-390`; close-up prompts; `state.schema.json:72-100` |
-| Update ARCHITECTURE (incl. §1 row 18), README, config commentary | **Not done** for ARCHITECTURE and README; config commentary already updated | `docs/ARCHITECTURE.md:39`; `README.md` (no hits); `pipeline.default.yaml:378-456` |
-| Prompts terse / behavior tests only | **Done** | agent prompts ~20-30 lines; all 18 suites are behavior/contract tests |
-
-## 6. Open Questions & Uncertainties
-
-1. **Documentation gap is the dominant remaining work.** Concretely stale/missing:
-   - `docs/ARCHITECTURE.md:39` — §1 row for item 18 says “deliberately not hand-built … current state: review dispositions and steering mailbox only”; must become an implemented row that records deviations.
-   - `docs/ARCHITECTURE.md:61-85` (§3 module layout) omits `concerns.ts`, `triage.ts`, `review-policy.ts`, `flows/adrs.ts`, `flows/epic-propagation.ts`.
-   - `docs/ARCHITECTURE.md:112-176` (§5) config sample omits `humanInvolvement`, `concerns`, `criteria.human-involvement`, triager-only `dismiss`; line 117 claims “epics inherit parent task layer” (mismatch — see item 2).
-   - `docs/ARCHITECTURE.md:185-198` (§6.2 task folder) omits `concerns/`, `decisions/concern-<id>.yaml`, and `adrFolder` outputs.
-   - `docs/ARCHITECTURE.md:282-295` (§8.7) disposition table omits `dismiss`, exact-id triage rules, severity thresholds and the human router; no section describes the store/funnel at all (natural placement: new §8.11 or §18; §8.8 ends at line 300).
-   - `docs/ARCHITECTURE.md:339-357` (§10) output column omits `newConcerns[]`, `remarkable`, `concernResolutions`, `concernConfirms`, `adrs`; lines 352-353 claim close-ups output “wave-closeup + review” although their schemas have no `suggestions`.
-   - `docs/ARCHITECTURE.md:404-406` (§13) test list does not mention the 18 concerns suites.
-   - `README.md:71-86` (config hierarchy) has no per-task mode example; `README.md:99-105` (docs index) has no funnel/concerns pointer; README has zero mentions of concerns/humanInvolvement/ADR.
-2. **Epic config inheritance mismatch (behavior).** ARCHITECTURE §5 says epics inherit the parent task layer (`docs/ARCHITECTURE.md:117`), but `runTaskChild` calls `pipelineFor(childTaskDir)` (`src/core/engine.ts:247`) and `pipelineFor` loads only `<taskDir>/pipeline.yaml` (`src/cli/run.ts:127-133`). Consequence: `humanInvolvement`, `concerns.*`, `reviewPolicy` set in a root task's `pipeline.yaml` do **not** apply inside its epics; “selectable per task” is root-only today. Decide: implement parent-layer inheritance (new test) or document the deviation in §1/§5/§18.
-3. **Close-up disposition triage is unreachable.** `isTriagerAgent` returns true for `wave-close-up`/`plan-close-up` (`src/core/review-policy.ts:16-24`) and the ingest path would triage their `suggestions[]` (`step-runner.ts:243-257`), but `config/schemas/wave-closeup.schema.json` and `plan-closeup.schema.json` set `additionalProperties: false` and define no `suggestions`, so schema validation rejects any such output. Re-triage currently works through `concernResolutions` + architect `concernConfirms` + `applyWaveCloseupFallback`. Decide: add `suggestions` to close-up schemas (and prompt section) or drop close-ups from `isTriagerAgent` and correct §10/§8.7 wording.
-4. **`dismiss` missing from the shared criteria file.** `agents/criteria/dispositions.md:1-20` documents fix/optional/architect/human-awareness/human-async/human-stop but not `dismiss`, while `formatDispositionsSection` advertises `dismiss` as allowed for triagers (`src/core/prompts.ts:90-113`), `review.md:21-23` / `plan-review.md:15` require `detail`, and `triage.ts:304-310` enforces it. Either add the row (docs/prompt fix) or reconsider the prompt instructions.
-5. **Producer coverage is not literally “every agent output”.** `triage.schema.json` and `infra.schema.json` have no `concerns`/`remarkable`, and the default allowlist excludes triage/infra/pm (`concerns.ts:35-44`); a raising agent outside the allowlist is silently journaled as `concern_ingest_skipped` (`step-runner.ts:221-232`). The contract test deliberately lists only developer/fact-finder/plan/decisions/close-ups (`test/contracts/concern-schemas.test.ts:10-25`). Confirm and document the exclusion set, or extend schemas+allowlist.
-6. **Zero-diff close-up hydration is empty.** Close-ups cap at `min(taskDiffBytes, 2000)` (`triage.ts:236-240`, `step-runner.ts:417-424`); a close-up on a branch with no diff since the parent tip gets cap 0 and therefore no open concerns to triage. The byte-budget spike documents a 0-byte budget case as valid (`test/engine/funnel-text-budget.test.ts:402-408`). Confirm whether a no-diff close-up should see a 500-byte input-based budget instead.
-7. **Propagated epic concerns cannot block the epic item.** `concernCopy` preserves child `affects` slugs (`epic-propagation.ts:141-150`), while parent `collectRoutedBlockers` matches parent item slugs (`derive/task.ts:52-65`). The module header states copies stay open and only forwarded questions can block the parent (`epic-propagation.ts:20-25, 152-160`), and the test asserts that intent (`test/engine/epic-saga-propagate.test.ts:13-20`). Document this as the intended funnel semantic (saga architect resolves/steers; epic-level questions block).
-8. **ADR format inconsistency.** `renderAdrMarkdown` writes `# title / ## Context / ## Decision / ## Consequences / ## Blocking` (`adrs.ts:23-45`), but the 14 existing `docs/adr/*.md` files are 3-line context-only notes (e.g. `docs/adr/adr-concern-store-taskwt.md`). The docs update should state the canonical generated format and whether the existing notes are historical.
-9. **`autonomous` deviation.** Spec line 100 says autonomous blocks only “for the portion still blocked after everything unblocked is done”; implementation halts immediately at plan time on a blocking ADR (`iteration.ts:469-476`) and records this as accepted in `docs/adr/adr-autonomous-immediate-halt.md`. This deviation must appear in the §1 row / §18 section.
-10. **`factory status` surfaces counts and mailbox digests, not the concern list.** Intent only requires counts; the current output prints counts plus blocking/digest question sections (`status.ts:83-115`) and debt. If the architect wants per-concern visibility, that is new behavior with a `status-concerns` test extension.
-11. **No preflight validation of `concerns.raiseAllowlist` entries.** Only the pipeline JSON schema validates the shape (`pipeline.schema.json:207-227`); an unknown agent name is accepted and silently never matches `source.agent` (`step-runner.ts:219-232`). Consider a preflight warning or document it.
-12. **Saga depth.** Epics are depth-1 only (`docs/ARCHITECTURE.md:279-281`, `flows` limits); “saga architect” is the root task architect and propagation is one level (`engine.ts:271-292`). Doc wording should not imply deeper recursion.
-
-## 7. Recommendations for the Architect
-
-1. Treat the store/triage/routing/funnel APIs as **frozen**: `concerns.ts`, `triage.ts`, `review-policy.ts`, `adrs.ts`, `epic-propagation.ts` are implemented and covered by 18 suites. Do not re-plan them; plan documentation and only the explicitly chosen consistency fixes.
-2. Make the next iteration a documentation-closure milestone:
-   - rewrite `docs/ARCHITECTURE.md:39` (§1 row 18) to “implemented” with the deviations from open questions 2/3/7/9;
-   - add a funnel section (e.g. §8.11 “Concerns, remarkable decisions, ADRs, human-involvement modes”) covering store layout `{task}/concerns/{c-*,rm-*}.yaml`, fingerprint/dedup, statuses, triage contract (`suggestions[]` by exact id, triager-only `dismiss` with reason), routing table (blocker/architect/human-*/tech-debt), close-up propose→architect confirm, epic→saga condensing, ADR blocking table, presets + per-task layer;
-   - update §3 module layout, §5 config sample, §6.2 task folder, §8.7 disposition table, §10 agent output column, §13 test list;
-   - add a README section (“Concerns & human involvement”) with a per-task `pipeline.yaml` mode example and the `factory status` counts/digest output.
-3. Add the missing `dismiss` row to `agents/criteria/dispositions.md` (one table row + rule) so the advertised vocabulary is fully documented; this is a prompt-surface fix, still terse.
-4. Decide explicitly (and record in the plan ADRs) whether to fix or document the two behavioral mismatches: epic→parent task config inheritance and close-up `suggestions` triage. Each fix needs one behavior test near the existing suites; documenting needs one §1-row deviation sentence.
-5. Keep behavior tests only; docs changes need no tests. For behavior changes, extend `test/human-involvement-config.test.ts` (config layering) and `test/engine/closeup-lifecycle-resolve.test.ts` (close-up triage) rather than new files.
-6. Verification commands: `cd plugins/software-factory && bun test` (baseline 441 pass / 2 skip / 0 fail) and `bun run typecheck` (`tsc --noEmit`).`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
-
-## Item
-schema-detail-normalize
-
-## Assignment
-{"slug":"schema-detail-normalize","kind":"dev","title":"Lowercase detail in producer schemas + merge fix","assignment":"Normalize concern Detail->detail to lowercase in 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json for consistency. Fix concerns.ts:72 mergeConcern read from existing?.Detail to existing?.detail (longest-wins). Fix 3 test reads in test/engine/epic-saga-propagate.test.ts:307/313/319 from .Detail to .detail. Contract: step-runner validates producer outputs against the 6 schemas — lowercase detail accepted, capital-D Detail rejected with step error before any store write. Tests: contract suite lowercase passes / capital-D rejected + longest-wins test (200-byte stored detail survives 20-byte re-emit). Do NOT touch triage/infra/pm-edit. Baseline is RED (typecheck + concern-schemas + epic-saga reads); this item is part of red-to-green. Verify: typecheck + TMPDIR=/tmp bun test.","outlineRef":"schema-detail-normalize","milestone":"m1-contracts-consistency","wave":1,"scenarioRefs":["m1-contracts-consistency:1","m1-contracts-consistency:2"],"citations":["docs/factory.v2.md:89-103","plugins/software-factory/src/core/artifacts.ts:313-325"]}
-
-## Prior Attempts & Failures
-2 attempts recorded for test-first (all rejected); next would be 3 > max 2
-
-Failing checks:
-[target-red] No target specified for target-red check
-
-## Current Diff
-.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/001-test-first-r1-a1/input.md +60/-0
-.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/001-test-first-r1-a1/meta.yaml +22/-0
-.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/002-test-first-r1-a2/checks.yaml +12/-0
-.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/002-test-first-r1-a2/input.md +66/-0
-.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/002-test-first-r1-a2/meta.yaml +19/-0
-.factory/tasks/concerns-funnel/items/schema-detail-normalize/steps/002-test-first-r1-a2/output.yaml +56/-0
-plugins/software-factory/test/contracts/schema-detail-normalize.test.ts +237/-0
-
-## Review Feedback
-Failing check: target-red
-
-Message: No target specified for target-red check
-
-## Context Pack
-# Context Pack — concerns-funnel (Spec Item 18)
-
-## 0. Snapshot (verified 2026-11-09)
-
-- Repository: `plugins/software-factory` inside worktree `topic_concerns-funnel`; Bun 1.4.4; TypeScript ESM, no build step; deps only `ajv`, `ajv-formats`, `yaml` (`plugins/software-factory/package.json`).
-- Baseline: `cd plugins/software-factory && bun test` → **441 pass, 2 skip, 0 fail** (443 tests / 69 files, 91.3 s).
-- Worktree is clean except engine-owned `.factory/tasks/concerns-funnel/journal.ndjson` (not code).
-- Acceptance definition: `docs/factory.v2.md:89-103` (item 18, concerns + remarkable decisions funnel, human-involvement modes).
-- **Current state: item 18 is substantially implemented.** Store, triage, routing, close-up lifecycle, epic→saga propagation, ADRs, presets, status/state surfacing and prompts exist and are tested. The main visible remainder is documentation:
-  - `docs/ARCHITECTURE.md:39` still marks item 18 as “**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only.”
-  - Neither `docs/ARCHITECTURE.md` (409 lines) nor `README.md` (122 lines) contains any concerns/funnel/human-involvement section (verified by grep; only hits are line 39 and the developer-output row at line 348).
-- Prior iterations recorded their decisions as 14 terse ADRs in `docs/adr/` (3 lines each), directly relevant to the docs work: `adr-concern-store-taskwt.md`, `adr-triage-suggestions-dismiss.md`, `adr-routing-derived-state.md`, `adr-epic-push-condensed.md`, `adr-humaninvolvement-config.md`, `adr-human-router-single.md`, `adr-severity-policy-active.md`, `adr-hydration-single-cap.md`, `adr-funnel-text-budget.md`, `adr-fingerprint-affects-union.md`, `adr-prompt-fragment-matrix.md`, `adr-digest-mailbox.md`, `adr-closeup-lifecycle-resolved.md`, `adr-autonomous-immediate-halt.md`.
-
-## 1. Module Map
-
-| Path | Responsibility | Key refs |
-|---|---|---|
-| `src/core/concerns.ts` | Concern store: fingerprint identity, merge/dedup, one file per id under `{taskDir}/concerns/`, list/count, reviewer triage patches, close-up pending/confirm/resolve, wave fallback, reconcile from committed records. | `:35-44`, `:46`, `:58-60`, `:69-87`, `:122-167`, `:169-215`, `:250-261`, `:264-317`, `:326-342`, `:380-397` |
-| `src/core/triage.ts` | Reviewer triage over `suggestions[]` by exact concern id; the single human-disposition router with severity thresholds and digest semantics; step-role hydration + byte-capped YAML rendering; debt predicate. | `:16-30`, `:35-50`, `:56-75`, `:93-136`, `:143-150`, `:152-165`, `:219-251`, `:254-291`, `:293-349` |
-| `src/core/review-policy.ts` | Triager set (reviewer, plan-reviewer, wave/plan close-up) and allowed-disposition resolution; `dismiss` is added only for triagers, never for non-triagers. | `:4-12`, `:16-24`, `:30-46` |
-| `src/core/flows/step-runner.ts` | Generic ingest of any step output into the concern store (`concerns`/`newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution`), allowlist gate, prompt-var hydration, schema selection. | `:194-306`, `:391-430` |
-| `src/core/flows/item-machine.ts` | Per-step review wiring (`reviewAllowed`, `dispositionsCriteria`), raw human-* question write guarded for concern ids, blocking decision for concern-routed human dispositions. | `:630-650`, `:664-666`, `:712-740`, `:786-806` |
-| `src/core/flows/iteration.ts` | Plan review triage partition (triage ids never request a revision), ADR persistence at plan/revise, autonomous blocking-ADR halt before waves, routed-blocker architect consults per wave. | `:200-229`, `:439-476`, `:514`, `:542-567`, `:600-628`, `:820-846` |
-| `src/core/flows/consults.ts` | `runConcernConsult`: one architect consult per routed blocker; `decisions/concern-<cid>.yaml` is the idempotency guard and the direct resolution carrier. | `:297-370` |
-| `src/core/flows/adrs.ts` | Blocking/non-blocking ADR table (`autonomous`→`human-stop`, `principal`/`detailed`→`human-async`), markdown rendering, mailbox routing (blocking question vs `human-awareness` digest). | `:8-19`, `:23-45`, `:46-72` |
-| `src/core/flows/epic-propagation.ts` | Epic→saga push of open/routed concerns and open remarkables as condensed copies (verbatim ≤120 B; else ≤500 B and half size), blocked-question forwarding, idempotent merge. | `:26-38`, `:40-64`, `:97-130`, `:141-185` |
-| `src/core/derive/task.ts` | Routed blockers (kind `blocker`, status `routed`, severity ≥ threshold) → blocked items + deps; debt collection incl. `isDebtConcern`; `state.yaml` concern counts. | `:52-65`, `:177-197`, `:219-265`, `:369-390`, `:431-440` |
-| `src/core/derive/wave.ts`, `src/core/plan/scheduler.ts` | Blocked-by-concern fixpoint and transitive dependency cascade used by derive, waves and iteration. | `derive/wave.ts:27-57`, `plan/scheduler.ts:68-78` |
-| `src/core/artifacts.ts` | Concern/remarkable/confirm/resolution/source/stored types, `ConcernCounts`, `StateArtifact`, pipeline config fields. | `:124-131`, `:301-378`, `:560-566`, `:568-582` |
-| `src/cli/status.ts` | `factory status` concern counts + separate “Blocking Questions” / “Digest Questions” sections + debt list. | `:83-115`, `:107` |
-| `config/pipeline.default.yaml` | Shipped `humanInvolvement: autonomous`, `concerns` block, commented `autonomous`/`principal`/`detailed` presets, blocking table, `criteria.human-involvement`, `reviewPolicy.default`. | `:370-376`, `:378-425`, `:440-456` |
-| `config/schemas/*.schema.json` | Output contracts carrying concerns: `developer-output`, `review` (`newConcerns`), `plan` (`concerns`, `remarkable`, `adrs`), `decisions`, `fact-finder-output`, `plan-closeup` (+ `concernConfirms`, `concernResolutions`), `wave-closeup` (+ `concernResolutions`), `state` (`concerns` required). | see §2 |
-| `agents/criteria/human-involvement.md` | Mode sections + shared ADR/concern blocking table, filtered to the active mode at render time. | `:1-30` |
-| `agents/criteria/dispositions.md` | Review disposition criteria table (**no `dismiss` row**). | `:1-20` |
-| `agents/steps/*.md` | Terse producer/triager instructions and `{{concernsYaml}}` sections; `review.md:19-24`, `plan-review.md:15`, `qa.md:33-35`, `develop.md:20-24`, `wave-close-up.md:21-24`, `architect-closeup.md:24-27`, `architect-plan.md:14,41`. | — |
-| `test/**` | 18 concerns-related behavior/contract suites (see §4). | — |
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Types (`src/core/artifacts.ts`)
-
-```ts
-export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
-export type ConcernSeverity = "low" | "medium" | "high";
-export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
-
-export interface Concern {
-  id?: string; kind: ConcernKind; summary: string; detail: string;
-  location?: { file: string; line?: number };
-  severity: ConcernSeverity; affects?: string[];
-}
-export interface RemarkableDecision { chosen: string; alternatives: string[]; why: string; }
-export interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string; }
-export interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string; }
-export interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string; }
-export interface ConcernSource { record: string; agent: string; epic?: string; step?: string; item?: string; iteration?: number; escalated?: boolean; lastSeen?: string; }
-export interface PendingConcernResolution { action: "resolve" | "carry" | "propagate"; note?: string; by: string; at: string; }
-export interface StoredConcernArtifact extends Concern {
-  id: string; status: ConcernStatus; disposition?: ReviewDisposition; dismissReason?: string;
-  source: ConcernSource; pendingResolution?: PendingConcernResolution;
-  createdAt: string; updatedAt: string;
-}
-export interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number; }
-```
-`src/core/artifacts.ts:301-378`, `:560-566`; `StateArtifact.concerns` required (`:568-582`).
-
-Pipeline config surface (`src/core/artifacts.ts:124-131`, schema `config/schemas/pipeline.schema.json:202-227`):
-
-```ts
-humanInvolvement?: "autonomous" | "principal" | "detailed";
-concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
-reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
-```
-
-### 2.2 Store API (`src/core/concerns.ts`)
-
-```ts
-export const DEFAULT_RAISE_ALLOWLIST = ["developer","fact-finder","architect","qa","reviewer","plan-reviewer","wave-close-up","plan-close-up"] as const;
-export function severityAtLeast(severity: ConcernSeverity, min: ConcernSeverity): boolean;
-export function concernFingerprint(c: ConcernInput): string;                 // c-<sha256[0..10]>
-export async function aggregateConcerns(ctx, concerns, remarkables = [], opts?): Promise<StoredConcernArtifact[]>;
-export async function listConcerns(taskDir): Promise<StoredConcernArtifact[]>;
-export async function listOpenConcerns(taskDir): Promise<StoredConcernArtifact[]>;
-export async function countConcerns(taskDir): Promise<ConcernCounts>;
-export async function listConcernIds(taskDir): Promise<string[]>;
-export async function applyConcernTriage(ctx: { suggestions; isTriager }): Promise<StoredConcernArtifact[]>;
-export function applyCloseupResolutions(ctx: { resolutions; by }): Promise<StoredConcernArtifact[]>;
-export function applyConcernConfirms(ctx: { confirms }): Promise<StoredConcernArtifact[]>;
-export function applyConcernResolution(ctx: { resolution: {id; action: "resolve"|"carry"; note?}; by }): Promise<StoredConcernArtifact[]>;
-export async function applyWaveCloseupFallback(ctx: { ids?: Iterable<string> }): Promise<StoredConcernArtifact[]>;
-export function partitionSuggestions(suggestions, concernIds): { triage; findings };
-export async function reconcileConcerns(ctx): Promise<StoredConcernArtifact[]>;  // rebuild from committed step records
-```
-Refs: `:35-44`, `:58-60`, `:122-167`, `:169-215`, `:218-228`, `:250-261`, `:264-317`, `:326-342`, `:345-353`, `:380-397`.
-
-### 2.3 Triage / routing / hydration (`src/core/triage.ts`)
-
-```ts
-export interface TriagePartition { triage: ReviewSuggestion[]; findings: ReviewSuggestion[]; fixRequired: boolean }
-export interface ReviewTriageOutcome extends TriagePartition { routed; dismissed; mailboxIds: string[] }
-export class TriageValidationError extends Error {}
-export function partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition;
-export function concernMailboxId(concernId: string): string;                 // q-concern-<id>
-export const DEFAULT_CONCERN_SEVERITY_POLICY = { minDigestSeverity: "medium", minBlockingSeverity: "high" };
-export function resolveConcernSeverityPolicy(concerns?): ConcernSeverityPolicy;
-export async function routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>;
-export function isDebtConcern(c): boolean;
-export async function listHydratedConcerns(taskDir, consumer): Promise<Array<Record<string, unknown>>>;
-export async function hydrateStepConcerns(taskDir, request: { stepRole; inputBytes?; diffBytes?; taskDiffBytes?; consumer? }): Promise<string>;
-export function renderConcernsYaml(records, maxBytes = 8000): string;
-export async function applyReviewTriage(ctx): Promise<ReviewTriageOutcome>;
-```
-Refs: `:16-30`, `:32`, `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-150`, `:219-251`, `:254-291`, `:293-349`.
-
-### 2.4 Review policy (`src/core/review-policy.ts`)
-
-```ts
-export const BUILTIN_REVIEW_DISPOSITIONS = ["fix","optional","architect","human-awareness","human-async"] as const;
-export function isTriagerAgent(agent: string): boolean;   // reviewer | plan-reviewer | wave-close-up | plan-close-up
-export function resolveReviewAllowed(pipeline, agent, isTriager): string[]; // + dismiss iff triager
-```
-`:4-12`, `:16-24`, `:30-46`.
-
-### 2.5 ADR + propagation APIs
-
-```ts
-// src/core/flows/adrs.ts
-export function blockingAdrDisposition(mode): "human-stop" | "human-async";  // principal|detailed -> human-async
-export function renderAdrMarkdown(adr: PlanAdr): string;                     // # title / ## Context / ## Decision / ## Consequences / ## Blocking
-export async function persistAdrs(opts: { taskWt; taskDir; adrFolder?; adrs: PlanAdr[]; mode }): Promise<void>;
-
-// src/core/flows/epic-propagation.ts
-export interface PropagateEpicConcernsOptions { childTaskDir; parentTaskDir; parentWt; epic; concernIds?: Iterable<string> }
-export async function propagateEpicConcerns(opts): Promise<void>;
-```
-`adrs.ts:8-72`; `epic-propagation.ts:26-185`.
-
-### 2.6 Step-runner wiring
-
-`runAgentStep` resolves `allowedDispositions = resolveReviewAllowed(pipeline, agent, isTriagerAgent(agent))` and the output schema (`step-runner.ts:391-396`), then hydrates `concernsYaml` when the fragment declares it and the caller did not supply it (`:400-430`): review/QA by `diffBytes`; wave/plan close-ups by the task-branch diff; everything else by the sum of non-excluded prompt vars. After a successful step, `ingestStepConcerns` (`:194-306`) is the single write path.
-
-## 3. Relevant Excerpts
-
-### 3.1 Identity and merge (fingerprint excludes `affects`; union merge)
-`src/core/concerns.ts:51-60`, `:69-87`
-
-```ts
-const hash = (prefix, parts) => `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
-export function concernFingerprint(c: ConcernInput): string {
-  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
-}
-// mergeConcern: detail = longer of existing/incoming; severity = max;
-// escalated = prior escalated || incoming severity > existing;
-// affects = union; status/disposition preserved; source.lastSeen advanced
-```
-Same code computes `rm-<sha>` for remarkables from `[chosen, alternatives]` (`:53`).
-
-### 3.2 Aggregation commits to the task worktree
-`src/core/concerns.ts:122-167`
-
-```ts
-export async function aggregateConcerns(ctx, concerns, remarkables = [], opts = {}) {
-  // validates kind/summary/severity and remarkable chosen/alternatives/why
-  // KeyedMutex per taskDir; one <id>.yaml per fingerprint; legacy rename-merge
-  if (dirty && opts.commit !== false) {
-    if (!ctx.repo) throw new Error("aggregateConcerns requires repo when committing");
-    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
-  }
-}
-```
-Store location is `path.join(taskDir, "concerns")` (`:47`); item steps still write it on the task worktree (ADR `adr-concern-store-taskwt.md`). Startup commits a pre-existing `concerns/` before stray-dirt repair and calls `reconcileConcerns` (`src/core/engine.ts:342-346`, `:384-393`).
-
-### 3.3 Dismiss keeps the file, requires a reason
-`src/core/concerns.ts:250-261`
-
-```ts
-export async function applyConcernTriage(ctx) {
-  if (!ctx.isTriager) return [];
-  const ops = ctx.suggestions.map((s) => [s.id, (record) => s.disposition === "dismiss"
-    ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
-    : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }]);
-  return mutate(ctx, ops, "factory: concerns triaged");
-}
-```
-`applyReviewTriage` rejects `dismiss` without detail before any write (`triage.ts:304-310`) and routes human/remarkable dispositions through one router (`:317-345`).
-
-### 3.4 Single human router with severity thresholds
-`src/core/triage.ts:98-136`
-
-```ts
-const isRemarkable = suggestion.id.startsWith("rm-");
-const isHuman = ["human-awareness","human-async","human-stop"].includes(suggestion.disposition);
-const dismissedEscalated = suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
-if (!isHuman && !isRemarkable && !dismissedEscalated) return undefined;
-const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
-const blocking = !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
-// below minDigestSeverity -> no mailbox entry (rm-* exempt)
-// blocks: human-stop -> [item, task] / task; human-async -> [item] / task; others []
-```
-Mailbox ids are `q-concern-<concernId>` (`:52-54`) or `q-escalated-<id>` for a dismissed escalated concern (`:117-119`).
-
-### 3.5 Hydration caps and rendering
-`src/core/triage.ts:234-291`
-
-```ts
-const cap = role === "review" || role === "qa" ? Math.min(request.diffBytes ?? 0, 2000)
-  : role === "wave-close-up" || role === "plan-close-up" ? Math.min(request.taskDiffBytes ?? 0, 2000)
-  : Math.min(request.inputBytes ?? 0, 500);
-// renderConcernsYaml: try full, then drop affects, then shrink summaries (80→1 chars), shedding trailing records
-```
-Consumers (`:219-232`): `review`/`develop`/`qa`/`plan-review` see open; `closeup`/`architect` also see routed; only `architect` sees dismissed-but-escalated. Terse records omit `detail` (`:152-165`).
-
-### 3.6 Step ingest order (allowlist → existing ids → aggregate → triage → resolutions → confirms → fallback)
-`src/core/flows/step-runner.ts:194-306`
-
-```ts
-const allowlist = opts.pipeline.concerns?.raiseAllowlist ?? DEFAULT_RAISE_ALLOWLIST;
-if (concerns.length > 0 && !allowlist.includes(opts.source.agent)) {
-  await appendJournal(opts.taskDir, { type: "concern_ingest_skipped", ... }); concerns = [];
-}
-// triage only ids that existed before this step, so new concerns cannot self-dismiss
-const existing = <concerns/*.yaml basenames>;
-await aggregateConcerns(...);
-const triage = suggestions.length ? await applyReviewTriage({ ...ctx, concernIds: existing, isTriager: isTriagerAgent(agent), ... });
-// concernResolution honored only for consult-concern-<id>, architect-closeup*, architect-wave-report*
-// concernConfirms applied only for agent === "architect"; accepted propagate ids pushed to the parent task
-// wave-close-up: applyWaveCloseupFallback({ ids: existing })
-```
-
-### 3.7 Item-machine guards (single-writer for concern-id human dispositions)
-`src/core/flows/item-machine.ts:664-666`, `:712-740`, `:786-806`
-
-```ts
-const concernIds = new Set(await listConcernIds(taskDir));
-// raw human-* question writer skips ids in concernIds
-// hasHumanBlock: human-async/stop is decided by whether the router wrote an open blocking question
-// hasIssues: any fix suggestion, or human-stop for a non-concern id
-```
-
-### 3.8 Routed blockers: derive blocks, iteration consults
-`src/core/derive/task.ts:52-65`, `src/core/plan/scheduler.ts:68-78`, `src/core/flows/iteration.ts:200-229`, `:820-846`
-
-```ts
-export async function collectRoutedBlockers(taskDir, minBlockingSeverity = "high") {
-  for (const concern of await listConcerns(taskDir)) {
-    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
-    if (!severityAtLeast(concern.severity, minBlockingSeverity)) continue;
-    for (const slug of concern.affects ?? []) affected.add(slug);
-  }
-}
-// blockedByConcern seeds pending items named by routed blockers, then cascadePendingBlocked;
-// consultRoutedBlockers runs one runConcernConsult per blocker affecting a blocked wave item.
-```
-A consult's decision file `decisions/concern-<cid>.yaml` is created once (`consults.ts:319-324`); `concernResolution` is applied on commit, so the next derive unblocks (ADR `adr-closeup-lifecycle-resolved.md`).
-
-### 3.9 Tech debt derivation
-`src/core/derive/task.ts:219-265`
-
-```ts
-if (plan?.techDebt) debtSet.add(d.description);
-// decisions: accept-with-debt -> d.debt
-for (const concern of await listConcerns(taskDir)) {
-  if (!isDebtConcern(concern)) continue;
-  const item = concern.source?.item ?? concern.affects?.[0];
-  debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
-}
-// review suggestions disposition === "optional" -> `[<item>] <summary>`
-```
-`isDebtConcern` = non-open `tech-debt` concern or `optional` disposition (`triage.ts:143-150`); outstanding debt is passed to architect prompts as `debt` and printed by `factory status`.
-
-### 3.10 ADRs at plan time
-`src/core/flows/adrs.ts:8-19`, `:46-72`; `src/core/flows/iteration.ts:439-455`, `:469-476`, `:614-628`
-
-```ts
-export function blockingAdrDisposition(mode) {
-  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
-}
-// persistAdrs: markdown into project.adrFolder when configured; always writes a question —
-// blocking: disposition per mode + blocks:["task"]; remarkable: disposition "human-awareness" (no blocks)
-// iteration: after plan/revise, if refreshStateYaml.status === "blocked" -> return blocked before waves
-```
-`project.adrFolder` defaults to `docs/adr` (`plugins/software-factory/config/project.template.yaml:11`).
-
-### 3.11 Epic → saga propagation
-`src/core/flows/epic-propagation.ts:40-64`, `:141-185`
-
-```ts
-function condenseText(text) {
-  const size = utf8Bytes(text);
-  return size <= VERBATIM_BYTES /*120*/ ? text
-    : truncateUtf8(text, Math.min(CONDENSED_CAP_BYTES /*500*/, Math.floor(size / 2)));
-}
-// push: open|routed child concerns + open remarkables -> parent store via aggregateConcerns(commit:false)
-// summary prefixed "[epic] "; source {epic, record: `epic:<epic>/<record>`, agent}; copies stay "open"
-// questions with blocks forwarded as q-epic-<epic>-<id> with blocks remapped to the parent item/task
-```
-Called from `runTaskChild` after the child iteration, inside the parent close-up lock/commit (`src/core/engine.ts:271-292`).
-
-### 3.12 Surfacing: status, state, close-ups, prompts
-`src/cli/status.ts:107`; `src/core/derive/task.ts:369-390`
-
-```ts
-console.log(`Concerns: open ${derived.concerns.open} | dismissed ${...} | routed ${...} | resolved ${...}`);
-// state.yaml: concerns: countConcerns(taskDir) (schema requires open/dismissed/routed/resolved)
-```
-`state.schema.json:1-15`, `:72-100`; close-up prompts carry `{{concernsYaml}}` and resolution fields (`agents/steps/wave-close-up.md:21-24`, `plan-close-up.md:24`, `architect-closeup.md:24-27`); architect/hydration consumers receive terse open/routed records (`triage.ts:219-232`).
-
-### 3.13 Shipped config and presets
-`config/pipeline.default.yaml:378-425`
-
-```yaml
-humanInvolvement: autonomous
-concerns:
-  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
-  minDigestSeverity: medium
-  minBlockingSeverity: high
-# Presets — copy the desired mode block into `.factory/pipeline.yaml` or a task `pipeline.yaml` override:
-# humanInvolvement: principal   (+ minDigestSeverity: low, minBlockingSeverity: medium)
-# humanInvolvement: detailed    (+ minDigestSeverity: low, minBlockingSeverity: low)
-# ADR blocking table ...
-```
-Criteria mapping at `:440-456` (`human-involvement: agents/criteria/human-involvement.md`); mode filtering in `formatHumanInvolvementCriteria` (`src/core/prompts.ts:66-88`), dispositions filtering in `formatDispositionsSection` (`:90-113`).
-
-## 4. Existing Tests & Conventions
-
-- Runner: `bun test` (`package.json` scripts). Tests are **behavioral**: real temp git repos + `FakeHarness`; no mocks of the store.
-- Helper `test/helpers/tmp-repo.ts:12-29` (`createTmpRepo`: `writeFile`, `commit`, `git`, `cleanup`) and `FakeHarness.scriptOutcome(label, outcome)` / `scriptComplete(handler)` (`src/harness/fake/fake-harness.ts:34-89`).
-- Engine-level tests call `runTask`/`runAgentStep` with `PipelineConfig` + `ProjectConfig` literals and assert on YAML artifacts, journal events and `git status --porcelain === ""` (no stray files after commits), e.g. `test/engine/concerns-funnel.test.ts:37-124`, `:194-220`, `:347-467`.
-- Contract tests (`test/contracts/`) compile schemas with `createAjv` and compare against `resolveStepSchema` output, asserting inline (no `$ref`) concern/remarkable definitions and strict enums (`test/contracts/concern-schemas.test.ts:10-25`).
-- Tests cite the governing ADR id in their header comment (e.g. `funnel-text-budget.test.ts:1-22`, `hydration-fingerprint-caps.test.ts:30-36`, `closeup-lifecycle-resolve.test.ts:19-30`), which is the project convention for traceability.
-- Concerns-related suites (18):
-
-| Test | Focus |
-|---|---|
-| `test/engine/concerns-funnel.test.ts` | schema gate, fingerprint/merge, aggregation/commit, dismiss, close-up pending, remarkable, concurrency, producer wiring |
-| `test/engine/reviewer-triage.test.ts` | item reviewer triage, allowed dispositions, debt predicate, mailbox ids |
-| `test/engine/plan-reviewer-triage.test.ts` | architect plan concerns triaged by plan-reviewer; triage ids don't request revision |
-| `test/engine/routing-blocker-derive.test.ts` | pure derive blocking of affected items + deps, no writes |
-| `test/engine/routing-architect-consult.test.ts` | routed blocker → one architect consult before wave work |
-| `test/engine/routing-human-debt.test.ts` | human-* routing and tech-debt to plan/status |
-| `test/engine/closeup-lifecycle-resolve.test.ts` | propose/confirm/resolve/carry/propagate, consult unblocks, fallback |
-| `test/engine/epic-saga-propagate.test.ts` | condensed epic→saga copies, byte caps, idempotency, question forwarding |
-| `test/engine/hydration-fingerprint-caps.test.ts` | step-role caps, hydrated sets, fingerprint identity |
-| `test/engine/funnel-text-budget.test.ts` | byte-budget contract (spike-finding test, helpers only) |
-| `test/engine/human-router-severity.test.ts` | severity downgrade/suppression, digest vs blocking, escalated dismiss |
-| `test/engine/state-concern-counts.test.ts` | state.yaml counts |
-| `test/cli/status-concerns.test.ts` | status counts + blocking/digest sections |
-| `test/contracts/concern-schemas.test.ts` | producer schema coverage |
-| `test/contracts/concern-artifact-types.test.ts` | artifact type contract |
-| `test/contracts/state-concern-schema.test.ts` | state schema contract |
-| `test/human-involvement-config.test.ts` | mode config, criteria filtering, presets, per-task layering |
-| `test/review-policy.test.ts` | allowed dispositions incl. triager-only `dismiss` |
-
-- No test asserts documentation content (grep for `ARCHITECTURE` in `test/` only finds fixture files), so docs edits are not test-gated.
-
-## 5. Implementation Status vs Intent (`docs/factory.v2.md:89-103`)
-
-| Intent bullet | Status | Evidence |
-|---|---|---|
-| Structured `concerns[]` in agent outputs | **Done** for developer, fact-finder, architect (plan/decisions), close-ups; reviews use `newConcerns[]` | `config/schemas/developer-output.schema.json:61-90`, `fact-finder-output.schema.json:22-48`, `plan.schema.json:135-159`, `decisions.schema.json:48-72`, `review.schema.json:60-75`, `wave-closeup.schema.json:35-58`, `plan-closeup.schema.json:27-50` |
-| Remarkable decisions/tradeoffs in structured output | **Done** (`remarkable: [{chosen, alternatives, why}]`, `rm-*` store ids) | schemas above; `concerns.ts:53`, `:89-97` |
-| Aggregation under task folder, fingerprint ids, dedup, status, source record | **Done** | `concerns.ts:47-60`, `:122-167`, `:169-215`; statuses open/dismissed/routed/resolved |
-| Reviewer triage with review vocabulary + `dismiss` (reason, kept) | **Done** for reviewer/plan-reviewer | `triage.ts:35-50`, `:293-349`; `review-policy.ts:30-46`; `concerns.ts:250-261` |
-| blocker → dependent items blocked + architect consult | **Done** | `derive/task.ts:52-65`, `plan/scheduler.ts:68-78`, `iteration.ts:200-229`, `consults.ts:319-370` |
-| `architect` → next architect turn | **Done** (routed status + hydration for architect/close-up consumers) | `triage.ts:219-232`, `step-runner.ts:404-430` |
-| `human-*` → steer mailbox per policy | **Done** (severity thresholds; digest-only entries; blocks task/item) | `triage.ts:93-136`; `steer.ts:59-88` |
-| tech debt → plan tech-debt list | **Done** (plan `techDebt`, accept-with-debt, optional suggestions, routed tech-debt concerns) | `derive/task.ts:219-265` |
-| Wave/plan close-ups list concerns, re-triage, architect resolves/carries | **Done via `concernResolutions` + architect `concernConfirms` + wave fallback** (not via review dispositions; see open question 3) | `concerns.ts:264-317`, `:326-342`; `step-runner.ts:257-302`; close-up schemas |
-| Funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text than code | **Done** (hydration byte caps; epic copies condensed to ≤half/≤500 B; open copies) | `triage.ts:234-291`; `epic-propagation.ts:40-64`, `:141-185`; `funnel-text-budget.test.ts` |
-| Saga architect reviews epic items, steers or propagates | **Done generically**: epic copies land in the parent (saga) task store, hydrated to its architect; steering via the root mailbox; proposals confirmed by the architect | `engine.ts:271-292`, `step-runner.ts:308-325`, `epic-propagation.ts:152-185` |
-| Blocking vs non-blocking ADRs; remarkable digest never waits | **Done** (blocking question with `blocks:["task"]` vs `human-awareness`, no blocks) | `adrs.ts:8-72`; `iteration.ts:439-476`, `:614-628` |
-| Presets `autonomous`/`principal`/`detailed` shipped as commented config examples, prompt fragments, per-task selectable | **Done** for config examples + fragment + root-task layer; **epic children do not inherit the parent task layer** (see open question 2) | `pipeline.default.yaml:378-425`; `prompts.ts:66-113`; `agents/criteria/human-involvement.md`; `loader.ts:92-100`; `run.ts:127-133`; `engine.ts:247` |
-| Surfaced in close-ups, `factory status`, state.yaml counts | **Done** | `status.ts:107`; `derive/task.ts:369-390`; close-up prompts; `state.schema.json:72-100` |
-| Update ARCHITECTURE (incl. §1 row 18), README, config commentary | **Not done** for ARCHITECTURE and README; config commentary already updated | `docs/ARCHITECTURE.md:39`; `README.md` (no hits); `pipeline.default.yaml:378-456` |
-| Prompts terse / behavior tests only | **Done** | agent prompts ~20-30 lines; all 18 suites are behavior/contract tests |
-
-## 6. Open Questions & Uncertainties
-
-1. **Documentation gap is the dominant remaining work.** Concretely stale/missing:
-   - `docs/ARCHITECTURE.md:39` — §1 row for item 18 says “deliberately not hand-built … current state: review dispositions and steering mailbox only”; must become an implemented row that records deviations.
-   - `docs/ARCHITECTURE.md:61-85` (§3 module layout) omits `concerns.ts`, `triage.ts`, `review-policy.ts`, `flows/adrs.ts`, `flows/epic-propagation.ts`.
-   - `docs/ARCHITECTURE.md:112-176` (§5) config sample omits `humanInvolvement`, `concerns`, `criteria.human-involvement`, triager-only `dismiss`; line 117 claims “epics inherit parent task layer” (mismatch — see item 2).
-   - `docs/ARCHITECTURE.md:185-198` (§6.2 task folder) omits `concerns/`, `decisions/concern-<id>.yaml`, and `adrFolder` outputs.
-   - `docs/ARCHITECTURE.md:282-295` (§8.7) disposition table omits `dismiss`, exact-id triage rules, severity thresholds and the human router; no section describes the store/funnel at all (natural placement: new §8.11 or §18; §8.8 ends at line 300).
-   - `docs/ARCHITECTURE.md:339-357` (§10) output column omits `newConcerns[]`, `remarkable`, `concernResolutions`, `concernConfirms`, `adrs`; lines 352-353 claim close-ups output “wave-closeup + review” although their schemas have no `suggestions`.
-   - `docs/ARCHITECTURE.md:404-406` (§13) test list does not mention the 18 concerns suites.
-   - `README.md:71-86` (config hierarchy) has no per-task mode example; `README.md:99-105` (docs index) has no funnel/concerns pointer; README has zero mentions of concerns/humanInvolvement/ADR.
-2. **Epic config inheritance mismatch (behavior).** ARCHITECTURE §5 says epics inherit the parent task layer (`docs/ARCHITECTURE.md:117`), but `runTaskChild` calls `pipelineFor(childTaskDir)` (`src/core/engine.ts:247`) and `pipelineFor` loads only `<taskDir>/pipeline.yaml` (`src/cli/run.ts:127-133`). Consequence: `humanInvolvement`, `concerns.*`, `reviewPolicy` set in a root task's `pipeline.yaml` do **not** apply inside its epics; “selectable per task” is root-only today. Decide: implement parent-layer inheritance (new test) or document the deviation in §1/§5/§18.
-3. **Close-up disposition triage is unreachable.** `isTriagerAgent` returns true for `wave-close-up`/`plan-close-up` (`src/core/review-policy.ts:16-24`) and the ingest path would triage their `suggestions[]` (`step-runner.ts:243-257`), but `config/schemas/wave-closeup.schema.json` and `plan-closeup.schema.json` set `additionalProperties: false` and define no `suggestions`, so schema validation rejects any such output. Re-triage currently works through `concernResolutions` + architect `concernConfirms` + `applyWaveCloseupFallback`. Decide: add `suggestions` to close-up schemas (and prompt section) or drop close-ups from `isTriagerAgent` and correct §10/§8.7 wording.
-4. **`dismiss` missing from the shared criteria file.** `agents/criteria/dispositions.md:1-20` documents fix/optional/architect/human-awareness/human-async/human-stop but not `dismiss`, while `formatDispositionsSection` advertises `dismiss` as allowed for triagers (`src/core/prompts.ts:90-113`), `review.md:21-23` / `plan-review.md:15` require `detail`, and `triage.ts:304-310` enforces it. Either add the row (docs/prompt fix) or reconsider the prompt instructions.
-5. **Producer coverage is not literally “every agent output”.** `triage.schema.json` and `infra.schema.json` have no `concerns`/`remarkable`, and the default allowlist excludes triage/infra/pm (`concerns.ts:35-44`); a raising agent outside the allowlist is silently journaled as `concern_ingest_skipped` (`step-runner.ts:221-232`). The contract test deliberately lists only developer/fact-finder/plan/decisions/close-ups (`test/contracts/concern-schemas.test.ts:10-25`). Confirm and document the exclusion set, or extend schemas+allowlist.
-6. **Zero-diff close-up hydration is empty.** Close-ups cap at `min(taskDiffBytes, 2000)` (`triage.ts:236-240`, `step-runner.ts:417-424`); a close-up on a branch with no diff since the parent tip gets cap 0 and therefore no open concerns to triage. The byte-budget spike documents a 0-byte budget case as valid (`test/engine/funnel-text-budget.test.ts:402-408`). Confirm whether a no-diff close-up should see a 500-byte input-based budget instead.
-7. **Propagated epic concerns cannot block the epic item.** `concernCopy` preserves child `affects` slugs (`epic-propagation.ts:141-150`), while parent `collectRoutedBlockers` matches parent item slugs (`derive/task.ts:52-65`). The module header states copies stay open and only forwarded questions can block the parent (`epic-propagation.ts:20-25, 152-160`), and the test asserts that intent (`test/engine/epic-saga-propagate.test.ts:13-20`). Document this as the intended funnel semantic (saga architect resolves/steers; epic-level questions block).
-8. **ADR format inconsistency.** `renderAdrMarkdown` writes `# title / ## Context / ## Decision / ## Consequences / ## Blocking` (`adrs.ts:23-45`), but the 14 existing `docs/adr/*.md` files are 3-line context-only notes (e.g. `docs/adr/adr-concern-store-taskwt.md`). The docs update should state the canonical generated format and whether the existing notes are historical.
-9. **`autonomous` deviation.** Spec line 100 says autonomous blocks only “for the portion still blocked after everything unblocked is done”; implementation halts immediately at plan time on a blocking ADR (`iteration.ts:469-476`) and records this as accepted in `docs/adr/adr-autonomous-immediate-halt.md`. This deviation must appear in the §1 row / §18 section.
-10. **`factory status` surfaces counts and mailbox digests, not the concern list.** Intent only requires counts; the current output prints counts plus blocking/digest question sections (`status.ts:83-115`) and debt. If the architect wants per-concern visibility, that is new behavior with a `status-concerns` test extension.
-11. **No preflight validation of `concerns.raiseAllowlist` entries.** Only the pipeline JSON schema validates the shape (`pipeline.schema.json:207-227`); an unknown agent name is accepted and silently never matches `source.agent` (`step-runner.ts:219-232`). Consider a preflight warning or document it.
-12. **Saga depth.** Epics are depth-1 only (`docs/ARCHITECTURE.md:279-281`, `flows` limits); “saga architect” is the root task architect and propagation is one level (`engine.ts:271-292`). Doc wording should not imply deeper recursion.
-
-## 7. Recommendations for the Architect
-
-1. Treat the store/triage/routing/funnel APIs as **frozen**: `concerns.ts`, `triage.ts`, `review-policy.ts`, `adrs.ts`, `epic-propagation.ts` are implemented and covered by 18 suites. Do not re-plan them; plan documentation and only the explicitly chosen consistency fixes.
-2. Make the next iteration a documentation-closure milestone:
-   - rewrite `docs/ARCHITECTURE.md:39` (§1 row 18) to “implemented” with the deviations from open questions 2/3/7/9;
-   - add a funnel section (e.g. §8.11 “Concerns, remarkable decisions, ADRs, human-involvement modes”) covering store layout `{task}/concerns/{c-*,rm-*}.yaml`, fingerprint/dedup, statuses, triage contract (`suggestions[]` by exact id, triager-only `dismiss` with reason), routing table (blocker/architect/human-*/tech-debt), close-up propose→architect confirm, epic→saga condensing, ADR blocking table, presets + per-task layer;
-   - update §3 module layout, §5 config sample, §6.2 task folder, §8.7 disposition table, §10 agent output column, §13 test list;
-   - add a README section (“Concerns & human involvement”) with a per-task `pipeline.yaml` mode example and the `factory status` counts/digest output.
-3. Add the missing `dismiss` row to `agents/criteria/dispositions.md` (one table row + rule) so the advertised vocabulary is fully documented; this is a prompt-surface fix, still terse.
-4. Decide explicitly (and record in the plan ADRs) whether to fix or document the two behavioral mismatches: epic→parent task config inheritance and close-up `suggestions` triage. Each fix needs one behavior test near the existing suites; documenting needs one §1-row deviation sentence.
-5. Keep behavior tests only; docs changes need no tests. For behavior changes, extend `test/human-involvement-config.test.ts` (config layering) and `test/engine/closeup-lifecycle-resolve.test.ts` (close-up triage) rather than new files.
-6. Verification commands: `cd plugins/software-factory && bun test` (baseline 441 pass / 2 skip / 0 fail) and `bun run typecheck` (`tsc --noEmit`).
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
-- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
-- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
-- rationale (string, optional): Technical justification for this decision
-- text (string, optional): Concrete guidance or steering directives
-- persist (boolean, optional): Whether guidance persists across subsequent attempts
-- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
-- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
-- outline (object, optional): Item outline to schedule when decision is fix-item
-- debt (string, optional): Technical debt description when decision is accept-with-debt
-- reason (string, optional): Reason for abandonment or abort
-- question (string, optional): Specific question for human operator when decision is human-async or blocked
-- planDelta (string, optional): Plan delta or amendment directives when decision is amend
-- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
diff --git a/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/meta.yaml b/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/meta.yaml
deleted file mode 100644
index 593e253..0000000
--- a/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/meta.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-seq: 74
-name: consult-schema-detail-normalize
-attempt: 1
-agent: architect
-role: architect
-models:
-  - opencode-go/muse-spark-1.3-contributor
-session: 01a1b894-4755-7787-a1ed-8df6c7a062a2
-timeoutSec: 7200
-status: ok
-startedAt: 2026-11-09T06:40:18.680Z
-endedAt: 2026-11-09T06:41:37.000Z
-usage:
-  inputTokens: 75369
-  outputTokens: 6098
-  costUsd: 0.010333
-traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-34-47-765Z_01a1b894-4755-7787-a1ed-8df6c7a062a2.jsonl
diff --git a/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/output.yaml b/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/output.yaml
deleted file mode 100644
index c596e5c..0000000
--- a/.factory/tasks/concerns-funnel/runs/074-consult-schema-detail-normalize-a1/output.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-context: item
-decision: retry-with-guidance
-persist: true
-rationale: Both test-first attempts wrote the new test file but yielded output
-  with no `target` field, so the mechanical target-red check fails at
-  runner.ts:333 before running anything ('No target specified'). This is a
-  yield-shape omission, not a code problem. The item is small and well-scoped;
-  no split or escalation needed.
-text: "Retry test-first. Root cause of both rejections: your yield omitted
-  `target`. You MUST yield `target: { selectors:
-  ['test/contracts/schema-detail-normalize.test.ts'], expectRed: ['<exact
-  it/test name 1>', '<exact it/test name 2>', ...] }` where every expectRed
-  string is the EXACT name from an it()/test() block in your new file (bun-junit
-  matching is by test-name segment; minItems 1). Scope: touch ONLY paths.tests
-  (new file). Do NOT touch schemas, src, or epic-saga-propagate.test.ts in this
-  step — test-first-scope rejects prod changes; the 3 .Detail read fixes +
-  schemas + concerns.ts:72 belong to the develop step. Red semantics: each
-  expectRed id must FAIL by assertion on current prod (lowercase-detail contract
-  assertions fail against capital-D schemas; longest-wins fails because merge
-  reads existing?.Detail). Collection/import/syntax errors do NOT count as red.
-  Prove locally before yielding: cd plugins/software-factory && TMPDIR=/tmp bun
-  test test/contracts/schema-detail-normalize.test.ts and confirm your declared
-  ids fail with assertion failures."
diff --git a/.factory/tasks/concerns-funnel/state.yaml b/.factory/tasks/concerns-funnel/state.yaml
index d5682b0..2a684a0 100644
--- a/.factory/tasks/concerns-funnel/state.yaml
+++ b/.factory/tasks/concerns-funnel/state.yaml
@@ -4,14 +4,6 @@ status: active
 iteration: 3
 currentWave: 1
 items:
-  closeup-triager-cleanup:
-    kind: dev
-    status: running
-    branch: topic/concerns-funnel--closeup-triager-cleanup
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.06604299999999999
-    currentStep: develop
   concerns-contracts:
     kind: dev
     status: superseded
@@ -47,14 +39,6 @@ items:
     spendUsd: 0.32775099999999996
     currentStep: review
     mergedAt: 2026-11-08T18:51:44-05:00
-  schema-detail-normalize:
-    kind: dev
-    status: running
-    branch: topic/concerns-funnel--schema-detail-normalize
-    attempts: 2
-    fixRounds: 1
-    spendUsd: 0.163161
-    currentStep: test-first
   spike-saga-commit:
     kind: fact-finder
     status: ready
@@ -88,13 +72,6 @@ items:
     attempts: 1
     fixRounds: 1
     spendUsd: 0
-  docs-finish-v4:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--docs-finish-v4
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
   epic-saga-propagate:
     kind: dev
     status: merged
@@ -671,16 +648,16 @@ debt:
     inconsistent with documented branch-from-HEAD worktrees"
   - "[funnel-closeups-v3] Propagated parent copy retains child source.item,
     writes undeclared source.epic, and can clobber/lengthen parent records"
-budgetSpentUsd: 8.755177920000007
+budgetSpentUsd: 8.523221920000006
 spendByRole:
   alt-workhorse:
-    costUsd: 1.9682549999999996
-    inputTokens: 9688689
-    outputTokens: 2863219
+    costUsd: 1.9655029999999996
+    inputTokens: 9671362
+    outputTokens: 2858124
   workhorse:
-    costUsd: 5.5454199200000005
-    inputTokens: 12084169
-    outputTokens: 3360493
+    costUsd: 5.31621592
+    inputTokens: 11681593
+    outputTokens: 3173378
   architect:
     costUsd: 1.162561
     inputTokens: 10667869
@@ -750,6 +727,14 @@ spendByItem:
     costUsd: 0.060779
     inputTokens: 139871
     outputTokens: 72059
+  spike-saga-commit:
+    costUsd: 0.131932
+    inputTokens: 263905
+    outputTokens: 109900
+  routing-architect-consult-v2:
+    costUsd: 0.198996
+    inputTokens: 463902
+    outputTokens: 217893
   contracts-drift-fix:
     costUsd: 0.16688999999999998
     inputTokens: 450079
@@ -758,6 +743,10 @@ spendByItem:
     costUsd: 0.720326
     inputTokens: 2521130
     outputTokens: 580992
+  docs-finish-v3:
+    costUsd: 0.06335400000000001
+    inputTokens: 146385
+    outputTokens: 43223
   prompt-fragments:
     costUsd: 0.32775099999999996
     inputTokens: 1269182
@@ -766,10 +755,6 @@ spendByItem:
     costUsd: 0.448594
     inputTokens: 1109776
     outputTokens: 396435
-  closeup-triager-cleanup:
-    costUsd: 0.06604299999999999
-    inputTokens: 144140
-    outputTokens: 46002
   human-router-severity:
     costUsd: 0.206566
     inputTokens: 470606
@@ -778,24 +763,8 @@ spendByItem:
     costUsd: 0.37333400000000005
     inputTokens: 895689
     outputTokens: 273259
-  spike-saga-commit:
-    costUsd: 0.131932
-    inputTokens: 263905
-    outputTokens: 109900
-  routing-architect-consult-v2:
-    costUsd: 0.198996
-    inputTokens: 463902
-    outputTokens: 217893
-  schema-detail-normalize:
-    costUsd: 0.163161
-    inputTokens: 258436
-    outputTokens: 141113
-  docs-finish-v3:
-    costUsd: 0.06335400000000001
-    inputTokens: 146385
-    outputTokens: 43223
   (orchestration):
-    costUsd: 2.0212220000000007
-    inputTokens: 12955442
-    outputTokens: 1026257
-lastUpdated: 2026-11-09T06:40:18.555Z
+    costUsd: 2.01847
+    inputTokens: 12938115
+    outputTokens: 1021162
+lastUpdated: 2026-11-09T06:06:57.025Z
diff --git a/plugins/software-factory/config/schemas/plan-closeup.schema.json b/plugins/software-factory/config/schemas/plan-closeup.schema.json
index 1dfc98b..ee30689 100644
--- a/plugins/software-factory/config/schemas/plan-closeup.schema.json
+++ b/plugins/software-factory/config/schemas/plan-closeup.schema.json
@@ -67,7 +67,7 @@
         "type": "object", "required": ["id", "action"], "additionalProperties": false,
         "properties": {
           "id": { "type": "string" }, "note": { "type": "string" },
-          "action": { "type": "string", "enum": ["resolve", "carry", "propagate"] }
+          "action": { "type": "string", "enum": ["resolve", "carry", "propagate", "dismiss"] }
         }
       }
     }
diff --git a/plugins/software-factory/config/schemas/wave-closeup.schema.json b/plugins/software-factory/config/schemas/wave-closeup.schema.json
index 2a655b8..285ba7d 100644
--- a/plugins/software-factory/config/schemas/wave-closeup.schema.json
+++ b/plugins/software-factory/config/schemas/wave-closeup.schema.json
@@ -64,7 +64,7 @@
         "type": "object", "required": ["id", "action"], "additionalProperties": false,
         "properties": {
           "id": { "type": "string" }, "note": { "type": "string" },
-          "action": { "type": "string", "enum": ["resolve", "carry", "propagate"] }
+          "action": { "type": "string", "enum": ["resolve", "carry", "propagate", "dismiss"] }
         }
       }
     }
diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
index 2f9f9df..8ce1b91 100644
--- a/plugins/software-factory/src/core/artifacts.ts
+++ b/plugins/software-factory/src/core/artifacts.ts
@@ -340,10 +340,13 @@ export interface ConcernResolution {
   note?: string;
 }
 
-/** Close-up proposals may also propagate a concern to the parent epic or saga. */
+/**
+ * Close-up proposals may also propagate a concern to the parent epic or saga,
+ * or dismiss it with the proposal note as the required dismissal reason.
+ */
 export interface CloseupConcernResolution {
   id: string;
-  action: "resolve" | "carry" | "propagate";
+  action: "resolve" | "carry" | "propagate" | "dismiss";
   note?: string;
 }
 
@@ -361,7 +364,8 @@ export interface ConcernSource {
 }
 
 export interface PendingConcernResolution {
-  action: "resolve" | "carry" | "propagate";
+  action: "resolve" | "carry" | "propagate" | "dismiss";
+  /** Dismiss proposals require this note as the dismissal reason. */
   note?: string;
   by: string;
   at: string;
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index 6a6f8c4..c8729e5 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -13,7 +13,7 @@ export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affe
 export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
 /** `repo` is only needed when the aggregation itself commits. */
 export type ConcernWriteContext = Omit<ConcernStoreContext, "repo"> & { repo?: Repo };
-export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }
+export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string }
 
 type Obj = Record<string, any>;
 type Patch = (record: Obj, at: string) => Obj;
@@ -273,8 +273,9 @@ export function applyCloseupResolutions(
 /**
  * Applies architect confirmations to pending close-up proposals. Accept applies
  * the pending action (resolve closes the concern, carry routes it to the
- * architect); propagate only clears the proposal because the parent copy is a
- * cross-store write. Reject clears the proposal and changes nothing else.
+ * architect, dismiss closes it with the pending note as its reason);
+ * propagate only clears the proposal because the parent copy is a cross-store
+ * write. Reject clears the proposal and changes nothing else.
  */
 export function applyConcernConfirms(
   ctx: ConcernStoreContext & { confirms: Array<Pick<ConcernConfirms, "id" | "confirm">> }
@@ -289,6 +290,14 @@ export function applyConcernConfirms(
     if (pending.action === "carry") {
       return { ...record, status: "routed", disposition: "architect", pendingResolution: undefined };
     }
+    if (pending.action === "dismiss") {
+      const reason = pending.note?.trim();
+      // Ingest pre-flights the note; a direct call without one leaves the
+      // proposal intact so the concern store never throws across the
+      // concerns/triage module cycle.
+      if (!reason) return record;
+      return { ...record, status: "dismissed", disposition: "dismiss", dismissReason: reason, pendingResolution: undefined };
+    }
     return { ...record, pendingResolution: undefined };
   }]);
   return mutate(ctx, ops, "factory: concerns confirmed");
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index f40c4c7..2f07a00 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -239,6 +239,24 @@ async function ingestStepConcerns(opts: {
     if (err?.code !== "ENOENT") throw err;
   }
   const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
+  // Confirm pre-flight runs before any store mutation so a rejected dismiss
+  // proposal fails the step while preserving every status and pending
+  // resolution (no partial transitions). applyConcernConfirms itself never
+  // throws TriageValidationError, keeping the concerns/triage modules cycle-free.
+  if (confirms.length && opts.source.agent === "architect") {
+    const pendingById = new Map(
+      (await listConcerns(opts.taskDir)).map((concern) => [concern.id, concern.pendingResolution])
+    );
+    for (const confirm of confirms) {
+      if (confirm.confirm !== "accept") continue;
+      const pending = pendingById.get(confirm.id);
+      if (pending?.action === "dismiss" && !pending.note?.trim()) {
+        throw new TriageValidationError(
+          `Accepting dismiss for ${confirm.id} requires a non-empty pending note (the dismissal reason)`
+        );
+      }
+    }
+  }
   if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
   const triage = suggestions.length > 0
     ? await applyReviewTriage({
diff --git a/plugins/software-factory/src/core/review-policy.ts b/plugins/software-factory/src/core/review-policy.ts
index 33ef9db..9cabaca 100644
--- a/plugins/software-factory/src/core/review-policy.ts
+++ b/plugins/software-factory/src/core/review-policy.ts
@@ -11,15 +11,12 @@ export const BUILTIN_REVIEW_DISPOSITIONS = [
 
 /**
  * Agents that triage worker concerns and may dismiss them (§8.7, §18):
- * the step's reviewer plus plan and close-up reviewers.
+ * the step's reviewer and the plan reviewer. Close-ups are not triagers; their
+ * re-triage flows through concernResolutions and architect concernConfirms
+ * (adr-closeup-no-suggestions-triage).
  */
 export function isTriagerAgent(agent: string): boolean {
-  return (
-    agent === "reviewer" ||
-    agent === "plan-reviewer" ||
-    agent === "wave-close-up" ||
-    agent === "plan-close-up"
-  );
+  return agent === "reviewer" || agent === "plan-reviewer";
 }
 
 /**
diff --git a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
index 9d8733c..b4ecb21 100644
--- a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+++ b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
@@ -121,7 +121,10 @@ export const contract = {
 
   it("stores concern lifecycle metadata including pending resolution and escalation", () => {
     const errors = typeErrors(`
-import type { StoredConcernArtifact } from "../../src/core/artifacts.js";
+import type {
+  CloseupConcernResolution,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
 
 const stored: StoredConcernArtifact = {
   id: "c-0123456789",
@@ -163,6 +166,19 @@ const withoutPending: StoredConcernArtifact = {
   updatedAt: "2026-11-07T00:00:00.000Z",
 };
 
+const dismissPending: StoredConcernArtifact["pendingResolution"] = {
+  action: "dismiss",
+  note: "Superseded by ADR-1",
+  by: "plan-close-up",
+  at: "2026-11-07T00:00:00.000Z",
+};
+
+const dismissResolution: CloseupConcernResolution = {
+  id: "c-0123456789",
+  action: "dismiss",
+  note: "Superseded by ADR-1",
+};
+
 // @ts-expect-error stored concerns require a stable id
 const missingId: StoredConcernArtifact = {
   kind: "risk",
@@ -175,14 +191,21 @@ const missingId: StoredConcernArtifact = {
   updatedAt: "2026-11-07T00:00:00.000Z",
 };
 const badPending: StoredConcernArtifact["pendingResolution"] = {
-  // @ts-expect-error pending actions are resolve, carry, or propagate
-  action: "dismiss",
+  // @ts-expect-error pending actions are resolve, carry, propagate, or dismiss
+  action: "defer",
   note: "Not a close-up action",
   by: "wave-close-up",
   at: "2026-11-07T00:00:00.000Z",
 };
 
-export const contract = { stored, withoutPending, missingId, badPending };
+export const contract = {
+  stored,
+  withoutPending,
+  dismissPending,
+  dismissResolution,
+  missingId,
+  badPending,
+};
 `);
     expect(errors).toEqual([]);
   });
diff --git a/plugins/software-factory/test/contracts/concern-schemas.test.ts b/plugins/software-factory/test/contracts/concern-schemas.test.ts
index 6e9a367..d125df9 100644
--- a/plugins/software-factory/test/contracts/concern-schemas.test.ts
+++ b/plugins/software-factory/test/contracts/concern-schemas.test.ts
@@ -296,7 +296,7 @@ describe("Concern producer schemas", () => {
     expect(failures).toEqual([]);
   });
 
-  it("adds concernResolutions with resolve, carry, and propagate to close-up schemas", () => {
+  it("adds concernResolutions with resolve, carry, propagate, and dismiss to close-up schemas", () => {
     const failures: string[] = [];
     const closeups: Producer[] = [
       {
@@ -321,6 +321,10 @@ describe("Concern producer schemas", () => {
       const validate = validator(schema);
       const label = closeup.name;
 
+      if (schema.properties?.suggestions !== undefined) {
+        failures.push(`${label}: close-up schemas must not accept suggestions[]`);
+      }
+
       const item = arrayItem(schema, "concernResolutions");
       if (!item) {
         failures.push(`${label}: missing inline concernResolutions[]`);
@@ -331,8 +335,8 @@ describe("Concern producer schemas", () => {
         failures.push(`${label}: concernResolutions must require id and action`);
       }
       const actions = resolveRef(schema, item.properties?.action)?.enum ?? [];
-      if (["resolve", "carry", "propagate"].some((action) => !actions.includes(action))) {
-        failures.push(`${label}: action enum must be resolve|carry|propagate, got ${JSON.stringify(actions)}`);
+      if (["resolve", "carry", "propagate", "dismiss"].some((action) => !actions.includes(action))) {
+        failures.push(`${label}: action enum must be resolve|carry|propagate|dismiss, got ${JSON.stringify(actions)}`);
       }
 
       if (
@@ -342,13 +346,14 @@ describe("Concern producer schemas", () => {
             { id: "c-1", action: "resolve" },
             { id: "c-2", action: "carry", note: "Needs an architect decision" },
             { id: "c-3", action: "propagate" },
+            { id: "c-4", action: "dismiss", note: "Superseded by ADR-1" },
           ],
         })
       ) {
         failures.push(`${label}: valid concern resolutions rejected (${validationErrors(validate)})`);
       }
-      if (validate({ ...closeup.base, concernResolutions: [{ id: "c-4", action: "dismiss" }] })) {
-        failures.push(`${label}: dismiss action accepted for a close-up resolution`);
+      if (validate({ ...closeup.base, concernResolutions: [{ id: "c-5", action: "defer" }] })) {
+        failures.push(`${label}: unknown defer action accepted for a close-up resolution`);
       }
       if (validate({ ...closeup.base, concernResolutions: [{ action: "resolve" }] })) {
         failures.push(`${label}: resolution without concern id accepted`);
diff --git a/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts b/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
index 5a47a6a..38f2c0b 100644
--- a/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
+++ b/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
@@ -303,6 +303,103 @@ describe("Close-up lifecycle: architect confirmations", () => {
   });
 });
 
+describe("Close-up lifecycle: dismiss resolutions", () => {
+  it("accept dismisses with the trimmed pending note and clears the proposal", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-dismiss-me",
+        status: "open",
+        pendingResolution: {
+          action: "dismiss",
+          note: "  Superseded by ADR-1  ",
+          by: "wave-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed pending dismiss");
+
+    const result = await architectCloseup("c-dismiss-me", "accept");
+    expect(result.ok).toBe(true);
+
+    const stored = await readConcern("c-dismiss-me");
+    expect(stored.status).toBe("dismissed");
+    expect(stored.disposition).toBe("dismiss");
+    expect(stored.dismissReason).toBe("Superseded by ADR-1");
+    expect(stored.pendingResolution).toBeUndefined();
+
+    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(state.concerns.dismissed).toBe(1);
+    expect(state.concerns.open).toBe(0);
+  });
+
+  it("errors before any transition when an accepted dismiss proposal has no note", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-dismiss-no-note",
+        status: "open",
+        pendingResolution: {
+          action: "dismiss",
+          by: "plan-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-resolve-together",
+        status: "routed",
+        disposition: "architect",
+        pendingResolution: {
+          action: "resolve",
+          by: "wave-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed pending dismiss without note");
+
+    const result = await runStep({
+      agent: "architect",
+      stepId: "architect-closeup-1",
+      stepFragment: "steps/architect-closeup",
+      data: {
+        iteration: 1,
+        status: "complete",
+        summary: "Plan complete",
+        concernConfirms: [
+          { id: "c-dismiss-no-note", confirm: "accept" },
+          { id: "c-resolve-together", confirm: "accept" },
+        ],
+      },
+      promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
+    });
+
+    expect(result.ok).toBe(false);
+    expect(result.status).toBe("error");
+    expect(result.meta.error).toMatch(/dismiss/i);
+    expect(result.meta.error).toMatch(/note/i);
+
+    const dismissPending = await readConcern("c-dismiss-no-note");
+    expect(dismissPending.status).toBe("open");
+    expect(dismissPending.disposition).toBeUndefined();
+    expect(dismissPending.dismissReason).toBeUndefined();
+    expect(dismissPending.pendingResolution?.action).toBe("dismiss");
+
+    const resolvePending = await readConcern("c-resolve-together");
+    expect(resolvePending.status).toBe("routed");
+    expect(resolvePending.disposition).toBe("architect");
+    expect(resolvePending.pendingResolution?.action).toBe("resolve");
+
+    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(state.concerns.dismissed).toBe(0);
+    expect(state.concerns.resolved).toBe(0);
+  });
+});
+
 describe("Close-up lifecycle: consult unblock", () => {
   it("consult resolve unblocks the affected item on the next derive", async () => {
     const itemDir = path.join(taskDir, "items", "blocked-item");
diff --git a/plugins/software-factory/test/review-policy.test.ts b/plugins/software-factory/test/review-policy.test.ts
index 53f9fcb..5b442ef 100644
--- a/plugins/software-factory/test/review-policy.test.ts
+++ b/plugins/software-factory/test/review-policy.test.ts
@@ -8,7 +8,10 @@ import { loadPromptLibrary } from "../src/core/prompts.js";
 import { runAgentStep } from "../src/core/flows/step-runner.js";
 import { tickItemMachine } from "../src/core/flows/item-machine.js";
 import { generateReviewSchema } from "../src/core/records/review-schema.js";
-import { resolveReviewAllowed } from "../src/core/review-policy.js";
+import {
+  isTriagerAgent,
+  resolveReviewAllowed,
+} from "../src/core/review-policy.js";
 import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";
 
 const CANONICAL = [
@@ -132,6 +135,50 @@ describe("Review policy resolution (§8.7, §18)", () => {
       )
     ).toEqual(["fix"]);
   });
+
+  it("restricts the triager set to reviewer and plan-reviewer", () => {
+    const candidates = [
+      "reviewer",
+      "plan-reviewer",
+      "wave-close-up",
+      "plan-close-up",
+      "developer",
+      "qa",
+      "architect",
+      "fact-finder",
+    ];
+    expect(candidates.filter((agent) => isTriagerAgent(agent)).sort()).toEqual([
+      "plan-reviewer",
+      "reviewer",
+    ]);
+  });
+
+  it("composed triager resolution excludes dismiss for close-ups", () => {
+    const pipeline = pipelineWith({ default: ["fix", "dismiss"] });
+    for (const agent of ["wave-close-up", "plan-close-up"]) {
+      const allowed = resolveReviewAllowed(
+        pipeline,
+        agent,
+        isTriagerAgent(agent)
+      );
+      expect(allowed).toEqual(["fix"]);
+      expect(
+        dispositionEnum(generateReviewSchema(allowed))
+      ).not.toContain("dismiss");
+    }
+
+    for (const agent of ["reviewer", "plan-reviewer"]) {
+      const allowed = resolveReviewAllowed(
+        pipelineWith(),
+        agent,
+        isTriagerAgent(agent)
+      );
+      expect(allowed).toContain("dismiss");
+      expect(dispositionEnum(generateReviewSchema(allowed))).toContain(
+        "dismiss"
+      );
+    }
+  });
 });
 
 describe("Generated review schema gating (§8.7)", () => {

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
