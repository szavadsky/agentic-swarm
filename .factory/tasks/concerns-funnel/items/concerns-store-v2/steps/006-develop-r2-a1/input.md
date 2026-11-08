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

## Review Feedback
- [FIX] listOpenConcerns returns rm-* remarkable files as StoredConcernArtifact: mergeRemarkable writes rm-*.yaml with status open but no kind/summary/detail/severity (concerns.ts:60-66). listOpenConcerns reads all *.yaml and filters only status==='open' (108-112), so open remarkables are returned typed as StoredConcernArtifact, breaking the type contract (kind/summary/detail/severity required). Future hydration expecting Concern fields will see undefined. Filter to c-*.yaml or require r.kind. (plugins/software-factory/src/core/concerns.ts)

- [OPTIONAL] aggregateConcerns validates only remarkable.chosen; missing why throws mid-RMW after partial writes: Validation at line 79 checks only chosen. mergeRemarkable dereferences input.why.length and rmId uses alternatives (28,63). A remarkable missing why throws inside the KeyedMutex after earlier concerns were already writeYamlAtomic'd, leaving dirty uncommitted files and violating the no-partial-write atomicity shown for kinds. Validate chosen/alternatives/why before the lock; low risk via schema-validated paths but direct/reconcile callers can hit it.
- [OPTIONAL] KINDS/RANK hardcode enums instead of deriving from schema single source: Line 18-19 duplicates ConcernKind/ConcernSeverity enums already in artifacts.ts:301-303, config/schemas/*.schema.json, and review-schema.ts:60. Philosophy section 5 requires schema as single source; a shared constant or schema-derived list would prevent drift. Non-blocking, matches existing duplication.
- [OPTIONAL] reconcile filters by HEAD ls-tree but reads worktree files, can ingest dirty outputs: committedStepRecords uses git ls-tree HEAD to enumerate committed meta/output pairs but then readYaml from taskWt working-tree paths (185-186). Uncommitted modifications to output.yaml after HEAD would be ingested despite 'from committed records (derive read-only)'. Either git show HEAD:path or document that repairWorktree guarantees worktree==HEAD at that point.
- [OPTIONAL] Non-dismiss triage to routed leaves stale dismissReason/pendingResolution: applyConcernTriage routed patch spreads record and only sets status/disposition (144-145), so a concern previously dismissed then routed keeps dismissReason; similarly triage never clears pendingResolution. Clear dismissReason on routed or document sticky semantics.
- [OPTIONAL] Startup reconcile error journal can throw and crash runTask unlike task_error guard: engine.ts:369-377 catches reconcile errors with await appendJournal without nested guard; step-runner.ts:683 has same shape. engine.ts:766-768 shows the guarded pattern try{appendJournal}catch{}. If the journal write fails (IO), startup/step throws instead of isolating the ingest failure.

## Check Results


## Current Diff
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
+++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++@@ -4,9 +4,27 @@ import path from "node:path";
++ import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++ import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++ import { runAgentStep } from "../../src/core/flows/step-runner.js";
+++import { runTask } from "../../src/core/engine.js";
++ import { Repo } from "../../src/core/git/repo.js";
++ import { loadPromptLibrary } from "../../src/core/prompts.js";
++-import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
+++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+++import {
+++  aggregateConcerns,
+++  applyCloseupResolutions,
+++  applyConcernTriage,
+++  concernFingerprint,
+++  listOpenConcerns,
+++  partitionSuggestions,
+++  reconcileConcerns,
+++} from "../../src/core/concerns.js";
+++import type {
+++  Concern,
+++  ConcernSource,
+++  PipelineConfig,
+++  ProjectConfig,
+++  ReviewSuggestion,
+++  StoredConcernArtifact,
+++} from "../../src/core/artifacts.js";
++ 
++ /**
++  * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
++@@ -163,3 +181,1080 @@ describe("Concern funnel schemas", () => {
++     expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
++   });
++ });
+++
+++/**
+++ * Behaviour of the taskWt concern store (docs/factory.v2.md §18; ADRs
+++ * adr-concern-store-taskwt, adr-fingerprint-merge, adr-triage-suggestions-dismiss).
+++ *
+++ * `{task}/concerns/` lives on the task worktree while item steps only commit
+++ * childWt, so the store must write an explicit taskWt path, serialize
+++ * read-modify-write merges per task, and commit taskWt immediately. One file
+++ * per fingerprint keeps retries and restarts idempotent.
+++ */
+++describe("Concern store", () => {
+++  const ORCH = ".factory";
+++  const TASK = "concern-store";
+++
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
+++  let worktreeRoot: string;
+++  let pipeline: PipelineConfig;
+++  let project: ProjectConfig;
+++  let prompts: ReturnType<typeof loadPromptLibrary>;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+++    fs.mkdirSync(worktreeRoot, { recursive: true });
+++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+++    taskWt = tmpRepo.dir;
+++    taskDir = path.join(taskWt, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Concern store\n", "utf8");
+++    tmpRepo.commit("add concern store task");
+++
+++    pipeline = {
+++      models: {
+++        roles: {
+++          workhorse: { model: "model-workhorse" },
+++          "alt-workhorse": { model: "model-alt-workhorse" },
+++          architect: { model: "model-architect" },
+++          "alt-architect": { model: "model-alt-architect" },
+++          simpler: { model: "model-simpler" },
+++        },
+++      },
+++      agents: {
+++        developer: { role: "workhorse" },
+++        "fact-finder": { role: "workhorse" },
+++        qa: { role: "alt-workhorse" },
+++        reviewer: { role: "alt-workhorse" },
+++        architect: { role: "architect" },
+++        "wave-close-up": { role: "alt-workhorse" },
+++        "plan-close-up": { role: "alt-workhorse" },
+++      },
+++      flows: { simple: { steps: [] }, story: {}, spike: {} },
+++      limits: {},
+++    };
+++    project = { orchestrationFolder: ORCH, worktreeRoot };
+++    prompts = loadPromptLibrary({
+++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+++      overrideDirs: [],
+++    });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concernSource(
+++    record: string,
+++    agent = "developer",
+++    extra: Partial<ConcernSource> = {}
+++  ): ConcernSource {
+++    return { record, agent, ...extra };
+++  }
+++
+++  function storedConcern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeStoredConcern(concern: StoredConcernArtifact): Promise<string> {
+++    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
+++    await writeYamlAtomic(file, concern);
+++    return file;
+++  }
+++
+++  async function runStep(opts: {
+++    item?: string;
+++    agent: string;
+++    stepId: string;
+++    stepFragment: string;
+++    cwd: string;
+++    recordsDir: string;
+++    data: unknown;
+++    promptVars: Record<string, string>;
+++    writeArtifact?: (output: unknown) => Promise<void>;
+++  }) {
+++    const harness = new FakeHarness();
+++    const label = opts.item
+++      ? `${TASK}/items/${opts.item}/${opts.stepId}#a1`
+++      : `${TASK}/runs/${opts.stepId}#a1`;
+++    harness.scriptOutcome(label, { ok: true, data: opts.data });
+++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
+++    harness.scriptComplete(() => opts.data);
+++
+++    return runAgentStep({
+++      task: TASK,
+++      item: opts.item,
+++      stepId: opts.stepId,
+++      stepFragment: opts.stepFragment,
+++      agent: opts.agent,
+++      cwd: opts.cwd,
+++      taskDir,
+++      recordsDir: opts.recordsDir,
+++      taskWt,
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts,
+++      promptVars: opts.promptVars,
+++      writeArtifact: opts.writeArtifact,
+++    });
+++  }
+++
+++  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "  Flaky   GATE ",
+++      location: { file: "src/core/example.ts", line: 7 },
+++      affects: ["item-b", "item-a"],
+++    };
+++    const fp = concernFingerprint(identity);
+++
+++    expect(fp).toMatch(/^c-[0-9a-f]{10}$/);
+++    expect(concernFingerprint({ ...identity, detail: "short", severity: "low" })).toBe(fp);
+++    expect(
+++      concernFingerprint({ ...identity, detail: "a much longer detail", severity: "high" })
+++    ).toBe(fp);
+++    expect(
+++      concernFingerprint({ ...identity, summary: "flaky gate", affects: ["item-a", "item-b"] })
+++    ).toBe(fp);
+++
+++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(fp);
+++    expect(
+++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+++    ).not.toBe(fp);
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
+++  });
+++
+++  it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
+++    const item = "item-a";
+++    const childWt = tmpRepo.createWorktree(`topic/${TASK}--${item}`);
+++    const recordsDir = path.join(childWt, ORCH, TASK, "items", item, "steps");
+++    fs.mkdirSync(recordsDir, { recursive: true });
+++
+++    const result = await runStep({
+++      item,
+++      agent: "developer",
+++      stepId: "develop",
+++      stepFragment: "steps/develop",
+++      cwd: childWt,
+++      recordsDir,
+++      data: {
+++        status: "ok",
+++        summary: "Implemented the dependency",
+++        evidence: ["bun test passed"],
+++        concerns: [
+++          { kind: "blocker", summary: "Dependent item has no implementation", affects: [item] },
+++        ],
+++      },
+++      promptVars: { assignment: "Implement", target: "tests", citations: "[]" },
+++    });
+++
+++    expect(result.ok).toBe(true);
+++    expect(result.status).toBe("ok");
+++
+++    const concernsDir = path.join(taskDir, "concerns");
+++    expect(fs.existsSync(concernsDir)).toBe(true);
+++    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
+++    expect(files).toHaveLength(1);
+++    expect(files[0]).toMatch(/^c-[0-9a-f]{10}\.yaml$/);
+++
+++    const stored = await readYaml<StoredConcernArtifact>(path.join(concernsDir, files[0]!));
+++    expect(stored.status).toBe("open");
+++    expect(stored.severity).toBe("medium");
+++    expect(stored.detail).toBe(stored.summary);
+++    expect(stored.source.record).toBe("001-develop-a1");
+++    expect(stored.source.agent).toBe("developer");
+++    expect(stored.source.item).toBe(item);
+++
+++    // The concern is committed on taskWt, never written to the child worktree.
+++    const rel = path
+++      .relative(taskWt, path.join(concernsDir, files[0]!))
+++      .replace(/\\/g, "/");
+++    expect(
+++      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], { cwd: taskWt, allowFail: true }).code
+++    ).toBe(0);
+++    expect(fs.existsSync(path.join(childWt, ORCH, TASK, "concerns"))).toBe(false);
+++  });
+++
+++  it("merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps", async () => {
+++    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
+++    const now = () => new Date(nowMs);
+++
+++    const first = await aggregateConcerns(
+++      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
+++      [{ kind: "risk", summary: "Flaky gate", detail: "short", severity: "low" }]
+++    );
+++    expect(first).toHaveLength(1);
+++    const id = first[0]!.id;
+++    const file = path.join(taskDir, "concerns", `${id}.yaml`);
+++    const created = await readYaml<StoredConcernArtifact>(file);
+++
+++    nowMs += 60_000;
+++    const second = await aggregateConcerns(
+++      {
+++        taskDir,
+++        taskWt,
+++        repo,
+++        now,
+++        source: concernSource("002-develop-a1", "developer", { step: "develop", item: "item-a" }),
+++      },
+++      [{ kind: "risk", summary: "flaky   gate", detail: "a much longer detail", severity: "high" }]
+++    );
+++    expect(second).toHaveLength(1);
+++    expect(second[0]!.id).toBe(id);
+++
+++    const merged = await readYaml<StoredConcernArtifact>(file);
+++    expect(merged.detail).toBe("a much longer detail");
+++    expect(merged.severity).toBe("high");
+++    expect(merged.status).toBe("open");
+++    expect(merged.source.record).toBe("002-develop-a1");
+++    expect(merged.createdAt).toBe(created.createdAt);
+++    expect(merged.updatedAt).toBe("2026-01-01T00:01:00.000Z");
+++    const lastSeen = (merged.source as ConcernSource & { lastSeen?: string }).lastSeen;
+++    expect(typeof lastSeen).toBe("string");
+++    expect(Date.parse(lastSeen!)).toBe(nowMs);
+++
+++    // A shorter detail never replaces the longer stored one.
+++    nowMs += 60_000;
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, now, source: concernSource("003-develop-a1") },
+++      [{ kind: "risk", summary: "Flaky gate", detail: "tiny", severity: "low" }]
+++    );
+++    const shorter = await readYaml<StoredConcernArtifact>(file);
+++    expect(shorter.detail).toBe("a much longer detail");
+++    expect(shorter.severity).toBe("high");
+++
+++    // Equal-length details keep the latest re-emit.
+++    const equalA = "a".repeat(32);
+++    const equalB = "b".repeat(32);
+++    nowMs += 60_000;
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, now, source: concernSource("004-develop-a1") },
+++      [{ kind: "risk", summary: "Flaky gate", detail: equalA, severity: "medium" }]
+++    );
+++    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalA);
+++    nowMs += 60_000;
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, now, source: concernSource("005-develop-a1") },
+++      [{ kind: "risk", summary: "Flaky gate", detail: equalB, severity: "medium" }]
+++    );
+++    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalB);
+++
+++    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
+++    expect(files).toHaveLength(1);
+++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+++  });
+++
+++  it("keeps dismissed status and flags escalation when a higher severity is re-emitted", async () => {
+++    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
+++    const now = () => new Date(nowMs);
+++
+++    const first = await aggregateConcerns(
+++      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
+++      [{ kind: "risk", summary: "Endpoint may change", detail: "initial", severity: "low" }]
+++    );
+++    expect(first).toHaveLength(1);
+++    const id = first[0]!.id;
+++
+++    const triaged = await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      now,
+++      isTriager: true,
+++      suggestions: [
+++        {
+++          id,
+++          disposition: "dismiss",
+++          summary: "Not real",
+++          detail: "covered by contract test",
+++        },
+++      ],
+++    });
+++    expect(triaged).toHaveLength(1);
+++    expect(triaged[0]!.status).toBe("dismissed");
+++
+++    nowMs += 60_000;
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, now, source: concernSource("002-develop-a1") },
+++      [
+++        {
+++          kind: "risk",
+++          summary: "Endpoint may change",
+++          detail: "a longer detail",
+++          severity: "high",
+++        },
+++      ]
+++    );
+++
+++    const merged = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${id}.yaml`)
+++    );
+++    expect(merged.status).toBe("dismissed");
+++    expect(merged.dismissReason).toBe("covered by contract test");
+++    expect(merged.severity).toBe("high");
+++    expect(merged.source.escalated).toBe(true);
+++    expect(await listOpenConcerns(taskDir)).toEqual([]);
+++  });
+++
+++  it("lists only open concerns in stable order", async () => {
+++    await writeStoredConcern(
+++      storedConcern({ id: "c-1111111111", createdAt: "2026-01-02T00:00:00.000Z" })
+++    );
+++    await writeStoredConcern(
+++      storedConcern({ id: "c-2222222222", createdAt: "2026-01-01T00:00:00.000Z" })
+++    );
+++    await writeStoredConcern(
+++      storedConcern({
+++        id: "c-3333333333",
+++        status: "dismissed",
+++        createdAt: "2026-01-01T00:00:00.000Z",
+++      })
+++    );
+++    await writeStoredConcern(
+++      storedConcern({
+++        id: "c-4444444444",
+++        status: "resolved",
+++        createdAt: "2026-01-01T00:00:00.000Z",
+++      })
+++    );
+++
+++    const open = await listOpenConcerns(taskDir);
+++    expect(open.map((c) => c.id)).toEqual(["c-2222222222", "c-1111111111"]);
+++  });
+++
+++  it("triages only exact-id suggestions and persists dismiss reasons", async () => {
+++    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
+++    await writeStoredConcern(storedConcern({ id: "c-bbbbbbbbbb" }));
+++
+++    const triaged = await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: true,
+++      suggestions: [
+++        {
+++          id: "c-aaaaaaaaaa",
+++          disposition: "dismiss",
+++          summary: "Duplicate",
+++          detail: "covered by ADR-1",
+++        },
+++        { id: "s-1", disposition: "dismiss", summary: "Not a concern", detail: "unrelated finding" },
+++      ],
+++    });
+++
+++    expect(triaged.map((c) => c.id)).toEqual(["c-aaaaaaaaaa"]);
+++    const dismissed = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-aaaaaaaaaa.yaml")
+++    );
+++    expect(dismissed.status).toBe("dismissed");
+++    expect(dismissed.dismissReason).toBe("covered by ADR-1");
+++
+++    const untouched = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-bbbbbbbbbb.yaml")
+++    );
+++    expect(untouched.status).toBe("open");
+++    expect(untouched.dismissReason).toBeUndefined();
+++    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
+++  });
+++
+++  it("routes non-dismiss triage dispositions and gates non-triagers", async () => {
+++    await writeStoredConcern(storedConcern({ id: "c-cccccccccc" }));
+++
+++    const ignored = await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: false,
+++      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
+++    });
+++    expect(ignored).toEqual([]);
+++    const stillOpen = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
+++    );
+++    expect(stillOpen.status).toBe("open");
+++    expect(stillOpen.disposition).toBeUndefined();
+++
+++    const triaged = await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: true,
+++      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
+++    });
+++    expect(triaged).toHaveLength(1);
+++    const routed = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
+++    );
+++    expect(routed.status).toBe("routed");
+++    expect(routed.disposition).toBe("fix");
+++  });
+++
+++  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
+++    await writeStoredConcern(storedConcern({ id: "c-dddddddddd" }));
+++
+++    await expect(
+++      applyConcernTriage({
+++        taskDir,
+++        taskWt,
+++        repo,
+++        isTriager: true,
+++        suggestions: [{ id: "c-dddddddddd", disposition: "dismiss", summary: "No reason" }],
+++      })
+++    ).rejects.toThrow(/detail/i);
+++
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-dddddddddd.yaml")
+++    );
+++    expect(stored.status).toBe("open");
+++    expect(stored.dismissReason).toBeUndefined();
+++  });
+++
+++  it("partitions suggestions by exact concern id", () => {
+++    const suggestions: ReviewSuggestion[] = [
+++      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Concern" },
+++      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
+++      { id: "s-1", disposition: "fix", summary: "Finding" },
+++      { id: "c-cccccccccc", disposition: "optional", summary: "Unknown concern id" },
+++    ];
+++
+++    const { triage, findings } = partitionSuggestions(
+++      suggestions,
+++      new Set(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"])
+++    );
+++
+++    expect(triage.map((s) => s.id)).toEqual(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"]);
+++    expect(findings.map((s) => s.id)).toEqual(["s-1", "c-cccccccccc"]);
+++  });
+++
+++  it("records close-up pending resolutions without changing concern status", async () => {
+++    await writeStoredConcern(
+++      storedConcern({ id: "c-eeeeeeeeee", status: "routed", disposition: "architect" })
+++    );
+++    await writeStoredConcern(
+++      storedConcern({ id: "c-ffffffffff", status: "routed", disposition: "fix" })
+++    );
+++    await writeStoredConcern(
+++      storedConcern({ id: "c-9999999999", status: "open" })
+++    );
+++
+++    const applied = await applyCloseupResolutions({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      by: "wave-close-up",
+++      resolutions: [
+++        { id: "c-eeeeeeeeee", action: "carry", note: "architect should decide" },
+++        { id: "c-ffffffffff", action: "resolve" },
+++        { id: "c-9999999999", action: "propagate", note: "saga decision" },
+++        { id: "c-8888888888", action: "resolve", note: "unknown id" },
+++      ],
+++    });
+++
+++    expect(applied.map((c) => c.id).sort()).toEqual([
+++      "c-9999999999",
+++      "c-eeeeeeeeee",
+++      "c-ffffffffff",
+++    ]);
+++    const carried = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", "c-eeeeeeeeee.yaml")
+++    );
+++    expect(carried.status).toBe("routed");
+++    expect(carried.pendingResolution?.action).toBe("carry");
+++    expect(carried.pendingResolution?.note).toBe("architect should decide");
+++    expect(carried.pendingResolution?.by).toBe("wave-close-up");
+++    expect(typeof carried.pendingResolution?.at).toBe("string");
+++
+++    const resolved = await readYaml<StoredConcernArtifact>(
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..4a742d4
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 4
++name: qa
++attempt: 1
++fixRound: 1
++agent: qa
++role: alt-workhorse
++models:
++  - opencode-go/muse-spark-1.3-contributor
++  - opencode-go/deepseek-v4.1-flash
++timeoutSec: 900
++status: ok
++startedAt: 2026-11-08T06:52:38.296Z
++session: 01a1b9ee-4641-726f-9fba-b5604835d294
++endedAt: 2026-11-08T07:00:11.155Z
++usage:
++  inputTokens: 45734
++  outputTokens: 15063
++  costUsd: 0.008244
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-52-42-945Z_01a1b9ee-4641-726f-9fba-b5604835d294
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..e5ada01
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/004-qa-r1-a1/output.yaml
+@@ -0,0 +1,16 @@
++status: approved
++summary: "Concerns store v2 approved: 22/22 target green, typecheck clean,
++  genuine 21-test red, no weakening, lock discipline verified"
++suggestions:
++  - detail: "listOpenConcerns catches all YAML read errors and silently drops the
++      file (line 109: catch { return undefined }). A corrupt concerns/*.yaml
++      therefore vanishes from triage/hydration with no signal. Consider
++      journaling or logging the offending filename so corruption is diagnosable;
++      behavior for valid files is correct and no test covers this path, so
++      non-blocking."
++    disposition: optional
++    id: corrupt-concern-silent-skip
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 109
++    summary: listOpenConcerns silently skips corrupt YAML instead of surfacing it
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..8b7de73
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 5
+name: review
+attempt: 1
+fixRound: 1
+agent: reviewer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T07:00:20.092Z
+session: 01a1b9f5-4154-7406-9ff8-d3941c708763
+endedAt: 2026-11-08T07:16:55.197Z
+usage:
+  inputTokens: 87316
+  outputTokens: 22079
+  costUsd: 0.015252
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T07-00-20-436Z_01a1b9f5-4154-7406-9ff8-d3941c708763.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/output.yaml
new file mode 100644
index 0000000..c89419f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-store-v2/steps/005-review-r1-a1/output.yaml
@@ -0,0 +1,76 @@
+status: changes_requested
+summary: "changes_requested: listOpenConcerns leaks rm-* remarkables as
+  StoredConcernArtifact; locks/commit discipline verified"
+suggestions:
+  - id: list-open-includes-remarkables
+    disposition: fix
+    summary: listOpenConcerns returns rm-* remarkable files as StoredConcernArtifact
+    detail: mergeRemarkable writes rm-*.yaml with status open but no
+      kind/summary/detail/severity (concerns.ts:60-66). listOpenConcerns reads
+      all *.yaml and filters only status==='open' (108-112), so open remarkables
+      are returned typed as StoredConcernArtifact, breaking the type contract
+      (kind/summary/detail/severity required). Future hydration expecting
+      Concern fields will see undefined. Filter to c-*.yaml or require r.kind.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 108
+  - id: remarkable-validation-partial-write
+    disposition: optional
+    summary: aggregateConcerns validates only remarkable.chosen; missing why throws
+      mid-RMW after partial writes
+    detail: Validation at line 79 checks only chosen. mergeRemarkable dereferences
+      input.why.length and rmId uses alternatives (28,63). A remarkable missing
+      why throws inside the KeyedMutex after earlier concerns were already
+      writeYamlAtomic'd, leaving dirty uncommitted files and violating the
+      no-partial-write atomicity shown for kinds. Validate
+      chosen/alternatives/why before the lock; low risk via schema-validated
+      paths but direct/reconcile callers can hit it.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 79
+  - id: kinds-duplicate-schema-source
+    disposition: optional
+    summary: KINDS/RANK hardcode enums instead of deriving from schema single source
+    detail: Line 18-19 duplicates ConcernKind/ConcernSeverity enums already in
+      artifacts.ts:301-303, config/schemas/*.schema.json, and
+      review-schema.ts:60. Philosophy section 5 requires schema as single
+      source; a shared constant or schema-derived list would prevent drift.
+      Non-blocking, matches existing duplication.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 18
+  - id: reconcile-reads-worktree-not-head
+    disposition: optional
+    summary: reconcile filters by HEAD ls-tree but reads worktree files, can ingest
+      dirty outputs
+    detail: committedStepRecords uses git ls-tree HEAD to enumerate committed
+      meta/output pairs but then readYaml from taskWt working-tree paths
+      (185-186). Uncommitted modifications to output.yaml after HEAD would be
+      ingested despite 'from committed records (derive read-only)'. Either git
+      show HEAD:path or document that repairWorktree guarantees worktree==HEAD
+      at that point.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 185
+  - id: routed-retains-dismiss-reason
+    disposition: optional
+    summary: Non-dismiss triage to routed leaves stale dismissReason/pendingResolution
+    detail: applyConcernTriage routed patch spreads record and only sets
+      status/disposition (144-145), so a concern previously dismissed then
+      routed keeps dismissReason; similarly triage never clears
+      pendingResolution. Clear dismissReason on routed or document sticky
+      semantics.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 144
+  - id: reconcile-journal-unguarded
+    disposition: optional
+    summary: Startup reconcile error journal can throw and crash runTask unlike
+      task_error guard
+    detail: engine.ts:369-377 catches reconcile errors with await appendJournal
+      without nested guard; step-runner.ts:683 has same shape. engine.ts:766-768
+      shows the guarded pattern try{appendJournal}catch{}. If the journal write
+      fails (IO), startup/step throws instead of isolating the ingest failure.
+    location:
+      file: plugins/software-factory/src/core/engine.ts
+      line: 370
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
index 0000000..c32728f
--- /dev/null
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -0,0 +1,207 @@
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
+    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: at },
+    createdAt: existing?.createdAt ?? at, updatedAt: at,
+  };
+}
+
+function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
+  return {
+    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
+    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
+    status: existing?.status ?? "open",
+    source: { ...(existing?.source ?? {}), ...source, lastSeen: at },
+    createdAt: existing?.createdAt ?? at, updatedAt: at,
+  };
+}
+
+/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+export async function aggregateConcerns(
+  ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = []
+): Promise<StoredConcernArtifact[]> {
+  for (const c of concerns) {
+    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
+    if (!c.summary?.trim()) throw new Error("Concern summary is required");
+    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
+  }
+  for (const d of remarkables) if (!d?.chosen?.trim()) throw new Error("Remarkable decision requires chosen");
+
+  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+  const stored = await locks.runExclusive(ctx.taskDir, async () => {
+    const out: StoredConcernArtifact[] = [];
+    for (const input of concerns) {
+      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+      const merged = mergeConcern(await readExisting(file), input, ctx.source, at);
+      await writeYamlAtomic(file, merged);
+      out.push(merged);
+    }
+    for (const decision of remarkables) {
+      const file = path.join(dir, `${rmId(decision)}.yaml`);
+      await writeYamlAtomic(file, mergeRemarkable(await readExisting(file), decision, ctx.source, at));
+    }
+    return out;
+  });
+  if (concerns.length || remarkables.length) await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
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
+  const records = await Promise.all(names.filter((n) => n.endsWith(".yaml")).map(async (name) => {
+    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
+  }));
+  return records
+    .filter((r): r is StoredConcernArtifact => r?.status === "open")
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
+      : { ...record, status: "routed", disposition: s.disposition }];
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
+/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. */
+export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
+  const reconciled: StoredConcernArtifact[] = [];
+  for (const r of await committedStepRecords(ctx)) {
+    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])]
+      .filter((c: any) => c && typeof c === "object");
+    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
+    if (!concerns.length && !remarkables.length) continue;
+    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"),
+      ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
+    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables)));
+  }
+  return reconciled;
+}
diff --git a/plugins/software-factory/src/core/engine.ts b/plugins/software-factory/src/core/engine.ts
index 87787e9..bb4fe0c 100644
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
@@ -358,6 +365,17 @@ export async function runTask(
 
   await repairInterruptedRecords(taskDir);
 
+  // Rebuild concerns lost in a crash from committed step records (§18).
+  try {
+    await reconcileConcerns({ taskDir, taskWt, repo });
+  } catch (err: any) {
+    await appendJournal(taskDir, {
+      type: "concern_reconcile_error",
+      task,
+      error: err?.message || String(err),
+    });
+  }
+
   // 3. Load pipeline config and setup semaphores (§2)
   pipeline = await pipelineFor(taskDir);
   if (opts?.maxIterations !== undefined) {
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index f5e0e00..3b1775c 100644
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
+      await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) });
+    }
+  }
+
   // 13. Invariant §6.3.2: Finish step record with final meta
   const finalMeta = await finishStepRecord({
     recordDir,
diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
index ce498df..ef4bafb 100644
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
@@ -163,3 +181,1080 @@ describe("Concern funnel schemas", () => {
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
+
+    const open = await listOpenConcerns(taskDir);
+    expect(open.map((c) => c.id)).toEqual(["c-2222222222", "c-1111111111"]);
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
