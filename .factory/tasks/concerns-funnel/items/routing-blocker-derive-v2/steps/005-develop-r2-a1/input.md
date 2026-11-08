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
  "slug": "routing-blocker-derive-v2",
  "kind": "dev",
  "title": "Blocker derive",
  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
  "outlineRef": "routing-blocker-derive-v2",
  "milestone": "m3-routing",
  "wave": 8,
  "deps": [
    "modes-prompts-v2",
    "plan-reviewer-triage-v2",
    "reviewer-triage-v2"
  ],
  "escalate": true
}

## Review Feedback
- [FIX] Unify routed-blocker seed predicate: task/item use non-terminal, wave/scheduler use pending-only: task.ts seeds routedBlocked for any non-terminal (!TERMINAL) while wave.ts and scheduler.blockedByConcern seed only status==pending. withRoutedBlocking also blocks running/ready. Same concern therefore derives different blocked sets via deriveTaskState (running/ready seeds blocked + pending dependents cascaded) vs iteration deriveWaveState (running/ready seeds ignored, dependents stay runnable). Breaks pure-derive consistency; refreshStateYaml can report blocked while iteration keeps scheduling the item. Align all three to one predicate (pending-only matches §8.2 precedent and avoids retro-blocking in-flight work; if non-terminal is intended, update wave/scheduler to match) and add a running/ready-seed test to lock it. (plugins/software-factory/src/core/derive/task.ts)
- [FIX] deriveWaveState reimplements blockedByConcern seeding+cascade instead of reusing it: wave.ts builds blockedSlugs via blockedByFailure + manual pending-seed loop + cascadePendingBlocked, which is exactly blockedByConcern(schedItems, blockedBy). Duplication already caused the predicate divergence with task.ts. Replace with new Set(blockedByConcern(schedItems, opts.blockedBy ?? [])) (schedItems mapping already exists) so the failure-union fixpoint has one owner; apply the same shared helper for task.ts post-processing. (plugins/software-factory/src/core/derive/wave.ts)

- [OPTIONAL] Iteration end-of-wave blocked check derives without blockedBy, misses routed blockers: iteration.ts derives allCurrentStates via deriveItemState without blockedBy and checks status==blocked. Routed-blocked items stay pending there (blocking only materialized in deriveTaskState itemMap or wave buckets), so the iteration blocked early-return never fires for routed-only blocking while deriveTaskState reports task blocked. Either derive via a routed-aware path or check wave/blocked buckets; defer to routing-architect-consult act-phase if intentional.
- [OPTIONAL] Unify blockedBy vs concernBlocked/routedNames naming for the same set: derive item/wave use blockedBy for affected-item slugs (reads as edge list), scheduler uses concernBlocked, task uses routedNames/routedBlocked. Pick one term (e.g. concernBlocked or routedBlocked) across derive + scheduler to avoid misreading as blocker ids.
- [OPTIONAL] Document why deriveTaskState wave calls omit blockedBy: Items are pre-blocked via withRoutedBlocking before the wave loop, so deriveWaveState calls intentionally omit blockedBy (seeds would be status blocked, not pending). Add a one-line comment at the wave loop to prevent a future caller from threading it twice or removing the post-process as redundant.

## Check Results


