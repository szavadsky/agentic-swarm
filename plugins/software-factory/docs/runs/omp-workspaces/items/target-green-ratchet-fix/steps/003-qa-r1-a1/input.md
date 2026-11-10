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
  "slug": "target-green-ratchet-fix",
  "kind": "dev",
  "title": "Apply baseline ratchet to target-green gate targets",
  "assignment": "Dev fix, tests-first, small prod diff (~60 lines hint) in plugins/software-factory/src/core/checks/runner.ts checkTargetGreen gate-target branch (lines 644-676): apply the same baseline ratchet runGates uses. When the gate command fails, load gates-baseline.yaml, derive the failing-test set (with JUnit re-derivation parity where runGates does it), and PASS when failures are a subset of baseline; otherwise FAIL with actionable evidence (new failing tests + command + output, same evidence shape as gate failures). No behavior change when baseline is absent/empty or target is fully green. Behavior tests-first with tmp-repo fixtures (cwd=plugins/software-factory, no network): (1) gate target failing ONLY on baseline-listed tests passes via ratchet; (2) gate target with one NEW failing test outside baseline still fails naming the new test; (3) fully green gate target passes without invoking ratchet. Record selector targets (new spec selector) — NEVER a gate target — so this item itself merges cleanly on the red baseline (td-baseline-disk). Verify the new spec file is green.",
  "outlineRef": "target-green-ratchet-fix",
  "milestone": "m1-omp-de-risk",
  "wave": 3
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml b/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml
deleted file mode 100644
index 0332b35..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-8a26e7294b
-kind: risk
-summary: "Gate environment lacks dependency install: child/item worktrees
-  without infra.setup fail typecheck and tests with `Cannot find package 'yaml'`
-  / missing `@types/bun`."
-detail: Before `bun install --frozen-lockfile` in plugins/software-factory, `bun
-  run typecheck` failed with TS2688 (no @types/bun) and test files failed to
-  resolve `yaml`; after install, typecheck exits 0 and previously failing test
-  files pass. This is the same environmental merge failure that sank the wave-2
-  recovery, so the gate runner must run dependency setup before typecheck/test
-  or docs-only items will keep failing gates.
-location:
-  file: plugins/software-factory/package.json
-severity: medium
-status: open
-source:
-  record: 002-develop-r1-a2
-  agent: developer
-  step: develop
-  item: spike-findings-recovery-v2
-  lastSeen: 2026-11-10T05:15:50.729Z
-createdAt: 2026-11-10T05:15:50.729Z
-updatedAt: 2026-11-10T05:15:50.729Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml b/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml
deleted file mode 100644
index 58415d0..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: rm-45d74485a6
-chosen: Reuse ctx.baseline plus the exported
-  isTestRunnerGate/rederiveBaselineFailingTests helpers from gates.ts, mirroring
-  runGates exactly; only wrap the gate command with the JUnit arg when a
-  baseline entry makes ratcheting possible.
-alternatives:
-  - Read gates-baseline.yaml directly inside checkTargetGreen (would diverge
-    from runGates callers that already load the artifact and would change
-    no-baseline behavior)
-  - Extract a shared ratchet-evaluation helper used by both runGates and
-    target-green (larger refactor with higher regression risk for this fix)
-  - Let any red non-JUnit gate whose baseline status is fail pass without
-    per-test evidence (not actionable and not covered by the assignment tests)
-why: Keeps the gate-target ratchet behaviorally identical to the gates check
-  (including old-format baseline re-derivation), avoids duplicating baseline
-  loading/parsing, and preserves the exact previous command when no baseline
-  exists.
-status: open
-source:
-  record: 002-develop-r1-a1
-  agent: developer
-  step: develop
-  item: target-green-ratchet-fix
-  lastSeen: 2026-11-10T05:25:43.562Z
-createdAt: 2026-11-10T05:25:43.562Z
-updatedAt: 2026-11-10T05:25:43.562Z
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..58aea28
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,31 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/checks/target-green-ratchet.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 3 expected tests failed with assertion failures"
+    details:
+      command: bun --cwd=plugins/software-factory test
+        test/checks/target-green-ratchet.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794286990286-f6ggb0piia4.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - target-green baseline ratchet for gate targets.gate target that only
+          fails baseline-listed tests passes via ratchet
+        - target-green baseline ratchet for gate targets.gate target with a new
+          failing test outside baseline fails naming the new test
+        - target-green baseline ratchet for gate targets.fully green gate target
+          passes without invoking ratchet
+        - target-green baseline ratchet for gate targets.failing gate target
+          without a baseline still fails with exit-code evidence
+        - target-green baseline ratchet for gate targets.old-format baseline
+          re-derives failing tests at the baseline commit before ratcheting
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..01cf0f6
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,77 @@
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
+  "slug": "target-green-ratchet-fix",
+  "kind": "dev",
+  "title": "Apply baseline ratchet to target-green gate targets",
+  "assignment": "Dev fix, tests-first, small prod diff (~60 lines hint) in plugins/software-factory/src/core/checks/runner.ts checkTargetGreen gate-target branch (lines 644-676): apply the same baseline ratchet runGates uses. When the gate command fails, load gates-baseline.yaml, derive the failing-test set (with JUnit re-derivation parity where runGates does it), and PASS when failures are a subset of baseline; otherwise FAIL with actionable evidence (new failing tests + command + output, same evidence shape as gate failures). No behavior change when baseline is absent/empty or target is fully green. Behavior tests-first with tmp-repo fixtures (cwd=plugins/software-factory, no network): (1) gate target failing ONLY on baseline-listed tests passes via ratchet; (2) gate target with one NEW failing test outside baseline still fails naming the new test; (3) fully green gate target passes without invoking ratchet. Record selector targets (new spec selector) — NEVER a gate target — so this item itself merges cleanly on the red baseline (td-baseline-disk). Verify the new spec file is green.",
+  "outlineRef": "target-green-ratchet-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 3
+}
+
+## Context & Citations
+[]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
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
+- concerns (array of object, optional): Structured concerns raised during implementation
+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+  - summary (string, required)
+  - detail (string, optional)
+  - severity (string, optional, enum: ["low","medium","high"])
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+  - affects (array of string, optional)
+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+  - chosen (string, required)
+  - why (string, required)
+  - alternatives (array of string, required)
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..1ee0202
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-10T04:56:48.987Z
+session: 01a1c3d0-e412-7153-ae52-2c9a5e4697a4
+endedAt: 2026-11-10T05:03:11.445Z
+usage:
+  inputTokens: 103048
+  outputTokens: 36483
+  costUsd: 0.045768
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..210dfec
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,44 @@
+status: ok
+summary: "Added a behavior-first spec
+  (plugins/software-factory/test/checks/target-green-ratchet.test.ts) covering
+  baseline-ratchet semantics for target-green gate targets using tmp git repos
+  and a fake JUnit test runner. On current production code the ratchet tests are
+  red with assertion failures: unchanged baseline failures still fail the check,
+  and new failing tests are not named. Guard tests prove the fully-green path
+  and absent/empty-baseline path keep current behavior. No production files were
+  touched."
+target:
+  selectors:
+    - test/checks/target-green-ratchet.test.ts
+  expectRed:
+    - target-green baseline ratchet for gate targets.gate target that only fails
+      baseline-listed tests passes via ratchet
+    - target-green baseline ratchet for gate targets.gate target with a new
+      failing test outside baseline fails naming the new test
+    - target-green baseline ratchet for gate targets.old-format baseline
+      re-derives failing tests at the baseline commit before ratcheting
+evidence:
+  - Created only
+    plugins/software-factory/test/checks/target-green-ratchet.test.ts; git
+    status shows a single untracked test file and no production changes.
+  - bun test test/checks/target-green-ratchet.test.ts
+    (cwd=plugins/software-factory) -> 2 pass, 3 fail; all three failures are
+    assertion failures on missing ratchet behavior, not import/compile errors.
+  - bun test test/checks (cwd=plugins/software-factory) -> 52 pass, 3 fail; the
+    only failures are the three new expected-red ratchet cases, and all
+    pre-existing checks tests remain green.
+  - bun run typecheck (cwd=plugins/software-factory) -> exit 0.
+  - "JUnit reporter verification: parseJunit over the reporter output yields
+    fail ids exactly matching the declared expectRed ids (baseline-only failure,
+    new failure naming, and old-format baseline re-derivation); the green and
+    no-baseline guard tests yield pass."
+  - "Fixture coverage: tmp-repo fake runner emits JUnit testcase ids
+    test_mod.test_one/test_mod.test_two; tests 1 and 2 exercise baseline
+    subset/new-failure ratcheting, test 3 exercises fully-green with a baseline
+    present, test 4 exercises absent and empty baseline, test 5 exercises
+    re-derivation at the committed baseline before ratcheting."
+notes: Selectors are declared relative to the effective test cwd
+  plugins/software-factory. expectRed uses the exact JUnit ids emitted by bun's
+  junit reporter (classname.testcase) so engine node-id normalization matches.
+  The extra old-format re-derivation test is intentionally declared red to lock
+  in JUnit re-derivation parity with runGates.
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..4fd1fff
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,139 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: pass
+        durationMs: 5611
+        details: $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: pass
+        durationMs: 456241
+        details: >-
+          bun test v1.4.4 (38afee6c8)
+
+          Disk space check passed (threshold 2048 MB):
+            worktreeRoot (/tmp/factory-test-repo-ym1rCG.factory-wt): 4470 MB free
+            .factory-runtime/tmp (/tmp/factory-test-repo-ym1rCG.factory-wt/.factory-runtime/tmp): 4470 MB free
+            repoRoot (/tmp/factory-test-repo-ym1rCG): 4470 MB free
+            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 86958 MB free
+            /tmp (/tmp): 4470 MB free
+          ================================================================
+
+          Task: status-test-task [ACTIVE]
+
+          Kind: unclassified | Iteration: 1 | Wave: 1
+
+          Worktree: (none - main checkout)
+
+          Config path: /tmp/factory-test-repo-whXJy0/.factory/pipeline.yaml
+
+          Budget spent: $0.0000
+            tokens: input=0 output=0 cacheRead=0 cacheWrite=0 total=0
+          ----------------------------------------------------------------
+
+          Waves & Items:
+            Wave 1:
+          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+
+          ----------------------------------------------------------------
+
+          Blocking Questions:
+            (none)
+          ----------------------------------------------------------------
+
+          Digest Questions:
+            (none)
+          ================================================================
+
+
+
+          test/config-worktree-layering.test.ts:
+
+          [factory preflight] Preflight failed with 1 error(s):
+            - Pipeline config loading failed: Invalid pipeline configuration:
+          /limits/maxIterations: must be integer ({"type":"integer"})
+
+
+          test/disk-space.test.ts:
+
+          52 |       probe,
+
+          53 |     });
+
+          54 | 
+
+          55 |     expect(res.ok).toBe(false);
+
+          56 |     expect(res.minFreeDiskMb).toBe(2048);
+
+          57 |     expect(res.failingPaths.length).toBe(1);
+                                                   ^
+          error: expect(received).toBe(expected)
+
+
+          Expected: 1
+
+          Received: 2
+
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/plugins/software-factory/test/disk-space.test.ts:57:37)
+          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          [33.02ms]
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 1976227
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 1976227
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 1976227
+
+           689 pass
+           2 skip
+           1 fail
+           3891 expect() calls
+          Ran 692 tests across 107 files. [229.56s]
+        failingTests:
+          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: bun --cwd=plugins/software-factory test
+        test/checks/target-green-ratchet.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794288342212-zjfmbx221j.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - target-green baseline ratchet for gate targets.gate target that only
+          fails baseline-listed tests passes via ratchet
+        - target-green baseline ratchet for gate targets.gate target with a new
+          failing test outside baseline fails naming the new test
+        - target-green baseline ratchet for gate targets.fully green gate target
+          passes without invoking ratchet
+        - target-green baseline ratchet for gate targets.failing gate target
+          without a baseline still fails with exit-code evidence
+        - target-green baseline ratchet for gate targets.old-format baseline
+          re-derives failing tests at the baseline commit before ratcheting
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 88/300 production lines changed"
+    details:
+      changedLines:
+        added: 78
+        deleted: 10
+        total: 88
+        files:
+          - plugins/software-factory/src/core/checks/runner.ts
+      limit: 300
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..9af143f
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,85 @@
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
+  "slug": "target-green-ratchet-fix",
+  "kind": "dev",
+  "title": "Apply baseline ratchet to target-green gate targets",
+  "assignment": "Dev fix, tests-first, small prod diff (~60 lines hint) in plugins/software-factory/src/core/checks/runner.ts checkTargetGreen gate-target branch (lines 644-676): apply the same baseline ratchet runGates uses. When the gate command fails, load gates-baseline.yaml, derive the failing-test set (with JUnit re-derivation parity where runGates does it), and PASS when failures are a subset of baseline; otherwise FAIL with actionable evidence (new failing tests + command + output, same evidence shape as gate failures). No behavior change when baseline is absent/empty or target is fully green. Behavior tests-first with tmp-repo fixtures (cwd=plugins/software-factory, no network): (1) gate target failing ONLY on baseline-listed tests passes via ratchet; (2) gate target with one NEW failing test outside baseline still fails naming the new test; (3) fully green gate target passes without invoking ratchet. Record selector targets (new spec selector) — NEVER a gate target — so this item itself merges cleanly on the red baseline (td-baseline-disk). Verify the new spec file is green.",
+  "outlineRef": "target-green-ratchet-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 3
+}
+
+## Target
+{
+  "selectors": [
+    "test/checks/target-green-ratchet.test.ts"
+  ],
+  "expectRed": [
+    "target-green baseline ratchet for gate targets.gate target that only fails baseline-listed tests passes via ratchet",
+    "target-green baseline ratchet for gate targets.gate target with a new failing test outside baseline fails naming the new test",
+    "target-green baseline ratchet for gate targets.old-format baseline re-derives failing tests at the baseline commit before ratcheting"
+  ]
+}
+
+## Context & Citations
+[]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
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
+- concerns (array of object, optional): Structured concerns raised during implementation
+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+  - summary (string, required)
+  - detail (string, optional)
+  - severity (string, optional, enum: ["low","medium","high"])
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+  - affects (array of string, optional)
+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+  - chosen (string, required)
+  - why (string, required)
+  - alternatives (array of string, required)
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..8a00780
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/meta.yaml
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
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T05:03:13.314Z
+session: 01a1c3d6-c187-7606-bb74-97b9346f5448
+endedAt: 2026-11-10T05:25:43.604Z
+usage:
+  inputTokens: 96432
+  outputTokens: 28676
+  costUsd: 0.039858
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-03-13-799Z_01a1c3d6-c187-7606-bb74-97b9346f5448.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..f34a5fb
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,62 @@
+status: ok
+summary: Implemented the runGates baseline ratchet in checkTargetGreen's
+  gate-target branch (plugins/software-factory/src/core/checks/runner.ts). When
+  a test-runner gate with a JUnit arg fails and ctx.baseline has an entry for
+  that gate, the target runs with JUnit output, re-derives old-format baseline
+  failing tests via rederiveBaselineFailingTests (same parity as runGates), and
+  PASSES when every failing case/collection error is baseline-known. Otherwise
+  it FAILS naming the new failing test ids, exit code, command, and raw output.
+  No baseline, empty baseline, green gates, and non-JUnit gates keep the
+  previous behavior. Target spec and all project gates are green.
+target:
+  selectors:
+    - test/checks/target-green-ratchet.test.ts
+  expectRed:
+    - target-green baseline ratchet for gate targets.gate target that only fails
+      baseline-listed tests passes via ratchet
+    - target-green baseline ratchet for gate targets.gate target with a new
+      failing test outside baseline fails naming the new test
+    - target-green baseline ratchet for gate targets.old-format baseline
+      re-derives failing tests at the baseline commit before ratcheting
+evidence:
+  - "bun test test/checks/target-green-ratchet.test.ts — 5 pass, 0 fail, 20
+    expect calls: baseline-only failure passes via ratchet; new failure outside
+    baseline fails naming test_mod.test_two; fully green gate passes with 'Gate
+    test passed (green)' and no ratchet mention; no/empty baseline still fails
+    with exit-code evidence; old-format baseline re-derives test_mod.test_one at
+    the baseline commit and persists it before ratcheting."
+  - bun run typecheck — exit 0.
+  - bun test test/checks — 55 pass, 0 fail across 6 files.
+  - bun test test/engine/merge-gate-evidence.test.ts — 5 pass, 0 fail.
+  - TMPDIR=/tmp bun test (full plugin suite, 692 tests / 107 files) — 690 pass,
+    2 skip, 0 fail, exit code 0.
+  - "Environment note: with the harness default
+    TMPDIR=<repo>/.factory-runtime/tmp, test/disk-space.test.ts's probe
+    classifies both the child tmp path and os.tmpdir() as '.factory-runtime/tmp'
+    (2 failing paths vs expected 1); it passes 7/7 with TMPDIR=/tmp, proving the
+    failure is a pre-existing harness-environment artifact unrelated to this
+    change."
+  - git diff --stat — only src/core/checks/runner.ts changed (+78/-10); target
+    spec was already committed by the test-first step.
+remarkable:
+  - chosen: Reuse ctx.baseline plus the exported
+      isTestRunnerGate/rederiveBaselineFailingTests helpers from gates.ts,
+      mirroring runGates exactly; only wrap the gate command with the JUnit arg
+      when a baseline entry makes ratcheting possible.
+    why: Keeps the gate-target ratchet behaviorally identical to the gates check
+      (including old-format baseline re-derivation), avoids duplicating baseline
+      loading/parsing, and preserves the exact previous command when no baseline
+      exists.
+    alternatives:
+      - Read gates-baseline.yaml directly inside checkTargetGreen (would diverge
+        from runGates callers that already load the artifact and would change
+        no-baseline behavior)
+      - Extract a shared ratchet-evaluation helper used by both runGates and
+        target-green (larger refactor with higher regression risk for this fix)
+      - Let any red non-JUnit gate whose baseline status is fail pass without
+        per-test evidence (not actionable and not covered by the assignment
+        tests)
+notes: The ratchet branch uses parsed JUnit case ids only for evidence;
+  summaries deliberately use gate.command (not the temp JUnit-wrapped command)
+  so fingerprints stay deterministic. Passing details include the parsed JUnit
+  case ids for checks.yaml diagnosability.
diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
index cd66aa7..765967f 100644
--- a/.factory/tasks/omp-workspaces/journal.ndjson
+++ b/.factory/tasks/omp-workspaces/journal.ndjson
@@ -313,24 +313,3 @@
 {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/021-pm-amend-1-2-a1","ts":"2026-11-10T04:55:54.450Z"}
 {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-2","timeoutSec":2700,"ts":"2026-11-10T04:55:54.454Z"}
 {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-2","attempt":1,"status":"ok","sessionId":"01a1c3d0-0e77-74a9-9aab-f205f994e96e","usage":{"inputTokens":25430,"outputTokens":6753,"costUsd":0.003894},"ts":"2026-11-10T04:56:47.068Z"}
-{"type":"wave_started","wave":3,"iteration":1,"ts":"2026-11-10T04:56:48.258Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1","ts":"2026-11-10T04:56:49.018Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-10T04:56:49.023Z"}
-{"type":"step_started","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T04:56:49.096Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T04:56:49.101Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1c3d0-e401-743d-b536-d4d8f32194a2","usage":{"inputTokens":27325,"outputTokens":6379,"costUsd":0.008592},"ts":"2026-11-10T04:58:09.710Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"sizeBytes":6083134,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4","ts":"2026-11-10T05:03:10.263Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"toolCalls":74,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4","ts":"2026-11-10T05:03:10.264Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c3d0-e412-7153-ae52-2c9a5e4697a4","usage":{"inputTokens":103048,"outputTokens":36483,"costUsd":0.045768},"ts":"2026-11-10T05:03:11.489Z"}
-{"type":"step_started","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1","ts":"2026-11-10T05:03:13.398Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T05:03:13.403Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2","ts":"2026-11-10T05:03:13.430Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-10T05:03:13.436Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:05:28.993Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:05:31.358Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"method":"ask","ts":"2026-11-10T05:06:52.363Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"toolCalls":64,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-03-13-799Z_01a1c3d6-c187-7606-bb74-97b9346f5448.jsonl","ts":"2026-11-10T05:12:38.648Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:12:40.968Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:12:43.278Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"status":"ok","sessionId":"01a1c3d6-c197-741d-ad4d-936420c72cda","usage":{"inputTokens":29707,"outputTokens":7432,"costUsd":0.009692000000000001},"ts":"2026-11-10T05:15:50.897Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T05:18:00.357Z"}
diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
index 45f9bfe..ceed14a 100644
--- a/.factory/tasks/omp-workspaces/state.yaml
+++ b/.factory/tasks/omp-workspaces/state.yaml
@@ -1,8 +1,8 @@
 task: omp-workspaces
 kind: saga
-status: active
+status: failed
 iteration: 1
-currentWave: 3
+currentWave: 2
 items:
   spike-cache-key:
     kind: fact-finder
@@ -71,26 +71,10 @@ items:
     spendUsd: 0.181734
     currentStep: review
     mergedAt: 2026-11-09T23:09:02-05:00
-  spike-findings-recovery-v2:
-    kind: no-behavior
-    status: running
-    branch: topic/omp-workspaces--spike-findings-recovery-v2
-    attempts: 2
-    fixRounds: 1
-    spendUsd: 0.018284
-    currentStep: develop
-  target-green-ratchet-fix:
-    kind: dev
-    status: running
-    branch: topic/omp-workspaces--target-green-ratchet-fix
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.045768
-    currentStep: develop
 concerns:
-  open: 1
+  open: 5
   dismissed: 3
-  routed: 38
+  routed: 33
   resolved: 0
 debt:
   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
@@ -133,10 +117,6 @@ debt:
     provider needs a wrapper or new option"
   - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
     planning"
-  - "[redrive] Merge redrive ignores retry-with-guidance (no execution path);
-    guidance-only recovery cannot fix environmental gate failures"
-  - "[wave-merge] target-green gate targets ignore baseline ratchet; gate:test
-    unmergeable on red baseline"
   - "[spike-cache-key] Findings cite nonexistent
     plugins/software-factory/docs/factory.v2.md"
   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
@@ -169,20 +149,20 @@ debt:
     hardcoded fallback"
   - "[usage-cache-tokens] Duplicate 6-term has-usage guard in step-runner and
     shutdown"
-budgetSpentUsd: 1.8652213999999998
+budgetSpentUsd: 1.7882303999999996
 spendByRole:
   workhorse:
-    costUsd: 1.3227084000000002
-    inputTokens: 2887985
-    outputTokens: 1020277
+    costUsd: 1.2586564000000002
+    inputTokens: 2727905
+    outputTokens: 969983
   alt-workhorse:
-    costUsd: 0.324934
-    inputTokens: 1440770
-    outputTokens: 565397
+    costUsd: 0.319499
+    inputTokens: 1403899
+    outputTokens: 556970
   architect:
-    costUsd: 0.211215
-    inputTokens: 1474717
-    outputTokens: 97207
+    costUsd: 0.203711
+    inputTokens: 1419917
+    outputTokens: 94122
   alt-architect:
     costUsd: 0.006364
     inputTokens: 28896
@@ -192,22 +172,6 @@ spendByItem:
     costUsd: 0.45245700000000005
     inputTokens: 1135682
     outputTokens: 348841
-  usage-cache-tokens:
-    costUsd: 0.181734
-    inputTokens: 509493
-    outputTokens: 194135
-  spike-findings-recovery-v2:
-    costUsd: 0.018284
-    inputTokens: 57032
-    outputTokens: 13811
-  transport-byte-stability:
-    costUsd: 0.083151
-    inputTokens: 192618
-    outputTokens: 106892
-  merge-setup-fix:
-    costUsd: 0.16351299999999996
-    inputTokens: 608055
-    outputTokens: 146795
   spike-mock-provider:
     costUsd: 0.12459699999999999
     inputTokens: 255359
@@ -216,20 +180,28 @@ spendByItem:
     costUsd: 0.11246700000000001
     inputTokens: 225196
     outputTokens: 108718
-  target-green-ratchet-fix:
-    costUsd: 0.045768
-    inputTokens: 103048
-    outputTokens: 36483
+  usage-cache-tokens:
+    costUsd: 0.181734
+    inputTokens: 509493
+    outputTokens: 194135
   spike-findings-recovery:
     costUsd: 0.174178
     inputTokens: 546734
     outputTokens: 203800
+  transport-byte-stability:
+    costUsd: 0.083151
+    inputTokens: 192618
+    outputTokens: 106892
+  merge-setup-fix:
+    costUsd: 0.16351299999999996
+    inputTokens: 608055
+    outputTokens: 146795
   spike-cache-key:
     costUsd: 0.155598
     inputTokens: 331901
     outputTokens: 152018
   (orchestration):
-    costUsd: 0.3534744000000001
-    inputTokens: 1867250
-    outputTokens: 218749
-lastUpdated: 2026-11-10T05:15:51.672Z
+    costUsd: 0.3405354000000001
+    inputTokens: 1775579
+    outputTokens: 207237
+lastUpdated: 2026-11-10T04:46:31.494Z
diff --git a/plugins/software-factory/src/core/checks/runner.ts b/plugins/software-factory/src/core/checks/runner.ts
index db7be16..f0792fc 100644
--- a/plugins/software-factory/src/core/checks/runner.ts
+++ b/plugins/software-factory/src/core/checks/runner.ts
@@ -9,8 +9,15 @@ import { countUntrackedLines } from "../git/untracked-lines.js";
 import { headOf } from "../git/commit.js";
 import { git } from "../git/exec.js";
 import { parseBranch } from "../git/naming.js";
-import { gateTimedOut, runGates, snapshotWorktree, checkAndRestoreWorktreeMutation } from "./gates.js";
-import { parseJunit, buildTargetCommand, shellQuote } from "./junit.js";
+import {
+  gateTimedOut,
+  runGates,
+  snapshotWorktree,
+  checkAndRestoreWorktreeMutation,
+  isTestRunnerGate,
+  rederiveBaselineFailingTests,
+} from "./gates.js";
+import { parseJunit, buildGateWithJunitCommand, buildTargetCommand, shellQuote, type ParsedJunit } from "./junit.js";
 import { tailCap, type CheckContext, type CheckResult } from "./types.js";
 import { getClock, detectSuspend } from "../clock.js";
 import { appendJournal } from "../journal.js";
@@ -656,22 +663,83 @@ async function checkTargetGreen(ctx: CheckContext): Promise<CheckResult> {
         details: targetDetail(gateId),
       };
     }
-    const cmd = gate.command;
-    const res = await runProcess({ cmd, cwd: ctx.wt, timeoutSec: timeout, maxOutputBytes: ctx.outputBytes });
-    const timeoutFail = targetCommandTimeoutFail("target-green", `Gate ${gateId}`, res, timeout, ctx, cmd);
+    // A baseline-ratcheted gate must produce JUnit evidence; otherwise run the
+    // gate exactly as configured (no baseline, no behavior change).
+    const testRunner = ctx.infra?.testRunner;
+    const baseEntry = ctx.baseline?.gates.find((g) => g.id === gateId);
+    const ratchetEligible =
+      Boolean(baseEntry) && isTestRunnerGate(gate, testRunner) && Boolean(testRunner?.junitArg?.trim());
+    const tmpJunit = ratchetEligible
+      ? path.join(
+          os.tmpdir(),
+          `junit-target-green-${gateId}-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`
+        )
+      : undefined;
+    const runCmd = tmpJunit
+      ? buildGateWithJunitCommand(gate.command, testRunner!.junitArg!, tmpJunit)
+      : gate.command;
+    const res = await runProcess({ cmd: runCmd, cwd: ctx.wt, timeoutSec: timeout, maxOutputBytes: ctx.outputBytes });
+    let parsedJunit: ParsedJunit | undefined;
+    if (tmpJunit) {
+      try {
+        if (fs.existsSync(tmpJunit)) {
+          const xml = await fs.promises.readFile(tmpJunit, "utf8");
+          if (xml.trim()) parsedJunit = parseJunit(xml);
+        }
+      } finally {
+        try {
+          await fs.promises.unlink(tmpJunit);
+        } catch {}
+      }
+      if (!parsedJunit && res.code !== 0 && !res.timedOut) {
+        parsedJunit = {
+          collected: false,
+          errors: [`Test runner exited with code ${res.code} but generated no JUnit XML`],
+          cases: [],
+        };
+      }
+    }
+    const timeoutFail = targetCommandTimeoutFail("target-green", `Gate ${gateId}`, res, timeout, ctx, gate.command);
     if (timeoutFail) return timeoutFail;
-    const ok = res.code === 0;
-    const summary = ok
-      ? `Gate ${gateId} passed (green)`
-      : `Gate ${gateId} failed with exit code ${res.code}. Command: ${cmd}`;
     const output = tailCap((res.stdout + "\n" + res.stderr).trim(), ctx.outputBytes);
+
+    let ok = res.code === 0;
+    let summary = ok
+      ? `Gate ${gateId} passed (green)`
+      : `Gate ${gateId} failed with exit code ${res.code}. Command: ${gate.command}`;
+    if (!ok && ratchetEligible && baseEntry) {
+      // Same per-test ratchet as runGates: failures already in gates-baseline
+      // do not fail the target; new failures (or unparseable JUnit) do.
+      if (baseEntry.status !== "pass" && baseEntry.failingTests === undefined) {
+        await rederiveBaselineFailingTests(gate, testRunner!, baseEntry, ctx, timeout);
+      }
+      const failingCaseIds =
+        parsedJunit?.cases
+          .filter((c) => c.status === "fail" || c.status === "error")
+          .map((c) => c.id) ?? [];
+      const baseFailing = new Set(baseEntry.failingTests ?? []);
+      const baseErrors = baseEntry.collectionErrors ?? [];
+      const newFailing = failingCaseIds.filter((id) => !baseFailing.has(id));
+      const newErrors = (parsedJunit?.errors ?? []).filter((e) => !baseErrors.includes(e));
+      const junitMissing = !parsedJunit || (!parsedJunit.collected && parsedJunit.cases.length === 0);
+      ok = newFailing.length === 0 && newErrors.length === 0 && !junitMissing;
+      summary = ok
+        ? `Gate ${gateId} passed via baseline ratchet: ${failingCaseIds.length} failing test(s) already in baseline. Command: ${gate.command}`
+        : `Gate ${gateId} failed with exit code ${res.code}: ${[
+            newFailing.length ? `new failing tests: ${newFailing.join(", ")}` : "",
+            newErrors.length ? `new collection errors: ${newErrors.join("; ")}` : "",
+            junitMissing ? "test runner produced no parseable JUnit results" : "",
+          ]
+            .filter(Boolean)
+            .join("; ")}. Command: ${gate.command}`;
+    }
     return {
       name: "target-green",
       ok,
       summary,
       output,
       fingerprint: ok ? fingerprintText("target-green gate ok") : fingerprintText(summary),
-      details: targetDetail(cmd),
+      details: targetDetail(gate.command, parsedJunit),
     };
   }
 
diff --git a/plugins/software-factory/test/checks/target-green-ratchet.test.ts b/plugins/software-factory/test/checks/target-green-ratchet.test.ts
new file mode 100644
index 0000000..af199d7
--- /dev/null
+++ b/plugins/software-factory/test/checks/target-green-ratchet.test.ts
@@ -0,0 +1,251 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import os from "node:os";
+import { Repo } from "../../src/core/git/repo.js";
+import { runCheck } from "../../src/core/checks/runner.js";
+import type { CheckContext } from "../../src/core/checks/types.js";
+import { git } from "../../src/core/git/exec.js";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+
+/**
+ * A gate target ({gate: <id>}) must apply the same baseline ratchet runGates
+ * uses: a red test-runner gate passes when every failing test is already in
+ * gates-baseline.yaml, and fails (naming the new ids) when a test outside the
+ * baseline fails. A green gate target stays green without consulting baseline.
+ */
+describe("target-green baseline ratchet for gate targets", () => {
+  let tmpRepo: TmpRepo;
+  let wtRoot: string;
+  let repo: Repo;
+  let runnerScript: string;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-target-ratchet-"));
+    repo = new Repo({
+      mainRoot: tmpRepo.dir,
+      worktreeRoot: wtRoot,
+    });
+
+    runnerScript = path.join(tmpRepo.dir, "junit-runner.sh");
+    fs.writeFileSync(
+      runnerScript,
+      `#!/bin/sh
+JUNIT_FILE=""
+for arg in "$@"; do
+  case "$arg" in
+    --junitxml=*) JUNIT_FILE="\${arg#--junitxml=}" ;;
+  esac
+done
+
+FAIL_1=0
+FAIL_2=0
+[ -f fail_test1.flag ] && FAIL_1=1
+[ -f fail_test2.flag ] && FAIL_2=1
+FAIL_TOTAL=$((FAIL_1 + FAIL_2))
+
+if [ -n "$JUNIT_FILE" ]; then
+  cat <<EOF > "$JUNIT_FILE"
+<testsuite name="tests" tests="2" failures="\${FAIL_TOTAL}">
+  <testcase classname="test_mod" name="test_one">
+$( [ "$FAIL_1" -eq 1 ] && echo '    <failure message="assertion error">assert 1 == 0</failure>' )
+  </testcase>
+  <testcase classname="test_mod" name="test_two">
+$( [ "$FAIL_2" -eq 1 ] && echo '    <failure message="assertion error">assert 2 == 0</failure>' )
+  </testcase>
+</testsuite>
+EOF
+fi
+
+if [ "$FAIL_TOTAL" -gt 0 ]; then
+  echo "fake runner: \${FAIL_TOTAL} failing test(s)"
+  exit 1
+fi
+exit 0
+`,
+      { mode: 0o755 }
+    );
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+    if (fs.existsSync(wtRoot)) {
+      fs.rmSync(wtRoot, { recursive: true, force: true });
+    }
+  });
+
+  function makeContext(overrides?: Partial<CheckContext>): CheckContext {
+    return {
+      repo,
+      wt: tmpRepo.dir,
+      base: "HEAD",
+      project: {
+        orchestrationFolder: ".factory",
+        worktreeRoot: wtRoot,
+        paths: { tests: "test/**", prod: "src/**" },
+      },
+      pipeline: {
+        models: { roles: {} },
+        agents: {},
+        flows: { simple: { steps: [] }, story: {}, spike: {} },
+        limits: {},
+      },
+      infra: {
+        setup: [],
+        gates: [{ id: "test", command: `sh "${runnerScript}"` }],
+        testRunner: {
+          command: `sh "${runnerScript}"`,
+          junitArg: "--junitxml={path}",
+        },
+      },
+      limits: {},
+      outputBytes: 4000,
+      ...overrides,
+    };
+  }
+
+  it("gate target that only fails baseline-listed tests passes via ratchet", async () => {
+    fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
+
+    const res = await runCheck(
+      "target-green",
+      makeContext({
+        target: { gate: "test" },
+        baseline: {
+          gates: [
+            {
+              id: "test",
+              status: "fail",
+              failingTests: ["test_mod.test_one"],
+            },
+          ],
+        },
+      })
+    );
+
+    expect(res.ok).toBe(true);
+    expect(res.summary).toContain("Gate test");
+    expect(res.summary.toLowerCase()).toContain("baseline ratchet");
+  });
+
+  it("gate target with a new failing test outside baseline fails naming the new test", async () => {
+    fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
+    fs.writeFileSync(path.join(tmpRepo.dir, "fail_test2.flag"), "1");
+
+    const res = await runCheck(
+      "target-green",
+      makeContext({
+        target: { gate: "test" },
+        baseline: {
+          gates: [
+            {
+              id: "test",
+              status: "fail",
+              failingTests: ["test_mod.test_one"],
+            },
+          ],
+        },
+      })
+    );
+
+    expect(res.ok).toBe(false);
+    expect(res.summary.toLowerCase()).toContain("new failing");
+    expect(res.summary).toContain("test_mod.test_two");
+    expect(res.summary).toContain("Command:");
+  });
+
+  it("fully green gate target passes without invoking ratchet", async () => {
+    const res = await runCheck(
+      "target-green",
+      makeContext({
+        target: { gate: "test" },
+        baseline: {
+          gates: [
+            {
+              id: "test",
+              status: "fail",
+              failingTests: ["test_mod.test_one"],
+            },
+          ],
+        },
+      })
+    );
+
+    expect(res.ok).toBe(true);
+    expect(res.summary).toContain("Gate test passed (green)");
+    expect(res.summary.toLowerCase()).not.toContain("ratchet");
+  });
+
+  it("failing gate target without a baseline still fails with exit-code evidence", async () => {
+    fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
+
+    const noBaseline = await runCheck(
+      "target-green",
+      makeContext({ target: { gate: "test" } })
+    );
+    expect(noBaseline.ok).toBe(false);
+    expect(noBaseline.summary).toContain("Gate test failed with exit code 1");
+    expect(noBaseline.summary).toContain("Command:");
+    expect(noBaseline.summary.toLowerCase()).not.toContain("ratchet");
+
+    const emptyBaseline = await runCheck(
+      "target-green",
+      makeContext({ target: { gate: "test" }, baseline: { gates: [] } })
+    );
+    expect(emptyBaseline.ok).toBe(false);
+    expect(emptyBaseline.summary).toContain("Gate test failed with exit code 1");
+    expect(emptyBaseline.summary.toLowerCase()).not.toContain("ratchet");
+  });
+
+  it("old-format baseline re-derives failing tests at the baseline commit before ratcheting", async () => {
+    // At the baseline commit only test_mod.test_one is failing.
+    fs.writeFileSync(path.join(tmpRepo.dir, "fail_test1.flag"), "1");
+    const task = "target-ratchet-repo";
+    const taskDir = path.join(tmpRepo.dir, ".factory", task);
+    fs.mkdirSync(taskDir, { recursive: true });
+    const baselineFile = path.join(taskDir, "gates-baseline.yaml");
+    fs.writeFileSync(
+      baselineFile,
+      JSON.stringify(
+        {
+          timestamp: "2026-01-01T00:00:00.000Z",
+          gates: [
+            {
+              id: "test",
+              command: `sh "${runnerScript}"`,
+              status: "fail",
+              durationMs: 10,
+              details: "pre-existing failure",
+            },
+          ],
+        },
+        null,
+        2
+      ),
+      "utf8"
+    );
+    await git(tmpRepo.dir, ["add", "-A"]);
+    await git(tmpRepo.dir, ["commit", "-m", "factory: record infra and baseline"]);
+
+    // After the baseline commit, test_mod.test_two breaks too.
+    fs.writeFileSync(path.join(tmpRepo.dir, "fail_test2.flag"), "1");
+
+    const res = await runCheck(
+      "target-green",
+      makeContext({
+        task,
+        taskDir,
+        taskWt: tmpRepo.dir,
+        target: { gate: "test" },
+        baseline: {
+          gates: [{ id: "test", status: "fail" }],
+        },
+      })
+    );
+
+    expect(res.ok).toBe(false);
+    expect(res.summary).toContain("test_mod.test_two");
+    expect(fs.readFileSync(baselineFile, "utf8")).toContain("test_mod.test_one");
+  });
+});

