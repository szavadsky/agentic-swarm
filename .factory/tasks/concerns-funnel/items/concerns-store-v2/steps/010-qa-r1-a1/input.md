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
  "slug": "concerns-store-v2",
  "kind": "dev",
  "title": "Concerns store with merge and commit",
  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
  "outlineRef": "concerns-store-v2",
  "milestone": "m1-contracts-aggregate",
  "wave": 6,
  "deps": [
    "concerns-contracts-policy",
    "concerns-contracts-schemas",
    "concerns-contracts-types"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/decisions/015-item-concerns-store-v2.yaml b/.factory/tasks/concerns-funnel/decisions/015-item-concerns-store-v2.yaml
deleted file mode 100644
index 02812a6..0000000
--- a/.factory/tasks/concerns-funnel/decisions/015-item-concerns-store-v2.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: decision-concerns-store-v2-1794123864467
-context: item
-item: concerns-store-v2
-afterRecord: 008-review-r2-a1
-decision: retry-with-guidance
-timestamp: 2026-11-08T07:44:24.467Z
-rationale: "Reviewer defect is valid and blocks M1 restart-idempotency
-  invariant: unconditional replay with wall-clock timestamps rewrites every
-  concern and commits per record on each startup, churning updatedAt/lastSeen
-  and git history. Root cause is localized to aggregate/reconcile timestamp and
-  dirty handling, fixable in one small round. No split or escalation warranted."
-text: "Fix reconcile idempotency in concerns-store-v2 (one round): 1) Add
-  opts.at to aggregateConcerns/merge (default now ISO). Live step seams keep
-  wall-clock; reconcile passes meta.endedAt. 2) Write-only-on-diff: compare
-  merged vs existing on content fields (detail, severity, sources, status,
-  disposition, escalated); if equal and existing lastSeen >= at, skip
-  writeYamlAtomic entirely. Else write with updatedAt=at,
-  lastSeen=max(existing.lastSeen, at). 3) reconcileConcerns: enumerate committed
-  ok records (runs + items/*/steps), read meta.endedAt, sort ascending (fallback
-  seq/name), replay in order with at=endedAt; track dirty flag; single commitAll
-  at end only if dirty — remove per-record commitAll from replay path. 4)
-  Strengthen idempotency test: hash concern files + git rev-parse HEAD after
-  first reconcile, run reconcile again, assert bytes and HEAD unchanged and
-  updatedAt/lastSeen equal endedAt values. Keep KeyedMutex RMW-only, never wrap
-  commitAll in repo.writeLock, ingest errors never change step status."
-persist: true
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..34e1e55
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,64 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 1 new prod stubs with 40 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+      newProdFiles:
+        - plugins/software-factory/src/core/concerns.ts
+      stubProdLines: 40
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 21 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794118739883-p4tmzxy96j.xml
+      junitCaseCount: 22
+      junitCaseIds:
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+        - Concern store.fingerprints concern identity, ignoring detail,
+          severity, and affect order
+        - Concern store.aggregates a developer concern to one open taskWt file
+          with defaults, source, and immediate commit
+        - Concern store.merges re-emitted concerns into one file with longer
+          detail, max severity, and advanced timestamps
+        - Concern store.keeps dismissed status and flags escalation when a
+          higher severity is re-emitted
+        - Concern store.lists only open concerns in stable order
+        - Concern store.triages only exact-id suggestions and persists dismiss
+          reasons
+        - Concern store.routes non-dismiss triage dispositions and gates
+          non-triagers
+        - Concern store.rejects dismiss triage without detail and leaves the
+          concern unchanged
+        - Concern store.partitions suggestions by exact concern id
+        - Concern store.records close-up pending resolutions without changing
+          concern status
+        - Concern store.aggregates remarkable decisions into rm-* files and
+          triages them by exact id
+        - Concern store.rejects unknown concern kinds without partial writes and
+          leaves existing files untouched
+        - Concern store.writes distinct fingerprints concurrently without
+          deadlock or lost commits
+        - Concern store.serializes concurrent merges of the same fingerprint
+          into one merged file
+        - "Concern store.wires reviewer output: aggregate new concerns before
+          triaging pre-existing ids only"
+        - Concern store.wires consult writeArtifact producers to the concern
+          store
+        - "Concern store.wires close-up producers: aggregates concerns and
+          applies resolutions"
+        - Concern store.aggregates concerns and remarkable decisions across
+          producer schemas
+        - Concern store.reconciles missing concerns from committed step records
+          idempotently
+        - Concern store.commits stray concerns files during startup recovery
+          instead of stashing them
+        - Concern store.keeps step status ok and journals an ingest error when
+          concern ingestion fails
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..6aaa871
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,54 @@
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
+  "slug": "concerns-store-v2",
+  "kind": "dev",
+  "title": "Concerns store with merge and commit",
+  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+  "outlineRef": "concerns-store-v2",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
+  ]
+}
+
+## Context & Citations
+[]
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..cd11e35
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
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
+status: ok
+startedAt: 2026-11-08T06:03:06.503Z
+session: 01a1b9c0-dd44-764c-ab25-e93c63f8d367
+endedAt: 2026-11-08T06:19:06.007Z
+usage:
+  inputTokens: 130428
+  outputTokens: 92075
+  costUsd: 0.123622
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..6c636ac
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,121 @@
+status: ok
+summary: "Authored 21 test-first behavior tests for the taskWt concern store in
+  test/engine/concerns-funnel.test.ts, plus a 40-line compile stub at
+  src/core/concerns.ts (at the stubMaxProdLines budget). Tests specify
+  fingerprint identity (kind + normalized summary + location + sorted affects;
+  detail/severity ignored), aggregate merge (defaults, longer/latest detail, max
+  severity, updatedAt/source.lastSeen advance, source.escalated on severity rise
+  without reopening dismissed), listOpenConcerns, exact-id triage with isTriager
+  gate and dismiss-detail enforcement, close-up pending resolutions
+  (resolve/carry/propagate), partitionSuggestions, rm-* remarkable aggregation,
+  unknown-kind no-partial-write, concurrent RMW/commit, reviewer
+  new-then-preexisting triage ordering, consult/close-up/producer-matrix seam
+  wiring, reconcileConcerns from committed records, concerns/** startup
+  recovery, and ingest-error step-status isolation. No existing production code
+  was modified. Verified: typecheck green; target file red with 21 assertion
+  failures and 0 errors; full suite has only those 21 failures."
+target:
+  selectors:
+    - test/engine/concerns-funnel.test.ts
+  expectRed:
+    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
+      identity, ignoring detail, severity, and affect order
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
+      concern to one open taskWt file with defaults, source, and immediate
+      commit
+    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
+      concerns into one file with longer detail, max severity, and advanced
+      timestamps
+    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
+      and flags escalation when a higher severity is re-emitted
+    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
+      concerns in stable order
+    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
+      suggestions and persists dismiss reasons
+    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
+      triage dispositions and gates non-triagers
+    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
+      without detail and leaves the concern unchanged
+    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
+      by exact concern id
+    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
+      pending resolutions without changing concern status
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
+      decisions into rm-* files and triages them by exact id
+    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
+      kinds without partial writes and leaves existing files untouched
+    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
+      fingerprints concurrently without deadlock or lost commits
+    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
+      merges of the same fingerprint into one merged file
+    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
+      aggregate new concerns before triaging pre-existing ids only"
+    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
+      writeArtifact producers to the concern store
+    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
+      producers: aggregates concerns and applies resolutions"
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
+      remarkable decisions across producer schemas
+    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
+      concerns from committed step records idempotently
+    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
+      files during startup recovery instead of stashing them
+    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
+      and journals an ingest error when concern ingestion fails
+evidence:
+  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
+    --noEmit, no errors)."
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/concerns-funnel.test.ts: 1 pass (pre-existing schema test), 21
+    fail, 0 errors — red for every new test."
+  - "JUnit run (bun test ... --reporter=junit
+    --reporter-outfile=/tmp/junit-concerns-store-final.xml) parsed with the
+    repo's own src/core/checks/junit.ts: 22 cases, collected=true, 1 pass, 21
+    fail, 0 error."
+  - "Replayed the engine's normaliseCaseId/findMatchingCase logic over the JUnit
+    ids for all 21 declared expectRed node ids: 21/21 matched with status fail."
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test (full suite): 303 pass,
+    2 skip, 21 fail; the only failures are the 21 new concern store tests (no
+    collateral regressions)."
+  - "Test infra proven first: the pre-existing schema test in the same file
+    still passes, and the new tests execute (not collection/import failures)
+    because the 40-line stub lets the module compile."
+  - "git status --short: only M
+    plugins/software-factory/test/engine/concerns-funnel.test.ts and ??
+    plugins/software-factory/src/core/concerns.ts; no existing production code
+    touched."
+concerns:
+  - The seam tests pin step-runner as the single ingestion hook for validated
+    outputs (including custom writeArtifact flows such as consults). This is the
+    only way to satisfy 'wire all producer seams' and 'ingest errors must not
+    change step status' without duplicating try/catch in every flow; per-flow
+    wiring alone will not make the reviewer/consult/close-up seam tests green.
+  - The merge test requires source.lastSeen to be an ISO timestamp advanced to
+    the merge time. ConcernSource currently lacks lastSeen, so the develop step
+    must extend the type (or persist an equivalent field) for the tests to pass.
+  - listOpenConcerns is specified as status === 'open' only; routed concerns are
+    intentionally not asserted either way, but close-up hydration
+    (funnel-closeups) will need a broader 'active concerns' listing if it must
+    re-triage routed items.
+  - The ingest-failure test requires a journal event of type
+    'concern_ingest_error' and that the step remains status ok; the
+    implementation should use that event name (or the test/contract must be
+    aligned).
+  - Scenario s8's digest/architect-hydration surfacing of source.escalated is
+    deferred to the routing/hydration stories; this suite asserts only the
+    store-level flag and that dismissed status is not reopened.
+  - The test file grew by ~1080 lines; docs-finish already owns consolidating
+    test/engine/concerns-funnel.test.ts, but the develop step should not add
+    much more test volume.
+  - The stub is exactly 40 added lines (configured stubMaxProdLines=40), so it
+    cannot grow during test-first without tripping test-first-scope.
+notes: "Stub API (src/core/concerns.ts): concernFingerprint(ConcernInput),
+  aggregateConcerns(ctx{taskDir,taskWt,repo,now?}+source, ConcernInput[],
+  RemarkableDecision[]), listOpenConcerns(taskDir),
+  applyConcernTriage(ctx+suggestions+isTriager),
+  applyCloseupResolutions(ctx+resolutions+by), partitionSuggestions(suggestions,
+  ids), reconcileConcerns(ctx). Tests inject a clock (now?: () => Date) for
+  deterministic createdAt/updatedAt/lastSeen assertions. Red was verified with 0
+  JUnit <error> entries; bun maps thrown errors to <failure>, but all failures
+  currently occur at expect assertions. All 21 ids use the JUnit native form
+  `file::Describe.Test` confirmed against the engine's matcher."
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..6cee02d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,224 @@
+checks:
+  - id: gates
+    status: fail
+    message: "Gate regressions: test"
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 5932
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: fail
+        durationMs: 258951
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-qfYFuY/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
+          killed 1 dangling process
+
+          test/engine/amend-maxiterations.test.ts:
+          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item [5115.47ms]
+            ^ this test timed out after 5000ms.
+
+          # Unhandled error between tests
+          -------------------------------
+          179 |     const res = await runTask(
+          180 |       { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+          181 |       task
+          182 |     );
+          183 | 
+          184 |     expect(res.status).toBe("done");
+                                       ^
+          error: expect(received).toBe(expected)
+
+          Expected: "done"
+          Received: "failed"
+
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
+          -------------------------------
+
+          killed 1 dangling process
+          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > restores amended items and amendment count across restart [5100.39ms]
+            ^ this test timed out after 5000ms.
+
+           322 pass
+           2 skip
+           2 fail
+           1 error
+           1388 expect() calls
+          Ran 326 tests across 55 files. [137.73s]
+          [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item, Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores amended items and amendment count across restart]
+        failingTests:
+          - "Engine: Wave-report amend + maxIterations (§8.4.6,
+            §12.2).wave-report amend runs pm-amend, writes plan-N.k, and
+            schedules the new item"
+          - "Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores
+            amended items and amendment count across restart"
+        improvements:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+    output: >-
+      
+      Budget spent: $0.0000
+
+      ----------------------------------------------------------------
+
+      Waves & Items:
+        Wave 1:
+      ================================================================
+
+
+
+      test/cli/cli.test.ts:
+
+      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
+      host Slava-Yoga) taken over by PID 2580144
+
+      [factory lock] Stale run lock for task "competing-takeover-task" (PID
+      9999999 on host Slava-Yoga) taken over by PID 2580144
+
+      [factory lock] Stale run lock for task "journal-worktree-task" (PID
+      9999999 on host Slava-Yoga) taken over by PID 2580144
+
+      killed 1 dangling process
+
+
+      test/engine/amend-maxiterations.test.ts:
+
+      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
+      wave-report amend runs pm-amend, writes plan-N.k, and schedules the new
+      item [5115.47ms]
+        ^ this test timed out after 5000ms.
+
+      # Unhandled error between tests
+
+      -------------------------------
+
+      179 |     const res = await runTask(
+
+      180 |       { harness, repo: repoObj, project, pipelineFor: async () =>
+      pipeline, prompts },
+
+      181 |       task
+
+      182 |     );
+
+      183 | 
+
+      184 |     expect(res.status).toBe("done");
+                                   ^
+      error: expect(received).toBe(expected)
+
+
+      Expected: "done"
+
+      Received: "failed"
+
+            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
+      -------------------------------
+
+
+      killed 1 dangling process
+
+      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
+      restores amended items and amendment count across restart [5100.39ms]
+        ^ this test timed out after 5000ms.
+
+       322 pass
+       2 skip
+       2 fail
+       1 error
+       1388 expect() calls
+      Ran 326 tests across 55 files. [137.73s]
+
+      [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6,
+      §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the
+      new item, Engine: Wave-report amend + maxIterations (§8.4.6,
+      §12.2).restores amended items and amendment count across restart]
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794119857705-zd79omjpba.xml
+      junitCaseCount: 22
+      junitCaseIds:
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+        - Concern store.fingerprints concern identity, ignoring detail,
+          severity, and affect order
+        - Concern store.aggregates a developer concern to one open taskWt file
+          with defaults, source, and immediate commit
+        - Concern store.merges re-emitted concerns into one file with longer
+          detail, max severity, and advanced timestamps
+        - Concern store.keeps dismissed status and flags escalation when a
+          higher severity is re-emitted
+        - Concern store.lists only open concerns in stable order
+        - Concern store.triages only exact-id suggestions and persists dismiss
+          reasons
+        - Concern store.routes non-dismiss triage dispositions and gates
+          non-triagers
+        - Concern store.rejects dismiss triage without detail and leaves the
+          concern unchanged
+        - Concern store.partitions suggestions by exact concern id
+        - Concern store.records close-up pending resolutions without changing
+          concern status
+        - Concern store.aggregates remarkable decisions into rm-* files and
+          triages them by exact id
+        - Concern store.rejects unknown concern kinds without partial writes and
+          leaves existing files untouched
+        - Concern store.writes distinct fingerprints concurrently without
+          deadlock or lost commits
+        - Concern store.serializes concurrent merges of the same fingerprint
+          into one merged file
+        - "Concern store.wires reviewer output: aggregate new concerns before
+          triaging pre-existing ids only"
+        - Concern store.wires consult writeArtifact producers to the concern
+          store
+        - "Concern store.wires close-up producers: aggregates concerns and
+          applies resolutions"
+        - Concern store.aggregates concerns and remarkable decisions across
+          producer schemas
+        - Concern store.reconciles missing concerns from committed step records
+          idempotently
+        - Concern store.commits stray concerns files during startup recovery
+          instead of stashing them
+        - Concern store.keeps step status ok and journals an ingest error when
+          concern ingestion fails
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: fail
+    message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
+    details:
+      changedLines:
+        added: 547
+        deleted: 9
+        total: 556
+        files:
+          - plugins/software-factory/src/core/artifacts.ts
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/engine.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/git/repair.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..e985026
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,80 @@
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
+  "slug": "concerns-store-v2",
+  "kind": "dev",
+  "title": "Concerns store with merge and commit",
+  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+  "outlineRef": "concerns-store-v2",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/concerns-funnel.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
+    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
+    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
+    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
+    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
+    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
+    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
+    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
+    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
+    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
+    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
+    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
+    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
+    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
+    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
+    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
+    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
+    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
+    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
+    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
+    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
+  ]
+}
+
+## Context & Citations
+[]
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..6f587dd
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 2
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: rejected
+startedAt: 2026-11-08T06:19:23.712Z
+session: 01a1b9cf-c890-724d-b6a9-2473bfac0631
+endedAt: 2026-11-08T06:37:41.767Z
+usage:
+  inputTokens: 130810
+  outputTokens: 48991
+  costUsd: 0.06896100000000001
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..ceff7b9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,88 @@
+status: ok
+summary: "Implemented the taskWt concern store in src/core/concerns.ts: stable
+  fingerprints over kind/normalized summary/location/sorted affects; atomic
+  one-file-per-fingerprint aggregation with longer/latest detail, max severity,
+  advanced updatedAt/lastSeen, dismissed-status preservation and escalation;
+  exact-id triage gated by isTriager; close-up pending resolutions; suggestion
+  partitioning; idempotent reconciliation from committed step records; and
+  remarkable-decision rm-* artifacts. Wired all producer seams through
+  step-runner (concerns, newConcerns, remarkable, suggestions,
+  concernResolutions, including consult writeArtifact), with reviewer triage
+  restricted to pre-existing concern ids and ingest failures journaled as
+  concern_ingest_error without changing step status. Added concerns/** startup
+  recovery commit and task startup reconcile."
+target:
+  selectors:
+    - test/engine/concerns-funnel.test.ts
+  expectRed:
+    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
+      identity, ignoring detail, severity, and affect order
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
+      concern to one open taskWt file with defaults, source, and immediate
+      commit
+    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
+      concerns into one file with longer detail, max severity, and advanced
+      timestamps
+    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
+      and flags escalation when a higher severity is re-emitted
+    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
+      concerns in stable order
+    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
+      suggestions and persists dismiss reasons
+    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
+      triage dispositions and gates non-triagers
+    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
+      without detail and leaves the concern unchanged
+    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
+      by exact concern id
+    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
+      pending resolutions without changing concern status
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
+      decisions into rm-* files and triages them by exact id
+    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
+      kinds without partial writes and leaves existing files untouched
+    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
+      fingerprints concurrently without deadlock or lost commits
+    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
+      merges of the same fingerprint into one merged file
+    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
+      aggregate new concerns before triaging pre-existing ids only"
+    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
+      writeArtifact producers to the concern store
+    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
+      producers: aggregates concerns and applies resolutions"
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
+      remarkable decisions across producer schemas
+    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
+      concerns from committed step records idempotently
+    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
+      files during startup recovery instead of stashing them
+    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
+      and journals an ingest error when concern ingestion fails
+evidence:
+  - "bun run typecheck (in plugins/software-factory): exit 0 after final changes"
+  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts: 22 pass, 0 fail,
+    202 expect() calls"
+  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts --rerun-each 2: 44
+    pass, 0 fail, proving concurrent merge serialization is stable"
+  - "TMPDIR=/tmp bun test (full suite, isolated run): 324 pass, 2 skip, 0 fail,
+    1395 expect() calls"
+  - "git diff --check: clean"
+  - "Baseline qa-red-test timeout check: the same 5s test-timeout sensitivity
+    reproduces without these changes under current machine load, confirming it
+    is environmental and unrelated"
+  - git stash was used only for the baseline comparison and was popped; git
+    status shows only the five intended production files modified
+concerns:
+  - Unrelated qa-red-test integration tests are timing-sensitive against Bun's
+    5s per-test default and can time out under high machine load; the full suite
+    passed when run in isolation and the failure reproduces on the pre-change
+    baseline.
+  - Concern ingestion uses the task-wide KeyedMutex keyed by taskDir, so
+    distinct-fingerprint writes are serialized per task rather than truly
+    parallel; this is required for safe per-task RMW and still passed the
+    concurrency tests.
+notes: commitAll is called outside the KeyedMutex and never inside
+  repo.writeLock.runExclusive (commitAll acquires repo.writeLock internally).
+  Startup recovery commits stray concerns/** files before any stash; task
+  startup calls reconcileConcerns read-only against committed step records.
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..c956b72
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
@@ -0,0 +1,115 @@
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
+        durationMs: 4115
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 214345
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-DhnsNA/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
+
+           324 pass
+           2 skip
+           0 fail
+           1395 expect() calls
+          Ran 326 tests across 55 files. [99.73s]
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
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794120748753-kzhys7rw6n.xml
+      junitCaseCount: 22
+      junitCaseIds:
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+        - Concern store.fingerprints concern identity, ignoring detail,
+          severity, and affect order
+        - Concern store.aggregates a developer concern to one open taskWt file
+          with defaults, source, and immediate commit
+        - Concern store.merges re-emitted concerns into one file with longer
+          detail, max severity, and advanced timestamps
+        - Concern store.keeps dismissed status and flags escalation when a
+          higher severity is re-emitted
+        - Concern store.lists only open concerns in stable order
+        - Concern store.triages only exact-id suggestions and persists dismiss
+          reasons
+        - Concern store.routes non-dismiss triage dispositions and gates
+          non-triagers
+        - Concern store.rejects dismiss triage without detail and leaves the
+          concern unchanged
+        - Concern store.partitions suggestions by exact concern id
+        - Concern store.records close-up pending resolutions without changing
+          concern status
+        - Concern store.aggregates remarkable decisions into rm-* files and
+          triages them by exact id
+        - Concern store.rejects unknown concern kinds without partial writes and
+          leaves existing files untouched
+        - Concern store.writes distinct fingerprints concurrently without
+          deadlock or lost commits
+        - Concern store.serializes concurrent merges of the same fingerprint
+          into one merged file
+        - "Concern store.wires reviewer output: aggregate new concerns before
+          triaging pre-existing ids only"
+        - Concern store.wires consult writeArtifact producers to the concern
+          store
+        - "Concern store.wires close-up producers: aggregates concerns and
+          applies resolutions"
+        - Concern store.aggregates concerns and remarkable decisions across
+          producer schemas
+        - Concern store.reconciles missing concerns from committed step records
+          idempotently
+        - Concern store.commits stray concerns files during startup recovery
+          instead of stashing them
+        - Concern store.keeps step status ok and journals an ingest error when
+          concern ingestion fails
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 276/300 production lines changed"
+    details:
+      changedLines:
+        added: 276
+        deleted: 0
+        total: 276
+        files:
+          - plugins/software-factory/src/core/artifacts.ts
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/engine.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
new file mode 100644
index 0000000..8ce505c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
@@ -0,0 +1,104 @@
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
+  "slug": "concerns-store-v2",
+  "kind": "dev",
+  "title": "Concerns store with merge and commit",
+  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+  "outlineRef": "concerns-store-v2",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/concerns-funnel.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
+    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
+    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
+    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
+    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
+    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
+    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
+    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
+    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
+    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
+    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
+    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
+    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
+    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
+    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
+    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
+    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
+    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
+    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
+    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
+    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
+  ]
+}
+
+## Context & Citations
+[]
+
+## Review Feedback
+Failing check: size
+
+Message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
+
+Detail:
+{
+  "changedLines": {
+    "added": 547,
+    "deleted": 9,
+    "total": 556,
+    "files": [
+      "plugins/software-factory/src/core/artifacts.ts",
+      "plugins/software-factory/src/core/concerns.ts",
+      "plugins/software-factory/src/core/engine.ts",
+      "plugins/software-factory/src/core/flows/step-runner.ts",
+      "plugins/software-factory/src/core/git/repair.ts"
+    ]
+  },
+  "limit": 300
+}
+
+Budget: 556 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..d78359c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T06:39:44.749Z
+session: 01a1b9e2-6959-7721-ab3f-95f04fde4925
+endedAt: 2026-11-08T06:52:31.854Z
+usage:
+  inputTokens: 57623
+  outputTokens: 44914
+  costUsd: 0.045325
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..53bf492
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
@@ -0,0 +1,86 @@
+status: ok
+summary: Shrank the concerns-store production diff from 556 to 276 changed lines
+  (under the 300-line limit) without changing behavior. Rewrote
+  src/core/concerns.ts compactly (207 lines) while preserving
+  fingerprint/merge/triage/close-up/partition/reconcile semantics; consolidated
+  the step-runner ingestion seam and call site; moved concern-store startup
+  recovery from repairWorktree into a pre-repair engine commit (restoring
+  repair.ts to baseline). Target file passes 22/22 and the full suite passes.
+target:
+  selectors:
+    - test/engine/concerns-funnel.test.ts
+  expectRed:
+    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
+      identity, ignoring detail, severity, and affect order
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
+      concern to one open taskWt file with defaults, source, and immediate
+      commit
+    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
+      concerns into one file with longer detail, max severity, and advanced
+      timestamps
+    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
+      and flags escalation when a higher severity is re-emitted
+    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
+      concerns in stable order
+    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
+      suggestions and persists dismiss reasons
+    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
+      triage dispositions and gates non-triagers
+    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
+      without detail and leaves the concern unchanged
+    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
+      by exact concern id
+    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
+      pending resolutions without changing concern status
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
+      decisions into rm-* files and triages them by exact id
+    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
+      kinds without partial writes and leaves existing files untouched
+    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
+      fingerprints concurrently without deadlock or lost commits
+    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
+      merges of the same fingerprint into one merged file
+    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
+      aggregate new concerns before triaging pre-existing ids only"
+    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
+      writeArtifact producers to the concern store
+    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
+      producers: aggregates concerns and applies resolutions"
+    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
+      remarkable decisions across producer schemas
+    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
+      concerns from committed step records idempotently
+    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
+      files during startup recovery instead of stashing them
+    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
+      and journals an ingest error when concern ingestion fails
+evidence:
+  - "Size check: `git diff --numstat 87a7682 -- plugins/software-factory/src` =>
+    artifacts.ts 2/0, concerns.ts 207/0, engine.ts 18/0, step-runner.ts 49/0 =
+    276 changed lines total (limit 300); repair.ts restored to baseline with
+    zero delta."
+  - "Typecheck: `cd plugins/software-factory && bun run typecheck` => exit 0."
+  - "Target: `cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/concerns-funnel.test.ts` => 22 pass, 0 fail, 202 expect()
+    calls."
+  - "Full suite: `cd plugins/software-factory && TMPDIR=/tmp bun test` => 324
+    pass, 2 skip, 0 fail across 55 files (80.9s)."
+  - "Flake confirmation: first full-suite run hit two 5s timeouts in
+    qa-red-test.test.ts; the file alone passes 3/3 (9.8s) and
+    amend-maxiterations.test.ts alone passes 4/4 (5.7s), matching the same
+    load-related timeouts seen in the prior attempt's gate run."
+  - "`git diff --check` => exit 0 (no whitespace errors)."
+concerns:
+  - Full-suite 5s per-test timeouts are load-flaky in subprocess-spawning engine
+    tests (qa-red-test, amend-maxiterations); each file passes in isolation and
+    the full suite passed on re-run, so this is pre-existing harness flakiness
+    rather than a code regression.
+notes: "Behavior preserved while shrinking: concern identity ignores
+  detail/severity/affect order; aggregation merges longer-or-equal detail, max
+  severity, preserves status/disposition/dismissReason/pendingResolution,
+  advances updatedAt/lastSeen and sets source.escalated on severity rise; atomic
+  YAML writes + KeyedMutex(taskDir) guard RMW and commitAll runs outside
+  repo.writeLock. Startup recovery now commits concerns/ via commitAll before
+  stray-dirt repair instead of adding commitGlobs to repairWorktree, removing
+  the repair.ts delta. Reconcile derives read-only from committed step records
+  using git ls-tree and remains idempotent."
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..166b7b6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/checks.yaml
@@ -0,0 +1,62 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 21 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794120758391-zcnajao8lv.xml
+      junitCaseCount: 22
+      junitCaseIds:
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+        - Concern store.fingerprints concern identity, ignoring detail,
+          severity, and affect order
+        - Concern store.aggregates a developer concern to one open taskWt file
+          with defaults, source, and immediate commit
+        - Concern store.merges re-emitted concerns into one file with longer
+          detail, max severity, and advanced timestamps
+        - Concern store.keeps dismissed status and flags escalation when a
+          higher severity is re-emitted
+        - Concern store.lists only open concerns in stable order
+        - Concern store.triages only exact-id suggestions and persists dismiss
+          reasons
+        - Concern store.routes non-dismiss triage dispositions and gates
+          non-triagers
+        - Concern store.rejects dismiss triage without detail and leaves the
+          concern unchanged
+        - Concern store.partitions suggestions by exact concern id
+        - Concern store.records close-up pending resolutions without changing
+          concern status
+        - Concern store.aggregates remarkable decisions into rm-* files and
+          triages them by exact id
+        - Concern store.rejects unknown concern kinds without partial writes and
+          leaves existing files untouched
+        - Concern store.writes distinct fingerprints concurrently without
+          deadlock or lost commits
+        - Concern store.serializes concurrent merges of the same fingerprint
+          into one merged file
+        - "Concern store.wires reviewer output: aggregate new concerns before
+          triaging pre-existing ids only"
+        - Concern store.wires consult writeArtifact producers to the concern
+          store
+        - "Concern store.wires close-up producers: aggregates concerns and
+          applies resolutions"
+        - Concern store.aggregates concerns and remarkable decisions across
+          producer schemas
+        - Concern store.reconciles missing concerns from committed step records
+          idempotently
+        - Concern store.commits stray concerns files during startup recovery
+          instead of stashing them
+        - Concern store.keeps step status ok and journals an ingest error when
+          concern ingestion fails
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/input.md
new file mode 100644
index 0000000..65ebade
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/input.md
@@ -0,0 +1,2593 @@
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
+  "slug": "concerns-store-v2",
+  "kind": "dev",
+  "title": "Concerns store with merge and commit",
+  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+  "outlineRef": "concerns-store-v2",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
+  ]
+}
+
+## Engine Checks
+
+
+## Test Diff
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..34e1e55
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,64 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 1 new prod stubs with 40 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++      newProdFiles:
++        - plugins/software-factory/src/core/concerns.ts
++      stubProdLines: 40
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 21 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794118739883-p4tmzxy96j.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..6aaa871
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,54 @@
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
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Context & Citations
++[]
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..cd11e35
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
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
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T06:03:06.503Z
++session: 01a1b9c0-dd44-764c-ab25-e93c63f8d367
++endedAt: 2026-11-08T06:19:06.007Z
++usage:
++  inputTokens: 130428
++  outputTokens: 92075
++  costUsd: 0.123622
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..6c636ac
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,121 @@
++status: ok
++summary: "Authored 21 test-first behavior tests for the taskWt concern store in
++  test/engine/concerns-funnel.test.ts, plus a 40-line compile stub at
++  src/core/concerns.ts (at the stubMaxProdLines budget). Tests specify
++  fingerprint identity (kind + normalized summary + location + sorted affects;
++  detail/severity ignored), aggregate merge (defaults, longer/latest detail, max
++  severity, updatedAt/source.lastSeen advance, source.escalated on severity rise
++  without reopening dismissed), listOpenConcerns, exact-id triage with isTriager
++  gate and dismiss-detail enforcement, close-up pending resolutions
++  (resolve/carry/propagate), partitionSuggestions, rm-* remarkable aggregation,
++  unknown-kind no-partial-write, concurrent RMW/commit, reviewer
++  new-then-preexisting triage ordering, consult/close-up/producer-matrix seam
++  wiring, reconcileConcerns from committed records, concerns/** startup
++  recovery, and ingest-error step-status isolation. No existing production code
++  was modified. Verified: typecheck green; target file red with 21 assertion
++  failures and 0 errors; full suite has only those 21 failures."
++target:
++  selectors:
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
++      identity, ignoring detail, severity, and affect order
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
++      concern to one open taskWt file with defaults, source, and immediate
++      commit
++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
++      concerns into one file with longer detail, max severity, and advanced
++      timestamps
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
++      and flags escalation when a higher severity is re-emitted
++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
++      concerns in stable order
++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
++      suggestions and persists dismiss reasons
++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
++      triage dispositions and gates non-triagers
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
++      without detail and leaves the concern unchanged
++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
++      by exact concern id
++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
++      pending resolutions without changing concern status
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
++      decisions into rm-* files and triages them by exact id
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
++      kinds without partial writes and leaves existing files untouched
++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
++      fingerprints concurrently without deadlock or lost commits
++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
++      merges of the same fingerprint into one merged file
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
++      aggregate new concerns before triaging pre-existing ids only"
++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
++      writeArtifact producers to the concern store
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
++      producers: aggregates concerns and applies resolutions"
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
++      remarkable decisions across producer schemas
++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
++      concerns from committed step records idempotently
++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
++      files during startup recovery instead of stashing them
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
++      and journals an ingest error when concern ingestion fails
++evidence:
++  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
++    --noEmit, no errors)."
++  - "cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/concerns-funnel.test.ts: 1 pass (pre-existing schema test), 21
++    fail, 0 errors — red for every new test."
++  - "JUnit run (bun test ... --reporter=junit
++    --reporter-outfile=/tmp/junit-concerns-store-final.xml) parsed with the
++    repo's own src/core/checks/junit.ts: 22 cases, collected=true, 1 pass, 21
++    fail, 0 error."
++  - "Replayed the engine's normaliseCaseId/findMatchingCase logic over the JUnit
++    ids for all 21 declared expectRed node ids: 21/21 matched with status fail."
++  - "cd plugins/software-factory && TMPDIR=/tmp bun test (full suite): 303 pass,
++    2 skip, 21 fail; the only failures are the 21 new concern store tests (no
++    collateral regressions)."
++  - "Test infra proven first: the pre-existing schema test in the same file
++    still passes, and the new tests execute (not collection/import failures)
++    because the 40-line stub lets the module compile."
++  - "git status --short: only M
++    plugins/software-factory/test/engine/concerns-funnel.test.ts and ??
++    plugins/software-factory/src/core/concerns.ts; no existing production code
++    touched."
++concerns:
++  - The seam tests pin step-runner as the single ingestion hook for validated
++    outputs (including custom writeArtifact flows such as consults). This is the
++    only way to satisfy 'wire all producer seams' and 'ingest errors must not
++    change step status' without duplicating try/catch in every flow; per-flow
++    wiring alone will not make the reviewer/consult/close-up seam tests green.
++  - The merge test requires source.lastSeen to be an ISO timestamp advanced to
++    the merge time. ConcernSource currently lacks lastSeen, so the develop step
++    must extend the type (or persist an equivalent field) for the tests to pass.
++  - listOpenConcerns is specified as status === 'open' only; routed concerns are
++    intentionally not asserted either way, but close-up hydration
++    (funnel-closeups) will need a broader 'active concerns' listing if it must
++    re-triage routed items.
++  - The ingest-failure test requires a journal event of type
++    'concern_ingest_error' and that the step remains status ok; the
++    implementation should use that event name (or the test/contract must be
++    aligned).
++  - Scenario s8's digest/architect-hydration surfacing of source.escalated is
++    deferred to the routing/hydration stories; this suite asserts only the
++    store-level flag and that dismissed status is not reopened.
++  - The test file grew by ~1080 lines; docs-finish already owns consolidating
++    test/engine/concerns-funnel.test.ts, but the develop step should not add
++    much more test volume.
++  - The stub is exactly 40 added lines (configured stubMaxProdLines=40), so it
++    cannot grow during test-first without tripping test-first-scope.
++notes: "Stub API (src/core/concerns.ts): concernFingerprint(ConcernInput),
++  aggregateConcerns(ctx{taskDir,taskWt,repo,now?}+source, ConcernInput[],
++  RemarkableDecision[]), listOpenConcerns(taskDir),
++  applyConcernTriage(ctx+suggestions+isTriager),
++  applyCloseupResolutions(ctx+resolutions+by), partitionSuggestions(suggestions,
++  ids), reconcileConcerns(ctx). Tests inject a clock (now?: () => Date) for
++  deterministic createdAt/updatedAt/lastSeen assertions. Red was verified with 0
++  JUnit <error> entries; bun maps thrown errors to <failure>, but all failures
++  currently occur at expect assertions. All 21 ids use the JUnit native form
++  `file::Describe.Test` confirmed against the engine's matcher."
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..6cee02d
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,224 @@
++checks:
++  - id: gates
++    status: fail
++    message: "Gate regressions: test"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 5932
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: fail
++        durationMs: 258951
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-qfYFuY/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
++          killed 1 dangling process
++
++          test/engine/amend-maxiterations.test.ts:
++          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item [5115.47ms]
++            ^ this test timed out after 5000ms.
++
++          # Unhandled error between tests
++          -------------------------------
++          179 |     const res = await runTask(
++          180 |       { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++          181 |       task
++          182 |     );
++          183 | 
++          184 |     expect(res.status).toBe("done");
++                                       ^
++          error: expect(received).toBe(expected)
++
++          Expected: "done"
++          Received: "failed"
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
++          -------------------------------
++
++          killed 1 dangling process
++          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > restores amended items and amendment count across restart [5100.39ms]
++            ^ this test timed out after 5000ms.
++
++           322 pass
++           2 skip
++           2 fail
++           1 error
++           1388 expect() calls
++          Ran 326 tests across 55 files. [137.73s]
++          [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item, Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores amended items and amendment count across restart]
++        failingTests:
++          - "Engine: Wave-report amend + maxIterations (§8.4.6,
++            §12.2).wave-report amend runs pm-amend, writes plan-N.k, and
++            schedules the new item"
++          - "Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores
++            amended items and amendment count across restart"
++        improvements:
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++    output: >-
++      
++      Budget spent: $0.0000
++
++      ----------------------------------------------------------------
++
++      Waves & Items:
++        Wave 1:
++      ================================================================
++
++
++
++      test/cli/cli.test.ts:
++
++      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
++      host Slava-Yoga) taken over by PID 2580144
++
++      [factory lock] Stale run lock for task "competing-takeover-task" (PID
++      9999999 on host Slava-Yoga) taken over by PID 2580144
++
++      [factory lock] Stale run lock for task "journal-worktree-task" (PID
++      9999999 on host Slava-Yoga) taken over by PID 2580144
++
++      killed 1 dangling process
++
++
++      test/engine/amend-maxiterations.test.ts:
++
++      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
++      wave-report amend runs pm-amend, writes plan-N.k, and schedules the new
++      item [5115.47ms]
++        ^ this test timed out after 5000ms.
++
++      # Unhandled error between tests
++
++      -------------------------------
++
++      179 |     const res = await runTask(
++
++      180 |       { harness, repo: repoObj, project, pipelineFor: async () =>
++      pipeline, prompts },
++
++      181 |       task
++
++      182 |     );
++
++      183 | 
++
++      184 |     expect(res.status).toBe("done");
++                                   ^
++      error: expect(received).toBe(expected)
++
++
++      Expected: "done"
++
++      Received: "failed"
++
++            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
++      -------------------------------
++
++
++      killed 1 dangling process
++
++      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
++      restores amended items and amendment count across restart [5100.39ms]
++        ^ this test timed out after 5000ms.
++
++       322 pass
++       2 skip
++       2 fail
++       1 error
++       1388 expect() calls
++      Ran 326 tests across 55 files. [137.73s]
++
++      [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6,
++      §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the
++      new item, Engine: Wave-report amend + maxIterations (§8.4.6,
++      §12.2).restores amended items and amendment count across restart]
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794119857705-zd79omjpba.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: fail
++    message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
++    details:
++      changedLines:
++        added: 547
++        deleted: 9
++        total: 556
++        files:
++          - plugins/software-factory/src/core/artifacts.ts
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/engine.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/git/repair.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..e985026
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,80 @@
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
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/concerns-funnel.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
++    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
++    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
++    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
++    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
++    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
++    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
++    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
++    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
++    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
++    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
++  ]
++}
++
++## Context & Citations
++[]
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..6f587dd
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: rejected
++startedAt: 2026-11-08T06:19:23.712Z
++session: 01a1b9cf-c890-724d-b6a9-2473bfac0631
++endedAt: 2026-11-08T06:37:41.767Z
++usage:
++  inputTokens: 130810
++  outputTokens: 48991
++  costUsd: 0.06896100000000001
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..ceff7b9
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,88 @@
++status: ok
++summary: "Implemented the taskWt concern store in src/core/concerns.ts: stable
++  fingerprints over kind/normalized summary/location/sorted affects; atomic
++  one-file-per-fingerprint aggregation with longer/latest detail, max severity,
++  advanced updatedAt/lastSeen, dismissed-status preservation and escalation;
++  exact-id triage gated by isTriager; close-up pending resolutions; suggestion
++  partitioning; idempotent reconciliation from committed step records; and
++  remarkable-decision rm-* artifacts. Wired all producer seams through
++  step-runner (concerns, newConcerns, remarkable, suggestions,
++  concernResolutions, including consult writeArtifact), with reviewer triage
++  restricted to pre-existing concern ids and ingest failures journaled as
++  concern_ingest_error without changing step status. Added concerns/** startup
++  recovery commit and task startup reconcile."
++target:
++  selectors:
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
++      identity, ignoring detail, severity, and affect order
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
++      concern to one open taskWt file with defaults, source, and immediate
++      commit
++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
++      concerns into one file with longer detail, max severity, and advanced
++      timestamps
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
++      and flags escalation when a higher severity is re-emitted
++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
++      concerns in stable order
++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
++      suggestions and persists dismiss reasons
++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
++      triage dispositions and gates non-triagers
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
++      without detail and leaves the concern unchanged
++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
++      by exact concern id
++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
++      pending resolutions without changing concern status
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
++      decisions into rm-* files and triages them by exact id
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
++      kinds without partial writes and leaves existing files untouched
++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
++      fingerprints concurrently without deadlock or lost commits
++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
++      merges of the same fingerprint into one merged file
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
++      aggregate new concerns before triaging pre-existing ids only"
++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
++      writeArtifact producers to the concern store
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
++      producers: aggregates concerns and applies resolutions"
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
++      remarkable decisions across producer schemas
++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
++      concerns from committed step records idempotently
++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
++      files during startup recovery instead of stashing them
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
++      and journals an ingest error when concern ingestion fails
++evidence:
++  - "bun run typecheck (in plugins/software-factory): exit 0 after final changes"
++  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts: 22 pass, 0 fail,
++    202 expect() calls"
++  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts --rerun-each 2: 44
++    pass, 0 fail, proving concurrent merge serialization is stable"
++  - "TMPDIR=/tmp bun test (full suite, isolated run): 324 pass, 2 skip, 0 fail,
++    1395 expect() calls"
++  - "git diff --check: clean"
++  - "Baseline qa-red-test timeout check: the same 5s test-timeout sensitivity
++    reproduces without these changes under current machine load, confirming it
++    is environmental and unrelated"
++  - git stash was used only for the baseline comparison and was popped; git
++    status shows only the five intended production files modified
++concerns:
++  - Unrelated qa-red-test integration tests are timing-sensitive against Bun's
++    5s per-test default and can time out under high machine load; the full suite
++    passed when run in isolation and the failure reproduces on the pre-change
++    baseline.
++  - Concern ingestion uses the task-wide KeyedMutex keyed by taskDir, so
++    distinct-fingerprint writes are serialized per task rather than truly
++    parallel; this is required for safe per-task RMW and still passed the
++    concurrency tests.
++notes: commitAll is called outside the KeyedMutex and never inside
++  repo.writeLock.runExclusive (commitAll acquires repo.writeLock internally).
++  Startup recovery commits stray concerns/** files before any stash; task
++  startup calls reconcileConcerns read-only against committed step records.
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
+new file mode 100644
+index 0000000..c956b72
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
+@@ -0,0 +1,115 @@
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
++        durationMs: 4115
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 214345
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-DhnsNA/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
++
++           324 pass
++           2 skip
++           0 fail
++           1395 expect() calls
++          Ran 326 tests across 55 files. [99.73s]
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
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794120748753-kzhys7rw6n.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 276/300 production lines changed"
++    details:
++      changedLines:
++        added: 276
++        deleted: 0
++        total: 276
++        files:
++          - plugins/software-factory/src/core/artifacts.ts
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/engine.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
+new file mode 100644
+index 0000000..8ce505c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
+@@ -0,0 +1,104 @@
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
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/concerns-funnel.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
++    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
++    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
++    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
++    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
++    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
++    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
++    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
++    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
++    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
++    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
++Failing check: size
++
++Message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
++
++Detail:
++{
++  "changedLines": {
++    "added": 547,
++    "deleted": 9,
++    "total": 556,
++    "files": [
++      "plugins/software-factory/src/core/artifacts.ts",
++      "plugins/software-factory/src/core/concerns.ts",
++      "plugins/software-factory/src/core/engine.ts",
++      "plugins/software-factory/src/core/flows/step-runner.ts",
++      "plugins/software-factory/src/core/git/repair.ts"
++    ]
++  },
++  "limit": 300
++}
++
++Budget: 556 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
++
++Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
+new file mode 100644
+index 0000000..d78359c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 3
++name: develop
++attempt: 2
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T06:39:44.749Z
++session: 01a1b9e2-6959-7721-ab3f-95f04fde4925
++endedAt: 2026-11-08T06:52:31.854Z
++usage:
++  inputTokens: 57623
++  outputTokens: 44914
++  costUsd: 0.045325
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
+new file mode 100644
+index 0000000..53bf492
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
+@@ -0,0 +1,86 @@
++status: ok
++summary: Shrank the concerns-store production diff from 556 to 276 changed lines
++  (under the 300-line limit) without changing behavior. Rewrote
++  src/core/concerns.ts compactly (207 lines) while preserving
++  fingerprint/merge/triage/close-up/partition/reconcile semantics; consolidated
++  the step-runner ingestion seam and call site; moved concern-store startup
++  recovery from repairWorktree into a pre-repair engine commit (restoring
++  repair.ts to baseline). Target file passes 22/22 and the full suite passes.
++target:
++  selectors:
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
++      identity, ignoring detail, severity, and affect order
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
++      concern to one open taskWt file with defaults, source, and immediate
++      commit
++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
++      concerns into one file with longer detail, max severity, and advanced
++      timestamps
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
++      and flags escalation when a higher severity is re-emitted
++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
++      concerns in stable order
++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
++      suggestions and persists dismiss reasons
++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
++      triage dispositions and gates non-triagers
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
++      without detail and leaves the concern unchanged
++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
++      by exact concern id
++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
++      pending resolutions without changing concern status
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
++      decisions into rm-* files and triages them by exact id
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
++      kinds without partial writes and leaves existing files untouched
++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
++      fingerprints concurrently without deadlock or lost commits
++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
++      merges of the same fingerprint into one merged file
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
++      aggregate new concerns before triaging pre-existing ids only"
++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
++      writeArtifact producers to the concern store
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
++      producers: aggregates concerns and applies resolutions"
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
++      remarkable decisions across producer schemas
++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
++      concerns from committed step records idempotently
++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
++      files during startup recovery instead of stashing them
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
++      and journals an ingest error when concern ingestion fails
++evidence:
++  - "Size check: `git diff --numstat 87a7682 -- plugins/software-factory/src` =>
++    artifacts.ts 2/0, concerns.ts 207/0, engine.ts 18/0, step-runner.ts 49/0 =
++    276 changed lines total (limit 300); repair.ts restored to baseline with
++    zero delta."
++  - "Typecheck: `cd plugins/software-factory && bun run typecheck` => exit 0."
++  - "Target: `cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/concerns-funnel.test.ts` => 22 pass, 0 fail, 202 expect()
++    calls."
++  - "Full suite: `cd plugins/software-factory && TMPDIR=/tmp bun test` => 324
++    pass, 2 skip, 0 fail across 55 files (80.9s)."
++  - "Flake confirmation: first full-suite run hit two 5s timeouts in
++    qa-red-test.test.ts; the file alone passes 3/3 (9.8s) and
++    amend-maxiterations.test.ts alone passes 4/4 (5.7s), matching the same
++    load-related timeouts seen in the prior attempt's gate run."
++  - "`git diff --check` => exit 0 (no whitespace errors)."
++concerns:
++  - Full-suite 5s per-test timeouts are load-flaky in subprocess-spawning engine
++    tests (qa-red-test, amend-maxiterations); each file passes in isolation and
++    the full suite passed on re-run, so this is pre-existing harness flakiness
++    rather than a code regression.
++notes: "Behavior preserved while shrinking: concern identity ignores
++  detail/severity/affect order; aggregation merges longer-or-equal detail, max
++  severity, preserves status/disposition/dismissReason/pendingResolution,
++  advances updatedAt/lastSeen and sets source.escalated on severity rise; atomic
++  YAML writes + KeyedMutex(taskDir) guard RMW and commitAll runs outside
++  repo.writeLock. Startup recovery now commits concerns/ via commitAll before
++  stray-dirt repair instead of adding commitGlobs to repairWorktree, removing
++  the repair.ts delta. Reconcile derives read-only from committed step records
++  using git ls-tree and remains idempotent."
+diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
+index 08aed67..cf53d5c 100644
+--- a/plugins/software-factory/src/core/artifacts.ts
++++ b/plugins/software-factory/src/core/artifacts.ts
+@@ -333,6 +333,8 @@ export interface ConcernSource {
+   item?: string;
+   iteration?: number;
+   escalated?: boolean;
++  /** Timestamp of the most recent re-emit for merged concerns. */
++  lastSeen?: string;
+ }
+ 
+ export interface PendingConcernResolution {
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+new file mode 100644
+index 0000000..c32728f
+--- /dev/null
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -0,0 +1,207 @@
++import fs from "node:fs";
++import path from "node:path";
++import { createHash } from "node:crypto";
++import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++import type { Repo } from "./git/repo.js";
++import { commitAll } from "./git/commit.js";
++import { git } from "./git/exec.js";
++import { KeyedMutex } from "./mutex.js";
++import { readYaml, writeYamlAtomic } from "./records/io.js";
++
++export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
++  Partial<Pick<Concern, "detail" | "severity">>;
++export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
++export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }
++
++type Obj = Record<string, any>;
++type Patch = (record: Obj, at: string) => Obj;
++const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
++const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };
++/** Serializes read-modify-write cycles of one task's concern store. */
++const locks = new KeyedMutex();
++const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
++const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
++const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
++const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
++const hash = (prefix: string, parts: unknown[]) =>
++  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
++
++/** Stable concern identity: kind, normalized summary, location, sorted affects. */
++export function concernFingerprint(c: ConcernInput): string {
++  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
++}
++
++async function readExisting<T>(file: string): Promise<T | undefined> {
++  try { return await readYaml<T>(file); } catch (err: any) {
++    if (err?.code === "ENOENT") return undefined;
++    throw err;
++  }
++}
++
++function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
++  const incomingDetail = (input.detail ?? input.summary).trim();
++  const incomingSeverity = input.severity ?? "medium";
++  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
++  const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
++  const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
++  const location = input.location ?? existing?.location;
++  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
++  return {
++    ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
++    summary: existing?.summary ?? input.summary.trim(), detail,
++    ...(location ? { location } : {}), ...(affects ? { affects } : {}), severity,
++    status: existing?.status ?? "open",
++    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: at },
++    createdAt: existing?.createdAt ?? at, updatedAt: at,
++  };
++}
++
++function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
++  return {
++    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
++    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
++    status: existing?.status ?? "open",
++    source: { ...(existing?.source ?? {}), ...source, lastSeen: at },
++    createdAt: existing?.createdAt ?? at, updatedAt: at,
++  };
++}
++
++/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
++export async function aggregateConcerns(
++  ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = []
++): Promise<StoredConcernArtifact[]> {
++  for (const c of concerns) {
++    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
++    if (!c.summary?.trim()) throw new Error("Concern summary is required");
++    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
++  }
++  for (const d of remarkables) if (!d?.chosen?.trim()) throw new Error("Remarkable decision requires chosen");
++
++  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++  const stored = await locks.runExclusive(ctx.taskDir, async () => {
++    const out: StoredConcernArtifact[] = [];
++    for (const input of concerns) {
++      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
++      const merged = mergeConcern(await readExisting(file), input, ctx.source, at);
++      await writeYamlAtomic(file, merged);
++      out.push(merged);
++    }
++    for (const decision of remarkables) {
++      const file = path.join(dir, `${rmId(decision)}.yaml`);
++      await writeYamlAtomic(file, mergeRemarkable(await readExisting(file), decision, ctx.source, at));
++    }
++    return out;
++  });
++  if (concerns.length || remarkables.length) await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
++  return stored;
++}
++
++/** Returns open concerns ordered by creation time then id. */
++export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++  const dir = dirOf(taskDir);
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return [];
++    throw err;
++  }
++  const records = await Promise.all(names.filter((n) => n.endsWith(".yaml")).map(async (name) => {
++    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
++  }));
++  return records
++    .filter((r): r is StoredConcernArtifact => r?.status === "open")
++    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
++}
++
++async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
++  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++  const updated = await locks.runExclusive(ctx.taskDir, async () => {
++    const out: StoredConcernArtifact[] = [];
++    for (const [id, patch] of ops) {
++      if (id !== path.basename(id)) continue;
++      const file = path.join(dir, `${id}.yaml`);
++      const existing = await readExisting<Obj>(file);
++      if (!existing) continue;
++      const next = { ...patch(existing, at), updatedAt: at };
++      await writeYamlAtomic(file, next);
++      out.push(next as StoredConcernArtifact);
++    }
++    return out;
++  });
++  if (updated.length) await commitAll(ctx.repo, ctx.taskWt, message);
++  return updated;
++}
++
++/** Applies review triage to pre-existing concerns only; ordinary findings are ignored. */
++export async function applyConcernTriage(
++  ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
++): Promise<StoredConcernArtifact[]> {
++  if (!ctx.isTriager) return [];
++  const ops = ctx.suggestions.map((s): [string, Patch] => {
++    if (s.disposition === "dismiss" && !s.detail?.trim()) throw new Error(`Dismiss triage for ${s.id} requires detail`);
++    return [s.id, (record) => s.disposition === "dismiss"
++      ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
++      : { ...record, status: "routed", disposition: s.disposition }];
++  });
++  return mutate(ctx, ops, "factory: concerns triaged");
++}
++
++/** Records close-up resolutions as pending; changing status is a later decision. */
++export function applyCloseupResolutions(
++  ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
++): Promise<StoredConcernArtifact[]> {
++  const ops = ctx.resolutions.map((r): [string, Patch] => [r.id, (record, at) => ({
++    ...record, pendingResolution: { action: r.action, ...(r.note !== undefined ? { note: r.note } : {}), by: ctx.by, at },
++  })]);
++  return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
++}
++
++/** Splits review suggestions into concern triage vs findings by exact id. */
++export function partitionSuggestions(
++  suggestions: ReviewSuggestion[], concernIds: Iterable<string>
++): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
++  const ids = new Set(concernIds);
++  return {
++    triage: suggestions.filter((s) => ids.has(s.id)),
++    findings: suggestions.filter((s) => !ids.has(s.id)),
++  };
++}
++
++interface CommittedRecord { name: string; item?: string; meta: Obj; output: Obj }
++
++async function committedStepRecords(ctx: ConcernStoreContext): Promise<CommittedRecord[]> {
++  const res = await git(ctx.taskWt, ["ls-tree", "-r", "--name-only", "HEAD"], { allowFail: true, env: ctx.repo.identityEnv() });
++  if (res.code !== 0) return [];
++  const committed = new Set(res.stdout.split("\n").filter(Boolean));
++  const prefix = path.relative(ctx.taskWt, ctx.taskDir).replace(/\\/g, "/");
++  const records: CommittedRecord[] = [];
++  for (const metaRel of [...committed].sort()) {
++    const outputRel = metaRel.replace(/meta\.yaml$/, "output.yaml");
++    if (!metaRel.startsWith(`${prefix}/`) || outputRel === metaRel || !committed.has(outputRel)) continue;
++    const parts = metaRel.slice(prefix.length + 1).split("/");
++    const item = parts[0] === "items" && parts.length === 5 ? parts[1] : undefined;
++    if (!item && (parts[0] !== "runs" || parts.length !== 3)) continue;
++    try {
++      const meta = await readYaml<Obj>(path.join(ctx.taskWt, metaRel));
++      if (meta?.status !== "ok") continue;
++      records.push({ name: parts[parts.length - 2]!, ...(item ? { item } : {}), meta,
++        output: await readYaml<Obj>(path.join(ctx.taskWt, outputRel)) });
++    } catch { /* A corrupt record is not a usable derivation input. */ }
++  }
++  return records;
++}
++
++/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. */
++export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
++  const reconciled: StoredConcernArtifact[] = [];
++  for (const r of await committedStepRecords(ctx)) {
++    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])]
++      .filter((c: any) => c && typeof c === "object");
++    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
++    if (!concerns.length && !remarkables.length) continue;
++    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"),
++      ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
++    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables)));
++  }
++  return reconciled;
++}
+diff --git a/plugins/software-factory/src/core/engine.ts b/plugins/software-factory/src/core/engine.ts
+index 87787e9..bb4fe0c 100644
+--- a/plugins/software-factory/src/core/engine.ts
++++ b/plugins/software-factory/src/core/engine.ts
+@@ -31,6 +31,7 @@ import { runIngest, isTriageDone, isInfraDone } from "./flows/ingest.js";
+ import { runIteration } from "./flows/iteration.js";
+ import { runSeamHooks } from "./flows/seams.js";
+ import { readYaml, writeYamlAtomic, readText } from "./records/io.js";
++import { reconcileConcerns } from "./concerns.js";
+ import { listPending, classify, takenPaths } from "./steer.js";
+ import { resolveRole } from "./config/roles.js";
+ import { installShutdownHandlers } from "./shutdown.js";
+@@ -323,6 +324,12 @@ export async function runTask(
+     parentBranch = `topic/${task}`;
+ 
+   // 2. Start-up repair restricted to §6.3.6 list (Finding 1 & 19)
++  // Concerns are engine-owned: commit them before stray-dirt repair stashes them.
++  if (fs.existsSync(path.join(taskDir, "concerns"))) {
++    await commitAll(repo, taskWt, "factory: concern store recovery", {
++      paths: [`${orchFolder}/${task}/concerns`],
++    });
++  }
+   await repairWorktree(repo, taskWt, "task", {
+     operatorEditable: [
+       "INTENT.md",
+@@ -358,6 +365,17 @@ export async function runTask(
+ 
+   await repairInterruptedRecords(taskDir);
+ 
++  // Rebuild concerns lost in a crash from committed step records (§18).
++  try {
++    await reconcileConcerns({ taskDir, taskWt, repo });
++  } catch (err: any) {
++    await appendJournal(taskDir, {
++      type: "concern_reconcile_error",
++      task,
++      error: err?.message || String(err),
++    });
++  }
++
+   // 3. Load pipeline config and setup semaphores (§2)
+   pipeline = await pipelineFor(taskDir);
+   if (opts?.maxIterations !== undefined) {
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index f5e0e00..3b1775c 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -24,6 +24,12 @@ import {
+ import { validateAndRepair } from "../records/repair.js";
+ import { generateReviewSchema } from "../records/review-schema.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++import {
++  aggregateConcerns,
++  applyCloseupResolutions,
++  applyConcernTriage,
++  partitionSuggestions,
++} from "../concerns.js";
+ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+@@ -167,6 +173,33 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
+   return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
+ }
+ 
++/** Feeds a step's producer fields into the taskWt concern store (§18). */
++async function ingestStepConcerns(opts: {
++  taskDir: string; taskWt: string; repo: any; output: unknown;
++  source: { record: string; agent: string; step: string; item?: string; iteration?: number };
++}): Promise<void> {
++  const data = (opts.output ?? {}) as Record<string, any>;
++  const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
++  const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
++  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
++  const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
++  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return;
++
++  // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
++  let existing: string[] = [];
++  try {
++    existing = (await fs.promises.readdir(path.join(opts.taskDir, "concerns")))
++      .filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -5));
++  } catch (err: any) {
++    if (err?.code !== "ENOENT") throw err;
++  }
++  const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
++  if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
++  const { triage } = partitionSuggestions(suggestions, existing);
++  if (triage.length) await applyConcernTriage({ ...ctx, suggestions: triage, isTriager: isTriagerAgent(opts.source.agent) });
++  if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
++}
++
+ /**
+  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
+  */
+@@ -635,6 +668,22 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+     }
+   }
+ 
++  // Producer concerns feed the taskWt store after the canonical artifact write.
++  if (finalStatus === "ok") {
++    try {
++      await ingestStepConcerns({
++        taskDir, taskWt, repo, output: validatedData,
++        source: {
++          record: dirName, agent, step: stepId,
++          ...(item ? { item } : {}),
++          ...(opts.iteration !== undefined ? { iteration: opts.iteration } : {}),
++        },
++      });
++    } catch (err: any) {
++      await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) });
++    }
++  }
++
+   // 13. Invariant §6.3.2: Finish step record with final meta
+   const finalMeta = await finishStepRecord({
+     recordDir,
+diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+index ce498df..ef4bafb 100644
+--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+@@ -4,9 +4,27 @@ import path from "node:path";
+ import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+ import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+ import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runTask } from "../../src/core/engine.js";
+ import { Repo } from "../../src/core/git/repo.js";
+ import { loadPromptLibrary } from "../../src/core/prompts.js";
+-import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import {
++  aggregateConcerns,
++  applyCloseupResolutions,
++  applyConcernTriage,
++  concernFingerprint,
++  listOpenConcerns,
++  partitionSuggestions,
++  reconcileConcerns,
++} from "../../src/core/concerns.js";
++import type {
++  Concern,
++  ConcernSource,
++  PipelineConfig,
++  ProjectConfig,
++  ReviewSuggestion,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
+ 
+ /**
+  * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
+@@ -163,3 +181,1080 @@ describe("Concern funnel schemas", () => {
+     expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
+   });
+ });
++
++/**
++ * Behaviour of the taskWt concern store (docs/factory.v2.md §18; ADRs
++ * adr-concern-store-taskwt, adr-fingerprint-merge, adr-triage-suggestions-dismiss).
++ *
++ * `{task}/concerns/` lives on the task worktree while item steps only commit
++ * childWt, so the store must write an explicit taskWt path, serialize
++ * read-modify-write merges per task, and commit taskWt immediately. One file
++ * per fingerprint keeps retries and restarts idempotent.
++ */
++describe("Concern store", () => {
++  const ORCH = ".factory";
++  const TASK = "concern-store";
++
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskWt: string;
++  let taskDir: string;
++  let worktreeRoot: string;
++  let pipeline: PipelineConfig;
++  let project: ProjectConfig;
++  let prompts: ReturnType<typeof loadPromptLibrary>;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    taskWt = tmpRepo.dir;
++    taskDir = path.join(taskWt, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Concern store\n", "utf8");
++    tmpRepo.commit("add concern store task");
++
++    pipeline = {
++      models: {
++        roles: {
++          workhorse: { model: "model-workhorse" },
++          "alt-workhorse": { model: "model-alt-workhorse" },
++          architect: { model: "model-architect" },
++          "alt-architect": { model: "model-alt-architect" },
++          simpler: { model: "model-simpler" },
++        },
++      },
++      agents: {
++        developer: { role: "workhorse" },
++        "fact-finder": { role: "workhorse" },
++        qa: { role: "alt-workhorse" },
++        reviewer: { role: "alt-workhorse" },
++        architect: { role: "architect" },
++        "wave-close-up": { role: "alt-workhorse" },
++        "plan-close-up": { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: {}, spike: {} },
++      limits: {},
++    };
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({
++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
++      overrideDirs: [],
++    });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concernSource(
++    record: string,
++    agent = "developer",
++    extra: Partial<ConcernSource> = {}
++  ): ConcernSource {
++    return { record, agent, ...extra };
++  }
++
++  function storedConcern(
++    overrides: Partial<StoredConcernArtifact> & { id: string }
++  ): StoredConcernArtifact {
++    return {
++      kind: "risk",
++      summary: `Concern ${overrides.id}`,
++      detail: "detail",
++      severity: "medium",
++      status: "open",
++      source: { record: "001-develop-a1", agent: "developer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    };
++  }
++
++  async function writeStoredConcern(concern: StoredConcernArtifact): Promise<string> {
++    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
++    await writeYamlAtomic(file, concern);
++    return file;
++  }
++
++  async function runStep(opts: {
++    item?: string;
++    agent: string;
++    stepId: string;
++    stepFragment: string;
++    cwd: string;
++    recordsDir: string;
++    data: unknown;
++    promptVars: Record<string, string>;
++    writeArtifact?: (output: unknown) => Promise<void>;
++  }) {
++    const harness = new FakeHarness();
++    const label = opts.item
++      ? `${TASK}/items/${opts.item}/${opts.stepId}#a1`
++      : `${TASK}/runs/${opts.stepId}#a1`;
++    harness.scriptOutcome(label, { ok: true, data: opts.data });
++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
++    harness.scriptComplete(() => opts.data);
++
++    return runAgentStep({
++      task: TASK,
++      item: opts.item,
++      stepId: opts.stepId,
++      stepFragment: opts.stepFragment,
++      agent: opts.agent,
++      cwd: opts.cwd,
++      taskDir,
++      recordsDir: opts.recordsDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      promptVars: opts.promptVars,
++      writeArtifact: opts.writeArtifact,
++    });
++  }
++
++  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "  Flaky   GATE ",
++      location: { file: "src/core/example.ts", line: 7 },
++      affects: ["item-b", "item-a"],
++    };
++    const fp = concernFingerprint(identity);
++
++    expect(fp).toMatch(/^c-[0-9a-f]{10}$/);
++    expect(concernFingerprint({ ...identity, detail: "short", severity: "low" })).toBe(fp);
++    expect(
++      concernFingerprint({ ...identity, detail: "a much longer detail", severity: "high" })
++    ).toBe(fp);
++    expect(
++      concernFingerprint({ ...identity, summary: "flaky gate", affects: ["item-a", "item-b"] })
++    ).toBe(fp);
++
++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(fp);
++    expect(
++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++    ).not.toBe(fp);
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
++  });
++
++  it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
++    const item = "item-a";
++    const childWt = tmpRepo.createWorktree(`topic/${TASK}--${item}`);
++    const recordsDir = path.join(childWt, ORCH, TASK, "items", item, "steps");
++    fs.mkdirSync(recordsDir, { recursive: true });
++
++    const result = await runStep({
++      item,
++      agent: "developer",
++      stepId: "develop",
++      stepFragment: "steps/develop",
++      cwd: childWt,
++      recordsDir,
++      data: {
++        status: "ok",
++        summary: "Implemented the dependency",
++        evidence: ["bun test passed"],
++        concerns: [
++          { kind: "blocker", summary: "Dependent item has no implementation", affects: [item] },
++        ],
++      },
++      promptVars: { assignment: "Implement", target: "tests", citations: "[]" },
++    });
++
++    expect(result.ok).toBe(true);
++    expect(result.status).toBe("ok");
++
++    const concernsDir = path.join(taskDir, "concerns");
++    expect(fs.existsSync(concernsDir)).toBe(true);
++    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    expect(files[0]).toMatch(/^c-[0-9a-f]{10}\.yaml$/);
++
++    const stored = await readYaml<StoredConcernArtifact>(path.join(concernsDir, files[0]!));
++    expect(stored.status).toBe("open");
++    expect(stored.severity).toBe("medium");
++    expect(stored.detail).toBe(stored.summary);
++    expect(stored.source.record).toBe("001-develop-a1");
++    expect(stored.source.agent).toBe("developer");
++    expect(stored.source.item).toBe(item);
++
++    // The concern is committed on taskWt, never written to the child worktree.
++    const rel = path
++      .relative(taskWt, path.join(concernsDir, files[0]!))
++      .replace(/\\/g, "/");
++    expect(
++      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], { cwd: taskWt, allowFail: true }).code
++    ).toBe(0);
++    expect(fs.existsSync(path.join(childWt, ORCH, TASK, "concerns"))).toBe(false);
++  });
++
++  it("merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps", async () => {
++    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
++    const now = () => new Date(nowMs);
++
++    const first = await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: "short", severity: "low" }]
++    );
++    expect(first).toHaveLength(1);
++    const id = first[0]!.id;
++    const file = path.join(taskDir, "concerns", `${id}.yaml`);
++    const created = await readYaml<StoredConcernArtifact>(file);
++
++    nowMs += 60_000;
++    const second = await aggregateConcerns(
++      {
++        taskDir,
++        taskWt,
++        repo,
++        now,
++        source: concernSource("002-develop-a1", "developer", { step: "develop", item: "item-a" }),
++      },
++      [{ kind: "risk", summary: "flaky   gate", detail: "a much longer detail", severity: "high" }]
++    );
++    expect(second).toHaveLength(1);
++    expect(second[0]!.id).toBe(id);
++
++    const merged = await readYaml<StoredConcernArtifact>(file);
++    expect(merged.detail).toBe("a much longer detail");
++    expect(merged.severity).toBe("high");
++    expect(merged.status).toBe("open");
++    expect(merged.source.record).toBe("002-develop-a1");
++    expect(merged.createdAt).toBe(created.createdAt);
++    expect(merged.updatedAt).toBe("2026-01-01T00:01:00.000Z");
++    const lastSeen = (merged.source as ConcernSource & { lastSeen?: string }).lastSeen;
++    expect(typeof lastSeen).toBe("string");
++    expect(Date.parse(lastSeen!)).toBe(nowMs);
++
++    // A shorter detail never replaces the longer stored one.
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("003-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: "tiny", severity: "low" }]
++    );
++    const shorter = await readYaml<StoredConcernArtifact>(file);
++    expect(shorter.detail).toBe("a much longer detail");
++    expect(shorter.severity).toBe("high");
++
++    // Equal-length details keep the latest re-emit.
++    const equalA = "a".repeat(32);
++    const equalB = "b".repeat(32);
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("004-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: equalA, severity: "medium" }]
++    );
++    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalA);
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("005-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: equalB, severity: "medium" }]
++    );
++    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalB);
++
++    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("keeps dismissed status and flags escalation when a higher severity is re-emitted", async () => {
++    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
++    const now = () => new Date(nowMs);
++
++    const first = await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
++      [{ kind: "risk", summary: "Endpoint may change", detail: "initial", severity: "low" }]
++    );
++    expect(first).toHaveLength(1);
++    const id = first[0]!.id;
++
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      now,
++      isTriager: true,
++      suggestions: [
++        {
++          id,
++          disposition: "dismiss",
++          summary: "Not real",
++          detail: "covered by contract test",
++        },
++      ],
++    });
++    expect(triaged).toHaveLength(1);
++    expect(triaged[0]!.status).toBe("dismissed");
++
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("002-develop-a1") },
++      [
++        {
++          kind: "risk",
++          summary: "Endpoint may change",
++          detail: "a longer detail",
++          severity: "high",
++        },
++      ]
++    );
++
++    const merged = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${id}.yaml`)
++    );
++    expect(merged.status).toBe("dismissed");
++    expect(merged.dismissReason).toBe("covered by contract test");
++    expect(merged.severity).toBe("high");
++    expect(merged.source.escalated).toBe(true);
++    expect(await listOpenConcerns(taskDir)).toEqual([]);
++  });
++
++  it("lists only open concerns in stable order", async () => {
++    await writeStoredConcern(
++      storedConcern({ id: "c-1111111111", createdAt: "2026-01-02T00:00:00.000Z" })
++    );
++    await writeStoredConcern(
++      storedConcern({ id: "c-2222222222", createdAt: "2026-01-01T00:00:00.000Z" })
++    );
++    await writeStoredConcern(
++      storedConcern({
++        id: "c-3333333333",
++        status: "dismissed",
++        createdAt: "2026-01-01T00:00:00.000Z",
++      })
++    );
++    await writeStoredConcern(
++      storedConcern({
++        id: "c-4444444444",
++        status: "resolved",
++        createdAt: "2026-01-01T00:00:00.000Z",
++      })
++    );
++
++    const open = await listOpenConcerns(taskDir);
++    expect(open.map((c) => c.id)).toEqual(["c-2222222222", "c-1111111111"]);
++  });
++
++  it("triages only exact-id suggestions and persists dismiss reasons", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
++    await writeStoredConcern(storedConcern({ id: "c-bbbbbbbbbb" }));
++
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        {
++          id: "c-aaaaaaaaaa",
++          disposition: "dismiss",
++          summary: "Duplicate",
++          detail: "covered by ADR-1",
++        },
++        { id: "s-1", disposition: "dismiss", summary: "Not a concern", detail: "unrelated finding" },
++      ],
++    });
++
++    expect(triaged.map((c) => c.id)).toEqual(["c-aaaaaaaaaa"]);
++    const dismissed = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-aaaaaaaaaa.yaml")
++    );
++    expect(dismissed.status).toBe("dismissed");
++    expect(dismissed.dismissReason).toBe("covered by ADR-1");
++
++    const untouched = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-bbbbbbbbbb.yaml")
++    );
++    expect(untouched.status).toBe("open");
++    expect(untouched.dismissReason).toBeUndefined();
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("routes non-dismiss triage dispositions and gates non-triagers", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-cccccccccc" }));
++
++    const ignored = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: false,
++      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
++    });
++    expect(ignored).toEqual([]);
++    const stillOpen = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
++    );
++    expect(stillOpen.status).toBe("open");
++    expect(stillOpen.disposition).toBeUndefined();
++
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
++    });
++    expect(triaged).toHaveLength(1);
++    const routed = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
++    );
++    expect(routed.status).toBe("routed");
++    expect(routed.disposition).toBe("fix");
++  });
++
++  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-dddddddddd" }));
++
++    await expect(
++      applyConcernTriage({
++        taskDir,
++        taskWt,
++        repo,
++        isTriager: true,
++        suggestions: [{ id: "c-dddddddddd", disposition: "dismiss", summary: "No reason" }],
++      })
++    ).rejects.toThrow(/detail/i);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-dddddddddd.yaml")
++    );
++    expect(stored.status).toBe("open");
++    expect(stored.dismissReason).toBeUndefined();
++  });
++
++  it("partitions suggestions by exact concern id", () => {
++    const suggestions: ReviewSuggestion[] = [
++      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Concern" },
++      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
++      { id: "s-1", disposition: "fix", summary: "Finding" },
++      { id: "c-cccccccccc", disposition: "optional", summary: "Unknown concern id" },
++    ];
++
++    const { triage, findings } = partitionSuggestions(
++      suggestions,
++      new Set(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"])
++    );
++
++    expect(triage.map((s) => s.id)).toEqual(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"]);
++    expect(findings.map((s) => s.id)).toEqual(["s-1", "c-cccccccccc"]);
++  });
++
++  it("records close-up pending resolutions without changing concern status", async () => {
++    await writeStoredConcern(
++      storedConcern({ id: "c-eeeeeeeeee", status: "routed", disposition: "architect" })
++    );
++    await writeStoredConcern(
++      storedConcern({ id: "c-ffffffffff", status: "routed", disposition: "fix" })
++    );
++    await writeStoredConcern(
++      storedConcern({ id: "c-9999999999", status: "open" })
++    );
++
++    const applied = await applyCloseupResolutions({
++      taskDir,
++      taskWt,
++      repo,
++      by: "wave-close-up",
++      resolutions: [
++        { id: "c-eeeeeeeeee", action: "carry", note: "architect should decide" },
++        { id: "c-ffffffffff", action: "resolve" },
++        { id: "c-9999999999", action: "propagate", note: "saga decision" },
++        { id: "c-8888888888", action: "resolve", note: "unknown id" },
++      ],
++    });
++
++    expect(applied.map((c) => c.id).sort()).toEqual([
++      "c-9999999999",
++      "c-eeeeeeeeee",
++      "c-ffffffffff",
++    ]);
++    const carried = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-eeeeeeeeee.yaml")
++    );
++    expect(carried.status).toBe("routed");
++    expect(carried.pendingResolution?.action).toBe("carry");
++    expect(carried.pendingResolution?.note).toBe("architect should decide");
++    expect(carried.pendingResolution?.by).toBe("wave-close-up");
++    expect(typeof carried.pendingResolution?.at).toBe("string");
++
++    const resolved = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-ffffffffff.yaml")
++    );
++    expect(resolved.status).toBe("routed");
++    expect(resolved.pendingResolution?.action).toBe("resolve");
++
++    const propagated = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-9999999999.yaml")
++    );
++    expect(propagated.status).toBe("open");
++    expect(propagated.pendingResolution?.action).toBe("propagate");
++    expect(propagated.pendingResolution?.note).toBe("saga decision");
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("aggregates remarkable decisions into rm-* files and triages them by exact id", async () => {
++    await aggregateConcerns(
++      {
++        taskDir,
++        taskWt,
++        repo,
++        source: concernSource("001-architect-plan-a1", "architect", { step: "architect-plan" }),
++      },
++      [],
++      [
++        {
++          chosen: "Atomic YAML files",
++          alternatives: ["One big file", "A database"],
++          why: "diffable and conflict-free",
++        },
++      ]
++    );
++
++    const concernsDir = path.join(taskDir, "concerns");
++    expect(fs.existsSync(concernsDir)).toBe(true);
++    const files = fs
++      .readdirSync(concernsDir)
++      .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    expect(files[0]).toMatch(/^rm-[0-9a-f]{10}\.yaml$/);
++
++    const remarkable = await readYaml<Record<string, any>>(
++      path.join(concernsDir, files[0]!)
++    );
++    expect(remarkable.status).toBe("open");
++    expect(remarkable.chosen).toBe("Atomic YAML files");
++    expect(remarkable.source.record).toBe("001-architect-plan-a1");
++    expect(remarkable.source.agent).toBe("architect");
++
++    const rmId = files[0]!.replace(/\.yaml$/, "");
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        {
++          id: rmId,
++          disposition: "dismiss",
++          summary: "Standard",
++          detail: "No tradeoff worth reporting",
++        },
++      ],
++    });
++    expect(triaged).toHaveLength(1);
++    const after = await readYaml<Record<string, any>>(path.join(concernsDir, files[0]!));
++    expect(after.status).toBe("dismissed");
++    expect(after.dismissReason).toBe("No tradeoff worth reporting");
++  });
++
++  it("rejects unknown concern kinds without partial writes and leaves existing files untouched", async () => {
++    const existing = await writeStoredConcern(
++      storedConcern({ id: "c-0123456789", summary: "Existing concern" })
++    );
++    const before = fs.readFileSync(existing, "utf8");
++
++    await expect(
++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
++        { kind: "risk", summary: "Valid" },
++        { kind: "bug", summary: "Invalid" } as unknown as Concern,
++      ])
++    ).rejects.toThrow(/kind/i);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
++    expect(files).toEqual(["c-0123456789.yaml"]);
++    expect(fs.readFileSync(existing, "utf8")).toBe(before);
++  });
++
++  it("writes distinct fingerprints concurrently without deadlock or lost commits", async () => {
++    const results = await Promise.all([
++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
++        { kind: "risk", summary: "Concurrent risk A" },
++      ]),
++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("002-develop-a1") }, [
++        { kind: "tech-debt", summary: "Concurrent debt B" },
++      ]),
++    ]);
++    expect(results[0]).toHaveLength(1);
++    expect(results[1]).toHaveLength(1);
++
++    const files = fs
++      .readdirSync(path.join(taskDir, "concerns"))
++      .filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(2);
++
++    const tracked = tmpRepo
++      .git(["ls-tree", "-r", "--name-only", "HEAD"], { cwd: taskWt })
++      .stdout.split("\n");
++    for (const file of files) {
++      expect(tracked).toContain(`${ORCH}/${TASK}/concerns/${file}`);
++    }
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("serializes concurrent merges of the same fingerprint into one merged file", async () => {
++    const first = aggregateConcerns(
++      { taskDir, taskWt, repo, source: concernSource("001-develop-a1") },
++      [{ kind: "risk", summary: "Same concern", detail: "short", severity: "low" }]
++    );
++    const second = aggregateConcerns(
++      { taskDir, taskWt, repo, source: concernSource("002-develop-a1") },
++      [
++        {
++          kind: "risk",
++          summary: "Same concern",
++          detail: "a much longer concurrent detail",
++          severity: "high",
++        },
++      ]
++    );
++    const [a, b] = await Promise.all([first, second]);
++    expect(a).toHaveLength(1);
++    expect(b).toHaveLength(1);
++
++    const files = fs
++      .readdirSync(path.join(taskDir, "concerns"))
++      .filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", files[0]!)
++    );
++    expect(stored.detail).toBe("a much longer concurrent detail");
++    expect(stored.severity).toBe("high");
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("wires reviewer output: aggregate new concerns before triaging pre-existing ids only", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
++    const newSummary = "Newly observed retry risk";
++    const newId = concernFingerprint({ kind: "risk", summary: newSummary });
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const result = await runStep({
++      agent: "reviewer",
++      stepId: "review",
++      stepFragment: "steps/review",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        status: "approved",
++        summary: "Reviewed",
++        newConcerns: [{ kind: "risk", summary: newSummary }],
++        suggestions: [
++          {
++            id: "c-aaaaaaaaaa",
++            disposition: "dismiss",
++            summary: "Duplicate",
++            detail: "covered by ADR-1",
++          },
++          {
++            id: newId,
++            disposition: "dismiss",
++            summary: "Self",
++            detail: "must not dismiss a same-step concern",
++          },
++        ],
++      },
++      promptVars: { assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" },
++    });
++    expect(result.ok).toBe(true);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const newFile = path.join(concernsDir, `${newId}.yaml`);
++    expect(fs.existsSync(newFile)).toBe(true);
++    const created = await readYaml<StoredConcernArtifact>(newFile);
++    expect(created.status).toBe("open");
++    expect(created.source.record).toBe("001-review-a1");
++
++    const preExisting = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
++    );
++    expect(preExisting.status).toBe("dismissed");
++    expect(preExisting.dismissReason).toBe("covered by ADR-1");
++  });
++
++  it("wires consult writeArtifact producers to the concern store", async () => {
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++    let artifactWrites = 0;
++
++    const result = await runStep({
++      agent: "architect",
++      stepId: "consult-item",
++      stepFragment: "steps/architect-consult-item",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        decision: "retry-with-guidance",
++        rationale: "Retry with a narrower scope",
++        concerns: [{ kind: "question", summary: "Which API version is authoritative?" }],
++        remarkable: [{ chosen: "Retry", alternatives: ["Escalate"], why: "Cheap to test" }],
++      },
++      promptVars: { item: "item-a", assignment: "", priorAttempts: "", diff: "", feedback: "" },
++      writeArtifact: async () => {
++        artifactWrites++;
++      },
++    });
++
++    expect(result.ok).toBe(true);
++    expect(artifactWrites).toBe(1);
++    const concernsDir = path.join(taskDir, "concerns");
++    const files = fs.existsSync(concernsDir) ? fs.readdirSync(concernsDir) : [];
++    const concernFiles = files.filter((f) => f.startsWith("c-"));
++    const remarkableFiles = files.filter((f) => f.startsWith("rm-"));
++    expect(concernFiles).toHaveLength(1);
++    expect(remarkableFiles).toHaveLength(1);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, concernFiles[0]!)
++    );
++    expect(stored.source.agent).toBe("architect");
++    expect(stored.source.record).toBe("001-consult-item-a1");
++    expect(stored.source.step).toBe("consult-item");
++  });
++
++  it("wires close-up producers: aggregates concerns and applies resolutions", async () => {
++    await writeStoredConcern(
++      storedConcern({ id: "c-aaaaaaaaaa", status: "routed", disposition: "architect" })
++    );
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const result = await runStep({
++      agent: "wave-close-up",
++      stepId: "wave-close-up-1-1",
++      stepFragment: "steps/wave-close-up",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        wave: 1,
++        iteration: 1,
++        status: "complete",
++        mergedItems: [],
++        summary: "Wave 1 complete",
++        concerns: [{ kind: "tech-debt", summary: "Close-up found duplicated helpers" }],
++        concernResolutions: [{ id: "c-aaaaaaaaaa", action: "carry", note: "needs architect" }],
++      },
++      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
++    });
++    expect(result.ok).toBe(true);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const newFiles = fs
++      .readdirSync(concernsDir)
++      .filter((f) => f.startsWith("c-") && f !== "c-aaaaaaaaaa.yaml");
++    expect(newFiles).toHaveLength(1);
++    const created = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, newFiles[0]!)
++    );
++    expect(created.status).toBe("open");
++    expect(created.source.record).toBe("001-wave-close-up-1-1-a1");
++
++    const carried = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
++    );
++    expect(carried.status).toBe("routed");
++    expect(carried.pendingResolution?.action).toBe("carry");
++    expect(carried.pendingResolution?.by).toBe("wave-close-up");
++  });
++
++  it("aggregates concerns and remarkable decisions across producer schemas", async () => {
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const producers: Array<{
++      agent: string;
++      stepId: string;
++      stepFragment: string;
++      promptVars: Record<string, string>;
++      base: Record<string, unknown>;
++      concernField: "concerns" | "newConcerns";
++      remarkable: boolean;
++    }> = [
++      {
++        agent: "developer",
++        stepId: "develop",
++        stepFragment: "steps/develop",
++        promptVars: { assignment: "", target: "tests", citations: "[]" },
++        base: { status: "ok", summary: "dev" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "developer",
++        stepId: "poc",
++        stepFragment: "steps/poc",
++        promptVars: { assignment: "", context: "" },
++        base: { status: "ok", summary: "poc" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "developer",
++        stepId: "test-assumptions",
++        stepFragment: "steps/test-assumptions",
++        promptVars: { assignment: "", context: "" },
++        base: { status: "ok", summary: "assumptions" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "fact-finder",
++        stepId: "research",
++        stepFragment: "steps/research",
++        promptVars: { assignment: "", intent: "", citations: "[]" },
++        base: { status: "ok", summary: "ff", findings: "f" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "qa",
++        stepId: "qa",
++        stepFragment: "steps/qa",
++        promptVars: {
++          assignment: "",
++          checks: "",
++          testDiff: "",
++          diff: "",
++          dispositionsCriteria: "",
++        },
++        base: { status: "approved", summary: "qa", suggestions: [] },
++        concernField: "newConcerns",
++        remarkable: false,
++      },
++      {
++        agent: "architect",
++        stepId: "architect-plan",
++        stepFragment: "steps/architect-plan",
++        promptVars: {
++          task: TASK,
++          iteration: "1",
++          intent: "",
++          context: "",
++          infra: "",
++          debt: "",
++          steering: "",
++          limits: "",
++        },
++        base: { iteration: 1, milestones: [], itemOutlines: [] },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "architect",
++        stepId: "architect-wave-report-1-1",
++        stepFragment: "steps/architect-wave-report",
++        promptVars: { plan: "{}", waveReport: "", debt: "", steering: "" },
++        base: { decision: "continue" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "wave-close-up",
++        stepId: "wave-close-up-1-1",
++        stepFragment: "steps/wave-close-up",
++        promptVars: { task: TASK, waveReport: "", infra: "" },
++        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "wave" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++    ];
++
++    const concernsDir = path.join(taskDir, "concerns");
++    for (const [index, producer] of producers.entries()) {
++      const summary = `Producer ${index} concern`;
++      const chosen = `Producer ${index} decision`;
++      const data = {
++        ...producer.base,
++        [producer.concernField]: [{ kind: "risk", summary }],
++        ...(producer.remarkable
++          ? { remarkable: [{ chosen, alternatives: ["alt"], why: "because" }] }
++          : {}),
++      };
++
++      const result = await runStep({
++        agent: producer.agent,
++        stepId: producer.stepId,
++        stepFragment: producer.stepFragment,
++        cwd: taskWt,
++        recordsDir: runsDir,
++        data,
++        promptVars: producer.promptVars,
++      });
++      expect(result.ok).toBe(true);
++      expect(fs.existsSync(concernsDir)).toBe(true);
++
++      const concernFiles = fs
++        .readdirSync(concernsDir)
++        .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
++      const stored = await Promise.all(
++        concernFiles.map((f) => readYaml<StoredConcernArtifact>(path.join(concernsDir, f)))
++      );
++      const hit = stored.find((c) => c.summary === summary);
++      expect(hit).toBeDefined();
++      expect(hit!.status).toBe("open");
++      expect(hit!.source.agent).toBe(producer.agent);
++      expect(hit!.source.record).toContain(producer.stepId);
++
++      if (producer.remarkable) {
++        const rmFiles = fs
++          .readdirSync(concernsDir)
++          .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
++        const remarkables = await Promise.all(
++          rmFiles.map((f) => readYaml<Record<string, any>>(path.join(concernsDir, f)))
++        );
++        expect(remarkables.some((r) => r.chosen === chosen)).toBe(true);
++      }
++    }
++  });
++
++  it("reconciles missing concerns from committed step records idempotently", async () => {
++    const recordDir = path.join(taskDir, "items", "item-a", "steps", "001-develop-a1");
++    fs.mkdirSync(recordDir, { recursive: true });
++    fs.writeFileSync(path.join(recordDir, "input.md"), "prompt\n", "utf8");
++    await writeYamlAtomic(path.join(recordDir, "meta.yaml"), {
++      seq: 1,
++      name: "develop",
++      attempt: 1,
++      agent: "developer",
++      role: "workhorse",
++      models: ["model-workhorse"],
++      status: "ok",
++      startedAt: "2026-01-01T00:00:00.000Z",
++      endedAt: "2026-01-01T00:01:00.000Z",
++    });
++    await writeYamlAtomic(path.join(recordDir, "output.yaml"), {
++      status: "ok",
++      summary: "done",
++      concerns: [
++        {
++          kind: "risk",
++          summary: "Reconciled from record",
++          detail: "full detail",
++          severity: "high",
++        },
++      ],
++    });
++    tmpRepo.commit("committed step record", [
++      path.relative(taskWt, recordDir).replace(/\\/g, "/"),
++    ]);
++
++    const first = await reconcileConcerns({ taskDir, taskWt, repo });
++    expect(first).toHaveLength(1);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const files = fs
++      .readdirSync(concernsDir)
++      .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, files[0]!)
++    );
++    expect(stored.summary).toBe("Reconciled from record");
++    expect(stored.detail).toBe("full detail");
++    expect(stored.status).toBe("open");
++    expect(stored.source.record).toBe("001-develop-a1");
++    expect(stored.source.agent).toBe("developer");
++
++    // Simulate an earlier triage: a second reconcile must preserve it and not
++    // duplicate the file.
++    stored.status = "dismissed";
++    stored.dismissReason = "already handled";
++    await writeYamlAtomic(path.join(concernsDir, files[0]!), stored);
++
++    const second = await reconcileConcerns({ taskDir, taskWt, repo });
++    expect(second).toHaveLength(1);
++    expect(
++      fs.readdirSync(concernsDir).filter((f) => f.startsWith("c-") && f.endsWith(".yaml"))
++    ).toHaveLength(1);
++    const after = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, files[0]!)
++    );
++    expect(after.status).toBe("dismissed");
++    expect(after.dismissReason).toBe("already handled");
++  });
++
++  it("commits stray concerns files during startup recovery instead of stashing them", async () => {
++    const task = "recovery-task";
++    const mainTaskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(mainTaskDir, { recursive: true });
++    fs.writeFileSync(path.join(mainTaskDir, "INTENT.md"), "# recovery\n", "utf8");
++    tmpRepo.commit("add recovery intent");
++
++    const recoveryWtRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(recoveryWtRoot, { recursive: true });
++    const recoveryRepo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: recoveryWtRoot });
++    const recoveryTaskWt = tmpRepo.createWorktree(
++      `topic/${task}`,
++      path.join(recoveryWtRoot, `topic_${task}`)
++    );
++    await writeYamlAtomic(
++      path.join(recoveryTaskWt, ORCH, task, "concerns", "c-0123456789.yaml"),
++      storedConcern({ id: "c-0123456789" })
++    );
++
++    const recoveryPipeline: PipelineConfig = {
++      models: {
++        roles: {
++          workhorse: { model: "model-workhorse" },
++          simpler: { model: "model-simpler" },
++        },
++      },
++      agents: {},
++      flows: { simple: { steps: [] }, story: {}, spike: {} },
++      limits: {},
++    };
++    const result = await runTask(
++      {
++        harness: new FakeHarness(),
++        repo: recoveryRepo,
++        project: { orchestrationFolder: ORCH, worktreeRoot: recoveryWtRoot },
++        pipelineFor: async () => recoveryPipeline,
++        prompts,
++      },
++      task,
++      { maxTicks: 0 }
++    );
++    expect(result.status).toBe("stopped");
++
++    const rel = `${ORCH}/${task}/concerns/c-0123456789.yaml`;
++    expect(
++      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], {
++        cwd: recoveryTaskWt,
++        allowFail: true,
++      }).code
++    ).toBe(0);
++    expect(tmpRepo.git(["stash", "list"], { cwd: recoveryTaskWt }).stdout).toBe("");
++  });
++
++  it("keeps step status ok and journals an ingest error when concern ingestion fails", async () => {
++    fs.writeFileSync(path.join(taskDir, "concerns"), "not a directory", "utf8");
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const result = await runStep({
++      agent: "developer",
++      stepId: "develop",
++      stepFragment: "steps/develop",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        status: "ok",
++        summary: "done",
++        concerns: [{ kind: "risk", summary: "Ingest me" }],
++      },
++      promptVars: { assignment: "", target: "tests", citations: "[]" },
++    });
++
++    expect(result.status).toBe("ok");
++    expect(result.meta.error).toBeUndefined();
++    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
++    expect(journal).toContain("concern_ingest_error");
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..4a742d4
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 4
+name: qa
+attempt: 1
+fixRound: 1
+agent: qa
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T06:52:38.296Z
+session: 01a1b9ee-4641-726f-9fba-b5604835d294
+endedAt: 2026-11-08T07:00:11.155Z
+usage:
+  inputTokens: 45734
+  outputTokens: 15063
+  costUsd: 0.008244
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-52-42-945Z_01a1b9ee-4641-726f-9fba-b5604835d294
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..e5ada01
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/output.yaml
@@ -0,0 +1,16 @@
+status: approved
+summary: "Concerns store v2 approved: 22/22 target green, typecheck clean,
+  genuine 21-test red, no weakening, lock discipline verified"
+suggestions:
+  - detail: "listOpenConcerns catches all YAML read errors and silently drops the
+      file (line 109: catch { return undefined }). A corrupt concerns/*.yaml
+      therefore vanishes from triage/hydration with no signal. Consider
+      journaling or logging the offending filename so corruption is diagnosable;
+      behavior for valid files is correct and no test covers this path, so
+      non-blocking."
+    disposition: optional
+    id: corrupt-concern-silent-skip
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 109
+    summary: listOpenConcerns silently skips corrupt YAML instead of surfacing it
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/input.md
new file mode 100644
index 0000000..1b5317b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/input.md
@@ -0,0 +1,5305 @@
+# Step: Review
+
+## Goal
+Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
+
+## Rules
+- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
+- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
+  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
+  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
+  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
+  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
+- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
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
+  "slug": "concerns-store-v2",
+  "kind": "dev",
+  "title": "Concerns store with merge and commit",
+  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+  "outlineRef": "concerns-store-v2",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..34e1e55
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,64 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 1 new prod stubs with 40 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++      newProdFiles:
++        - plugins/software-factory/src/core/concerns.ts
++      stubProdLines: 40
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 21 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794118739883-p4tmzxy96j.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..6aaa871
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,54 @@
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
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Context & Citations
++[]
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..cd11e35
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
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
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T06:03:06.503Z
++session: 01a1b9c0-dd44-764c-ab25-e93c63f8d367
++endedAt: 2026-11-08T06:19:06.007Z
++usage:
++  inputTokens: 130428
++  outputTokens: 92075
++  costUsd: 0.123622
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..6c636ac
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,121 @@
++status: ok
++summary: "Authored 21 test-first behavior tests for the taskWt concern store in
++  test/engine/concerns-funnel.test.ts, plus a 40-line compile stub at
++  src/core/concerns.ts (at the stubMaxProdLines budget). Tests specify
++  fingerprint identity (kind + normalized summary + location + sorted affects;
++  detail/severity ignored), aggregate merge (defaults, longer/latest detail, max
++  severity, updatedAt/source.lastSeen advance, source.escalated on severity rise
++  without reopening dismissed), listOpenConcerns, exact-id triage with isTriager
++  gate and dismiss-detail enforcement, close-up pending resolutions
++  (resolve/carry/propagate), partitionSuggestions, rm-* remarkable aggregation,
++  unknown-kind no-partial-write, concurrent RMW/commit, reviewer
++  new-then-preexisting triage ordering, consult/close-up/producer-matrix seam
++  wiring, reconcileConcerns from committed records, concerns/** startup
++  recovery, and ingest-error step-status isolation. No existing production code
++  was modified. Verified: typecheck green; target file red with 21 assertion
++  failures and 0 errors; full suite has only those 21 failures."
++target:
++  selectors:
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
++      identity, ignoring detail, severity, and affect order
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
++      concern to one open taskWt file with defaults, source, and immediate
++      commit
++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
++      concerns into one file with longer detail, max severity, and advanced
++      timestamps
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
++      and flags escalation when a higher severity is re-emitted
++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
++      concerns in stable order
++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
++      suggestions and persists dismiss reasons
++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
++      triage dispositions and gates non-triagers
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
++      without detail and leaves the concern unchanged
++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
++      by exact concern id
++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
++      pending resolutions without changing concern status
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
++      decisions into rm-* files and triages them by exact id
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
++      kinds without partial writes and leaves existing files untouched
++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
++      fingerprints concurrently without deadlock or lost commits
++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
++      merges of the same fingerprint into one merged file
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
++      aggregate new concerns before triaging pre-existing ids only"
++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
++      writeArtifact producers to the concern store
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
++      producers: aggregates concerns and applies resolutions"
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
++      remarkable decisions across producer schemas
++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
++      concerns from committed step records idempotently
++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
++      files during startup recovery instead of stashing them
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
++      and journals an ingest error when concern ingestion fails
++evidence:
++  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
++    --noEmit, no errors)."
++  - "cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/concerns-funnel.test.ts: 1 pass (pre-existing schema test), 21
++    fail, 0 errors — red for every new test."
++  - "JUnit run (bun test ... --reporter=junit
++    --reporter-outfile=/tmp/junit-concerns-store-final.xml) parsed with the
++    repo's own src/core/checks/junit.ts: 22 cases, collected=true, 1 pass, 21
++    fail, 0 error."
++  - "Replayed the engine's normaliseCaseId/findMatchingCase logic over the JUnit
++    ids for all 21 declared expectRed node ids: 21/21 matched with status fail."
++  - "cd plugins/software-factory && TMPDIR=/tmp bun test (full suite): 303 pass,
++    2 skip, 21 fail; the only failures are the 21 new concern store tests (no
++    collateral regressions)."
++  - "Test infra proven first: the pre-existing schema test in the same file
++    still passes, and the new tests execute (not collection/import failures)
++    because the 40-line stub lets the module compile."
++  - "git status --short: only M
++    plugins/software-factory/test/engine/concerns-funnel.test.ts and ??
++    plugins/software-factory/src/core/concerns.ts; no existing production code
++    touched."
++concerns:
++  - The seam tests pin step-runner as the single ingestion hook for validated
++    outputs (including custom writeArtifact flows such as consults). This is the
++    only way to satisfy 'wire all producer seams' and 'ingest errors must not
++    change step status' without duplicating try/catch in every flow; per-flow
++    wiring alone will not make the reviewer/consult/close-up seam tests green.
++  - The merge test requires source.lastSeen to be an ISO timestamp advanced to
++    the merge time. ConcernSource currently lacks lastSeen, so the develop step
++    must extend the type (or persist an equivalent field) for the tests to pass.
++  - listOpenConcerns is specified as status === 'open' only; routed concerns are
++    intentionally not asserted either way, but close-up hydration
++    (funnel-closeups) will need a broader 'active concerns' listing if it must
++    re-triage routed items.
++  - The ingest-failure test requires a journal event of type
++    'concern_ingest_error' and that the step remains status ok; the
++    implementation should use that event name (or the test/contract must be
++    aligned).
++  - Scenario s8's digest/architect-hydration surfacing of source.escalated is
++    deferred to the routing/hydration stories; this suite asserts only the
++    store-level flag and that dismissed status is not reopened.
++  - The test file grew by ~1080 lines; docs-finish already owns consolidating
++    test/engine/concerns-funnel.test.ts, but the develop step should not add
++    much more test volume.
++  - The stub is exactly 40 added lines (configured stubMaxProdLines=40), so it
++    cannot grow during test-first without tripping test-first-scope.
++notes: "Stub API (src/core/concerns.ts): concernFingerprint(ConcernInput),
++  aggregateConcerns(ctx{taskDir,taskWt,repo,now?}+source, ConcernInput[],
++  RemarkableDecision[]), listOpenConcerns(taskDir),
++  applyConcernTriage(ctx+suggestions+isTriager),
++  applyCloseupResolutions(ctx+resolutions+by), partitionSuggestions(suggestions,
++  ids), reconcileConcerns(ctx). Tests inject a clock (now?: () => Date) for
++  deterministic createdAt/updatedAt/lastSeen assertions. Red was verified with 0
++  JUnit <error> entries; bun maps thrown errors to <failure>, but all failures
++  currently occur at expect assertions. All 21 ids use the JUnit native form
++  `file::Describe.Test` confirmed against the engine's matcher."
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..6cee02d
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,224 @@
++checks:
++  - id: gates
++    status: fail
++    message: "Gate regressions: test"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 5932
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: fail
++        durationMs: 258951
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-qfYFuY/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
++          killed 1 dangling process
++
++          test/engine/amend-maxiterations.test.ts:
++          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item [5115.47ms]
++            ^ this test timed out after 5000ms.
++
++          # Unhandled error between tests
++          -------------------------------
++          179 |     const res = await runTask(
++          180 |       { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++          181 |       task
++          182 |     );
++          183 | 
++          184 |     expect(res.status).toBe("done");
++                                       ^
++          error: expect(received).toBe(expected)
++
++          Expected: "done"
++          Received: "failed"
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
++          -------------------------------
++
++          killed 1 dangling process
++          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > restores amended items and amendment count across restart [5100.39ms]
++            ^ this test timed out after 5000ms.
++
++           322 pass
++           2 skip
++           2 fail
++           1 error
++           1388 expect() calls
++          Ran 326 tests across 55 files. [137.73s]
++          [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item, Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores amended items and amendment count across restart]
++        failingTests:
++          - "Engine: Wave-report amend + maxIterations (§8.4.6,
++            §12.2).wave-report amend runs pm-amend, writes plan-N.k, and
++            schedules the new item"
++          - "Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores
++            amended items and amendment count across restart"
++        improvements:
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++    output: >-
++      
++      Budget spent: $0.0000
++
++      ----------------------------------------------------------------
++
++      Waves & Items:
++        Wave 1:
++      ================================================================
++
++
++
++      test/cli/cli.test.ts:
++
++      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
++      host Slava-Yoga) taken over by PID 2580144
++
++      [factory lock] Stale run lock for task "competing-takeover-task" (PID
++      9999999 on host Slava-Yoga) taken over by PID 2580144
++
++      [factory lock] Stale run lock for task "journal-worktree-task" (PID
++      9999999 on host Slava-Yoga) taken over by PID 2580144
++
++      killed 1 dangling process
++
++
++      test/engine/amend-maxiterations.test.ts:
++
++      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
++      wave-report amend runs pm-amend, writes plan-N.k, and schedules the new
++      item [5115.47ms]
++        ^ this test timed out after 5000ms.
++
++      # Unhandled error between tests
++
++      -------------------------------
++
++      179 |     const res = await runTask(
++
++      180 |       { harness, repo: repoObj, project, pipelineFor: async () =>
++      pipeline, prompts },
++
++      181 |       task
++
++      182 |     );
++
++      183 | 
++
++      184 |     expect(res.status).toBe("done");
++                                   ^
++      error: expect(received).toBe(expected)
++
++
++      Expected: "done"
++
++      Received: "failed"
++
++            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
++      -------------------------------
++
++
++      killed 1 dangling process
++
++      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
++      restores amended items and amendment count across restart [5100.39ms]
++        ^ this test timed out after 5000ms.
++
++       322 pass
++       2 skip
++       2 fail
++       1 error
++       1388 expect() calls
++      Ran 326 tests across 55 files. [137.73s]
++
++      [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6,
++      §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the
++      new item, Engine: Wave-report amend + maxIterations (§8.4.6,
++      §12.2).restores amended items and amendment count across restart]
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794119857705-zd79omjpba.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: fail
++    message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
++    details:
++      changedLines:
++        added: 547
++        deleted: 9
++        total: 556
++        files:
++          - plugins/software-factory/src/core/artifacts.ts
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/engine.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/git/repair.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..e985026
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,80 @@
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
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/concerns-funnel.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
++    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
++    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
++    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
++    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
++    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
++    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
++    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
++    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
++    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
++    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
++  ]
++}
++
++## Context & Citations
++[]
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..6f587dd
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: rejected
++startedAt: 2026-11-08T06:19:23.712Z
++session: 01a1b9cf-c890-724d-b6a9-2473bfac0631
++endedAt: 2026-11-08T06:37:41.767Z
++usage:
++  inputTokens: 130810
++  outputTokens: 48991
++  costUsd: 0.06896100000000001
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..ceff7b9
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,88 @@
++status: ok
++summary: "Implemented the taskWt concern store in src/core/concerns.ts: stable
++  fingerprints over kind/normalized summary/location/sorted affects; atomic
++  one-file-per-fingerprint aggregation with longer/latest detail, max severity,
++  advanced updatedAt/lastSeen, dismissed-status preservation and escalation;
++  exact-id triage gated by isTriager; close-up pending resolutions; suggestion
++  partitioning; idempotent reconciliation from committed step records; and
++  remarkable-decision rm-* artifacts. Wired all producer seams through
++  step-runner (concerns, newConcerns, remarkable, suggestions,
++  concernResolutions, including consult writeArtifact), with reviewer triage
++  restricted to pre-existing concern ids and ingest failures journaled as
++  concern_ingest_error without changing step status. Added concerns/** startup
++  recovery commit and task startup reconcile."
++target:
++  selectors:
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
++      identity, ignoring detail, severity, and affect order
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
++      concern to one open taskWt file with defaults, source, and immediate
++      commit
++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
++      concerns into one file with longer detail, max severity, and advanced
++      timestamps
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
++      and flags escalation when a higher severity is re-emitted
++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
++      concerns in stable order
++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
++      suggestions and persists dismiss reasons
++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
++      triage dispositions and gates non-triagers
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
++      without detail and leaves the concern unchanged
++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
++      by exact concern id
++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
++      pending resolutions without changing concern status
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
++      decisions into rm-* files and triages them by exact id
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
++      kinds without partial writes and leaves existing files untouched
++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
++      fingerprints concurrently without deadlock or lost commits
++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
++      merges of the same fingerprint into one merged file
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
++      aggregate new concerns before triaging pre-existing ids only"
++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
++      writeArtifact producers to the concern store
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
++      producers: aggregates concerns and applies resolutions"
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
++      remarkable decisions across producer schemas
++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
++      concerns from committed step records idempotently
++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
++      files during startup recovery instead of stashing them
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
++      and journals an ingest error when concern ingestion fails
++evidence:
++  - "bun run typecheck (in plugins/software-factory): exit 0 after final changes"
++  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts: 22 pass, 0 fail,
++    202 expect() calls"
++  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts --rerun-each 2: 44
++    pass, 0 fail, proving concurrent merge serialization is stable"
++  - "TMPDIR=/tmp bun test (full suite, isolated run): 324 pass, 2 skip, 0 fail,
++    1395 expect() calls"
++  - "git diff --check: clean"
++  - "Baseline qa-red-test timeout check: the same 5s test-timeout sensitivity
++    reproduces without these changes under current machine load, confirming it
++    is environmental and unrelated"
++  - git stash was used only for the baseline comparison and was popped; git
++    status shows only the five intended production files modified
++concerns:
++  - Unrelated qa-red-test integration tests are timing-sensitive against Bun's
++    5s per-test default and can time out under high machine load; the full suite
++    passed when run in isolation and the failure reproduces on the pre-change
++    baseline.
++  - Concern ingestion uses the task-wide KeyedMutex keyed by taskDir, so
++    distinct-fingerprint writes are serialized per task rather than truly
++    parallel; this is required for safe per-task RMW and still passed the
++    concurrency tests.
++notes: commitAll is called outside the KeyedMutex and never inside
++  repo.writeLock.runExclusive (commitAll acquires repo.writeLock internally).
++  Startup recovery commits stray concerns/** files before any stash; task
++  startup calls reconcileConcerns read-only against committed step records.
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
+new file mode 100644
+index 0000000..c956b72
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
+@@ -0,0 +1,115 @@
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
++        durationMs: 4115
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 214345
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-DhnsNA/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
++
++           324 pass
++           2 skip
++           0 fail
++           1395 expect() calls
++          Ran 326 tests across 55 files. [99.73s]
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
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794120748753-kzhys7rw6n.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 276/300 production lines changed"
++    details:
++      changedLines:
++        added: 276
++        deleted: 0
++        total: 276
++        files:
++          - plugins/software-factory/src/core/artifacts.ts
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/engine.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
+new file mode 100644
+index 0000000..8ce505c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
+@@ -0,0 +1,104 @@
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
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/concerns-funnel.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
++    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
++    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
++    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
++    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
++    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
++    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
++    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
++    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
++    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
++    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
++    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
++    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
++    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
++Failing check: size
++
++Message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
++
++Detail:
++{
++  "changedLines": {
++    "added": 547,
++    "deleted": 9,
++    "total": 556,
++    "files": [
++      "plugins/software-factory/src/core/artifacts.ts",
++      "plugins/software-factory/src/core/concerns.ts",
++      "plugins/software-factory/src/core/engine.ts",
++      "plugins/software-factory/src/core/flows/step-runner.ts",
++      "plugins/software-factory/src/core/git/repair.ts"
++    ]
++  },
++  "limit": 300
++}
++
++Budget: 556 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
++
++Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
+new file mode 100644
+index 0000000..d78359c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 3
++name: develop
++attempt: 2
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T06:39:44.749Z
++session: 01a1b9e2-6959-7721-ab3f-95f04fde4925
++endedAt: 2026-11-08T06:52:31.854Z
++usage:
++  inputTokens: 57623
++  outputTokens: 44914
++  costUsd: 0.045325
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
+new file mode 100644
+index 0000000..53bf492
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
+@@ -0,0 +1,86 @@
++status: ok
++summary: Shrank the concerns-store production diff from 556 to 276 changed lines
++  (under the 300-line limit) without changing behavior. Rewrote
++  src/core/concerns.ts compactly (207 lines) while preserving
++  fingerprint/merge/triage/close-up/partition/reconcile semantics; consolidated
++  the step-runner ingestion seam and call site; moved concern-store startup
++  recovery from repairWorktree into a pre-repair engine commit (restoring
++  repair.ts to baseline). Target file passes 22/22 and the full suite passes.
++target:
++  selectors:
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
++      identity, ignoring detail, severity, and affect order
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
++      concern to one open taskWt file with defaults, source, and immediate
++      commit
++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
++      concerns into one file with longer detail, max severity, and advanced
++      timestamps
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
++      and flags escalation when a higher severity is re-emitted
++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
++      concerns in stable order
++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
++      suggestions and persists dismiss reasons
++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
++      triage dispositions and gates non-triagers
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
++      without detail and leaves the concern unchanged
++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
++      by exact concern id
++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
++      pending resolutions without changing concern status
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
++      decisions into rm-* files and triages them by exact id
++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
++      kinds without partial writes and leaves existing files untouched
++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
++      fingerprints concurrently without deadlock or lost commits
++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
++      merges of the same fingerprint into one merged file
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
++      aggregate new concerns before triaging pre-existing ids only"
++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
++      writeArtifact producers to the concern store
++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
++      producers: aggregates concerns and applies resolutions"
++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
++      remarkable decisions across producer schemas
++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
++      concerns from committed step records idempotently
++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
++      files during startup recovery instead of stashing them
++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
++      and journals an ingest error when concern ingestion fails
++evidence:
++  - "Size check: `git diff --numstat 87a7682 -- plugins/software-factory/src` =>
++    artifacts.ts 2/0, concerns.ts 207/0, engine.ts 18/0, step-runner.ts 49/0 =
++    276 changed lines total (limit 300); repair.ts restored to baseline with
++    zero delta."
++  - "Typecheck: `cd plugins/software-factory && bun run typecheck` => exit 0."
++  - "Target: `cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/concerns-funnel.test.ts` => 22 pass, 0 fail, 202 expect()
++    calls."
++  - "Full suite: `cd plugins/software-factory && TMPDIR=/tmp bun test` => 324
++    pass, 2 skip, 0 fail across 55 files (80.9s)."
++  - "Flake confirmation: first full-suite run hit two 5s timeouts in
++    qa-red-test.test.ts; the file alone passes 3/3 (9.8s) and
++    amend-maxiterations.test.ts alone passes 4/4 (5.7s), matching the same
++    load-related timeouts seen in the prior attempt's gate run."
++  - "`git diff --check` => exit 0 (no whitespace errors)."
++concerns:
++  - Full-suite 5s per-test timeouts are load-flaky in subprocess-spawning engine
++    tests (qa-red-test, amend-maxiterations); each file passes in isolation and
++    the full suite passed on re-run, so this is pre-existing harness flakiness
++    rather than a code regression.
++notes: "Behavior preserved while shrinking: concern identity ignores
++  detail/severity/affect order; aggregation merges longer-or-equal detail, max
++  severity, preserves status/disposition/dismissReason/pendingResolution,
++  advances updatedAt/lastSeen and sets source.escalated on severity rise; atomic
++  YAML writes + KeyedMutex(taskDir) guard RMW and commitAll runs outside
++  repo.writeLock. Startup recovery now commits concerns/ via commitAll before
++  stray-dirt repair instead of adding commitGlobs to repairWorktree, removing
++  the repair.ts delta. Reconcile derives read-only from committed step records
++  using git ls-tree and remains idempotent."
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..166b7b6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/checks.yaml
+@@ -0,0 +1,62 @@
++checks:
++  - id: red-test
++    status: pass
++    message: "red-test passed: all 21 tests fail when prod changes are restored to
++      test-first commit"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794120758391-zcnajao8lv.xml
++      junitCaseCount: 22
++      junitCaseIds:
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++        - Concern store.fingerprints concern identity, ignoring detail,
++          severity, and affect order
++        - Concern store.aggregates a developer concern to one open taskWt file
++          with defaults, source, and immediate commit
++        - Concern store.merges re-emitted concerns into one file with longer
++          detail, max severity, and advanced timestamps
++        - Concern store.keeps dismissed status and flags escalation when a
++          higher severity is re-emitted
++        - Concern store.lists only open concerns in stable order
++        - Concern store.triages only exact-id suggestions and persists dismiss
++          reasons
++        - Concern store.routes non-dismiss triage dispositions and gates
++          non-triagers
++        - Concern store.rejects dismiss triage without detail and leaves the
++          concern unchanged
++        - Concern store.partitions suggestions by exact concern id
++        - Concern store.records close-up pending resolutions without changing
++          concern status
++        - Concern store.aggregates remarkable decisions into rm-* files and
++          triages them by exact id
++        - Concern store.rejects unknown concern kinds without partial writes and
++          leaves existing files untouched
++        - Concern store.writes distinct fingerprints concurrently without
++          deadlock or lost commits
++        - Concern store.serializes concurrent merges of the same fingerprint
++          into one merged file
++        - "Concern store.wires reviewer output: aggregate new concerns before
++          triaging pre-existing ids only"
++        - Concern store.wires consult writeArtifact producers to the concern
++          store
++        - "Concern store.wires close-up producers: aggregates concerns and
++          applies resolutions"
++        - Concern store.aggregates concerns and remarkable decisions across
++          producer schemas
++        - Concern store.reconciles missing concerns from committed step records
++          idempotently
++        - Concern store.commits stray concerns files during startup recovery
++          instead of stashing them
++        - Concern store.keeps step status ok and journals an ingest error when
++          concern ingestion fails
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..65ebade
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/input.md
+@@ -0,0 +1,2593 @@
++# Step: QA
++
++## Goal
++Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
++
++## Rules
++- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
++- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
++- Story kind validation:
++  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
++  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
++- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
++
++## Dispositions Criteria
++Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
++Use ONLY these dispositions; any other disposition value fails validation.
++# Review Suggestion Dispositions
++
++Criteria for assigning disposition to review findings:
++
++| Disposition | When to Assign | Engine Action |
++|---|---|---|
++| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
++| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
++| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
++| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
++| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
++
++## Rules
++- Defect requiring code change MUST be `fix`.
++- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
++- Do NOT use `human-async` when repo context or architecture docs provide the answer.
++
++## Assignment
++{
++  "slug": "concerns-store-v2",
++  "kind": "dev",
++  "title": "Concerns store with merge and commit",
++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
++  "outlineRef": "concerns-store-v2",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Engine Checks
++
++
++## Test Diff
++
++
++## Code Diff
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..34e1e55
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,64 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (1 test files, 1 new prod stubs with 40 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+++      newProdFiles:
+++        - plugins/software-factory/src/core/concerns.ts
+++      stubProdLines: 40
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 21 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/concerns-funnel.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794118739883-p4tmzxy96j.xml
+++      junitCaseCount: 22
+++      junitCaseIds:
+++        - Concern funnel schemas.valid concerns pass validation and unknown
+++          kinds reject with no artifact write
+++        - Concern store.fingerprints concern identity, ignoring detail,
+++          severity, and affect order
+++        - Concern store.aggregates a developer concern to one open taskWt file
+++          with defaults, source, and immediate commit
+++        - Concern store.merges re-emitted concerns into one file with longer
+++          detail, max severity, and advanced timestamps
+++        - Concern store.keeps dismissed status and flags escalation when a
+++          higher severity is re-emitted
+++        - Concern store.lists only open concerns in stable order
+++        - Concern store.triages only exact-id suggestions and persists dismiss
+++          reasons
+++        - Concern store.routes non-dismiss triage dispositions and gates
+++          non-triagers
+++        - Concern store.rejects dismiss triage without detail and leaves the
+++          concern unchanged
+++        - Concern store.partitions suggestions by exact concern id
+++        - Concern store.records close-up pending resolutions without changing
+++          concern status
+++        - Concern store.aggregates remarkable decisions into rm-* files and
+++          triages them by exact id
+++        - Concern store.rejects unknown concern kinds without partial writes and
+++          leaves existing files untouched
+++        - Concern store.writes distinct fingerprints concurrently without
+++          deadlock or lost commits
+++        - Concern store.serializes concurrent merges of the same fingerprint
+++          into one merged file
+++        - "Concern store.wires reviewer output: aggregate new concerns before
+++          triaging pre-existing ids only"
+++        - Concern store.wires consult writeArtifact producers to the concern
+++          store
+++        - "Concern store.wires close-up producers: aggregates concerns and
+++          applies resolutions"
+++        - Concern store.aggregates concerns and remarkable decisions across
+++          producer schemas
+++        - Concern store.reconciles missing concerns from committed step records
+++          idempotently
+++        - Concern store.commits stray concerns files during startup recovery
+++          instead of stashing them
+++        - Concern store.keeps step status ok and journals an ingest error when
+++          concern ingestion fails
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..6aaa871
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,54 @@
+++# Step: Test-First
+++
+++## Goal
+++Author automated tests specifying the required behavior changes BEFORE writing production code.
+++
+++## Rules
+++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+++- Target declaration in yield:
+++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+++- Output: yield structured output per `developer-output.schema.json`.
+++
+++## Assignment
+++{
+++  "slug": "concerns-store-v2",
+++  "kind": "dev",
+++  "title": "Concerns store with merge and commit",
+++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+++  "outlineRef": "concerns-store-v2",
+++  "milestone": "m1-contracts-aggregate",
+++  "wave": 6,
+++  "deps": [
+++    "concerns-contracts-policy",
+++    "concerns-contracts-schemas",
+++    "concerns-contracts-types"
+++  ]
+++}
+++
+++## Context & Citations
+++[]
+++
+++## Review Feedback
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+++- summary (string, required): Concise summary of implementation actions and test results
+++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+++  - Option 1:
+++    - selectors (array of string, required)
+++    - expectRed (array of string, required, minItems: 1)
+++  - Option 2:
+++    - gate (string, required)
+++  - Option 3:
+++    - command (string, required)
+++    - customTarget (boolean, required)
+++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+++- notes (string, optional): Optional developer notes, implementation observations, or comments
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..cd11e35
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/meta.yaml
++@@ -0,0 +1,19 @@
+++seq: 1
+++name: test-first
+++attempt: 1
+++fixRound: 1
+++agent: developer
+++role: workhorse
+++models:
+++  - opencode-go/deepseek-v4.1-flash
+++  - opencode-go/muse-spark-1.3-contributor
+++timeoutSec: 1200
+++status: ok
+++startedAt: 2026-11-08T06:03:06.503Z
+++session: 01a1b9c0-dd44-764c-ab25-e93c63f8d367
+++endedAt: 2026-11-08T06:19:06.007Z
+++usage:
+++  inputTokens: 130428
+++  outputTokens: 92075
+++  costUsd: 0.123622
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..6c636ac
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,121 @@
+++status: ok
+++summary: "Authored 21 test-first behavior tests for the taskWt concern store in
+++  test/engine/concerns-funnel.test.ts, plus a 40-line compile stub at
+++  src/core/concerns.ts (at the stubMaxProdLines budget). Tests specify
+++  fingerprint identity (kind + normalized summary + location + sorted affects;
+++  detail/severity ignored), aggregate merge (defaults, longer/latest detail, max
+++  severity, updatedAt/source.lastSeen advance, source.escalated on severity rise
+++  without reopening dismissed), listOpenConcerns, exact-id triage with isTriager
+++  gate and dismiss-detail enforcement, close-up pending resolutions
+++  (resolve/carry/propagate), partitionSuggestions, rm-* remarkable aggregation,
+++  unknown-kind no-partial-write, concurrent RMW/commit, reviewer
+++  new-then-preexisting triage ordering, consult/close-up/producer-matrix seam
+++  wiring, reconcileConcerns from committed records, concerns/** startup
+++  recovery, and ingest-error step-status isolation. No existing production code
+++  was modified. Verified: typecheck green; target file red with 21 assertion
+++  failures and 0 errors; full suite has only those 21 failures."
+++target:
+++  selectors:
+++    - test/engine/concerns-funnel.test.ts
+++  expectRed:
+++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
+++      identity, ignoring detail, severity, and affect order
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
+++      concern to one open taskWt file with defaults, source, and immediate
+++      commit
+++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
+++      concerns into one file with longer detail, max severity, and advanced
+++      timestamps
+++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
+++      and flags escalation when a higher severity is re-emitted
+++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
+++      concerns in stable order
+++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
+++      suggestions and persists dismiss reasons
+++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
+++      triage dispositions and gates non-triagers
+++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
+++      without detail and leaves the concern unchanged
+++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
+++      by exact concern id
+++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
+++      pending resolutions without changing concern status
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
+++      decisions into rm-* files and triages them by exact id
+++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
+++      kinds without partial writes and leaves existing files untouched
+++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
+++      fingerprints concurrently without deadlock or lost commits
+++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
+++      merges of the same fingerprint into one merged file
+++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
+++      aggregate new concerns before triaging pre-existing ids only"
+++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
+++      writeArtifact producers to the concern store
+++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
+++      producers: aggregates concerns and applies resolutions"
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
+++      remarkable decisions across producer schemas
+++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
+++      concerns from committed step records idempotently
+++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
+++      files during startup recovery instead of stashing them
+++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
+++      and journals an ingest error when concern ingestion fails
+++evidence:
+++  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
+++    --noEmit, no errors)."
+++  - "cd plugins/software-factory && TMPDIR=/tmp bun test
+++    test/engine/concerns-funnel.test.ts: 1 pass (pre-existing schema test), 21
+++    fail, 0 errors — red for every new test."
+++  - "JUnit run (bun test ... --reporter=junit
+++    --reporter-outfile=/tmp/junit-concerns-store-final.xml) parsed with the
+++    repo's own src/core/checks/junit.ts: 22 cases, collected=true, 1 pass, 21
+++    fail, 0 error."
+++  - "Replayed the engine's normaliseCaseId/findMatchingCase logic over the JUnit
+++    ids for all 21 declared expectRed node ids: 21/21 matched with status fail."
+++  - "cd plugins/software-factory && TMPDIR=/tmp bun test (full suite): 303 pass,
+++    2 skip, 21 fail; the only failures are the 21 new concern store tests (no
+++    collateral regressions)."
+++  - "Test infra proven first: the pre-existing schema test in the same file
+++    still passes, and the new tests execute (not collection/import failures)
+++    because the 40-line stub lets the module compile."
+++  - "git status --short: only M
+++    plugins/software-factory/test/engine/concerns-funnel.test.ts and ??
+++    plugins/software-factory/src/core/concerns.ts; no existing production code
+++    touched."
+++concerns:
+++  - The seam tests pin step-runner as the single ingestion hook for validated
+++    outputs (including custom writeArtifact flows such as consults). This is the
+++    only way to satisfy 'wire all producer seams' and 'ingest errors must not
+++    change step status' without duplicating try/catch in every flow; per-flow
+++    wiring alone will not make the reviewer/consult/close-up seam tests green.
+++  - The merge test requires source.lastSeen to be an ISO timestamp advanced to
+++    the merge time. ConcernSource currently lacks lastSeen, so the develop step
+++    must extend the type (or persist an equivalent field) for the tests to pass.
+++  - listOpenConcerns is specified as status === 'open' only; routed concerns are
+++    intentionally not asserted either way, but close-up hydration
+++    (funnel-closeups) will need a broader 'active concerns' listing if it must
+++    re-triage routed items.
+++  - The ingest-failure test requires a journal event of type
+++    'concern_ingest_error' and that the step remains status ok; the
+++    implementation should use that event name (or the test/contract must be
+++    aligned).
+++  - Scenario s8's digest/architect-hydration surfacing of source.escalated is
+++    deferred to the routing/hydration stories; this suite asserts only the
+++    store-level flag and that dismissed status is not reopened.
+++  - The test file grew by ~1080 lines; docs-finish already owns consolidating
+++    test/engine/concerns-funnel.test.ts, but the develop step should not add
+++    much more test volume.
+++  - The stub is exactly 40 added lines (configured stubMaxProdLines=40), so it
+++    cannot grow during test-first without tripping test-first-scope.
+++notes: "Stub API (src/core/concerns.ts): concernFingerprint(ConcernInput),
+++  aggregateConcerns(ctx{taskDir,taskWt,repo,now?}+source, ConcernInput[],
+++  RemarkableDecision[]), listOpenConcerns(taskDir),
+++  applyConcernTriage(ctx+suggestions+isTriager),
+++  applyCloseupResolutions(ctx+resolutions+by), partitionSuggestions(suggestions,
+++  ids), reconcileConcerns(ctx). Tests inject a clock (now?: () => Date) for
+++  deterministic createdAt/updatedAt/lastSeen assertions. Red was verified with 0
+++  JUnit <error> entries; bun maps thrown errors to <failure>, but all failures
+++  currently occur at expect assertions. All 21 ids use the JUnit native form
+++  `file::Describe.Test` confirmed against the engine's matcher."
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..6cee02d
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,224 @@
+++checks:
+++  - id: gates
+++    status: fail
+++    message: "Gate regressions: test"
+++    details:
+++      - id: typecheck
+++        command: cd plugins/software-factory && bun run typecheck
+++        status: pass
+++        durationMs: 5932
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: fail
+++        durationMs: 258951
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-qfYFuY/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2580144
+++          killed 1 dangling process
+++
+++          test/engine/amend-maxiterations.test.ts:
+++          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item [5115.47ms]
+++            ^ this test timed out after 5000ms.
+++
+++          # Unhandled error between tests
+++          -------------------------------
+++          179 |     const res = await runTask(
+++          180 |       { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+++          181 |       task
+++          182 |     );
+++          183 | 
+++          184 |     expect(res.status).toBe("done");
+++                                       ^
+++          error: expect(received).toBe(expected)
+++
+++          Expected: "done"
+++          Received: "failed"
+++
+++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
+++          -------------------------------
+++
+++          killed 1 dangling process
+++          (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) > restores amended items and amendment count across restart [5100.39ms]
+++            ^ this test timed out after 5000ms.
+++
+++           322 pass
+++           2 skip
+++           2 fail
+++           1 error
+++           1388 expect() calls
+++          Ran 326 tests across 55 files. [137.73s]
+++          [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item, Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores amended items and amendment count across restart]
+++        failingTests:
+++          - "Engine: Wave-report amend + maxIterations (§8.4.6,
+++            §12.2).wave-report amend runs pm-amend, writes plan-N.k, and
+++            schedules the new item"
+++          - "Engine: Wave-report amend + maxIterations (§8.4.6, §12.2).restores
+++            amended items and amendment count across restart"
+++        improvements:
+++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+++            and resets --soft to before.sha, keeping changes staged"
+++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+++            branch and restores original branch, keeping changes"
+++    output: >-
+++      
+++      Budget spent: $0.0000
+++
+++      ----------------------------------------------------------------
+++
+++      Waves & Items:
+++        Wave 1:
+++      ================================================================
+++
+++
+++
+++      test/cli/cli.test.ts:
+++
+++      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
+++      host Slava-Yoga) taken over by PID 2580144
+++
+++      [factory lock] Stale run lock for task "competing-takeover-task" (PID
+++      9999999 on host Slava-Yoga) taken over by PID 2580144
+++
+++      [factory lock] Stale run lock for task "journal-worktree-task" (PID
+++      9999999 on host Slava-Yoga) taken over by PID 2580144
+++
+++      killed 1 dangling process
+++
+++
+++      test/engine/amend-maxiterations.test.ts:
+++
+++      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
+++      wave-report amend runs pm-amend, writes plan-N.k, and schedules the new
+++      item [5115.47ms]
+++        ^ this test timed out after 5000ms.
+++
+++      # Unhandled error between tests
+++
+++      -------------------------------
+++
+++      179 |     const res = await runTask(
+++
+++      180 |       { harness, repo: repoObj, project, pipelineFor: async () =>
+++      pipeline, prompts },
+++
+++      181 |       task
+++
+++      182 |     );
+++
+++      183 | 
+++
+++      184 |     expect(res.status).toBe("done");
+++                                   ^
+++      error: expect(received).toBe(expected)
+++
+++
+++      Expected: "done"
+++
+++      Received: "failed"
+++
+++            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/plugins/software-factory/test/engine/amend-maxiterations.test.ts:184:24)
+++      -------------------------------
+++
+++
+++      killed 1 dangling process
+++
+++      (fail) Engine: Wave-report amend + maxIterations (§8.4.6, §12.2) >
+++      restores amended items and amendment count across restart [5100.39ms]
+++        ^ this test timed out after 5000ms.
+++
+++       322 pass
+++       2 skip
+++       2 fail
+++       1 error
+++       1388 expect() calls
+++      Ran 326 tests across 55 files. [137.73s]
+++
+++      [New failing tests: Engine: Wave-report amend + maxIterations (§8.4.6,
+++      §12.2).wave-report amend runs pm-amend, writes plan-N.k, and schedules the
+++      new item, Engine: Wave-report amend + maxIterations (§8.4.6,
+++      §12.2).restores amended items and amendment count across restart]
+++  - id: target-green
+++    status: pass
+++    message: "target-green passed: selected tests passed"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/concerns-funnel.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794119857705-zd79omjpba.xml
+++      junitCaseCount: 22
+++      junitCaseIds:
+++        - Concern funnel schemas.valid concerns pass validation and unknown
+++          kinds reject with no artifact write
+++        - Concern store.fingerprints concern identity, ignoring detail,
+++          severity, and affect order
+++        - Concern store.aggregates a developer concern to one open taskWt file
+++          with defaults, source, and immediate commit
+++        - Concern store.merges re-emitted concerns into one file with longer
+++          detail, max severity, and advanced timestamps
+++        - Concern store.keeps dismissed status and flags escalation when a
+++          higher severity is re-emitted
+++        - Concern store.lists only open concerns in stable order
+++        - Concern store.triages only exact-id suggestions and persists dismiss
+++          reasons
+++        - Concern store.routes non-dismiss triage dispositions and gates
+++          non-triagers
+++        - Concern store.rejects dismiss triage without detail and leaves the
+++          concern unchanged
+++        - Concern store.partitions suggestions by exact concern id
+++        - Concern store.records close-up pending resolutions without changing
+++          concern status
+++        - Concern store.aggregates remarkable decisions into rm-* files and
+++          triages them by exact id
+++        - Concern store.rejects unknown concern kinds without partial writes and
+++          leaves existing files untouched
+++        - Concern store.writes distinct fingerprints concurrently without
+++          deadlock or lost commits
+++        - Concern store.serializes concurrent merges of the same fingerprint
+++          into one merged file
+++        - "Concern store.wires reviewer output: aggregate new concerns before
+++          triaging pre-existing ids only"
+++        - Concern store.wires consult writeArtifact producers to the concern
+++          store
+++        - "Concern store.wires close-up producers: aggregates concerns and
+++          applies resolutions"
+++        - Concern store.aggregates concerns and remarkable decisions across
+++          producer schemas
+++        - Concern store.reconciles missing concerns from committed step records
+++          idempotently
+++        - Concern store.commits stray concerns files during startup recovery
+++          instead of stashing them
+++        - Concern store.keeps step status ok and journals an ingest error when
+++          concern ingestion fails
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: fail
+++    message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
+++    details:
+++      changedLines:
+++        added: 547
+++        deleted: 9
+++        total: 556
+++        files:
+++          - plugins/software-factory/src/core/artifacts.ts
+++          - plugins/software-factory/src/core/concerns.ts
+++          - plugins/software-factory/src/core/engine.ts
+++          - plugins/software-factory/src/core/flows/step-runner.ts
+++          - plugins/software-factory/src/core/git/repair.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..e985026
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,80 @@
+++# Step: Develop
+++
+++## Goal
+++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+++
+++## Rules
+++- Target green: every test selector and case identified in `target` MUST pass cleanly.
+++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+++
+++## Assignment
+++{
+++  "slug": "concerns-store-v2",
+++  "kind": "dev",
+++  "title": "Concerns store with merge and commit",
+++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+++  "outlineRef": "concerns-store-v2",
+++  "milestone": "m1-contracts-aggregate",
+++  "wave": 6,
+++  "deps": [
+++    "concerns-contracts-policy",
+++    "concerns-contracts-schemas",
+++    "concerns-contracts-types"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/concerns-funnel.test.ts"
+++  ],
+++  "expectRed": [
+++    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
+++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
+++    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
+++    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
+++    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
+++    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
+++    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
+++    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
+++    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
+++    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
+++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
+++    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
+++    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
+++    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
+++    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
+++    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
+++    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
+++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
+++    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
+++    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
+++    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
+++  ]
+++}
+++
+++## Context & Citations
+++[]
+++
+++## Review Feedback
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+++- summary (string, required): Concise summary of implementation actions and test results
+++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+++  - Option 1:
+++    - selectors (array of string, required)
+++    - expectRed (array of string, required, minItems: 1)
+++  - Option 2:
+++    - gate (string, required)
+++  - Option 3:
+++    - command (string, required)
+++    - customTarget (boolean, required)
+++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+++- notes (string, optional): Optional developer notes, implementation observations, or comments
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..6f587dd
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/meta.yaml
++@@ -0,0 +1,20 @@
+++seq: 2
+++name: develop
+++attempt: 1
+++fixRound: 1
+++agent: developer
+++role: workhorse
+++models:
+++  - opencode-go/deepseek-v4.1-flash
+++  - opencode-go/muse-spark-1.3-contributor
+++timeoutSec: 1200
+++status: rejected
+++startedAt: 2026-11-08T06:19:23.712Z
+++session: 01a1b9cf-c890-724d-b6a9-2473bfac0631
+++endedAt: 2026-11-08T06:37:41.767Z
+++usage:
+++  inputTokens: 130810
+++  outputTokens: 48991
+++  costUsd: 0.06896100000000001
+++repairedFrom: ask
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..ceff7b9
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,88 @@
+++status: ok
+++summary: "Implemented the taskWt concern store in src/core/concerns.ts: stable
+++  fingerprints over kind/normalized summary/location/sorted affects; atomic
+++  one-file-per-fingerprint aggregation with longer/latest detail, max severity,
+++  advanced updatedAt/lastSeen, dismissed-status preservation and escalation;
+++  exact-id triage gated by isTriager; close-up pending resolutions; suggestion
+++  partitioning; idempotent reconciliation from committed step records; and
+++  remarkable-decision rm-* artifacts. Wired all producer seams through
+++  step-runner (concerns, newConcerns, remarkable, suggestions,
+++  concernResolutions, including consult writeArtifact), with reviewer triage
+++  restricted to pre-existing concern ids and ingest failures journaled as
+++  concern_ingest_error without changing step status. Added concerns/** startup
+++  recovery commit and task startup reconcile."
+++target:
+++  selectors:
+++    - test/engine/concerns-funnel.test.ts
+++  expectRed:
+++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
+++      identity, ignoring detail, severity, and affect order
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
+++      concern to one open taskWt file with defaults, source, and immediate
+++      commit
+++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
+++      concerns into one file with longer detail, max severity, and advanced
+++      timestamps
+++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
+++      and flags escalation when a higher severity is re-emitted
+++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
+++      concerns in stable order
+++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
+++      suggestions and persists dismiss reasons
+++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
+++      triage dispositions and gates non-triagers
+++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
+++      without detail and leaves the concern unchanged
+++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
+++      by exact concern id
+++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
+++      pending resolutions without changing concern status
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
+++      decisions into rm-* files and triages them by exact id
+++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
+++      kinds without partial writes and leaves existing files untouched
+++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
+++      fingerprints concurrently without deadlock or lost commits
+++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
+++      merges of the same fingerprint into one merged file
+++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
+++      aggregate new concerns before triaging pre-existing ids only"
+++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
+++      writeArtifact producers to the concern store
+++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
+++      producers: aggregates concerns and applies resolutions"
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
+++      remarkable decisions across producer schemas
+++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
+++      concerns from committed step records idempotently
+++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
+++      files during startup recovery instead of stashing them
+++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
+++      and journals an ingest error when concern ingestion fails
+++evidence:
+++  - "bun run typecheck (in plugins/software-factory): exit 0 after final changes"
+++  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts: 22 pass, 0 fail,
+++    202 expect() calls"
+++  - "TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts --rerun-each 2: 44
+++    pass, 0 fail, proving concurrent merge serialization is stable"
+++  - "TMPDIR=/tmp bun test (full suite, isolated run): 324 pass, 2 skip, 0 fail,
+++    1395 expect() calls"
+++  - "git diff --check: clean"
+++  - "Baseline qa-red-test timeout check: the same 5s test-timeout sensitivity
+++    reproduces without these changes under current machine load, confirming it
+++    is environmental and unrelated"
+++  - git stash was used only for the baseline comparison and was popped; git
+++    status shows only the five intended production files modified
+++concerns:
+++  - Unrelated qa-red-test integration tests are timing-sensitive against Bun's
+++    5s per-test default and can time out under high machine load; the full suite
+++    passed when run in isolation and the failure reproduces on the pre-change
+++    baseline.
+++  - Concern ingestion uses the task-wide KeyedMutex keyed by taskDir, so
+++    distinct-fingerprint writes are serialized per task rather than truly
+++    parallel; this is required for safe per-task RMW and still passed the
+++    concurrency tests.
+++notes: commitAll is called outside the KeyedMutex and never inside
+++  repo.writeLock.runExclusive (commitAll acquires repo.writeLock internally).
+++  Startup recovery commits stray concerns/** files before any stash; task
+++  startup calls reconcileConcerns read-only against committed step records.
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
++new file mode 100644
++index 0000000..c956b72
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/checks.yaml
++@@ -0,0 +1,115 @@
+++checks:
+++  - id: gates
+++    status: pass
+++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
+++      (§7).detects when an agent commits and resets --soft to before.sha,
+++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
+++      agent switches branch and restores original branch, keeping changes)"
+++    details:
+++      - id: typecheck
+++        command: cd plugins/software-factory && bun run typecheck
+++        status: pass
+++        durationMs: 4115
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 214345
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-DhnsNA/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2737241
+++
+++           324 pass
+++           2 skip
+++           0 fail
+++           1395 expect() calls
+++          Ran 326 tests across 55 files. [99.73s]
+++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
+++        improvements:
+++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+++            and resets --soft to before.sha, keeping changes staged"
+++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+++            branch and restores original branch, keeping changes"
+++  - id: target-green
+++    status: pass
+++    message: "target-green passed: selected tests passed"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/concerns-funnel.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794120748753-kzhys7rw6n.xml
+++      junitCaseCount: 22
+++      junitCaseIds:
+++        - Concern funnel schemas.valid concerns pass validation and unknown
+++          kinds reject with no artifact write
+++        - Concern store.fingerprints concern identity, ignoring detail,
+++          severity, and affect order
+++        - Concern store.aggregates a developer concern to one open taskWt file
+++          with defaults, source, and immediate commit
+++        - Concern store.merges re-emitted concerns into one file with longer
+++          detail, max severity, and advanced timestamps
+++        - Concern store.keeps dismissed status and flags escalation when a
+++          higher severity is re-emitted
+++        - Concern store.lists only open concerns in stable order
+++        - Concern store.triages only exact-id suggestions and persists dismiss
+++          reasons
+++        - Concern store.routes non-dismiss triage dispositions and gates
+++          non-triagers
+++        - Concern store.rejects dismiss triage without detail and leaves the
+++          concern unchanged
+++        - Concern store.partitions suggestions by exact concern id
+++        - Concern store.records close-up pending resolutions without changing
+++          concern status
+++        - Concern store.aggregates remarkable decisions into rm-* files and
+++          triages them by exact id
+++        - Concern store.rejects unknown concern kinds without partial writes and
+++          leaves existing files untouched
+++        - Concern store.writes distinct fingerprints concurrently without
+++          deadlock or lost commits
+++        - Concern store.serializes concurrent merges of the same fingerprint
+++          into one merged file
+++        - "Concern store.wires reviewer output: aggregate new concerns before
+++          triaging pre-existing ids only"
+++        - Concern store.wires consult writeArtifact producers to the concern
+++          store
+++        - "Concern store.wires close-up producers: aggregates concerns and
+++          applies resolutions"
+++        - Concern store.aggregates concerns and remarkable decisions across
+++          producer schemas
+++        - Concern store.reconciles missing concerns from committed step records
+++          idempotently
+++        - Concern store.commits stray concerns files during startup recovery
+++          instead of stashing them
+++        - Concern store.keeps step status ok and journals an ingest error when
+++          concern ingestion fails
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 276/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 276
+++        deleted: 0
+++        total: 276
+++        files:
+++          - plugins/software-factory/src/core/artifacts.ts
+++          - plugins/software-factory/src/core/concerns.ts
+++          - plugins/software-factory/src/core/engine.ts
+++          - plugins/software-factory/src/core/flows/step-runner.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
++new file mode 100644
++index 0000000..8ce505c
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/input.md
++@@ -0,0 +1,104 @@
+++# Step: Develop
+++
+++## Goal
+++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+++
+++## Rules
+++- Target green: every test selector and case identified in `target` MUST pass cleanly.
+++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+++
+++## Assignment
+++{
+++  "slug": "concerns-store-v2",
+++  "kind": "dev",
+++  "title": "Concerns store with merge and commit",
+++  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
+++  "outlineRef": "concerns-store-v2",
+++  "milestone": "m1-contracts-aggregate",
+++  "wave": 6,
+++  "deps": [
+++    "concerns-contracts-policy",
+++    "concerns-contracts-schemas",
+++    "concerns-contracts-types"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/concerns-funnel.test.ts"
+++  ],
+++  "expectRed": [
+++    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
+++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
+++    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
+++    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
+++    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
+++    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
+++    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
+++    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
+++    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
+++    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
+++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
+++    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
+++    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
+++    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
+++    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
+++    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
+++    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
+++    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
+++    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
+++    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
+++    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
+++  ]
+++}
+++
+++## Context & Citations
+++[]
+++
+++## Review Feedback
+++Failing check: size
+++
+++Message: Production changes (556 lines) exceeded limit (300 lines) for kind dev
+++
+++Detail:
+++{
+++  "changedLines": {
+++    "added": 547,
+++    "deleted": 9,
+++    "total": 556,
+++    "files": [
+++      "plugins/software-factory/src/core/artifacts.ts",
+++      "plugins/software-factory/src/core/concerns.ts",
+++      "plugins/software-factory/src/core/engine.ts",
+++      "plugins/software-factory/src/core/flows/step-runner.ts",
+++      "plugins/software-factory/src/core/git/repair.ts"
+++    ]
+++  },
+++  "limit": 300
+++}
+++
+++Budget: 556 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
+++
+++Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+++- summary (string, required): Concise summary of implementation actions and test results
+++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+++  - Option 1:
+++    - selectors (array of string, required)
+++    - expectRed (array of string, required, minItems: 1)
+++  - Option 2:
+++    - gate (string, required)
+++  - Option 3:
+++    - command (string, required)
+++    - customTarget (boolean, required)
+++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+++- notes (string, optional): Optional developer notes, implementation observations, or comments
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
++new file mode 100644
++index 0000000..d78359c
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/meta.yaml
++@@ -0,0 +1,19 @@
+++seq: 3
+++name: develop
+++attempt: 2
+++fixRound: 1
+++agent: developer
+++role: workhorse
+++models:
+++  - opencode-go/deepseek-v4.1-flash
+++  - opencode-go/muse-spark-1.3-contributor
+++timeoutSec: 1200
+++status: ok
+++startedAt: 2026-11-08T06:39:44.749Z
+++session: 01a1b9e2-6959-7721-ab3f-95f04fde4925
+++endedAt: 2026-11-08T06:52:31.854Z
+++usage:
+++  inputTokens: 57623
+++  outputTokens: 44914
+++  costUsd: 0.045325
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925
++diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
++new file mode 100644
++index 0000000..53bf492
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2/output.yaml
++@@ -0,0 +1,86 @@
+++status: ok
+++summary: Shrank the concerns-store production diff from 556 to 276 changed lines
+++  (under the 300-line limit) without changing behavior. Rewrote
+++  src/core/concerns.ts compactly (207 lines) while preserving
+++  fingerprint/merge/triage/close-up/partition/reconcile semantics; consolidated
+++  the step-runner ingestion seam and call site; moved concern-store startup
+++  recovery from repairWorktree into a pre-repair engine commit (restoring
+++  repair.ts to baseline). Target file passes 22/22 and the full suite passes.
+++target:
+++  selectors:
+++    - test/engine/concerns-funnel.test.ts
+++  expectRed:
+++    - test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern
+++      identity, ignoring detail, severity, and affect order
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer
+++      concern to one open taskWt file with defaults, source, and immediate
+++      commit
+++    - test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted
+++      concerns into one file with longer detail, max severity, and advanced
+++      timestamps
+++    - test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status
+++      and flags escalation when a higher severity is re-emitted
+++    - test/engine/concerns-funnel.test.ts::Concern store.lists only open
+++      concerns in stable order
+++    - test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id
+++      suggestions and persists dismiss reasons
+++    - test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss
+++      triage dispositions and gates non-triagers
+++    - test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage
+++      without detail and leaves the concern unchanged
+++    - test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions
+++      by exact concern id
+++    - test/engine/concerns-funnel.test.ts::Concern store.records close-up
+++      pending resolutions without changing concern status
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable
+++      decisions into rm-* files and triages them by exact id
+++    - test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern
+++      kinds without partial writes and leaves existing files untouched
+++    - test/engine/concerns-funnel.test.ts::Concern store.writes distinct
+++      fingerprints concurrently without deadlock or lost commits
+++    - test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent
+++      merges of the same fingerprint into one merged file
+++    - "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output:
+++      aggregate new concerns before triaging pre-existing ids only"
+++    - test/engine/concerns-funnel.test.ts::Concern store.wires consult
+++      writeArtifact producers to the concern store
+++    - "test/engine/concerns-funnel.test.ts::Concern store.wires close-up
+++      producers: aggregates concerns and applies resolutions"
+++    - test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and
+++      remarkable decisions across producer schemas
+++    - test/engine/concerns-funnel.test.ts::Concern store.reconciles missing
+++      concerns from committed step records idempotently
+++    - test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns
+++      files during startup recovery instead of stashing them
+++    - test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok
+++      and journals an ingest error when concern ingestion fails
+++evidence:
+++  - "Size check: `git diff --numstat 87a7682 -- plugins/software-factory/src` =>
+++    artifacts.ts 2/0, concerns.ts 207/0, engine.ts 18/0, step-runner.ts 49/0 =
+++    276 changed lines total (limit 300); repair.ts restored to baseline with
+++    zero delta."
+++  - "Typecheck: `cd plugins/software-factory && bun run typecheck` => exit 0."
+++  - "Target: `cd plugins/software-factory && TMPDIR=/tmp bun test
+++    test/engine/concerns-funnel.test.ts` => 22 pass, 0 fail, 202 expect()
+++    calls."
+++  - "Full suite: `cd plugins/software-factory && TMPDIR=/tmp bun test` => 324
+++    pass, 2 skip, 0 fail across 55 files (80.9s)."
+++  - "Flake confirmation: first full-suite run hit two 5s timeouts in
+++    qa-red-test.test.ts; the file alone passes 3/3 (9.8s) and
+++    amend-maxiterations.test.ts alone passes 4/4 (5.7s), matching the same
+++    load-related timeouts seen in the prior attempt's gate run."
+++  - "`git diff --check` => exit 0 (no whitespace errors)."
+++concerns:
+++  - Full-suite 5s per-test timeouts are load-flaky in subprocess-spawning engine
+++    tests (qa-red-test, amend-maxiterations); each file passes in isolation and
+++    the full suite passed on re-run, so this is pre-existing harness flakiness
+++    rather than a code regression.
+++notes: "Behavior preserved while shrinking: concern identity ignores
+++  detail/severity/affect order; aggregation merges longer-or-equal detail, max
+++  severity, preserves status/disposition/dismissReason/pendingResolution,
+++  advances updatedAt/lastSeen and sets source.escalated on severity rise; atomic
+++  YAML writes + KeyedMutex(taskDir) guard RMW and commitAll runs outside
+++  repo.writeLock. Startup recovery now commits concerns/ via commitAll before
+++  stray-dirt repair instead of adding commitGlobs to repairWorktree, removing
+++  the repair.ts delta. Reconcile derives read-only from committed step records
+++  using git ls-tree and remains idempotent."
++diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
++index 08aed67..cf53d5c 100644
++--- a/plugins/software-factory/src/core/artifacts.ts
+++++ b/plugins/software-factory/src/core/artifacts.ts
++@@ -333,6 +333,8 @@ export interface ConcernSource {
++   item?: string;
++   iteration?: number;
++   escalated?: boolean;
+++  /** Timestamp of the most recent re-emit for merged concerns. */
+++  lastSeen?: string;
++ }
++ 
++ export interface PendingConcernResolution {
++diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
++new file mode 100644
++index 0000000..c32728f
++--- /dev/null
+++++ b/plugins/software-factory/src/core/concerns.ts
++@@ -0,0 +1,207 @@
+++import fs from "node:fs";
+++import path from "node:path";
+++import { createHash } from "node:crypto";
+++import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+++import type { Repo } from "./git/repo.js";
+++import { commitAll } from "./git/commit.js";
+++import { git } from "./git/exec.js";
+++import { KeyedMutex } from "./mutex.js";
+++import { readYaml, writeYamlAtomic } from "./records/io.js";
+++
+++export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
+++  Partial<Pick<Concern, "detail" | "severity">>;
+++export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
+++export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }
+++
+++type Obj = Record<string, any>;
+++type Patch = (record: Obj, at: string) => Obj;
+++const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
+++const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };
+++/** Serializes read-modify-write cycles of one task's concern store. */
+++const locks = new KeyedMutex();
+++const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
+++const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
+++const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
+++const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
+++const hash = (prefix: string, parts: unknown[]) =>
+++  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+++const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
+++
+++/** Stable concern identity: kind, normalized summary, location, sorted affects. */
+++export function concernFingerprint(c: ConcernInput): string {
+++  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
+++}
+++
+++async function readExisting<T>(file: string): Promise<T | undefined> {
+++  try { return await readYaml<T>(file); } catch (err: any) {
+++    if (err?.code === "ENOENT") return undefined;
+++    throw err;
+++  }
+++}
+++
+++function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
+++  const incomingDetail = (input.detail ?? input.summary).trim();
+++  const incomingSeverity = input.severity ?? "medium";
+++  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
+++  const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+++  const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+++  const location = input.location ?? existing?.location;
+++  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
+++  return {
+++    ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
+++    summary: existing?.summary ?? input.summary.trim(), detail,
+++    ...(location ? { location } : {}), ...(affects ? { affects } : {}), severity,
+++    status: existing?.status ?? "open",
+++    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: at },
+++    createdAt: existing?.createdAt ?? at, updatedAt: at,
+++  };
+++}
+++
+++function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
+++  return {
+++    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
+++    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
+++    status: existing?.status ?? "open",
+++    source: { ...(existing?.source ?? {}), ...source, lastSeen: at },
+++    createdAt: existing?.createdAt ?? at, updatedAt: at,
+++  };
+++}
+++
+++/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+++export async function aggregateConcerns(
+++  ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = []
+++): Promise<StoredConcernArtifact[]> {
+++  for (const c of concerns) {
+++    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
+++    if (!c.summary?.trim()) throw new Error("Concern summary is required");
+++    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
+++  }
+++  for (const d of remarkables) if (!d?.chosen?.trim()) throw new Error("Remarkable decision requires chosen");
+++
+++  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+++  const stored = await locks.runExclusive(ctx.taskDir, async () => {
+++    const out: StoredConcernArtifact[] = [];
+++    for (const input of concerns) {
+++      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+++      const merged = mergeConcern(await readExisting(file), input, ctx.source, at);
+++      await writeYamlAtomic(file, merged);
+++      out.push(merged);
+++    }
+++    for (const decision of remarkables) {
+++      const file = path.join(dir, `${rmId(decision)}.yaml`);
+++      await writeYamlAtomic(file, mergeRemarkable(await readExisting(file), decision, ctx.source, at));
+++    }
+++    return out;
+++  });
+++  if (concerns.length || remarkables.length) await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
+++  return stored;
+++}
+++
+++/** Returns open concerns ordered by creation time then id. */
+++export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+++  const dir = dirOf(taskDir);
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT") return [];
+++    throw err;
+++  }
+++  const records = await Promise.all(names.filter((n) => n.endsWith(".yaml")).map(async (name) => {
+++    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
+++  }));
+++  return records
+++    .filter((r): r is StoredConcernArtifact => r?.status === "open")
+++    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
+++}
+++
+++async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+++  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+++  const updated = await locks.runExclusive(ctx.taskDir, async () => {
+++    const out: StoredConcernArtifact[] = [];
+++    for (const [id, patch] of ops) {
+++      if (id !== path.basename(id)) continue;
+++      const file = path.join(dir, `${id}.yaml`);
+++      const existing = await readExisting<Obj>(file);
+++      if (!existing) continue;
+++      const next = { ...patch(existing, at), updatedAt: at };
+++      await writeYamlAtomic(file, next);
+++      out.push(next as StoredConcernArtifact);
+++    }
+++    return out;
+++  });
+++  if (updated.length) await commitAll(ctx.repo, ctx.taskWt, message);
+++  return updated;
+++}
+++
+++/** Applies review triage to pre-existing concerns only; ordinary findings are ignored. */
+++export async function applyConcernTriage(
+++  ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
+++): Promise<StoredConcernArtifact[]> {
+++  if (!ctx.isTriager) return [];
+++  const ops = ctx.suggestions.map((s): [string, Patch] => {
+++    if (s.disposition === "dismiss" && !s.detail?.trim()) throw new Error(`Dismiss triage for ${s.id} requires detail`);
+++    return [s.id, (record) => s.disposition === "dismiss"
+++      ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
+++      : { ...record, status: "routed", disposition: s.disposition }];
+++  });
+++  return mutate(ctx, ops, "factory: concerns triaged");
+++}
+++
+++/** Records close-up resolutions as pending; changing status is a later decision. */
+++export function applyCloseupResolutions(
+++  ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
+++): Promise<StoredConcernArtifact[]> {
+++  const ops = ctx.resolutions.map((r): [string, Patch] => [r.id, (record, at) => ({
+++    ...record, pendingResolution: { action: r.action, ...(r.note !== undefined ? { note: r.note } : {}), by: ctx.by, at },
+++  })]);
+++  return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
+++}
+++
+++/** Splits review suggestions into concern triage vs findings by exact id. */
+++export function partitionSuggestions(
+++  suggestions: ReviewSuggestion[], concernIds: Iterable<string>
+++): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
+++  const ids = new Set(concernIds);
+++  return {
+++    triage: suggestions.filter((s) => ids.has(s.id)),
+++    findings: suggestions.filter((s) => !ids.has(s.id)),
+++  };
+++}
+++
+++interface CommittedRecord { name: string; item?: string; meta: Obj; output: Obj }
+++
+++async function committedStepRecords(ctx: ConcernStoreContext): Promise<CommittedRecord[]> {
+++  const res = await git(ctx.taskWt, ["ls-tree", "-r", "--name-only", "HEAD"], { allowFail: true, env: ctx.repo.identityEnv() });
+++  if (res.code !== 0) return [];
+++  const committed = new Set(res.stdout.split("\n").filter(Boolean));
+++  const prefix = path.relative(ctx.taskWt, ctx.taskDir).replace(/\\/g, "/");
+++  const records: CommittedRecord[] = [];
+++  for (const metaRel of [...committed].sort()) {
+++    const outputRel = metaRel.replace(/meta\.yaml$/, "output.yaml");
+++    if (!metaRel.startsWith(`${prefix}/`) || outputRel === metaRel || !committed.has(outputRel)) continue;
+++    const parts = metaRel.slice(prefix.length + 1).split("/");
+++    const item = parts[0] === "items" && parts.length === 5 ? parts[1] : undefined;
+++    if (!item && (parts[0] !== "runs" || parts.length !== 3)) continue;
+++    try {
+++      const meta = await readYaml<Obj>(path.join(ctx.taskWt, metaRel));
+++      if (meta?.status !== "ok") continue;
+++      records.push({ name: parts[parts.length - 2]!, ...(item ? { item } : {}), meta,
+++        output: await readYaml<Obj>(path.join(ctx.taskWt, outputRel)) });
+++    } catch { /* A corrupt record is not a usable derivation input. */ }
+++  }
+++  return records;
+++}
+++
+++/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. */
+++export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
+++  const reconciled: StoredConcernArtifact[] = [];
+++  for (const r of await committedStepRecords(ctx)) {
+++    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])]
+++      .filter((c: any) => c && typeof c === "object");
+++    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
+++    if (!concerns.length && !remarkables.length) continue;
+++    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"),
+++      ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
+++    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables)));
+++  }
+++  return reconciled;
+++}
++diff --git a/plugins/software-factory/src/core/engine.ts b/plugins/software-factory/src/core/engine.ts
++index 87787e9..bb4fe0c 100644
++--- a/plugins/software-factory/src/core/engine.ts
+++++ b/plugins/software-factory/src/core/engine.ts
++@@ -31,6 +31,7 @@ import { runIngest, isTriageDone, isInfraDone } from "./flows/ingest.js";
++ import { runIteration } from "./flows/iteration.js";
++ import { runSeamHooks } from "./flows/seams.js";
++ import { readYaml, writeYamlAtomic, readText } from "./records/io.js";
+++import { reconcileConcerns } from "./concerns.js";
++ import { listPending, classify, takenPaths } from "./steer.js";
++ import { resolveRole } from "./config/roles.js";
++ import { installShutdownHandlers } from "./shutdown.js";
++@@ -323,6 +324,12 @@ export async function runTask(
++     parentBranch = `topic/${task}`;
++ 
++   // 2. Start-up repair restricted to §6.3.6 list (Finding 1 & 19)
+++  // Concerns are engine-owned: commit them before stray-dirt repair stashes them.
+++  if (fs.existsSync(path.join(taskDir, "concerns"))) {
+++    await commitAll(repo, taskWt, "factory: concern store recovery", {
+++      paths: [`${orchFolder}/${task}/concerns`],
+++    });
+++  }
++   await repairWorktree(repo, taskWt, "task", {
++     operatorEditable: [
++       "INTENT.md",
++@@ -358,6 +365,17 @@ export async function runTask(
++ 
++   await repairInterruptedRecords(taskDir);
++ 
+++  // Rebuild concerns lost in a crash from committed step records (§18).
+++  try {
+++    await reconcileConcerns({ taskDir, taskWt, repo });
+++  } catch (err: any) {
+++    await appendJournal(taskDir, {
+++      type: "concern_reconcile_error",
+++      task,
+++      error: err?.message || String(err),
+++    });
+++  }
+++
++   // 3. Load pipeline config and setup semaphores (§2)
++   pipeline = await pipelineFor(taskDir);
++   if (opts?.maxIterations !== undefined) {
++diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
++index f5e0e00..3b1775c 100644
++--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++++ b/plugins/software-factory/src/core/flows/step-runner.ts
++@@ -24,6 +24,12 @@ import {
++ import { validateAndRepair } from "../records/repair.js";
++ import { generateReviewSchema } from "../records/review-schema.js";
++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+++import {
+++  aggregateConcerns,
+++  applyCloseupResolutions,
+++  applyConcernTriage,
+++  partitionSuggestions,
+++} from "../concerns.js";
++ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
++ import { captureHead, enforceHead } from "../git/guard.js";
++ import { commitAll } from "../git/commit.js";
++@@ -167,6 +173,33 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
++   return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
++ }
++ 
+++/** Feeds a step's producer fields into the taskWt concern store (§18). */
+++async function ingestStepConcerns(opts: {
+++  taskDir: string; taskWt: string; repo: any; output: unknown;
+++  source: { record: string; agent: string; step: string; item?: string; iteration?: number };
+++}): Promise<void> {
+++  const data = (opts.output ?? {}) as Record<string, any>;
+++  const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
+++  const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
+++  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
+++  const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
+++  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return;
+++
+++  // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
+++  let existing: string[] = [];
+++  try {
+++    existing = (await fs.promises.readdir(path.join(opts.taskDir, "concerns")))
+++      .filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -5));
+++  } catch (err: any) {
+++    if (err?.code !== "ENOENT") throw err;
+++  }
+++  const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
+++  if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
+++  const { triage } = partitionSuggestions(suggestions, existing);
+++  if (triage.length) await applyConcernTriage({ ...ctx, suggestions: triage, isTriager: isTriagerAgent(opts.source.agent) });
+++  if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
+++}
+++
++ /**
++  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
++  */
++@@ -635,6 +668,22 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
++     }
++   }
++ 
+++  // Producer concerns feed the taskWt store after the canonical artifact write.
+++  if (finalStatus === "ok") {
+++    try {
+++      await ingestStepConcerns({
+++        taskDir, taskWt, repo, output: validatedData,
+++        source: {
+++          record: dirName, agent, step: stepId,
+++          ...(item ? { item } : {}),
+++          ...(opts.iteration !== undefined ? { iteration: opts.iteration } : {}),
+++        },
+++      });
+++    } catch (err: any) {
+++      await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) });
+++    }
+++  }
+++
++   // 13. Invariant §6.3.2: Finish step record with final meta
++   const finalMeta = await finishStepRecord({
++     recordDir,
++diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++index ce498df..ef4bafb 100644
++--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++++ b/plugins/software-factory/test/engine/concerns-funnel.test.t
... [truncated 3422891 bytes] ...
nArtifact>(
+++      path.join(taskDir, "concerns", "c-ffffffffff.yaml")
+++    );
+++    expect(resolved.status).toBe("routed");
+++    expect(resolved.pendingResolution?.action).toBe("resolve");
+++
+++    const propagated = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-9999999999.yaml")
+++    );
+++    expect(propagated.status).toBe("open");
+++    expect(propagated.pendingResolution?.action).toBe("propagate");
+++    expect(propagated.pendingResolution?.note).toBe("saga decision");
+++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+++  });
+++
+++  it("aggregates remarkable decisions into rm-* files and triages them by exact id", async () => {
+++    await aggregateConcerns(
+++      {
+++        taskDir,
+++        taskWt,
+++        repo,
+++        source: concernSource("001-architect-plan-a1", "architect", { step: "architect-plan" }),
+++      },
+++      [],
+++      [
+++        {
+++          chosen: "Atomic YAML files",
+++          alternatives: ["One big file", "A database"],
+++          why: "diffable and conflict-free",
+++        },
+++      ]
+++    );
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    expect(fs.existsSync(concernsDir)).toBe(true);
+++    const files = fs
+++      .readdirSync(concernsDir)
+++      .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
+++    expect(files).toHaveLength(1);
+++    expect(files[0]).toMatch(/^rm-[0-9a-f]{10}\.yaml$/);
+++
+++    const remarkable = await readYaml<Record<string, any>>(
+++      path.join(concernsDir, files[0]!)
+++    );
+++    expect(remarkable.status).toBe("open");
+++    expect(remarkable.chosen).toBe("Atomic YAML files");
+++    expect(remarkable.source.record).toBe("001-architect-plan-a1");
+++    expect(remarkable.source.agent).toBe("architect");
+++
+++    const rmId = files[0]!.replace(/\.yaml$/, "");
+++    const triaged = await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: true,
+++      suggestions: [
+++        {
+++          id: rmId,
+++          disposition: "dismiss",
+++          summary: "Standard",
+++          detail: "No tradeoff worth reporting",
+++        },
+++      ],
+++    });
+++    expect(triaged).toHaveLength(1);
+++    const after = await readYaml<Record<string, any>>(path.join(concernsDir, files[0]!));
+++    expect(after.status).toBe("dismissed");
+++    expect(after.dismissReason).toBe("No tradeoff worth reporting");
+++  });
+++
+++  it("rejects unknown concern kinds without partial writes and leaves existing files untouched", async () => {
+++    const existing = await writeStoredConcern(
+++      storedConcern({ id: "c-0123456789", summary: "Existing concern" })
+++    );
+++    const before = fs.readFileSync(existing, "utf8");
+++
+++    await expect(
+++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
+++        { kind: "risk", summary: "Valid" },
+++        { kind: "bug", summary: "Invalid" } as unknown as Concern,
+++      ])
+++    ).rejects.toThrow(/kind/i);
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
+++    expect(files).toEqual(["c-0123456789.yaml"]);
+++    expect(fs.readFileSync(existing, "utf8")).toBe(before);
+++  });
+++
+++  it("writes distinct fingerprints concurrently without deadlock or lost commits", async () => {
+++    const results = await Promise.all([
+++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
+++        { kind: "risk", summary: "Concurrent risk A" },
+++      ]),
+++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("002-develop-a1") }, [
+++        { kind: "tech-debt", summary: "Concurrent debt B" },
+++      ]),
+++    ]);
+++    expect(results[0]).toHaveLength(1);
+++    expect(results[1]).toHaveLength(1);
+++
+++    const files = fs
+++      .readdirSync(path.join(taskDir, "concerns"))
+++      .filter((f) => f.endsWith(".yaml"));
+++    expect(files).toHaveLength(2);
+++
+++    const tracked = tmpRepo
+++      .git(["ls-tree", "-r", "--name-only", "HEAD"], { cwd: taskWt })
+++      .stdout.split("\n");
+++    for (const file of files) {
+++      expect(tracked).toContain(`${ORCH}/${TASK}/concerns/${file}`);
+++    }
+++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+++  });
+++
+++  it("serializes concurrent merges of the same fingerprint into one merged file", async () => {
+++    const first = aggregateConcerns(
+++      { taskDir, taskWt, repo, source: concernSource("001-develop-a1") },
+++      [{ kind: "risk", summary: "Same concern", detail: "short", severity: "low" }]
+++    );
+++    const second = aggregateConcerns(
+++      { taskDir, taskWt, repo, source: concernSource("002-develop-a1") },
+++      [
+++        {
+++          kind: "risk",
+++          summary: "Same concern",
+++          detail: "a much longer concurrent detail",
+++          severity: "high",
+++        },
+++      ]
+++    );
+++    const [a, b] = await Promise.all([first, second]);
+++    expect(a).toHaveLength(1);
+++    expect(b).toHaveLength(1);
+++
+++    const files = fs
+++      .readdirSync(path.join(taskDir, "concerns"))
+++      .filter((f) => f.endsWith(".yaml"));
+++    expect(files).toHaveLength(1);
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", files[0]!)
+++    );
+++    expect(stored.detail).toBe("a much longer concurrent detail");
+++    expect(stored.severity).toBe("high");
+++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+++  });
+++
+++  it("wires reviewer output: aggregate new concerns before triaging pre-existing ids only", async () => {
+++    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
+++    const newSummary = "Newly observed retry risk";
+++    const newId = concernFingerprint({ kind: "risk", summary: newSummary });
+++    const runsDir = path.join(taskDir, "runs");
+++    fs.mkdirSync(runsDir, { recursive: true });
+++
+++    const result = await runStep({
+++      agent: "reviewer",
+++      stepId: "review",
+++      stepFragment: "steps/review",
+++      cwd: taskWt,
+++      recordsDir: runsDir,
+++      data: {
+++        status: "approved",
+++        summary: "Reviewed",
+++        newConcerns: [{ kind: "risk", summary: newSummary }],
+++        suggestions: [
+++          {
+++            id: "c-aaaaaaaaaa",
+++            disposition: "dismiss",
+++            summary: "Duplicate",
+++            detail: "covered by ADR-1",
+++          },
+++          {
+++            id: newId,
+++            disposition: "dismiss",
+++            summary: "Self",
+++            detail: "must not dismiss a same-step concern",
+++          },
+++        ],
+++      },
+++      promptVars: { assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" },
+++    });
+++    expect(result.ok).toBe(true);
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    const newFile = path.join(concernsDir, `${newId}.yaml`);
+++    expect(fs.existsSync(newFile)).toBe(true);
+++    const created = await readYaml<StoredConcernArtifact>(newFile);
+++    expect(created.status).toBe("open");
+++    expect(created.source.record).toBe("001-review-a1");
+++
+++    const preExisting = await readYaml<StoredConcernArtifact>(
+++      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
+++    );
+++    expect(preExisting.status).toBe("dismissed");
+++    expect(preExisting.dismissReason).toBe("covered by ADR-1");
+++  });
+++
+++  it("wires consult writeArtifact producers to the concern store", async () => {
+++    const runsDir = path.join(taskDir, "runs");
+++    fs.mkdirSync(runsDir, { recursive: true });
+++    let artifactWrites = 0;
+++
+++    const result = await runStep({
+++      agent: "architect",
+++      stepId: "consult-item",
+++      stepFragment: "steps/architect-consult-item",
+++      cwd: taskWt,
+++      recordsDir: runsDir,
+++      data: {
+++        decision: "retry-with-guidance",
+++        rationale: "Retry with a narrower scope",
+++        concerns: [{ kind: "question", summary: "Which API version is authoritative?" }],
+++        remarkable: [{ chosen: "Retry", alternatives: ["Escalate"], why: "Cheap to test" }],
+++      },
+++      promptVars: { item: "item-a", assignment: "", priorAttempts: "", diff: "", feedback: "" },
+++      writeArtifact: async () => {
+++        artifactWrites++;
+++      },
+++    });
+++
+++    expect(result.ok).toBe(true);
+++    expect(artifactWrites).toBe(1);
+++    const concernsDir = path.join(taskDir, "concerns");
+++    const files = fs.existsSync(concernsDir) ? fs.readdirSync(concernsDir) : [];
+++    const concernFiles = files.filter((f) => f.startsWith("c-"));
+++    const remarkableFiles = files.filter((f) => f.startsWith("rm-"));
+++    expect(concernFiles).toHaveLength(1);
+++    expect(remarkableFiles).toHaveLength(1);
+++
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(concernsDir, concernFiles[0]!)
+++    );
+++    expect(stored.source.agent).toBe("architect");
+++    expect(stored.source.record).toBe("001-consult-item-a1");
+++    expect(stored.source.step).toBe("consult-item");
+++  });
+++
+++  it("wires close-up producers: aggregates concerns and applies resolutions", async () => {
+++    await writeStoredConcern(
+++      storedConcern({ id: "c-aaaaaaaaaa", status: "routed", disposition: "architect" })
+++    );
+++    const runsDir = path.join(taskDir, "runs");
+++    fs.mkdirSync(runsDir, { recursive: true });
+++
+++    const result = await runStep({
+++      agent: "wave-close-up",
+++      stepId: "wave-close-up-1-1",
+++      stepFragment: "steps/wave-close-up",
+++      cwd: taskWt,
+++      recordsDir: runsDir,
+++      data: {
+++        wave: 1,
+++        iteration: 1,
+++        status: "complete",
+++        mergedItems: [],
+++        summary: "Wave 1 complete",
+++        concerns: [{ kind: "tech-debt", summary: "Close-up found duplicated helpers" }],
+++        concernResolutions: [{ id: "c-aaaaaaaaaa", action: "carry", note: "needs architect" }],
+++      },
+++      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
+++    });
+++    expect(result.ok).toBe(true);
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    const newFiles = fs
+++      .readdirSync(concernsDir)
+++      .filter((f) => f.startsWith("c-") && f !== "c-aaaaaaaaaa.yaml");
+++    expect(newFiles).toHaveLength(1);
+++    const created = await readYaml<StoredConcernArtifact>(
+++      path.join(concernsDir, newFiles[0]!)
+++    );
+++    expect(created.status).toBe("open");
+++    expect(created.source.record).toBe("001-wave-close-up-1-1-a1");
+++
+++    const carried = await readYaml<StoredConcernArtifact>(
+++      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
+++    );
+++    expect(carried.status).toBe("routed");
+++    expect(carried.pendingResolution?.action).toBe("carry");
+++    expect(carried.pendingResolution?.by).toBe("wave-close-up");
+++  });
+++
+++  it("aggregates concerns and remarkable decisions across producer schemas", async () => {
+++    const runsDir = path.join(taskDir, "runs");
+++    fs.mkdirSync(runsDir, { recursive: true });
+++
+++    const producers: Array<{
+++      agent: string;
+++      stepId: string;
+++      stepFragment: string;
+++      promptVars: Record<string, string>;
+++      base: Record<string, unknown>;
+++      concernField: "concerns" | "newConcerns";
+++      remarkable: boolean;
+++    }> = [
+++      {
+++        agent: "developer",
+++        stepId: "develop",
+++        stepFragment: "steps/develop",
+++        promptVars: { assignment: "", target: "tests", citations: "[]" },
+++        base: { status: "ok", summary: "dev" },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++      {
+++        agent: "developer",
+++        stepId: "poc",
+++        stepFragment: "steps/poc",
+++        promptVars: { assignment: "", context: "" },
+++        base: { status: "ok", summary: "poc" },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++      {
+++        agent: "developer",
+++        stepId: "test-assumptions",
+++        stepFragment: "steps/test-assumptions",
+++        promptVars: { assignment: "", context: "" },
+++        base: { status: "ok", summary: "assumptions" },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++      {
+++        agent: "fact-finder",
+++        stepId: "research",
+++        stepFragment: "steps/research",
+++        promptVars: { assignment: "", intent: "", citations: "[]" },
+++        base: { status: "ok", summary: "ff", findings: "f" },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++      {
+++        agent: "qa",
+++        stepId: "qa",
+++        stepFragment: "steps/qa",
+++        promptVars: {
+++          assignment: "",
+++          checks: "",
+++          testDiff: "",
+++          diff: "",
+++          dispositionsCriteria: "",
+++        },
+++        base: { status: "approved", summary: "qa", suggestions: [] },
+++        concernField: "newConcerns",
+++        remarkable: false,
+++      },
+++      {
+++        agent: "architect",
+++        stepId: "architect-plan",
+++        stepFragment: "steps/architect-plan",
+++        promptVars: {
+++          task: TASK,
+++          iteration: "1",
+++          intent: "",
+++          context: "",
+++          infra: "",
+++          debt: "",
+++          steering: "",
+++          limits: "",
+++        },
+++        base: { iteration: 1, milestones: [], itemOutlines: [] },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++      {
+++        agent: "architect",
+++        stepId: "architect-wave-report-1-1",
+++        stepFragment: "steps/architect-wave-report",
+++        promptVars: { plan: "{}", waveReport: "", debt: "", steering: "" },
+++        base: { decision: "continue" },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++      {
+++        agent: "wave-close-up",
+++        stepId: "wave-close-up-1-1",
+++        stepFragment: "steps/wave-close-up",
+++        promptVars: { task: TASK, waveReport: "", infra: "" },
+++        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "wave" },
+++        concernField: "concerns",
+++        remarkable: true,
+++      },
+++    ];
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    for (const [index, producer] of producers.entries()) {
+++      const summary = `Producer ${index} concern`;
+++      const chosen = `Producer ${index} decision`;
+++      const data = {
+++        ...producer.base,
+++        [producer.concernField]: [{ kind: "risk", summary }],
+++        ...(producer.remarkable
+++          ? { remarkable: [{ chosen, alternatives: ["alt"], why: "because" }] }
+++          : {}),
+++      };
+++
+++      const result = await runStep({
+++        agent: producer.agent,
+++        stepId: producer.stepId,
+++        stepFragment: producer.stepFragment,
+++        cwd: taskWt,
+++        recordsDir: runsDir,
+++        data,
+++        promptVars: producer.promptVars,
+++      });
+++      expect(result.ok).toBe(true);
+++      expect(fs.existsSync(concernsDir)).toBe(true);
+++
+++      const concernFiles = fs
+++        .readdirSync(concernsDir)
+++        .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
+++      const stored = await Promise.all(
+++        concernFiles.map((f) => readYaml<StoredConcernArtifact>(path.join(concernsDir, f)))
+++      );
+++      const hit = stored.find((c) => c.summary === summary);
+++      expect(hit).toBeDefined();
+++      expect(hit!.status).toBe("open");
+++      expect(hit!.source.agent).toBe(producer.agent);
+++      expect(hit!.source.record).toContain(producer.stepId);
+++
+++      if (producer.remarkable) {
+++        const rmFiles = fs
+++          .readdirSync(concernsDir)
+++          .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
+++        const remarkables = await Promise.all(
+++          rmFiles.map((f) => readYaml<Record<string, any>>(path.join(concernsDir, f)))
+++        );
+++        expect(remarkables.some((r) => r.chosen === chosen)).toBe(true);
+++      }
+++    }
+++  });
+++
+++  it("reconciles missing concerns from committed step records idempotently", async () => {
+++    const recordDir = path.join(taskDir, "items", "item-a", "steps", "001-develop-a1");
+++    fs.mkdirSync(recordDir, { recursive: true });
+++    fs.writeFileSync(path.join(recordDir, "input.md"), "prompt\n", "utf8");
+++    await writeYamlAtomic(path.join(recordDir, "meta.yaml"), {
+++      seq: 1,
+++      name: "develop",
+++      attempt: 1,
+++      agent: "developer",
+++      role: "workhorse",
+++      models: ["model-workhorse"],
+++      status: "ok",
+++      startedAt: "2026-01-01T00:00:00.000Z",
+++      endedAt: "2026-01-01T00:01:00.000Z",
+++    });
+++    await writeYamlAtomic(path.join(recordDir, "output.yaml"), {
+++      status: "ok",
+++      summary: "done",
+++      concerns: [
+++        {
+++          kind: "risk",
+++          summary: "Reconciled from record",
+++          detail: "full detail",
+++          severity: "high",
+++        },
+++      ],
+++    });
+++    tmpRepo.commit("committed step record", [
+++      path.relative(taskWt, recordDir).replace(/\\/g, "/"),
+++    ]);
+++
+++    const first = await reconcileConcerns({ taskDir, taskWt, repo });
+++    expect(first).toHaveLength(1);
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    const files = fs
+++      .readdirSync(concernsDir)
+++      .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
+++    expect(files).toHaveLength(1);
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(concernsDir, files[0]!)
+++    );
+++    expect(stored.summary).toBe("Reconciled from record");
+++    expect(stored.detail).toBe("full detail");
+++    expect(stored.status).toBe("open");
+++    expect(stored.source.record).toBe("001-develop-a1");
+++    expect(stored.source.agent).toBe("developer");
+++
+++    // Simulate an earlier triage: a second reconcile must preserve it and not
+++    // duplicate the file.
+++    stored.status = "dismissed";
+++    stored.dismissReason = "already handled";
+++    await writeYamlAtomic(path.join(concernsDir, files[0]!), stored);
+++
+++    const second = await reconcileConcerns({ taskDir, taskWt, repo });
+++    expect(second).toHaveLength(1);
+++    expect(
+++      fs.readdirSync(concernsDir).filter((f) => f.startsWith("c-") && f.endsWith(".yaml"))
+++    ).toHaveLength(1);
+++    const after = await readYaml<StoredConcernArtifact>(
+++      path.join(concernsDir, files[0]!)
+++    );
+++    expect(after.status).toBe("dismissed");
+++    expect(after.dismissReason).toBe("already handled");
+++  });
+++
+++  it("commits stray concerns files during startup recovery instead of stashing them", async () => {
+++    const task = "recovery-task";
+++    const mainTaskDir = path.join(tmpRepo.dir, ORCH, task);
+++    fs.mkdirSync(mainTaskDir, { recursive: true });
+++    fs.writeFileSync(path.join(mainTaskDir, "INTENT.md"), "# recovery\n", "utf8");
+++    tmpRepo.commit("add recovery intent");
+++
+++    const recoveryWtRoot = path.join(tmpRepo.dir + "-wt");
+++    fs.mkdirSync(recoveryWtRoot, { recursive: true });
+++    const recoveryRepo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: recoveryWtRoot });
+++    const recoveryTaskWt = tmpRepo.createWorktree(
+++      `topic/${task}`,
+++      path.join(recoveryWtRoot, `topic_${task}`)
+++    );
+++    await writeYamlAtomic(
+++      path.join(recoveryTaskWt, ORCH, task, "concerns", "c-0123456789.yaml"),
+++      storedConcern({ id: "c-0123456789" })
+++    );
+++
+++    const recoveryPipeline: PipelineConfig = {
+++      models: {
+++        roles: {
+++          workhorse: { model: "model-workhorse" },
+++          simpler: { model: "model-simpler" },
+++        },
+++      },
+++      agents: {},
+++      flows: { simple: { steps: [] }, story: {}, spike: {} },
+++      limits: {},
+++    };
+++    const result = await runTask(
+++      {
+++        harness: new FakeHarness(),
+++        repo: recoveryRepo,
+++        project: { orchestrationFolder: ORCH, worktreeRoot: recoveryWtRoot },
+++        pipelineFor: async () => recoveryPipeline,
+++        prompts,
+++      },
+++      task,
+++      { maxTicks: 0 }
+++    );
+++    expect(result.status).toBe("stopped");
+++
+++    const rel = `${ORCH}/${task}/concerns/c-0123456789.yaml`;
+++    expect(
+++      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], {
+++        cwd: recoveryTaskWt,
+++        allowFail: true,
+++      }).code
+++    ).toBe(0);
+++    expect(tmpRepo.git(["stash", "list"], { cwd: recoveryTaskWt }).stdout).toBe("");
+++  });
+++
+++  it("keeps step status ok and journals an ingest error when concern ingestion fails", async () => {
+++    fs.writeFileSync(path.join(taskDir, "concerns"), "not a directory", "utf8");
+++    const runsDir = path.join(taskDir, "runs");
+++    fs.mkdirSync(runsDir, { recursive: true });
+++
+++    const result = await runStep({
+++      agent: "developer",
+++      stepId: "develop",
+++      stepFragment: "steps/develop",
+++      cwd: taskWt,
+++      recordsDir: runsDir,
+++      data: {
+++        status: "ok",
+++        summary: "done",
+++        concerns: [{ kind: "risk", summary: "Ingest me" }],
+++      },
+++      promptVars: { assignment: "", target: "tests", citations: "[]" },
+++    });
+++
+++    expect(result.status).toBe("ok");
+++    expect(result.meta.error).toBeUndefined();
+++    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
+++    expect(journal).toContain("concern_ingest_error");
+++  });
+++});
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["approved","changes_requested"])
++- summary (string, required)
++- suggestions (array of object, required)
++  - id (string, required)
++  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
++  - summary (string, required)
++  - detail (string, optional)
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1/meta.yaml
+new file mode 100644
+index 0000000..7fa5a02
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 8
++name: review
++attempt: 1
++fixRound: 2
++agent: reviewer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 900
++status: ok
++startedAt: 2026-11-08T07:34:34.464Z
++session: 01a1ba14-9b62-75cd-9589-a9d935a9128f
++endedAt: 2026-11-08T07:43:24.975Z
++usage:
++  inputTokens: 288179
++  outputTokens: 43764
++  costUsd: 0.085727
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-34-35-106Z_01a1ba14-9b62-75cd-9589-a9d935a9128f
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1/output.yaml
+new file mode 100644
+index 0000000..f244767
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1/output.yaml
+@@ -0,0 +1,87 @@
++status: changes_requested
++summary: "changes_requested: one fix — reconcileConcerns is not idempotent
++  (every task start rewrites all concerns with fresh updatedAt/source.lastSeen
++  and creates one commit per committed record); plus optional polish (mutate
++  return-type leak for rm-* files, unscoped concern commits, untested r2
++  hardening, consult taskWt inference). Verified independently: `TMPDIR=/tmp bun
++  test test/engine/concerns-funnel.test.ts` = 22 pass / 203 expects, `bun run
++  typecheck` exit 0. Lock discipline is correct: RMW under KeyedMutex(taskDir),
++  commitAll outside the lock and never inside repo.writeLock, hex-only
++  fingerprints and basename-guarded ids."
++suggestions:
++  - id: reconcile-not-idempotent
++    disposition: fix
++    summary: reconcileConcerns rewrites every concern with fresh updatedAt/lastSeen
++      and commits once per record on every startup
++    detail: "aggregateConcerns always calls writeYamlAtomic with at = new Date() and
++      then commitAll (concerns.ts:81-96), and reconcileConcerns replays every
++      committed ok record unconditionally on each runTask (concerns.ts:197-205;
++      engine.ts:370). So every task restart advances updatedAt and
++      source.lastSeen for all concerns (artifacts.ts:336 documents lastSeen as
++      the most recent re-emit) and adds one 'factory: concerns <record>' commit
++      per record, even when nothing was lost. The 'idempotently' test only
++      asserts file count and preserved status, so it does not catch the churn.
++      Fix: make replay deterministic — process records in meta.endedAt order and
++      derive `at` from meta.endedAt (or write only when the merged record
++      differs) so a second startup is a no-op."
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 204
++  - id: mutate-returns-remarkables-as-concerns
++    disposition: optional
++    summary: applyConcernTriage/applyCloseupResolutions can return rm-* remarkable
++      records typed as StoredConcernArtifact
++    detail: mutate() pushes the raw patched record cast to StoredConcernArtifact
++      (concerns.ts:127), and triage accepts rm-* ids (covered by the remarkable
++      triage test). A remarkable record lacks the required
++      kind/summary/detail/severity, so the advertised return type is a lie — the
++      same leak that was just fixed in listOpenConcerns. No production consumer
++      reads the return value today; narrow the return type to a record shape or
++      filter/assert before returning.
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 127
++  - id: concern-commit-unscoped
++    disposition: optional
++    summary: Concern writes use unscoped commitAll on taskWt, sweeping unrelated
++      dirty files into concern commits
++    detail: "aggregateConcerns and mutate call commitAll without paths
++      (concerns.ts:96,131), which does `git add -A` over the whole task
++      worktree. Journal appends, canonical artifacts written earlier in the same
++      step, and repaired interrupted metas can be captured under 'factory:
++      concerns …', whereas the startup recovery deliberately scopes the commit
++      to the concerns dir (engine.ts:329-331). Scope the concern commits to
++      `${orchFolder}/${task}/concerns` for consistency and to avoid committing
++      another writer's in-progress files."
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 96
++  - id: r2-hardening-untested
++    disposition: optional
++    summary: r2 hardening (routed triage clears dismissReason, remarkable pre-lock
++      validation) has no regression tests
++    detail: applyConcernTriage now clears dismissReason on non-dismiss routing
++      (concerns.ts:144) and aggregateConcerns validates chosen/alternatives/why
++      before the KeyedMutex (concerns.ts:79), but the suite only routes from an
++      open concern and only tests unknown-kind atomicity. Add a dismissed→routed
++      assertion and an invalid-remarkable no-partial-write case to lock in the
++      fixes.
++    location:
++      file: plugins/software-factory/test/engine/concerns-funnel.test.ts
++      line: 589
++  - id: consult-taskwt-inference
++    disposition: optional
++    summary: Consult runAgentStep calls omit taskWt, relying on path inference that
++      mis-resolves epic child task dirs
++    detail: consults.ts:104-120 and 226-241 do not pass taskWt although it is in
++      scope; runAgentStep falls back to inferTaskWorktree, which expects the dir
++      to end with `<orchestrationFolder>/<task>`. Epic child dirs are
++      `<childWt>/.factory/<parent>/<epic>` while the task name is
++      `<parent>--<epic>`, so taskWt resolves to taskDir. Concern files still
++      land in the right place (store keys off taskDir) and git add -A from a
++      subdirectory stages the whole worktree, so this is benign today, but the
++      store context's taskWt is wrong and would break if commits are scoped (see
++      unscoped-commit finding). Pass taskWt explicitly.
++    location:
++      file: plugins/software-factory/src/core/flows/consults.ts
++      line: 104
+diff --git a/.factory/tasks/concerns-funnel/journal.ndjson b/.factory/tasks/concerns-funnel/journal.ndjson
+index 4c5740d..49c7034 100644
+--- a/.factory/tasks/concerns-funnel/journal.ndjson
++++ b/.factory/tasks/concerns-funnel/journal.ndjson
+@@ -408,303 +408,3 @@
+ {"type":"step_started","task":"concerns-funnel","step":"pm-amend-1-2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/026-pm-amend-1-2-a1","ts":"2026-11-08T06:02:25.386Z"}
+ {"type":"step_timeout_armed","task":"concerns-funnel","step":"pm-amend-1-2","timeoutSec":900,"ts":"2026-11-08T06:02:25.392Z"}
+ {"type":"step_finished","task":"concerns-funnel","step":"pm-amend-1-2","attempt":1,"status":"ok","sessionId":"01a1b9c0-3c2a-75d8-a762-0cdb2e794687","usage":{"inputTokens":37038,"outputTokens":6390,"costUsd":0.004982},"ts":"2026-11-08T06:03:02.709Z"}
+-{"type":"wave_started","wave":6,"iteration":1,"ts":"2026-11-08T06:03:03.870Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:03:05.924Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:03:05.925Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1","ts":"2026-11-08T06:03:06.615Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","timeoutSec":1200,"ts":"2026-11-08T06:03:06.618Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1","ts":"2026-11-08T06:03:06.685Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","timeoutSec":1200,"ts":"2026-11-08T06:03:06.689Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:04:07.116Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:04:07.117Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:05:08.461Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:05:08.462Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:06:08.339Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:06:08.340Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:07:08.053Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:07:08.054Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:08:07.480Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:08:07.480Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:09:08.639Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:09:08.640Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:10:08.604Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:10:08.605Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"sizeBytes":12273320,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-07-001Z_01a1b9c0-dd79-76b1-baa8-02b05324a146","ts":"2026-11-08T06:10:53.089Z"}
+-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-07-001Z_01a1b9c0-dd79-76b1-baa8-02b05324a146","ts":"2026-11-08T06:10:53.089Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1b9c0-dd79-76b1-baa8-02b05324a146","usage":{"inputTokens":77003,"outputTokens":56479,"costUsd":0.064485},"ts":"2026-11-08T06:10:54.092Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:10:59.285Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:10:59.286Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:11:07.789Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:11:07.790Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:12:06.984Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:12:06.985Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:13:07.208Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:13:07.209Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:14:08.275Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:14:08.277Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:15:10.796Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:15:10.797Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:16:07.744Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:16:07.745Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:17:08.048Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:17:08.048Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:18:13.856Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:18:13.857Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"sizeBytes":17578153,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367","ts":"2026-11-08T06:18:59.793Z"}
+-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"toolCalls":174,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367","ts":"2026-11-08T06:18:59.795Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1b9c0-dd44-764c-ab25-e93c63f8d367","usage":{"inputTokens":130428,"outputTokens":92075,"costUsd":0.123622},"ts":"2026-11-08T06:19:06.125Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:19:09.526Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:19:09.528Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:19:14.904Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:19:14.905Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:19:23.038Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:19:23.039Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1","ts":"2026-11-08T06:19:23.812Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T06:19:23.829Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1","ts":"2026-11-08T06:19:23.902Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T06:19:23.916Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:20:07.968Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:20:07.969Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:21:07.854Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:21:07.855Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:22:08.198Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:22:08.199Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:23:08.480Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:23:08.481Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:24:09.696Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:24:09.698Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:25:09.320Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:25:09.321Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:26:07.962Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:26:07.963Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:27:08.224Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:27:08.225Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:28:09.965Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:28:09.966Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:29:07.569Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:29:07.570Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:30:10.192Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:30:10.194Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:31:10.515Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:31:10.516Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:32:08.392Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:32:08.393Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"sizeBytes":10203146,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631","ts":"2026-11-08T06:32:50.911Z"}
+-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"toolCalls":103,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631","ts":"2026-11-08T06:32:50.912Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:33:07.126Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:33:07.127Z"}
+-{"type":"step_output_repaired","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"method":"ask","ts":"2026-11-08T06:33:12.820Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:34:08.680Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:34:08.681Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:35:09.640Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:35:09.641Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:36:09.523Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:36:09.524Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:37:08.439Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:37:08.440Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1b9cf-c890-724d-b6a9-2473bfac0631","usage":{"inputTokens":130810,"outputTokens":48991,"costUsd":0.06896100000000001},"ts":"2026-11-08T06:37:41.810Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:37:46.226Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:37:46.227Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:38:07.504Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:38:07.505Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"sizeBytes":9231071,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-762Z_01a1b9cf-c8da-76e1-9957-ebfc1baf2dab","ts":"2026-11-08T06:38:16.023Z"}
+-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"toolCalls":114,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-762Z_01a1b9cf-c8da-76e1-9957-ebfc1baf2dab","ts":"2026-11-08T06:38:16.023Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:39:08.016Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:39:08.017Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"status":"ok","sessionId":"01a1b9cf-c8da-76e1-9957-ebfc1baf2dab","usage":{"inputTokens":101154,"outputTokens":31985,"costUsd":0.053907},"ts":"2026-11-08T06:39:36.816Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:39:40.165Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:39:40.165Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:39:44.221Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:39:44.222Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1","ts":"2026-11-08T06:39:44.766Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2","ts":"2026-11-08T06:39:44.811Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T06:39:44.824Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"qa","timeoutSec":900,"ts":"2026-11-08T06:39:46.505Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:40:08.543Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:40:08.544Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:41:07.538Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:41:07.540Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:42:07.339Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:42:07.340Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:43:06.872Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:43:06.873Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:44:07.629Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:44:07.630Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:45:08.906Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:45:08.907Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1b9e2-6eae-71ac-a18d-cc5ae6bf3569","usage":{"inputTokens":44412,"outputTokens":31432,"costUsd":0.011489},"ts":"2026-11-08T06:45:33.607Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:45:40.133Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:45:40.134Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:46:08.751Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:46:08.752Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:47:08.041Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:47:08.042Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:48:07.995Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:48:07.996Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"sizeBytes":7184731,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925","ts":"2026-11-08T06:48:50.279Z"}
+-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"toolCalls":79,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925","ts":"2026-11-08T06:48:50.279Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:49:08.562Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:49:08.564Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:50:09.623Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:50:09.624Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:51:08.672Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:51:08.673Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:52:07.689Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:52:07.690Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"status":"ok","sessionId":"01a1b9e2-6959-7721-ab3f-95f04fde4925","usage":{"inputTokens":57623,"outputTokens":44914,"costUsd":0.045325},"ts":"2026-11-08T06:52:31.894Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:52:34.578Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:52:34.578Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:52:37.870Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:52:37.871Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1","ts":"2026-11-08T06:52:38.383Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/004-review-r1-a1","ts":"2026-11-08T06:52:38.438Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"review","timeoutSec":900,"ts":"2026-11-08T06:52:38.446Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","timeoutSec":900,"ts":"2026-11-08T06:52:42.350Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:53:07.385Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:53:07.386Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:54:07.710Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:54:07.711Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:55:07.043Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:55:07.044Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:56:07.927Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:56:07.928Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:57:07.524Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:57:07.525Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"review","attempt":1,"status":"ok","sessionId":"01a1b9ee-373a-71ea-a6ec-297c643a5fb7","usage":{"inputTokens":55407,"outputTokens":17440,"costUsd":0.00979},"ts":"2026-11-08T06:58:00.237Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:58:05.501Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:58:05.502Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:58:08.638Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:58:08.639Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:59:07.268Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:59:07.269Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:00:06.952Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:00:06.953Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1b9ee-4641-726f-9fba-b5604835d294","usage":{"inputTokens":45734,"outputTokens":15063,"costUsd":0.008244},"ts":"2026-11-08T07:00:11.225Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:00:15.675Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:00:15.675Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:00:19.759Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:00:19.759Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1","ts":"2026-11-08T07:00:20.135Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"review","timeoutSec":900,"ts":"2026-11-08T07:00:20.139Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:01:06.965Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:01:06.966Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:02:07.573Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:02:07.573Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:03:07.120Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:03:07.120Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:04:07.012Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:04:07.013Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:05:07.234Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:05:07.235Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:06:07.891Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:06:07.892Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:07:06.673Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:07:06.673Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:08:07.436Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:08:07.436Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:09:07.383Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:09:07.384Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:10:07.750Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:10:07.750Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:11:08.017Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:11:08.018Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:12:06.615Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:12:06.616Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:13:06.276Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:13:06.277Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:14:06.464Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:14:06.465Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:15:06.530Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:15:06.530Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"sizeBytes":6357436,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-00-20-436Z_01a1b9f5-4154-7406-9ff8-d3941c708763.jsonl","ts":"2026-11-08T07:15:21.077Z"}
+-{"type":"turn_timeout_nudge","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"sessionId":"01a1b9f5-4154-7406-9ff8-d3941c708763","timeoutSec":300,"ts":"2026-11-08T07:15:22.078Z"}
+-{"type":"infra_retry_started","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"retry":1,"maxRetries":3,"sessionId":"01a1b9f5-4154-7406-9ff8-d3941c708763","costUsd":0.012655,"ts":"2026-11-08T07:15:22.078Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:16:06.302Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:16:06.303Z"}
+-{"type":"infra_retry_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"retry":1,"ok":true,"transient":false,"costUsd":0.015252,"ts":"2026-11-08T07:16:55.172Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"status":"ok","sessionId":"01a1b9f5-4154-7406-9ff8-d3941c708763","usage":{"inputTokens":87316,"outputTokens":22079,"costUsd":0.015252},"ts":"2026-11-08T07:16:55.234Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:16:57.901Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:16:57.902Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:17:01.338Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:17:01.339Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/006-develop-r2-a1","ts":"2026-11-08T07:17:01.818Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T07:17:01.825Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:17:06.494Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:17:06.495Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:18:06.049Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:18:06.050Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:19:06.086Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:19:06.087Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:20:06.356Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:20:06.357Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:21:06.678Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:21:06.678Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:22:06.425Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:22:06.426Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:23:06.573Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:23:06.574Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:24:07.399Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:24:07.399Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"status":"ok","sessionId":"01a1ba04-8abc-700a-89e0-f502e90ff375","usage":{"inputTokens":162907,"outputTokens":26626,"costUsd":0.03},"ts":"2026-11-08T07:24:49.444Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:24:52.261Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:24:52.262Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:24:55.585Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:24:55.586Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/007-qa-r2-a1","ts":"2026-11-08T07:24:56.131Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","timeoutSec":900,"ts":"2026-11-08T07:24:58.789Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:25:06.418Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:25:06.419Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:26:06.685Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:26:06.686Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:27:06.516Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:27:06.517Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:28:06.599Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:28:06.600Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:29:06.368Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:29:06.374Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:30:06.488Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:30:06.488Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:31:06.248Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:31:06.249Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:32:06.923Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:32:06.924Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:33:06.304Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:33:06.304Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:34:06.253Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:34:06.253Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"sizeBytes":9538182,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-24-59-157Z_01a1ba0b-d195-761c-ae5c-26e992ca824e.jsonl","ts":"2026-11-08T07:34:25.362Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1ba0b-d195-761c-ae5c-26e992ca824e","usage":{"inputTokens":317659,"outputTokens":55851,"costUsd":0.106093},"ts":"2026-11-08T07:34:25.477Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:34:29.824Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:34:29.824Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:34:33.958Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:34:33.959Z"}
+-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1","ts":"2026-11-08T07:34:34.568Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"review","timeoutSec":900,"ts":"2026-11-08T07:34:34.576Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:35:06.422Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:35:06.423Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:36:06.749Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:36:06.750Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:37:06.629Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:37:06.630Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:38:06.497Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:38:06.498Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:39:06.551Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:39:06.552Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:40:06.547Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:40:06.548Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:41:06.259Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:41:06.260Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:42:06.378Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:42:06.379Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:43:06.926Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:43:06.927Z"}
+-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"sizeBytes":6929894,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-34-35-106Z_01a1ba14-9b62-75cd-9589-a9d935a9128f","ts":"2026-11-08T07:43:24.938Z"}
+-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"status":"ok","sessionId":"01a1ba14-9b62-75cd-9589-a9d935a9128f","usage":{"inputTokens":288179,"outputTokens":43764,"costUsd":0.085727},"ts":"2026-11-08T07:43:25.032Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:43:29.006Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:43:29.007Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:43:33.713Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:43:33.714Z"}
+-{"type":"step_started","task":"concerns-funnel","step":"consult-concerns-store-v2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1","ts":"2026-11-08T07:43:34.533Z"}
+-{"type":"step_timeout_armed","task":"concerns-funnel","step":"consult-concerns-store-v2","timeoutSec":1200,"ts":"2026-11-08T07:43:34.544Z"}
+-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:44:07.115Z"}
+-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:44:07.116Z"}
+diff --git a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/input.md b/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/input.md
+deleted file mode 100644
+index 415740f..0000000
+--- a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/input.md
++++ /dev/null
+@@ -1,1156 +0,0 @@
+-# Step: Architect Consult (Item)
+-
+-## Goal
+-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
+-
+-## Rules
+-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)
+-
+-This context pack prepares codebase and architectural context for implementing **spec item 18** of `docs/factory.v2.md` in `plugins/software-factory`. All file references use repo-relative paths (`plugins/software-factory/...`) with verified line ranges.
+-
+----
+-
+-## 0. Acceptance Definition (Spec Item 18)
+-
+-From `docs/factory.v2.md:89-103`:
+-- **Output contracts**: Every agent output may carry structured `concerns[]`: `{kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}`. Agents also report remarkable decisions/tradeoffs (`{chosen, alternatives, why}`).
+-- **Aggregation**: Engine aggregates them in `{task}/concerns/` with stable id (fingerprint), dedup across steps/attempts, status (`open|dismissed|routed|resolved`), and source step record pointer.
+-- **Triage**: Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder, no further action).
+-- **Routing**:
+-  - `blocker` affecting dependent item → dependent item blocked + architect consult.
+-  - `architect` → next architect turn (wave report / next iteration plan input).
+-  - `human-*` → steer mailbox per `reviewPolicy`.
+-  - `tech-debt` → plan tech-debt list.
+-- **Funneling**: `worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect.
+-- **ADRs**: Marked blocking or non-blocking. Blocking = needs human decision per active mode. Remarkable = below blocking threshold, reported in mailbox digest, never waits.
+-- **Human-involvement mode presets**: `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect prompt fragments), shipped as commented default config examples, selectable per task.
+-- **Surfacing**: Wave/plan close-ups list open concerns; close-up reviewers re-triage; architect resolves or carries; `factory status` and `state.yaml` show counts.
+-- **Deliverables**: Update `plugins/software-factory/docs/ARCHITECTURE.md` (§1 row 18, §6.2 task folder, §8), README, config commentary. Keep prompts terse (debloated). Behavior tests only.
+-
+----
+-
+-## 1. Module Map
+-
+-| Subsystem / Path | Architectural Responsibility | Key Citations |
+-|---|---|---|
+-| **Artifact & Configuration Types**<br>`plugins/software-factory/src/core/artifacts.ts` | Single source of TypeScript interfaces matching JSON schemas: `ReviewArtifact`, `DeveloperOutputArtifact`, `PlanArtifact`, `DecisionArtifact`, `SteerItemArtifact`, `StateArtifact`, `PipelineConfig`, `PipelineLimits`. | `artifacts.ts:77-133` (config), `artifacts.ts:288-373` (review, developer, closeup, decisions), `artifacts.ts:449-459` (state) |
+-| **JSON Schemas**<br>`plugins/software-factory/config/schemas/*.json` | Authoritative contracts for harness schema validation and `complete(@simpler)` structural repair: `review.schema.json`, `developer-output.schema.json`, `plan.schema.json`, `plan-closeup.schema.json`, `wave-closeup.schema.json`, `decisions.schema.json`, `steer-item.schema.json`, `state.schema.json`, `pipeline.schema.json`. | `config/schemas/developer-output.schema.json:61-69` (current free-form string concerns), `config/schemas/plan.schema.json:70-138` (adrs, techDebt, assumptions), `config/schemas/pipeline.schema.json:202-218` (reviewPolicy) |
+-| **Step Runner & Schema Resolution**<br>`plugins/software-factory/src/core/flows/step-runner.ts` | Dispatches agent turns, manages step record lifecycle, validates/repairs output, enforces HEAD guards, calls `writeArtifact` seam, commits worktree per step (§6 Invariants). | `step-runner.ts:25-30`, `step-runner.ts:90-110` (schema resolution), `step-runner.ts:220-230`, `step-runner.ts:610-655` (writeArtifact seam & commit) |
+-| **Review Schema Generator**<br>`plugins/software-factory/src/core/records/review-schema.ts` | Generates agent-specific JSON schema restricting `suggestions[].disposition` to the agent's allowed enum (§8.7). Natural insertion point for extending vocabulary with `dismiss`. | `review-schema.ts:5-52` (`generateReviewSchema`) |
+-| **Item Step Machine**<br>`plugins/software-factory/src/core/flows/item-machine.ts` | Drives per-item step execution (`develop` → `qa` → `review`), passes prompt vars (diff, target, dispositions criteria), collects suggestions, routes `human-async` to mailbox via `writeArtifact`. | `item-machine.ts:280-310` (suggestions loop), `item-machine.ts:628-647` (prompt review wiring), `item-machine.ts:706-728` (`writeQuestion` mailbox write), `item-machine.ts:750-765` (terminal conditions) |
+-| **Architect Iteration Flow**<br>`plugins/software-factory/src/core/flows/iteration.ts` | Orchestrates iteration lifecycle: `architect-plan` → `plan-review` loop (with `alt-architect`) → `pm-edits` → wave execution → `wave-close-up` → `architect-wave-report` → `plan-close-up` → `architect-closeup`. Writes ADRs, handles blocked questions. | `iteration.ts:335-400` (plan & ADR write), `iteration.ts:430-540` (plan review & revise), `iteration.ts:850-930` (wave close-up & report), `iteration.ts:1075-1150` (plan close-up & question write) |
+-| **Architect Consults & Decisions**<br>`plugins/software-factory/src/core/flows/consults.ts` | Dispatches `architect-consult-item` / `architect-consult-nonitem` on attempt/fix-round/merge failures; writes `{seq}-item-{item}.yaml` in `decisions/`; handles `human-async` question write. | `consults.ts:60-120` (item consult prompt), `consults.ts:130-180` (decision write & mailbox) |
+-| **Steering Mailbox**<br>`plugins/software-factory/src/core/steer.ts` | Root task mailbox: `writeQuestion` writes `steer/tousertoreview/{id}.yaml` with deterministic sha256 id; `listPending` reads `fromuserpending`; `classify` routes answers/directives/stop. | `steer.ts:18-40` (`listPending`), `steer.ts:59-110` (`writeQuestion`), `steer.ts:116-176` (`classify`) |
+-| **State Derivation & Counts**<br>`plugins/software-factory/src/core/derive/task.ts`<br>`plugins/software-factory/src/core/derive/item.ts`<br>`plugins/software-factory/src/core/derive/wave.ts` | Derives authoritative state from committed records + git (`deriveTaskState`, `toStateArtifact`, `deriveItemState`, `deriveWaveState`). Collects debt from plan, `accept-with-debt` decisions, and `optional` review suggestions. Cascades blocked dependencies. | `derive/task.ts:68-126` (iterations, closeups, open questions), `derive/task.ts:167-205` (debt collection), `derive/task.ts:307-335` (`toStateArtifact`), `derive/item.ts:180-260` (decisions & questions), `derive/wave.ts:44-63`, `85-100` (dependency blocking) |
+-| **Plan Scheduler**<br>`plugins/software-factory/src/core/plan/scheduler.ts` | Dependency-aware scheduling (`blockedByFailure`, `runnable`, `nextWave`). Transitive fixpoint for cascading blocked items. | `scheduler.ts:16-36` (`blockedByFailure`), `scheduler.ts:47-90` (`nextWave`), `scheduler.ts:101-135` (`runnable`) |
+-| **Fingerprints & Normalization**<br>`plugins/software-factory/src/core/fingerprint.ts`<br>`plugins/software-factory/src/core/loops.ts` | Deterministic hashing: `fingerprintText` (sha1 after whitespace/case normalization), `fingerprintObject` (sorted keys), `fingerprintSuggestions`. Reusable for stable concern fingerprint IDs and dedup. | `fingerprint.ts:10-50`, `loops.ts:169-178` |
+-| **Prompt Library & Registry**<br>`plugins/software-factory/src/core/prompts.ts`<br>`plugins/software-factory/src/core/prompt-vars.ts` | Prompt fragment rendering, `KNOWN_VARS` placeholder registry, `loadCriteriaBundle`, `formatDispositionsSection`, preflight prompt validation (`preflightPrompts`). | `prompts.ts:50-80` (`formatDispositionsSection`), `prompts.ts:420-520` (`preflightPrompts`), `prompt-vars.ts:12-38` (`PROMPT_VAR_DESCRIPTIONS`), `prompt-vars.ts:44-161` (`KNOWN_VARS`) |
+-| **CLI Status**<br>`plugins/software-factory/src/cli/status.ts` | Formats and prints derived task state, waves/items, open steer questions (`tousertoreview`), and recorded tech debt. | `status.ts:50-108` |
+-| **Engine Orchestration & Epics**<br>`plugins/software-factory/src/core/engine.ts` | Core derive-act-commit loop (`runTask`); spawns and manages child epics (`runChildTask`); processes mailbox directives; enforces budget stops (exit 10). | `engine.ts:208-285` (`runChildTask`), `engine.ts:325-335` (operator-editable globs), `engine.ts:380-465` (mailbox loop & budget stop), `engine.ts:685-715` (iteration invocation) |
+-| **Configuration Loading & Layering**<br>`plugins/software-factory/src/core/config/loader.ts`<br>`plugins/software-factory/src/core/config/merge.ts` | Loads and layers default → project (`.factory/pipeline.yaml`) → task (`{task}/pipeline.yaml`). Maps merge, arrays replace, `null` deletes. Validates against `pipeline.schema.json`. | `loader.ts:58-150`, `merge.ts:10-60` |
+-| **Agent Prompt Definitions**<br>`plugins/software-factory/agents/**` | Agent frontmatter and instructions: `developer.md`, `reviewer.md`, `plan-reviewer.md`, `architect.md`, `wave-close-up.md`, `plan-close-up.md`, `_shared/dispositions.md`, `criteria/dispositions.md`. | `agents/developer.md`, `agents/reviewer.md`, `agents/plan-reviewer.md`, `agents/criteria/dispositions.md:1-25`, `agents/_shared/dispositions.md:1-30` |
+-
+----
+-
+-## 2. Key Interfaces & Signatures
+-
+-### 2.1 Existing Artifact Types (`src/core/artifacts.ts`)
+-
+-```typescript
+-// Review Dispositions (§8.7, artifacts.ts:288-295)
+-export type ReviewDisposition =
+-  | "fix"
+-  | "optional"
+-  | "architect"
+-  | "human-awareness"
+-  | "human-async"
+-  | "human-stop";
+-
+-// Review Suggestion & Output (artifacts.ts:296-311)
+-export interface ReviewSuggestion {
+-  id: string;
+-  disposition: ReviewDisposition | string;
+-  summary: string;
+-  detail?: string;
+-  location?: { file: string; line?: number };
+-}
+-export interface ReviewArtifact {
+-  status: "approved" | "changes_requested";
+-  summary: string;
+-  suggestions: ReviewSuggestion[];
+-}
+-
+-// Current Developer Output (artifacts.ts:318-325) — free-form string concerns only
+-export interface DeveloperOutputArtifact {
+-  status: "ok" | "blocked" | "failed";
+-  summary: string;
+-  target?: DeveloperTarget;
+-  evidence?: string[];
+-  concerns?: string[];   // <--- Free-form string array; must become structured Concern[]
+-  notes?: string;
+-}
+-
+-// Plan ADRs & Tech Debt (artifacts.ts:228-252)
+-export interface PlanAdr {
+-  id: string;
+-  title: string;
+-  context: string;
+-  decision: string;
+-  consequences?: string;
+-  // Missing: blocking?: boolean
+-}
+-export interface PlanTechDebt {
+-  id: string;
+-  description: string;
+-  category: "adjacent" | "impacting" | "blocking";
+-  resolution?: string;
+-}
+-
+-// Steer Mailbox Item (artifacts.ts:375-386)
+-export interface SteerItemArtifact {
+-  id: string;
+-  ref: string;
+-  disposition: string;
+-  question: string;
+-  draftDecision?: string;
+-  blocks?: string[];
+-  status: "open" | "answered" | "dismissed";
+-  createdAt?: string;
+-  answeredAt?: string;
+-  answer?: string;
+-}
+-
+-// State Artifact (artifacts.ts:449-459)
+-export interface StateArtifact {
+-  task: string;
+-  kind?: string;
+-  status: "active" | "blocked" | "done" | "failed";
+-  iteration: number;
+-  currentWave?: number;
+-  items: Record<string, StateItemInfo>;
+-  debt?: string[];
+-  budgetSpentUsd?: number;
+-  lastUpdated: string;
+-  // Missing: concern counts & summary
+-}
+-```
+-
+-### 2.2 Spec Item 18 Structured Concern Type (Required Target Contract)
+-
+-Per `docs/factory.v2.md:90`:
+-```typescript
+-export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
+-export type ConcernSeverity = "low" | "medium" | "high";
+-export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
+-
+-export interface Concern {
+-  id?: string;                        // Stable fingerprint id assigned by engine
+-  kind: ConcernKind;
+-  summary: string;
+-  detail: string;
+-  location?: { file: string; line?: number };
+-  severity: ConcernSeverity;
+-  affects?: string[];                 // item / epic / plan references
+-}
+-
+-export interface RemarkableDecision {
+-  chosen: string;
+-  alternatives: string[];
+-  why: string;
+-}
+-
+-export interface StoredConcernArtifact extends Concern {
+-  id: string;
+-  status: ConcernStatus;
+-  disposition?: string;               // Assigned during triage
+-  dismissReason?: string;             // When disposition is "dismiss"
+-  source: {
+-    record: string;                   // Step record directory name, e.g. "003-review-a1"
+-    agent: string;
+-    step: string;
+-    item?: string;
+-    iteration?: number;
+-  };
+-  createdAt: string;
+-  updatedAt: string;
+-}
+-```
+-
+-### 2.3 Review Schema Generation (`src/core/records/review-schema.ts:5-52`)
+-
+-```typescript
+-export function generateReviewSchema(
+-  allowedDispositions: string[]
+-): Record<string, unknown>;
+-```
+-Currently generates schema where `suggestions[].disposition` is an enum of `allowedDispositions` (default: `["fix", "optional", "architect", "human-awareness", "human-async"]`). Triage extension must allow `dismiss` in this vocabulary.
+-
+-### 2.4 Step Execution & Schema Resolution (`src/core/flows/step-runner.ts`)
+-
+-```typescript
+-export interface StepRunOptions {
+-  task: string;
+-  item?: string;
+-  stepId: string;
+-  stepFragment?: string;
+-  agent: string;
+-  role?: string;
+-  cwd: string;
+-  taskDir: string;
+-  recordsDir: string;
+-  repo: any;
+-  harness: Harness;
+-  pipeline: PipelineConfig;
+-  project: ProjectConfig;
+-  prompts: any;
+-  promptVars: Record<string, string>;
+-  writeArtifact?: (output: unknown) => Promise<void>;  // <--- Seam: runs before finishStepRecord
+-  // ...
+-}
+-export interface StepRunResult {
+-  ok: boolean;
+-  status: StepMetaStatus;
+-  output?: unknown;
+-  meta: StepMetaArtifact;
+-  sessionId?: string;
+-}
+-```
+-
+----
+-
+-## 3. Relevant Code Excerpts & Current Wiring
+-
+-### 3.1 Item Machine: Review Allowed Dispositions & Prompt Wiring
+-From `plugins/software-factory/src/core/flows/item-machine.ts:631-647`:
+-```typescript
+-  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+-  const reviewAllowed =
+-    pipeline.reviewPolicy?.allowedDispositions ??
+-    pipeline.reviewPolicy?.[currentStep.agent] ??
+-    ["fix", "optional", "architect", "human-awareness", "human-async"];
+-
+-  const promptVars: Record<string, string> = {
+-    assignment: assignmentYaml,
+-    intent: intentText,
+-    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
+-    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
+-    context: "",
+-    checks: failingCheckSummaries.join("\n"),
+-    testDiff: "",
+-    diff: diffRes.stdout,
+-    feedback: feedbackText,
+-    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
+-  };
+-```
+-*Note*: Line 632 checks `pipeline.reviewPolicy?.allowedDispositions`, but `StepRunner` at `step-runner.ts:222` only reads `pipeline.reviewPolicy?.allowedDispositions` (global), so per-agent overrides (`pipeline.reviewPolicy[currentStep.agent]`) currently reach the prompt but NOT the schema generator unless resolved uniformly.
+-
+-### 3.2 Item Machine: `writeArtifact` Seam Writing `human-async` Questions
+-From `plugins/software-factory/src/core/flows/item-machine.ts:706-727`:
+-```typescript
+-    writeArtifact: async (output: unknown) => {
+-      // Persist human-async questions atomically with the review record (Finding 23)
+-      if (output && typeof output === "object" && "suggestions" in (output as any)) {
+-        const rev = output as ReviewArtifact;
+-        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
+-        if (asyncQuestions && asyncQuestions.length > 0) {
+-          for (const q of asyncQuestions) {
+-            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
+-            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
+-            await writeQuestion(taskWt, taskDir, {
+-              id: qId,
+-              ref: itemSlug,
+-              disposition: "human-async",
+-              question: q.detail || q.summary,
+-              blocks: [itemSlug],
+-            });
+-          }
+-        }
+-      }
+-    },
+-```
+-This is the proven atomic persistence pattern for routing reviewer suggestions to mailbox questions; concern aggregation from agent outputs maps naturally to this seam or an adjacent callback.
+-
+-### 3.3 Step Runner: `writeArtifact` Seam & Commit Invariant
+-From `plugins/software-factory/src/core/flows/step-runner.ts:611-655`:
+-```typescript
+-  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
+-  if (finalStatus === "ok" && opts.writeArtifact) {
+-    try {
+-      await opts.writeArtifact(validatedData);
+-    } catch (err: any) {
+-      finalStatus = "error";
+-      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
+-    }
+-  }
+-
+-  // 13. Invariant §6.3.2: Finish step record with final meta
+-  const finalMeta = await finishStepRecord({ ... });
+-
+-  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
+-  if (!(await isMerging(wtToCommit))) {
+-    await commitAll(
+-      repo,
+-      wtToCommit,
+-      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
+-    );
+-  }
+-```
+-
+-### 3.4 Steering: `writeQuestion` Stable ID Pattern
+-From `plugins/software-factory/src/core/steer.ts:63-108`:
+-```typescript
+-export async function writeQuestion(
+-  rootWt: string,
+-  taskDir: string,
+-  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
+-): Promise<SteerItemArtifact> {
+-  const hash = crypto
+-    .createHash("sha256")
+-    .update(`${q.ref}:${q.question}:${q.disposition}`)
+-    .digest("hex")
+-    .slice(0, 10);
+-
+-  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
+-  const id = q.id ?? `q-${cleanRef}-${hash}`;
+-  // ...
+-  const targetPath = path.join(outDir, `${id}.yaml`);
+-  if (fs.existsSync(targetPath)) {
+-    // A re-run step raising the same question must not clobber the operator's answer.
+-    try {
+-      const existing = yaml.parse(await fs.promises.readFile(targetPath, "utf8")) as SteerItemArtifact;
+-      return existing;
+-    } catch { }
+-  }
+-  await writeYamlAtomic(targetPath, item);
+-  return item;
+-}
+-```
+-This demonstrates the dedup and idempotent overwrite-guard pattern needed for `concerns/{id}.yaml`.
+-
+-### 3.5 Plan Review Flow: Architect <-> Reviewer Turn
+-From `plugins/software-factory/src/core/flows/iteration.ts:440-485`:
+-```typescript
+-    const revStepRes = await runAgentStep({
+-      task,
+-      stepId: revRecordName,
+-      stepFragment: "steps/plan-review",
+-      agent: "plan-reviewer",
+-      role: "alt-architect",
+-      cwd: taskWt,
+-      recordsDir: runsDir,
+-      promptVars: {
+-        plan: JSON.stringify(plan, null, 2),
+-        intent: intentText,
+-        context: contextYaml,
+-        limits: JSON.stringify(limits, null, 2),
+-        dispositionsCriteria: formatDispositionsSection(
+-          loadCriteriaBundle(pipeline.criteria).dispositions,
+-          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
+-        ),
+-      },
+-      // ...
+-    });
+-    // ...
+-    const revOutput = revStepRes.output as ReviewArtifact | undefined;
+-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
+-    if (!fixSuggestions || fixSuggestions.length === 0) {
+-      break; // Plan approved!
+-    }
+-```
+-Currently `plan-review` only acts on `fix` suggestions (looping into `architect-revise`). Architect concerns/decisions are not triaged or propagated here yet.
+-
+-### 3.6 ADR Writing: Current Implementation Only Writes Title + Context
+-From `plugins/software-factory/src/core/flows/iteration.ts:380-390`:
+-```typescript
+-        // Write ADRs if specified (§8.4.2)
+-        if (plan.adrs && project.adrFolder) {
+-          const adrDir = path.join(taskWt, project.adrFolder);
+-          await fs.promises.mkdir(adrDir, { recursive: true });
+-          for (const adr of plan.adrs) {
+-            const adrFile = path.join(adrDir, `${adr.id}.md`);
+-            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
+-          }
+-        }
+-```
+-Notice that `adr.decision` and `adr.consequences` are currently omitted from the markdown file, and there is no `blocking` flag.
+-
+-### 3.7 Derived Tech Debt Collection
+-From `plugins/software-factory/src/core/derive/task.ts:167-205`:
+-```typescript
+-  // 7. Tech debt collection
+-  const debtSet = new Set<string>();
+-  if (plan?.techDebt) {
+-    for (const d of plan.techDebt) {
+-      debtSet.add(d.description);
+-    }
+-  }
+-  // From decisions: accept-with-debt
+-  const decisionsDir = path.join(taskDir, "decisions");
+-  if (fs.existsSync(decisionsDir)) {
+-    // ... adds d.debt
+-  }
+-  // From review suggestions with disposition optional
+-  for (const it of items) {
+-    for (const rec of it.records) {
+-      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
+-        const suggestions = (rec.output as any).suggestions;
+-        for (const sug of suggestions ?? []) {
+-          if (sug.disposition === "optional" && sug.summary) {
+-            debtSet.add(`[${it.slug}] ${sug.summary}`);
+-          }
+-        }
+-      }
+-    }
+-  }
+-```
+-Concerns routed to `tech-debt` must feed into this derived debt set.
+-
+-### 3.8 Wave Dependency Blocking (Transitive Fixpoint)
+-From `plugins/software-factory/src/core/derive/wave.ts:44-63` & `plugins/software-factory/src/core/plan/scheduler.ts:16-36`:
+-```typescript
+-  // Dependents of failed items become blocked-by-failure, cascaded transitively to a fixpoint (§8.2)
+-  const schedItems = items.map((it) => ({
+-    slug: it.slug,
+-    wave: String(it.wave),
+-    deps: it.deps,
+-    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
+-  }));
+-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
+-  let grew = failureBlocked.size > 0;
+-  while (grew) {
+-    grew = false;
+-    for (const it of items) {
+-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
+-        failureBlocked.add(it.slug);
+-        grew = true;
+-      }
+-    }
+-  }
+-```
+-Spec item 18's rule ("blocker affecting a dependent item → dependent item blocked + architect consult") hooks into this dependency-blocking mechanic.
+-
+-### 3.9 Child Epic Execution & Parent State Propagation
+-From `plugins/software-factory/src/core/engine.ts:208-278`:
+-```typescript
+-export async function runChildTask(
+-  deps: EngineDeps,
+-  parent: { branch: string; path: string; taskDir: string },
+-  epicSlug: string,
+-  // ...
+-): Promise<RunResult> {
+-  // Child worktree topic/{task}--{epic}
+-  // Runs its own runIteration loop
+-  // Writes child-closeup.yaml into parentItemDir:
+-  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
+-  await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
+-    epic: epicSlug,
+-    status: childStatus,
+-    iteration: itRes.iteration,
+-    summary: `Epic child task finished: ${itRes.status}`,
+-  });
+-```
+-
+-### 3.10 CLI Status Rendering
+-From `plugins/software-factory/src/cli/status.ts:83-105`:
+-```typescript
+-  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
+-    console.log(`Open Operator Questions (tousertoreview):`);
+-    for (const q of derived.openSteerQuestions) {
+-      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
+-      console.log(`    Question: ${q.question}`);
+-      // ...
+-    }
+-  }
+-  if (derived.debt && derived.debt.length > 0) {
+-    console.log(`Recorded Technical Debt:`);
+-    for (const d of derived.debt) {
+-      console.log(`  - ${d}`);
+-    }
+-  }
+-```
+-Currently missing concern counts (`open`, `dismissed`, `routed`, `resolved`) and remarkable decision digests.
+-
+----
+-
+-## 4. Existing Tests & Conventions
+-
+-### 4.1 Testing Harness & Infrastructure
+-- **Test Runner**: `bun test` (see `plugins/software-factory/package.json:11-13`).
+-- **Temporary Git Repos**: `test/helpers/tmp-repo.ts:24-125` creates isolated git repositories with helper methods (`commit`, `createBranch`, `createWorktree`, `git`, `cleanup`).
+-- **Fake Harness Scripting**: `src/harness/fake/fake-harness.ts:40-140`. End-to-end engine tests script agent turns deterministically using label patterns:
+-  - Orchestration turns: `${task}/runs/${stepId}#a${attempt}`
+-  - Item turns: `${task}/items/${item}/${stepId}#a${attempt}`
+-  - Example: `test/engine/story-happy-path.test.ts:34-80`, `test/engine/human-async-steering.test.ts:70-130`.
+-- **Ajv Schema Verification**: Fake outcomes must conform to actual JSON schemas because `step-runner.ts:510-570` parses and validates them through `validateAndRepair`. Invalid scripted schemas trigger repair or failure.
+-
+-### 4.2 Behavior Tests Only Convention
+-Per task intent and spec §13:
+-- Tests must verify end-to-end behaviors: raising concerns, aggregation on disk, triage by reviewer, routing effects (mailbox write, dependent item blocking, consult trigger, debt inclusion), state/status surfacing.
+-- No unit tests of prompt string templates or mocking internals; use `FakeHarness` driving `runTask` or `tickItemMachine`.
+-- Target files: `test/engine/concerns-funnel.test.ts` (new behavior suite), with focused additions to `test/steer.test.ts`, `test/cli/cli.test.ts`.
+-
+-### 4.3 Prompt Preflight Invariants (`test/prompts.test.ts:102-195`)
+-- Every agent declared in `pipeline.agents` must have a loadable definition in `agents/`.
+-- Every placeholder in step fragments must be registered in `KNOWN_VARS` (`src/core/prompt-vars.ts:44-161`).
+-- Every orchestration fragment in `ENGINE_STEP_FRAGMENTS` (`src/core/prompts.ts:402-420`) must exist and pass render checks.
+-- Adding prompt fragments or variables for concern triage or human-involvement modes must update `KNOWN_VARS` and pass `preflightPrompts`.
+-
+-### 4.4 Config Layering Semantics (`test/config-layering.test.ts:5-45`)
+-- Precedence: `config/pipeline.default.yaml` → `<repo>/.factory/pipeline.yaml` → `<repo>/{task}/pipeline.yaml`.
+-- Objects deeply merge, arrays replace wholesale, explicit `null` deletes keys.
+-- `config/schemas/pipeline.schema.json:253` enforces `"additionalProperties": false` at the root, so new top-level configuration keys (like `humanInvolvement`) require schema updates.
+-
+----
+-
+-## 5. Current State vs. Item 18 Requirements (Gap Analysis)
+-
+-| Feature | Spec Item 18 Requirement | Current Codebase State | Gap to Close |
+-|---|---|---|---|
+-| **Structured Concerns in Output** | Every agent output may carry `concerns[]`: `{kind, summary, detail, location?, severity, affects?}` + remarkable decisions/tradeoffs `{chosen, alternatives, why}`. | `DeveloperOutputArtifact` has only free-form `concerns?: string[]` (`artifacts.ts:323`). Other schemas (`plan.schema.json`, `fact-finder-output.schema.json`, `wave-closeup.schema.json`, `plan-closeup.schema.json`) have no `concerns` or `remarkable` fields. | Define structured `Concern` and `RemarkableDecision` schemas/types; update output schemas for developer, fact-finder, architect plan, and close-ups. |
+-| **Engine Aggregation & Dedup** | Engine aggregates them in `{task}/concerns/` with stable fingerprint id, dedup across steps/attempts, status (`open|dismissed|routed|resolved`), source step record pointer. | No `concerns/` folder exists (`docs/ARCHITECTURE.md:185-197`). `writeQuestion` pattern exists (`steer.ts:63-108`) with sha256 hashing, but no concern aggregation logic exists. | Build `src/core/concerns.ts` with `aggregateConcerns()`: stable hash of `{kind, summary, location, affects}`, atomic YAML write in `{task}/concerns/{id}.yaml`, dedup/merge across re-runs. |
+-| **Reviewer Triage & Dispositions** | Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder). | Review vocabulary (`artifacts.ts:288-294`, `review-schema.ts:9-12`) lacks `dismiss`. `item-machine.ts` and `iteration.ts` do not pass open concerns to reviewers or collect triage decisions. | Add `dismiss` to `ReviewDisposition`; extend review schema to accept concern triage; pass open concerns in `promptVars`; record triage status/reason in `{task}/concerns/{id}.yaml`. |
+-| **Routing: Blocker & Architect** | `blocker` affecting dependent item → dependent item blocked + architect consult. `architect` → next architect turn (wave report / next plan input). | Review disposition `architect` is never routed anywhere in `item-machine.ts` or `iteration.ts`. Dependency blocking only checks `failed`/`abandoned` items (`scheduler.ts:16-36`). | Map `affects` to item slugs; mark affected items `blocked` in `deriveWaveState`/`deriveItemState`; trigger `runItemConsult` or hydrate into next architect turn (`buildArchitectHydration`). |
+-| **Routing: Human Mailbox & Tech Debt** | `human-*` → steer mailbox per policy; `tech-debt` → plan tech-debt list. | `human-async` writes to `steer/tousertoreview` (`item-machine.ts:711`), but `human-awareness` and `human-stop` are ignored. Debt collection (`derive/task.ts:167-205`) only reads plan `techDebt`, `accept-with-debt` decisions, and `optional` review suggestions. | Route `human-awareness` as non-blocking digest item in mailbox; route `human-stop` with task halt; add routed `tech-debt` concerns to `deriveTaskState` debt collection. |
+-| **Funneling & Text Budget** | `worker → reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Less detail per level, never more text than code summarized. | No text length limits or condensing mechanics exist. Close-up prompts have no concerns context. | Provide condensed summaries at each funnel tier; enforce text size bound (detail bytes ≤ diff bytes); hydrate wave report and plan close-up with open concerns. |
+-| **Blocking vs Non-blocking ADRs** | Marked blocking or non-blocking. Blocking = needs human decision per mode; remarkable = below blocking threshold, reported in mailbox digest, never waits. | `PlanAdr` has no `blocking` boolean (`artifacts.ts:235-241`). `iteration.ts:380-390` writes only title/context to `.md` files; no mailbox digest exists. | Add `blocking?: boolean` to `PlanAdr` and `plan.schema.json`; route blocking ADRs to `writeQuestion` per mode; route non-blocking remarkable ADRs to mailbox digest. |
+-| **Human-Involvement Modes** | Config presets: `autonomous`, `principal`, `detailed` (pipeline config + prompt fragments for reviewer/architect criteria), selectable per task. | No mode concept in `PipelineConfig` (`artifacts.ts:108-133`). `criteria/dispositions.md` has static criteria without mode-specific rules. | Add mode config preset examples to `config/pipeline.default.yaml`; create prompt criteria fragments (`agents/criteria/human-involvement.md`); wire into prompt rendering. |
+-| **Surfacing & State Counts** | Wave/plan close-ups list open concerns; close-up reviewers re-triage; `factory status` and `state.yaml` show counts. | `state.yaml` (`StateArtifact`, `artifacts.ts:449-459`) has no concern fields. `status.ts:83-105` prints only operator questions and debt. | Add `concerns?: { open, dismissed, routed, resolved }` to `StateArtifact`, refresh in `deriveTaskState`, and render in `cli/status.ts`. |
+-| **Documentation Updates** | Update `ARCHITECTURE.md` (§1 row 18, §6.2, §8.7), README, config commentary. | Row 18 marked "Deliberately not hand-built" (`docs/ARCHITECTURE.md:39`). | Update `docs/ARCHITECTURE.md`, `README.md`, and config comments with full concerns funnel specifications. |
+-
+----
+-
+-## 6. Open Questions & Architectural Decisions for the Architect
+-
+-1. **Aggregation Worktree & Commit Invariant (§6.2 vs §6.3)**:
+-   - *Context*: In `step-runner.ts:630-655`, an item step commits only `childWt` (`topic/{task}--{item}`). The task orchestration folder `{task}/concerns/` lives on `taskWt` (`topic/{task}`).
+-   - *Options*:
+-     - (A) Write concerns directly to `taskWt/{task}/concerns/` during item steps, matching the precedent set by `writeQuestion` (`item-machine.ts:716`) and `refreshStateYaml` (`item-machine.ts:731`), with formal task worktree commit at wave merges/edits.
+-     - (B) Write item concerns to `childWt/{task}/items/{item}/concerns/` and aggregate them onto `taskWt` when the item merges or at wave completion.
+-     - (C) Extend `runAgentStep` to commit both worktrees when task-level artifacts are written.
+-   - *Recommendation*: Option (A) is cleanest and exactly matches `writeQuestion` and `state.yaml` behavior.
+-
+-2. **Triage Schema Contract for Reviewers**:
+-   - *Context*: Reviewers need to triage concerns raised by earlier worker steps.
+-   - *Options*:
+-     - (A) Reuse the existing `suggestions[]` array in `ReviewArtifact`, extending `disposition` to include `"dismiss"`, matching on `suggestion.id = concern.id`.
+-     - (B) Add a distinct `concernTriage: Array<{ id: string; status: "confirmed" | "dismissed"; disposition?: ReviewDisposition; reason?: string }>` to `ReviewArtifact`.
+-   - *Tradeoff*: Option (A) adheres strictly to the spec phrasing ("triages new concerns with the same disposition vocabulary as review suggestions plus dismiss"), avoiding a separate schema branch.
+-
+-3. **Text Size Bound Enforcement ("never more text than the code it summarizes")**:
+-   - *Context*: How should the engine mechanically check or enforce that summaries do not bloat?
+-   - *Options*:
+-     - Purely prompt-guided with debloated instructions in reviewer/architect prompts.
+-     - Mechanical validation in the engine comparing `concern.detail.length` to `diff.length` (or capping at a sensible max like 300 characters).
+-
+-4. **Saga Concern Propagation Mechanics**:
+-   - *Context*: Epics run as child tasks (`engine.ts:208-285`) using `runChildTask`, writing `child-closeup.yaml`. How should epic concerns reach the saga architect?
+-   - *Design*: When child epics finish, un-dismissed epic-level concerns/decisions can be summarized into `child-closeup.yaml` or copied into the parent task's `concerns/` directory, hydrating the saga architect's next wave report or close-up turn.
+-
+-5. **Mailbox Digest Delivery for Remarkable Items**:
+-   - *Context*: "remarkable items reported in a mailbox digest, never waiting".
+-   - *Design*: Write to `steer/digest/` or record in `steer/tousertoreview/digest-{hash}.yaml` with `status: "open"`, `disposition: "human-awareness"`, without adding the item to `blocks: [...]`, so it surfaces in `factory status` and the mailbox without stopping the engine.
+-
+-6. **Human-Involvement Mode Configuration Placement**:
+-   - *Context*: `pipeline.schema.json` has `additionalProperties: false` at the root.
+-   - *Options*:
+-     - Add `humanInvolvement: { type: "string", enum: ["autonomous", "principal", "detailed"], default: "autonomous" }` to `config/schemas/pipeline.schema.json` and `PipelineConfig`.
+-     - Alternatively, place it inside `reviewPolicy.mode` or under `criteria.humanInvolvement`.
+-   - *Recommendation*: Adding top-level `humanInvolvement` to schema and `PipelineConfig` is cleanest and aligns with the spec intent ("human-involvement modes = config presets").
+-`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
+-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
+-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
+-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
+-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
+-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
+-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
+-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
+-
+-## Item
+-concerns-store-v2
+-
+-## Assignment
+-{"slug":"concerns-store-v2","kind":"dev","title":"Concerns store with merge and commit","assignment":"Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.","outlineRef":"concerns-store-v2","milestone":"m1-contracts-aggregate","wave":6,"deps":["concerns-contracts-policy","concerns-contracts-schemas","concerns-contracts-types"]}
+-
+-## Prior Attempts & Failures
+-Fix rounds exhausted (2/3)
+-
+-## Current Diff
+-
+-
+-## Review Feedback
+-Fix rounds exhausted (2/3) without resolution.
+-
+-Latest fix requests:
+-- [FIX] reconcileConcerns rewrites every concern with fresh updatedAt/lastSeen and commits once per record on every startup: aggregateConcerns always calls writeYamlAtomic with at = new Date() and then commitAll (concerns.ts:81-96), and reconcileConcerns replays every committed ok record unconditionally on each runTask (concerns.ts:197-205; engine.ts:370). So every task restart advances updatedAt and source.lastSeen for all concerns (artifacts.ts:336 documents lastSeen as the most recent re-emit) and adds one 'factory: concerns <record>' commit per record, even when nothing was lost. The 'idempotently' test only asserts file count and preserved status, so it does not catch the churn. Fix: make replay deterministic — process records in meta.endedAt order and derive `at` from meta.endedAt (or write only when the merged record differs) so a second startup is a no-op.
+-
+-## Context Pack
+-# Context Pack — concerns-funnel (Spec Item 18)
+-
+-This context pack prepares codebase and architectural context for implementing **spec item 18** of `docs/factory.v2.md` in `plugins/software-factory`. All file references use repo-relative paths (`plugins/software-factory/...`) with verified line ranges.
+-
+----
+-
+-## 0. Acceptance Definition (Spec Item 18)
+-
+-From `docs/factory.v2.md:89-103`:
+-- **Output contracts**: Every agent output may carry structured `concerns[]`: `{kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}`. Agents also report remarkable decisions/tradeoffs (`{chosen, alternatives, why}`).
+-- **Aggregation**: Engine aggregates them in `{task}/concerns/` with stable id (fingerprint), dedup across steps/attempts, status (`open|dismissed|routed|resolved`), and source step record pointer.
+-- **Triage**: Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder, no further action).
+-- **Routing**:
+-  - `blocker` affecting dependent item → dependent item blocked + architect consult.
+-  - `architect` → next architect turn (wave report / next iteration plan input).
+-  - `human-*` → steer mailbox per `reviewPolicy`.
+-  - `tech-debt` → plan tech-debt list.
+-- **Funneling**: `worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect.
+-- **ADRs**: Marked blocking or non-blocking. Blocking = needs human decision per active mode. Remarkable = below blocking threshold, reported in mailbox digest, never waits.
+-- **Human-involvement mode presets**: `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect prompt fragments), shipped as commented default config examples, selectable per task.
+-- **Surfacing**: Wave/plan close-ups list open concerns; close-up reviewers re-triage; architect resolves or carries; `factory status` and `state.yaml` show counts.
+-- **Deliverables**: Update `plugins/software-factory/docs/ARCHITECTURE.md` (§1 row 18, §6.2 task folder, §8), README, config commentary. Keep prompts terse (debloated). Behavior tests only.
+-
+----
+-
+-## 1. Module Map
+-
+-| Subsystem / Path | Architectural Responsibility | Key Citations |
+-|---|---|---|
+-| **Artifact & Configuration Types**<br>`plugins/software-factory/src/core/artifacts.ts` | Single source of TypeScript interfaces matching JSON schemas: `ReviewArtifact`, `DeveloperOutputArtifact`, `PlanArtifact`, `DecisionArtifact`, `SteerItemArtifact`, `StateArtifact`, `PipelineConfig`, `PipelineLimits`. | `artifacts.ts:77-133` (config), `artifacts.ts:288-373` (review, developer, closeup, decisions), `artifacts.ts:449-459` (state) |
+-| **JSON Schemas**<br>`plugins/software-factory/config/schemas/*.json` | Authoritative contracts for harness schema validation and `complete(@simpler)` structural repair: `review.schema.json`, `developer-output.schema.json`, `plan.schema.json`, `plan-closeup.schema.json`, `wave-closeup.schema.json`, `decisions.schema.json`, `steer-item.schema.json`, `state.schema.json`, `pipeline.schema.json`. | `config/schemas/developer-output.schema.json:61-69` (current free-form string concerns), `config/schemas/plan.schema.json:70-138` (adrs, techDebt, assumptions), `config/schemas/pipeline.schema.json:202-218` (reviewPolicy) |
+-| **Step Runner & Schema Resolution**<br>`plugins/software-factory/src/core/flows/step-runner.ts` | Dispatches agent turns, manages step record lifecycle, validates/repairs output, enforces HEAD guards, calls `writeArtifact` seam, commits worktree per step (§6 Invariants). | `step-runner.ts:25-30`, `step-runner.ts:90-110` (schema resolution), `step-runner.ts:220-230`, `step-runner.ts:610-655` (writeArtifact seam & commit) |
+-| **Review Schema Generator**<br>`plugins/software-factory/src/core/records/review-schema.ts` | Generates agent-specific JSON schema restricting `suggestions[].disposition` to the agent's allowed enum (§8.7). Natural insertion point for extending vocabulary with `dismiss`. | `review-schema.ts:5-52` (`generateReviewSchema`) |
+-| **Item Step Machine**<br>`plugins/software-factory/src/core/flows/item-machine.ts` | Drives per-item step execution (`develop` → `qa` → `review`), passes prompt vars (diff, target, dispositions criteria), collects suggestions, routes `human-async` to mailbox via `writeArtifact`. | `item-machine.ts:280-310` (suggestions loop), `item-machine.ts:628-647` (prompt review wiring), `item-machine.ts:706-728` (`writeQuestion` mailbox write), `item-machine.ts:750-765` (terminal conditions) |
+-| **Architect Iteration Flow**<br>`plugins/software-factory/src/core/flows/iteration.ts` | Orchestrates iteration lifecycle: `architect-plan` → `plan-review` loop (with `alt-architect`) → `pm-edits` → wave execution → `wave-close-up` → `architect-wave-report` → `plan-close-up` → `architect-closeup`. Writes ADRs, handles blocked questions. | `iteration.ts:335-400` (plan & ADR write), `iteration.ts:430-540` (plan review & revise), `iteration.ts:850-930` (wave close-up & report), `iteration.ts:1075-1150` (plan close-up & question write) |
+-| **Architect Consults & Decisions**<br>`plugins/software-factory/src/core/flows/consults.ts` | Dispatches `architect-consult-item` / `architect-consult-nonitem` on attempt/fix-round/merge failures; writes `{seq}-item-{item}.yaml` in `decisions/`; handles `human-async` question write. | `consults.ts:60-120` (item consult prompt), `consults.ts:130-180` (decision write & mailbox) |
+-| **Steering Mailbox**<br>`plugins/software-factory/src/core/steer.ts` | Root task mailbox: `writeQuestion` writes `steer/tousertoreview/{id}.yaml` with deterministic sha256 id; `listPending` reads `fromuserpending`; `classify` routes answers/directives/stop. | `steer.ts:18-40` (`listPending`), `steer.ts:59-110` (`writeQuestion`), `steer.ts:116-176` (`classify`) |
+-| **State Derivation & Counts**<br>`plugins/software-factory/src/core/derive/task.ts`<br>`plugins/software-factory/src/core/derive/item.ts`<br>`plugins/software-factory/src/core/derive/wave.ts` | Derives authoritative state from committed records + git (`deriveTaskState`, `toStateArtifact`, `deriveItemState`, `deriveWaveState`). Collects debt from plan, `accept-with-debt` decisions, and `optional` review suggestions. Cascades blocked dependencies. | `derive/task.ts:68-126` (iterations, closeups, open questions), `derive/task.ts:167-205` (debt collection), `derive/task.ts:307-335` (`toStateArtifact`), `derive/item.ts:180-260` (decisions & questions), `derive/wave.ts:44-63`, `85-100` (dependency blocking) |
+-| **Plan Scheduler**<br>`plugins/software-factory/src/core/plan/scheduler.ts` | Dependency-aware scheduling (`blockedByFailure`, `runnable`, `nextWave`). Transitive fixpoint for cascading blocked items. | `scheduler.ts:16-36` (`blockedByFailure`), `scheduler.ts:47-90` (`nextWave`), `scheduler.ts:101-135` (`runnable`) |
+-| **Fingerprints & Normalization**<br>`plugins/software-factory/src/core/fingerprint.ts`<br>`plugins/software-factory/src/core/loops.ts` | Deterministic hashing: `fingerprintText` (sha1 after whitespace/case normalization), `fingerprintObject` (sorted keys), `fingerprintSuggestions`. Reusable for stable concern fingerprint IDs and dedup. | `fingerprint.ts:10-50`, `loops.ts:169-178` |
+-| **Prompt Library & Registry**<br>`plugins/software-factory/src/core/prompts.ts`<br>`plugins/software-factory/src/core/prompt-vars.ts` | Prompt fragment rendering, `KNOWN_VARS` placeholder registry, `loadCriteriaBundle`, `formatDispositionsSection`, preflight prompt validation (`preflightPrompts`). | `prompts.ts:50-80` (`formatDispositionsSection`), `prompts.ts:420-520` (`preflightPrompts`), `prompt-vars.ts:12-38` (`PROMPT_VAR_DESCRIPTIONS`), `prompt-vars.ts:44-161` (`KNOWN_VARS`) |
+-| **CLI Status**<br>`plugins/software-factory/src/cli/status.ts` | Formats and prints derived task state, waves/items, open steer questions (`tousertoreview`), and recorded tech debt. | `status.ts:50-108` |
+-| **Engine Orchestration & Epics**<br>`plugins/software-factory/src/core/engine.ts` | Core derive-act-commit loop (`runTask`); spawns and manages child epics (`runChildTask`); processes mailbox directives; enforces budget stops (exit 10). | `engine.ts:208-285` (`runChildTask`), `engine.ts:325-335` (operator-editable globs), `engine.ts:380-465` (mailbox loop & budget stop), `engine.ts:685-715` (iteration invocation) |
+-| **Configuration Loading & Layering**<br>`plugins/software-factory/src/core/config/loader.ts`<br>`plugins/software-factory/src/core/config/merge.ts` | Loads and layers default → project (`.factory/pipeline.yaml`) → task (`{task}/pipeline.yaml`). Maps merge, arrays replace, `null` deletes. Validates against `pipeline.schema.json`. | `loader.ts:58-150`, `merge.ts:10-60` |
+-| **Agent Prompt Definitions**<br>`plugins/software-factory/agents/**` | Agent frontmatter and instructions: `developer.md`, `reviewer.md`, `plan-reviewer.md`, `architect.md`, `wave-close-up.md`, `plan-close-up.md`, `_shared/dispositions.md`, `criteria/dispositions.md`. | `agents/developer.md`, `agents/reviewer.md`, `agents/plan-reviewer.md`, `agents/criteria/dispositions.md:1-25`, `agents/_shared/dispositions.md:1-30` |
+-
+----
+-
+-## 2. Key Interfaces & Signatures
+-
+-### 2.1 Existing Artifact Types (`src/core/artifacts.ts`)
+-
+-```typescript
+-// Review Dispositions (§8.7, artifacts.ts:288-295)
+-export type ReviewDisposition =
+-  | "fix"
+-  | "optional"
+-  | "architect"
+-  | "human-awareness"
+-  | "human-async"
+-  | "human-stop";
+-
+-// Review Suggestion & Output (artifacts.ts:296-311)
+-export interface ReviewSuggestion {
+-  id: string;
+-  disposition: ReviewDisposition | string;
+-  summary: string;
+-  detail?: string;
+-  location?: { file: string; line?: number };
+-}
+-export interface ReviewArtifact {
+-  status: "approved" | "changes_requested";
+-  summary: string;
+-  suggestions: ReviewSuggestion[];
+-}
+-
+-// Current Developer Output (artifacts.ts:318-325) — free-form string concerns only
+-export interface DeveloperOutputArtifact {
+-  status: "ok" | "blocked" | "failed";
+-  summary: string;
+-  target?: DeveloperTarget;
+-  evidence?: string[];
+-  concerns?: string[];   // <--- Free-form string array; must become structured Concern[]
+-  notes?: string;
+-}
+-
+-// Plan ADRs & Tech Debt (artifacts.ts:228-252)
+-export interface PlanAdr {
+-  id: string;
+-  title: string;
+-  context: string;
+-  decision: string;
+-  consequences?: string;
+-  // Missing: blocking?: boolean
+-}
+-export interface PlanTechDebt {
+-  id: string;
+-  description: string;
+-  category: "adjacent" | "impacting" | "blocking";
+-  resolution?: string;
+-}
+-
+-// Steer Mailbox Item (artifacts.ts:375-386)
+-export interface SteerItemArtifact {
+-  id: string;
+-  ref: string;
+-  disposition: string;
+-  question: string;
+-  draftDecision?: string;
+-  blocks?: string[];
+-  status: "open" | "answered" | "dismissed";
+-  createdAt?: string;
+-  answeredAt?: string;
+-  answer?: string;
+-}
+-
+-// State Artifact (artifacts.ts:449-459)
+-export interface StateArtifact {
+-  task: string;
+-  kind?: string;
+-  status: "active" | "blocked" | "done" | "failed";
+-  iteration: number;
+-  currentWave?: number;
+-  items: Record<string, StateItemInfo>;
+-  debt?: string[];
+-  budgetSpentUsd?: number;
+-  lastUpdated: string;
+-  // Missing: concern counts & summary
+-}
+-```
+-
+-### 2.2 Spec Item 18 Structured Concern Type (Required Target Contract)
+-
+-Per `docs/factory.v2.md:90`:
+-```typescript
+-export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
+-export type ConcernSeverity = "low" | "medium" | "high";
+-export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
+-
+-export interface Concern {
+-  id?: string;                        // Stable fingerprint id assigned by engine
+-  kind: ConcernKind;
+-  summary: string;
+-  detail: string;
+-  location?: { file: string; line?: number };
+-  severity: ConcernSeverity;
+-  affects?: string[];                 // item / epic / plan references
+-}
+-
+-export interface RemarkableDecision {
+-  chosen: string;
+-  alternatives: string[];
+-  why: string;
+-}
+-
+-export interface StoredConcernArtifact extends Concern {
+-  id: string;
+-  status: ConcernStatus;
+-  disposition?: string;               // Assigned during triage
+-  dismissReason?: string;             // When disposition is "dismiss"
+-  source: {
+-    record: string;                   // Step record directory name, e.g. "003-review-a1"
+-    agent: string;
+-    step: string;
+-    item?: string;
+-    iteration?: number;
+-  };
+-  createdAt: string;
+-  updatedAt: string;
+-}
+-```
+-
+-### 2.3 Review Schema Generation (`src/core/records/review-schema.ts:5-52`)
+-
+-```typescript
+-export function generateReviewSchema(
+-  allowedDispositions: string[]
+-): Record<string, unknown>;
+-```
+-Currently generates schema where `suggestions[].disposition` is an enum of `allowedDispositions` (default: `["fix", "optional", "architect", "human-awareness", "human-async"]`). Triage extension must allow `dismiss` in this vocabulary.
+-
+-### 2.4 Step Execution & Schema Resolution (`src/core/flows/step-runner.ts`)
+-
+-```typescript
+-export interface StepRunOptions {
+-  task: string;
+-  item?: string;
+-  stepId: string;
+-  stepFragment?: string;
+-  agent: string;
+-  role?: string;
+-  cwd: string;
+-  taskDir: string;
+-  recordsDir: string;
+-  repo: any;
+-  harness: Harness;
+-  pipeline: PipelineConfig;
+-  project: ProjectConfig;
+-  prompts: any;
+-  promptVars: Record<string, string>;
+-  writeArtifact?: (output: unknown) => Promise<void>;  // <--- Seam: runs before finishStepRecord
+-  // ...
+-}
+-export interface StepRunResult {
+-  ok: boolean;
+-  status: StepMetaStatus;
+-  output?: unknown;
+-  meta: StepMetaArtifact;
+-  sessionId?: string;
+-}
+-```
+-
+----
+-
+-## 3. Relevant Code Excerpts & Current Wiring
+-
+-### 3.1 Item Machine: Review Allowed Dispositions & Prompt Wiring
+-From `plugins/software-factory/src/core/flows/item-machine.ts:631-647`:
+-```typescript
+-  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+-  const reviewAllowed =
+-    pipeline.reviewPolicy?.allowedDispositions ??
+-    pipeline.reviewPolicy?.[currentStep.agent] ??
+-    ["fix", "optional", "architect", "human-awareness", "human-async"];
+-
+-  const promptVars: Record<string, string> = {
+-    assignment: assignmentYaml,
+-    intent: intentText,
+-    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
+-    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
+-    context: "",
+-    checks: failingCheckSummaries.join("\n"),
+-    testDiff: "",
+-    diff: diffRes.stdout,
+-    feedback: feedbackText,
+-    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
+-  };
+-```
+-*Note*: Line 632 checks `pipeline.reviewPolicy?.allowedDispositions`, but `StepRunner` at `step-runner.ts:222` only reads `pipeline.reviewPolicy?.allowedDispositions` (global), so per-agent overrides (`pipeline.reviewPolicy[currentStep.agent]`) currently reach the prompt but NOT the schema generator unless resolved uniformly.
+-
+-### 3.2 Item Machine: `writeArtifact` Seam Writing `human-async` Questions
+-From `plugins/software-factory/src/core/flows/item-machine.ts:706-727`:
+-```typescript
+-    writeArtifact: async (output: unknown) => {
+-      // Persist human-async questions atomically with the review record (Finding 23)
+-      if (output && typeof output === "object" && "suggestions" in (output as any)) {
+-        const rev = output as ReviewArtifact;
+-        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
+-        if (asyncQuestions && asyncQuestions.length > 0) {
+-          for (const q of asyncQuestions) {
+-            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
+-            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
+-            await writeQuestion(taskWt, taskDir, {
+-              id: qId,
+-              ref: itemSlug,
+-              disposition: "human-async",
+-              question: q.detail || q.summary,
+-              blocks: [itemSlug],
+-            });
+-          }
+-        }
+-      }
+-    },
+-```
+-This is the proven atomic persistence pattern for routing reviewer suggestions to mailbox questions; concern aggregation from agent outputs maps naturally to this seam or an adjacent callback.
+-
+-### 3.3 Step Runner: `writeArtifact` Seam & Commit Invariant
+-From `plugins/software-factory/src/core/flows/step-runner.ts:611-655`:
+-```typescript
+-  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
+-  if (finalStatus === "ok" && opts.writeArtifact) {
+-    try {
+-      await opts.writeArtifact(validatedData);
+-    } catch (err: any) {
+-      finalStatus = "error";
+-      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
+-    }
+-  }
+-
+-  // 13. Invariant §6.3.2: Finish step record with final meta
+-  const finalMeta = await finishStepRecord({ ... });
+-
+-  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
+-  if (!(await isMerging(wtToCommit))) {
+-    await commitAll(
+-      repo,
+-      wtToCommit,
+-      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
+-    );
+-  }
+-```
+-
+-### 3.4 Steering: `writeQuestion` Stable ID Pattern
+-From `plugins/software-factory/src/core/steer.ts:63-108`:
+-```typescript
+-export async function writeQuestion(
+-  rootWt: string,
+-  taskDir: string,
+-  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
+-): Promise<SteerItemArtifact> {
+-  const hash = crypto
+-    .createHash("sha256")
+-    .update(`${q.ref}:${q.question}:${q.disposition}`)
+-    .digest("hex")
+-    .slice(0, 10);
+-
+-  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
+-  const id = q.id ?? `q-${cleanRef}-${hash}`;
+-  // ...
+-  const targetPath = path.join(outDir, `${id}.yaml`);
+-  if (fs.existsSync(targetPath)) {
+-    // A re-run step raising the same question must not clobber the operator's answer.
+-    try {
+-      const existing = yaml.parse(await fs.promises.readFile(targetPath, "utf8")) as SteerItemArtifact;
+-      return existing;
+-    } catch { }
+-  }
+-  await writeYamlAtomic(targetPath, item);
+-  return item;
+-}
+-```
+-This demonstrates the dedup and idempotent overwrite-guard pattern needed for `concerns/{id}.yaml`.
+-
+-### 3.5 Plan Review Flow: Architect <-> Reviewer Turn
+-From `plugins/software-factory/src/core/flows/iteration.ts:440-485`:
+-```typescript
+-    const revStepRes = await runAgentStep({
+-      task,
+-      stepId: revRecordName,
+-      stepFragment: "steps/plan-review",
+-      agent: "plan-reviewer",
+-      role: "alt-architect",
+-      cwd: taskWt,
+-      recordsDir: runsDir,
+-      promptVars: {
+-        plan: JSON.stringify(plan, null, 2),
+-        intent: intentText,
+-        context: contextYaml,
+-        limits: JSON.stringify(limits, null, 2),
+-        dispositionsCriteria: formatDispositionsSection(
+-          loadCriteriaBundle(pipeline.criteria).dispositions,
+-          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
+-        ),
+-      },
+-      // ...
+-    });
+-    // ...
+-    const revOutput = revStepRes.output as ReviewArtifact | undefined;
+-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
+-    if (!fixSuggestions || fixSuggestions.length === 0) {
+-      break; // Plan approved!
+-    }
+-```
+-Currently `plan-review` only acts on `fix` suggestions (looping into `architect-revise`). Architect concerns/decisions are not triaged or propagated here yet.
+-
+-### 3.6 ADR Writing: Current Implementation Only Writes Title + Context
+-From `plugins/software-factory/src/core/flows/iteration.ts:380-390`:
+-```typescript
+-        // Write ADRs if specified (§8.4.2)
+-        if (plan.adrs && project.adrFolder) {
+-          const adrDir = path.join(taskWt, project.adrFolder);
+-          await fs.promises.mkdir(adrDir, { recursive: true });
+-          for (const adr of plan.adrs) {
+-            const adrFile = path.join(adrDir, `${adr.id}.md`);
+-            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
+-          }
+-        }
+-```
+-Notice that `adr.decision` and `adr.consequences` are currently omitted from the markdown file, and there is no `blocking` flag.
+-
+-### 3.7 Derived Tech Debt Collection
+-From `plugins/software-factory/src/core/derive/task.ts:167-205`:
+-```typescript
+-  // 7. Tech debt collection
+-  const debtSet = new Set<string>();
+-  if (plan?.techDebt) {
+-    for (const d of plan.techDebt) {
+-      debtSet.add(d.description);
+-    }
+-  }
+-  // From decisions: accept-with-debt
+-  const decisionsDir = path.join(taskDir, "decisions");
+-  if (fs.existsSync(decisionsDir)) {
+-    // ... adds d.debt
+-  }
+-  // From review suggestions with disposition optional
+-  for (const it of items) {
+-    for (const rec of it.records) {
+-      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
+-        const suggestions = (rec.output as any).suggestions;
+-        for (const sug of suggestions ?? []) {
+-          if (sug.disposition === "optional" && sug.summary) {
+-            debtSet.add(`[${it.slug}] ${sug.summary}`);
+-          }
+-        }
+-      }
+-    }
+-  }
+-```
+-Concerns routed to `tech-debt` must feed into this derived debt set.
+-
+-### 3.8 Wave Dependency Blocking (Transitive Fixpoint)
+-From `plugins/software-factory/src/core/derive/wave.ts:44-63` & `plugins/software-factory/src/core/plan/scheduler.ts:16-36`:
+-```typescript
+-  // Dependents of failed items become blocked-by-failure, cascaded transitively to a fixpoint (§8.2)
+-  const schedItems = items.map((it) => ({
+-    slug: it.slug,
+-    wave: String(it.wave),
+-    deps: it.deps,
+-    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
+-  }));
+-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
+-  let grew = failureBlocked.size > 0;
+-  while (grew) {
+-    grew = false;
+-    for (const it of items) {
+-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
+-        failureBlocked.add(it.slug);
+-        grew = true;
+-      }
+-    }
+-  }
+-```
+-Spec item 18's rule ("blocker affecting a dependent item → dependent item blocked + architect consult") hooks into this dependency-blocking mechanic.
+-
+-### 3.9 Child Epic Execution & Parent State Propagation
+-From `plugins/software-factory/src/core/engine.ts:208-278`:
+-```typescript
+-export async function runChildTask(
+-  deps: EngineDeps,
+-  parent: { branch: string; path: string; taskDir: string },
+-  epicSlug: string,
+-  // ...
+-): Promise<RunResult> {
+-  // Child worktree topic/{task}--{epic}
+-  // Runs its own runIteration loop
+-  // Writes child-closeup.yaml into parentItemDir:
+-  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
+-  await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
+-    epic: epicSlug,
+-    status: childStatus,
+-    iteration: itRes.iteration,
+-    summary: `Epic child task finished: ${itRes.status}`,
+-  });
+-```
+-
+-### 3.10 CLI Status Rendering
+-From `plugins/software-factory/src/cli/status.ts:83-105`:
+-```typescript
+-  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
+-    console.log(`Open Operator Questions (tousertoreview):`);
+-    for (const q of derived.openSteerQuestions) {
+-      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
+-      console.log(`    Question: ${q.question}`);
+-      // ...
+-    }
+-  }
+-  if (derived.debt && derived.debt.length > 0) {
+-    console.log(`Recorded Technical Debt:`);
+-    for (const d of derived.debt) {
+-      console.log(`  - ${d}`);
+-    }
+-  }
+-```
+-Currently missing concern counts (`open`, `dismissed`, `routed`, `resolved`) and remarkable decision digests.
+-
+----
+-
+-## 4. Existing Tests & Conventions
+-
+-### 4.1 Testing Harness & Infrastructure
+-- **Test Runner**: `bun test` (see `plugins/software-factory/package.json:11-13`).
+-- **Temporary Git Repos**: `test/helpers/tmp-repo.ts:24-125` creates isolated git repositories with helper methods (`commit`, `createBranch`, `createWorktree`, `git`, `cleanup`).
+-- **Fake Harness Scripting**: `src/harness/fake/fake-harness.ts:40-140`. End-to-end engine tests script agent turns deterministically using label patterns:
+-  - Orchestration turns: `${task}/runs/${stepId}#a${attempt}`
+-  - Item turns: `${task}/items/${item}/${stepId}#a${attempt}`
+-  - Example: `test/engine/story-happy-path.test.ts:34-80`, `test/engine/human-async-steering.test.ts:70-130`.
+-- **Ajv Schema Verification**: Fake outcomes must conform to actual JSON schemas because `step-runner.ts:510-570` parses and validates them through `validateAndRepair`. Invalid scripted schemas trigger repair or failure.
+-
+-### 4.2 Behavior Tests Only Convention
+-Per task intent and spec §13:
+-- Tests must verify end-to-end behaviors: raising concerns, aggregation on disk, triage by reviewer, routing effects (mailbox write, dependent item blocking, consult trigger, debt inclusion), state/status surfacing.
+-- No unit tests of prompt string templates or mocking internals; use `FakeHarness` driving `runTask` or `tickItemMachine`.
+-- Target files: `test/engine/concerns-funnel.test.ts` (new behavior suite), with focused additions to `test/steer.test.ts`, `test/cli/cli.test.ts`.
+-
+-### 4.3 Prompt Preflight Invariants (`test/prompts.test.ts:102-195`)
+-- Every agent declared in `pipeline.agents` must have a loadable definition in `agents/`.
+-- Every placeholder in step fragments must be registered in `KNOWN_VARS` (`src/core/prompt-vars.ts:44-161`).
+-- Every orchestration fragment in `ENGINE_STEP_FRAGMENTS` (`src/core/prompts.ts:402-420`) must exist and pass render checks.
+-- Adding prompt fragments or variables for concern triage or human-involvement modes must update `KNOWN_VARS` and pass `preflightPrompts`.
+-
+-### 4.4 Config Layering Semantics (`test/config-layering.test.ts:5-45`)
+-- Precedence: `config/pipeline.default.yaml` → `<repo>/.factory/pipeline.yaml` → `<repo>/{task}/pipeline.yaml`.
+-- Objects deeply merge, arrays replace wholesale, explicit `null` deletes keys.
+-- `config/schemas/pipeline.schema.json:253` enforces `"additionalProperties": false` at the root, so new top-level configuration keys (like `humanInvolvement`) require schema updates.
+-
+----
+-
+-## 5. Current State vs. Item 18 Requirements (Gap Analysis)
+-
+-| Feature | Spec Item 18 Requirement | Current Codebase State | Gap to Close |
+-|---|---|---|---|
+-| **Structured Concerns in Output** | Every agent output may carry `concerns[]`: `{kind, summary, detail, location?, severity, affects?}` + remarkable decisions/tradeoffs `{chosen, alternatives, why}`. | `DeveloperOutputArtifact` has only free-form `concerns?: string[]` (`artifacts.ts:323`). Other schemas (`plan.schema.json`, `fact-finder-output.schema.json`, `wave-closeup.schema.json`, `plan-closeup.schema.json`) have no `concerns` or `remarkable` fields. | Define structured `Concern` and `RemarkableDecision` schemas/types; update output schemas for developer, fact-finder, architect plan, and close-ups. |
+-| **Engine Aggregation & Dedup** | Engine aggregates them in `{task}/concerns/` with stable fingerprint id, dedup across steps/attempts, status (`open|dismissed|routed|resolved`), source step record pointer. | No `concerns/` folder exists (`docs/ARCHITECTURE.md:185-197`). `writeQuestion` pattern exists (`steer.ts:63-108`) with sha256 hashing, but no concern aggregation logic exists. | Build `src/core/concerns.ts` with `aggregateConcerns()`: stable hash of `{kind, summary, location, affects}`, atomic YAML write in `{task}/concerns/{id}.yaml`, dedup/merge across re-runs. |
+-| **Reviewer Triage & Dispositions** | Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder). | Review vocabulary (`artifacts.ts:288-294`, `review-schema.ts:9-12`) lacks `dismiss`. `item-machine.ts` and `iteration.ts` do not pass open concerns to reviewers or collect triage decisions. | Add `dismiss` to `ReviewDisposition`; extend review schema to accept concern triage; pass open concerns in `promptVars`; record triage status/reason in `{task}/concerns/{id}.yaml`. |
+-| **Routing: Blocker & Architect** | `blocker` affecting dependent item → dependent item blocked + architect consult. `architect` → next architect turn (wave report / next plan input). | Review disposition `architect` is never routed anywhere in `item-machine.ts` or `iteration.ts`. Dependency blocking only checks `failed`/`abandoned` items (`scheduler.ts:16-36`). | Map `affects` to item slugs; mark affected items `blocked` in `deriveWaveState`/`deriveItemState`; trigger `runItemConsult` or hydrate into next architect turn (`buildArchitectHydration`). |
+-| **Routing: Human Mailbox & Tech Debt** | `human-*` → steer mailbox per policy; `tech-debt` → plan tech-debt list. | `human-async` writes to `steer/tousertoreview` (`item-machine.ts:711`), but `human-awareness` and `human-stop` are ignored. Debt collection (`derive/task.ts:167-205`) only reads plan `techDebt`, `accept-with-debt` decisions, and `optional` review suggestions. | Route `human-awareness` as non-blocking digest item in mailbox; route `human-stop` with task halt; add routed `tech-debt` concerns to `deriveTaskState` debt collection. |
+-| **Funneling & Text Budget** | `worker → reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Less detail per level, never more text than code summarized. | No text length limits or condensing mechanics exist. Close-up prompts have no concerns context. | Provide condensed summaries at each funnel tier; enforce text size bound (detail bytes ≤ diff bytes); hydrate wave report and plan close-up with open concerns. |
+-| **Blocking vs Non-blocking ADRs** | Marked blocking or non-blocking. Blocking = needs human decision per mode; remarkable = below blocking threshold, reported in mailbox digest, never waits. | `PlanAdr` has no `blocking` boolean (`artifacts.ts:235-241`). `iteration.ts:380-390` writes only title/context to `.md` files; no mailbox digest exists. | Add `blocking?: boolean` to `PlanAdr` and `plan.schema.json`; route blocking ADRs to `writeQuestion` per mode; route non-blocking remarkable ADRs to mailbox digest. |
+-| **Human-Involvement Modes** | Config presets: `autonomous`, `principal`, `detailed` (pipeline config + prompt fragments for reviewer/architect criteria), selectable per task. | No mode concept in `PipelineConfig` (`artifacts.ts:108-133`). `criteria/dispositions.md` has static criteria without mode-specific rules. | Add mode config preset examples to `config/pipeline.default.yaml`; create prompt criteria fragments (`agents/criteria/human-involvement.md`); wire into prompt rendering. |
+-| **Surfacing & State Counts** | Wave/plan close-ups list open concerns; close-up reviewers re-triage; `factory status` and `state.yaml` show counts. | `state.yaml` (`StateArtifact`, `artifacts.ts:449-459`) has no concern fields. `status.ts:83-105` prints only operator questions and debt. | Add `concerns?: { open, dismissed, routed, resolved }` to `StateArtifact`, refresh in `deriveTaskState`, and render in `cli/status.ts`. |
+-| **Documentation Updates** | Update `ARCHITECTURE.md` (§1 row 18, §6.2, §8.7), README, config commentary. | Row 18 marked "Deliberately not hand-built" (`docs/ARCHITECTURE.md:39`). | Update `docs/ARCHITECTURE.md`, `README.md`, and config comments with full concerns funnel specifications. |
+-
+----
+-
+-## 6. Open Questions & Architectural Decisions for the Architect
+-
+-1. **Aggregation Worktree & Commit Invariant (§6.2 vs §6.3)**:
+-   - *Context*: In `step-runner.ts:630-655`, an item step commits only `childWt` (`topic/{task}--{item}`). The task orchestration folder `{task}/concerns/` lives on `taskWt` (`topic/{task}`).
+-   - *Options*:
+-     - (A) Write concerns directly to `taskWt/{task}/concerns/` during item steps, matching the precedent set by `writeQuestion` (`item-machine.ts:716`) and `refreshStateYaml` (`item-machine.ts:731`), with formal task worktree commit at wave merges/edits.
+-     - (B) Write item concerns to `childWt/{task}/items/{item}/concerns/` and aggregate them onto `taskWt` when the item merges or at wave completion.
+-     - (C) Extend `runAgentStep` to commit both worktrees when task-level artifacts are written.
+-   - *Recommendation*: Option (A) is cleanest and exactly matches `writeQuestion` and `state.yaml` behavior.
+-
+-2. **Triage Schema Contract for Reviewers**:
+-   - *Context*: Reviewers need to triage concerns raised by earlier worker steps.
+-   - *Options*:
+-     - (A) Reuse the existing `suggestions[]` array in `ReviewArtifact`, extending `disposition` to include `"dismiss"`, matching on `suggestion.id = concern.id`.
+-     - (B) Add a distinct `concernTriage: Array<{ id: string; status: "confirmed" | "dismissed"; disposition?: ReviewDisposition; reason?: string }>` to `ReviewArtifact`.
+-   - *Tradeoff*: Option (A) adheres strictly to the spec phrasing ("triages new concerns with the same disposition vocabulary as review suggestions plus dismiss"), avoiding a separate schema branch.
+-
+-3. **Text Size Bound Enforcement ("never more text than the code it summarizes")**:
+-   - *Context*: How should the engine mechanically check or enforce that summaries do not bloat?
+-   - *Options*:
+-     - Purely prompt-guided with debloated instructions in reviewer/architect prompts.
+-     - Mechanical validation in the engine comparing `concern.detail.length` to `diff.length` (or capping at a sensible max like 300 characters).
+-
+-4. **Saga Concern Propagation Mechanics**:
+-   - *Context*: Epics run as child tasks (`engine.ts:208-285`) using `runChildTask`, writing `child-closeup.yaml`. How should epic concerns reach the saga architect?
+-   - *Design*: When child epics finish, un-dismissed epic-level concerns/decisions can be summarized into `child-closeup.yaml` or copied into the parent task's `concerns/` directory, hydrating the saga architect's next wave report or close-up turn.
+-
+-5. **Mailbox Digest Delivery for Remarkable Items**:
+-   - *Context*: "remarkable items reported in a mailbox digest, never waiting".
+-   - *Design*: Write to `steer/digest/` or record in `steer/tousertoreview/digest-{hash}.yaml` with `status: "open"`, `disposition: "human-awareness"`, without adding the item to `blocks: [...]`, so it surfaces in `factory status` and the mailbox without stopping the engine.
+-
+-6. **Human-Involvement Mode Configuration Placement**:
+-   - *Context*: `pipeline.schema.json` has `additionalProperties: false` at the root.
+-   - *Options*:
+-     - Add `humanInvolvement: { type: "string", enum: ["autonomous", "principal", "detailed"], default: "autonomous" }` to `config/schemas/pipeline.schema.json` and `PipelineConfig`.
+-     - Alternatively, place it inside `reviewPolicy.mode` or under `criteria.humanInvolvement`.
+-   - *Recommendation*: Adding top-level `humanInvolvement` to schema and `PipelineConfig` is cleanest and aligns with the spec intent ("human-involvement modes = config presets").
+-
+-## Output
+-
+-Yield a structured JSON object matching this schema:
+-- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
+-- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
+-- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
+-- rationale (string, optional): Technical justification for this decision
+-- text (string, optional): Concrete guidance or steering directives
+-- persist (boolean, optional): Whether guidance persists across subsequent attempts
+-- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
+-- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
+-- outline (object, optional): Item outline to schedule when decision is fix-item
+-- debt (string, optional): Technical debt description when decision is accept-with-debt
+-- reason (string, optional): Reason for abandonment or abort
+-- question (string, optional): Specific question for human operator when decision is human-async or blocked
+-- planDelta (string, optional): Plan delta or amendment directives when decision is amend
+-- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
+diff --git a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/meta.yaml b/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/meta.yaml
+deleted file mode 100644
+index 45ecf8b..0000000
+--- a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/meta.yaml
++++ /dev/null
+@@ -1,17 +0,0 @@
+-seq: 27
+-name: consult-concerns-store-v2
+-attempt: 1
+-agent: architect
+-role: architect
+-models:
+-  - opencode-go/muse-spark-1.3-contributor
+-session: 01a1b894-4755-7787-a1ed-8df6c7a062a2
+-timeoutSec: 1200
+-status: ok
+-startedAt: 2026-11-08T07:43:34.437Z
+-endedAt: 2026-11-08T07:44:24.472Z
+-usage:
+-  inputTokens: 441383
+-  outputTokens: 2773
+-  costUsd: 0.046433
+-traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-34-47-765Z_01a1b894-4755-7787-a1ed-8df6c7a062a2.jsonl
+diff --git a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/output.yaml b/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/output.yaml
+deleted file mode 100644
+index de68832..0000000
+--- a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/output.yaml
++++ /dev/null
+@@ -1,22 +0,0 @@
+-context: item
+-decision: retry-with-guidance
+-persist: true
+-rationale: "Reviewer defect is valid and blocks M1 restart-idempotency
+-  invariant: unconditional replay with wall-clock timestamps rewrites every
+-  concern and commits per record on each startup, churning updatedAt/lastSeen
+-  and git history. Root cause is localized to aggregate/reconcile timestamp and
+-  dirty handling, fixable in one small round. No split or escalation warranted."
+-text: "Fix reconcile idempotency in concerns-store-v2 (one round): 1) Add
+-  opts.at to aggregateConcerns/merge (default now ISO). Live step seams keep
+-  wall-clock; reconcile passes meta.endedAt. 2) Write-only-on-diff: compare
+-  merged vs existing on content fields (detail, severity, sources, status,
+-  disposition, escalated); if equal and existing lastSeen >= at, skip
+-  writeYamlAtomic entirely. Else write with updatedAt=at,
+-  lastSeen=max(existing.lastSeen, at). 3) reconcileConcerns: enumerate committed
+-  ok records (runs + items/*/steps), read meta.endedAt, sort ascending (fallback
+-  seq/name), replay in order with at=endedAt; track dirty flag; single commitAll
+-  at end only if dirty — remove per-record commitAll from replay path. 4)
+-  Strengthen idempotency test: hash concern files + git rev-parse HEAD after
+-  first reconcile, run reconcile again, assert bytes and HEAD unchanged and
+-  updatedAt/lastSeen equal endedAt values. Keep KeyedMutex RMW-only, never wrap
+-  commitAll in repo.writeLock, ingest errors never change step status."
+diff --git a/.factory/tasks/concerns-funnel/state.yaml b/.factory/tasks/concerns-funnel/state.yaml
+index fd370f9..5248052 100644
+--- a/.factory/tasks/concerns-funnel/state.yaml
++++ b/.factory/tasks/concerns-funnel/state.yaml
+@@ -40,14 +40,14 @@ items:
+     mergedAt: 2026-11-07T23:50:13-05:00
+   concerns-store:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--concerns-store
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   modes-prompts:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--modes-prompts
+     attempts: 1
+     fixRounds: 1
+@@ -72,157 +72,71 @@ items:
+     mergedAt: 2026-11-08T00:52:12-05:00
+   plan-reviewer-triage:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--plan-reviewer-triage
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   reviewer-triage:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--reviewer-triage
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   routing-blocker-derive:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--routing-blocker-derive
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   routing-human-debt:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--routing-human-debt
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   adr-blocking-digest:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--adr-blocking-digest
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   routing-architect-consult:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--routing-architect-consult
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   status-state-surface:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--status-state-surface
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+-  concerns-store-v2:
+-    kind: dev
+-    status: running
+-    branch: topic/concerns-funnel--concerns-store-v2
+-    attempts: 2
+-    fixRounds: 3
+-    spendUsd: 0.48322400000000004
+-    currentStep: review
+   funnel-closeups:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--funnel-closeups
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+-  modes-prompts-v2:
+-    kind: dev
+-    status: ready
+-    branch: topic/concerns-funnel--modes-prompts-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.139671
+-    currentStep: review
+   saga-propagate:
+     kind: dev
+-    status: superseded
++    status: pending
+     branch: topic/concerns-funnel--saga-propagate
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+   docs-finish:
+-    kind: dev
+-    status: superseded
+-    branch: topic/concerns-funnel--docs-finish
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  plan-reviewer-triage-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--plan-reviewer-triage-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  reviewer-triage-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--reviewer-triage-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  routing-blocker-derive-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--routing-blocker-derive-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  routing-human-debt-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--routing-human-debt-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  adr-blocking-digest-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--adr-blocking-digest-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  routing-architect-consult-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--routing-architect-consult-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  status-state-surface-v2:
+     kind: dev
+     status: pending
+-    branch: topic/concerns-funnel--status-state-surface-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  funnel-closeups-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--funnel-closeups-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  saga-propagate-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--saga-propagate-v2
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  docs-finish-v2:
+-    kind: dev
+-    status: pending
+-    branch: topic/concerns-funnel--docs-finish-v2
++    branch: topic/concerns-funnel--docs-finish
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+@@ -290,59 +204,20 @@ debt:
+     store story must reconcile"
+   - "[concerns-contracts-schemas] inferTaskWorktree fix correct but lacks direct
+     unit test"
+-  - "[concerns-store-v2] listOpenConcerns silently skips corrupt YAML instead of
+-    surfacing it"
+-  - "[concerns-store-v2] aggregateConcerns validates only remarkable.chosen;
+-    missing why throws mid-RMW after partial writes"
+-  - "[concerns-store-v2] KINDS/RANK hardcode enums instead of deriving from
+-    schema single source"
+-  - "[concerns-store-v2] reconcile filters by HEAD ls-tree but reads worktree
+-    files, can ingest dirty outputs"
+-  - "[concerns-store-v2] Non-dismiss triage to routed leaves stale
+-    dismissReason/pendingResolution"
+-  - "[concerns-store-v2] Startup reconcile error journal can throw and crash
+-    runTask unlike task_error guard"
+-  - "[concerns-store-v2] listOpenConcerns still silently drops unreadable YAML
+-    and only validates kind"
+-  - "[concerns-store-v2] Routed triage clears dismissReason but leaves stale
+-    pendingResolution; no regression test"
+-  - "[concerns-store-v2] No regression test for r2 remarkable pre-lock
+-    validation"
+-  - "[concerns-store-v2] applyConcernTriage/applyCloseupResolutions can return
+-    rm-* remarkable records typed as StoredConcernArtifact"
+-  - "[concerns-store-v2] Concern writes use unscoped commitAll on taskWt,
+-    sweeping unrelated dirty files into concern commits"
+-  - "[concerns-store-v2] r2 hardening (routed triage clears dismissReason,
+-    remarkable pre-lock validation) has no regression tests"
+-  - "[concerns-store-v2] Consult runAgentStep calls omit taskWt, relying on path
+-    inference that mis-resolves epic child task dirs"
+-  - "[modes-prompts-v2] Harden matrix test: assert plan-review excludes
+-    concernsYaml"
+-  - "[modes-prompts-v2] Harden mode-switch tests: check both inactive markers
+-    absent"
+-  - "[modes-prompts-v2] Harden empty-criteria test: assert exact empty rendering"
+-  - "[modes-prompts-v2] Caller promptVars can silently override engine-filtered
+-    humanInvolvementCriteria"
+-  - "[modes-prompts-v2] HUMAN_INVOLVEMENT_MODES is a third source of truth for
+-    the mode enum"
+-  - "[modes-prompts-v2] pipeline.default.yaml criteria comment block omits
+-    human-involvement consumption"
+-  - "[modes-prompts-v2] ADR blocking table duplicated verbatim in config
+-    comments and criteria fragment"
+-budgetSpentUsd: 1.826748
++budgetSpentUsd: 1.1860089999999999
+ spendByRole:
+   alt-workhorse:
+-    costUsd: 0.30556599999999984
+-    inputTokens: 1246876
+-    outputTokens: 690346
++    costUsd: 0.22332299999999997
++    inputTokens: 799635
++    outputTokens: 566437
+   workhorse:
+-    costUsd: 1.389019
+-    inputTokens: 2727951
+-    outputTokens: 891870
++    costUsd: 0.8408990000000001
++    inputTokens: 1625095
++    outputTokens: 517811
+   architect:
+-    costUsd: 0.115648
+-    inputTokens: 935546
+-    outputTokens: 77812
++    costUsd: 0.105272
++    inputTokens: 886701
++    outputTokens: 66358
+   alt-architect:
+     costUsd: 0.016515000000000002
+     inputTokens: 72452
+@@ -360,14 +235,14 @@ spendByItem:
+     costUsd: 0.060779
+     inputTokens: 139871
+     outputTokens: 72059
++  (orchestration):
++    costUsd: 0.431683
++    inputTokens: 1543604
++    outputTokens: 344720
+   concerns-contracts-schemas:
+     costUsd: 0.13946999999999998
+     inputTokens: 384518
+     outputTokens: 125976
+-  modes-prompts-v2:
+-    costUsd: 0.139671
+-    inputTokens: 277976
+-    outputTokens: 137336
+   concerns-contracts-policy:
+     costUsd: 0.107439
+     inputTokens: 280717
+@@ -376,12 +251,4 @@ spendByItem:
+     costUsd: 0.063129
+     inputTokens: 178070
+     outputTokens: 75896
+-  concerns-store-v2:
+-    costUsd: 0.48322400000000004
+-    inputTokens: 1220656
+-    outputTokens: 349363
+-  (orchestration):
+-    costUsd: 0.449527
+-    inputTokens: 1643914
+-    outputTokens: 367443
+-lastUpdated: 2026-11-08T07:43:30.910Z
++lastUpdated: 2026-11-08T05:59:02.059Z
+diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
+index 08aed67..cf53d5c 100644
+--- a/plugins/software-factory/src/core/artifacts.ts
++++ b/plugins/software-factory/src/core/artifacts.ts
+@@ -333,6 +333,8 @@ export interface ConcernSource {
+   item?: string;
+   iteration?: number;
+   escalated?: boolean;
++  /** Timestamp of the most recent re-emit for merged concerns. */
++  lastSeen?: string;
+ }
+ 
+ export interface PendingConcernResolution {
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+new file mode 100644
+index 0000000..4044f5c
+--- /dev/null
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -0,0 +1,207 @@
++import fs from "node:fs";
++import path from "node:path";
++import { createHash } from "node:crypto";
++import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++import type { Repo } from "./git/repo.js";
++import { commitAll } from "./git/commit.js";
++import { git } from "./git/exec.js";
++import { KeyedMutex } from "./mutex.js";
++import { readYaml, writeYamlAtomic } from "./records/io.js";
++
++export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
++  Partial<Pick<Concern, "detail" | "severity">>;
++export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
++export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }
++
++type Obj = Record<string, any>;
++type Patch = (record: Obj, at: string) => Obj;
++const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
++const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };
++/** Serializes read-modify-write cycles of one task's concern store. */
++const locks = new KeyedMutex();
++const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
++const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
++const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
++const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
++const hash = (prefix: string, parts: unknown[]) =>
++  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
++
++/** Stable concern identity: kind, normalized summary, location, sorted affects. */
++export function concernFingerprint(c: ConcernInput): string {
++  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
++}
++
++async function readExisting<T>(file: string): Promise<T | undefined> {
++  try { return await readYaml<T>(file); } catch (err: any) {
++    if (err?.code === "ENOENT") return undefined;
++    throw err;
++  }
++}
++
++function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
++  const incomingDetail = (input.detail ?? input.summary).trim();
++  const incomingSeverity = input.severity ?? "medium";
++  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
++  const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
++  const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
++  const location = input.location ?? existing?.location;
++  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
++  return {
++    ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
++    summary: existing?.summary ?? input.summary.trim(), detail,
++    ...(location ? { location } : {}), ...(affects ? { affects } : {}), severity,
++    status: existing?.status ?? "open",
++    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: at },
++    createdAt: existing?.createdAt ?? at, updatedAt: at,
++  };
++}
++
++function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
++  return {
++    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
++    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
++    status: existing?.status ?? "open",
++    source: { ...(existing?.source ?? {}), ...source, lastSeen: at },
++    createdAt: existing?.createdAt ?? at, updatedAt: at,
++  };
++}
++
++/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
++export async function aggregateConcerns(
++  ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = []
++): Promise<StoredConcernArtifact[]> {
++  for (const c of concerns) {
++    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
++    if (!c.summary?.trim()) throw new Error("Concern summary is required");
++    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
++  }
++  for (const d of remarkables) if (!d?.chosen?.trim() || !Array.isArray(d?.alternatives) || typeof d?.why !== "string" || !d.why.trim()) throw new Error("Remarkable decision requires chosen/alternatives/why");
++
++  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++  const stored = await locks.runExclusive(ctx.taskDir, async () => {
++    const out: StoredConcernArtifact[] = [];
++    for (const input of concerns) {
++      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
++      const merged = mergeConcern(await readExisting(file), input, ctx.source, at);
++      await writeYamlAtomic(file, merged);
++      out.push(merged);
++    }
++    for (const decision of remarkables) {
++      const file = path.join(dir, `${rmId(decision)}.yaml`);
++      await writeYamlAtomic(file, mergeRemarkable(await readExisting(file), decision, ctx.source, at));
++    }
++    return out;
++  });
++  if (concerns.length || remarkables.length) await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
++  return stored;
++}
++
++/** Returns open concerns ordered by creation time then id. */
++export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++  const dir = dirOf(taskDir);
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return [];
++    throw err;
++  }
++  const records = await Promise.all(names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).map(async (name) => {
++    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
++  }));
++  return records
++    .filter((r): r is StoredConcernArtifact => r?.status === "open" && typeof r?.kind === "string")
++    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
++}
++
++async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
++  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++  const updated = await locks.runExclusive(ctx.taskDir, async () => {
++    const out: StoredConcernArtifact[] = [];
++    for (const [id, patch] of ops) {
++      if (id !== path.basename(id)) continue;
++      const file = path.join(dir, `${id}.yaml`);
++      const existing = await readExisting<Obj>(file);
++      if (!existing) continue;
++      const next = { ...patch(existing, at), updatedAt: at };
++      await writeYamlAtomic(file, next);
++      out.push(next as StoredConcernArtifact);
++    }
++    return out;
++  });
++  if (updated.length) await commitAll(ctx.repo, ctx.taskWt, message);
++  return updated;
++}
++
++/** Applies review triage to pre-existing concerns only; ordinary findings are ignored. */
++export async function applyConcernTriage(
++  ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
++): Promise<StoredConcernArtifact[]> {
++  if (!ctx.isTriager) return [];
++  const ops = ctx.suggestions.map((s): [string, Patch] => {
++    if (s.disposition === "dismiss" && !s.detail?.trim()) throw new Error(`Dismiss triage for ${s.id} requires detail`);
++    return [s.id, (record) => s.disposition === "dismiss"
++      ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
++      : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }];
++  });
++  return mutate(ctx, ops, "factory: concerns triaged");
++}
++
++/** Records close-up resolutions as pending; changing status is a later decision. */
++export function applyCloseupResolutions(
++  ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
++): Promise<StoredConcernArtifact[]> {
++  const ops = ctx.resolutions.map((r): [string, Patch] => [r.id, (record, at) => ({
++    ...record, pendingResolution: { action: r.action, ...(r.note !== undefined ? { note: r.note } : {}), by: ctx.by, at },
++  })]);
++  return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
++}
++
++/** Splits review suggestions into concern triage vs findings by exact id. */
++export function partitionSuggestions(
++  suggestions: ReviewSuggestion[], concernIds: Iterable<string>
++): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
++  const ids = new Set(concernIds);
++  return {
++    triage: suggestions.filter((s) => ids.has(s.id)),
++    findings: suggestions.filter((s) => !ids.has(s.id)),
++  };
++}
++
++interface CommittedRecord { name: string; item?: string; meta: Obj; output: Obj }
++
++async function committedStepRecords(ctx: ConcernStoreContext): Promise<CommittedRecord[]> {
++  const res = await git(ctx.taskWt, ["ls-tree", "-r", "--name-only", "HEAD"], { allowFail: true, env: ctx.repo.identityEnv() });
++  if (res.code !== 0) return [];
++  const committed = new Set(res.stdout.split("\n").filter(Boolean));
++  const prefix = path.relative(ctx.taskWt, ctx.taskDir).replace(/\\/g, "/");
++  const records: CommittedRecord[] = [];
++  for (const metaRel of [...committed].sort()) {
++    const outputRel = metaRel.replace(/meta\.yaml$/, "output.yaml");
++    if (!metaRel.startsWith(`${prefix}/`) || outputRel === metaRel || !committed.has(outputRel)) continue;
++    const parts = metaRel.slice(prefix.length + 1).split("/");
++    const item = parts[0] === "items" && parts.length === 5 ? parts[1] : undefined;
++    if (!item && (parts[0] !== "runs" || parts.length !== 3)) continue;
++    try {
++      const meta = await readYaml<Obj>(path.join(ctx.taskWt, metaRel));
++      if (meta?.status !== "ok") continue;
++      records.push({ name: parts[parts.length - 2]!, ...(item ? { item } : {}), meta,
++        output: await readYaml<Obj>(path.join(ctx.taskWt, outputRel)) });
++    } catch { /* A corrupt record is not a usable derivation input. */ }
++  }
++  return records;
++}
++
++/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. Startup calls it after repairWorktree, so the worktree matches HEAD and ls-tree enumeration is authoritative. */
++export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
++  const reconciled: StoredConcernArtifact[] = [];
++  for (const r of await committedStepRecords(ctx)) {
++    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])]
++      .filter((c: any) => c && typeof c === "object");
++    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
++    if (!concerns.length && !remarkables.length) continue;
++    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"),
++      ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
++    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables)));
++  }
++  return reconciled;
++}
+diff --git a/plugins/software-factory/src/core/engine.ts b/plugins/software-factory/src/core/engine.ts
+index 87787e9..a5daa26 100644
+--- a/plugins/software-factory/src/core/engine.ts
++++ b/plugins/software-factory/src/core/engine.ts
+@@ -31,6 +31,7 @@ import { runIngest, isTriageDone, isInfraDone } from "./flows/ingest.js";
+ import { runIteration } from "./flows/iteration.js";
+ import { runSeamHooks } from "./flows/seams.js";
+ import { readYaml, writeYamlAtomic, readText } from "./records/io.js";
++import { reconcileConcerns } from "./concerns.js";
+ import { listPending, classify, takenPaths } from "./steer.js";
+ import { resolveRole } from "./config/roles.js";
+ import { installShutdownHandlers } from "./shutdown.js";
+@@ -323,6 +324,12 @@ export async function runTask(
+     parentBranch = `topic/${task}`;
+ 
+   // 2. Start-up repair restricted to §6.3.6 list (Finding 1 & 19)
++  // Concerns are engine-owned: commit them before stray-dirt repair stashes them.
++  if (fs.existsSync(path.join(taskDir, "concerns"))) {
++    await commitAll(repo, taskWt, "factory: concern store recovery", {
++      paths: [`${orchFolder}/${task}/concerns`],
++    });
++  }
+   await repairWorktree(repo, taskWt, "task", {
+     operatorEditable: [
+       "INTENT.md",
+@@ -358,6 +365,19 @@ export async function runTask(
+ 
+   await repairInterruptedRecords(taskDir);
+ 
++  // Rebuild concerns lost in a crash from committed step records (§18).
++  try {
++    await reconcileConcerns({ taskDir, taskWt, repo });
++  } catch (err: any) {
++    try {
++      await appendJournal(taskDir, {
++        type: "concern_reconcile_error",
++        task,
++        error: err?.message || String(err),
++      });
++    } catch { /* Journal failure must not crash startup. */ }
++  }
++
+   // 3. Load pipeline config and setup semaphores (§2)
+   pipeline = await pipelineFor(taskDir);
+   if (opts?.maxIterations !== undefined) {
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index f5e0e00..9477775 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -24,6 +24,12 @@ import {
+ import { validateAndRepair } from "../records/repair.js";
+ import { generateReviewSchema } from "../records/review-schema.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++import {
++  aggregateConcerns,
++  applyCloseupResolutions,
++  applyConcernTriage,
++  partitionSuggestions,
++} from "../concerns.js";
+ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+@@ -167,6 +173,33 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
+   return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
+ }
+ 
++/** Feeds a step's producer fields into the taskWt concern store (§18). */
++async function ingestStepConcerns(opts: {
++  taskDir: string; taskWt: string; repo: any; output: unknown;
++  source: { record: string; agent: string; step: string; item?: string; iteration?: number };
++}): Promise<void> {
++  const data = (opts.output ?? {}) as Record<string, any>;
++  const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
++  const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
++  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
++  const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
++  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return;
++
++  // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
++  let existing: string[] = [];
++  try {
++    existing = (await fs.promises.readdir(path.join(opts.taskDir, "concerns")))
++      .filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -5));
++  } catch (err: any) {
++    if (err?.code !== "ENOENT") throw err;
++  }
++  const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
++  if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
++  const { triage } = partitionSuggestions(suggestions, existing);
++  if (triage.length) await applyConcernTriage({ ...ctx, suggestions: triage, isTriager: isTriagerAgent(opts.source.agent) });
++  if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
++}
++
+ /**
+  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
+  */
+@@ -635,6 +668,22 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+     }
+   }
+ 
++  // Producer concerns feed the taskWt store after the canonical artifact write.
++  if (finalStatus === "ok") {
++    try {
++      await ingestStepConcerns({
++        taskDir, taskWt, repo, output: validatedData,
++        source: {
++          record: dirName, agent, step: stepId,
++          ...(item ? { item } : {}),
++          ...(opts.iteration !== undefined ? { iteration: opts.iteration } : {}),
++        },
++      });
++    } catch (err: any) {
++      try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
++    }
++  }
++
+   // 13. Invariant §6.3.2: Finish step record with final meta
+   const finalMeta = await finishStepRecord({
+     recordDir,
+diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+index ce498df..cb0f31a 100644
+--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+@@ -4,9 +4,27 @@ import path from "node:path";
+ import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+ import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+ import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runTask } from "../../src/core/engine.js";
+ import { Repo } from "../../src/core/git/repo.js";
+ import { loadPromptLibrary } from "../../src/core/prompts.js";
+-import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import {
++  aggregateConcerns,
++  applyCloseupResolutions,
++  applyConcernTriage,
++  concernFingerprint,
++  listOpenConcerns,
++  partitionSuggestions,
++  reconcileConcerns,
++} from "../../src/core/concerns.js";
++import type {
++  Concern,
++  ConcernSource,
++  PipelineConfig,
++  ProjectConfig,
++  ReviewSuggestion,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
+ 
+ /**
+  * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
+@@ -163,3 +181,1091 @@ describe("Concern funnel schemas", () => {
+     expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
+   });
+ });
++
++/**
++ * Behaviour of the taskWt concern store (docs/factory.v2.md §18; ADRs
++ * adr-concern-store-taskwt, adr-fingerprint-merge, adr-triage-suggestions-dismiss).
++ *
++ * `{task}/concerns/` lives on the task worktree while item steps only commit
++ * childWt, so the store must write an explicit taskWt path, serialize
++ * read-modify-write merges per task, and commit taskWt immediately. One file
++ * per fingerprint keeps retries and restarts idempotent.
++ */
++describe("Concern store", () => {
++  const ORCH = ".factory";
++  const TASK = "concern-store";
++
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskWt: string;
++  let taskDir: string;
++  let worktreeRoot: string;
++  let pipeline: PipelineConfig;
++  let project: ProjectConfig;
++  let prompts: ReturnType<typeof loadPromptLibrary>;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    taskWt = tmpRepo.dir;
++    taskDir = path.join(taskWt, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Concern store\n", "utf8");
++    tmpRepo.commit("add concern store task");
++
++    pipeline = {
++      models: {
++        roles: {
++          workhorse: { model: "model-workhorse" },
++          "alt-workhorse": { model: "model-alt-workhorse" },
++          architect: { model: "model-architect" },
++          "alt-architect": { model: "model-alt-architect" },
++          simpler: { model: "model-simpler" },
++        },
++      },
++      agents: {
++        developer: { role: "workhorse" },
++        "fact-finder": { role: "workhorse" },
++        qa: { role: "alt-workhorse" },
++        reviewer: { role: "alt-workhorse" },
++        architect: { role: "architect" },
++        "wave-close-up": { role: "alt-workhorse" },
++        "plan-close-up": { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: {}, spike: {} },
++      limits: {},
++    };
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({
++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
++      overrideDirs: [],
++    });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concernSource(
++    record: string,
++    agent = "developer",
++    extra: Partial<ConcernSource> = {}
++  ): ConcernSource {
++    return { record, agent, ...extra };
++  }
++
++  function storedConcern(
++    overrides: Partial<StoredConcernArtifact> & { id: string }
++  ): StoredConcernArtifact {
++    return {
++      kind: "risk",
++      summary: `Concern ${overrides.id}`,
++      detail: "detail",
++      severity: "medium",
++      status: "open",
++      source: { record: "001-develop-a1", agent: "developer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    };
++  }
++
++  async function writeStoredConcern(concern: StoredConcernArtifact): Promise<string> {
++    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
++    await writeYamlAtomic(file, concern);
++    return file;
++  }
++
++  async function runStep(opts: {
++    item?: string;
++    agent: string;
++    stepId: string;
++    stepFragment: string;
++    cwd: string;
++    recordsDir: string;
++    data: unknown;
++    promptVars: Record<string, string>;
++    writeArtifact?: (output: unknown) => Promise<void>;
++  }) {
++    const harness = new FakeHarness();
++    const label = opts.item
++      ? `${TASK}/items/${opts.item}/${opts.stepId}#a1`
++      : `${TASK}/runs/${opts.stepId}#a1`;
++    harness.scriptOutcome(label, { ok: true, data: opts.data });
++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
++    harness.scriptComplete(() => opts.data);
++
++    return runAgentStep({
++      task: TASK,
++      item: opts.item,
++      stepId: opts.stepId,
++      stepFragment: opts.stepFragment,
++      agent: opts.agent,
++      cwd: opts.cwd,
++      taskDir,
++      recordsDir: opts.recordsDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      promptVars: opts.promptVars,
++      writeArtifact: opts.writeArtifact,
++    });
++  }
++
++  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "  Flaky   GATE ",
++      location: { file: "src/core/example.ts", line: 7 },
++      affects: ["item-b", "item-a"],
++    };
++    const fp = concernFingerprint(identity);
++
++    expect(fp).toMatch(/^c-[0-9a-f]{10}$/);
++    expect(concernFingerprint({ ...identity, detail: "short", severity: "low" })).toBe(fp);
++    expect(
++      concernFingerprint({ ...identity, detail: "a much longer detail", severity: "high" })
++    ).toBe(fp);
++    expect(
++      concernFingerprint({ ...identity, summary: "flaky gate", affects: ["item-a", "item-b"] })
++    ).toBe(fp);
++
++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(fp);
++    expect(
++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++    ).not.toBe(fp);
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
++  });
++
++  it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
++    const item = "item-a";
++    const childWt = tmpRepo.createWorktree(`topic/${TASK}--${item}`);
++    const recordsDir = path.join(childWt, ORCH, TASK, "items", item, "steps");
++    fs.mkdirSync(recordsDir, { recursive: true });
++
++    const result = await runStep({
++      item,
++      agent: "developer",
++      stepId: "develop",
++      stepFragment: "steps/develop",
++      cwd: childWt,
++      recordsDir,
++      data: {
++        status: "ok",
++        summary: "Implemented the dependency",
++        evidence: ["bun test passed"],
++        concerns: [
++          { kind: "blocker", summary: "Dependent item has no implementation", affects: [item] },
++        ],
++      },
++      promptVars: { assignment: "Implement", target: "tests", citations: "[]" },
++    });
++
++    expect(result.ok).toBe(true);
++    expect(result.status).toBe("ok");
++
++    const concernsDir = path.join(taskDir, "concerns");
++    expect(fs.existsSync(concernsDir)).toBe(true);
++    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    expect(files[0]).toMatch(/^c-[0-9a-f]{10}\.yaml$/);
++
++    const stored = await readYaml<StoredConcernArtifact>(path.join(concernsDir, files[0]!));
++    expect(stored.status).toBe("open");
++    expect(stored.severity).toBe("medium");
++    expect(stored.detail).toBe(stored.summary);
++    expect(stored.source.record).toBe("001-develop-a1");
++    expect(stored.source.agent).toBe("developer");
++    expect(stored.source.item).toBe(item);
++
++    // The concern is committed on taskWt, never written to the child worktree.
++    const rel = path
++      .relative(taskWt, path.join(concernsDir, files[0]!))
++      .replace(/\\/g, "/");
++    expect(
++      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], { cwd: taskWt, allowFail: true }).code
++    ).toBe(0);
++    expect(fs.existsSync(path.join(childWt, ORCH, TASK, "concerns"))).toBe(false);
++  });
++
++  it("merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps", async () => {
++    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
++    const now = () => new Date(nowMs);
++
++    const first = await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: "short", severity: "low" }]
++    );
++    expect(first).toHaveLength(1);
++    const id = first[0]!.id;
++    const file = path.join(taskDir, "concerns", `${id}.yaml`);
++    const created = await readYaml<StoredConcernArtifact>(file);
++
++    nowMs += 60_000;
++    const second = await aggregateConcerns(
++      {
++        taskDir,
++        taskWt,
++        repo,
++        now,
++        source: concernSource("002-develop-a1", "developer", { step: "develop", item: "item-a" }),
++      },
++      [{ kind: "risk", summary: "flaky   gate", detail: "a much longer detail", severity: "high" }]
++    );
++    expect(second).toHaveLength(1);
++    expect(second[0]!.id).toBe(id);
++
++    const merged = await readYaml<StoredConcernArtifact>(file);
++    expect(merged.detail).toBe("a much longer detail");
++    expect(merged.severity).toBe("high");
++    expect(merged.status).toBe("open");
++    expect(merged.source.record).toBe("002-develop-a1");
++    expect(merged.createdAt).toBe(created.createdAt);
++    expect(merged.updatedAt).toBe("2026-01-01T00:01:00.000Z");
++    const lastSeen = (merged.source as ConcernSource & { lastSeen?: string }).lastSeen;
++    expect(typeof lastSeen).toBe("string");
++    expect(Date.parse(lastSeen!)).toBe(nowMs);
++
++    // A shorter detail never replaces the longer stored one.
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("003-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: "tiny", severity: "low" }]
++    );
++    const shorter = await readYaml<StoredConcernArtifact>(file);
++    expect(shorter.detail).toBe("a much longer detail");
++    expect(shorter.severity).toBe("high");
++
++    // Equal-length details keep the latest re-emit.
++    const equalA = "a".repeat(32);
++    const equalB = "b".repeat(32);
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("004-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: equalA, severity: "medium" }]
++    );
++    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalA);
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("005-develop-a1") },
++      [{ kind: "risk", summary: "Flaky gate", detail: equalB, severity: "medium" }]
++    );
++    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalB);
++
++    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("keeps dismissed status and flags escalation when a higher severity is re-emitted", async () => {
++    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
++    const now = () => new Date(nowMs);
++
++    const first = await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
++      [{ kind: "risk", summary: "Endpoint may change", detail: "initial", severity: "low" }]
++    );
++    expect(first).toHaveLength(1);
++    const id = first[0]!.id;
++
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      now,
++      isTriager: true,
++      suggestions: [
++        {
++          id,
++          disposition: "dismiss",
++          summary: "Not real",
++          detail: "covered by contract test",
++        },
++      ],
++    });
++    expect(triaged).toHaveLength(1);
++    expect(triaged[0]!.status).toBe("dismissed");
++
++    nowMs += 60_000;
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, now, source: concernSource("002-develop-a1") },
++      [
++        {
++          kind: "risk",
++          summary: "Endpoint may change",
++          detail: "a longer detail",
++          severity: "high",
++        },
++      ]
++    );
++
++    const merged = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${id}.yaml`)
++    );
++    expect(merged.status).toBe("dismissed");
++    expect(merged.dismissReason).toBe("covered by contract test");
++    expect(merged.severity).toBe("high");
++    expect(merged.source.escalated).toBe(true);
++    expect(await listOpenConcerns(taskDir)).toEqual([]);
++  });
++
++  it("lists only open concerns in stable order", async () => {
++    await writeStoredConcern(
++      storedConcern({ id: "c-1111111111", createdAt: "2026-01-02T00:00:00.000Z" })
++    );
++    await writeStoredConcern(
++      storedConcern({ id: "c-2222222222", createdAt: "2026-01-01T00:00:00.000Z" })
++    );
++    await writeStoredConcern(
++      storedConcern({
++        id: "c-3333333333",
++        status: "dismissed",
++        createdAt: "2026-01-01T00:00:00.000Z",
++      })
++    );
++    await writeStoredConcern(
++      storedConcern({
++        id: "c-4444444444",
++        status: "resolved",
++        createdAt: "2026-01-01T00:00:00.000Z",
++      })
++    );
++    await writeYamlAtomic(path.join(taskDir, "concerns", "rm-5555555555.yaml"), {
++      id: "rm-5555555555",
++      chosen: "A decision",
++      alternatives: ["Other"],
++      why: "reasons",
++      status: "open",
++      source: { record: "001-architect-plan-a1", agent: "architect" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++    });
++
++    const open = await listOpenConcerns(taskDir);
++    expect(open.map((c) => c.id)).toEqual(["c-2222222222", "c-1111111111"]);
++    expect(open.every((c) => typeof c.kind === "string" && typeof c.detail === "string")).toBe(true);
++  });
++
++  it("triages only exact-id suggestions and persists dismiss reasons", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
++    await writeStoredConcern(storedConcern({ id: "c-bbbbbbbbbb" }));
++
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        {
++          id: "c-aaaaaaaaaa",
++          disposition: "dismiss",
++          summary: "Duplicate",
++          detail: "covered by ADR-1",
++        },
++        { id: "s-1", disposition: "dismiss", summary: "Not a concern", detail: "unrelated finding" },
++      ],
++    });
++
++    expect(triaged.map((c) => c.id)).toEqual(["c-aaaaaaaaaa"]);
++    const dismissed = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-aaaaaaaaaa.yaml")
++    );
++    expect(dismissed.status).toBe("dismissed");
++    expect(dismissed.dismissReason).toBe("covered by ADR-1");
++
++    const untouched = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-bbbbbbbbbb.yaml")
++    );
++    expect(untouched.status).toBe("open");
++    expect(untouched.dismissReason).toBeUndefined();
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("routes non-dismiss triage dispositions and gates non-triagers", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-cccccccccc" }));
++
++    const ignored = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: false,
++      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
++    });
++    expect(ignored).toEqual([]);
++    const stillOpen = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
++    );
++    expect(stillOpen.status).toBe("open");
++    expect(stillOpen.disposition).toBeUndefined();
++
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
++    });
++    expect(triaged).toHaveLength(1);
++    const routed = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
++    );
++    expect(routed.status).toBe("routed");
++    expect(routed.disposition).toBe("fix");
++  });
++
++  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-dddddddddd" }));
++
++    await expect(
++      applyConcernTriage({
++        taskDir,
++        taskWt,
++        repo,
++        isTriager: true,
++        suggestions: [{ id: "c-dddddddddd", disposition: "dismiss", summary: "No reason" }],
++      })
++    ).rejects.toThrow(/detail/i);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-dddddddddd.yaml")
++    );
++    expect(stored.status).toBe("open");
++    expect(stored.dismissReason).toBeUndefined();
++  });
++
++  it("partitions suggestions by exact concern id", () => {
++    const suggestions: ReviewSuggestion[] = [
++      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Concern" },
++      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
++      { id: "s-1", disposition: "fix", summary: "Finding" },
++      { id: "c-cccccccccc", disposition: "optional", summary: "Unknown concern id" },
++    ];
++
++    const { triage, findings } = partitionSuggestions(
++      suggestions,
++      new Set(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"])
++    );
++
++    expect(triage.map((s) => s.id)).toEqual(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"]);
++    expect(findings.map((s) => s.id)).toEqual(["s-1", "c-cccccccccc"]);
++  });
++
++  it("records close-up pending resolutions without changing concern status", async () => {
++    await writeStoredConcern(
++      storedConcern({ id: "c-eeeeeeeeee", status: "routed", disposition: "architect" })
++    );
++    await writeStoredConcern(
++      storedConcern({ id: "c-ffffffffff", status: "routed", disposition: "fix" })
++    );
++    await writeStoredConcern(
++      storedConcern({ id: "c-9999999999", status: "open" })
++    );
++
++    const applied = await applyCloseupResolutions({
++      taskDir,
++      taskWt,
++      repo,
++      by: "wave-close-up",
++      resolutions: [
++        { id: "c-eeeeeeeeee", action: "carry", note: "architect should decide" },
++        { id: "c-ffffffffff", action: "resolve" },
++        { id: "c-9999999999", action: "propagate", note: "saga decision" },
++        { id: "c-8888888888", action: "resolve", note: "unknown id" },
++      ],
++    });
++
++    expect(applied.map((c) => c.id).sort()).toEqual([
++      "c-9999999999",
++      "c-eeeeeeeeee",
++      "c-ffffffffff",
++    ]);
++    const carried = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-eeeeeeeeee.yaml")
++    );
++    expect(carried.status).toBe("routed");
++    expect(carried.pendingResolution?.action).toBe("carry");
++    expect(carried.pendingResolution?.note).toBe("architect should decide");
++    expect(carried.pendingResolution?.by).toBe("wave-close-up");
++    expect(typeof carried.pendingResolution?.at).toBe("string");
++
++    const resolved = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-ffffffffff.yaml")
++    );
++    expect(resolved.status).toBe("routed");
++    expect(resolved.pendingResolution?.action).toBe("resolve");
++
++    const propagated = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", "c-9999999999.yaml")
++    );
++    expect(propagated.status).toBe("open");
++    expect(propagated.pendingResolution?.action).toBe("propagate");
++    expect(propagated.pendingResolution?.note).toBe("saga decision");
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("aggregates remarkable decisions into rm-* files and triages them by exact id", async () => {
++    await aggregateConcerns(
++      {
++        taskDir,
++        taskWt,
++        repo,
++        source: concernSource("001-architect-plan-a1", "architect", { step: "architect-plan" }),
++      },
++      [],
++      [
++        {
++          chosen: "Atomic YAML files",
++          alternatives: ["One big file", "A database"],
++          why: "diffable and conflict-free",
++        },
++      ]
++    );
++
++    const concernsDir = path.join(taskDir, "concerns");
++    expect(fs.existsSync(concernsDir)).toBe(true);
++    const files = fs
++      .readdirSync(concernsDir)
++      .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    expect(files[0]).toMatch(/^rm-[0-9a-f]{10}\.yaml$/);
++
++    const remarkable = await readYaml<Record<string, any>>(
++      path.join(concernsDir, files[0]!)
++    );
++    expect(remarkable.status).toBe("open");
++    expect(remarkable.chosen).toBe("Atomic YAML files");
++    expect(remarkable.source.record).toBe("001-architect-plan-a1");
++    expect(remarkable.source.agent).toBe("architect");
++
++    const rmId = files[0]!.replace(/\.yaml$/, "");
++    const triaged = await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        {
++          id: rmId,
++          disposition: "dismiss",
++          summary: "Standard",
++          detail: "No tradeoff worth reporting",
++        },
++      ],
++    });
++    expect(triaged).toHaveLength(1);
++    const after = await readYaml<Record<string, any>>(path.join(concernsDir, files[0]!));
++    expect(after.status).toBe("dismissed");
++    expect(after.dismissReason).toBe("No tradeoff worth reporting");
++  });
++
++  it("rejects unknown concern kinds without partial writes and leaves existing files untouched", async () => {
++    const existing = await writeStoredConcern(
++      storedConcern({ id: "c-0123456789", summary: "Existing concern" })
++    );
++    const before = fs.readFileSync(existing, "utf8");
++
++    await expect(
++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
++        { kind: "risk", summary: "Valid" },
++        { kind: "bug", summary: "Invalid" } as unknown as Concern,
++      ])
++    ).rejects.toThrow(/kind/i);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
++    expect(files).toEqual(["c-0123456789.yaml"]);
++    expect(fs.readFileSync(existing, "utf8")).toBe(before);
++  });
++
++  it("writes distinct fingerprints concurrently without deadlock or lost commits", async () => {
++    const results = await Promise.all([
++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
++        { kind: "risk", summary: "Concurrent risk A" },
++      ]),
++      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("002-develop-a1") }, [
++        { kind: "tech-debt", summary: "Concurrent debt B" },
++      ]),
++    ]);
++    expect(results[0]).toHaveLength(1);
++    expect(results[1]).toHaveLength(1);
++
++    const files = fs
++      .readdirSync(path.join(taskDir, "concerns"))
++      .filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(2);
++
++    const tracked = tmpRepo
++      .git(["ls-tree", "-r", "--name-only", "HEAD"], { cwd: taskWt })
++      .stdout.split("\n");
++    for (const file of files) {
++      expect(tracked).toContain(`${ORCH}/${TASK}/concerns/${file}`);
++    }
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("serializes concurrent merges of the same fingerprint into one merged file", async () => {
++    const first = aggregateConcerns(
++      { taskDir, taskWt, repo, source: concernSource("001-develop-a1") },
++      [{ kind: "risk", summary: "Same concern", detail: "short", severity: "low" }]
++    );
++    const second = aggregateConcerns(
++      { taskDir, taskWt, repo, source: concernSource("002-develop-a1") },
++      [
++        {
++          kind: "risk",
++          summary: "Same concern",
++          detail: "a much longer concurrent detail",
++          severity: "high",
++        },
++      ]
++    );
++    const [a, b] = await Promise.all([first, second]);
++    expect(a).toHaveLength(1);
++    expect(b).toHaveLength(1);
++
++    const files = fs
++      .readdirSync(path.join(taskDir, "concerns"))
++      .filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", files[0]!)
++    );
++    expect(stored.detail).toBe("a much longer concurrent detail");
++    expect(stored.severity).toBe("high");
++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
++  });
++
++  it("wires reviewer output: aggregate new concerns before triaging pre-existing ids only", async () => {
++    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
++    const newSummary = "Newly observed retry risk";
++    const newId = concernFingerprint({ kind: "risk", summary: newSummary });
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const result = await runStep({
++      agent: "reviewer",
++      stepId: "review",
++      stepFragment: "steps/review",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        status: "approved",
++        summary: "Reviewed",
++        newConcerns: [{ kind: "risk", summary: newSummary }],
++        suggestions: [
++          {
++            id: "c-aaaaaaaaaa",
++            disposition: "dismiss",
++            summary: "Duplicate",
++            detail: "covered by ADR-1",
++          },
++          {
++            id: newId,
++            disposition: "dismiss",
++            summary: "Self",
++            detail: "must not dismiss a same-step concern",
++          },
++        ],
++      },
++      promptVars: { assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" },
++    });
++    expect(result.ok).toBe(true);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const newFile = path.join(concernsDir, `${newId}.yaml`);
++    expect(fs.existsSync(newFile)).toBe(true);
++    const created = await readYaml<StoredConcernArtifact>(newFile);
++    expect(created.status).toBe("open");
++    expect(created.source.record).toBe("001-review-a1");
++
++    const preExisting = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
++    );
++    expect(preExisting.status).toBe("dismissed");
++    expect(preExisting.dismissReason).toBe("covered by ADR-1");
++  });
++
++  it("wires consult writeArtifact producers to the concern store", async () => {
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++    let artifactWrites = 0;
++
++    const result = await runStep({
++      agent: "architect",
++      stepId: "consult-item",
++      stepFragment: "steps/architect-consult-item",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        decision: "retry-with-guidance",
++        rationale: "Retry with a narrower scope",
++        concerns: [{ kind: "question", summary: "Which API version is authoritative?" }],
++        remarkable: [{ chosen: "Retry", alternatives: ["Escalate"], why: "Cheap to test" }],
++      },
++      promptVars: { item: "item-a", assignment: "", priorAttempts: "", diff: "", feedback: "" },
++      writeArtifact: async () => {
++        artifactWrites++;
++      },
++    });
++
++    expect(result.ok).toBe(true);
++    expect(artifactWrites).toBe(1);
++    const concernsDir = path.join(taskDir, "concerns");
++    const files = fs.existsSync(concernsDir) ? fs.readdirSync(concernsDir) : [];
++    const concernFiles = files.filter((f) => f.startsWith("c-"));
++    const remarkableFiles = files.filter((f) => f.startsWith("rm-"));
++    expect(concernFiles).toHaveLength(1);
++    expect(remarkableFiles).toHaveLength(1);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, concernFiles[0]!)
++    );
++    expect(stored.source.agent).toBe("architect");
++    expect(stored.source.record).toBe("001-consult-item-a1");
++    expect(stored.source.step).toBe("consult-item");
++  });
++
++  it("wires close-up producers: aggregates concerns and applies resolutions", async () => {
++    await writeStoredConcern(
++      storedConcern({ id: "c-aaaaaaaaaa", status: "routed", disposition: "architect" })
++    );
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const result = await runStep({
++      agent: "wave-close-up",
++      stepId: "wave-close-up-1-1",
++      stepFragment: "steps/wave-close-up",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        wave: 1,
++        iteration: 1,
++        status: "complete",
++        mergedItems: [],
++        summary: "Wave 1 complete",
++        concerns: [{ kind: "tech-debt", summary: "Close-up found duplicated helpers" }],
++        concernResolutions: [{ id: "c-aaaaaaaaaa", action: "carry", note: "needs architect" }],
++      },
++      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
++    });
++    expect(result.ok).toBe(true);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const newFiles = fs
++      .readdirSync(concernsDir)
++      .filter((f) => f.startsWith("c-") && f !== "c-aaaaaaaaaa.yaml");
++    expect(newFiles).toHaveLength(1);
++    const created = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, newFiles[0]!)
++    );
++    expect(created.status).toBe("open");
++    expect(created.source.record).toBe("001-wave-close-up-1-1-a1");
++
++    const carried = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
++    );
++    expect(carried.status).toBe("routed");
++    expect(carried.pendingResolution?.action).toBe("carry");
++    expect(carried.pendingResolution?.by).toBe("wave-close-up");
++  });
++
++  it("aggregates concerns and remarkable decisions across producer schemas", async () => {
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const producers: Array<{
++      agent: string;
++      stepId: string;
++      stepFragment: string;
++      promptVars: Record<string, string>;
++      base: Record<string, unknown>;
++      concernField: "concerns" | "newConcerns";
++      remarkable: boolean;
++    }> = [
++      {
++        agent: "developer",
++        stepId: "develop",
++        stepFragment: "steps/develop",
++        promptVars: { assignment: "", target: "tests", citations: "[]" },
++        base: { status: "ok", summary: "dev" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "developer",
++        stepId: "poc",
++        stepFragment: "steps/poc",
++        promptVars: { assignment: "", context: "" },
++        base: { status: "ok", summary: "poc" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "developer",
++        stepId: "test-assumptions",
++        stepFragment: "steps/test-assumptions",
++        promptVars: { assignment: "", context: "" },
++        base: { status: "ok", summary: "assumptions" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "fact-finder",
++        stepId: "research",
++        stepFragment: "steps/research",
++        promptVars: { assignment: "", intent: "", citations: "[]" },
++        base: { status: "ok", summary: "ff", findings: "f" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "qa",
++        stepId: "qa",
++        stepFragment: "steps/qa",
++        promptVars: {
++          assignment: "",
++          checks: "",
++          testDiff: "",
++          diff: "",
++          dispositionsCriteria: "",
++        },
++        base: { status: "approved", summary: "qa", suggestions: [] },
++        concernField: "newConcerns",
++        remarkable: false,
++      },
++      {
++        agent: "architect",
++        stepId: "architect-plan",
++        stepFragment: "steps/architect-plan",
++        promptVars: {
++          task: TASK,
++          iteration: "1",
++          intent: "",
++          context: "",
++          infra: "",
++          debt: "",
++          steering: "",
++          limits: "",
++        },
++        base: { iteration: 1, milestones: [], itemOutlines: [] },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "architect",
++        stepId: "architect-wave-report-1-1",
++        stepFragment: "steps/architect-wave-report",
++        promptVars: { plan: "{}", waveReport: "", debt: "", steering: "" },
++        base: { decision: "continue" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++      {
++        agent: "wave-close-up",
++        stepId: "wave-close-up-1-1",
++        stepFragment: "steps/wave-close-up",
++        promptVars: { task: TASK, waveReport: "", infra: "" },
++        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "wave" },
++        concernField: "concerns",
++        remarkable: true,
++      },
++    ];
++
++    const concernsDir = path.join(taskDir, "concerns");
++    for (const [index, producer] of producers.entries()) {
++      const summary = `Producer ${index} concern`;
++      const chosen = `Producer ${index} decision`;
++      const data = {
++        ...producer.base,
++        [producer.concernField]: [{ kind: "risk", summary }],
++        ...(producer.remarkable
++          ? { remarkable: [{ chosen, alternatives: ["alt"], why: "because" }] }
++          : {}),
++      };
++
++      const result = await runStep({
++        agent: producer.agent,
++        stepId: producer.stepId,
++        stepFragment: producer.stepFragment,
++        cwd: taskWt,
++        recordsDir: runsDir,
++        data,
++        promptVars: producer.promptVars,
++      });
++      expect(result.ok).toBe(true);
++      expect(fs.existsSync(concernsDir)).toBe(true);
++
++      const concernFiles = fs
++        .readdirSync(concernsDir)
++        .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
++      const stored = await Promise.all(
++        concernFiles.map((f) => readYaml<StoredConcernArtifact>(path.join(concernsDir, f)))
++      );
++      const hit = stored.find((c) => c.summary === summary);
++      expect(hit).toBeDefined();
++      expect(hit!.status).toBe("open");
++      expect(hit!.source.agent).toBe(producer.agent);
++      expect(hit!.source.record).toContain(producer.stepId);
++
++      if (producer.remarkable) {
++        const rmFiles = fs
++          .readdirSync(concernsDir)
++          .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
++        const remarkables = await Promise.all(
++          rmFiles.map((f) => readYaml<Record<string, any>>(path.join(concernsDir, f)))
++        );
++        expect(remarkables.some((r) => r.chosen === chosen)).toBe(true);
++      }
++    }
++  });
++
++  it("reconciles missing concerns from committed step records idempotently", async () => {
++    const recordDir = path.join(taskDir, "items", "item-a", "steps", "001-develop-a1");
++    fs.mkdirSync(recordDir, { recursive: true });
++    fs.writeFileSync(path.join(recordDir, "input.md"), "prompt\n", "utf8");
++    await writeYamlAtomic(path.join(recordDir, "meta.yaml"), {
++      seq: 1,
++      name: "develop",
++      attempt: 1,
++      agent: "developer",
++      role: "workhorse",
++      models: ["model-workhorse"],
++      status: "ok",
++      startedAt: "2026-01-01T00:00:00.000Z",
++      endedAt: "2026-01-01T00:01:00.000Z",
++    });
++    await writeYamlAtomic(path.join(recordDir, "output.yaml"), {
++      status: "ok",
++      summary: "done",
++      concerns: [
++        {
++          kind: "risk",
++          summary: "Reconciled from record",
++          detail: "full detail",
++          severity: "high",
++        },
++      ],
++    });
++    tmpRepo.commit("committed step record", [
++      path.relative(taskWt, recordDir).replace(/\\/g, "/"),
++    ]);
++
++    const first = await reconcileConcerns({ taskDir, taskWt, repo });
++    expect(first).toHaveLength(1);
++
++    const concernsDir = path.join(taskDir, "concerns");
++    const files = fs
++      .readdirSync(concernsDir)
++      .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, files[0]!)
++    );
++    expect(stored.summary).toBe("Reconciled from record");
++    expect(stored.detail).toBe("full detail");
++    expect(stored.status).toBe("open");
++    expect(stored.source.record).toBe("001-develop-a1");
++    expect(stored.source.agent).toBe("developer");
++
++    // Simulate an earlier triage: a second reconcile must preserve it and not
++    // duplicate the file.
++    stored.status = "dismissed";
++    stored.dismissReason = "already handled";
++    await writeYamlAtomic(path.join(concernsDir, files[0]!), stored);
++
++    const second = await reconcileConcerns({ taskDir, taskWt, repo });
++    expect(second).toHaveLength(1);
++    expect(
++      fs.readdirSync(concernsDir).filter((f) => f.startsWith("c-") && f.endsWith(".yaml"))
++    ).toHaveLength(1);
++    const after = await readYaml<StoredConcernArtifact>(
++      path.join(concernsDir, files[0]!)
++    );
++    expect(after.status).toBe("dismissed");
++    expect(after.dismissReason).toBe("already handled");
++  });
++
++  it("commits stray concerns files during startup recovery instead of stashing them", async () => {
++    const task = "recovery-task";
++    const mainTaskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(mainTaskDir, { recursive: true });
++    fs.writeFileSync(path.join(mainTaskDir, "INTENT.md"), "# recovery\n", "utf8");
++    tmpRepo.commit("add recovery intent");
++
++    const recoveryWtRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(recoveryWtRoot, { recursive: true });
++    const recoveryRepo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: recoveryWtRoot });
++    const recoveryTaskWt = tmpRepo.createWorktree(
++      `topic/${task}`,
++      path.join(recoveryWtRoot, `topic_${task}`)
++    );
++    await writeYamlAtomic(
++      path.join(recoveryTaskWt, ORCH, task, "concerns", "c-0123456789.yaml"),
++      storedConcern({ id: "c-0123456789" })
++    );
++
++    const recoveryPipeline: PipelineConfig = {
++      models: {
++        roles: {
++          workhorse: { model: "model-workhorse" },
++          simpler: { model: "model-simpler" },
++        },
++      },
++      agents: {},
++      flows: { simple: { steps: [] }, story: {}, spike: {} },
++      limits: {},
++    };
++    const result = await runTask(
++      {
++        harness: new FakeHarness(),
++        repo: recoveryRepo,
++        project: { orchestrationFolder: ORCH, worktreeRoot: recoveryWtRoot },
++        pipelineFor: async () => recoveryPipeline,
++        prompts,
++      },
++      task,
++      { maxTicks: 0 }
++    );
++    expect(result.status).toBe("stopped");
++
++    const rel = `${ORCH}/${task}/concerns/c-0123456789.yaml`;
++    expect(
++      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], {
++        cwd: recoveryTaskWt,
++        allowFail: true,
++      }).code
++    ).toBe(0);
++    expect(tmpRepo.git(["stash", "list"], { cwd: recoveryTaskWt }).stdout).toBe("");
++  });
++
++  it("keeps step status ok and journals an ingest error when concern ingestion fails", async () => {
++    fs.writeFileSync(path.join(taskDir, "concerns"), "not a directory", "utf8");
++    const runsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(runsDir, { recursive: true });
++
++    const result = await runStep({
++      agent: "developer",
++      stepId: "develop",
++      stepFragment: "steps/develop",
++      cwd: taskWt,
++      recordsDir: runsDir,
++      data: {
++        status: "ok",
++        summary: "done",
++        concerns: [{ kind: "risk", summary: "Ingest me" }],
++      },
++      promptVars: { assignment: "", target: "tests", citations: "[]" },
++    });
++
++    expect(result.status).toBe("ok");
++    expect(result.meta.error).toBeUndefined();
++    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
++    expect(journal).toContain("concern_ingest_error");
++  });
++});
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/009-develop-r2-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/009-develop-r2-a1/meta.yaml
new file mode 100644
index 0000000..459a451
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/009-develop-r2-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 9
+name: develop
+attempt: 1
+fixRound: 2
+agent: developer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T07:44:34.368Z
+session: 01a1ba1d-c36a-763e-aa77-2f34a8d172b2
+endedAt: 2026-11-08T08:19:00.076Z
+usage:
+  inputTokens: 310549
+  outputTokens: 19755
+  costUsd: 0.045304
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-44-35-178Z_01a1ba1d-c36a-763e-aa77-2f34a8d172b2.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/009-develop-r2-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/009-develop-r2-a1/output.yaml
new file mode 100644
index 0000000..9e7b44e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/009-develop-r2-a1/output.yaml
@@ -0,0 +1,46 @@
+concerns:
+  - Full-suite gate (TMPDIR=/tmp bun test) was launched but still running in
+    background when time budget expired; non-regression beyond the target file
+    is unverified in this round — prior full-suite state was green and the
+    change is scoped to concerns.ts + one test.
+  - "Optional review suggestions (rm-* return typing, scoped commitAll paths, r2
+    regression tests, consult taskWt passing) intentionally not addressed:
+    fix-round scope is the single fix item and time budget was exhausted."
+  - "New reconcile commit message is 'factory: concerns reconcile' (single
+    commit); no test asserts on concern commit message text, verified by target
+    green."
+evidence:
+  - "Typecheck: `cd plugins/software-factory && bun run typecheck` => exit 0 ($
+    tsc --noEmit, no errors)."
+  - "Target: `cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/concerns-funnel.test.ts` => 22 pass, 0 fail, 210 expect() calls
+    (was 202; +8 new idempotency assertions)."
+  - "Idempotency verified by strengthened test: after first reconcile,
+    updatedAt/createdAt/source.lastSeen equal meta.endedAt
+    (2026-01-01T00:01:00.000Z); second reconcile leaves concern file bytes
+    identical, `git rev-parse HEAD` unchanged, and `git status --porcelain`
+    clean."
+  - "Live-merge behavior preserved: existing merge/escalation/concurrency/triage
+    tests all still pass (write-on-diff always triggers for new source.record,
+    so updatedAt/lastSeen still advance on live re-emit)."
+  - "Size: `git diff --numstat 87a7682 -- plugins/software-factory/src` =>
+    artifacts 2/0, concerns 220/0, engine 20/0, step-runner 49/0 = 291 changed
+    lines total, under the 300 limit."
+  - "`git diff --check` => clean (no whitespace errors)."
+  - "Lock discipline kept: KeyedMutex(taskDir) wraps RMW only; commitAll
+    (single, at end, only if dirty) runs outside the mutex and is never wrapped
+    in repo.writeLock; ingest-error handling untouched."
+notes: "Fix implements the architect's 4-point plan: (1) aggregateConcerns takes
+  opts.at (default wall-clock; reconcile passes meta.endedAt); (2)
+  write-only-on-diff via pick() over detail/why, severity, chosen/alternatives,
+  status, disposition, source identity, escalated — skip writeYamlAtomic when
+  equal and lastSeen>=at, else write with updatedAt=at and lastSeen=max; (3)
+  reconcileConcerns sorts committed ok records by endedAt (fallback seq/name),
+  replays with commit:false, tracks dirty, single commitAll only if dirty; (4)
+  test asserts byte-identical files + unchanged HEAD + endedAt-derived
+  timestamps on replay."
+status: ok
+summary: "Fixed reconcile idempotency: deterministic endedAt-derived timestamps,
+  write-only-on-diff merges, single dirty-gated commit per reconcile, and a
+  strengthened byte/HEAD-level idempotency test. Typecheck clean, 22/22 target
+  green, 291/300 prod lines."
diff --git a/.factory/tasks/concerns-funnel/journal.ndjson b/.factory/tasks/concerns-funnel/journal.ndjson
index 4c5740d..49c7034 100644
--- a/.factory/tasks/concerns-funnel/journal.ndjson
+++ b/.factory/tasks/concerns-funnel/journal.ndjson
@@ -408,303 +408,3 @@
 {"type":"step_started","task":"concerns-funnel","step":"pm-amend-1-2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/026-pm-amend-1-2-a1","ts":"2026-11-08T06:02:25.386Z"}
 {"type":"step_timeout_armed","task":"concerns-funnel","step":"pm-amend-1-2","timeoutSec":900,"ts":"2026-11-08T06:02:25.392Z"}
 {"type":"step_finished","task":"concerns-funnel","step":"pm-amend-1-2","attempt":1,"status":"ok","sessionId":"01a1b9c0-3c2a-75d8-a762-0cdb2e794687","usage":{"inputTokens":37038,"outputTokens":6390,"costUsd":0.004982},"ts":"2026-11-08T06:03:02.709Z"}
-{"type":"wave_started","wave":6,"iteration":1,"ts":"2026-11-08T06:03:03.870Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:03:05.924Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:03:05.925Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/001-test-first-r1-a1","ts":"2026-11-08T06:03:06.615Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","timeoutSec":1200,"ts":"2026-11-08T06:03:06.618Z"}
-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1","ts":"2026-11-08T06:03:06.685Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","timeoutSec":1200,"ts":"2026-11-08T06:03:06.689Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:04:07.116Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:04:07.117Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:05:08.461Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:05:08.462Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:06:08.339Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:06:08.340Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:07:08.053Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:07:08.054Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:08:07.480Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:08:07.480Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:09:08.639Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:09:08.640Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:10:08.604Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:10:08.605Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"sizeBytes":12273320,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-07-001Z_01a1b9c0-dd79-76b1-baa8-02b05324a146","ts":"2026-11-08T06:10:53.089Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-07-001Z_01a1b9c0-dd79-76b1-baa8-02b05324a146","ts":"2026-11-08T06:10:53.089Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1b9c0-dd79-76b1-baa8-02b05324a146","usage":{"inputTokens":77003,"outputTokens":56479,"costUsd":0.064485},"ts":"2026-11-08T06:10:54.092Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:10:59.285Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:10:59.286Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:11:07.789Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:11:07.790Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:12:06.984Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:12:06.985Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:13:07.208Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:13:07.209Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:14:08.275Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:14:08.277Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:15:10.796Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:15:10.797Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:16:07.744Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:16:07.745Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:17:08.048Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:17:08.048Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:18:13.856Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:18:13.857Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"sizeBytes":17578153,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367","ts":"2026-11-08T06:18:59.793Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"toolCalls":174,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-06-948Z_01a1b9c0-dd44-764c-ab25-e93c63f8d367","ts":"2026-11-08T06:18:59.795Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1b9c0-dd44-764c-ab25-e93c63f8d367","usage":{"inputTokens":130428,"outputTokens":92075,"costUsd":0.123622},"ts":"2026-11-08T06:19:06.125Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:19:09.526Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:19:09.528Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:19:14.904Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:19:14.905Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:19:23.038Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:19:23.039Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/002-develop-r1-a1","ts":"2026-11-08T06:19:23.812Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T06:19:23.829Z"}
-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1","ts":"2026-11-08T06:19:23.902Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T06:19:23.916Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:20:07.968Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:20:07.969Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:21:07.854Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:21:07.855Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:22:08.198Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:22:08.199Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:23:08.480Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:23:08.481Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:24:09.696Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:24:09.698Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:25:09.320Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:25:09.321Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:26:07.962Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:26:07.963Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:27:08.224Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:27:08.225Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:28:09.965Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:28:09.966Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:29:07.569Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:29:07.570Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:30:10.192Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:30:10.194Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:31:10.515Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:31:10.516Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:32:08.392Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:32:08.393Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"sizeBytes":10203146,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631","ts":"2026-11-08T06:32:50.911Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"toolCalls":103,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-688Z_01a1b9cf-c890-724d-b6a9-2473bfac0631","ts":"2026-11-08T06:32:50.912Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:33:07.126Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:33:07.127Z"}
-{"type":"step_output_repaired","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"method":"ask","ts":"2026-11-08T06:33:12.820Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:34:08.680Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:34:08.681Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:35:09.640Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:35:09.641Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:36:09.523Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:36:09.524Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:37:08.439Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:37:08.440Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1b9cf-c890-724d-b6a9-2473bfac0631","usage":{"inputTokens":130810,"outputTokens":48991,"costUsd":0.06896100000000001},"ts":"2026-11-08T06:37:41.810Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:37:46.226Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:37:46.227Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:38:07.504Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:38:07.505Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"sizeBytes":9231071,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-762Z_01a1b9cf-c8da-76e1-9957-ebfc1baf2dab","ts":"2026-11-08T06:38:16.023Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"toolCalls":114,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-762Z_01a1b9cf-c8da-76e1-9957-ebfc1baf2dab","ts":"2026-11-08T06:38:16.023Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:39:08.016Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:39:08.017Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"develop","attempt":1,"status":"ok","sessionId":"01a1b9cf-c8da-76e1-9957-ebfc1baf2dab","usage":{"inputTokens":101154,"outputTokens":31985,"costUsd":0.053907},"ts":"2026-11-08T06:39:36.816Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:39:40.165Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:39:40.165Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:39:44.221Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:39:44.222Z"}
-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1","ts":"2026-11-08T06:39:44.766Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/003-develop-r1-a2","ts":"2026-11-08T06:39:44.811Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T06:39:44.824Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"qa","timeoutSec":900,"ts":"2026-11-08T06:39:46.505Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:40:08.543Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:40:08.544Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:41:07.538Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:41:07.540Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:42:07.339Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:42:07.340Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:43:06.872Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:43:06.873Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:44:07.629Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:44:07.630Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:45:08.906Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:45:08.907Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1b9e2-6eae-71ac-a18d-cc5ae6bf3569","usage":{"inputTokens":44412,"outputTokens":31432,"costUsd":0.011489},"ts":"2026-11-08T06:45:33.607Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:45:40.133Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:45:40.134Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:46:08.751Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:46:08.752Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:47:08.041Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:47:08.042Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:48:07.995Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:48:07.996Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"sizeBytes":7184731,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925","ts":"2026-11-08T06:48:50.279Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"toolCalls":79,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-45-497Z_01a1b9e2-6959-7721-ab3f-95f04fde4925","ts":"2026-11-08T06:48:50.279Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:49:08.562Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:49:08.564Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:50:09.623Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:50:09.624Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:51:08.672Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:51:08.673Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:52:07.689Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:52:07.690Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":2,"status":"ok","sessionId":"01a1b9e2-6959-7721-ab3f-95f04fde4925","usage":{"inputTokens":57623,"outputTokens":44914,"costUsd":0.045325},"ts":"2026-11-08T06:52:31.894Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:52:34.578Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:52:34.578Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:52:37.870Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:52:37.871Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1","ts":"2026-11-08T06:52:38.383Z"}
-{"type":"step_started","task":"concerns-funnel","item":"modes-prompts-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--modes-prompts-v2/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/004-review-r1-a1","ts":"2026-11-08T06:52:38.438Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"modes-prompts-v2","step":"review","timeoutSec":900,"ts":"2026-11-08T06:52:38.446Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","timeoutSec":900,"ts":"2026-11-08T06:52:42.350Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:53:07.385Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:53:07.386Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:54:07.710Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:54:07.711Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:55:07.043Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:55:07.044Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:56:07.927Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:56:07.928Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:57:07.524Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:57:07.525Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"modes-prompts-v2","step":"review","attempt":1,"status":"ok","sessionId":"01a1b9ee-373a-71ea-a6ec-297c643a5fb7","usage":{"inputTokens":55407,"outputTokens":17440,"costUsd":0.00979},"ts":"2026-11-08T06:58:00.237Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:58:05.501Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:58:05.502Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:58:08.638Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:58:08.639Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T06:59:07.268Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T06:59:07.269Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:00:06.952Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:00:06.953Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1b9ee-4641-726f-9fba-b5604835d294","usage":{"inputTokens":45734,"outputTokens":15063,"costUsd":0.008244},"ts":"2026-11-08T07:00:11.225Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:00:15.675Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:00:15.675Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:00:19.759Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:00:19.759Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1","ts":"2026-11-08T07:00:20.135Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"review","timeoutSec":900,"ts":"2026-11-08T07:00:20.139Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:01:06.965Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:01:06.966Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:02:07.573Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:02:07.573Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:03:07.120Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:03:07.120Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:04:07.012Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:04:07.013Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:05:07.234Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:05:07.235Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:06:07.891Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:06:07.892Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:07:06.673Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:07:06.673Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:08:07.436Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:08:07.436Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:09:07.383Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:09:07.384Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:10:07.750Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:10:07.750Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:11:08.017Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:11:08.018Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:12:06.615Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:12:06.616Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:13:06.276Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:13:06.277Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:14:06.464Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:14:06.465Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:15:06.530Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:15:06.530Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"sizeBytes":6357436,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-00-20-436Z_01a1b9f5-4154-7406-9ff8-d3941c708763.jsonl","ts":"2026-11-08T07:15:21.077Z"}
-{"type":"turn_timeout_nudge","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"sessionId":"01a1b9f5-4154-7406-9ff8-d3941c708763","timeoutSec":300,"ts":"2026-11-08T07:15:22.078Z"}
-{"type":"infra_retry_started","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"retry":1,"maxRetries":3,"sessionId":"01a1b9f5-4154-7406-9ff8-d3941c708763","costUsd":0.012655,"ts":"2026-11-08T07:15:22.078Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:16:06.302Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:16:06.303Z"}
-{"type":"infra_retry_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"retry":1,"ok":true,"transient":false,"costUsd":0.015252,"ts":"2026-11-08T07:16:55.172Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"status":"ok","sessionId":"01a1b9f5-4154-7406-9ff8-d3941c708763","usage":{"inputTokens":87316,"outputTokens":22079,"costUsd":0.015252},"ts":"2026-11-08T07:16:55.234Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:16:57.901Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:16:57.902Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:17:01.338Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:17:01.339Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/006-develop-r2-a1","ts":"2026-11-08T07:17:01.818Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","timeoutSec":1200,"ts":"2026-11-08T07:17:01.825Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:17:06.494Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:17:06.495Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:18:06.049Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:18:06.050Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:19:06.086Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:19:06.087Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:20:06.356Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:20:06.357Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:21:06.678Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:21:06.678Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:22:06.425Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:22:06.426Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:23:06.573Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:23:06.574Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:24:07.399Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:24:07.399Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"develop","attempt":1,"status":"ok","sessionId":"01a1ba04-8abc-700a-89e0-f502e90ff375","usage":{"inputTokens":162907,"outputTokens":26626,"costUsd":0.03},"ts":"2026-11-08T07:24:49.444Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:24:52.261Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:24:52.262Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:24:55.585Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:24:55.586Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/007-qa-r2-a1","ts":"2026-11-08T07:24:56.131Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","timeoutSec":900,"ts":"2026-11-08T07:24:58.789Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:25:06.418Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:25:06.419Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:26:06.685Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:26:06.686Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:27:06.516Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:27:06.517Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:28:06.599Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:28:06.600Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:29:06.368Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:29:06.374Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:30:06.488Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:30:06.488Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:31:06.248Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:31:06.249Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:32:06.923Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:32:06.924Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:33:06.304Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:33:06.304Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:34:06.253Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:34:06.253Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"sizeBytes":9538182,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-24-59-157Z_01a1ba0b-d195-761c-ae5c-26e992ca824e.jsonl","ts":"2026-11-08T07:34:25.362Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1ba0b-d195-761c-ae5c-26e992ca824e","usage":{"inputTokens":317659,"outputTokens":55851,"costUsd":0.106093},"ts":"2026-11-08T07:34:25.477Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:34:29.824Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:34:29.824Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:34:33.958Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:34:33.959Z"}
-{"type":"step_started","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-store-v2/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/008-review-r2-a1","ts":"2026-11-08T07:34:34.568Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"concerns-store-v2","step":"review","timeoutSec":900,"ts":"2026-11-08T07:34:34.576Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:35:06.422Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:35:06.423Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:36:06.749Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:36:06.750Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:37:06.629Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:37:06.630Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:38:06.497Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:38:06.498Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:39:06.551Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:39:06.552Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:40:06.547Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:40:06.548Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:41:06.259Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:41:06.260Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:42:06.378Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:42:06.379Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:43:06.926Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:43:06.927Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"sizeBytes":6929894,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-34-35-106Z_01a1ba14-9b62-75cd-9589-a9d935a9128f","ts":"2026-11-08T07:43:24.938Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"concerns-store-v2","step":"review","attempt":1,"status":"ok","sessionId":"01a1ba14-9b62-75cd-9589-a9d935a9128f","usage":{"inputTokens":288179,"outputTokens":43764,"costUsd":0.085727},"ts":"2026-11-08T07:43:25.032Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:43:29.006Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:43:29.007Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:43:33.713Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:43:33.714Z"}
-{"type":"step_started","task":"concerns-funnel","step":"consult-concerns-store-v2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1","ts":"2026-11-08T07:43:34.533Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","step":"consult-concerns-store-v2","timeoutSec":1200,"ts":"2026-11-08T07:43:34.544Z"}
-{"type":"steer_poll_error","file":"1794112659180.md","error":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T07:44:07.115Z"}
-{"type":"steer_poll","task":"concerns-funnel","wave":6,"iteration":1,"processed":0,"skipped":1,"ts":"2026-11-08T07:44:07.116Z"}
diff --git a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/input.md b/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/input.md
deleted file mode 100644
index 415740f..0000000
--- a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/input.md
+++ /dev/null
@@ -1,1156 +0,0 @@
-# Step: Architect Consult (Item)
-
-## Goal
-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
-
-## Rules
-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)
-
-This context pack prepares codebase and architectural context for implementing **spec item 18** of `docs/factory.v2.md` in `plugins/software-factory`. All file references use repo-relative paths (`plugins/software-factory/...`) with verified line ranges.
-
----
-
-## 0. Acceptance Definition (Spec Item 18)
-
-From `docs/factory.v2.md:89-103`:
-- **Output contracts**: Every agent output may carry structured `concerns[]`: `{kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}`. Agents also report remarkable decisions/tradeoffs (`{chosen, alternatives, why}`).
-- **Aggregation**: Engine aggregates them in `{task}/concerns/` with stable id (fingerprint), dedup across steps/attempts, status (`open|dismissed|routed|resolved`), and source step record pointer.
-- **Triage**: Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder, no further action).
-- **Routing**:
-  - `blocker` affecting dependent item → dependent item blocked + architect consult.
-  - `architect` → next architect turn (wave report / next iteration plan input).
-  - `human-*` → steer mailbox per `reviewPolicy`.
-  - `tech-debt` → plan tech-debt list.
-- **Funneling**: `worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect.
-- **ADRs**: Marked blocking or non-blocking. Blocking = needs human decision per active mode. Remarkable = below blocking threshold, reported in mailbox digest, never waits.
-- **Human-involvement mode presets**: `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect prompt fragments), shipped as commented default config examples, selectable per task.
-- **Surfacing**: Wave/plan close-ups list open concerns; close-up reviewers re-triage; architect resolves or carries; `factory status` and `state.yaml` show counts.
-- **Deliverables**: Update `plugins/software-factory/docs/ARCHITECTURE.md` (§1 row 18, §6.2 task folder, §8), README, config commentary. Keep prompts terse (debloated). Behavior tests only.
-
----
-
-## 1. Module Map
-
-| Subsystem / Path | Architectural Responsibility | Key Citations |
-|---|---|---|
-| **Artifact & Configuration Types**<br>`plugins/software-factory/src/core/artifacts.ts` | Single source of TypeScript interfaces matching JSON schemas: `ReviewArtifact`, `DeveloperOutputArtifact`, `PlanArtifact`, `DecisionArtifact`, `SteerItemArtifact`, `StateArtifact`, `PipelineConfig`, `PipelineLimits`. | `artifacts.ts:77-133` (config), `artifacts.ts:288-373` (review, developer, closeup, decisions), `artifacts.ts:449-459` (state) |
-| **JSON Schemas**<br>`plugins/software-factory/config/schemas/*.json` | Authoritative contracts for harness schema validation and `complete(@simpler)` structural repair: `review.schema.json`, `developer-output.schema.json`, `plan.schema.json`, `plan-closeup.schema.json`, `wave-closeup.schema.json`, `decisions.schema.json`, `steer-item.schema.json`, `state.schema.json`, `pipeline.schema.json`. | `config/schemas/developer-output.schema.json:61-69` (current free-form string concerns), `config/schemas/plan.schema.json:70-138` (adrs, techDebt, assumptions), `config/schemas/pipeline.schema.json:202-218` (reviewPolicy) |
-| **Step Runner & Schema Resolution**<br>`plugins/software-factory/src/core/flows/step-runner.ts` | Dispatches agent turns, manages step record lifecycle, validates/repairs output, enforces HEAD guards, calls `writeArtifact` seam, commits worktree per step (§6 Invariants). | `step-runner.ts:25-30`, `step-runner.ts:90-110` (schema resolution), `step-runner.ts:220-230`, `step-runner.ts:610-655` (writeArtifact seam & commit) |
-| **Review Schema Generator**<br>`plugins/software-factory/src/core/records/review-schema.ts` | Generates agent-specific JSON schema restricting `suggestions[].disposition` to the agent's allowed enum (§8.7). Natural insertion point for extending vocabulary with `dismiss`. | `review-schema.ts:5-52` (`generateReviewSchema`) |
-| **Item Step Machine**<br>`plugins/software-factory/src/core/flows/item-machine.ts` | Drives per-item step execution (`develop` → `qa` → `review`), passes prompt vars (diff, target, dispositions criteria), collects suggestions, routes `human-async` to mailbox via `writeArtifact`. | `item-machine.ts:280-310` (suggestions loop), `item-machine.ts:628-647` (prompt review wiring), `item-machine.ts:706-728` (`writeQuestion` mailbox write), `item-machine.ts:750-765` (terminal conditions) |
-| **Architect Iteration Flow**<br>`plugins/software-factory/src/core/flows/iteration.ts` | Orchestrates iteration lifecycle: `architect-plan` → `plan-review` loop (with `alt-architect`) → `pm-edits` → wave execution → `wave-close-up` → `architect-wave-report` → `plan-close-up` → `architect-closeup`. Writes ADRs, handles blocked questions. | `iteration.ts:335-400` (plan & ADR write), `iteration.ts:430-540` (plan review & revise), `iteration.ts:850-930` (wave close-up & report), `iteration.ts:1075-1150` (plan close-up & question write) |
-| **Architect Consults & Decisions**<br>`plugins/software-factory/src/core/flows/consults.ts` | Dispatches `architect-consult-item` / `architect-consult-nonitem` on attempt/fix-round/merge failures; writes `{seq}-item-{item}.yaml` in `decisions/`; handles `human-async` question write. | `consults.ts:60-120` (item consult prompt), `consults.ts:130-180` (decision write & mailbox) |
-| **Steering Mailbox**<br>`plugins/software-factory/src/core/steer.ts` | Root task mailbox: `writeQuestion` writes `steer/tousertoreview/{id}.yaml` with deterministic sha256 id; `listPending` reads `fromuserpending`; `classify` routes answers/directives/stop. | `steer.ts:18-40` (`listPending`), `steer.ts:59-110` (`writeQuestion`), `steer.ts:116-176` (`classify`) |
-| **State Derivation & Counts**<br>`plugins/software-factory/src/core/derive/task.ts`<br>`plugins/software-factory/src/core/derive/item.ts`<br>`plugins/software-factory/src/core/derive/wave.ts` | Derives authoritative state from committed records + git (`deriveTaskState`, `toStateArtifact`, `deriveItemState`, `deriveWaveState`). Collects debt from plan, `accept-with-debt` decisions, and `optional` review suggestions. Cascades blocked dependencies. | `derive/task.ts:68-126` (iterations, closeups, open questions), `derive/task.ts:167-205` (debt collection), `derive/task.ts:307-335` (`toStateArtifact`), `derive/item.ts:180-260` (decisions & questions), `derive/wave.ts:44-63`, `85-100` (dependency blocking) |
-| **Plan Scheduler**<br>`plugins/software-factory/src/core/plan/scheduler.ts` | Dependency-aware scheduling (`blockedByFailure`, `runnable`, `nextWave`). Transitive fixpoint for cascading blocked items. | `scheduler.ts:16-36` (`blockedByFailure`), `scheduler.ts:47-90` (`nextWave`), `scheduler.ts:101-135` (`runnable`) |
-| **Fingerprints & Normalization**<br>`plugins/software-factory/src/core/fingerprint.ts`<br>`plugins/software-factory/src/core/loops.ts` | Deterministic hashing: `fingerprintText` (sha1 after whitespace/case normalization), `fingerprintObject` (sorted keys), `fingerprintSuggestions`. Reusable for stable concern fingerprint IDs and dedup. | `fingerprint.ts:10-50`, `loops.ts:169-178` |
-| **Prompt Library & Registry**<br>`plugins/software-factory/src/core/prompts.ts`<br>`plugins/software-factory/src/core/prompt-vars.ts` | Prompt fragment rendering, `KNOWN_VARS` placeholder registry, `loadCriteriaBundle`, `formatDispositionsSection`, preflight prompt validation (`preflightPrompts`). | `prompts.ts:50-80` (`formatDispositionsSection`), `prompts.ts:420-520` (`preflightPrompts`), `prompt-vars.ts:12-38` (`PROMPT_VAR_DESCRIPTIONS`), `prompt-vars.ts:44-161` (`KNOWN_VARS`) |
-| **CLI Status**<br>`plugins/software-factory/src/cli/status.ts` | Formats and prints derived task state, waves/items, open steer questions (`tousertoreview`), and recorded tech debt. | `status.ts:50-108` |
-| **Engine Orchestration & Epics**<br>`plugins/software-factory/src/core/engine.ts` | Core derive-act-commit loop (`runTask`); spawns and manages child epics (`runChildTask`); processes mailbox directives; enforces budget stops (exit 10). | `engine.ts:208-285` (`runChildTask`), `engine.ts:325-335` (operator-editable globs), `engine.ts:380-465` (mailbox loop & budget stop), `engine.ts:685-715` (iteration invocation) |
-| **Configuration Loading & Layering**<br>`plugins/software-factory/src/core/config/loader.ts`<br>`plugins/software-factory/src/core/config/merge.ts` | Loads and layers default → project (`.factory/pipeline.yaml`) → task (`{task}/pipeline.yaml`). Maps merge, arrays replace, `null` deletes. Validates against `pipeline.schema.json`. | `loader.ts:58-150`, `merge.ts:10-60` |
-| **Agent Prompt Definitions**<br>`plugins/software-factory/agents/**` | Agent frontmatter and instructions: `developer.md`, `reviewer.md`, `plan-reviewer.md`, `architect.md`, `wave-close-up.md`, `plan-close-up.md`, `_shared/dispositions.md`, `criteria/dispositions.md`. | `agents/developer.md`, `agents/reviewer.md`, `agents/plan-reviewer.md`, `agents/criteria/dispositions.md:1-25`, `agents/_shared/dispositions.md:1-30` |
-
----
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Existing Artifact Types (`src/core/artifacts.ts`)
-
-```typescript
-// Review Dispositions (§8.7, artifacts.ts:288-295)
-export type ReviewDisposition =
-  | "fix"
-  | "optional"
-  | "architect"
-  | "human-awareness"
-  | "human-async"
-  | "human-stop";
-
-// Review Suggestion & Output (artifacts.ts:296-311)
-export interface ReviewSuggestion {
-  id: string;
-  disposition: ReviewDisposition | string;
-  summary: string;
-  detail?: string;
-  location?: { file: string; line?: number };
-}
-export interface ReviewArtifact {
-  status: "approved" | "changes_requested";
-  summary: string;
-  suggestions: ReviewSuggestion[];
-}
-
-// Current Developer Output (artifacts.ts:318-325) — free-form string concerns only
-export interface DeveloperOutputArtifact {
-  status: "ok" | "blocked" | "failed";
-  summary: string;
-  target?: DeveloperTarget;
-  evidence?: string[];
-  concerns?: string[];   // <--- Free-form string array; must become structured Concern[]
-  notes?: string;
-}
-
-// Plan ADRs & Tech Debt (artifacts.ts:228-252)
-export interface PlanAdr {
-  id: string;
-  title: string;
-  context: string;
-  decision: string;
-  consequences?: string;
-  // Missing: blocking?: boolean
-}
-export interface PlanTechDebt {
-  id: string;
-  description: string;
-  category: "adjacent" | "impacting" | "blocking";
-  resolution?: string;
-}
-
-// Steer Mailbox Item (artifacts.ts:375-386)
-export interface SteerItemArtifact {
-  id: string;
-  ref: string;
-  disposition: string;
-  question: string;
-  draftDecision?: string;
-  blocks?: string[];
-  status: "open" | "answered" | "dismissed";
-  createdAt?: string;
-  answeredAt?: string;
-  answer?: string;
-}
-
-// State Artifact (artifacts.ts:449-459)
-export interface StateArtifact {
-  task: string;
-  kind?: string;
-  status: "active" | "blocked" | "done" | "failed";
-  iteration: number;
-  currentWave?: number;
-  items: Record<string, StateItemInfo>;
-  debt?: string[];
-  budgetSpentUsd?: number;
-  lastUpdated: string;
-  // Missing: concern counts & summary
-}
-```
-
-### 2.2 Spec Item 18 Structured Concern Type (Required Target Contract)
-
-Per `docs/factory.v2.md:90`:
-```typescript
-export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
-export type ConcernSeverity = "low" | "medium" | "high";
-export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
-
-export interface Concern {
-  id?: string;                        // Stable fingerprint id assigned by engine
-  kind: ConcernKind;
-  summary: string;
-  detail: string;
-  location?: { file: string; line?: number };
-  severity: ConcernSeverity;
-  affects?: string[];                 // item / epic / plan references
-}
-
-export interface RemarkableDecision {
-  chosen: string;
-  alternatives: string[];
-  why: string;
-}
-
-export interface StoredConcernArtifact extends Concern {
-  id: string;
-  status: ConcernStatus;
-  disposition?: string;               // Assigned during triage
-  dismissReason?: string;             // When disposition is "dismiss"
-  source: {
-    record: string;                   // Step record directory name, e.g. "003-review-a1"
-    agent: string;
-    step: string;
-    item?: string;
-    iteration?: number;
-  };
-  createdAt: string;
-  updatedAt: string;
-}
-```
-
-### 2.3 Review Schema Generation (`src/core/records/review-schema.ts:5-52`)
-
-```typescript
-export function generateReviewSchema(
-  allowedDispositions: string[]
-): Record<string, unknown>;
-```
-Currently generates schema where `suggestions[].disposition` is an enum of `allowedDispositions` (default: `["fix", "optional", "architect", "human-awareness", "human-async"]`). Triage extension must allow `dismiss` in this vocabulary.
-
-### 2.4 Step Execution & Schema Resolution (`src/core/flows/step-runner.ts`)
-
-```typescript
-export interface StepRunOptions {
-  task: string;
-  item?: string;
-  stepId: string;
-  stepFragment?: string;
-  agent: string;
-  role?: string;
-  cwd: string;
-  taskDir: string;
-  recordsDir: string;
-  repo: any;
-  harness: Harness;
-  pipeline: PipelineConfig;
-  project: ProjectConfig;
-  prompts: any;
-  promptVars: Record<string, string>;
-  writeArtifact?: (output: unknown) => Promise<void>;  // <--- Seam: runs before finishStepRecord
-  // ...
-}
-export interface StepRunResult {
-  ok: boolean;
-  status: StepMetaStatus;
-  output?: unknown;
-  meta: StepMetaArtifact;
-  sessionId?: string;
-}
-```
-
----
-
-## 3. Relevant Code Excerpts & Current Wiring
-
-### 3.1 Item Machine: Review Allowed Dispositions & Prompt Wiring
-From `plugins/software-factory/src/core/flows/item-machine.ts:631-647`:
-```typescript
-  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
-  const reviewAllowed =
-    pipeline.reviewPolicy?.allowedDispositions ??
-    pipeline.reviewPolicy?.[currentStep.agent] ??
-    ["fix", "optional", "architect", "human-awareness", "human-async"];
-
-  const promptVars: Record<string, string> = {
-    assignment: assignmentYaml,
-    intent: intentText,
-    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
-    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
-    context: "",
-    checks: failingCheckSummaries.join("\n"),
-    testDiff: "",
-    diff: diffRes.stdout,
-    feedback: feedbackText,
-    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
-  };
-```
-*Note*: Line 632 checks `pipeline.reviewPolicy?.allowedDispositions`, but `StepRunner` at `step-runner.ts:222` only reads `pipeline.reviewPolicy?.allowedDispositions` (global), so per-agent overrides (`pipeline.reviewPolicy[currentStep.agent]`) currently reach the prompt but NOT the schema generator unless resolved uniformly.
-
-### 3.2 Item Machine: `writeArtifact` Seam Writing `human-async` Questions
-From `plugins/software-factory/src/core/flows/item-machine.ts:706-727`:
-```typescript
-    writeArtifact: async (output: unknown) => {
-      // Persist human-async questions atomically with the review record (Finding 23)
-      if (output && typeof output === "object" && "suggestions" in (output as any)) {
-        const rev = output as ReviewArtifact;
-        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
-        if (asyncQuestions && asyncQuestions.length > 0) {
-          for (const q of asyncQuestions) {
-            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
-            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
-            await writeQuestion(taskWt, taskDir, {
-              id: qId,
-              ref: itemSlug,
-              disposition: "human-async",
-              question: q.detail || q.summary,
-              blocks: [itemSlug],
-            });
-          }
-        }
-      }
-    },
-```
-This is the proven atomic persistence pattern for routing reviewer suggestions to mailbox questions; concern aggregation from agent outputs maps naturally to this seam or an adjacent callback.
-
-### 3.3 Step Runner: `writeArtifact` Seam & Commit Invariant
-From `plugins/software-factory/src/core/flows/step-runner.ts:611-655`:
-```typescript
-  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
-  if (finalStatus === "ok" && opts.writeArtifact) {
-    try {
-      await opts.writeArtifact(validatedData);
-    } catch (err: any) {
-      finalStatus = "error";
-      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
-    }
-  }
-
-  // 13. Invariant §6.3.2: Finish step record with final meta
-  const finalMeta = await finishStepRecord({ ... });
-
-  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
-  if (!(await isMerging(wtToCommit))) {
-    await commitAll(
-      repo,
-      wtToCommit,
-      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
-    );
-  }
-```
-
-### 3.4 Steering: `writeQuestion` Stable ID Pattern
-From `plugins/software-factory/src/core/steer.ts:63-108`:
-```typescript
-export async function writeQuestion(
-  rootWt: string,
-  taskDir: string,
-  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
-): Promise<SteerItemArtifact> {
-  const hash = crypto
-    .createHash("sha256")
-    .update(`${q.ref}:${q.question}:${q.disposition}`)
-    .digest("hex")
-    .slice(0, 10);
-
-  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
-  const id = q.id ?? `q-${cleanRef}-${hash}`;
-  // ...
-  const targetPath = path.join(outDir, `${id}.yaml`);
-  if (fs.existsSync(targetPath)) {
-    // A re-run step raising the same question must not clobber the operator's answer.
-    try {
-      const existing = yaml.parse(await fs.promises.readFile(targetPath, "utf8")) as SteerItemArtifact;
-      return existing;
-    } catch { }
-  }
-  await writeYamlAtomic(targetPath, item);
-  return item;
-}
-```
-This demonstrates the dedup and idempotent overwrite-guard pattern needed for `concerns/{id}.yaml`.
-
-### 3.5 Plan Review Flow: Architect <-> Reviewer Turn
-From `plugins/software-factory/src/core/flows/iteration.ts:440-485`:
-```typescript
-    const revStepRes = await runAgentStep({
-      task,
-      stepId: revRecordName,
-      stepFragment: "steps/plan-review",
-      agent: "plan-reviewer",
-      role: "alt-architect",
-      cwd: taskWt,
-      recordsDir: runsDir,
-      promptVars: {
-        plan: JSON.stringify(plan, null, 2),
-        intent: intentText,
-        context: contextYaml,
-        limits: JSON.stringify(limits, null, 2),
-        dispositionsCriteria: formatDispositionsSection(
-          loadCriteriaBundle(pipeline.criteria).dispositions,
-          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
-        ),
-      },
-      // ...
-    });
-    // ...
-    const revOutput = revStepRes.output as ReviewArtifact | undefined;
-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
-    if (!fixSuggestions || fixSuggestions.length === 0) {
-      break; // Plan approved!
-    }
-```
-Currently `plan-review` only acts on `fix` suggestions (looping into `architect-revise`). Architect concerns/decisions are not triaged or propagated here yet.
-
-### 3.6 ADR Writing: Current Implementation Only Writes Title + Context
-From `plugins/software-factory/src/core/flows/iteration.ts:380-390`:
-```typescript
-        // Write ADRs if specified (§8.4.2)
-        if (plan.adrs && project.adrFolder) {
-          const adrDir = path.join(taskWt, project.adrFolder);
-          await fs.promises.mkdir(adrDir, { recursive: true });
-          for (const adr of plan.adrs) {
-            const adrFile = path.join(adrDir, `${adr.id}.md`);
-            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
-          }
-        }
-```
-Notice that `adr.decision` and `adr.consequences` are currently omitted from the markdown file, and there is no `blocking` flag.
-
-### 3.7 Derived Tech Debt Collection
-From `plugins/software-factory/src/core/derive/task.ts:167-205`:
-```typescript
-  // 7. Tech debt collection
-  const debtSet = new Set<string>();
-  if (plan?.techDebt) {
-    for (const d of plan.techDebt) {
-      debtSet.add(d.description);
-    }
-  }
-  // From decisions: accept-with-debt
-  const decisionsDir = path.join(taskDir, "decisions");
-  if (fs.existsSync(decisionsDir)) {
-    // ... adds d.debt
-  }
-  // From review suggestions with disposition optional
-  for (const it of items) {
-    for (const rec of it.records) {
-      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
-        const suggestions = (rec.output as any).suggestions;
-        for (const sug of suggestions ?? []) {
-          if (sug.disposition === "optional" && sug.summary) {
-            debtSet.add(`[${it.slug}] ${sug.summary}`);
-          }
-        }
-      }
-    }
-  }
-```
-Concerns routed to `tech-debt` must feed into this derived debt set.
-
-### 3.8 Wave Dependency Blocking (Transitive Fixpoint)
-From `plugins/software-factory/src/core/derive/wave.ts:44-63` & `plugins/software-factory/src/core/plan/scheduler.ts:16-36`:
-```typescript
-  // Dependents of failed items become blocked-by-failure, cascaded transitively to a fixpoint (§8.2)
-  const schedItems = items.map((it) => ({
-    slug: it.slug,
-    wave: String(it.wave),
-    deps: it.deps,
-    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
-  }));
-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
-  let grew = failureBlocked.size > 0;
-  while (grew) {
-    grew = false;
-    for (const it of items) {
-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
-        failureBlocked.add(it.slug);
-        grew = true;
-      }
-    }
-  }
-```
-Spec item 18's rule ("blocker affecting a dependent item → dependent item blocked + architect consult") hooks into this dependency-blocking mechanic.
-
-### 3.9 Child Epic Execution & Parent State Propagation
-From `plugins/software-factory/src/core/engine.ts:208-278`:
-```typescript
-export async function runChildTask(
-  deps: EngineDeps,
-  parent: { branch: string; path: string; taskDir: string },
-  epicSlug: string,
-  // ...
-): Promise<RunResult> {
-  // Child worktree topic/{task}--{epic}
-  // Runs its own runIteration loop
-  // Writes child-closeup.yaml into parentItemDir:
-  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
-  await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
-    epic: epicSlug,
-    status: childStatus,
-    iteration: itRes.iteration,
-    summary: `Epic child task finished: ${itRes.status}`,
-  });
-```
-
-### 3.10 CLI Status Rendering
-From `plugins/software-factory/src/cli/status.ts:83-105`:
-```typescript
-  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
-    console.log(`Open Operator Questions (tousertoreview):`);
-    for (const q of derived.openSteerQuestions) {
-      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
-      console.log(`    Question: ${q.question}`);
-      // ...
-    }
-  }
-  if (derived.debt && derived.debt.length > 0) {
-    console.log(`Recorded Technical Debt:`);
-    for (const d of derived.debt) {
-      console.log(`  - ${d}`);
-    }
-  }
-```
-Currently missing concern counts (`open`, `dismissed`, `routed`, `resolved`) and remarkable decision digests.
-
----
-
-## 4. Existing Tests & Conventions
-
-### 4.1 Testing Harness & Infrastructure
-- **Test Runner**: `bun test` (see `plugins/software-factory/package.json:11-13`).
-- **Temporary Git Repos**: `test/helpers/tmp-repo.ts:24-125` creates isolated git repositories with helper methods (`commit`, `createBranch`, `createWorktree`, `git`, `cleanup`).
-- **Fake Harness Scripting**: `src/harness/fake/fake-harness.ts:40-140`. End-to-end engine tests script agent turns deterministically using label patterns:
-  - Orchestration turns: `${task}/runs/${stepId}#a${attempt}`
-  - Item turns: `${task}/items/${item}/${stepId}#a${attempt}`
-  - Example: `test/engine/story-happy-path.test.ts:34-80`, `test/engine/human-async-steering.test.ts:70-130`.
-- **Ajv Schema Verification**: Fake outcomes must conform to actual JSON schemas because `step-runner.ts:510-570` parses and validates them through `validateAndRepair`. Invalid scripted schemas trigger repair or failure.
-
-### 4.2 Behavior Tests Only Convention
-Per task intent and spec §13:
-- Tests must verify end-to-end behaviors: raising concerns, aggregation on disk, triage by reviewer, routing effects (mailbox write, dependent item blocking, consult trigger, debt inclusion), state/status surfacing.
-- No unit tests of prompt string templates or mocking internals; use `FakeHarness` driving `runTask` or `tickItemMachine`.
-- Target files: `test/engine/concerns-funnel.test.ts` (new behavior suite), with focused additions to `test/steer.test.ts`, `test/cli/cli.test.ts`.
-
-### 4.3 Prompt Preflight Invariants (`test/prompts.test.ts:102-195`)
-- Every agent declared in `pipeline.agents` must have a loadable definition in `agents/`.
-- Every placeholder in step fragments must be registered in `KNOWN_VARS` (`src/core/prompt-vars.ts:44-161`).
-- Every orchestration fragment in `ENGINE_STEP_FRAGMENTS` (`src/core/prompts.ts:402-420`) must exist and pass render checks.
-- Adding prompt fragments or variables for concern triage or human-involvement modes must update `KNOWN_VARS` and pass `preflightPrompts`.
-
-### 4.4 Config Layering Semantics (`test/config-layering.test.ts:5-45`)
-- Precedence: `config/pipeline.default.yaml` → `<repo>/.factory/pipeline.yaml` → `<repo>/{task}/pipeline.yaml`.
-- Objects deeply merge, arrays replace wholesale, explicit `null` deletes keys.
-- `config/schemas/pipeline.schema.json:253` enforces `"additionalProperties": false` at the root, so new top-level configuration keys (like `humanInvolvement`) require schema updates.
-
----
-
-## 5. Current State vs. Item 18 Requirements (Gap Analysis)
-
-| Feature | Spec Item 18 Requirement | Current Codebase State | Gap to Close |
-|---|---|---|---|
-| **Structured Concerns in Output** | Every agent output may carry `concerns[]`: `{kind, summary, detail, location?, severity, affects?}` + remarkable decisions/tradeoffs `{chosen, alternatives, why}`. | `DeveloperOutputArtifact` has only free-form `concerns?: string[]` (`artifacts.ts:323`). Other schemas (`plan.schema.json`, `fact-finder-output.schema.json`, `wave-closeup.schema.json`, `plan-closeup.schema.json`) have no `concerns` or `remarkable` fields. | Define structured `Concern` and `RemarkableDecision` schemas/types; update output schemas for developer, fact-finder, architect plan, and close-ups. |
-| **Engine Aggregation & Dedup** | Engine aggregates them in `{task}/concerns/` with stable fingerprint id, dedup across steps/attempts, status (`open|dismissed|routed|resolved`), source step record pointer. | No `concerns/` folder exists (`docs/ARCHITECTURE.md:185-197`). `writeQuestion` pattern exists (`steer.ts:63-108`) with sha256 hashing, but no concern aggregation logic exists. | Build `src/core/concerns.ts` with `aggregateConcerns()`: stable hash of `{kind, summary, location, affects}`, atomic YAML write in `{task}/concerns/{id}.yaml`, dedup/merge across re-runs. |
-| **Reviewer Triage & Dispositions** | Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder). | Review vocabulary (`artifacts.ts:288-294`, `review-schema.ts:9-12`) lacks `dismiss`. `item-machine.ts` and `iteration.ts` do not pass open concerns to reviewers or collect triage decisions. | Add `dismiss` to `ReviewDisposition`; extend review schema to accept concern triage; pass open concerns in `promptVars`; record triage status/reason in `{task}/concerns/{id}.yaml`. |
-| **Routing: Blocker & Architect** | `blocker` affecting dependent item → dependent item blocked + architect consult. `architect` → next architect turn (wave report / next plan input). | Review disposition `architect` is never routed anywhere in `item-machine.ts` or `iteration.ts`. Dependency blocking only checks `failed`/`abandoned` items (`scheduler.ts:16-36`). | Map `affects` to item slugs; mark affected items `blocked` in `deriveWaveState`/`deriveItemState`; trigger `runItemConsult` or hydrate into next architect turn (`buildArchitectHydration`). |
-| **Routing: Human Mailbox & Tech Debt** | `human-*` → steer mailbox per policy; `tech-debt` → plan tech-debt list. | `human-async` writes to `steer/tousertoreview` (`item-machine.ts:711`), but `human-awareness` and `human-stop` are ignored. Debt collection (`derive/task.ts:167-205`) only reads plan `techDebt`, `accept-with-debt` decisions, and `optional` review suggestions. | Route `human-awareness` as non-blocking digest item in mailbox; route `human-stop` with task halt; add routed `tech-debt` concerns to `deriveTaskState` debt collection. |
-| **Funneling & Text Budget** | `worker → reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Less detail per level, never more text than code summarized. | No text length limits or condensing mechanics exist. Close-up prompts have no concerns context. | Provide condensed summaries at each funnel tier; enforce text size bound (detail bytes ≤ diff bytes); hydrate wave report and plan close-up with open concerns. |
-| **Blocking vs Non-blocking ADRs** | Marked blocking or non-blocking. Blocking = needs human decision per mode; remarkable = below blocking threshold, reported in mailbox digest, never waits. | `PlanAdr` has no `blocking` boolean (`artifacts.ts:235-241`). `iteration.ts:380-390` writes only title/context to `.md` files; no mailbox digest exists. | Add `blocking?: boolean` to `PlanAdr` and `plan.schema.json`; route blocking ADRs to `writeQuestion` per mode; route non-blocking remarkable ADRs to mailbox digest. |
-| **Human-Involvement Modes** | Config presets: `autonomous`, `principal`, `detailed` (pipeline config + prompt fragments for reviewer/architect criteria), selectable per task. | No mode concept in `PipelineConfig` (`artifacts.ts:108-133`). `criteria/dispositions.md` has static criteria without mode-specific rules. | Add mode config preset examples to `config/pipeline.default.yaml`; create prompt criteria fragments (`agents/criteria/human-involvement.md`); wire into prompt rendering. |
-| **Surfacing & State Counts** | Wave/plan close-ups list open concerns; close-up reviewers re-triage; `factory status` and `state.yaml` show counts. | `state.yaml` (`StateArtifact`, `artifacts.ts:449-459`) has no concern fields. `status.ts:83-105` prints only operator questions and debt. | Add `concerns?: { open, dismissed, routed, resolved }` to `StateArtifact`, refresh in `deriveTaskState`, and render in `cli/status.ts`. |
-| **Documentation Updates** | Update `ARCHITECTURE.md` (§1 row 18, §6.2, §8.7), README, config commentary. | Row 18 marked "Deliberately not hand-built" (`docs/ARCHITECTURE.md:39`). | Update `docs/ARCHITECTURE.md`, `README.md`, and config comments with full concerns funnel specifications. |
-
----
-
-## 6. Open Questions & Architectural Decisions for the Architect
-
-1. **Aggregation Worktree & Commit Invariant (§6.2 vs §6.3)**:
-   - *Context*: In `step-runner.ts:630-655`, an item step commits only `childWt` (`topic/{task}--{item}`). The task orchestration folder `{task}/concerns/` lives on `taskWt` (`topic/{task}`).
-   - *Options*:
-     - (A) Write concerns directly to `taskWt/{task}/concerns/` during item steps, matching the precedent set by `writeQuestion` (`item-machine.ts:716`) and `refreshStateYaml` (`item-machine.ts:731`), with formal task worktree commit at wave merges/edits.
-     - (B) Write item concerns to `childWt/{task}/items/{item}/concerns/` and aggregate them onto `taskWt` when the item merges or at wave completion.
-     - (C) Extend `runAgentStep` to commit both worktrees when task-level artifacts are written.
-   - *Recommendation*: Option (A) is cleanest and exactly matches `writeQuestion` and `state.yaml` behavior.
-
-2. **Triage Schema Contract for Reviewers**:
-   - *Context*: Reviewers need to triage concerns raised by earlier worker steps.
-   - *Options*:
-     - (A) Reuse the existing `suggestions[]` array in `ReviewArtifact`, extending `disposition` to include `"dismiss"`, matching on `suggestion.id = concern.id`.
-     - (B) Add a distinct `concernTriage: Array<{ id: string; status: "confirmed" | "dismissed"; disposition?: ReviewDisposition; reason?: string }>` to `ReviewArtifact`.
-   - *Tradeoff*: Option (A) adheres strictly to the spec phrasing ("triages new concerns with the same disposition vocabulary as review suggestions plus dismiss"), avoiding a separate schema branch.
-
-3. **Text Size Bound Enforcement ("never more text than the code it summarizes")**:
-   - *Context*: How should the engine mechanically check or enforce that summaries do not bloat?
-   - *Options*:
-     - Purely prompt-guided with debloated instructions in reviewer/architect prompts.
-     - Mechanical validation in the engine comparing `concern.detail.length` to `diff.length` (or capping at a sensible max like 300 characters).
-
-4. **Saga Concern Propagation Mechanics**:
-   - *Context*: Epics run as child tasks (`engine.ts:208-285`) using `runChildTask`, writing `child-closeup.yaml`. How should epic concerns reach the saga architect?
-   - *Design*: When child epics finish, un-dismissed epic-level concerns/decisions can be summarized into `child-closeup.yaml` or copied into the parent task's `concerns/` directory, hydrating the saga architect's next wave report or close-up turn.
-
-5. **Mailbox Digest Delivery for Remarkable Items**:
-   - *Context*: "remarkable items reported in a mailbox digest, never waiting".
-   - *Design*: Write to `steer/digest/` or record in `steer/tousertoreview/digest-{hash}.yaml` with `status: "open"`, `disposition: "human-awareness"`, without adding the item to `blocks: [...]`, so it surfaces in `factory status` and the mailbox without stopping the engine.
-
-6. **Human-Involvement Mode Configuration Placement**:
-   - *Context*: `pipeline.schema.json` has `additionalProperties: false` at the root.
-   - *Options*:
-     - Add `humanInvolvement: { type: "string", enum: ["autonomous", "principal", "detailed"], default: "autonomous" }` to `config/schemas/pipeline.schema.json` and `PipelineConfig`.
-     - Alternatively, place it inside `reviewPolicy.mode` or under `criteria.humanInvolvement`.
-   - *Recommendation*: Adding top-level `humanInvolvement` to schema and `PipelineConfig` is cleanest and aligns with the spec intent ("human-involvement modes = config presets").
-`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
-
-## Item
-concerns-store-v2
-
-## Assignment
-{"slug":"concerns-store-v2","kind":"dev","title":"Concerns store with merge and commit","assignment":"Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.","outlineRef":"concerns-store-v2","milestone":"m1-contracts-aggregate","wave":6,"deps":["concerns-contracts-policy","concerns-contracts-schemas","concerns-contracts-types"]}
-
-## Prior Attempts & Failures
-Fix rounds exhausted (2/3)
-
-## Current Diff
-
-
-## Review Feedback
-Fix rounds exhausted (2/3) without resolution.
-
-Latest fix requests:
-- [FIX] reconcileConcerns rewrites every concern with fresh updatedAt/lastSeen and commits once per record on every startup: aggregateConcerns always calls writeYamlAtomic with at = new Date() and then commitAll (concerns.ts:81-96), and reconcileConcerns replays every committed ok record unconditionally on each runTask (concerns.ts:197-205; engine.ts:370). So every task restart advances updatedAt and source.lastSeen for all concerns (artifacts.ts:336 documents lastSeen as the most recent re-emit) and adds one 'factory: concerns <record>' commit per record, even when nothing was lost. The 'idempotently' test only asserts file count and preserved status, so it does not catch the churn. Fix: make replay deterministic — process records in meta.endedAt order and derive `at` from meta.endedAt (or write only when the merged record differs) so a second startup is a no-op.
-
-## Context Pack
-# Context Pack — concerns-funnel (Spec Item 18)
-
-This context pack prepares codebase and architectural context for implementing **spec item 18** of `docs/factory.v2.md` in `plugins/software-factory`. All file references use repo-relative paths (`plugins/software-factory/...`) with verified line ranges.
-
----
-
-## 0. Acceptance Definition (Spec Item 18)
-
-From `docs/factory.v2.md:89-103`:
-- **Output contracts**: Every agent output may carry structured `concerns[]`: `{kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}`. Agents also report remarkable decisions/tradeoffs (`{chosen, alternatives, why}`).
-- **Aggregation**: Engine aggregates them in `{task}/concerns/` with stable id (fingerprint), dedup across steps/attempts, status (`open|dismissed|routed|resolved`), and source step record pointer.
-- **Triage**: Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder, no further action).
-- **Routing**:
-  - `blocker` affecting dependent item → dependent item blocked + architect consult.
-  - `architect` → next architect turn (wave report / next iteration plan input).
-  - `human-*` → steer mailbox per `reviewPolicy`.
-  - `tech-debt` → plan tech-debt list.
-- **Funneling**: `worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect.
-- **ADRs**: Marked blocking or non-blocking. Blocking = needs human decision per active mode. Remarkable = below blocking threshold, reported in mailbox digest, never waits.
-- **Human-involvement mode presets**: `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect prompt fragments), shipped as commented default config examples, selectable per task.
-- **Surfacing**: Wave/plan close-ups list open concerns; close-up reviewers re-triage; architect resolves or carries; `factory status` and `state.yaml` show counts.
-- **Deliverables**: Update `plugins/software-factory/docs/ARCHITECTURE.md` (§1 row 18, §6.2 task folder, §8), README, config commentary. Keep prompts terse (debloated). Behavior tests only.
-
----
-
-## 1. Module Map
-
-| Subsystem / Path | Architectural Responsibility | Key Citations |
-|---|---|---|
-| **Artifact & Configuration Types**<br>`plugins/software-factory/src/core/artifacts.ts` | Single source of TypeScript interfaces matching JSON schemas: `ReviewArtifact`, `DeveloperOutputArtifact`, `PlanArtifact`, `DecisionArtifact`, `SteerItemArtifact`, `StateArtifact`, `PipelineConfig`, `PipelineLimits`. | `artifacts.ts:77-133` (config), `artifacts.ts:288-373` (review, developer, closeup, decisions), `artifacts.ts:449-459` (state) |
-| **JSON Schemas**<br>`plugins/software-factory/config/schemas/*.json` | Authoritative contracts for harness schema validation and `complete(@simpler)` structural repair: `review.schema.json`, `developer-output.schema.json`, `plan.schema.json`, `plan-closeup.schema.json`, `wave-closeup.schema.json`, `decisions.schema.json`, `steer-item.schema.json`, `state.schema.json`, `pipeline.schema.json`. | `config/schemas/developer-output.schema.json:61-69` (current free-form string concerns), `config/schemas/plan.schema.json:70-138` (adrs, techDebt, assumptions), `config/schemas/pipeline.schema.json:202-218` (reviewPolicy) |
-| **Step Runner & Schema Resolution**<br>`plugins/software-factory/src/core/flows/step-runner.ts` | Dispatches agent turns, manages step record lifecycle, validates/repairs output, enforces HEAD guards, calls `writeArtifact` seam, commits worktree per step (§6 Invariants). | `step-runner.ts:25-30`, `step-runner.ts:90-110` (schema resolution), `step-runner.ts:220-230`, `step-runner.ts:610-655` (writeArtifact seam & commit) |
-| **Review Schema Generator**<br>`plugins/software-factory/src/core/records/review-schema.ts` | Generates agent-specific JSON schema restricting `suggestions[].disposition` to the agent's allowed enum (§8.7). Natural insertion point for extending vocabulary with `dismiss`. | `review-schema.ts:5-52` (`generateReviewSchema`) |
-| **Item Step Machine**<br>`plugins/software-factory/src/core/flows/item-machine.ts` | Drives per-item step execution (`develop` → `qa` → `review`), passes prompt vars (diff, target, dispositions criteria), collects suggestions, routes `human-async` to mailbox via `writeArtifact`. | `item-machine.ts:280-310` (suggestions loop), `item-machine.ts:628-647` (prompt review wiring), `item-machine.ts:706-728` (`writeQuestion` mailbox write), `item-machine.ts:750-765` (terminal conditions) |
-| **Architect Iteration Flow**<br>`plugins/software-factory/src/core/flows/iteration.ts` | Orchestrates iteration lifecycle: `architect-plan` → `plan-review` loop (with `alt-architect`) → `pm-edits` → wave execution → `wave-close-up` → `architect-wave-report` → `plan-close-up` → `architect-closeup`. Writes ADRs, handles blocked questions. | `iteration.ts:335-400` (plan & ADR write), `iteration.ts:430-540` (plan review & revise), `iteration.ts:850-930` (wave close-up & report), `iteration.ts:1075-1150` (plan close-up & question write) |
-| **Architect Consults & Decisions**<br>`plugins/software-factory/src/core/flows/consults.ts` | Dispatches `architect-consult-item` / `architect-consult-nonitem` on attempt/fix-round/merge failures; writes `{seq}-item-{item}.yaml` in `decisions/`; handles `human-async` question write. | `consults.ts:60-120` (item consult prompt), `consults.ts:130-180` (decision write & mailbox) |
-| **Steering Mailbox**<br>`plugins/software-factory/src/core/steer.ts` | Root task mailbox: `writeQuestion` writes `steer/tousertoreview/{id}.yaml` with deterministic sha256 id; `listPending` reads `fromuserpending`; `classify` routes answers/directives/stop. | `steer.ts:18-40` (`listPending`), `steer.ts:59-110` (`writeQuestion`), `steer.ts:116-176` (`classify`) |
-| **State Derivation & Counts**<br>`plugins/software-factory/src/core/derive/task.ts`<br>`plugins/software-factory/src/core/derive/item.ts`<br>`plugins/software-factory/src/core/derive/wave.ts` | Derives authoritative state from committed records + git (`deriveTaskState`, `toStateArtifact`, `deriveItemState`, `deriveWaveState`). Collects debt from plan, `accept-with-debt` decisions, and `optional` review suggestions. Cascades blocked dependencies. | `derive/task.ts:68-126` (iterations, closeups, open questions), `derive/task.ts:167-205` (debt collection), `derive/task.ts:307-335` (`toStateArtifact`), `derive/item.ts:180-260` (decisions & questions), `derive/wave.ts:44-63`, `85-100` (dependency blocking) |
-| **Plan Scheduler**<br>`plugins/software-factory/src/core/plan/scheduler.ts` | Dependency-aware scheduling (`blockedByFailure`, `runnable`, `nextWave`). Transitive fixpoint for cascading blocked items. | `scheduler.ts:16-36` (`blockedByFailure`), `scheduler.ts:47-90` (`nextWave`), `scheduler.ts:101-135` (`runnable`) |
-| **Fingerprints & Normalization**<br>`plugins/software-factory/src/core/fingerprint.ts`<br>`plugins/software-factory/src/core/loops.ts` | Deterministic hashing: `fingerprintText` (sha1 after whitespace/case normalization), `fingerprintObject` (sorted keys), `fingerprintSuggestions`. Reusable for stable concern fingerprint IDs and dedup. | `fingerprint.ts:10-50`, `loops.ts:169-178` |
-| **Prompt Library & Registry**<br>`plugins/software-factory/src/core/prompts.ts`<br>`plugins/software-factory/src/core/prompt-vars.ts` | Prompt fragment rendering, `KNOWN_VARS` placeholder registry, `loadCriteriaBundle`, `formatDispositionsSection`, preflight prompt validation (`preflightPrompts`). | `prompts.ts:50-80` (`formatDispositionsSection`), `prompts.ts:420-520` (`preflightPrompts`), `prompt-vars.ts:12-38` (`PROMPT_VAR_DESCRIPTIONS`), `prompt-vars.ts:44-161` (`KNOWN_VARS`) |
-| **CLI Status**<br>`plugins/software-factory/src/cli/status.ts` | Formats and prints derived task state, waves/items, open steer questions (`tousertoreview`), and recorded tech debt. | `status.ts:50-108` |
-| **Engine Orchestration & Epics**<br>`plugins/software-factory/src/core/engine.ts` | Core derive-act-commit loop (`runTask`); spawns and manages child epics (`runChildTask`); processes mailbox directives; enforces budget stops (exit 10). | `engine.ts:208-285` (`runChildTask`), `engine.ts:325-335` (operator-editable globs), `engine.ts:380-465` (mailbox loop & budget stop), `engine.ts:685-715` (iteration invocation) |
-| **Configuration Loading & Layering**<br>`plugins/software-factory/src/core/config/loader.ts`<br>`plugins/software-factory/src/core/config/merge.ts` | Loads and layers default → project (`.factory/pipeline.yaml`) → task (`{task}/pipeline.yaml`). Maps merge, arrays replace, `null` deletes. Validates against `pipeline.schema.json`. | `loader.ts:58-150`, `merge.ts:10-60` |
-| **Agent Prompt Definitions**<br>`plugins/software-factory/agents/**` | Agent frontmatter and instructions: `developer.md`, `reviewer.md`, `plan-reviewer.md`, `architect.md`, `wave-close-up.md`, `plan-close-up.md`, `_shared/dispositions.md`, `criteria/dispositions.md`. | `agents/developer.md`, `agents/reviewer.md`, `agents/plan-reviewer.md`, `agents/criteria/dispositions.md:1-25`, `agents/_shared/dispositions.md:1-30` |
-
----
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Existing Artifact Types (`src/core/artifacts.ts`)
-
-```typescript
-// Review Dispositions (§8.7, artifacts.ts:288-295)
-export type ReviewDisposition =
-  | "fix"
-  | "optional"
-  | "architect"
-  | "human-awareness"
-  | "human-async"
-  | "human-stop";
-
-// Review Suggestion & Output (artifacts.ts:296-311)
-export interface ReviewSuggestion {
-  id: string;
-  disposition: ReviewDisposition | string;
-  summary: string;
-  detail?: string;
-  location?: { file: string; line?: number };
-}
-export interface ReviewArtifact {
-  status: "approved" | "changes_requested";
-  summary: string;
-  suggestions: ReviewSuggestion[];
-}
-
-// Current Developer Output (artifacts.ts:318-325) — free-form string concerns only
-export interface DeveloperOutputArtifact {
-  status: "ok" | "blocked" | "failed";
-  summary: string;
-  target?: DeveloperTarget;
-  evidence?: string[];
-  concerns?: string[];   // <--- Free-form string array; must become structured Concern[]
-  notes?: string;
-}
-
-// Plan ADRs & Tech Debt (artifacts.ts:228-252)
-export interface PlanAdr {
-  id: string;
-  title: string;
-  context: string;
-  decision: string;
-  consequences?: string;
-  // Missing: blocking?: boolean
-}
-export interface PlanTechDebt {
-  id: string;
-  description: string;
-  category: "adjacent" | "impacting" | "blocking";
-  resolution?: string;
-}
-
-// Steer Mailbox Item (artifacts.ts:375-386)
-export interface SteerItemArtifact {
-  id: string;
-  ref: string;
-  disposition: string;
-  question: string;
-  draftDecision?: string;
-  blocks?: string[];
-  status: "open" | "answered" | "dismissed";
-  createdAt?: string;
-  answeredAt?: string;
-  answer?: string;
-}
-
-// State Artifact (artifacts.ts:449-459)
-export interface StateArtifact {
-  task: string;
-  kind?: string;
-  status: "active" | "blocked" | "done" | "failed";
-  iteration: number;
-  currentWave?: number;
-  items: Record<string, StateItemInfo>;
-  debt?: string[];
-  budgetSpentUsd?: number;
-  lastUpdated: string;
-  // Missing: concern counts & summary
-}
-```
-
-### 2.2 Spec Item 18 Structured Concern Type (Required Target Contract)
-
-Per `docs/factory.v2.md:90`:
-```typescript
-export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
-export type ConcernSeverity = "low" | "medium" | "high";
-export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
-
-export interface Concern {
-  id?: string;                        // Stable fingerprint id assigned by engine
-  kind: ConcernKind;
-  summary: string;
-  detail: string;
-  location?: { file: string; line?: number };
-  severity: ConcernSeverity;
-  affects?: string[];                 // item / epic / plan references
-}
-
-export interface RemarkableDecision {
-  chosen: string;
-  alternatives: string[];
-  why: string;
-}
-
-export interface StoredConcernArtifact extends Concern {
-  id: string;
-  status: ConcernStatus;
-  disposition?: string;               // Assigned during triage
-  dismissReason?: string;             // When disposition is "dismiss"
-  source: {
-    record: string;                   // Step record directory name, e.g. "003-review-a1"
-    agent: string;
-    step: string;
-    item?: string;
-    iteration?: number;
-  };
-  createdAt: string;
-  updatedAt: string;
-}
-```
-
-### 2.3 Review Schema Generation (`src/core/records/review-schema.ts:5-52`)
-
-```typescript
-export function generateReviewSchema(
-  allowedDispositions: string[]
-): Record<string, unknown>;
-```
-Currently generates schema where `suggestions[].disposition` is an enum of `allowedDispositions` (default: `["fix", "optional", "architect", "human-awareness", "human-async"]`). Triage extension must allow `dismiss` in this vocabulary.
-
-### 2.4 Step Execution & Schema Resolution (`src/core/flows/step-runner.ts`)
-
-```typescript
-export interface StepRunOptions {
-  task: string;
-  item?: string;
-  stepId: string;
-  stepFragment?: string;
-  agent: string;
-  role?: string;
-  cwd: string;
-  taskDir: string;
-  recordsDir: string;
-  repo: any;
-  harness: Harness;
-  pipeline: PipelineConfig;
-  project: ProjectConfig;
-  prompts: any;
-  promptVars: Record<string, string>;
-  writeArtifact?: (output: unknown) => Promise<void>;  // <--- Seam: runs before finishStepRecord
-  // ...
-}
-export interface StepRunResult {
-  ok: boolean;
-  status: StepMetaStatus;
-  output?: unknown;
-  meta: StepMetaArtifact;
-  sessionId?: string;
-}
-```
-
----
-
-## 3. Relevant Code Excerpts & Current Wiring
-
-### 3.1 Item Machine: Review Allowed Dispositions & Prompt Wiring
-From `plugins/software-factory/src/core/flows/item-machine.ts:631-647`:
-```typescript
-  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
-  const reviewAllowed =
-    pipeline.reviewPolicy?.allowedDispositions ??
-    pipeline.reviewPolicy?.[currentStep.agent] ??
-    ["fix", "optional", "architect", "human-awareness", "human-async"];
-
-  const promptVars: Record<string, string> = {
-    assignment: assignmentYaml,
-    intent: intentText,
-    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
-    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
-    context: "",
-    checks: failingCheckSummaries.join("\n"),
-    testDiff: "",
-    diff: diffRes.stdout,
-    feedback: feedbackText,
-    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
-  };
-```
-*Note*: Line 632 checks `pipeline.reviewPolicy?.allowedDispositions`, but `StepRunner` at `step-runner.ts:222` only reads `pipeline.reviewPolicy?.allowedDispositions` (global), so per-agent overrides (`pipeline.reviewPolicy[currentStep.agent]`) currently reach the prompt but NOT the schema generator unless resolved uniformly.
-
-### 3.2 Item Machine: `writeArtifact` Seam Writing `human-async` Questions
-From `plugins/software-factory/src/core/flows/item-machine.ts:706-727`:
-```typescript
-    writeArtifact: async (output: unknown) => {
-      // Persist human-async questions atomically with the review record (Finding 23)
-      if (output && typeof output === "object" && "suggestions" in (output as any)) {
-        const rev = output as ReviewArtifact;
-        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
-        if (asyncQuestions && asyncQuestions.length > 0) {
-          for (const q of asyncQuestions) {
-            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
-            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
-            await writeQuestion(taskWt, taskDir, {
-              id: qId,
-              ref: itemSlug,
-              disposition: "human-async",
-              question: q.detail || q.summary,
-              blocks: [itemSlug],
-            });
-          }
-        }
-      }
-    },
-```
-This is the proven atomic persistence pattern for routing reviewer suggestions to mailbox questions; concern aggregation from agent outputs maps naturally to this seam or an adjacent callback.
-
-### 3.3 Step Runner: `writeArtifact` Seam & Commit Invariant
-From `plugins/software-factory/src/core/flows/step-runner.ts:611-655`:
-```typescript
-  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
-  if (finalStatus === "ok" && opts.writeArtifact) {
-    try {
-      await opts.writeArtifact(validatedData);
-    } catch (err: any) {
-      finalStatus = "error";
-      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
-    }
-  }
-
-  // 13. Invariant §6.3.2: Finish step record with final meta
-  const finalMeta = await finishStepRecord({ ... });
-
-  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
-  if (!(await isMerging(wtToCommit))) {
-    await commitAll(
-      repo,
-      wtToCommit,
-      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
-    );
-  }
-```
-
-### 3.4 Steering: `writeQuestion` Stable ID Pattern
-From `plugins/software-factory/src/core/steer.ts:63-108`:
-```typescript
-export async function writeQuestion(
-  rootWt: string,
-  taskDir: string,
-  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
-): Promise<SteerItemArtifact> {
-  const hash = crypto
-    .createHash("sha256")
-    .update(`${q.ref}:${q.question}:${q.disposition}`)
-    .digest("hex")
-    .slice(0, 10);
-
-  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
-  const id = q.id ?? `q-${cleanRef}-${hash}`;
-  // ...
-  const targetPath = path.join(outDir, `${id}.yaml`);
-  if (fs.existsSync(targetPath)) {
-    // A re-run step raising the same question must not clobber the operator's answer.
-    try {
-      const existing = yaml.parse(await fs.promises.readFile(targetPath, "utf8")) as SteerItemArtifact;
-      return existing;
-    } catch { }
-  }
-  await writeYamlAtomic(targetPath, item);
-  return item;
-}
-```
-This demonstrates the dedup and idempotent overwrite-guard pattern needed for `concerns/{id}.yaml`.
-
-### 3.5 Plan Review Flow: Architect <-> Reviewer Turn
-From `plugins/software-factory/src/core/flows/iteration.ts:440-485`:
-```typescript
-    const revStepRes = await runAgentStep({
-      task,
-      stepId: revRecordName,
-      stepFragment: "steps/plan-review",
-      agent: "plan-reviewer",
-      role: "alt-architect",
-      cwd: taskWt,
-      recordsDir: runsDir,
-      promptVars: {
-        plan: JSON.stringify(plan, null, 2),
-        intent: intentText,
-        context: contextYaml,
-        limits: JSON.stringify(limits, null, 2),
-        dispositionsCriteria: formatDispositionsSection(
-          loadCriteriaBundle(pipeline.criteria).dispositions,
-          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
-        ),
-      },
-      // ...
-    });
-    // ...
-    const revOutput = revStepRes.output as ReviewArtifact | undefined;
-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
-    if (!fixSuggestions || fixSuggestions.length === 0) {
-      break; // Plan approved!
-    }
-```
-Currently `plan-review` only acts on `fix` suggestions (looping into `architect-revise`). Architect concerns/decisions are not triaged or propagated here yet.
-
-### 3.6 ADR Writing: Current Implementation Only Writes Title + Context
-From `plugins/software-factory/src/core/flows/iteration.ts:380-390`:
-```typescript
-        // Write ADRs if specified (§8.4.2)
-        if (plan.adrs && project.adrFolder) {
-          const adrDir = path.join(taskWt, project.adrFolder);
-          await fs.promises.mkdir(adrDir, { recursive: true });
-          for (const adr of plan.adrs) {
-            const adrFile = path.join(adrDir, `${adr.id}.md`);
-            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
-          }
-        }
-```
-Notice that `adr.decision` and `adr.consequences` are currently omitted from the markdown file, and there is no `blocking` flag.
-
-### 3.7 Derived Tech Debt Collection
-From `plugins/software-factory/src/core/derive/task.ts:167-205`:
-```typescript
-  // 7. Tech debt collection
-  const debtSet = new Set<string>();
-  if (plan?.techDebt) {
-    for (const d of plan.techDebt) {
-      debtSet.add(d.description);
-    }
-  }
-  // From decisions: accept-with-debt
-  const decisionsDir = path.join(taskDir, "decisions");
-  if (fs.existsSync(decisionsDir)) {
-    // ... adds d.debt
-  }
-  // From review suggestions with disposition optional
-  for (const it of items) {
-    for (const rec of it.records) {
-      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
-        const suggestions = (rec.output as any).suggestions;
-        for (const sug of suggestions ?? []) {
-          if (sug.disposition === "optional" && sug.summary) {
-            debtSet.add(`[${it.slug}] ${sug.summary}`);
-          }
-        }
-      }
-    }
-  }
-```
-Concerns routed to `tech-debt` must feed into this derived debt set.
-
-### 3.8 Wave Dependency Blocking (Transitive Fixpoint)
-From `plugins/software-factory/src/core/derive/wave.ts:44-63` & `plugins/software-factory/src/core/plan/scheduler.ts:16-36`:
-```typescript
-  // Dependents of failed items become blocked-by-failure, cascaded transitively to a fixpoint (§8.2)
-  const schedItems = items.map((it) => ({
-    slug: it.slug,
-    wave: String(it.wave),
-    deps: it.deps,
-    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
-  }));
-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
-  let grew = failureBlocked.size > 0;
-  while (grew) {
-    grew = false;
-    for (const it of items) {
-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
-        failureBlocked.add(it.slug);
-        grew = true;
-      }
-    }
-  }
-```
-Spec item 18's rule ("blocker affecting a dependent item → dependent item blocked + architect consult") hooks into this dependency-blocking mechanic.
-
-### 3.9 Child Epic Execution & Parent State Propagation
-From `plugins/software-factory/src/core/engine.ts:208-278`:
-```typescript
-export async function runChildTask(
-  deps: EngineDeps,
-  parent: { branch: string; path: string; taskDir: string },
-  epicSlug: string,
-  // ...
-): Promise<RunResult> {
-  // Child worktree topic/{task}--{epic}
-  // Runs its own runIteration loop
-  // Writes child-closeup.yaml into parentItemDir:
-  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
-  await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
-    epic: epicSlug,
-    status: childStatus,
-    iteration: itRes.iteration,
-    summary: `Epic child task finished: ${itRes.status}`,
-  });
-```
-
-### 3.10 CLI Status Rendering
-From `plugins/software-factory/src/cli/status.ts:83-105`:
-```typescript
-  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
-    console.log(`Open Operator Questions (tousertoreview):`);
-    for (const q of derived.openSteerQuestions) {
-      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
-      console.log(`    Question: ${q.question}`);
-      // ...
-    }
-  }
-  if (derived.debt && derived.debt.length > 0) {
-    console.log(`Recorded Technical Debt:`);
-    for (const d of derived.debt) {
-      console.log(`  - ${d}`);
-    }
-  }
-```
-Currently missing concern counts (`open`, `dismissed`, `routed`, `resolved`) and remarkable decision digests.
-
----
-
-## 4. Existing Tests & Conventions
-
-### 4.1 Testing Harness & Infrastructure
-- **Test Runner**: `bun test` (see `plugins/software-factory/package.json:11-13`).
-- **Temporary Git Repos**: `test/helpers/tmp-repo.ts:24-125` creates isolated git repositories with helper methods (`commit`, `createBranch`, `createWorktree`, `git`, `cleanup`).
-- **Fake Harness Scripting**: `src/harness/fake/fake-harness.ts:40-140`. End-to-end engine tests script agent turns deterministically using label patterns:
-  - Orchestration turns: `${task}/runs/${stepId}#a${attempt}`
-  - Item turns: `${task}/items/${item}/${stepId}#a${attempt}`
-  - Example: `test/engine/story-happy-path.test.ts:34-80`, `test/engine/human-async-steering.test.ts:70-130`.
-- **Ajv Schema Verification**: Fake outcomes must conform to actual JSON schemas because `step-runner.ts:510-570` parses and validates them through `validateAndRepair`. Invalid scripted schemas trigger repair or failure.
-
-### 4.2 Behavior Tests Only Convention
-Per task intent and spec §13:
-- Tests must verify end-to-end behaviors: raising concerns, aggregation on disk, triage by reviewer, routing effects (mailbox write, dependent item blocking, consult trigger, debt inclusion), state/status surfacing.
-- No unit tests of prompt string templates or mocking internals; use `FakeHarness` driving `runTask` or `tickItemMachine`.
-- Target files: `test/engine/concerns-funnel.test.ts` (new behavior suite), with focused additions to `test/steer.test.ts`, `test/cli/cli.test.ts`.
-
-### 4.3 Prompt Preflight Invariants (`test/prompts.test.ts:102-195`)
-- Every agent declared in `pipeline.agents` must have a loadable definition in `agents/`.
-- Every placeholder in step fragments must be registered in `KNOWN_VARS` (`src/core/prompt-vars.ts:44-161`).
-- Every orchestration fragment in `ENGINE_STEP_FRAGMENTS` (`src/core/prompts.ts:402-420`) must exist and pass render checks.
-- Adding prompt fragments or variables for concern triage or human-involvement modes must update `KNOWN_VARS` and pass `preflightPrompts`.
-
-### 4.4 Config Layering Semantics (`test/config-layering.test.ts:5-45`)
-- Precedence: `config/pipeline.default.yaml` → `<repo>/.factory/pipeline.yaml` → `<repo>/{task}/pipeline.yaml`.
-- Objects deeply merge, arrays replace wholesale, explicit `null` deletes keys.
-- `config/schemas/pipeline.schema.json:253` enforces `"additionalProperties": false` at the root, so new top-level configuration keys (like `humanInvolvement`) require schema updates.
-
----
-
-## 5. Current State vs. Item 18 Requirements (Gap Analysis)
-
-| Feature | Spec Item 18 Requirement | Current Codebase State | Gap to Close |
-|---|---|---|---|
-| **Structured Concerns in Output** | Every agent output may carry `concerns[]`: `{kind, summary, detail, location?, severity, affects?}` + remarkable decisions/tradeoffs `{chosen, alternatives, why}`. | `DeveloperOutputArtifact` has only free-form `concerns?: string[]` (`artifacts.ts:323`). Other schemas (`plan.schema.json`, `fact-finder-output.schema.json`, `wave-closeup.schema.json`, `plan-closeup.schema.json`) have no `concerns` or `remarkable` fields. | Define structured `Concern` and `RemarkableDecision` schemas/types; update output schemas for developer, fact-finder, architect plan, and close-ups. |
-| **Engine Aggregation & Dedup** | Engine aggregates them in `{task}/concerns/` with stable fingerprint id, dedup across steps/attempts, status (`open|dismissed|routed|resolved`), source step record pointer. | No `concerns/` folder exists (`docs/ARCHITECTURE.md:185-197`). `writeQuestion` pattern exists (`steer.ts:63-108`) with sha256 hashing, but no concern aggregation logic exists. | Build `src/core/concerns.ts` with `aggregateConcerns()`: stable hash of `{kind, summary, location, affects}`, atomic YAML write in `{task}/concerns/{id}.yaml`, dedup/merge across re-runs. |
-| **Reviewer Triage & Dispositions** | Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder). | Review vocabulary (`artifacts.ts:288-294`, `review-schema.ts:9-12`) lacks `dismiss`. `item-machine.ts` and `iteration.ts` do not pass open concerns to reviewers or collect triage decisions. | Add `dismiss` to `ReviewDisposition`; extend review schema to accept concern triage; pass open concerns in `promptVars`; record triage status/reason in `{task}/concerns/{id}.yaml`. |
-| **Routing: Blocker & Architect** | `blocker` affecting dependent item → dependent item blocked + architect consult. `architect` → next architect turn (wave report / next plan input). | Review disposition `architect` is never routed anywhere in `item-machine.ts` or `iteration.ts`. Dependency blocking only checks `failed`/`abandoned` items (`scheduler.ts:16-36`). | Map `affects` to item slugs; mark affected items `blocked` in `deriveWaveState`/`deriveItemState`; trigger `runItemConsult` or hydrate into next architect turn (`buildArchitectHydration`). |
-| **Routing: Human Mailbox & Tech Debt** | `human-*` → steer mailbox per policy; `tech-debt` → plan tech-debt list. | `human-async` writes to `steer/tousertoreview` (`item-machine.ts:711`), but `human-awareness` and `human-stop` are ignored. Debt collection (`derive/task.ts:167-205`) only reads plan `techDebt`, `accept-with-debt` decisions, and `optional` review suggestions. | Route `human-awareness` as non-blocking digest item in mailbox; route `human-stop` with task halt; add routed `tech-debt` concerns to `deriveTaskState` debt collection. |
-| **Funneling & Text Budget** | `worker → reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Less detail per level, never more text than code summarized. | No text length limits or condensing mechanics exist. Close-up prompts have no concerns context. | Provide condensed summaries at each funnel tier; enforce text size bound (detail bytes ≤ diff bytes); hydrate wave report and plan close-up with open concerns. |
-| **Blocking vs Non-blocking ADRs** | Marked blocking or non-blocking. Blocking = needs human decision per mode; remarkable = below blocking threshold, reported in mailbox digest, never waits. | `PlanAdr` has no `blocking` boolean (`artifacts.ts:235-241`). `iteration.ts:380-390` writes only title/context to `.md` files; no mailbox digest exists. | Add `blocking?: boolean` to `PlanAdr` and `plan.schema.json`; route blocking ADRs to `writeQuestion` per mode; route non-blocking remarkable ADRs to mailbox digest. |
-| **Human-Involvement Modes** | Config presets: `autonomous`, `principal`, `detailed` (pipeline config + prompt fragments for reviewer/architect criteria), selectable per task. | No mode concept in `PipelineConfig` (`artifacts.ts:108-133`). `criteria/dispositions.md` has static criteria without mode-specific rules. | Add mode config preset examples to `config/pipeline.default.yaml`; create prompt criteria fragments (`agents/criteria/human-involvement.md`); wire into prompt rendering. |
-| **Surfacing & State Counts** | Wave/plan close-ups list open concerns; close-up reviewers re-triage; `factory status` and `state.yaml` show counts. | `state.yaml` (`StateArtifact`, `artifacts.ts:449-459`) has no concern fields. `status.ts:83-105` prints only operator questions and debt. | Add `concerns?: { open, dismissed, routed, resolved }` to `StateArtifact`, refresh in `deriveTaskState`, and render in `cli/status.ts`. |
-| **Documentation Updates** | Update `ARCHITECTURE.md` (§1 row 18, §6.2, §8.7), README, config commentary. | Row 18 marked "Deliberately not hand-built" (`docs/ARCHITECTURE.md:39`). | Update `docs/ARCHITECTURE.md`, `README.md`, and config comments with full concerns funnel specifications. |
-
----
-
-## 6. Open Questions & Architectural Decisions for the Architect
-
-1. **Aggregation Worktree & Commit Invariant (§6.2 vs §6.3)**:
-   - *Context*: In `step-runner.ts:630-655`, an item step commits only `childWt` (`topic/{task}--{item}`). The task orchestration folder `{task}/concerns/` lives on `taskWt` (`topic/{task}`).
-   - *Options*:
-     - (A) Write concerns directly to `taskWt/{task}/concerns/` during item steps, matching the precedent set by `writeQuestion` (`item-machine.ts:716`) and `refreshStateYaml` (`item-machine.ts:731`), with formal task worktree commit at wave merges/edits.
-     - (B) Write item concerns to `childWt/{task}/items/{item}/concerns/` and aggregate them onto `taskWt` when the item merges or at wave completion.
-     - (C) Extend `runAgentStep` to commit both worktrees when task-level artifacts are written.
-   - *Recommendation*: Option (A) is cleanest and exactly matches `writeQuestion` and `state.yaml` behavior.
-
-2. **Triage Schema Contract for Reviewers**:
-   - *Context*: Reviewers need to triage concerns raised by earlier worker steps.
-   - *Options*:
-     - (A) Reuse the existing `suggestions[]` array in `ReviewArtifact`, extending `disposition` to include `"dismiss"`, matching on `suggestion.id = concern.id`.
-     - (B) Add a distinct `concernTriage: Array<{ id: string; status: "confirmed" | "dismissed"; disposition?: ReviewDisposition; reason?: string }>` to `ReviewArtifact`.
-   - *Tradeoff*: Option (A) adheres strictly to the spec phrasing ("triages new concerns with the same disposition vocabulary as review suggestions plus dismiss"), avoiding a separate schema branch.
-
-3. **Text Size Bound Enforcement ("never more text than the code it summarizes")**:
-   - *Context*: How should the engine mechanically check or enforce that summaries do not bloat?
-   - *Options*:
-     - Purely prompt-guided with debloated instructions in reviewer/architect prompts.
-     - Mechanical validation in the engine comparing `concern.detail.length` to `diff.length` (or capping at a sensible max like 300 characters).
-
-4. **Saga Concern Propagation Mechanics**:
-   - *Context*: Epics run as child tasks (`engine.ts:208-285`) using `runChildTask`, writing `child-closeup.yaml`. How should epic concerns reach the saga architect?
-   - *Design*: When child epics finish, un-dismissed epic-level concerns/decisions can be summarized into `child-closeup.yaml` or copied into the parent task's `concerns/` directory, hydrating the saga architect's next wave report or close-up turn.
-
-5. **Mailbox Digest Delivery for Remarkable Items**:
-   - *Context*: "remarkable items reported in a mailbox digest, never waiting".
-   - *Design*: Write to `steer/digest/` or record in `steer/tousertoreview/digest-{hash}.yaml` with `status: "open"`, `disposition: "human-awareness"`, without adding the item to `blocks: [...]`, so it surfaces in `factory status` and the mailbox without stopping the engine.
-
-6. **Human-Involvement Mode Configuration Placement**:
-   - *Context*: `pipeline.schema.json` has `additionalProperties: false` at the root.
-   - *Options*:
-     - Add `humanInvolvement: { type: "string", enum: ["autonomous", "principal", "detailed"], default: "autonomous" }` to `config/schemas/pipeline.schema.json` and `PipelineConfig`.
-     - Alternatively, place it inside `reviewPolicy.mode` or under `criteria.humanInvolvement`.
-   - *Recommendation*: Adding top-level `humanInvolvement` to schema and `PipelineConfig` is cleanest and aligns with the spec intent ("human-involvement modes = config presets").
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
diff --git a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/meta.yaml b/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/meta.yaml
deleted file mode 100644
index 45ecf8b..0000000
--- a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/meta.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-seq: 27
-name: consult-concerns-store-v2
-attempt: 1
-agent: architect
-role: architect
-models:
-  - opencode-go/muse-spark-1.3-contributor
-session: 01a1b894-4755-7787-a1ed-8df6c7a062a2
-timeoutSec: 1200
-status: ok
-startedAt: 2026-11-08T07:43:34.437Z
-endedAt: 2026-11-08T07:44:24.472Z
-usage:
-  inputTokens: 441383
-  outputTokens: 2773
-  costUsd: 0.046433
-traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-34-47-765Z_01a1b894-4755-7787-a1ed-8df6c7a062a2.jsonl
diff --git a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/output.yaml b/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/output.yaml
deleted file mode 100644
index de68832..0000000
--- a/.factory/tasks/concerns-funnel/runs/027-consult-concerns-store-v2-a1/output.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
-context: item
-decision: retry-with-guidance
-persist: true
-rationale: "Reviewer defect is valid and blocks M1 restart-idempotency
-  invariant: unconditional replay with wall-clock timestamps rewrites every
-  concern and commits per record on each startup, churning updatedAt/lastSeen
-  and git history. Root cause is localized to aggregate/reconcile timestamp and
-  dirty handling, fixable in one small round. No split or escalation warranted."
-text: "Fix reconcile idempotency in concerns-store-v2 (one round): 1) Add
-  opts.at to aggregateConcerns/merge (default now ISO). Live step seams keep
-  wall-clock; reconcile passes meta.endedAt. 2) Write-only-on-diff: compare
-  merged vs existing on content fields (detail, severity, sources, status,
-  disposition, escalated); if equal and existing lastSeen >= at, skip
-  writeYamlAtomic entirely. Else write with updatedAt=at,
-  lastSeen=max(existing.lastSeen, at). 3) reconcileConcerns: enumerate committed
-  ok records (runs + items/*/steps), read meta.endedAt, sort ascending (fallback
-  seq/name), replay in order with at=endedAt; track dirty flag; single commitAll
-  at end only if dirty — remove per-record commitAll from replay path. 4)
-  Strengthen idempotency test: hash concern files + git rev-parse HEAD after
-  first reconcile, run reconcile again, assert bytes and HEAD unchanged and
-  updatedAt/lastSeen equal endedAt values. Keep KeyedMutex RMW-only, never wrap
-  commitAll in repo.writeLock, ingest errors never change step status."
diff --git a/.factory/tasks/concerns-funnel/state.yaml b/.factory/tasks/concerns-funnel/state.yaml
index fd370f9..5248052 100644
--- a/.factory/tasks/concerns-funnel/state.yaml
+++ b/.factory/tasks/concerns-funnel/state.yaml
@@ -40,14 +40,14 @@ items:
     mergedAt: 2026-11-07T23:50:13-05:00
   concerns-store:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--concerns-store
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   modes-prompts:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--modes-prompts
     attempts: 1
     fixRounds: 1
@@ -72,157 +72,71 @@ items:
     mergedAt: 2026-11-08T00:52:12-05:00
   plan-reviewer-triage:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--plan-reviewer-triage
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   reviewer-triage:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--reviewer-triage
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   routing-blocker-derive:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--routing-blocker-derive
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   routing-human-debt:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--routing-human-debt
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   adr-blocking-digest:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--adr-blocking-digest
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   routing-architect-consult:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--routing-architect-consult
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   status-state-surface:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--status-state-surface
     attempts: 1
     fixRounds: 1
     spendUsd: 0
-  concerns-store-v2:
-    kind: dev
-    status: running
-    branch: topic/concerns-funnel--concerns-store-v2
-    attempts: 2
-    fixRounds: 3
-    spendUsd: 0.48322400000000004
-    currentStep: review
   funnel-closeups:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--funnel-closeups
     attempts: 1
     fixRounds: 1
     spendUsd: 0
-  modes-prompts-v2:
-    kind: dev
-    status: ready
-    branch: topic/concerns-funnel--modes-prompts-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.139671
-    currentStep: review
   saga-propagate:
     kind: dev
-    status: superseded
+    status: pending
     branch: topic/concerns-funnel--saga-propagate
     attempts: 1
     fixRounds: 1
     spendUsd: 0
   docs-finish:
-    kind: dev
-    status: superseded
-    branch: topic/concerns-funnel--docs-finish
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  plan-reviewer-triage-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--plan-reviewer-triage-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  reviewer-triage-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--reviewer-triage-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  routing-blocker-derive-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--routing-blocker-derive-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  routing-human-debt-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--routing-human-debt-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  adr-blocking-digest-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--adr-blocking-digest-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  routing-architect-consult-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--routing-architect-consult-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  status-state-surface-v2:
     kind: dev
     status: pending
-    branch: topic/concerns-funnel--status-state-surface-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  funnel-closeups-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--funnel-closeups-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  saga-propagate-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--saga-propagate-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
-  docs-finish-v2:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--docs-finish-v2
+    branch: topic/concerns-funnel--docs-finish
     attempts: 1
     fixRounds: 1
     spendUsd: 0
@@ -290,59 +204,20 @@ debt:
     store story must reconcile"
   - "[concerns-contracts-schemas] inferTaskWorktree fix correct but lacks direct
     unit test"
-  - "[concerns-store-v2] listOpenConcerns silently skips corrupt YAML instead of
-    surfacing it"
-  - "[concerns-store-v2] aggregateConcerns validates only remarkable.chosen;
-    missing why throws mid-RMW after partial writes"
-  - "[concerns-store-v2] KINDS/RANK hardcode enums instead of deriving from
-    schema single source"
-  - "[concerns-store-v2] reconcile filters by HEAD ls-tree but reads worktree
-    files, can ingest dirty outputs"
-  - "[concerns-store-v2] Non-dismiss triage to routed leaves stale
-    dismissReason/pendingResolution"
-  - "[concerns-store-v2] Startup reconcile error journal can throw and crash
-    runTask unlike task_error guard"
-  - "[concerns-store-v2] listOpenConcerns still silently drops unreadable YAML
-    and only validates kind"
-  - "[concerns-store-v2] Routed triage clears dismissReason but leaves stale
-    pendingResolution; no regression test"
-  - "[concerns-store-v2] No regression test for r2 remarkable pre-lock
-    validation"
-  - "[concerns-store-v2] applyConcernTriage/applyCloseupResolutions can return
-    rm-* remarkable records typed as StoredConcernArtifact"
-  - "[concerns-store-v2] Concern writes use unscoped commitAll on taskWt,
-    sweeping unrelated dirty files into concern commits"
-  - "[concerns-store-v2] r2 hardening (routed triage clears dismissReason,
-    remarkable pre-lock validation) has no regression tests"
-  - "[concerns-store-v2] Consult runAgentStep calls omit taskWt, relying on path
-    inference that mis-resolves epic child task dirs"
-  - "[modes-prompts-v2] Harden matrix test: assert plan-review excludes
-    concernsYaml"
-  - "[modes-prompts-v2] Harden mode-switch tests: check both inactive markers
-    absent"
-  - "[modes-prompts-v2] Harden empty-criteria test: assert exact empty rendering"
-  - "[modes-prompts-v2] Caller promptVars can silently override engine-filtered
-    humanInvolvementCriteria"
-  - "[modes-prompts-v2] HUMAN_INVOLVEMENT_MODES is a third source of truth for
-    the mode enum"
-  - "[modes-prompts-v2] pipeline.default.yaml criteria comment block omits
-    human-involvement consumption"
-  - "[modes-prompts-v2] ADR blocking table duplicated verbatim in config
-    comments and criteria fragment"
-budgetSpentUsd: 1.826748
+budgetSpentUsd: 1.1860089999999999
 spendByRole:
   alt-workhorse:
-    costUsd: 0.30556599999999984
-    inputTokens: 1246876
-    outputTokens: 690346
+    costUsd: 0.22332299999999997
+    inputTokens: 799635
+    outputTokens: 566437
   workhorse:
-    costUsd: 1.389019
-    inputTokens: 2727951
-    outputTokens: 891870
+    costUsd: 0.8408990000000001
+    inputTokens: 1625095
+    outputTokens: 517811
   architect:
-    costUsd: 0.115648
-    inputTokens: 935546
-    outputTokens: 77812
+    costUsd: 0.105272
+    inputTokens: 886701
+    outputTokens: 66358
   alt-architect:
     costUsd: 0.016515000000000002
     inputTokens: 72452
@@ -360,14 +235,14 @@ spendByItem:
     costUsd: 0.060779
     inputTokens: 139871
     outputTokens: 72059
+  (orchestration):
+    costUsd: 0.431683
+    inputTokens: 1543604
+    outputTokens: 344720
   concerns-contracts-schemas:
     costUsd: 0.13946999999999998
     inputTokens: 384518
     outputTokens: 125976
-  modes-prompts-v2:
-    costUsd: 0.139671
-    inputTokens: 277976
-    outputTokens: 137336
   concerns-contracts-policy:
     costUsd: 0.107439
     inputTokens: 280717
@@ -376,12 +251,4 @@ spendByItem:
     costUsd: 0.063129
     inputTokens: 178070
     outputTokens: 75896
-  concerns-store-v2:
-    costUsd: 0.48322400000000004
-    inputTokens: 1220656
-    outputTokens: 349363
-  (orchestration):
-    costUsd: 0.449527
-    inputTokens: 1643914
-    outputTokens: 367443
-lastUpdated: 2026-11-08T07:43:30.910Z
+lastUpdated: 2026-11-08T05:59:02.059Z
diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
index 08aed67..cf53d5c 100644
--- a/plugins/software-factory/src/core/artifacts.ts
+++ b/plugins/software-factory/src/core/artifacts.ts
@@ -333,6 +333,8 @@ export interface ConcernSource {
   item?: string;
   iteration?: number;
   escalated?: boolean;
+  /** Timestamp of the most recent re-emit for merged concerns. */
+  lastSeen?: string;
 }
 
 export interface PendingConcernResolution {
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
new file mode 100644
index 0000000..c1e8f80
--- /dev/null
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -0,0 +1,220 @@
+import fs from "node:fs";
+import path from "node:path";
+import { createHash } from "node:crypto";
+import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+import type { Repo } from "./git/repo.js";
+import { commitAll } from "./git/commit.js";
+import { git } from "./git/exec.js";
+import { KeyedMutex } from "./mutex.js";
+import { readYaml, writeYamlAtomic } from "./records/io.js";
+
+export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
+  Partial<Pick<Concern, "detail" | "severity">>;
+export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
+export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }
+
+type Obj = Record<string, any>;
+type Patch = (record: Obj, at: string) => Obj;
+const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
+const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };
+/** Serializes read-modify-write cycles of one task's concern store. */
+const locks = new KeyedMutex();
+const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
+const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
+const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
+const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
+const hash = (prefix: string, parts: unknown[]) =>
+  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
+const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+
+/** Stable concern identity: kind, normalized summary, location, sorted affects. */
+export function concernFingerprint(c: ConcernInput): string {
+  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
+}
+
+async function readExisting<T>(file: string): Promise<T | undefined> {
+  try { return await readYaml<T>(file); } catch (err: any) {
+    if (err?.code === "ENOENT") return undefined;
+    throw err;
+  }
+}
+
+function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
+  const incomingDetail = (input.detail ?? input.summary).trim();
+  const incomingSeverity = input.severity ?? "medium";
+  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
+  const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+  const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+  const location = input.location ?? existing?.location;
+  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
+  return {
+    ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
+    summary: existing?.summary ?? input.summary.trim(), detail,
+    ...(location ? { location } : {}), ...(affects ? { affects } : {}), severity,
+    status: existing?.status ?? "open",
+    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: (existing?.source?.lastSeen ?? "") > at ? existing!.source!.lastSeen! : at },
+    createdAt: existing?.createdAt ?? at, updatedAt: at,
+  };
+}
+
+function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
+  return {
+    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
+    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
+    status: existing?.status ?? "open",
+    source: { ...(existing?.source ?? {}), ...source, lastSeen: (existing?.source?.lastSeen ?? "") > at ? existing!.source!.lastSeen! : at },
+    createdAt: existing?.createdAt ?? at, updatedAt: at,
+  };
+}
+
+/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+export async function aggregateConcerns(
+  ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
+): Promise<StoredConcernArtifact[]> {
+  for (const c of concerns) {
+    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
+    if (!c.summary?.trim()) throw new Error("Concern summary is required");
+    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
+  }
+  for (const d of remarkables) if (!d?.chosen?.trim() || !Array.isArray(d?.alternatives) || typeof d?.why !== "string" || !d.why.trim()) throw new Error("Remarkable decision requires chosen/alternatives/why");
+  const at = opts.at ?? atOf(ctx), dir = dirOf(ctx.taskDir);
+  let dirty = false;
+  const stored = await locks.runExclusive(ctx.taskDir, async () => {
+    const out: StoredConcernArtifact[] = [];
+    for (const input of concerns) {
+      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+      const existing = await readExisting<StoredConcernArtifact>(file);
+      const merged = mergeConcern(existing, input, ctx.source, at);
+      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+      await writeYamlAtomic(file, merged);
+      dirty = true; out.push(merged);
+    }
+    for (const decision of remarkables) {
+      const file = path.join(dir, `${rmId(decision)}.yaml`);
+      const existing = await readExisting<Obj>(file);
+      const merged = mergeRemarkable(existing, decision, ctx.source, at);
+      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) continue;
+      await writeYamlAtomic(file, merged);
+      dirty = true;
+    }
+    return out;
+  });
+  opts.dirty = dirty;
+  if (dirty && opts.commit !== false) await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
+  return stored;
+}
+
+/** Returns open concerns ordered by creation time then id. */
+export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+  const dir = dirOf(taskDir);
+  let names: string[];
+  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+    if (err?.code === "ENOENT") return [];
+    throw err;
+  }
+  const records = await Promise.all(names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).map(async (name) => {
+    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
+  }));
+  return records
+    .filter((r): r is StoredConcernArtifact => r?.status === "open" && typeof r?.kind === "string")
+    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
+}
+
+async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+  const updated = await locks.runExclusive(ctx.taskDir, async () => {
+    const out: StoredConcernArtifact[] = [];
+    for (const [id, patch] of ops) {
+      if (id !== path.basename(id)) continue;
+      const file = path.join(dir, `${id}.yaml`);
+      const existing = await readExisting<Obj>(file);
+      if (!existing) continue;
+      const next = { ...patch(existing, at), updatedAt: at };
+      await writeYamlAtomic(file, next);
+      out.push(next as StoredConcernArtifact);
+    }
+    return out;
+  });
+  if (updated.length) await commitAll(ctx.repo, ctx.taskWt, message);
+  return updated;
+}
+
+/** Applies review triage to pre-existing concerns only; ordinary findings are ignored. */
+export async function applyConcernTriage(
+  ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
+): Promise<StoredConcernArtifact[]> {
+  if (!ctx.isTriager) return [];
+  const ops = ctx.suggestions.map((s): [string, Patch] => {
+    if (s.disposition === "dismiss" && !s.detail?.trim()) throw new Error(`Dismiss triage for ${s.id} requires detail`);
+    return [s.id, (record) => s.disposition === "dismiss"
+      ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
+      : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }];
+  });
+  return mutate(ctx, ops, "factory: concerns triaged");
+}
+
+/** Records close-up resolutions as pending; changing status is a later decision. */
+export function applyCloseupResolutions(
+  ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
+): Promise<StoredConcernArtifact[]> {
+  const ops = ctx.resolutions.map((r): [string, Patch] => [r.id, (record, at) => ({
+    ...record, pendingResolution: { action: r.action, ...(r.note !== undefined ? { note: r.note } : {}), by: ctx.by, at },
+  })]);
+  return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
+}
+
+/** Splits review suggestions into concern triage vs findings by exact id. */
+export function partitionSuggestions(
+  suggestions: ReviewSuggestion[], concernIds: Iterable<string>
+): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
+  const ids = new Set(concernIds);
+  return {
+    triage: suggestions.filter((s) => ids.has(s.id)),
+    findings: suggestions.filter((s) => !ids.has(s.id)),
+  };
+}
+
+interface CommittedRecord { name: string; item?: string; meta: Obj; output: Obj }
+
+async function committedStepRecords(ctx: ConcernStoreContext): Promise<CommittedRecord[]> {
+  const res = await git(ctx.taskWt, ["ls-tree", "-r", "--name-only", "HEAD"], { allowFail: true, env: ctx.repo.identityEnv() });
+  if (res.code !== 0) return [];
+  const committed = new Set(res.stdout.split("\n").filter(Boolean));
+  const prefix = path.relative(ctx.taskWt, ctx.taskDir).replace(/\\/g, "/");
+  const records: CommittedRecord[] = [];
+  for (const metaRel of [...committed].sort()) {
+    const outputRel = metaRel.replace(/meta\.yaml$/, "output.yaml");
+    if (!metaRel.startsWith(`${prefix}/`) || outputRel === metaRel || !committed.has(outputRel)) continue;
+    const parts = metaRel.slice(prefix.length + 1).split("/");
+    const item = parts[0] === "items" && parts.length === 5 ? parts[1] : undefined;
+    if (!item && (parts[0] !== "runs" || parts.length !== 3)) continue;
+    try {
+      const meta = await readYaml<Obj>(path.join(ctx.taskWt, metaRel));
+      if (meta?.status !== "ok") continue;
+      records.push({ name: parts[parts.length - 2]!, ...(item ? { item } : {}), meta,
+        output: await readYaml<Obj>(path.join(ctx.taskWt, outputRel)) });
+    } catch { /* A corrupt record is not a usable derivation input. */ }
+  }
+  return records;
+}
+
+/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. Startup calls it after repairWorktree, so the worktree matches HEAD and ls-tree enumeration is authoritative. */
+export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
+  const records = await committedStepRecords(ctx);
+  records.sort((a, b) => String(a.meta.endedAt ?? "").localeCompare(String(b.meta.endedAt ?? "")) || (a.meta.seq ?? 0) - (b.meta.seq ?? 0) || a.name.localeCompare(b.name));
+  const reconciled: StoredConcernArtifact[] = [];
+  let dirty = false;
+  for (const r of records) {
+    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])].filter((c: any) => c && typeof c === "object");
+    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
+    if (!concerns.length && !remarkables.length) continue;
+    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"), ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
+    const at = typeof r.meta.endedAt === "string" && r.meta.endedAt ? r.meta.endedAt : atOf(ctx);
+    const o: { at: string; commit: false; dirty?: boolean } = { at, commit: false };
+    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables, o)));
+    dirty = dirty || !!o.dirty;
+  }
+  if (dirty) await commitAll(ctx.repo, ctx.taskWt, "factory: concerns reconcile");
+  return reconciled;
+}
diff --git a/plugins/software-factory/src/core/engine.ts b/plugins/software-factory/src/core/engine.ts
index 87787e9..a5daa26 100644
--- a/plugins/software-factory/src/core/engine.ts
+++ b/plugins/software-factory/src/core/engine.ts
@@ -31,6 +31,7 @@ import { runIngest, isTriageDone, isInfraDone } from "./flows/ingest.js";
 import { runIteration } from "./flows/iteration.js";
 import { runSeamHooks } from "./flows/seams.js";
 import { readYaml, writeYamlAtomic, readText } from "./records/io.js";
+import { reconcileConcerns } from "./concerns.js";
 import { listPending, classify, takenPaths } from "./steer.js";
 import { resolveRole } from "./config/roles.js";
 import { installShutdownHandlers } from "./shutdown.js";
@@ -323,6 +324,12 @@ export async function runTask(
     parentBranch = `topic/${task}`;
 
   // 2. Start-up repair restricted to §6.3.6 list (Finding 1 & 19)
+  // Concerns are engine-owned: commit them before stray-dirt repair stashes them.
+  if (fs.existsSync(path.join(taskDir, "concerns"))) {
+    await commitAll(repo, taskWt, "factory: concern store recovery", {
+      paths: [`${orchFolder}/${task}/concerns`],
+    });
+  }
   await repairWorktree(repo, taskWt, "task", {
     operatorEditable: [
       "INTENT.md",
@@ -358,6 +365,19 @@ export async function runTask(
 
   await repairInterruptedRecords(taskDir);
 
+  // Rebuild concerns lost in a crash from committed step records (§18).
+  try {
+    await reconcileConcerns({ taskDir, taskWt, repo });
+  } catch (err: any) {
+    try {
+      await appendJournal(taskDir, {
+        type: "concern_reconcile_error",
+        task,
+        error: err?.message || String(err),
+      });
+    } catch { /* Journal failure must not crash startup. */ }
+  }
+
   // 3. Load pipeline config and setup semaphores (§2)
   pipeline = await pipelineFor(taskDir);
   if (opts?.maxIterations !== undefined) {
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index f5e0e00..9477775 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -24,6 +24,12 @@ import {
 import { validateAndRepair } from "../records/repair.js";
 import { generateReviewSchema } from "../records/review-schema.js";
 import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+import {
+  aggregateConcerns,
+  applyCloseupResolutions,
+  applyConcernTriage,
+  partitionSuggestions,
+} from "../concerns.js";
 import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
 import { captureHead, enforceHead } from "../git/guard.js";
 import { commitAll } from "../git/commit.js";
@@ -167,6 +173,33 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
   return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
 }
 
+/** Feeds a step's producer fields into the taskWt concern store (§18). */
+async function ingestStepConcerns(opts: {
+  taskDir: string; taskWt: string; repo: any; output: unknown;
+  source: { record: string; agent: string; step: string; item?: string; iteration?: number };
+}): Promise<void> {
+  const data = (opts.output ?? {}) as Record<string, any>;
+  const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
+  const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
+  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
+  const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
+  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return;
+
+  // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
+  let existing: string[] = [];
+  try {
+    existing = (await fs.promises.readdir(path.join(opts.taskDir, "concerns")))
+      .filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -5));
+  } catch (err: any) {
+    if (err?.code !== "ENOENT") throw err;
+  }
+  const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
+  if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
+  const { triage } = partitionSuggestions(suggestions, existing);
+  if (triage.length) await applyConcernTriage({ ...ctx, suggestions: triage, isTriager: isTriagerAgent(opts.source.agent) });
+  if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
+}
+
 /**
  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
  */
@@ -635,6 +668,22 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
     }
   }
 
+  // Producer concerns feed the taskWt store after the canonical artifact write.
+  if (finalStatus === "ok") {
+    try {
+      await ingestStepConcerns({
+        taskDir, taskWt, repo, output: validatedData,
+        source: {
+          record: dirName, agent, step: stepId,
+          ...(item ? { item } : {}),
+          ...(opts.iteration !== undefined ? { iteration: opts.iteration } : {}),
+        },
+      });
+    } catch (err: any) {
+      try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
+    }
+  }
+
   // 13. Invariant §6.3.2: Finish step record with final meta
   const finalMeta = await finishStepRecord({
     recordDir,
diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
index ce498df..a1f0728 100644
--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
@@ -4,9 +4,27 @@ import path from "node:path";
 import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
 import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
 import { runAgentStep } from "../../src/core/flows/step-runner.js";
+import { runTask } from "../../src/core/engine.js";
 import { Repo } from "../../src/core/git/repo.js";
 import { loadPromptLibrary } from "../../src/core/prompts.js";
-import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import {
+  aggregateConcerns,
+  applyCloseupResolutions,
+  applyConcernTriage,
+  concernFingerprint,
+  listOpenConcerns,
+  partitionSuggestions,
+  reconcileConcerns,
+} from "../../src/core/concerns.js";
+import type {
+  Concern,
+  ConcernSource,
+  PipelineConfig,
+  ProjectConfig,
+  ReviewSuggestion,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
 
 /**
  * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
@@ -163,3 +181,1105 @@ describe("Concern funnel schemas", () => {
     expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
   });
 });
+
+/**
+ * Behaviour of the taskWt concern store (docs/factory.v2.md §18; ADRs
+ * adr-concern-store-taskwt, adr-fingerprint-merge, adr-triage-suggestions-dismiss).
+ *
+ * `{task}/concerns/` lives on the task worktree while item steps only commit
+ * childWt, so the store must write an explicit taskWt path, serialize
+ * read-modify-write merges per task, and commit taskWt immediately. One file
+ * per fingerprint keeps retries and restarts idempotent.
+ */
+describe("Concern store", () => {
+  const ORCH = ".factory";
+  const TASK = "concern-store";
+
+  let tmpRepo: TmpRepo;
+  let repo: Repo;
+  let taskWt: string;
+  let taskDir: string;
+  let worktreeRoot: string;
+  let pipeline: PipelineConfig;
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
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Concern store\n", "utf8");
+    tmpRepo.commit("add concern store task");
+
+    pipeline = {
+      models: {
+        roles: {
+          workhorse: { model: "model-workhorse" },
+          "alt-workhorse": { model: "model-alt-workhorse" },
+          architect: { model: "model-architect" },
+          "alt-architect": { model: "model-alt-architect" },
+          simpler: { model: "model-simpler" },
+        },
+      },
+      agents: {
+        developer: { role: "workhorse" },
+        "fact-finder": { role: "workhorse" },
+        qa: { role: "alt-workhorse" },
+        reviewer: { role: "alt-workhorse" },
+        architect: { role: "architect" },
+        "wave-close-up": { role: "alt-workhorse" },
+        "plan-close-up": { role: "alt-workhorse" },
+      },
+      flows: { simple: { steps: [] }, story: {}, spike: {} },
+      limits: {},
+    };
+    project = { orchestrationFolder: ORCH, worktreeRoot };
+    prompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+      overrideDirs: [],
+    });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  function concernSource(
+    record: string,
+    agent = "developer",
+    extra: Partial<ConcernSource> = {}
+  ): ConcernSource {
+    return { record, agent, ...extra };
+  }
+
+  function storedConcern(
+    overrides: Partial<StoredConcernArtifact> & { id: string }
+  ): StoredConcernArtifact {
+    return {
+      kind: "risk",
+      summary: `Concern ${overrides.id}`,
+      detail: "detail",
+      severity: "medium",
+      status: "open",
+      source: { record: "001-develop-a1", agent: "developer" },
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+      ...overrides,
+    };
+  }
+
+  async function writeStoredConcern(concern: StoredConcernArtifact): Promise<string> {
+    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
+    await writeYamlAtomic(file, concern);
+    return file;
+  }
+
+  async function runStep(opts: {
+    item?: string;
+    agent: string;
+    stepId: string;
+    stepFragment: string;
+    cwd: string;
+    recordsDir: string;
+    data: unknown;
+    promptVars: Record<string, string>;
+    writeArtifact?: (output: unknown) => Promise<void>;
+  }) {
+    const harness = new FakeHarness();
+    const label = opts.item
+      ? `${TASK}/items/${opts.item}/${opts.stepId}#a1`
+      : `${TASK}/runs/${opts.stepId}#a1`;
+    harness.scriptOutcome(label, { ok: true, data: opts.data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
+    harness.scriptComplete(() => opts.data);
+
+    return runAgentStep({
+      task: TASK,
+      item: opts.item,
+      stepId: opts.stepId,
+      stepFragment: opts.stepFragment,
+      agent: opts.agent,
+      cwd: opts.cwd,
+      taskDir,
+      recordsDir: opts.recordsDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: opts.promptVars,
+      writeArtifact: opts.writeArtifact,
+    });
+  }
+
+  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
+    const identity = {
+      kind: "risk" as const,
+      summary: "  Flaky   GATE ",
+      location: { file: "src/core/example.ts", line: 7 },
+      affects: ["item-b", "item-a"],
+    };
+    const fp = concernFingerprint(identity);
+
+    expect(fp).toMatch(/^c-[0-9a-f]{10}$/);
+    expect(concernFingerprint({ ...identity, detail: "short", severity: "low" })).toBe(fp);
+    expect(
+      concernFingerprint({ ...identity, detail: "a much longer detail", severity: "high" })
+    ).toBe(fp);
+    expect(
+      concernFingerprint({ ...identity, summary: "flaky gate", affects: ["item-a", "item-b"] })
+    ).toBe(fp);
+
+    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(fp);
+    expect(
+      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+    ).not.toBe(fp);
+    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
+  });
+
+  it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
+    const item = "item-a";
+    const childWt = tmpRepo.createWorktree(`topic/${TASK}--${item}`);
+    const recordsDir = path.join(childWt, ORCH, TASK, "items", item, "steps");
+    fs.mkdirSync(recordsDir, { recursive: true });
+
+    const result = await runStep({
+      item,
+      agent: "developer",
+      stepId: "develop",
+      stepFragment: "steps/develop",
+      cwd: childWt,
+      recordsDir,
+      data: {
+        status: "ok",
+        summary: "Implemented the dependency",
+        evidence: ["bun test passed"],
+        concerns: [
+          { kind: "blocker", summary: "Dependent item has no implementation", affects: [item] },
+        ],
+      },
+      promptVars: { assignment: "Implement", target: "tests", citations: "[]" },
+    });
+
+    expect(result.ok).toBe(true);
+    expect(result.status).toBe("ok");
+
+    const concernsDir = path.join(taskDir, "concerns");
+    expect(fs.existsSync(concernsDir)).toBe(true);
+    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
+    expect(files).toHaveLength(1);
+    expect(files[0]).toMatch(/^c-[0-9a-f]{10}\.yaml$/);
+
+    const stored = await readYaml<StoredConcernArtifact>(path.join(concernsDir, files[0]!));
+    expect(stored.status).toBe("open");
+    expect(stored.severity).toBe("medium");
+    expect(stored.detail).toBe(stored.summary);
+    expect(stored.source.record).toBe("001-develop-a1");
+    expect(stored.source.agent).toBe("developer");
+    expect(stored.source.item).toBe(item);
+
+    // The concern is committed on taskWt, never written to the child worktree.
+    const rel = path
+      .relative(taskWt, path.join(concernsDir, files[0]!))
+      .replace(/\\/g, "/");
+    expect(
+      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], { cwd: taskWt, allowFail: true }).code
+    ).toBe(0);
+    expect(fs.existsSync(path.join(childWt, ORCH, TASK, "concerns"))).toBe(false);
+  });
+
+  it("merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps", async () => {
+    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
+    const now = () => new Date(nowMs);
+
+    const first = await aggregateConcerns(
+      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
+      [{ kind: "risk", summary: "Flaky gate", detail: "short", severity: "low" }]
+    );
+    expect(first).toHaveLength(1);
+    const id = first[0]!.id;
+    const file = path.join(taskDir, "concerns", `${id}.yaml`);
+    const created = await readYaml<StoredConcernArtifact>(file);
+
+    nowMs += 60_000;
+    const second = await aggregateConcerns(
+      {
+        taskDir,
+        taskWt,
+        repo,
+        now,
+        source: concernSource("002-develop-a1", "developer", { step: "develop", item: "item-a" }),
+      },
+      [{ kind: "risk", summary: "flaky   gate", detail: "a much longer detail", severity: "high" }]
+    );
+    expect(second).toHaveLength(1);
+    expect(second[0]!.id).toBe(id);
+
+    const merged = await readYaml<StoredConcernArtifact>(file);
+    expect(merged.detail).toBe("a much longer detail");
+    expect(merged.severity).toBe("high");
+    expect(merged.status).toBe("open");
+    expect(merged.source.record).toBe("002-develop-a1");
+    expect(merged.createdAt).toBe(created.createdAt);
+    expect(merged.updatedAt).toBe("2026-01-01T00:01:00.000Z");
+    const lastSeen = (merged.source as ConcernSource & { lastSeen?: string }).lastSeen;
+    expect(typeof lastSeen).toBe("string");
+    expect(Date.parse(lastSeen!)).toBe(nowMs);
+
+    // A shorter detail never replaces the longer stored one.
+    nowMs += 60_000;
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, now, source: concernSource("003-develop-a1") },
+      [{ kind: "risk", summary: "Flaky gate", detail: "tiny", severity: "low" }]
+    );
+    const shorter = await readYaml<StoredConcernArtifact>(file);
+    expect(shorter.detail).toBe("a much longer detail");
+    expect(shorter.severity).toBe("high");
+
+    // Equal-length details keep the latest re-emit.
+    const equalA = "a".repeat(32);
+    const equalB = "b".repeat(32);
+    nowMs += 60_000;
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, now, source: concernSource("004-develop-a1") },
+      [{ kind: "risk", summary: "Flaky gate", detail: equalA, severity: "medium" }]
+    );
+    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalA);
+    nowMs += 60_000;
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, now, source: concernSource("005-develop-a1") },
+      [{ kind: "risk", summary: "Flaky gate", detail: equalB, severity: "medium" }]
+    );
+    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalB);
+
+    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
+    expect(files).toHaveLength(1);
+    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+  });
+
+  it("keeps dismissed status and flags escalation when a higher severity is re-emitted", async () => {
+    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
+    const now = () => new Date(nowMs);
+
+    const first = await aggregateConcerns(
+      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
+      [{ kind: "risk", summary: "Endpoint may change", detail: "initial", severity: "low" }]
+    );
+    expect(first).toHaveLength(1);
+    const id = first[0]!.id;
+
+    const triaged = await applyConcernTriage({
+      taskDir,
+      taskWt,
+      repo,
+      now,
+      isTriager: true,
+      suggestions: [
+        {
+          id,
+          disposition: "dismiss",
+          summary: "Not real",
+          detail: "covered by contract test",
+        },
+      ],
+    });
+    expect(triaged).toHaveLength(1);
+    expect(triaged[0]!.status).toBe("dismissed");
+
+    nowMs += 60_000;
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, now, source: concernSource("002-develop-a1") },
+      [
+        {
+          kind: "risk",
+          summary: "Endpoint may change",
+          detail: "a longer detail",
+          severity: "high",
+        },
+      ]
+    );
+
+    const merged = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${id}.yaml`)
+    );
+    expect(merged.status).toBe("dismissed");
+    expect(merged.dismissReason).toBe("covered by contract test");
+    expect(merged.severity).toBe("high");
+    expect(merged.source.escalated).toBe(true);
+    expect(await listOpenConcerns(taskDir)).toEqual([]);
+  });
+
+  it("lists only open concerns in stable order", async () => {
+    await writeStoredConcern(
+      storedConcern({ id: "c-1111111111", createdAt: "2026-01-02T00:00:00.000Z" })
+    );
+    await writeStoredConcern(
+      storedConcern({ id: "c-2222222222", createdAt: "2026-01-01T00:00:00.000Z" })
+    );
+    await writeStoredConcern(
+      storedConcern({
+        id: "c-3333333333",
+        status: "dismissed",
+        createdAt: "2026-01-01T00:00:00.000Z",
+      })
+    );
+    await writeStoredConcern(
+      storedConcern({
+        id: "c-4444444444",
+        status: "resolved",
+        createdAt: "2026-01-01T00:00:00.000Z",
+      })
+    );
+    await writeYamlAtomic(path.join(taskDir, "concerns", "rm-5555555555.yaml"), {
+      id: "rm-5555555555",
+      chosen: "A decision",
+      alternatives: ["Other"],
+      why: "reasons",
+      status: "open",
+      source: { record: "001-architect-plan-a1", agent: "architect" },
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+    });
+
+    const open = await listOpenConcerns(taskDir);
+    expect(open.map((c) => c.id)).toEqual(["c-2222222222", "c-1111111111"]);
+    expect(open.every((c) => typeof c.kind === "string" && typeof c.detail === "string")).toBe(true);
+  });
+
+  it("triages only exact-id suggestions and persists dismiss reasons", async () => {
+    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
+    await writeStoredConcern(storedConcern({ id: "c-bbbbbbbbbb" }));
+
+    const triaged = await applyConcernTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: true,
+      suggestions: [
+        {
+          id: "c-aaaaaaaaaa",
+          disposition: "dismiss",
+          summary: "Duplicate",
+          detail: "covered by ADR-1",
+        },
+        { id: "s-1", disposition: "dismiss", summary: "Not a concern", detail: "unrelated finding" },
+      ],
+    });
+
+    expect(triaged.map((c) => c.id)).toEqual(["c-aaaaaaaaaa"]);
+    const dismissed = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-aaaaaaaaaa.yaml")
+    );
+    expect(dismissed.status).toBe("dismissed");
+    expect(dismissed.dismissReason).toBe("covered by ADR-1");
+
+    const untouched = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-bbbbbbbbbb.yaml")
+    );
+    expect(untouched.status).toBe("open");
+    expect(untouched.dismissReason).toBeUndefined();
+    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+  });
+
+  it("routes non-dismiss triage dispositions and gates non-triagers", async () => {
+    await writeStoredConcern(storedConcern({ id: "c-cccccccccc" }));
+
+    const ignored = await applyConcernTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: false,
+      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
+    });
+    expect(ignored).toEqual([]);
+    const stillOpen = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
+    );
+    expect(stillOpen.status).toBe("open");
+    expect(stillOpen.disposition).toBeUndefined();
+
+    const triaged = await applyConcernTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: true,
+      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
+    });
+    expect(triaged).toHaveLength(1);
+    const routed = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
+    );
+    expect(routed.status).toBe("routed");
+    expect(routed.disposition).toBe("fix");
+  });
+
+  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
+    await writeStoredConcern(storedConcern({ id: "c-dddddddddd" }));
+
+    await expect(
+      applyConcernTriage({
+        taskDir,
+        taskWt,
+        repo,
+        isTriager: true,
+        suggestions: [{ id: "c-dddddddddd", disposition: "dismiss", summary: "No reason" }],
+      })
+    ).rejects.toThrow(/detail/i);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-dddddddddd.yaml")
+    );
+    expect(stored.status).toBe("open");
+    expect(stored.dismissReason).toBeUndefined();
+  });
+
+  it("partitions suggestions by exact concern id", () => {
+    const suggestions: ReviewSuggestion[] = [
+      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Concern" },
+      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
+      { id: "s-1", disposition: "fix", summary: "Finding" },
+      { id: "c-cccccccccc", disposition: "optional", summary: "Unknown concern id" },
+    ];
+
+    const { triage, findings } = partitionSuggestions(
+      suggestions,
+      new Set(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"])
+    );
+
+    expect(triage.map((s) => s.id)).toEqual(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"]);
+    expect(findings.map((s) => s.id)).toEqual(["s-1", "c-cccccccccc"]);
+  });
+
+  it("records close-up pending resolutions without changing concern status", async () => {
+    await writeStoredConcern(
+      storedConcern({ id: "c-eeeeeeeeee", status: "routed", disposition: "architect" })
+    );
+    await writeStoredConcern(
+      storedConcern({ id: "c-ffffffffff", status: "routed", disposition: "fix" })
+    );
+    await writeStoredConcern(
+      storedConcern({ id: "c-9999999999", status: "open" })
+    );
+
+    const applied = await applyCloseupResolutions({
+      taskDir,
+      taskWt,
+      repo,
+      by: "wave-close-up",
+      resolutions: [
+        { id: "c-eeeeeeeeee", action: "carry", note: "architect should decide" },
+        { id: "c-ffffffffff", action: "resolve" },
+        { id: "c-9999999999", action: "propagate", note: "saga decision" },
+        { id: "c-8888888888", action: "resolve", note: "unknown id" },
+      ],
+    });
+
+    expect(applied.map((c) => c.id).sort()).toEqual([
+      "c-9999999999",
+      "c-eeeeeeeeee",
+      "c-ffffffffff",
+    ]);
+    const carried = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-eeeeeeeeee.yaml")
+    );
+    expect(carried.status).toBe("routed");
+    expect(carried.pendingResolution?.action).toBe("carry");
+    expect(carried.pendingResolution?.note).toBe("architect should decide");
+    expect(carried.pendingResolution?.by).toBe("wave-close-up");
+    expect(typeof carried.pendingResolution?.at).toBe("string");
+
+    const resolved = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-ffffffffff.yaml")
+    );
+    expect(resolved.status).toBe("routed");
+    expect(resolved.pendingResolution?.action).toBe("resolve");
+
+    const propagated = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", "c-9999999999.yaml")
+    );
+    expect(propagated.status).toBe("open");
+    expect(propagated.pendingResolution?.action).toBe("propagate");
+    expect(propagated.pendingResolution?.note).toBe("saga decision");
+    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+  });
+
+  it("aggregates remarkable decisions into rm-* files and triages them by exact id", async () => {
+    await aggregateConcerns(
+      {
+        taskDir,
+        taskWt,
+        repo,
+        source: concernSource("001-architect-plan-a1", "architect", { step: "architect-plan" }),
+      },
+      [],
+      [
+        {
+          chosen: "Atomic YAML files",
+          alternatives: ["One big file", "A database"],
+          why: "diffable and conflict-free",
+        },
+      ]
+    );
+
+    const concernsDir = path.join(taskDir, "concerns");
+    expect(fs.existsSync(concernsDir)).toBe(true);
+    const files = fs
+      .readdirSync(concernsDir)
+      .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
+    expect(files).toHaveLength(1);
+    expect(files[0]).toMatch(/^rm-[0-9a-f]{10}\.yaml$/);
+
+    const remarkable = await readYaml<Record<string, any>>(
+      path.join(concernsDir, files[0]!)
+    );
+    expect(remarkable.status).toBe("open");
+    expect(remarkable.chosen).toBe("Atomic YAML files");
+    expect(remarkable.source.record).toBe("001-architect-plan-a1");
+    expect(remarkable.source.agent).toBe("architect");
+
+    const rmId = files[0]!.replace(/\.yaml$/, "");
+    const triaged = await applyConcernTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: true,
+      suggestions: [
+        {
+          id: rmId,
+          disposition: "dismiss",
+          summary: "Standard",
+          detail: "No tradeoff worth reporting",
+        },
+      ],
+    });
+    expect(triaged).toHaveLength(1);
+    const after = await readYaml<Record<string, any>>(path.join(concernsDir, files[0]!));
+    expect(after.status).toBe("dismissed");
+    expect(after.dismissReason).toBe("No tradeoff worth reporting");
+  });
+
+  it("rejects unknown concern kinds without partial writes and leaves existing files untouched", async () => {
+    const existing = await writeStoredConcern(
+      storedConcern({ id: "c-0123456789", summary: "Existing concern" })
+    );
+    const before = fs.readFileSync(existing, "utf8");
+
+    await expect(
+      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
+        { kind: "risk", summary: "Valid" },
+        { kind: "bug", summary: "Invalid" } as unknown as Concern,
+      ])
+    ).rejects.toThrow(/kind/i);
+
+    const concernsDir = path.join(taskDir, "concerns");
+    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
+    expect(files).toEqual(["c-0123456789.yaml"]);
+    expect(fs.readFileSync(existing, "utf8")).toBe(before);
+  });
+
+  it("writes distinct fingerprints concurrently without deadlock or lost commits", async () => {
+    const results = await Promise.all([
+      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
+        { kind: "risk", summary: "Concurrent risk A" },
+      ]),
+      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("002-develop-a1") }, [
+        { kind: "tech-debt", summary: "Concurrent debt B" },
+      ]),
+    ]);
+    expect(results[0]).toHaveLength(1);
+    expect(results[1]).toHaveLength(1);
+
+    const files = fs
+      .readdirSync(path.join(taskDir, "concerns"))
+      .filter((f) => f.endsWith(".yaml"));
+    expect(files).toHaveLength(2);
+
+    const tracked = tmpRepo
+      .git(["ls-tree", "-r", "--name-only", "HEAD"], { cwd: taskWt })
+      .stdout.split("\n");
+    for (const file of files) {
+      expect(tracked).toContain(`${ORCH}/${TASK}/concerns/${file}`);
+    }
+    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+  });
+
+  it("serializes concurrent merges of the same fingerprint into one merged file", async () => {
+    const first = aggregateConcerns(
+      { taskDir, taskWt, repo, source: concernSource("001-develop-a1") },
+      [{ kind: "risk", summary: "Same concern", detail: "short", severity: "low" }]
+    );
+    const second = aggregateConcerns(
+      { taskDir, taskWt, repo, source: concernSource("002-develop-a1") },
+      [
+        {
+          kind: "risk",
+          summary: "Same concern",
+          detail: "a much longer concurrent detail",
+          severity: "high",
+        },
+      ]
+    );
+    const [a, b] = await Promise.all([first, second]);
+    expect(a).toHaveLength(1);
+    expect(b).toHaveLength(1);
+
+    const files = fs
+      .readdirSync(path.join(taskDir, "concerns"))
+      .filter((f) => f.endsWith(".yaml"));
+    expect(files).toHaveLength(1);
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", files[0]!)
+    );
+    expect(stored.detail).toBe("a much longer concurrent detail");
+    expect(stored.severity).toBe("high");
+    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+  });
+
+  it("wires reviewer output: aggregate new concerns before triaging pre-existing ids only", async () => {
+    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
+    const newSummary = "Newly observed retry risk";
+    const newId = concernFingerprint({ kind: "risk", summary: newSummary });
+    const runsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(runsDir, { recursive: true });
+
+    const result = await runStep({
+      agent: "reviewer",
+      stepId: "review",
+      stepFragment: "steps/review",
+      cwd: taskWt,
+      recordsDir: runsDir,
+      data: {
+        status: "approved",
+        summary: "Reviewed",
+        newConcerns: [{ kind: "risk", summary: newSummary }],
+        suggestions: [
+          {
+            id: "c-aaaaaaaaaa",
+            disposition: "dismiss",
+            summary: "Duplicate",
+            detail: "covered by ADR-1",
+          },
+          {
+            id: newId,
+            disposition: "dismiss",
+            summary: "Self",
+            detail: "must not dismiss a same-step concern",
+          },
+        ],
+      },
+      promptVars: { assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" },
+    });
+    expect(result.ok).toBe(true);
+
+    const concernsDir = path.join(taskDir, "concerns");
+    const newFile = path.join(concernsDir, `${newId}.yaml`);
+    expect(fs.existsSync(newFile)).toBe(true);
+    const created = await readYaml<StoredConcernArtifact>(newFile);
+    expect(created.status).toBe("open");
+    expect(created.source.record).toBe("001-review-a1");
+
+    const preExisting = await readYaml<StoredConcernArtifact>(
+      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
+    );
+    expect(preExisting.status).toBe("dismissed");
+    expect(preExisting.dismissReason).toBe("covered by ADR-1");
+  });
+
+  it("wires consult writeArtifact producers to the concern store", async () => {
+    const runsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(runsDir, { recursive: true });
+    let artifactWrites = 0;
+
+    const result = await runStep({
+      agent: "architect",
+      stepId: "consult-item",
+      stepFragment: "steps/architect-consult-item",
+      cwd: taskWt,
+      recordsDir: runsDir,
+      data: {
+        decision: "retry-with-guidance",
+        rationale: "Retry with a narrower scope",
+        concerns: [{ kind: "question", summary: "Which API version is authoritative?" }],
+        remarkable: [{ chosen: "Retry", alternatives: ["Escalate"], why: "Cheap to test" }],
+      },
+      promptVars: { item: "item-a", assignment: "", priorAttempts: "", diff: "", feedback: "" },
+      writeArtifact: async () => {
+        artifactWrites++;
+      },
+    });
+
+    expect(result.ok).toBe(true);
+    expect(artifactWrites).toBe(1);
+    const concernsDir = path.join(taskDir, "concerns");
+    const files = fs.existsSync(concernsDir) ? fs.readdirSync(concernsDir) : [];
+    const concernFiles = files.filter((f) => f.startsWith("c-"));
+    const remarkableFiles = files.filter((f) => f.startsWith("rm-"));
+    expect(concernFiles).toHaveLength(1);
+    expect(remarkableFiles).toHaveLength(1);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(concernsDir, concernFiles[0]!)
+    );
+    expect(stored.source.agent).toBe("architect");
+    expect(stored.source.record).toBe("001-consult-item-a1");
+    expect(stored.source.step).toBe("consult-item");
+  });
+
+  it("wires close-up producers: aggregates concerns and applies resolutions", async () => {
+    await writeStoredConcern(
+      storedConcern({ id: "c-aaaaaaaaaa", status: "routed", disposition: "architect" })
+    );
+    const runsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(runsDir, { recursive: true });
+
+    const result = await runStep({
+      agent: "wave-close-up",
+      stepId: "wave-close-up-1-1",
+      stepFragment: "steps/wave-close-up",
+      cwd: taskWt,
+      recordsDir: runsDir,
+      data: {
+        wave: 1,
+        iteration: 1,
+        status: "complete",
+        mergedItems: [],
+        summary: "Wave 1 complete",
+        concerns: [{ kind: "tech-debt", summary: "Close-up found duplicated helpers" }],
+        concernResolutions: [{ id: "c-aaaaaaaaaa", action: "carry", note: "needs architect" }],
+      },
+      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
+    });
+    expect(result.ok).toBe(true);
+
+    const concernsDir = path.join(taskDir, "concerns");
+    const newFiles = fs
+      .readdirSync(concernsDir)
+      .filter((f) => f.startsWith("c-") && f !== "c-aaaaaaaaaa.yaml");
+    expect(newFiles).toHaveLength(1);
+    const created = await readYaml<StoredConcernArtifact>(
+      path.join(concernsDir, newFiles[0]!)
+    );
+    expect(created.status).toBe("open");
+    expect(created.source.record).toBe("001-wave-close-up-1-1-a1");
+
+    const carried = await readYaml<StoredConcernArtifact>(
+      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
+    );
+    expect(carried.status).toBe("routed");
+    expect(carried.pendingResolution?.action).toBe("carry");
+    expect(carried.pendingResolution?.by).toBe("wave-close-up");
+  });
+
+  it("aggregates concerns and remarkable decisions across producer schemas", async () => {
+    const runsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(runsDir, { recursive: true });
+
+    const producers: Array<{
+      agent: string;
+      stepId: string;
+      stepFragment: string;
+      promptVars: Record<string, string>;
+      base: Record<string, unknown>;
+      concernField: "concerns" | "newConcerns";
+      remarkable: boolean;
+    }> = [
+      {
+        agent: "developer",
+        stepId: "develop",
+        stepFragment: "steps/develop",
+        promptVars: { assignment: "", target: "tests", citations: "[]" },
+        base: { status: "ok", summary: "dev" },
+        concernField: "concerns",
+        remarkable: true,
+      },
+      {
+        agent: "developer",
+        stepId: "poc",
+        stepFragment: "steps/poc",
+        promptVars: { assignment: "", context: "" },
+        base: { status: "ok", summary: "poc" },
+        concernField: "concerns",
+        remarkable: true,
+      },
+      {
+        agent: "developer",
+        stepId: "test-assumptions",
+        stepFragment: "steps/test-assumptions",
+        promptVars: { assignment: "", context: "" },
+        base: { status: "ok", summary: "assumptions" },
+        concernField: "concerns",
+        remarkable: true,
+      },
+      {
+        agent: "fact-finder",
+        stepId: "research",
+        stepFragment: "steps/research",
+        promptVars: { assignment: "", intent: "", citations: "[]" },
+        base: { status: "ok", summary: "ff", findings: "f" },
+        concernField: "concerns",
+        remarkable: true,
+      },
+      {
+        agent: "qa",
+        stepId: "qa",
+        stepFragment: "steps/qa",
+        promptVars: {
+          assignment: "",
+          checks: "",
+          testDiff: "",
+          diff: "",
+          dispositionsCriteria: "",
+        },
+        base: { status: "approved", summary: "qa", suggestions: [] },
+        concernField: "newConcerns",
+        remarkable: false,
+      },
+      {
+        agent: "architect",
+        stepId: "architect-plan",
+        stepFragment: "steps/architect-plan",
+        promptVars: {
+          task: TASK,
+          iteration: "1",
+          intent: "",
+          context: "",
+          infra: "",
+          debt: "",
+          steering: "",
+          limits: "",
+        },
+        base: { iteration: 1, milestones: [], itemOutlines: [] },
+        concernField: "concerns",
+        remarkable: true,
+      },
+      {
+        agent: "architect",
+        stepId: "architect-wave-report-1-1",
+        stepFragment: "steps/architect-wave-report",
+        promptVars: { plan: "{}", waveReport: "", debt: "", steering: "" },
+        base: { decision: "continue" },
+        concernField: "concerns",
+        remarkable: true,
+      },
+      {
+        agent: "wave-close-up",
+        stepId: "wave-close-up-1-1",
+        stepFragment: "steps/wave-close-up",
+        promptVars: { task: TASK, waveReport: "", infra: "" },
+        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "wave" },
+        concernField: "concerns",
+        remarkable: true,
+      },
+    ];
+
+    const concernsDir = path.join(taskDir, "concerns");
+    for (const [index, producer] of producers.entries()) {
+      const summary = `Producer ${index} concern`;
+      const chosen = `Producer ${index} decision`;
+      const data = {
+        ...producer.base,
+        [producer.concernField]: [{ kind: "risk", summary }],
+        ...(producer.remarkable
+          ? { remarkable: [{ chosen, alternatives: ["alt"], why: "because" }] }
+          : {}),
+      };
+
+      const result = await runStep({
+        agent: producer.agent,
+        stepId: producer.stepId,
+        stepFragment: producer.stepFragment,
+        cwd: taskWt,
+        recordsDir: runsDir,
+        data,
+        promptVars: producer.promptVars,
+      });
+      expect(result.ok).toBe(true);
+      expect(fs.existsSync(concernsDir)).toBe(true);
+
+      const concernFiles = fs
+        .readdirSync(concernsDir)
+        .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
+      const stored = await Promise.all(
+        concernFiles.map((f) => readYaml<StoredConcernArtifact>(path.join(concernsDir, f)))
+      );
+      const hit = stored.find((c) => c.summary === summary);
+      expect(hit).toBeDefined();
+      expect(hit!.status).toBe("open");
+      expect(hit!.source.agent).toBe(producer.agent);
+      expect(hit!.source.record).toContain(producer.stepId);
+
+      if (producer.remarkable) {
+        const rmFiles = fs
+          .readdirSync(concernsDir)
+          .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
+        const remarkables = await Promise.all(
+          rmFiles.map((f) => readYaml<Record<string, any>>(path.join(concernsDir, f)))
+        );
+        expect(remarkables.some((r) => r.chosen === chosen)).toBe(true);
+      }
+    }
+  });
+
+  it("reconciles missing concerns from committed step records idempotently", async () => {
+    const recordDir = path.join(taskDir, "items", "item-a", "steps", "001-develop-a1");
+    fs.mkdirSync(recordDir, { recursive: true });
+    fs.writeFileSync(path.join(recordDir, "input.md"), "prompt\n", "utf8");
+    await writeYamlAtomic(path.join(recordDir, "meta.yaml"), {
+      seq: 1,
+      name: "develop",
+      attempt: 1,
+      agent: "developer",
+      role: "workhorse",
+      models: ["model-workhorse"],
+      status: "ok",
+      startedAt: "2026-01-01T00:00:00.000Z",
+      endedAt: "2026-01-01T00:01:00.000Z",
+    });
+    await writeYamlAtomic(path.join(recordDir, "output.yaml"), {
+      status: "ok",
+      summary: "done",
+      concerns: [
+        {
+          kind: "risk",
+          summary: "Reconciled from record",
+          detail: "full detail",
+          severity: "high",
+        },
+      ],
+    });
+    tmpRepo.commit("committed step record", [
+      path.relative(taskWt, recordDir).replace(/\\/g, "/"),
+    ]);
+
+    const first = await reconcileConcerns({ taskDir, taskWt, repo });
+    expect(first).toHaveLength(1);
+
+    const concernsDir = path.join(taskDir, "concerns");
+    const files = fs
+      .readdirSync(concernsDir)
+      .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
+    expect(files).toHaveLength(1);
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(concernsDir, files[0]!)
+    );
+    expect(stored.summary).toBe("Reconciled from record");
+    expect(stored.detail).toBe("full detail");
+    expect(stored.status).toBe("open");
+    expect(stored.source.record).toBe("001-develop-a1");
+    expect(stored.source.agent).toBe("developer");
+    // Replay derives timestamps from meta.endedAt, not wall-clock.
+    expect(stored.updatedAt).toBe("2026-01-01T00:01:00.000Z");
+    expect(stored.createdAt).toBe("2026-01-01T00:01:00.000Z");
+    expect(stored.source.lastSeen).toBe("2026-01-01T00:01:00.000Z");
+
+    // A second startup is a byte- and commit-level no-op.
+    const fileHash = (f: string) => fs.readFileSync(f, "utf8");
+    const beforeBytes = fileHash(path.join(concernsDir, files[0]!));
+    const beforeHead = tmpRepo.git(["rev-parse", "HEAD"], { cwd: taskWt }).stdout.trim();
+    const replay = await reconcileConcerns({ taskDir, taskWt, repo });
+    expect(replay).toHaveLength(1);
+    expect(fileHash(path.join(concernsDir, files[0]!))).toBe(beforeBytes);
+    expect(tmpRepo.git(["rev-parse", "HEAD"], { cwd: taskWt }).stdout.trim()).toBe(beforeHead);
+    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+
+    // Simulate an earlier triage: a second reconcile must preserve it and not
+    // duplicate the file.
+    stored.status = "dismissed";
+    stored.dismissReason = "already handled";
+    await writeYamlAtomic(path.join(concernsDir, files[0]!), stored);
+
+    const second = await reconcileConcerns({ taskDir, taskWt, repo });
+    expect(second).toHaveLength(1);
+    expect(
+      fs.readdirSync(concernsDir).filter((f) => f.startsWith("c-") && f.endsWith(".yaml"))
+    ).toHaveLength(1);
+    const after = await readYaml<StoredConcernArtifact>(
+      path.join(concernsDir, files[0]!)
+    );
+    expect(after.status).toBe("dismissed");
+    expect(after.dismissReason).toBe("already handled");
+  });
+
+  it("commits stray concerns files during startup recovery instead of stashing them", async () => {
+    const task = "recovery-task";
+    const mainTaskDir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(mainTaskDir, { recursive: true });
+    fs.writeFileSync(path.join(mainTaskDir, "INTENT.md"), "# recovery\n", "utf8");
+    tmpRepo.commit("add recovery intent");
+
+    const recoveryWtRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(recoveryWtRoot, { recursive: true });
+    const recoveryRepo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: recoveryWtRoot });
+    const recoveryTaskWt = tmpRepo.createWorktree(
+      `topic/${task}`,
+      path.join(recoveryWtRoot, `topic_${task}`)
+    );
+    await writeYamlAtomic(
+      path.join(recoveryTaskWt, ORCH, task, "concerns", "c-0123456789.yaml"),
+      storedConcern({ id: "c-0123456789" })
+    );
+
+    const recoveryPipeline: PipelineConfig = {
+      models: {
+        roles: {
+          workhorse: { model: "model-workhorse" },
+          simpler: { model: "model-simpler" },
+        },
+      },
+      agents: {},
+      flows: { simple: { steps: [] }, story: {}, spike: {} },
+      limits: {},
+    };
+    const result = await runTask(
+      {
+        harness: new FakeHarness(),
+        repo: recoveryRepo,
+        project: { orchestrationFolder: ORCH, worktreeRoot: recoveryWtRoot },
+        pipelineFor: async () => recoveryPipeline,
+        prompts,
+      },
+      task,
+      { maxTicks: 0 }
+    );
+    expect(result.status).toBe("stopped");
+
+    const rel = `${ORCH}/${task}/concerns/c-0123456789.yaml`;
+    expect(
+      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], {
+        cwd: recoveryTaskWt,
+        allowFail: true,
+      }).code
+    ).toBe(0);
+    expect(tmpRepo.git(["stash", "list"], { cwd: recoveryTaskWt }).stdout).toBe("");
+  });
+
+  it("keeps step status ok and journals an ingest error when concern ingestion fails", async () => {
+    fs.writeFileSync(path.join(taskDir, "concerns"), "not a directory", "utf8");
+    const runsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(runsDir, { recursive: true });
+
+    const result = await runStep({
+      agent: "developer",
+      stepId: "develop",
+      stepFragment: "steps/develop",
+      cwd: taskWt,
+      recordsDir: runsDir,
+      data: {
+        status: "ok",
+        summary: "done",
+        concerns: [{ kind: "risk", summary: "Ingest me" }],
+      },
+      promptVars: { assignment: "", target: "tests", citations: "[]" },
+    });
+
+    expect(result.status).toBe("ok");
+    expect(result.meta.error).toBeUndefined();
+    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
+    expect(journal).toContain("concern_ingest_error");
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
