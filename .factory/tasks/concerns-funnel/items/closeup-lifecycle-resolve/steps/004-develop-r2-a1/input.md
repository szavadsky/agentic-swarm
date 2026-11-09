# Step: Fix-Round

## Goal
Address reviewer suggestions and gate failures from the previous development attempt. Deliver focused corrections resolving reported defects.

## Rules
- Defect resolution: resolve all suggestions marked with disposition `fix`. Consider `optional` suggestions only if straightforward and safe.
- Delta focus: keep changes tightly scoped to reported concerns. Do not introduce unrelated modifications or refactors.
- Non-regression: ensure all previously green tests remain passing and all project gates pass cleanly.
- Updated evidence: yield `status: ok` with updated `evidence` (array of strings) documenting personal verification of each corrected defect per `developer-output.schema.json`.

## Assignment
{
  "slug": "closeup-lifecycle-resolve",
  "kind": "dev",
  "title": "Close-up lifecycle and unblock",
  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
  "outlineRef": "closeup-lifecycle-resolve",
  "milestone": "m3-routing-lifecycle",
  "wave": 3,
  "deps": [
    "contracts-drift-fix",
    "epic-saga-propagate",
    "human-router-severity"
  ],
  "scenarioRefs": [
    "m3-routing-lifecycle:8",
    "m3-routing-lifecycle:9",
    "m3-routing-lifecycle:10"
  ],
  "citations": [
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
  ],
  "escalate": true
}

## Review Feedback
- [FIX] concernIds filter restricts only concerns, remarkables/questions still push unfiltered: propagateEpicConcerns filters listConcerns by concernIds but readOpenRemarkables (line 162) and forwardBlockedQuestions (line 182) run unfiltered. Interface contract says 'Restricts the push to these child concern ids'. Accepting one propagate mid-flow would forward all open remarkables and blocked questions, potentially blocking parent prematurely. Test masks via c- prefix filter on parent concerns dir. Fix: skip remarkables/questions when concernIds is set, or thread the filter through. (plugins/software-factory/src/core/flows/epic-propagation.ts)

- [OPTIONAL] Guard prefix consult-concern- collides with item slugs starting with concern-: Item consults use stepId `consult-${item}` (consults.ts:110). An item slug like concern-foo yields consult-concern-foo, which matches the honored prefix and would bypass the cross-emission guard. Unlikely slug shape but guard should match on stepFragment or exact concern-consult pattern for robustness.
- [OPTIONAL] Carry-via-decision and honored architect-closeup singular-resolution paths lack coverage: applyConcernResolution carry branch (pending carry, status unchanged) and the honored architect-closeup/architect-wave-report singular-resolution path have no tests; only consult-resolve honored and item-consult ignored paths are covered. Propagate-accept child status/disposition also unasserted (only pending cleared). Consider adding cases to lock these contracts.

## Check Results


