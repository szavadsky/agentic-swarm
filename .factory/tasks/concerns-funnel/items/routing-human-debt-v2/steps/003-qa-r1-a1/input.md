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
  "slug": "routing-human-debt-v2",
  "kind": "dev",
  "title": "Human mailbox and debt routing",
  "assignment": "Human mailbox + debt routing: human-async blocks [item] and continues without exit-10, human-stop blocks task/item + exit-10 halt + blocked derive, human-awareness blocks [] digest-only never blocking/exiting, debt predicate kind==tech-debt routed/resolved OR disposition==optional routed. Tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
  "outlineRef": "routing-human-debt-v2",
  "milestone": "m3-routing",
  "wave": 8,
  "deps": [
    "modes-prompts-v2",
    "reviewer-triage-v2"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..2927059
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,31 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/routing-human-debt.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 5 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-human-debt.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794133065617-zxskj7pgta.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - Human mailbox and debt routing (§8.7, §18).derives item blocking and
+          task continuation per human disposition
+        - Human mailbox and debt routing (§8.7, §18).halts with exit 10 and
+          writes a task/item human-stop mailbox entry
+        - Human mailbox and debt routing (§8.7, §18).writes a digest-only
+          human-awareness entry and continues to completion
+        - Human mailbox and debt routing (§8.7, §18).keeps running other items
+          while one item waits on human-async
+        - Human mailbox and debt routing (§8.7, §18).collects debt with [item]
+          prefixes for routed/resolved tech-debt and routed optional concerns
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..e213b63
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,53 @@
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
+  "slug": "routing-human-debt-v2",
+  "kind": "dev",
+  "title": "Human mailbox and debt routing",
+  "assignment": "Human mailbox + debt routing: human-async blocks [item] and continues without exit-10, human-stop blocks task/item + exit-10 halt + blocked derive, human-awareness blocks [] digest-only never blocking/exiting, debt predicate kind==tech-debt routed/resolved OR disposition==optional routed. Tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
+  "outlineRef": "routing-human-debt-v2",
+  "milestone": "m3-routing",
+  "wave": 8,
+  "deps": [
+    "modes-prompts-v2",
+    "reviewer-triage-v2"
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..010edb8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T10:03:13.974Z
+session: 01a1ba9c-b4a7-758b-82c9-fe03a489c965
+endedAt: 2026-11-08T10:17:51.293Z
+usage:
+  inputTokens: 145861
+  outputTokens: 41375
+  costUsd: 0.063633
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-03-14-471Z_01a1ba9c-b4a7-758b-82c9-fe03a489c965.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..9b3b972
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,62 @@
+status: ok
+summary: "Authored 5 test-first behavior tests in
+  test/engine/routing-human-debt.test.ts specifying human mailbox routing and
+  debt accounting. Tests pin: human-async blocks only [item] and lets the task
+  continue without a blocked derive/exit-10; human-stop writes a mailbox entry
+  blocking item+task, derives blocked state and halts runTask with exit 10;
+  human-awareness writes a digest entry with empty blocks and never blocks or
+  exits; and derive debt includes '[item] summary' entries for routed/resolved
+  tech-debt concerns and routed optional concerns. No production code was
+  modified (only the new test file exists). Verified typecheck green; target
+  file red with 5 assertion failures and 0 errors; JUnit ids match all declared
+  expectRed ids with status fail; full suite has exactly those 5 failures (350
+  pass, 2 skip)."
+target:
+  selectors:
+    - test/engine/routing-human-debt.test.ts
+  expectRed:
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).derives item blocking and task continuation per human
+      disposition
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).halts with exit 10 and writes a task/item human-stop mailbox
+      entry
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).writes a digest-only human-awareness entry and continues to
+      completion
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).keeps running other items while one item waits on human-async
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).collects debt with [item] prefixes for routed/resolved
+      tech-debt and routed optional concerns
+evidence:
+  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
+    --noEmit)."
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/routing-human-debt.test.ts --reporter=junit
+    --reporter-outfile=/tmp/routing-junit.xml: exit 1, 0 pass / 5 fail / 0
+    errors; every failure is an expect() assertion failure (not.toBe, toBe,
+    toHaveLength, toEqual), so target-red is genuine."
+  - "JUnit verification with src/core/checks/junit.ts parseJunit plus the
+    engine's normaliseCaseId/findMatchingCase logic: all 5 declared expectRed
+    ids resolve to cases with status fail and collected=true."
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test: 350 pass, 2 skip, 5
+    fail across 59 files; the only failures are the 5 new routing-human-debt
+    tests, so existing behavior is unregressed."
+  - "git status --short: only '??
+    plugins/software-factory/test/engine/routing-human-debt.test.ts'; no
+    existing production or test files modified."
+concerns:
+  - The human-async test pins exit code 0 / status done when an async-blocked
+    item coexists with completed work, per the assignment wording 'continues
+    without exit-10'; the develop step will need iteration/derive changes so
+    async item blocking does not terminate the run as blocked.
+  - The derive test asserts human-awareness entries referencing an item remain
+    non-blocking, so derive logic must become disposition-aware (or awareness
+    entries must never be treated as item-blocking refs).
+notes: Tests use the existing public APIs runTask,
+  deriveItemState/deriveTaskState and writeQuestion, so no interface stubs were
+  needed. All close-up/plan steps are scripted so current (incorrect) paths
+  terminate in assertions rather than FakeHarness 'no scripted outcome' errors.
+  Test ids use bun's JUnit classname.name form with the file selector prefix
+  accepted by the engine id normalizer.
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..fb62c65
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,84 @@
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
+        durationMs: 5033
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 78591
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-ZsZnFX/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3755728
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3755728
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3755728
+
+           355 pass
+           2 skip
+           0 fail
+           1664 expect() calls
+          Ran 357 tests across 59 files. [78.42s]
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
+        test/engine/routing-human-debt.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794133626175-1shf4qzb78v.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - Human mailbox and debt routing (§8.7, §18).derives item blocking and
+          task continuation per human disposition
+        - Human mailbox and debt routing (§8.7, §18).halts with exit 10 and
+          writes a task/item human-stop mailbox entry
+        - Human mailbox and debt routing (§8.7, §18).writes a digest-only
+          human-awareness entry and continues to completion
+        - Human mailbox and debt routing (§8.7, §18).keeps running other items
+          while one item waits on human-async
+        - Human mailbox and debt routing (§8.7, §18).collects debt with [item]
+          prefixes for routed/resolved tech-debt and routed optional concerns
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 98/300 production lines changed"
+    details:
+      changedLines:
+        added: 63
+        deleted: 35
+        total: 98
+        files:
+          - plugins/software-factory/src/core/derive/item.ts
+          - plugins/software-factory/src/core/derive/task.ts
+          - plugins/software-factory/src/core/flows/item-machine.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/steer.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..8ad2f69
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,63 @@
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
+  "slug": "routing-human-debt-v2",
+  "kind": "dev",
+  "title": "Human mailbox and debt routing",
+  "assignment": "Human mailbox + debt routing: human-async blocks [item] and continues without exit-10, human-stop blocks task/item + exit-10 halt + blocked derive, human-awareness blocks [] digest-only never blocking/exiting, debt predicate kind==tech-debt routed/resolved OR disposition==optional routed. Tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
+  "outlineRef": "routing-human-debt-v2",
+  "milestone": "m3-routing",
+  "wave": 8,
+  "deps": [
+    "modes-prompts-v2",
+    "reviewer-triage-v2"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/routing-human-debt.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).derives item blocking and task continuation per human disposition",
+    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).halts with exit 10 and writes a task/item human-stop mailbox entry",
+    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).writes a digest-only human-awareness entry and continues to completion",
+    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).keeps running other items while one item waits on human-async",
+    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).collects debt with [item] prefixes for routed/resolved tech-debt and routed optional concerns"
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..5bfffa4
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T10:18:38.751Z
+session: 01a1baaa-d0f3-77d1-abac-a7e4bbba6613
+endedAt: 2026-11-08T10:27:10.681Z
+usage:
+  inputTokens: 92376
+  outputTokens: 26653
+  costUsd: 0.042942
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T10-18-39-219Z_01a1baaa-d0f3-77d1-abac-a7e4bbba6613.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..c092f37
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-human-debt-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,51 @@
+status: ok
+summary: Implemented human mailbox disposition routing and debt collection.
+  Added a shared questionBlocks predicate so human-awareness never blocks, while
+  human-async blocks [item] and human-stop blocks [item, task]. Review
+  suggestions now write mailbox entries for all three human dispositions
+  (human-stop writes blocks [item, task]; awareness writes digest-only with no
+  blocks), item ticks halt on human-async/human-stop, task derivation treats
+  human-async items as parked rather than task-blocking, and iteration halts
+  only when every item is blocked or a human-stop is raised. Task debt now uses
+  the canonical isDebtConcern predicate (routed/resolved tech-debt or routed
+  optional) and prefixes entries with [item].
+target:
+  selectors:
+    - test/engine/routing-human-debt.test.ts
+  expectRed:
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).derives item blocking and task continuation per human
+      disposition
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).halts with exit 10 and writes a task/item human-stop mailbox
+      entry
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).writes a digest-only human-awareness entry and continues to
+      completion
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).keeps running other items while one item waits on human-async
+    - test/engine/routing-human-debt.test.ts::Human mailbox and debt routing
+      (§8.7, §18).collects debt with [item] prefixes for routed/resolved
+      tech-debt and routed optional concerns
+evidence:
+  - cd plugins/software-factory && bun test
+    test/engine/routing-human-debt.test.ts -> 5 pass, 0 fail, 28 expect() calls
+    (all five target cases green)
+  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+    with no diagnostics
+  - cd plugins/software-factory && bun test -> 355 pass, 2 skip, 0 fail across
+    59 files (1664 expect calls)
+  - cd plugins/software-factory && bun test
+    test/engine/human-async-steering.test.ts test/engine/reviewer-triage.test.ts
+    test/engine/blocked-closeup-iteration.test.ts -> 13 pass, 0 fail (existing
+    routing/blocking behavior preserved)
+  - git status shows only the five intended production files modified; no test
+    files or fixtures changed
+concerns:
+  - An iteration whose items are all human-async blocked still halts with exit
+    10 to preserve existing single-item human-async behavior; human-async only
+    lets the task continue when other items make progress.
+notes: Mailbox ids are deterministic (q-<item>-<suggestion-id>), so re-running
+  the same review does not duplicate or clobber an answered question. Concern-id
+  human-async suggestions remain triaged via q-concern-*; human-stop and
+  human-awareness suggestions always reach the item mailbox.
diff --git a/plugins/software-factory/src/core/derive/item.ts b/plugins/software-factory/src/core/derive/item.ts
index 925d1f7..28fdc86 100644
--- a/plugins/software-factory/src/core/derive/item.ts
+++ b/plugins/software-factory/src/core/derive/item.ts
@@ -18,6 +18,7 @@ import { childBranch } from "../git/naming.js";
 import { isAncestor } from "../git/commit.js";
 import { fingerprintSuggestions, fingerprintCheckFailure } from "../loops.js";
 import { getDefaultFlowForKind } from "../flows/item-machine.js";
