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
  "slug": "concerns-contracts-schemas",
  "kind": "dev",
  "title": "Concern producer schemas",
  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
  "outlineRef": "concerns-contracts-schemas",
  "milestone": "m1-contracts-aggregate",
  "wave": 3,
  "deps": [
    "concerns-contracts-types"
  ],
  "scenarioRefs": [
    "m1-contracts-aggregate:s4",
    "m1-contracts-aggregate:s5"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..1b47d3d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,35 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/contracts/concern-schemas.test.ts
+        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 5 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-schemas.test.ts
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114876710-l678hle9oil.xml
+      junitCaseCount: 6
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..0e64501
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,65 @@
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
+  "slug": "concerns-contracts-schemas",
+  "kind": "dev",
+  "title": "Concern producer schemas",
+  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-schemas",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s4",
+    "m1-contracts-aggregate:s5"
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..fe32c86
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T04:54:17.436Z
+session: 01a1b981-dbff-75d3-97a8-4b558e96d6cf
+endedAt: 2026-11-08T05:14:37.327Z
+usage:
+  inputTokens: 163858
+  outputTokens: 49689
+  costUsd: 0.07341400000000001
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T04-54-17-855Z_01a1b981-dbff-75d3-97a8-4b558e96d6cf
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..ceeb0b1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,60 @@
+status: ok
+summary: Added test-first coverage for concern producer schemas without touching
+  production code. New contract tests assert inlined (no external $ref) concern
+  and remarkable definitions across developer-output, fact-finder, plan,
+  decisions, wave/plan/architect close-up schemas; strict kind/severity enums
+  with optional detail/severity; review/QA newConcerns plus
+  dismiss-without-detail at schema level; close-up concernResolutions
+  (resolve|carry|propagate); and untouched triage/infra/plan-edits. A
+  FakeHarness case in test/engine/concerns-funnel.test.ts proves valid concerns
+  reach writeArtifact while an unknown kind is rejected and never written. All
+  five declared target tests fail with assertion failures on current production
+  code (not compile/import errors).
+target:
+  selectors:
+    - test/contracts/concern-schemas.test.ts
+    - test/engine/concerns-funnel.test.ts
+  expectRed:
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
+      the concern definition into every producer schema without external refs
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
+      the remarkable decision definition with chosen, alternatives, and why
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
+      newConcerns to review and QA schemas outside the triage suggestions
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
+      concernResolutions with resolve, carry, and propagate to close-up schemas
+    - test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid
+      concerns pass validation and unknown kinds reject with no artifact write
+evidence:
+  - "TMPDIR=/tmp bun run typecheck (plugins/software-factory): exit 0, no type
+    errors."
+  - "TMPDIR=/tmp bun test test/prompts.test.ts: 17 pass, 0 fail (preflight
+    passes)."
+  - "TMPDIR=/tmp bun test test/contracts/concern-schemas.test.ts
+    test/engine/concerns-funnel.test.ts: 5 fail, 1 pass; the passing case is the
+    untouched triage/infra/plan-edits guard."
+  - JUnit output for the two target files contains 5 <failure> and 0 <error>,
+    proving assertion-red rather than compilation/import errors.
+  - Verified via the engine's normaliseCaseId/findMatchingCase logic that all
+    five declared expectRed node ids resolve to those failing JUnit cases.
+  - "Full TMPDIR=/tmp bun test run: 288 pass, 2 skip, 5 fail; the only failures
+    are the five new target tests."
+  - git status shows only the two new test files; no production files or stubs
+    were modified.
+concerns:
+  - review-schema.ts generates the QA/reviewer schema at runtime, so the develop
+    step must update that TS generator in addition to
+    config/schemas/review.schema.json for newConcerns to be enforced by
+    QA/reviewer steps; the 'JSON' budget phrasing should not exclude this small
+    schema-generator change.
+  - The remarkable-decision output property name is not fixed by the assignment,
+    so the contract test detects it structurally as an array whose items require
+    chosen/alternatives/why; the developer may name it remarkable or
+    remarkableDecisions.
+  - The review schema test also requires dismiss without detail to pass JSON
+    validation (detail enforcement belongs to the runtime concern store), which
+    implies review.schema.json needs dismiss in its suggestions disposition
+    enum.
+notes: "Test-only change: two new files under plugins/software-factory/test. No
+  production schemas were edited in this test-first step; the red expectations
+  map to the subsequent JSON/schema change."
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..ab5c2ec
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,254 @@
+checks:
+  - id: gates
+    status: fail
+    message: "Gate regressions: test"
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 2954
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: fail
+        durationMs: 165499
+        details: >-
+          =========================================================
+
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 1683052
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 1683052
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 1683052
+
+
+          test/engine/concerns-funnel.test.ts:
+
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+
+          127 |   const stderr = res.stderr;
+
+          128 |   const code = res.code ?? 0;
+
+          129 | 
+
+          130 |   if (code !== 0 && !opts?.allowFail) {
+
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic
+          ... [truncated 118 bytes] ...
+
+          (fail) Concern funnel schemas > valid concerns pass validation and
+          unknown kinds reject with no artifact write [90.64ms]
+
+
+          test/engine/head-guard.test.ts:
+
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+
+          127 |   const stderr = res.stderr;
+
+          128 |   const code = res.code ?? 0;
+
+          129 | 
+
+          130 |   if (code !== 0 && !opts?.allowFail) {
+
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
+          (fail) Engine: HEAD guard resilience (§7) > detects when an agent
+          commits and resets --soft to before.sha, keeping changes staged
+          [93.60ms]
+
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+
+          127 |   const stderr = res.stderr;
+
+          128 |   const code = res.code ?? 0;
+
+          129 | 
+
+          130 |   if (code !== 0 && !opts?.allowFail) {
+
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
+          (fail) Engine: HEAD guard resilience (§7) > detects when an agent
+          switches branch and restores original branch, keeping changes
+          [63.36ms]
+
+           290 pass
+           2 skip
+           3 fail
+           1158 expect() calls
+          Ran 295 tests across 54 files. [92.29s]
+
+          [New failing tests: Concern funnel schemas.valid concerns pass
+          validation and unknown kinds reject with no artifact write]
+        failingTests:
+          - Concern funnel schemas.valid concerns pass validation and unknown
+            kinds reject with no artifact write
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+    output: |-
+      iexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
+      (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [93.60ms]
+      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+      127 |   const stderr = res.stderr;
+      128 |   const code = res.code ?? 0;
+      129 | 
+      130 |   if (code !== 0 && !opts?.allowFail) {
+      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                      ^
+      GitError: git add -A failed with exit code 128:
+      fatal: not a git repository (or any of the parent directories): .git
+
+       command: "add -A",
+          code: 128,
+        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+        stdout: "",
+
+            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
+      (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [63.36ms]
+
+       290 pass
+       2 skip
+       3 fail
+       1158 expect() calls
+      Ran 295 tests across 54 files. [92.29s]
+      [New failing tests: Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write]
+  - id: target-green
+    status: fail
+    message: "Tests failed: Concern funnel schemas.valid concerns pass validation
+      and unknown kinds reject with no artifact write. Command: cd
+      plugins/software-factory && bun test
+      test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts
+      --reporter=junit
+      --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-ru\
+      ntime/tmp/junit-green-1794115404368-wtfodunykuq.xml"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-schemas.test.ts
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml
+      junitCaseCount: 6
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+    output: >-
+      bun test v1.4.3 (c6da4a4d3)
+
+
+
+      test/engine/concerns-funnel.test.ts:
+
+      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+
+      127 |   const stderr = res.stderr;
+
+      128 |   const code = res.code ?? 0;
+
+      129 | 
+
+      130 |   if (code !== 0 && !opts?.allowFail) {
+
+      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                      ^
+      GitError: git add -A failed with exit code 128:
+
+      fatal: not a git repository (or any of the parent directories): .git
+
+       command: "add -A",
+          code: 128,
+        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+        stdout: "",
+
+            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
+      (fail) Concern funnel schemas > valid concerns pass validation and unknown
+      kinds reject with no artifact write [172.66ms]
+
+       5 pass
+       1 fail
+       19 expect() calls
+      Ran 6 tests across 2 files. [896.00ms]
+  - id: size
+    status: pass
+    message: "size passed: 225/300 production lines changed"
+    details:
+      changedLines:
+        added: 220
+        deleted: 5
+        total: 225
+        files:
+          - plugins/software-factory/config/schemas/decisions.schema.json
+          - plugins/software-factory/config/schemas/developer-output.schema.json
+          - plugins/software-factory/config/schemas/fact-finder-output.schema.json
+          - plugins/software-factory/config/schemas/plan-closeup.schema.json
+          - plugins/software-factory/config/schemas/plan.schema.json
+          - plugins/software-factory/config/schemas/review.schema.json
+          - plugins/software-factory/config/schemas/wave-closeup.schema.json
+          - plugins/software-factory/src/core/records/review-schema.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..5e38187
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,76 @@
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
+  "slug": "concerns-contracts-schemas",
+  "kind": "dev",
+  "title": "Concern producer schemas",
+  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-schemas",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s4",
+    "m1-contracts-aggregate:s5"
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
+    "test/contracts/concern-schemas.test.ts",
+    "test/engine/concerns-funnel.test.ts"
+  ],
+  "expectRed": [
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the concern definition into every producer schema without external refs",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the remarkable decision definition with chosen, alternatives, and why",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds newConcerns to review and QA schemas outside the triage suggestions",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds concernResolutions with resolve, carry, and propagate to close-up schemas",
+    "test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid concerns pass validation and unknown kinds reject with no artifact write"
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..0d4bad6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/meta.yaml
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
+status: rejected
+startedAt: 2026-11-08T05:14:43.267Z
+session: 01a1b994-90e5-736e-8575-d1120064d09c
+endedAt: 2026-11-08T05:23:25.529Z
+usage:
+  inputTokens: 74446
+  outputTokens: 24247
+  costUsd: 0.030572
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-14-43-813Z_01a1b994-90e5-736e-8575-d1120064d09c
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..c58b5e7
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,54 @@
+status: ok
+summary: Inlined structured concern and remarkable-decision definitions (no
+  cross-file $ref) into developer-output, fact-finder-output, plan, decisions,
+  wave-closeup, plan-closeup, and review schemas. Added newConcerns[] to both
+  the static review.schema.json and the runtime generateReviewSchema
+  (QA/reviewer), added concernResolutions[] (resolve|carry|propagate) to
+  wave/plan close-ups, kept kind/severity strict enums with summary/kind
+  required and detail/severity optional, added dismiss to the static review
+  disposition enum, and left triage/infra/plan-edits untouched. All 6 target
+  tests, typecheck, prompts preflight, and the full suite pass.
+target:
+  selectors:
+    - test/contracts/concern-schemas.test.ts
+    - test/engine/concerns-funnel.test.ts
+  expectRed:
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
+      the concern definition into every producer schema without external refs
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
+      the remarkable decision definition with chosen, alternatives, and why
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
+      newConcerns to review and QA schemas outside the triage suggestions
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
+      concernResolutions with resolve, carry, and propagate to close-up schemas
+    - test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid
+      concerns pass validation and unknown kinds reject with no artifact write
+evidence:
+  - "Baseline before changes: TMPDIR=/tmp bun test
+    test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts
+    -> 1 pass, 5 fail (5 declared expectRed cases red)."
+  - "After changes: TMPDIR=/tmp bun test test/contracts/concern-schemas.test.ts
+    test/engine/concerns-funnel.test.ts -> 6 pass, 0 fail, 29 expect() calls."
+  - TMPDIR=/tmp bun run typecheck (plugins/software-factory) -> exit 0, no
+    diagnostics.
+  - TMPDIR=/tmp bun test test/prompts.test.ts -> 17 pass, 0 fail (preflight
+    green).
+  - TMPDIR=/tmp bun test (full suite) -> 293 pass, 2 skip, 0 fail across 54
+    files.
+  - "Parsed every modified .json file with python json.load: all valid JSON."
+  - "git diff --numstat: 186 JSON lines added (191 incl. replaced lines) across
+    7 schemas, within the <=200 JSON-line budget; 34 TS lines in
+    review-schema.ts; no test files modified."
+concerns:
+  - DeveloperOutputArtifact.concerns in src/core/artifacts.ts is still typed
+    string[]; schema now emits structured concerns. The runtime/store story will
+    need to reconcile this type (schemas-only scope intentionally left types
+    untouched).
+  - generateReviewSchema defaults still omit dismiss; the review-policy story
+    owns appending dismiss for triagers, while the static review.schema.json
+    includes it for the fallback path.
+notes: The remarkable-decision property is named `remarkable` (the contract test
+  detects it structurally). All new fields are optional so existing producer
+  payloads remain valid; kind/summary are required and kind/severity use strict
+  enums so unknown kinds fail Ajv before writeArtifact runs, as proven by the
+  FakeHarness case.
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..82ef401
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/checks.yaml
@@ -0,0 +1,91 @@
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
+        durationMs: 6570
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 186800
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-wk53vp/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1760144
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1760144
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1760144
+
+           293 pass
+           2 skip
+           0 fail
+           1175 expect() calls
+          Ran 295 tests across 54 files. [93.97s]
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
+        test/contracts/concern-schemas.test.ts
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115769843-wyq7kqx97cl.xml
+      junitCaseCount: 6
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 240/300 production lines changed"
+    details:
+      changedLines:
+        added: 234
+        deleted: 6
+        total: 240
+        files:
+          - plugins/software-factory/config/schemas/decisions.schema.json
+          - plugins/software-factory/config/schemas/developer-output.schema.json
+          - plugins/software-factory/config/schemas/fact-finder-output.schema.json
+          - plugins/software-factory/config/schemas/plan-closeup.schema.json
+          - plugins/software-factory/config/schemas/plan.schema.json
+          - plugins/software-factory/config/schemas/review.schema.json
+          - plugins/software-factory/config/schemas/wave-closeup.schema.json
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/records/review-schema.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/input.md
new file mode 100644
index 0000000..3436aaf
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/input.md
@@ -0,0 +1,130 @@
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
+  "slug": "concerns-contracts-schemas",
+  "kind": "dev",
+  "title": "Concern producer schemas",
+  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-schemas",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s4",
+    "m1-contracts-aggregate:s5"
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
+    "test/contracts/concern-schemas.test.ts",
+    "test/engine/concerns-funnel.test.ts"
+  ],
+  "expectRed": [
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the concern definition into every producer schema without external refs",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the remarkable decision definition with chosen, alternatives, and why",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds newConcerns to review and QA schemas outside the triage suggestions",
+    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds concernResolutions with resolve, carry, and propagate to close-up schemas",
+    "test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid concerns pass validation and unknown kinds reject with no artifact write"
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
+Failing check: target-green
+
+Message: Tests failed: Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write. Command: cd plugins/software-factory && bun test test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml
+
+Detail:
+{
+  "command": "cd plugins/software-factory && bun test test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml",
+  "junitCaseCount": 6,
+  "junitCaseIds": [
+    "Concern producer schemas.inlines the concern definition into every producer schema without external refs",
+    "Concern producer schemas.inlines the remarkable decision definition with chosen, alternatives, and why",
+    "Concern producer schemas.adds newConcerns to review and QA schemas outside the triage suggestions",
+    "Concern producer schemas.adds concernResolutions with resolve, carry, and propagate to close-up schemas",
+    "Concern producer schemas.leaves triage, infra, and plan-edit schemas untouched",
+    "Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write"
+  ],
+  "junitTruncated": false,
+  "collected": true,
+  "collectionErrors": []
+}
+
+Output tail:
+bun test v1.4.3 (c6da4a4d3)
+
+
+test/engine/concerns-funnel.test.ts:
+126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+127 |   const stderr = res.stderr;
+128 |   const code = res.code ?? 0;
+129 | 
+130 |   if (code !== 0 && !opts?.allowFail) {
+131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                ^
+GitError: git add -A failed with exit code 128:
+fatal: not a git repository (or any of the parent directories): .git
+
+ command: "add -A",
+    code: 128,
+  stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+  stdout: "",
+
+      at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
+      at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
+      at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
+(fail) Concern funnel schemas > valid concerns pass validation and unknown kinds reject with no artifact write [172.66ms]
+
+ 5 pass
+ 1 fail
+ 19 expect() calls
+Ran 6 tests across 2 files. [896.00ms]
+
+Budget: 225 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..038a970
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/meta.yaml
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
+startedAt: 2026-11-08T05:23:32.628Z
+session: 01a1b99c-a4ca-77eb-ae8f-66808c11952d
+endedAt: 2026-11-08T05:29:30.943Z
+usage:
+  inputTokens: 31905
+  outputTokens: 12614
+  costUsd: 0.014667
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-23-33-194Z_01a1b99c-a4ca-77eb-ae8f-66808c11952d
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..4d95c1e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/output.yaml
@@ -0,0 +1,49 @@
+status: ok
+summary: Target tests are green. The schemas from the prior attempt already
+  satisfied all four contract tests; the funnel behavior test failed only
+  because runAgentStep's taskWt fallback split taskDir on the first '/.factory'
+  substring, which mis-resolved to the workspace root when TMPDIR lives under
+  '.factory-runtime/tmp' (git add -A then ran outside a repo). Replaced that
+  heuristic with inferTaskWorktree, which matches the full
+  '<orchestrationFolder>/<task>' suffix and resolves the parent worktree. All
+  target cases pass, typecheck passes, and the full suite is green.
+target:
+  selectors:
+    - test/contracts/concern-schemas.test.ts
+    - test/engine/concerns-funnel.test.ts
+  expectRed:
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
+      the concern definition into every producer schema without external refs
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
+      the remarkable decision definition with chosen, alternatives, and why
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
+      newConcerns to review and QA schemas outside the triage suggestions
+    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
+      concernResolutions with resolve, carry, and propagate to close-up schemas
+    - test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid
+      concerns pass validation and unknown kinds reject with no artifact write
+evidence:
+  - cd plugins/software-factory && bun test
+    test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts
+    (ambient harness
+    TMPDIR=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp) -> 6
+    pass, 0 fail, 29 expect() calls
+  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 293 pass, 2 skip, 0
+    fail, 1175 expect() calls across 54 files
+  - "Reproduced the original failure with both files together and instrumented
+    commitAll: it attempted git add -A in
+    /home/slava/aiexp/agentic-swarm.factory-wt because
+    taskDir.split('/.factory')[0] truncated at '.factory-runtime'; after the
+    inferTaskWorktree fix the same command passes"
+concerns:
+  - "The only uncommitted change is src/core/flows/step-runner.ts (14 lines): a
+    fallback path-inference fix required for target green; production callsites
+    already pass taskWt explicitly, so risk is limited to the test/fallback
+    path."
+  - Prior-attempt schema JSON changes remain committed and were not touched in
+    this attempt.
+notes: "Unknown-kind rejection is proven end-to-end: the test's invalid payload
+  is rejected by the developer-output schema, repair relaunch replays the same
+  invalid data, and writeArtifact is never invoked (writes=0, marker file
+  absent)."
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..22514a5
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/checks.yaml
@@ -0,0 +1,33 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 5 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-schemas.test.ts
+        test/engine/concerns-funnel.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794116085318-o9804lcygnc.xml
+      junitCaseCount: 6
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern funnel schemas.valid concerns pass validation and unknown
+          kinds reject with no artifact write
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/input.md
new file mode 100644
index 0000000..6be2752
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/input.md
@@ -0,0 +1,1925 @@
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
+  "slug": "concerns-contracts-schemas",
+  "kind": "dev",
+  "title": "Concern producer schemas",
+  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
+  "outlineRef": "concerns-contracts-schemas",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 3,
+  "deps": [
+    "concerns-contracts-types"
+  ],
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s4",
+    "m1-contracts-aggregate:s5"
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..1b47d3d
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,35 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/contracts/concern-schemas.test.ts
++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 5 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/contracts/concern-schemas.test.ts
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794114876710-l678hle9oil.xml
++      junitCaseCount: 6
++      junitCaseIds:
++        - Concern producer schemas.inlines the concern definition into every
++          producer schema without external refs
++        - Concern producer schemas.inlines the remarkable decision definition
++          with chosen, alternatives, and why
++        - Concern producer schemas.adds newConcerns to review and QA schemas
++          outside the triage suggestions
++        - Concern producer schemas.adds concernResolutions with resolve, carry,
++          and propagate to close-up schemas
++        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
++          untouched
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..0e64501
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,65 @@
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
++  "slug": "concerns-contracts-schemas",
++  "kind": "dev",
++  "title": "Concern producer schemas",
++  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
++  "outlineRef": "concerns-contracts-schemas",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 3,
++  "deps": [
++    "concerns-contracts-types"
++  ],
++  "scenarioRefs": [
++    "m1-contracts-aggregate:s4",
++    "m1-contracts-aggregate:s5"
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..fe32c86
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T04:54:17.436Z
++session: 01a1b981-dbff-75d3-97a8-4b558e96d6cf
++endedAt: 2026-11-08T05:14:37.327Z
++usage:
++  inputTokens: 163858
++  outputTokens: 49689
++  costUsd: 0.07341400000000001
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T04-54-17-855Z_01a1b981-dbff-75d3-97a8-4b558e96d6cf
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..ceeb0b1
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,60 @@
++status: ok
++summary: Added test-first coverage for concern producer schemas without touching
++  production code. New contract tests assert inlined (no external $ref) concern
++  and remarkable definitions across developer-output, fact-finder, plan,
++  decisions, wave/plan/architect close-up schemas; strict kind/severity enums
++  with optional detail/severity; review/QA newConcerns plus
++  dismiss-without-detail at schema level; close-up concernResolutions
++  (resolve|carry|propagate); and untouched triage/infra/plan-edits. A
++  FakeHarness case in test/engine/concerns-funnel.test.ts proves valid concerns
++  reach writeArtifact while an unknown kind is rejected and never written. All
++  five declared target tests fail with assertion failures on current production
++  code (not compile/import errors).
++target:
++  selectors:
++    - test/contracts/concern-schemas.test.ts
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
++      the concern definition into every producer schema without external refs
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
++      the remarkable decision definition with chosen, alternatives, and why
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
++      newConcerns to review and QA schemas outside the triage suggestions
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
++      concernResolutions with resolve, carry, and propagate to close-up schemas
++    - test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid
++      concerns pass validation and unknown kinds reject with no artifact write
++evidence:
++  - "TMPDIR=/tmp bun run typecheck (plugins/software-factory): exit 0, no type
++    errors."
++  - "TMPDIR=/tmp bun test test/prompts.test.ts: 17 pass, 0 fail (preflight
++    passes)."
++  - "TMPDIR=/tmp bun test test/contracts/concern-schemas.test.ts
++    test/engine/concerns-funnel.test.ts: 5 fail, 1 pass; the passing case is the
++    untouched triage/infra/plan-edits guard."
++  - JUnit output for the two target files contains 5 <failure> and 0 <error>,
++    proving assertion-red rather than compilation/import errors.
++  - Verified via the engine's normaliseCaseId/findMatchingCase logic that all
++    five declared expectRed node ids resolve to those failing JUnit cases.
++  - "Full TMPDIR=/tmp bun test run: 288 pass, 2 skip, 5 fail; the only failures
++    are the five new target tests."
++  - git status shows only the two new test files; no production files or stubs
++    were modified.
++concerns:
++  - review-schema.ts generates the QA/reviewer schema at runtime, so the develop
++    step must update that TS generator in addition to
++    config/schemas/review.schema.json for newConcerns to be enforced by
++    QA/reviewer steps; the 'JSON' budget phrasing should not exclude this small
++    schema-generator change.
++  - The remarkable-decision output property name is not fixed by the assignment,
++    so the contract test detects it structurally as an array whose items require
++    chosen/alternatives/why; the developer may name it remarkable or
++    remarkableDecisions.
++  - The review schema test also requires dismiss without detail to pass JSON
++    validation (detail enforcement belongs to the runtime concern store), which
++    implies review.schema.json needs dismiss in its suggestions disposition
++    enum.
++notes: "Test-only change: two new files under plugins/software-factory/test. No
++  production schemas were edited in this test-first step; the red expectations
++  map to the subsequent JSON/schema change."
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..ab5c2ec
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,254 @@
++checks:
++  - id: gates
++    status: fail
++    message: "Gate regressions: test"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 2954
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: fail
++        durationMs: 165499
++        details: >-
++          =========================================================
++
++
++
++          test/cli/cli.test.ts:
++
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
++          on host Slava-Yoga) taken over by PID 1683052
++
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 1683052
++
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 1683052
++
++
++          test/engine/concerns-funnel.test.ts:
++
++          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
++
++          127 |   const stderr = res.stderr;
++
++          128 |   const code = res.code ?? 0;
++
++          129 | 
++
++          130 |   if (code !== 0 && !opts?.allowFail) {
++
++          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
++                          ^
++          GitError: git add -A failed with exit code 128:
++
++          fatal: not a git repository (or any of the parent directories): .git
++
++           command: "add -A",
++              code: 128,
++            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
++            stdout: "",
++
++                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++                at async runExclusive (/home/slava/aiexp/agentic
++          ... [truncated 118 bytes] ...
++
++          (fail) Concern funnel schemas > valid concerns pass validation and
++          unknown kinds reject with no artifact write [90.64ms]
++
++
++          test/engine/head-guard.test.ts:
++
++          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
++
++          127 |   const stderr = res.stderr;
++
++          128 |   const code = res.code ?? 0;
++
++          129 | 
++
++          130 |   if (code !== 0 && !opts?.allowFail) {
++
++          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
++                          ^
++          GitError: git add -A failed with exit code 128:
++
++          fatal: not a git repository (or any of the parent directories): .git
++
++           command: "add -A",
++              code: 128,
++            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
++            stdout: "",
++
++                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
++          (fail) Engine: HEAD guard resilience (§7) > detects when an agent
++          commits and resets --soft to before.sha, keeping changes staged
++          [93.60ms]
++
++          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
++
++          127 |   const stderr = res.stderr;
++
++          128 |   const code = res.code ?? 0;
++
++          129 | 
++
++          130 |   if (code !== 0 && !opts?.allowFail) {
++
++          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
++                          ^
++          GitError: git add -A failed with exit code 128:
++
++          fatal: not a git repository (or any of the parent directories): .git
++
++           command: "add -A",
++              code: 128,
++            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
++            stdout: "",
++
++                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
++          (fail) Engine: HEAD guard resilience (§7) > detects when an agent
++          switches branch and restores original branch, keeping changes
++          [63.36ms]
++
++           290 pass
++           2 skip
++           3 fail
++           1158 expect() calls
++          Ran 295 tests across 54 files. [92.29s]
++
++          [New failing tests: Concern funnel schemas.valid concerns pass
++          validation and unknown kinds reject with no artifact write]
++        failingTests:
++          - Concern funnel schemas.valid concerns pass validation and unknown
++            kinds reject with no artifact write
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++    output: |-
++      iexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
++      (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [93.60ms]
++      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
++      127 |   const stderr = res.stderr;
++      128 |   const code = res.code ?? 0;
++      129 | 
++      130 |   if (code !== 0 && !opts?.allowFail) {
++      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
++                      ^
++      GitError: git add -A failed with exit code 128:
++      fatal: not a git repository (or any of the parent directories): .git
++
++       command: "add -A",
++          code: 128,
++        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
++        stdout: "",
++
++            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
++      (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [63.36ms]
++
++       290 pass
++       2 skip
++       3 fail
++       1158 expect() calls
++      Ran 295 tests across 54 files. [92.29s]
++      [New failing tests: Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write]
++  - id: target-green
++    status: fail
++    message: "Tests failed: Concern funnel schemas.valid concerns pass validation
++      and unknown kinds reject with no artifact write. Command: cd
++      plugins/software-factory && bun test
++      test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts
++      --reporter=junit
++      --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-ru\
++      ntime/tmp/junit-green-1794115404368-wtfodunykuq.xml"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/contracts/concern-schemas.test.ts
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml
++      junitCaseCount: 6
++      junitCaseIds:
++        - Concern producer schemas.inlines the concern definition into every
++          producer schema without external refs
++        - Concern producer schemas.inlines the remarkable decision definition
++          with chosen, alternatives, and why
++        - Concern producer schemas.adds newConcerns to review and QA schemas
++          outside the triage suggestions
++        - Concern producer schemas.adds concernResolutions with resolve, carry,
++          and propagate to close-up schemas
++        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
++          untouched
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++    output: >-
++      bun test v1.4.3 (c6da4a4d3)
++
++
++
++      test/engine/concerns-funnel.test.ts:
++
++      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
++
++      127 |   const stderr = res.stderr;
++
++      128 |   const code = res.code ?? 0;
++
++      129 | 
++
++      130 |   if (code !== 0 && !opts?.allowFail) {
++
++      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
++                      ^
++      GitError: git add -A failed with exit code 128:
++
++      fatal: not a git repository (or any of the parent directories): .git
++
++       command: "add -A",
++          code: 128,
++        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
++        stdout: "",
++
++            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
++      (fail) Concern funnel schemas > valid concerns pass validation and unknown
++      kinds reject with no artifact write [172.66ms]
++
++       5 pass
++       1 fail
++       19 expect() calls
++      Ran 6 tests across 2 files. [896.00ms]
++  - id: size
++    status: pass
++    message: "size passed: 225/300 production lines changed"
++    details:
++      changedLines:
++        added: 220
++        deleted: 5
++        total: 225
++        files:
++          - plugins/software-factory/config/schemas/decisions.schema.json
++          - plugins/software-factory/config/schemas/developer-output.schema.json
++          - plugins/software-factory/config/schemas/fact-finder-output.schema.json
++          - plugins/software-factory/config/schemas/plan-closeup.schema.json
++          - plugins/software-factory/config/schemas/plan.schema.json
++          - plugins/software-factory/config/schemas/review.schema.json
++          - plugins/software-factory/config/schemas/wave-closeup.schema.json
++          - plugins/software-factory/src/core/records/review-schema.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..5e38187
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,76 @@
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
++  "slug": "concerns-contracts-schemas",
++  "kind": "dev",
++  "title": "Concern producer schemas",
++  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
++  "outlineRef": "concerns-contracts-schemas",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 3,
++  "deps": [
++    "concerns-contracts-types"
++  ],
++  "scenarioRefs": [
++    "m1-contracts-aggregate:s4",
++    "m1-contracts-aggregate:s5"
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
++    "test/contracts/concern-schemas.test.ts",
++    "test/engine/concerns-funnel.test.ts"
++  ],
++  "expectRed": [
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the concern definition into every producer schema without external refs",
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the remarkable decision definition with chosen, alternatives, and why",
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds newConcerns to review and QA schemas outside the triage suggestions",
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds concernResolutions with resolve, carry, and propagate to close-up schemas",
++    "test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid concerns pass validation and unknown kinds reject with no artifact write"
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..0d4bad6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/meta.yaml
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
++status: rejected
++startedAt: 2026-11-08T05:14:43.267Z
++session: 01a1b994-90e5-736e-8575-d1120064d09c
++endedAt: 2026-11-08T05:23:25.529Z
++usage:
++  inputTokens: 74446
++  outputTokens: 24247
++  costUsd: 0.030572
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-14-43-813Z_01a1b994-90e5-736e-8575-d1120064d09c
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..c58b5e7
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,54 @@
++status: ok
++summary: Inlined structured concern and remarkable-decision definitions (no
++  cross-file $ref) into developer-output, fact-finder-output, plan, decisions,
++  wave-closeup, plan-closeup, and review schemas. Added newConcerns[] to both
++  the static review.schema.json and the runtime generateReviewSchema
++  (QA/reviewer), added concernResolutions[] (resolve|carry|propagate) to
++  wave/plan close-ups, kept kind/severity strict enums with summary/kind
++  required and detail/severity optional, added dismiss to the static review
++  disposition enum, and left triage/infra/plan-edits untouched. All 6 target
++  tests, typecheck, prompts preflight, and the full suite pass.
++target:
++  selectors:
++    - test/contracts/concern-schemas.test.ts
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
++      the concern definition into every producer schema without external refs
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
++      the remarkable decision definition with chosen, alternatives, and why
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
++      newConcerns to review and QA schemas outside the triage suggestions
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
++      concernResolutions with resolve, carry, and propagate to close-up schemas
++    - test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid
++      concerns pass validation and unknown kinds reject with no artifact write
++evidence:
++  - "Baseline before changes: TMPDIR=/tmp bun test
++    test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts
++    -> 1 pass, 5 fail (5 declared expectRed cases red)."
++  - "After changes: TMPDIR=/tmp bun test test/contracts/concern-schemas.test.ts
++    test/engine/concerns-funnel.test.ts -> 6 pass, 0 fail, 29 expect() calls."
++  - TMPDIR=/tmp bun run typecheck (plugins/software-factory) -> exit 0, no
++    diagnostics.
++  - TMPDIR=/tmp bun test test/prompts.test.ts -> 17 pass, 0 fail (preflight
++    green).
++  - TMPDIR=/tmp bun test (full suite) -> 293 pass, 2 skip, 0 fail across 54
++    files.
++  - "Parsed every modified .json file with python json.load: all valid JSON."
++  - "git diff --numstat: 186 JSON lines added (191 incl. replaced lines) across
++    7 schemas, within the <=200 JSON-line budget; 34 TS lines in
++    review-schema.ts; no test files modified."
++concerns:
++  - DeveloperOutputArtifact.concerns in src/core/artifacts.ts is still typed
++    string[]; schema now emits structured concerns. The runtime/store story will
++    need to reconcile this type (schemas-only scope intentionally left types
++    untouched).
++  - generateReviewSchema defaults still omit dismiss; the review-policy story
++    owns appending dismiss for triagers, while the static review.schema.json
++    includes it for the fallback path.
++notes: The remarkable-decision property is named `remarkable` (the contract test
++  detects it structurally). All new fields are optional so existing producer
++  payloads remain valid; kind/summary are required and kind/severity use strict
++  enums so unknown kinds fail Ajv before writeArtifact runs, as proven by the
++  FakeHarness case.
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/checks.yaml
+new file mode 100644
+index 0000000..82ef401
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/checks.yaml
+@@ -0,0 +1,91 @@
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
++        durationMs: 6570
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 186800
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-wk53vp/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1760144
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1760144
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1760144
++
++           293 pass
++           2 skip
++           0 fail
++           1175 expect() calls
++          Ran 295 tests across 54 files. [93.97s]
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
++        test/contracts/concern-schemas.test.ts
++        test/engine/concerns-funnel.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115769843-wyq7kqx97cl.xml
++      junitCaseCount: 6
++      junitCaseIds:
++        - Concern producer schemas.inlines the concern definition into every
++          producer schema without external refs
++        - Concern producer schemas.inlines the remarkable decision definition
++          with chosen, alternatives, and why
++        - Concern producer schemas.adds newConcerns to review and QA schemas
++          outside the triage suggestions
++        - Concern producer schemas.adds concernResolutions with resolve, carry,
++          and propagate to close-up schemas
++        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
++          untouched
++        - Concern funnel schemas.valid concerns pass validation and unknown
++          kinds reject with no artifact write
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 240/300 production lines changed"
++    details:
++      changedLines:
++        added: 234
++        deleted: 6
++        total: 240
++        files:
++          - plugins/software-factory/config/schemas/decisions.schema.json
++          - plugins/software-factory/config/schemas/developer-output.schema.json
++          - plugins/software-factory/config/schemas/fact-finder-output.schema.json
++          - plugins/software-factory/config/schemas/plan-closeup.schema.json
++          - plugins/software-factory/config/schemas/plan.schema.json
++          - plugins/software-factory/config/schemas/review.schema.json
++          - plugins/software-factory/config/schemas/wave-closeup.schema.json
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/records/review-schema.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/input.md
+new file mode 100644
+index 0000000..3436aaf
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/input.md
+@@ -0,0 +1,130 @@
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
++  "slug": "concerns-contracts-schemas",
++  "kind": "dev",
++  "title": "Concern producer schemas",
++  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
++  "outlineRef": "concerns-contracts-schemas",
++  "milestone": "m1-contracts-aggregate",
++  "wave": 3,
++  "deps": [
++    "concerns-contracts-types"
++  ],
++  "scenarioRefs": [
++    "m1-contracts-aggregate:s4",
++    "m1-contracts-aggregate:s5"
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
++    "test/contracts/concern-schemas.test.ts",
++    "test/engine/concerns-funnel.test.ts"
++  ],
++  "expectRed": [
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the concern definition into every producer schema without external refs",
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the remarkable decision definition with chosen, alternatives, and why",
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds newConcerns to review and QA schemas outside the triage suggestions",
++    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds concernResolutions with resolve, carry, and propagate to close-up schemas",
++    "test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid concerns pass validation and unknown kinds reject with no artifact write"
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
++Failing check: target-green
++
++Message: Tests failed: Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write. Command: cd plugins/software-factory && bun test test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml
++
++Detail:
++{
++  "command": "cd plugins/software-factory && bun test test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml",
++  "junitCaseCount": 6,
++  "junitCaseIds": [
++    "Concern producer schemas.inlines the concern definition into every producer schema without external refs",
++    "Concern producer schemas.inlines the remarkable decision definition with chosen, alternatives, and why",
++    "Concern producer schemas.adds newConcerns to review and QA schemas outside the triage suggestions",
++    "Concern producer schemas.adds concernResolutions with resolve, carry, and propagate to close-up schemas",
++    "Concern producer schemas.leaves triage, infra, and plan-edit schemas untouched",
++    "Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write"
++  ],
++  "junitTruncated": false,
++  "collected": true,
++  "collectionErrors": []
++}
++
++Output tail:
++bun test v1.4.3 (c6da4a4d3)
++
++
++test/engine/concerns-funnel.test.ts:
++126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
++127 |   const stderr = res.stderr;
++128 |   const code = res.code ?? 0;
++129 | 
++130 |   if (code !== 0 && !opts?.allowFail) {
++131 |     throw new GitError(args.join(" "), code, stderr, stdout);
++                ^
++GitError: git add -A failed with exit code 128:
++fatal: not a git repository (or any of the parent directories): .git
++
++ command: "add -A",
++    code: 128,
++  stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
++  stdout: "",
++
++      at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
++      at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
++      at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
++(fail) Concern funnel schemas > valid concerns pass validation and unknown kinds reject with no artifact write [172.66ms]
++
++ 5 pass
++ 1 fail
++ 19 expect() calls
++Ran 6 tests across 2 files. [896.00ms]
++
++Budget: 225 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/meta.yaml
+new file mode 100644
+index 0000000..038a970
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/meta.yaml
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
++startedAt: 2026-11-08T05:23:32.628Z
++session: 01a1b99c-a4ca-77eb-ae8f-66808c11952d
++endedAt: 2026-11-08T05:29:30.943Z
++usage:
++  inputTokens: 31905
++  outputTokens: 12614
++  costUsd: 0.014667
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-23-33-194Z_01a1b99c-a4ca-77eb-ae8f-66808c11952d
+diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/output.yaml
+new file mode 100644
+index 0000000..4d95c1e
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/003-develop-r1-a2/output.yaml
+@@ -0,0 +1,49 @@
++status: ok
++summary: Target tests are green. The schemas from the prior attempt already
++  satisfied all four contract tests; the funnel behavior test failed only
++  because runAgentStep's taskWt fallback split taskDir on the first '/.factory'
++  substring, which mis-resolved to the workspace root when TMPDIR lives under
++  '.factory-runtime/tmp' (git add -A then ran outside a repo). Replaced that
++  heuristic with inferTaskWorktree, which matches the full
++  '<orchestrationFolder>/<task>' suffix and resolves the parent worktree. All
++  target cases pass, typecheck passes, and the full suite is green.
++target:
++  selectors:
++    - test/contracts/concern-schemas.test.ts
++    - test/engine/concerns-funnel.test.ts
++  expectRed:
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
++      the concern definition into every producer schema without external refs
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines
++      the remarkable decision definition with chosen, alternatives, and why
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
++      newConcerns to review and QA schemas outside the triage suggestions
++    - test/contracts/concern-schemas.test.ts::Concern producer schemas::adds
++      concernResolutions with resolve, carry, and propagate to close-up schemas
++    - test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid
++      concerns pass validation and unknown kinds reject with no artifact write
++evidence:
++  - cd plugins/software-factory && bun test
++    test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts
++    (ambient harness
++    TMPDIR=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp) -> 6
++    pass, 0 fail, 29 expect() calls
++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 293 pass, 2 skip, 0
++    fail, 1175 expect() calls across 54 files
++  - "Reproduced the original failure with both files together and instrumented
++    commitAll: it attempted git add -A in
++    /home/slava/aiexp/agentic-swarm.factory-wt because
++    taskDir.split('/.factory')[0] truncated at '.factory-runtime'; after the
++    inferTaskWorktree fix the same command passes"
++concerns:
++  - "The only uncommitted change is src/core/flows/step-runner.ts (14 lines): a
++    fallback path-inference fix required for target green; production callsites
++    already pass taskWt explicitly, so risk is limited to the test/fallback
++    path."
++  - Prior-attempt schema JSON changes remain committed and were not touched in
++    this attempt.
++notes: "Unknown-kind rejection is proven end-to-end: the test's invalid payload
++  is rejected by the developer-output schema, repair relaunch replays the same
++  invalid data, and writeArtifact is never invoked (writes=0, marker file
++  absent)."
+diff --git a/plugins/software-factory/config/schemas/decisions.schema.json b/plugins/software-factory/config/schemas/decisions.schema.json
+index 3aea7bf..47bda68 100644
+--- a/plugins/software-factory/config/schemas/decisions.schema.json
++++ b/plugins/software-factory/config/schemas/decisions.schema.json
+@@ -44,7 +44,32 @@
+     "reason": { "type": "string", "description": "Reason for abandonment or abort" },
+     "question": { "type": "string", "description": "Specific question for human operator when decision is human-async or blocked" },
+     "planDelta": { "type": "string", "description": "Plan delta or amendment directives when decision is amend" },
+-    "timestamp": { "type": "string", "description": "ISO timestamp (assigned by engine if omitted)" }
++    "timestamp": { "type": "string", "description": "ISO timestamp (assigned by engine if omitted)" },
++    "concerns": {
++      "type": "array",
++      "description": "Structured concerns raised by the architect",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    }
+   },
+   "additionalProperties": false
+ }
+diff --git a/plugins/software-factory/config/schemas/developer-output.schema.json b/plugins/software-factory/config/schemas/developer-output.schema.json
+index 186c4bb..99f6e8f 100644
+--- a/plugins/software-factory/config/schemas/developer-output.schema.json
++++ b/plugins/software-factory/config/schemas/developer-output.schema.json
+@@ -60,9 +60,28 @@
+     },
+     "concerns": {
+       "type": "array",
+-      "description": "Observations, technical debt, or potential risks identified during implementation",
+-      "items": { "type": "string" },
+-      "default": []
++      "description": "Structured concerns raised during implementation",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
+     },
+     "notes": {
+       "type": "string",
+diff --git a/plugins/software-factory/config/schemas/fact-finder-output.schema.json b/plugins/software-factory/config/schemas/fact-finder-output.schema.json
+index b302ca2..b042c9d 100644
+--- a/plugins/software-factory/config/schemas/fact-finder-output.schema.json
++++ b/plugins/software-factory/config/schemas/fact-finder-output.schema.json
+@@ -18,6 +18,31 @@
+     "recommendations": {
+       "type": "array",
+       "items": { "type": "string" }
++    },
++    "concerns": {
++      "type": "array",
++      "description": "Structured concerns raised while investigating",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
+     }
+   },
+   "additionalProperties": false
+diff --git a/plugins/software-factory/config/schemas/plan-closeup.schema.json b/plugins/software-factory/config/schemas/plan-closeup.schema.json
+index 08b2f53..3b82c0c 100644
+--- a/plugins/software-factory/config/schemas/plan-closeup.schema.json
++++ b/plugins/software-factory/config/schemas/plan-closeup.schema.json
+@@ -23,6 +23,42 @@
+     "techDebt": {
+       "type": "array",
+       "items": { "type": "string" }
++    },
++    "concerns": {
++      "type": "array",
++      "description": "Structured concerns raised at plan close-up",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "concernResolutions": {
++      "type": "array",
++      "description": "Close-up resolutions for open concerns",
++      "items": {
++        "type": "object", "required": ["id", "action"], "additionalProperties": false,
++        "properties": {
++          "id": { "type": "string" }, "note": { "type": "string" },
++          "action": { "type": "string", "enum": ["resolve", "carry", "propagate"] }
++        }
++      }
+     }
+   },
+   "additionalProperties": false
+diff --git a/plugins/software-factory/config/schemas/plan.schema.json b/plugins/software-factory/config/schemas/plan.schema.json
+index 20c26e8..83032cf 100644
+--- a/plugins/software-factory/config/schemas/plan.schema.json
++++ b/plugins/software-factory/config/schemas/plan.schema.json
+@@ -127,6 +127,31 @@
+         },
+         "additionalProperties": false
+       }
++    },
++    "concerns": {
++      "type": "array",
++      "description": "Structured concerns raised during planning",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
+     }
+   },
+   "additionalProperties": false
+diff --git a/plugins/software-factory/config/schemas/review.schema.json b/plugins/software-factory/config/schemas/review.schema.json
+index 0221cb6..bb9769b 100644
+--- a/plugins/software-factory/config/schemas/review.schema.json
++++ b/plugins/software-factory/config/schemas/review.schema.json
+@@ -25,7 +25,8 @@
+               "architect",
+               "human-awareness",
+               "human-async",
+-              "human-stop"
++              "human-stop",
++              "dismiss"
+             ]
+           },
+           "summary": { "type": "string" },
+@@ -42,6 +43,20 @@
+         },
+         "additionalProperties": false
+       }
++    },
++    "newConcerns": {
++      "type": "array",
++      "description": "New concerns discovered during review",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
+     }
+   },
+   "additionalProperties": false
+diff --git a/plugins/software-factory/config/schemas/wave-closeup.schema.json b/plugins/software-factory/config/schemas/wave-closeup.schema.json
+index 932f270..2a655b8 100644
+--- a/plugins/software-factory/config/schemas/wave-closeup.schema.json
++++ b/plugins/software-factory/config/schemas/wave-closeup.schema.json
+@@ -31,6 +31,42 @@
+     "recommendations": {
+       "type": "array",
+       "items": { "type": "string" }
++    },
++    "concerns": {
++      "type": "array",
++      "description": "Structured concerns raised at wave close-up",
++      "items": {
++        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
++        "properties": {
++          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
++          "summary": { "type": "string" }, "detail": { "type": "string" },
++          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
++          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
++          "affects": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
++    "concernResolutions": {
++      "type": "array",
++      "description": "Close-up resolutions for open concerns",
++      "items": {
++        "type": "object", "required": ["id", "action"], "additionalProperties": false,
++        "properties": {
++          "id": { "type": "string" }, "note": { "type": "string" },
++          "action": { "type": "string", "enum": ["resolve", "carry", "propagate"] }
++        }
++      }
+     }
+   },
+   "additionalProperties": false
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index 131e474..2c307fa 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -154,6 +154,18 @@ export function resolveStepSchema(
+   };
+ }
+ 
++/**
++ * Infers the task worktree from `<taskWt>/<orchestrationFolder>/<task>`.
++ * Matches the folder boundary rather than the first `/.factory` substring so
++ * temp roots such as `.factory-runtime/tmp` are not mistaken for it.
++ */
++function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: string): string {
++  const tail = [...orchestrationFolder.split(/[\\/]/).filter(Boolean), task];
++  const parts = taskDir.split(/[\\/]/);
++  const matches = tail.every((seg, i) => parts[parts.length - tail.length + i] === seg);
++  return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
++}
++
+ /**
+  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
+  */
+@@ -214,7 +226,8 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+   const recordDir = path.join(recordsDir, dirName);
+ 
+   // Identify worktree that contains recordDir
+-  const taskWt = opts.taskWt ?? (taskDir.includes("/.factory") ? taskDir.split("/.factory")[0]! : taskDir);
++  const taskWt =
++    opts.taskWt ?? inferTaskWorktree(taskDir, task, project.orchestrationFolder ?? ".factory");
+   const wtToCommit = recordDir.startsWith(cwd) ? cwd : taskWt;
+ 
+   // 3. Resolve schema
+diff --git a/plugins/software-factory/src/core/records/review-schema.ts b/plugins/software-factory/src/core/records/review-schema.ts
+index dda969f..5a66e69 100644
+--- a/plugins/software-factory/src/core/records/review-schema.ts
++++ b/plugins/software-factory/src/core/records/review-schema.ts
+@@ -47,6 +47,40 @@ export function generateReviewSchema(
+           additionalProperties: false,
+         },
+       },
++      newConcerns: {
++        type: "array",
++        description: "New concerns discovered during review",
++        items: {
++          type: "object",
++          required: ["kind", "summary"],
++          additionalProperties: false,
++          properties: {
++            kind: {
++              type: "string",
++              enum: ["tech-debt", "assumption", "blocker", "risk", "question"],
++            },
++            summary: { type: "string" },
++            detail: { type: "string" },
++            severity: {
++              type: "string",
++              enum: ["low", "medium", "high"],
++            },
++            location: {
++              type: "object",
++              required: ["file"],
++              properties: {
++                file: { type: "string" },
++                line: { type: "integer" },
++              },
++              additionalProperties: false,
++            },
++            affects: {
++              type: "array",
++              items: { type: "string" },
++            },
++          },
++        },
++      },
+     },
+     additionalProperties: false,
+   };
+diff --git a/plugins/software-factory/test/contracts/concern-schemas.test.ts b/plugins/software-factory/test/contracts/concern-schemas.test.ts
+new file mode 100644
+index 0000000..a4802a1
+--- /dev/null
++++ b/plugins/software-factory/test/contracts/concern-schemas.test.ts
+@@ -0,0 +1,375 @@
++import { describe, expect, it } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createAjv } from "../../src/core/config/ajv.js";
++import { resolveStepSchema } from "../../src/core/flows/step-runner.js";
++
++/**
++ * Contract tests for concern/remarkable producer schemas (docs/factory.v2.md §18).
++ *
++ * Every agent output that can raise concerns must carry the shared definitions
++ * inline (no cross-file `$ref`) so Ajv can validate the schema standalone:
++ *   - concerns[] on developers, fact-finders, plans, decisions, and close-ups
++ *   - newConcerns[] on review/QA outputs (triage stays in suggestions[])
++ *   - remarkable decisions on outputs that report tradeoffs
++ *   - concernResolutions[] on wave/plan close-ups
++ *
++ * Severity and detail stay optional in JSON; the runtime concern store applies
++ * defaults. `kind` is a strict enum so an unknown kind fails validation before
++ * any engine-side write.
++ */
++
++const pluginRoot = path.resolve(import.meta.dir, "../..");
++const CONCERN_KINDS = ["tech-debt", "assumption", "blocker", "risk", "question"];
++
++type JsonSchema = Record<string, any>;
++
++interface Producer {
++  name: string;
++  schema: () => JsonSchema;
++  base: JsonSchema;
++}
++
++function validator(schema: JsonSchema) {
++  return createAjv().compile(schema);
++}
++
++function resolveRef(schema: JsonSchema, node: any): any {
++  if (!node || typeof node !== "object") return node;
++  const ref = node.$ref;
++  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
++  let target: any = schema;
++  for (const part of ref.slice(2).split("/")) target = target?.[part];
++  return target ? { ...target, ...node, $ref: undefined } : node;
++}
++
++function arrayItem(schema: JsonSchema, property: string): any {
++  const prop = resolveRef(schema, schema.properties?.[property]);
++  if (!prop || prop.type !== "array") return undefined;
++  return resolveRef(schema, prop.items);
++}
++
++function externalRefs(node: any, refs: string[] = []): string[] {
++  if (!node || typeof node !== "object") return refs;
++  if (Array.isArray(node)) {
++    for (const child of node) externalRefs(child, refs);
++    return refs;
++  }
++  if (typeof node.$ref === "string" && !node.$ref.startsWith("#/")) {
++    refs.push(node.$ref);
++  }
++  for (const [key, value] of Object.entries(node)) {
++    if (key !== "$ref") externalRefs(value, refs);
++  }
++  return refs;
++}
++
++function validationErrors(validate: any): string {
++  return (validate.errors ?? [])
++    .map((e: any) => `${e.instancePath || "/"} ${e.message}`)
++    .join("; ");
++}
++
++function hasConcernShape(schema: JsonSchema, item: any, label: string, failures: string[]) {
++  const required: string[] = item?.required ?? [];
++  if (!required.includes("kind")) failures.push(`${label}: kind must be required`);
++  if (!required.includes("summary")) failures.push(`${label}: summary must be required`);
++  if (required.includes("detail")) failures.push(`${label}: detail must be optional at schema level`);
++  if (required.includes("severity")) failures.push(`${label}: severity must be optional at schema level`);
++
++  const kinds = resolveRef(schema, item?.properties?.kind)?.enum ?? [];
++  const sortedKinds = [...kinds].sort();
++  if (sortedKinds.length !== CONCERN_KINDS.length || !CONCERN_KINDS.every((k) => sortedKinds.includes(k))) {
++    failures.push(`${label}: kind enum must be ${CONCERN_KINDS.join("|")}, got ${JSON.stringify(kinds)}`);
++  }
++
++  const severity = resolveRef(schema, item?.properties?.severity);
++  if (!severity) {
++    failures.push(`${label}: severity property must be declared but optional`);
++  } else {
++    const severities: string[] = [...(severity.enum ?? [])].sort();
++    if (severities.length !== 3 || !["high", "low", "medium"].every((s) => severities.includes(s))) {
++      failures.push(`${label}: severity enum must be low|medium|high, got ${JSON.stringify(severity.enum)}`);
++    }
++  }
++}
++
++const CONCERN_PRODUCERS: Producer[] = [
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
++    name: "decisions",
++    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-wave-report"),
++    base: { decision: "continue" },
++  },
++  {
++    name: "wave-closeup",
++    schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
++    base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
++  },
++  {
++    name: "plan-closeup",
++    schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
++    base: { iteration: 1, status: "complete", summary: "Plan complete" },
++  },
++  {
++    name: "architect-closeup",
++    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
++    base: { iteration: 1, status: "complete", summary: "Plan complete" },
++  },
++];
++
++const REVIEW_PRODUCERS: Producer[] = [
++  {
++    name: "qa",
++    schema: () => resolveStepSchema(pluginRoot, "qa", "qa", ["fix", "optional", "architect", "dismiss"]),
++    base: { status: "approved", summary: "Tests are sound", suggestions: [] },
++  },
++  {
++    name: "reviewer",
++    schema: () => resolveStepSchema(pluginRoot, "reviewer", "review", ["fix", "optional", "architect", "dismiss"]),
++    base: { status: "approved", summary: "Change is sound", suggestions: [] },
++  },
++  {
++    name: "review-file",
++    schema: () =>
++      JSON.parse(fs.readFileSync(path.resolve(pluginRoot, "config/schemas/review.schema.json"), "utf8")),
++    base: { status: "approved", summary: "Change is sound", suggestions: [] },
++  },
++];
++
++describe("Concern producer schemas", () => {
++  it("inlines the concern definition into every producer schema without external refs", () => {
++    const failures: string[] = [];
++
++    for (const producer of CONCERN_PRODUCERS) {
++      const schema = producer.schema();
++      const validate = validator(schema);
++      const label = producer.name;
++
++      const item = arrayItem(schema, "concerns");
++      if (!item) {
++        failures.push(`${label}: missing inline concerns[]`);
++        continue;
++      }
++      hasConcernShape(schema, item, label, failures);
++
++      if (!validate({ ...producer.base, concerns: [{ kind: "blocker", summary: "Dependency missing" }] })) {
++        failures.push(`${label}: minimal concern rejected (${validationErrors(validate)})`);
++      }
++      if (
++        !validate({
++          ...producer.base,
++          concerns: [
++            {
++              kind: "risk",
++              summary: "Flaky gate",
++              detail: "Retries hide real failures",
++              severity: "high",
++              location: { file: "src/core/example.ts", line: 3 },
++              affects: ["item-a"],
++            },
++          ],
++        })
++      ) {
++        failures.push(`${label}: fully populated concern rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...producer.base, concerns: [{ kind: "bug", summary: "Unknown kind" }] })) {
++        failures.push(`${label}: unknown concern kind accepted`);
++      }
++      if (validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Severity", severity: "critical" }] })) {
++        failures.push(`${label}: unknown concern severity accepted`);
++      }
++      if (validate({ ...producer.base, concerns: [{ kind: "risk" }] })) {
++        failures.push(`${label}: concern without summary accepted`);
++      }
++
++      const refs = externalRefs(schema);
++      if (refs.length > 0) {
++        failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("inlines the remarkable decision definition with chosen, alternatives, and why", () => {
++    const failures: string[] = [];
++
++    for (const producer of CONCERN_PRODUCERS) {
++      const schema = producer.schema();
++      const validate = validator(schema);
++      const label = producer.name;
++
++      let remarkableProperty: string | undefined;
++      for (const [property, raw] of Object.entries(schema.properties ?? {})) {
++        const item = (() => {
++          const prop = resolveRef(schema, raw);
++          return prop?.type === "array" ? resolveRef(schema, prop.items) : undefined;
++        })();
++        const required: string[] = item?.required ?? [];
++        if (["chosen", "alternatives", "why"].every((key) => required.includes(key))) {
++          remarkableProperty = property;
++          break;
++        }
++      }
++
++      if (!remarkableProperty) {
++        failures.push(`${label}: missing inline remarkable decision array`);
++        continue;
++      }
++
++      const remarkable = [{ chosen: "Inline shared schema definitions", alternatives: ["Cross-file $ref"], why: "Ajv validates each producer schema standalone" }];
++      if (!validate({ ...producer.base, [remarkableProperty]: remarkable })) {
++        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...producer.base, [remarkableProperty]: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
++        failures.push(`${label}: remarkable decision without alternatives accepted`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("adds newConcerns to review and QA schemas outside the triage suggestions", () => {
++    const failures: string[] = [];
++
++    for (const producer of REVIEW_PRODUCERS) {
++      const schema = producer.schema();
++      const validate = validator(schema);
++      const label = producer.name;
++
++      const item = arrayItem(schema, "newConcerns");
++      if (!item) {
++        failures.push(`${label}: missing inline newConcerns[]`);
++        continue;
++      }
++      hasConcernShape(schema, item, label, failures);
++
++      if (!validate({ ...producer.base, newConcerns: [{ kind: "assumption", summary: "Assumed atomic writes" }] })) {
++        failures.push(`${label}: valid new concern rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...producer.base, newConcerns: [{ kind: "bug", summary: "Unknown kind" }] })) {
++        failures.push(`${label}: unknown new-concern kind accepted`);
++      }
++      if (
++        validate({
++          ...producer.base,
++          newConcerns: [{ kind: "risk", summary: "Severity", severity: "critical" }],
++        })
++      ) {
++        failures.push(`${label}: unknown new-concern severity accepted`);
++      }
++      if (validate({ ...producer.base, newConcerns: [{ kind: "risk" }] })) {
++        failures.push(`${label}: new concern without summary accepted`);
++      }
++      if (
++        !validate({
++          ...producer.base,
++          suggestions: [{ id: "s-1", disposition: "dismiss", summary: "Duplicate of an existing concern" }],
++        })
++      ) {
++        failures.push(
++          `${label}: dismiss without detail must pass the JSON schema; the concern store enforces detail`
++        );
++      }
++
++      const refs = externalRefs(schema);
++      if (refs.length > 0) {
++        failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("adds concernResolutions with resolve, carry, and propagate to close-up schemas", () => {
++    const failures: string[] = [];
++    const closeups: Producer[] = [
++      {
++        name: "wave-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
++        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
++      },
++      {
++        name: "plan-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
++        base: { iteration: 1, status: "complete", summary: "Plan complete" },
++      },
++      {
++        name: "architect-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
++        base: { iteration: 1, status: "complete", summary: "Plan complete" },
++      },
++    ];
++
++    for (const closeup of closeups) {
++      const schema = closeup.schema();
++      const validate = validator(schema);
++      const label = closeup.name;
++
++      const item = arrayItem(schema, "concernResolutions");
++      if (!item) {
++        failures.push(`${label}: missing inline concernResolutions[]`);
++        continue;
++      }
++      const required: string[] = item.required ?? [];
++      if (!required.includes("id") || !required.includes("action")) {
++        failures.push(`${label}: concernResolutions must require id and action`);
++      }
++      const actions = resolveRef(schema, item.properties?.action)?.enum ?? [];
++      if (["resolve", "carry", "propagate"].some((action) => !actions.includes(action))) {
++        failures.push(`${label}: action enum must be resolve|carry|propagate, got ${JSON.stringify(actions)}`);
++      }
++
++      if (
++        !validate({
++          ...closeup.base,
++          concernResolutions: [
++            { id: "c-1", action: "resolve" },
++            { id: "c-2", action: "carry", note: "Needs an architect decision" },
++            { id: "c-3", action: "propagate" },
++          ],
++        })
++      ) {
++        failures.push(`${label}: valid concern resolutions rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...closeup.base, concernResolutions: [{ id: "c-4", action: "dismiss" }] })) {
++        failures.push(`${label}: dismiss action accepted for a close-up resolution`);
++      }
++      if (validate({ ...closeup.base, concernResolutions: [{ action: "resolve" }] })) {
++        failures.push(`${label}: resolution without concern id accepted`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("leaves triage, infra, and plan-edit schemas untouched", () => {
++    const untouched: Producer[] = [
++      { name: "triage", schema: () => resolveStepSchema(pluginRoot, "triage", "triage"), base: {} },
++      { name: "infra", schema: () => resolveStepSchema(pluginRoot, "infra", "infra"), base: {} },
++      { name: "plan-edits", schema: () => resolveStepSchema(pluginRoot, "pm", "pm-edits"), base: {} },
++    ];
++
++    for (const producer of untouched) {
++      const schema = producer.schema();
++      for (const field of ["concerns", "newConcerns", "remarkable", "remarkableDecisions", "concernResolutions"]) {
++        expect(schema.properties?.[field]).toBeUndefined();
++      }
++    }
++  });
++});
+diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+new file mode 100644
+index 0000000..ce498df
+--- /dev/null
++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+@@ -0,0 +1,165 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
++
++/**
++ * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
++ *
++ * The schema is the write gate: a valid concern payload must reach the
++ * canonical artifact writer, while an unknown `kind` must be rejected by
++ * validation and never reach that writer. `detail` and `severity` are
++ * optional in JSON; the runtime concern store fills defaults.
++ */
++describe("Concern funnel schemas", () => {
++  let tmpRepo: TmpRepo;
++  let repoObj: Repo;
++  let pipeline: PipelineConfig;
++  let project: ProjectConfig;
++  let prompts: ReturnType<typeof loadPromptLibrary>;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    project = {
++      orchestrationFolder: ".factory",
++      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
++    };
++    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: project.worktreeRoot });
++    pipeline = {
++      models: {
++        roles: {
++          workhorse: { model: "deepseek-chat" },
++          simpler: { model: "deepseek-chat" },
++        },
++      },
++      agents: {
++        developer: { role: "workhorse" },
++      },
++      flows: {
++        simple: { steps: [] },
++        story: {},
++        spike: {},
++      },
++      limits: {},
++    };
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
++  async function runConcernStep(opts: {
++    task: string;
++    item: string;
++    stepFragment: "poc" | "test-assumptions";
++    data: Record<string, unknown>;
++    markerPath: string;
++  }) {
++    const taskDir = path.join(tmpRepo.dir, ".factory", opts.task);
++    const recordsDir = path.join(taskDir, "items", opts.item, "steps");
++    fs.mkdirSync(recordsDir, { recursive: true });
++    const childWt = tmpRepo.createWorktree(`topic/${opts.task}--${opts.item}`);
++
++    const harness = new FakeHarness();
++    const label = `${opts.task}/items/${opts.item}/develop#a1`;
++    harness.scriptOutcome(label, { ok: true, data: opts.data });
++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
++    harness.scriptComplete(() => opts.data);
++
++    let writes = 0;
++    const result = await runAgentStep({
++      task: opts.task,
++      item: opts.item,
++      stepId: "develop",
++      stepFragment: opts.stepFragment,
++      agent: "developer",
++      cwd: childWt,
++      taskDir,
++      recordsDir,
++      repo: repoObj,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      promptVars: {
++        assignment: "Exercise concern schema",
++        context: "Concern funnel test context",
++      },
++      writeArtifact: async (output) => {
++        writes++;
++        fs.writeFileSync(opts.markerPath, JSON.stringify(output), "utf8");
++      },
++    });
++
++    return { result, writes };
++  }
++
++  it("valid concerns pass validation and unknown kinds reject with no artifact write", async () => {
++    // Valid payload: minimal concern (detail/severity omitted) plus a fully populated one.
++    const validMarker = path.join(tmpRepo.dir, "valid-concern-write.json");
++    const validData = {
++      status: "ok",
++      summary: "PoC completed",
++      evidence: ["poc/attempt.ts ran"],
++      concerns: [
++        { kind: "assumption", summary: "Provider retries are safe" },
++        {
++          kind: "risk",
++          summary: "PoC relies on an unstable API",
++          detail: "The endpoint shape may change",
++          severity: "medium",
++          location: { file: "poc/attempt.ts", line: 12 },
++          affects: ["concerns-funnel"],
++        },
++      ],
++    };
++
++    const valid = await runConcernStep({
++      task: "concern-valid",
++      item: "poc-item",
++      stepFragment: "poc",
++      data: validData,
++      markerPath: validMarker,
++    });
++
++    expect(valid.result.ok).toBe(true);
++    expect(valid.result.status).toBe("ok");
++    expect(valid.writes).toBe(1);
++    expect(fs.existsSync(validMarker)).toBe(true);
++    const written = JSON.parse(fs.readFileSync(validMarker, "utf8"));
++    expect(written.concerns.map((c: any) => c.kind)).toEqual(["assumption", "risk"]);
++
++    // Invalid payload: unknown concern kind must be rejected by the schema,
++    // and the canonical artifact writer must never run.
++    const invalidMarker = path.join(tmpRepo.dir, "invalid-concern-write.json");
++    const invalidData = {
++      status: "ok",
++      summary: "Assumptions tested",
++      evidence: ["tests/assumption.test.ts passed"],
++      concerns: [{ kind: "bug", summary: "Unknown concern kind" }],
++    };
++
++    const invalid = await runConcernStep({
++      task: "concern-invalid",
++      item: "assumption-item",
++      stepFragment: "test-assumptions",
++      data: invalidData,
++      markerPath: invalidMarker,
++    });
++
++    expect(invalid.result.ok).toBe(false);
++    expect(invalid.result.status).toBe("rejected");
++    expect(invalid.writes).toBe(0);
++    expect(fs.existsSync(invalidMarker)).toBe(false);
++    expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..4ff15fe
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T05:34:45.219Z
+session: 01a1b9a6-ed25-70c0-8ca7-38a6e399e3b7
+endedAt: 2026-11-08T05:42:39.584Z
+usage:
+  inputTokens: 48843
+  outputTokens: 25661
+  costUsd: 0.010694
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T05-34-47-077Z_01a1b9a6-ed25-70c0-8ca7-38a6e399e3b7.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..fafff85
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-schemas/steps/004-qa-r1-a1/output.yaml
@@ -0,0 +1,38 @@
+status: approved
+summary: "Schemas green: 6/6 targets pass, typecheck+prompts pass, strict kind
+  enum with no-write proven, no weakening"
+suggestions:
+  - detail: Schema now requires structured {kind,summary} objects but
+      DeveloperOutputArtifact.concerns remains string[]. No gate breaks (nothing
+      reads concerns yet) but runtime/store split must reconcile type to
+      Concern[] or Omit<Concern,'id'>. Deferred debt, not schemas-story scope.
+    disposition: optional
+    id: developer-output-type-mismatch
+    location:
+      file: plugins/software-factory/src/core/artifacts.ts
+      line: 393
+    summary: DeveloperOutputArtifact.concerns type still string[] vs structured schema
+  - detail: inferTaskWorktree fixes taskWt fallback for TMPDIR under
+      .factory-runtime/tmp (old split on '/.factory' mis-resolved to workspace
+      root). All prod callsites already pass taskWt explicitly so risk is
+      fallback/test path only; full suite 293 pass. Alternative test-only fix
+      (pass taskWt in funnel helper) would preserve schemas-only diff, but prod
+      fix is strictly more correct (uses orchestrationFolder, boundary match).
+      No dedicated unit test for infer; covered only indirectly when TMPDIR
+      contains .factory substring.
+    disposition: optional
+    id: step-runner-fallback-scope
+    location:
+      file: plugins/software-factory/src/core/flows/step-runner.ts
+      line: 162
+    summary: Out-of-scope step-runner fallback fix is correct but lacks direct test
+  - detail: Check uses .some(!includes) so superset enum would pass as long as
+      resolve|carry|propagate present. Dismiss is separately rejected so current
+      impl (exact 3) is safe, but extra action like archive would slip. Tighten
+      to exact set equality like kind/severity checks.
+    disposition: optional
+    id: concern-resolutions-enum-exactness
+    location:
+      file: plugins/software-factory/test/contracts/concern-schemas.test.ts
+      line: 334
+    summary: concernResolutions test allows superset enum
diff --git a/plugins/software-factory/config/schemas/decisions.schema.json b/plugins/software-factory/config/schemas/decisions.schema.json
index 3aea7bf..47bda68 100644
--- a/plugins/software-factory/config/schemas/decisions.schema.json
+++ b/plugins/software-factory/config/schemas/decisions.schema.json
@@ -44,7 +44,32 @@
     "reason": { "type": "string", "description": "Reason for abandonment or abort" },
     "question": { "type": "string", "description": "Specific question for human operator when decision is human-async or blocked" },
     "planDelta": { "type": "string", "description": "Plan delta or amendment directives when decision is amend" },
-    "timestamp": { "type": "string", "description": "ISO timestamp (assigned by engine if omitted)" }
+    "timestamp": { "type": "string", "description": "ISO timestamp (assigned by engine if omitted)" },
+    "concerns": {
+      "type": "array",
+      "description": "Structured concerns raised by the architect",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    }
   },
   "additionalProperties": false
 }
diff --git a/plugins/software-factory/config/schemas/developer-output.schema.json b/plugins/software-factory/config/schemas/developer-output.schema.json
index 186c4bb..99f6e8f 100644
--- a/plugins/software-factory/config/schemas/developer-output.schema.json
+++ b/plugins/software-factory/config/schemas/developer-output.schema.json
@@ -60,9 +60,28 @@
     },
     "concerns": {
       "type": "array",
-      "description": "Observations, technical debt, or potential risks identified during implementation",
-      "items": { "type": "string" },
-      "default": []
+      "description": "Structured concerns raised during implementation",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
     },
     "notes": {
       "type": "string",
diff --git a/plugins/software-factory/config/schemas/fact-finder-output.schema.json b/plugins/software-factory/config/schemas/fact-finder-output.schema.json
index b302ca2..b042c9d 100644
--- a/plugins/software-factory/config/schemas/fact-finder-output.schema.json
+++ b/plugins/software-factory/config/schemas/fact-finder-output.schema.json
@@ -18,6 +18,31 @@
     "recommendations": {
       "type": "array",
       "items": { "type": "string" }
+    },
+    "concerns": {
+      "type": "array",
+      "description": "Structured concerns raised while investigating",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
     }
   },
   "additionalProperties": false
diff --git a/plugins/software-factory/config/schemas/plan-closeup.schema.json b/plugins/software-factory/config/schemas/plan-closeup.schema.json
index 08b2f53..3b82c0c 100644
--- a/plugins/software-factory/config/schemas/plan-closeup.schema.json
+++ b/plugins/software-factory/config/schemas/plan-closeup.schema.json
@@ -23,6 +23,42 @@
     "techDebt": {
       "type": "array",
       "items": { "type": "string" }
+    },
+    "concerns": {
+      "type": "array",
+      "description": "Structured concerns raised at plan close-up",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "concernResolutions": {
+      "type": "array",
+      "description": "Close-up resolutions for open concerns",
+      "items": {
+        "type": "object", "required": ["id", "action"], "additionalProperties": false,
+        "properties": {
+          "id": { "type": "string" }, "note": { "type": "string" },
+          "action": { "type": "string", "enum": ["resolve", "carry", "propagate"] }
+        }
+      }
     }
   },
   "additionalProperties": false
diff --git a/plugins/software-factory/config/schemas/plan.schema.json b/plugins/software-factory/config/schemas/plan.schema.json
index 20c26e8..83032cf 100644
--- a/plugins/software-factory/config/schemas/plan.schema.json
+++ b/plugins/software-factory/config/schemas/plan.schema.json
@@ -127,6 +127,31 @@
         },
         "additionalProperties": false
       }
+    },
+    "concerns": {
+      "type": "array",
+      "description": "Structured concerns raised during planning",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
     }
   },
   "additionalProperties": false
diff --git a/plugins/software-factory/config/schemas/review.schema.json b/plugins/software-factory/config/schemas/review.schema.json
index 0221cb6..bb9769b 100644
--- a/plugins/software-factory/config/schemas/review.schema.json
+++ b/plugins/software-factory/config/schemas/review.schema.json
@@ -25,7 +25,8 @@
               "architect",
               "human-awareness",
               "human-async",
-              "human-stop"
+              "human-stop",
+              "dismiss"
             ]
           },
           "summary": { "type": "string" },
@@ -42,6 +43,20 @@
         },
         "additionalProperties": false
       }