## Current Diff
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..46bc4dc
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,37 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 8 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794190679192-mmfq4hvhm7.xml
+      junitCaseCount: 8
+      junitCaseIds:
+        - "Close-up lifecycle: architect confirmations.accept resolves a pending
+          resolve and derive exposes the resolved status"
+        - "Close-up lifecycle: architect confirmations.accept carries a pending
+          carry to the architect"
+        - "Close-up lifecycle: architect confirmations.accept propagates a
+          pending propagate to the parent concern store"
+        - "Close-up lifecycle: architect confirmations.reject clears the pending
+          resolution, preserving open status and disposition"
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
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..4d50d15
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,69 @@
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
+  "slug": "closeup-lifecycle-resolve",
+  "kind": "dev",
+  "title": "Close-up lifecycle and unblock",
+  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
+  "outlineRef": "closeup-lifecycle-resolve",
+  "milestone": "m3-routing-lifecycle",
+  "wave": 3,
+  "deps": [
+    "contracts-drift-fix",
+    "epic-saga-propagate",
+    "human-router-severity"
+  ],
+  "scenarioRefs": [
+    "m3-routing-lifecycle:8",
+    "m3-routing-lifecycle:9",
+    "m3-routing-lifecycle:10"
+  ],
+  "citations": [
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ],
+  "escalate": true
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/derive/task.ts:167-205",
+  "plugins/software-factory/src/core/steer.ts:59-88",
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
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..9e7d5d7
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T02:04:14.624Z
+session: 01a1be0c-8a42-773f-9916-bf5dae100ba7
+endedAt: 2026-11-09T02:18:01.636Z
+usage:
+  inputTokens: 111670
+  outputTokens: 46713
+  costUsd: 0.068918
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T02-04-15-298Z_01a1be0c-8a42-773f-9916-bf5dae100ba7.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..50029c1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,61 @@
+status: ok
+summary: Added a test-first behavior suite for the close-up propose/confirm
+  lifecycle in test/engine/closeup-lifecycle-resolve.test.ts. It specifies
+  architect confirmation handling for pending resolve/carry/propagate proposals,
+  reject semantics, concern-consult resolve applying at decision commit and
+  unblocking the affected item on the next derive, the cross-emission guard for
+  item-consult concernResolution with journaling, and the wave-close-up fallback
+  for triage-less open concerns (tech-debt to optional/debt,
+  assumption|risk|question to architect, blockers left open, never human-*). No
+  production code was modified. All 8 new tests fail as assertion failures on
+  the current codebase; the full suite otherwise passes (433 pass, 2 skip, only
+  the 8 new tests red).
+target:
+  selectors:
+    - test/engine/closeup-lifecycle-resolve.test.ts
+  expectRed:
+    - "Close-up lifecycle: architect confirmations.accept resolves a pending
+      resolve and derive exposes the resolved status"
+    - "Close-up lifecycle: architect confirmations.accept carries a pending
+      carry to the architect"
+    - "Close-up lifecycle: architect confirmations.accept propagates a pending
+      propagate to the parent concern store"
+    - "Close-up lifecycle: architect confirmations.reject clears the pending
+      resolution, preserving open status and disposition"
+    - "Close-up lifecycle: consult unblock.consult resolve unblocks the affected
+      item on the next derive"
+    - "Close-up lifecycle: consult unblock.ignores concernResolution from an
+      item consult and journals the drop"
+    - "Close-up lifecycle: wave fallback.falls back over triage-less open
+      concerns and lists tech-debt as derived debt"
+    - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
+      explicit triage"
+evidence:
+  - "bun run typecheck (plugins/software-factory): PASS, no type errors in the
+    new test file."
+  - "TMPDIR=/tmp bun test test/engine/closeup-lifecycle-resolve.test.ts: 0 pass,
+    8 fail; every failure is an assertion mismatch on current production
+    behavior (examples: status stayed routed instead of resolved, carry stayed
+    open instead of routed, pendingResolution not cleared, concernResolution
+    absent from consult decision, no journal event, fallback left concerns
+    open)."
+  - "JUnit reporter run of the same selector: 8 testcases, 8 failures, ids match
+    the declared expectRed node ids."
+  - "TMPDIR=/tmp bun test (plugins/software-factory, full suite): 433 pass, 2
+    skip, 8 fail; the only failures are the eight new target tests, so the
+    fixture setup causes no collateral breakage."
+concerns:
+  - The propagate acceptance test models an epic child task as taskDir nested
+    directly under its parent task dir and expects a condensed [epic] copy in
+    the parent concern store; the later implementation must detect that layout
+    (parent has items/<epic>/assignment.yaml) when applying accept+propagate.
+  - The target selector is plugin-relative
+    (test/engine/closeup-lifecycle-resolve.test.ts), matching the project's
+    documented `cd plugins/software-factory && bun test` runner convention.
+  - Plugin dependencies were absent in this worktree; `bun install` was run in
+    plugins/software-factory (node_modules is gitignored, no production or
+    lockfile changes).
+notes: "Test-first only: the suite exercises behavior through runAgentStep,
+  runConcernConsult, deriveTaskState, and readJournal, so no new production API
+  names were frozen. The cross-emission guard contract expects a journal event
+  named `concern_resolution_ignored` carrying the source step."
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..da13bc8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,96 @@
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
+        durationMs: 5959
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 116378
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-Y57ptq/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 63185
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 63185
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 63185
+
+           441 pass
+           2 skip
+           0 fail
+           2439 expect() calls
+          Ran 443 tests across 69 files. [116.14s]
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
+        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794191535888-msvo5t4krln.xml
+      junitCaseCount: 8
+      junitCaseIds:
+        - "Close-up lifecycle: architect confirmations.accept resolves a pending
+          resolve and derive exposes the resolved status"
+        - "Close-up lifecycle: architect confirmations.accept carries a pending
+          carry to the architect"
+        - "Close-up lifecycle: architect confirmations.accept propagates a
+          pending propagate to the parent concern store"
+        - "Close-up lifecycle: architect confirmations.reject clears the pending
+          resolution, preserving open status and disposition"
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
+    message: "size passed: 164/300 production lines changed"
+    details:
+      changedLines:
+        added: 160
+        deleted: 4
+        total: 164
+        files:
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/flows/consults.ts
+          - plugins/software-factory/src/core/flows/epic-propagation.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..d395eab
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/input.md
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
+  "slug": "closeup-lifecycle-resolve",
+  "kind": "dev",
+  "title": "Close-up lifecycle and unblock",
+  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
+  "outlineRef": "closeup-lifecycle-resolve",
+  "milestone": "m3-routing-lifecycle",
+  "wave": 3,
+  "deps": [
+    "contracts-drift-fix",
+    "epic-saga-propagate",
+    "human-router-severity"
+  ],
+  "scenarioRefs": [
+    "m3-routing-lifecycle:8",
+    "m3-routing-lifecycle:9",
+    "m3-routing-lifecycle:10"
+  ],
+  "citations": [
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/closeup-lifecycle-resolve.test.ts"
+  ],
+  "expectRed": [
+    "Close-up lifecycle: architect confirmations.accept resolves a pending resolve and derive exposes the resolved status",
+    "Close-up lifecycle: architect confirmations.accept carries a pending carry to the architect",
+    "Close-up lifecycle: architect confirmations.accept propagates a pending propagate to the parent concern store",
+    "Close-up lifecycle: architect confirmations.reject clears the pending resolution, preserving open status and disposition",
+    "Close-up lifecycle: consult unblock.consult resolve unblocks the affected item on the next derive",
+    "Close-up lifecycle: consult unblock.ignores concernResolution from an item consult and journals the drop",
+    "Close-up lifecycle: wave fallback.falls back over triage-less open concerns and lists tech-debt as derived debt",
+    "Close-up lifecycle: wave fallback.leaves blocker concerns open for explicit triage"
+  ]
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/derive/task.ts:167-205",
+  "plugins/software-factory/src/core/steer.ts:59-88",
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
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..f4290c6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T02:18:05.784Z
+session: 01a1be19-380a-7248-9198-1b7d9e65e643
+endedAt: 2026-11-09T02:32:18.022Z
+usage:
+  inputTokens: 204260
+  outputTokens: 36001
+  costUsd: 0.070243
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T02-18-06-218Z_01a1be19-380a-7248-9198-1b7d9e65e643
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..1c8d744
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,58 @@
+status: ok
+summary: "Implemented the close-up concern lifecycle in the ingest/apply layer:
+  architect concernConfirms settle pending proposals (accept resolve->resolved,
+  carry->routed+architect, propagate->condensed parent copy via the epic helper;
+  reject clears pending while preserving status/disposition), decision-level
+  concernResolution is applied at consult commit with a cross-emission guard
+  that ignores and journals item-consult emissions, concern consult decisions
+  pass concernResolution through to the canonical decision artifact, and wave
+  close-up now falls back over triage-less open concerns (tech-debt->optional
+  debt, assumption/risk/question->architect, blockers untouched, no human-*
+  dispositions). Added an optional concern-id filter to epic propagation so
+  confirmed propagate copies only the accepted concern. Added 158 production
+  lines across 4 files; all target cases, typecheck, and the full suite are
+  green."
+target:
+  selectors:
+    - test/engine/closeup-lifecycle-resolve.test.ts
+  expectRed:
+    - "Close-up lifecycle: architect confirmations.accept resolves a pending
+      resolve and derive exposes the resolved status"
+    - "Close-up lifecycle: architect confirmations.accept carries a pending
+      carry to the architect"
+    - "Close-up lifecycle: architect confirmations.accept propagates a pending
+      propagate to the parent concern store"
+    - "Close-up lifecycle: architect confirmations.reject clears the pending
+      resolution, preserving open status and disposition"
+    - "Close-up lifecycle: consult unblock.consult resolve unblocks the affected
+      item on the next derive"
+    - "Close-up lifecycle: consult unblock.ignores concernResolution from an
+      item consult and journals the drop"
+    - "Close-up lifecycle: wave fallback.falls back over triage-less open
+      concerns and lists tech-debt as derived debt"
+    - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
+      explicit triage"
+evidence:
+  - bun run typecheck -> exit 0, no diagnostics
+  - TMPDIR=/tmp bun test test/engine/closeup-lifecycle-resolve.test.ts -> 8
+    pass, 0 fail, 54 expect() calls
+  - TMPDIR=/tmp bun test test/engine/closeup-lifecycle-resolve.test.ts
+    test/engine/epic-saga-propagate.test.ts test/engine/concerns-funnel.test.ts
+    -> 37 pass, 0 fail, 355 expect() calls
+  - "TMPDIR=/tmp bun test -> 443 tests across 69 files: 441 pass, 2 skip, 0
+    fail, 2439 expect() calls"
+  - git diff --stat -> 4 production files changed, +158/-3 lines, within the
+    ~240 prod-line budget
+  - git status --short -> only src/core/concerns.ts, src/core/flows/consults.ts,
+    src/core/flows/epic-propagation.ts, src/core/flows/step-runner.ts modified
+    (no test edits)
+notes: "Ordering: close-up concernResolutions still write pendingResolution
+  without touching status; architect confirmations run in ingestStepConcerns at
+  architect ingest, and consult concernResolution is applied in the same ingest
+  call immediately after writeArtifact, before the step/decision commit. Wave
+  fallback is restricted to concern ids present before the close-up step so its
+  own new findings stay open, and epic-propagated copies (source.epic) are
+  skipped to preserve adr-epic-push-condensed open copies. The epic helper
+  gained an optional concernIds filter used only for accepted propagate
+  confirmations."
+concerns: []
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..2674eef
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,36 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 8 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794191541512-703jr3sgisb.xml
+      junitCaseCount: 8
+      junitCaseIds:
+        - "Close-up lifecycle: architect confirmations.accept resolves a pending
+          resolve and derive exposes the resolved status"
+        - "Close-up lifecycle: architect confirmations.accept carries a pending
+          carry to the architect"
+        - "Close-up lifecycle: architect confirmations.accept propagates a
+          pending propagate to the parent concern store"
+        - "Close-up lifecycle: architect confirmations.reject clears the pending
+          resolution, preserving open status and disposition"
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
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..7b7bddd
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1361 @@
+# Step: QA
+
+## Goal
+Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
+
+## Rules
+- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
+- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
+- Story kind validation:
+  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
+  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
+- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+
+## Dispositions Criteria
+Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
+Use ONLY these dispositions; any other disposition value fails validation.
+# Review Suggestion Dispositions
+
+Criteria for assigning disposition to review findings:
+
+| Disposition | When to Assign | Engine Action |
+|---|---|---|
+| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
+| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
+| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
+| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
+| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
+
+## Rules
+- Defect requiring code change MUST be `fix`.
+- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+
+## Assignment
+{
+  "slug": "closeup-lifecycle-resolve",
+  "kind": "dev",
+  "title": "Close-up lifecycle and unblock",
+  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
+  "outlineRef": "closeup-lifecycle-resolve",
+  "milestone": "m3-routing-lifecycle",
+  "wave": 3,
+  "deps": [
+    "contracts-drift-fix",
+    "epic-saga-propagate",
+    "human-router-severity"
+  ],
+  "scenarioRefs": [
+    "m3-routing-lifecycle:8",
+    "m3-routing-lifecycle:9",
+    "m3-routing-lifecycle:10"
+  ],
+  "citations": [
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
+  ],
+  "escalate": true
+}
+
+## Engine Checks
+
+
+## Test Diff
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..46bc4dc
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,37 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 8 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794190679192-mmfq4hvhm7.xml
++      junitCaseCount: 8
++      junitCaseIds:
++        - "Close-up lifecycle: architect confirmations.accept resolves a pending
++          resolve and derive exposes the resolved status"
++        - "Close-up lifecycle: architect confirmations.accept carries a pending
++          carry to the architect"
++        - "Close-up lifecycle: architect confirmations.accept propagates a
++          pending propagate to the parent concern store"
++        - "Close-up lifecycle: architect confirmations.reject clears the pending
++          resolution, preserving open status and disposition"
++        - "Close-up lifecycle: consult unblock.consult resolve unblocks the
++          affected item on the next derive"
++        - "Close-up lifecycle: consult unblock.ignores concernResolution from an
++          item consult and journals the drop"
++        - "Close-up lifecycle: wave fallback.falls back over triage-less open
++          concerns and lists tech-debt as derived debt"
++        - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
++          explicit triage"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..4d50d15
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,69 @@
++# Step: Test-First
++
++## Goal
++Author automated tests specifying the required behavior changes BEFORE writing production code.
++
++## Rules
++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
++- Target declaration in yield:
++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
++- Output: yield structured output per `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "closeup-lifecycle-resolve",
++  "kind": "dev",
++  "title": "Close-up lifecycle and unblock",
++  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
++  "outlineRef": "closeup-lifecycle-resolve",
++  "milestone": "m3-routing-lifecycle",
++  "wave": 3,
++  "deps": [
++    "contracts-drift-fix",
++    "epic-saga-propagate",
++    "human-router-severity"
++  ],
++  "scenarioRefs": [
++    "m3-routing-lifecycle:8",
++    "m3-routing-lifecycle:9",
++    "m3-routing-lifecycle:10"
++  ],
++  "citations": [
++    "plugins/software-factory/src/core/derive/task.ts:167-205",
++    "plugins/software-factory/src/core/steer.ts:59-88",
++    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
++  ],
++  "escalate": true
++}
++
++## Context & Citations
++[
++  "plugins/software-factory/src/core/derive/task.ts:167-205",
++  "plugins/software-factory/src/core/steer.ts:59-88",
++  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
++]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..9e7d5d7
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
++name: test-first
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-09T02:04:14.624Z
++session: 01a1be0c-8a42-773f-9916-bf5dae100ba7
++endedAt: 2026-11-09T02:18:01.636Z
++usage:
++  inputTokens: 111670
++  outputTokens: 46713
++  costUsd: 0.068918
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T02-04-15-298Z_01a1be0c-8a42-773f-9916-bf5dae100ba7.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..50029c1
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,61 @@
++status: ok
++summary: Added a test-first behavior suite for the close-up propose/confirm
++  lifecycle in test/engine/closeup-lifecycle-resolve.test.ts. It specifies
++  architect confirmation handling for pending resolve/carry/propagate proposals,
++  reject semantics, concern-consult resolve applying at decision commit and
++  unblocking the affected item on the next derive, the cross-emission guard for
++  item-consult concernResolution with journaling, and the wave-close-up fallback
++  for triage-less open concerns (tech-debt to optional/debt,
++  assumption|risk|question to architect, blockers left open, never human-*). No
++  production code was modified. All 8 new tests fail as assertion failures on
++  the current codebase; the full suite otherwise passes (433 pass, 2 skip, only
++  the 8 new tests red).
++target:
++  selectors:
++    - test/engine/closeup-lifecycle-resolve.test.ts
++  expectRed:
++    - "Close-up lifecycle: architect confirmations.accept resolves a pending
++      resolve and derive exposes the resolved status"
++    - "Close-up lifecycle: architect confirmations.accept carries a pending
++      carry to the architect"
++    - "Close-up lifecycle: architect confirmations.accept propagates a pending
++      propagate to the parent concern store"
++    - "Close-up lifecycle: architect confirmations.reject clears the pending
++      resolution, preserving open status and disposition"
++    - "Close-up lifecycle: consult unblock.consult resolve unblocks the affected
++      item on the next derive"
++    - "Close-up lifecycle: consult unblock.ignores concernResolution from an
++      item consult and journals the drop"
++    - "Close-up lifecycle: wave fallback.falls back over triage-less open
++      concerns and lists tech-debt as derived debt"
++    - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
++      explicit triage"
++evidence:
++  - "bun run typecheck (plugins/software-factory): PASS, no type errors in the
++    new test file."
++  - "TMPDIR=/tmp bun test test/engine/closeup-lifecycle-resolve.test.ts: 0 pass,
++    8 fail; every failure is an assertion mismatch on current production
++    behavior (examples: status stayed routed instead of resolved, carry stayed
++    open instead of routed, pendingResolution not cleared, concernResolution
++    absent from consult decision, no journal event, fallback left concerns
++    open)."
++  - "JUnit reporter run of the same selector: 8 testcases, 8 failures, ids match
++    the declared expectRed node ids."
++  - "TMPDIR=/tmp bun test (plugins/software-factory, full suite): 433 pass, 2
++    skip, 8 fail; the only failures are the eight new target tests, so the
++    fixture setup causes no collateral breakage."
++concerns:
++  - The propagate acceptance test models an epic child task as taskDir nested
++    directly under its parent task dir and expects a condensed [epic] copy in
++    the parent concern store; the later implementation must detect that layout
++    (parent has items/<epic>/assignment.yaml) when applying accept+propagate.
++  - The target selector is plugin-relative
++    (test/engine/closeup-lifecycle-resolve.test.ts), matching the project's
++    documented `cd plugins/software-factory && bun test` runner convention.
++  - Plugin dependencies were absent in this worktree; `bun install` was run in
++    plugins/software-factory (node_modules is gitignored, no production or
++    lockfile changes).
++notes: "Test-first only: the suite exercises behavior through runAgentStep,
++  runConcernConsult, deriveTaskState, and readJournal, so no new production API
++  names were frozen. The cross-emission guard contract expects a journal event
++  named `concern_resolution_ignored` carrying the source step."
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..da13bc8
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,96 @@
++checks:
++  - id: gates
++    status: pass
++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
++      (§7).detects when an agent commits and resets --soft to before.sha,
++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
++      agent switches branch and restores original branch, keeping changes)"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 5959
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 116378
++        details: |-
++          bun test v1.4.4 (38afee6c8)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-Y57ptq/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++          ----------------------------------------------------------------
++          Blocking Questions:
++            (none)
++          ----------------------------------------------------------------
++          Digest Questions:
++            (none)
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 63185
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 63185
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 63185
++
++           441 pass
++           2 skip
++           0 fail
++           2439 expect() calls
++          Ran 443 tests across 69 files. [116.14s]
++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
++        improvements:
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/closeup-lifecycle-resolve.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794191535888-msvo5t4krln.xml
++      junitCaseCount: 8
++      junitCaseIds:
++        - "Close-up lifecycle: architect confirmations.accept resolves a pending
++          resolve and derive exposes the resolved status"
++        - "Close-up lifecycle: architect confirmations.accept carries a pending
++          carry to the architect"
++        - "Close-up lifecycle: architect confirmations.accept propagates a
++          pending propagate to the parent concern store"
++        - "Close-up lifecycle: architect confirmations.reject clears the pending
++          resolution, preserving open status and disposition"
++        - "Close-up lifecycle: consult unblock.consult resolve unblocks the
++          affected item on the next derive"
++        - "Close-up lifecycle: consult unblock.ignores concernResolution from an
++          item consult and journals the drop"
++        - "Close-up lifecycle: wave fallback.falls back over triage-less open
++          concerns and lists tech-debt as derived debt"
++        - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
++          explicit triage"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 164/300 production lines changed"
++    details:
++      changedLines:
++        added: 160
++        deleted: 4
++        total: 164
++        files:
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/flows/consults.ts
++          - plugins/software-factory/src/core/flows/epic-propagation.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..d395eab
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,82 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "closeup-lifecycle-resolve",
++  "kind": "dev",
++  "title": "Close-up lifecycle and unblock",
++  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
++  "outlineRef": "closeup-lifecycle-resolve",
++  "milestone": "m3-routing-lifecycle",
++  "wave": 3,
++  "deps": [
++    "contracts-drift-fix",
++    "epic-saga-propagate",
++    "human-router-severity"
++  ],
++  "scenarioRefs": [
++    "m3-routing-lifecycle:8",
++    "m3-routing-lifecycle:9",
++    "m3-routing-lifecycle:10"
++  ],
++  "citations": [
++    "plugins/software-factory/src/core/derive/task.ts:167-205",
++    "plugins/software-factory/src/core/steer.ts:59-88",
++    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
++  ],
++  "escalate": true
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/closeup-lifecycle-resolve.test.ts"
++  ],
++  "expectRed": [
++    "Close-up lifecycle: architect confirmations.accept resolves a pending resolve and derive exposes the resolved status",
++    "Close-up lifecycle: architect confirmations.accept carries a pending carry to the architect",
++    "Close-up lifecycle: architect confirmations.accept propagates a pending propagate to the parent concern store",
++    "Close-up lifecycle: architect confirmations.reject clears the pending resolution, preserving open status and disposition",
++    "Close-up lifecycle: consult unblock.consult resolve unblocks the affected item on the next derive",
++    "Close-up lifecycle: consult unblock.ignores concernResolution from an item consult and journals the drop",
++    "Close-up lifecycle: wave fallback.falls back over triage-less open concerns and lists tech-debt as derived debt",
++    "Close-up lifecycle: wave fallback.leaves blocker concerns open for explicit triage"
++  ]
++}
++
++## Context & Citations
++[
++  "plugins/software-factory/src/core/derive/task.ts:167-205",
++  "plugins/software-factory/src/core/steer.ts:59-88",
++  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
++]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..f4290c6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-09T02:18:05.784Z
++session: 01a1be19-380a-7248-9198-1b7d9e65e643
++endedAt: 2026-11-09T02:32:18.022Z
++usage:
++  inputTokens: 204260
++  outputTokens: 36001
++  costUsd: 0.070243
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T02-18-06-218Z_01a1be19-380a-7248-9198-1b7d9e65e643
+diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..1c8d744
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,58 @@
++status: ok
++summary: "Implemented the close-up concern lifecycle in the ingest/apply layer:
++  architect concernConfirms settle pending proposals (accept resolve->resolved,
++  carry->routed+architect, propagate->condensed parent copy via the epic helper;
++  reject clears pending while preserving status/disposition), decision-level
++  concernResolution is applied at consult commit with a cross-emission guard
++  that ignores and journals item-consult emissions, concern consult decisions
++  pass concernResolution through to the canonical decision artifact, and wave
++  close-up now falls back over triage-less open concerns (tech-debt->optional
++  debt, assumption/risk/question->architect, blockers untouched, no human-*
++  dispositions). Added an optional concern-id filter to epic propagation so
++  confirmed propagate copies only the accepted concern. Added 158 production
++  lines across 4 files; all target cases, typecheck, and the full suite are
++  green."
++target:
++  selectors:
++    - test/engine/closeup-lifecycle-resolve.test.ts
++  expectRed:
++    - "Close-up lifecycle: architect confirmations.accept resolves a pending
++      resolve and derive exposes the resolved status"
++    - "Close-up lifecycle: architect confirmations.accept carries a pending
++      carry to the architect"
++    - "Close-up lifecycle: architect confirmations.accept propagates a pending
++      propagate to the parent concern store"
++    - "Close-up lifecycle: architect confirmations.reject clears the pending
++      resolution, preserving open status and disposition"
++    - "Close-up lifecycle: consult unblock.consult resolve unblocks the affected
++      item on the next derive"
++    - "Close-up lifecycle: consult unblock.ignores concernResolution from an
++      item consult and journals the drop"
++    - "Close-up lifecycle: wave fallback.falls back over triage-less open
++      concerns and lists tech-debt as derived debt"
++    - "Close-up lifecycle: wave fallback.leaves blocker concerns open for
++      explicit triage"
++evidence:
++  - bun run typecheck -> exit 0, no diagnostics
++  - TMPDIR=/tmp bun test test/engine/closeup-lifecycle-resolve.test.ts -> 8
++    pass, 0 fail, 54 expect() calls
++  - TMPDIR=/tmp bun test test/engine/closeup-lifecycle-resolve.test.ts
++    test/engine/epic-saga-propagate.test.ts test/engine/concerns-funnel.test.ts
++    -> 37 pass, 0 fail, 355 expect() calls
++  - "TMPDIR=/tmp bun test -> 443 tests across 69 files: 441 pass, 2 skip, 0
++    fail, 2439 expect() calls"
++  - git diff --stat -> 4 production files changed, +158/-3 lines, within the
++    ~240 prod-line budget
++  - git status --short -> only src/core/concerns.ts, src/core/flows/consults.ts,
++    src/core/flows/epic-propagation.ts, src/core/flows/step-runner.ts modified
++    (no test edits)
++notes: "Ordering: close-up concernResolutions still write pendingResolution
++  without touching status; architect confirmations run in ingestStepConcerns at
++  architect ingest, and consult concernResolution is applied in the same ingest
++  call immediately after writeArtifact, before the step/decision commit. Wave
++  fallback is restricted to concern ids present before the close-up step so its
++  own new findings stay open, and epic-propagated copies (source.epic) are
++  skipped to preserve adr-epic-push-condensed open copies. The epic helper
++  gained an optional concernIds filter used only for accepted propagate
++  confirmations."
++concerns: []
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index 5292217..6a6f8c4 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -1,7 +1,7 @@
+ import fs from "node:fs";
+ import path from "node:path";
+ import { createHash } from "node:crypto";
+-import type { Concern, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++import type { Concern, ConcernConfirms, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+ import type { Repo } from "./git/repo.js";
+ import { commitAll } from "./git/commit.js";
+ import { git } from "./git/exec.js";
+@@ -270,6 +270,77 @@ export function applyCloseupResolutions(
+   return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
+ }
+ 
++/**
++ * Applies architect confirmations to pending close-up proposals. Accept applies
++ * the pending action (resolve closes the concern, carry routes it to the
++ * architect); propagate only clears the proposal because the parent copy is a
++ * cross-store write. Reject clears the proposal and changes nothing else.
++ */
++export function applyConcernConfirms(
++  ctx: ConcernStoreContext & { confirms: Array<Pick<ConcernConfirms, "id" | "confirm">> }
++): Promise<StoredConcernArtifact[]> {
++  const ops = ctx.confirms.map((confirm): [string, Patch] => [confirm.id, (record) => {
++    const pending = record.pendingResolution as StoredConcernArtifact["pendingResolution"];
++    if (!pending) return record;
++    if (confirm.confirm === "reject") return { ...record, pendingResolution: undefined };
++    if (pending.action === "resolve") {
++      return { ...record, status: "resolved", disposition: undefined, pendingResolution: undefined };
++    }
++    if (pending.action === "carry") {
++      return { ...record, status: "routed", disposition: "architect", pendingResolution: undefined };
++    }
++    return { ...record, pendingResolution: undefined };
++  }]);
++  return mutate(ctx, ops, "factory: concerns confirmed");
++}
++
++/**
++ * Applies a decision-level resolution at commit. `resolve` closes the concern
++ * immediately so the next derive stops blocking affected items; `carry` leaves
++ * a pending carry for the next architect ingest.
++ */
++export function applyConcernResolution(
++  ctx: ConcernStoreContext & { resolution: { id: string; action: "resolve" | "carry"; note?: string }; by: string }
++): Promise<StoredConcernArtifact[]> {
++  const patch: Patch = (record, at) => ctx.resolution.action === "resolve"
++    ? { ...record, status: "resolved", disposition: undefined, pendingResolution: undefined }
++    : {
++        ...record,
++        pendingResolution: {
++          action: "carry",
++          ...(ctx.resolution.note !== undefined ? { note: ctx.resolution.note } : {}),
++          by: ctx.by,
++          at,
++        },
++      };
++  return mutate(ctx, [[ctx.resolution.id, patch]], `factory: concerns resolved by ${ctx.by}`);
++}
++
++/**
++ * Wave close-up fallback for triage-less open concerns. Tech debt becomes
++ * optional debt and assumptions/risks/questions route to the architect;
++ * blockers stay open for explicit triage. Only concerns that existed before
++ * the close-up step are eligible, so its own findings stay open. Never assigns
++ * a human-* disposition.
++ */
++export async function applyWaveCloseupFallback(
++  ctx: ConcernStoreContext & { ids?: Iterable<string> }
++): Promise<StoredConcernArtifact[]> {
++  const eligible = ctx.ids ? new Set(ctx.ids) : undefined;
++  const ops: Array<[string, Patch]> = [];
++  for (const concern of await listConcerns(ctx.taskDir)) {
++    if (eligible && !eligible.has(concern.id)) continue;
++    // Epic copies are pushed open for parent awareness by the child close-up;
++    // they are not triage-less local findings, so fallback leaves them alone.
++    if (concern.source?.epic) continue;
++    if (concern.status !== "open" || concern.pendingResolution || concern.disposition) continue;
++    if (concern.kind === "blocker") continue;
++    const disposition = concern.kind === "tech-debt" ? "optional" : "architect";
++    ops.push([concern.id, (record) => ({ ...record, status: "routed", disposition })]);
++  }
++  return mutate(ctx, ops, "factory: concerns wave close-up fallback");
++}
++
+ /** Splits review suggestions into concern triage vs findings by exact id. */
+ export function partitionSuggestions(
+   suggestions: ReviewSuggestion[], concernIds: Iterable<string>
+diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
+index f365c82..2f3c26f 100644
+--- a/plugins/software-factory/src/core/flows/consults.ts
++++ b/plugins/software-factory/src/core/flows/consults.ts
+@@ -399,6 +399,7 @@ async function consultConcernOnce(
+         reason: raw?.reason,
+         question: raw?.question,
+         planDelta: raw?.planDelta,
++        ...(raw?.concernResolution ? { concernResolution: raw.concernResolution } : {}),
+       };
+       await writeYamlAtomic(decisionPath, decisionArtifact);
+     },
+diff --git a/plugins/software-factory/src/core/flows/epic-propagation.ts b/plugins/software-factory/src/core/flows/epic-propagation.ts
+index dea633c..2634a51 100644
+--- a/plugins/software-factory/src/core/flows/epic-propagation.ts
++++ b/plugins/software-factory/src/core/flows/epic-propagation.ts
+@@ -28,6 +28,8 @@ export interface PropagateEpicConcernsOptions {
+   parentTaskDir: string;
+   parentWt: string;
+   epic: string;
++  /** Restricts the push to these child concern ids (architect-confirmed propagate). */
++  concernIds?: Iterable<string>;
+ }
+ 
+ const VERBATIM_BYTES = 120;
+@@ -151,8 +153,11 @@ export async function propagateEpicConcerns(
+   opts: PropagateEpicConcernsOptions
+ ): Promise<void> {
+   const { childTaskDir, parentTaskDir, parentWt, epic } = opts;
++  const only = opts.concernIds ? new Set(opts.concernIds) : undefined;
+   const concerns = (await listConcerns(childTaskDir)).filter(
+-    (concern) => concern.status === "open" || concern.status === "routed"
++    (concern) =>
++      (concern.status === "open" || concern.status === "routed") &&
++      (!only || only.has(concern.id))
+   );
+   const remarkables = await readOpenRemarkables(childTaskDir);
+   const ctx: ConcernWriteContext = { taskDir: parentTaskDir, taskWt: parentWt };
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index aaa3aea..dd1a2bc 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -9,12 +9,14 @@ import type {
+ } from "../../harness/types.js";
+ import type {
+   AgentConfig,
++  CheckItemResult,
++  ConcernConfirms,
++  ConcernResolution,
+   PipelineConfig,
+   PipelineLimits,
+   ProjectConfig,
+   StepMetaArtifact,
+   StepMetaStatus,
+-  CheckItemResult,
+ } from "../artifacts.js";
+ import {
+   startStepRecord,
+@@ -27,8 +29,13 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   aggregateConcerns,
+   applyCloseupResolutions,
++  applyConcernConfirms,
++  applyConcernResolution,
++  applyWaveCloseupFallback,
+   DEFAULT_RAISE_ALLOWLIST,
++  listConcerns,
+ } from "../concerns.js";
++import { propagateEpicConcerns } from "./epic-propagation.js";
+ import {
+   applyReviewTriage,
+   hydrateStepConcerns,
+@@ -193,7 +200,19 @@ async function ingestStepConcerns(opts: {
+   const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
+   const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
+   const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
+-  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return undefined;
++  const confirms: ConcernConfirms[] = Array.isArray(data.concernConfirms) ? data.concernConfirms : [];
++  const resolution = data.concernResolution as ConcernResolution | undefined;
++  if (
++    !concerns.length &&
++    !remarkables.length &&
++    !suggestions.length &&
++    !resolutions.length &&
++    !confirms.length &&
++    !resolution &&
++    opts.source.agent !== "wave-close-up"
++  ) {
++    return undefined;
++  }
+ 
+   // Gate key is source.agent, never the step fragment. Skipping keeps the step
+   // ok (schema validation already passed) and only journals the dropped input.
+@@ -237,9 +256,69 @@ async function ingestStepConcerns(opts: {
+       })
+     : undefined;
+   if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
++
++  // A decision-level resolution only belongs to concern consults and architect
++  // closeup/report ingests. Other steps may share the output schema, so their
++  // cross-emitted field is deliberately dropped and journaled.
++  if (resolution) {
++    const honored =
++      opts.source.step.startsWith("consult-concern-") ||
++      opts.source.step.startsWith("architect-closeup") ||
++      opts.source.step.startsWith("architect-wave-report");
++    if (honored) {
++      await applyConcernResolution({ ...ctx, resolution, by: opts.source.agent });
++    } else {
++      await appendJournal(opts.taskDir, {
++        type: "concern_resolution_ignored",
++        task: opts.task,
++        ...(opts.source.item ? { item: opts.source.item } : {}),
++        step: opts.source.step,
++        agent: opts.source.agent,
++        concern: resolution.id,
++      });
++    }
++  }
++
++  // Architect confirmations settle pending close-up proposals. Propagate alone
++  // needs the parent store, which the epic helper owns.
++  if (confirms.length && opts.source.agent === "architect") {
++    const pending = new Map(
++      (await listConcerns(opts.taskDir)).map((concern) => [concern.id, concern.pendingResolution?.action])
++    );
++    const propagateIds = confirms
++      .filter((confirm) => confirm.confirm === "accept" && pending.get(confirm.id) === "propagate")
++      .map((confirm) => confirm.id);
++    await applyConcernConfirms({ ...ctx, confirms });
++    if (propagateIds.length) {
++      await propagateConfirmedConcerns({ ...opts, concernIds: propagateIds });
++    }
++  }
++
++  // Wave close-up fallback owns only concerns that predate its own findings.
++  if (opts.source.agent === "wave-close-up") {
++    await applyWaveCloseupFallback({ ...ctx, ids: existing });
++  }
+   return triage;
+ }
+ 
++/** Copies confirmed propagated proposals to the enclosing epic/saga task. */
++async function propagateConfirmedConcerns(opts: {
++  taskDir: string; taskWt: string; concernIds: string[];
++}): Promise<void> {
++  const parentTaskDir = path.dirname(opts.taskDir);
++  const epic = path.basename(opts.taskDir);
++  if (parentTaskDir === opts.taskDir) return;
++  // Only epic child task dirs sit under a parent task with a matching item.
++  if (!fs.existsSync(path.join(parentTaskDir, "items", epic, "assignment.yaml"))) return;
++  await propagateEpicConcerns({
++    childTaskDir: opts.taskDir,
++    parentTaskDir,
++    parentWt: opts.taskWt,
++    epic,
++    concernIds: opts.concernIds,
++  });
++}
++
+ /**
+  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
+  */
+diff --git a/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts b/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
+new file mode 100644
+index 0000000..5a47a6a
+--- /dev/null
++++ b/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
+@@ -0,0 +1,531 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runConcernConsult } from "../../src/core/flows/consults.js";
++import { deriveTaskState } from "../../src/core/derive/task.js";
++import { readJournal } from "../../src/core/journal.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Close-up propose/confirm lifecycle and unblock (adr-closeup-lifecycle-resolved).
++ *
++ * Close-ups propose `concernResolutions` as pending intent only. The architect
++ * confirms or rejects them during architect ingests: accept+resolve makes the
++ * concern `resolved`, accept+carry routes it to the architect, accept+propagate
++ * pushes a condensed copy to the parent task (epic helper), and reject clears
++ * the pending proposal without changing status or disposition. A concern
++ * consult's direct `concernResolution` is applied when its decision commits, so
++ * the next derive no longer blocks the affected item. A wave close-up assigns
++ * a fallback disposition to triage-less open concerns so simple/no-behavior
++ * items still reach the architect or the debt list; blockers stay open for
++ * explicit triage and fallback never invents a human disposition.
++ */
++
++const ORCH = ".factory";
++const TASK = "lifecycle-task";
++
++let tmpRepo: TmpRepo;
++let repo: Repo;
++let taskWt: string;
++let taskDir: string;
++let pipeline: PipelineConfig;
++let project: ProjectConfig;
++let prompts: ReturnType<typeof loadPromptLibrary>;
++
++beforeEach(() => {
++  tmpRepo = createTmpRepo();
++  const worktreeRoot = path.join(tmpRepo.dir + "-wt");
++  fs.mkdirSync(worktreeRoot, { recursive: true });
++  repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++  taskWt = tmpRepo.dir;
++  taskDir = path.join(taskWt, ORCH, TASK);
++  fs.mkdirSync(taskDir, { recursive: true });
++  fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Lifecycle\n", "utf8");
++  tmpRepo.commit("add lifecycle task");
++
++  pipeline = {
++    models: {
++      roles: {
++        workhorse: { model: "model-workhorse" },
++        "alt-workhorse": { model: "model-alt-workhorse" },
++        architect: { model: "model-architect" },
++        "alt-architect": { model: "model-alt-architect" },
++        simpler: { model: "model-simpler" },
++      },
++    },
++    agents: {
++      developer: { role: "workhorse" },
++      qa: { role: "alt-workhorse" },
++      reviewer: { role: "alt-workhorse" },
++      architect: { role: "architect" },
++      "wave-close-up": { role: "alt-workhorse" },
++      "plan-close-up": { role: "alt-workhorse" },
++    },
++    flows: { simple: { steps: [] }, story: {}, spike: {} },
++    limits: {},
++  };
++  project = { orchestrationFolder: ORCH, worktreeRoot };
++  prompts = loadPromptLibrary({
++    builtinDir: path.resolve(import.meta.dir, "../../agents"),
++    overrideDirs: [],
++  });
++});
++
++afterEach(() => {
++  tmpRepo.cleanup();
++});
++
++function storedConcern(
++  overrides: Partial<StoredConcernArtifact> & { id: string }
++): StoredConcernArtifact {
++  return {
++    kind: "risk",
++    summary: `Concern ${overrides.id}`,
++    detail: "detail",
++    severity: "medium",
++    status: "open",
++    source: { record: "001-develop-a1", agent: "developer" },
++    createdAt: "2026-01-01T00:00:00.000Z",
++    updatedAt: "2026-01-01T00:00:00.000Z",
++    ...overrides,
++  };
++}
++
++async function writeConcern(
++  root: string,
++  concern: StoredConcernArtifact
++): Promise<string> {
++  const file = path.join(root, "concerns", `${concern.id}.yaml`);
++  await writeYamlAtomic(file, concern);
++  return file;
++}
++
++async function readConcern(
++  id: string,
++  root = taskDir
++): Promise<StoredConcernArtifact> {
++  return readYaml<StoredConcernArtifact>(path.join(root, "concerns", `${id}.yaml`));
++}
++
++async function runStep(opts: {
++  data: unknown;
++  agent: string;
++  stepId: string;
++  stepFragment: string;
++  task?: string;
++  taskDir?: string;
++  promptVars: Record<string, string>;
++}) {
++  const harness = new FakeHarness();
++  const label = `${opts.task ?? TASK}/runs/${opts.stepId}#a1`;
++  harness.scriptOutcome(label, { ok: true, data: opts.data });
++  harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
++  harness.scriptComplete(() => opts.data);
++
++  return runAgentStep({
++    task: opts.task ?? TASK,
++    stepId: opts.stepId,
++    stepFragment: opts.stepFragment,
++    agent: opts.agent,
++    cwd: taskWt,
++    taskWt,
++    taskDir: opts.taskDir ?? taskDir,
++    recordsDir: path.join(opts.taskDir ?? taskDir, "runs"),
++    repo,
++    harness,
++    pipeline,
++    project,
++    prompts,
++    promptVars: opts.promptVars,
++  });
++}
++
++function architectCloseup(id: string, confirm: "accept" | "reject") {
++  return runStep({
++    agent: "architect",
++    stepId: "architect-closeup-1",
++    stepFragment: "steps/architect-closeup",
++    data: {
++      iteration: 1,
++      status: "complete",
++      summary: "Plan complete",
++      concernConfirms: [{ id, confirm }],
++    },
++    promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
++  });
++}
++
++describe("Close-up lifecycle: architect confirmations", () => {
++  it("accept resolves a pending resolve and derive exposes the resolved status", async () => {
++    await writeConcern(
++      taskDir,
++      storedConcern({
++        id: "c-resolved",
++        status: "routed",
++        disposition: "architect",
++        pendingResolution: {
++          action: "resolve",
++          by: "wave-close-up",
++          at: "2026-01-01T00:00:01.000Z",
++        },
++      })
++    );
++    tmpRepo.commit("seed pending resolve");
++
++    const result = await architectCloseup("c-resolved", "accept");
++    expect(result.ok).toBe(true);
++
++    const stored = await readConcern("c-resolved");
++    expect(stored.status).toBe("resolved");
++    expect(stored.pendingResolution).toBeUndefined();
++
++    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
++    expect(state.concerns.resolved).toBe(1);
++    expect(state.concerns.routed).toBe(0);
++  });
++
++  it("accept carries a pending carry to the architect", async () => {
++    await writeConcern(
++      taskDir,
++      storedConcern({
++        id: "c-carried",
++        status: "open",
++        pendingResolution: {
++          action: "carry",
++          note: "architect should decide",
++          by: "wave-close-up",
++          at: "2026-01-01T00:00:01.000Z",
++        },
++      })
++    );
++    tmpRepo.commit("seed pending carry");
++
++    const result = await architectCloseup("c-carried", "accept");
++    expect(result.ok).toBe(true);
++
++    const stored = await readConcern("c-carried");
++    expect(stored.status).toBe("routed");
++    expect(stored.disposition).toBe("architect");
++    expect(stored.pendingResolution).toBeUndefined();
++  });
++
++  it("accept propagates a pending propagate to the parent concern store", async () => {
++    const parentTaskDir = path.join(taskWt, ORCH, "saga");
++    const childTaskDir = path.join(parentTaskDir, "epic-a");
++    fs.mkdirSync(path.join(parentTaskDir, "items", "epic-a"), { recursive: true });
++    fs.writeFileSync(path.join(parentTaskDir, "INTENT.md"), "# Saga\n", "utf8");
++    fs.writeFileSync(
++      path.join(parentTaskDir, "items", "epic-a", "assignment.yaml"),
++      "slug: epic-a\nkind: epic\ntitle: Epic A\nassignment: Deliver epic A\nwave: 1\ndeps: []\n",
++      "utf8"
++    );
++    fs.mkdirSync(childTaskDir, { recursive: true });
++    await writeConcern(
++      childTaskDir,
++      storedConcern({
++        id: "c-propagated",
++        status: "open",
++        source: { record: "001-develop-a1", agent: "developer", item: "child-item" },
++        pendingResolution: {
++          action: "propagate",
++          note: "saga should own this",
++          by: "plan-close-up",
++          at: "2026-01-01T00:00:01.000Z",
++        },
++      })
++    );
++    tmpRepo.commit("seed epic child concern");
++
++    const result = await runStep({
++      task: "saga--epic-a",
++      taskDir: childTaskDir,
++      agent: "architect",
++      stepId: "architect-closeup-1",
++      stepFragment: "steps/architect-closeup",
++      data: {
++        iteration: 1,
++        status: "complete",
++        summary: "Plan complete",
++        concernConfirms: [{ id: "c-propagated", confirm: "accept" }],
++      },
++      promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
++    });
++    expect(result.ok).toBe(true);
++
++    const child = await readConcern("c-propagated", childTaskDir);
++    expect(child.pendingResolution).toBeUndefined();
++
++    const parentConcerns = path.join(parentTaskDir, "concerns");
++    const copies = fs.existsSync(parentConcerns)
++      ? fs.readdirSync(parentConcerns).filter((name) => name.startsWith("c-"))
++      : [];
++    expect(copies).toHaveLength(1);
++    const copy = await readYaml<StoredConcernArtifact>(
++      path.join(parentConcerns, copies[0]!)
++    );
++    expect(copy.summary).toBe("[epic] Concern c-propagated");
++    expect(copy.source.epic).toBe("epic-a");
++    expect(copy.status).toBe("open");
++  });
++
++  it("reject clears the pending resolution, preserving open status and disposition", async () => {
++    await writeConcern(
++      taskDir,
++      storedConcern({
++        id: "c-rejected",
++        status: "open",
++        pendingResolution: {
++          action: "resolve",
++          by: "wave-close-up",
++          at: "2026-01-01T00:00:01.000Z",
++        },
++      })
++    );
++    tmpRepo.commit("seed pending reject");
++
++    const result = await architectCloseup("c-rejected", "reject");
++    expect(result.ok).toBe(true);
++
++    const stored = await readConcern("c-rejected");
++    expect(stored.status).toBe("open");
++    expect(stored.disposition).toBeUndefined();
++    expect(stored.pendingResolution).toBeUndefined();
++  });
++});
++
++describe("Close-up lifecycle: consult unblock", () => {
++  it("consult resolve unblocks the affected item on the next derive", async () => {
++    const itemDir = path.join(taskDir, "items", "blocked-item");
++    fs.mkdirSync(itemDir, { recursive: true });
++    fs.writeFileSync(
++      path.join(itemDir, "assignment.yaml"),
++      "slug: blocked-item\nkind: dev\ntitle: Blocked item\nassignment: Implement\nwave: 1\ndeps: []\n",
++      "utf8"
++    );
++    const blocker = storedConcern({
++      id: "c-blocker",
++      kind: "blocker",
++      summary: "Database migration pending",
++      severity: "high",
++      status: "routed",
++      affects: ["blocked-item"],
++      disposition: "architect",
++    });
++    await writeConcern(taskDir, blocker);
++    tmpRepo.commit("seed blocked item and concern");
++
++    const before = await deriveTaskState({ taskDir, task: TASK, pipeline });
++    expect(before.itemMap["blocked-item"]?.status).toBe("blocked");
++
++    const harness = new FakeHarness();
++    const label = `${TASK}/runs/consult-concern-c-blocker#a1`;
++    const output = {
++      decision: "continue",
++      rationale: "Migration is no longer required",
++      concernResolution: { id: "c-blocker", action: "resolve" },
++    };
++    harness.scriptOutcome(label, { ok: true, data: output });
++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: output });
++    harness.scriptComplete(() => output);
++
++    const res = await runConcernConsult({
++      task: TASK,
++      concern: blocker,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++    expect(res.decision?.concernResolution).toEqual({
++      id: "c-blocker",
++      action: "resolve",
++    });
++
++    const decisionPath = path.join(taskDir, "decisions", "concern-c-blocker.yaml");
++    expect(fs.existsSync(decisionPath)).toBe(true);
++    const decision = await readYaml<Record<string, unknown>>(decisionPath);
++    expect(decision.concernResolution).toEqual({
++      id: "c-blocker",
++      action: "resolve",
++    });
++
++    const stored = await readConcern("c-blocker");
++    expect(stored.status).toBe("resolved");
++    expect(stored.pendingResolution).toBeUndefined();
++
++    const after = await deriveTaskState({ taskDir, task: TASK, pipeline });
++    expect(after.itemMap["blocked-item"]?.status).toBe("pending");
++    expect(after.concerns.resolved).toBe(1);
++  });
++
++  it("ignores concernResolution from an item consult and journals the drop", async () => {
++    await writeConcern(
++      taskDir,
++      storedConcern({ id: "c-cross-emitted", status: "open" })
++    );
++    tmpRepo.commit("seed cross-emission concern");
++
++    const result = await runStep({
++      agent: "architect",
++      stepId: "consult-item-guard",
++      stepFragment: "steps/architect-consult-item",
++      data: {
++        decision: "retry-with-guidance",
++        rationale: "Retry",
++        concernResolution: { id: "c-cross-emitted", action: "resolve" },
++      },
++      promptVars: {
++        item: "guard-item",
++        assignment: "work",
++        priorAttempts: "",
++        diff: "",
++        feedback: "",
++      },
++    });
++    expect(result.ok).toBe(true);
++
++    const stored = await readConcern("c-cross-emitted");
++    expect(stored.status).toBe("open");
++    expect(stored.pendingResolution).toBeUndefined();
++
++    const events = await readJournal(taskDir);
++    const ignored = events.filter(
++      (event) =>
++        event.type === "concern_resolution_ignored" &&
++        event.step === "consult-item-guard"
++    );
++    expect(ignored).toHaveLength(1);
++  });
++});
++
++describe("Close-up lifecycle: wave fallback", () => {
++  async function runWaveCloseup() {
++    return runStep({
++      agent: "wave-close-up",
++      stepId: "wave-close-up-1-1",
++      stepFragment: "steps/wave-close-up",
++      data: {
++        wave: 1,
++        iteration: 1,
++        status: "complete",
++        mergedItems: [],
++        summary: "Wave 1 complete",
++      },
++      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
++    });
++  }
++
++  it("falls back over triage-less open concerns and lists tech-debt as derived debt", async () => {
++    await writeConcern(
++      taskDir,
++      storedConcern({
++        id: "c-debt",
++        kind: "tech-debt",
++        summary: "Duplicate helper",
++        status: "open",
++        source: { record: "001-develop-a1", agent: "developer", item: "simple" },
++      })
++    );
++    await writeConcern(
++      taskDir,
++      storedConcern({ id: "c-assumption", kind: "assumption", status: "open" })
++    );
++    await writeConcern(
++      taskDir,
++      storedConcern({ id: "c-risk", kind: "risk", status: "open" })
++    );
++    await writeConcern(
++      taskDir,
++      storedConcern({ id: "c-question", kind: "question", status: "open" })
++    );
++    // Pending proposals are owned by architect confirmation, not by fallback.
++    await writeConcern(
++      taskDir,
++      storedConcern({
++        id: "c-pending",
++        kind: "tech-debt",
++        status: "open",
++        pendingResolution: {
++          action: "resolve",
++          by: "plan-close-up",
++          at: "2026-01-01T00:00:01.000Z",
++        },
++      })
++    );
++    tmpRepo.commit("seed triage-less concerns");
++
++    const result = await runWaveCloseup();
++    expect(result.ok).toBe(true);
++
++    const debt = await readConcern("c-debt");
++    expect(debt.status).toBe("routed");
++    expect(debt.disposition).toBe("optional");
++
++    for (const id of ["c-assumption", "c-risk", "c-question"]) {
++      const routed = await readConcern(id);
++      expect(routed.status).toBe("routed");
++      expect(routed.disposition).toBe("architect");
++    }
++
++    const pending = await readConcern("c-pending");
++    expect(pending.status).toBe("open");
++    expect(pending.disposition).toBeUndefined();
++    expect(pending.pendingResolution?.action).toBe("resolve");
++
++    const all = await Promise.all(
++      ["c-debt", "c-assumption", "c-risk", "c-question", "c-pending"].map((id) =>
++        readConcern(id)
++      )
++    );
++    for (const concern of all) {
++      expect(concern.disposition?.startsWith("human-") ?? false).toBe(false);
++    }
++
++    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
++    expect(state.debt).toContain("[simple] Duplicate helper");
++  });
++
++  it("leaves blocker concerns open for explicit triage", async () => {
++    await writeConcern(
++      taskDir,
++      storedConcern({
++        id: "c-blocker-open",
++        kind: "blocker",
++        summary: "Needs explicit human/architect triage",
++        severity: "high",
++        status: "open",
++      })
++    );
++    // A triage-less non-blocker in the same pass proves the fallback ran while
++    // deliberately skipping the blocker.
++    await writeConcern(
++      taskDir,
++      storedConcern({ id: "c-risk-routed", kind: "risk", status: "open" })
++    );
++    tmpRepo.commit("seed triage-less blocker");
++
++    const result = await runWaveCloseup();
++    expect(result.ok).toBe(true);
++
++    const routedRisk = await readConcern("c-risk-routed");
++    expect(routedRisk.status).toBe("routed");
++    expect(routedRisk.disposition).toBe("architect");
++
++    const stored = await readConcern("c-blocker-open");
++    expect(stored.status).toBe("open");
++    expect(stored.disposition).toBeUndefined();
++  });
++});
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["approved","changes_requested"])
+- summary (string, required)
+- suggestions (array of object, required)
+  - id (string, required)
+  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
+  - summary (string, required)
+  - detail (string, optional)
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..83ffa15
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
+name: qa
+attempt: 1
+fixRound: 1
+agent: qa
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T02:32:21.458Z
+session: 01a1be26-513e-7636-b73f-02125a979d3e
+endedAt: 2026-11-09T03:15:54.208Z
+usage:
+  inputTokens: 196121
+  outputTokens: 116569
+  costUsd: 0.050665
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T02-32-24-638Z_01a1be26-513e-7636-b73f-02125a979d3e.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..5a5f772
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/closeup-lifecycle-resolve/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,61 @@
+status: changes_requested
+summary: 8/8 green, full suite 441 pass, red credible, no weakening; 1 fix
+  (unfiltered epic push), 1 architect (cross-wt parent), 2 optional
+suggestions:
+  - id: epic-filter-scope-gap
+    disposition: fix
+    summary: concernIds filter restricts only concerns, remarkables/questions still
+      push unfiltered
+    detail: "propagateEpicConcerns filters listConcerns by concernIds but
+      readOpenRemarkables (line 162) and forwardBlockedQuestions (line 182) run
+      unfiltered. Interface contract says 'Restricts the push to these child
+      concern ids'. Accepting one propagate mid-flow would forward all open
+      remarkables and blocked questions, potentially blocking parent
+      prematurely. Test masks via c- prefix filter on parent concerns dir. Fix:
+      skip remarkables/questions when concernIds is set, or thread the filter
+      through."
+    location:
+      file: plugins/software-factory/src/core/flows/epic-propagation.ts
+      line: 162
+  - id: midflow-parent-worktree
+    disposition: architect
+    summary: propagateConfirmedConcerns dirname(taskDir) strands copies on child
+      branch in prod topology
+    detail: "engine.ts runChildTask isolates epic children:
+      childTaskDir=childWt/.factory/<parent>/<epic> (line 234), live parent is
+      parent.taskDir on parent.path. propagateConfirmedConcerns derives
+      parentTaskDir=dirname(taskDir), which in prod is the child worktree's
+      stale parent snapshot, not the live parent. Mid-flow copies commit to the
+      child branch and never reach the parent; only end-of-child propagation
+      (engine.ts:273, cross-wt write under lock) delivers. Test nests child
+      under parent in the same wt, masking this. Needs architect decision: plumb
+      live parent path for cross-wt write vs defer confirmed propagate to
+      end-of-child."
+    location:
+      file: plugins/software-factory/src/core/flows/step-runner.ts
+      line: 308
+  - id: guard-prefix-collision
+    disposition: optional
+    summary: Guard prefix consult-concern- collides with item slugs starting with
+      concern-
+    detail: Item consults use stepId `consult-${item}` (consults.ts:110). An item
+      slug like concern-foo yields consult-concern-foo, which matches the
+      honored prefix and would bypass the cross-emission guard. Unlikely slug
+      shape but guard should match on stepFragment or exact concern-consult
+      pattern for robustness.
+    location:
+      file: plugins/software-factory/src/core/flows/step-runner.ts
+      line: 265
+  - id: untested-carry-honored-paths
+    disposition: optional
+    summary: Carry-via-decision and honored architect-closeup singular-resolution
+      paths lack coverage
+    detail: applyConcernResolution carry branch (pending carry, status unchanged)
+      and the honored architect-closeup/architect-wave-report
+      singular-resolution path have no tests; only consult-resolve honored and
+      item-consult ignored paths are covered. Propagate-accept child
+      status/disposition also unasserted (only pending cleared). Consider adding
+      cases to lock these contracts.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 302
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index 5292217..6a6f8c4 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -1,7 +1,7 @@
 import fs from "node:fs";
 import path from "node:path";
 import { createHash } from "node:crypto";