## Current Diff
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..0537fb6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,68 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/plan-scheduler.test.ts
+        - plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 11 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794133110930-b4q7dn451v6.xml
+      junitCaseCount: 24
+      junitCaseIds:
+        - "plan/scheduler: nextWave.returns current active wave while items are
+          pending or running"
+        - "plan/scheduler: nextWave.advances to next wave when all items in
+          current wave are terminal"
+        - "plan/scheduler: nextWave.returns null when all items across all waves
+          are terminal"
+        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
+          is omitted"
+        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
+          deps as blocked for wave advancement"
+        - "plan/scheduler: nextWave.reports directly blocked items; transitive
+          cascade is the engine's job"
+        - "plan/scheduler: runnable.respects dependencies: pending item only
+          runs when all deps are done"
+        - "plan/scheduler: runnable.respects active wave filter"
+        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
+          current running count"
+        - "plan/scheduler: runnable.preserves PM order"
+        - "plan/scheduler: runnable.never returns items whose deps failed"
+        - "plan/scheduler: blockedByFailure.returns pending items with failed or
+          abandoned deps, in PM order"
+        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
+          or been abandoned"
+        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
+          their declared dependents in PM order"
+        - "plan/scheduler: blockedByConcern.unions concern blocking with the
+          failure-blocked fixpoint over declared deps"
+        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
+          never blocks a done item"
+        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+          concerns and ignores other statuses and kinds"
+        - "derive/task: collectRoutedBlockers.returns an empty set when the task
+          has no concerns directory"
+        - "derive/wave: routed blocker integration.routes a concern-affected
+          item and its declared dependents to blocked"
+        - "derive/wave: routed blocker integration.cascades transitively over
+          declared deps only"
+        - "derive/item: routed blocker integration.blocks only the item named by
+          a routed blocker"
+        - "derive/item: routed blocker integration.keeps a terminal item status
+          over routed blocking"
+        - "derive/task: routed blocker scenario.blocks affected items and
+          declared dependents, leaving non-dependents pending without writes"
+        - "derive/task: routed blocker scenario.derives the task blocked when
+          every item is in the routed blocker cascade"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..4697cf2
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,55 @@
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
+  "slug": "routing-blocker-derive-v2",
+  "kind": "dev",
+  "title": "Blocker derive",
+  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
+  "outlineRef": "routing-blocker-derive-v2",
+  "milestone": "m3-routing",
+  "wave": 8,
+  "deps": [
+    "modes-prompts-v2",
+    "plan-reviewer-triage-v2",
+    "reviewer-triage-v2"
+  ],
+  "escalate": true
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..00b0846
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T10:03:13.836Z
+session: 01a1ba9c-b455-72a5-9f1e-29f85bf10fe5
+endedAt: 2026-11-08T10:18:31.204Z
+usage:
+  inputTokens: 144926
+  outputTokens: 53206
+  costUsd: 0.072089
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-03-14-389Z_01a1ba9c-b455-72a5-9f1e-29f85bf10fe5.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..03ab7e5
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,84 @@
+status: ok
+summary: "Authored test-first coverage for routed-blocker derivation (no
+  production code touched). New test/engine/routing-blocker-derive.test.ts
+  covers: collectRoutedBlockers reading only routed kind==blocker affects
+  (open/resolved/dismissed/other kinds ignored, missing concerns dir,
+  late-arriving blocker); deriveWaveState blockedBy routing an affected item
+  plus declared dependents while non-dependents stay runnable and transitive
+  cascade follows deps only; deriveItemState blockedBy marking only the named
+  item and preserving terminal (abandoned/failed) status; and deriveTaskState
+  end-to-end deriving itemMap/waves blocked statuses for seed + dependent +
+  transitive while an independent item stays pending, with a full task-tree
+  snapshot proving derivation writes nothing, plus task status blocked when
+  every item is in the cascade. Added plan/scheduler: blockedByConcern tests to
+  test/plan-scheduler.test.ts covering PM-order blocking of affected items and
+  declared dependents, union with the failure-blocked fixpoint (direct +
+  transitive), and ignoring dangling/plan refs and terminal (done) items. All 11
+  declared target tests fail with assertion failures (not import/collection
+  errors) on the current production code; the 13 pre-existing scheduler tests
+  still pass; typecheck is clean."
+target:
+  selectors:
+    - test/engine/routing-blocker-derive.test.ts
+    - test/plan-scheduler.test.ts
+  expectRed:
+    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
+      declared dependents in PM order"
+    - "plan/scheduler: blockedByConcern.unions concern blocking with the
+      failure-blocked fixpoint over declared deps"
+    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
+      blocks a done item"
+    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+      concerns and ignores other statuses and kinds"
+    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
+      no concerns directory"
+    - "derive/wave: routed blocker integration.routes a concern-affected item
+      and its declared dependents to blocked"
+    - "derive/wave: routed blocker integration.cascades transitively over
+      declared deps only"
+    - "derive/item: routed blocker integration.blocks only the item named by a
+      routed blocker"
+    - "derive/item: routed blocker integration.keeps a terminal item status over
+      routed blocking"
+    - "derive/task: routed blocker scenario.blocks affected items and declared
+      dependents, leaving non-dependents pending without writes"
+    - "derive/task: routed blocker scenario.derives the task blocked when every
+      item is in the routed blocker cascade"
+evidence:
+  - Installed workspace deps with `cd plugins/software-factory && bun install
+    --frozen-lockfile` (node_modules gitignored) so bun can resolve the `yaml`
+    import chain used by derive tests.
+  - "Proved red classification first with a scratch bun test: a failed `expect`
+    is emitted as `<failure>` (status fail) in bun's JUnit reporter, while
+    runtime exceptions become `<error>`, so a missing symbol alone would not
+    satisfy target-red."
+  - "Ran the exact engine target command from the worktree root: `cd
+    plugins/software-factory && bun test
+    test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+    --reporter=junit --reporter-outfile=/tmp/junit-target.xml`; exit code 1 with
+    13 pass / 11 fail."
+  - "Parsed the JUnit XML with Python: all 11 declared expectRed ids are
+    present, each with a `<failure>` element and 0 `<error>` elements; no
+    declared id is missing and no declared test passes."
+  - "Re-ran the exact target command under the ambient TMPDIR
+    (`.../.factory-runtime/tmp`): same 11 failures / 0 errors, so the red target
+    does not depend on the TMPDIR head-guard caveat."
+  - "Ran `cd plugins/software-factory && bun run typecheck` (tsc --noEmit):
+    pass, confirming the test-only additions compile under strict settings with
+    no production changes."
+  - "Verified `git status --short`: only
+    `plugins/software-factory/test/plan-scheduler.test.ts` (modified) and
+    `plugins/software-factory/test/engine/routing-blocker-derive.test.ts` (new)
+    changed; no production files touched."
+notes: "Test-first seams use inert local fallbacks (empty Set / empty array) for
+  the not-yet-existing collectRoutedBlockers and blockedByConcern exports, so
+  every red failure is a behavioural assertion rather than a module
+  import/collection error. The end-to-end scenario snapshots the entire task
+  tree before/after deriveTaskState to enforce the pure-derive/no-writes
+  constraint. Expected implementation contract: deriveWaveState/deriveItemState
+  accept `blockedBy?: Iterable<string>`; scheduler.blockedByConcern(items,
+  concernBlocked) returns a PM-ordered union of concern seeds and
+  direct/transitive failure blocking; deriveTaskState collects routed blocker
+  affects, marks directly affected items and their declared-dependency cascade
+  blocked in itemMap/waves, and leaves non-dependents pending."
+concerns: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..5e56e81
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,121 @@
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
+        durationMs: 4267
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 66017
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-WTJIgy/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
+
+           361 pass
+           2 skip
+           0 fail
+           1661 expect() calls
+          Ran 363 tests across 59 files. [65.88s]
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
+        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794133678161-h4umdoqwcu.xml
+      junitCaseCount: 24
+      junitCaseIds:
+        - "plan/scheduler: nextWave.returns current active wave while items are
+          pending or running"
+        - "plan/scheduler: nextWave.advances to next wave when all items in
+          current wave are terminal"
+        - "plan/scheduler: nextWave.returns null when all items across all waves
+          are terminal"
+        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
+          is omitted"
+        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
+          deps as blocked for wave advancement"
+        - "plan/scheduler: nextWave.reports directly blocked items; transitive
+          cascade is the engine's job"
+        - "plan/scheduler: runnable.respects dependencies: pending item only
+          runs when all deps are done"
+        - "plan/scheduler: runnable.respects active wave filter"
+        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
+          current running count"
+        - "plan/scheduler: runnable.preserves PM order"
+        - "plan/scheduler: runnable.never returns items whose deps failed"
+        - "plan/scheduler: blockedByFailure.returns pending items with failed or
+          abandoned deps, in PM order"
+        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
+          or been abandoned"
+        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
+          their declared dependents in PM order"
+        - "plan/scheduler: blockedByConcern.unions concern blocking with the
+          failure-blocked fixpoint over declared deps"
+        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
+          never blocks a done item"
+        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+          concerns and ignores other statuses and kinds"
+        - "derive/task: collectRoutedBlockers.returns an empty set when the task
+          has no concerns directory"
+        - "derive/wave: routed blocker integration.routes a concern-affected
+          item and its declared dependents to blocked"
+        - "derive/wave: routed blocker integration.cascades transitively over
+          declared deps only"
+        - "derive/item: routed blocker integration.blocks only the item named by
+          a routed blocker"
+        - "derive/item: routed blocker integration.keeps a terminal item status
+          over routed blocking"
+        - "derive/task: routed blocker scenario.blocks affected items and
+          declared dependents, leaving non-dependents pending without writes"
+        - "derive/task: routed blocker scenario.derives the task blocked when
+          every item is in the routed blocker cascade"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 218/300 production lines changed"
+    details:
+      changedLines:
+        added: 165
+        deleted: 53
+        total: 218
+        files:
+          - plugins/software-factory/src/core/derive/item.ts
+          - plugins/software-factory/src/core/derive/task.ts
+          - plugins/software-factory/src/core/derive/wave.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/plan/index.ts
+          - plugins/software-factory/src/core/plan/scheduler.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..1272543
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,72 @@
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
+  "slug": "routing-blocker-derive-v2",
+  "kind": "dev",
+  "title": "Blocker derive",
+  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
+  "outlineRef": "routing-blocker-derive-v2",
+  "milestone": "m3-routing",
+  "wave": 8,
+  "deps": [
+    "modes-prompts-v2",
+    "plan-reviewer-triage-v2",
+    "reviewer-triage-v2"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/routing-blocker-derive.test.ts",
+    "test/plan-scheduler.test.ts"
+  ],
+  "expectRed": [
+    "plan/scheduler: blockedByConcern.blocks concern-affected items and their declared dependents in PM order",
+    "plan/scheduler: blockedByConcern.unions concern blocking with the failure-blocked fixpoint over declared deps",
+    "plan/scheduler: blockedByConcern.ignores refs naming no item and never blocks a done item",
+    "derive/task: collectRoutedBlockers.collects affects of routed blocker concerns and ignores other statuses and kinds",
+    "derive/task: collectRoutedBlockers.returns an empty set when the task has no concerns directory",
+    "derive/wave: routed blocker integration.routes a concern-affected item and its declared dependents to blocked",
+    "derive/wave: routed blocker integration.cascades transitively over declared deps only",
+    "derive/item: routed blocker integration.blocks only the item named by a routed blocker",
+    "derive/item: routed blocker integration.keeps a terminal item status over routed blocking",
+    "derive/task: routed blocker scenario.blocks affected items and declared dependents, leaving non-dependents pending without writes",
+    "derive/task: routed blocker scenario.derives the task blocked when every item is in the routed blocker cascade"
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..cbdad77
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
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
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T10:18:38.750Z
+session: 01a1baaa-d0d8-7482-b92e-37da0ab0d209
+endedAt: 2026-11-08T10:27:58.410Z
+usage:
+  inputTokens: 47017
+  outputTokens: 27170
+  costUsd: 0.030267
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-18-39-192Z_01a1baaa-d0d8-7482-b92e-37da0ab0d209.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..9472c7f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,62 @@
+status: ok
+summary: Implemented routed-blocker derive (pure derive, no writes). Added
+  scheduler.blockedByConcern + shared cascadePendingBlocked fixpoint;
+  derive/wave now unions routed-blocker seeds with blockedByFailure over
+  declared deps; derive/item accepts blockedBy and blocks non-terminal items via
+  withRoutedBlocking; derive/task exports collectRoutedBlockers (routed blocker
+  concerns' affects) and post-processes all items through the transitive
+  declared-dep cascade before wave derivation; iteration loop threads
+  collectRoutedBlockers into both deriveWaveState calls. All 11 target cases
+  pass.
+target:
+  selectors:
+    - test/engine/routing-blocker-derive.test.ts
+    - test/plan-scheduler.test.ts
+  expectRed:
+    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
+      declared dependents in PM order"
+    - "plan/scheduler: blockedByConcern.unions concern blocking with the
+      failure-blocked fixpoint over declared deps"
+    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
+      blocks a done item"
+    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+      concerns and ignores other statuses and kinds"
+    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
+      no concerns directory"
+    - "derive/wave: routed blocker integration.routes a concern-affected item
+      and its declared dependents to blocked"
+    - "derive/wave: routed blocker integration.cascades transitively over
+      declared deps only"
+    - "derive/item: routed blocker integration.blocks only the item named by a
+      routed blocker"
+    - "derive/item: routed blocker integration.keeps a terminal item status over
+      routed blocking"
+    - "derive/task: routed blocker scenario.blocks affected items and declared
+      dependents, leaving non-dependents pending without writes"
+    - "derive/task: routed blocker scenario.derives the task blocked when every
+      item is in the routed blocker cascade"
+evidence:
+  - bun test test/engine/routing-blocker-derive.test.ts
+    test/plan-scheduler.test.ts -> 24 pass, 0 fail, 43 expects (covers all 11
+    target cases, including the no-writes snapshot-tree assertion)
+  - bun run typecheck (tsc --noEmit) -> exit 0 on final diff
+  - bun test (full project suite) -> 361 pass, 2 skip, 0 fail, 1661 expects
+    across 59 files
+  - bun test test/engine/routing-blocker-derive.test.ts
+    test/plan-scheduler.test.ts test/plan-apply.test.ts test/plan-limits.test.ts
+    test/engine/plan-reviewer-triage.test.ts -> 47 pass, 0 fail on final diff
+    after adding the plan barrel export
+  - git diff --stat -> 6 prod files changed, no test files modified
+concerns:
+  - collectRoutedBlockers trusts concern.affects verbatim; refs naming a
+    non-existent item are inert by construction but are not validated
+  - blockedByConcern/cascadePendingBlocked only block pending items, so already
+    running or ready work is not retro-blocked at scheduler level (derive
+    item-level blocking does cover ready/running non-terminal states)
+  - iteration.ts now reads the concern store on every wave derivation (cheap,
+    but recomputed per refresh to pick up newly routed concerns)
+notes: blockedByConcern returns slugs in PM order, unions blockedByFailure and
+  the concern seeds, then cascades to a fixpoint over declared deps only.
+  deriveTaskState derives items first, computes the routed cascade, then applies
+  withRoutedBlocking so itemMap and every wave state see blocked statuses before
+  wave derivation; terminal outcomes (merged/failed/superseded) are preserved.
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..8fb38c9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,66 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 11 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794133684463-6u040o06mre.xml
+      junitCaseCount: 24
+      junitCaseIds:
+        - "plan/scheduler: nextWave.returns current active wave while items are
+          pending or running"
+        - "plan/scheduler: nextWave.advances to next wave when all items in
+          current wave are terminal"
+        - "plan/scheduler: nextWave.returns null when all items across all waves
+          are terminal"
+        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
+          is omitted"
+        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
+          deps as blocked for wave advancement"
+        - "plan/scheduler: nextWave.reports directly blocked items; transitive
+          cascade is the engine's job"
+        - "plan/scheduler: runnable.respects dependencies: pending item only
+          runs when all deps are done"
+        - "plan/scheduler: runnable.respects active wave filter"
+        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
+          current running count"
+        - "plan/scheduler: runnable.preserves PM order"
+        - "plan/scheduler: runnable.never returns items whose deps failed"
+        - "plan/scheduler: blockedByFailure.returns pending items with failed or
+          abandoned deps, in PM order"
+        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
+          or been abandoned"
+        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
+          their declared dependents in PM order"
+        - "plan/scheduler: blockedByConcern.unions concern blocking with the
+          failure-blocked fixpoint over declared deps"
+        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
+          never blocks a done item"
+        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+          concerns and ignores other statuses and kinds"
+        - "derive/task: collectRoutedBlockers.returns an empty set when the task
+          has no concerns directory"
+        - "derive/wave: routed blocker integration.routes a concern-affected
+          item and its declared dependents to blocked"
+        - "derive/wave: routed blocker integration.cascades transitively over
+          declared deps only"
+        - "derive/item: routed blocker integration.blocks only the item named by
+          a routed blocker"
+        - "derive/item: routed blocker integration.keeps a terminal item status
+          over routed blocking"
+        - "derive/task: routed blocker scenario.blocks affected items and
+          declared dependents, leaving non-dependents pending without writes"
+        - "derive/task: routed blocker scenario.derives the task blocked when
+          every item is in the routed blocker cascade"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..bba909c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1401 @@
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
+  "slug": "routing-blocker-derive-v2",
+  "kind": "dev",
+  "title": "Blocker derive",
+  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
+  "outlineRef": "routing-blocker-derive-v2",
+  "milestone": "m3-routing",
+  "wave": 8,
+  "deps": [
+    "modes-prompts-v2",
+    "plan-reviewer-triage-v2",
+    "reviewer-triage-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..0537fb6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,68 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/plan-scheduler.test.ts
++        - plugins/software-factory/test/engine/routing-blocker-derive.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 11 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794133110930-b4q7dn451v6.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - "plan/scheduler: nextWave.returns current active wave while items are
++          pending or running"
++        - "plan/scheduler: nextWave.advances to next wave when all items in
++          current wave are terminal"
++        - "plan/scheduler: nextWave.returns null when all items across all waves
++          are terminal"
++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
++          is omitted"
++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
++          deps as blocked for wave advancement"
++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
++          cascade is the engine's job"
++        - "plan/scheduler: runnable.respects dependencies: pending item only
++          runs when all deps are done"
++        - "plan/scheduler: runnable.respects active wave filter"
++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
++          current running count"
++        - "plan/scheduler: runnable.preserves PM order"
++        - "plan/scheduler: runnable.never returns items whose deps failed"
++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
++          abandoned deps, in PM order"
++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
++          or been abandoned"
++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
++          their declared dependents in PM order"
++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
++          failure-blocked fixpoint over declared deps"
++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
++          never blocks a done item"
++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++          concerns and ignores other statuses and kinds"
++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
++          has no concerns directory"
++        - "derive/wave: routed blocker integration.routes a concern-affected
++          item and its declared dependents to blocked"
++        - "derive/wave: routed blocker integration.cascades transitively over
++          declared deps only"
++        - "derive/item: routed blocker integration.blocks only the item named by
++          a routed blocker"
++        - "derive/item: routed blocker integration.keeps a terminal item status
++          over routed blocking"
++        - "derive/task: routed blocker scenario.blocks affected items and
++          declared dependents, leaving non-dependents pending without writes"
++        - "derive/task: routed blocker scenario.derives the task blocked when
++          every item is in the routed blocker cascade"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..4697cf2
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,55 @@
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
++  "slug": "routing-blocker-derive-v2",
++  "kind": "dev",
++  "title": "Blocker derive",
++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
++  "outlineRef": "routing-blocker-derive-v2",
++  "milestone": "m3-routing",
++  "wave": 8,
++  "deps": [
++    "modes-prompts-v2",
++    "plan-reviewer-triage-v2",
++    "reviewer-triage-v2"
++  ],
++  "escalate": true
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
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..00b0846
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T10:03:13.836Z
++session: 01a1ba9c-b455-72a5-9f1e-29f85bf10fe5
++endedAt: 2026-11-08T10:18:31.204Z
++usage:
++  inputTokens: 144926
++  outputTokens: 53206
++  costUsd: 0.072089
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-03-14-389Z_01a1ba9c-b455-72a5-9f1e-29f85bf10fe5.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..03ab7e5
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,84 @@
++status: ok
++summary: "Authored test-first coverage for routed-blocker derivation (no
++  production code touched). New test/engine/routing-blocker-derive.test.ts
++  covers: collectRoutedBlockers reading only routed kind==blocker affects
++  (open/resolved/dismissed/other kinds ignored, missing concerns dir,
++  late-arriving blocker); deriveWaveState blockedBy routing an affected item
++  plus declared dependents while non-dependents stay runnable and transitive
++  cascade follows deps only; deriveItemState blockedBy marking only the named
++  item and preserving terminal (abandoned/failed) status; and deriveTaskState
++  end-to-end deriving itemMap/waves blocked statuses for seed + dependent +
++  transitive while an independent item stays pending, with a full task-tree
++  snapshot proving derivation writes nothing, plus task status blocked when
++  every item is in the cascade. Added plan/scheduler: blockedByConcern tests to
++  test/plan-scheduler.test.ts covering PM-order blocking of affected items and
++  declared dependents, union with the failure-blocked fixpoint (direct +
++  transitive), and ignoring dangling/plan refs and terminal (done) items. All 11
++  declared target tests fail with assertion failures (not import/collection
++  errors) on the current production code; the 13 pre-existing scheduler tests
++  still pass; typecheck is clean."
++target:
++  selectors:
++    - test/engine/routing-blocker-derive.test.ts
++    - test/plan-scheduler.test.ts
++  expectRed:
++    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
++      declared dependents in PM order"
++    - "plan/scheduler: blockedByConcern.unions concern blocking with the
++      failure-blocked fixpoint over declared deps"
++    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
++      blocks a done item"
++    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++      concerns and ignores other statuses and kinds"
++    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
++      no concerns directory"
++    - "derive/wave: routed blocker integration.routes a concern-affected item
++      and its declared dependents to blocked"
++    - "derive/wave: routed blocker integration.cascades transitively over
++      declared deps only"
++    - "derive/item: routed blocker integration.blocks only the item named by a
++      routed blocker"
++    - "derive/item: routed blocker integration.keeps a terminal item status over
++      routed blocking"
++    - "derive/task: routed blocker scenario.blocks affected items and declared
++      dependents, leaving non-dependents pending without writes"
++    - "derive/task: routed blocker scenario.derives the task blocked when every
++      item is in the routed blocker cascade"
++evidence:
++  - Installed workspace deps with `cd plugins/software-factory && bun install
++    --frozen-lockfile` (node_modules gitignored) so bun can resolve the `yaml`
++    import chain used by derive tests.
++  - "Proved red classification first with a scratch bun test: a failed `expect`
++    is emitted as `<failure>` (status fail) in bun's JUnit reporter, while
++    runtime exceptions become `<error>`, so a missing symbol alone would not
++    satisfy target-red."
++  - "Ran the exact engine target command from the worktree root: `cd
++    plugins/software-factory && bun test
++    test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++    --reporter=junit --reporter-outfile=/tmp/junit-target.xml`; exit code 1 with
++    13 pass / 11 fail."
++  - "Parsed the JUnit XML with Python: all 11 declared expectRed ids are
++    present, each with a `<failure>` element and 0 `<error>` elements; no
++    declared id is missing and no declared test passes."
++  - "Re-ran the exact target command under the ambient TMPDIR
++    (`.../.factory-runtime/tmp`): same 11 failures / 0 errors, so the red target
++    does not depend on the TMPDIR head-guard caveat."
++  - "Ran `cd plugins/software-factory && bun run typecheck` (tsc --noEmit):
++    pass, confirming the test-only additions compile under strict settings with
++    no production changes."
++  - "Verified `git status --short`: only
++    `plugins/software-factory/test/plan-scheduler.test.ts` (modified) and
++    `plugins/software-factory/test/engine/routing-blocker-derive.test.ts` (new)
++    changed; no production files touched."
++notes: "Test-first seams use inert local fallbacks (empty Set / empty array) for
++  the not-yet-existing collectRoutedBlockers and blockedByConcern exports, so
++  every red failure is a behavioural assertion rather than a module
++  import/collection error. The end-to-end scenario snapshots the entire task
++  tree before/after deriveTaskState to enforce the pure-derive/no-writes
++  constraint. Expected implementation contract: deriveWaveState/deriveItemState
++  accept `blockedBy?: Iterable<string>`; scheduler.blockedByConcern(items,
++  concernBlocked) returns a PM-ordered union of concern seeds and
++  direct/transitive failure blocking; deriveTaskState collects routed blocker
++  affects, marks directly affected items and their declared-dependency cascade
++  blocked in itemMap/waves, and leaves non-dependents pending."
++concerns: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..5e56e81
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,121 @@
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
++        durationMs: 4267
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 66017
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-WTJIgy/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
++
++           361 pass
++           2 skip
++           0 fail
++           1661 expect() calls
++          Ran 363 tests across 59 files. [65.88s]
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
++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794133678161-h4umdoqwcu.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - "plan/scheduler: nextWave.returns current active wave while items are
++          pending or running"
++        - "plan/scheduler: nextWave.advances to next wave when all items in
++          current wave are terminal"
++        - "plan/scheduler: nextWave.returns null when all items across all waves
++          are terminal"
++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
++          is omitted"
++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
++          deps as blocked for wave advancement"
++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
++          cascade is the engine's job"
++        - "plan/scheduler: runnable.respects dependencies: pending item only
++          runs when all deps are done"
++        - "plan/scheduler: runnable.respects active wave filter"
++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
++          current running count"
++        - "plan/scheduler: runnable.preserves PM order"
++        - "plan/scheduler: runnable.never returns items whose deps failed"
++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
++          abandoned deps, in PM order"
++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
++          or been abandoned"
++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
++          their declared dependents in PM order"
++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
++          failure-blocked fixpoint over declared deps"
++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
++          never blocks a done item"
++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++          concerns and ignores other statuses and kinds"
++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
++          has no concerns directory"
++        - "derive/wave: routed blocker integration.routes a concern-affected
++          item and its declared dependents to blocked"
++        - "derive/wave: routed blocker integration.cascades transitively over
++          declared deps only"
++        - "derive/item: routed blocker integration.blocks only the item named by
++          a routed blocker"
++        - "derive/item: routed blocker integration.keeps a terminal item status
++          over routed blocking"
++        - "derive/task: routed blocker scenario.blocks affected items and
++          declared dependents, leaving non-dependents pending without writes"
++        - "derive/task: routed blocker scenario.derives the task blocked when
++          every item is in the routed blocker cascade"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 218/300 production lines changed"
++    details:
++      changedLines:
++        added: 165
++        deleted: 53
++        total: 218
++        files:
++          - plugins/software-factory/src/core/derive/item.ts
++          - plugins/software-factory/src/core/derive/task.ts
++          - plugins/software-factory/src/core/derive/wave.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/plan/index.ts
++          - plugins/software-factory/src/core/plan/scheduler.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..1272543
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,72 @@
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
++  "slug": "routing-blocker-derive-v2",
++  "kind": "dev",
++  "title": "Blocker derive",
++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
++  "outlineRef": "routing-blocker-derive-v2",
++  "milestone": "m3-routing",
++  "wave": 8,
++  "deps": [
++    "modes-prompts-v2",
++    "plan-reviewer-triage-v2",
++    "reviewer-triage-v2"
++  ],
++  "escalate": true
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/routing-blocker-derive.test.ts",
++    "test/plan-scheduler.test.ts"
++  ],
++  "expectRed": [
++    "plan/scheduler: blockedByConcern.blocks concern-affected items and their declared dependents in PM order",
++    "plan/scheduler: blockedByConcern.unions concern blocking with the failure-blocked fixpoint over declared deps",
++    "plan/scheduler: blockedByConcern.ignores refs naming no item and never blocks a done item",
++    "derive/task: collectRoutedBlockers.collects affects of routed blocker concerns and ignores other statuses and kinds",
++    "derive/task: collectRoutedBlockers.returns an empty set when the task has no concerns directory",
++    "derive/wave: routed blocker integration.routes a concern-affected item and its declared dependents to blocked",
++    "derive/wave: routed blocker integration.cascades transitively over declared deps only",
++    "derive/item: routed blocker integration.blocks only the item named by a routed blocker",
++    "derive/item: routed blocker integration.keeps a terminal item status over routed blocking",
++    "derive/task: routed blocker scenario.blocks affected items and declared dependents, leaving non-dependents pending without writes",
++    "derive/task: routed blocker scenario.derives the task blocked when every item is in the routed blocker cascade"
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
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..cbdad77
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
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
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T10:18:38.750Z
++session: 01a1baaa-d0d8-7482-b92e-37da0ab0d209
++endedAt: 2026-11-08T10:27:58.410Z
++usage:
++  inputTokens: 47017
++  outputTokens: 27170
++  costUsd: 0.030267
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-18-39-192Z_01a1baaa-d0d8-7482-b92e-37da0ab0d209.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..9472c7f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,62 @@
++status: ok
++summary: Implemented routed-blocker derive (pure derive, no writes). Added
++  scheduler.blockedByConcern + shared cascadePendingBlocked fixpoint;
++  derive/wave now unions routed-blocker seeds with blockedByFailure over
++  declared deps; derive/item accepts blockedBy and blocks non-terminal items via
++  withRoutedBlocking; derive/task exports collectRoutedBlockers (routed blocker
++  concerns' affects) and post-processes all items through the transitive
++  declared-dep cascade before wave derivation; iteration loop threads
++  collectRoutedBlockers into both deriveWaveState calls. All 11 target cases
++  pass.
++target:
++  selectors:
++    - test/engine/routing-blocker-derive.test.ts
++    - test/plan-scheduler.test.ts
++  expectRed:
++    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
++      declared dependents in PM order"
++    - "plan/scheduler: blockedByConcern.unions concern blocking with the
++      failure-blocked fixpoint over declared deps"
++    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
++      blocks a done item"
++    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++      concerns and ignores other statuses and kinds"
++    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
++      no concerns directory"
++    - "derive/wave: routed blocker integration.routes a concern-affected item
++      and its declared dependents to blocked"
++    - "derive/wave: routed blocker integration.cascades transitively over
++      declared deps only"
++    - "derive/item: routed blocker integration.blocks only the item named by a
++      routed blocker"
++    - "derive/item: routed blocker integration.keeps a terminal item status over
++      routed blocking"
++    - "derive/task: routed blocker scenario.blocks affected items and declared
++      dependents, leaving non-dependents pending without writes"
++    - "derive/task: routed blocker scenario.derives the task blocked when every
++      item is in the routed blocker cascade"
++evidence:
++  - bun test test/engine/routing-blocker-derive.test.ts
++    test/plan-scheduler.test.ts -> 24 pass, 0 fail, 43 expects (covers all 11
++    target cases, including the no-writes snapshot-tree assertion)
++  - bun run typecheck (tsc --noEmit) -> exit 0 on final diff
++  - bun test (full project suite) -> 361 pass, 2 skip, 0 fail, 1661 expects
++    across 59 files
++  - bun test test/engine/routing-blocker-derive.test.ts
++    test/plan-scheduler.test.ts test/plan-apply.test.ts test/plan-limits.test.ts
++    test/engine/plan-reviewer-triage.test.ts -> 47 pass, 0 fail on final diff
++    after adding the plan barrel export
++  - git diff --stat -> 6 prod files changed, no test files modified
++concerns:
++  - collectRoutedBlockers trusts concern.affects verbatim; refs naming a
++    non-existent item are inert by construction but are not validated
++  - blockedByConcern/cascadePendingBlocked only block pending items, so already
++    running or ready work is not retro-blocked at scheduler level (derive
++    item-level blocking does cover ready/running non-terminal states)
++  - iteration.ts now reads the concern store on every wave derivation (cheap,
++    but recomputed per refresh to pick up newly routed concerns)
++notes: blockedByConcern returns slugs in PM order, unions blockedByFailure and
++  the concern seeds, then cascades to a fixpoint over declared deps only.
++  deriveTaskState derives items first, computes the routed cascade, then applies
++  withRoutedBlocking so itemMap and every wave state see blocked statuses before
++  wave derivation; terminal outcomes (merged/failed/superseded) are preserved.
+diff --git a/plugins/software-factory/src/core/derive/item.ts b/plugins/software-factory/src/core/derive/item.ts
+index 925d1f7..c08cc9b 100644
+--- a/plugins/software-factory/src/core/derive/item.ts
++++ b/plugins/software-factory/src/core/derive/item.ts
+@@ -54,6 +54,28 @@ export interface DerivedItemState {
+   decisionFingerprints: string[];
+ }
+ 
++/** Terminal item outcomes: routed blockers never override these (§8.2). */
++export const TERMINAL_ITEM_STATUSES: ReadonlySet<DerivedItemState["status"]> = new Set([
++  "merged",
++  "failed",
++  "superseded",
++]);
++
++/**
++ * Applies routed concern blocking (adr-routing-derived-state): an item named by
++ * a routed blocker concern derives `blocked` unless it already reached a
++ * terminal outcome.
++ */
++export function withRoutedBlocking(
++  state: DerivedItemState,
++  blockedBy?: ReadonlySet<string>
++): DerivedItemState {
++  if (!blockedBy?.has(state.slug) || TERMINAL_ITEM_STATUSES.has(state.status)) {
++    return state;
++  }
++  return { ...state, status: "blocked" };
++}
++
+ /**
+  * Derives state of a single item from assignment, step records, decisions, steering, and git (§6, §8).
+  */
+@@ -66,6 +88,8 @@ export async function deriveItemState(opts: {
+   pipeline?: PipelineConfig;
+   project?: ProjectConfig;
+   kindConfig?: FlowKindConfig;
++  /** Slugs named by routed blocker concerns (adr-routing-derived-state). */
++  blockedBy?: Iterable<string>;
+ }): Promise<DerivedItemState> {
+   const { taskDir, itemSlug, parentBranch, taskWt, childWt, pipeline, project } = opts;
+   const itemDir = path.join(taskDir, "items", itemSlug);
+@@ -424,28 +448,31 @@ export async function deriveItemState(opts: {
+     }
+   }
+ 
+-  return {
+-    slug: itemSlug,
+-    kind,
+-    title,
+-    wave,
+-    deps,
+-    status,
+-    assignment,
+-    branch,
+-    records,
+-    currentStepId: records[records.length - 1]?.name,
+-    currentAttempt,
+-    currentFixRound,
+-    isEscalated,
+-    freshSeries: retryDecision && decisionIsFresh,
+-    interruptionCount,
+-    guidanceText,
+-    openSteerQuestion,
+-    mergedAt,
+-    consultCount,
+-    lastFailingCheckFingerprint,
+-    suggestionFingerprints,
+-    decisionFingerprints,
+-  };
++  return withRoutedBlocking(
++    {
++      slug: itemSlug,
++      kind,
++      title,
++      wave,
++      deps,
++      status,
++      assignment,
++      branch,
++      records,
++      currentStepId: records[records.length - 1]?.name,
++      currentAttempt,
++      currentFixRound,
++      isEscalated,
++      freshSeries: retryDecision && decisionIsFresh,
++      interruptionCount,
++      guidanceText,
++      openSteerQuestion,
++      mergedAt,
++      consultCount,
++      lastFailingCheckFingerprint,
++      suggestionFingerprints,
++      decisionFingerprints,
++    },
++    opts.blockedBy ? new Set(opts.blockedBy) : undefined
++  );
+ }
+diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
+index 7128367..15a617f 100644
+--- a/plugins/software-factory/src/core/derive/task.ts
++++ b/plugins/software-factory/src/core/derive/task.ts
+@@ -13,10 +13,11 @@ import type {
+   TriageArtifact,
+ } from "../artifacts.js";
+ import { readYaml, writeYamlAtomic } from "../records/io.js";
+-import { deriveItemState, type DerivedItemState } from "./item.js";
++import { deriveItemState, withRoutedBlocking, TERMINAL_ITEM_STATUSES, type DerivedItemState } from "./item.js";
+ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
+ import { BudgetTracker } from "../budget.js";
+ import { listConcerns } from "../concerns.js";
++import { cascadePendingBlocked } from "../plan/scheduler.js";
+ import { git } from "../git/exec.js";
+ import { isAncestor } from "../git/commit.js";
+ 
+@@ -38,6 +39,21 @@ export interface DerivedTaskState {
+   toStateArtifact(): StateArtifact;
+ }
+ 
++/**
++ * Collects item slugs named by routed blocker concerns (adr-routing-derived-state).
++ * Pure read: the concern store is authoritative; derive never writes.
++ */
++export async function collectRoutedBlockers(taskDir: string): Promise<Set<string>> {
++  const affected = new Set<string>();
++  for (const concern of await listConcerns(taskDir)) {
++    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
++    for (const slug of concern.affects ?? []) {
++      affected.add(slug);
++    }
++  }
++  return affected;
++}
++
+ /**
+  * Derives comprehensive task state from disk and git (§6.3 Invariant 4).
+  * Pure derivation; state.yaml is a materialized view never read for decisions.
+@@ -127,25 +143,41 @@ export async function deriveTaskState(opts: {
+ 
+   // 5. Items
+   const items: DerivedItemState[] = [];
+-  const itemMap: Record<string, DerivedItemState> = {};
+   const itemsDir = path.join(taskDir, "items");
+   if (fs.existsSync(itemsDir)) {
+     const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
+     for (const ent of itemEntries) {
+       if (!ent.isDirectory()) continue;
+-      const itState = await deriveItemState({
+-        taskDir,
+-        itemSlug: ent.name,
+-        parentBranch,
+-        taskWt,
+-        pipeline,
+-        project,
+-      });
+-      items.push(itState);
+-      itemMap[ent.name] = itState;
++      items.push(
++        await deriveItemState({
++          taskDir,
++          itemSlug: ent.name,
++          parentBranch,
++          taskWt,
++          pipeline,
++          project,
++        })
++      );
+     }
+   }
+ 
++  // 5b. Routed blockers (adr-routing-derived-state): a routed blocker concern
++  // blocks the items it affects and their declared dependents, transitively.
++  const routedNames = await collectRoutedBlockers(taskDir);
++  const routedBlocked = new Set<string>();
++  for (const it of items) {
++    if (routedNames.has(it.slug) && !TERMINAL_ITEM_STATUSES.has(it.status)) {
++      routedBlocked.add(it.slug);
++    }
++  }
++  cascadePendingBlocked(items, routedBlocked);
++  const itemMap: Record<string, DerivedItemState> = {};
++  for (let i = 0; i < items.length; i++) {
++    const blocked = withRoutedBlocking(items[i]!, routedBlocked);
++    items[i] = blocked;
++    itemMap[blocked.slug] = blocked;
++  }
++
+   // Sort items deterministically by wave then slug
+   items.sort((a, b) => (a.wave !== b.wave ? a.wave - b.wave : a.slug.localeCompare(b.slug)));
+ 
+diff --git a/plugins/software-factory/src/core/derive/wave.ts b/plugins/software-factory/src/core/derive/wave.ts
+index 06274b1..ed5af6d 100644
+--- a/plugins/software-factory/src/core/derive/wave.ts
++++ b/plugins/software-factory/src/core/derive/wave.ts
+@@ -1,5 +1,5 @@
+ import type { DerivedItemState } from "./item.js";
+-import { blockedByFailure } from "../plan/scheduler.js";
++import { blockedByFailure, cascadePendingBlocked } from "../plan/scheduler.js";
+ 
+ export interface DerivedWaveState {
+   wave: number;
+@@ -24,6 +24,8 @@ export function deriveWaveState(opts: {
+   wave: number;
+   items: DerivedItemState[];
+   maxParallelItems?: number;
++  /** Slugs named by routed blocker concerns; cascaded over declared deps. */
++  blockedBy?: Iterable<string>;
+ }): DerivedWaveState {
+   const { wave, items } = opts;
+   const waveItems = items.filter((it) => it.wave === wave || (it.wave < wave && it.status === "blocked"));
+@@ -41,25 +43,23 @@ export function deriveWaveState(opts: {
+     allBySlug.set(it.slug, it);
+   }
+ 
+-  // Dependents of failed items become blocked-by-failure, cascaded transitively
+-  // to a fixpoint (§8.2): an item blocked this way blocks its own dependents.
++  // Dependents of failed items become blocked-by-failure, and items named by
++  // routed blocker concerns become blocked; both cascade transitively over
++  // declared deps to a fixpoint (§8.2, adr-routing-derived-state).
+   const schedItems = items.map((it) => ({
+     slug: it.slug,
+     wave: String(it.wave),
+     deps: it.deps,
+     status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
+   }));
+-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
+-  let grew = failureBlocked.size > 0;
+-  while (grew) {
+-    grew = false;
+-    for (const it of items) {
+-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
+-        failureBlocked.add(it.slug);
+-        grew = true;
+-      }
++  const blockedSlugs = new Set<string>(blockedByFailure(schedItems));
++  const bySlug = new Map(items.map((it) => [it.slug, it]));
++  for (const slug of opts.blockedBy ?? []) {
++    if (bySlug.get(slug)?.status === "pending") {
++      blockedSlugs.add(slug);
+     }
+   }
++  cascadePendingBlocked(items, blockedSlugs);
+ 
+   for (const it of waveItems) {
+     if (it.status === "merged") {
+@@ -75,8 +75,8 @@ export function deriveWaveState(opts: {
+     } else if (it.status === "blocked") {
+       blocked.push(it);
+     } else if (it.status === "pending") {
+-      // Blocked-by-failure (transitive fixpoint computed above) routes to blocked.
+-      if (failureBlocked.has(it.slug)) {
++      // Blocked by failure or a routed concern (transitive fixpoint computed above).
++      if (blockedSlugs.has(it.slug)) {
+         blocked.push(it);
+         continue;
+       }
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 58b8bd6..313559a 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -24,7 +24,7 @@ import { mergeItem } from "./merge-path.js";
+ import { tickItemMachine } from "./item-machine.js";
+ import { deriveItemState } from "../derive/item.js";
+ import { deriveWaveState } from "../derive/wave.js";
+-import { refreshStateYaml } from "../derive/task.js";
++import { refreshStateYaml, collectRoutedBlockers } from "../derive/task.js";
+ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+@@ -729,7 +729,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
+       )
+     );
+-    let waveState = deriveWaveState({ wave: w, items: itemStates });
++    let waveState = deriveWaveState({
++      wave: w,
++      items: itemStates,
++      blockedBy: await collectRoutedBlockers(taskDir),
++    });
+ 
+     if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
+       continue;
+@@ -802,7 +806,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+           deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
+         )
+       );
+-      waveState = deriveWaveState({ wave: w, items: itemStates });
++      waveState = deriveWaveState({
++        wave: w,
++        items: itemStates,
++        blockedBy: await collectRoutedBlockers(taskDir),
++      });
+       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
+     }
+ 
+diff --git a/plugins/software-factory/src/core/plan/index.ts b/plugins/software-factory/src/core/plan/index.ts
+index 7ab8f71..64b9670 100644
+--- a/plugins/software-factory/src/core/plan/index.ts
++++ b/plugins/software-factory/src/core/plan/index.ts
+@@ -3,6 +3,7 @@ export { applyEdits } from "./apply.js";
+ export {
+   type SchedItem,
+   blockedByFailure,
++  blockedByConcern,
+   nextWave,
+   runnable,
+ } from "./scheduler.js";
+diff --git a/plugins/software-factory/src/core/plan/scheduler.ts b/plugins/software-factory/src/core/plan/scheduler.ts
+index 836a6d6..fa78e0a 100644
+--- a/plugins/software-factory/src/core/plan/scheduler.ts
++++ b/plugins/software-factory/src/core/plan/scheduler.ts
+@@ -33,6 +33,50 @@ export function blockedByFailure(items: SchedItem[]): string[] {
+     .map((i) => i.slug);
+ }
+ 
++/**
++ * Expands blocked slugs to a fixpoint over declared `deps` (§8.2): a pending
++ * item depending on any blocked slug can never run, so it is blocked too.
++ * Mutates `blocked` in place and returns it.
++ */
++export function cascadePendingBlocked<T extends { slug: string; deps: string[]; status: string }>(
++  items: T[],
++  blocked: Set<string>
++): Set<string> {
++  let grew = blocked.size > 0;
++  while (grew) {
++    grew = false;
++    for (const item of items) {
++      if (item.status !== "pending" || blocked.has(item.slug) || !item.deps.some((d) => blocked.has(d))) {
++        continue;
++      }
++      blocked.add(item.slug);
++      grew = true;
++    }
++  }
++  return blocked;
++}
++
++/**
++ * Returns the slugs blocked by routed concern blockers (adr-routing-derived-state).
++ *
++ * `concernBlocked` names items that routed blocker concerns affect. A pending
++ * affected item is blocked, and pending items depending on any blocked slug are
++ * blocked transitively to a fixpoint. The result unions with `blockedByFailure`
++ * so callers see one failure/concern picture. Refs naming no item, terminal
++ * items, and non-pending work are ignored. Preserves input (PM) order.
++ */
++export function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
++  const bySlug = new Map(items.map((i) => [i.slug, i]));
++  const blocked = new Set(blockedByFailure(items));
++  for (const slug of concernBlocked) {
++    if (bySlug.get(slug)?.status === "pending") {
++      blocked.add(slug);
++    }
++  }
++  cascadePendingBlocked(items, blocked);
++  return items.filter((i) => blocked.has(i.slug)).map((i) => i.slug);
++}
++
+ /**
+  * Determines the next wave to execute according to wave sequence order (§8.4).
+  *
+diff --git a/plugins/software-factory/test/engine/routing-blocker-derive.test.ts b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+new file mode 100644
+index 0000000..a43e763
+--- /dev/null
++++ b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+@@ -0,0 +1,343 @@
++import { afterEach, describe, expect, it } from "bun:test";
++import fs from "node:fs";
++import os from "node:os";
++import path from "node:path";
++import * as deriveTaskModule from "../../src/core/derive/task.js";
++import { deriveItemState, type DerivedItemState } from "../../src/core/derive/item.js";
++import { deriveWaveState } from "../../src/core/derive/wave.js";
++import type { StoredConcernArtifact } from "../../src/core/artifacts.js";
++
++/**
++ * Routed blockers are pure derive data (adr-routing-derived-state): a `routed`
++ * concern of kind `blocker` names the items it affects (`affects`), and derive
++ * marks the named items plus their declared dependents blocked. Derivation
++ * never writes: no concern, decision, mailbox, or state files change.
++ */
++
++type CollectRoutedBlockers = (taskDir: string) => Promise<Set<string>>;
++
++/**
++ * Test-first seam: while `derive/task.ts` does not yet export the collector,
++ * an inert fallback keeps module collection alive so the behavioural
++ * assertions fail as assertion failures (target-red), not import errors.
++ */
++const collectRoutedBlockers: CollectRoutedBlockers =
++  (deriveTaskModule as unknown as { collectRoutedBlockers?: CollectRoutedBlockers })
++    .collectRoutedBlockers ?? (async () => new Set<string>());
++
++type ItemDeriveOpts = Parameters<typeof deriveItemState>[0] & {
++  blockedBy?: Iterable<string>;
++};
++type WaveDeriveOpts = Parameters<typeof deriveWaveState>[0] & {
++  blockedBy?: Iterable<string>;
++};
++
++const tmpDirs: string[] = [];
++
++function makeTaskDir(): string {
++  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-routed-blocker-"));
++  tmpDirs.push(dir);
++  return dir;
++}
++
++afterEach(() => {
++  for (const dir of tmpDirs.splice(0)) {
++    fs.rmSync(dir, { recursive: true, force: true });
++  }
++});
++
++async function routedBlockedSlugs(taskDir: string): Promise<Set<string>> {
++  return collectRoutedBlockers(taskDir);
++}
++
++function writeItem(
++  taskDir: string,
++  slug: string,
++  opts: { wave?: number; deps?: string[] } = {}
++): void {
++  const dir = path.join(taskDir, "items", slug);
++  fs.mkdirSync(dir, { recursive: true });
++  const deps = opts.deps ?? [];
++  const depsYaml =
++    deps.length === 0 ? "deps: []" : `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}`;
++  fs.writeFileSync(
++    path.join(dir, "assignment.yaml"),
++    [
++      `slug: ${slug}`,
++      "kind: dev",
++      `title: ${slug}`,
++      "assignment: Do the work",
++      `wave: ${opts.wave ?? 1}`,
++      depsYaml,
++    ].join("\n") + "\n",
++    "utf8"
++  );
++}
++
++function writeConcern(
++  taskDir: string,
++  concern: Pick<StoredConcernArtifact, "id" | "kind" | "summary" | "status"> &
++    Partial<StoredConcernArtifact>
++): void {
++  const dir = path.join(taskDir, "concerns");
++  fs.mkdirSync(dir, { recursive: true });
++  const record = {
++    detail: concern.summary,
++    severity: "medium",
++    source: { record: "test-first", agent: "test" },
++    createdAt: "2026-01-01T00:00:00.000Z",
++    updatedAt: "2026-01-01T00:00:00.000Z",
++    ...concern,
++  };
++  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(record, null, 2), "utf8");
++}
++
++function derivedItem(partial: Partial<DerivedItemState> & { slug: string }): DerivedItemState {
++  return {
++    kind: "dev",
++    title: partial.slug,
++    wave: 1,
++    deps: [],
++    status: "pending",
++    branch: `topic/routing-blocker--${partial.slug}`,
++    records: [],
++    currentAttempt: 1,
++    currentFixRound: 1,
++    isEscalated: false,
++    freshSeries: false,
++    interruptionCount: 0,
++    consultCount: 0,
++    suggestionFingerprints: [],
++    decisionFingerprints: [],
++    ...partial,
++  };
++}
++
++/** Reads every file under `root` so a test can prove derive is write-free. */
++function snapshotTree(root: string): Record<string, string> {
++  const out: Record<string, string> = {};
++  const walk = (dir: string) => {
++    const entries = fs
++      .readdirSync(dir, { withFileTypes: true })
++      .sort((a, b) => a.name.localeCompare(b.name));
++    for (const entry of entries) {
++      const full = path.join(dir, entry.name);
++      if (entry.isDirectory()) walk(full);
++      else out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
++    }
++  };
++  walk(root);
++  return out;
++}
++
++describe("derive/task: collectRoutedBlockers", () => {
++  it("collects affects of routed blocker concerns and ignores other statuses and kinds", async () => {
++    const taskDir = makeTaskDir();
++    writeConcern(taskDir, {
++      id: "c-routed-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Schema migration is pending",
++      affects: ["item-b", "item-c"],
++    });
++    writeConcern(taskDir, {
++      id: "c-open-blocker",
++      kind: "blocker",
++      status: "open",
++      summary: "Not triaged yet",
++      affects: ["item-open"],
++    });
++    writeConcern(taskDir, {
++      id: "c-routed-risk",
++      kind: "risk",
++      status: "routed",
++      summary: "Routed risk",
++      affects: ["item-risk"],
++    });
++    writeConcern(taskDir, {
++      id: "c-resolved-blocker",
++      kind: "blocker",
++      status: "resolved",
++      summary: "Already handled",
++      affects: ["item-resolved"],
++    });
++    writeConcern(taskDir, {
++      id: "c-dismissed-blocker",
++      kind: "blocker",
++      status: "dismissed",
++      summary: "Dismissed by the reviewer",
++      affects: ["item-dismissed"],
++    });
++
++    const blocked = await routedBlockedSlugs(taskDir);
++    expect(blocked).toBeInstanceOf(Set);
++    expect([...blocked].sort()).toEqual(["item-b", "item-c"]);
++  });
++
++  it("returns an empty set when the task has no concerns directory", async () => {
++    const taskDir = makeTaskDir();
++
++    expect([...(await routedBlockedSlugs(taskDir))]).toEqual([]);
++
++    // The same derive seam starts reporting once a routed blocker is stored.
++    writeConcern(taskDir, {
++      id: "c-late-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Discovered after the first derive",
++      affects: ["late-item"],
++    });
++    expect([...(await routedBlockedSlugs(taskDir))].sort()).toEqual(["late-item"]);
++  });
++});
++
++describe("derive/wave: routed blocker integration", () => {
++  it("routes a concern-affected item and its declared dependents to blocked", () => {
++    const items = [
++      derivedItem({ slug: "seed", wave: 8 }),
++      derivedItem({ slug: "dependent", wave: 8, deps: ["seed"] }),
++      derivedItem({ slug: "independent", wave: 8, deps: [] }),
++    ];
++
++    const wave = deriveWaveState({
++      wave: 8,
++      items,
++      blockedBy: new Set(["seed"]),
++    } as WaveDeriveOpts);
++
++    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["dependent", "seed"]);
++    expect(wave.runnable.map((i) => i.slug)).toEqual(["independent"]);
++  });
++
++  it("cascades transitively over declared deps only", () => {
++    const items = [
++      derivedItem({ slug: "seed", wave: 8 }),
++      derivedItem({ slug: "child", wave: 8, deps: ["seed"] }),
++      derivedItem({ slug: "grandchild", wave: 8, deps: ["child"] }),
++      derivedItem({ slug: "side", wave: 8, deps: [] }),
++    ];
++
++    const wave = deriveWaveState({
++      wave: 8,
++      items,
++      blockedBy: new Set(["seed"]),
++    } as WaveDeriveOpts);
++
++    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["child", "grandchild", "seed"]);
++    expect(wave.runnable.map((i) => i.slug)).toEqual(["side"]);
++  });
++});
++
++describe("derive/item: routed blocker integration", () => {
++  it("blocks only the item named by a routed blocker", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "affected");
++    writeItem(taskDir, "unaffected");
++    const blockedBy = new Set(["affected"]);
++
++    const affected = await deriveItemState({
++      taskDir,
++      itemSlug: "affected",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++    const unaffected = await deriveItemState({
++      taskDir,
++      itemSlug: "unaffected",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++
++    expect(affected.status).toBe("blocked");
++    expect(unaffected.status).toBe("pending");
++  });
++
++  it("keeps a terminal item status over routed blocking", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "abandoned");
++    writeItem(taskDir, "blocked-one");
++    const decisionsDir = path.join(taskDir, "decisions");
++    fs.mkdirSync(decisionsDir, { recursive: true });
++    fs.writeFileSync(
++      path.join(decisionsDir, "001-abandon.yaml"),
++      JSON.stringify({
++        id: "decision-abandon",
++        context: "item",
++        item: "abandoned",
++        decision: "abandon",
++        rationale: "No longer needed",
++        timestamp: "2026-01-01T00:00:00.000Z",
++      }),
++      "utf8"
++    );
++    const blockedBy = new Set(["abandoned", "blocked-one"]);
++
++    const abandoned = await deriveItemState({
++      taskDir,
++      itemSlug: "abandoned",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++    const blockedOne = await deriveItemState({
++      taskDir,
++      itemSlug: "blocked-one",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++
++    expect(abandoned.status).toBe("failed");
++    expect(blockedOne.status).toBe("blocked");
++  });
++});
++
++describe("derive/task: routed blocker scenario", () => {
++  it("blocks affected items and declared dependents, leaving non-dependents pending without writes", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "blocker-source", { wave: 1 });
++    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
++    writeItem(taskDir, "transitive", { wave: 3, deps: ["dependent"] });
++    writeItem(taskDir, "independent", { wave: 3 });
++    writeConcern(taskDir, {
++      id: "c-routed-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Upstream schema migration blocks the wave",
++      affects: ["blocker-source"],
++    });
++
++    const before = snapshotTree(taskDir);
++    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
++    const after = snapshotTree(taskDir);
++
++    expect(state.itemMap["blocker-source"]?.status).toBe("blocked");
++    expect(state.itemMap["dependent"]?.status).toBe("blocked");
++    expect(state.itemMap["transitive"]?.status).toBe("blocked");
++    expect(state.itemMap["independent"]?.status).toBe("pending");
++
++    expect(state.waves.find((w) => w.wave === 2)?.blocked.map((i) => i.slug)).toContain("dependent");
++    const wave3 = state.waves.find((w) => w.wave === 3);
++    expect(wave3?.blocked.map((i) => i.slug)).toContain("transitive");
++    expect(wave3?.runnable.map((i) => i.slug)).toContain("independent");
++
++    // Pure derive: no concern/decision/mailbox/state file is written or changed.
++    expect(after).toEqual(before);
++  });
++
++  it("derives the task blocked when every item is in the routed blocker cascade", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "blocker-source", { wave: 1 });
++    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
++    writeConcern(taskDir, {
++      id: "c-routed-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Blocked until the operator answers",
++      affects: ["blocker-source"],
++    });
++
++    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
++
++    expect(state.itemMap["dependent"]?.status).toBe("blocked");
++    expect(state.status).toBe("blocked");
++  });
++});
+diff --git a/plugins/software-factory/test/plan-scheduler.test.ts b/plugins/software-factory/test/plan-scheduler.test.ts
+index 7f34551..d408fdd 100644
+--- a/plugins/software-factory/test/plan-scheduler.test.ts
++++ b/plugins/software-factory/test/plan-scheduler.test.ts
+@@ -1,6 +1,22 @@
+ import { describe, expect, it } from "bun:test";
++import * as schedulerModule from "../src/core/plan/scheduler.js";
+ import { blockedByFailure, nextWave, runnable, type SchedItem } from "../src/core/plan/scheduler.js";
+ 
++const blockedByConcernImpl = (
++  schedulerModule as unknown as {
++    blockedByConcern?: (items: SchedItem[], concernBlocked: Iterable<string>) => string[];
++  }
++).blockedByConcern;
++
++/**
++ * Test-first seam: while the scheduler does not yet export `blockedByConcern`,
++ * the inert fallback keeps module collection alive so the behavioural
++ * assertions fail as assertion failures (target-red), not import errors.
++ */
++function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
++  return blockedByConcernImpl ? blockedByConcernImpl(items, concernBlocked) : [];
++}
++
+ describe("plan/scheduler: nextWave", () => {
+   it("returns current active wave while items are pending or running", () => {
+     const items: SchedItem[] = [
+@@ -172,3 +188,43 @@ describe("plan/scheduler: blockedByFailure", () => {
+     expect(blockedByFailure(items)).toEqual([]);
+   });
+ });
++
++describe("plan/scheduler: blockedByConcern", () => {
++  it("blocks concern-affected items and their declared dependents in PM order", () => {
++    const items: SchedItem[] = [
++      { slug: "seed", wave: "8", deps: [], status: "pending" },
++      { slug: "dependent", wave: "8", deps: ["seed"], status: "pending" },
++      { slug: "independent", wave: "8", deps: [], status: "pending" },
++    ];
++
++    expect(blockedByConcern(items, ["seed"])).toEqual(["seed", "dependent"]);
++  });
++
++  it("unions concern blocking with the failure-blocked fixpoint over declared deps", () => {
++    const items: SchedItem[] = [
++      { slug: "failed", wave: "8", deps: [], status: "failed" },
++      { slug: "failure-dependent", wave: "8", deps: ["failed"], status: "pending" },
++      { slug: "failure-transitive", wave: "8", deps: ["failure-dependent"], status: "pending" },
++      { slug: "seed", wave: "8", deps: [], status: "pending" },
++      { slug: "concern-dependent", wave: "8", deps: ["seed"], status: "pending" },
++      { slug: "independent", wave: "8", deps: [], status: "pending" },
++    ];
++
++    expect(blockedByConcern(items, ["seed"])).toEqual([
++      "failure-dependent",
++      "failure-transitive",
++      "seed",
++      "concern-dependent",
++    ]);
++  });
++
++  it("ignores refs naming no item and never blocks a done item", () => {
++    const items: SchedItem[] = [
++      { slug: "already-done", wave: "8", deps: [], status: "done" },
++      { slug: "seed", wave: "8", deps: [], status: "pending" },
++      { slug: "other", wave: "8", deps: [], status: "pending" },
++    ];
++
++    expect(blockedByConcern(items, ["plan", "already-done", "seed"])).toEqual(["seed"]);
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..0fbe323
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/meta.yaml
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
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T10:28:04.421Z
+session: 01a1bab3-75b6-7705-90b5-c14321b3db0c
+endedAt: 2026-11-08T10:42:08.808Z
+usage:
+  inputTokens: 41505
+  outputTokens: 21897
+  costUsd: 0.009571
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-28-05-686Z_01a1bab3-75b6-7705-90b5-c14321b3db0c
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..080c164
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,37 @@
+status: approved
+summary: 11/11 red->green verified, no weakening, pure-derive holds
+suggestions:
+  - id: test-seam-cleanup
+    disposition: optional
+    summary: Replace test-first fallback seams with direct imports
+    detail: Both suites capture new exports via dynamic lookup with inert fallbacks
+      (empty Set/[]) to force assertion-failures for target-red. Now that
+      collectRoutedBlockers and blockedByConcern exist, direct static imports
+      fail fast on missing exports and gain type checking. Current form still
+      exercises real code and fails behaviorally if exports removed, so polish
+      only.
+    location:
+      file: plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+      line: 24
+  - id: drop-blockedby-casts
+    disposition: optional
+    summary: Drop now-redundant blockedBy option casts
+    detail: "ItemDeriveOpts/WaveDeriveOpts intersection plus `as` casts were needed
+      pre-implementation; deriveItemState/deriveWaveState now type blockedBy?:
+      Iterable<string>. Removing casts tightens type checking without behavior
+      change."
+    location:
+      file: plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+      line: 28
+  - id: wave-report-routed-label
+    disposition: optional
+    summary: Wave report conflates routed-blocked with failure-blocked
+    detail: iteration.ts derives blockedByFailureSlugs from waveState.blocked via
+      deps-on-failed-or-blocked predicate. Routed dependents satisfy same
+      predicate and will be labeled Blocked-by-failure in summary/artifact while
+      dep-less seeds are omitted. Pure-derive scope is correct; downstream
+      routing-architect-consult act-phase should distinguish failure vs routed
+      when reporting.
+    location:
+      file: plugins/software-factory/src/core/flows/iteration.ts
+      line: 878
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/input.md
new file mode 100644
index 0000000..f18a71e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/input.md
@@ -0,0 +1,2946 @@
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
+  "slug": "routing-blocker-derive-v2",
+  "kind": "dev",
+  "title": "Blocker derive",
+  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
+  "outlineRef": "routing-blocker-derive-v2",
+  "milestone": "m3-routing",
+  "wave": 8,
+  "deps": [
+    "modes-prompts-v2",
+    "plan-reviewer-triage-v2",
+    "reviewer-triage-v2"
+  ],
+  "escalate": true
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..0537fb6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,68 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/plan-scheduler.test.ts
++        - plugins/software-factory/test/engine/routing-blocker-derive.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 11 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794133110930-b4q7dn451v6.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - "plan/scheduler: nextWave.returns current active wave while items are
++          pending or running"
++        - "plan/scheduler: nextWave.advances to next wave when all items in
++          current wave are terminal"
++        - "plan/scheduler: nextWave.returns null when all items across all waves
++          are terminal"
++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
++          is omitted"
++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
++          deps as blocked for wave advancement"
++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
++          cascade is the engine's job"
++        - "plan/scheduler: runnable.respects dependencies: pending item only
++          runs when all deps are done"
++        - "plan/scheduler: runnable.respects active wave filter"
++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
++          current running count"
++        - "plan/scheduler: runnable.preserves PM order"
++        - "plan/scheduler: runnable.never returns items whose deps failed"
++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
++          abandoned deps, in PM order"
++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
++          or been abandoned"
++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
++          their declared dependents in PM order"
++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
++          failure-blocked fixpoint over declared deps"
++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
++          never blocks a done item"
++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++          concerns and ignores other statuses and kinds"
++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
++          has no concerns directory"
++        - "derive/wave: routed blocker integration.routes a concern-affected
++          item and its declared dependents to blocked"
++        - "derive/wave: routed blocker integration.cascades transitively over
++          declared deps only"
++        - "derive/item: routed blocker integration.blocks only the item named by
++          a routed blocker"
++        - "derive/item: routed blocker integration.keeps a terminal item status
++          over routed blocking"
++        - "derive/task: routed blocker scenario.blocks affected items and
++          declared dependents, leaving non-dependents pending without writes"
++        - "derive/task: routed blocker scenario.derives the task blocked when
++          every item is in the routed blocker cascade"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..4697cf2
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,55 @@
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
++  "slug": "routing-blocker-derive-v2",
++  "kind": "dev",
++  "title": "Blocker derive",
++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
++  "outlineRef": "routing-blocker-derive-v2",
++  "milestone": "m3-routing",
++  "wave": 8,
++  "deps": [
++    "modes-prompts-v2",
++    "plan-reviewer-triage-v2",
++    "reviewer-triage-v2"
++  ],
++  "escalate": true
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
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..00b0846
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T10:03:13.836Z
++session: 01a1ba9c-b455-72a5-9f1e-29f85bf10fe5
++endedAt: 2026-11-08T10:18:31.204Z
++usage:
++  inputTokens: 144926
++  outputTokens: 53206
++  costUsd: 0.072089
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-03-14-389Z_01a1ba9c-b455-72a5-9f1e-29f85bf10fe5.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..03ab7e5
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,84 @@
++status: ok
++summary: "Authored test-first coverage for routed-blocker derivation (no
++  production code touched). New test/engine/routing-blocker-derive.test.ts
++  covers: collectRoutedBlockers reading only routed kind==blocker affects
++  (open/resolved/dismissed/other kinds ignored, missing concerns dir,
++  late-arriving blocker); deriveWaveState blockedBy routing an affected item
++  plus declared dependents while non-dependents stay runnable and transitive
++  cascade follows deps only; deriveItemState blockedBy marking only the named
++  item and preserving terminal (abandoned/failed) status; and deriveTaskState
++  end-to-end deriving itemMap/waves blocked statuses for seed + dependent +
++  transitive while an independent item stays pending, with a full task-tree
++  snapshot proving derivation writes nothing, plus task status blocked when
++  every item is in the cascade. Added plan/scheduler: blockedByConcern tests to
++  test/plan-scheduler.test.ts covering PM-order blocking of affected items and
++  declared dependents, union with the failure-blocked fixpoint (direct +
++  transitive), and ignoring dangling/plan refs and terminal (done) items. All 11
++  declared target tests fail with assertion failures (not import/collection
++  errors) on the current production code; the 13 pre-existing scheduler tests
++  still pass; typecheck is clean."
++target:
++  selectors:
++    - test/engine/routing-blocker-derive.test.ts
++    - test/plan-scheduler.test.ts
++  expectRed:
++    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
++      declared dependents in PM order"
++    - "plan/scheduler: blockedByConcern.unions concern blocking with the
++      failure-blocked fixpoint over declared deps"
++    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
++      blocks a done item"
++    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++      concerns and ignores other statuses and kinds"
++    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
++      no concerns directory"
++    - "derive/wave: routed blocker integration.routes a concern-affected item
++      and its declared dependents to blocked"
++    - "derive/wave: routed blocker integration.cascades transitively over
++      declared deps only"
++    - "derive/item: routed blocker integration.blocks only the item named by a
++      routed blocker"
++    - "derive/item: routed blocker integration.keeps a terminal item status over
++      routed blocking"
++    - "derive/task: routed blocker scenario.blocks affected items and declared
++      dependents, leaving non-dependents pending without writes"
++    - "derive/task: routed blocker scenario.derives the task blocked when every
++      item is in the routed blocker cascade"
++evidence:
++  - Installed workspace deps with `cd plugins/software-factory && bun install
++    --frozen-lockfile` (node_modules gitignored) so bun can resolve the `yaml`
++    import chain used by derive tests.
++  - "Proved red classification first with a scratch bun test: a failed `expect`
++    is emitted as `<failure>` (status fail) in bun's JUnit reporter, while
++    runtime exceptions become `<error>`, so a missing symbol alone would not
++    satisfy target-red."
++  - "Ran the exact engine target command from the worktree root: `cd
++    plugins/software-factory && bun test
++    test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++    --reporter=junit --reporter-outfile=/tmp/junit-target.xml`; exit code 1 with
++    13 pass / 11 fail."
++  - "Parsed the JUnit XML with Python: all 11 declared expectRed ids are
++    present, each with a `<failure>` element and 0 `<error>` elements; no
++    declared id is missing and no declared test passes."
++  - "Re-ran the exact target command under the ambient TMPDIR
++    (`.../.factory-runtime/tmp`): same 11 failures / 0 errors, so the red target
++    does not depend on the TMPDIR head-guard caveat."
++  - "Ran `cd plugins/software-factory && bun run typecheck` (tsc --noEmit):
++    pass, confirming the test-only additions compile under strict settings with
++    no production changes."
++  - "Verified `git status --short`: only
++    `plugins/software-factory/test/plan-scheduler.test.ts` (modified) and
++    `plugins/software-factory/test/engine/routing-blocker-derive.test.ts` (new)
++    changed; no production files touched."
++notes: "Test-first seams use inert local fallbacks (empty Set / empty array) for
++  the not-yet-existing collectRoutedBlockers and blockedByConcern exports, so
++  every red failure is a behavioural assertion rather than a module
++  import/collection error. The end-to-end scenario snapshots the entire task
++  tree before/after deriveTaskState to enforce the pure-derive/no-writes
++  constraint. Expected implementation contract: deriveWaveState/deriveItemState
++  accept `blockedBy?: Iterable<string>`; scheduler.blockedByConcern(items,
++  concernBlocked) returns a PM-ordered union of concern seeds and
++  direct/transitive failure blocking; deriveTaskState collects routed blocker
++  affects, marks directly affected items and their declared-dependency cascade
++  blocked in itemMap/waves, and leaves non-dependents pending."
++concerns: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..5e56e81
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,121 @@
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
++        durationMs: 4267
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 66017
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-WTJIgy/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
++
++           361 pass
++           2 skip
++           0 fail
++           1661 expect() calls
++          Ran 363 tests across 59 files. [65.88s]
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
++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794133678161-h4umdoqwcu.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - "plan/scheduler: nextWave.returns current active wave while items are
++          pending or running"
++        - "plan/scheduler: nextWave.advances to next wave when all items in
++          current wave are terminal"
++        - "plan/scheduler: nextWave.returns null when all items across all waves
++          are terminal"
++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
++          is omitted"
++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
++          deps as blocked for wave advancement"
++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
++          cascade is the engine's job"
++        - "plan/scheduler: runnable.respects dependencies: pending item only
++          runs when all deps are done"
++        - "plan/scheduler: runnable.respects active wave filter"
++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
++          current running count"
++        - "plan/scheduler: runnable.preserves PM order"
++        - "plan/scheduler: runnable.never returns items whose deps failed"
++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
++          abandoned deps, in PM order"
++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
++          or been abandoned"
++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
++          their declared dependents in PM order"
++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
++          failure-blocked fixpoint over declared deps"
++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
++          never blocks a done item"
++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++          concerns and ignores other statuses and kinds"
++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
++          has no concerns directory"
++        - "derive/wave: routed blocker integration.routes a concern-affected
++          item and its declared dependents to blocked"
++        - "derive/wave: routed blocker integration.cascades transitively over
++          declared deps only"
++        - "derive/item: routed blocker integration.blocks only the item named by
++          a routed blocker"
++        - "derive/item: routed blocker integration.keeps a terminal item status
++          over routed blocking"
++        - "derive/task: routed blocker scenario.blocks affected items and
++          declared dependents, leaving non-dependents pending without writes"
++        - "derive/task: routed blocker scenario.derives the task blocked when
++          every item is in the routed blocker cascade"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 218/300 production lines changed"
++    details:
++      changedLines:
++        added: 165
++        deleted: 53
++        total: 218
++        files:
++          - plugins/software-factory/src/core/derive/item.ts
++          - plugins/software-factory/src/core/derive/task.ts
++          - plugins/software-factory/src/core/derive/wave.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/plan/index.ts
++          - plugins/software-factory/src/core/plan/scheduler.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..1272543
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,72 @@
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
++  "slug": "routing-blocker-derive-v2",
++  "kind": "dev",
++  "title": "Blocker derive",
++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
++  "outlineRef": "routing-blocker-derive-v2",
++  "milestone": "m3-routing",
++  "wave": 8,
++  "deps": [
++    "modes-prompts-v2",
++    "plan-reviewer-triage-v2",
++    "reviewer-triage-v2"
++  ],
++  "escalate": true
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/routing-blocker-derive.test.ts",
++    "test/plan-scheduler.test.ts"
++  ],
++  "expectRed": [
++    "plan/scheduler: blockedByConcern.blocks concern-affected items and their declared dependents in PM order",
++    "plan/scheduler: blockedByConcern.unions concern blocking with the failure-blocked fixpoint over declared deps",
++    "plan/scheduler: blockedByConcern.ignores refs naming no item and never blocks a done item",
++    "derive/task: collectRoutedBlockers.collects affects of routed blocker concerns and ignores other statuses and kinds",
++    "derive/task: collectRoutedBlockers.returns an empty set when the task has no concerns directory",
++    "derive/wave: routed blocker integration.routes a concern-affected item and its declared dependents to blocked",
++    "derive/wave: routed blocker integration.cascades transitively over declared deps only",
++    "derive/item: routed blocker integration.blocks only the item named by a routed blocker",
++    "derive/item: routed blocker integration.keeps a terminal item status over routed blocking",
++    "derive/task: routed blocker scenario.blocks affected items and declared dependents, leaving non-dependents pending without writes",
++    "derive/task: routed blocker scenario.derives the task blocked when every item is in the routed blocker cascade"
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
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..cbdad77
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
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
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T10:18:38.750Z
++session: 01a1baaa-d0d8-7482-b92e-37da0ab0d209
++endedAt: 2026-11-08T10:27:58.410Z
++usage:
++  inputTokens: 47017
++  outputTokens: 27170
++  costUsd: 0.030267
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-18-39-192Z_01a1baaa-d0d8-7482-b92e-37da0ab0d209.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..9472c7f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,62 @@
++status: ok
++summary: Implemented routed-blocker derive (pure derive, no writes). Added
++  scheduler.blockedByConcern + shared cascadePendingBlocked fixpoint;
++  derive/wave now unions routed-blocker seeds with blockedByFailure over
++  declared deps; derive/item accepts blockedBy and blocks non-terminal items via
++  withRoutedBlocking; derive/task exports collectRoutedBlockers (routed blocker
++  concerns' affects) and post-processes all items through the transitive
++  declared-dep cascade before wave derivation; iteration loop threads
++  collectRoutedBlockers into both deriveWaveState calls. All 11 target cases
++  pass.
++target:
++  selectors:
++    - test/engine/routing-blocker-derive.test.ts
++    - test/plan-scheduler.test.ts
++  expectRed:
++    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
++      declared dependents in PM order"
++    - "plan/scheduler: blockedByConcern.unions concern blocking with the
++      failure-blocked fixpoint over declared deps"
++    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
++      blocks a done item"
++    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++      concerns and ignores other statuses and kinds"
++    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
++      no concerns directory"
++    - "derive/wave: routed blocker integration.routes a concern-affected item
++      and its declared dependents to blocked"
++    - "derive/wave: routed blocker integration.cascades transitively over
++      declared deps only"
++    - "derive/item: routed blocker integration.blocks only the item named by a
++      routed blocker"
++    - "derive/item: routed blocker integration.keeps a terminal item status over
++      routed blocking"
++    - "derive/task: routed blocker scenario.blocks affected items and declared
++      dependents, leaving non-dependents pending without writes"
++    - "derive/task: routed blocker scenario.derives the task blocked when every
++      item is in the routed blocker cascade"
++evidence:
++  - bun test test/engine/routing-blocker-derive.test.ts
++    test/plan-scheduler.test.ts -> 24 pass, 0 fail, 43 expects (covers all 11
++    target cases, including the no-writes snapshot-tree assertion)
++  - bun run typecheck (tsc --noEmit) -> exit 0 on final diff
++  - bun test (full project suite) -> 361 pass, 2 skip, 0 fail, 1661 expects
++    across 59 files
++  - bun test test/engine/routing-blocker-derive.test.ts
++    test/plan-scheduler.test.ts test/plan-apply.test.ts test/plan-limits.test.ts
++    test/engine/plan-reviewer-triage.test.ts -> 47 pass, 0 fail on final diff
++    after adding the plan barrel export
++  - git diff --stat -> 6 prod files changed, no test files modified
++concerns:
++  - collectRoutedBlockers trusts concern.affects verbatim; refs naming a
++    non-existent item are inert by construction but are not validated
++  - blockedByConcern/cascadePendingBlocked only block pending items, so already
++    running or ready work is not retro-blocked at scheduler level (derive
++    item-level blocking does cover ready/running non-terminal states)
++  - iteration.ts now reads the concern store on every wave derivation (cheap,
++    but recomputed per refresh to pick up newly routed concerns)
++notes: blockedByConcern returns slugs in PM order, unions blockedByFailure and
++  the concern seeds, then cascades to a fixpoint over declared deps only.
++  deriveTaskState derives items first, computes the routed cascade, then applies
++  withRoutedBlocking so itemMap and every wave state see blocked statuses before
++  wave derivation; terminal outcomes (merged/failed/superseded) are preserved.
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..8fb38c9
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/checks.yaml
+@@ -0,0 +1,66 @@
++checks:
++  - id: red-test
++    status: pass
++    message: "red-test passed: all 11 tests fail when prod changes are restored to
++      test-first commit"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794133684463-6u040o06mre.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - "plan/scheduler: nextWave.returns current active wave while items are
++          pending or running"
++        - "plan/scheduler: nextWave.advances to next wave when all items in
++          current wave are terminal"
++        - "plan/scheduler: nextWave.returns null when all items across all waves
++          are terminal"
++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
++          is omitted"
++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
++          deps as blocked for wave advancement"
++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
++          cascade is the engine's job"
++        - "plan/scheduler: runnable.respects dependencies: pending item only
++          runs when all deps are done"
++        - "plan/scheduler: runnable.respects active wave filter"
++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
++          current running count"
++        - "plan/scheduler: runnable.preserves PM order"
++        - "plan/scheduler: runnable.never returns items whose deps failed"
++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
++          abandoned deps, in PM order"
++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
++          or been abandoned"
++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
++          their declared dependents in PM order"
++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
++          failure-blocked fixpoint over declared deps"
++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
++          never blocks a done item"
++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
++          concerns and ignores other statuses and kinds"
++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
++          has no concerns directory"
++        - "derive/wave: routed blocker integration.routes a concern-affected
++          item and its declared dependents to blocked"
++        - "derive/wave: routed blocker integration.cascades transitively over
++          declared deps only"
++        - "derive/item: routed blocker integration.blocks only the item named by
++          a routed blocker"
++        - "derive/item: routed blocker integration.keeps a terminal item status
++          over routed blocking"
++        - "derive/task: routed blocker scenario.blocks affected items and
++          declared dependents, leaving non-dependents pending without writes"
++        - "derive/task: routed blocker scenario.derives the task blocked when
++          every item is in the routed blocker cascade"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..bba909c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/input.md
+@@ -0,0 +1,1401 @@
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
++  "slug": "routing-blocker-derive-v2",
++  "kind": "dev",
++  "title": "Blocker derive",
++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
++  "outlineRef": "routing-blocker-derive-v2",
++  "milestone": "m3-routing",
++  "wave": 8,
++  "deps": [
++    "modes-prompts-v2",
++    "plan-reviewer-triage-v2",
++    "reviewer-triage-v2"
++  ],
++  "escalate": true
++}
++
++## Engine Checks
++
++
++## Test Diff
++
++
++## Code Diff
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..0537fb6
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,68 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/plan-scheduler.test.ts
+++        - plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+++      newProdFiles: []
+++      stubProdLines: 0
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 11 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+++        --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794133110930-b4q7dn451v6.xml
+++      junitCaseCount: 24
+++      junitCaseIds:
+++        - "plan/scheduler: nextWave.returns current active wave while items are
+++          pending or running"
+++        - "plan/scheduler: nextWave.advances to next wave when all items in
+++          current wave are terminal"
+++        - "plan/scheduler: nextWave.returns null when all items across all waves
+++          are terminal"
+++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
+++          is omitted"
+++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
+++          deps as blocked for wave advancement"
+++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
+++          cascade is the engine's job"
+++        - "plan/scheduler: runnable.respects dependencies: pending item only
+++          runs when all deps are done"
+++        - "plan/scheduler: runnable.respects active wave filter"
+++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
+++          current running count"
+++        - "plan/scheduler: runnable.preserves PM order"
+++        - "plan/scheduler: runnable.never returns items whose deps failed"
+++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
+++          abandoned deps, in PM order"
+++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
+++          or been abandoned"
+++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
+++          their declared dependents in PM order"
+++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
+++          failure-blocked fixpoint over declared deps"
+++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
+++          never blocks a done item"
+++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+++          concerns and ignores other statuses and kinds"
+++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
+++          has no concerns directory"
+++        - "derive/wave: routed blocker integration.routes a concern-affected
+++          item and its declared dependents to blocked"
+++        - "derive/wave: routed blocker integration.cascades transitively over
+++          declared deps only"
+++        - "derive/item: routed blocker integration.blocks only the item named by
+++          a routed blocker"
+++        - "derive/item: routed blocker integration.keeps a terminal item status
+++          over routed blocking"
+++        - "derive/task: routed blocker scenario.blocks affected items and
+++          declared dependents, leaving non-dependents pending without writes"
+++        - "derive/task: routed blocker scenario.derives the task blocked when
+++          every item is in the routed blocker cascade"
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..4697cf2
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,55 @@
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
+++  "slug": "routing-blocker-derive-v2",
+++  "kind": "dev",
+++  "title": "Blocker derive",
+++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
+++  "outlineRef": "routing-blocker-derive-v2",
+++  "milestone": "m3-routing",
+++  "wave": 8,
+++  "deps": [
+++    "modes-prompts-v2",
+++    "plan-reviewer-triage-v2",
+++    "reviewer-triage-v2"
+++  ],
+++  "escalate": true
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
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..00b0846
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/meta.yaml
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
+++startedAt: 2026-11-08T10:03:13.836Z
+++session: 01a1ba9c-b455-72a5-9f1e-29f85bf10fe5
+++endedAt: 2026-11-08T10:18:31.204Z
+++usage:
+++  inputTokens: 144926
+++  outputTokens: 53206
+++  costUsd: 0.072089
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-03-14-389Z_01a1ba9c-b455-72a5-9f1e-29f85bf10fe5.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..03ab7e5
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,84 @@
+++status: ok
+++summary: "Authored test-first coverage for routed-blocker derivation (no
+++  production code touched). New test/engine/routing-blocker-derive.test.ts
+++  covers: collectRoutedBlockers reading only routed kind==blocker affects
+++  (open/resolved/dismissed/other kinds ignored, missing concerns dir,
+++  late-arriving blocker); deriveWaveState blockedBy routing an affected item
+++  plus declared dependents while non-dependents stay runnable and transitive
+++  cascade follows deps only; deriveItemState blockedBy marking only the named
+++  item and preserving terminal (abandoned/failed) status; and deriveTaskState
+++  end-to-end deriving itemMap/waves blocked statuses for seed + dependent +
+++  transitive while an independent item stays pending, with a full task-tree
+++  snapshot proving derivation writes nothing, plus task status blocked when
+++  every item is in the cascade. Added plan/scheduler: blockedByConcern tests to
+++  test/plan-scheduler.test.ts covering PM-order blocking of affected items and
+++  declared dependents, union with the failure-blocked fixpoint (direct +
+++  transitive), and ignoring dangling/plan refs and terminal (done) items. All 11
+++  declared target tests fail with assertion failures (not import/collection
+++  errors) on the current production code; the 13 pre-existing scheduler tests
+++  still pass; typecheck is clean."
+++target:
+++  selectors:
+++    - test/engine/routing-blocker-derive.test.ts
+++    - test/plan-scheduler.test.ts
+++  expectRed:
+++    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
+++      declared dependents in PM order"
+++    - "plan/scheduler: blockedByConcern.unions concern blocking with the
+++      failure-blocked fixpoint over declared deps"
+++    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
+++      blocks a done item"
+++    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+++      concerns and ignores other statuses and kinds"
+++    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
+++      no concerns directory"
+++    - "derive/wave: routed blocker integration.routes a concern-affected item
+++      and its declared dependents to blocked"
+++    - "derive/wave: routed blocker integration.cascades transitively over
+++      declared deps only"
+++    - "derive/item: routed blocker integration.blocks only the item named by a
+++      routed blocker"
+++    - "derive/item: routed blocker integration.keeps a terminal item status over
+++      routed blocking"
+++    - "derive/task: routed blocker scenario.blocks affected items and declared
+++      dependents, leaving non-dependents pending without writes"
+++    - "derive/task: routed blocker scenario.derives the task blocked when every
+++      item is in the routed blocker cascade"
+++evidence:
+++  - Installed workspace deps with `cd plugins/software-factory && bun install
+++    --frozen-lockfile` (node_modules gitignored) so bun can resolve the `yaml`
+++    import chain used by derive tests.
+++  - "Proved red classification first with a scratch bun test: a failed `expect`
+++    is emitted as `<failure>` (status fail) in bun's JUnit reporter, while
+++    runtime exceptions become `<error>`, so a missing symbol alone would not
+++    satisfy target-red."
+++  - "Ran the exact engine target command from the worktree root: `cd
+++    plugins/software-factory && bun test
+++    test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+++    --reporter=junit --reporter-outfile=/tmp/junit-target.xml`; exit code 1 with
+++    13 pass / 11 fail."
+++  - "Parsed the JUnit XML with Python: all 11 declared expectRed ids are
+++    present, each with a `<failure>` element and 0 `<error>` elements; no
+++    declared id is missing and no declared test passes."
+++  - "Re-ran the exact target command under the ambient TMPDIR
+++    (`.../.factory-runtime/tmp`): same 11 failures / 0 errors, so the red target
+++    does not depend on the TMPDIR head-guard caveat."
+++  - "Ran `cd plugins/software-factory && bun run typecheck` (tsc --noEmit):
+++    pass, confirming the test-only additions compile under strict settings with
+++    no production changes."
+++  - "Verified `git status --short`: only
+++    `plugins/software-factory/test/plan-scheduler.test.ts` (modified) and
+++    `plugins/software-factory/test/engine/routing-blocker-derive.test.ts` (new)
+++    changed; no production files touched."
+++notes: "Test-first seams use inert local fallbacks (empty Set / empty array) for
+++  the not-yet-existing collectRoutedBlockers and blockedByConcern exports, so
+++  every red failure is a behavioural assertion rather than a module
+++  import/collection error. The end-to-end scenario snapshots the entire task
+++  tree before/after deriveTaskState to enforce the pure-derive/no-writes
+++  constraint. Expected implementation contract: deriveWaveState/deriveItemState
+++  accept `blockedBy?: Iterable<string>`; scheduler.blockedByConcern(items,
+++  concernBlocked) returns a PM-ordered union of concern seeds and
+++  direct/transitive failure blocking; deriveTaskState collects routed blocker
+++  affects, marks directly affected items and their declared-dependency cascade
+++  blocked in itemMap/waves, and leaves non-dependents pending."
+++concerns: []
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..5e56e81
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,121 @@
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
+++        durationMs: 4267
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 66017
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-WTJIgy/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3788233
+++
+++           361 pass
+++           2 skip
+++           0 fail
+++           1661 expect() calls
+++          Ran 363 tests across 59 files. [65.88s]
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
+++        test/engine/routing-blocker-derive.test.ts test/plan-scheduler.test.ts
+++        --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794133678161-h4umdoqwcu.xml
+++      junitCaseCount: 24
+++      junitCaseIds:
+++        - "plan/scheduler: nextWave.returns current active wave while items are
+++          pending or running"
+++        - "plan/scheduler: nextWave.advances to next wave when all items in
+++          current wave are terminal"
+++        - "plan/scheduler: nextWave.returns null when all items across all waves
+++          are terminal"
+++        - "plan/scheduler: nextWave.automatically sorts numeric waves when order
+++          is omitted"
+++        - "plan/scheduler: nextWave.treats pending items with failed/abandoned
+++          deps as blocked for wave advancement"
+++        - "plan/scheduler: nextWave.reports directly blocked items; transitive
+++          cascade is the engine's job"
+++        - "plan/scheduler: runnable.respects dependencies: pending item only
+++          runs when all deps are done"
+++        - "plan/scheduler: runnable.respects active wave filter"
+++        - "plan/scheduler: runnable.respects maxParallel concurrency limit and
+++          current running count"
+++        - "plan/scheduler: runnable.preserves PM order"
+++        - "plan/scheduler: runnable.never returns items whose deps failed"
+++        - "plan/scheduler: blockedByFailure.returns pending items with failed or
+++          abandoned deps, in PM order"
+++        - "plan/scheduler: blockedByFailure.returns empty when no dep has failed
+++          or been abandoned"
+++        - "plan/scheduler: blockedByConcern.blocks concern-affected items and
+++          their declared dependents in PM order"
+++        - "plan/scheduler: blockedByConcern.unions concern blocking with the
+++          failure-blocked fixpoint over declared deps"
+++        - "plan/scheduler: blockedByConcern.ignores refs naming no item and
+++          never blocks a done item"
+++        - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+++          concerns and ignores other statuses and kinds"
+++        - "derive/task: collectRoutedBlockers.returns an empty set when the task
+++          has no concerns directory"
+++        - "derive/wave: routed blocker integration.routes a concern-affected
+++          item and its declared dependents to blocked"
+++        - "derive/wave: routed blocker integration.cascades transitively over
+++          declared deps only"
+++        - "derive/item: routed blocker integration.blocks only the item named by
+++          a routed blocker"
+++        - "derive/item: routed blocker integration.keeps a terminal item status
+++          over routed blocking"
+++        - "derive/task: routed blocker scenario.blocks affected items and
+++          declared dependents, leaving non-dependents pending without writes"
+++        - "derive/task: routed blocker scenario.derives the task blocked when
+++          every item is in the routed blocker cascade"
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 218/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 165
+++        deleted: 53
+++        total: 218
+++        files:
+++          - plugins/software-factory/src/core/derive/item.ts
+++          - plugins/software-factory/src/core/derive/task.ts
+++          - plugins/software-factory/src/core/derive/wave.ts
+++          - plugins/software-factory/src/core/flows/iteration.ts
+++          - plugins/software-factory/src/core/plan/index.ts
+++          - plugins/software-factory/src/core/plan/scheduler.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..1272543
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,72 @@
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
+++  "slug": "routing-blocker-derive-v2",
+++  "kind": "dev",
+++  "title": "Blocker derive",
+++  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
+++  "outlineRef": "routing-blocker-derive-v2",
+++  "milestone": "m3-routing",
+++  "wave": 8,
+++  "deps": [
+++    "modes-prompts-v2",
+++    "plan-reviewer-triage-v2",
+++    "reviewer-triage-v2"
+++  ],
+++  "escalate": true
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/routing-blocker-derive.test.ts",
+++    "test/plan-scheduler.test.ts"
+++  ],
+++  "expectRed": [
+++    "plan/scheduler: blockedByConcern.blocks concern-affected items and their declared dependents in PM order",
+++    "plan/scheduler: blockedByConcern.unions concern blocking with the failure-blocked fixpoint over declared deps",
+++    "plan/scheduler: blockedByConcern.ignores refs naming no item and never blocks a done item",
+++    "derive/task: collectRoutedBlockers.collects affects of routed blocker concerns and ignores other statuses and kinds",
+++    "derive/task: collectRoutedBlockers.returns an empty set when the task has no concerns directory",
+++    "derive/wave: routed blocker integration.routes a concern-affected item and its declared dependents to blocked",
+++    "derive/wave: routed blocker integration.cascades transitively over declared deps only",
+++    "derive/item: routed blocker integration.blocks only the item named by a routed blocker",
+++    "derive/item: routed blocker integration.keeps a terminal item status over routed blocking",
+++    "derive/task: routed blocker scenario.blocks affected items and declared dependents, leaving non-dependents pending without writes",
+++    "derive/task: routed blocker scenario.derives the task blocked when every item is in the routed blocker cascade"
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
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..cbdad77
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/meta.yaml
++@@ -0,0 +1,19 @@
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
+++status: ok
+++startedAt: 2026-11-08T10:18:38.750Z
+++session: 01a1baaa-d0d8-7482-b92e-37da0ab0d209
+++endedAt: 2026-11-08T10:27:58.410Z
+++usage:
+++  inputTokens: 47017
+++  outputTokens: 27170
+++  costUsd: 0.030267
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-18-39-192Z_01a1baaa-d0d8-7482-b92e-37da0ab0d209.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..9472c7f
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,62 @@
+++status: ok
+++summary: Implemented routed-blocker derive (pure derive, no writes). Added
+++  scheduler.blockedByConcern + shared cascadePendingBlocked fixpoint;
+++  derive/wave now unions routed-blocker seeds with blockedByFailure over
+++  declared deps; derive/item accepts blockedBy and blocks non-terminal items via
+++  withRoutedBlocking; derive/task exports collectRoutedBlockers (routed blocker
+++  concerns' affects) and post-processes all items through the transitive
+++  declared-dep cascade before wave derivation; iteration loop threads
+++  collectRoutedBlockers into both deriveWaveState calls. All 11 target cases
+++  pass.
+++target:
+++  selectors:
+++    - test/engine/routing-blocker-derive.test.ts
+++    - test/plan-scheduler.test.ts
+++  expectRed:
+++    - "plan/scheduler: blockedByConcern.blocks concern-affected items and their
+++      declared dependents in PM order"
+++    - "plan/scheduler: blockedByConcern.unions concern blocking with the
+++      failure-blocked fixpoint over declared deps"
+++    - "plan/scheduler: blockedByConcern.ignores refs naming no item and never
+++      blocks a done item"
+++    - "derive/task: collectRoutedBlockers.collects affects of routed blocker
+++      concerns and ignores other statuses and kinds"
+++    - "derive/task: collectRoutedBlockers.returns an empty set when the task has
+++      no concerns directory"
+++    - "derive/wave: routed blocker integration.routes a concern-affected item
+++      and its declared dependents to blocked"
+++    - "derive/wave: routed blocker integration.cascades transitively over
+++      declared deps only"
+++    - "derive/item: routed blocker integration.blocks only the item named by a
+++      routed blocker"
+++    - "derive/item: routed blocker integration.keeps a terminal item status over
+++      routed blocking"
+++    - "derive/task: routed blocker scenario.blocks affected items and declared
+++      dependents, leaving non-dependents pending without writes"
+++    - "derive/task: routed blocker scenario.derives the task blocked when every
+++      item is in the routed blocker cascade"
+++evidence:
+++  - bun test test/engine/routing-blocker-derive.test.ts
+++    test/plan-scheduler.test.ts -> 24 pass, 0 fail, 43 expects (covers all 11
+++    target cases, including the no-writes snapshot-tree assertion)
+++  - bun run typecheck (tsc --noEmit) -> exit 0 on final diff
+++  - bun test (full project suite) -> 361 pass, 2 skip, 0 fail, 1661 expects
+++    across 59 files
+++  - bun test test/engine/routing-blocker-derive.test.ts
+++    test/plan-scheduler.test.ts test/plan-apply.test.ts test/plan-limits.test.ts
+++    test/engine/plan-reviewer-triage.test.ts -> 47 pass, 0 fail on final diff
+++    after adding the plan barrel export
+++  - git diff --stat -> 6 prod files changed, no test files modified
+++concerns:
+++  - collectRoutedBlockers trusts concern.affects verbatim; refs naming a
+++    non-existent item are inert by construction but are not validated
+++  - blockedByConcern/cascadePendingBlocked only block pending items, so already
+++    running or ready work is not retro-blocked at scheduler level (derive
+++    item-level blocking does cover ready/running non-terminal states)
+++  - iteration.ts now reads the concern store on every wave derivation (cheap,
+++    but recomputed per refresh to pick up newly routed concerns)
+++notes: blockedByConcern returns slugs in PM order, unions blockedByFailure and
+++  the concern seeds, then cascades to a fixpoint over declared deps only.
+++  deriveTaskState derives items first, computes the routed cascade, then applies
+++  withRoutedBlocking so itemMap and every wave state see blocked statuses before
+++  wave derivation; terminal outcomes (merged/failed/superseded) are preserved.
++diff --git a/plugins/software-factory/src/core/derive/item.ts b/plugins/software-factory/src/core/derive/item.ts
++index 925d1f7..c08cc9b 100644
++--- a/plugins/software-factory/src/core/derive/item.ts
+++++ b/plugins/software-factory/src/core/derive/item.ts
++@@ -54,6 +54,28 @@ export interface DerivedItemState {
++   decisionFingerprints: string[];
++ }
++ 
+++/** Terminal item outcomes: routed blockers never override these (§8.2). */
+++export const TERMINAL_ITEM_STATUSES: ReadonlySet<DerivedItemState["status"]> = new Set([
+++  "merged",
+++  "failed",
+++  "superseded",
+++]);
+++
+++/**
+++ * Applies routed concern blocking (adr-routing-derived-state): an item named by
+++ * a routed blocker concern derives `blocked` unless it already reached a
+++ * terminal outcome.
+++ */
+++export function withRoutedBlocking(
+++  state: DerivedItemState,
+++  blockedBy?: ReadonlySet<string>
+++): DerivedItemState {
+++  if (!blockedBy?.has(state.slug) || TERMINAL_ITEM_STATUSES.has(state.status)) {
+++    return state;
+++  }
+++  return { ...state, status: "blocked" };
+++}
+++
++ /**
++  * Derives state of a single item from assignment, step records, decisions, steering, and git (§6, §8).
++  */
++@@ -66,6 +88,8 @@ export async function deriveItemState(opts: {
++   pipeline?: PipelineConfig;
++   project?: ProjectConfig;
++   kindConfig?: FlowKindConfig;
+++  /** Slugs named by routed blocker concerns (adr-routing-derived-state). */
+++  blockedBy?: Iterable<string>;
++ }): Promise<DerivedItemState> {
++   const { taskDir, itemSlug, parentBranch, taskWt, childWt, pipeline, project } = opts;
++   const itemDir = path.join(taskDir, "items", itemSlug);
++@@ -424,28 +448,31 @@ export async function deriveItemState(opts: {
++     }
++   }
++ 
++-  return {
++-    slug: itemSlug,
++-    kind,
++-    title,
++-    wave,
++-    deps,
++-    status,
++-    assignment,
++-    branch,
++-    records,
++-    currentStepId: records[records.length - 1]?.name,
++-    currentAttempt,
++-    currentFixRound,
++-    isEscalated,
++-    freshSeries: retryDecision && decisionIsFresh,
++-    interruptionCount,
++-    guidanceText,
++-    openSteerQuestion,
++-    mergedAt,
++-    consultCount,
++-    lastFailingCheckFingerprint,
++-    suggestionFingerprints,
++-    decisionFingerprints,
++-  };
+++  return withRoutedBlocking(
+++    {
+++      slug: itemSlug,
+++      kind,
+++      title,
+++      wave,
+++      deps,
+++      status,
+++      assignment,
+++      branch,
+++      records,
+++      currentStepId: records[records.length - 1]?.name,
+++      currentAttempt,
+++      currentFixRound,
+++      isEscalated,
+++      freshSeries: retryDecision && decisionIsFresh,
+++      interruptionCount,
+++      guidanceText,
+++      openSteerQuestion,
+++      mergedAt,
+++      consultCount,
+++      lastFailingCheckFingerprint,
+++      suggestionFingerprints,
+++      decisionFingerprints,
+++    },
+++    opts.blockedBy ? new Set(opts.blockedBy) : undefined
+++  );
++ }
++diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
++index 7128367..15a617f 100644
++--- a/plugins/software-factory/src/core/derive/task.ts
+++++ b/plugins/software-factory/src/core/derive/task.ts
++@@ -13,10 +13,11 @@ import type {
++   TriageArtifact,
++ } from "../artifacts.js";
++ import { readYaml, writeYamlAtomic } from "../records/io.js";
++-import { deriveItemState, type DerivedItemState } from "./item.js";
+++import { deriveItemState, withRoutedBlocking, TERMINAL_ITEM_STATUSES, type DerivedItemState } from "./item.js";
++ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
++ import { BudgetTracker } from "../budget.js";
++ import { listConcerns } from "../concerns.js";
+++import { cascadePendingBlocked } from "../plan/scheduler.js";
++ import { git } from "../git/exec.js";
++ import { isAncestor } from "../git/commit.js";
++ 
++@@ -38,6 +39,21 @@ export interface DerivedTaskState {
++   toStateArtifact(): StateArtifact;
++ }
++ 
+++/**
+++ * Collects item slugs named by routed blocker concerns (adr-routing-derived-state).
+++ * Pure read: the concern store is authoritative; derive never writes.
+++ */
+++export async function collectRoutedBlockers(taskDir: string): Promise<Set<string>> {
+++  const affected = new Set<string>();
+++  for (const concern of await listConcerns(taskDir)) {
+++    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
+++    for (const slug of concern.affects ?? []) {
+++      affected.add(slug);
+++    }
+++  }
+++  return affected;
+++}
+++
++ /**
++  * Derives comprehensive task state from disk and git (§6.3 Invariant 4).
++  * Pure derivation; state.yaml is a materialized view never read for decisions.
++@@ -127,25 +143,41 @@ export async function deriveTaskState(opts: {
++ 
++   // 5. Items
++   const items: DerivedItemState[] = [];
++-  const itemMap: Record<string, DerivedItemState> = {};
++   const itemsDir = path.join(taskDir, "items");
++   if (fs.existsSync(itemsDir)) {
++     const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
++     for (const ent of itemEntries) {
++       if (!ent.isDirectory()) continue;
++-      const itState = await deriveItemState({
++-        taskDir,
++-        itemSlug: ent.name,
++-        parentBranch,
++-        taskWt,
++-        pipeline,
++-        project,
++-      });
++-      items.push(itState);
++-      itemMap[ent.name] = itState;
+++      items.push(
+++        await deriveItemState({
+++          taskDir,
+++          itemSlug: ent.name,
+++          parentBranch,
+++          taskWt,
+++          pipeline,
+++          project,
+++        })
+++      );
++     }
++   }
++ 
+++  // 5b. Routed blockers (adr-routing-derived-state): a routed blocker concern
+++  // blocks the items it affects and their declared dependents, transitively.
+++  const routedNames = await collectRoutedBlockers(taskDir);
+++  const routedBlocked = new Set<string>();
+++  for (const it of items) {
+++    if (routedNames.has(it.slug) && !TERMINAL_ITEM_STATUSES.has(it.status)) {
+++      routedBlocked.add(it.slug);
+++    }
+++  }
+++  cascadePendingBlocked(items, routedBlocked);
+++  const itemMap: Record<string, DerivedItemState> = {};
+++  for (let i = 0; i < items.length; i++) {
+++    const blocked = withRoutedBlocking(items[i]!, routedBlocked);
+++    items[i] = blocked;
+++    itemMap[blocked.slug] = blocked;
+++  }
+++
++   // Sort items deterministically by wave then slug
++   items.sort((a, b) => (a.wave !== b.wave ? a.wave - b.wave : a.slug.localeCompare(b.slug)));
++ 
++diff --git a/plugins/software-factory/src/core/derive/wave.ts b/plugins/software-factory/src/core/derive/wave.ts
++index 06274b1..ed5af6d 100644
++--- a/plugins/software-factory/src/core/derive/wave.ts
+++++ b/plugins/software-factory/src/core/derive/wave.ts
++@@ -1,5 +1,5 @@
++ import type { DerivedItemState } from "./item.js";
++-import { blockedByFailure } from "../plan/scheduler.js";
+++import { blockedByFailure, cascadePendingBlocked } from "../plan/scheduler.js";
++ 
++ export interface DerivedWaveState {
++   wave: number;
++@@ -24,6 +24,8 @@ export function deriveWaveState(opts: {
++   wave: number;
++   items: DerivedItemState[];
++   maxParallelItems?: number;
+++  /** Slugs named by routed blocker concerns; cascaded over declared deps. */
+++  blockedBy?: Iterable<string>;
++ }): DerivedWaveState {
++   const { wave, items } = opts;
++   const waveItems = items.filter((it) => it.wave === wave || (it.wave < wave && it.status === "blocked"));
++@@ -41,25 +43,23 @@ export function deriveWaveState(opts: {
++     allBySlug.set(it.slug, it);
++   }
++ 
++-  // Dependents of failed items become blocked-by-failure, cascaded transitively
++-  // to a fixpoint (§8.2): an item blocked this way blocks its own dependents.
+++  // Dependents of failed items become blocked-by-failure, and items named by
+++  // routed blocker concerns become blocked; both cascade transitively over
+++  // declared deps to a fixpoint (§8.2, adr-routing-derived-state).
++   const schedItems = items.map((it) => ({
++     slug: it.slug,
++     wave: String(it.wave),
++     deps: it.deps,
++     status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
++   }));
++-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
++-  let grew = failureBlocked.size > 0;
++-  while (grew) {
++-    grew = false;
++-    for (const it of items) {
++-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
++-        failureBlocked.add(it.slug);
++-        grew = true;
++-      }
+++  const blockedSlugs = new Set<string>(blockedByFailure(schedItems));
+++  const bySlug = new Map(items.map((it) => [it.slug, it]));
+++  for (const slug of opts.blockedBy ?? []) {
+++    if (bySlug.get(slug)?.status === "pending") {
+++      blockedSlugs.add(slug);
++     }
++   }
+++  cascadePendingBlocked(items, blockedSlugs);
++ 
++   for (const it of waveItems) {
++     if (it.status === "merged") {
++@@ -75,8 +75,8 @@ export function deriveWaveState(opts: {
++     } else if (it.status === "blocked") {
++       blocked.push(it);
++     } else if (it.status === "pending") {
++-      // Blocked-by-failure (transitive fixpoint computed above) routes to blocked.
++-      if (failureBlocked.has(it.slug)) {
+++      // Blocked by failure or a routed concern (transitive fixpoint computed above).
+++      if (blockedSlugs.has(it.slug)) {
++         blocked.push(it);
++         continue;
++       }
++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
++index 58b8bd6..313559a 100644
++--- a/plugins/software-factory/src/core/flows/iteration.ts
+++++ b/plugins/software-factory/src/core/flows/iteration.ts
++@@ -24,7 +24,7 @@ import { mergeItem } from "./merge-path.js";
++ import { tickItemMachine } from "./item-machine.js";
++ import { deriveItemState } from "../derive/item.js";
++ import { deriveWaveState } from "../derive/wave.js";
++-import { refreshStateYaml } from "../derive/task.js";
+++import { refreshStateYaml, collectRoutedBlockers } from "../derive/task.js";
++ import { appendJournal } from "../journal.js";
++ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++@@ -729,7 +729,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
++       )
++     );
++-    let waveState = deriveWaveState({ wave: w, items: itemStates });
+++    let waveState = deriveWaveState({
+++      wave: w,
+++      items: itemStates,
+++      blockedBy: await collectRoutedBlockers(taskDir),
+++    });
++ 
++     if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
++       continue;
++@@ -802,7 +806,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++           deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
++         )
++       );
++-      waveState = deriveWaveState({ wave: w, items: itemStates });
+++      waveState = deriveWaveState({
+++        wave: w,
+++        items: itemStates,
+++        blockedBy: await collectRoutedBlockers(taskDir),
+++      });
++       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
++     }
++ 
++diff --git a/plugins/software-factory/src/core/plan/index.ts b/plugins/software-factory/src/core/plan/index.ts
++index 7ab8f71..64b9670 100644
++--- a/plugins/software-factory/src/core/plan/index.ts
+++++ b/plugins/software-factory/src/core/plan/index.ts
++@@ -3,6 +3,7 @@ export { applyEdits } from "./apply.js";
++ export {
++   type SchedItem,
++   blockedByFailure,
+++  blockedByConcern,
++   nextWave,
++   runnable,
++ } from "./scheduler.js";
++diff --git a/plugins/software-factory/src/core/plan/scheduler.ts b/plugins/software-factory/src/core/plan/scheduler.ts
++index 836a6d6..fa78e0a 100644
++--- a/plugins/software-factory/src/core/plan/scheduler.ts
+++++ b/plugins/software-factory/src/core/plan/scheduler.ts
++@@ -33,6 +33,50 @@ export function blockedByFailure(items: SchedItem[]): string[] {
++     .map((i) => i.slug);
++ }
++ 
+++/**
+++ * Expands blocked slugs to a fixpoint over declared `deps` (§8.2): a pending
+++ * item depending on any blocked slug can never run, so it is blocked too.
+++ * Mutates `blocked` in place and returns it.
+++ */
+++export function cascadePendingBlocked<T extends { slug: string; deps: string[]; status: string }>(
+++  items: T[],
+++  blocked: Set<string>
+++): Set<string> {
+++  let grew = blocked.size > 0;
+++  while (grew) {
+++    grew = false;
+++    for (const item of items) {
+++      if (item.status !== "pending" || blocked.has(item.slug) || !item.deps.some((d) => blocked.has(d))) {
+++        continue;
+++      }
+++      blocked.add(item.slug);
+++      grew = true;
+++    }
+++  }
+++  return blocked;
+++}
+++
+++/**
+++ * Returns the slugs blocked by routed concern blockers (adr-routing-derived-state).
+++ *
+++ * `concernBlocked` names items that routed blocker concerns affect. A pending
+++ * affected item is blocked, and pending items depending on any blocked slug are
+++ * blocked transitively to a fixpoint. The result unions with `blockedByFailure`
+++ * so callers see one failure/concern picture. Refs naming no item, terminal
+++ * items, and non-pending work are ignored. Preserves input (PM) order.
+++ */
+++export function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
+++  const bySlug = new Map(items.map((i) => [i.slug, i]));
+++  const blocked = new Set(blockedByFailure(items));
+++  for (const slug of concernBlocked) {
+++    if (bySlug.get(slug)?.status === "pending") {
+++      blocked.add(slug);
+++    }
+++  }
+++  cascadePendingBlocked(items, blocked);
+++  return items.filter((i) => blocked.has(i.slug)).map((i) => i.slug);
+++}
+++
++ /**
++  * Determines the next wave to execute according to wave sequence order (§8.4).
++  *
++diff --git a/plugins/software-factory/test/engine/routing-blocker-derive.test.ts b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
++new file mode 100644
++index 0000000..a43e763
++--- /dev/null
+++++ b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
++@@ -0,0 +1,343 @@
+++import { afterEach, describe, expect, it } from "bun:test";
+++import fs from "node:fs";
+++import os from "node:os";
+++import path from "node:path";
+++import * as deriveTaskModule from "../../src/core/derive/task.js";
+++import { deriveItemState, type DerivedItemState } from "../../src/core/derive/item.js";
+++import { deriveWaveState } from "../../src/core/derive/wave.js";
+++import type { StoredConcernArtifact } from "../../src/core/artifacts.js";
+++
+++/**
+++ * Routed blockers are pure derive data (adr-routing-derived-state): a `routed`
+++ * concern of kind `blocker` names the items it affects (`affects`), and derive
+++ * marks the named items plus their declared dependents blocked. Derivation
+++ * never writes: no concern, decision, mailbox, or state files change.
+++ */
+++
+++type CollectRoutedBlockers = (taskDir: string) => Promise<Set<string>>;
+++
+++/**
+++ * Test-first seam: while `derive/task.ts` does not yet export the collector,
+++ * an inert fallback keeps module collection alive so the behavioural
+++ * assertions fail as assertion failures (target-red), not import errors.
+++ */
+++const collectRoutedBlockers: CollectRoutedBlockers =
+++  (deriveTaskModule as unknown as { collectRoutedBlockers?: CollectRoutedBlockers })
+++    .collectRoutedBlockers ?? (async () => new Set<string>());
+++
+++type ItemDeriveOpts = Parameters<typeof deriveItemState>[0] & {
+++  blockedBy?: Iterable<string>;
+++};
+++type WaveDeriveOpts = Parameters<typeof deriveWaveState>[0] & {
+++  blockedBy?: Iterable<string>;
+++};
+++
+++const tmpDirs: string[] = [];
+++
+++function makeTaskDir(): string {
+++  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-routed-blocker-"));
+++  tmpDirs.push(dir);
+++  return dir;
+++}
+++
+++afterEach(() => {
+++  for (const dir of tmpDirs.splice(0)) {
+++    fs.rmSync(dir, { recursive: true, force: true });
+++  }
+++});
+++
+++async function routedBlockedSlugs(taskDir: string): Promise<Set<string>> {
+++  return collectRoutedBlockers(taskDir);
+++}
+++
+++function writeItem(
+++  taskDir: string,
+++  slug: string,
+++  opts: { wave?: number; deps?: string[] } = {}
+++): void {
+++  const dir = path.join(taskDir, "items", slug);
+++  fs.mkdirSync(dir, { recursive: true });
+++  const deps = opts.deps ?? [];
+++  const depsYaml =
+++    deps.length === 0 ? "deps: []" : `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}`;
+++  fs.writeFileSync(
+++    path.join(dir, "assignment.yaml"),
+++    [
+++      `slug: ${slug}`,
+++      "kind: dev",
+++      `title: ${slug}`,
+++      "assignment: Do the work",
+++      `wave: ${opts.wave ?? 1}`,
+++      depsYaml,
+++    ].join("\n") + "\n",
+++    "utf8"
+++  );
+++}
+++
+++function writeConcern(
+++  taskDir: string,
+++  concern: Pick<StoredConcernArtifact, "id" | "kind" | "summary" | "status"> &
+++    Partial<StoredConcernArtifact>
+++): void {
+++  const dir = path.join(taskDir, "concerns");
+++  fs.mkdirSync(dir, { recursive: true });
+++  const record = {
+++    detail: concern.summary,
+++    severity: "medium",
+++    source: { record: "test-first", agent: "test" },
+++    createdAt: "2026-01-01T00:00:00.000Z",
+++    updatedAt: "2026-01-01T00:00:00.000Z",
+++    ...concern,
+++  };
+++  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(record, null, 2), "utf8");
+++}
+++
+++function derivedItem(partial: Partial<DerivedItemState> & { slug: string }): DerivedItemState {
+++  return {
+++    kind: "dev",
+++    title: partial.slug,
+++    wave: 1,
+++    deps: [],
+++    status: "pending",
+++    branch: `topic/routing-blocker--${partial.slug}`,
+++    records: [],
+++    currentAttempt: 1,
+++    currentFixRound: 1,
+++    isEscalated: false,
+++    freshSeries: false,
+++    interruptionCount: 0,
+++    consultCount: 0,
+++    suggestionFingerprints: [],
+++    decisionFingerprints: [],
+++    ...partial,
+++  };
+++}
+++
+++/** Reads every file under `root` so a test can prove derive is write-free. */
+++function snapshotTree(root: string): Record<string, string> {
+++  const out: Record<string, string> = {};
+++  const walk = (dir: string) => {
+++    const entries = fs
+++      .readdirSync(dir, { withFileTypes: true })
+++      .sort((a, b) => a.name.localeCompare(b.name));
+++    for (const entry of entries) {
+++      const full = path.join(dir, entry.name);
+++      if (entry.isDirectory()) walk(full);
+++      else out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
+++    }
+++  };
+++  walk(root);
+++  return out;
+++}
+++
+++describe("derive/task: collectRoutedBlockers", () => {
+++  it("collects affects of routed blocker concerns and ignores other statuses and kinds", async () => {
+++    const taskDir = makeTaskDir();
+++    writeConcern(taskDir, {
+++      id: "c-routed-blocker",
+++      kind: "blocker",
+++      status: "routed",
+++      summary: "Schema migration is pending",
+++      affects: ["item-b", "item-c"],
+++    });
+++    writeConcern(taskDir, {
+++      id: "c-open-blocker",
+++      kind: "blocker",
+++      status: "open",
+++      summary: "Not triaged yet",
+++      affects: ["item-open"],
+++    });
+++    writeConcern(taskDir, {
+++      id: "c-routed-risk",
+++      kind: "risk",
+++      status: "routed",
+++      summary: "Routed risk",
+++      affects: ["item-risk"],
+++    });
+++    writeConcern(taskDir, {
+++      id: "c-resolved-blocker",
+++      kind: "blocker",
+++      status: "resolved",
+++      summary: "Already handled",
+++      affects: ["item-resolved"],
+++    });
+++    writeConcern(taskDir, {
+++      id: "c-dismissed-blocker",
+++      kind: "blocker",
+++      status: "dismissed",
+++      summary: "Dismissed by the reviewer",
+++      affects: ["item-dismissed"],
+++    });
+++
+++    const blocked = await routedBlockedSlugs(taskDir);
+++    expect(blocked).toBeInstanceOf(Set);
+++    expect([...blocked].sort()).toEqual(["item-b", "item-c"]);
+++  });
+++
+++  it("returns an empty set when the task has no concerns directory", async () => {
+++    const taskDir = makeTaskDir();
+++
+++    expect([...(await routedBlockedSlugs(taskDir))]).toEqual([]);
+++
+++    // The same derive seam starts reporting once a routed blocker is stored.
+++    writeConcern(taskDir, {
+++      id: "c-late-blocker",
+++      kind: "blocker",
+++      status: "routed",
+++      summary: "Discovered after the first derive",
+++      affects: ["late-item"],
+++    });
+++    expect([...(await routedBlockedSlugs(taskDir))].sort()).toEqual(["late-item"]);
+++  });
+++});
+++
+++describe("derive/wave: routed blocker integration", () => {
+++  it("routes a concern-affected item and its declared dependents to blocked", () => {
+++    const items = [
+++      derivedItem({ slug: "seed", wave: 8 }),
+++      derivedItem({ slug: "dependent", wave: 8, deps: ["seed"] }),
+++      derivedItem({ slug: "independent", wave: 8, deps: [] }),
+++    ];
+++
+++    const wave = deriveWaveState({
+++      wave: 8,
+++      items,
+++      blockedBy: new Set(["seed"]),
+++    } as WaveDeriveOpts);
+++
+++    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["dependent", "seed"]);
+++    expect(wave.runnable.map((i) => i.slug)).toEqual(["independent"]);
+++  });
+++
+++  it("cascades transitively over declared deps only", () => {
+++    const items = [
+++      derivedItem({ slug: "seed", wave: 8 }),
+++      derivedItem({ slug: "child", wave: 8, deps: ["seed"] }),
+++      derivedItem({ slug: "grandchild", wave: 8, deps: ["child"] }),
+++      derivedItem({ slug: "side", wave: 8, deps: [] }),
+++    ];
+++
+++    const wave = deriveWaveState({
+++      wave: 8,
+++      items,
+++      blockedBy: new Set(["seed"]),
+++    } as WaveDeriveOpts);
+++
+++    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["child", "grandchild", "seed"]);
+++    expect(wave.runnable.map((i) => i.slug)).toEqual(["side"]);
+++  });
+++});
+++
+++describe("derive/item: routed blocker integration", () => {
+++  it("blocks only the item named by a routed blocker", async () => {
+++    const taskDir = makeTaskDir();
+++    writeItem(taskDir, "affected");
+++    writeItem(taskDir, "unaffected");
+++    const blockedBy = new Set(["affected"]);
+++
+++    const affected = await deriveItemState({
+++      taskDir,
+++      itemSlug: "affected",
+++      parentBranch: "topic/routing-blocker",
+++      blockedBy,
+++    } as ItemDeriveOpts);
+++    const unaffected = await deriveItemState({
+++      taskDir,
+++      itemSlug: "unaffected",
+++      parentBranch: "topic/routing-blocker",
+++      blockedBy,
+++    } as ItemDeriveOpts);
+++
+++    expect(affected.status).toBe("blocked");
+++    expect(unaffected.status).toBe("pending");
+++  });
+++
+++  it("keeps a terminal item status over routed blocking", async () => {
+++    const taskDir = makeTaskDir();
+++    writeItem(taskDir, "abandoned");
+++    writeItem(taskDir, "blocked-one");
+++    const decisionsDir = path.join(taskDir, "decisions");
+++    fs.mkdirSync(decisionsDir, { recursive: true });
+++    fs.writeFileSync(
+++      path.join(decisionsDir, "001-abandon.yaml"),
+++      JSON.stringify({
+++        id: "decision-abandon",
+++        context: "item",
+++        item: "abandoned",
+++        decision: "abandon",
+++        rationale: "No longer needed",
+++        timestamp: "2026-01-01T00:00:00.000Z",
+++      }),
+++      "utf8"
+++    );
+++    const blockedBy = new Set(["abandoned", "blocked-one"]);
+++
+++    const abandoned = await deriveItemState({
+++      taskDir,
+++      itemSlug: "abandoned",
+++      parentBranch: "topic/routing-blocker",
+++      blockedBy,
+++    } as ItemDeriveOpts);
+++    const blockedOne = await deriveItemState({
+++      taskDir,
+++      itemSlug: "blocked-one",
+++      parentBranch: "topic/routing-blocker",
+++      blockedBy,
+++    } as ItemDeriveOpts);
+++
+++    expect(abandoned.status).toBe("failed");
+++    expect(blockedOne.status).toBe("blocked");
+++  });
+++});
+++
+++describe("derive/task: routed blocker scenario", () => {
+++  it("blocks affected items and declared dependents, leaving non-dependents pending without writes", async () => {
+++    const taskDir = makeTaskDir();
+++    writeItem(taskDir, "blocker-source", { wave: 1 });
+++    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
+++    writeItem(taskDir, "transitive", { wave: 3, deps: ["dependent"] });
+++    writeItem(taskDir, "independent", { wave: 3 });
+++    writeConcern(taskDir, {
+++      id: "c-routed-blocker",
+++      kind: "blocker",
+++      status: "routed",
+++      summary: "Upstream schema migration blocks the wave",
+++      affects: ["blocker-source"],
+++    });
+++
+++    const before = snapshotTree(taskDir);
+++    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
+++    const after = snapshotTree(taskDir);
+++
+++    expect(state.itemMap["blocker-source"]?.status).toBe("blocked");
+++    expect(state.itemMap["dependent"]?.status).toBe("blocked");
+++    expect(state.itemMap["transitive"]?.status).toBe("blocked");
+++    expect(state.itemMap["independent"]?.status).toBe("pending");
+++
+++    expect(state.waves.find((w) => w.wave === 2)?.blocked.map((i) => i.slug)).toContain("dependent");
+++    const wave3 = state.waves.find((w) => w.wave === 3);
+++    expect(wave3?.blocked.map((i) => i.slug)).toContain("transitive");
+++    expect(wave3?.runnable.map((i) => i.slug)).toContain("independent");
+++
+++    // Pure derive: no concern/decision/mailbox/state file is written or changed.
+++    expect(after).toEqual(before);
+++  });
+++
+++  it("derives the task blocked when every item is in the routed blocker cascade", async () => {
+++    const taskDir = makeTaskDir();
+++    writeItem(taskDir, "blocker-source", { wave: 1 });
+++    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
+++    writeConcern(taskDir, {
+++      id: "c-routed-blocker",
+++      kind: "blocker",
+++      status: "routed",
+++      summary: "Blocked until the operator answers",
+++      affects: ["blocker-source"],
+++    });
+++
+++    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
+++
+++    expect(state.itemMap["dependent"]?.status).toBe("blocked");
+++    expect(state.status).toBe("blocked");
+++  });
+++});
++diff --git a/plugins/software-factory/test/plan-scheduler.test.ts b/plugins/software-factory/test/plan-scheduler.test.ts
++index 7f34551..d408fdd 100644
++--- a/plugins/software-factory/test/plan-scheduler.test.ts
+++++ b/plugins/software-factory/test/plan-scheduler.test.ts
++@@ -1,6 +1,22 @@
++ import { describe, expect, it } from "bun:test";
+++import * as schedulerModule from "../src/core/plan/scheduler.js";
++ import { blockedByFailure, nextWave, runnable, type SchedItem } from "../src/core/plan/scheduler.js";
++ 
+++const blockedByConcernImpl = (
+++  schedulerModule as unknown as {
+++    blockedByConcern?: (items: SchedItem[], concernBlocked: Iterable<string>) => string[];
+++  }
+++).blockedByConcern;
+++
+++/**
+++ * Test-first seam: while the scheduler does not yet export `blockedByConcern`,
+++ * the inert fallback keeps module collection alive so the behavioural
+++ * assertions fail as assertion failures (target-red), not import errors.
+++ */
+++function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
+++  return blockedByConcernImpl ? blockedByConcernImpl(items, concernBlocked) : [];
+++}
+++
++ describe("plan/scheduler: nextWave", () => {
++   it("returns current active wave while items are pending or running", () => {
++     const items: SchedItem[] = [
++@@ -172,3 +188,43 @@ describe("plan/scheduler: blockedByFailure", () => {
++     expect(blockedByFailure(items)).toEqual([]);
++   });
++ });
+++
+++describe("plan/scheduler: blockedByConcern", () => {
+++  it("blocks concern-affected items and their declared dependents in PM order", () => {
+++    const items: SchedItem[] = [
+++      { slug: "seed", wave: "8", deps: [], status: "pending" },
+++      { slug: "dependent", wave: "8", deps: ["seed"], status: "pending" },
+++      { slug: "independent", wave: "8", deps: [], status: "pending" },
+++    ];
+++
+++    expect(blockedByConcern(items, ["seed"])).toEqual(["seed", "dependent"]);
+++  });
+++
+++  it("unions concern blocking with the failure-blocked fixpoint over declared deps", () => {
+++    const items: SchedItem[] = [
+++      { slug: "failed", wave: "8", deps: [], status: "failed" },
+++      { slug: "failure-dependent", wave: "8", deps: ["failed"], status: "pending" },
+++      { slug: "failure-transitive", wave: "8", deps: ["failure-dependent"], status: "pending" },
+++      { slug: "seed", wave: "8", deps: [], status: "pending" },
+++      { slug: "concern-dependent", wave: "8", deps: ["seed"], status: "pending" },
+++      { slug: "independent", wave: "8", deps: [], status: "pending" },
+++    ];
+++
+++    expect(blockedByConcern(items, ["seed"])).toEqual([
+++      "failure-dependent",
+++      "failure-transitive",
+++      "seed",
+++      "concern-dependent",
+++    ]);
+++  });
+++
+++  it("ignores refs naming no item and never blocks a done item", () => {
+++    const items: SchedItem[] = [
+++      { slug: "already-done", wave: "8", deps: [], status: "done" },
+++      { slug: "seed", wave: "8", deps: [], status: "pending" },
+++      { slug: "other", wave: "8", deps: [], status: "pending" },
+++    ];
+++
+++    expect(blockedByConcern(items, ["plan", "already-done", "seed"])).toEqual(["seed"]);
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
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..0fbe323
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 3
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
++startedAt: 2026-11-08T10:28:04.421Z
++session: 01a1bab3-75b6-7705-90b5-c14321b3db0c
++endedAt: 2026-11-08T10:42:08.808Z
++usage:
++  inputTokens: 41505
++  outputTokens: 21897
++  costUsd: 0.009571
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-28-05-686Z_01a1bab3-75b6-7705-90b5-c14321b3db0c
+diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..080c164
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/003-qa-r1-a1/output.yaml
+@@ -0,0 +1,37 @@
++status: approved
++summary: 11/11 red->green verified, no weakening, pure-derive holds
++suggestions:
++  - id: test-seam-cleanup
++    disposition: optional
++    summary: Replace test-first fallback seams with direct imports
++    detail: Both suites capture new exports via dynamic lookup with inert fallbacks
++      (empty Set/[]) to force assertion-failures for target-red. Now that
++      collectRoutedBlockers and blockedByConcern exist, direct static imports
++      fail fast on missing exports and gain type checking. Current form still
++      exercises real code and fails behaviorally if exports removed, so polish
++      only.
++    location:
++      file: plugins/software-factory/test/engine/routing-blocker-derive.test.ts
++      line: 24
++  - id: drop-blockedby-casts
++    disposition: optional
++    summary: Drop now-redundant blockedBy option casts
++    detail: "ItemDeriveOpts/WaveDeriveOpts intersection plus `as` casts were needed
++      pre-implementation; deriveItemState/deriveWaveState now type blockedBy?:
++      Iterable<string>. Removing casts tightens type checking without behavior
++      change."
++    location:
++      file: plugins/software-factory/test/engine/routing-blocker-derive.test.ts
++      line: 28
++  - id: wave-report-routed-label
++    disposition: optional
++    summary: Wave report conflates routed-blocked with failure-blocked
++    detail: iteration.ts derives blockedByFailureSlugs from waveState.blocked via
++      deps-on-failed-or-blocked predicate. Routed dependents satisfy same
++      predicate and will be labeled Blocked-by-failure in summary/artifact while
++      dep-less seeds are omitted. Pure-derive scope is correct; downstream
++      routing-architect-consult act-phase should distinguish failure vs routed
++      when reporting.
++    location:
++      file: plugins/software-factory/src/core/flows/iteration.ts
++      line: 878
+diff --git a/plugins/software-factory/src/core/derive/item.ts b/plugins/software-factory/src/core/derive/item.ts
+index 925d1f7..c08cc9b 100644
+--- a/plugins/software-factory/src/core/derive/item.ts
++++ b/plugins/software-factory/src/core/derive/item.ts
+@@ -54,6 +54,28 @@ export interface DerivedItemState {
+   decisionFingerprints: string[];
+ }
+ 
++/** Terminal item outcomes: routed blockers never override these (§8.2). */
++export const TERMINAL_ITEM_STATUSES: ReadonlySet<DerivedItemState["status"]> = new Set([
++  "merged",
++  "failed",
++  "superseded",
++]);
++
++/**
++ * Applies routed concern blocking (adr-routing-derived-state): an item named by
++ * a routed blocker concern derives `blocked` unless it already reached a
++ * terminal outcome.
++ */
++export function withRoutedBlocking(
++  state: DerivedItemState,
++  blockedBy?: ReadonlySet<string>
++): DerivedItemState {
++  if (!blockedBy?.has(state.slug) || TERMINAL_ITEM_STATUSES.has(state.status)) {
++    return state;
++  }
++  return { ...state, status: "blocked" };
++}
++
+ /**
+  * Derives state of a single item from assignment, step records, decisions, steering, and git (§6, §8).
+  */
+@@ -66,6 +88,8 @@ export async function deriveItemState(opts: {
+   pipeline?: PipelineConfig;
+   project?: ProjectConfig;
+   kindConfig?: FlowKindConfig;
++  /** Slugs named by routed blocker concerns (adr-routing-derived-state). */
++  blockedBy?: Iterable<string>;
+ }): Promise<DerivedItemState> {
+   const { taskDir, itemSlug, parentBranch, taskWt, childWt, pipeline, project } = opts;
+   const itemDir = path.join(taskDir, "items", itemSlug);
+@@ -424,28 +448,31 @@ export async function deriveItemState(opts: {
+     }
+   }
+ 
+-  return {
+-    slug: itemSlug,
+-    kind,
+-    title,
+-    wave,
+-    deps,
+-    status,
+-    assignment,
+-    branch,
+-    records,
+-    currentStepId: records[records.length - 1]?.name,
+-    currentAttempt,
+-    currentFixRound,
+-    isEscalated,
+-    freshSeries: retryDecision && decisionIsFresh,
+-    interruptionCount,
+-    guidanceText,
+-    openSteerQuestion,
+-    mergedAt,
+-    consultCount,
+-    lastFailingCheckFingerprint,
+-    suggestionFingerprints,
+-    decisionFingerprints,
+-  };
++  return withRoutedBlocking(
++    {
++      slug: itemSlug,
++      kind,
++      title,
++      wave,
++      deps,
++      status,
++      assignment,
++      branch,
++      records,
++      currentStepId: records[records.length - 1]?.name,
++      currentAttempt,
++      currentFixRound,
++      isEscalated,
++      freshSeries: retryDecision && decisionIsFresh,
++      interruptionCount,
++      guidanceText,
++      openSteerQuestion,
++      mergedAt,
++      consultCount,
++      lastFailingCheckFingerprint,
++      suggestionFingerprints,
++      decisionFingerprints,
++    },
++    opts.blockedBy ? new Set(opts.blockedBy) : undefined
++  );
+ }
+diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
+index 7128367..15a617f 100644
+--- a/plugins/software-factory/src/core/derive/task.ts
++++ b/plugins/software-factory/src/core/derive/task.ts
+@@ -13,10 +13,11 @@ import type {
+   TriageArtifact,
+ } from "../artifacts.js";
+ import { readYaml, writeYamlAtomic } from "../records/io.js";
+-import { deriveItemState, type DerivedItemState } from "./item.js";
++import { deriveItemState, withRoutedBlocking, TERMINAL_ITEM_STATUSES, type DerivedItemState } from "./item.js";
+ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
+ import { BudgetTracker } from "../budget.js";
+ import { listConcerns } from "../concerns.js";
++import { cascadePendingBlocked } from "../plan/scheduler.js";
+ import { git } from "../git/exec.js";
+ import { isAncestor } from "../git/commit.js";
+ 
+@@ -38,6 +39,21 @@ export interface DerivedTaskState {
+   toStateArtifact(): StateArtifact;
+ }
+ 
++/**
++ * Collects item slugs named by routed blocker concerns (adr-routing-derived-state).
++ * Pure read: the concern store is authoritative; derive never writes.
++ */
++export async function collectRoutedBlockers(taskDir: string): Promise<Set<string>> {
++  const affected = new Set<string>();
++  for (const concern of await listConcerns(taskDir)) {
++    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
++    for (const slug of concern.affects ?? []) {
++      affected.add(slug);
++    }
++  }
++  return affected;
++}
++
+ /**
+  * Derives comprehensive task state from disk and git (§6.3 Invariant 4).
+  * Pure derivation; state.yaml is a materialized view never read for decisions.
+@@ -127,25 +143,41 @@ export async function deriveTaskState(opts: {
+ 
+   // 5. Items
+   const items: DerivedItemState[] = [];
+-  const itemMap: Record<string, DerivedItemState> = {};
+   const itemsDir = path.join(taskDir, "items");
+   if (fs.existsSync(itemsDir)) {
+     const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
+     for (const ent of itemEntries) {
+       if (!ent.isDirectory()) continue;
+-      const itState = await deriveItemState({
+-        taskDir,
+-        itemSlug: ent.name,
+-        parentBranch,
+-        taskWt,
+-        pipeline,
+-        project,
+-      });
+-      items.push(itState);
+-      itemMap[ent.name] = itState;
++      items.push(
++        await deriveItemState({
++          taskDir,
++          itemSlug: ent.name,
++          parentBranch,
++          taskWt,
++          pipeline,
++          project,
++        })
++      );
+     }
+   }
+ 
++  // 5b. Routed blockers (adr-routing-derived-state): a routed blocker concern
++  // blocks the items it affects and their declared dependents, transitively.
++  const routedNames = await collectRoutedBlockers(taskDir);
++  const routedBlocked = new Set<string>();
++  for (const it of items) {
++    if (routedNames.has(it.slug) && !TERMINAL_ITEM_STATUSES.has(it.status)) {
++      routedBlocked.add(it.slug);
++    }
++  }
++  cascadePendingBlocked(items, routedBlocked);
++  const itemMap: Record<string, DerivedItemState> = {};
++  for (let i = 0; i < items.length; i++) {
++    const blocked = withRoutedBlocking(items[i]!, routedBlocked);
++    items[i] = blocked;
++    itemMap[blocked.slug] = blocked;
++  }
++
+   // Sort items deterministically by wave then slug
+   items.sort((a, b) => (a.wave !== b.wave ? a.wave - b.wave : a.slug.localeCompare(b.slug)));
+ 
+diff --git a/plugins/software-factory/src/core/derive/wave.ts b/plugins/software-factory/src/core/derive/wave.ts
+index 06274b1..ed5af6d 100644
+--- a/plugins/software-factory/src/core/derive/wave.ts
++++ b/plugins/software-factory/src/core/derive/wave.ts
+@@ -1,5 +1,5 @@
+ import type { DerivedItemState } from "./item.js";
+-import { blockedByFailure } from "../plan/scheduler.js";
++import { blockedByFailure, cascadePendingBlocked } from "../plan/scheduler.js";
+ 
+ export interface DerivedWaveState {
+   wave: number;
+@@ -24,6 +24,8 @@ export function deriveWaveState(opts: {
+   wave: number;
+   items: DerivedItemState[];
+   maxParallelItems?: number;
++  /** Slugs named by routed blocker concerns; cascaded over declared deps. */
++  blockedBy?: Iterable<string>;
+ }): DerivedWaveState {
+   const { wave, items } = opts;
+   const waveItems = items.filter((it) => it.wave === wave || (it.wave < wave && it.status === "blocked"));
+@@ -41,25 +43,23 @@ export function deriveWaveState(opts: {
+     allBySlug.set(it.slug, it);
+   }
+ 
+-  // Dependents of failed items become blocked-by-failure, cascaded transitively
+-  // to a fixpoint (§8.2): an item blocked this way blocks its own dependents.
++  // Dependents of failed items become blocked-by-failure, and items named by
++  // routed blocker concerns become blocked; both cascade transitively over
++  // declared deps to a fixpoint (§8.2, adr-routing-derived-state).
+   const schedItems = items.map((it) => ({
+     slug: it.slug,
+     wave: String(it.wave),
+     deps: it.deps,
+     status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
+   }));
+-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
+-  let grew = failureBlocked.size > 0;
+-  while (grew) {
+-    grew = false;
+-    for (const it of items) {
+-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
+-        failureBlocked.add(it.slug);
+-        grew = true;
+-      }
++  const blockedSlugs = new Set<string>(blockedByFailure(schedItems));
++  const bySlug = new Map(items.map((it) => [it.slug, it]));
++  for (const slug of opts.blockedBy ?? []) {
++    if (bySlug.get(slug)?.status === "pending") {
++      blockedSlugs.add(slug);
+     }
+   }
++  cascadePendingBlocked(items, blockedSlugs);
+ 
+   for (const it of waveItems) {
+     if (it.status === "merged") {
+@@ -75,8 +75,8 @@ export function deriveWaveState(opts: {
+     } else if (it.status === "blocked") {
+       blocked.push(it);
+     } else if (it.status === "pending") {
+-      // Blocked-by-failure (transitive fixpoint computed above) routes to blocked.
+-      if (failureBlocked.has(it.slug)) {
++      // Blocked by failure or a routed concern (transitive fixpoint computed above).
++      if (blockedSlugs.has(it.slug)) {
+         blocked.push(it);
+         continue;
+       }
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 58b8bd6..313559a 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -24,7 +24,7 @@ import { mergeItem } from "./merge-path.js";
+ import { tickItemMachine } from "./item-machine.js";
+ import { deriveItemState } from "../derive/item.js";
+ import { deriveWaveState } from "../derive/wave.js";
+-import { refreshStateYaml } from "../derive/task.js";
++import { refreshStateYaml, collectRoutedBlockers } from "../derive/task.js";
+ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+@@ -729,7 +729,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
+       )
+     );
+-    let waveState = deriveWaveState({ wave: w, items: itemStates });
++    let waveState = deriveWaveState({
++      wave: w,
++      items: itemStates,
++      blockedBy: await collectRoutedBlockers(taskDir),
++    });
+ 
+     if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
+       continue;
+@@ -802,7 +806,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+           deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
+         )
+       );
+-      waveState = deriveWaveState({ wave: w, items: itemStates });
++      waveState = deriveWaveState({
++        wave: w,
++        items: itemStates,
++        blockedBy: await collectRoutedBlockers(taskDir),
++      });
+       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
+     }
+ 
+diff --git a/plugins/software-factory/src/core/plan/index.ts b/plugins/software-factory/src/core/plan/index.ts
+index 7ab8f71..64b9670 100644
+--- a/plugins/software-factory/src/core/plan/index.ts
++++ b/plugins/software-factory/src/core/plan/index.ts
+@@ -3,6 +3,7 @@ export { applyEdits } from "./apply.js";
+ export {
+   type SchedItem,
+   blockedByFailure,
++  blockedByConcern,
+   nextWave,
+   runnable,
+ } from "./scheduler.js";
+diff --git a/plugins/software-factory/src/core/plan/scheduler.ts b/plugins/software-factory/src/core/plan/scheduler.ts
+index 836a6d6..fa78e0a 100644
+--- a/plugins/software-factory/src/core/plan/scheduler.ts
++++ b/plugins/software-factory/src/core/plan/scheduler.ts
+@@ -33,6 +33,50 @@ export function blockedByFailure(items: SchedItem[]): string[] {
+     .map((i) => i.slug);
+ }
+ 
++/**
++ * Expands blocked slugs to a fixpoint over declared `deps` (§8.2): a pending
++ * item depending on any blocked slug can never run, so it is blocked too.
++ * Mutates `blocked` in place and returns it.
++ */
++export function cascadePendingBlocked<T extends { slug: string; deps: string[]; status: string }>(
++  items: T[],
++  blocked: Set<string>
++): Set<string> {
++  let grew = blocked.size > 0;
++  while (grew) {
++    grew = false;
++    for (const item of items) {
++      if (item.status !== "pending" || blocked.has(item.slug) || !item.deps.some((d) => blocked.has(d))) {
++        continue;
++      }
++      blocked.add(item.slug);
++      grew = true;
++    }
++  }
++  return blocked;
++}
++
++/**
++ * Returns the slugs blocked by routed concern blockers (adr-routing-derived-state).
++ *
++ * `concernBlocked` names items that routed blocker concerns affect. A pending
++ * affected item is blocked, and pending items depending on any blocked slug are
++ * blocked transitively to a fixpoint. The result unions with `blockedByFailure`
++ * so callers see one failure/concern picture. Refs naming no item, terminal
++ * items, and non-pending work are ignored. Preserves input (PM) order.
++ */
++export function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
++  const bySlug = new Map(items.map((i) => [i.slug, i]));
++  const blocked = new Set(blockedByFailure(items));
++  for (const slug of concernBlocked) {
++    if (bySlug.get(slug)?.status === "pending") {
++      blocked.add(slug);
++    }
++  }
++  cascadePendingBlocked(items, blocked);
++  return items.filter((i) => blocked.has(i.slug)).map((i) => i.slug);
++}
++
+ /**
+  * Determines the next wave to execute according to wave sequence order (§8.4).
+  *
+diff --git a/plugins/software-factory/test/engine/routing-blocker-derive.test.ts b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+new file mode 100644
+index 0000000..a43e763
+--- /dev/null
++++ b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
+@@ -0,0 +1,343 @@
++import { afterEach, describe, expect, it } from "bun:test";
++import fs from "node:fs";
++import os from "node:os";
++import path from "node:path";
++import * as deriveTaskModule from "../../src/core/derive/task.js";
++import { deriveItemState, type DerivedItemState } from "../../src/core/derive/item.js";
++import { deriveWaveState } from "../../src/core/derive/wave.js";
++import type { StoredConcernArtifact } from "../../src/core/artifacts.js";
++
++/**
++ * Routed blockers are pure derive data (adr-routing-derived-state): a `routed`
++ * concern of kind `blocker` names the items it affects (`affects`), and derive
++ * marks the named items plus their declared dependents blocked. Derivation
++ * never writes: no concern, decision, mailbox, or state files change.
++ */
++
++type CollectRoutedBlockers = (taskDir: string) => Promise<Set<string>>;
++
++/**
++ * Test-first seam: while `derive/task.ts` does not yet export the collector,
++ * an inert fallback keeps module collection alive so the behavioural
++ * assertions fail as assertion failures (target-red), not import errors.
++ */
++const collectRoutedBlockers: CollectRoutedBlockers =
++  (deriveTaskModule as unknown as { collectRoutedBlockers?: CollectRoutedBlockers })
++    .collectRoutedBlockers ?? (async () => new Set<string>());
++
++type ItemDeriveOpts = Parameters<typeof deriveItemState>[0] & {
++  blockedBy?: Iterable<string>;
++};
++type WaveDeriveOpts = Parameters<typeof deriveWaveState>[0] & {
++  blockedBy?: Iterable<string>;
++};
++
++const tmpDirs: string[] = [];
++
++function makeTaskDir(): string {
++  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-routed-blocker-"));
++  tmpDirs.push(dir);
++  return dir;
++}
++
++afterEach(() => {
++  for (const dir of tmpDirs.splice(0)) {
++    fs.rmSync(dir, { recursive: true, force: true });
++  }
++});
++
++async function routedBlockedSlugs(taskDir: string): Promise<Set<string>> {
++  return collectRoutedBlockers(taskDir);
++}
++
++function writeItem(
++  taskDir: string,
++  slug: string,
++  opts: { wave?: number; deps?: string[] } = {}
++): void {
++  const dir = path.join(taskDir, "items", slug);
++  fs.mkdirSync(dir, { recursive: true });
++  const deps = opts.deps ?? [];
++  const depsYaml =
++    deps.length === 0 ? "deps: []" : `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}`;
++  fs.writeFileSync(
++    path.join(dir, "assignment.yaml"),
++    [
++      `slug: ${slug}`,
++      "kind: dev",
++      `title: ${slug}`,
++      "assignment: Do the work",
++      `wave: ${opts.wave ?? 1}`,
++      depsYaml,
++    ].join("\n") + "\n",
++    "utf8"
++  );
++}
++
++function writeConcern(
++  taskDir: string,
++  concern: Pick<StoredConcernArtifact, "id" | "kind" | "summary" | "status"> &
++    Partial<StoredConcernArtifact>
++): void {
++  const dir = path.join(taskDir, "concerns");
++  fs.mkdirSync(dir, { recursive: true });
++  const record = {
++    detail: concern.summary,
++    severity: "medium",
++    source: { record: "test-first", agent: "test" },
++    createdAt: "2026-01-01T00:00:00.000Z",
++    updatedAt: "2026-01-01T00:00:00.000Z",
++    ...concern,
++  };
++  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(record, null, 2), "utf8");
++}
++
++function derivedItem(partial: Partial<DerivedItemState> & { slug: string }): DerivedItemState {
++  return {
++    kind: "dev",
++    title: partial.slug,
++    wave: 1,
++    deps: [],
++    status: "pending",
++    branch: `topic/routing-blocker--${partial.slug}`,
++    records: [],
++    currentAttempt: 1,
++    currentFixRound: 1,
++    isEscalated: false,
++    freshSeries: false,
++    interruptionCount: 0,
++    consultCount: 0,
++    suggestionFingerprints: [],
++    decisionFingerprints: [],
++    ...partial,
++  };
++}
++
++/** Reads every file under `root` so a test can prove derive is write-free. */
++function snapshotTree(root: string): Record<string, string> {
++  const out: Record<string, string> = {};
++  const walk = (dir: string) => {
++    const entries = fs
++      .readdirSync(dir, { withFileTypes: true })
++      .sort((a, b) => a.name.localeCompare(b.name));
++    for (const entry of entries) {
++      const full = path.join(dir, entry.name);
++      if (entry.isDirectory()) walk(full);
++      else out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
++    }
++  };
++  walk(root);
++  return out;
++}
++
++describe("derive/task: collectRoutedBlockers", () => {
++  it("collects affects of routed blocker concerns and ignores other statuses and kinds", async () => {
++    const taskDir = makeTaskDir();
++    writeConcern(taskDir, {
++      id: "c-routed-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Schema migration is pending",
++      affects: ["item-b", "item-c"],
++    });
++    writeConcern(taskDir, {
++      id: "c-open-blocker",
++      kind: "blocker",
++      status: "open",
++      summary: "Not triaged yet",
++      affects: ["item-open"],
++    });
++    writeConcern(taskDir, {
++      id: "c-routed-risk",
++      kind: "risk",
++      status: "routed",
++      summary: "Routed risk",
++      affects: ["item-risk"],
++    });
++    writeConcern(taskDir, {
++      id: "c-resolved-blocker",
++      kind: "blocker",
++      status: "resolved",
++      summary: "Already handled",
++      affects: ["item-resolved"],
++    });
++    writeConcern(taskDir, {
++      id: "c-dismissed-blocker",
++      kind: "blocker",
++      status: "dismissed",
++      summary: "Dismissed by the reviewer",
++      affects: ["item-dismissed"],
++    });
++
++    const blocked = await routedBlockedSlugs(taskDir);
++    expect(blocked).toBeInstanceOf(Set);
++    expect([...blocked].sort()).toEqual(["item-b", "item-c"]);
++  });
++
++  it("returns an empty set when the task has no concerns directory", async () => {
++    const taskDir = makeTaskDir();
++
++    expect([...(await routedBlockedSlugs(taskDir))]).toEqual([]);
++
++    // The same derive seam starts reporting once a routed blocker is stored.
++    writeConcern(taskDir, {
++      id: "c-late-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Discovered after the first derive",
++      affects: ["late-item"],
++    });
++    expect([...(await routedBlockedSlugs(taskDir))].sort()).toEqual(["late-item"]);
++  });
++});
++
++describe("derive/wave: routed blocker integration", () => {
++  it("routes a concern-affected item and its declared dependents to blocked", () => {
++    const items = [
++      derivedItem({ slug: "seed", wave: 8 }),
++      derivedItem({ slug: "dependent", wave: 8, deps: ["seed"] }),
++      derivedItem({ slug: "independent", wave: 8, deps: [] }),
++    ];
++
++    const wave = deriveWaveState({
++      wave: 8,
++      items,
++      blockedBy: new Set(["seed"]),
++    } as WaveDeriveOpts);
++
++    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["dependent", "seed"]);
++    expect(wave.runnable.map((i) => i.slug)).toEqual(["independent"]);
++  });
++
++  it("cascades transitively over declared deps only", () => {
++    const items = [
++      derivedItem({ slug: "seed", wave: 8 }),
++      derivedItem({ slug: "child", wave: 8, deps: ["seed"] }),
++      derivedItem({ slug: "grandchild", wave: 8, deps: ["child"] }),
++      derivedItem({ slug: "side", wave: 8, deps: [] }),
++    ];
++
++    const wave = deriveWaveState({
++      wave: 8,
++      items,
++      blockedBy: new Set(["seed"]),
++    } as WaveDeriveOpts);
++
++    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["child", "grandchild", "seed"]);
++    expect(wave.runnable.map((i) => i.slug)).toEqual(["side"]);
++  });
++});
++
++describe("derive/item: routed blocker integration", () => {
++  it("blocks only the item named by a routed blocker", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "affected");
++    writeItem(taskDir, "unaffected");
++    const blockedBy = new Set(["affected"]);
++
++    const affected = await deriveItemState({
++      taskDir,
++      itemSlug: "affected",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++    const unaffected = await deriveItemState({
++      taskDir,
++      itemSlug: "unaffected",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++
++    expect(affected.status).toBe("blocked");
++    expect(unaffected.status).toBe("pending");
++  });
++
++  it("keeps a terminal item status over routed blocking", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "abandoned");
++    writeItem(taskDir, "blocked-one");
++    const decisionsDir = path.join(taskDir, "decisions");
++    fs.mkdirSync(decisionsDir, { recursive: true });
++    fs.writeFileSync(
++      path.join(decisionsDir, "001-abandon.yaml"),
++      JSON.stringify({
++        id: "decision-abandon",
++        context: "item",
++        item: "abandoned",
++        decision: "abandon",
++        rationale: "No longer needed",
++        timestamp: "2026-01-01T00:00:00.000Z",
++      }),
++      "utf8"
++    );
++    const blockedBy = new Set(["abandoned", "blocked-one"]);
++
++    const abandoned = await deriveItemState({
++      taskDir,
++      itemSlug: "abandoned",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++    const blockedOne = await deriveItemState({
++      taskDir,
++      itemSlug: "blocked-one",
++      parentBranch: "topic/routing-blocker",
++      blockedBy,
++    } as ItemDeriveOpts);
++
++    expect(abandoned.status).toBe("failed");
++    expect(blockedOne.status).toBe("blocked");
++  });
++});
++
++describe("derive/task: routed blocker scenario", () => {
++  it("blocks affected items and declared dependents, leaving non-dependents pending without writes", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "blocker-source", { wave: 1 });
++    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
++    writeItem(taskDir, "transitive", { wave: 3, deps: ["dependent"] });
++    writeItem(taskDir, "independent", { wave: 3 });
++    writeConcern(taskDir, {
++      id: "c-routed-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Upstream schema migration blocks the wave",
++      affects: ["blocker-source"],
++    });
++
++    const before = snapshotTree(taskDir);
++    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
++    const after = snapshotTree(taskDir);
++
++    expect(state.itemMap["blocker-source"]?.status).toBe("blocked");
++    expect(state.itemMap["dependent"]?.status).toBe("blocked");
++    expect(state.itemMap["transitive"]?.status).toBe("blocked");
++    expect(state.itemMap["independent"]?.status).toBe("pending");
++
++    expect(state.waves.find((w) => w.wave === 2)?.blocked.map((i) => i.slug)).toContain("dependent");
++    const wave3 = state.waves.find((w) => w.wave === 3);
++    expect(wave3?.blocked.map((i) => i.slug)).toContain("transitive");
++    expect(wave3?.runnable.map((i) => i.slug)).toContain("independent");
++
++    // Pure derive: no concern/decision/mailbox/state file is written or changed.
++    expect(after).toEqual(before);
++  });
++
++  it("derives the task blocked when every item is in the routed blocker cascade", async () => {
++    const taskDir = makeTaskDir();
++    writeItem(taskDir, "blocker-source", { wave: 1 });
++    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
++    writeConcern(taskDir, {
++      id: "c-routed-blocker",
++      kind: "blocker",
++      status: "routed",
++      summary: "Blocked until the operator answers",
++      affects: ["blocker-source"],
++    });
++
++    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
++
++    expect(state.itemMap["dependent"]?.status).toBe("blocked");
++    expect(state.status).toBe("blocked");
++  });
++});
+diff --git a/plugins/software-factory/test/plan-scheduler.test.ts b/plugins/software-factory/test/plan-scheduler.test.ts
+index 7f34551..d408fdd 100644
+--- a/plugins/software-factory/test/plan-scheduler.test.ts
++++ b/plugins/software-factory/test/plan-scheduler.test.ts
+@@ -1,6 +1,22 @@
+ import { describe, expect, it } from "bun:test";
++import * as schedulerModule from "../src/core/plan/scheduler.js";
+ import { blockedByFailure, nextWave, runnable, type SchedItem } from "../src/core/plan/scheduler.js";
+ 
++const blockedByConcernImpl = (
++  schedulerModule as unknown as {
++    blockedByConcern?: (items: SchedItem[], concernBlocked: Iterable<string>) => string[];
++  }
++).blockedByConcern;
++
++/**
++ * Test-first seam: while the scheduler does not yet export `blockedByConcern`,
++ * the inert fallback keeps module collection alive so the behavioural
++ * assertions fail as assertion failures (target-red), not import errors.
++ */
++function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
++  return blockedByConcernImpl ? blockedByConcernImpl(items, concernBlocked) : [];
++}
++
+ describe("plan/scheduler: nextWave", () => {
+   it("returns current active wave while items are pending or running", () => {
+     const items: SchedItem[] = [
+@@ -172,3 +188,43 @@ describe("plan/scheduler: blockedByFailure", () => {
+     expect(blockedByFailure(items)).toEqual([]);
+   });
+ });
++
++describe("plan/scheduler: blockedByConcern", () => {
++  it("blocks concern-affected items and their declared dependents in PM order", () => {
++    const items: SchedItem[] = [
++      { slug: "seed", wave: "8", deps: [], status: "pending" },
++      { slug: "dependent", wave: "8", deps: ["seed"], status: "pending" },
++      { slug: "independent", wave: "8", deps: [], status: "pending" },
++    ];
++
++    expect(blockedByConcern(items, ["seed"])).toEqual(["seed", "dependent"]);
++  });
++
++  it("unions concern blocking with the failure-blocked fixpoint over declared deps", () => {
++    const items: SchedItem[] = [
++      { slug: "failed", wave: "8", deps: [], status: "failed" },
++      { slug: "failure-dependent", wave: "8", deps: ["failed"], status: "pending" },
++      { slug: "failure-transitive", wave: "8", deps: ["failure-dependent"], status: "pending" },
++      { slug: "seed", wave: "8", deps: [], status: "pending" },
++      { slug: "concern-dependent", wave: "8", deps: ["seed"], status: "pending" },
++      { slug: "independent", wave: "8", deps: [], status: "pending" },
++    ];
++
++    expect(blockedByConcern(items, ["seed"])).toEqual([
++      "failure-dependent",
++      "failure-transitive",
++      "seed",
++      "concern-dependent",
++    ]);
++  });
++
++  it("ignores refs naming no item and never blocks a done item", () => {
++    const items: SchedItem[] = [
++      { slug: "already-done", wave: "8", deps: [], status: "done" },
++      { slug: "seed", wave: "8", deps: [], status: "pending" },
++      { slug: "other", wave: "8", deps: [], status: "pending" },
++    ];
++
++    expect(blockedByConcern(items, ["plan", "already-done", "seed"])).toEqual(["seed"]);
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..fa143e4
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 4
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
+startedAt: 2026-11-08T10:42:50.808Z
+session: 01a1bac0-f8a1-72a4-bc33-2ad9d73907b9
+endedAt: 2026-11-08T10:59:27.825Z
+usage:
+  inputTokens: 52724
+  outputTokens: 26952
+  costUsd: 0.011351
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-42-51-169Z_01a1bac0-f8a1-72a4-bc33-2ad9d73907b9.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/output.yaml
new file mode 100644
index 0000000..3a60ed2
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-blocker-derive-v2/steps/004-review-r1-a1/output.yaml
@@ -0,0 +1,71 @@
+status: changes_requested
+summary: Routed seed predicate diverges across layers; wave duplicates scheduler
+  fixpoint
+suggestions:
+  - id: routed-seed-predicate-divergence
+    disposition: fix
+    summary: "Unify routed-blocker seed predicate: task/item use non-terminal,
+      wave/scheduler use pending-only"
+    detail: task.ts seeds routedBlocked for any non-terminal (!TERMINAL) while
+      wave.ts and scheduler.blockedByConcern seed only status==pending.
+      withRoutedBlocking also blocks running/ready. Same concern therefore
+      derives different blocked sets via deriveTaskState (running/ready seeds
+      blocked + pending dependents cascaded) vs iteration deriveWaveState
+      (running/ready seeds ignored, dependents stay runnable). Breaks
+      pure-derive consistency; refreshStateYaml can report blocked while
+      iteration keeps scheduling the item. Align all three to one predicate
+      (pending-only matches §8.2 precedent and avoids retro-blocking in-flight
+      work; if non-terminal is intended, update wave/scheduler to match) and add
+      a running/ready-seed test to lock it.
+    location:
+      file: plugins/software-factory/src/core/derive/task.ts
+      line: 169
+  - id: wave-reuse-blockedByConcern
+    disposition: fix
+    summary: deriveWaveState reimplements blockedByConcern seeding+cascade instead
+      of reusing it
+    detail: wave.ts builds blockedSlugs via blockedByFailure + manual pending-seed
+      loop + cascadePendingBlocked, which is exactly
+      blockedByConcern(schedItems, blockedBy). Duplication already caused the
+      predicate divergence with task.ts. Replace with new
+      Set(blockedByConcern(schedItems, opts.blockedBy ?? [])) (schedItems
+      mapping already exists) so the failure-union fixpoint has one owner; apply
+      the same shared helper for task.ts post-processing.
+    location:
+      file: plugins/software-factory/src/core/derive/wave.ts
+      line: 55
+  - id: iteration-final-blocked-check-ignores-routed
+    disposition: optional
+    summary: Iteration end-of-wave blocked check derives without blockedBy, misses
+      routed blockers
+    detail: iteration.ts derives allCurrentStates via deriveItemState without
+      blockedBy and checks status==blocked. Routed-blocked items stay pending
+      there (blocking only materialized in deriveTaskState itemMap or wave
+      buckets), so the iteration blocked early-return never fires for
+      routed-only blocking while deriveTaskState reports task blocked. Either
+      derive via a routed-aware path or check wave/blocked buckets; defer to
+      routing-architect-consult act-phase if intentional.
+    location:
+      file: plugins/software-factory/src/core/flows/iteration.ts
+      line: 1091
+  - id: blockedby-naming
+    disposition: optional
+    summary: Unify blockedBy vs concernBlocked/routedNames naming for the same set
+    detail: derive item/wave use blockedBy for affected-item slugs (reads as edge
+      list), scheduler uses concernBlocked, task uses routedNames/routedBlocked.
+      Pick one term (e.g. concernBlocked or routedBlocked) across derive +
+      scheduler to avoid misreading as blocker ids.
+    location:
+      file: plugins/software-factory/src/core/derive/wave.ts
+      line: 28
+  - id: task-wave-blockedby-comment
+    disposition: optional
+    summary: Document why deriveTaskState wave calls omit blockedBy
+    detail: Items are pre-blocked via withRoutedBlocking before the wave loop, so
+      deriveWaveState calls intentionally omit blockedBy (seeds would be status
+      blocked, not pending). Add a one-line comment at the wave loop to prevent
+      a future caller from threading it twice or removing the post-process as
+      redundant.
+    location:
+      file: plugins/software-factory/src/core/derive/task.ts
+      line: 190
diff --git a/plugins/software-factory/src/core/derive/item.ts b/plugins/software-factory/src/core/derive/item.ts
index 925d1f7..c08cc9b 100644
--- a/plugins/software-factory/src/core/derive/item.ts
+++ b/plugins/software-factory/src/core/derive/item.ts
@@ -54,6 +54,28 @@ export interface DerivedItemState {
   decisionFingerprints: string[];
 }
 
+/** Terminal item outcomes: routed blockers never override these (§8.2). */
+export const TERMINAL_ITEM_STATUSES: ReadonlySet<DerivedItemState["status"]> = new Set([
+  "merged",
+  "failed",
+  "superseded",
+]);
+
+/**
+ * Applies routed concern blocking (adr-routing-derived-state): an item named by
+ * a routed blocker concern derives `blocked` unless it already reached a
+ * terminal outcome.
+ */
+export function withRoutedBlocking(
+  state: DerivedItemState,
+  blockedBy?: ReadonlySet<string>
+): DerivedItemState {
+  if (!blockedBy?.has(state.slug) || TERMINAL_ITEM_STATUSES.has(state.status)) {
+    return state;
+  }
+  return { ...state, status: "blocked" };
+}
+
 /**
  * Derives state of a single item from assignment, step records, decisions, steering, and git (§6, §8).
  */
@@ -66,6 +88,8 @@ export async function deriveItemState(opts: {
   pipeline?: PipelineConfig;
   project?: ProjectConfig;
   kindConfig?: FlowKindConfig;
+  /** Slugs named by routed blocker concerns (adr-routing-derived-state). */
+  blockedBy?: Iterable<string>;
 }): Promise<DerivedItemState> {
   const { taskDir, itemSlug, parentBranch, taskWt, childWt, pipeline, project } = opts;
   const itemDir = path.join(taskDir, "items", itemSlug);
@@ -424,28 +448,31 @@ export async function deriveItemState(opts: {
     }
   }
 
-  return {
-    slug: itemSlug,
-    kind,
-    title,
-    wave,
-    deps,
-    status,
-    assignment,
-    branch,
-    records,
-    currentStepId: records[records.length - 1]?.name,
-    currentAttempt,
-    currentFixRound,
-    isEscalated,
-    freshSeries: retryDecision && decisionIsFresh,
-    interruptionCount,
-    guidanceText,
-    openSteerQuestion,
-    mergedAt,
-    consultCount,
-    lastFailingCheckFingerprint,
-    suggestionFingerprints,
-    decisionFingerprints,
-  };
+  return withRoutedBlocking(
+    {
+      slug: itemSlug,
+      kind,
+      title,
+      wave,
+      deps,
+      status,
+      assignment,
+      branch,
+      records,
+      currentStepId: records[records.length - 1]?.name,
+      currentAttempt,
+      currentFixRound,
+      isEscalated,
+      freshSeries: retryDecision && decisionIsFresh,
+      interruptionCount,
+      guidanceText,
+      openSteerQuestion,
+      mergedAt,
+      consultCount,
+      lastFailingCheckFingerprint,
+      suggestionFingerprints,
+      decisionFingerprints,
+    },
+    opts.blockedBy ? new Set(opts.blockedBy) : undefined
+  );
 }
diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
index 7128367..15a617f 100644
--- a/plugins/software-factory/src/core/derive/task.ts
+++ b/plugins/software-factory/src/core/derive/task.ts
@@ -13,10 +13,11 @@ import type {
   TriageArtifact,
 } from "../artifacts.js";
 import { readYaml, writeYamlAtomic } from "../records/io.js";
-import { deriveItemState, type DerivedItemState } from "./item.js";
+import { deriveItemState, withRoutedBlocking, TERMINAL_ITEM_STATUSES, type DerivedItemState } from "./item.js";
 import { deriveWaveState, type DerivedWaveState } from "./wave.js";
 import { BudgetTracker } from "../budget.js";
 import { listConcerns } from "../concerns.js";
+import { cascadePendingBlocked } from "../plan/scheduler.js";
 import { git } from "../git/exec.js";
 import { isAncestor } from "../git/commit.js";
 
@@ -38,6 +39,21 @@ export interface DerivedTaskState {
   toStateArtifact(): StateArtifact;
 }
 
+/**
+ * Collects item slugs named by routed blocker concerns (adr-routing-derived-state).
+ * Pure read: the concern store is authoritative; derive never writes.
+ */
+export async function collectRoutedBlockers(taskDir: string): Promise<Set<string>> {
+  const affected = new Set<string>();
+  for (const concern of await listConcerns(taskDir)) {
+    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
+    for (const slug of concern.affects ?? []) {
+      affected.add(slug);
+    }
+  }
+  return affected;
+}
+
 /**
  * Derives comprehensive task state from disk and git (§6.3 Invariant 4).
  * Pure derivation; state.yaml is a materialized view never read for decisions.
@@ -127,25 +143,41 @@ export async function deriveTaskState(opts: {
 
   // 5. Items
   const items: DerivedItemState[] = [];
-  const itemMap: Record<string, DerivedItemState> = {};
   const itemsDir = path.join(taskDir, "items");
   if (fs.existsSync(itemsDir)) {
     const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
     for (const ent of itemEntries) {
       if (!ent.isDirectory()) continue;
-      const itState = await deriveItemState({
-        taskDir,
-        itemSlug: ent.name,
-        parentBranch,
-        taskWt,
-        pipeline,
-        project,
-      });
-      items.push(itState);
-      itemMap[ent.name] = itState;
+      items.push(
+        await deriveItemState({
+          taskDir,
+          itemSlug: ent.name,
+          parentBranch,
+          taskWt,
+          pipeline,
+          project,
+        })
+      );
     }
   }
 
+  // 5b. Routed blockers (adr-routing-derived-state): a routed blocker concern
+  // blocks the items it affects and their declared dependents, transitively.
+  const routedNames = await collectRoutedBlockers(taskDir);
+  const routedBlocked = new Set<string>();
+  for (const it of items) {
+    if (routedNames.has(it.slug) && !TERMINAL_ITEM_STATUSES.has(it.status)) {
+      routedBlocked.add(it.slug);
+    }
+  }
+  cascadePendingBlocked(items, routedBlocked);
+  const itemMap: Record<string, DerivedItemState> = {};
+  for (let i = 0; i < items.length; i++) {
+    const blocked = withRoutedBlocking(items[i]!, routedBlocked);
+    items[i] = blocked;
+    itemMap[blocked.slug] = blocked;
+  }
+
   // Sort items deterministically by wave then slug
   items.sort((a, b) => (a.wave !== b.wave ? a.wave - b.wave : a.slug.localeCompare(b.slug)));
 
diff --git a/plugins/software-factory/src/core/derive/wave.ts b/plugins/software-factory/src/core/derive/wave.ts
index 06274b1..ed5af6d 100644
--- a/plugins/software-factory/src/core/derive/wave.ts
+++ b/plugins/software-factory/src/core/derive/wave.ts
@@ -1,5 +1,5 @@
 import type { DerivedItemState } from "./item.js";
-import { blockedByFailure } from "../plan/scheduler.js";
+import { blockedByFailure, cascadePendingBlocked } from "../plan/scheduler.js";
 
 export interface DerivedWaveState {
   wave: number;
@@ -24,6 +24,8 @@ export function deriveWaveState(opts: {
   wave: number;
   items: DerivedItemState[];
   maxParallelItems?: number;
+  /** Slugs named by routed blocker concerns; cascaded over declared deps. */
+  blockedBy?: Iterable<string>;
 }): DerivedWaveState {
   const { wave, items } = opts;
   const waveItems = items.filter((it) => it.wave === wave || (it.wave < wave && it.status === "blocked"));
@@ -41,25 +43,23 @@ export function deriveWaveState(opts: {
     allBySlug.set(it.slug, it);
   }
 
-  // Dependents of failed items become blocked-by-failure, cascaded transitively
-  // to a fixpoint (§8.2): an item blocked this way blocks its own dependents.
+  // Dependents of failed items become blocked-by-failure, and items named by
+  // routed blocker concerns become blocked; both cascade transitively over
+  // declared deps to a fixpoint (§8.2, adr-routing-derived-state).
   const schedItems = items.map((it) => ({
     slug: it.slug,
     wave: String(it.wave),
     deps: it.deps,
     status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
   }));
-  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
-  let grew = failureBlocked.size > 0;
-  while (grew) {
-    grew = false;
-    for (const it of items) {
-      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
-        failureBlocked.add(it.slug);
-        grew = true;
-      }
+  const blockedSlugs = new Set<string>(blockedByFailure(schedItems));
+  const bySlug = new Map(items.map((it) => [it.slug, it]));
+  for (const slug of opts.blockedBy ?? []) {
+    if (bySlug.get(slug)?.status === "pending") {
+      blockedSlugs.add(slug);
     }
   }
+  cascadePendingBlocked(items, blockedSlugs);
 
   for (const it of waveItems) {
     if (it.status === "merged") {
@@ -75,8 +75,8 @@ export function deriveWaveState(opts: {
     } else if (it.status === "blocked") {
       blocked.push(it);
     } else if (it.status === "pending") {
-      // Blocked-by-failure (transitive fixpoint computed above) routes to blocked.
-      if (failureBlocked.has(it.slug)) {
+      // Blocked by failure or a routed concern (transitive fixpoint computed above).
+      if (blockedSlugs.has(it.slug)) {
         blocked.push(it);
         continue;
       }
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index 58b8bd6..313559a 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -24,7 +24,7 @@ import { mergeItem } from "./merge-path.js";
 import { tickItemMachine } from "./item-machine.js";
 import { deriveItemState } from "../derive/item.js";
 import { deriveWaveState } from "../derive/wave.js";
-import { refreshStateYaml } from "../derive/task.js";
+import { refreshStateYaml, collectRoutedBlockers } from "../derive/task.js";
 import { appendJournal } from "../journal.js";
 import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
 import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
@@ -729,7 +729,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
       )
     );
-    let waveState = deriveWaveState({ wave: w, items: itemStates });
+    let waveState = deriveWaveState({
+      wave: w,
+      items: itemStates,
+      blockedBy: await collectRoutedBlockers(taskDir),
+    });
 
     if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
       continue;
@@ -802,7 +806,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
           deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
         )
       );
-      waveState = deriveWaveState({ wave: w, items: itemStates });
+      waveState = deriveWaveState({
+        wave: w,
+        items: itemStates,
+        blockedBy: await collectRoutedBlockers(taskDir),
+      });
       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
     }
 
diff --git a/plugins/software-factory/src/core/plan/index.ts b/plugins/software-factory/src/core/plan/index.ts
index 7ab8f71..64b9670 100644
--- a/plugins/software-factory/src/core/plan/index.ts
+++ b/plugins/software-factory/src/core/plan/index.ts
@@ -3,6 +3,7 @@ export { applyEdits } from "./apply.js";
 export {
   type SchedItem,
   blockedByFailure,
+  blockedByConcern,
   nextWave,
   runnable,
 } from "./scheduler.js";
diff --git a/plugins/software-factory/src/core/plan/scheduler.ts b/plugins/software-factory/src/core/plan/scheduler.ts
index 836a6d6..fa78e0a 100644
--- a/plugins/software-factory/src/core/plan/scheduler.ts
+++ b/plugins/software-factory/src/core/plan/scheduler.ts
@@ -33,6 +33,50 @@ export function blockedByFailure(items: SchedItem[]): string[] {
     .map((i) => i.slug);
 }
 
+/**
+ * Expands blocked slugs to a fixpoint over declared `deps` (§8.2): a pending
+ * item depending on any blocked slug can never run, so it is blocked too.
+ * Mutates `blocked` in place and returns it.
+ */
+export function cascadePendingBlocked<T extends { slug: string; deps: string[]; status: string }>(
+  items: T[],
+  blocked: Set<string>
+): Set<string> {
+  let grew = blocked.size > 0;
+  while (grew) {
+    grew = false;
+    for (const item of items) {
+      if (item.status !== "pending" || blocked.has(item.slug) || !item.deps.some((d) => blocked.has(d))) {
+        continue;
+      }
+      blocked.add(item.slug);
+      grew = true;
+    }
+  }
+  return blocked;
+}
+
+/**
+ * Returns the slugs blocked by routed concern blockers (adr-routing-derived-state).
+ *
+ * `concernBlocked` names items that routed blocker concerns affect. A pending
+ * affected item is blocked, and pending items depending on any blocked slug are
+ * blocked transitively to a fixpoint. The result unions with `blockedByFailure`
+ * so callers see one failure/concern picture. Refs naming no item, terminal
+ * items, and non-pending work are ignored. Preserves input (PM) order.
+ */
+export function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
+  const bySlug = new Map(items.map((i) => [i.slug, i]));
+  const blocked = new Set(blockedByFailure(items));
+  for (const slug of concernBlocked) {
+    if (bySlug.get(slug)?.status === "pending") {
+      blocked.add(slug);
+    }
+  }
+  cascadePendingBlocked(items, blocked);
+  return items.filter((i) => blocked.has(i.slug)).map((i) => i.slug);
+}
+
 /**
  * Determines the next wave to execute according to wave sequence order (§8.4).
  *
diff --git a/plugins/software-factory/test/engine/routing-blocker-derive.test.ts b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
new file mode 100644
index 0000000..a43e763
--- /dev/null
+++ b/plugins/software-factory/test/engine/routing-blocker-derive.test.ts
@@ -0,0 +1,343 @@
+import { afterEach, describe, expect, it } from "bun:test";
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import * as deriveTaskModule from "../../src/core/derive/task.js";
+import { deriveItemState, type DerivedItemState } from "../../src/core/derive/item.js";
+import { deriveWaveState } from "../../src/core/derive/wave.js";
+import type { StoredConcernArtifact } from "../../src/core/artifacts.js";
+
+/**
+ * Routed blockers are pure derive data (adr-routing-derived-state): a `routed`
+ * concern of kind `blocker` names the items it affects (`affects`), and derive
+ * marks the named items plus their declared dependents blocked. Derivation
+ * never writes: no concern, decision, mailbox, or state files change.
+ */
+
+type CollectRoutedBlockers = (taskDir: string) => Promise<Set<string>>;
+
+/**
+ * Test-first seam: while `derive/task.ts` does not yet export the collector,
+ * an inert fallback keeps module collection alive so the behavioural
+ * assertions fail as assertion failures (target-red), not import errors.
+ */
+const collectRoutedBlockers: CollectRoutedBlockers =
+  (deriveTaskModule as unknown as { collectRoutedBlockers?: CollectRoutedBlockers })
+    .collectRoutedBlockers ?? (async () => new Set<string>());
+
+type ItemDeriveOpts = Parameters<typeof deriveItemState>[0] & {
+  blockedBy?: Iterable<string>;
+};
+type WaveDeriveOpts = Parameters<typeof deriveWaveState>[0] & {
+  blockedBy?: Iterable<string>;
+};
+
+const tmpDirs: string[] = [];
+
+function makeTaskDir(): string {
+  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-routed-blocker-"));
+  tmpDirs.push(dir);
+  return dir;
+}
+
+afterEach(() => {
+  for (const dir of tmpDirs.splice(0)) {
+    fs.rmSync(dir, { recursive: true, force: true });
+  }
+});
+
+async function routedBlockedSlugs(taskDir: string): Promise<Set<string>> {
+  return collectRoutedBlockers(taskDir);
+}
+
+function writeItem(
+  taskDir: string,
+  slug: string,
+  opts: { wave?: number; deps?: string[] } = {}
+): void {
+  const dir = path.join(taskDir, "items", slug);
+  fs.mkdirSync(dir, { recursive: true });
+  const deps = opts.deps ?? [];
+  const depsYaml =
+    deps.length === 0 ? "deps: []" : `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}`;
+  fs.writeFileSync(
+    path.join(dir, "assignment.yaml"),
+    [
+      `slug: ${slug}`,
+      "kind: dev",
+      `title: ${slug}`,
+      "assignment: Do the work",
+      `wave: ${opts.wave ?? 1}`,
+      depsYaml,
+    ].join("\n") + "\n",
+    "utf8"
+  );
+}
+
+function writeConcern(
+  taskDir: string,
+  concern: Pick<StoredConcernArtifact, "id" | "kind" | "summary" | "status"> &
+    Partial<StoredConcernArtifact>
+): void {
+  const dir = path.join(taskDir, "concerns");
+  fs.mkdirSync(dir, { recursive: true });
+  const record = {
+    detail: concern.summary,
+    severity: "medium",
+    source: { record: "test-first", agent: "test" },
+    createdAt: "2026-01-01T00:00:00.000Z",
+    updatedAt: "2026-01-01T00:00:00.000Z",
+    ...concern,
+  };
+  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(record, null, 2), "utf8");
+}
+
+function derivedItem(partial: Partial<DerivedItemState> & { slug: string }): DerivedItemState {
+  return {
+    kind: "dev",
+    title: partial.slug,
+    wave: 1,
+    deps: [],
+    status: "pending",
+    branch: `topic/routing-blocker--${partial.slug}`,
+    records: [],
+    currentAttempt: 1,
+    currentFixRound: 1,
+    isEscalated: false,
+    freshSeries: false,
+    interruptionCount: 0,
+    consultCount: 0,
+    suggestionFingerprints: [],
+    decisionFingerprints: [],
+    ...partial,
+  };
+}
+
+/** Reads every file under `root` so a test can prove derive is write-free. */
+function snapshotTree(root: string): Record<string, string> {
+  const out: Record<string, string> = {};
+  const walk = (dir: string) => {
+    const entries = fs
+      .readdirSync(dir, { withFileTypes: true })
+      .sort((a, b) => a.name.localeCompare(b.name));
+    for (const entry of entries) {
+      const full = path.join(dir, entry.name);
+      if (entry.isDirectory()) walk(full);
+      else out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
+    }
+  };
+  walk(root);
+  return out;
+}
+
+describe("derive/task: collectRoutedBlockers", () => {
+  it("collects affects of routed blocker concerns and ignores other statuses and kinds", async () => {
+    const taskDir = makeTaskDir();
+    writeConcern(taskDir, {
+      id: "c-routed-blocker",
+      kind: "blocker",
+      status: "routed",
+      summary: "Schema migration is pending",
+      affects: ["item-b", "item-c"],
+    });
+    writeConcern(taskDir, {
+      id: "c-open-blocker",
+      kind: "blocker",
+      status: "open",
+      summary: "Not triaged yet",
+      affects: ["item-open"],
+    });
+    writeConcern(taskDir, {
+      id: "c-routed-risk",
+      kind: "risk",
+      status: "routed",
+      summary: "Routed risk",
+      affects: ["item-risk"],
+    });
+    writeConcern(taskDir, {
+      id: "c-resolved-blocker",
+      kind: "blocker",
+      status: "resolved",
+      summary: "Already handled",
+      affects: ["item-resolved"],
+    });
+    writeConcern(taskDir, {
+      id: "c-dismissed-blocker",
+      kind: "blocker",
+      status: "dismissed",
+      summary: "Dismissed by the reviewer",
+      affects: ["item-dismissed"],
+    });
+
+    const blocked = await routedBlockedSlugs(taskDir);
+    expect(blocked).toBeInstanceOf(Set);
+    expect([...blocked].sort()).toEqual(["item-b", "item-c"]);
+  });
+
+  it("returns an empty set when the task has no concerns directory", async () => {
+    const taskDir = makeTaskDir();
+
+    expect([...(await routedBlockedSlugs(taskDir))]).toEqual([]);
+
+    // The same derive seam starts reporting once a routed blocker is stored.
+    writeConcern(taskDir, {
+      id: "c-late-blocker",
+      kind: "blocker",
+      status: "routed",
+      summary: "Discovered after the first derive",
+      affects: ["late-item"],
+    });
+    expect([...(await routedBlockedSlugs(taskDir))].sort()).toEqual(["late-item"]);
+  });
+});
+
+describe("derive/wave: routed blocker integration", () => {
+  it("routes a concern-affected item and its declared dependents to blocked", () => {
+    const items = [
+      derivedItem({ slug: "seed", wave: 8 }),
+      derivedItem({ slug: "dependent", wave: 8, deps: ["seed"] }),
+      derivedItem({ slug: "independent", wave: 8, deps: [] }),
+    ];
+
+    const wave = deriveWaveState({
+      wave: 8,
+      items,
+      blockedBy: new Set(["seed"]),
+    } as WaveDeriveOpts);
+
+    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["dependent", "seed"]);
+    expect(wave.runnable.map((i) => i.slug)).toEqual(["independent"]);
+  });
+
+  it("cascades transitively over declared deps only", () => {
+    const items = [
+      derivedItem({ slug: "seed", wave: 8 }),
+      derivedItem({ slug: "child", wave: 8, deps: ["seed"] }),
+      derivedItem({ slug: "grandchild", wave: 8, deps: ["child"] }),
+      derivedItem({ slug: "side", wave: 8, deps: [] }),
+    ];
+
+    const wave = deriveWaveState({
+      wave: 8,
+      items,
+      blockedBy: new Set(["seed"]),
+    } as WaveDeriveOpts);
+
+    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["child", "grandchild", "seed"]);
+    expect(wave.runnable.map((i) => i.slug)).toEqual(["side"]);
+  });
+});
+
+describe("derive/item: routed blocker integration", () => {
+  it("blocks only the item named by a routed blocker", async () => {
+    const taskDir = makeTaskDir();
+    writeItem(taskDir, "affected");
+    writeItem(taskDir, "unaffected");
+    const blockedBy = new Set(["affected"]);
+
+    const affected = await deriveItemState({
+      taskDir,
+      itemSlug: "affected",
+      parentBranch: "topic/routing-blocker",
+      blockedBy,
+    } as ItemDeriveOpts);
+    const unaffected = await deriveItemState({
+      taskDir,
+      itemSlug: "unaffected",
+      parentBranch: "topic/routing-blocker",
+      blockedBy,
+    } as ItemDeriveOpts);
+
+    expect(affected.status).toBe("blocked");
+    expect(unaffected.status).toBe("pending");
+  });
+
+  it("keeps a terminal item status over routed blocking", async () => {
+    const taskDir = makeTaskDir();
+    writeItem(taskDir, "abandoned");
+    writeItem(taskDir, "blocked-one");
+    const decisionsDir = path.join(taskDir, "decisions");
+    fs.mkdirSync(decisionsDir, { recursive: true });
+    fs.writeFileSync(
+      path.join(decisionsDir, "001-abandon.yaml"),
+      JSON.stringify({
+        id: "decision-abandon",
+        context: "item",
+        item: "abandoned",
+        decision: "abandon",
+        rationale: "No longer needed",
+        timestamp: "2026-01-01T00:00:00.000Z",
+      }),
+      "utf8"
+    );
+    const blockedBy = new Set(["abandoned", "blocked-one"]);
+
+    const abandoned = await deriveItemState({
+      taskDir,
+      itemSlug: "abandoned",
+      parentBranch: "topic/routing-blocker",
+      blockedBy,
+    } as ItemDeriveOpts);
+    const blockedOne = await deriveItemState({
+      taskDir,
+      itemSlug: "blocked-one",
+      parentBranch: "topic/routing-blocker",
+      blockedBy,
+    } as ItemDeriveOpts);
+
+    expect(abandoned.status).toBe("failed");
+    expect(blockedOne.status).toBe("blocked");
+  });
+});
+
+describe("derive/task: routed blocker scenario", () => {
+  it("blocks affected items and declared dependents, leaving non-dependents pending without writes", async () => {
+    const taskDir = makeTaskDir();
+    writeItem(taskDir, "blocker-source", { wave: 1 });
+    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
+    writeItem(taskDir, "transitive", { wave: 3, deps: ["dependent"] });
+    writeItem(taskDir, "independent", { wave: 3 });
+    writeConcern(taskDir, {
+      id: "c-routed-blocker",
+      kind: "blocker",
+      status: "routed",
+      summary: "Upstream schema migration blocks the wave",
+      affects: ["blocker-source"],
+    });
+
+    const before = snapshotTree(taskDir);
+    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
+    const after = snapshotTree(taskDir);
+
+    expect(state.itemMap["blocker-source"]?.status).toBe("blocked");
+    expect(state.itemMap["dependent"]?.status).toBe("blocked");
+    expect(state.itemMap["transitive"]?.status).toBe("blocked");
+    expect(state.itemMap["independent"]?.status).toBe("pending");
+
+    expect(state.waves.find((w) => w.wave === 2)?.blocked.map((i) => i.slug)).toContain("dependent");
+    const wave3 = state.waves.find((w) => w.wave === 3);
+    expect(wave3?.blocked.map((i) => i.slug)).toContain("transitive");
+    expect(wave3?.runnable.map((i) => i.slug)).toContain("independent");
+
+    // Pure derive: no concern/decision/mailbox/state file is written or changed.
+    expect(after).toEqual(before);
+  });
+
+  it("derives the task blocked when every item is in the routed blocker cascade", async () => {
+    const taskDir = makeTaskDir();
+    writeItem(taskDir, "blocker-source", { wave: 1 });
+    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
+    writeConcern(taskDir, {
+      id: "c-routed-blocker",
+      kind: "blocker",
+      status: "routed",
+      summary: "Blocked until the operator answers",
+      affects: ["blocker-source"],
+    });
+
+    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker" });
+
+    expect(state.itemMap["dependent"]?.status).toBe("blocked");
+    expect(state.status).toBe("blocked");
+  });
+});
diff --git a/plugins/software-factory/test/plan-scheduler.test.ts b/plugins/software-factory/test/plan-scheduler.test.ts
index 7f34551..d408fdd 100644
--- a/plugins/software-factory/test/plan-scheduler.test.ts
+++ b/plugins/software-factory/test/plan-scheduler.test.ts
@@ -1,6 +1,22 @@
 import { describe, expect, it } from "bun:test";
+import * as schedulerModule from "../src/core/plan/scheduler.js";
 import { blockedByFailure, nextWave, runnable, type SchedItem } from "../src/core/plan/scheduler.js";
 
+const blockedByConcernImpl = (
+  schedulerModule as unknown as {
+    blockedByConcern?: (items: SchedItem[], concernBlocked: Iterable<string>) => string[];
+  }
+).blockedByConcern;
+
+/**
+ * Test-first seam: while the scheduler does not yet export `blockedByConcern`,
+ * the inert fallback keeps module collection alive so the behavioural
+ * assertions fail as assertion failures (target-red), not import errors.
+ */
+function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
+  return blockedByConcernImpl ? blockedByConcernImpl(items, concernBlocked) : [];
+}
+
 describe("plan/scheduler: nextWave", () => {
   it("returns current active wave while items are pending or running", () => {
     const items: SchedItem[] = [
@@ -172,3 +188,43 @@ describe("plan/scheduler: blockedByFailure", () => {
     expect(blockedByFailure(items)).toEqual([]);
   });
 });
+
+describe("plan/scheduler: blockedByConcern", () => {
+  it("blocks concern-affected items and their declared dependents in PM order", () => {
+    const items: SchedItem[] = [
+      { slug: "seed", wave: "8", deps: [], status: "pending" },
+      { slug: "dependent", wave: "8", deps: ["seed"], status: "pending" },
+      { slug: "independent", wave: "8", deps: [], status: "pending" },
+    ];
+
+    expect(blockedByConcern(items, ["seed"])).toEqual(["seed", "dependent"]);
+  });
+
+  it("unions concern blocking with the failure-blocked fixpoint over declared deps", () => {
+    const items: SchedItem[] = [
+      { slug: "failed", wave: "8", deps: [], status: "failed" },
+      { slug: "failure-dependent", wave: "8", deps: ["failed"], status: "pending" },
+      { slug: "failure-transitive", wave: "8", deps: ["failure-dependent"], status: "pending" },
+      { slug: "seed", wave: "8", deps: [], status: "pending" },
+      { slug: "concern-dependent", wave: "8", deps: ["seed"], status: "pending" },
+      { slug: "independent", wave: "8", deps: [], status: "pending" },
+    ];
+
+    expect(blockedByConcern(items, ["seed"])).toEqual([
+      "failure-dependent",
+      "failure-transitive",
+      "seed",
+      "concern-dependent",
+    ]);
+  });
+
+  it("ignores refs naming no item and never blocks a done item", () => {
+    const items: SchedItem[] = [
+      { slug: "already-done", wave: "8", deps: [], status: "done" },
+      { slug: "seed", wave: "8", deps: [], status: "pending" },
+      { slug: "other", wave: "8", deps: [], status: "pending" },
+    ];
+
+    expect(blockedByConcern(items, ["plan", "already-done", "seed"])).toEqual(["seed"]);
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
