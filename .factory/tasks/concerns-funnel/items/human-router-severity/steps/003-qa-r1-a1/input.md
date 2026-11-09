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

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..ad6e7b7
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,57 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (3 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+        - plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+        - plugins/software-factory/test/engine/human-router-severity.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 11 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/human-router-severity.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794183503306-zlqs678d5k8.xml
+      junitCaseCount: 14
+      junitCaseIds:
+        - Single human router (adr-human-router-single).routes a plan-reviewer
+          human-stop to one concern question that blocks the task
+        - Single human router (adr-human-router-single).routes a close-up
+          human-async to the task when there is no item context
+        - Single human router (adr-human-router-single).shows a plan-reviewer
+          routed architect concern in the next architect hydration
+        - Single human router (adr-human-router-single).turns routed remarkable
+          decisions into digest-only entries regardless of disposition
+        - Single human router (adr-human-router-single).digests a dismissed
+          escalated concern as q-escalated while keeping the dismissal
+        - Single human router (adr-human-router-single).keeps an ordinary
+          dismissal on disk with its reason and produces no mailbox effect
+        - Single human router (adr-human-router-single).suppresses
+          human-awareness digests below minDigestSeverity and downgrades stops
+          below minBlockingSeverity
+        - Single human router (adr-human-router-single).digests a low-severity
+          routed blocker when minDigest is low but never derives it as blocking
+        - Severity policy in derive
+          (adr-severity-policy-active).collectRoutedBlockers filters routed
+          blockers by minBlockingSeverity, defaulting to high
+        - Severity policy in derive (adr-severity-policy-active).threads
+          pipeline.concerns.minBlockingSeverity into task derivation with a high
+          fallback
+        - Ingest allowlist (adr-severity-policy-active).skips concerns from
+          non-allowlisted agents, journals the skip, and keeps the step ok
+        - Engine human routing with concern triage
+          (adr-human-router-single).halts with exit 10 for a high-severity
+          human-stop concern, writing one q-concern entry
+        - Engine human routing with concern triage
+          (adr-human-router-single).parks a high-severity human-async item
+          without halting the task
+        - Engine human routing with concern triage
+          (adr-human-router-single).downgrades a medium-severity human-stop
+          concern to a digest and finishes unblocked
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..6008c51
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,73 @@
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
+  "slug": "human-router-severity",
+  "kind": "dev",
+  "title": "Human router and severity policy",
+  "assignment": "Requires hydration-fingerprint-caps (consumes hydrateStepConcerns/listHydratedConcerns sets). Own triage routeHumanDisposition + ingest gates + derive threading per adr-human-router-single + adr-severity-policy-active + adr-hydrated-sets rm rules. Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (q-concern-/q-escalated-), never blocking/halting; dedup by existence. item-machine raw path skips ALL concern-id human-* (no double-write). Severity: gate key source.agent (never fragment): developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, architect covers architect-*; shipped 8-agent allowlist already complete — no entries added, commentary documents fragment->agent mapping. Effective defaults medium/high (code fallback identical). Order: schema validation first, then ingest allowlist skip+journal with step ok. Digest iff severity>=minDigest; blocks iff severity>=minBlocking else downgrade to digest (stop loses exit-10); rm-* exempt. Own derive: collectRoutedBlockers(taskDir,minBlocking) blocks only kind=blocker+routed+severity>=minBlocking; deriveTaskState/withRoutedBlocking thread pipeline.concerns.minBlockingSeverity (fallback high); debt predicate unchanged. Explicit fixture severities keep suite green. Behavior tests: plan/close-up routing, routed architect visible in next architect hydration, dismiss keeps file with dismissReason and no effects, rm digest blocks=[] never halts, async no exit-10 vs blocking stop single q + exit-10, allowlist skip+journal+ok, downgrade + derive unblocked, no double-write, low blocker not blocked but hydrated/digested. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~280 prod lines.",
+  "outlineRef": "human-router-severity",
+  "milestone": "m3-routing-lifecycle",
+  "wave": 2,
+  "deps": [
+    "hydration-fingerprint-caps"
+  ],
+  "scenarioRefs": [
+    "m3-routing-lifecycle:1",
+    "m3-routing-lifecycle:2",
+    "m3-routing-lifecycle:3",
+    "m3-routing-lifecycle:4",
+    "m3-routing-lifecycle:5",
+    "m3-routing-lifecycle:6",
+    "m3-routing-lifecycle:7"
+  ],
+  "citations": [
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+  ],
+  "escalate": true
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/steer.ts:59-88",
+  "plugins/software-factory/src/core/derive/task.ts:167-205",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
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
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..53b14c8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T23:55:49.661Z
+session: 01a1bd96-f8bd-7414-9d13-8618ea9061d3
+endedAt: 2026-11-09T00:18:29.142Z
+usage:
+  inputTokens: 202163
+  outputTokens: 65558
+  costUsd: 0.105842
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T23-55-50-333Z_01a1bd96-f8bd-7414-9d13-8618ea9061d3
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..0492fd0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,75 @@
+status: ok
+summary: "Authored test-first coverage for the single human-disposition router,
+  active severity policy, ingest allowlist gating, and severity-aware routed
+  blocking. Added test/engine/human-router-severity.test.ts (14 tests: 11
+  target-red assertion failures, 3 green regression guards). Raised two
+  pre-existing routed-blocker fixture severities to explicit high so the new
+  minBlockingSeverity=high fallback keeps those suites green. No production
+  files were touched."
+target:
+  selectors:
+    - test/engine/human-router-severity.test.ts
+  expectRed:
+    - routes a plan-reviewer human-stop to one concern question that blocks the
+      task
+    - routes a close-up human-async to the task when there is no item context
+    - turns routed remarkable decisions into digest-only entries regardless of
+      disposition
+    - digests a dismissed escalated concern as q-escalated while keeping the
+      dismissal
+    - suppresses human-awareness digests below minDigestSeverity and downgrades
+      stops below minBlockingSeverity
+    - digests a low-severity routed blocker when minDigest is low but never
+      derives it as blocking
+    - collectRoutedBlockers filters routed blockers by minBlockingSeverity,
+      defaulting to high
+    - threads pipeline.concerns.minBlockingSeverity into task derivation with a
+      high fallback
+    - skips concerns from non-allowlisted agents, journals the skip, and keeps
+      the step ok
+    - halts with exit 10 for a high-severity human-stop concern, writing one
+      q-concern entry
+    - downgrades a medium-severity human-stop concern to a digest and finishes
+      unblocked
+evidence:
+  - bun run typecheck -> exit 0 (no type errors) after test additions.
+  - TMPDIR=/tmp bun test test/engine/human-router-severity.test.ts -> 3 pass, 11
+    fail, 0 errors; all 11 failures are assertion failures caused by missing
+    router/severity/allowlist behavior, not imports or syntax.
+  - "JUnit simulation against bun --reporter=junit output using the engine's
+    parseJunit/matcher semantics: all 11 declared expectRed ids matched with
+    status FAIL."
+  - TMPDIR=/tmp bun test test/engine/routing-blocker-derive.test.ts
+    test/engine/routing-architect-consult.test.ts -> 13 pass, 0 fail after
+    explicit high-severity fixture updates.
+  - TMPDIR=/tmp bun test (full plugin suite) -> 415 pass, 2 skip, 11 fail; the
+    only failures are the declared target-red tests.
+  - "Tests cover: plan/close-up itemless routing with task blocks, concern-id
+    q-concern-<cid> dedup, rm-* digest exemption, dismissed+escalated
+    q-escalated digest, ordinary dismiss retention, default medium/high
+    digest/blocking thresholds, downgrade below minBlocking, low routed blocker
+    hydrated+digested but not blocking, collectRoutedBlockers severity filtering
+    with high fallback, deriveTaskState threshold threading and fallback,
+    allowlist keyed by source.agent with journal+step ok, and engine-level async
+    (no exit 10) vs stop (single q + exit 10) vs downgraded stop (clean
+    completion)."
+concerns:
+  - Tests pin the ingest skip journal event name to `concern_ingest_skipped`
+    (with `agent`) and digest mailbox ids to `q-concern-<cid>` /
+    `q-escalated-<cid>`; these are chosen contracts the implementation must
+    match.
+  - Allowlist gating is specified at step ingest; `reconcileConcerns` rebuilds
+    concerns from committed records and may resurrect allowlist-skipped concerns
+    unless it applies the same source.agent gate.
+  - Two green regression tests (ordinary dismiss, routed architect hydration)
+    are not in expectRed; the async engine scenario is likewise green on current
+    code and guards against regressions.
+notes: The implementation must route all triager human-* dispositions through
+  triage/ingest, thread pipeline.concerns.minDigestSeverity/minBlockingSeverity
+  with medium/high fallbacks, skip concern-id human-* in the item-machine raw
+  question path (single q, no double write), and add an optional minBlocking
+  argument to collectRoutedBlockers used by deriveTaskState (fallback high). The
+  plan/close-up itemless case must write blocks:["task"]; item contexts use
+  blocks:["item"]. The engine stop test exercises a real task run and requires
+  the routed-blocker consult path, so the implementation must keep the
+  stop/digest behavior coherent across ingest, derive, and item-machine.
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..46880f3
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,116 @@
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
+        durationMs: 5067
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 294165
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-pkZkqM/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3754444
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3754444
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3754444
+
+           426 pass
+           2 skip
+           0 fail
+           2295 expect() calls
+          Ran 428 tests across 67 files. [141.93s]
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
+      command: cd plugins/software-factory && bun test
+        test/engine/human-router-severity.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794184817079-3coommd2cr2.xml
+      junitCaseCount: 14
+      junitCaseIds:
+        - Single human router (adr-human-router-single).routes a plan-reviewer
+          human-stop to one concern question that blocks the task
+        - Single human router (adr-human-router-single).routes a close-up
+          human-async to the task when there is no item context
+        - Single human router (adr-human-router-single).shows a plan-reviewer
+          routed architect concern in the next architect hydration
+        - Single human router (adr-human-router-single).turns routed remarkable
+          decisions into digest-only entries regardless of disposition
+        - Single human router (adr-human-router-single).digests a dismissed
+          escalated concern as q-escalated while keeping the dismissal
+        - Single human router (adr-human-router-single).keeps an ordinary
+          dismissal on disk with its reason and produces no mailbox effect
+        - Single human router (adr-human-router-single).suppresses
+          human-awareness digests below minDigestSeverity and downgrades stops
+          below minBlockingSeverity
+        - Single human router (adr-human-router-single).digests a low-severity
+          routed blocker when minDigest is low but never derives it as blocking
+        - Severity policy in derive
+          (adr-severity-policy-active).collectRoutedBlockers filters routed
+          blockers by minBlockingSeverity, defaulting to high
+        - Severity policy in derive (adr-severity-policy-active).threads
+          pipeline.concerns.minBlockingSeverity into task derivation with a high
+          fallback
+        - Ingest allowlist (adr-severity-policy-active).skips concerns from
+          non-allowlisted agents, journals the skip, and keeps the step ok
+        - Engine human routing with concern triage
+          (adr-human-router-single).halts with exit 10 for a high-severity
+          human-stop concern, writing one q-concern entry
+        - Engine human routing with concern triage
+          (adr-human-router-single).parks a high-severity human-async item
+          without halting the task
+        - Engine human routing with concern triage
+          (adr-human-router-single).downgrades a medium-severity human-stop
+          concern to a digest and finishes unblocked
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 263/300 production lines changed"
+    details:
+      changedLines:
+        added: 221
+        deleted: 42
+        total: 263
+        files:
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/derive/task.ts
+          - plugins/software-factory/src/core/flows/item-machine.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/triage.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..2ea82d6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,89 @@
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
+  "slug": "human-router-severity",
+  "kind": "dev",
+  "title": "Human router and severity policy",
+  "assignment": "Requires hydration-fingerprint-caps (consumes hydrateStepConcerns/listHydratedConcerns sets). Own triage routeHumanDisposition + ingest gates + derive threading per adr-human-router-single + adr-severity-policy-active + adr-hydrated-sets rm rules. Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (q-concern-/q-escalated-), never blocking/halting; dedup by existence. item-machine raw path skips ALL concern-id human-* (no double-write). Severity: gate key source.agent (never fragment): developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, architect covers architect-*; shipped 8-agent allowlist already complete — no entries added, commentary documents fragment->agent mapping. Effective defaults medium/high (code fallback identical). Order: schema validation first, then ingest allowlist skip+journal with step ok. Digest iff severity>=minDigest; blocks iff severity>=minBlocking else downgrade to digest (stop loses exit-10); rm-* exempt. Own derive: collectRoutedBlockers(taskDir,minBlocking) blocks only kind=blocker+routed+severity>=minBlocking; deriveTaskState/withRoutedBlocking thread pipeline.concerns.minBlockingSeverity (fallback high); debt predicate unchanged. Explicit fixture severities keep suite green. Behavior tests: plan/close-up routing, routed architect visible in next architect hydration, dismiss keeps file with dismissReason and no effects, rm digest blocks=[] never halts, async no exit-10 vs blocking stop single q + exit-10, allowlist skip+journal+ok, downgrade + derive unblocked, no double-write, low blocker not blocked but hydrated/digested. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~280 prod lines.",
+  "outlineRef": "human-router-severity",
+  "milestone": "m3-routing-lifecycle",
+  "wave": 2,
+  "deps": [
+    "hydration-fingerprint-caps"
+  ],
+  "scenarioRefs": [
+    "m3-routing-lifecycle:1",
+    "m3-routing-lifecycle:2",
+    "m3-routing-lifecycle:3",
+    "m3-routing-lifecycle:4",
+    "m3-routing-lifecycle:5",
+    "m3-routing-lifecycle:6",
+    "m3-routing-lifecycle:7"
+  ],
+  "citations": [
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/human-router-severity.test.ts"
+  ],
+  "expectRed": [
+    "routes a plan-reviewer human-stop to one concern question that blocks the task",
+    "routes a close-up human-async to the task when there is no item context",
+    "turns routed remarkable decisions into digest-only entries regardless of disposition",
+    "digests a dismissed escalated concern as q-escalated while keeping the dismissal",
+    "suppresses human-awareness digests below minDigestSeverity and downgrades stops below minBlockingSeverity",
+    "digests a low-severity routed blocker when minDigest is low but never derives it as blocking",
+    "collectRoutedBlockers filters routed blockers by minBlockingSeverity, defaulting to high",
+    "threads pipeline.concerns.minBlockingSeverity into task derivation with a high fallback",
+    "skips concerns from non-allowlisted agents, journals the skip, and keeps the step ok",
+    "halts with exit 10 for a high-severity human-stop concern, writing one q-concern entry",
+    "downgrades a medium-severity human-stop concern to a digest and finishes unblocked"
+  ]
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/steer.ts:59-88",
+  "plugins/software-factory/src/core/derive/task.ts:167-205",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
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
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..845d98e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
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
+status: ok
+startedAt: 2026-11-09T00:18:31.564Z
+session: 01a1bdab-bfa1-73f5-a037-88a3ee1275c6
+endedAt: 2026-11-09T00:40:26.919Z
+usage:
+  inputTokens: 146227
+  outputTokens: 40618
+  costUsd: 0.071924
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T00-18-31-969Z_01a1bdab-bfa1-73f5-a037-88a3ee1275c6.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..9f12b39
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/human-router-severity/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,68 @@
+status: ok
+summary: "Implemented the single human-disposition router and active
+  severity/allowlist policy. triage.ts now exports routeHumanDisposition plus
+  shared medium/high severity policy resolution: human-async/human-stop block
+  item+task (or task alone without item context) only at/above
+  minBlockingSeverity, downgrading to human-awareness digests below it;
+  human-awareness, routed rm-* and dismissed-escalated concerns become digest
+  questions with empty blocks (q-concern-*/q-escalated-*); below
+  minDigestSeverity nothing is surfaced; rm-* is threshold-exempt; questions
+  dedupe by id via writeQuestion. Ingest gates concerns by source.agent against
+  the shipped 8-agent allowlist (code fallback mirrors pipeline.default.yaml),
+  journals concern_ingest_skipped and keeps the step ok. derive/task.ts filters
+  routed blockers by minBlockingSeverity (default high) and
+  deriveTaskState/iteration thread pipeline.concerns.minBlockingSeverity.
+  item-machine now skips all concern-id human-* raw writes and derives item
+  blocking from the router's actual mailbox questions, so downgraded stops
+  finish unblocked while highs still halt. Updated two reviewer-triage fixtures
+  to explicit high severity per the new policy."
+target:
+  selectors:
+    - test/engine/human-router-severity.test.ts
+  expectRed:
+    - routes a plan-reviewer human-stop to one concern question that blocks the
+      task
+    - routes a close-up human-async to the task when there is no item context
+    - turns routed remarkable decisions into digest-only entries regardless of
+      disposition
+    - digests a dismissed escalated concern as q-escalated while keeping the
+      dismissal
+    - suppresses human-awareness digests below minDigestSeverity and downgrades
+      stops below minBlockingSeverity
+    - digests a low-severity routed blocker when minDigest is low but never
+      derives it as blocking
+    - collectRoutedBlockers filters routed blockers by minBlockingSeverity,
+      defaulting to high
+    - threads pipeline.concerns.minBlockingSeverity into task derivation with a
+      high fallback
+    - skips concerns from non-allowlisted agents, journals the skip, and keeps
+      the step ok
+    - halts with exit 10 for a high-severity human-stop concern, writing one
+      q-concern entry
+    - downgrades a medium-severity human-stop concern to a digest and finishes
+      unblocked
+evidence:
+  - "bun run typecheck: clean (tsc --noEmit exit 0) after all edits"
+  - "TMPDIR=/tmp bun test test/engine/human-router-severity.test.ts: 14 pass, 0
+    fail (all 11 previously-red target cases now green)"
+  - "TMPDIR=/tmp bun test (full suite): 426 pass, 2 skip, 0 fail across 428
+    tests / 67 files"
+  - "Related suites reviewer-triage, routing-human-debt, routing-blocker-derive,
+    routing-architect-consult, plan-reviewer-triage, human-async-steering,
+    adr-blocking-digest: all green after fixture-severity updates"
+  - "concerns-funnel + hydration-fingerprint-caps: 39 pass, 0 fail (router
+    consumes hydration sets without regressions)"
+concerns:
+  - reconcileConcerns rebuilds concerns from committed step records at engine
+    startup without re-applying concerns.raiseAllowlist; a skipped
+    non-allowlisted step's concerns could reappear after crash repair. The gate
+    is applied at ingest as specified, but reconcile has no pipeline config
+    available at its current call site.
+  - DEFAULT_RAISE_ALLOWLIST in code mirrors config/pipeline.default.yaml; if the
+    shipped config list changes the fallback constant must be kept in sync.
+notes: "The raw item-machine path now treats concern-id human dispositions as
+  owned by triage, and post-step blocking reads the router's actual mailbox
+  questions; this is what makes a downgraded medium human-stop neither block the
+  item nor count as a terminal issue. Two reviewer-triage fixtures were given
+  explicit severity: high because their medium severity would now (correctly)
+  downgrade human-async to a digest under the default minBlockingSeverity=high."
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index 8ec640d..bd8f55d 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -17,6 +17,29 @@ type Obj = Record<string, any>;
 type Patch = (record: Obj, at: string) => Obj;
 const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
 const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };
+
+/** True when `severity` reaches the configured minimum threshold. */
+export function severityAtLeast(severity: ConcernSeverity, min: ConcernSeverity): boolean {
+  return RANK[severity] >= RANK[min];
+}
+
+/**
+ * Agents whose output schemas can raise concerns; mirrors the shipped
+ * `pipeline.default.yaml` allowlist. The key is the raising step's
+ * `source.agent`, never its fragment: developer covers develop/poc/
+ * test-assumptions/test-first/simple-implement/fix-round, fact-finder covers
+ * research, and architect covers architect-*.
+ */
+export const DEFAULT_RAISE_ALLOWLIST = [
+  "developer",
+  "fact-finder",
+  "architect",
+  "qa",
+  "reviewer",
+  "plan-reviewer",
+  "wave-close-up",
+  "plan-close-up",
+] as const;
 /** Serializes read-modify-write cycles of one task's concern store. */
 const locks = new KeyedMutex();
 const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
index f7ea7ec..878754f 100644
--- a/plugins/software-factory/src/core/derive/task.ts
+++ b/plugins/software-factory/src/core/derive/task.ts
@@ -2,6 +2,7 @@ import fs from "node:fs";
 import path from "node:path";
 import type {
   ConcernCounts,
+  ConcernSeverity,
   DecisionArtifact,
   PlanArtifact,
   PlanCloseupArtifact,
@@ -17,7 +18,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
 import { deriveItemState, withRoutedBlocking, type DerivedItemState } from "./item.js";
 import { deriveWaveState, type DerivedWaveState } from "./wave.js";
 import { BudgetTracker } from "../budget.js";
-import { countConcerns, listConcerns } from "../concerns.js";
+import { countConcerns, listConcerns, severityAtLeast } from "../concerns.js";
 import { isDebtConcern } from "../triage.js";
 import { questionBlocks } from "../steer.js";
 import { blockedByConcern } from "../plan/scheduler.js";
@@ -44,13 +45,18 @@ export interface DerivedTaskState {
 }
 
 /**
- * Collects item slugs named by routed blocker concerns (adr-routing-derived-state).
- * Pure read: the concern store is authoritative; derive never writes.
+ * Collects item slugs named by routed blocker concerns at or above
+ * `minBlockingSeverity` (adr-routing-derived-state, adr-severity-policy-active).
+ * Defaults to high; pure read, the concern store is authoritative.
  */
-export async function collectRoutedBlockers(taskDir: string): Promise<Set<string>> {
+export async function collectRoutedBlockers(
+  taskDir: string,
+  minBlockingSeverity: ConcernSeverity = "high"
+): Promise<Set<string>> {
   const affected = new Set<string>();
   for (const concern of await listConcerns(taskDir)) {
     if (concern.kind !== "blocker" || concern.status !== "routed") continue;
+    if (!severityAtLeast(concern.severity, minBlockingSeverity)) continue;
     for (const slug of concern.affects ?? []) {
       affected.add(slug);
     }
@@ -171,7 +177,10 @@ export async function deriveTaskState(opts: {
   // (blockedByConcern); task only maps derive statuses onto scheduler
   // inputs. Pending-only seeding matches §8.2 and keeps itemMap consistent
   // with deriveWaveState/iteration.
-  const routedNames = await collectRoutedBlockers(taskDir);
+  const routedNames = await collectRoutedBlockers(
+    taskDir,
+    pipeline?.concerns?.minBlockingSeverity ?? "high"
+  );
   const schedItems = items.map((it) => ({
     slug: it.slug,
     wave: String(it.wave),
diff --git a/plugins/software-factory/src/core/flows/item-machine.ts b/plugins/software-factory/src/core/flows/item-machine.ts
index 3388065..94db2c8 100644
--- a/plugins/software-factory/src/core/flows/item-machine.ts
+++ b/plugins/software-factory/src/core/flows/item-machine.ts
@@ -20,7 +20,8 @@ import { runAgentStep, type StepRunResult } from "./step-runner.js";
 import { runItemConsult } from "./consults.js";
 import { runSeamHooks } from "./seams.js";
 import { appendJournal } from "../journal.js";
-import { writeQuestion } from "../steer.js";
+import { questionBlocks, writeQuestion } from "../steer.js";
+import { listConcernIds } from "../concerns.js";
 import { deriveItemState, type DerivedItemState } from "../derive/item.js";
 import { refreshStateYaml } from "../derive/task.js";
 import {
@@ -659,6 +660,10 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
   const recordsDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps");
   await fs.promises.mkdir(recordsDir, { recursive: true });
 
+  // Concern-id human dispositions are owned by the single triage router; the
+  // raw item-machine question path must not double-write them.
+  const concernIds = new Set(await listConcernIds(taskDir));
+
   // 5. Run seam hooks before:item.step.{id} (§8.10)
   await runSeamHooks({
     phase: "before",
@@ -707,23 +712,17 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
     beforeChecks,
     afterChecks,
     writeArtifact: async (output: unknown) => {
-      // Persist human-* questions atomically with the review record (Finding 23).
-      // human-async concern ids are triaged separately (q-concern-*).
+      // Persist raw human-* questions atomically with the review record
+      // (Finding 23). Concern-id dispositions are routed once by triage
+      // (q-concern-*/q-escalated-*), so this raw path skips them entirely.
       if (output && typeof output === "object" && "suggestions" in (output as any)) {
         const rev = output as ReviewArtifact;
-        const concernIds = new Set<string>();
-        try {
-          for (const name of await fs.promises.readdir(path.join(taskDir, "concerns"))) {
-            if (name.endsWith(".yaml")) concernIds.add(name.slice(0, -5));
-          }
-        } catch (err: any) {
-          if (err?.code !== "ENOENT") throw err;
-        }
         const humanSuggestions = rev.suggestions?.filter(
           (s) =>
-            s.disposition === "human-stop" ||
-            s.disposition === "human-awareness" ||
-            (s.disposition === "human-async" && !concernIds.has(s.id))
+            (s.disposition === "human-stop" ||
+              s.disposition === "human-awareness" ||
+              s.disposition === "human-async") &&
+            !concernIds.has(s.id)
         );
         for (const q of humanSuggestions ?? []) {
           const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
@@ -764,9 +763,30 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
     item: itemSlug,
   });
 
-  // Human dispositions block the item; human-awareness is digest-only and lands here as success.
-  const hasHumanBlock = (stepRes.output as any)?.suggestions?.some(
-    (s: any) => s.disposition === "human-async" || s.disposition === "human-stop"
+  // Concern-id human dispositions block only when the router wrote an open
+  // blocking question (severity downgrade/suppression keeps the item moving).
+  const routedQuestions: SteerItemArtifact[] = [];
+  for (const id of stepRes.triage?.mailboxIds ?? []) {
+    try {
+      routedQuestions.push(
+        await readYaml<SteerItemArtifact>(
+          path.join(taskDir, "steer", "tousertoreview", `${id}.yaml`)
+        )
+      );
+    } catch {
+      // A missing question file cannot block.
+    }
+  }
+  const routedBlocksItem = routedQuestions.some((q) => questionBlocks(q, itemSlug));
+  const suggestions = ((stepRes.output as any)?.suggestions ?? []) as Array<{
+    id: string;
+    disposition?: string;
+  }>;
+
+  // Human dispositions block the item; human-awareness is digest-only.
+  const hasHumanBlock = suggestions.some((s) =>
+    (s.disposition === "human-async" || s.disposition === "human-stop") &&
+    (concernIds.has(s.id) ? routedBlocksItem : true)
   );
   if (hasHumanBlock) {
     return { done: true, status: "blocked", stepRan: currentStep.id };
@@ -774,8 +794,10 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
 
   // Check if this was the last step and succeeded
   const isLastStep = targetStepIndex === steps.length - 1;
-  const hasIssues = (stepRes.output as any)?.suggestions?.some(
-    (s: any) => s.disposition === "fix" || s.disposition === "human-stop"
+  const hasIssues = suggestions.some(
+    (s) =>
+      s.disposition === "fix" ||
+      (s.disposition === "human-stop" && !concernIds.has(s.id))
   );
   const isTerminalSuccess = isLastStep && stepRes.ok && !hasIssues;
 
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index 0cc7f10..1b4f460 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -817,7 +817,10 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
     let waveState = deriveWaveState({
       wave: w,
       items: itemStates,
-      blockedBy: await collectRoutedBlockers(taskDir),
+      blockedBy: await collectRoutedBlockers(
+        taskDir,
+        pipeline.concerns?.minBlockingSeverity ?? "high"
+      ),
     });
 
     if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
@@ -916,7 +919,10 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
       waveState = deriveWaveState({
         wave: w,
         items: itemStates,
-        blockedBy: await collectRoutedBlockers(taskDir),
+        blockedBy: await collectRoutedBlockers(
+          taskDir,
+          pipeline.concerns?.minBlockingSeverity ?? "high"
+        ),
       });
       architectSessionId = await consultRoutedBlockers(
         consultCtx,
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index 69fba68..aaa3aea 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -27,6 +27,7 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
   aggregateConcerns,
   applyCloseupResolutions,
+  DEFAULT_RAISE_ALLOWLIST,
 } from "../concerns.js";
 import {
   applyReviewTriage,
@@ -184,16 +185,32 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
 
 /** Feeds a step's producer fields into the taskWt concern store (§18). */
 async function ingestStepConcerns(opts: {
-  taskDir: string; taskWt: string; repo: any; output: unknown;
+  task: string; taskDir: string; taskWt: string; repo: any; output: unknown; pipeline: PipelineConfig;
   source: { record: string; agent: string; step: string; item?: string; iteration?: number };
 }): Promise<ReviewTriageOutcome | undefined> {
   const data = (opts.output ?? {}) as Record<string, any>;
-  const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
+  let concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
   const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
   const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
   const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
   if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return undefined;
 
+  // Gate key is source.agent, never the step fragment. Skipping keeps the step
+  // ok (schema validation already passed) and only journals the dropped input.
+  const allowlist: readonly string[] =
+    opts.pipeline.concerns?.raiseAllowlist ?? DEFAULT_RAISE_ALLOWLIST;
+  if (concerns.length > 0 && !allowlist.includes(opts.source.agent)) {
+    await appendJournal(opts.taskDir, {
+      type: "concern_ingest_skipped",
+      task: opts.task,
+      ...(opts.source.item ? { item: opts.source.item } : {}),
+      step: opts.source.step,
+      agent: opts.source.agent,
+      count: concerns.length,
+    });
+    concerns = [];
+  }
+
   // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
   let existing: string[] = [];
   try {
@@ -210,6 +227,12 @@ async function ingestStepConcerns(opts: {
         suggestions,
         concernIds: existing,
         isTriager: isTriagerAgent(opts.source.agent),
+        ...(opts.pipeline.concerns?.minDigestSeverity
+          ? { minDigestSeverity: opts.pipeline.concerns.minDigestSeverity }
+          : {}),
+        ...(opts.pipeline.concerns?.minBlockingSeverity
+          ? { minBlockingSeverity: opts.pipeline.concerns.minBlockingSeverity }
+          : {}),
         ...(opts.source.item ? { item: opts.source.item } : {}),
       })
     : undefined;
@@ -720,7 +743,7 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
   if (finalStatus === "ok") {
     try {
       triageOutcome = await ingestStepConcerns({
-        taskDir, taskWt, repo, output: validatedData,
+        task, taskDir, taskWt, repo, output: validatedData, pipeline,
         source: {
           record: dirName, agent, step: stepId,
           ...(item ? { item } : {}),
diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
index 479287e..60151a9 100644
--- a/plugins/software-factory/src/core/triage.ts
+++ b/plugins/software-factory/src/core/triage.ts
@@ -1,8 +1,13 @@
 import fs from "node:fs";
 import path from "node:path";
 import yaml from "yaml";
-import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
-import { applyConcernTriage, listConcerns } from "./concerns.js";
+import type {
+  ConcernSeverity,
+  PipelineConfig,
+  ReviewSuggestion,
+  StoredConcernArtifact,
+} from "./artifacts.js";
+import { applyConcernTriage, listConcerns, severityAtLeast } from "./concerns.js";
 import type { Repo } from "./git/repo.js";
 import { readYaml } from "./records/io.js";
 import { writeQuestion } from "./steer.js";
@@ -21,6 +26,7 @@ export interface ReviewTriageOutcome extends TriagePartition {
 export interface ReviewTriageContext {
   taskDir: string; taskWt: string; repo: Repo; suggestions: ReviewSuggestion[];
   concernIds: Iterable<string>; isTriager: boolean; item?: string; now?: () => Date;
+  minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity;
 }
 /** Contract violation that must fail the review step instead of being journaled. */
 export class TriageValidationError extends Error {}
@@ -47,6 +53,88 @@ export function concernMailboxId(concernId: string): string {
   return `q-concern-${concernId}`;
 }
 
+export interface ConcernSeverityPolicy {
+  minDigestSeverity: ConcernSeverity;
+  minBlockingSeverity: ConcernSeverity;
+}
+
+/** Code fallback matches the shipped config: medium digests, high blocks. */
+export const DEFAULT_CONCERN_SEVERITY_POLICY: ConcernSeverityPolicy = {
+  minDigestSeverity: "medium",
+  minBlockingSeverity: "high",
+};
+
+export function resolveConcernSeverityPolicy(
+  concerns?: PipelineConfig["concerns"]
+): ConcernSeverityPolicy {
+  return {
+    minDigestSeverity: concerns?.minDigestSeverity ?? DEFAULT_CONCERN_SEVERITY_POLICY.minDigestSeverity,
+    minBlockingSeverity:
+      concerns?.minBlockingSeverity ?? DEFAULT_CONCERN_SEVERITY_POLICY.minBlockingSeverity,
+  };
+}
+
+export interface HumanRouteContext extends ConcernSeverityPolicy {
+  taskDir: string;
+  taskWt: string;
+  item?: string;
+}
+
+/**
+ * Single human-disposition router for every triager (adr-human-router-single).
+ * `human-async` and `human-stop` block only at or above `minBlockingSeverity`;
+ * below it they downgrade to an `human-awareness` digest (so a downgraded stop
+ * loses its exit-10 halt). `human-awareness`, routed remarkable decisions
+ * (`rm-*`) and dismissed escalated concerns are digest-only with no blocks.
+ * Nothing is surfaced below `minDigestSeverity`; `rm-*` is exempt from both
+ * thresholds. Questions dedupe by id (an existing answered entry is kept).
+ * Returns the mailbox id written, if any.
+ */
+export async function routeHumanDisposition(
+  ctx: HumanRouteContext,
+  suggestion: ReviewSuggestion,
+  concern?: StoredConcernArtifact
+): Promise<string | undefined> {
+  const isRemarkable = suggestion.id.startsWith("rm-");
+  const isHuman =
+    suggestion.disposition === "human-awareness" ||
+    suggestion.disposition === "human-async" ||
+    suggestion.disposition === "human-stop";
+  const dismissedEscalated =
+    suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
+  if (!isHuman && !isRemarkable && !dismissedEscalated) return undefined;
+
+  const severity = concern?.severity ?? "medium";
+  const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
+  const blocking =
+    !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
+  const disposition =
+    digestOnly || !blocking
+      ? "human-awareness"
+      : (suggestion.disposition as "human-async" | "human-stop");
+  if (!isRemarkable && !severityAtLeast(severity, ctx.minDigestSeverity)) return undefined;
+
+  const id = dismissedEscalated
+    ? `q-escalated-${suggestion.id}`
+    : concernMailboxId(suggestion.id);
+  const blocks =
+    disposition === "human-stop"
+      ? ctx.item
+        ? [ctx.item, "task"]
+        : ["task"]
+      : disposition === "human-async"
+        ? [ctx.item ?? "task"]
+        : [];
+  await writeQuestion(ctx.taskWt, ctx.taskDir, {
+    id,
+    ref: ctx.item ?? suggestion.id,
+    disposition,
+    question: suggestion.detail?.trim() || suggestion.summary,
+    blocks,
+  });
+  return id;
+}
+
 /**
  * Debt predicate for close-up accounting. Open concerns are still live, so they
  * are not debt; a non-open `tech-debt` concern or an `optional` disposition is.
@@ -235,18 +323,26 @@ export async function applyReviewTriage(
 
   const dismissed = partition.triage.filter((s) => s.disposition === "dismiss");
   const routed = partition.triage.filter((s) => s.disposition !== "dismiss");
+  const policy = resolveConcernSeverityPolicy({
+    minDigestSeverity: ctx.minDigestSeverity,
+    minBlockingSeverity: ctx.minBlockingSeverity,
+  });
+  const stored = new Map(
+    (await listConcerns(ctx.taskDir)).map((concern) => [concern.id, concern])
+  );
   const mailboxIds: string[] = [];
-  for (const s of routed) {
-    if (s.disposition !== "human-async") continue;
-    const id = concernMailboxId(s.id);
-    await writeQuestion(ctx.taskWt, ctx.taskDir, {
-      id,
-      ref: ctx.item ?? s.id,
-      disposition: "human-async",
-      question: s.detail?.trim() || s.summary,
-      ...(ctx.item ? { blocks: [ctx.item] } : {}),
-    });
-    mailboxIds.push(id);
+  for (const s of partition.triage) {
+    const id = await routeHumanDisposition(
+      {
+        taskDir: ctx.taskDir,
+        taskWt: ctx.taskWt,
+        ...(ctx.item ? { item: ctx.item } : {}),
+        ...policy,
+      },
+      s,
+      stored.get(s.id)
+    );
+    if (id) mailboxIds.push(id);
   }
 
   return { ...partition, routed, dismissed, mailboxIds };
diff --git a/plugins/software-factory/test/engine/human-router-severity.test.ts b/plugins/software-factory/test/engine/human-router-severity.test.ts
new file mode 100644
index 0000000..b01adc9
--- /dev/null
+++ b/plugins/software-factory/test/engine/human-router-severity.test.ts
@@ -0,0 +1,1023 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runAgentStep } from "../../src/core/flows/step-runner.js";
+import { runTask } from "../../src/core/engine.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import { readJournal } from "../../src/core/journal.js";
+import { questionBlocks } from "../../src/core/steer.js";
+import { concernFingerprint } from "../../src/core/concerns.js";
+import {
+  applyReviewTriage,
+  listHydratedConcerns,
+} from "../../src/core/triage.js";
+import {
+  collectRoutedBlockers,
+  deriveTaskState,
+} from "../../src/core/derive/task.js";
+import type {
+  Concern,
+  ConcernSeverity,
+  PipelineConfig,
+  ProjectConfig,
+  ReviewSuggestion,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Single human-disposition router + active severity policy (§18; ADRs
+ * adr-human-router-single, adr-severity-policy-active, adr-hydrated-sets).
+ *
+ * Every triager's human-* disposition is routed by the same triage/ingest path:
+ * - human-async blocks [item] for items, [task] for plan/close-up triage;
+ * - human-stop blocks item+task (or task) and therefore halts with exit 10;
+ * - human-awareness, routed rm-*, and dismissed escalated concerns become a
+ *   digest entry (human-awareness, blocks []) that never blocks or halts;
+ * - rm-* is exempt from severity thresholds;
+ * - severity below `concerns.minBlockingSeverity` downgrades blocking
+ *   dispositions to the digest, and below `concerns.minDigestSeverity` the
+ *   concern is not surfaced at all. Defaults are medium/high (code fallback).
+ *
+ * Routed blockers honor `minBlockingSeverity` in derive (default high), and the
+ * item-machine raw question path never double-writes a concern-id question.
+ */
+
+const ORCH = ".factory";
+const TASK = "router-severity";
+const agentsDir = path.resolve(import.meta.dir, "../../agents");
+
+const baseConcernsReviewPolicy = [
+  "fix",
+  "optional",
+  "architect",
+  "human-awareness",
+  "human-async",
+  "human-stop",
+];
+
+function makePipeline(concerns?: PipelineConfig["concerns"]): PipelineConfig {
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
+      "wave-close-up": { role: "alt-workhorse" },
+      "plan-close-up": { role: "alt-workhorse" },
+      architect: { role: "architect" },
+      pm: { role: "alt-workhorse" },
+    },
+    flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+    reviewPolicy: { default: baseConcernsReviewPolicy },
+    limits: {},
+    ...(concerns ? { concerns } : {}),
+  };
+}
+
+type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };
+
+function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
+  return {
+    kind: "risk",
+    summary: `Concern ${overrides.id}`,
+    detail: "detail",
+    severity: "medium",
+    status: "open",
+    source: { record: "001-develop-a1", agent: "developer" },
+    createdAt: "2026-01-01T00:00:00.000Z",
+    updatedAt: "2026-01-01T00:00:00.000Z",
+    ...overrides,
+  };
+}
+
+function writeConcernAt(taskDir: string, concern: StoredConcernArtifact): string {
+  const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
+  fs.mkdirSync(path.dirname(file), { recursive: true });
+  fs.writeFileSync(file, JSON.stringify(concern, null, 2), "utf8");
+  return file;
+}
+
+function writeItem(taskDir: string, slug: string, deps: string[] = []): void {
+  const dir = path.join(taskDir, "items", slug);
+  fs.mkdirSync(dir, { recursive: true });
+  fs.writeFileSync(
+    path.join(dir, "assignment.yaml"),
+    [
+      `slug: ${slug}`,
+      "kind: dev",
+      `title: ${slug}`,
+      "assignment: Do the work",
+      "wave: 1",
+      deps.length > 0 ? `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}` : "deps: []",
+    ].join("\n") + "\n",
+    "utf8"
+  );
+}
+
+describe("Single human router (adr-human-router-single)", () => {
+  let tmpRepo: TmpRepo;
+  let repo: Repo;
+  let taskWt: string;
+  let taskDir: string;
+  let worktreeRoot: string;
+  let project: ProjectConfig;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    taskWt = tmpRepo.dir;
+    taskDir = path.join(taskWt, ORCH, TASK);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Router severity\n", "utf8");
+    tmpRepo.commit("add router severity task");
+    project = { orchestrationFolder: ORCH, worktreeRoot };
+    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  function concernFiles(): string[] {
+    const dir = path.join(taskDir, "concerns");
+    if (!fs.existsSync(dir)) return [];
+    return fs
+      .readdirSync(dir)
+      .filter((n) => n.startsWith("c-") && n.endsWith(".yaml"))
+      .map((n) => n.slice(0, -".yaml".length))
+      .sort();
+  }
+
+  function mailboxFiles(): string[] {
+    const dir = path.join(taskDir, "steer", "tousertoreview");
+    if (!fs.existsSync(dir)) return [];
+    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
+  }
+
+  async function readQuestion(id: string): Promise<Record<string, any>> {
+    return readYaml<Record<string, any>>(
+      path.join(taskDir, "steer", "tousertoreview", `${id}.yaml`)
+    );
+  }
+
+  async function reviewOnce(suggestions: ReviewSuggestion[], item?: string) {
+    return applyReviewTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: true,
+      concernIds: [...concernFiles(), ...(fs.existsSync(path.join(taskDir, "concerns"))
+        ? fs
+            .readdirSync(path.join(taskDir, "concerns"))
+            .filter((n) => n.startsWith("rm-") && n.endsWith(".yaml"))
+            .map((n) => n.slice(0, -".yaml".length))
+        : [])],
+      ...(item ? { item } : {}),
+      suggestions,
+    });
+  }
+
+  it("routes a plan-reviewer human-stop to one concern question that blocks the task", async () => {
+    const cid = "c-1111111111";
+    writeConcernAt(taskDir, storedConcern({ id: cid, kind: "blocker", severity: "high", status: "open" }));
+
+    const suggestion: ReviewSuggestion = {
+      id: cid,
+      disposition: "human-stop",
+      summary: "Irreversible data-loss hazard",
+      detail: "Stop before writing anything else",
+    };
+    await reviewOnce([suggestion]);
+    // Dedup by existence: a re-run must not create a second mailbox entry.
+    await reviewOnce([suggestion]);
+
+    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
+    const q = await readQuestion(`q-concern-${cid}`);
+    expect(q.id).toBe(`q-concern-${cid}`);
+    expect(q.disposition).toBe("human-stop");
+    // Plan/close-up triage has no item context: the blocker is the whole task.
+    expect([...(q.blocks ?? [])].sort()).toEqual(["task"]);
+    expect(questionBlocks(q as any, "task")).toBe(true);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("routed");
+    expect(stored.disposition).toBe("human-stop");
+  });
+
+  it("routes a close-up human-async to the task when there is no item context", async () => {
+    const cid = "c-2222222222";
+    writeConcernAt(taskDir, storedConcern({ id: cid, kind: "question", severity: "high", status: "open" }));
+
+    await reviewOnce([
+      {
+        id: cid,
+        disposition: "human-async",
+        summary: "Which storage backend?",
+        detail: "The operator must choose before the plan proceeds",
+      },
+    ]);
+
+    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
+    const q = await readQuestion(`q-concern-${cid}`);
+    expect(q.disposition).toBe("human-async");
+    expect([...(q.blocks ?? [])]).toEqual(["task"]);
+    expect(questionBlocks(q as any, "task")).toBe(true);
+  });
+
+  it("shows a plan-reviewer routed architect concern in the next architect hydration", async () => {
+    const cid = "c-2222222223";
+    writeConcernAt(
+      taskDir,
+      storedConcern({ id: cid, kind: "risk", severity: "high", status: "open", affects: ["item-a"] })
+    );
+
+    await reviewOnce([
+      { id: cid, disposition: "architect", summary: "Architect must decide on the cache contract" },
+    ]);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("routed");
+    expect(stored.disposition).toBe("architect");
+
+    const architectSet = await listHydratedConcerns(taskDir, "architect");
+    expect(architectSet.find((r) => r.id === cid)).toMatchObject({
+      id: cid,
+      kind: "risk",
+      severity: "high",
+      disposition: "architect",
+    });
+    // Routed concerns are architect/close-up input, not reviewer input.
+    const reviewSet = await listHydratedConcerns(taskDir, "review");
+    expect(reviewSet.some((r) => r.id === cid)).toBe(false);
+  });
+
+  it("turns routed remarkable decisions into digest-only entries regardless of disposition", async () => {
+    const stopRm = "rm-3333333333";
+    const architectRm = "rm-4444444444";
+    fs.mkdirSync(path.join(taskDir, "concerns"), { recursive: true });
+    for (const id of [stopRm, architectRm]) {
+      await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
+        id,
+        chosen: `Chosen ${id}`,
+        alternatives: ["Alternative"],
+        why: "Tradeoff recorded for the operator",
+        status: "open",
+        source: { record: "001-architect-a1", agent: "architect" },
+        createdAt: "2026-01-01T00:00:00.000Z",
+        updatedAt: "2026-01-01T00:00:00.000Z",
+      });
+    }
+
+    await reviewOnce([
+      { id: stopRm, disposition: "human-stop", summary: "Blocking-looking remarkable" },
+      { id: architectRm, disposition: "architect", summary: "Routed remarkable" },
+    ]);
+
+    expect(mailboxFiles().sort()).toEqual(
+      [`q-concern-${stopRm}.yaml`, `q-concern-${architectRm}.yaml`].sort()
+    );
+    for (const id of [stopRm, architectRm]) {
+      const q = await readQuestion(`q-concern-${id}`);
+      expect(q.disposition).toBe("human-awareness");
+      expect(q.blocks ?? []).toEqual([]);
+      expect(questionBlocks(q as any, "task")).toBe(false);
+    }
+  });
+
+  it("digests a dismissed escalated concern as q-escalated while keeping the dismissal", async () => {
+    const cid = "c-5555555555";
+    writeConcernAt(
+      taskDir,
+      storedConcern({
+        id: cid,
+        kind: "risk",
+        severity: "high",
+        status: "open",
+        source: { record: "001-develop-a1", agent: "developer", escalated: true },
+      })
+    );
+
+    await reviewOnce([
+      {
+        id: cid,
+        disposition: "dismiss",
+        summary: "Already covered by the plan",
+        detail: "Superseded by milestone m2",
+      },
+    ]);
+
+    expect(mailboxFiles()).toEqual([`q-escalated-${cid}.yaml`]);
+    const q = await readQuestion(`q-escalated-${cid}`);
+    expect(q.disposition).toBe("human-awareness");
+    expect(q.blocks ?? []).toEqual([]);
+    expect(questionBlocks(q as any, "task")).toBe(false);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("dismissed");
+    expect(stored.dismissReason).toBe("Superseded by milestone m2");
+    expect(concernFiles()).toEqual([cid]);
+  });
+
+  it("keeps an ordinary dismissal on disk with its reason and produces no mailbox effect", async () => {
+    const cid = "c-6666666666";
+    writeConcernAt(
+      taskDir,
+      storedConcern({ id: cid, severity: "high", status: "open", affects: ["item-1"] })
+    );
+
+    await reviewOnce([
+      { id: cid, disposition: "dismiss", summary: "Not actionable", detail: "By design" },
+    ]);
+
+    expect(mailboxFiles()).toEqual([]);
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("dismissed");
+    expect(stored.dismissReason).toBe("By design");
+    expect(concernFiles()).toEqual([cid]);
+  });
+
+  it("suppresses human-awareness digests below minDigestSeverity and downgrades stops below minBlockingSeverity", async () => {
+    const high = "c-7777777771";
+    const medium = "c-7777777772";
+    const low = "c-7777777773";
+    writeConcernAt(taskDir, storedConcern({ id: high, severity: "high", status: "open" }));
+    writeConcernAt(taskDir, storedConcern({ id: medium, severity: "medium", status: "open" }));
+    writeConcernAt(taskDir, storedConcern({ id: low, severity: "low", status: "open" }));
+
+    const harness = new FakeHarness();
+    const data = {
+      status: "approved",
+      summary: "Plan review with human routes",
+      suggestions: [
+        { id: high, disposition: "human-stop", summary: "High severity stop" },
+        { id: medium, disposition: "human-stop", summary: "Medium severity stop" },
+        { id: low, disposition: "human-awareness", summary: "Low severity awareness" },
+      ],
+    };
+    const label = `${TASK}/runs/plan-review#a1`;
+    harness.scriptOutcome(label, { ok: true, data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
+
+    // No pipeline.concerns: the code fallback must be medium/high.
+    const result = await runAgentStep({
+      task: TASK,
+      stepId: "plan-review",
+      stepFragment: "steps/plan-review",
+      agent: "plan-reviewer",
+      role: "alt-architect",
+      cwd: taskWt,
+      taskWt,
+      taskDir,
+      recordsDir: path.join(taskDir, "runs"),
+      repo,
+      harness,
+      pipeline: makePipeline(),
+      project,
+      prompts,
+      promptVars: {
+        plan: "{}",
+        intent: "# Intent",
+        context: "",
+        limits: "",
+        dispositionsCriteria: "Use the review disposition vocabulary.",
+      },
+    });
+    expect(result.status).toBe("ok");
+
+    expect(mailboxFiles().sort()).toEqual(
+      [`q-concern-${high}.yaml`, `q-concern-${medium}.yaml`].sort()
+    );
+    const highQ = await readQuestion(`q-concern-${high}`);
+    expect(highQ.disposition).toBe("human-stop");
+    expect([...(highQ.blocks ?? [])].sort()).toEqual(["task"]);
+
+    const mediumQ = await readQuestion(`q-concern-${medium}`);
+    expect(mediumQ.disposition).toBe("human-awareness");
+    expect(mediumQ.blocks ?? []).toEqual([]);
+    expect(questionBlocks(mediumQ as any, "task")).toBe(false);
+
+    expect(mailboxFiles()).not.toContain(`q-concern-${low}.yaml`);
+  });
+
+  it("digests a low-severity routed blocker when minDigest is low but never derives it as blocking", async () => {
+    const cid = "c-8888888888";
+    writeConcernAt(
+      taskDir,
+      storedConcern({
+        id: cid,
+        kind: "blocker",
+        severity: "low",
+        status: "open",
+        affects: ["item-low"],
+      })
+    );
+    writeItem(taskDir, "item-low");
+
+    const pipeline = makePipeline({ minDigestSeverity: "low", minBlockingSeverity: "high" });
+    const harness = new FakeHarness();
+    const data = {
+      status: "approved",
+      summary: "Low-severity blocker needs a digest",
+      suggestions: [
+        { id: cid, disposition: "human-awareness", summary: "Low-severity blocker" },
+      ],
+    };
+    const label = `${TASK}/runs/plan-review#a1`;
+    harness.scriptOutcome(label, { ok: true, data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
+    const result = await runAgentStep({
+      task: TASK,
+      stepId: "plan-review",
+      stepFragment: "steps/plan-review",
+      agent: "plan-reviewer",
+      role: "alt-architect",
+      cwd: taskWt,
+      taskWt,
+      taskDir,
+      recordsDir: path.join(taskDir, "runs"),
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: {
+        plan: "{}",
+        intent: "# Intent",
+        context: "",
+        limits: "",
+        dispositionsCriteria: "Use the review disposition vocabulary.",
+      },
+    });
+    expect(result.status).toBe("ok");
+
+    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
+    const q = await readQuestion(`q-concern-${cid}`);
+    expect(q.disposition).toBe("human-awareness");
+    expect(questionBlocks(q as any, "task")).toBe(false);
+
+    // Hydrated for the architect, but not a routing/blocking input at high.
+    const architectSet = await listHydratedConcerns(taskDir, "architect");
+    expect(architectSet.some((r) => r.id === cid)).toBe(true);
+    const blockedAtHigh = await (
+      collectRoutedBlockers as (dir: string, min?: ConcernSeverity) => Promise<Set<string>>
+    )(taskDir, "high");
+    expect(blockedAtHigh.has("item-low")).toBe(false);
+    const blockedAtLow = await (
+      collectRoutedBlockers as (dir: string, min?: ConcernSeverity) => Promise<Set<string>>
+    )(taskDir, "low");
+    expect(blockedAtLow.has("item-low")).toBe(true);
+
+    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(state.itemMap["item-low"]?.status).toBe("pending");
+    expect(state.status).not.toBe("blocked");
+  });
+});
+
+describe("Severity policy in derive (adr-severity-policy-active)", () => {
+  const tmpDirs: string[] = [];
+
+  function makeTaskDir(): string {
+    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-router-severity-"));
+    tmpDirs.push(dir);
+    return dir;
+  }
+
+  afterEach(() => {
+    for (const dir of tmpDirs.splice(0)) {
+      fs.rmSync(dir, { recursive: true, force: true });
+    }
+  });
+
+  it("collectRoutedBlockers filters routed blockers by minBlockingSeverity, defaulting to high", async () => {
+    const taskDir = makeTaskDir();
+    writeConcernAt(taskDir, storedConcern({
+      id: "c-high0000001",
+      kind: "blocker",
+      status: "routed",
+      severity: "high",
+      affects: ["item-high"],
+    }));
+    writeConcernAt(taskDir, storedConcern({
+      id: "c-medium00001",
+      kind: "blocker",
+      status: "routed",
+      severity: "medium",
+      affects: ["item-medium"],
+    }));
+    writeConcernAt(taskDir, storedConcern({
+      id: "c-low00000001",
+      kind: "blocker",
+      status: "routed",
+      severity: "low",
+      affects: ["item-low"],
+    }));
+    writeConcernAt(taskDir, storedConcern({
+      id: "c-highrisk001",
+      kind: "risk",
+      status: "routed",
+      severity: "high",
+      affects: ["item-risk"],
+    }));
+    writeConcernAt(taskDir, storedConcern({
+      id: "c-highopen001",
+      kind: "blocker",
+      status: "open",
+      severity: "high",
+      affects: ["item-open"],
+    }));
+
+    const collect = collectRoutedBlockers as (
+      dir: string,
+      min?: ConcernSeverity
+    ) => Promise<Set<string>>;
+    expect([...(await collect(taskDir))].sort()).toEqual(["item-high"]);
+    expect([...(await collect(taskDir, "high"))].sort()).toEqual(["item-high"]);
+    expect([...(await collect(taskDir, "medium"))].sort()).toEqual(["item-high", "item-medium"]);
+    expect([...(await collect(taskDir, "low"))].sort()).toEqual([
+      "item-high",
+      "item-low",
+      "item-medium",
+    ]);
+  });
+
+  it("threads pipeline.concerns.minBlockingSeverity into task derivation with a high fallback", async () => {
+    const taskDir = makeTaskDir();
+    writeItem(taskDir, "blocker-source");
+    writeItem(taskDir, "dependent", ["blocker-source"]);
+    writeConcernAt(taskDir, storedConcern({
+      id: "c-mediumblk01",
+      kind: "blocker",
+      status: "routed",
+      severity: "medium",
+      affects: ["blocker-source"],
+    }));
+
+    // Absent pipeline config falls back to high: a medium blocker is not blocking.
+    const fallback = await deriveTaskState({ taskDir, task: "router-severity" });
+    expect(fallback.itemMap["blocker-source"]?.status).toBe("pending");
+    expect(fallback.itemMap["dependent"]?.status).toBe("pending");
+    expect(fallback.status).not.toBe("blocked");
+
+    // An explicit medium threshold activates the routed blocker cascade.
+    const threadedPipeline = makePipeline({ minBlockingSeverity: "medium" });
+    const threaded = await deriveTaskState({
+      taskDir,
+      task: "router-severity",
+      pipeline: threadedPipeline,
+    });
+    expect(threaded.itemMap["blocker-source"]?.status).toBe("blocked");
+    expect(threaded.itemMap["dependent"]?.status).toBe("blocked");
+    expect(threaded.status).toBe("blocked");
+  });
+});
+
+describe("Ingest allowlist (adr-severity-policy-active)", () => {
+  let tmpRepo: TmpRepo;
+  let repo: Repo;
+  let taskWt: string;
+  let taskDir: string;
+  let worktreeRoot: string;
+  let project: ProjectConfig;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    taskWt = tmpRepo.dir;
+    taskDir = path.join(taskWt, ORCH, TASK);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Allowlist\n", "utf8");
+    tmpRepo.commit("add allowlist task");
+    project = { orchestrationFolder: ORCH, worktreeRoot };
+    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  function concernFiles(): string[] {
+    const dir = path.join(taskDir, "concerns");
+    if (!fs.existsSync(dir)) return [];
+    return fs.readdirSync(dir).filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).sort();
+  }
+
+  async function runDeveloper(
+    pipeline: PipelineConfig,
+    stepId: "test-first" | "poc",
+    summary: string
+  ) {
+    const harness = new FakeHarness();
+    const data = {
+      status: "ok",
+      summary: `Ran ${stepId}`,
+      concerns: [{ kind: "risk", summary, detail: "allowlist gate", severity: "high" }],
+    };
+    const label = `${TASK}/runs/${stepId}#a1`;
+    harness.scriptOutcome(label, { ok: true, data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
+    return runAgentStep({
+      task: TASK,
+      stepId,
+      stepFragment: `steps/${stepId}`,
+      agent: "developer",
+      role: "workhorse",
+      cwd: taskWt,
+      taskWt,
+      taskDir,
+      recordsDir: path.join(taskDir, "runs"),
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: { assignment: "Implement the change", citations: "[]", context: "" },
+    });
+  }
+
+  it("skips concerns from non-allowlisted agents, journals the skip, and keeps the step ok", async () => {
+    const skippedByAgent = await runDeveloper(
+      makePipeline({ raiseAllowlist: ["qa"] }),
+      "test-first",
+      "Not allowlisted because the key is the agent"
+    );
+    expect(skippedByAgent.status).toBe("ok");
+
+    // The gate key is source.agent, never the step fragment.
+    const skippedByFragment = await runDeveloper(
+      makePipeline({ raiseAllowlist: ["test-first"] }),
+      "test-first",
+      "Not allowlisted because fragments are not keys"
+    );
+    expect(skippedByFragment.status).toBe("ok");
+    expect(concernFiles()).toEqual([]);
+
+    // The developer agent covers develop/poc/test-assumptions/test-first/
+    // simple-implement/fix-round, so the same allowlist entry admits poc.
+    const allowed = await runDeveloper(
+      makePipeline({ raiseAllowlist: ["developer"] }),
+      "poc",
+      "Allowed because source.agent is developer"
+    );
+    expect(allowed.status).toBe("ok");
+    expect(concernFiles()).toHaveLength(1);
+
+    const events = await readJournal(taskDir);
+    const skipped = events.filter((e) => e.type === "concern_ingest_skipped");
+    expect(skipped).toHaveLength(2);
+    expect(skipped.map((e) => e.agent)).toEqual(["developer", "developer"]);
+  });
+});
+
+describe("Engine human routing with concern triage (adr-human-router-single)", () => {
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
+  interface EngineConcern {
+    kind: Concern["kind"];
+    summary: string;
+    severity: ConcernSeverity;
+    affects: string[];
+  }
+
+  /**
+   * Builds a real task/repo fixture: ingest, plan, PM edits, item steps and
+   * close-ups are scripted so non-halting paths finish. The first item's
+   * developer raises the concern; its review triages that exact concern id.
+   */
+  function engineFixture(
+    task: string,
+    worktreeRoot: string,
+    harness: FakeHarness,
+    items: { slug: string; title: string }[],
+    concern: EngineConcern,
+    reviewSuggestion: ReviewSuggestion,
+    concerns?: PipelineConfig["concerns"]
+  ): {
+    pipeline: PipelineConfig;
+    project: ProjectConfig;
+    prompts: ReturnType<typeof loadPromptLibrary>;
+  } {
+    const project: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot };
+    const pipeline = makePipeline(concerns);
+    pipeline.flows = {
+      simple: { steps: [] },
+      story: {
+        dev: {
+          fixLoopTo: "develop",
+          steps: [
+            { id: "develop", agent: "developer", role: "workhorse" },
+            { id: "review", agent: "reviewer", role: "alt-workhorse" },
+          ],
+        },
+      },
+      spike: {},
+    };
+    pipeline.agents = {
+      triage: { role: "workhorse" },
+      infra: { role: "workhorse" },
+      architect: { role: "architect" },
+      "plan-reviewer": { role: "alt-architect" },
+      pm: { role: "alt-workhorse" },
+      developer: { role: "workhorse" },
+      reviewer: { role: "alt-workhorse" },
+      "wave-close-up": { role: "alt-workhorse" },
+      "plan-close-up": { role: "alt-workhorse" },
+    };
+    pipeline.limits = {
+      maxParallelItems: 2,
+      maxParallelTurns: 4,
+      maxStepAttempts: 3,
+      maxFixRounds: 3,
+    };
+    const prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+
+    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+      ok: true,
+      data: { kind: "story", rationale: "Human routing flow", citations: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/infra#a1`, {
+      ok: true,
+      data: { setup: [], gates: [{ id: "test", command: "true" }], testRunner: { command: "true" } },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
+      ok: true,
+      data: {
+        iteration: 1,
+        milestones: [{ id: "m1", title: "M1" }],
+        itemOutlines: items.map((it) => ({
+          slug: it.slug,
+          kind: "dev",
+          title: it.title,
+          milestoneId: "m1",
+          deps: [],
+        })),
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Plan ok", suggestions: [] },
+    });
+    // A routed high-severity blocker triggers one architect consult per concern.
+    harness.scriptOutcome(`${task}/runs/consult-concern-${reviewSuggestion.id}#a1`, {
+      ok: true,
+      data: {
+        id: `decision-concern-${reviewSuggestion.id}`,
+        context: "item",
+        decision: "continue",
+        rationale: "Proceed after recording the concern",
+        timestamp: "2026-01-01T00:00:00.000Z",
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: {
+        iteration: 1,
+        items: items.map((it) => ({
+          slug: it.slug,
+          outlineRef: it.slug,
+          kind: "dev",
+          title: it.title,
+          assignment: `Implement ${it.title}`,
+          milestone: "m1",
+          wave: 1,
+          deps: [],
+        })),
+      },
+    });
+
+    const firstSlug = items[0]!.slug;
+    for (const it of items) {
+      harness.scriptOutcome(`${task}/items/${it.slug}/develop#a1`, (run) => {
+        fs.writeFileSync(
+          path.join(run.cwd, `${it.slug}.ts`),
+          `export const ${it.slug.replace(/-/g, "_")} = 1;\n`
+        );
+        return {
+          ok: true,
+          data: {
+            status: "ok",
+            summary: `Developed ${it.slug}`,
+            ...(it.slug === firstSlug ? { concerns: [concern] } : {}),
+          },
+        };
+      });
+      harness.scriptOutcome(`${task}/items/${it.slug}/review#a1`, {
+        ok: true,
+        data:
+          it.slug === firstSlug
+            ? { status: "approved", summary: "Review routed", suggestions: [reviewSuggestion] }
+            : { status: "approved", summary: "Approved", suggestions: [] },
+      });
+    }
+
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave report" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
+      ok: true,
+      data: {
+        id: "dec-wave-1",
+        context: "wave",
+        decision: "continue",
+        timestamp: new Date().toISOString(),
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Iteration complete" },
+    });
+
+    return { pipeline, project, prompts };
+  }
+
+  async function runScenario(opts: {
+    task: string;
+    items: { slug: string; title: string }[];
+    concern: EngineConcern;
+    disposition: "human-stop" | "human-async";
+    concerns?: PipelineConfig["concerns"];
+  }): Promise<{
+    res: Awaited<ReturnType<typeof runTask>>;
+    deployedTaskDir: string;
+    cid: string;
+  }> {
+    const taskDir = path.join(tmpRepo.dir, ORCH, opts.task);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${opts.task}\n`, "utf8");
+    tmpRepo.commit(`add ${opts.task} intent`);
+
+    const worktreeRoot = path.join(tmpRepo.dir + `-${opts.task}-wt`);
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    const harness = new FakeHarness();
+    const cid = concernFingerprint({ kind: opts.concern.kind, summary: opts.concern.summary });
+
+    const { pipeline, project, prompts } = engineFixture(
+      opts.task,
+      worktreeRoot,
+      harness,
+      opts.items,
+      opts.concern,
+      {
+        id: cid,
+        disposition: opts.disposition,
+        summary: "Operator decision required",
+        detail: "The concern needs an explicit human decision",
+      },
+      opts.concerns
+    );
+
+    const res = await runTask(
+      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
+      opts.task,
+      { maxTicks: 30 }
+    );
+    const deployedTaskDir = path.join(worktreeRoot, `topic_${opts.task}`, ORCH, opts.task);
+    return { res, deployedTaskDir, cid };
+  }
+
+  function mailboxFiles(taskDir: string): string[] {
+    const dir = path.join(taskDir, "steer", "tousertoreview");
+    if (!fs.existsSync(dir)) return [];
+    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
+  }
+
+  it("halts with exit 10 for a high-severity human-stop concern, writing one q-concern entry", async () => {
+    const { res, deployedTaskDir, cid } = await runScenario({
+      task: "router-stop",
+      items: [{ slug: "item-1", title: "Item 1" }],
+      concern: {
+        kind: "blocker",
+        summary: "Irreversible migration hazard",
+        severity: "high",
+        affects: ["item-1"],
+      },
+      disposition: "human-stop",
+    });
+
+    expect(res.status).toBe("blocked");
+    expect(res.exitCode).toBe(10);
+
+    // No double write: the concern-id disposition produces exactly one
+    // q-concern-<cid> entry; the item-machine raw path must skip it.
+    expect(mailboxFiles(deployedTaskDir)).toEqual([`q-concern-${cid}.yaml`]);
+    const q = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
+    );
+    expect(q.disposition).toBe("human-stop");
+    expect([...(q.blocks ?? [])].sort()).toEqual(["item-1", "task"]);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("routed");
+    expect(stored.disposition).toBe("human-stop");
+  });
+
+  it("parks a high-severity human-async item without halting the task", async () => {
+    const { res, deployedTaskDir, cid } = await runScenario({
+      task: "router-async",
+      items: [
+        { slug: "item-a", title: "Item A" },
+        { slug: "item-b", title: "Item B" },
+      ],
+      concern: {
+        kind: "question",
+        summary: "Which storage backend should be used",
+        severity: "high",
+        affects: ["item-a"],
+      },
+      disposition: "human-async",
+    });
+
+    expect(res.status).toBe("done");
+    expect(res.exitCode).toBe(0);
+    expect(mailboxFiles(deployedTaskDir)).toEqual([`q-concern-${cid}.yaml`]);
+    const q = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
+    );
+    expect(q.disposition).toBe("human-async");
+    expect(q.blocks ?? []).toEqual(["item-a"]);
+
+    const state = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "state.yaml")
+    );
+    expect(state.items["item-a"]?.status).toBe("blocked");
+    expect(state.items["item-b"]?.status).toBe("merged");
+  });
+
+  it("downgrades a medium-severity human-stop concern to a digest and finishes unblocked", async () => {
+    const { res, deployedTaskDir, cid } = await runScenario({
+      task: "router-downgrade",
+      items: [{ slug: "item-1", title: "Item 1" }],
+      concern: {
+        kind: "blocker",
+        summary: "Medium-severity schema concern",
+        severity: "medium",
+        affects: ["item-1"],
+      },
+      disposition: "human-stop",
+    });
+
+    expect(res.status).toBe("done");
+    expect(res.exitCode).toBe(0);
+    expect(mailboxFiles(deployedTaskDir)).toEqual([`q-concern-${cid}.yaml`]);
+    const q = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
+    );
+    expect(q.disposition).toBe("human-awareness");
+    expect(q.blocks ?? []).toEqual([]);
+    expect(questionBlocks(q as any, "task")).toBe(false);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("routed");
+
+    const state = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "state.yaml")
+    );
+    expect(state.items["item-1"]?.status).toBe("merged");
+    expect(state.status).toBe("done");
+  });
+});
diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
index df5eac8..bb58e32 100644
--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
@@ -409,7 +409,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
 
   it("writes one deduped q-concern mailbox entry for human-async triage", async () => {
     const cid = "c-ffffffffff";
-    await writeConcern(storedConcern({ id: cid, kind: "question" }));
+    await writeConcern(storedConcern({ id: cid, kind: "question", severity: "high" }));
 
     const ctx = {
       taskDir,
@@ -632,7 +632,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
         data: {
           status: "ok",
           summary: "Developed",
-          concerns: [{ kind: "risk", summary: concernSummary, detail: "long detail" }],
+          concerns: [{ kind: "risk", summary: concernSummary, detail: "long detail", severity: "high" }],
         },
       };
     });
diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
index 58961a9..8dc9736 100644
--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
@@ -42,7 +42,8 @@ function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
     kind: "blocker",
     summary: `Concern ${overrides.id}`,
     detail: "detail",
-    severity: "medium",
+    // Routed blocking defaults to high (concerns.minBlockingSeverity).
+    severity: "high",
     status: "routed",
     disposition: "architect",
     source: { record: "seed-concern", agent: "test" },
diff --git a/plugins/software-factory/test/engine/routing-blocker-derive.test.ts b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
index d18513d..a8fec61 100644
--- a/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+++ b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
@@ -109,7 +109,8 @@ function writeConcern(
   fs.mkdirSync(dir, { recursive: true });
   const record = {
     detail: concern.summary,
-    severity: "medium",
+    // Routed blocking defaults to high (concerns.minBlockingSeverity).
+    severity: "high",
     source: { record: "test-first", agent: "test" },
     createdAt: "2026-01-01T00:00:00.000Z",
     updatedAt: "2026-01-01T00:00:00.000Z",

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