-import type { Concern, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+import type { Concern, ConcernConfirms, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
 import type { Repo } from "./git/repo.js";
 import { commitAll } from "./git/commit.js";
 import { git } from "./git/exec.js";
@@ -270,6 +270,77 @@ export function applyCloseupResolutions(
   return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
 }
 
+/**
+ * Applies architect confirmations to pending close-up proposals. Accept applies
+ * the pending action (resolve closes the concern, carry routes it to the
+ * architect); propagate only clears the proposal because the parent copy is a
+ * cross-store write. Reject clears the proposal and changes nothing else.
+ */
+export function applyConcernConfirms(
+  ctx: ConcernStoreContext & { confirms: Array<Pick<ConcernConfirms, "id" | "confirm">> }
+): Promise<StoredConcernArtifact[]> {
+  const ops = ctx.confirms.map((confirm): [string, Patch] => [confirm.id, (record) => {
+    const pending = record.pendingResolution as StoredConcernArtifact["pendingResolution"];
+    if (!pending) return record;
+    if (confirm.confirm === "reject") return { ...record, pendingResolution: undefined };
+    if (pending.action === "resolve") {
+      return { ...record, status: "resolved", disposition: undefined, pendingResolution: undefined };
+    }
+    if (pending.action === "carry") {
+      return { ...record, status: "routed", disposition: "architect", pendingResolution: undefined };
+    }
+    return { ...record, pendingResolution: undefined };
+  }]);
+  return mutate(ctx, ops, "factory: concerns confirmed");
+}
+
+/**
+ * Applies a decision-level resolution at commit. `resolve` closes the concern
+ * immediately so the next derive stops blocking affected items; `carry` leaves
+ * a pending carry for the next architect ingest.
+ */
+export function applyConcernResolution(
+  ctx: ConcernStoreContext & { resolution: { id: string; action: "resolve" | "carry"; note?: string }; by: string }
+): Promise<StoredConcernArtifact[]> {
+  const patch: Patch = (record, at) => ctx.resolution.action === "resolve"
+    ? { ...record, status: "resolved", disposition: undefined, pendingResolution: undefined }
+    : {
+        ...record,
+        pendingResolution: {
+          action: "carry",
+          ...(ctx.resolution.note !== undefined ? { note: ctx.resolution.note } : {}),
+          by: ctx.by,
+          at,
+        },
+      };
+  return mutate(ctx, [[ctx.resolution.id, patch]], `factory: concerns resolved by ${ctx.by}`);
+}
+
+/**
+ * Wave close-up fallback for triage-less open concerns. Tech debt becomes
+ * optional debt and assumptions/risks/questions route to the architect;
+ * blockers stay open for explicit triage. Only concerns that existed before
+ * the close-up step are eligible, so its own findings stay open. Never assigns
+ * a human-* disposition.
+ */
+export async function applyWaveCloseupFallback(
+  ctx: ConcernStoreContext & { ids?: Iterable<string> }
+): Promise<StoredConcernArtifact[]> {
+  const eligible = ctx.ids ? new Set(ctx.ids) : undefined;
+  const ops: Array<[string, Patch]> = [];
+  for (const concern of await listConcerns(ctx.taskDir)) {
+    if (eligible && !eligible.has(concern.id)) continue;
+    // Epic copies are pushed open for parent awareness by the child close-up;
+    // they are not triage-less local findings, so fallback leaves them alone.
+    if (concern.source?.epic) continue;
+    if (concern.status !== "open" || concern.pendingResolution || concern.disposition) continue;
+    if (concern.kind === "blocker") continue;
+    const disposition = concern.kind === "tech-debt" ? "optional" : "architect";
+    ops.push([concern.id, (record) => ({ ...record, status: "routed", disposition })]);
+  }
+  return mutate(ctx, ops, "factory: concerns wave close-up fallback");
+}
+
 /** Splits review suggestions into concern triage vs findings by exact id. */
 export function partitionSuggestions(
   suggestions: ReviewSuggestion[], concernIds: Iterable<string>
diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
index f365c82..2f3c26f 100644
--- a/plugins/software-factory/src/core/flows/consults.ts
+++ b/plugins/software-factory/src/core/flows/consults.ts
@@ -399,6 +399,7 @@ async function consultConcernOnce(
         reason: raw?.reason,
         question: raw?.question,
         planDelta: raw?.planDelta,
+        ...(raw?.concernResolution ? { concernResolution: raw.concernResolution } : {}),
       };
       await writeYamlAtomic(decisionPath, decisionArtifact);
     },
diff --git a/plugins/software-factory/src/core/flows/epic-propagation.ts b/plugins/software-factory/src/core/flows/epic-propagation.ts
index dea633c..2634a51 100644
--- a/plugins/software-factory/src/core/flows/epic-propagation.ts
+++ b/plugins/software-factory/src/core/flows/epic-propagation.ts
@@ -28,6 +28,8 @@ export interface PropagateEpicConcernsOptions {
   parentTaskDir: string;
   parentWt: string;
   epic: string;
+  /** Restricts the push to these child concern ids (architect-confirmed propagate). */
+  concernIds?: Iterable<string>;
 }
 
 const VERBATIM_BYTES = 120;
@@ -151,8 +153,11 @@ export async function propagateEpicConcerns(
   opts: PropagateEpicConcernsOptions
 ): Promise<void> {
   const { childTaskDir, parentTaskDir, parentWt, epic } = opts;
+  const only = opts.concernIds ? new Set(opts.concernIds) : undefined;
   const concerns = (await listConcerns(childTaskDir)).filter(
-    (concern) => concern.status === "open" || concern.status === "routed"
+    (concern) =>
+      (concern.status === "open" || concern.status === "routed") &&
+      (!only || only.has(concern.id))
   );
   const remarkables = await readOpenRemarkables(childTaskDir);
   const ctx: ConcernWriteContext = { taskDir: parentTaskDir, taskWt: parentWt };
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index aaa3aea..dd1a2bc 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -9,12 +9,14 @@ import type {
 } from "../../harness/types.js";
 import type {
   AgentConfig,
+  CheckItemResult,
+  ConcernConfirms,
+  ConcernResolution,
   PipelineConfig,
   PipelineLimits,
   ProjectConfig,
   StepMetaArtifact,
   StepMetaStatus,
-  CheckItemResult,
 } from "../artifacts.js";
 import {
   startStepRecord,
@@ -27,8 +29,13 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
   aggregateConcerns,
   applyCloseupResolutions,
+  applyConcernConfirms,
+  applyConcernResolution,
+  applyWaveCloseupFallback,
   DEFAULT_RAISE_ALLOWLIST,
+  listConcerns,
 } from "../concerns.js";
+import { propagateEpicConcerns } from "./epic-propagation.js";
 import {
   applyReviewTriage,
   hydrateStepConcerns,
@@ -193,7 +200,19 @@ async function ingestStepConcerns(opts: {
   const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
   const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
   const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
-  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return undefined;
+  const confirms: ConcernConfirms[] = Array.isArray(data.concernConfirms) ? data.concernConfirms : [];
+  const resolution = data.concernResolution as ConcernResolution | undefined;
+  if (
+    !concerns.length &&
+    !remarkables.length &&
+    !suggestions.length &&
+    !resolutions.length &&
+    !confirms.length &&
+    !resolution &&
+    opts.source.agent !== "wave-close-up"
+  ) {
+    return undefined;
+  }
 
   // Gate key is source.agent, never the step fragment. Skipping keeps the step
   // ok (schema validation already passed) and only journals the dropped input.
@@ -237,9 +256,69 @@ async function ingestStepConcerns(opts: {
       })
     : undefined;
   if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
+
+  // A decision-level resolution only belongs to concern consults and architect
+  // closeup/report ingests. Other steps may share the output schema, so their
+  // cross-emitted field is deliberately dropped and journaled.
+  if (resolution) {
+    const honored =
+      opts.source.step.startsWith("consult-concern-") ||
+      opts.source.step.startsWith("architect-closeup") ||
+      opts.source.step.startsWith("architect-wave-report");
+    if (honored) {
+      await applyConcernResolution({ ...ctx, resolution, by: opts.source.agent });
+    } else {
+      await appendJournal(opts.taskDir, {
+        type: "concern_resolution_ignored",
+        task: opts.task,
+        ...(opts.source.item ? { item: opts.source.item } : {}),
+        step: opts.source.step,
+        agent: opts.source.agent,
+        concern: resolution.id,
+      });
+    }
+  }
+
+  // Architect confirmations settle pending close-up proposals. Propagate alone
+  // needs the parent store, which the epic helper owns.
+  if (confirms.length && opts.source.agent === "architect") {
+    const pending = new Map(
+      (await listConcerns(opts.taskDir)).map((concern) => [concern.id, concern.pendingResolution?.action])
+    );
+    const propagateIds = confirms
+      .filter((confirm) => confirm.confirm === "accept" && pending.get(confirm.id) === "propagate")
+      .map((confirm) => confirm.id);
+    await applyConcernConfirms({ ...ctx, confirms });
+    if (propagateIds.length) {
+      await propagateConfirmedConcerns({ ...opts, concernIds: propagateIds });
+    }
+  }
+
+  // Wave close-up fallback owns only concerns that predate its own findings.
+  if (opts.source.agent === "wave-close-up") {
+    await applyWaveCloseupFallback({ ...ctx, ids: existing });
+  }
   return triage;
 }
 
+/** Copies confirmed propagated proposals to the enclosing epic/saga task. */
+async function propagateConfirmedConcerns(opts: {
+  taskDir: string; taskWt: string; concernIds: string[];
+}): Promise<void> {
+  const parentTaskDir = path.dirname(opts.taskDir);
+  const epic = path.basename(opts.taskDir);
+  if (parentTaskDir === opts.taskDir) return;
+  // Only epic child task dirs sit under a parent task with a matching item.
+  if (!fs.existsSync(path.join(parentTaskDir, "items", epic, "assignment.yaml"))) return;
+  await propagateEpicConcerns({
+    childTaskDir: opts.taskDir,
+    parentTaskDir,
+    parentWt: opts.taskWt,
+    epic,
+    concernIds: opts.concernIds,
+  });
+}
+
 /**
  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
  */
diff --git a/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts b/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
new file mode 100644
index 0000000..5a47a6a
--- /dev/null
+++ b/plugins/software-factory/test/engine/closeup-lifecycle-resolve.test.ts
@@ -0,0 +1,531 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runAgentStep } from "../../src/core/flows/step-runner.js";
+import { runConcernConsult } from "../../src/core/flows/consults.js";
+import { deriveTaskState } from "../../src/core/derive/task.js";
+import { readJournal } from "../../src/core/journal.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Close-up propose/confirm lifecycle and unblock (adr-closeup-lifecycle-resolved).
+ *
+ * Close-ups propose `concernResolutions` as pending intent only. The architect
+ * confirms or rejects them during architect ingests: accept+resolve makes the
+ * concern `resolved`, accept+carry routes it to the architect, accept+propagate
+ * pushes a condensed copy to the parent task (epic helper), and reject clears
+ * the pending proposal without changing status or disposition. A concern
+ * consult's direct `concernResolution` is applied when its decision commits, so
+ * the next derive no longer blocks the affected item. A wave close-up assigns
+ * a fallback disposition to triage-less open concerns so simple/no-behavior
+ * items still reach the architect or the debt list; blockers stay open for
+ * explicit triage and fallback never invents a human disposition.
+ */
+
+const ORCH = ".factory";
+const TASK = "lifecycle-task";
+
+let tmpRepo: TmpRepo;
+let repo: Repo;
+let taskWt: string;
+let taskDir: string;
+let pipeline: PipelineConfig;
+let project: ProjectConfig;
+let prompts: ReturnType<typeof loadPromptLibrary>;
+
+beforeEach(() => {
+  tmpRepo = createTmpRepo();
+  const worktreeRoot = path.join(tmpRepo.dir + "-wt");
+  fs.mkdirSync(worktreeRoot, { recursive: true });
+  repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+  taskWt = tmpRepo.dir;
+  taskDir = path.join(taskWt, ORCH, TASK);
+  fs.mkdirSync(taskDir, { recursive: true });
+  fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Lifecycle\n", "utf8");
+  tmpRepo.commit("add lifecycle task");
+
+  pipeline = {
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
+      qa: { role: "alt-workhorse" },
+      reviewer: { role: "alt-workhorse" },
+      architect: { role: "architect" },
+      "wave-close-up": { role: "alt-workhorse" },
+      "plan-close-up": { role: "alt-workhorse" },
+    },
+    flows: { simple: { steps: [] }, story: {}, spike: {} },
+    limits: {},
+  };
+  project = { orchestrationFolder: ORCH, worktreeRoot };
+  prompts = loadPromptLibrary({
+    builtinDir: path.resolve(import.meta.dir, "../../agents"),
+    overrideDirs: [],
+  });
+});
+
+afterEach(() => {
+  tmpRepo.cleanup();
+});
+
+function storedConcern(
+  overrides: Partial<StoredConcernArtifact> & { id: string }
+): StoredConcernArtifact {
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
+async function writeConcern(
+  root: string,
+  concern: StoredConcernArtifact
+): Promise<string> {
+  const file = path.join(root, "concerns", `${concern.id}.yaml`);
+  await writeYamlAtomic(file, concern);
+  return file;
+}
+
+async function readConcern(
+  id: string,
+  root = taskDir
+): Promise<StoredConcernArtifact> {
+  return readYaml<StoredConcernArtifact>(path.join(root, "concerns", `${id}.yaml`));
+}
+
+async function runStep(opts: {
+  data: unknown;
+  agent: string;
+  stepId: string;
+  stepFragment: string;
+  task?: string;
+  taskDir?: string;
+  promptVars: Record<string, string>;
+}) {
+  const harness = new FakeHarness();
+  const label = `${opts.task ?? TASK}/runs/${opts.stepId}#a1`;
+  harness.scriptOutcome(label, { ok: true, data: opts.data });
+  harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
+  harness.scriptComplete(() => opts.data);
+
+  return runAgentStep({
+    task: opts.task ?? TASK,
+    stepId: opts.stepId,
+    stepFragment: opts.stepFragment,
+    agent: opts.agent,
+    cwd: taskWt,
+    taskWt,
+    taskDir: opts.taskDir ?? taskDir,
+    recordsDir: path.join(opts.taskDir ?? taskDir, "runs"),
+    repo,
+    harness,
+    pipeline,
+    project,
+    prompts,
+    promptVars: opts.promptVars,
+  });
+}
+
+function architectCloseup(id: string, confirm: "accept" | "reject") {
+  return runStep({
+    agent: "architect",
+    stepId: "architect-closeup-1",
+    stepFragment: "steps/architect-closeup",
+    data: {
+      iteration: 1,
+      status: "complete",
+      summary: "Plan complete",
+      concernConfirms: [{ id, confirm }],
+    },
+    promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
+  });
+}
+
+describe("Close-up lifecycle: architect confirmations", () => {
+  it("accept resolves a pending resolve and derive exposes the resolved status", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-resolved",
+        status: "routed",
+        disposition: "architect",
+        pendingResolution: {
+          action: "resolve",
+          by: "wave-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed pending resolve");
+
+    const result = await architectCloseup("c-resolved", "accept");
+    expect(result.ok).toBe(true);
+
+    const stored = await readConcern("c-resolved");
+    expect(stored.status).toBe("resolved");
+    expect(stored.pendingResolution).toBeUndefined();
+
+    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(state.concerns.resolved).toBe(1);
+    expect(state.concerns.routed).toBe(0);
+  });
+
+  it("accept carries a pending carry to the architect", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-carried",
+        status: "open",
+        pendingResolution: {
+          action: "carry",
+          note: "architect should decide",
+          by: "wave-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed pending carry");
+
+    const result = await architectCloseup("c-carried", "accept");
+    expect(result.ok).toBe(true);
+
+    const stored = await readConcern("c-carried");
+    expect(stored.status).toBe("routed");
+    expect(stored.disposition).toBe("architect");
+    expect(stored.pendingResolution).toBeUndefined();
+  });
+
+  it("accept propagates a pending propagate to the parent concern store", async () => {
+    const parentTaskDir = path.join(taskWt, ORCH, "saga");
+    const childTaskDir = path.join(parentTaskDir, "epic-a");
+    fs.mkdirSync(path.join(parentTaskDir, "items", "epic-a"), { recursive: true });
+    fs.writeFileSync(path.join(parentTaskDir, "INTENT.md"), "# Saga\n", "utf8");
+    fs.writeFileSync(
+      path.join(parentTaskDir, "items", "epic-a", "assignment.yaml"),
+      "slug: epic-a\nkind: epic\ntitle: Epic A\nassignment: Deliver epic A\nwave: 1\ndeps: []\n",
+      "utf8"
+    );
+    fs.mkdirSync(childTaskDir, { recursive: true });
+    await writeConcern(
+      childTaskDir,
+      storedConcern({
+        id: "c-propagated",
+        status: "open",
+        source: { record: "001-develop-a1", agent: "developer", item: "child-item" },
+        pendingResolution: {
+          action: "propagate",
+          note: "saga should own this",
+          by: "plan-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed epic child concern");
+
+    const result = await runStep({
+      task: "saga--epic-a",
+      taskDir: childTaskDir,
+      agent: "architect",
+      stepId: "architect-closeup-1",
+      stepFragment: "steps/architect-closeup",
+      data: {
+        iteration: 1,
+        status: "complete",
+        summary: "Plan complete",
+        concernConfirms: [{ id: "c-propagated", confirm: "accept" }],
+      },
+      promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
+    });
+    expect(result.ok).toBe(true);
+
+    const child = await readConcern("c-propagated", childTaskDir);
+    expect(child.pendingResolution).toBeUndefined();
+
+    const parentConcerns = path.join(parentTaskDir, "concerns");
+    const copies = fs.existsSync(parentConcerns)
+      ? fs.readdirSync(parentConcerns).filter((name) => name.startsWith("c-"))
+      : [];
+    expect(copies).toHaveLength(1);
+    const copy = await readYaml<StoredConcernArtifact>(
+      path.join(parentConcerns, copies[0]!)
+    );
+    expect(copy.summary).toBe("[epic] Concern c-propagated");
+    expect(copy.source.epic).toBe("epic-a");
+    expect(copy.status).toBe("open");
+  });
+
+  it("reject clears the pending resolution, preserving open status and disposition", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-rejected",
+        status: "open",
+        pendingResolution: {
+          action: "resolve",
+          by: "wave-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed pending reject");
+
+    const result = await architectCloseup("c-rejected", "reject");
+    expect(result.ok).toBe(true);
+
+    const stored = await readConcern("c-rejected");
+    expect(stored.status).toBe("open");
+    expect(stored.disposition).toBeUndefined();
+    expect(stored.pendingResolution).toBeUndefined();
+  });
+});
+
+describe("Close-up lifecycle: consult unblock", () => {
+  it("consult resolve unblocks the affected item on the next derive", async () => {
+    const itemDir = path.join(taskDir, "items", "blocked-item");
+    fs.mkdirSync(itemDir, { recursive: true });
+    fs.writeFileSync(
+      path.join(itemDir, "assignment.yaml"),
+      "slug: blocked-item\nkind: dev\ntitle: Blocked item\nassignment: Implement\nwave: 1\ndeps: []\n",
+      "utf8"
+    );
+    const blocker = storedConcern({
+      id: "c-blocker",
+      kind: "blocker",
+      summary: "Database migration pending",
+      severity: "high",
+      status: "routed",
+      affects: ["blocked-item"],
+      disposition: "architect",
+    });
+    await writeConcern(taskDir, blocker);
+    tmpRepo.commit("seed blocked item and concern");
+
+    const before = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(before.itemMap["blocked-item"]?.status).toBe("blocked");
+
+    const harness = new FakeHarness();
+    const label = `${TASK}/runs/consult-concern-c-blocker#a1`;
+    const output = {
+      decision: "continue",
+      rationale: "Migration is no longer required",
+      concernResolution: { id: "c-blocker", action: "resolve" },
+    };
+    harness.scriptOutcome(label, { ok: true, data: output });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: output });
+    harness.scriptComplete(() => output);
+
+    const res = await runConcernConsult({
+      task: TASK,
+      concern: blocker,
+      taskDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+    });
+    expect(res.decision?.concernResolution).toEqual({
+      id: "c-blocker",
+      action: "resolve",
+    });
+
+    const decisionPath = path.join(taskDir, "decisions", "concern-c-blocker.yaml");
+    expect(fs.existsSync(decisionPath)).toBe(true);
+    const decision = await readYaml<Record<string, unknown>>(decisionPath);
+    expect(decision.concernResolution).toEqual({
+      id: "c-blocker",
+      action: "resolve",
+    });
+
+    const stored = await readConcern("c-blocker");
+    expect(stored.status).toBe("resolved");
+    expect(stored.pendingResolution).toBeUndefined();
+
+    const after = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(after.itemMap["blocked-item"]?.status).toBe("pending");
+    expect(after.concerns.resolved).toBe(1);
+  });
+
+  it("ignores concernResolution from an item consult and journals the drop", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({ id: "c-cross-emitted", status: "open" })
+    );
+    tmpRepo.commit("seed cross-emission concern");
+
+    const result = await runStep({
+      agent: "architect",
+      stepId: "consult-item-guard",
+      stepFragment: "steps/architect-consult-item",
+      data: {
+        decision: "retry-with-guidance",
+        rationale: "Retry",
+        concernResolution: { id: "c-cross-emitted", action: "resolve" },
+      },
+      promptVars: {
+        item: "guard-item",
+        assignment: "work",
+        priorAttempts: "",
+        diff: "",
+        feedback: "",
+      },
+    });
+    expect(result.ok).toBe(true);
+
+    const stored = await readConcern("c-cross-emitted");
+    expect(stored.status).toBe("open");
+    expect(stored.pendingResolution).toBeUndefined();
+
+    const events = await readJournal(taskDir);
+    const ignored = events.filter(
+      (event) =>
+        event.type === "concern_resolution_ignored" &&
+        event.step === "consult-item-guard"
+    );
+    expect(ignored).toHaveLength(1);
+  });
+});
+
+describe("Close-up lifecycle: wave fallback", () => {
+  async function runWaveCloseup() {
+    return runStep({
+      agent: "wave-close-up",
+      stepId: "wave-close-up-1-1",
+      stepFragment: "steps/wave-close-up",
+      data: {
+        wave: 1,
+        iteration: 1,
+        status: "complete",
+        mergedItems: [],
+        summary: "Wave 1 complete",
+      },
+      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
+    });
+  }
+
+  it("falls back over triage-less open concerns and lists tech-debt as derived debt", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-debt",
+        kind: "tech-debt",
+        summary: "Duplicate helper",
+        status: "open",
+        source: { record: "001-develop-a1", agent: "developer", item: "simple" },
+      })
+    );
+    await writeConcern(
+      taskDir,
+      storedConcern({ id: "c-assumption", kind: "assumption", status: "open" })
+    );
+    await writeConcern(
+      taskDir,
+      storedConcern({ id: "c-risk", kind: "risk", status: "open" })
+    );
+    await writeConcern(
+      taskDir,
+      storedConcern({ id: "c-question", kind: "question", status: "open" })
+    );
+    // Pending proposals are owned by architect confirmation, not by fallback.
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-pending",
+        kind: "tech-debt",
+        status: "open",
+        pendingResolution: {
+          action: "resolve",
+          by: "plan-close-up",
+          at: "2026-01-01T00:00:01.000Z",
+        },
+      })
+    );
+    tmpRepo.commit("seed triage-less concerns");
+
+    const result = await runWaveCloseup();
+    expect(result.ok).toBe(true);
+
+    const debt = await readConcern("c-debt");
+    expect(debt.status).toBe("routed");
+    expect(debt.disposition).toBe("optional");
+
+    for (const id of ["c-assumption", "c-risk", "c-question"]) {
+      const routed = await readConcern(id);
+      expect(routed.status).toBe("routed");
+      expect(routed.disposition).toBe("architect");
+    }
+
+    const pending = await readConcern("c-pending");
+    expect(pending.status).toBe("open");
+    expect(pending.disposition).toBeUndefined();
+    expect(pending.pendingResolution?.action).toBe("resolve");
+
+    const all = await Promise.all(
+      ["c-debt", "c-assumption", "c-risk", "c-question", "c-pending"].map((id) =>
+        readConcern(id)
+      )
+    );
+    for (const concern of all) {
+      expect(concern.disposition?.startsWith("human-") ?? false).toBe(false);
+    }
+
+    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
+    expect(state.debt).toContain("[simple] Duplicate helper");
+  });
+
+  it("leaves blocker concerns open for explicit triage", async () => {
+    await writeConcern(
+      taskDir,
+      storedConcern({
+        id: "c-blocker-open",
+        kind: "blocker",
+        summary: "Needs explicit human/architect triage",
+        severity: "high",
+        status: "open",
+      })
+    );
+    // A triage-less non-blocker in the same pass proves the fallback ran while
+    // deliberately skipping the blocker.
+    await writeConcern(
+      taskDir,
+      storedConcern({ id: "c-risk-routed", kind: "risk", status: "open" })
+    );
+    tmpRepo.commit("seed triage-less blocker");
+
+    const result = await runWaveCloseup();
+    expect(result.ok).toBe(true);
+
+    const routedRisk = await readConcern("c-risk-routed");
+    expect(routedRisk.status).toBe("routed");
+    expect(routedRisk.disposition).toBe("architect");
+
+    const stored = await readConcern("c-blocker-open");
+    expect(stored.status).toBe("open");
+    expect(stored.disposition).toBeUndefined();
+  });
+});

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
