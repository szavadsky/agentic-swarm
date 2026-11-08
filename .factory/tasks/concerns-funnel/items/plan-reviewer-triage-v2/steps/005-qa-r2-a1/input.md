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
  "slug": "plan-reviewer-triage-v2",
  "kind": "dev",
  "title": "Plan-reviewer triage",
  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
  "outlineRef": "plan-reviewer-triage-v2",
  "milestone": "m2-triage-modes",
  "wave": 7,
  "deps": [
    "concerns-store-v2"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..1ce4357
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,29 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 4 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/plan-reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794128305653-4zayyjpf8nr.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Plan-reviewer triage.hydrates plan-review with plan concerns and
+          triages dismiss vs routed ids
+        - Plan-reviewer triage.aggregates architect-revise concerns and
+          remarkable rm-* for the next review round
+        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
+          never trigger a revision
+        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
+          routed optional dispositions only
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..e504a9f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,52 @@
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
+  "slug": "plan-reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Plan-reviewer triage",
+  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
+  "outlineRef": "plan-reviewer-triage-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 7,
+  "deps": [
+    "concerns-store-v2"
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
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..9a79973
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T08:48:47.458Z
+session: 01a1ba58-8d95-741b-9a02-ce16c53b985d
+endedAt: 2026-11-08T08:58:27.274Z
+usage:
+  inputTokens: 152543
+  outputTokens: 47761
+  costUsd: 0.074561
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T08-48-48-021Z_01a1ba58-8d95-741b-9a02-ce16c53b985d
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..39a219b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,57 @@
+status: ok
+summary: "Authored
+  plugins/software-factory/test/engine/plan-reviewer-triage.test.ts with four
+  behavior specs for plan-reviewer triage: plan/revise concerns + remarkable
+  rm-* aggregation with steps/plan-review concernsYaml hydration (dismiss vs
+  routed, rm triage), triage ids excluded from the plan fix loop/approval, and
+  the routed tech-debt / routed-optional debt predicate via deriveTaskState. All
+  four specs fail red with assertion failures against current production;
+  typecheck passes; the full suite reports 335 pass, 2 skip, 4 fail (only the
+  new specs)."
+target:
+  selectors:
+    - test/engine/plan-reviewer-triage.test.ts
+  expectRed:
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
+      plan-review with plan concerns and triages dismiss vs routed ids
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
+      architect-revise concerns and remarkable rm-* for the next review round
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
+      triage ids out of the plan fix loop so they never trigger a revision
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
+      debt from routed tech-debt concerns and routed optional dispositions only
+evidence:
+  - '`cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/plan-reviewer-triage.test.ts --reporter=junit
+    --reporter-outfile=/tmp/junit-final.xml` -> 0 pass, 4 fail; JUnit shows all
+    four testcases as <failure type="AssertionError">, no
+    <error>/collection/import failures.'
+  - "Ran the repo's own target-red check (`runCheck(\"target-red\", ...)`) with
+    the exact selectors/expectRed above and the committed infra.yaml runner:
+    ok=true, summary \"target-red passed: all 4 expected tests failed with
+    assertion failures\"."
+  - "`cd plugins/software-factory && TMPDIR=/tmp bun run typecheck` -> exit 0."
+  - "`cd plugins/software-factory && TMPDIR=/tmp bun test` -> 335 pass, 2 skip,
+    4 fail; the only failures are the four new plan-reviewer-triage specs,
+    proving runner/fixtures and no baseline regressions."
+  - "`git status --short` -> only the new test file
+    `plugins/software-factory/test/engine/plan-reviewer-triage.test.ts`; no
+    production code touched."
+concerns:
+  - Plan/revise concern+remarkable aggregation already works through the generic
+    runAgentStep ingestStepConcerns seam; the red assertions come from missing
+    plan-review concernsYaml hydration, triage-id exclusion from the plan fix
+    loop, and concern-backed debt derivation.
+  - The tests drive runIteration with FakeHarness and deliberately stop at
+    pm-edits with an empty items payload, so assertions target plan-review side
+    effects without needing wave/item scripting.
+  - Hydration assertions only require the exact concern/rm ids to appear in the
+    rendered plan-review prompt, leaving the concrete YAML layout to the
+    implementation while enforcing id/kind/severity/summary visibility
+    indirectly.
+notes: "Implementation targets: hydrate steps/plan-review in iteration.ts (and
+  add `{{concernsYaml}}` + KNOWN_VARS via concerns.ts formatting), split
+  plan-review suggestions with partitionSuggestions and filter triage ids out of
+  the fixSuggestions/approval branch, and make deriveTaskState debt include
+  routed tech-debt or routed disposition=optional concern files. Test-first
+  scope only; production code remains untouched."
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..fc643a5
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,82 @@
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
+        durationMs: 5059
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 78549
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-VDBA0F/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
+
+           339 pass
+           2 skip
+           0 fail
+           1534 expect() calls
+          Ran 341 tests across 57 files. [78.33s]
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
+        test/engine/plan-reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794128904754-1360m9dvn42p.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Plan-reviewer triage.hydrates plan-review with plan concerns and
+          triages dismiss vs routed ids
+        - Plan-reviewer triage.aggregates architect-revise concerns and
+          remarkable rm-* for the next review round
+        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
+          never trigger a revision
+        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
+          routed optional dispositions only
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 79/300 production lines changed"
+    details:
+      changedLines:
+        added: 73
+        deleted: 6
+        total: 79
+        files:
+          - plugins/software-factory/agents/steps/plan-review.md
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/derive/task.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/prompt-vars.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..5319a3b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,61 @@
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
+  "slug": "plan-reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Plan-reviewer triage",
+  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
+  "outlineRef": "plan-reviewer-triage-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 7,
+  "deps": [
+    "concerns-store-v2"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/plan-reviewer-triage.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates plan-review with plan concerns and triages dismiss vs routed ids",
+    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates architect-revise concerns and remarkable rm-* for the next review round",
+    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps triage ids out of the plan fix loop so they never trigger a revision",
+    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives debt from routed tech-debt concerns and routed optional dispositions only"
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
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..0894abf
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T09:02:50.577Z
+session: 01a1ba65-6a47-77a0-b17d-05ea485f695a
+endedAt: 2026-11-08T09:08:26.177Z
+usage:
+  inputTokens: 80103
+  outputTokens: 19189
+  costUsd: 0.03269
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-02-50-951Z_01a1ba65-6a47-77a0-b17d-05ea485f695a.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..100c13f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,45 @@
+status: ok
+summary: "Implemented plan-reviewer triage: plan-review prompts hydrate open
+  c-*/rm-* funnel items via concernsYaml, review suggestions are partitioned by
+  exact pre-step concern ids so triage ids never request a plan revision, and
+  deriveTaskState adds routed tech-debt or routed disposition=optional concern
+  summaries to debt. Added triage guidance to the plan-review step prompt and
+  registered concernsYaml. All four target tests pass, typecheck is clean, and
+  the full suite is green."
+target:
+  selectors:
+    - test/engine/plan-reviewer-triage.test.ts
+  expectRed:
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
+      plan-review with plan concerns and triages dismiss vs routed ids
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
+      architect-revise concerns and remarkable rm-* for the next review round
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
+      triage ids out of the plan fix loop so they never trigger a revision
+    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
+      debt from routed tech-debt concerns and routed optional dispositions only
+evidence:
+  - cd plugins/software-factory && bun test
+    test/engine/plan-reviewer-triage.test.ts -> 4 pass, 0 fail (all target
+    expectRed cases green).
+  - cd plugins/software-factory && bun run typecheck -> exit 0, no TypeScript
+    errors.
+  - cd plugins/software-factory && bun test -> 339 pass, 2 skip, 0 fail across
+    341 tests / 57 files.
+  - cd plugins/software-factory && bun test
+    test/engine/plan-reviewer-triage.test.ts test/engine/concerns-funnel.test.ts
+    test/human-involvement-config.test.ts -> 37 pass, 0 fail.
+  - git diff --check -> exit 0 (no whitespace errors); working tree only
+    contains the five intended production files.
+concerns:
+  - Hydration includes open concerns and remarkable decisions only;
+    dismissed/routed artifacts are intentionally omitted from plan-review
+    rounds.
+  - Plan-review record replay behavior was unchanged; the exact-id snapshot is
+    taken per round before the reviewer call, mirroring step-runner ingestion.
+notes: Changed src/core/concerns.ts (listConcerns/listOpenConcerns refactor,
+  listConcernIds, hydrateConcernsYaml), src/core/flows/iteration.ts (per-round
+  hydration + partition before fix detection), src/core/derive/task.ts (routed
+  concern debt predicate), src/core/prompt-vars.ts and
+  agents/steps/plan-review.md (concernsYaml registration and prompt section). No
+  test files were modified.
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..4f96526
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,28 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 4 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/plan-reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794129418477-qp6l5dique.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Plan-reviewer triage.hydrates plan-review with plan concerns and
+          triages dismiss vs routed ids
+        - Plan-reviewer triage.aggregates architect-revise concerns and
+          remarkable rm-* for the next review round
+        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
+          never trigger a revision
+        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
+          routed optional dispositions only
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..a659081
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1146 @@
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
+  "slug": "plan-reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Plan-reviewer triage",
+  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
+  "outlineRef": "plan-reviewer-triage-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 7,
+  "deps": [
+    "concerns-store-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..1ce4357
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,29 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 4 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794128305653-4zayyjpf8nr.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
++          triages dismiss vs routed ids
++        - Plan-reviewer triage.aggregates architect-revise concerns and
++          remarkable rm-* for the next review round
++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
++          never trigger a revision
++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
++          routed optional dispositions only
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..e504a9f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,52 @@
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
++  "slug": "plan-reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Plan-reviewer triage",
++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
++  "outlineRef": "plan-reviewer-triage-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 7,
++  "deps": [
++    "concerns-store-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..9a79973
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T08:48:47.458Z
++session: 01a1ba58-8d95-741b-9a02-ce16c53b985d
++endedAt: 2026-11-08T08:58:27.274Z
++usage:
++  inputTokens: 152543
++  outputTokens: 47761
++  costUsd: 0.074561
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T08-48-48-021Z_01a1ba58-8d95-741b-9a02-ce16c53b985d
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..39a219b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,57 @@
++status: ok
++summary: "Authored
++  plugins/software-factory/test/engine/plan-reviewer-triage.test.ts with four
++  behavior specs for plan-reviewer triage: plan/revise concerns + remarkable
++  rm-* aggregation with steps/plan-review concernsYaml hydration (dismiss vs
++  routed, rm triage), triage ids excluded from the plan fix loop/approval, and
++  the routed tech-debt / routed-optional debt predicate via deriveTaskState. All
++  four specs fail red with assertion failures against current production;
++  typecheck passes; the full suite reports 335 pass, 2 skip, 4 fail (only the
++  new specs)."
++target:
++  selectors:
++    - test/engine/plan-reviewer-triage.test.ts
++  expectRed:
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
++      plan-review with plan concerns and triages dismiss vs routed ids
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
++      architect-revise concerns and remarkable rm-* for the next review round
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
++      triage ids out of the plan fix loop so they never trigger a revision
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
++      debt from routed tech-debt concerns and routed optional dispositions only
++evidence:
++  - '`cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/plan-reviewer-triage.test.ts --reporter=junit
++    --reporter-outfile=/tmp/junit-final.xml` -> 0 pass, 4 fail; JUnit shows all
++    four testcases as <failure type="AssertionError">, no
++    <error>/collection/import failures.'
++  - "Ran the repo's own target-red check (`runCheck(\"target-red\", ...)`) with
++    the exact selectors/expectRed above and the committed infra.yaml runner:
++    ok=true, summary \"target-red passed: all 4 expected tests failed with
++    assertion failures\"."
++  - "`cd plugins/software-factory && TMPDIR=/tmp bun run typecheck` -> exit 0."
++  - "`cd plugins/software-factory && TMPDIR=/tmp bun test` -> 335 pass, 2 skip,
++    4 fail; the only failures are the four new plan-reviewer-triage specs,
++    proving runner/fixtures and no baseline regressions."
++  - "`git status --short` -> only the new test file
++    `plugins/software-factory/test/engine/plan-reviewer-triage.test.ts`; no
++    production code touched."
++concerns:
++  - Plan/revise concern+remarkable aggregation already works through the generic
++    runAgentStep ingestStepConcerns seam; the red assertions come from missing
++    plan-review concernsYaml hydration, triage-id exclusion from the plan fix
++    loop, and concern-backed debt derivation.
++  - The tests drive runIteration with FakeHarness and deliberately stop at
++    pm-edits with an empty items payload, so assertions target plan-review side
++    effects without needing wave/item scripting.
++  - Hydration assertions only require the exact concern/rm ids to appear in the
++    rendered plan-review prompt, leaving the concrete YAML layout to the
++    implementation while enforcing id/kind/severity/summary visibility
++    indirectly.
++notes: "Implementation targets: hydrate steps/plan-review in iteration.ts (and
++  add `{{concernsYaml}}` + KNOWN_VARS via concerns.ts formatting), split
++  plan-review suggestions with partitionSuggestions and filter triage ids out of
++  the fixSuggestions/approval branch, and make deriveTaskState debt include
++  routed tech-debt or routed disposition=optional concern files. Test-first
++  scope only; production code remains untouched."
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..fc643a5
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,82 @@
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
++        durationMs: 5059
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 78549
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-VDBA0F/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
++
++           339 pass
++           2 skip
++           0 fail
++           1534 expect() calls
++          Ran 341 tests across 57 files. [78.33s]
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
++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794128904754-1360m9dvn42p.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
++          triages dismiss vs routed ids
++        - Plan-reviewer triage.aggregates architect-revise concerns and
++          remarkable rm-* for the next review round
++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
++          never trigger a revision
++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
++          routed optional dispositions only
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 79/300 production lines changed"
++    details:
++      changedLines:
++        added: 73
++        deleted: 6
++        total: 79
++        files:
++          - plugins/software-factory/agents/steps/plan-review.md
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/derive/task.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/prompt-vars.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..5319a3b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,61 @@
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
++  "slug": "plan-reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Plan-reviewer triage",
++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
++  "outlineRef": "plan-reviewer-triage-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 7,
++  "deps": [
++    "concerns-store-v2"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/plan-reviewer-triage.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates plan-review with plan concerns and triages dismiss vs routed ids",
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates architect-revise concerns and remarkable rm-* for the next review round",
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps triage ids out of the plan fix loop so they never trigger a revision",
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives debt from routed tech-debt concerns and routed optional dispositions only"
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
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..0894abf
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T09:02:50.577Z
++session: 01a1ba65-6a47-77a0-b17d-05ea485f695a
++endedAt: 2026-11-08T09:08:26.177Z
++usage:
++  inputTokens: 80103
++  outputTokens: 19189
++  costUsd: 0.03269
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-02-50-951Z_01a1ba65-6a47-77a0-b17d-05ea485f695a.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..100c13f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,45 @@
++status: ok
++summary: "Implemented plan-reviewer triage: plan-review prompts hydrate open
++  c-*/rm-* funnel items via concernsYaml, review suggestions are partitioned by
++  exact pre-step concern ids so triage ids never request a plan revision, and
++  deriveTaskState adds routed tech-debt or routed disposition=optional concern
++  summaries to debt. Added triage guidance to the plan-review step prompt and
++  registered concernsYaml. All four target tests pass, typecheck is clean, and
++  the full suite is green."
++target:
++  selectors:
++    - test/engine/plan-reviewer-triage.test.ts
++  expectRed:
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
++      plan-review with plan concerns and triages dismiss vs routed ids
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
++      architect-revise concerns and remarkable rm-* for the next review round
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
++      triage ids out of the plan fix loop so they never trigger a revision
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
++      debt from routed tech-debt concerns and routed optional dispositions only
++evidence:
++  - cd plugins/software-factory && bun test
++    test/engine/plan-reviewer-triage.test.ts -> 4 pass, 0 fail (all target
++    expectRed cases green).
++  - cd plugins/software-factory && bun run typecheck -> exit 0, no TypeScript
++    errors.
++  - cd plugins/software-factory && bun test -> 339 pass, 2 skip, 0 fail across
++    341 tests / 57 files.
++  - cd plugins/software-factory && bun test
++    test/engine/plan-reviewer-triage.test.ts test/engine/concerns-funnel.test.ts
++    test/human-involvement-config.test.ts -> 37 pass, 0 fail.
++  - git diff --check -> exit 0 (no whitespace errors); working tree only
++    contains the five intended production files.
++concerns:
++  - Hydration includes open concerns and remarkable decisions only;
++    dismissed/routed artifacts are intentionally omitted from plan-review
++    rounds.
++  - Plan-review record replay behavior was unchanged; the exact-id snapshot is
++    taken per round before the reviewer call, mirroring step-runner ingestion.
++notes: Changed src/core/concerns.ts (listConcerns/listOpenConcerns refactor,
++  listConcernIds, hydrateConcernsYaml), src/core/flows/iteration.ts (per-round
++  hydration + partition before fix detection), src/core/derive/task.ts (routed
++  concern debt predicate), src/core/prompt-vars.ts and
++  agents/steps/plan-review.md (concernsYaml registration and prompt section). No
++  test files were modified.
+diff --git a/plugins/software-factory/agents/steps/plan-review.md b/plugins/software-factory/agents/steps/plan-review.md
+index e468f6a..0353bf4 100644
+--- a/plugins/software-factory/agents/steps/plan-review.md
++++ b/plugins/software-factory/agents/steps/plan-review.md
+@@ -12,6 +12,7 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
+   - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
+   - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
+ - Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
++- Concern triage: ids in Open Concerns are pre-existing concerns/decisions, not plan findings. Re-emit their exact id in `suggestions`; `dismiss` (with `detail`) dismisses, every other allowed disposition routes it. Triage ids never request a plan revision.
+ 
+ ## Dispositions Criteria
+ {{dispositionsCriteria}}
+@@ -27,3 +28,6 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
+ 
+ ## Limits
+ {{limits}}
++
++## Open Concerns
++{{concernsYaml}}
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index c1e8f80..b736d11 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -1,6 +1,7 @@
+ import fs from "node:fs";
+ import path from "node:path";
+ import { createHash } from "node:crypto";
++import yaml from "yaml";
+ import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+ import type { Repo } from "./git/repo.js";
+ import { commitAll } from "./git/commit.js";
+@@ -105,8 +106,8 @@ export async function aggregateConcerns(
+   return stored;
+ }
+ 
+-/** Returns open concerns ordered by creation time then id. */
+-export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++/** Returns every stored concern artifact, ordered by creation time then id. */
++export async function listConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+   const dir = dirOf(taskDir);
+   let names: string[];
+   try { names = await fs.promises.readdir(dir); } catch (err: any) {
+@@ -117,10 +118,49 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
+     try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
+   }));
+   return records
+-    .filter((r): r is StoredConcernArtifact => r?.status === "open" && typeof r?.kind === "string")
++    .filter((r): r is StoredConcernArtifact => typeof r?.kind === "string")
+     .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
+ }
+ 
++/** Returns open concerns ordered by creation time then id. */
++export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++  return (await listConcerns(taskDir)).filter((r) => r.status === "open");
++}
++
++/** Returns every stored concern/remarkable id for exact-id triage partitioning. */
++export async function listConcernIds(taskDir: string): Promise<string[]> {
++  const dir = dirOf(taskDir);
++  try {
++    return (await fs.promises.readdir(dir))
++      .filter((name) => name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length));
++  } catch (err: any) {
++    if (err?.code === "ENOENT") return [];
++    throw err;
++  }
++}
++
++/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
++export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
++  const dir = dirOf(taskDir);
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return "[]";
++    throw err;
++  }
++  const items = await Promise.all(
++    names
++      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
++      .map(async (name) => {
++        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++      })
++  );
++  const open = items
++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
++  return open.length ? yaml.stringify(open).trimEnd() : "[]";
++}
++
+ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+   const updated = await locks.runExclusive(ctx.taskDir, async () => {
+diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
+index e7e89b1..7128367 100644
+--- a/plugins/software-factory/src/core/derive/task.ts
++++ b/plugins/software-factory/src/core/derive/task.ts
+@@ -16,6 +16,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
+ import { deriveItemState, type DerivedItemState } from "./item.js";
+ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
+ import { BudgetTracker } from "../budget.js";
++import { listConcerns } from "../concerns.js";
+ import { git } from "../git/exec.js";
+ import { isAncestor } from "../git/commit.js";
+ 
+@@ -190,6 +191,12 @@ export async function deriveTaskState(opts: {
+       }
+     }
+   }
++  // From concerns: routed tech-debt, or any routed concern dispositioned optional
++  for (const concern of await listConcerns(taskDir)) {
++    if (concern.status === "routed" && (concern.kind === "tech-debt" || concern.disposition === "optional")) {
++      debtSet.add(concern.summary);
++    }
++  }
+   // From review suggestions with disposition optional
+   for (const it of items) {
+     for (const rec of it.records) {
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 6c5e013..58b8bd6 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -28,6 +28,11 @@ import { refreshStateYaml } from "../derive/task.js";
+ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++import {
++  hydrateConcernsYaml,
++  listConcernIds,
++  partitionSuggestions,
++} from "../concerns.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -436,6 +441,10 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     const reviewFingerprints: string[] = [];
+ 
+     while (reviewRound <= maxPlanReviewRounds) {
++    // Triage ids are those that existed before this review round; capturing
++    // them here mirrors the step-runner exact-id partition.
++    const knownConcernIds = await listConcernIds(taskDir);
++    const concernsYaml = await hydrateConcernsYaml(taskDir);
+     // Check if review round record already exists
+     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
+     const revStepRes = await runAgentStep({
+@@ -457,6 +466,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         plan: JSON.stringify(plan, null, 2),
+         intent: intentText,
+         context: contextYaml,
++        concernsYaml,
+         limits: JSON.stringify(limits, null, 2),
+         dispositionsCriteria: formatDispositionsSection(
+           loadCriteriaBundle(pipeline.criteria).dispositions,
+@@ -483,7 +493,13 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     }
+ 
+     const revOutput = revStepRes.output as ReviewArtifact | undefined;
+-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
++    // Triage ids are exact-id concern/remarkable decisions, not plan findings;
++    // they never request a revision or influence approval.
++    const { findings } = partitionSuggestions(
++      revOutput?.suggestions ?? [],
++      knownConcernIds
++    );
++    const fixSuggestions = findings.filter((s) => s.disposition === "fix");
+ 
+     if (!fixSuggestions || fixSuggestions.length === 0) {
+       break; // Plan approved!
+diff --git a/plugins/software-factory/src/core/prompt-vars.ts b/plugins/software-factory/src/core/prompt-vars.ts
+index 991d946..f6d9f8a 100644
+--- a/plugins/software-factory/src/core/prompt-vars.ts
++++ b/plugins/software-factory/src/core/prompt-vars.ts
+@@ -159,8 +159,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
+   "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
+   "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
+-  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
++  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
++  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+ 
+   // System fragments
+   "system/steer-classify": [],
+diff --git a/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+new file mode 100644
+index 0000000..301c563
+--- /dev/null
++++ b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+@@ -0,0 +1,477 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runIteration } from "../../src/core/flows/iteration.js";
++import { deriveTaskState } from "../../src/core/derive/task.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import { concernFingerprint } from "../../src/core/concerns.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Plan-reviewer triage (docs/factory.v2.md §18; m2-triage-modes).
++ *
++ * Architect plan/revise output feeds the taskWt concern store (concerns[] and
++ * remarkable[]), steps/plan-review is hydrated with the open concerns YAML,
++ * and the plan reviewer triages those exact ids with the same vocabulary as
++ * the item reviewer: `dismiss` (requires detail) keeps the file dismissed,
++ * every other disposition routes it. Triage ids never count as plan findings,
++ * so they neither request a plan revision nor influence approval.
++ */
++describe("Plan-reviewer triage", () => {
++  const ORCH = ".factory";
++  const TASK = "plan-reviewer-triage";
++
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskDir: string;
++  let taskWt: string;
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
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Plan reviewer triage\n", "utf8");
++    tmpRepo.commit("add plan-reviewer triage task");
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
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
++      limits: { maxPlanReviewRounds: 2 },
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
++  function planData(extra: Record<string, unknown> = {}) {
++    return {
++      iteration: 1,
++      milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
++      itemOutlines: [],
++      ...extra,
++    };
++  }
++
++  function concernsDir(): string {
++    return path.join(taskDir, "concerns");
++  }
++
++  function concernIds(prefix: "c-" | "rm-"): string[] {
++    const dir = concernsDir();
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  async function storedConcern(id: string): Promise<StoredConcernArtifact> {
++    return readYaml<StoredConcernArtifact>(path.join(concernsDir(), `${id}.yaml`));
++  }
++
++  async function runPlanReview(opts: {
++    harness: FakeHarness;
++    planStep?: Record<string, unknown>;
++    planReview: (run: { prompt: string }) => Record<string, unknown>;
++  }): Promise<{ prompts: string[]; result: Awaited<ReturnType<typeof runIteration>> }> {
++    const harness = opts.harness;
++    harness.scriptOutcome(
++      `${TASK}/runs/architect-plan-1#a1`,
++      { ok: true, data: opts.planStep ?? planData() }
++    );
++
++    const hydratedPrompts: string[] = [];
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, (run) => {
++      hydratedPrompts.push(run.prompt);
++      return { ok: true, data: opts.planReview(run) };
++    });
++
++    // Stops the iteration right after the plan-review loop: empty PM edits are
++    // rejected without touching waves or item worktrees.
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    const result = await runIteration({
++      task: TASK,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++    return { prompts: hydratedPrompts, result };
++  }
++
++  function runLabels(harness: FakeHarness): string[] {
++    return harness.calls
++      .filter((call): call is Extract<(typeof harness.calls)[number], { type: "run" }> => call.type === "run")
++      .map((call) => call.run.label);
++  }
++
++  it("hydrates plan-review with plan concerns and triages dismiss vs routed ids", async () => {
++    const harness = new FakeHarness();
++    const dismissedId = concernFingerprint({
++      kind: "tech-debt",
++      summary: "Plan retry glue duplicates the adapter",
++      affects: ["m1"],
++    });
++    const routedId = concernFingerprint({
++      kind: "risk",
++      summary: "Milestone boundary depends on an unbuilt adapter",
++      affects: ["m1"],
++    });
++
++    const reviewRun = await runPlanReview({
++      harness,
++      planStep: planData({
++        concerns: [
++          {
++            kind: "tech-debt",
++            summary: "Plan retry glue duplicates the adapter",
++            detail: "Extract one shared retry helper",
++            severity: "medium",
++            affects: ["m1"],
++          },
++          {
++            kind: "risk",
++            summary: "Milestone boundary depends on an unbuilt adapter",
++            detail: "Risk of imaginary interfaces",
++            severity: "high",
++            affects: ["m1"],
++          },
++        ],
++        remarkable: [
++          {
++            chosen: "File-per-concern YAML store",
++            alternatives: ["One aggregate file", "Embed in state.yaml"],
++            why: "conflict-free task worktree commits",
++          },
++        ],
++      }),
++      planReview: () => {
++        const [rmId] = concernIds("rm-");
++        return {
++          status: "approved",
++          summary: "Plan and concern triage",
++          suggestions: [
++            {
++              id: dismissedId,
++              disposition: "dismiss",
++              summary: "Duplicate of the shared retry helper",
++              detail: "covered by the plan ADR",
++            },
++            { id: routedId, disposition: "optional", summary: "Track as debt" },
++            {
++              id: rmId,
++              disposition: "dismiss",
++              summary: "Standard storage choice",
++              detail: "documented alternative is enough",
++            },
++            { id: "s-not-a-concern", disposition: "optional", summary: "Ordinary finding" },
++          ],
++        };
++      },
++    });
++
++    // Aggregation: architect plan concerns and remarkable decisions reach taskWt.
++    expect(concernIds("c-")).toEqual([dismissedId, routedId].sort());
++    expect(concernIds("rm-")).toHaveLength(1);
++
++    // Same vocabulary as the item reviewer: dismiss keeps the reason, other
++    // dispositions route, and ordinary finding ids are ignored.
++    const dismissed = await storedConcern(dismissedId);
++    expect(dismissed.status).toBe("dismissed");
++    expect(dismissed.dismissReason).toBe("covered by the plan ADR");
++
++    const routed = await storedConcern(routedId);
++    expect(routed.status).toBe("routed");
++    expect(routed.disposition).toBe("optional");
++
++    const [rmId] = concernIds("rm-");
++    const remarkable = await readYaml<Record<string, any>>(
++      path.join(concernsDir(), `${rmId}.yaml`)
++    );
++    expect(remarkable.status).toBe("dismissed");
++    expect(remarkable.dismissReason).toBe("documented alternative is enough");
++    expect(fs.existsSync(path.join(concernsDir(), "s-not-a-concern.yaml"))).toBe(false);
++
++    // Hydration: the plan reviewer sees every open concern id before triage.
++    expect(reviewRun.prompts).toHaveLength(1);
++    for (const id of [dismissedId, routedId, ...concernIds("rm-")]) {
++      expect(reviewRun.prompts[0]).toContain(id);
++    }
++  });
++
++  it("aggregates architect-revise concerns and remarkable rm-* for the next review round", async () => {
++    const harness = new FakeHarness();
++    const reviseConcernId = concernFingerprint({
++      kind: "assumption",
++      summary: "Plan assumes an in-memory queue survives restart",
++      affects: ["m1"],
++    });
++    let secondPrompt = "";
++
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
++      ok: true,
++      data: planData(),
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: {
++        status: "changes_requested",
++        summary: "Plan needs a durability story",
++        suggestions: [
++          { id: "s-plan-gap", disposition: "fix", summary: "Add durability to the plan" },
++        ],
++      },
++    });
++    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, {
++      ok: true,
++      data: planData({
++        concerns: [
++          {
++            kind: "assumption",
++            summary: "Plan assumes an in-memory queue survives restart",
++            detail: "Persist the queue before acknowledging",
++            severity: "high",
++            affects: ["m1"],
++          },
++        ],
++        remarkable: [
++          {
++            chosen: "Lease-based queue",
++            alternatives: ["In-memory queue", "External broker"],
++            why: "restart safety without a new dependency",
++          },
++        ],
++      }),
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, (run) => {
++      secondPrompt = run.prompt;
++      const [rmId] = concernIds("rm-");
++      return {
++        ok: true,
++        data: {
++          status: "approved",
++          summary: "Revised plan approved",
++          suggestions: [
++            { id: reviseConcernId, disposition: "architect", summary: "Carry to architect" },
++            { id: rmId, disposition: "optional", summary: "Keep as debt" },
++          ],
++        },
++      };
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    await runIteration({
++      task: TASK,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++
++    // Revise producer output aggregated into the same store as the plan output.
++    const reviseConcern = await storedConcern(reviseConcernId);
++    expect(reviseConcern.source.agent).toBe("architect");
++    expect(reviseConcern.source.step).toBe("architect-revise-1-1");
++    const rmId = concernIds("rm-")[0]!;
++    expect(rmId).toMatch(/^rm-[0-9a-f]{10}$/);
++
++    // Non-dismiss dispositions route; the remarkable file routes too.
++    const routedConcern = await storedConcern(reviseConcernId);
++    expect(routedConcern.status).toBe("routed");
++    expect(routedConcern.disposition).toBe("architect");
++    const remarkable = await readYaml<Record<string, any>>(
++      path.join(concernsDir(), `${rmId}.yaml`)
++    );
++    expect(remarkable.status).toBe("routed");
++    expect(remarkable.disposition).toBe("optional");
++
++    // Round two is hydrated with the revise concern and remarkable id.
++    expect(secondPrompt).toContain(reviseConcernId);
++    expect(secondPrompt).toContain(rmId);
++  });
++
++  it("keeps triage ids out of the plan fix loop so they never trigger a revision", async () => {
++    const harness = new FakeHarness();
++    const concernId = concernFingerprint({
++      kind: "tech-debt",
++      summary: "Plan duplicates the retry helper",
++      affects: ["m1"],
++    });
++    let revised = false;
++
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
++      ok: true,
++      data: planData({
++        concerns: [
++          {
++            kind: "tech-debt",
++            summary: "Plan duplicates the retry helper",
++            detail: "Use one shared helper",
++            severity: "medium",
++            affects: ["m1"],
++          },
++        ],
++      }),
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: {
++        status: "changes_requested",
++        summary: "Triage only",
++        suggestions: [
++          { id: concernId, disposition: "fix", summary: "Resolve the plan debt" },
++        ],
++      },
++    });
++    // Scripted so a regression that revises is observable rather than crashing.
++    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, () => {
++      revised = true;
++      return { ok: true, data: planData() };
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Second round", suggestions: [] },
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    await runIteration({
++      task: TASK,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++
++    const triaged = await storedConcern(concernId);
++    expect(triaged.status).toBe("routed");
++    expect(triaged.disposition).toBe("fix");
++
++    expect(revised).toBe(false);
++    const labels = runLabels(harness);
++    expect(labels).not.toContain(`${TASK}/runs/architect-revise-1-1#a1`);
++    expect(labels).not.toContain(`${TASK}/runs/plan-review-1-2#a1`);
++  });
++
++  it("derives debt from routed tech-debt concerns and routed optional dispositions only", async () => {
++    const dir = concernsDir();
++    const stored = (
++      id: string,
++      overrides: Partial<StoredConcernArtifact>
++    ): StoredConcernArtifact => ({
++      id,
++      kind: "risk",
++      summary: `Concern ${id}`,
++      detail: `Detail ${id}`,
++      severity: "medium",
++      status: "open",
++      source: { record: "001-plan-review-a1", agent: "plan-reviewer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    });
++
++    await writeYamlAtomic(
++      path.join(dir, "c-debtrouted.yaml"),
++      stored("c-debtrouted", {
++        kind: "tech-debt",
++        summary: "Plan duplicated the retry helper",
++        status: "routed",
++      })
++    );
++    await writeYamlAtomic(
++      path.join(dir, "c-optionalrouted.yaml"),
++      stored("c-optionalrouted", {
++        kind: "risk",
++        summary: "Defer contract hardening",
++        status: "routed",
++        disposition: "optional",
++      })
++    );
++    await writeYamlAtomic(
++      path.join(dir, "c-debtopen.yaml"),
++      stored("c-debtopen", {
++        kind: "tech-debt",
++        summary: "Open debt stays a concern",
++        status: "open",
++      })
++    );
++    await writeYamlAtomic(
++      path.join(dir, "c-optionaldismissed.yaml"),
++      stored("c-optionaldismissed", {
++        kind: "risk",
++        summary: "Dismissed optional is not debt",
++        status: "dismissed",
++        disposition: "dismiss",
++        dismissReason: "not worth tracking",
++      })
++    );
++
++    const state = await deriveTaskState({
++      taskDir,
++      task: TASK,
++      taskWt,
++      pipeline,
++      project,
++    });
++
++    expect(state.debt).toContain("Plan duplicated the retry helper");
++    expect(state.debt).toContain("Defer contract hardening");
++    expect(state.debt).not.toContain("Open debt stays a concern");
++    expect(state.debt).not.toContain("Dismissed optional is not debt");
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
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..91e38e9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T09:16:58.401Z
+session: 01a1ba72-6564-7206-88cb-2915042c77b5
+endedAt: 2026-11-08T09:29:42.588Z
+usage:
+  inputTokens: 47702
+  outputTokens: 31281
+  costUsd: 0.012255
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-17-01-668Z_01a1ba72-6564-7206-88cb-2915042c77b5.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..f259ca6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,34 @@
+status: changes_requested
+summary: Target 4 pass, typecheck clean, no weakening; debt predicate test
+  allows false pass
+suggestions:
+  - id: debt-predicate-missing-negative
+    disposition: fix
+    summary: Debt test omits routed non-tech-debt non-optional negative case
+    detail: "Test4 has 2 positives (routed tech-debt, routed optional) and 2
+      negatives (open, dismissed) but no routed risk/architect fixture.
+      Predicate status==routed alone would pass all 4, so OR clause (kind
+      tech-debt OR disposition optional) unverified. Add c- fixture kind risk
+      status routed disposition architect/fix and assert not in debt.
+      Independent runs: target 4 pass, neighbors 37 pass, typecheck exit 0."
+    location:
+      file: plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+      line: 410
+  - id: plan-review-matrix-stale
+    disposition: optional
+    summary: Human-involvement matrix omits new concernsYaml for plan-review
+    detail: KNOWN_VARS now includes concernsYaml for plan-review but FRAGMENT_MATRIX
+      still lists only humanInvolvementCriteria. Passes via arrayContaining but
+      docs drift. Update matrix to include concernsYaml.
+    location:
+      file: plugins/software-factory/test/human-involvement-config.test.ts
+      line: 64
+  - id: hydration-open-only-unverified
+    disposition: optional
+    summary: Hydration open-only filtering not asserted across rounds
+    detail: hydrateConcernsYaml filters status open but tests only assert inclusion
+      of pre-triage ids; hydrate-all would still pass. Consider asserting
+      round-2 prompt excludes previously dismissed/routed ids.
+    location:
+      file: plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+      line: 338
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/checks.yaml
new file mode 100644
index 0000000..8e9fcf9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/checks.yaml
@@ -0,0 +1,82 @@
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
+        durationMs: 3500
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 70150
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-rXnEie/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3420199
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3420199
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3420199
+
+           339 pass
+           2 skip
+           0 fail
+           1539 expect() calls
+          Ran 341 tests across 57 files. [70.02s]
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
+        test/engine/plan-reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794130673389-qc7784ll6sq.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Plan-reviewer triage.hydrates plan-review with plan concerns and
+          triages dismiss vs routed ids
+        - Plan-reviewer triage.aggregates architect-revise concerns and
+          remarkable rm-* for the next review round
+        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
+          never trigger a revision
+        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
+          routed optional dispositions only
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 79/300 production lines changed"
+    details:
+      changedLines:
+        added: 73
+        deleted: 6
+        total: 79
+        files:
+          - plugins/software-factory/agents/steps/plan-review.md
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/derive/task.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/prompt-vars.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/input.md
new file mode 100644
index 0000000..472469b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/input.md
@@ -0,0 +1,2382 @@
+# Step: Fix-Round
+
+## Goal
+Address reviewer suggestions and gate failures from the previous development attempt. Deliver focused corrections resolving reported defects.
+
+## Rules
+- Defect resolution: resolve all suggestions marked with disposition `fix`. Consider `optional` suggestions only if straightforward and safe.
+- Delta focus: keep changes tightly scoped to reported concerns. Do not introduce unrelated modifications or refactors.
+- Non-regression: ensure all previously green tests remain passing and all project gates pass cleanly.
+- Updated evidence: yield `status: ok` with updated `evidence` (array of strings) documenting personal verification of each corrected defect per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "plan-reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Plan-reviewer triage",
+  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
+  "outlineRef": "plan-reviewer-triage-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 7,
+  "deps": [
+    "concerns-store-v2"
+  ]
+}
+
+## Review Feedback
+- [FIX] Debt test omits routed non-tech-debt non-optional negative case: Test4 has 2 positives (routed tech-debt, routed optional) and 2 negatives (open, dismissed) but no routed risk/architect fixture. Predicate status==routed alone would pass all 4, so OR clause (kind tech-debt OR disposition optional) unverified. Add c- fixture kind risk status routed disposition architect/fix and assert not in debt. Independent runs: target 4 pass, neighbors 37 pass, typecheck exit 0. (plugins/software-factory/test/engine/plan-reviewer-triage.test.ts)
+
+- [OPTIONAL] Human-involvement matrix omits new concernsYaml for plan-review: KNOWN_VARS now includes concernsYaml for plan-review but FRAGMENT_MATRIX still lists only humanInvolvementCriteria. Passes via arrayContaining but docs drift. Update matrix to include concernsYaml.
+- [OPTIONAL] Hydration open-only filtering not asserted across rounds: hydrateConcernsYaml filters status open but tests only assert inclusion of pre-triage ids; hydrate-all would still pass. Consider asserting round-2 prompt excludes previously dismissed/routed ids.
+
+## Check Results
+
+
+## Current Diff
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..1ce4357
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,29 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 4 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794128305653-4zayyjpf8nr.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
++          triages dismiss vs routed ids
++        - Plan-reviewer triage.aggregates architect-revise concerns and
++          remarkable rm-* for the next review round
++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
++          never trigger a revision
++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
++          routed optional dispositions only
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..e504a9f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,52 @@
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
++  "slug": "plan-reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Plan-reviewer triage",
++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
++  "outlineRef": "plan-reviewer-triage-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 7,
++  "deps": [
++    "concerns-store-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..9a79973
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T08:48:47.458Z
++session: 01a1ba58-8d95-741b-9a02-ce16c53b985d
++endedAt: 2026-11-08T08:58:27.274Z
++usage:
++  inputTokens: 152543
++  outputTokens: 47761
++  costUsd: 0.074561
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T08-48-48-021Z_01a1ba58-8d95-741b-9a02-ce16c53b985d
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..39a219b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,57 @@
++status: ok
++summary: "Authored
++  plugins/software-factory/test/engine/plan-reviewer-triage.test.ts with four
++  behavior specs for plan-reviewer triage: plan/revise concerns + remarkable
++  rm-* aggregation with steps/plan-review concernsYaml hydration (dismiss vs
++  routed, rm triage), triage ids excluded from the plan fix loop/approval, and
++  the routed tech-debt / routed-optional debt predicate via deriveTaskState. All
++  four specs fail red with assertion failures against current production;
++  typecheck passes; the full suite reports 335 pass, 2 skip, 4 fail (only the
++  new specs)."
++target:
++  selectors:
++    - test/engine/plan-reviewer-triage.test.ts
++  expectRed:
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
++      plan-review with plan concerns and triages dismiss vs routed ids
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
++      architect-revise concerns and remarkable rm-* for the next review round
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
++      triage ids out of the plan fix loop so they never trigger a revision
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
++      debt from routed tech-debt concerns and routed optional dispositions only
++evidence:
++  - '`cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/plan-reviewer-triage.test.ts --reporter=junit
++    --reporter-outfile=/tmp/junit-final.xml` -> 0 pass, 4 fail; JUnit shows all
++    four testcases as <failure type="AssertionError">, no
++    <error>/collection/import failures.'
++  - "Ran the repo's own target-red check (`runCheck(\"target-red\", ...)`) with
++    the exact selectors/expectRed above and the committed infra.yaml runner:
++    ok=true, summary \"target-red passed: all 4 expected tests failed with
++    assertion failures\"."
++  - "`cd plugins/software-factory && TMPDIR=/tmp bun run typecheck` -> exit 0."
++  - "`cd plugins/software-factory && TMPDIR=/tmp bun test` -> 335 pass, 2 skip,
++    4 fail; the only failures are the four new plan-reviewer-triage specs,
++    proving runner/fixtures and no baseline regressions."
++  - "`git status --short` -> only the new test file
++    `plugins/software-factory/test/engine/plan-reviewer-triage.test.ts`; no
++    production code touched."
++concerns:
++  - Plan/revise concern+remarkable aggregation already works through the generic
++    runAgentStep ingestStepConcerns seam; the red assertions come from missing
++    plan-review concernsYaml hydration, triage-id exclusion from the plan fix
++    loop, and concern-backed debt derivation.
++  - The tests drive runIteration with FakeHarness and deliberately stop at
++    pm-edits with an empty items payload, so assertions target plan-review side
++    effects without needing wave/item scripting.
++  - Hydration assertions only require the exact concern/rm ids to appear in the
++    rendered plan-review prompt, leaving the concrete YAML layout to the
++    implementation while enforcing id/kind/severity/summary visibility
++    indirectly.
++notes: "Implementation targets: hydrate steps/plan-review in iteration.ts (and
++  add `{{concernsYaml}}` + KNOWN_VARS via concerns.ts formatting), split
++  plan-review suggestions with partitionSuggestions and filter triage ids out of
++  the fixSuggestions/approval branch, and make deriveTaskState debt include
++  routed tech-debt or routed disposition=optional concern files. Test-first
++  scope only; production code remains untouched."
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..fc643a5
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,82 @@
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
++        durationMs: 5059
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 78549
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-VDBA0F/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
++
++           339 pass
++           2 skip
++           0 fail
++           1534 expect() calls
++          Ran 341 tests across 57 files. [78.33s]
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
++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794128904754-1360m9dvn42p.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
++          triages dismiss vs routed ids
++        - Plan-reviewer triage.aggregates architect-revise concerns and
++          remarkable rm-* for the next review round
++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
++          never trigger a revision
++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
++          routed optional dispositions only
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 79/300 production lines changed"
++    details:
++      changedLines:
++        added: 73
++        deleted: 6
++        total: 79
++        files:
++          - plugins/software-factory/agents/steps/plan-review.md
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/derive/task.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/prompt-vars.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..5319a3b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,61 @@
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
++  "slug": "plan-reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Plan-reviewer triage",
++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
++  "outlineRef": "plan-reviewer-triage-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 7,
++  "deps": [
++    "concerns-store-v2"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/plan-reviewer-triage.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates plan-review with plan concerns and triages dismiss vs routed ids",
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates architect-revise concerns and remarkable rm-* for the next review round",
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps triage ids out of the plan fix loop so they never trigger a revision",
++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives debt from routed tech-debt concerns and routed optional dispositions only"
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
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..0894abf
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T09:02:50.577Z
++session: 01a1ba65-6a47-77a0-b17d-05ea485f695a
++endedAt: 2026-11-08T09:08:26.177Z
++usage:
++  inputTokens: 80103
++  outputTokens: 19189
++  costUsd: 0.03269
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-02-50-951Z_01a1ba65-6a47-77a0-b17d-05ea485f695a.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..100c13f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,45 @@
++status: ok
++summary: "Implemented plan-reviewer triage: plan-review prompts hydrate open
++  c-*/rm-* funnel items via concernsYaml, review suggestions are partitioned by
++  exact pre-step concern ids so triage ids never request a plan revision, and
++  deriveTaskState adds routed tech-debt or routed disposition=optional concern
++  summaries to debt. Added triage guidance to the plan-review step prompt and
++  registered concernsYaml. All four target tests pass, typecheck is clean, and
++  the full suite is green."
++target:
++  selectors:
++    - test/engine/plan-reviewer-triage.test.ts
++  expectRed:
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
++      plan-review with plan concerns and triages dismiss vs routed ids
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
++      architect-revise concerns and remarkable rm-* for the next review round
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
++      triage ids out of the plan fix loop so they never trigger a revision
++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
++      debt from routed tech-debt concerns and routed optional dispositions only
++evidence:
++  - cd plugins/software-factory && bun test
++    test/engine/plan-reviewer-triage.test.ts -> 4 pass, 0 fail (all target
++    expectRed cases green).
++  - cd plugins/software-factory && bun run typecheck -> exit 0, no TypeScript
++    errors.
++  - cd plugins/software-factory && bun test -> 339 pass, 2 skip, 0 fail across
++    341 tests / 57 files.
++  - cd plugins/software-factory && bun test
++    test/engine/plan-reviewer-triage.test.ts test/engine/concerns-funnel.test.ts
++    test/human-involvement-config.test.ts -> 37 pass, 0 fail.
++  - git diff --check -> exit 0 (no whitespace errors); working tree only
++    contains the five intended production files.
++concerns:
++  - Hydration includes open concerns and remarkable decisions only;
++    dismissed/routed artifacts are intentionally omitted from plan-review
++    rounds.
++  - Plan-review record replay behavior was unchanged; the exact-id snapshot is
++    taken per round before the reviewer call, mirroring step-runner ingestion.
++notes: Changed src/core/concerns.ts (listConcerns/listOpenConcerns refactor,
++  listConcernIds, hydrateConcernsYaml), src/core/flows/iteration.ts (per-round
++  hydration + partition before fix detection), src/core/derive/task.ts (routed
++  concern debt predicate), src/core/prompt-vars.ts and
++  agents/steps/plan-review.md (concernsYaml registration and prompt section). No
++  test files were modified.
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..4f96526
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml
+@@ -0,0 +1,28 @@
++checks:
++  - id: red-test
++    status: pass
++    message: "red-test passed: all 4 tests fail when prod changes are restored to
++      test-first commit"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794129418477-qp6l5dique.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
++          triages dismiss vs routed ids
++        - Plan-reviewer triage.aggregates architect-revise concerns and
++          remarkable rm-* for the next review round
++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
++          never trigger a revision
++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
++          routed optional dispositions only
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..a659081
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/input.md
+@@ -0,0 +1,1146 @@
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
++  "slug": "plan-reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Plan-reviewer triage",
++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
++  "outlineRef": "plan-reviewer-triage-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 7,
++  "deps": [
++    "concerns-store-v2"
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
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..1ce4357
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,29 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+++      newProdFiles: []
+++      stubProdLines: 0
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 4 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794128305653-4zayyjpf8nr.xml
+++      junitCaseCount: 4
+++      junitCaseIds:
+++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
+++          triages dismiss vs routed ids
+++        - Plan-reviewer triage.aggregates architect-revise concerns and
+++          remarkable rm-* for the next review round
+++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
+++          never trigger a revision
+++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
+++          routed optional dispositions only
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..e504a9f
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,52 @@
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
+++  "slug": "plan-reviewer-triage-v2",
+++  "kind": "dev",
+++  "title": "Plan-reviewer triage",
+++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
+++  "outlineRef": "plan-reviewer-triage-v2",
+++  "milestone": "m2-triage-modes",
+++  "wave": 7,
+++  "deps": [
+++    "concerns-store-v2"
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
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..9a79973
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
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
+++startedAt: 2026-11-08T08:48:47.458Z
+++session: 01a1ba58-8d95-741b-9a02-ce16c53b985d
+++endedAt: 2026-11-08T08:58:27.274Z
+++usage:
+++  inputTokens: 152543
+++  outputTokens: 47761
+++  costUsd: 0.074561
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T08-48-48-021Z_01a1ba58-8d95-741b-9a02-ce16c53b985d
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..39a219b
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,57 @@
+++status: ok
+++summary: "Authored
+++  plugins/software-factory/test/engine/plan-reviewer-triage.test.ts with four
+++  behavior specs for plan-reviewer triage: plan/revise concerns + remarkable
+++  rm-* aggregation with steps/plan-review concernsYaml hydration (dismiss vs
+++  routed, rm triage), triage ids excluded from the plan fix loop/approval, and
+++  the routed tech-debt / routed-optional debt predicate via deriveTaskState. All
+++  four specs fail red with assertion failures against current production;
+++  typecheck passes; the full suite reports 335 pass, 2 skip, 4 fail (only the
+++  new specs)."
+++target:
+++  selectors:
+++    - test/engine/plan-reviewer-triage.test.ts
+++  expectRed:
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
+++      plan-review with plan concerns and triages dismiss vs routed ids
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
+++      architect-revise concerns and remarkable rm-* for the next review round
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
+++      triage ids out of the plan fix loop so they never trigger a revision
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
+++      debt from routed tech-debt concerns and routed optional dispositions only
+++evidence:
+++  - '`cd plugins/software-factory && TMPDIR=/tmp bun test
+++    test/engine/plan-reviewer-triage.test.ts --reporter=junit
+++    --reporter-outfile=/tmp/junit-final.xml` -> 0 pass, 4 fail; JUnit shows all
+++    four testcases as <failure type="AssertionError">, no
+++    <error>/collection/import failures.'
+++  - "Ran the repo's own target-red check (`runCheck(\"target-red\", ...)`) with
+++    the exact selectors/expectRed above and the committed infra.yaml runner:
+++    ok=true, summary \"target-red passed: all 4 expected tests failed with
+++    assertion failures\"."
+++  - "`cd plugins/software-factory && TMPDIR=/tmp bun run typecheck` -> exit 0."
+++  - "`cd plugins/software-factory && TMPDIR=/tmp bun test` -> 335 pass, 2 skip,
+++    4 fail; the only failures are the four new plan-reviewer-triage specs,
+++    proving runner/fixtures and no baseline regressions."
+++  - "`git status --short` -> only the new test file
+++    `plugins/software-factory/test/engine/plan-reviewer-triage.test.ts`; no
+++    production code touched."
+++concerns:
+++  - Plan/revise concern+remarkable aggregation already works through the generic
+++    runAgentStep ingestStepConcerns seam; the red assertions come from missing
+++    plan-review concernsYaml hydration, triage-id exclusion from the plan fix
+++    loop, and concern-backed debt derivation.
+++  - The tests drive runIteration with FakeHarness and deliberately stop at
+++    pm-edits with an empty items payload, so assertions target plan-review side
+++    effects without needing wave/item scripting.
+++  - Hydration assertions only require the exact concern/rm ids to appear in the
+++    rendered plan-review prompt, leaving the concrete YAML layout to the
+++    implementation while enforcing id/kind/severity/summary visibility
+++    indirectly.
+++notes: "Implementation targets: hydrate steps/plan-review in iteration.ts (and
+++  add `{{concernsYaml}}` + KNOWN_VARS via concerns.ts formatting), split
+++  plan-review suggestions with partitionSuggestions and filter triage ids out of
+++  the fixSuggestions/approval branch, and make deriveTaskState debt include
+++  routed tech-debt or routed disposition=optional concern files. Test-first
+++  scope only; production code remains untouched."
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..fc643a5
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,82 @@
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
+++        durationMs: 5059
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 78549
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-VDBA0F/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3172199
+++
+++           339 pass
+++           2 skip
+++           0 fail
+++           1534 expect() calls
+++          Ran 341 tests across 57 files. [78.33s]
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
+++        test/engine/plan-reviewer-triage.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794128904754-1360m9dvn42p.xml
+++      junitCaseCount: 4
+++      junitCaseIds:
+++        - Plan-reviewer triage.hydrates plan-review with plan concerns and
+++          triages dismiss vs routed ids
+++        - Plan-reviewer triage.aggregates architect-revise concerns and
+++          remarkable rm-* for the next review round
+++        - Plan-reviewer triage.keeps triage ids out of the plan fix loop so they
+++          never trigger a revision
+++        - Plan-reviewer triage.derives debt from routed tech-debt concerns and
+++          routed optional dispositions only
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 79/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 73
+++        deleted: 6
+++        total: 79
+++        files:
+++          - plugins/software-factory/agents/steps/plan-review.md
+++          - plugins/software-factory/src/core/concerns.ts
+++          - plugins/software-factory/src/core/derive/task.ts
+++          - plugins/software-factory/src/core/flows/iteration.ts
+++          - plugins/software-factory/src/core/prompt-vars.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..5319a3b
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,61 @@
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
+++  "slug": "plan-reviewer-triage-v2",
+++  "kind": "dev",
+++  "title": "Plan-reviewer triage",
+++  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
+++  "outlineRef": "plan-reviewer-triage-v2",
+++  "milestone": "m2-triage-modes",
+++  "wave": 7,
+++  "deps": [
+++    "concerns-store-v2"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/plan-reviewer-triage.test.ts"
+++  ],
+++  "expectRed": [
+++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates plan-review with plan concerns and triages dismiss vs routed ids",
+++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates architect-revise concerns and remarkable rm-* for the next review round",
+++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps triage ids out of the plan fix loop so they never trigger a revision",
+++    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives debt from routed tech-debt concerns and routed optional dispositions only"
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
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..0894abf
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
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
+++startedAt: 2026-11-08T09:02:50.577Z
+++session: 01a1ba65-6a47-77a0-b17d-05ea485f695a
+++endedAt: 2026-11-08T09:08:26.177Z
+++usage:
+++  inputTokens: 80103
+++  outputTokens: 19189
+++  costUsd: 0.03269
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-02-50-951Z_01a1ba65-6a47-77a0-b17d-05ea485f695a.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..100c13f
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,45 @@
+++status: ok
+++summary: "Implemented plan-reviewer triage: plan-review prompts hydrate open
+++  c-*/rm-* funnel items via concernsYaml, review suggestions are partitioned by
+++  exact pre-step concern ids so triage ids never request a plan revision, and
+++  deriveTaskState adds routed tech-debt or routed disposition=optional concern
+++  summaries to debt. Added triage guidance to the plan-review step prompt and
+++  registered concernsYaml. All four target tests pass, typecheck is clean, and
+++  the full suite is green."
+++target:
+++  selectors:
+++    - test/engine/plan-reviewer-triage.test.ts
+++  expectRed:
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates
+++      plan-review with plan concerns and triages dismiss vs routed ids
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates
+++      architect-revise concerns and remarkable rm-* for the next review round
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps
+++      triage ids out of the plan fix loop so they never trigger a revision
+++    - test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives
+++      debt from routed tech-debt concerns and routed optional dispositions only
+++evidence:
+++  - cd plugins/software-factory && bun test
+++    test/engine/plan-reviewer-triage.test.ts -> 4 pass, 0 fail (all target
+++    expectRed cases green).
+++  - cd plugins/software-factory && bun run typecheck -> exit 0, no TypeScript
+++    errors.
+++  - cd plugins/software-factory && bun test -> 339 pass, 2 skip, 0 fail across
+++    341 tests / 57 files.
+++  - cd plugins/software-factory && bun test
+++    test/engine/plan-reviewer-triage.test.ts test/engine/concerns-funnel.test.ts
+++    test/human-involvement-config.test.ts -> 37 pass, 0 fail.
+++  - git diff --check -> exit 0 (no whitespace errors); working tree only
+++    contains the five intended production files.
+++concerns:
+++  - Hydration includes open concerns and remarkable decisions only;
+++    dismissed/routed artifacts are intentionally omitted from plan-review
+++    rounds.
+++  - Plan-review record replay behavior was unchanged; the exact-id snapshot is
+++    taken per round before the reviewer call, mirroring step-runner ingestion.
+++notes: Changed src/core/concerns.ts (listConcerns/listOpenConcerns refactor,
+++  listConcernIds, hydrateConcernsYaml), src/core/flows/iteration.ts (per-round
+++  hydration + partition before fix detection), src/core/derive/task.ts (routed
+++  concern debt predicate), src/core/prompt-vars.ts and
+++  agents/steps/plan-review.md (concernsYaml registration and prompt section). No
+++  test files were modified.
++diff --git a/plugins/software-factory/agents/steps/plan-review.md b/plugins/software-factory/agents/steps/plan-review.md
++index e468f6a..0353bf4 100644
++--- a/plugins/software-factory/agents/steps/plan-review.md
+++++ b/plugins/software-factory/agents/steps/plan-review.md
++@@ -12,6 +12,7 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
++   - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
++   - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
++ - Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+++- Concern triage: ids in Open Concerns are pre-existing concerns/decisions, not plan findings. Re-emit their exact id in `suggestions`; `dismiss` (with `detail`) dismisses, every other allowed disposition routes it. Triage ids never request a plan revision.
++ 
++ ## Dispositions Criteria
++ {{dispositionsCriteria}}
++@@ -27,3 +28,6 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
++ 
++ ## Limits
++ {{limits}}
+++
+++## Open Concerns
+++{{concernsYaml}}
++diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
++index c1e8f80..b736d11 100644
++--- a/plugins/software-factory/src/core/concerns.ts
+++++ b/plugins/software-factory/src/core/concerns.ts
++@@ -1,6 +1,7 @@
++ import fs from "node:fs";
++ import path from "node:path";
++ import { createHash } from "node:crypto";
+++import yaml from "yaml";
++ import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++ import type { Repo } from "./git/repo.js";
++ import { commitAll } from "./git/commit.js";
++@@ -105,8 +106,8 @@ export async function aggregateConcerns(
++   return stored;
++ }
++ 
++-/** Returns open concerns ordered by creation time then id. */
++-export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+++/** Returns every stored concern artifact, ordered by creation time then id. */
+++export async function listConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++   const dir = dirOf(taskDir);
++   let names: string[];
++   try { names = await fs.promises.readdir(dir); } catch (err: any) {
++@@ -117,10 +118,49 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
++     try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
++   }));
++   return records
++-    .filter((r): r is StoredConcernArtifact => r?.status === "open" && typeof r?.kind === "string")
+++    .filter((r): r is StoredConcernArtifact => typeof r?.kind === "string")
++     .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
++ }
++ 
+++/** Returns open concerns ordered by creation time then id. */
+++export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+++  return (await listConcerns(taskDir)).filter((r) => r.status === "open");
+++}
+++
+++/** Returns every stored concern/remarkable id for exact-id triage partitioning. */
+++export async function listConcernIds(taskDir: string): Promise<string[]> {
+++  const dir = dirOf(taskDir);
+++  try {
+++    return (await fs.promises.readdir(dir))
+++      .filter((name) => name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length));
+++  } catch (err: any) {
+++    if (err?.code === "ENOENT") return [];
+++    throw err;
+++  }
+++}
+++
+++/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
+++export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
+++  const dir = dirOf(taskDir);
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT") return "[]";
+++    throw err;
+++  }
+++  const items = await Promise.all(
+++    names
+++      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
+++      .map(async (name) => {
+++        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+++      })
+++  );
+++  const open = items
+++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
+++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
+++  return open.length ? yaml.stringify(open).trimEnd() : "[]";
+++}
+++
++ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
++   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++   const updated = await locks.runExclusive(ctx.taskDir, async () => {
++diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
++index e7e89b1..7128367 100644
++--- a/plugins/software-factory/src/core/derive/task.ts
+++++ b/plugins/software-factory/src/core/derive/task.ts
++@@ -16,6 +16,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
++ import { deriveItemState, type DerivedItemState } from "./item.js";
++ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
++ import { BudgetTracker } from "../budget.js";
+++import { listConcerns } from "../concerns.js";
++ import { git } from "../git/exec.js";
++ import { isAncestor } from "../git/commit.js";
++ 
++@@ -190,6 +191,12 @@ export async function deriveTaskState(opts: {
++       }
++     }
++   }
+++  // From concerns: routed tech-debt, or any routed concern dispositioned optional
+++  for (const concern of await listConcerns(taskDir)) {
+++    if (concern.status === "routed" && (concern.kind === "tech-debt" || concern.disposition === "optional")) {
+++      debtSet.add(concern.summary);
+++    }
+++  }
++   // From review suggestions with disposition optional
++   for (const it of items) {
++     for (const rec of it.records) {
++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
++index 6c5e013..58b8bd6 100644
++--- a/plugins/software-factory/src/core/flows/iteration.ts
+++++ b/plugins/software-factory/src/core/flows/iteration.ts
++@@ -28,6 +28,11 @@ import { refreshStateYaml } from "../derive/task.js";
++ import { appendJournal } from "../journal.js";
++ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+++import {
+++  hydrateConcernsYaml,
+++  listConcernIds,
+++  partitionSuggestions,
+++} from "../concerns.js";
++ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
++ import { validateEdits } from "../plan/limits.js";
++ import { applyEdits } from "../plan/apply.js";
++@@ -436,6 +441,10 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++     const reviewFingerprints: string[] = [];
++ 
++     while (reviewRound <= maxPlanReviewRounds) {
+++    // Triage ids are those that existed before this review round; capturing
+++    // them here mirrors the step-runner exact-id partition.
+++    const knownConcernIds = await listConcernIds(taskDir);
+++    const concernsYaml = await hydrateConcernsYaml(taskDir);
++     // Check if review round record already exists
++     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
++     const revStepRes = await runAgentStep({
++@@ -457,6 +466,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         plan: JSON.stringify(plan, null, 2),
++         intent: intentText,
++         context: contextYaml,
+++        concernsYaml,
++         limits: JSON.stringify(limits, null, 2),
++         dispositionsCriteria: formatDispositionsSection(
++           loadCriteriaBundle(pipeline.criteria).dispositions,
++@@ -483,7 +493,13 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++     }
++ 
++     const revOutput = revStepRes.output as ReviewArtifact | undefined;
++-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
+++    // Triage ids are exact-id concern/remarkable decisions, not plan findings;
+++    // they never request a revision or influence approval.
+++    const { findings } = partitionSuggestions(
+++      revOutput?.suggestions ?? [],
+++      knownConcernIds
+++    );
+++    const fixSuggestions = findings.filter((s) => s.disposition === "fix");
++ 
++     if (!fixSuggestions || fixSuggestions.length === 0) {
++       break; // Plan approved!
++diff --git a/plugins/software-factory/src/core/prompt-vars.ts b/plugins/software-factory/src/core/prompt-vars.ts
++index 991d946..f6d9f8a 100644
++--- a/plugins/software-factory/src/core/prompt-vars.ts
+++++ b/plugins/software-factory/src/core/prompt-vars.ts
++@@ -159,8 +159,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
++   "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
++   "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
++ 
++-  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
++-  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
+++  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+++  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
++ 
++   // System fragments
++   "system/steer-classify": [],
++diff --git a/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
++new file mode 100644
++index 0000000..301c563
++--- /dev/null
+++++ b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
++@@ -0,0 +1,477 @@
+++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+++import fs from "node:fs";
+++import path from "node:path";
+++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+++import { runIteration } from "../../src/core/flows/iteration.js";
+++import { deriveTaskState } from "../../src/core/derive/task.js";
+++import { Repo } from "../../src/core/git/repo.js";
+++import { loadPromptLibrary } from "../../src/core/prompts.js";
+++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+++import { concernFingerprint } from "../../src/core/concerns.js";
+++import type {
+++  PipelineConfig,
+++  ProjectConfig,
+++  StoredConcernArtifact,
+++} from "../../src/core/artifacts.js";
+++
+++/**
+++ * Plan-reviewer triage (docs/factory.v2.md §18; m2-triage-modes).
+++ *
+++ * Architect plan/revise output feeds the taskWt concern store (concerns[] and
+++ * remarkable[]), steps/plan-review is hydrated with the open concerns YAML,
+++ * and the plan reviewer triages those exact ids with the same vocabulary as
+++ * the item reviewer: `dismiss` (requires detail) keeps the file dismissed,
+++ * every other disposition routes it. Triage ids never count as plan findings,
+++ * so they neither request a plan revision nor influence approval.
+++ */
+++describe("Plan-reviewer triage", () => {
+++  const ORCH = ".factory";
+++  const TASK = "plan-reviewer-triage";
+++
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskDir: string;
+++  let taskWt: string;
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
+++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Plan reviewer triage\n", "utf8");
+++    tmpRepo.commit("add plan-reviewer triage task");
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
+++        architect: { role: "architect" },
+++        "plan-reviewer": { role: "alt-architect" },
+++        pm: { role: "alt-workhorse" },
+++      },
+++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+++      limits: { maxPlanReviewRounds: 2 },
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
+++  function planData(extra: Record<string, unknown> = {}) {
+++    return {
+++      iteration: 1,
+++      milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
+++      itemOutlines: [],
+++      ...extra,
+++    };
+++  }
+++
+++  function concernsDir(): string {
+++    return path.join(taskDir, "concerns");
+++  }
+++
+++  function concernIds(prefix: "c-" | "rm-"): string[] {
+++    const dir = concernsDir();
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  async function storedConcern(id: string): Promise<StoredConcernArtifact> {
+++    return readYaml<StoredConcernArtifact>(path.join(concernsDir(), `${id}.yaml`));
+++  }
+++
+++  async function runPlanReview(opts: {
+++    harness: FakeHarness;
+++    planStep?: Record<string, unknown>;
+++    planReview: (run: { prompt: string }) => Record<string, unknown>;
+++  }): Promise<{ prompts: string[]; result: Awaited<ReturnType<typeof runIteration>> }> {
+++    const harness = opts.harness;
+++    harness.scriptOutcome(
+++      `${TASK}/runs/architect-plan-1#a1`,
+++      { ok: true, data: opts.planStep ?? planData() }
+++    );
+++
+++    const hydratedPrompts: string[] = [];
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, (run) => {
+++      hydratedPrompts.push(run.prompt);
+++      return { ok: true, data: opts.planReview(run) };
+++    });
+++
+++    // Stops the iteration right after the plan-review loop: empty PM edits are
+++    // rejected without touching waves or item worktrees.
+++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, items: [] },
+++    });
+++
+++    const result = await runIteration({
+++      task: TASK,
+++      taskDir,
+++      taskWt,
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts,
+++    });
+++    return { prompts: hydratedPrompts, result };
+++  }
+++
+++  function runLabels(harness: FakeHarness): string[] {
+++    return harness.calls
+++      .filter((call): call is Extract<(typeof harness.calls)[number], { type: "run" }> => call.type === "run")
+++      .map((call) => call.run.label);
+++  }
+++
+++  it("hydrates plan-review with plan concerns and triages dismiss vs routed ids", async () => {
+++    const harness = new FakeHarness();
+++    const dismissedId = concernFingerprint({
+++      kind: "tech-debt",
+++      summary: "Plan retry glue duplicates the adapter",
+++      affects: ["m1"],
+++    });
+++    const routedId = concernFingerprint({
+++      kind: "risk",
+++      summary: "Milestone boundary depends on an unbuilt adapter",
+++      affects: ["m1"],
+++    });
+++
+++    const reviewRun = await runPlanReview({
+++      harness,
+++      planStep: planData({
+++        concerns: [
+++          {
+++            kind: "tech-debt",
+++            summary: "Plan retry glue duplicates the adapter",
+++            detail: "Extract one shared retry helper",
+++            severity: "medium",
+++            affects: ["m1"],
+++          },
+++          {
+++            kind: "risk",
+++            summary: "Milestone boundary depends on an unbuilt adapter",
+++            detail: "Risk of imaginary interfaces",
+++            severity: "high",
+++            affects: ["m1"],
+++          },
+++        ],
+++        remarkable: [
+++          {
+++            chosen: "File-per-concern YAML store",
+++            alternatives: ["One aggregate file", "Embed in state.yaml"],
+++            why: "conflict-free task worktree commits",
+++          },
+++        ],
+++      }),
+++      planReview: () => {
+++        const [rmId] = concernIds("rm-");
+++        return {
+++          status: "approved",
+++          summary: "Plan and concern triage",
+++          suggestions: [
+++            {
+++              id: dismissedId,
+++              disposition: "dismiss",
+++              summary: "Duplicate of the shared retry helper",
+++              detail: "covered by the plan ADR",
+++            },
+++            { id: routedId, disposition: "optional", summary: "Track as debt" },
+++            {
+++              id: rmId,
+++              disposition: "dismiss",
+++              summary: "Standard storage choice",
+++              detail: "documented alternative is enough",
+++            },
+++            { id: "s-not-a-concern", disposition: "optional", summary: "Ordinary finding" },
+++          ],
+++        };
+++      },
+++    });
+++
+++    // Aggregation: architect plan concerns and remarkable decisions reach taskWt.
+++    expect(concernIds("c-")).toEqual([dismissedId, routedId].sort());
+++    expect(concernIds("rm-")).toHaveLength(1);
+++
+++    // Same vocabulary as the item reviewer: dismiss keeps the reason, other
+++    // dispositions route, and ordinary finding ids are ignored.
+++    const dismissed = await storedConcern(dismissedId);
+++    expect(dismissed.status).toBe("dismissed");
+++    expect(dismissed.dismissReason).toBe("covered by the plan ADR");
+++
+++    const routed = await storedConcern(routedId);
+++    expect(routed.status).toBe("routed");
+++    expect(routed.disposition).toBe("optional");
+++
+++    const [rmId] = concernIds("rm-");
+++    const remarkable = await readYaml<Record<string, any>>(
+++      path.join(concernsDir(), `${rmId}.yaml`)
+++    );
+++    expect(remarkable.status).toBe("dismissed");
+++    expect(remarkable.dismissReason).toBe("documented alternative is enough");
+++    expect(fs.existsSync(path.join(concernsDir(), "s-not-a-concern.yaml"))).toBe(false);
+++
+++    // Hydration: the plan reviewer sees every open concern id before triage.
+++    expect(reviewRun.prompts).toHaveLength(1);
+++    for (const id of [dismissedId, routedId, ...concernIds("rm-")]) {
+++      expect(reviewRun.prompts[0]).toContain(id);
+++    }
+++  });
+++
+++  it("aggregates architect-revise concerns and remarkable rm-* for the next review round", async () => {
+++    const harness = new FakeHarness();
+++    const reviseConcernId = concernFingerprint({
+++      kind: "assumption",
+++      summary: "Plan assumes an in-memory queue survives restart",
+++      affects: ["m1"],
+++    });
+++    let secondPrompt = "";
+++
+++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
+++      ok: true,
+++      data: planData(),
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+++      ok: true,
+++      data: {
+++        status: "changes_requested",
+++        summary: "Plan needs a durability story",
+++        suggestions: [
+++          { id: "s-plan-gap", disposition: "fix", summary: "Add durability to the plan" },
+++        ],
+++      },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, {
+++      ok: true,
+++      data: planData({
+++        concerns: [
+++          {
+++            kind: "assumption",
+++            summary: "Plan assumes an in-memory queue survives restart",
+++            detail: "Persist the queue before acknowledging",
+++            severity: "high",
+++            affects: ["m1"],
+++          },
+++        ],
+++        remarkable: [
+++          {
+++            chosen: "Lease-based queue",
+++            alternatives: ["In-memory queue", "External broker"],
+++            why: "restart safety without a new dependency",
+++          },
+++        ],
+++      }),
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, (run) => {
+++      secondPrompt = run.prompt;
+++      const [rmId] = concernIds("rm-");
+++      return {
+++        ok: true,
+++        data: {
+++          status: "approved",
+++          summary: "Revised plan approved",
+++          suggestions: [
+++            { id: reviseConcernId, disposition: "architect", summary: "Carry to architect" },
+++            { id: rmId, disposition: "optional", summary: "Keep as debt" },
+++          ],
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, items: [] },
+++    });
+++
+++    await runIteration({
+++      task: TASK,
+++      taskDir,
+++      taskWt,
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts,
+++    });
+++
+++    // Revise producer output aggregated into the same store as the plan output.
+++    const reviseConcern = await storedConcern(reviseConcernId);
+++    expect(reviseConcern.source.agent).toBe("architect");
+++    expect(reviseConcern.source.step).toBe("architect-revise-1-1");
+++    const rmId = concernIds("rm-")[0]!;
+++    expect(rmId).toMatch(/^rm-[0-9a-f]{10}$/);
+++
+++    // Non-dismiss dispositions route; the remarkable file routes too.
+++    const routedConcern = await storedConcern(reviseConcernId);
+++    expect(routedConcern.status).toBe("routed");
+++    expect(routedConcern.disposition).toBe("architect");
+++    const remarkable = await readYaml<Record<string, any>>(
+++      path.join(concernsDir(), `${rmId}.yaml`)
+++    );
+++    expect(remarkable.status).toBe("routed");
+++    expect(remarkable.disposition).toBe("optional");
+++
+++    // Round two is hydrated with the revise concern and remarkable id.
+++    expect(secondPrompt).toContain(reviseConcernId);
+++    expect(secondPrompt).toContain(rmId);
+++  });
+++
+++  it("keeps triage ids out of the plan fix loop so they never trigger a revision", async () => {
+++    const harness = new FakeHarness();
+++    const concernId = concernFingerprint({
+++      kind: "tech-debt",
+++      summary: "Plan duplicates the retry helper",
+++      affects: ["m1"],
+++    });
+++    let revised = false;
+++
+++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
+++      ok: true,
+++      data: planData({
+++        concerns: [
+++          {
+++            kind: "tech-debt",
+++            summary: "Plan duplicates the retry helper",
+++            detail: "Use one shared helper",
+++            severity: "medium",
+++            affects: ["m1"],
+++          },
+++        ],
+++      }),
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+++      ok: true,
+++      data: {
+++        status: "changes_requested",
+++        summary: "Triage only",
+++        suggestions: [
+++          { id: concernId, disposition: "fix", summary: "Resolve the plan debt" },
+++        ],
+++      },
+++    });
+++    // Scripted so a regression that revises is observable rather than crashing.
+++    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, () => {
+++      revised = true;
+++      return { ok: true, data: planData() };
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Second round", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, items: [] },
+++    });
+++
+++    await runIteration({
+++      task: TASK,
+++      taskDir,
+++      taskWt,
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts,
+++    });
+++
+++    const triaged = await storedConcern(concernId);
+++    expect(triaged.status).toBe("routed");
+++    expect(triaged.disposition).toBe("fix");
+++
+++    expect(revised).toBe(false);
+++    const labels = runLabels(harness);
+++    expect(labels).not.toContain(`${TASK}/runs/architect-revise-1-1#a1`);
+++    expect(labels).not.toContain(`${TASK}/runs/plan-review-1-2#a1`);
+++  });
+++
+++  it("derives debt from routed tech-debt concerns and routed optional dispositions only", async () => {
+++    const dir = concernsDir();
+++    const stored = (
+++      id: string,
+++      overrides: Partial<StoredConcernArtifact>
+++    ): StoredConcernArtifact => ({
+++      id,
+++      kind: "risk",
+++      summary: `Concern ${id}`,
+++      detail: `Detail ${id}`,
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-plan-review-a1", agent: "plan-reviewer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    });
+++
+++    await writeYamlAtomic(
+++      path.join(dir, "c-debtrouted.yaml"),
+++      stored("c-debtrouted", {
+++        kind: "tech-debt",
+++        summary: "Plan duplicated the retry helper",
+++        status: "routed",
+++      })
+++    );
+++    await writeYamlAtomic(
+++      path.join(dir, "c-optionalrouted.yaml"),
+++      stored("c-optionalrouted", {
+++        kind: "risk",
+++        summary: "Defer contract hardening",
+++        status: "routed",
+++        disposition: "optional",
+++      })
+++    );
+++    await writeYamlAtomic(
+++      path.join(dir, "c-debtopen.yaml"),
+++      stored("c-debtopen", {
+++        kind: "tech-debt",
+++        summary: "Open debt stays a concern",
+++        status: "open",
+++      })
+++    );
+++    await writeYamlAtomic(
+++      path.join(dir, "c-optionaldismissed.yaml"),
+++      stored("c-optionaldismissed", {
+++        kind: "risk",
+++        summary: "Dismissed optional is not debt",
+++        status: "dismissed",
+++        disposition: "dismiss",
+++        dismissReason: "not worth tracking",
+++      })
+++    );
+++
+++    const state = await deriveTaskState({
+++      taskDir,
+++      task: TASK,
+++      taskWt,
+++      pipeline,
+++      project,
+++    });
+++
+++    expect(state.debt).toContain("Plan duplicated the retry helper");
+++    expect(state.debt).toContain("Defer contract hardening");
+++    expect(state.debt).not.toContain("Open debt stays a concern");
+++    expect(state.debt).not.toContain("Dismissed optional is not debt");
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
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..91e38e9
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T09:16:58.401Z
++session: 01a1ba72-6564-7206-88cb-2915042c77b5
++endedAt: 2026-11-08T09:29:42.588Z
++usage:
++  inputTokens: 47702
++  outputTokens: 31281
++  costUsd: 0.012255
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-17-01-668Z_01a1ba72-6564-7206-88cb-2915042c77b5.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..f259ca6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml
+@@ -0,0 +1,34 @@
++status: changes_requested
++summary: Target 4 pass, typecheck clean, no weakening; debt predicate test
++  allows false pass
++suggestions:
++  - id: debt-predicate-missing-negative
++    disposition: fix
++    summary: Debt test omits routed non-tech-debt non-optional negative case
++    detail: "Test4 has 2 positives (routed tech-debt, routed optional) and 2
++      negatives (open, dismissed) but no routed risk/architect fixture.
++      Predicate status==routed alone would pass all 4, so OR clause (kind
++      tech-debt OR disposition optional) unverified. Add c- fixture kind risk
++      status routed disposition architect/fix and assert not in debt.
++      Independent runs: target 4 pass, neighbors 37 pass, typecheck exit 0."
++    location:
++      file: plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
++      line: 410
++  - id: plan-review-matrix-stale
++    disposition: optional
++    summary: Human-involvement matrix omits new concernsYaml for plan-review
++    detail: KNOWN_VARS now includes concernsYaml for plan-review but FRAGMENT_MATRIX
++      still lists only humanInvolvementCriteria. Passes via arrayContaining but
++      docs drift. Update matrix to include concernsYaml.
++    location:
++      file: plugins/software-factory/test/human-involvement-config.test.ts
++      line: 64
++  - id: hydration-open-only-unverified
++    disposition: optional
++    summary: Hydration open-only filtering not asserted across rounds
++    detail: hydrateConcernsYaml filters status open but tests only assert inclusion
++      of pre-triage ids; hydrate-all would still pass. Consider asserting
++      round-2 prompt excludes previously dismissed/routed ids.
++    location:
++      file: plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
++      line: 338
+diff --git a/plugins/software-factory/agents/steps/plan-review.md b/plugins/software-factory/agents/steps/plan-review.md
+index e468f6a..0353bf4 100644
+--- a/plugins/software-factory/agents/steps/plan-review.md
++++ b/plugins/software-factory/agents/steps/plan-review.md
+@@ -12,6 +12,7 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
+   - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
+   - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
+ - Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
++- Concern triage: ids in Open Concerns are pre-existing concerns/decisions, not plan findings. Re-emit their exact id in `suggestions`; `dismiss` (with `detail`) dismisses, every other allowed disposition routes it. Triage ids never request a plan revision.
+ 
+ ## Dispositions Criteria
+ {{dispositionsCriteria}}
+@@ -27,3 +28,6 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
+ 
+ ## Limits
+ {{limits}}
++
++## Open Concerns
++{{concernsYaml}}
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index c1e8f80..b736d11 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -1,6 +1,7 @@
+ import fs from "node:fs";
+ import path from "node:path";
+ import { createHash } from "node:crypto";
++import yaml from "yaml";
+ import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+ import type { Repo } from "./git/repo.js";
+ import { commitAll } from "./git/commit.js";
+@@ -105,8 +106,8 @@ export async function aggregateConcerns(
+   return stored;
+ }
+ 
+-/** Returns open concerns ordered by creation time then id. */
+-export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++/** Returns every stored concern artifact, ordered by creation time then id. */
++export async function listConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+   const dir = dirOf(taskDir);
+   let names: string[];
+   try { names = await fs.promises.readdir(dir); } catch (err: any) {
+@@ -117,10 +118,49 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
+     try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
+   }));
+   return records
+-    .filter((r): r is StoredConcernArtifact => r?.status === "open" && typeof r?.kind === "string")
++    .filter((r): r is StoredConcernArtifact => typeof r?.kind === "string")
+     .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
+ }
+ 
++/** Returns open concerns ordered by creation time then id. */
++export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
++  return (await listConcerns(taskDir)).filter((r) => r.status === "open");
++}
++
++/** Returns every stored concern/remarkable id for exact-id triage partitioning. */
++export async function listConcernIds(taskDir: string): Promise<string[]> {
++  const dir = dirOf(taskDir);
++  try {
++    return (await fs.promises.readdir(dir))
++      .filter((name) => name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length));
++  } catch (err: any) {
++    if (err?.code === "ENOENT") return [];
++    throw err;
++  }
++}
++
++/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
++export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
++  const dir = dirOf(taskDir);
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return "[]";
++    throw err;
++  }
++  const items = await Promise.all(
++    names
++      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
++      .map(async (name) => {
++        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++      })
++  );
++  const open = items
++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
++  return open.length ? yaml.stringify(open).trimEnd() : "[]";
++}
++
+ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+   const updated = await locks.runExclusive(ctx.taskDir, async () => {
+diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
+index e7e89b1..7128367 100644
+--- a/plugins/software-factory/src/core/derive/task.ts
++++ b/plugins/software-factory/src/core/derive/task.ts
+@@ -16,6 +16,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
+ import { deriveItemState, type DerivedItemState } from "./item.js";
+ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
+ import { BudgetTracker } from "../budget.js";
++import { listConcerns } from "../concerns.js";
+ import { git } from "../git/exec.js";
+ import { isAncestor } from "../git/commit.js";
+ 
+@@ -190,6 +191,12 @@ export async function deriveTaskState(opts: {
+       }
+     }
+   }
++  // From concerns: routed tech-debt, or any routed concern dispositioned optional
++  for (const concern of await listConcerns(taskDir)) {
++    if (concern.status === "routed" && (concern.kind === "tech-debt" || concern.disposition === "optional")) {
++      debtSet.add(concern.summary);
++    }
++  }
+   // From review suggestions with disposition optional
+   for (const it of items) {
+     for (const rec of it.records) {
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 6c5e013..58b8bd6 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -28,6 +28,11 @@ import { refreshStateYaml } from "../derive/task.js";
+ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++import {
++  hydrateConcernsYaml,
++  listConcernIds,
++  partitionSuggestions,
++} from "../concerns.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -436,6 +441,10 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     const reviewFingerprints: string[] = [];
+ 
+     while (reviewRound <= maxPlanReviewRounds) {
++    // Triage ids are those that existed before this review round; capturing
++    // them here mirrors the step-runner exact-id partition.
++    const knownConcernIds = await listConcernIds(taskDir);
++    const concernsYaml = await hydrateConcernsYaml(taskDir);
+     // Check if review round record already exists
+     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
+     const revStepRes = await runAgentStep({
+@@ -457,6 +466,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         plan: JSON.stringify(plan, null, 2),
+         intent: intentText,
+         context: contextYaml,
++        concernsYaml,
+         limits: JSON.stringify(limits, null, 2),
+         dispositionsCriteria: formatDispositionsSection(
+           loadCriteriaBundle(pipeline.criteria).dispositions,
+@@ -483,7 +493,13 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     }
+ 
+     const revOutput = revStepRes.output as ReviewArtifact | undefined;
+-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
++    // Triage ids are exact-id concern/remarkable decisions, not plan findings;
++    // they never request a revision or influence approval.
++    const { findings } = partitionSuggestions(
++      revOutput?.suggestions ?? [],
++      knownConcernIds
++    );
++    const fixSuggestions = findings.filter((s) => s.disposition === "fix");
+ 
+     if (!fixSuggestions || fixSuggestions.length === 0) {
+       break; // Plan approved!
+diff --git a/plugins/software-factory/src/core/prompt-vars.ts b/plugins/software-factory/src/core/prompt-vars.ts
+index 991d946..f6d9f8a 100644
+--- a/plugins/software-factory/src/core/prompt-vars.ts
++++ b/plugins/software-factory/src/core/prompt-vars.ts
+@@ -159,8 +159,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
+   "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
+   "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
+-  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
++  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
++  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+ 
+   // System fragments
+   "system/steer-classify": [],
+diff --git a/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+new file mode 100644
+index 0000000..301c563
+--- /dev/null
++++ b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
+@@ -0,0 +1,477 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runIteration } from "../../src/core/flows/iteration.js";
++import { deriveTaskState } from "../../src/core/derive/task.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import { concernFingerprint } from "../../src/core/concerns.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Plan-reviewer triage (docs/factory.v2.md §18; m2-triage-modes).
++ *
++ * Architect plan/revise output feeds the taskWt concern store (concerns[] and
++ * remarkable[]), steps/plan-review is hydrated with the open concerns YAML,
++ * and the plan reviewer triages those exact ids with the same vocabulary as
++ * the item reviewer: `dismiss` (requires detail) keeps the file dismissed,
++ * every other disposition routes it. Triage ids never count as plan findings,
++ * so they neither request a plan revision nor influence approval.
++ */
++describe("Plan-reviewer triage", () => {
++  const ORCH = ".factory";
++  const TASK = "plan-reviewer-triage";
++
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskDir: string;
++  let taskWt: string;
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
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Plan reviewer triage\n", "utf8");
++    tmpRepo.commit("add plan-reviewer triage task");
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
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
++      limits: { maxPlanReviewRounds: 2 },
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
++  function planData(extra: Record<string, unknown> = {}) {
++    return {
++      iteration: 1,
++      milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
++      itemOutlines: [],
++      ...extra,
++    };
++  }
++
++  function concernsDir(): string {
++    return path.join(taskDir, "concerns");
++  }
++
++  function concernIds(prefix: "c-" | "rm-"): string[] {
++    const dir = concernsDir();
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  async function storedConcern(id: string): Promise<StoredConcernArtifact> {
++    return readYaml<StoredConcernArtifact>(path.join(concernsDir(), `${id}.yaml`));
++  }
++
++  async function runPlanReview(opts: {
++    harness: FakeHarness;
++    planStep?: Record<string, unknown>;
++    planReview: (run: { prompt: string }) => Record<string, unknown>;
++  }): Promise<{ prompts: string[]; result: Awaited<ReturnType<typeof runIteration>> }> {
++    const harness = opts.harness;
++    harness.scriptOutcome(
++      `${TASK}/runs/architect-plan-1#a1`,
++      { ok: true, data: opts.planStep ?? planData() }
++    );
++
++    const hydratedPrompts: string[] = [];
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, (run) => {
++      hydratedPrompts.push(run.prompt);
++      return { ok: true, data: opts.planReview(run) };
++    });
++
++    // Stops the iteration right after the plan-review loop: empty PM edits are
++    // rejected without touching waves or item worktrees.
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    const result = await runIteration({
++      task: TASK,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++    return { prompts: hydratedPrompts, result };
++  }
++
++  function runLabels(harness: FakeHarness): string[] {
++    return harness.calls
++      .filter((call): call is Extract<(typeof harness.calls)[number], { type: "run" }> => call.type === "run")
++      .map((call) => call.run.label);
++  }
++
++  it("hydrates plan-review with plan concerns and triages dismiss vs routed ids", async () => {
++    const harness = new FakeHarness();
++    const dismissedId = concernFingerprint({
++      kind: "tech-debt",
++      summary: "Plan retry glue duplicates the adapter",
++      affects: ["m1"],
++    });
++    const routedId = concernFingerprint({
++      kind: "risk",
++      summary: "Milestone boundary depends on an unbuilt adapter",
++      affects: ["m1"],
++    });
++
++    const reviewRun = await runPlanReview({
++      harness,
++      planStep: planData({
++        concerns: [
++          {
++            kind: "tech-debt",
++            summary: "Plan retry glue duplicates the adapter",
++            detail: "Extract one shared retry helper",
++            severity: "medium",
++            affects: ["m1"],
++          },
++          {
++            kind: "risk",
++            summary: "Milestone boundary depends on an unbuilt adapter",
++            detail: "Risk of imaginary interfaces",
++            severity: "high",
++            affects: ["m1"],
++          },
++        ],
++        remarkable: [
++          {
++            chosen: "File-per-concern YAML store",
++            alternatives: ["One aggregate file", "Embed in state.yaml"],
++            why: "conflict-free task worktree commits",
++          },
++        ],
++      }),
++      planReview: () => {
++        const [rmId] = concernIds("rm-");
++        return {
++          status: "approved",
++          summary: "Plan and concern triage",
++          suggestions: [
++            {
++              id: dismissedId,
++              disposition: "dismiss",
++              summary: "Duplicate of the shared retry helper",
++              detail: "covered by the plan ADR",
++            },
++            { id: routedId, disposition: "optional", summary: "Track as debt" },
++            {
++              id: rmId,
++              disposition: "dismiss",
++              summary: "Standard storage choice",
++              detail: "documented alternative is enough",
++            },
++            { id: "s-not-a-concern", disposition: "optional", summary: "Ordinary finding" },
++          ],
++        };
++      },
++    });
++
++    // Aggregation: architect plan concerns and remarkable decisions reach taskWt.
++    expect(concernIds("c-")).toEqual([dismissedId, routedId].sort());
++    expect(concernIds("rm-")).toHaveLength(1);
++
++    // Same vocabulary as the item reviewer: dismiss keeps the reason, other
++    // dispositions route, and ordinary finding ids are ignored.
++    const dismissed = await storedConcern(dismissedId);
++    expect(dismissed.status).toBe("dismissed");
++    expect(dismissed.dismissReason).toBe("covered by the plan ADR");
++
++    const routed = await storedConcern(routedId);
++    expect(routed.status).toBe("routed");
++    expect(routed.disposition).toBe("optional");
++
++    const [rmId] = concernIds("rm-");
++    const remarkable = await readYaml<Record<string, any>>(
++      path.join(concernsDir(), `${rmId}.yaml`)
++    );
++    expect(remarkable.status).toBe("dismissed");
++    expect(remarkable.dismissReason).toBe("documented alternative is enough");
++    expect(fs.existsSync(path.join(concernsDir(), "s-not-a-concern.yaml"))).toBe(false);
++
++    // Hydration: the plan reviewer sees every open concern id before triage.
++    expect(reviewRun.prompts).toHaveLength(1);
++    for (const id of [dismissedId, routedId, ...concernIds("rm-")]) {
++      expect(reviewRun.prompts[0]).toContain(id);
++    }
++  });
++
++  it("aggregates architect-revise concerns and remarkable rm-* for the next review round", async () => {
++    const harness = new FakeHarness();
++    const reviseConcernId = concernFingerprint({
++      kind: "assumption",
++      summary: "Plan assumes an in-memory queue survives restart",
++      affects: ["m1"],
++    });
++    let secondPrompt = "";
++
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
++      ok: true,
++      data: planData(),
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: {
++        status: "changes_requested",
++        summary: "Plan needs a durability story",
++        suggestions: [
++          { id: "s-plan-gap", disposition: "fix", summary: "Add durability to the plan" },
++        ],
++      },
++    });
++    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, {
++      ok: true,
++      data: planData({
++        concerns: [
++          {
++            kind: "assumption",
++            summary: "Plan assumes an in-memory queue survives restart",
++            detail: "Persist the queue before acknowledging",
++            severity: "high",
++            affects: ["m1"],
++          },
++        ],
++        remarkable: [
++          {
++            chosen: "Lease-based queue",
++            alternatives: ["In-memory queue", "External broker"],
++            why: "restart safety without a new dependency",
++          },
++        ],
++      }),
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, (run) => {
++      secondPrompt = run.prompt;
++      const [rmId] = concernIds("rm-");
++      return {
++        ok: true,
++        data: {
++          status: "approved",
++          summary: "Revised plan approved",
++          suggestions: [
++            { id: reviseConcernId, disposition: "architect", summary: "Carry to architect" },
++            { id: rmId, disposition: "optional", summary: "Keep as debt" },
++          ],
++        },
++      };
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    await runIteration({
++      task: TASK,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++
++    // Revise producer output aggregated into the same store as the plan output.
++    const reviseConcern = await storedConcern(reviseConcernId);
++    expect(reviseConcern.source.agent).toBe("architect");
++    expect(reviseConcern.source.step).toBe("architect-revise-1-1");
++    const rmId = concernIds("rm-")[0]!;
++    expect(rmId).toMatch(/^rm-[0-9a-f]{10}$/);
++
++    // Non-dismiss dispositions route; the remarkable file routes too.
++    const routedConcern = await storedConcern(reviseConcernId);
++    expect(routedConcern.status).toBe("routed");
++    expect(routedConcern.disposition).toBe("architect");
++    const remarkable = await readYaml<Record<string, any>>(
++      path.join(concernsDir(), `${rmId}.yaml`)
++    );
++    expect(remarkable.status).toBe("routed");
++    expect(remarkable.disposition).toBe("optional");
++
++    // Round two is hydrated with the revise concern and remarkable id.
++    expect(secondPrompt).toContain(reviseConcernId);
++    expect(secondPrompt).toContain(rmId);
++  });
++
++  it("keeps triage ids out of the plan fix loop so they never trigger a revision", async () => {
++    const harness = new FakeHarness();
++    const concernId = concernFingerprint({
++      kind: "tech-debt",
++      summary: "Plan duplicates the retry helper",
++      affects: ["m1"],
++    });
++    let revised = false;
++
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
++      ok: true,
++      data: planData({
++        concerns: [
++          {
++            kind: "tech-debt",
++            summary: "Plan duplicates the retry helper",
++            detail: "Use one shared helper",
++            severity: "medium",
++            affects: ["m1"],
++          },
++        ],
++      }),
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: {
++        status: "changes_requested",
++        summary: "Triage only",
++        suggestions: [
++          { id: concernId, disposition: "fix", summary: "Resolve the plan debt" },
++        ],
++      },
++    });
++    // Scripted so a regression that revises is observable rather than crashing.
++    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, () => {
++      revised = true;
++      return { ok: true, data: planData() };
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Second round", suggestions: [] },
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    await runIteration({
++      task: TASK,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++    });
++
++    const triaged = await storedConcern(concernId);
++    expect(triaged.status).toBe("routed");
++    expect(triaged.disposition).toBe("fix");
++
++    expect(revised).toBe(false);
++    const labels = runLabels(harness);
++    expect(labels).not.toContain(`${TASK}/runs/architect-revise-1-1#a1`);
++    expect(labels).not.toContain(`${TASK}/runs/plan-review-1-2#a1`);
++  });
++
++  it("derives debt from routed tech-debt concerns and routed optional dispositions only", async () => {
++    const dir = concernsDir();
++    const stored = (
++      id: string,
++      overrides: Partial<StoredConcernArtifact>
++    ): StoredConcernArtifact => ({
++      id,
++      kind: "risk",
++      summary: `Concern ${id}`,
++      detail: `Detail ${id}`,
++      severity: "medium",
++      status: "open",
++      source: { record: "001-plan-review-a1", agent: "plan-reviewer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    });
++
++    await writeYamlAtomic(
++      path.join(dir, "c-debtrouted.yaml"),
++      stored("c-debtrouted", {
++        kind: "tech-debt",
++        summary: "Plan duplicated the retry helper",
++        status: "routed",
++      })
++    );
++    await writeYamlAtomic(
++      path.join(dir, "c-optionalrouted.yaml"),
++      stored("c-optionalrouted", {
++        kind: "risk",
++        summary: "Defer contract hardening",
++        status: "routed",
++        disposition: "optional",
++      })
++    );
++    await writeYamlAtomic(
++      path.join(dir, "c-debtopen.yaml"),
++      stored("c-debtopen", {
++        kind: "tech-debt",
++        summary: "Open debt stays a concern",
++        status: "open",
++      })
++    );
++    await writeYamlAtomic(
++      path.join(dir, "c-optionaldismissed.yaml"),
++      stored("c-optionaldismissed", {
++        kind: "risk",
++        summary: "Dismissed optional is not debt",
++        status: "dismissed",
++        disposition: "dismiss",
++        dismissReason: "not worth tracking",
++      })
++    );
++
++    const state = await deriveTaskState({
++      taskDir,
++      task: TASK,
++      taskWt,
++      pipeline,
++      project,
++    });
++
++    expect(state.debt).toContain("Plan duplicated the retry helper");
++    expect(state.debt).toContain("Defer contract hardening");
++    expect(state.debt).not.toContain("Open debt stays a concern");
++    expect(state.debt).not.toContain("Dismissed optional is not debt");
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
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/meta.yaml
new file mode 100644
index 0000000..0d660f0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 4
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
+startedAt: 2026-11-08T09:30:53.428Z
+session: 01a1ba82-2f6c-71f9-9a41-fc1a01aca4bd
+endedAt: 2026-11-08T09:37:54.976Z
+usage:
+  inputTokens: 106720
+  outputTokens: 21071
+  costUsd: 0.0179
+repairedFrom: relaunch
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-30-53-899Z_01a1ba7f-184b-7026-83c4-ced368eb958d
diff --git a/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/output.yaml b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/output.yaml
new file mode 100644
index 0000000..ca187f4
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/plan-reviewer-triage-v2/steps/004-develop-r2-a1/output.yaml
@@ -0,0 +1,25 @@
+evidence:
+  - cd plugins/software-factory && bun test
+    test/engine/plan-reviewer-triage.test.ts -> 4 pass, 0 fail (FIX debt
+    negative case + open-only hydration assertions green)
+  - cd plugins/software-factory && bun test
+    test/engine/plan-reviewer-triage.test.ts test/engine/concerns-funnel.test.ts
+    test/human-involvement-config.test.ts -> 37 pass, 0 fail (target +
+    neighbors, incl. updated plan-review FRAGMENT_MATRIX)
+  - cd plugins/software-factory && bun run typecheck -> exit 0 ($ tsc --noEmit)
+  - cd plugins/software-factory && bun test -> 339 pass, 2 skip, 0 fail across
+    341 tests / 57 files (full suite non-regression)
+  - git diff --check -> exit 0 (no whitespace errors); verified
+    routed-risk/architect fixture asserts not in debt and round-2 prompt
+    excludes triaged id
+notes: "No production code changes needed: predicate in src/core/derive/task.ts
+  already implements routed AND (tech-debt OR optional); fix-round only
+  strengthened tests. Verified uncommitted diff already contained all three
+  reviewer items."
+status: ok
+summary: "Verified fix-round test hardening: added routed risk/architect
+  negative fixture to debt test so status==routed alone fails, extended round-2
+  hydration test to assert open-only filtering (round-2 excludes triaged plan
+  concern), and updated plan-review FRAGMENT_MATRIX to include concernsYaml.
+  Target 4 pass, neighbors 37 pass, full suite 339 pass, typecheck clean."
+concerns: []
diff --git a/plugins/software-factory/agents/steps/plan-review.md b/plugins/software-factory/agents/steps/plan-review.md
index e468f6a..0353bf4 100644
--- a/plugins/software-factory/agents/steps/plan-review.md
+++ b/plugins/software-factory/agents/steps/plan-review.md
@@ -12,6 +12,7 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
   - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
   - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
 - Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+- Concern triage: ids in Open Concerns are pre-existing concerns/decisions, not plan findings. Re-emit their exact id in `suggestions`; `dismiss` (with `detail`) dismisses, every other allowed disposition routes it. Triage ids never request a plan revision.
 
 ## Dispositions Criteria
 {{dispositionsCriteria}}
@@ -27,3 +28,6 @@ Conduct adversarial review of the architect's proposed plan, critiquing mileston
 
 ## Limits
 {{limits}}
+
+## Open Concerns
+{{concernsYaml}}
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index c1e8f80..b736d11 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -1,6 +1,7 @@
 import fs from "node:fs";
 import path from "node:path";
 import { createHash } from "node:crypto";
+import yaml from "yaml";
 import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
 import type { Repo } from "./git/repo.js";
 import { commitAll } from "./git/commit.js";
@@ -105,8 +106,8 @@ export async function aggregateConcerns(
   return stored;
 }
 
-/** Returns open concerns ordered by creation time then id. */
-export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+/** Returns every stored concern artifact, ordered by creation time then id. */
+export async function listConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
   const dir = dirOf(taskDir);
   let names: string[];
   try { names = await fs.promises.readdir(dir); } catch (err: any) {
@@ -117,10 +118,49 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
     try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
   }));
   return records
-    .filter((r): r is StoredConcernArtifact => r?.status === "open" && typeof r?.kind === "string")
+    .filter((r): r is StoredConcernArtifact => typeof r?.kind === "string")
     .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
 }
 
+/** Returns open concerns ordered by creation time then id. */
+export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
+  return (await listConcerns(taskDir)).filter((r) => r.status === "open");
+}
+
+/** Returns every stored concern/remarkable id for exact-id triage partitioning. */
+export async function listConcernIds(taskDir: string): Promise<string[]> {
+  const dir = dirOf(taskDir);
+  try {
+    return (await fs.promises.readdir(dir))
+      .filter((name) => name.endsWith(".yaml"))
+      .map((name) => name.slice(0, -".yaml".length));
+  } catch (err: any) {
+    if (err?.code === "ENOENT") return [];
+    throw err;
+  }
+}
+
+/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
+export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
+  const dir = dirOf(taskDir);
+  let names: string[];
+  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+    if (err?.code === "ENOENT") return "[]";
+    throw err;
+  }
+  const items = await Promise.all(
+    names
+      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
+      .map(async (name) => {
+        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+      })
+  );
+  const open = items
+    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
+    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
+  return open.length ? yaml.stringify(open).trimEnd() : "[]";
+}
+
 async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
   const updated = await locks.runExclusive(ctx.taskDir, async () => {
diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
index e7e89b1..7128367 100644
--- a/plugins/software-factory/src/core/derive/task.ts
+++ b/plugins/software-factory/src/core/derive/task.ts
@@ -16,6 +16,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
 import { deriveItemState, type DerivedItemState } from "./item.js";
 import { deriveWaveState, type DerivedWaveState } from "./wave.js";
 import { BudgetTracker } from "../budget.js";
+import { listConcerns } from "../concerns.js";
 import { git } from "../git/exec.js";
 import { isAncestor } from "../git/commit.js";
 
@@ -190,6 +191,12 @@ export async function deriveTaskState(opts: {
       }
     }
   }
+  // From concerns: routed tech-debt, or any routed concern dispositioned optional
+  for (const concern of await listConcerns(taskDir)) {
+    if (concern.status === "routed" && (concern.kind === "tech-debt" || concern.disposition === "optional")) {
+      debtSet.add(concern.summary);
+    }
+  }
   // From review suggestions with disposition optional
   for (const it of items) {
     for (const rec of it.records) {
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index 6c5e013..58b8bd6 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -28,6 +28,11 @@ import { refreshStateYaml } from "../derive/task.js";
 import { appendJournal } from "../journal.js";
 import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
 import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+import {
+  hydrateConcernsYaml,
+  listConcernIds,
+  partitionSuggestions,
+} from "../concerns.js";
 import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
 import { validateEdits } from "../plan/limits.js";
 import { applyEdits } from "../plan/apply.js";
@@ -436,6 +441,10 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
     const reviewFingerprints: string[] = [];
 
     while (reviewRound <= maxPlanReviewRounds) {
+    // Triage ids are those that existed before this review round; capturing
+    // them here mirrors the step-runner exact-id partition.
+    const knownConcernIds = await listConcernIds(taskDir);
+    const concernsYaml = await hydrateConcernsYaml(taskDir);
     // Check if review round record already exists
     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
     const revStepRes = await runAgentStep({
@@ -457,6 +466,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         plan: JSON.stringify(plan, null, 2),
         intent: intentText,
         context: contextYaml,
+        concernsYaml,
         limits: JSON.stringify(limits, null, 2),
         dispositionsCriteria: formatDispositionsSection(
           loadCriteriaBundle(pipeline.criteria).dispositions,
@@ -483,7 +493,13 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
     }
 
     const revOutput = revStepRes.output as ReviewArtifact | undefined;
-    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
+    // Triage ids are exact-id concern/remarkable decisions, not plan findings;
+    // they never request a revision or influence approval.
+    const { findings } = partitionSuggestions(
+      revOutput?.suggestions ?? [],
+      knownConcernIds
+    );
+    const fixSuggestions = findings.filter((s) => s.disposition === "fix");
 
     if (!fixSuggestions || fixSuggestions.length === 0) {
       break; // Plan approved!
diff --git a/plugins/software-factory/src/core/prompt-vars.ts b/plugins/software-factory/src/core/prompt-vars.ts
index 991d946..f6d9f8a 100644
--- a/plugins/software-factory/src/core/prompt-vars.ts
+++ b/plugins/software-factory/src/core/prompt-vars.ts
@@ -159,8 +159,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
   "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
   "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
-  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
+  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
 
   // System fragments
   "system/steer-classify": [],
diff --git a/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
new file mode 100644
index 0000000..231ffa6
--- /dev/null
+++ b/plugins/software-factory/test/engine/plan-reviewer-triage.test.ts
@@ -0,0 +1,513 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runIteration } from "../../src/core/flows/iteration.js";
+import { deriveTaskState } from "../../src/core/derive/task.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import { concernFingerprint } from "../../src/core/concerns.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Plan-reviewer triage (docs/factory.v2.md §18; m2-triage-modes).
+ *
+ * Architect plan/revise output feeds the taskWt concern store (concerns[] and
+ * remarkable[]), steps/plan-review is hydrated with the open concerns YAML,
+ * and the plan reviewer triages those exact ids with the same vocabulary as
+ * the item reviewer: `dismiss` (requires detail) keeps the file dismissed,
+ * every other disposition routes it. Triage ids never count as plan findings,
+ * so they neither request a plan revision nor influence approval.
+ */
+describe("Plan-reviewer triage", () => {
+  const ORCH = ".factory";
+  const TASK = "plan-reviewer-triage";
+
+  let tmpRepo: TmpRepo;
+  let repo: Repo;
+  let taskDir: string;
+  let taskWt: string;
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
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Plan reviewer triage\n", "utf8");
+    tmpRepo.commit("add plan-reviewer triage task");
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
+        architect: { role: "architect" },
+        "plan-reviewer": { role: "alt-architect" },
+        pm: { role: "alt-workhorse" },
+      },
+      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+      limits: { maxPlanReviewRounds: 2 },
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
+  function planData(extra: Record<string, unknown> = {}) {
+    return {
+      iteration: 1,
+      milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
+      itemOutlines: [],
+      ...extra,
+    };
+  }
+
+  function concernsDir(): string {
+    return path.join(taskDir, "concerns");
+  }
+
+  function concernIds(prefix: "c-" | "rm-"): string[] {
+    const dir = concernsDir();
+    if (!fs.existsSync(dir)) return [];
+    return fs
+      .readdirSync(dir)
+      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
+      .map((name) => name.slice(0, -".yaml".length))
+      .sort();
+  }
+
+  async function storedConcern(id: string): Promise<StoredConcernArtifact> {
+    return readYaml<StoredConcernArtifact>(path.join(concernsDir(), `${id}.yaml`));
+  }
+
+  async function runPlanReview(opts: {
+    harness: FakeHarness;
+    planStep?: Record<string, unknown>;
+    planReview: (run: { prompt: string }) => Record<string, unknown>;
+  }): Promise<{ prompts: string[]; result: Awaited<ReturnType<typeof runIteration>> }> {
+    const harness = opts.harness;
+    harness.scriptOutcome(
+      `${TASK}/runs/architect-plan-1#a1`,
+      { ok: true, data: opts.planStep ?? planData() }
+    );
+
+    const hydratedPrompts: string[] = [];
+    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, (run) => {
+      hydratedPrompts.push(run.prompt);
+      return { ok: true, data: opts.planReview(run) };
+    });
+
+    // Stops the iteration right after the plan-review loop: empty PM edits are
+    // rejected without touching waves or item worktrees.
+    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: { iteration: 1, items: [] },
+    });
+
+    const result = await runIteration({
+      task: TASK,
+      taskDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+    });
+    return { prompts: hydratedPrompts, result };
+  }
+
+  function runLabels(harness: FakeHarness): string[] {
+    return harness.calls
+      .filter((call): call is Extract<(typeof harness.calls)[number], { type: "run" }> => call.type === "run")
+      .map((call) => call.run.label);
+  }
+
+  it("hydrates plan-review with plan concerns and triages dismiss vs routed ids", async () => {
+    const harness = new FakeHarness();
+    const dismissedId = concernFingerprint({
+      kind: "tech-debt",
+      summary: "Plan retry glue duplicates the adapter",
+      affects: ["m1"],
+    });
+    const routedId = concernFingerprint({
+      kind: "risk",
+      summary: "Milestone boundary depends on an unbuilt adapter",
+      affects: ["m1"],
+    });
+
+    const reviewRun = await runPlanReview({
+      harness,
+      planStep: planData({
+        concerns: [
+          {
+            kind: "tech-debt",
+            summary: "Plan retry glue duplicates the adapter",
+            detail: "Extract one shared retry helper",
+            severity: "medium",
+            affects: ["m1"],
+          },
+          {
+            kind: "risk",
+            summary: "Milestone boundary depends on an unbuilt adapter",
+            detail: "Risk of imaginary interfaces",
+            severity: "high",
+            affects: ["m1"],
+          },
+        ],
+        remarkable: [
+          {
+            chosen: "File-per-concern YAML store",
+            alternatives: ["One aggregate file", "Embed in state.yaml"],
+            why: "conflict-free task worktree commits",
+          },
+        ],
+      }),
+      planReview: () => {
+        const [rmId] = concernIds("rm-");
+        return {
+          status: "approved",
+          summary: "Plan and concern triage",
+          suggestions: [
+            {
+              id: dismissedId,
+              disposition: "dismiss",
+              summary: "Duplicate of the shared retry helper",
+              detail: "covered by the plan ADR",
+            },
+            { id: routedId, disposition: "optional", summary: "Track as debt" },
+            {
+              id: rmId,
+              disposition: "dismiss",
+              summary: "Standard storage choice",
+              detail: "documented alternative is enough",
+            },
+            { id: "s-not-a-concern", disposition: "optional", summary: "Ordinary finding" },
+          ],
+        };
+      },
+    });
+
+    // Aggregation: architect plan concerns and remarkable decisions reach taskWt.
+    expect(concernIds("c-")).toEqual([dismissedId, routedId].sort());
+    expect(concernIds("rm-")).toHaveLength(1);
+
+    // Same vocabulary as the item reviewer: dismiss keeps the reason, other
+    // dispositions route, and ordinary finding ids are ignored.
+    const dismissed = await storedConcern(dismissedId);
+    expect(dismissed.status).toBe("dismissed");
+    expect(dismissed.dismissReason).toBe("covered by the plan ADR");
+
+    const routed = await storedConcern(routedId);
+    expect(routed.status).toBe("routed");
+    expect(routed.disposition).toBe("optional");
+
+    const [rmId] = concernIds("rm-");
+    const remarkable = await readYaml<Record<string, any>>(
+      path.join(concernsDir(), `${rmId}.yaml`)
+    );
+    expect(remarkable.status).toBe("dismissed");
+    expect(remarkable.dismissReason).toBe("documented alternative is enough");
+    expect(fs.existsSync(path.join(concernsDir(), "s-not-a-concern.yaml"))).toBe(false);
+
+    // Hydration: the plan reviewer sees every open concern id before triage.
+    expect(reviewRun.prompts).toHaveLength(1);
+    for (const id of [dismissedId, routedId, ...concernIds("rm-")]) {
+      expect(reviewRun.prompts[0]).toContain(id);
+    }
+  });
+
+  it("aggregates architect-revise concerns and remarkable rm-* for the next review round", async () => {
+    const harness = new FakeHarness();
+    const planConcernId = concernFingerprint({
+      kind: "tech-debt",
+      summary: "Plan seeds a triaged concern before round one",
+      affects: ["m1"],
+    });
+    const reviseConcernId = concernFingerprint({
+      kind: "assumption",
+      summary: "Plan assumes an in-memory queue survives restart",
+      affects: ["m1"],
+    });
+    let firstPrompt = "";
+    let secondPrompt = "";
+
+    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
+      ok: true,
+      data: planData({
+        concerns: [
+          {
+            kind: "tech-debt",
+            summary: "Plan seeds a triaged concern before round one",
+            detail: "Seeded so round two proves open-only hydration",
+            severity: "medium",
+            affects: ["m1"],
+          },
+        ],
+      }),
+    });
+    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, (run) => {
+      firstPrompt = run.prompt;
+      return {
+        ok: true,
+        data: {
+          status: "changes_requested",
+          summary: "Plan needs a durability story",
+          suggestions: [
+            { id: "s-plan-gap", disposition: "fix", summary: "Add durability to the plan" },
+            { id: planConcernId, disposition: "optional", summary: "Seeded plan concern routed" },
+          ],
+        },
+      };
+    });
+    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, {
+      ok: true,
+      data: planData({
+        concerns: [
+          {
+            kind: "assumption",
+            summary: "Plan assumes an in-memory queue survives restart",
+            detail: "Persist the queue before acknowledging",
+            severity: "high",
+            affects: ["m1"],
+          },
+        ],
+        remarkable: [
+          {
+            chosen: "Lease-based queue",
+            alternatives: ["In-memory queue", "External broker"],
+            why: "restart safety without a new dependency",
+          },
+        ],
+      }),
+    });
+    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, (run) => {
+      secondPrompt = run.prompt;
+      const [rmId] = concernIds("rm-");
+      return {
+        ok: true,
+        data: {
+          status: "approved",
+          summary: "Revised plan approved",
+          suggestions: [
+            { id: reviseConcernId, disposition: "architect", summary: "Carry to architect" },
+            { id: rmId, disposition: "optional", summary: "Keep as debt" },
+          ],
+        },
+      };
+    });
+    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: { iteration: 1, items: [] },
+    });
+
+    await runIteration({
+      task: TASK,
+      taskDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+    });
+
+    // Revise producer output aggregated into the same store as the plan output.
+    const reviseConcern = await storedConcern(reviseConcernId);
+    expect(reviseConcern.source.agent).toBe("architect");
+    expect(reviseConcern.source.step).toBe("architect-revise-1-1");
+    const rmId = concernIds("rm-")[0]!;
+    expect(rmId).toMatch(/^rm-[0-9a-f]{10}$/);
+
+    // Non-dismiss dispositions route; the remarkable file routes too.
+    const planConcern = await storedConcern(planConcernId);
+    expect(planConcern.status).toBe("routed");
+    expect(planConcern.disposition).toBe("optional");
+    const routedConcern = await storedConcern(reviseConcernId);
+    expect(routedConcern.status).toBe("routed");
+    expect(routedConcern.disposition).toBe("architect");
+    const remarkable = await readYaml<Record<string, any>>(
+      path.join(concernsDir(), `${rmId}.yaml`)
+    );
+    expect(remarkable.status).toBe("routed");
+    expect(remarkable.disposition).toBe("optional");
+
+    // Hydration is open-only: round one sees the seeded concern, round two
+    // sees only the revise concern and remarkable id.
+    expect(firstPrompt).toContain(planConcernId);
+    expect(secondPrompt).toContain(reviseConcernId);
+    expect(secondPrompt).toContain(rmId);
+    expect(secondPrompt).not.toContain(planConcernId);
+  });
+
+  it("keeps triage ids out of the plan fix loop so they never trigger a revision", async () => {
+    const harness = new FakeHarness();
+    const concernId = concernFingerprint({
+      kind: "tech-debt",
+      summary: "Plan duplicates the retry helper",
+      affects: ["m1"],
+    });
+    let revised = false;
+
+    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
+      ok: true,
+      data: planData({
+        concerns: [
+          {
+            kind: "tech-debt",
+            summary: "Plan duplicates the retry helper",
+            detail: "Use one shared helper",
+            severity: "medium",
+            affects: ["m1"],
+          },
+        ],
+      }),
+    });
+    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+      ok: true,
+      data: {
+        status: "changes_requested",
+        summary: "Triage only",
+        suggestions: [
+          { id: concernId, disposition: "fix", summary: "Resolve the plan debt" },
+        ],
+      },
+    });
+    // Scripted so a regression that revises is observable rather than crashing.
+    harness.scriptOutcome(`${TASK}/runs/architect-revise-1-1#a1`, () => {
+      revised = true;
+      return { ok: true, data: planData() };
+    });
+    harness.scriptOutcome(`${TASK}/runs/plan-review-1-2#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Second round", suggestions: [] },
+    });
+    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: { iteration: 1, items: [] },
+    });
+
+    await runIteration({
+      task: TASK,
+      taskDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+    });
+
+    const triaged = await storedConcern(concernId);
+    expect(triaged.status).toBe("routed");
+    expect(triaged.disposition).toBe("fix");
+
+    expect(revised).toBe(false);
+    const labels = runLabels(harness);
+    expect(labels).not.toContain(`${TASK}/runs/architect-revise-1-1#a1`);
+    expect(labels).not.toContain(`${TASK}/runs/plan-review-1-2#a1`);
+  });
+
+  it("derives debt from routed tech-debt concerns and routed optional dispositions only", async () => {
+    const dir = concernsDir();
+    const stored = (
+      id: string,
+      overrides: Partial<StoredConcernArtifact>
+    ): StoredConcernArtifact => ({
+      id,
+      kind: "risk",
+      summary: `Concern ${id}`,
+      detail: `Detail ${id}`,
+      severity: "medium",
+      status: "open",
+      source: { record: "001-plan-review-a1", agent: "plan-reviewer" },
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+      ...overrides,
+    });
+
+    await writeYamlAtomic(
+      path.join(dir, "c-debtrouted.yaml"),
+      stored("c-debtrouted", {
+        kind: "tech-debt",
+        summary: "Plan duplicated the retry helper",
+        status: "routed",
+      })
+    );
+    await writeYamlAtomic(
+      path.join(dir, "c-optionalrouted.yaml"),
+      stored("c-optionalrouted", {
+        kind: "risk",
+        summary: "Defer contract hardening",
+        status: "routed",
+        disposition: "optional",
+      })
+    );
+    await writeYamlAtomic(
+      path.join(dir, "c-debtopen.yaml"),
+      stored("c-debtopen", {
+        kind: "tech-debt",
+        summary: "Open debt stays a concern",
+        status: "open",
+      })
+    );
+    await writeYamlAtomic(
+      path.join(dir, "c-optionaldismissed.yaml"),
+      stored("c-optionaldismissed", {
+        kind: "risk",
+        summary: "Dismissed optional is not debt",
+        status: "dismissed",
+        disposition: "dismiss",
+        dismissReason: "not worth tracking",
+      })
+    );
+    await writeYamlAtomic(
+      path.join(dir, "c-riskrouted.yaml"),
+      stored("c-riskrouted", {
+        kind: "risk",
+        summary: "Routed risk without optional is not debt",
+        status: "routed",
+        disposition: "architect",
+      })
+    );
+
+    const state = await deriveTaskState({
+      taskDir,
+      task: TASK,
+      taskWt,
+      pipeline,
+      project,
+    });
+
+    expect(state.debt).toContain("Plan duplicated the retry helper");
+    expect(state.debt).toContain("Defer contract hardening");
+    expect(state.debt).not.toContain("Open debt stays a concern");
+    expect(state.debt).not.toContain("Dismissed optional is not debt");
+    expect(state.debt).not.toContain("Routed risk without optional is not debt");
+  });
+});
diff --git a/plugins/software-factory/test/human-involvement-config.test.ts b/plugins/software-factory/test/human-involvement-config.test.ts
index f85b2d4..9695c32 100644
--- a/plugins/software-factory/test/human-involvement-config.test.ts
+++ b/plugins/software-factory/test/human-involvement-config.test.ts
@@ -61,7 +61,7 @@ const DEFAULT_RAISE_ALLOWLIST = [
 const FRAGMENT_MATRIX: Record<string, string[]> = {
   review: ["humanInvolvementCriteria", "concernsYaml"],
   qa: ["humanInvolvementCriteria", "concernsYaml"],
-  "plan-review": ["humanInvolvementCriteria"],
+  "plan-review": ["humanInvolvementCriteria", "concernsYaml"],
   "wave-close-up": ["humanInvolvementCriteria", "concernsYaml"],
   "plan-close-up": ["humanInvolvementCriteria", "concernsYaml"],
   "architect-plan": ["humanInvolvementCriteria", "concernsYaml"],

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