## Human involvement
# Human involvement criteria

Mode selects which ADR and concern decisions need a human decision. Everything
else is either autonomous or digest-only; never block on items the table marks
remarkable.

## Blocking table (ADRs and concerns)

| Mode | Blocking (needs human decision) | Remarkable (digest only) |
| --- | --- | --- |
| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
| principal | stack/layer, external interfaces, config shapes | internal choices |
| detailed | external-interface changes and major internal interfaces | minor internals |

## autonomous

Block only explicit high-severity ADRs/concerns that remain after all unblocked
work is finished. Do not stop for internal choices; record them as remarkable.

## Open Concerns
- id: c-8a26e7294b
  kind: risk
  severity: medium
  summary: "Gate environment lacks dependency install: child/item worktrees without infra.setup fail typecheck and tests with `Cannot find package 'yaml'` / missing `@types/bun`."
- id: rm-02fe59eb65
  kind: remarkable
  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
- id: rm-61c10c8318
  kind: remarkable
  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
- id: rm-63922d9635
  kind: remarkable
  summary: Configure omp via a generated YAML overlay per turn
- id: rm-ac427a6618
  kind: remarkable
  summary: "Engine-managed git worktrees (`git worktree add` + `omp --cwd`) rather than omp `isolated: true` subagent tasks"