+import { questionBlocks } from "../steer.js";
 
 export interface ItemStepRecordInfo {
   dirName: string;
@@ -256,11 +257,7 @@ export async function deriveItemState(opts: {
       try {
         const qPath = path.join(steerDir, sent.name);
         const q = await readYaml<SteerItemArtifact>(qPath);
-        if (
-          q &&
-          q.status === "open" &&
-          (q.ref === itemSlug || q.ref === `${taskDir.split("/").pop()}/${itemSlug}`)
-        ) {
+        if (q && questionBlocks(q, itemSlug)) {
           openSteerQuestion = q;
           break;
         }
diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
index 7128367..37d1e24 100644
--- a/plugins/software-factory/src/core/derive/task.ts
+++ b/plugins/software-factory/src/core/derive/task.ts
@@ -17,6 +17,8 @@ import { deriveItemState, type DerivedItemState } from "./item.js";
 import { deriveWaveState, type DerivedWaveState } from "./wave.js";
 import { BudgetTracker } from "../budget.js";
 import { listConcerns } from "../concerns.js";
+import { isDebtConcern } from "../triage.js";
+import { questionBlocks } from "../steer.js";
 import { git } from "../git/exec.js";
 import { isAncestor } from "../git/commit.js";
 
@@ -191,11 +193,11 @@ export async function deriveTaskState(opts: {
       }
     }
   }
-  // From concerns: routed tech-debt, or any routed concern dispositioned optional
+  // From concerns: debt predicate (routed/resolved tech-debt, routed optional)
   for (const concern of await listConcerns(taskDir)) {
-    if (concern.status === "routed" && (concern.kind === "tech-debt" || concern.disposition === "optional")) {
-      debtSet.add(concern.summary);
-    }
+    if (!isDebtConcern(concern)) continue;
+    const item = concern.source?.item ?? concern.affects?.[0];
+    debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
   }
   // From review suggestions with disposition optional
   for (const it of items) {
@@ -219,8 +221,8 @@ export async function deriveTaskState(opts: {
   // 9. Overall task status determination (§6.3 Invariant 4)
   let status: "active" | "blocked" | "done" | "failed" = "active";
 
-  const hasTaskLevelOpenQuestion = openSteerQuestions.some(
-    (q) => q.status === "open" && (q.ref === "plan" || q.ref === task || q.blocks?.includes("task"))
+  const hasTaskLevelOpenQuestion = openSteerQuestions.some((q) =>
+    questionBlocks(q, "task")
   );
 
   if (hasTaskLevelOpenQuestion) {
@@ -230,7 +232,7 @@ export async function deriveTaskState(opts: {
   } else if (lastCloseup?.status === "blocked") {
     // Finding 6: An answered blocked close-up starts iteration N+1
     const closeupQuestion = openSteerQuestions.find(
-      (q) => q.ref === "plan" || q.id === `closeup-${iteration}`
+      (q) => questionBlocks(q, "task") || q.id === `closeup-${iteration}`
     );
     if (closeupQuestion && closeupQuestion.status === "open") {
       status = "blocked";
@@ -239,7 +241,11 @@ export async function deriveTaskState(opts: {
       status = "active";
     }
   } else if (items.length > 0 && items.every((it) => it.status === "blocked")) {
-    status = "blocked";
+    // human-async parks an item, not the task; only mixed/other blocks halt it.
+    const blockedByNonAsync = items.some(
+      (it) => it.status === "blocked" && it.openSteerQuestion?.disposition !== "human-async"
+    );
+    if (blockedByNonAsync) status = "blocked";
   } else if (items.length > 0 && items.some((it) => it.status === "failed")) {
     status = "failed";
   } else if (triage?.kind === "simple") {
diff --git a/plugins/software-factory/src/core/flows/item-machine.ts b/plugins/software-factory/src/core/flows/item-machine.ts
index a5955a1..3388065 100644
--- a/plugins/software-factory/src/core/flows/item-machine.ts
+++ b/plugins/software-factory/src/core/flows/item-machine.ts
@@ -707,8 +707,8 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
     beforeChecks,
     afterChecks,
     writeArtifact: async (output: unknown) => {
-      // Persist human-async questions atomically with the review record (Finding 23).
-      // Concern ids are triaged separately (q-concern-*) and never use this mailbox.
+      // Persist human-* questions atomically with the review record (Finding 23).
+      // human-async concern ids are triaged separately (q-concern-*).
       if (output && typeof output === "object" && "suggestions" in (output as any)) {
         const rev = output as ReviewArtifact;
         const concernIds = new Set<string>();
@@ -719,21 +719,27 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
         } catch (err: any) {
           if (err?.code !== "ENOENT") throw err;
         }
-        const asyncQuestions = rev.suggestions?.filter(
-          (s) => s.disposition === "human-async" && !concernIds.has(s.id)
+        const humanSuggestions = rev.suggestions?.filter(
+          (s) =>
+            s.disposition === "human-stop" ||
+            s.disposition === "human-awareness" ||
+            (s.disposition === "human-async" && !concernIds.has(s.id))
         );
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
+        for (const q of humanSuggestions ?? []) {
+          const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
+          const blocks =
+            q.disposition === "human-stop"
+              ? [itemSlug, "task"]
+              : q.disposition === "human-async"
+                ? [itemSlug]
+                : [];
+          await writeQuestion(taskWt, taskDir, {
+            id: `q-${itemSlug}-${cleanSuggestionId}`,
+            ref: itemSlug,
+            disposition: q.disposition,
+            question: q.detail || q.summary,
+            blocks,
+          });
         }
       }
     },
@@ -758,11 +764,11 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
     item: itemSlug,
   });
 
-  // Check if any human-async suggestions blocked the item
-  const hasAsync = (stepRes.output as any)?.suggestions?.some(
-    (s: any) => s.disposition === "human-async"
+  // Human dispositions block the item; human-awareness is digest-only and lands here as success.
+  const hasHumanBlock = (stepRes.output as any)?.suggestions?.some(
+    (s: any) => s.disposition === "human-async" || s.disposition === "human-stop"
   );
-  if (hasAsync) {
+  if (hasHumanBlock) {
     return { done: true, status: "blocked", stepRan: currentStep.id };
   }
 
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index 58b8bd6..b0ccb90 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -1080,8 +1080,15 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
       deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
     )
   );
-  const hasBlockedItems = allCurrentStates.some((it) => it.status === "blocked");
-  if (hasBlockedItems) {
+  // human-async parks one item while the rest of the plan moves on; only an
+  // entirely parked iteration or a human-stop halts the run.
+  const everyItemBlocked =
+    allCurrentStates.length > 0 &&
+    allCurrentStates.every((it) => it.status === "blocked");
+  const humanStopBlocked = allCurrentStates.some(
+    (it) => it.status === "blocked" && it.openSteerQuestion?.disposition === "human-stop"
+  );
+  if (everyItemBlocked || humanStopBlocked) {
     return {
       iteration,
       status: "blocked",
diff --git a/plugins/software-factory/src/core/steer.ts b/plugins/software-factory/src/core/steer.ts
index ea702ff..207f45f 100644
--- a/plugins/software-factory/src/core/steer.ts
+++ b/plugins/software-factory/src/core/steer.ts
@@ -109,6 +109,18 @@ export async function writeQuestion(
   return item;
 }
 
+/**
+ * Returns true when an open mailbox question blocks `target` (an item slug or
+ * `"task"`) (§8.7). Explicit `blocks` wins; without it a question blocks its
+ * own ref. `human-awareness` is digest-only and never blocks.
+ */
+export function questionBlocks(q: SteerItemArtifact, target: string): boolean {
+  if (q.status !== "open" || q.disposition === "human-awareness") return false;
+  if (Array.isArray(q.blocks)) return q.blocks.includes(target);
+  if (q.ref === target || q.ref.endsWith(`/${target}`)) return true;
+  return target === "task" && q.ref === "plan";
+}
+
 /**
  * Classifies an incoming pending message via `harness.complete` using the
  * `steer-classify` system prompt and `steer-classification` schema (§8.8).
diff --git a/plugins/software-factory/test/engine/routing-human-debt.test.ts b/plugins/software-factory/test/engine/routing-human-debt.test.ts
new file mode 100644
index 0000000..9d6e699
--- /dev/null
+++ b/plugins/software-factory/test/engine/routing-human-debt.test.ts
@@ -0,0 +1,523 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runTask } from "../../src/core/engine.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { writeQuestion } from "../../src/core/steer.js";
+import { deriveItemState } from "../../src/core/derive/item.js";
+import { deriveTaskState } from "../../src/core/derive/task.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StateArtifact,
+  SteerItemArtifact,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Human mailbox + debt routing (docs/factory.v2.md §18; ADRs
+ * adr-routing-derived-state, adr-digest-mailbox).
+ *
+ * Dispositions route differently:
+ * - human-async blocks [item] and lets the task continue without exit 10.
+ * - human-stop blocks task/item, derives a blocked task and halts with exit 10.
+ * - human-awareness is digest-only: blocks [] and never blocks or exits.
+ * Tech-debt concerns (routed/resolved) and routed `optional` concerns feed the
+ * task debt list as `[item] summary`.
+ */
+const ORCH = ".factory";
+
+describe("Human mailbox and debt routing (§8.7, §18)", () => {
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
+  function taskDirFor(task: string): string {
+    const dir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(dir, { recursive: true });
+    fs.writeFileSync(path.join(dir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
+    tmpRepo.commit(`add ${task} intent`);
+    return dir;
+  }
+
+  function writeAssignment(taskDir: string, slug: string): void {
+    const itemDir = path.join(taskDir, "items", slug);
+    fs.mkdirSync(itemDir, { recursive: true });
+    fs.writeFileSync(
+      path.join(itemDir, "assignment.yaml"),
+      JSON.stringify(
+        {
+          slug,
+          kind: "dev",
+          title: `Item ${slug}`,
+          assignment: `Implement ${slug}`,
+          milestone: "m1",
+          wave: 1,
+          deps: [],
+        },
+        null,
+        2
+      )
+    );
+  }
+
+  async function clearMailbox(taskDir: string): Promise<void> {
+    await fs.promises.rm(path.join(taskDir, "steer", "tousertoreview"), {
+      recursive: true,
+      force: true,
+    });
+  }
+
+  async function mailboxQuestions(taskDir: string): Promise<SteerItemArtifact[]> {
+    const dir = path.join(taskDir, "steer", "tousertoreview");
+    if (!fs.existsSync(dir)) return [];
+    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
+    return Promise.all(
+      names.map((n) => readYaml<SteerItemArtifact>(path.join(dir, n)))
+    );
+  }
+
+  it("derives item blocking and task continuation per human disposition", async () => {
+    const task = "dispositions";
+    const taskDir = taskDirFor(task);
+    writeAssignment(taskDir, "item-1");
+
+    const derive = async () => ({
+      item: await deriveItemState({
+        taskDir,
+        itemSlug: "item-1",
+        parentBranch: `topic/${task}`,
+      }),
+      task: await deriveTaskState({ taskDir, task, parentBranch: `topic/${task}` }),
+    });
+
+    // human-async: the item blocks; the task keeps running (no exit-10 derive).
+    await writeQuestion(tmpRepo.dir, taskDir, {
+      id: "q-async",
+      ref: "item-1",
+      disposition: "human-async",
+      question: "Which retry strategy?",
+      blocks: ["item-1"],
+    });
+    const asyncState = await derive();
+    expect(asyncState.item.status).toBe("blocked");
+    expect(asyncState.task.status).not.toBe("blocked");
+
+    // human-stop: both the item and the task derive blocked.
+    await clearMailbox(taskDir);
+    await writeQuestion(tmpRepo.dir, taskDir, {
+      id: "q-stop",
+      ref: "item-1",
+      disposition: "human-stop",
+      question: "Irreversible data-loss hazard",
+      blocks: ["item-1", "task"],
+    });
+    const stopState = await derive();
+    expect(stopState.item.status).toBe("blocked");
+    expect(stopState.task.status).toBe("blocked");
+
+    // human-awareness: digest-only, never blocking.
+    await clearMailbox(taskDir);
+    await writeQuestion(tmpRepo.dir, taskDir, {
+      id: "q-awareness",
+      ref: "item-1",
+      disposition: "human-awareness",
+      question: "Notable tradeoff recorded for the operator",
+      blocks: [],
+    });
+    const awarenessState = await derive();
+    expect(awarenessState.item.status).not.toBe("blocked");
+    expect(awarenessState.task.status).not.toBe("blocked");
+  });
+
+  it("halts with exit 10 and writes a task/item human-stop mailbox entry", async () => {
+    const task = "stop-flow";
+    const taskDir = taskDirFor(task);
+    const worktreeRoot = path.join(tmpRepo.dir + "-stop-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    const harness = new FakeHarness();
+    const { pipeline, project, prompts } = engineFixture(task, worktreeRoot, harness, [
+      { slug: "item-1", title: "Item 1" },
+    ], {
+      "item-1": {
+        status: "changes_requested",
+        summary: "Fatal safety hazard",
+        suggestions: [
+          {
+            id: "stop-1",
+            disposition: "human-stop",
+            summary: "Irreversible data loss hazard",
+            detail: "Stop before writing anything else",
+          },
+        ],
+      },
+    });
+
+    const res = await runTask(
+      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
+      task,
+      { maxTicks: 20 }
+    );
+
+    expect(res.status).toBe("blocked");
+    expect(res.exitCode).toBe(10);
+
+    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, ORCH, task);
+    const questions = await mailboxQuestions(deployedTaskDir);
+    expect(questions).toHaveLength(1);
+    expect(questions[0]!.disposition).toBe("human-stop");
+    expect([...(questions[0]!.blocks ?? [])].sort()).toEqual(["item-1", "task"]);
+
+    const state = await readYaml<StateArtifact>(
+      path.join(deployedTaskDir, "state.yaml")
+    );
+    expect(state.status).toBe("blocked");
+    expect(state.items["item-1"]?.status).toBe("blocked");
+  });
+
+  it("writes a digest-only human-awareness entry and continues to completion", async () => {
+    const task = "awareness-flow";
+    const taskDir = taskDirFor(task);
+    const worktreeRoot = path.join(tmpRepo.dir + "-awareness-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    const harness = new FakeHarness();
+    const { pipeline, project, prompts } = engineFixture(task, worktreeRoot, harness, [
+      { slug: "item-1", title: "Item 1" },
+    ], {
+      "item-1": {
+        status: "changes_requested",
+        summary: "Notable tradeoff",
+        suggestions: [
+          {
+            id: "aware-1",
+            disposition: "human-awareness",
+            summary: "Chose an in-memory index over a database",
+            detail: "Operator should know, but no decision is needed now",
+          },
+        ],
+      },
+    });
+
+    const res = await runTask(
+      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
+      task,
+      { maxTicks: 20 }
+    );
+
+    expect(res.status).toBe("done");
+    expect(res.exitCode).toBe(0);
+
+    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, ORCH, task);
+    const questions = await mailboxQuestions(deployedTaskDir);
+    expect(questions).toHaveLength(1);
+    expect(questions[0]!.disposition).toBe("human-awareness");
+    expect(questions[0]!.blocks ?? []).toEqual([]);
+
+    const state = await readYaml<StateArtifact>(
+      path.join(deployedTaskDir, "state.yaml")
+    );
+    expect(state.status).toBe("done");
+    expect(state.items["item-1"]?.status).toBe("merged");
+  });
+
+  it("keeps running other items while one item waits on human-async", async () => {
+    const task = "async-flow";
+    const taskDir = taskDirFor(task);
+    const worktreeRoot = path.join(tmpRepo.dir + "-async-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    const harness = new FakeHarness();
+    const { pipeline, project, prompts } = engineFixture(task, worktreeRoot, harness, [
+      { slug: "item-a", title: "Item A" },
+      { slug: "item-b", title: "Item B" },
+    ], {
+      "item-a": {
+        status: "changes_requested",
+        summary: "Needs an operator answer",
+        suggestions: [
+          {
+            id: "async-1",
+            disposition: "human-async",
+            summary: "Which storage backend?",
+            detail: "Operator must choose before this item proceeds",
+          },
+        ],
+      },
+      "item-b": { status: "approved", summary: "Approved", suggestions: [] },
+    });
+
+    const res = await runTask(
+      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
+      task,
+      { maxTicks: 30 }
+    );
+
+    // human-async must not halt the run with exit 10 while other work remains.
+    expect(res.status).toBe("done");
+    expect(res.exitCode).toBe(0);
+
+    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, ORCH, task);
+    const questions = await mailboxQuestions(deployedTaskDir);
+    expect(questions).toHaveLength(1);
+    expect(questions[0]!.disposition).toBe("human-async");
+    expect(questions[0]!.blocks ?? []).toEqual(["item-a"]);
+
+    const state = await readYaml<StateArtifact>(
+      path.join(deployedTaskDir, "state.yaml")
+    );
+    expect(state.items["item-a"]?.status).toBe("blocked");
+    expect(state.items["item-b"]?.status).toBe("merged");
+  });
+
+  it("collects debt with [item] prefixes for routed/resolved tech-debt and routed optional concerns", async () => {
+    const task = "debt-task";
+    const taskDir = taskDirFor(task);
+    writeAssignment(taskDir, "item-1");
+
+    const concernDir = path.join(taskDir, "concerns");
+    fs.mkdirSync(concernDir, { recursive: true });
+
+    const concern = (
+      id: string,
+      overrides: Partial<StoredConcernArtifact>
+    ): StoredConcernArtifact => ({
+      id,
+      kind: "tech-debt",
+      summary: `Concern ${id}`,
+      detail: "detail",
+      severity: "medium",
+      status: "routed",
+      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
+      affects: ["item-1"],
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+      ...overrides,
+    });
+
+    await writeYamlAtomic(
+      path.join(concernDir, "c-routed.yaml"),
+      concern("c-routed", { summary: "Routed tech debt" })
+    );
+    await writeYamlAtomic(
+      path.join(concernDir, "c-resolved.yaml"),
+      concern("c-resolved", { summary: "Resolved tech debt", status: "resolved" })
+    );
+    await writeYamlAtomic(
+      path.join(concernDir, "c-optional.yaml"),
+      concern("c-optional", {
+        kind: "risk",
+        summary: "Optional risk",
+        status: "routed",
+        disposition: "optional",
+      })
+    );
+    await writeYamlAtomic(
+      path.join(concernDir, "c-open.yaml"),
+      concern("c-open", { summary: "Open tech debt", status: "open" })
+    );
+    await writeYamlAtomic(
+      path.join(concernDir, "c-dismissed.yaml"),
+      concern("c-dismissed", { summary: "Dismissed tech debt", status: "dismissed" })
+    );
+    await writeYamlAtomic(
+      path.join(concernDir, "c-fix.yaml"),
+      concern("c-fix", {
+        kind: "risk",
+        summary: "Fixed risk",
+        status: "routed",
+        disposition: "fix",
+      })
+    );
+
+    const state = await deriveTaskState({
+      taskDir,
+      task,
+      parentBranch: `topic/${task}`,
+    });
+
+    expect(state.debt.slice().sort()).toEqual(
+      [
+        "[item-1] Optional risk",
+        "[item-1] Resolved tech debt",
+        "[item-1] Routed tech debt",
+      ].sort()
+    );
+  });
+
+  /**
+   * Builds a real task/repo fixture and scripts ingest, plan, PM edits, both
+   * items' steps and the wave/plan close-ups so any non-halting path finishes.
+   */
+  function engineFixture(
+    task: string,
+    worktreeRoot: string,
+    harness: FakeHarness,
+    items: { slug: string; title: string }[],
+    reviewData: Record<string, unknown>
+  ): {
+    pipeline: PipelineConfig;
+    project: ProjectConfig;
+    prompts: ReturnType<typeof loadPromptLibrary>;
+  } {
+    const project: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot };
+    const pipeline: PipelineConfig = {
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
+        triage: { role: "workhorse" },
+        infra: { role: "workhorse" },
+        architect: { role: "architect" },
+        "plan-reviewer": { role: "alt-architect" },
+        pm: { role: "alt-workhorse" },
+        developer: { role: "workhorse" },
+        reviewer: { role: "alt-workhorse" },
+        "wave-close-up": { role: "alt-workhorse" },
+        "plan-close-up": { role: "alt-workhorse" },
+      },
+      flows: {
+        simple: { steps: [] },
+        story: {
+          dev: {
+            fixLoopTo: "develop",
+            steps: [
+              { id: "develop", agent: "developer", role: "workhorse" },
+              { id: "review", agent: "reviewer", role: "alt-workhorse" },
+            ],
+          },
+        },
+        spike: {},
+      },
+      reviewPolicy: {
+        default: [
+          "fix",
+          "optional",
+          "architect",
+          "human-awareness",
+          "human-async",
+          "human-stop",
+        ],
+      },
+      limits: {
+        maxParallelItems: 2,
+        maxParallelTurns: 4,
+        maxStepAttempts: 3,
+        maxFixRounds: 3,
+      },
+    };
+    const prompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+      overrideDirs: [],
+    });
+
+    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+      ok: true,
+      data: { kind: "story", rationale: "Routing flow", citations: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/infra#a1`, {
+      ok: true,
+      data: {
+        setup: [],
+        gates: [{ id: "test", command: "true" }],
+        testRunner: { command: "true" },
+      },
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
+    for (const it of items) {
+      harness.scriptOutcome(`${task}/items/${it.slug}/develop#a1`, (run) => {
+        fs.writeFileSync(path.join(run.cwd, `${it.slug}.ts`), `export const ${it.slug.replace(/-/g, "_")} = 1;\n`);
+        return { ok: true, data: { status: "ok", summary: `Developed ${it.slug}` } };
+      });
+      harness.scriptOutcome(`${task}/items/${it.slug}/review#a1`, {
+        ok: true,
+        data: reviewData[it.slug] ?? {
+          status: "approved",
+          summary: "Approved",
+          suggestions: [],
+        },
+      });
+    }
+
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: {
+        wave: 1,
+        iteration: 1,
+        status: "complete",
+        mergedItems: [],
+        summary: "Wave report",
+      },
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