+    },
+    "newConcerns": {
+      "type": "array",
+      "description": "New concerns discovered during review",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
     }
   },
   "additionalProperties": false
diff --git a/plugins/software-factory/config/schemas/wave-closeup.schema.json b/plugins/software-factory/config/schemas/wave-closeup.schema.json
index 932f270..2a655b8 100644
--- a/plugins/software-factory/config/schemas/wave-closeup.schema.json
+++ b/plugins/software-factory/config/schemas/wave-closeup.schema.json
@@ -31,6 +31,42 @@
     "recommendations": {
       "type": "array",
       "items": { "type": "string" }
+    },
+    "concerns": {
+      "type": "array",
+      "description": "Structured concerns raised at wave close-up",
+      "items": {
+        "type": "object", "required": ["kind", "summary"], "additionalProperties": false,
+        "properties": {
+          "kind": { "type": "string", "enum": ["tech-debt", "assumption", "blocker", "risk", "question"] },
+          "summary": { "type": "string" }, "detail": { "type": "string" },
+          "severity": { "type": "string", "enum": ["low", "medium", "high"] },
+          "location": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string" }, "line": { "type": "integer" } }, "additionalProperties": false },
+          "affects": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
+    "concernResolutions": {
+      "type": "array",
+      "description": "Close-up resolutions for open concerns",
+      "items": {
+        "type": "object", "required": ["id", "action"], "additionalProperties": false,
+        "properties": {
+          "id": { "type": "string" }, "note": { "type": "string" },
+          "action": { "type": "string", "enum": ["resolve", "carry", "propagate"] }
+        }
+      }
     }
   },
   "additionalProperties": false
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index 131e474..2c307fa 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -154,6 +154,18 @@ export function resolveStepSchema(
   };
 }
 
+/**
+ * Infers the task worktree from `<taskWt>/<orchestrationFolder>/<task>`.
+ * Matches the folder boundary rather than the first `/.factory` substring so
+ * temp roots such as `.factory-runtime/tmp` are not mistaken for it.
+ */
+function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: string): string {
+  const tail = [...orchestrationFolder.split(/[\\/]/).filter(Boolean), task];
+  const parts = taskDir.split(/[\\/]/);
+  const matches = tail.every((seg, i) => parts[parts.length - tail.length + i] === seg);
+  return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
+}
+
 /**
  * Runs a single agent turn/step per §6.1, §6.3, §6.4.
  */
