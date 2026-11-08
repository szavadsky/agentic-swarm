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
  "slug": "concerns-contracts-types",
  "kind": "dev",
  "title": "Concern artifact types",
  "assignment": "Types only (split 1/3 of concerns-contracts per decision 001; unblocks schemas+policy). In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON schemas, no runtime, no repair logic (deferred to concerns-store). Do not implement aggregate/repair/triage; do not use cross-file $ref. Prod budget <=80 lines. Verify: bun run typecheck. Run with TMPDIR=/tmp.",
  "outlineRef": "concerns-contracts-types",
  "milestone": "m1-contracts-aggregate",
  "wave": 2,
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..7f84177
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,30 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 5 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-artifact-types.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794112737752-821o8dc41yq.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..c026009
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,56 @@
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
+  "slug": "concerns-contracts-types",
+  "kind": "dev",
+  "title": "Concern artifact types",
+  "assignment": "Types only (split 1/3 of concerns-contracts per decision 001; unblocks schemas+policy). In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON schemas, no runtime, no repair logic (deferred to concerns-store). Do not implement aggregate/repair/triage; do not use cross-file $ref. Prod budget <=80 lines. Verify: bun run typecheck. Run with TMPDIR=/tmp.",
+  "outlineRef": "concerns-contracts-types",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 2,
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..ece9cb1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T04:34:51.371Z
+session: 01a1b970-111e-764a-948b-70138691abc4
+endedAt: 2026-11-08T04:38:59.013Z
+usage:
+  inputTokens: 87078
+  outputTokens: 36517
+  costUsd: 0.040409
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T04-34-51-806Z_01a1b970-111e-764a-948b-70138691abc4.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..efba60c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,57 @@
+status: ok
+summary: "Added a type-contract test suite at
+  plugins/software-factory/test/contracts/concern-artifact-types.test.ts with 5
+  tests covering every required type change:
+  Concern/ConcernKind/ConcernSeverity/ConcernStatus + RemarkableDecision,
+  StoredConcernArtifact (required id/status/source, optional
+  pendingResolution{action,note,by,at} and source.escalated), ReviewDisposition
+  including dismiss and rejecting tech-debt, PlanAdr.blocking, and
+  PipelineConfig.humanInvolvement +
+  concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity} +
+  reviewPolicy.default/allowedDispositions. Tests compile fixture code against
+  src/core/artifacts.ts via the TypeScript compiler API, so runtime assertions
+  fail now with assertion failures (not import/collection errors) and will pass
+  once the types exist. No production code was modified."
+target:
+  selectors:
+    - test/contracts/concern-artifact-types.test.ts
+  expectRed:
+    - Concern artifact types.exposes structured concerns and remarkable
+      decisions with strict vocabularies
+    - Concern artifact types.stores concern lifecycle metadata including pending
+      resolution and escalation
+    - Concern artifact types.adds dismiss to review dispositions without a
+      tech-debt value
+    - Concern artifact types.marks plan ADRs as blocking or remarkable
+    - Concern artifact types.adds human involvement modes, concern thresholds,
+      and canonical review policy to pipeline config
+evidence:
+  - TMPDIR=/tmp bun test test/contracts/concern-artifact-types.test.ts
+    --reporter=junit --reporter-outfile=/tmp/junit-concerns2.xml -> 0 pass, 5
+    fail; every testcase has a JUnit <failure type="AssertionError"> status
+    (verified with XML parsing), so target-red is assertion-based rather than
+    compilation/collection error
+  - TMPDIR=/tmp bun run typecheck -> exit 0 (test file itself typechecks under
+    the project's strict tsconfig)
+  - "In-memory green probe: patched artifacts.ts source with the intended
+    contract, compiled all 5 fixture strings extracted from the test -> fixture
+    0-4 OK with zero diagnostics, confirming the fixtures are satisfiable and
+    the @ts-expect-error negative cases are precise"
+  - git status --short -> only '?? plugins/software-factory/test/contracts/' (no
+    production or config files touched)
+  - Test runtime ~1.4s for 5 tests; each test compiles one in-memory fixture
+    against the real artifacts module
+concerns:
+  - expectRed ids are declared as JUnit classname.name ids because the
+    target-red matcher normalizes against parsed JUnit ids; Bun's native '<file>
+    > <describe> > <test>' form with a file prefix does not match the engine's
+    id normalizer for this project's JUnit classname shape
+  - Concern.detail and Concern.severity are specified as required on the
+    canonical/stored type (per the context-pack target contract); the sibling
+    schemas story keeps them optional at JSON-schema level and defaults them at
+    runtime before storage
+notes: Type-only story, so the tests assert the public type surface by compiling
+  typed fixtures against src/core/artifacts.ts. @ts-expect-error placement was
+  adjusted after an in-memory green probe showed property-level diagnostics must
+  carry the directive on the offending property line. No stubs or runtime
+  behavior were added.
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..4e793c9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,115 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 2392
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 97791
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-hTeVdg/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1486004
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1486004
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1486004
+
+          test/engine/head-guard.test.ts:
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+          127 |   const stderr = res.stderr;
+          128 |   const code = res.code ?? 0;
+          129 | 
+          130 |   if (code !== 0 && !opts?.allowFail) {
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-types/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-types/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-types/plugins/software-factory/src/core/mutex.ts:39:20)
+          (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [32.53ms]
+          126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
+          127 |   const stderr = res.stderr;
+          128 |   const code = res.code ?? 0;
+          129 | 
+          130 |   if (code !== 0 && !opts?.allowFail) {
+          131 |     throw new GitError(args.join(" "), code, stderr, stdout);
+                          ^
+          GitError: git add -A failed with exit code 128:
+          fatal: not a git repository (or any of the parent directories): .git
+
+           command: "add -A",
+              code: 128,
+            stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
+            stdout: "",
+
+                at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-types/plugins/software-factory/src/core/git/exec.ts:131:11)
+                at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-types/plugins/software-factory/src/core/git/commit.ts:23:13)
+                at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-types/plugins/software-factory/src/core/mutex.ts:39:20)
+          (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [24.96ms]
+
+           285 pass
+           2 skip
+           2 fail
+           1139 expect() calls
+          Ran 289 tests across 52 files. [48.65s]
+        failingTests:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-artifact-types.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794112984620-9kweetfxfo.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 72/300 production lines changed"
+    details:
+      changedLines:
+        added: 71
+        deleted: 1
+        total: 72
+        files:
+          - plugins/software-factory/src/core/artifacts.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..e16d8b0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,66 @@
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
+  "slug": "concerns-contracts-types",
+  "kind": "dev",
+  "title": "Concern artifact types",
+  "assignment": "Types only (split 1/3 of concerns-contracts per decision 001; unblocks schemas+policy). In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON schemas, no runtime, no repair logic (deferred to concerns-store). Do not implement aggregate/repair/triage; do not use cross-file $ref. Prod budget <=80 lines. Verify: bun run typecheck. Run with TMPDIR=/tmp.",
+  "outlineRef": "concerns-contracts-types",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 2,
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/contracts/concern-artifact-types.test.ts"
+  ],
+  "expectRed": [
+    "Concern artifact types.exposes structured concerns and remarkable decisions with strict vocabularies",
+    "Concern artifact types.stores concern lifecycle metadata including pending resolution and escalation",
+    "Concern artifact types.adds dismiss to review dispositions without a tech-debt value",
+    "Concern artifact types.marks plan ADRs as blocking or remarkable",
+    "Concern artifact types.adds human involvement modes, concern thresholds, and canonical review policy to pipeline config"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..5292647
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T04:39:05.234Z
+session: 01a1b973-f155-7702-84b1-1bec2afd7ad6
+endedAt: 2026-11-08T04:43:05.360Z
+usage:
+  inputTokens: 28233
+  outputTokens: 7503
+  costUsd: 0.009483
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T04-39-05-813Z_01a1b973-f155-7702-84b1-1bec2afd7ad6
diff --git a/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..6dbac3d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/concerns-contracts-types/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,59 @@
+status: ok
+summary: "Added the concern/remarkable type surface to
+  plugins/software-factory/src/core/artifacts.ts:
+  ConcernKind/ConcernSeverity/ConcernStatus vocabularies, Concern,
+  RemarkableDecision, ConcernSource, PendingConcernResolution,
+  StoredConcernArtifact (required id, lifecycle
+  status/disposition/dismissReason, source with escalated?, optional
+  pendingResolution), added 'dismiss' to ReviewDisposition, PlanAdr.blocking?,
+  and PipelineConfig.humanInvolvement +
+  concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity} + reviewPolicy
+  with canonical `default` plus legacy `allowedDispositions` alias and per-agent
+  entries. Types only; no schemas, runtime, or repair logic. Target test went
+  from 5 failures to 5 passes; typecheck and the full suite are green with 70
+  net prod lines added (budget 80)."
+target:
+  selectors:
+    - test/contracts/concern-artifact-types.test.ts
+  expectRed:
+    - Concern artifact types.exposes structured concerns and remarkable
+      decisions with strict vocabularies
+    - Concern artifact types.stores concern lifecycle metadata including pending
+      resolution and escalation
+    - Concern artifact types.adds dismiss to review dispositions without a
+      tech-debt value
+    - Concern artifact types.marks plan ADRs as blocking or remarkable
+    - Concern artifact types.adds human involvement modes, concern thresholds,
+      and canonical review policy to pipeline config
+evidence:
+  - "Baseline red verified: `cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/contracts/concern-artifact-types.test.ts` -> 0 pass / 5 fail (missing
+    ConcernSeverity, PlanAdr.blocking, humanInvolvement, concerns)."
+  - "Target green: `cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/contracts/concern-artifact-types.test.ts` -> 5 pass / 0 fail, 5
+    expect() calls."
+  - "Typecheck: `cd plugins/software-factory && TMPDIR=/tmp bun run typecheck`
+    -> exit 0."
+  - "Full project suite: `cd plugins/software-factory && TMPDIR=/tmp bun test`
+    -> 287 pass / 2 skip / 0 fail across 52 files."
+  - "Diff scope and budget: `git diff --stat` shows only
+    plugins/software-factory/src/core/artifacts.ts, 71 insertions / 1 deletion
+    (70 net prod lines, <= 80 budget); `git status --porcelain` confirms no
+    other modified files."
+concerns:
+  - Runtime still resolves dispositions via the legacy
+    `reviewPolicy.allowedDispositions` (src/core/flows/item-machine.ts:632,
+    src/core/flows/step-runner.ts:222); canonical `default` is type-only until
+    the policy/runtime split.
+  - ReviewSuggestion.disposition remains `ReviewDisposition | string`, which
+    collapses to `string`, so 'dismiss' is not statically enforced on that field
+    (pre-existing shape, intentionally untouched).
+  - Concern.detail is modeled as required per docs/factory.v2.md §18 field list
+    and all fixtures; revisit if the schema split wants it optional. Concern.id
+    is optional (engine assigns the fingerprint id on aggregation) while
+    StoredConcernArtifact.id is required.
+notes: "Inserted concern types between AssignmentArtifact and ReviewDisposition
+  in src/core/artifacts.ts; PlanAdr gained optional blocking?: boolean;
+  PipelineConfig gained humanInvolvement, concerns thresholds, and an explicit
+  reviewPolicy default/allowedDispositions pair while retaining the per-agent
+  index signature so existing configs and lookups compile unchanged."
diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
index cf84f76..08aed67 100644
--- a/plugins/software-factory/src/core/artifacts.ts
+++ b/plugins/software-factory/src/core/artifacts.ts
@@ -121,8 +121,19 @@ export interface PipelineConfig {
   budget?: PipelineBudget;
   diversity?: "warn" | "error" | "off";
   harness?: string;
+  /** How aggressively the human is consulted (`autonomous` is least, `detailed` most). */
+  humanInvolvement?: "autonomous" | "principal" | "detailed";
+  concerns?: {
+    /** Agents allowed to raise concerns from their structured output. */
+    raiseAllowlist?: string[];
+    minDigestSeverity?: ConcernSeverity;
+    minBlockingSeverity?: ConcernSeverity;
+  };
   reviewPolicy?: {
+    /** Canonical default dispositions for agents without a specific entry. */
     default?: string[];
+    /** Legacy alias for `default`, kept for existing pipeline configs. */
+    allowedDispositions?: string[];
     [agent: string]: string[] | undefined;
   };
   criteria?: Record<string, string>;
@@ -238,6 +249,8 @@ export interface PlanAdr {
   context: string;
   decision: string;
   consequences?: string;
+  /** Needs a human decision per the active involvement mode. */
+  blocking?: boolean;
 }
 
 export interface PlanArtifact {
@@ -285,13 +298,70 @@ export interface AssignmentArtifact {
   escalate?: boolean;
 }
 
+export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
+
+export type ConcernSeverity = "low" | "medium" | "high";
+
+export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
+
+/** A structured "see something, say something" report from any agent output. */
+export interface Concern {
+  /** Stable fingerprint id; assigned by the engine when the concern is aggregated. */
+  id?: string;
+  kind: ConcernKind;
+  summary: string;
+  detail: string;
+  location?: {
+    file: string;
+    line?: number;
+  };
+  severity: ConcernSeverity;
+  /** Item, epic, or plan refs the concern affects. */
+  affects?: string[];
+}
+
+export interface RemarkableDecision {
+  chosen: string;
+  alternatives: string[];
+  why: string;
+}
+
+export interface ConcernSource {
+  record: string;
+  agent: string;
+  step?: string;
+  item?: string;
+  iteration?: number;
+  escalated?: boolean;
+}
+
+export interface PendingConcernResolution {
+  action: "resolve" | "carry" | "propagate";
+  note?: string;
+  by: string;
+  at: string;
+}
+
+/** A concern persisted under the task's `concerns/` folder. */
+export interface StoredConcernArtifact extends Concern {
+  id: string;
+  status: ConcernStatus;
+  disposition?: ReviewDisposition;
+  dismissReason?: string;
+  source: ConcernSource;
+  pendingResolution?: PendingConcernResolution;
+  createdAt: string;
+  updatedAt: string;
+}
+
 export type ReviewDisposition =
   | "fix"
   | "optional"
   | "architect"
   | "human-awareness"
   | "human-async"
-  | "human-stop";
+  | "human-stop"
+  | "dismiss";
 
 export interface ReviewSuggestion {
   id: string;
diff --git a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
new file mode 100644
index 0000000..343910b
--- /dev/null
+++ b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
@@ -0,0 +1,312 @@
+import { describe, expect, it } from "bun:test";
+import path from "node:path";
+import ts from "typescript";
+
+/**
+ * Contract tests for the concern/remarkable types (docs/factory.v2.md §18).
+ *
+ * The story is type-only, so the observable behavior is the public type surface:
+ * a fixture that consumes the declared types must compile, and values outside the
+ * declared contract must be rejected. Each test compiles its fixture against the
+ * real `src/core/artifacts.ts` and fails when the contract is missing or wrong.
+ */
+
+const COMPILER_OPTIONS: ts.CompilerOptions = {
+  target: ts.ScriptTarget.ESNext,
+  module: ts.ModuleKind.ESNext,
+  moduleResolution: ts.ModuleResolutionKind.Bundler,
+  strict: true,
+  noEmit: true,
+  skipLibCheck: true,
+  types: [],
+  lib: ["lib.esnext.d.ts"],
+};
+
+function formatDiagnostic(diagnostic: ts.Diagnostic): string {
+  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
+  if (!diagnostic.file) return message;
+  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
+  return `${path.basename(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`;
+}
+
+function typeErrors(source: string): string[] {
+  const fixturePath = path.join(import.meta.dir, "__contract_fixture__.ts");
+  const host = ts.createCompilerHost(COMPILER_OPTIONS);
+  const defaultGetSourceFile = host.getSourceFile.bind(host);
+
+  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
+    path.normalize(fileName) === path.normalize(fixturePath)
+      ? ts.createSourceFile(fileName, source, languageVersion, true)
+      : defaultGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
+  host.fileExists = (fileName) =>
+    path.normalize(fileName) === path.normalize(fixturePath) || ts.sys.fileExists(fileName);
+  host.readFile = (fileName) =>
+    path.normalize(fileName) === path.normalize(fixturePath) ? source : ts.sys.readFile(fileName);
+
+  const program = ts.createProgram([fixturePath], COMPILER_OPTIONS, host);
+  return ts
+    .getPreEmitDiagnostics(program)
+    .filter(
+      (diagnostic) =>
+        !diagnostic.file || path.normalize(diagnostic.file.fileName) === path.normalize(fixturePath)
+    )
+    .map(formatDiagnostic);
+}
+
+describe("Concern artifact types", () => {
+  it("exposes structured concerns and remarkable decisions with strict vocabularies", () => {
+    const errors = typeErrors(`
+import type {
+  Concern,
+  ConcernKind,
+  ConcernSeverity,
+  ConcernStatus,
+  RemarkableDecision,
+} from "../../src/core/artifacts.js";
+
+const kinds: ConcernKind[] = ["tech-debt", "assumption", "blocker", "risk", "question"];
+const severities: ConcernSeverity[] = ["low", "medium", "high"];
+const statuses: ConcernStatus[] = ["open", "dismissed", "routed", "resolved"];
+
+const concern: Concern = {
+  id: "c-0123456789",
+  kind: "blocker",
+  summary: "Dependent item has no implementation",
+  detail: "Wave 2 depends on an API that does not exist",
+  location: { file: "src/core/example.ts", line: 10 },
+  severity: "high",
+  affects: ["dep-item"],
+};
+
+const minimal: Concern = {
+  kind: "question",
+  summary: "Which involvement mode applies?",
+  detail: "The task does not pin a mode",
+  severity: "low",
+};
+
+const remarkable: RemarkableDecision = {
+  chosen: "Atomic YAML writes",
+  alternatives: ["One monolithic file", "A database"],
+  why: "Keeps concerns/ diffable and conflict-free",
+};
+
+// @ts-expect-error unknown concern kinds are rejected
+const badKind: ConcernKind = "bug";
+// @ts-expect-error unknown severities are rejected
+const badSeverity: ConcernSeverity = "critical";
+// @ts-expect-error unknown statuses are rejected
+const badStatus: ConcernStatus = "pending";
+// @ts-expect-error remarkable decisions must list alternatives
+const badDecision: RemarkableDecision = { chosen: "x", why: "y" };
+// @ts-expect-error concerns require a summary
+const badConcern: Concern = { kind: "risk", detail: "x", severity: "low" };
+
+export const contract = {
+  kinds,
+  severities,
+  statuses,
+  concern,
+  minimal,
+  remarkable,
+  badKind,
+  badSeverity,
+  badStatus,
+  badDecision,
+  badConcern,
+};
+`);
+    expect(errors).toEqual([]);
+  });
+
+  it("stores concern lifecycle metadata including pending resolution and escalation", () => {
+    const errors = typeErrors(`
+import type { StoredConcernArtifact } from "../../src/core/artifacts.js";
+
+const stored: StoredConcernArtifact = {
+  id: "c-0123456789",
+  kind: "tech-debt",
+  summary: "Duplicated validation",
+  detail: "Validation is duplicated between schemas and runtime",
+  severity: "medium",
+  affects: ["item-a"],
+  status: "routed",
+  disposition: "optional",
+  dismissReason: "Duplicate of an existing concern",
+  source: {
+    record: "003-develop-a1",
+    agent: "developer",
+    step: "develop",
+    item: "item-a",
+    iteration: 2,
+    escalated: true,
+  },
+  pendingResolution: {
+    action: "carry",
+    note: "Needs an architect decision",
+    by: "wave-close-up",
+    at: "2026-11-07T00:00:00.000Z",
+  },
+  createdAt: "2026-11-07T00:00:00.000Z",
+  updatedAt: "2026-11-07T00:00:00.000Z",
+};
+
+const withoutPending: StoredConcernArtifact = {
+  id: "c-9876543210",
+  kind: "risk",
+  summary: "Flaky merge",
+  detail: "Wave merge can race with a concurrent item",
+  severity: "high",
+  status: "open",
+  source: { record: "004-review-a1", agent: "reviewer", step: "review" },
+  createdAt: "2026-11-07T00:00:00.000Z",
+  updatedAt: "2026-11-07T00:00:00.000Z",
+};
+
+// @ts-expect-error stored concerns require a stable id
+const missingId: StoredConcernArtifact = {
+  kind: "risk",
+  summary: "No id",
+  detail: "Missing the stable fingerprint id",
+  severity: "low",
+  status: "open",
+  source: { record: "004-review-a1", agent: "reviewer", step: "review" },
+  createdAt: "2026-11-07T00:00:00.000Z",
+  updatedAt: "2026-11-07T00:00:00.000Z",
+};
+const badPending: StoredConcernArtifact["pendingResolution"] = {
+  // @ts-expect-error pending actions are resolve, carry, or propagate
+  action: "dismiss",
+  note: "Not a close-up action",
+  by: "wave-close-up",
+  at: "2026-11-07T00:00:00.000Z",
+};
+
+export const contract = { stored, withoutPending, missingId, badPending };
+`);
+    expect(errors).toEqual([]);
+  });
+
+  it("adds dismiss to review dispositions without a tech-debt value", () => {
+    const errors = typeErrors(`
+import type { ReviewDisposition, ReviewSuggestion } from "../../src/core/artifacts.js";
+
+const dispositions: ReviewDisposition[] = [
+  "fix",
+  "optional",
+  "architect",
+  "human-awareness",
+  "human-async",
+  "human-stop",
+  "dismiss",
+];
+
+const triage: ReviewSuggestion = {
+  id: "c-0123456789",
+  disposition: "dismiss",
+  summary: "Not actionable after review",
+  detail: "Logged with a reason and kept in concerns/",
+};
+
+// @ts-expect-error tech-debt is a concern kind, not a review disposition
+const techDebt: ReviewDisposition = "tech-debt";
+
+export const contract = { dispositions, triage, techDebt };
+`);
+    expect(errors).toEqual([]);
+  });
+
+  it("marks plan ADRs as blocking or remarkable", () => {
+    const errors = typeErrors(`
+import type { PlanAdr } from "../../src/core/artifacts.js";
+
+const blocking: PlanAdr = {
+  id: "adr-1",
+  title: "Concern store location",
+  context: "Item steps commit only the item worktree",
+  decision: "Aggregate concerns directly to the task worktree",
+  consequences: "Wave merge commits the aggregated files",
+  blocking: true,
+};
+
+const remarkable: PlanAdr = {
+  id: "adr-2",
+  title: "Fingerprint fields",
+  context: "Rewording detail must not duplicate concerns",
+  decision: "Fingerprint kind, summary, location, and affects only",
+};
+
+const wrong: PlanAdr = {
+  id: "adr-3",
+  title: "Wrong flag",
+  context: "c",
+  decision: "d",
+  // @ts-expect-error blocking must be a boolean
+  blocking: "yes",
+};
+
+export const contract = { blocking, remarkable, wrong };
+`);
+    expect(errors).toEqual([]);
+  });
+
+  it("adds human involvement modes, concern thresholds, and canonical review policy to pipeline config", () => {
+    const errors = typeErrors(`
+import type { ConcernSeverity, PipelineConfig } from "../../src/core/artifacts.js";
+
+const base: PipelineConfig = {
+  models: { roles: {} },
+  agents: {},
+  flows: { simple: { steps: [] }, story: {}, spike: {} },
+  limits: {},
+};
+
+const configured: PipelineConfig = {
+  models: { roles: {} },
+  agents: {},
+  flows: { simple: { steps: [] }, story: {}, spike: {} },
+  limits: {},
+  humanInvolvement: "principal",
+  concerns: {
+    raiseAllowlist: ["developer", "reviewer", "architect"],
+    minDigestSeverity: "medium",
+    minBlockingSeverity: "high",
+  },
+  reviewPolicy: {
+    default: ["fix", "optional", "architect", "human-awareness", "human-async"],
+    allowedDispositions: ["fix", "optional"],
+    reviewer: ["fix", "optional", "dismiss"],
+  },
+};
+
+const modes: NonNullable<PipelineConfig["humanInvolvement"]>[] = [
+  "autonomous",
+  "principal",
+  "detailed",
+];
+const canonical: string[] | undefined = configured.reviewPolicy?.default;
+const legacy: string[] | undefined = configured.reviewPolicy?.allowedDispositions;
+const digest: ConcernSeverity | undefined = configured.concerns?.minDigestSeverity;
+
+// @ts-expect-error human involvement modes are autonomous, principal, or detailed
+const badMode: NonNullable<PipelineConfig["humanInvolvement"]> = "manual";
+// @ts-expect-error severity thresholds use concern severities
+const badThreshold: NonNullable<PipelineConfig["concerns"]>["minBlockingSeverity"] = "critical";
+// @ts-expect-error raise allowlists contain agent names
+const badRaise: NonNullable<PipelineConfig["concerns"]>["raiseAllowlist"] = [42];
+
+export const contract = {
+  base,
+  configured,
+  modes,
+  canonical,
+  legacy,
+  digest,
+  badMode,
+  badThreshold,
+  badRaise,
+};
+`);
+    expect(errors).toEqual([]);
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
