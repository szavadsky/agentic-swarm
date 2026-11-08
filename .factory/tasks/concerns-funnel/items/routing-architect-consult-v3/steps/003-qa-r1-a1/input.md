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
  "slug": "routing-architect-consult-v3",
  "kind": "dev",
  "title": "Architect consult and hydration (merge repair)",
  "assignment": "Act-phase ONLY merge-repair rerun (pure derive already merged in routing-blocker-derive-v2; do NOT touch derive/task.ts or scheduler). Implement wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent, runExclusive + atomic write) plus buildArchitectHydration concernsYaml extension appended LAST (open+routed, capped sub-budget, plan-reviewer path stays open-only) per adr-routing-derived-state and adr-concern-store-taskwt. Do NOT redesign: rebase the exact ready routing-architect-consult-v2 diff onto current topic tip, verify wave-9 sibling conflict resolution kept ALL THREE diffs (consult + adr-blocking-digest-v2 + status-state-surface-v2), pull the exact merge-gate failure (failing test names + output from evidence) and fix root cause. Out of scope: 4 optional nits (carry to docs-finish). Gates: bun run typecheck and TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts then full suite. Behavior must satisfy m3-routing: single consult file on newly-blocked, restart writes no second file, architect hydration contains concern id+summary.",
  "outlineRef": "routing-architect-consult-v3",
  "milestone": "m3-routing",
  "wave": 10,
  "deps": [
    "modes-prompts-v2",
    "routing-blocker-derive-v2"
  ],
  "citations": [
    "adr-routing-derived-state",
    "adr-concern-store-taskwt",
    "adr-triage-suggestions-dismiss"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..ba55128
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,26 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 2 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-architect-consult.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794148909121-8w7gb7ks43d.xml
+      junitCaseCount: 2
+      junitCaseIds:
+        - "Routing: architect consult and hydration.writes one concern decision
+          file and hydrates architect turns with routed concerns"
+        - "Routing: architect consult and hydration.restart after a
+          mid-iteration failure neither repeats the consult nor rewrites the
+          decision"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..607537c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,62 @@
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
+  "slug": "routing-architect-consult-v3",
+  "kind": "dev",
+  "title": "Architect consult and hydration (merge repair)",
+  "assignment": "Act-phase ONLY merge-repair rerun (pure derive already merged in routing-blocker-derive-v2; do NOT touch derive/task.ts or scheduler). Implement wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent, runExclusive + atomic write) plus buildArchitectHydration concernsYaml extension appended LAST (open+routed, capped sub-budget, plan-reviewer path stays open-only) per adr-routing-derived-state and adr-concern-store-taskwt. Do NOT redesign: rebase the exact ready routing-architect-consult-v2 diff onto current topic tip, verify wave-9 sibling conflict resolution kept ALL THREE diffs (consult + adr-blocking-digest-v2 + status-state-surface-v2), pull the exact merge-gate failure (failing test names + output from evidence) and fix root cause. Out of scope: 4 optional nits (carry to docs-finish). Gates: bun run typecheck and TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts then full suite. Behavior must satisfy m3-routing: single consult file on newly-blocked, restart writes no second file, architect hydration contains concern id+summary.",
+  "outlineRef": "routing-architect-consult-v3",
+  "milestone": "m3-routing",
+  "wave": 10,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-blocker-derive-v2"
+  ],
+  "citations": [
+    "adr-routing-derived-state",
+    "adr-concern-store-taskwt",
+    "adr-triage-suggestions-dismiss"
+  ]
+}
+
+## Context & Citations
+[
+  "adr-routing-derived-state",
+  "adr-concern-store-taskwt",
+  "adr-triage-suggestions-dismiss"
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..6216975
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T14:30:25.387Z
+session: 01a1bb91-538e-709f-bf99-d669d2b50f4a
+endedAt: 2026-11-08T14:41:52.593Z
+usage:
+  inputTokens: 80990
+  outputTokens: 38993
+  costUsd: 0.050304
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T14-30-25-934Z_01a1bb91-538e-709f-bf99-d669d2b50f4a
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..0d1fbae
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,75 @@
+status: ok
+summary: "Authored the exact ready routing-architect-consult-v2 engine test file
+  at plugins/software-factory/test/engine/routing-architect-consult.test.ts (no
+  production edits, no stubs). Both scenarios are behaviorally red on current
+  production because no decisions/concern-<cid>.yaml is written: JUnit reports 2
+  <failure> (0 <error>) with the declared ids. Merge-repair root cause
+  investigated: the v2 merge tree 74739d6 passes the full suite under both
+  TMPDIR=/tmp and a factory-runtime-style TMPDIR, so the wave-9 gate failure was
+  environmental/flaky, not a deterministic defect. A 3-way rebase of the v2 diff
+  onto current tip yields exactly one conflict (iteration.ts import block);
+  resolving it by keeping persistAdrs (adr-blocking-digest-v2) plus
+  runConcernConsult (this item) makes the resolved scratch tree pass the full
+  suite (384 pass, 2 skip, 0 fail), including all sibling suites."
+target:
+  selectors:
+    - test/engine/routing-architect-consult.test.ts
+  expectRed:
+    - "Routing: architect consult and hydration.writes one concern decision file
+      and hydrates architect turns with routed concerns"
+    - "Routing: architect consult and hydration.restart after a mid-iteration
+      failure neither repeats the consult nor rewrites the decision"
+evidence:
+  - Added
+    plugins/software-factory/test/engine/routing-architect-consult.test.ts,
+    byte-identical to the ready v2 test diff (sha1
+    bbd08caeb9e3cd8a70a154d9dfb6e8f1efc26ad7 on both).
+  - cd plugins/software-factory && bun run typecheck -> exit 0 (tsc --noEmit
+    clean with the new test).
+  - TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts -> 0
+    pass, 2 fail, 4 expect() calls; failures are expect().toEqual assertion
+    failures (expected ['concern-c-0123456789.yaml'], received []), not
+    import/collection errors.
+  - "JUnit reporter: 2 <testcase> entries with classname 'Routing: architect
+    consult and hydration' and 2 <failure> tags (0 <error>), ids exactly match
+    expectRed."
+  - TMPDIR=/tmp bun test (full suite) -> 382 pass, 2 skip, 2 fail across 65
+    files; only the two newly declared red tests fail, proving no collateral
+    regression on current production.
+  - Targeted red test re-run with a factory-runtime-style TMPDIR
+    (<worktree>/.tmp-repro/.factory-runtime/tmp) -> 0 pass, 2 fail with the same
+    assertion, so target-red is TMPDIR-independent.
+  - "Merge-gate evidence: in-repo journal.ndjson records only
+    item_merge_gates_failed {failingGates:['test']} for v2 with no per-test
+    names; extracting merge tree 74739d6 and running the full suite -> 371 pass,
+    2 skip, 0 fail (373 tests/61 files) under TMPDIR=/tmp and again under the
+    factory-runtime-style TMPDIR, so the recorded gate failure was
+    flaky/environmental."
+  - "Rebase simulation on current tip: 3-way merge of iteration.ts (base
+    abc124d, ours current e9d0440, theirs v2 a58cfd2) -> single conflict in the
+    import block; resolution keeps both 'persistAdrs' and 'runConcernConsult'.
+    Resolved scratch tree: typecheck pass; targeted consult +
+    adr-blocking-digest + state-concern-counts + status-concerns suites -> 13
+    pass, 0 fail; full suite -> 384 pass, 2 skip, 0 fail (386 tests/65 files)."
+  - git status --porcelain -> only '??
+    plugins/software-factory/test/engine/routing-architect-consult.test.ts'; all
+    scratch repro dirs removed.
+concerns:
+  - The exact v2 merge-gate failure is not persisted in-repo beyond
+    failingGates:["test"]; reproduction shows the merge tree is green, so the
+    prior failure cannot be attributed to a deterministic test defect. The
+    durable repair is the rebase onto current tip plus TMPDIR-normalized gates.
+  - "Develop must not copy the v2 branch's stale iteration.ts wholesale: the
+    only rebase conflict is the import block, and the resolution must retain
+    BOTH persistAdrs (adr-blocking-digest-v2) and runConcernConsult (this item).
+    Dropping persistAdrs is caught by test/engine/adr-blocking-digest.test.ts."
+  - The 4 optional nits (concerns hydration sub-budget, concern-id sanitize,
+    flows barrel export, consult prompt-context alignment) remain out of scope
+    and are carried to docs-finish as instructed.
+notes: "Test-first only: no production files were modified and no interface
+  stubs were needed. The test file is the exact ready v2 test diff; its green
+  contract was pre-verified in a scratch copy with the v2 production diff
+  rebased onto current tip, so Develop can apply the same minimal resolution and
+  expect the full suite to go green. Selector is relative to
+  plugins/software-factory (the repo's only Bun package); expectRed ids are the
+  native bun JUnit classname.name ids."
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..45b1d38
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,83 @@
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
+        durationMs: 4172
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 84073
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-rD4W9y/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1306935
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1306935
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1306935
+
+           384 pass
+           2 skip
+           0 fail
+           1803 expect() calls
+          Ran 386 tests across 65 files. [83.91s]
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
+        test/engine/routing-architect-consult.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794149308565-jitfnrgiona.xml
+      junitCaseCount: 2
+      junitCaseIds:
+        - "Routing: architect consult and hydration.writes one concern decision
+          file and hydrates architect turns with routed concerns"
+        - "Routing: architect consult and hydration.restart after a
+          mid-iteration failure neither repeats the consult nor rewrites the
+          decision"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 226/300 production lines changed"
+    details:
+      changedLines:
+        added: 224
+        deleted: 2
+        total: 226
+        files:
+          - plugins/software-factory/src/core/flows/consults.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..a2b74b0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,69 @@
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
+  "slug": "routing-architect-consult-v3",
+  "kind": "dev",
+  "title": "Architect consult and hydration (merge repair)",
+  "assignment": "Act-phase ONLY merge-repair rerun (pure derive already merged in routing-blocker-derive-v2; do NOT touch derive/task.ts or scheduler). Implement wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent, runExclusive + atomic write) plus buildArchitectHydration concernsYaml extension appended LAST (open+routed, capped sub-budget, plan-reviewer path stays open-only) per adr-routing-derived-state and adr-concern-store-taskwt. Do NOT redesign: rebase the exact ready routing-architect-consult-v2 diff onto current topic tip, verify wave-9 sibling conflict resolution kept ALL THREE diffs (consult + adr-blocking-digest-v2 + status-state-surface-v2), pull the exact merge-gate failure (failing test names + output from evidence) and fix root cause. Out of scope: 4 optional nits (carry to docs-finish). Gates: bun run typecheck and TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts then full suite. Behavior must satisfy m3-routing: single consult file on newly-blocked, restart writes no second file, architect hydration contains concern id+summary.",
+  "outlineRef": "routing-architect-consult-v3",
+  "milestone": "m3-routing",
+  "wave": 10,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-blocker-derive-v2"
+  ],
+  "citations": [
+    "adr-routing-derived-state",
+    "adr-concern-store-taskwt",
+    "adr-triage-suggestions-dismiss"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/routing-architect-consult.test.ts"
+  ],
+  "expectRed": [
+    "Routing: architect consult and hydration.writes one concern decision file and hydrates architect turns with routed concerns",
+    "Routing: architect consult and hydration.restart after a mid-iteration failure neither repeats the consult nor rewrites the decision"
+  ]
+}
+
+## Context & Citations
+[
+  "adr-routing-derived-state",
+  "adr-concern-store-taskwt",
+  "adr-triage-suggestions-dismiss"
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..a0381ef
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T14:41:55.381Z
+session: 01a1bb9b-d9f1-7490-8107-04f5e2f58e18
+endedAt: 2026-11-08T14:48:32.961Z
+usage:
+  inputTokens: 91510
+  outputTokens: 23768
+  costUsd: 0.036911
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T14-41-55-697Z_01a1bb9b-d9f1-7490-8107-04f5e2f58e18.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..2dc1fef
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v3/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,73 @@
+status: ok
+summary: "Rebased the exact ready routing-architect-consult-v2 act-phase diff
+  onto the current topic tip (iteration.ts import block resolved keeping BOTH
+  persistAdrs from adr-blocking-digest-v2 and runConcernConsult, so all three
+  wave-9 sibling diffs survive) plus a per-decision runExclusive guard per the
+  assignment. Added runConcernConsult in src/core/flows/consults.ts: keyed-mutex
+  exclusive section keyed on decisions/concern-<cid>.yaml, existence check as
+  idempotency guard, architect consult via steps/architect-consult-nonitem
+  (stepId consult-concern-<cid>, prompt names concern
+  id/summary/severity/affects), atomic writeYamlAtomic of the decision artifact,
+  decision_made journal entry. Hooked consultRoutedBlockers into wave act at
+  wave start and after every wave tick, consulting once per routed blocker
+  concern whose affects intersect the wave's blocked slugs. Extended
+  buildArchitectHydration with an open+routed terse concernsYaml section
+  appended LAST (renderConcernsYaml, byte-capped) so plan and wave-report turns
+  see routed concerns; plan-reviewer hydration path is untouched and stays
+  open-only. No derive/scheduler changes."
+target:
+  selectors:
+    - test/engine/routing-architect-consult.test.ts
+  expectRed:
+    - "Routing: architect consult and hydration.writes one concern decision file
+      and hydrates architect turns with routed concerns"
+    - "Routing: architect consult and hydration.restart after a mid-iteration
+      failure neither repeats the consult nor rewrites the decision"
+evidence:
+  - cd plugins/software-factory && bun run typecheck -> exit 0 (tsc --noEmit
+    clean)
+  - TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts -> 2
+    pass, 0 fail, 26 expect() calls; both declared expectRed cases green (single
+    decisions/concern-c-0123456789.yaml, one consult turn, restart keeps the
+    byte-identical decision file and issues no second consult, plan prompt +
+    wave-report prompts contain concern id and summary)
+  - "Baseline before the fix: same selector -> 0 pass, 2 fail (decisionFiles([])
+    vs ['concern-c-0123456789.yaml']), confirming the tests were behaviorally
+    red on current production"
+  - TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts
+    test/cli/status-concerns.test.ts -> 24 pass, 0 fail, 222 expect() calls
+  - "Sibling merge-repair regression suites kept green: TMPDIR=/tmp bun test
+    test/engine/adr-blocking-digest.test.ts test/engine/status-concerns.test.ts
+    test/engine/state-concern-counts.test.ts
+    test/engine/routing-blocker-derive.test.ts
+    test/engine/plan-reviewer-triage.test.ts -> 24 pass, 0 fail, 124 expect()
+    calls"
+  - "Full gate: TMPDIR=/tmp bun test -> 384 pass, 2 skip, 0 fail, 386 tests
+    across 65 files (84s), including all three wave-9 sibling suites (consult,
+    adr-blocking-digest, state/status concern surface)"
+  - git status --porcelain -> only
+    plugins/software-factory/src/core/flows/consults.ts and iteration.ts
+    modified; no stray scratch artifacts
+concerns:
+  - The exact wave-9 merge-gate failure is not persisted in-repo (journal
+    records only failingGates:['test'] with no test names); test-first
+    reproduced the v2 merge tree green under both TMPDIR profiles, so the repair
+    is the rebase onto current tip plus TMPDIR-normalized gates, not a
+    deterministic test defect.
+  - "Per instructions the 4 optional nits remain deferred to docs-finish:
+    concerns hydration sub-budget (v2 diff caps the concerns section at the
+    whole hydration budget via renderConcernsYaml rather than a reserved
+    sub-budget), concern-id sanitize in stepId, flows barrel export of
+    runConcernConsult, consult prompt-context alignment."
+  - Newly-routed concerns discovered mid-wave are consulted on the next wave
+    tick (same per-decision guard); a crash after the decision write but before
+    the step-record commit could re-consult only if worktree repair drops the
+    uncommitted artifact (same artifact-ordering property as all engine
+    artifacts).
+notes: "Act-phase only: derive/task.ts, derive/item.ts, derive/wave.ts and
+  plan/scheduler.ts untouched. The only rebase conflict was iteration.ts's
+  import block; resolution keeps persistAdrs (adr-blocking-digest-v2) alongside
+  runConcernConsult, which is covered by the green adr-blocking-digest suite.
+  Added a KeyedMutex keyed on the decision path around the existence-check +
+  consult + atomic write so concurrent/restarted act passes cannot
+  double-consult."
diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
index 9499683..f365c82 100644
--- a/plugins/software-factory/src/core/flows/consults.ts
+++ b/plugins/software-factory/src/core/flows/consults.ts
@@ -6,15 +6,19 @@ import type {
   PipelineConfig,
   ProjectConfig,
   SteerItemArtifact,
+  StoredConcernArtifact,
 } from "../artifacts.js";
 import type { Harness } from "../../harness/types.js";
 import { writeYamlAtomic } from "../records/io.js";
 import { writeQuestion } from "../steer.js";
 import { runAgentStep } from "./step-runner.js";
 import { appendJournal } from "../journal.js";