@@ -214,7 +226,8 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
   const recordDir = path.join(recordsDir, dirName);
 
   // Identify worktree that contains recordDir
-  const taskWt = opts.taskWt ?? (taskDir.includes("/.factory") ? taskDir.split("/.factory")[0]! : taskDir);
+  const taskWt =
+    opts.taskWt ?? inferTaskWorktree(taskDir, task, project.orchestrationFolder ?? ".factory");
   const wtToCommit = recordDir.startsWith(cwd) ? cwd : taskWt;
 
   // 3. Resolve schema
diff --git a/plugins/software-factory/src/core/records/review-schema.ts b/plugins/software-factory/src/core/records/review-schema.ts
index dda969f..5a66e69 100644
--- a/plugins/software-factory/src/core/records/review-schema.ts
+++ b/plugins/software-factory/src/core/records/review-schema.ts
@@ -47,6 +47,40 @@ export function generateReviewSchema(
           additionalProperties: false,
         },
       },
+      newConcerns: {
+        type: "array",
+        description: "New concerns discovered during review",
+        items: {
+          type: "object",
+          required: ["kind", "summary"],
+          additionalProperties: false,
+          properties: {
+            kind: {
+              type: "string",
+              enum: ["tech-debt", "assumption", "blocker", "risk", "question"],
+            },
+            summary: { type: "string" },
+            detail: { type: "string" },
+            severity: {
+              type: "string",
+              enum: ["low", "medium", "high"],
+            },
+            location: {
+              type: "object",
+              required: ["file"],
+              properties: {
+                file: { type: "string" },
+                line: { type: "integer" },
+              },
+              additionalProperties: false,
+            },
+            affects: {
+              type: "array",
+              items: { type: "string" },
+            },
+          },
+        },
+      },
     },
     additionalProperties: false,
   };