- id: rm-df9df7bd8a
  kind: remarkable
  summary: Epics run in-process as child tasks with an in-process `runTaskChild`
- id: rm-565790e99d
  kind: remarkable
  summary: On-demand whole-tree derivation; no registry
- id: rm-6344b013f9
  kind: remarkable
  summary: Additive optional cache fields; no record migration
- id: rm-d5301c7af1
  kind: remarkable
  summary: Real-binary scripted-provider e2e; FakeHarness retained
- id: rm-d7f1fc7cc4
  kind: remarkable
  summary: Four spikes + two foundation items in iteration 1; epics deferred to iteration 2
- id: rm-1e89eca104
  kind: remarkable
  summary: Additive optional cache-token fields with zero-default aggregation, no migration
- id: rm-f6cb03959a
  kind: remarkable
  summary: Iteration-1 spikes+measurement only, epics deferred to iteration-2 via replanAfter
- id: rm-9571a69c19
  kind: remarkable
  summary: Keep omp root-session discovery as the sole repo-rules injector; do not duplicate rule text in factory role/step prompts
- id: rm-d9e8ce5fcd
  kind: remarkable
  summary: Use `.omp/RULES.md` / `contextFiles.extra` (or task `context`) for rules that must reach scouts


- Raise concerns with evidence; condense stale detail instead of repeating it.

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
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- newConcerns (array of object, optional): New concerns discovered during review
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