-import type { Semaphore } from "../mutex.js";
+import { KeyedMutex, type Semaphore } from "../mutex.js";
 import type { BudgetTracker } from "../budget.js";
 
+/** Serializes routed-concern consults so one decision file is written once. */
+const concernLocks = new KeyedMutex();
+
 export interface ItemConsultParams {
   task: string;
   item: string;
@@ -289,3 +293,128 @@ export async function runNonItemConsult(
 
   return { decision: decisionArtifact, sessionId: stepRes.sessionId };
 }
+
+export interface ConcernConsultParams {
+  task: string;
+  concern: StoredConcernArtifact;
+  taskDir: string;
+  taskWt: string;
+  repo: any;
+  harness: Harness;
+  pipeline: PipelineConfig;
+  project: ProjectConfig;
+  prompts: any;
+  architectSessionId?: string;
+  turnsSemaphore?: Semaphore;
+  budgetTracker?: BudgetTracker;
+  iteration?: number;
+}
+
+/**
+ * Runs one architect consult for a routed blocker concern (§18,
+ * adr-routing-derived-state). `decisions/concern-<cid>.yaml` is the canonical
+ * artifact; its existence is the idempotency guard, so a restarted act phase
+ * neither repeats the turn nor rewrites the decision.
+ */
+export async function runConcernConsult(
+  params: ConcernConsultParams
+): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
+  const decisionPath = path.join(params.taskDir, "decisions", `concern-${params.concern.id}.yaml`);
+  return concernLocks.runExclusive(decisionPath, () => consultConcernOnce(params, decisionPath));
+}
+
+async function consultConcernOnce(
+  params: ConcernConsultParams,
+  decisionPath: string
+): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
+  const {
+    task,
+    concern,
+    taskDir,
+    taskWt,
+    repo,
+    harness,
+    pipeline,
+    project,
+    prompts,
+    architectSessionId,
+    turnsSemaphore,
+    budgetTracker,
+    iteration,
+  } = params;
+
+  if (fs.existsSync(decisionPath)) {
+    return { sessionId: architectSessionId };
+  }
+
+  const runsDir = path.join(taskDir, "runs");
+  await fs.promises.mkdir(path.dirname(decisionPath), { recursive: true });
+  const affects = (concern.affects ?? []).join(", ");
+  const promptVars: Record<string, string> = {
+    task,
+    context: [
+      `Routed blocker concern ${concern.id}`,
+      `Summary: ${concern.summary}`,
+      `Severity: ${concern.severity}${affects ? `; blocks: ${affects}` : ""}`,
+    ].join("\n"),
+    feedback: concern.detail ?? concern.summary,
+    debt: "",
+  };
+
+  let decisionArtifact: DecisionArtifact | undefined;
+  const stepRes = await runAgentStep({
+    task,
+    stepId: `consult-concern-${concern.id}`,
+    stepFragment: "steps/architect-consult-nonitem",
+    agent: "architect",
+    role: "architect",
+    sessionMode: "reuse",
+    existingSessionId: architectSessionId,
+    cwd: taskWt,
+    taskDir,
+    recordsDir: runsDir,
+    repo,
+    harness,
+    pipeline,
+    project,
+    prompts,
+    promptVars,
+    turnsSemaphore,
+    budgetTracker,
+    iteration,
+    writeArtifact: async (output: unknown) => {
+      if (fs.existsSync(decisionPath)) return;
+      const raw = output as any;
+      decisionArtifact = {
+        id: String(raw?.id ?? `decision-concern-${concern.id}`),
+        context: (raw?.context ?? "wave") as DecisionContext,
+        decision: String(raw?.decision ?? "continue"),
+        timestamp: String(raw?.timestamp ?? new Date().toISOString()),
+        rationale: raw?.rationale,
+        text: raw?.text,
+        persist: raw?.persist,
+        outlines: raw?.outlines,
+        outline: raw?.outline,
+        debt: raw?.debt,
+        reason: raw?.reason,
+        question: raw?.question,
+        planDelta: raw?.planDelta,
+      };
+      await writeYamlAtomic(decisionPath, decisionArtifact);
+    },
+  });
+
+  if (!stepRes.ok || !decisionArtifact) {
+    throw new Error(`Concern consult for ${concern.id} failed: ${stepRes.meta.error || "no output"}`);
+  }
+
+  await appendJournal(taskDir, {
+    type: "decision_made",
+    context: "concern",
+    concern: concern.id,
+    decision: decisionArtifact.decision,
+    decisionPath,
+  });
+
+  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
+}
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index e9d0440..84a77f6 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -20,7 +20,7 @@ import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records
 import { runAgentStep } from "./step-runner.js";
 import { writeQuestion } from "../steer.js";
 import { persistAdrs } from "./adrs.js";
