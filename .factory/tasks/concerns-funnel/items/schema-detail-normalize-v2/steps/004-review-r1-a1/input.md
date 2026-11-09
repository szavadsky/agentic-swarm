# Step: Review

## Goal
Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.

## Rules
- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

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
  "slug": "schema-detail-normalize-v2",
  "kind": "dev",
  "title": "Lowercase detail in producer schemas + merge fix",
  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
  "outlineRef": "schema-detail-normalize-v2",
  "milestone": "m0-detail-normalize",
  "wave": 1,
  "scenarioRefs": [
    "m0-detail-normalize:s1",
    "m0-detail-normalize:s2",
    "m0-detail-normalize:s3"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..58cb64b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,31 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 1 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/schema-detail-normalize.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794212026188-8c9xdivk2ii.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - lowercase concern detail in producer schemas.accepts lowercase detail
+          and rejects capital-D Detail in every producer schema
+        - lowercase concern detail in producer schemas.keeps the reference-only
+          review schema on lowercase detail
+        - step-runner concern detail write gate.stores lowercase detail and
+          rejects capital-D Detail before any store write
+        - concern detail merge keeps the longest stored value.keeps a 200-byte
+          stored detail when a 20-byte detail is re-emitted
+        - concern detail merge keeps the longest stored value.keeps the stored
+          detail with more UTF-8 bytes when the re-emit has more characters
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..7e22bb7
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,63 @@
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
+  "slug": "schema-detail-normalize-v2",
+  "kind": "dev",
+  "title": "Lowercase detail in producer schemas + merge fix",
+  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
+  "outlineRef": "schema-detail-normalize-v2",
+  "milestone": "m0-detail-normalize",
+  "wave": 1,
+  "scenarioRefs": [
+    "m0-detail-normalize:s1",
+    "m0-detail-normalize:s2",
+    "m0-detail-normalize:s3"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..dc26e67
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T08:05:00.092Z
+session: 01a1bf56-d4b7-7649-9fd1-563e549e1900
+endedAt: 2026-11-09T08:13:46.936Z
+usage:
+  inputTokens: 115165
+  outputTokens: 49620
+  costUsd: 0.064955
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-239Z_01a1bf56-d4b7-7649-9fd1-563e549e1900.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..eff9b28
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,48 @@
+status: ok
+summary: "Authored test/contracts/schema-detail-normalize.test.ts: all seven
+  producer/reference schemas accept lowercase detail and reject capital-D, the
+  step-runner write gate is covered, and the required ASCII 200-byte vs 20-byte
+  longest-wins case passes. The remaining red defines byte-based longest-wins:
+  the current merge compares JS string length, so a 210-byte stored CJK detail
+  loses to a 100-byte/100-char re-emit. Note: this worktree base already
+  contains the stored-detail normalization (all schemas lowercase with
+  additionalProperties:false; concerns.ts:72 already reads existing?.detail), so
+  the casing portion of the assignment is pre-existing."
+target:
+  selectors:
+    - test/contracts/schema-detail-normalize.test.ts
+  expectRed:
+    - keeps the stored detail with more UTF-8 bytes when the re-emit has more
+      characters
+evidence:
+  - "grep for '\"Detail\"' and '.Detail' across plugins/software-factory/src and
+    config: no production capital-D properties; all 7 schemas use lowercase
+    detail plus additionalProperties:false"
+  - TMPDIR=/tmp bun test test/contracts/schema-detail-normalize.test.ts ->
+    bun_exit=1, 4 pass / 1 fail; assertion at line 263 expects the stored
+    210-byte CJK detail but receives the 100-char ASCII re-emit
+  - bun test --reporter=junit --reporter-outfile=/tmp/junit-detail-final.xml ->
+    failing testcase 'keeps the stored detail with more UTF-8 bytes when the
+    re-emit has more characters' present with <failure>; declared expectRed id
+    matches runner normalization
+  - Temporary byte-length fix (Buffer.byteLength comparison) made the target
+    file and 62 related tests pass across schema-detail-normalize,
+    concerns-funnel, hydration-fingerprint-caps, epic-saga-propagate, and
+    funnel-text-budget; production was then restored byte-for-byte
+  - "Baseline full suite before adding the red case: 449 pass, 2 skip, 0 fail
+    (451 tests)"
+  - bun run typecheck (tsc --noEmit) passes
+  - "git status after restore: only untracked
+    test/contracts/schema-detail-normalize.test.ts; git diff empty, so
+    production is untouched"
+concerns:
+  - The assignment's schema casing and concerns.ts:72 fix are already present in
+    this worktree base; only byte-length longest-wins is missing. If the item is
+    intended strictly as the Detail->detail rename, it is now redundant.
+  - UTF-8 byte length was chosen because concern/funnel budgets are byte-based
+    (epic propagation condenses with Buffer.byteLength); JS string length can
+    discard a byte-heavier stored detail.
+notes: The new test file is the sole change (untracked before yield). The
+  required ASCII 200-byte vs 20-byte longest-wins test already passes; the red
+  test specifies the remaining merge defect and is fixable by a one-line
+  comparison change in mergeConcern.
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..94aa0c0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,87 @@
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
+        durationMs: 6149
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 118335
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-t91iRp/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2578165
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2578165
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2578165
+
+           450 pass
+           2 skip
+           0 fail
+           2521 expect() calls
+          Ran 452 tests across 70 files. [118.11s]
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
+        test/contracts/schema-detail-normalize.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794212452089-apmlasq8rz7.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - lowercase concern detail in producer schemas.accepts lowercase detail
+          and rejects capital-D Detail in every producer schema
+        - lowercase concern detail in producer schemas.keeps the reference-only
+          review schema on lowercase detail
+        - step-runner concern detail write gate.stores lowercase detail and
+          rejects capital-D Detail before any store write
+        - concern detail merge keeps the longest stored value.keeps a 200-byte
+          stored detail when a 20-byte detail is re-emitted
+        - concern detail merge keeps the longest stored value.keeps the stored
+          detail with more UTF-8 bytes when the re-emit has more characters
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 4/300 production lines changed"
+    details:
+      changedLines:
+        added: 3
+        deleted: 1
+        total: 4
+        files:
+          - plugins/software-factory/src/core/concerns.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..9bfdc02
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/input.md
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
+  "slug": "schema-detail-normalize-v2",
+  "kind": "dev",
+  "title": "Lowercase detail in producer schemas + merge fix",
+  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
+  "outlineRef": "schema-detail-normalize-v2",
+  "milestone": "m0-detail-normalize",
+  "wave": 1,
+  "scenarioRefs": [
+    "m0-detail-normalize:s1",
+    "m0-detail-normalize:s2",
+    "m0-detail-normalize:s3"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/contracts/schema-detail-normalize.test.ts"
+  ],
+  "expectRed": [
+    "keeps the stored detail with more UTF-8 bytes when the re-emit has more characters"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..10e746a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T08:13:50.620Z
+session: 01a1bf5e-ea98-7275-a524-4b527059cee4
+endedAt: 2026-11-09T08:20:52.895Z
+usage:
+  inputTokens: 34335
+  outputTokens: 9729
+  costUsd: 0.013926000000000001
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-13-51-128Z_01a1bf5e-ea98-7275-a524-4b527059cee4.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..bee7d45
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,44 @@
+status: ok
+summary: Fixed concern detail retention in src/core/concerns.ts to compare UTF-8
+  byte length instead of string character length, so byte-budgeted funnel
+  details survive shorter re-emits. Producer schemas and tests were already
+  normalized to lowercase `detail` (with additionalProperties:false rejecting
+  capital-D `Detail`) in this worktree, including the generated review schema
+  and all test reads; existing contract tests already assert lowercase
+  acceptance and capital-D rejection, and the target test already covers the
+  200-byte-vs-20-byte longest-wins case. Only the byte-length production fix was
+  required.
+target:
+  selectors:
+    - test/contracts/schema-detail-normalize.test.ts
+  expectRed:
+    - keeps the stored detail with more UTF-8 bytes when the re-emit has more
+      characters
+evidence:
+  - "Red baseline: `TMPDIR=/tmp bun test
+    test/contracts/schema-detail-normalize.test.ts` failed before the fix at
+    line 263 — expected 70 CJK chars (210 UTF-8 bytes) but received 100 ASCII
+    chars (100 bytes) after re-emit."
+  - "Green target: `TMPDIR=/tmp bun test
+    test/contracts/schema-detail-normalize.test.ts` → 5 pass, 0 fail (53 expect
+    calls)."
+  - "Contract regression: `TMPDIR=/tmp bun test
+    test/contracts/schema-detail-normalize.test.ts
+    test/contracts/concern-schemas.test.ts` → 14 pass, 0 fail."
+  - "Typecheck: `bun run typecheck` (`tsc --noEmit`) exited 0 with no errors."
+  - "Full gate: `TMPDIR=/tmp bun test` → 450 pass, 2 skip, 0 fail; 452 tests
+    across 70 files."
+  - "Schema sweep: decisions, developer-output, fact-finder-output, plan,
+    plan-closeup, wave-closeup, and review schemas all define lowercase `detail`
+    with `additionalProperties: false` on concern items;
+    `src/core/records/review-schema.ts` uses lowercase `detail`; no production
+    `.Detail` reads remain."
+  - "Diff: only src/core/concerns.ts changed (+3/-1) — added a utf8Bytes helper
+    and switched longest-wins comparison to it."
+concerns:
+  - Producer schema/test normalization was already present in the worktree, so
+    no schema files needed edits; the remaining red scenario was the merge
+    byte-comparison.
+notes: Legacy rename-merge (concerns.ts line ~146) still lets an explicit
+  incoming detail override the merged longest detail; left unchanged to keep the
+  fix minimal and because existing legacy regression tests depend on that gate.
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..76b471f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,30 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 1 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/schema-detail-normalize.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794212456671-35mjje94xj9.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - lowercase concern detail in producer schemas.accepts lowercase detail
+          and rejects capital-D Detail in every producer schema
+        - lowercase concern detail in producer schemas.keeps the reference-only
+          review schema on lowercase detail
+        - step-runner concern detail write gate.stores lowercase detail and
+          rejects capital-D Detail before any store write
+        - concern detail merge keeps the longest stored value.keeps a 200-byte
+          stored detail when a 20-byte detail is re-emitted
+        - concern detail merge keeps the longest stored value.keeps the stored
+          detail with more UTF-8 bytes when the re-emit has more characters
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..ce6f584
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,801 @@
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
+  "slug": "schema-detail-normalize-v2",
+  "kind": "dev",
+  "title": "Lowercase detail in producer schemas + merge fix",
+  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
+  "outlineRef": "schema-detail-normalize-v2",
+  "milestone": "m0-detail-normalize",
+  "wave": 1,
+  "scenarioRefs": [
+    "m0-detail-normalize:s1",
+    "m0-detail-normalize:s2",
+    "m0-detail-normalize:s3"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..58cb64b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,31 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 1 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/contracts/schema-detail-normalize.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794212026188-8c9xdivk2ii.xml
++      junitCaseCount: 5
++      junitCaseIds:
++        - lowercase concern detail in producer schemas.accepts lowercase detail
++          and rejects capital-D Detail in every producer schema
++        - lowercase concern detail in producer schemas.keeps the reference-only
++          review schema on lowercase detail
++        - step-runner concern detail write gate.stores lowercase detail and
++          rejects capital-D Detail before any store write
++        - concern detail merge keeps the longest stored value.keeps a 200-byte
++          stored detail when a 20-byte detail is re-emitted
++        - concern detail merge keeps the longest stored value.keeps the stored
++          detail with more UTF-8 bytes when the re-emit has more characters
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..7e22bb7
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,63 @@
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
++  "slug": "schema-detail-normalize-v2",
++  "kind": "dev",
++  "title": "Lowercase detail in producer schemas + merge fix",
++  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
++  "outlineRef": "schema-detail-normalize-v2",
++  "milestone": "m0-detail-normalize",
++  "wave": 1,
++  "scenarioRefs": [
++    "m0-detail-normalize:s1",
++    "m0-detail-normalize:s2",
++    "m0-detail-normalize:s3"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/artifacts.ts:313-325",
++    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/artifacts.ts:313-325",
++  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..dc26e67
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-09T08:05:00.092Z
++session: 01a1bf56-d4b7-7649-9fd1-563e549e1900
++endedAt: 2026-11-09T08:13:46.936Z
++usage:
++  inputTokens: 115165
++  outputTokens: 49620
++  costUsd: 0.064955
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-239Z_01a1bf56-d4b7-7649-9fd1-563e549e1900.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..eff9b28
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,48 @@
++status: ok
++summary: "Authored test/contracts/schema-detail-normalize.test.ts: all seven
++  producer/reference schemas accept lowercase detail and reject capital-D, the
++  step-runner write gate is covered, and the required ASCII 200-byte vs 20-byte
++  longest-wins case passes. The remaining red defines byte-based longest-wins:
++  the current merge compares JS string length, so a 210-byte stored CJK detail
++  loses to a 100-byte/100-char re-emit. Note: this worktree base already
++  contains the stored-detail normalization (all schemas lowercase with
++  additionalProperties:false; concerns.ts:72 already reads existing?.detail), so
++  the casing portion of the assignment is pre-existing."
++target:
++  selectors:
++    - test/contracts/schema-detail-normalize.test.ts
++  expectRed:
++    - keeps the stored detail with more UTF-8 bytes when the re-emit has more
++      characters
++evidence:
++  - "grep for '\"Detail\"' and '.Detail' across plugins/software-factory/src and
++    config: no production capital-D properties; all 7 schemas use lowercase
++    detail plus additionalProperties:false"
++  - TMPDIR=/tmp bun test test/contracts/schema-detail-normalize.test.ts ->
++    bun_exit=1, 4 pass / 1 fail; assertion at line 263 expects the stored
++    210-byte CJK detail but receives the 100-char ASCII re-emit
++  - bun test --reporter=junit --reporter-outfile=/tmp/junit-detail-final.xml ->
++    failing testcase 'keeps the stored detail with more UTF-8 bytes when the
++    re-emit has more characters' present with <failure>; declared expectRed id
++    matches runner normalization
++  - Temporary byte-length fix (Buffer.byteLength comparison) made the target
++    file and 62 related tests pass across schema-detail-normalize,
++    concerns-funnel, hydration-fingerprint-caps, epic-saga-propagate, and
++    funnel-text-budget; production was then restored byte-for-byte
++  - "Baseline full suite before adding the red case: 449 pass, 2 skip, 0 fail
++    (451 tests)"
++  - bun run typecheck (tsc --noEmit) passes
++  - "git status after restore: only untracked
++    test/contracts/schema-detail-normalize.test.ts; git diff empty, so
++    production is untouched"
++concerns:
++  - The assignment's schema casing and concerns.ts:72 fix are already present in
++    this worktree base; only byte-length longest-wins is missing. If the item is
++    intended strictly as the Detail->detail rename, it is now redundant.
++  - UTF-8 byte length was chosen because concern/funnel budgets are byte-based
++    (epic propagation condenses with Buffer.byteLength); JS string length can
++    discard a byte-heavier stored detail.
++notes: The new test file is the sole change (untracked before yield). The
++  required ASCII 200-byte vs 20-byte longest-wins test already passes; the red
++  test specifies the remaining merge defect and is fixable by a one-line
++  comparison change in mergeConcern.
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..94aa0c0
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,87 @@
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
++        durationMs: 6149
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 118335
++        details: |-
++          bun test v1.4.4 (38afee6c8)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-t91iRp/.factory/pipeline.yaml
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
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2578165
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2578165
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2578165
++
++           450 pass
++           2 skip
++           0 fail
++           2521 expect() calls
++          Ran 452 tests across 70 files. [118.11s]
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
++        test/contracts/schema-detail-normalize.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794212452089-apmlasq8rz7.xml
++      junitCaseCount: 5
++      junitCaseIds:
++        - lowercase concern detail in producer schemas.accepts lowercase detail
++          and rejects capital-D Detail in every producer schema
++        - lowercase concern detail in producer schemas.keeps the reference-only
++          review schema on lowercase detail
++        - step-runner concern detail write gate.stores lowercase detail and
++          rejects capital-D Detail before any store write
++        - concern detail merge keeps the longest stored value.keeps a 200-byte
++          stored detail when a 20-byte detail is re-emitted
++        - concern detail merge keeps the longest stored value.keeps the stored
++          detail with more UTF-8 bytes when the re-emit has more characters
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 4/300 production lines changed"
++    details:
++      changedLines:
++        added: 3
++        deleted: 1
++        total: 4
++        files:
++          - plugins/software-factory/src/core/concerns.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..9bfdc02
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,69 @@
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
++  "slug": "schema-detail-normalize-v2",
++  "kind": "dev",
++  "title": "Lowercase detail in producer schemas + merge fix",
++  "assignment": "Normalize concern Detail->detail across producer schemas and merge logic (red-to-green fix, prod budget ~30 lines). (1) In 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) plus reference-only review.schema.json, rename capital-D Detail property to lowercase detail for consistency with generated src/core/records/review-schema.ts; keep additionalProperties:false so lowercase validates and capital-D is rejected. (2) One-line TS fix src/core/concerns.ts:72 existing?.Detail -> existing?.detail restoring longest-wins in mergeConcern/aggregateConcerns. (3) Fix ALL capital-D .Detail reads in tests: test/epic-saga-propagate.test.ts (:307/313/319 + sweep for any others) and test/funnel-text-budget.test.ts. (4) Tests: ensure test/contracts/concern-schemas.test.ts asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). Scope: DO NOT touch triage/infra/pm-edit logic. Verify: typecheck + TMPDIR=/tmp bun test green (TMPDIR workaround required per td-tmpdir-split).",
++  "outlineRef": "schema-detail-normalize-v2",
++  "milestone": "m0-detail-normalize",
++  "wave": 1,
++  "scenarioRefs": [
++    "m0-detail-normalize:s1",
++    "m0-detail-normalize:s2",
++    "m0-detail-normalize:s3"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/artifacts.ts:313-325",
++    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/contracts/schema-detail-normalize.test.ts"
++  ],
++  "expectRed": [
++    "keeps the stored detail with more UTF-8 bytes when the re-emit has more characters"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/artifacts.ts:313-325",
++  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..10e746a
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-09T08:13:50.620Z
++session: 01a1bf5e-ea98-7275-a524-4b527059cee4
++endedAt: 2026-11-09T08:20:52.895Z
++usage:
++  inputTokens: 34335
++  outputTokens: 9729
++  costUsd: 0.013926000000000001
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-13-51-128Z_01a1bf5e-ea98-7275-a524-4b527059cee4.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..bee7d45
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,44 @@
++status: ok
++summary: Fixed concern detail retention in src/core/concerns.ts to compare UTF-8
++  byte length instead of string character length, so byte-budgeted funnel
++  details survive shorter re-emits. Producer schemas and tests were already
++  normalized to lowercase `detail` (with additionalProperties:false rejecting
++  capital-D `Detail`) in this worktree, including the generated review schema
++  and all test reads; existing contract tests already assert lowercase
++  acceptance and capital-D rejection, and the target test already covers the
++  200-byte-vs-20-byte longest-wins case. Only the byte-length production fix was
++  required.
++target:
++  selectors:
++    - test/contracts/schema-detail-normalize.test.ts
++  expectRed:
++    - keeps the stored detail with more UTF-8 bytes when the re-emit has more
++      characters
++evidence:
++  - "Red baseline: `TMPDIR=/tmp bun test
++    test/contracts/schema-detail-normalize.test.ts` failed before the fix at
++    line 263 — expected 70 CJK chars (210 UTF-8 bytes) but received 100 ASCII
++    chars (100 bytes) after re-emit."
++  - "Green target: `TMPDIR=/tmp bun test
++    test/contracts/schema-detail-normalize.test.ts` → 5 pass, 0 fail (53 expect
++    calls)."
++  - "Contract regression: `TMPDIR=/tmp bun test
++    test/contracts/schema-detail-normalize.test.ts
++    test/contracts/concern-schemas.test.ts` → 14 pass, 0 fail."
++  - "Typecheck: `bun run typecheck` (`tsc --noEmit`) exited 0 with no errors."
++  - "Full gate: `TMPDIR=/tmp bun test` → 450 pass, 2 skip, 0 fail; 452 tests
++    across 70 files."
++  - "Schema sweep: decisions, developer-output, fact-finder-output, plan,
++    plan-closeup, wave-closeup, and review schemas all define lowercase `detail`
++    with `additionalProperties: false` on concern items;
++    `src/core/records/review-schema.ts` uses lowercase `detail`; no production
++    `.Detail` reads remain."
++  - "Diff: only src/core/concerns.ts changed (+3/-1) — added a utf8Bytes helper
++    and switched longest-wins comparison to it."
++concerns:
++  - Producer schema/test normalization was already present in the worktree, so
++    no schema files needed edits; the remaining red scenario was the merge
++    byte-comparison.
++notes: Legacy rename-merge (concerns.ts line ~146) still lets an explicit
++  incoming detail override the merged longest detail; left unchanged to keep the
++  fix minimal and because existing legacy regression tests depend on that gate.
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index c8729e5..e585a36 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -47,6 +47,8 @@ const locks = new KeyedMutex();
+ const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
+ const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
+ const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
++/** Funnel budgets are measured in UTF-8 bytes, so detail retention compares bytes, not code units. */
++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
+ const hash = (prefix: string, parts: unknown[]) =>
+   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+@@ -69,7 +71,7 @@ async function readExisting<T>(file: string): Promise<T | undefined> {
+ function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
+   const incomingDetail = (input.detail ?? input.summary).trim();
+   const incomingSeverity = input.severity ?? "medium";
+-  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
++  const detail = existing?.detail && utf8Bytes(existing.detail) > utf8Bytes(incomingDetail) ? existing.detail : incomingDetail;
+   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+   const location = input.location ?? existing?.location;
+diff --git a/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts b/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
+new file mode 100644
+index 0000000..75f98f0
+--- /dev/null
++++ b/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
+@@ -0,0 +1,269 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import os from "node:os";
++import path from "node:path";
++import { createAjv } from "../../src/core/config/ajv.js";
++import { resolveStepSchema, runAgentStep } from "../../src/core/flows/step-runner.js";
++import { aggregateConcerns } from "../../src/core/concerns.js";
++import { readYaml } from "../../src/core/records/io.js";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Contract tests for the lowercase concern `detail` field (docs/factory.v2.md §18).
++ *
++ * Every producer schema must accept `detail` and reject the capital-D `Detail`
++ * spelling. Step-runner validation is the write gate: a rejected output never
++ * reaches the concern store. When a concern is re-emitted, the stored detail
++ * with the most UTF-8 bytes wins so funnel byte budgets cannot lose detail
++ * through round-trips.
++ */
++
++const pluginRoot = path.resolve(import.meta.dir, "../..");
++
++type JsonSchema = Record<string, any>;
++
++interface Producer {
++  name: string;
++  schema: () => JsonSchema;
++  base: JsonSchema;
++}
++
++const PRODUCERS: Producer[] = [
++  {
++    name: "decisions",
++    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-wave-report"),
++    base: { decision: "continue" },
++  },
++  {
++    name: "developer-output",
++    schema: () => resolveStepSchema(pluginRoot, "developer", "develop"),
++    base: { status: "ok", summary: "Implemented the change" },
++  },
++  {
++    name: "fact-finder-output",
++    schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
++    base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
++  },
++  {
++    name: "plan",
++    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
++    base: { iteration: 1, milestones: [], itemOutlines: [] },
++  },
++  {
++    name: "plan-closeup",
++    schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
++    base: { iteration: 1, status: "complete", summary: "Plan complete" },
++  },
++  {
++    name: "architect-closeup shares plan-closeup",
++    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
++    base: { iteration: 1, status: "complete", summary: "Plan complete" },
++  },
++  {
++    name: "wave-closeup",
++    schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
++    base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
++  },
++];
++
++describe("lowercase concern detail in producer schemas", () => {
++  it("accepts lowercase detail and rejects capital-D Detail in every producer schema", () => {
++    for (const producer of PRODUCERS) {
++      const schema = producer.schema();
++      const validate = createAjv().compile(schema);
++      const concerns = schema.properties?.concerns;
++      const item = concerns?.items;
++
++      expect(item?.properties?.detail).toEqual({ type: "string" });
++      expect(item?.properties?.Detail).toBeUndefined();
++      expect(item?.additionalProperties).toBe(false);
++
++      expect(
++        validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Lowercase", detail: "kept" }] })
++      ).toBe(true);
++      expect(
++        validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
++      ).toBe(false);
++    }
++  });
++
++  it("keeps the reference-only review schema on lowercase detail", () => {
++    const schema: JsonSchema = JSON.parse(
++      fs.readFileSync(path.resolve(pluginRoot, "config/schemas/review.schema.json"), "utf8")
++    );
++    const validate = createAjv().compile(schema);
++    const base = { status: "approved", summary: "Sound", suggestions: [] };
++
++    expect(schema.properties?.newConcerns?.items?.properties?.detail).toEqual({ type: "string" });
++    expect(schema.properties?.newConcerns?.items?.properties?.Detail).toBeUndefined();
++    expect(
++      validate({ ...base, newConcerns: [{ kind: "risk", summary: "Lowercase", detail: "kept" }] })
++    ).toBe(true);
++    expect(
++      validate({ ...base, newConcerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
++    ).toBe(false);
++  });
++});
++
++describe("step-runner concern detail write gate", () => {
++  const ORCH = ".factory";
++  const TASK = "detail-gate-task";
++
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskWt: string;
++  let taskDir: string;
++  let pipeline: PipelineConfig;
++  let project: ProjectConfig;
++  let prompts: ReturnType<typeof loadPromptLibrary>;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    taskWt = tmpRepo.dir;
++    taskDir = path.join(taskWt, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Detail gate\n", "utf8");
++    tmpRepo.commit("add detail gate task");
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
++      agents: { developer: { role: "workhorse" } },
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
++  afterEach(() => tmpRepo.cleanup());
++
++  async function runDevelop(concern: Record<string, unknown>) {
++    const harness = new FakeHarness();
++    const label = `${TASK}/runs/develop#a1`;
++    const data = { status: "ok", summary: "Implemented", evidence: ["test"], concerns: [concern] };
++    harness.scriptOutcome(label, { ok: true, data });
++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
++    harness.scriptComplete(() => data);
++    return runAgentStep({
++      task: TASK,
++      stepId: "develop",
++      stepFragment: "steps/develop",
++      agent: "developer",
++      cwd: taskWt,
++      taskWt,
++      taskDir,
++      recordsDir: path.join(taskDir, "runs"),
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      promptVars: { assignment: "detail gate", target: "tests", citations: "[]" },
++    });
++  }
++
++  it("stores lowercase detail and rejects capital-D Detail before any store write", async () => {
++    const accepted = await runDevelop({ kind: "risk", summary: "Lowercase", detail: "kept as written" });
++    expect(accepted.status).toBe("ok");
++
++    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
++    expect(files).toHaveLength(1);
++    const stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", files[0]!));
++    expect(stored.detail).toBe("kept as written");
++
++    const rejected = await runDevelop({ kind: "risk", summary: "Capital", Detail: "wrong casing" });
++    expect(rejected.status).toBe("rejected");
++    expect(rejected.meta.error).toContain("Detail");
++    const after = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
++    expect(after).toHaveLength(1);
++  });
++});
++
++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++
++describe("concern detail merge keeps the longest stored value", () => {
++  let taskDir: string;
++
++  beforeEach(() => {
++    taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-detail-merge-"));
++  });
++
++  afterEach(() => fs.rmSync(taskDir, { recursive: true, force: true }));
++
++  it("keeps a 200-byte stored detail when a 20-byte detail is re-emitted", async () => {
++    const source = { record: "001-develop-a1", agent: "developer" } as const;
++    const longDetail = "L".repeat(200);
++    const shortDetail = "s".repeat(20);
++
++    await aggregateConcerns(
++      { taskDir, taskWt: taskDir, source },
++      [{ kind: "risk", summary: "Long-lived detail", detail: longDetail }],
++      [],
++      { commit: false }
++    );
++    const merged = await aggregateConcerns(
++      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
++      [{ kind: "risk", summary: "Long-lived detail", detail: shortDetail }],
++      [],
++      { commit: false }
++    );
++
++    expect(merged).toHaveLength(1);
++    expect(merged[0]!.detail).toBe(longDetail);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${merged[0]!.id}.yaml`)
++    );
++    expect(stored.detail).toBe(longDetail);
++  });
++
++  it("keeps the stored detail with more UTF-8 bytes when the re-emit has more characters", async () => {
++    const source = { record: "001-develop-a1", agent: "developer" } as const;
++    // Funnel budgets are byte-based: 70 CJK characters occupy 210 UTF-8 bytes.
++    const storedDetail = "\u754c".repeat(70);
++    const shorterByteDetail = "a".repeat(100);
++    expect(storedDetail.length).toBeLessThan(shorterByteDetail.length);
++    expect(utf8Bytes(storedDetail)).toBeGreaterThan(utf8Bytes(shorterByteDetail));
++
++    await aggregateConcerns(
++      { taskDir, taskWt: taskDir, source },
++      [{ kind: "risk", summary: "Byte-budgeted detail", detail: storedDetail }],
++      [],
++      { commit: false }
++    );
++    const merged = await aggregateConcerns(
++      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
++      [{ kind: "risk", summary: "Byte-budgeted detail", detail: shorterByteDetail }],
++      [],
++      { commit: false }
++    );
++
++    expect(merged).toHaveLength(1);
++    expect(merged[0]!.detail).toBe(storedDetail);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${merged[0]!.id}.yaml`)
++    );
++    expect(stored.detail).toBe(storedDetail);
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
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..660e69b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T08:20:56.618Z
+session: 01a1bf65-711c-7465-a89c-357b93dcc522
+endedAt: 2026-11-09T08:37:54.415Z
+usage:
+  inputTokens: 75581
+  outputTokens: 66252
+  costUsd: 0.024741
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-20-58-780Z_01a1bf65-711c-7465-a89c-357b93dcc522.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..eb4678b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,4 @@
+status: approved
+summary: "Approved: byte-length longest-wins fix green, schemas lowercase,
+  pure-additive tests, no weakening."
+suggestions: []
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index c8729e5..e585a36 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -47,6 +47,8 @@ const locks = new KeyedMutex();
 const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
 const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
 const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
+/** Funnel budgets are measured in UTF-8 bytes, so detail retention compares bytes, not code units. */
+const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
 const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
 const hash = (prefix: string, parts: unknown[]) =>
   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
@@ -69,7 +71,7 @@ async function readExisting<T>(file: string): Promise<T | undefined> {
 function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
   const incomingDetail = (input.detail ?? input.summary).trim();
   const incomingSeverity = input.severity ?? "medium";
-  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
+  const detail = existing?.detail && utf8Bytes(existing.detail) > utf8Bytes(incomingDetail) ? existing.detail : incomingDetail;
   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
   const location = input.location ?? existing?.location;
diff --git a/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts b/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
new file mode 100644
index 0000000..75f98f0
--- /dev/null
+++ b/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
@@ -0,0 +1,269 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import { createAjv } from "../../src/core/config/ajv.js";
+import { resolveStepSchema, runAgentStep } from "../../src/core/flows/step-runner.js";
+import { aggregateConcerns } from "../../src/core/concerns.js";
+import { readYaml } from "../../src/core/records/io.js";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Contract tests for the lowercase concern `detail` field (docs/factory.v2.md §18).
+ *
+ * Every producer schema must accept `detail` and reject the capital-D `Detail`
+ * spelling. Step-runner validation is the write gate: a rejected output never
+ * reaches the concern store. When a concern is re-emitted, the stored detail
+ * with the most UTF-8 bytes wins so funnel byte budgets cannot lose detail
+ * through round-trips.
+ */
+
+const pluginRoot = path.resolve(import.meta.dir, "../..");
+
+type JsonSchema = Record<string, any>;
+
+interface Producer {
+  name: string;
+  schema: () => JsonSchema;
+  base: JsonSchema;
+}
+
+const PRODUCERS: Producer[] = [
+  {
+    name: "decisions",
+    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-wave-report"),
+    base: { decision: "continue" },
+  },
+  {
+    name: "developer-output",
+    schema: () => resolveStepSchema(pluginRoot, "developer", "develop"),
+    base: { status: "ok", summary: "Implemented the change" },
+  },
+  {
+    name: "fact-finder-output",
+    schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
+    base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
+  },
+  {
+    name: "plan",
+    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
+    base: { iteration: 1, milestones: [], itemOutlines: [] },
+  },
+  {
+    name: "plan-closeup",
+    schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
+    base: { iteration: 1, status: "complete", summary: "Plan complete" },
+  },
+  {
+    name: "architect-closeup shares plan-closeup",
+    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
+    base: { iteration: 1, status: "complete", summary: "Plan complete" },
+  },
+  {
+    name: "wave-closeup",
+    schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
+    base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
+  },
+];
+
+describe("lowercase concern detail in producer schemas", () => {
+  it("accepts lowercase detail and rejects capital-D Detail in every producer schema", () => {
+    for (const producer of PRODUCERS) {
+      const schema = producer.schema();
+      const validate = createAjv().compile(schema);
+      const concerns = schema.properties?.concerns;
+      const item = concerns?.items;
+
+      expect(item?.properties?.detail).toEqual({ type: "string" });
+      expect(item?.properties?.Detail).toBeUndefined();
+      expect(item?.additionalProperties).toBe(false);
+
+      expect(
+        validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Lowercase", detail: "kept" }] })
+      ).toBe(true);
+      expect(
+        validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
+      ).toBe(false);
+    }
+  });
+
+  it("keeps the reference-only review schema on lowercase detail", () => {
+    const schema: JsonSchema = JSON.parse(
+      fs.readFileSync(path.resolve(pluginRoot, "config/schemas/review.schema.json"), "utf8")
+    );
+    const validate = createAjv().compile(schema);
+    const base = { status: "approved", summary: "Sound", suggestions: [] };
+
+    expect(schema.properties?.newConcerns?.items?.properties?.detail).toEqual({ type: "string" });
+    expect(schema.properties?.newConcerns?.items?.properties?.Detail).toBeUndefined();
+    expect(
+      validate({ ...base, newConcerns: [{ kind: "risk", summary: "Lowercase", detail: "kept" }] })
+    ).toBe(true);
+    expect(
+      validate({ ...base, newConcerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
+    ).toBe(false);
+  });
+});
+
+describe("step-runner concern detail write gate", () => {
+  const ORCH = ".factory";
+  const TASK = "detail-gate-task";
+
+  let tmpRepo: TmpRepo;
+  let repo: Repo;
+  let taskWt: string;
+  let taskDir: string;
+  let pipeline: PipelineConfig;
+  let project: ProjectConfig;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    taskWt = tmpRepo.dir;
+    taskDir = path.join(taskWt, ORCH, TASK);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Detail gate\n", "utf8");
+    tmpRepo.commit("add detail gate task");
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
+      agents: { developer: { role: "workhorse" } },
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
+  afterEach(() => tmpRepo.cleanup());
+
+  async function runDevelop(concern: Record<string, unknown>) {
+    const harness = new FakeHarness();
+    const label = `${TASK}/runs/develop#a1`;
+    const data = { status: "ok", summary: "Implemented", evidence: ["test"], concerns: [concern] };
+    harness.scriptOutcome(label, { ok: true, data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
+    harness.scriptComplete(() => data);
+    return runAgentStep({
+      task: TASK,
+      stepId: "develop",
+      stepFragment: "steps/develop",
+      agent: "developer",
+      cwd: taskWt,
+      taskWt,
+      taskDir,
+      recordsDir: path.join(taskDir, "runs"),
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: { assignment: "detail gate", target: "tests", citations: "[]" },
+    });
+  }
+
+  it("stores lowercase detail and rejects capital-D Detail before any store write", async () => {
+    const accepted = await runDevelop({ kind: "risk", summary: "Lowercase", detail: "kept as written" });
+    expect(accepted.status).toBe("ok");
+
+    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
+    expect(files).toHaveLength(1);
+    const stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", files[0]!));
+    expect(stored.detail).toBe("kept as written");
+
+    const rejected = await runDevelop({ kind: "risk", summary: "Capital", Detail: "wrong casing" });
+    expect(rejected.status).toBe("rejected");
+    expect(rejected.meta.error).toContain("Detail");
+    const after = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
+    expect(after).toHaveLength(1);
+  });
+});
+
+const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+
+describe("concern detail merge keeps the longest stored value", () => {
+  let taskDir: string;
+
+  beforeEach(() => {
+    taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-detail-merge-"));
+  });
+
+  afterEach(() => fs.rmSync(taskDir, { recursive: true, force: true }));
+
+  it("keeps a 200-byte stored detail when a 20-byte detail is re-emitted", async () => {
+    const source = { record: "001-develop-a1", agent: "developer" } as const;
+    const longDetail = "L".repeat(200);
+    const shortDetail = "s".repeat(20);
+
+    await aggregateConcerns(
+      { taskDir, taskWt: taskDir, source },
+      [{ kind: "risk", summary: "Long-lived detail", detail: longDetail }],
+      [],
+      { commit: false }
+    );
+    const merged = await aggregateConcerns(
+      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
+      [{ kind: "risk", summary: "Long-lived detail", detail: shortDetail }],
+      [],
+      { commit: false }
+    );
+
+    expect(merged).toHaveLength(1);
+    expect(merged[0]!.detail).toBe(longDetail);
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${merged[0]!.id}.yaml`)
+    );
+    expect(stored.detail).toBe(longDetail);
+  });
+
+  it("keeps the stored detail with more UTF-8 bytes when the re-emit has more characters", async () => {
+    const source = { record: "001-develop-a1", agent: "developer" } as const;
+    // Funnel budgets are byte-based: 70 CJK characters occupy 210 UTF-8 bytes.
+    const storedDetail = "\u754c".repeat(70);
+    const shorterByteDetail = "a".repeat(100);
+    expect(storedDetail.length).toBeLessThan(shorterByteDetail.length);
+    expect(utf8Bytes(storedDetail)).toBeGreaterThan(utf8Bytes(shorterByteDetail));
+
+    await aggregateConcerns(
+      { taskDir, taskWt: taskDir, source },
+      [{ kind: "risk", summary: "Byte-budgeted detail", detail: storedDetail }],
+      [],
+      { commit: false }
+    );
+    const merged = await aggregateConcerns(
+      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
+      [{ kind: "risk", summary: "Byte-budgeted detail", detail: shorterByteDetail }],
+      [],
+      { commit: false }
+    );
+
+    expect(merged).toHaveLength(1);
+    expect(merged[0]!.detail).toBe(storedDetail);
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${merged[0]!.id}.yaml`)
+    );
+    expect(stored.detail).toBe(storedDetail);
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