diff --git a/plugins/software-factory/test/contracts/concern-schemas.test.ts b/plugins/software-factory/test/contracts/concern-schemas.test.ts
new file mode 100644
index 0000000..a4802a1
--- /dev/null
+++ b/plugins/software-factory/test/contracts/concern-schemas.test.ts
@@ -0,0 +1,375 @@
+import { describe, expect, it } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createAjv } from "../../src/core/config/ajv.js";
+import { resolveStepSchema } from "../../src/core/flows/step-runner.js";
+
+/**
+ * Contract tests for concern/remarkable producer schemas (docs/factory.v2.md §18).
+ *
+ * Every agent output that can raise concerns must carry the shared definitions
+ * inline (no cross-file `$ref`) so Ajv can validate the schema standalone:
+ *   - concerns[] on developers, fact-finders, plans, decisions, and close-ups
+ *   - newConcerns[] on review/QA outputs (triage stays in suggestions[])
+ *   - remarkable decisions on outputs that report tradeoffs
+ *   - concernResolutions[] on wave/plan close-ups
+ *
+ * Severity and detail stay optional in JSON; the runtime concern store applies
+ * defaults. `kind` is a strict enum so an unknown kind fails validation before
+ * any engine-side write.
+ */
+
+const pluginRoot = path.resolve(import.meta.dir, "../..");
+const CONCERN_KINDS = ["tech-debt", "assumption", "blocker", "risk", "question"];
+
+type JsonSchema = Record<string, any>;
+
+interface Producer {
+  name: string;
+  schema: () => JsonSchema;
+  base: JsonSchema;
+}
+
+function validator(schema: JsonSchema) {
+  return createAjv().compile(schema);
+}
+
+function resolveRef(schema: JsonSchema, node: any): any {
+  if (!node || typeof node !== "object") return node;
+  const ref = node.$ref;
+  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
+  let target: any = schema;
+  for (const part of ref.slice(2).split("/")) target = target?.[part];
+  return target ? { ...target, ...node, $ref: undefined } : node;
+}
+
+function arrayItem(schema: JsonSchema, property: string): any {
+  const prop = resolveRef(schema, schema.properties?.[property]);
+  if (!prop || prop.type !== "array") return undefined;
+  return resolveRef(schema, prop.items);
+}
+
+function externalRefs(node: any, refs: string[] = []): string[] {
+  if (!node || typeof node !== "object") return refs;
+  if (Array.isArray(node)) {
+    for (const child of node) externalRefs(child, refs);
+    return refs;
+  }
+  if (typeof node.$ref === "string" && !node.$ref.startsWith("#/")) {
+    refs.push(node.$ref);
+  }
+  for (const [key, value] of Object.entries(node)) {
+    if (key !== "$ref") externalRefs(value, refs);
+  }
+  return refs;
+}
+
+function validationErrors(validate: any): string {
+  return (validate.errors ?? [])
+    .map((e: any) => `${e.instancePath || "/"} ${e.message}`)
+    .join("; ");
+}
+
+function hasConcernShape(schema: JsonSchema, item: any, label: string, failures: string[]) {
+  const required: string[] = item?.required ?? [];
+  if (!required.includes("kind")) failures.push(`${label}: kind must be required`);
+  if (!required.includes("summary")) failures.push(`${label}: summary must be required`);
+  if (required.includes("detail")) failures.push(`${label}: detail must be optional at schema level`);
+  if (required.includes("severity")) failures.push(`${label}: severity must be optional at schema level`);
+
+  const kinds = resolveRef(schema, item?.properties?.kind)?.enum ?? [];
+  const sortedKinds = [...kinds].sort();
+  if (sortedKinds.length !== CONCERN_KINDS.length || !CONCERN_KINDS.every((k) => sortedKinds.includes(k))) {
+    failures.push(`${label}: kind enum must be ${CONCERN_KINDS.join("|")}, got ${JSON.stringify(kinds)}`);
+  }
+
+  const severity = resolveRef(schema, item?.properties?.severity);
+  if (!severity) {
+    failures.push(`${label}: severity property must be declared but optional`);
+  } else {
+    const severities: string[] = [...(severity.enum ?? [])].sort();
+    if (severities.length !== 3 || !["high", "low", "medium"].every((s) => severities.includes(s))) {
+      failures.push(`${label}: severity enum must be low|medium|high, got ${JSON.stringify(severity.enum)}`);
+    }
+  }
+}
+
+const CONCERN_PRODUCERS: Producer[] = [
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
+    name: "decisions",
+    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-wave-report"),
+    base: { decision: "continue" },
+  },
+  {
+    name: "wave-closeup",
+    schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
+    base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
+  },
+  {
+    name: "plan-closeup",
+    schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
+    base: { iteration: 1, status: "complete", summary: "Plan complete" },
+  },
+  {
+    name: "architect-closeup",
+    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
+    base: { iteration: 1, status: "complete", summary: "Plan complete" },
+  },
+];
+
+const REVIEW_PRODUCERS: Producer[] = [
+  {
+    name: "qa",
+    schema: () => resolveStepSchema(pluginRoot, "qa", "qa", ["fix", "optional", "architect", "dismiss"]),
+    base: { status: "approved", summary: "Tests are sound", suggestions: [] },
+  },
+  {
+    name: "reviewer",
+    schema: () => resolveStepSchema(pluginRoot, "reviewer", "review", ["fix", "optional", "architect", "dismiss"]),
+    base: { status: "approved", summary: "Change is sound", suggestions: [] },
+  },
+  {
+    name: "review-file",
+    schema: () =>
+      JSON.parse(fs.readFileSync(path.resolve(pluginRoot, "config/schemas/review.schema.json"), "utf8")),
+    base: { status: "approved", summary: "Change is sound", suggestions: [] },
+  },
+];
+
+describe("Concern producer schemas", () => {
+  it("inlines the concern definition into every producer schema without external refs", () => {
+    const failures: string[] = [];
+
+    for (const producer of CONCERN_PRODUCERS) {
+      const schema = producer.schema();
+      const validate = validator(schema);
+      const label = producer.name;
+
+      const item = arrayItem(schema, "concerns");
+      if (!item) {
+        failures.push(`${label}: missing inline concerns[]`);
+        continue;
+      }
+      hasConcernShape(schema, item, label, failures);
+
+      if (!validate({ ...producer.base, concerns: [{ kind: "blocker", summary: "Dependency missing" }] })) {
+        failures.push(`${label}: minimal concern rejected (${validationErrors(validate)})`);
+      }
+      if (
+        !validate({
+          ...producer.base,
+          concerns: [
+            {
+              kind: "risk",
+              summary: "Flaky gate",
+              detail: "Retries hide real failures",
+              severity: "high",
+              location: { file: "src/core/example.ts", line: 3 },
+              affects: ["item-a"],
+            },
+          ],
+        })
+      ) {
+        failures.push(`${label}: fully populated concern rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...producer.base, concerns: [{ kind: "bug", summary: "Unknown kind" }] })) {
+        failures.push(`${label}: unknown concern kind accepted`);
+      }
+      if (validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Severity", severity: "critical" }] })) {
+        failures.push(`${label}: unknown concern severity accepted`);
+      }
+      if (validate({ ...producer.base, concerns: [{ kind: "risk" }] })) {
+        failures.push(`${label}: concern without summary accepted`);
+      }
+
+      const refs = externalRefs(schema);
+      if (refs.length > 0) {
+        failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("inlines the remarkable decision definition with chosen, alternatives, and why", () => {
+    const failures: string[] = [];
+
+    for (const producer of CONCERN_PRODUCERS) {
+      const schema = producer.schema();
+      const validate = validator(schema);
+      const label = producer.name;
+
+      let remarkableProperty: string | undefined;
+      for (const [property, raw] of Object.entries(schema.properties ?? {})) {
+        const item = (() => {
+          const prop = resolveRef(schema, raw);
+          return prop?.type === "array" ? resolveRef(schema, prop.items) : undefined;
+        })();
+        const required: string[] = item?.required ?? [];
+        if (["chosen", "alternatives", "why"].every((key) => required.includes(key))) {
+          remarkableProperty = property;
+          break;
+        }
+      }
+
+      if (!remarkableProperty) {
+        failures.push(`${label}: missing inline remarkable decision array`);
+        continue;
+      }
+
+      const remarkable = [{ chosen: "Inline shared schema definitions", alternatives: ["Cross-file $ref"], why: "Ajv validates each producer schema standalone" }];
+      if (!validate({ ...producer.base, [remarkableProperty]: remarkable })) {
+        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...producer.base, [remarkableProperty]: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
+        failures.push(`${label}: remarkable decision without alternatives accepted`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("adds newConcerns to review and QA schemas outside the triage suggestions", () => {
+    const failures: string[] = [];
+
+    for (const producer of REVIEW_PRODUCERS) {
+      const schema = producer.schema();
+      const validate = validator(schema);
+      const label = producer.name;
+
+      const item = arrayItem(schema, "newConcerns");
+      if (!item) {
+        failures.push(`${label}: missing inline newConcerns[]`);
+        continue;
+      }
+      hasConcernShape(schema, item, label, failures);
+
+      if (!validate({ ...producer.base, newConcerns: [{ kind: "assumption", summary: "Assumed atomic writes" }] })) {
+        failures.push(`${label}: valid new concern rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...producer.base, newConcerns: [{ kind: "bug", summary: "Unknown kind" }] })) {
+        failures.push(`${label}: unknown new-concern kind accepted`);
+      }
+      if (
+        validate({
+          ...producer.base,
+          newConcerns: [{ kind: "risk", summary: "Severity", severity: "critical" }],
+        })
+      ) {
+        failures.push(`${label}: unknown new-concern severity accepted`);
+      }
+      if (validate({ ...producer.base, newConcerns: [{ kind: "risk" }] })) {
+        failures.push(`${label}: new concern without summary accepted`);
+      }
+      if (
+        !validate({
+          ...producer.base,
+          suggestions: [{ id: "s-1", disposition: "dismiss", summary: "Duplicate of an existing concern" }],
+        })
+      ) {
+        failures.push(
+          `${label}: dismiss without detail must pass the JSON schema; the concern store enforces detail`
+        );
+      }
+
+      const refs = externalRefs(schema);
+      if (refs.length > 0) {
+        failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("adds concernResolutions with resolve, carry, and propagate to close-up schemas", () => {
+    const failures: string[] = [];
+    const closeups: Producer[] = [
+      {
+        name: "wave-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
+        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
+      },
+      {
+        name: "plan-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
+        base: { iteration: 1, status: "complete", summary: "Plan complete" },
+      },
+      {
+        name: "architect-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
+        base: { iteration: 1, status: "complete", summary: "Plan complete" },
+      },
+    ];
+
+    for (const closeup of closeups) {
+      const schema = closeup.schema();
+      const validate = validator(schema);
+      const label = closeup.name;
+
+      const item = arrayItem(schema, "concernResolutions");
+      if (!item) {
+        failures.push(`${label}: missing inline concernResolutions[]`);
+        continue;
+      }
+      const required: string[] = item.required ?? [];
+      if (!required.includes("id") || !required.includes("action")) {
+        failures.push(`${label}: concernResolutions must require id and action`);
+      }
+      const actions = resolveRef(schema, item.properties?.action)?.enum ?? [];
+      if (["resolve", "carry", "propagate"].some((action) => !actions.includes(action))) {
+        failures.push(`${label}: action enum must be resolve|carry|propagate, got ${JSON.stringify(actions)}`);
+      }
+
+      if (
+        !validate({
+          ...closeup.base,
+          concernResolutions: [
+            { id: "c-1", action: "resolve" },
+            { id: "c-2", action: "carry", note: "Needs an architect decision" },
+            { id: "c-3", action: "propagate" },
+          ],
+        })
+      ) {
+        failures.push(`${label}: valid concern resolutions rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...closeup.base, concernResolutions: [{ id: "c-4", action: "dismiss" }] })) {
+        failures.push(`${label}: dismiss action accepted for a close-up resolution`);
+      }
+      if (validate({ ...closeup.base, concernResolutions: [{ action: "resolve" }] })) {
+        failures.push(`${label}: resolution without concern id accepted`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("leaves triage, infra, and plan-edit schemas untouched", () => {
+    const untouched: Producer[] = [
+      { name: "triage", schema: () => resolveStepSchema(pluginRoot, "triage", "triage"), base: {} },
+      { name: "infra", schema: () => resolveStepSchema(pluginRoot, "infra", "infra"), base: {} },
+      { name: "plan-edits", schema: () => resolveStepSchema(pluginRoot, "pm", "pm-edits"), base: {} },
+    ];
+
+    for (const producer of untouched) {
+      const schema = producer.schema();
+      for (const field of ["concerns", "newConcerns", "remarkable", "remarkableDecisions", "concernResolutions"]) {
+        expect(schema.properties?.[field]).toBeUndefined();
+      }
+    }
+  });
+});
diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
new file mode 100644
index 0000000..ce498df
--- /dev/null
+++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
@@ -0,0 +1,165 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runAgentStep } from "../../src/core/flows/step-runner.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
+
+/**
+ * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
+ *
+ * The schema is the write gate: a valid concern payload must reach the
+ * canonical artifact writer, while an unknown `kind` must be rejected by
+ * validation and never reach that writer. `detail` and `severity` are
+ * optional in JSON; the runtime concern store fills defaults.
+ */
+describe("Concern funnel schemas", () => {
+  let tmpRepo: TmpRepo;
+  let repoObj: Repo;
+  let pipeline: PipelineConfig;
+  let project: ProjectConfig;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    project = {
+      orchestrationFolder: ".factory",
+      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
+    };
+    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: project.worktreeRoot });
+    pipeline = {
+      models: {
+        roles: {
+          workhorse: { model: "deepseek-chat" },
+          simpler: { model: "deepseek-chat" },
+        },
+      },
+      agents: {
+        developer: { role: "workhorse" },
+      },
+      flows: {
+        simple: { steps: [] },
+        story: {},
+        spike: {},
+      },
+      limits: {},
+    };
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
+  async function runConcernStep(opts: {
+    task: string;
+    item: string;
+    stepFragment: "poc" | "test-assumptions";
+    data: Record<string, unknown>;
+    markerPath: string;
+  }) {
+    const taskDir = path.join(tmpRepo.dir, ".factory", opts.task);
+    const recordsDir = path.join(taskDir, "items", opts.item, "steps");
+    fs.mkdirSync(recordsDir, { recursive: true });
+    const childWt = tmpRepo.createWorktree(`topic/${opts.task}--${opts.item}`);
+
+    const harness = new FakeHarness();
+    const label = `${opts.task}/items/${opts.item}/develop#a1`;
+    harness.scriptOutcome(label, { ok: true, data: opts.data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
+    harness.scriptComplete(() => opts.data);
+
+    let writes = 0;
+    const result = await runAgentStep({
+      task: opts.task,
+      item: opts.item,
+      stepId: "develop",
+      stepFragment: opts.stepFragment,
+      agent: "developer",
+      cwd: childWt,
+      taskDir,
+      recordsDir,
+      repo: repoObj,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: {
+        assignment: "Exercise concern schema",
+        context: "Concern funnel test context",
+      },
+      writeArtifact: async (output) => {
+        writes++;
+        fs.writeFileSync(opts.markerPath, JSON.stringify(output), "utf8");
+      },
+    });
+
+    return { result, writes };
+  }
+
+  it("valid concerns pass validation and unknown kinds reject with no artifact write", async () => {
+    // Valid payload: minimal concern (detail/severity omitted) plus a fully populated one.
+    const validMarker = path.join(tmpRepo.dir, "valid-concern-write.json");
+    const validData = {
+      status: "ok",
+      summary: "PoC completed",
+      evidence: ["poc/attempt.ts ran"],
+      concerns: [
+        { kind: "assumption", summary: "Provider retries are safe" },
+        {
+          kind: "risk",
+          summary: "PoC relies on an unstable API",
+          detail: "The endpoint shape may change",
+          severity: "medium",
+          location: { file: "poc/attempt.ts", line: 12 },
+          affects: ["concerns-funnel"],
+        },
+      ],
+    };
+
+    const valid = await runConcernStep({
+      task: "concern-valid",
+      item: "poc-item",
+      stepFragment: "poc",
+      data: validData,
+      markerPath: validMarker,
+    });
+
+    expect(valid.result.ok).toBe(true);
+    expect(valid.result.status).toBe("ok");
+    expect(valid.writes).toBe(1);
+    expect(fs.existsSync(validMarker)).toBe(true);
+    const written = JSON.parse(fs.readFileSync(validMarker, "utf8"));
+    expect(written.concerns.map((c: any) => c.kind)).toEqual(["assumption", "risk"]);
+
+    // Invalid payload: unknown concern kind must be rejected by the schema,
+    // and the canonical artifact writer must never run.
+    const invalidMarker = path.join(tmpRepo.dir, "invalid-concern-write.json");
+    const invalidData = {
+      status: "ok",
+      summary: "Assumptions tested",
+      evidence: ["tests/assumption.test.ts passed"],
+      concerns: [{ kind: "bug", summary: "Unknown concern kind" }],
+    };
+
+    const invalid = await runConcernStep({
+      task: "concern-invalid",
+      item: "assumption-item",
+      stepFragment: "test-assumptions",
+      data: invalidData,
+      markerPath: invalidMarker,
+    });
+
+    expect(invalid.result.ok).toBe(false);
+    expect(invalid.result.status).toBe("rejected");
+    expect(invalid.writes).toBe(0);
+    expect(fs.existsSync(invalidMarker)).toBe(false);
+    expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
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