-import { runItemConsult } from "./consults.js";
+import { runItemConsult, runConcernConsult } from "./consults.js";
 import { mergeItem } from "./merge-path.js";
 import { tickItemMachine } from "./item-machine.js";
 import { deriveItemState } from "../derive/item.js";
@@ -32,8 +32,10 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
   hydrateConcernsYaml,
   listConcernIds,
+  listConcerns,
   partitionSuggestions,
 } from "../concerns.js";
+import { renderConcernsYaml } from "../triage.js";
 import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
 import { validateEdits } from "../plan/limits.js";
 import { applyEdits } from "../plan/apply.js";
@@ -167,6 +169,18 @@ async function buildArchitectHydration(
     }
   }
 
+  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+  // every architect turn the terse decision context the act phase acts on.
+  // Appended last so the byte cap never evicts it.
+  const actionableConcerns = (await listConcerns(taskDir)).filter(
+    (c) => c.status === "open" || c.status === "routed"
+  );
+  if (actionableConcerns.length > 0) {
+    parts.push(
+      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+    );
+  }
+
   const combined = parts.join("\n\n");
   if (combined.length <= maxBytes) {
     return combined;
@@ -174,6 +188,58 @@ async function buildArchitectHydration(
   return combined.slice(combined.length - maxBytes);
 }
 
+/**
+ * Act-phase routing (§18, adr-routing-derived-state): consult the architect
+ * once per routed blocker concern that blocks a pending item in this wave.
+ * The per-concern decision artifact is the guard, so repeated or restarted
+ * act passes neither repeat the turn nor rewrite the decision.
+ */
+interface RoutedConsultContext {
+  task: string;
+  taskDir: string;
+  taskWt: string;
+  repo: any;
+  harness: Harness;
+  pipeline: PipelineConfig;
+  project: ProjectConfig;
+  prompts: any;
+  architectSessionId?: string;
+  turnsSemaphore?: Semaphore;
+  budgetTracker?: BudgetTracker;
+  iteration: number;
+}
+
+async function consultRoutedBlockers(
+  ctx: RoutedConsultContext,
+  blockedSlugs: Iterable<string>
+): Promise<string | undefined> {
+  const blocked = new Set(blockedSlugs);
+  if (blocked.size === 0) return ctx.architectSessionId;
+
+  let sessionId = ctx.architectSessionId;
+  for (const concern of await listConcerns(ctx.taskDir)) {
+    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
+    if (!(concern.affects ?? []).some((slug) => blocked.has(slug))) continue;
+    const res = await runConcernConsult({
+      task: ctx.task,
+      concern,
+      taskDir: ctx.taskDir,
+      taskWt: ctx.taskWt,
+      repo: ctx.repo,
+      harness: ctx.harness,
+      pipeline: ctx.pipeline,
+      project: ctx.project,
+      prompts: ctx.prompts,
+      architectSessionId: sessionId,
+      turnsSemaphore: ctx.turnsSemaphore,
+      budgetTracker: ctx.budgetTracker,
+      iteration: ctx.iteration,
+    });
+    sessionId = res.sessionId ?? sessionId;
+  }
+  return sessionId;
+}
+
 /**
  * Runs a full architect iteration (§8.4).
  */
@@ -772,6 +838,28 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
       continue;
     }
 
+    // Act-phase routing (§18): each routed blocker concern blocking a pending
+    // item in this wave gets one architect consult before work starts.
+    const consultCtx: RoutedConsultContext = {
+      task,
+      taskDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      architectSessionId,
+      turnsSemaphore,
+      budgetTracker,
+      iteration,
+    };
+    architectSessionId = await consultRoutedBlockers(
+      consultCtx,
+      waveState.blocked.map((it) => it.slug)
+    );
+    consultCtx.architectSessionId = architectSessionId;
+
     await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });
 
     // Run wave items until wave can merge or complete
@@ -844,6 +932,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         items: itemStates,
         blockedBy: await collectRoutedBlockers(taskDir),
       });
+      architectSessionId = await consultRoutedBlockers(
+        consultCtx,
+        waveState.blocked.map((it) => it.slug)
+      );
+      consultCtx.architectSessionId = architectSessionId;
       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
     }
 
diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
new file mode 100644
index 0000000..3eb7799
--- /dev/null
+++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
@@ -0,0 +1,435 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runTask } from "../../src/core/engine.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml } from "../../src/core/records/io.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Act-phase routing (docs/factory.v2.md §18; adr-routing-derived-state).
+ *
+ * Derive owns the blocking effect of a `routed` blocker concern. The act phase
+ * owns the architect turn: when a wave act observes an item blocked by such a
+ * concern, it consults the architect once per concern and writes
+ * `decisions/concern-<cid>.yaml`. Existence of that canonical artifact is the
+ * guard, so a restart after a mid-iteration failure neither consults nor
+ * rewrites. Architect hydration (plan and wave report inputs) carries routed
+ * concerns as a terse `{id, summary, ...}` digest.
+ *
+ * Test-first contract for the new consult step: it runs an orchestration step
+ * named `consult-concern-<cid>` (harness label `<task>/runs/consult-concern-<cid>#a1`)
+ * and its rendered prompt names the concern id and summary.
+ */
+
+const ORCH = ".factory";
+const BLOCKER_CID = "c-0123456789";
+const ARCHITECT_CID = "c-9876543210";
+const BLOCKER_SUMMARY = "Database schema migration is pending";
+const ARCHITECT_SUMMARY = "Cache TTL assumption is unverified";
+
+type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };
+
+function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
+  return {
+    kind: "blocker",
+    summary: `Concern ${overrides.id}`,
+    detail: "detail",
+    severity: "medium",
+    status: "routed",
+    disposition: "architect",
+    source: { record: "seed-concern", agent: "test" },
+    createdAt: "2026-01-01T00:00:00.000Z",
+    updatedAt: "2026-01-01T00:00:00.000Z",
+    ...overrides,
+  };
+}
+
+function writeConcern(taskDir: string, concern: StoredConcernArtifact): void {
+  const dir = path.join(taskDir, "concerns");
+  fs.mkdirSync(dir, { recursive: true });
+  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(concern, null, 2), "utf8");
+}
+
+function makePipeline(): PipelineConfig {
+  return {
+    models: {
+      roles: {
+        workhorse: { model: "deepseek-chat" },
+        "alt-workhorse": { model: "deepseek-chat" },
+        architect: { model: "deepseek-reasoner" },
+        "alt-architect": { model: "deepseek-reasoner" },
+        "task-reviewer": { model: "deepseek-chat" },
+        "wave-close-up": { model: "deepseek-chat" },
+        "plan-close-up": { model: "deepseek-chat" },
+        simpler: { model: "deepseek-chat" },
+      },
+    },
+    agents: {
+      triage: { role: "workhorse" },
+      infra: { role: "workhorse" },
+      architect: { role: "architect" },
+      "plan-reviewer": { role: "alt-architect" },
+      pm: { role: "alt-workhorse" },
+      developer: { role: "workhorse" },
+      reviewer: { role: "task-reviewer" },
+      "wave-close-up": { role: "wave-close-up" },
+      "plan-close-up": { role: "plan-close-up" },
+    },
+    flows: {
+      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
+      story: {
+        dev: {
+          fixLoopTo: "develop",
+          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
+        },
+      },
+      spike: {},
+    },
+    limits: {
+      maxParallelItems: 2,
+      maxParallelTurns: 4,
+      maxStepAttempts: 2,
+      maxFixRounds: 2,
+      maxPlanReviewRounds: 1,
+      maxIterations: 3,
+    },
+  };
+}
+
+function decisionFiles(taskDir: string): string[] {
+  const dir = path.join(taskDir, "decisions");
+  if (!fs.existsSync(dir)) return [];
+  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
+}
+
+function consultPrompts(harness: FakeHarness): string[] {
+  return harness.calls
+    .filter(
+      (call): call is Extract<typeof call, { type: "run" }> =>
+        call.type === "run" && call.run.label.includes("consult-concern-")
+    )
+    .map((call) => call.run.prompt);
+}
+
+describe("Routing: architect consult and hydration", () => {
+  let tmpRepo: TmpRepo;
+  let worktreeRoot: string;
+  let repoObj: Repo;
+  let pipeline: PipelineConfig;
+  let project: ProjectConfig;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    pipeline = makePipeline();
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
+  /**
+   * Seeds a task whose wave 1 has one routable item and one routed-blocker
+   * seed, and whose wave 2 holds the declared dependent of that seed.
+   */
+  function seedTask(task: string): string {
+    const taskDir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Routing consult for ${task}\n`, "utf8");
+    writeConcern(
+      taskDir,
+      storedConcern({
+        id: BLOCKER_CID,
+        kind: "blocker",
+        summary: BLOCKER_SUMMARY,
+        affects: ["seed"],
+      })
+    );
+    writeConcern(
+      taskDir,
+      storedConcern({
+        id: ARCHITECT_CID,
+        kind: "risk",
+        summary: ARCHITECT_SUMMARY,
+        affects: [],
+      })
+    );
+    tmpRepo.commit(`seed routed concerns for ${task}`);
+    return taskDir;
+  }
+
+  function scriptIngestAndPlan(
+    harness: FakeHarness,
+    task: string,
+    captured: { planPrompt?: string }
+  ): void {
+    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+      ok: true,
+      data: { kind: "story", rationale: "Routed concerns need an architect turn", citations: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/infra#a1`, {
+      ok: true,
+      data: {
+        setup: [],
+        gates: [{ id: "test", command: "true" }],
+        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
+      captured.planPrompt = run.prompt;
+      return {
+        ok: true,
+        data: {
+          iteration: 1,
+          milestones: [{ id: "m1", title: "M1" }],
+          itemOutlines: [
+            { slug: "keep", kind: "dev", title: "Keep", milestoneId: "m1" },
+            { slug: "seed", kind: "dev", title: "Seed", milestoneId: "m1" },
+            {
+              slug: "dependent",
+              kind: "dev",
+              title: "Dependent",
+              milestoneId: "m1",
+              deps: ["seed"],
+            },
+          ],
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Plan approved", suggestions: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: {
+        iteration: 1,
+        items: [
+          {
+            slug: "keep",
+            outlineRef: "keep",
+            kind: "dev",
+            title: "Keep",
+            assignment: "Keep the wave progressing",
+            milestone: "m1",
+            wave: 1,
+          },
+          {
+            slug: "seed",
+            outlineRef: "seed",
+            kind: "dev",
+            title: "Seed",
+            assignment: "Work named by the routed blocker",
+            milestone: "m1",
+            wave: 1,
+          },
+          {
+            slug: "dependent",
+            outlineRef: "dependent",
+            kind: "dev",
+            title: "Dependent",
+            assignment: "Declared dependent of the blocked seed",
+            milestone: "m1",
+            wave: 2,
+            deps: ["seed"],
+          },
+        ],
+      },
+    });
+  }
+
+  function scriptConcernConsult(
+    harness: FakeHarness,
+    task: string,
+    promptsSeen: string[]
+  ): void {
+    harness.scriptOutcome(`${task}/runs/consult-concern-${BLOCKER_CID}#a1`, (run) => {
+      promptsSeen.push(run.prompt);
+      return {
+        ok: true,
+        data: {
+          id: `decision-concern-${BLOCKER_CID}`,
+          context: "wave",
+          decision: "continue",
+          rationale: "Mitigate the migration before dependents run",
+          timestamp: "2026-01-01T00:00:00.000Z",
+        },
+      };
+    });
+  }
+
+  function scriptWaveCeremony(
+    harness: FakeHarness,
+    task: string,
+    captured: { waveReports: string[] },
+    opts: { failReportAt?: 1 | 2 } = {}
+  ): void {
+    let wave1ReportCalls = 0;
+    let wave2ReportCalls = 0;
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["keep"], summary: "Wave 1" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
+      wave1ReportCalls++;
+      if (opts.failReportAt === 1 && wave1ReportCalls === 1) {
+        return { ok: false, error: "architect wave report crashed" };
+      }
+      captured.waveReports.push(run.prompt);
+      return {
+        ok: true,
+        data: {
+          id: "dec-wave-1",
+          context: "wave",
+          decision: "continue",
+          timestamp: "2026-01-01T00:00:00.000Z",
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
+      ok: true,
+      data: { wave: 2, iteration: 1, status: "blocked", mergedItems: [], blockedItems: ["dependent"], summary: "Wave 2 blocked" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
+      wave2ReportCalls++;
+      if (opts.failReportAt === 2 && wave2ReportCalls === 1) {
+        return { ok: false, error: "architect wave report crashed" };
+      }
+      captured.waveReports.push(run.prompt);
+      return {
+        ok: true,
+        data: {
+          id: "dec-wave-2",
+          context: "wave",
+          decision: "continue",
+          timestamp: "2026-01-01T00:00:00.000Z",
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Iteration verified" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Delivery complete" },
+    });
+  }
+
+  it("writes one concern decision file and hydrates architect turns with routed concerns", async () => {
+    const task = "routing-consult";
+    seedTask(task);
+    const harness = new FakeHarness();
+    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
+    const consultPromptsSeen: string[] = [];
+
+    scriptIngestAndPlan(harness, task, captured);
+    scriptConcernConsult(harness, task, consultPromptsSeen);
+    scriptWaveCeremony(harness, task, captured);
+    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
+      ok: true,
+      data: { status: "ok", summary: "Kept the wave moving" },
+    });
+
+    const result = await runTask(
+      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+      task
+    );
+
+    expect(result.status).toBe("done");
+
+    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
+
+    // Exactly one canonical consult artifact, named by the routed concern.
+    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+    const decision = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`)
+    );
+    expect(decision.decision).toBe("continue");
+
+    // One architect turn for the blocker concern, no turn for the risk concern.
+    expect(consultPromptsSeen).toHaveLength(1);
+    expect(consultPrompts(harness)).toHaveLength(1);
+    expect(consultPromptsSeen[0]).toContain(BLOCKER_CID);
+    expect(consultPromptsSeen[0]).toContain(BLOCKER_SUMMARY);
+
+    // Routed concerns reach the architect hydration for the plan and wave
+    // report turns without changing the open-only reviewer hydration.
+    expect(captured.planPrompt).toBeDefined();
+    expect(captured.planPrompt).toContain(BLOCKER_CID);
+    expect(captured.planPrompt).toContain(BLOCKER_SUMMARY);
+    expect(captured.planPrompt).toContain(ARCHITECT_CID);
+    expect(captured.planPrompt).toContain(ARCHITECT_SUMMARY);
+
+    expect(captured.waveReports).toHaveLength(2);
+    expect(captured.waveReports[0]).toContain(BLOCKER_CID);
+    expect(captured.waveReports[0]).toContain(BLOCKER_SUMMARY);
+  }, 30_000);
+
+  it("restart after a mid-iteration failure neither repeats the consult nor rewrites the decision", async () => {
+    const task = "routing-consult-restart";
+    seedTask(task);
+    const harness = new FakeHarness();
+    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
+    const consultPromptsSeen: string[] = [];
+
+    scriptIngestAndPlan(harness, task, captured);
+    scriptConcernConsult(harness, task, consultPromptsSeen);
+    scriptWaveCeremony(harness, task, captured, { failReportAt: 2 });
+    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
+      ok: true,
+      data: { status: "ok", summary: "Kept the wave moving" },
+    });
+
+    // Run 1 dies on wave 2's architect report, after the wave act consulted on
+    // the routed blocker and committed the decision artifact, but before the
+    // iteration finished.
+    const first = await runTask(
+      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+      task
+    );
+    expect(first.status).toBe("failed");
+
+    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
+    const decisionPath = path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`);
+    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+    expect(fs.existsSync(decisionPath)).toBe(true);
+    const beforeRestart = fs.readFileSync(decisionPath, "utf8");
+    expect(consultPrompts(harness)).toHaveLength(1);
+
+    // Run 2 restarts the same iteration; the existing decision artifact is the
+    // idempotency guard, so act phase must not consult or rewrite.
+    const second = await runTask(
+      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+      task
+    );
+    expect(second.status).toBe("done");
+
+    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+    expect(fs.readFileSync(decisionPath, "utf8")).toBe(beforeRestart);
+    expect(consultPrompts(harness)).toHaveLength(1);
+
+    // The restarted architect turn is hydrated with the routed concern.
+    expect(captured.waveReports.length).toBeGreaterThanOrEqual(1);
+    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_CID);
+    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_SUMMARY);
+  }, 30_000);
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
