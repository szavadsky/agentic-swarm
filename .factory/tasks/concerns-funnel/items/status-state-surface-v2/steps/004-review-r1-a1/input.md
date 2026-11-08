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
  "slug": "status-state-surface-v2",
  "kind": "dev",
  "title": "State counts and status surfacing",
  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
  "outlineRef": "status-state-surface-v2",
  "milestone": "m4-funnel-surface",
  "wave": 9,
  "deps": [
    "concerns-store-v2",
    "routing-human-debt-v2"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..33cb211
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,38 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (3 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/cli/status-concerns.test.ts
+        - plugins/software-factory/test/contracts/state-concern-schema.test.ts
+        - plugins/software-factory/test/engine/state-concern-counts.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 7 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/state-concern-counts.test.ts
+        test/contracts/state-concern-schema.test.ts
+        test/cli/status-concerns.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140137748-4qiu0m8fyqk.xml
+      junitCaseCount: 7
+      junitCaseIds:
+        - factory status concern surfacing (§18).prints concern counts and
+          separates blocking from digest questions
+        - factory status concern surfacing (§18).prints zero counts when the
+          task has no concerns yet
+        - State schema concern counts.accepts concern status counts and rejects
+          incomplete ones
+        - StateArtifact concern counts (§18).counts stored concerns by status
+        - StateArtifact concern counts (§18).reports zero counts when the
+          concerns directory is missing
+        - StateArtifact concern counts (§18).skips corrupt concern files and
+          warns instead of failing derivation
+        - StateArtifact concern counts (§18).refreshStateYaml materializes the
+          counts into state.yaml
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..df037e1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/input.md
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
+  "slug": "status-state-surface-v2",
+  "kind": "dev",
+  "title": "State counts and status surfacing",
+  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
+  "outlineRef": "status-state-surface-v2",
+  "milestone": "m4-funnel-surface",
+  "wave": 9,
+  "deps": [
+    "concerns-store-v2",
+    "routing-human-debt-v2"
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
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..2e2d0e7
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T12:05:42.176Z
+session: 01a1bb0c-d594-73b0-92a4-639ebcd693af
+endedAt: 2026-11-08T12:15:38.627Z
+usage:
+  inputTokens: 114112
+  outputTokens: 43333
+  costUsd: 0.061264
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-932Z_01a1bb0c-d594-73b0-92a4-639ebcd693af.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..87790f6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,56 @@
+status: ok
+summary: "Authored three test files (7 tests) specifying StateArtifact.concerns
+  {open,dismissed,routed,resolved}: state.schema validation,
+  toStateArtifact/refreshStateYaml counts with missing-directory zeros and
+  corrupt-file skip+warn, and `factory status` rendering Concerns counts plus
+  separate Blocking vs Digest sections. All tests fail on current production
+  code with assertion failures only; typecheck passes; no production files
+  modified."
+target:
+  selectors:
+    - test/engine/state-concern-counts.test.ts
+    - test/contracts/state-concern-schema.test.ts
+    - test/cli/status-concerns.test.ts
+  expectRed:
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::counts stored concerns by status
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::reports zero counts when the concerns directory is missing
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::skips corrupt concern files and warns instead of failing derivation
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::refreshStateYaml materializes the counts into state.yaml
+    - test/contracts/state-concern-schema.test.ts::State schema concern
+      counts::accepts concern status counts and rejects incomplete ones
+    - test/cli/status-concerns.test.ts::factory status concern surfacing
+      (§18)::prints concern counts and separates blocking from digest questions
+    - test/cli/status-concerns.test.ts::factory status concern surfacing
+      (§18)::prints zero counts when the task has no concerns yet
+evidence:
+  - TMPDIR=/tmp bun test test/engine/state-concern-counts.test.ts
+    test/contracts/state-concern-schema.test.ts test/cli/status-concerns.test.ts
+    => 0 pass, 7 fail; every failure is an assertion mismatch (concerns
+    undefined, schema rejected counts, CLI text missing), proving target-red.
+  - "JUnit probe (`bun test ... --reporter=junit`): 7 <failure> elements, 0
+    <error> elements; each declared expectRed id matched a failing case with the
+    runner's id normalization."
+  - bun run typecheck => exit 0 (test files compile against current production
+    types).
+  - TMPDIR=/tmp bun test (full suite) => 369 pass, 2 skip, 7 fail; only the
+    newly authored red tests fail, so no collateral breakage in existing tests.
+  - git status --short => only the three new test files are untracked; no
+    production/config files were modified.
+concerns:
+  - "CLI contract is test-defined: one `Concerns:` line listing
+    open/dismissed/routed/resolved counts (order-sensitive), then a Blocking
+    section before a Digest section; digest includes human-awareness and
+    empty/absent-blocks questions per adr-digest-mailbox."
+  - Corrupt-file warning is accepted on either console.warn or console.error,
+    but the message must name the corrupt file so operators can find it.
+  - Schema test requires all four count keys and integer types inside `concerns`
+    when present, while leaving the root `concerns` property optional to match
+    the schema's existing optional-field convention.
+notes: Tests build on the existing concern store and steer mailbox APIs; no new
+  production modules or stubs were needed. Derived-state tests use direct task
+  directories, and CLI tests exercise the documented default `.factory/tasks`
+  orchestration folder.
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..36b587a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,96 @@
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
+        durationMs: 8171
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 141453
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-Sspczc/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 337410
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 337410
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 337410
+
+           376 pass
+           2 skip
+           0 fail
+           1721 expect() calls
+          Ran 378 tests across 63 files. [141.22s]
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
+        test/engine/state-concern-counts.test.ts
+        test/contracts/state-concern-schema.test.ts
+        test/cli/status-concerns.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794140802820-vbpn5141rdd.xml
+      junitCaseCount: 7
+      junitCaseIds:
+        - factory status concern surfacing (§18).prints concern counts and
+          separates blocking from digest questions
+        - factory status concern surfacing (§18).prints zero counts when the
+          task has no concerns yet
+        - State schema concern counts.accepts concern status counts and rejects
+          incomplete ones
+        - StateArtifact concern counts (§18).counts stored concerns by status
+        - StateArtifact concern counts (§18).reports zero counts when the
+          concerns directory is missing
+        - StateArtifact concern counts (§18).skips corrupt concern files and
+          warns instead of failing derivation
+        - StateArtifact concern counts (§18).refreshStateYaml materializes the
+          counts into state.yaml
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 184/300 production lines changed"
+    details:
+      changedLines:
+        added: 160
+        deleted: 24
+        total: 184
+        files:
+          - plugins/software-factory/config/schemas/state.schema.json
+          - plugins/software-factory/src/cli/status.ts
+          - plugins/software-factory/src/core/artifacts.ts
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/derive/task.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..e3c3a9d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,67 @@
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
+  "slug": "status-state-surface-v2",
+  "kind": "dev",
+  "title": "State counts and status surfacing",
+  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
+  "outlineRef": "status-state-surface-v2",
+  "milestone": "m4-funnel-surface",
+  "wave": 9,
+  "deps": [
+    "concerns-store-v2",
+    "routing-human-debt-v2"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/state-concern-counts.test.ts",
+    "test/contracts/state-concern-schema.test.ts",
+    "test/cli/status-concerns.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::counts stored concerns by status",
+    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::reports zero counts when the concerns directory is missing",
+    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::skips corrupt concern files and warns instead of failing derivation",
+    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::refreshStateYaml materializes the counts into state.yaml",
+    "test/contracts/state-concern-schema.test.ts::State schema concern counts::accepts concern status counts and rejects incomplete ones",
+    "test/cli/status-concerns.test.ts::factory status concern surfacing (§18)::prints concern counts and separates blocking from digest questions",
+    "test/cli/status-concerns.test.ts::factory status concern surfacing (§18)::prints zero counts when the task has no concerns yet"
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
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..2b56365
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T12:20:34.913Z
+session: 01a1bb1a-743e-77ae-9e00-95a76897a3b5
+endedAt: 2026-11-08T12:26:43.774Z
+usage:
+  inputTokens: 46104
+  outputTokens: 15941
+  costUsd: 0.020468
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-518Z_01a1bb1a-743e-77ae-9e00-95a76897a3b5.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..bc04d99
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,52 @@
+status: ok
+summary: Added StateArtifact.concerns counts {open,dismissed,routed,resolved} to
+  the state contract, derived from the concern store via a new countConcerns
+  helper (missing dir -> zeros, corrupt files skipped with a filename-bearing
+  warning), materialized through toStateArtifact/refreshStateYaml, and surfaced
+  by `factory status` with a Concerns line plus separate Blocking and Digest
+  question sections (human-stop/blocking-disposition questions vs
+  awareness/non-blocking notes). Updated state.schema.json to require all four
+  non-negative integer counts with additionalProperties:false. All 7 target
+  tests pass; full suite and typecheck pass.
+target:
+  selectors:
+    - test/engine/state-concern-counts.test.ts
+    - test/contracts/state-concern-schema.test.ts
+    - test/cli/status-concerns.test.ts
+  expectRed:
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::counts stored concerns by status
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::reports zero counts when the concerns directory is missing
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::skips corrupt concern files and warns instead of failing derivation
+    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
+      (§18)::refreshStateYaml materializes the counts into state.yaml
+    - test/contracts/state-concern-schema.test.ts::State schema concern
+      counts::accepts concern status counts and rejects incomplete ones
+    - test/cli/status-concerns.test.ts::factory status concern surfacing
+      (§18)::prints concern counts and separates blocking from digest questions
+    - test/cli/status-concerns.test.ts::factory status concern surfacing
+      (§18)::prints zero counts when the task has no concerns yet
+evidence:
+  - bun test test/engine/state-concern-counts.test.ts
+    test/contracts/state-concern-schema.test.ts test/cli/status-concerns.test.ts
+    -> 7 pass, 0 fail, 22 expect() calls
+  - bun run typecheck (tsc --noEmit) -> exit 0
+  - bun test (full plugin suite) -> 376 pass, 2 skip, 0 fail across 63 files
+  - bun test test/cli/cli.test.ts test/engine/routing-human-debt.test.ts
+    test/engine/concerns-funnel.test.ts test/contracts/concern-schemas.test.ts
+    -> 48 pass, 0 fail
+  - git status --short confirms only five production files changed (state
+    schema, status CLI, artifacts, concerns store, task derive); no stray stubs
+concerns:
+  - countConcerns warns on every derivation/refresh for each corrupt concern
+    file; acceptable per skip+warn contract but noisy if a corrupt file lingers.
+  - StateArtifact.concerns and state.schema are now required, so any external
+    producer of state.yaml must include all four totals (no in-repo producer
+    besides deriveTaskState).
+notes: Counts are computed after item/status derivation inside deriveTaskState
+  so the read reflects concerns persisted earlier in the same tick;
+  toStateArtifact stays synchronous as the tests require. Blocking
+  classification treats human-stop, any non-empty `blocks` list, or a task-level
+  block as blocking; human-awareness and empty-blocks notes go to Digest.
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..c128f7b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,35 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 7 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/state-concern-counts.test.ts
+        test/contracts/state-concern-schema.test.ts
+        test/cli/status-concerns.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794141077590-c2unz0wdj1m.xml
+      junitCaseCount: 7
+      junitCaseIds:
+        - factory status concern surfacing (§18).prints concern counts and
+          separates blocking from digest questions
+        - factory status concern surfacing (§18).prints zero counts when the
+          task has no concerns yet
+        - State schema concern counts.accepts concern status counts and rejects
+          incomplete ones
+        - StateArtifact concern counts (§18).counts stored concerns by status
+        - StateArtifact concern counts (§18).reports zero counts when the
+          concerns directory is missing
+        - StateArtifact concern counts (§18).skips corrupt concern files and
+          warns instead of failing derivation
+        - StateArtifact concern counts (§18).refreshStateYaml materializes the
+          counts into state.yaml
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..68c938e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1221 @@
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
+  "slug": "status-state-surface-v2",
+  "kind": "dev",
+  "title": "State counts and status surfacing",
+  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
+  "outlineRef": "status-state-surface-v2",
+  "milestone": "m4-funnel-surface",
+  "wave": 9,
+  "deps": [
+    "concerns-store-v2",
+    "routing-human-debt-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..33cb211
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,38 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (3 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/cli/status-concerns.test.ts
++        - plugins/software-factory/test/contracts/state-concern-schema.test.ts
++        - plugins/software-factory/test/engine/state-concern-counts.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 7 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/state-concern-counts.test.ts
++        test/contracts/state-concern-schema.test.ts
++        test/cli/status-concerns.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140137748-4qiu0m8fyqk.xml
++      junitCaseCount: 7
++      junitCaseIds:
++        - factory status concern surfacing (§18).prints concern counts and
++          separates blocking from digest questions
++        - factory status concern surfacing (§18).prints zero counts when the
++          task has no concerns yet
++        - State schema concern counts.accepts concern status counts and rejects
++          incomplete ones
++        - StateArtifact concern counts (§18).counts stored concerns by status
++        - StateArtifact concern counts (§18).reports zero counts when the
++          concerns directory is missing
++        - StateArtifact concern counts (§18).skips corrupt concern files and
++          warns instead of failing derivation
++        - StateArtifact concern counts (§18).refreshStateYaml materializes the
++          counts into state.yaml
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..df037e1
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,53 @@
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
++  "slug": "status-state-surface-v2",
++  "kind": "dev",
++  "title": "State counts and status surfacing",
++  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
++  "outlineRef": "status-state-surface-v2",
++  "milestone": "m4-funnel-surface",
++  "wave": 9,
++  "deps": [
++    "concerns-store-v2",
++    "routing-human-debt-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..2e2d0e7
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T12:05:42.176Z
++session: 01a1bb0c-d594-73b0-92a4-639ebcd693af
++endedAt: 2026-11-08T12:15:38.627Z
++usage:
++  inputTokens: 114112
++  outputTokens: 43333
++  costUsd: 0.061264
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-932Z_01a1bb0c-d594-73b0-92a4-639ebcd693af.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..87790f6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,56 @@
++status: ok
++summary: "Authored three test files (7 tests) specifying StateArtifact.concerns
++  {open,dismissed,routed,resolved}: state.schema validation,
++  toStateArtifact/refreshStateYaml counts with missing-directory zeros and
++  corrupt-file skip+warn, and `factory status` rendering Concerns counts plus
++  separate Blocking vs Digest sections. All tests fail on current production
++  code with assertion failures only; typecheck passes; no production files
++  modified."
++target:
++  selectors:
++    - test/engine/state-concern-counts.test.ts
++    - test/contracts/state-concern-schema.test.ts
++    - test/cli/status-concerns.test.ts
++  expectRed:
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::counts stored concerns by status
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::reports zero counts when the concerns directory is missing
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::skips corrupt concern files and warns instead of failing derivation
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::refreshStateYaml materializes the counts into state.yaml
++    - test/contracts/state-concern-schema.test.ts::State schema concern
++      counts::accepts concern status counts and rejects incomplete ones
++    - test/cli/status-concerns.test.ts::factory status concern surfacing
++      (§18)::prints concern counts and separates blocking from digest questions
++    - test/cli/status-concerns.test.ts::factory status concern surfacing
++      (§18)::prints zero counts when the task has no concerns yet
++evidence:
++  - TMPDIR=/tmp bun test test/engine/state-concern-counts.test.ts
++    test/contracts/state-concern-schema.test.ts test/cli/status-concerns.test.ts
++    => 0 pass, 7 fail; every failure is an assertion mismatch (concerns
++    undefined, schema rejected counts, CLI text missing), proving target-red.
++  - "JUnit probe (`bun test ... --reporter=junit`): 7 <failure> elements, 0
++    <error> elements; each declared expectRed id matched a failing case with the
++    runner's id normalization."
++  - bun run typecheck => exit 0 (test files compile against current production
++    types).
++  - TMPDIR=/tmp bun test (full suite) => 369 pass, 2 skip, 7 fail; only the
++    newly authored red tests fail, so no collateral breakage in existing tests.
++  - git status --short => only the three new test files are untracked; no
++    production/config files were modified.
++concerns:
++  - "CLI contract is test-defined: one `Concerns:` line listing
++    open/dismissed/routed/resolved counts (order-sensitive), then a Blocking
++    section before a Digest section; digest includes human-awareness and
++    empty/absent-blocks questions per adr-digest-mailbox."
++  - Corrupt-file warning is accepted on either console.warn or console.error,
++    but the message must name the corrupt file so operators can find it.
++  - Schema test requires all four count keys and integer types inside `concerns`
++    when present, while leaving the root `concerns` property optional to match
++    the schema's existing optional-field convention.
++notes: Tests build on the existing concern store and steer mailbox APIs; no new
++  production modules or stubs were needed. Derived-state tests use direct task
++  directories, and CLI tests exercise the documented default `.factory/tasks`
++  orchestration folder.
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..36b587a
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,96 @@
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
++        durationMs: 8171
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 141453
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-Sspczc/.factory/pipeline.yaml
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
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 337410
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 337410
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 337410
++
++           376 pass
++           2 skip
++           0 fail
++           1721 expect() calls
++          Ran 378 tests across 63 files. [141.22s]
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
++        test/engine/state-concern-counts.test.ts
++        test/contracts/state-concern-schema.test.ts
++        test/cli/status-concerns.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794140802820-vbpn5141rdd.xml
++      junitCaseCount: 7
++      junitCaseIds:
++        - factory status concern surfacing (§18).prints concern counts and
++          separates blocking from digest questions
++        - factory status concern surfacing (§18).prints zero counts when the
++          task has no concerns yet
++        - State schema concern counts.accepts concern status counts and rejects
++          incomplete ones
++        - StateArtifact concern counts (§18).counts stored concerns by status
++        - StateArtifact concern counts (§18).reports zero counts when the
++          concerns directory is missing
++        - StateArtifact concern counts (§18).skips corrupt concern files and
++          warns instead of failing derivation
++        - StateArtifact concern counts (§18).refreshStateYaml materializes the
++          counts into state.yaml
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 184/300 production lines changed"
++    details:
++      changedLines:
++        added: 160
++        deleted: 24
++        total: 184
++        files:
++          - plugins/software-factory/config/schemas/state.schema.json
++          - plugins/software-factory/src/cli/status.ts
++          - plugins/software-factory/src/core/artifacts.ts
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/derive/task.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..e3c3a9d
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,67 @@
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
++  "slug": "status-state-surface-v2",
++  "kind": "dev",
++  "title": "State counts and status surfacing",
++  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
++  "outlineRef": "status-state-surface-v2",
++  "milestone": "m4-funnel-surface",
++  "wave": 9,
++  "deps": [
++    "concerns-store-v2",
++    "routing-human-debt-v2"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/state-concern-counts.test.ts",
++    "test/contracts/state-concern-schema.test.ts",
++    "test/cli/status-concerns.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::counts stored concerns by status",
++    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::reports zero counts when the concerns directory is missing",
++    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::skips corrupt concern files and warns instead of failing derivation",
++    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::refreshStateYaml materializes the counts into state.yaml",
++    "test/contracts/state-concern-schema.test.ts::State schema concern counts::accepts concern status counts and rejects incomplete ones",
++    "test/cli/status-concerns.test.ts::factory status concern surfacing (§18)::prints concern counts and separates blocking from digest questions",
++    "test/cli/status-concerns.test.ts::factory status concern surfacing (§18)::prints zero counts when the task has no concerns yet"
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
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..2b56365
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T12:20:34.913Z
++session: 01a1bb1a-743e-77ae-9e00-95a76897a3b5
++endedAt: 2026-11-08T12:26:43.774Z
++usage:
++  inputTokens: 46104
++  outputTokens: 15941
++  costUsd: 0.020468
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-518Z_01a1bb1a-743e-77ae-9e00-95a76897a3b5.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..bc04d99
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,52 @@
++status: ok
++summary: Added StateArtifact.concerns counts {open,dismissed,routed,resolved} to
++  the state contract, derived from the concern store via a new countConcerns
++  helper (missing dir -> zeros, corrupt files skipped with a filename-bearing
++  warning), materialized through toStateArtifact/refreshStateYaml, and surfaced
++  by `factory status` with a Concerns line plus separate Blocking and Digest
++  question sections (human-stop/blocking-disposition questions vs
++  awareness/non-blocking notes). Updated state.schema.json to require all four
++  non-negative integer counts with additionalProperties:false. All 7 target
++  tests pass; full suite and typecheck pass.
++target:
++  selectors:
++    - test/engine/state-concern-counts.test.ts
++    - test/contracts/state-concern-schema.test.ts
++    - test/cli/status-concerns.test.ts
++  expectRed:
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::counts stored concerns by status
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::reports zero counts when the concerns directory is missing
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::skips corrupt concern files and warns instead of failing derivation
++    - test/engine/state-concern-counts.test.ts::StateArtifact concern counts
++      (§18)::refreshStateYaml materializes the counts into state.yaml
++    - test/contracts/state-concern-schema.test.ts::State schema concern
++      counts::accepts concern status counts and rejects incomplete ones
++    - test/cli/status-concerns.test.ts::factory status concern surfacing
++      (§18)::prints concern counts and separates blocking from digest questions
++    - test/cli/status-concerns.test.ts::factory status concern surfacing
++      (§18)::prints zero counts when the task has no concerns yet
++evidence:
++  - bun test test/engine/state-concern-counts.test.ts
++    test/contracts/state-concern-schema.test.ts test/cli/status-concerns.test.ts
++    -> 7 pass, 0 fail, 22 expect() calls
++  - bun run typecheck (tsc --noEmit) -> exit 0
++  - bun test (full plugin suite) -> 376 pass, 2 skip, 0 fail across 63 files
++  - bun test test/cli/cli.test.ts test/engine/routing-human-debt.test.ts
++    test/engine/concerns-funnel.test.ts test/contracts/concern-schemas.test.ts
++    -> 48 pass, 0 fail
++  - git status --short confirms only five production files changed (state
++    schema, status CLI, artifacts, concerns store, task derive); no stray stubs
++concerns:
++  - countConcerns warns on every derivation/refresh for each corrupt concern
++    file; acceptable per skip+warn contract but noisy if a corrupt file lingers.
++  - StateArtifact.concerns and state.schema are now required, so any external
++    producer of state.yaml must include all four totals (no in-repo producer
++    besides deriveTaskState).
++notes: Counts are computed after item/status derivation inside deriveTaskState
++  so the read reflects concerns persisted earlier in the same tick;
++  toStateArtifact stays synchronous as the tests require. Blocking
++  classification treats human-stop, any non-empty `blocks` list, or a task-level
++  block as blocking; human-awareness and empty-blocks notes go to Digest.
+diff --git a/plugins/software-factory/config/schemas/state.schema.json b/plugins/software-factory/config/schemas/state.schema.json
+index 5862b1c..9e6030a 100644
+--- a/plugins/software-factory/config/schemas/state.schema.json
++++ b/plugins/software-factory/config/schemas/state.schema.json
+@@ -3,39 +3,113 @@
+   "$id": "https://software-factory/schemas/state.schema.json",
+   "title": "StateArtifact",
+   "type": "object",
+-  "required": ["task", "status", "iteration", "items", "lastUpdated"],
++  "required": [
++    "task",
++    "status",
++    "iteration",
++    "items",
++    "concerns",
++    "lastUpdated"
++  ],
+   "properties": {
+-    "task": { "type": "string" },
+-    "kind": { "type": "string" },
++    "task": {
++      "type": "string"
++    },
++    "kind": {
++      "type": "string"
++    },
+     "status": {
+       "type": "string",
+-      "enum": ["active", "blocked", "done", "failed"]
++      "enum": [
++        "active",
++        "blocked",
++        "done",
++        "failed"
++      ]
++    },
++    "iteration": {
++      "type": "integer",
++      "minimum": 1
++    },
++    "currentWave": {
++      "type": "integer",
++      "minimum": 1
+     },
+-    "iteration": { "type": "integer", "minimum": 1 },
+-    "currentWave": { "type": "integer", "minimum": 1 },
+     "items": {
+       "type": "object",
+       "additionalProperties": {
+         "type": "object",
+-        "required": ["kind", "status"],
++        "required": [
++          "kind",
++          "status"
++        ],
+         "properties": {
+-          "kind": { "type": "string" },
+-          "status": { "type": "string" },
+-          "branch": { "type": "string" },
+-          "attempts": { "type": "integer" },
+-          "fixRounds": { "type": "integer" },
+-          "assignedAt": { "type": "string" },
+-          "mergedAt": { "type": "string" }
++          "kind": {
++            "type": "string"
++          },
++          "status": {
++            "type": "string"
++          },
++          "branch": {
++            "type": "string"
++          },
++          "attempts": {
++            "type": "integer"
++          },
++          "fixRounds": {
++            "type": "integer"
++          },
++          "assignedAt": {
++            "type": "string"
++          },
++          "mergedAt": {
++            "type": "string"
++          }
+         },
+         "additionalProperties": false
+       }
+     },
++    "concerns": {
++      "type": "object",
++      "required": [
++        "open",
++        "dismissed",
++        "routed",
++        "resolved"
++      ],
++      "properties": {
++        "open": {
++          "type": "integer",
++          "minimum": 0
++        },
++        "dismissed": {
++          "type": "integer",
++          "minimum": 0
++        },
++        "routed": {
++          "type": "integer",
++          "minimum": 0
++        },
++        "resolved": {
++          "type": "integer",
++          "minimum": 0
++        }
++      },
++      "additionalProperties": false
++    },
+     "debt": {
+       "type": "array",
+-      "items": { "type": "string" }
++      "items": {
++        "type": "string"
++      }
++    },
++    "budgetSpentUsd": {
++      "type": "number",
++      "minimum": 0
+     },
+-    "budgetSpentUsd": { "type": "number", "minimum": 0 },
+-    "lastUpdated": { "type": "string" }
++    "lastUpdated": {
++      "type": "string"
++    }
+   },
+   "additionalProperties": false
+ }
+diff --git a/plugins/software-factory/src/cli/status.ts b/plugins/software-factory/src/cli/status.ts
+index 9611b7a..086cc95 100644
+--- a/plugins/software-factory/src/cli/status.ts
++++ b/plugins/software-factory/src/cli/status.ts
+@@ -3,6 +3,7 @@ import path from "node:path";
+ import { loadProjectConfig } from "../core/config/loader.js";
+ import { taskBranch, worktreePath } from "../core/git/naming.js";
+ import { deriveTaskState } from "../core/derive/task.js";
++import { questionBlocks } from "../core/steer.js";
+ 
+ export interface StatusOptions {
+   repoRoot: string;
+@@ -80,10 +81,16 @@ export async function runStatus(opts: StatusOptions): Promise<number> {
+     console.log(`Items: None scheduled yet`);
+   }
+ 
+-  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
+-    console.log(`----------------------------------------------------------------`);
+-    console.log(`Open Operator Questions (tousertoreview):`);
+-    for (const q of derived.openSteerQuestions) {
++  const isBlocking = (q: (typeof derived.openSteerQuestions)[number]) =>
++    q.disposition === "human-stop" ||
++    (q.blocks?.length ?? 0) > 0 ||
++    questionBlocks(q, "task");
++  const printQuestions = (questions: typeof derived.openSteerQuestions): void => {
++    if (questions.length === 0) {
++      console.log(`  (none)`);
++      return;
++    }
++    for (const q of questions) {
+       console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
+       console.log(`    Question: ${q.question}`);
+       if (q.draftDecision) {
+@@ -94,7 +101,19 @@ export async function runStatus(opts: StatusOptions): Promise<number> {
+       }
+       console.log(`    To answer: factory steer ${task} "answer to ${q.id}: <your answer>"`);
+     }
+-  }
++  };
++
++  console.log(
++    `Concerns: open ${derived.concerns.open} | dismissed ${derived.concerns.dismissed} | routed ${derived.concerns.routed} | resolved ${derived.concerns.resolved}`
++  );
++
++  console.log(`----------------------------------------------------------------`);
++  console.log(`Blocking Questions:`);
++  printQuestions(derived.openSteerQuestions.filter(isBlocking));
++
++  console.log(`----------------------------------------------------------------`);
++  console.log(`Digest Questions:`);
++  printQuestions(derived.openSteerQuestions.filter((q) => !isBlocking(q)));
+ 
+   if (derived.debt && derived.debt.length > 0) {
+     console.log(`----------------------------------------------------------------`);
+diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
+index cf53d5c..5942405 100644
+--- a/plugins/software-factory/src/core/artifacts.ts
++++ b/plugins/software-factory/src/core/artifacts.ts
+@@ -518,6 +518,14 @@ export interface StateItemInfo {
+   mergedAt?: string;
+ }
+ 
++/** Concern-store totals surfaced on state.yaml (§18). */
++export interface ConcernCounts {
++  open: number;
++  dismissed: number;
++  routed: number;
++  resolved: number;
++}
++
+ export interface StateArtifact {
+   task: string;
+   kind?: string;
+@@ -525,6 +533,7 @@ export interface StateArtifact {
+   iteration: number;
+   currentWave?: number;
+   items: Record<string, StateItemInfo>;
++  concerns: ConcernCounts;
+   debt?: string[];
+   budgetSpentUsd?: number;
+   lastUpdated: string;
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index 54b4d88..5e2078d 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -2,7 +2,7 @@ import fs from "node:fs";
+ import path from "node:path";
+ import { createHash } from "node:crypto";
+ import yaml from "yaml";
+-import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++import type { Concern, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+ import type { Repo } from "./git/repo.js";
+ import { commitAll } from "./git/commit.js";
+ import { git } from "./git/exec.js";
+@@ -127,6 +127,34 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
+   return (await listConcerns(taskDir)).filter((r) => r.status === "open");
+ }
+ 
++/**
++ * Counts stored concerns per status for the hollow state view (§18).
++ * A missing directory is zeroes; corrupt entries are skipped with a warning
++ * because the materialized view must never fail derivation.
++ */
++export async function countConcerns(taskDir: string): Promise<ConcernCounts> {
++  const counts: ConcernCounts = { open: 0, dismissed: 0, routed: 0, resolved: 0 };
++  const dir = dirOf(taskDir);
++  let names: string[];
++  try {
++    names = await fs.promises.readdir(dir);
++  } catch (err: any) {
++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return counts;
++    throw err;
++  }
++  for (const name of names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml"))) {
++    try {
++      const concern = await readYaml<StoredConcernArtifact>(path.join(dir, name));
++      if (typeof concern?.kind === "string" && Object.hasOwn(counts, concern.status)) {
++        counts[concern.status as keyof ConcernCounts]++;
++      }
++    } catch (err: any) {
++      console.warn(`[factory] Skipping corrupt concern file ${name}: ${err?.message ?? err}`);
++    }
++  }
++  return counts;
++}
++
+ /** Returns every stored concern/remarkable id for exact-id triage partitioning. */
+ export async function listConcernIds(taskDir: string): Promise<string[]> {
+   const dir = dirOf(taskDir);
+diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
+index 6f4ae05..f7ea7ec 100644
+--- a/plugins/software-factory/src/core/derive/task.ts
++++ b/plugins/software-factory/src/core/derive/task.ts
+@@ -1,6 +1,7 @@
+ import fs from "node:fs";
+ import path from "node:path";
+ import type {
++  ConcernCounts,
+   DecisionArtifact,
+   PlanArtifact,
+   PlanCloseupArtifact,
+@@ -16,7 +17,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
+ import { deriveItemState, withRoutedBlocking, type DerivedItemState } from "./item.js";
+ import { deriveWaveState, type DerivedWaveState } from "./wave.js";
+ import { BudgetTracker } from "../budget.js";
+-import { listConcerns } from "../concerns.js";
++import { countConcerns, listConcerns } from "../concerns.js";
+ import { isDebtConcern } from "../triage.js";
+ import { questionBlocks } from "../steer.js";
+ import { blockedByConcern } from "../plan/scheduler.js";
+@@ -35,6 +36,7 @@ export interface DerivedTaskState {
+   waves: DerivedWaveState[];
+   debt: string[];
+   budgetSpentUsd: number;
++  concerns: ConcernCounts;
+   hasOpenSteerQuestions: boolean;
+   openSteerQuestions: SteerItemArtifact[];
+   lastCloseup?: PlanCloseupArtifact;
+@@ -355,6 +357,8 @@ export async function deriveTaskState(opts: {
+     status = "active";
+   }
+ 
++  const concerns = await countConcerns(taskDir);
++
+   const toStateArtifact = (): StateArtifact => {
+     const itemsRecord: Record<string, StateItemInfo> = {};
+     for (const it of items) {
+@@ -374,6 +378,7 @@ export async function deriveTaskState(opts: {
+       iteration,
+       currentWave,
+       items: itemsRecord,
++      concerns,
+       debt: Array.from(debtSet),
+       budgetSpentUsd,
+       lastUpdated: new Date().toISOString(),
+@@ -392,6 +397,7 @@ export async function deriveTaskState(opts: {
+     waves,
+     debt: Array.from(debtSet),
+     budgetSpentUsd,
++    concerns,
+     hasOpenSteerQuestions: openSteerQuestions.length > 0,
+     openSteerQuestions,
+     lastCloseup,
+diff --git a/plugins/software-factory/test/cli/status-concerns.test.ts b/plugins/software-factory/test/cli/status-concerns.test.ts
+new file mode 100644
+index 0000000..7ebaf2c
+--- /dev/null
++++ b/plugins/software-factory/test/cli/status-concerns.test.ts
+@@ -0,0 +1,143 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { runInit } from "../../src/cli/init.js";
++import { runStatus } from "../../src/cli/status.js";
++import { writeQuestion } from "../../src/core/steer.js";
++import { writeYamlAtomic } from "../../src/core/records/io.js";
++
++/**
++ * `factory status` §18 surfacing: concern counts plus a split between blocking
++ * operator questions (need a decision) and digest-only remarkable items
++ * (recorded for awareness, never waiting).
++ */
++const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");
++const ORCH = ".factory/tasks";
++
++async function captureOutput(
++  fn: () => Promise<number>
++): Promise<{ code: number; output: string }> {
++  const lines: string[] = [];
++  const originalLog = console.log;
++  const originalError = console.error;
++  console.log = (...args: unknown[]) => {
++    lines.push(args.map(String).join(" "));
++  };
++  console.error = (...args: unknown[]) => {
++    lines.push(args.map(String).join(" "));
++  };
++  try {
++    const code = await fn();
++    return { code, output: lines.join("\n") };
++  } finally {
++    console.log = originalLog;
++    console.error = originalError;
++  }
++}
++
++describe("factory status concern surfacing (§18)", () => {
++  let tmpRepo: TmpRepo;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  async function initTask(task: string): Promise<string> {
++    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
++    const taskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
++    return taskDir;
++  }
++
++  function writeConcern(taskDir: string, id: string, status: string): void {
++    const concernDir = path.join(taskDir, "concerns");
++    fs.mkdirSync(concernDir, { recursive: true });
++    writeYamlAtomic(path.join(concernDir, `${id}.yaml`), {
++      id,
++      kind: "risk",
++      summary: `Concern ${id}`,
++      detail: "concern detail",
++      severity: "medium",
++      status,
++      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++    });
++  }
++
++  it("prints concern counts and separates blocking from digest questions", async () => {
++    const task = "status-concerns";
++    const taskDir = await initTask(task);
++
++    writeConcern(taskDir, "c-open-1", "open");
++    writeConcern(taskDir, "c-open-2", "open");
++    writeConcern(taskDir, "c-dismissed", "dismissed");
++    writeConcern(taskDir, "c-routed", "routed");
++    writeConcern(taskDir, "c-resolved", "resolved");
++
++    await writeQuestion(tmpRepo.dir, taskDir, {
++      id: "q-stop",
++      ref: "item-1",
++      disposition: "human-stop",
++      question: "Stop before writing anything else",
++      blocks: ["item-1", "task"],
++    });
++    await writeQuestion(tmpRepo.dir, taskDir, {
++      id: "q-awareness",
++      ref: "item-1",
++      disposition: "human-awareness",
++      question: "Notable tradeoff recorded for the operator",
++      blocks: [],
++    });
++    await writeQuestion(tmpRepo.dir, taskDir, {
++      id: "q-empty-blocks",
++      ref: "item-1",
++      disposition: "human-async",
++      question: "Optional note with no blocking impact",
++      blocks: [],
++    });
++
++    const { code, output } = await captureOutput(() =>
++      runStatus({ repoRoot: tmpRepo.dir, task })
++    );
++
++    expect(code).toBe(0);
++    expect(output).toMatch(
++      /Concerns?[^\n]*open[^\n]*2[^\n]*dismissed[^\n]*1[^\n]*routed[^\n]*1[^\n]*resolved[^\n]*1/i
++    );
++
++    const blockingAt = output.search(/\bBlocking\b/i);
++    const digestAt = output.search(/\bDigest\b/i);
++    expect(blockingAt).toBeGreaterThanOrEqual(0);
++    expect(digestAt).toBeGreaterThan(blockingAt);
++
++    const blockingSection = output.slice(blockingAt, digestAt);
++    const digestSection = output.slice(digestAt);
++    expect(blockingSection).toContain("q-stop");
++    expect(blockingSection).not.toContain("q-awareness");
++    expect(blockingSection).not.toContain("q-empty-blocks");
++    expect(digestSection).toContain("q-awareness");
++    expect(digestSection).toContain("q-empty-blocks");
++    expect(digestSection).not.toContain("q-stop");
++  });
++
++  it("prints zero counts when the task has no concerns yet", async () => {
++    const task = "status-no-concerns";
++    await initTask(task);
++
++    const { code, output } = await captureOutput(() =>
++      runStatus({ repoRoot: tmpRepo.dir, task })
++    );
++
++    expect(code).toBe(0);
++    expect(output).toMatch(
++      /Concerns?[^\n]*open[^\n]*0[^\n]*dismissed[^\n]*0[^\n]*routed[^\n]*0[^\n]*resolved[^\n]*0/i
++    );
++  });
++});
+diff --git a/plugins/software-factory/test/contracts/state-concern-schema.test.ts b/plugins/software-factory/test/contracts/state-concern-schema.test.ts
+new file mode 100644
+index 0000000..451fdd4
+--- /dev/null
++++ b/plugins/software-factory/test/contracts/state-concern-schema.test.ts
+@@ -0,0 +1,36 @@
++import { describe, expect, it } from "bun:test";
++import path from "node:path";
++import { CompiledSchemaCache } from "../../src/core/records/schema-cache.js";
++
++/**
++ * `state.schema.json` is the canonical contract for the materialized
++ * `state.yaml` view. It must carry the §18 concern counts and require all four
++ * status totals so consumers never read a partially populated view.
++ */
++const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");
++
++describe("State schema concern counts", () => {
++  it("accepts concern status counts and rejects incomplete ones", () => {
++    const validate = new CompiledSchemaCache(
++      path.join(PLUGIN_ROOT, "config/schemas")
++    ).getValidator("state");
++
++    const base = {
++      task: "counts-task",
++      status: "active",
++      iteration: 1,
++      items: {},
++      lastUpdated: "2026-01-01T00:00:00.000Z",
++    };
++    const counts = { open: 2, dismissed: 1, routed: 3, resolved: 4 };
++
++    expect(validate({ ...base, concerns: counts })).toBe(true);
++    expect(validate({ ...base, concerns: { open: 2 } })).toBe(false);
++    expect(
++      validate({ ...base, concerns: { ...counts, pending: 0 } })
++    ).toBe(false);
++    expect(
++      validate({ ...base, concerns: { ...counts, open: "2" } })
++    ).toBe(false);
++  });
++});
+diff --git a/plugins/software-factory/test/engine/state-concern-counts.test.ts b/plugins/software-factory/test/engine/state-concern-counts.test.ts
+new file mode 100644
+index 0000000..8ebd2d3
+--- /dev/null
++++ b/plugins/software-factory/test/engine/state-concern-counts.test.ts
+@@ -0,0 +1,189 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { deriveTaskState, refreshStateYaml } from "../../src/core/derive/task.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import type { PipelineConfig, StateArtifact } from "../../src/core/artifacts.js";
++
++/**
++ * `StateArtifact.concerns` surfaces concern-store counts (docs/factory.v2.md
++ * §18: "status/state.yaml shows counts"). Counts cover the four store statuses;
++ * a missing `concerns/` directory reports zeros, and corrupt entries are
++ * skipped with a warning instead of breaking state derivation.
++ */
++const ORCH = ".factory";
++
++interface ConcernCounts {
++  open: number;
++  dismissed: number;
++  routed: number;
++  resolved: number;
++}
++
++type StateWithCounts = StateArtifact & { concerns: ConcernCounts };
++
++const ZERO_COUNTS: ConcernCounts = {
++  open: 0,
++  dismissed: 0,
++  routed: 0,
++  resolved: 0,
++};
++
++describe("StateArtifact concern counts (§18)", () => {
++  let tmpRepo: TmpRepo;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function taskDirFor(task: string): string {
++    const taskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
++    tmpRepo.commit(`add ${task} intent`);
++    return taskDir;
++  }
++
++  function writeConcern(
++    taskDir: string,
++    id: string,
++    status: keyof ConcernCounts
++  ): void {
++    const concernDir = path.join(taskDir, "concerns");
++    fs.mkdirSync(concernDir, { recursive: true });
++    writeYamlAtomic(path.join(concernDir, `${id}.yaml`), {
++      id,
++      kind: status === "routed" ? "blocker" : "risk",
++      summary: `Concern ${id}`,
++      detail: "concern detail",
++      severity: "medium",
++      status,
++      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
++      affects: ["item-1"],
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++    });
++  }
++
++  function minimalPipeline(): PipelineConfig {
++    return {
++      models: { roles: {} },
++      agents: {},
++      flows: { simple: { steps: [] }, story: {}, spike: {} },
++      limits: {},
++    };
++  }
++
++  async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
++    const warnings: string[] = [];
++    const originalWarn = console.warn;
++    const originalError = console.error;
++    const capture = (...args: unknown[]) => {
++      warnings.push(args.map(String).join(" "));
++    };
++    console.warn = capture;
++    console.error = capture;
++    try {
++      await fn();
++    } finally {
++      console.warn = originalWarn;
++      console.error = originalError;
++    }
++    return warnings;
++  }
++
++  it("counts stored concerns by status", async () => {
++    const task = "concern-counts";
++    const taskDir = taskDirFor(task);
++
++    writeConcern(taskDir, "c-open-1", "open");
++    writeConcern(taskDir, "c-open-2", "open");
++    writeConcern(taskDir, "c-dismissed", "dismissed");
++    writeConcern(taskDir, "c-routed", "routed");
++    writeConcern(taskDir, "c-resolved", "resolved");
++
++    const state = await deriveTaskState({
++      taskDir,
++      task,
++      parentBranch: `topic/${task}`,
++    });
++
++    expect((state.toStateArtifact() as StateWithCounts).concerns).toEqual({
++      open: 2,
++      dismissed: 1,
++      routed: 1,
++      resolved: 1,
++    });
++  });
++
++  it("reports zero counts when the concerns directory is missing", async () => {
++    const task = "concern-counts-missing";
++    const taskDir = taskDirFor(task);
++
++    const state = await deriveTaskState({
++      taskDir,
++      task,
++      parentBranch: `topic/${task}`,
++    });
++
++    expect((state.toStateArtifact() as StateWithCounts).concerns).toEqual(ZERO_COUNTS);
++  });
++
++  it("skips corrupt concern files and warns instead of failing derivation", async () => {
++    const task = "concern-counts-corrupt";
++    const taskDir = taskDirFor(task);
++    writeConcern(taskDir, "c-open", "open");
++
++    const corruptPath = path.join(taskDir, "concerns", "c-broken.yaml");
++    fs.writeFileSync(corruptPath, "open: [unterminated\n", "utf8");
++
++    let artifact: StateWithCounts | undefined;
++    const warnings = await captureWarnings(async () => {
++      const state = await deriveTaskState({
++        taskDir,
++        task,
++        parentBranch: `topic/${task}`,
++      });
++      artifact = state.toStateArtifact() as StateWithCounts;
++    });
++
++    expect(artifact?.concerns).toEqual({ ...ZERO_COUNTS, open: 1 });
++    expect(warnings.some((warning) => warning.includes("c-broken.yaml"))).toBe(true);
++  });
++
++  it("refreshStateYaml materializes the counts into state.yaml", async () => {
++    const task = "concern-counts-refresh";
++    const taskDir = taskDirFor(task);
++    writeConcern(taskDir, "c-open", "open");
++    writeConcern(taskDir, "c-dismissed", "dismissed");
++    fs.writeFileSync(
++      path.join(taskDir, "concerns", "c-broken.yaml"),
++      "open: [unterminated\n",
++      "utf8"
++    );
++
++    const warnings = await captureWarnings(async () => {
++      await refreshStateYaml({
++        taskDir,
++        task,
++        parentBranch: `topic/${task}`,
++        taskWt: tmpRepo.dir,
++        pipeline: minimalPipeline(),
++      });
++    });
++
++    const state = await readYaml<StateWithCounts>(path.join(taskDir, "state.yaml"));
++    expect(state.concerns).toEqual({
++      open: 1,
++      dismissed: 1,
++      routed: 0,
++      resolved: 0,
++    });
++    expect(warnings.some((warning) => warning.includes("c-broken.yaml"))).toBe(true);
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
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..67caed7
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T12:31:17.490Z
+session: 01a1bb24-48e9-7766-9d6a-bcf6dc36d3cd
+endedAt: 2026-11-08T12:43:52.950Z
+usage:
+  inputTokens: 45539
+  outputTokens: 36982
+  costUsd: 0.013246
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-31-19-785Z_01a1bb24-48e9-7766-9d6a-bcf6dc36d3cd.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..e7cdd1d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/status-state-surface-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,37 @@
+status: approved
+summary: "Approved: 7/7 target green, 376 pass full suite, typecheck pass, no
+  weakening, red-green credible"
+suggestions:
+  - detail: countConcerns warns only on read/parse throws; valid YAML with unknown
+      status or missing kind is silently ignored (mirrors listConcerns filter).
+      Consider warn naming file for semantic-invalid entries so operators can
+      find bad status values; currently only syntax-corrupt warns.
+    disposition: optional
+    id: count-unknown-status-silent
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 148
+    summary: Warn on unknown status/missing kind, not just parse errors
+  - detail: status isBlocking is disposition==human-stop || blocks.length>0 ||
+      questionBlocks(task). questionBlocks explicitly returns false for
+      human-awareness, but isBlocking would mark awareness-with-blocks as
+      Blocking via blocks.length. No current writer creates that shape
+      (awareness persists without blocks), so theoretical; explicit awareness
+      exclusion would align CLI with steer contract.
+    disposition: optional
+    id: status-awareness-exclusion
+    location:
+      file: plugins/software-factory/src/cli/status.ts
+      line: 84
+    summary: Explicitly exclude human-awareness from Blocking classify
+  - detail: Schema test pins inner required/all-four/integer-via-open-string and
+      additionalProperties, but does not assert root concerns required
+      (implementation added it) nor minimum:0/float rejection for all keys.
+      Adding validate(base)==false and negative/float cases would lock the
+      required-view contract.
+    disposition: optional
+    id: schema-outer-required-pinning
+    location:
+      file: plugins/software-factory/test/contracts/state-concern-schema.test.ts
+      line: 27
+    summary: Pin root concerns required and numeric bounds
diff --git a/plugins/software-factory/config/schemas/state.schema.json b/plugins/software-factory/config/schemas/state.schema.json
index 5862b1c..9e6030a 100644
--- a/plugins/software-factory/config/schemas/state.schema.json
+++ b/plugins/software-factory/config/schemas/state.schema.json
@@ -3,39 +3,113 @@
   "$id": "https://software-factory/schemas/state.schema.json",
   "title": "StateArtifact",
   "type": "object",
-  "required": ["task", "status", "iteration", "items", "lastUpdated"],
+  "required": [
+    "task",
+    "status",
+    "iteration",
+    "items",
+    "concerns",
+    "lastUpdated"
+  ],
   "properties": {
-    "task": { "type": "string" },
-    "kind": { "type": "string" },
+    "task": {
+      "type": "string"
+    },
+    "kind": {
+      "type": "string"
+    },
     "status": {
       "type": "string",
-      "enum": ["active", "blocked", "done", "failed"]
+      "enum": [
+        "active",
+        "blocked",
+        "done",
+        "failed"
+      ]
+    },
+    "iteration": {
+      "type": "integer",
+      "minimum": 1
+    },
+    "currentWave": {
+      "type": "integer",
+      "minimum": 1
     },
-    "iteration": { "type": "integer", "minimum": 1 },
-    "currentWave": { "type": "integer", "minimum": 1 },
     "items": {
       "type": "object",
       "additionalProperties": {
         "type": "object",
-        "required": ["kind", "status"],
+        "required": [
+          "kind",
+          "status"
+        ],
         "properties": {
-          "kind": { "type": "string" },
-          "status": { "type": "string" },
-          "branch": { "type": "string" },
-          "attempts": { "type": "integer" },
-          "fixRounds": { "type": "integer" },
-          "assignedAt": { "type": "string" },
-          "mergedAt": { "type": "string" }
+          "kind": {
+            "type": "string"
+          },
+          "status": {
+            "type": "string"
+          },
+          "branch": {
+            "type": "string"
+          },
+          "attempts": {
+            "type": "integer"
+          },
+          "fixRounds": {
+            "type": "integer"
+          },
+          "assignedAt": {
+            "type": "string"
+          },
+          "mergedAt": {
+            "type": "string"
+          }
         },
         "additionalProperties": false
       }
     },
+    "concerns": {
+      "type": "object",
+      "required": [
+        "open",
+        "dismissed",
+        "routed",
+        "resolved"
+      ],
+      "properties": {
+        "open": {
+          "type": "integer",
+          "minimum": 0
+        },
+        "dismissed": {
+          "type": "integer",
+          "minimum": 0
+        },
+        "routed": {
+          "type": "integer",
+          "minimum": 0
+        },
+        "resolved": {
+          "type": "integer",
+          "minimum": 0
+        }
+      },
+      "additionalProperties": false
+    },
     "debt": {
       "type": "array",
-      "items": { "type": "string" }
+      "items": {
+        "type": "string"
+      }
+    },
+    "budgetSpentUsd": {
+      "type": "number",
+      "minimum": 0
     },
-    "budgetSpentUsd": { "type": "number", "minimum": 0 },
-    "lastUpdated": { "type": "string" }
+    "lastUpdated": {
+      "type": "string"
+    }
   },
   "additionalProperties": false
 }
diff --git a/plugins/software-factory/src/cli/status.ts b/plugins/software-factory/src/cli/status.ts
index 9611b7a..086cc95 100644
--- a/plugins/software-factory/src/cli/status.ts
+++ b/plugins/software-factory/src/cli/status.ts
@@ -3,6 +3,7 @@ import path from "node:path";
 import { loadProjectConfig } from "../core/config/loader.js";
 import { taskBranch, worktreePath } from "../core/git/naming.js";
 import { deriveTaskState } from "../core/derive/task.js";
+import { questionBlocks } from "../core/steer.js";
 
 export interface StatusOptions {
   repoRoot: string;
@@ -80,10 +81,16 @@ export async function runStatus(opts: StatusOptions): Promise<number> {
     console.log(`Items: None scheduled yet`);
   }
 
-  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
-    console.log(`----------------------------------------------------------------`);
-    console.log(`Open Operator Questions (tousertoreview):`);
-    for (const q of derived.openSteerQuestions) {
+  const isBlocking = (q: (typeof derived.openSteerQuestions)[number]) =>
+    q.disposition === "human-stop" ||
+    (q.blocks?.length ?? 0) > 0 ||
+    questionBlocks(q, "task");
+  const printQuestions = (questions: typeof derived.openSteerQuestions): void => {
+    if (questions.length === 0) {
+      console.log(`  (none)`);
+      return;
+    }
+    for (const q of questions) {
       console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
       console.log(`    Question: ${q.question}`);
       if (q.draftDecision) {
@@ -94,7 +101,19 @@ export async function runStatus(opts: StatusOptions): Promise<number> {
       }
       console.log(`    To answer: factory steer ${task} "answer to ${q.id}: <your answer>"`);
     }
-  }
+  };
+
+  console.log(
+    `Concerns: open ${derived.concerns.open} | dismissed ${derived.concerns.dismissed} | routed ${derived.concerns.routed} | resolved ${derived.concerns.resolved}`
+  );
+
+  console.log(`----------------------------------------------------------------`);
+  console.log(`Blocking Questions:`);
+  printQuestions(derived.openSteerQuestions.filter(isBlocking));
+
+  console.log(`----------------------------------------------------------------`);
+  console.log(`Digest Questions:`);
+  printQuestions(derived.openSteerQuestions.filter((q) => !isBlocking(q)));
 
   if (derived.debt && derived.debt.length > 0) {
     console.log(`----------------------------------------------------------------`);
diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
index cf53d5c..5942405 100644
--- a/plugins/software-factory/src/core/artifacts.ts
+++ b/plugins/software-factory/src/core/artifacts.ts
@@ -518,6 +518,14 @@ export interface StateItemInfo {
   mergedAt?: string;
 }
 
+/** Concern-store totals surfaced on state.yaml (§18). */
+export interface ConcernCounts {
+  open: number;
+  dismissed: number;
+  routed: number;
+  resolved: number;
+}
+
 export interface StateArtifact {
   task: string;
   kind?: string;
@@ -525,6 +533,7 @@ export interface StateArtifact {
   iteration: number;
   currentWave?: number;
   items: Record<string, StateItemInfo>;
+  concerns: ConcernCounts;
   debt?: string[];
   budgetSpentUsd?: number;
   lastUpdated: string;
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index 54b4d88..5e2078d 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -2,7 +2,7 @@ import fs from "node:fs";
 import path from "node:path";
 import { createHash } from "node:crypto";
 import yaml from "yaml";
-import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+import type { Concern, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
 import type { Repo } from "./git/repo.js";
 import { commitAll } from "./git/commit.js";
 import { git } from "./git/exec.js";
@@ -127,6 +127,34 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
   return (await listConcerns(taskDir)).filter((r) => r.status === "open");
 }
 
+/**
+ * Counts stored concerns per status for the hollow state view (§18).
+ * A missing directory is zeroes; corrupt entries are skipped with a warning
+ * because the materialized view must never fail derivation.
+ */
+export async function countConcerns(taskDir: string): Promise<ConcernCounts> {
+  const counts: ConcernCounts = { open: 0, dismissed: 0, routed: 0, resolved: 0 };
+  const dir = dirOf(taskDir);
+  let names: string[];
+  try {
+    names = await fs.promises.readdir(dir);
+  } catch (err: any) {
+    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return counts;
+    throw err;
+  }
+  for (const name of names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml"))) {
+    try {
+      const concern = await readYaml<StoredConcernArtifact>(path.join(dir, name));
+      if (typeof concern?.kind === "string" && Object.hasOwn(counts, concern.status)) {
+        counts[concern.status as keyof ConcernCounts]++;
+      }
+    } catch (err: any) {
+      console.warn(`[factory] Skipping corrupt concern file ${name}: ${err?.message ?? err}`);
+    }
+  }
+  return counts;
+}
+
 /** Returns every stored concern/remarkable id for exact-id triage partitioning. */
 export async function listConcernIds(taskDir: string): Promise<string[]> {
   const dir = dirOf(taskDir);
diff --git a/plugins/software-factory/src/core/derive/task.ts b/plugins/software-factory/src/core/derive/task.ts
index 6f4ae05..f7ea7ec 100644
--- a/plugins/software-factory/src/core/derive/task.ts
+++ b/plugins/software-factory/src/core/derive/task.ts
@@ -1,6 +1,7 @@
 import fs from "node:fs";
 import path from "node:path";
 import type {
+  ConcernCounts,
   DecisionArtifact,
   PlanArtifact,
   PlanCloseupArtifact,
@@ -16,7 +17,7 @@ import { readYaml, writeYamlAtomic } from "../records/io.js";
 import { deriveItemState, withRoutedBlocking, type DerivedItemState } from "./item.js";
 import { deriveWaveState, type DerivedWaveState } from "./wave.js";
 import { BudgetTracker } from "../budget.js";
-import { listConcerns } from "../concerns.js";
+import { countConcerns, listConcerns } from "../concerns.js";
 import { isDebtConcern } from "../triage.js";
 import { questionBlocks } from "../steer.js";
 import { blockedByConcern } from "../plan/scheduler.js";
@@ -35,6 +36,7 @@ export interface DerivedTaskState {
   waves: DerivedWaveState[];
   debt: string[];
   budgetSpentUsd: number;
+  concerns: ConcernCounts;
   hasOpenSteerQuestions: boolean;
   openSteerQuestions: SteerItemArtifact[];
   lastCloseup?: PlanCloseupArtifact;
@@ -355,6 +357,8 @@ export async function deriveTaskState(opts: {
     status = "active";
   }
 
+  const concerns = await countConcerns(taskDir);
+
   const toStateArtifact = (): StateArtifact => {
     const itemsRecord: Record<string, StateItemInfo> = {};
     for (const it of items) {
@@ -374,6 +378,7 @@ export async function deriveTaskState(opts: {
       iteration,
       currentWave,
       items: itemsRecord,
+      concerns,
       debt: Array.from(debtSet),
       budgetSpentUsd,
       lastUpdated: new Date().toISOString(),
@@ -392,6 +397,7 @@ export async function deriveTaskState(opts: {
     waves,
     debt: Array.from(debtSet),
     budgetSpentUsd,
+    concerns,
     hasOpenSteerQuestions: openSteerQuestions.length > 0,
     openSteerQuestions,
     lastCloseup,
diff --git a/plugins/software-factory/test/cli/status-concerns.test.ts b/plugins/software-factory/test/cli/status-concerns.test.ts
new file mode 100644
index 0000000..7ebaf2c
--- /dev/null
+++ b/plugins/software-factory/test/cli/status-concerns.test.ts
@@ -0,0 +1,143 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { runInit } from "../../src/cli/init.js";
+import { runStatus } from "../../src/cli/status.js";
+import { writeQuestion } from "../../src/core/steer.js";
+import { writeYamlAtomic } from "../../src/core/records/io.js";
+
+/**
+ * `factory status` §18 surfacing: concern counts plus a split between blocking
+ * operator questions (need a decision) and digest-only remarkable items
+ * (recorded for awareness, never waiting).
+ */
+const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");
+const ORCH = ".factory/tasks";
+
+async function captureOutput(
+  fn: () => Promise<number>
+): Promise<{ code: number; output: string }> {
+  const lines: string[] = [];
+  const originalLog = console.log;
+  const originalError = console.error;
+  console.log = (...args: unknown[]) => {
+    lines.push(args.map(String).join(" "));
+  };
+  console.error = (...args: unknown[]) => {
+    lines.push(args.map(String).join(" "));
+  };
+  try {
+    const code = await fn();
+    return { code, output: lines.join("\n") };
+  } finally {
+    console.log = originalLog;
+    console.error = originalError;
+  }
+}
+
+describe("factory status concern surfacing (§18)", () => {
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
+  async function initTask(task: string): Promise<string> {
+    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
+    const taskDir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
+    return taskDir;
+  }
+
+  function writeConcern(taskDir: string, id: string, status: string): void {
+    const concernDir = path.join(taskDir, "concerns");
+    fs.mkdirSync(concernDir, { recursive: true });
+    writeYamlAtomic(path.join(concernDir, `${id}.yaml`), {
+      id,
+      kind: "risk",
+      summary: `Concern ${id}`,
+      detail: "concern detail",
+      severity: "medium",
+      status,
+      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+    });
+  }
+
+  it("prints concern counts and separates blocking from digest questions", async () => {
+    const task = "status-concerns";
+    const taskDir = await initTask(task);
+
+    writeConcern(taskDir, "c-open-1", "open");
+    writeConcern(taskDir, "c-open-2", "open");
+    writeConcern(taskDir, "c-dismissed", "dismissed");
+    writeConcern(taskDir, "c-routed", "routed");
+    writeConcern(taskDir, "c-resolved", "resolved");
+
+    await writeQuestion(tmpRepo.dir, taskDir, {
+      id: "q-stop",
+      ref: "item-1",
+      disposition: "human-stop",
+      question: "Stop before writing anything else",
+      blocks: ["item-1", "task"],
+    });
+    await writeQuestion(tmpRepo.dir, taskDir, {
+      id: "q-awareness",
+      ref: "item-1",
+      disposition: "human-awareness",
+      question: "Notable tradeoff recorded for the operator",
+      blocks: [],
+    });
+    await writeQuestion(tmpRepo.dir, taskDir, {
+      id: "q-empty-blocks",
+      ref: "item-1",
+      disposition: "human-async",
+      question: "Optional note with no blocking impact",
+      blocks: [],
+    });
+
+    const { code, output } = await captureOutput(() =>
+      runStatus({ repoRoot: tmpRepo.dir, task })
+    );
+
+    expect(code).toBe(0);
+    expect(output).toMatch(
+      /Concerns?[^\n]*open[^\n]*2[^\n]*dismissed[^\n]*1[^\n]*routed[^\n]*1[^\n]*resolved[^\n]*1/i
+    );
+
+    const blockingAt = output.search(/\bBlocking\b/i);
+    const digestAt = output.search(/\bDigest\b/i);
+    expect(blockingAt).toBeGreaterThanOrEqual(0);
+    expect(digestAt).toBeGreaterThan(blockingAt);
+
+    const blockingSection = output.slice(blockingAt, digestAt);
+    const digestSection = output.slice(digestAt);
+    expect(blockingSection).toContain("q-stop");
+    expect(blockingSection).not.toContain("q-awareness");
+    expect(blockingSection).not.toContain("q-empty-blocks");
+    expect(digestSection).toContain("q-awareness");
+    expect(digestSection).toContain("q-empty-blocks");
+    expect(digestSection).not.toContain("q-stop");
+  });
+
+  it("prints zero counts when the task has no concerns yet", async () => {
+    const task = "status-no-concerns";
+    await initTask(task);
+
+    const { code, output } = await captureOutput(() =>
+      runStatus({ repoRoot: tmpRepo.dir, task })
+    );
+
+    expect(code).toBe(0);
+    expect(output).toMatch(
+      /Concerns?[^\n]*open[^\n]*0[^\n]*dismissed[^\n]*0[^\n]*routed[^\n]*0[^\n]*resolved[^\n]*0/i
+    );
+  });
+});
diff --git a/plugins/software-factory/test/contracts/state-concern-schema.test.ts b/plugins/software-factory/test/contracts/state-concern-schema.test.ts
new file mode 100644
index 0000000..451fdd4
--- /dev/null
+++ b/plugins/software-factory/test/contracts/state-concern-schema.test.ts
@@ -0,0 +1,36 @@
+import { describe, expect, it } from "bun:test";
+import path from "node:path";
+import { CompiledSchemaCache } from "../../src/core/records/schema-cache.js";
+
+/**
+ * `state.schema.json` is the canonical contract for the materialized
+ * `state.yaml` view. It must carry the §18 concern counts and require all four
+ * status totals so consumers never read a partially populated view.
+ */
+const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");
+
+describe("State schema concern counts", () => {
+  it("accepts concern status counts and rejects incomplete ones", () => {
+    const validate = new CompiledSchemaCache(
+      path.join(PLUGIN_ROOT, "config/schemas")
+    ).getValidator("state");
+
+    const base = {
+      task: "counts-task",
+      status: "active",
+      iteration: 1,
+      items: {},
+      lastUpdated: "2026-01-01T00:00:00.000Z",
+    };
+    const counts = { open: 2, dismissed: 1, routed: 3, resolved: 4 };
+
+    expect(validate({ ...base, concerns: counts })).toBe(true);
+    expect(validate({ ...base, concerns: { open: 2 } })).toBe(false);
+    expect(
+      validate({ ...base, concerns: { ...counts, pending: 0 } })
+    ).toBe(false);
+    expect(
+      validate({ ...base, concerns: { ...counts, open: "2" } })
+    ).toBe(false);
+  });
+});
diff --git a/plugins/software-factory/test/engine/state-concern-counts.test.ts b/plugins/software-factory/test/engine/state-concern-counts.test.ts
new file mode 100644
index 0000000..8ebd2d3
--- /dev/null
+++ b/plugins/software-factory/test/engine/state-concern-counts.test.ts
@@ -0,0 +1,189 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { deriveTaskState, refreshStateYaml } from "../../src/core/derive/task.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import type { PipelineConfig, StateArtifact } from "../../src/core/artifacts.js";
+
+/**
+ * `StateArtifact.concerns` surfaces concern-store counts (docs/factory.v2.md
+ * §18: "status/state.yaml shows counts"). Counts cover the four store statuses;
+ * a missing `concerns/` directory reports zeros, and corrupt entries are
+ * skipped with a warning instead of breaking state derivation.
+ */
+const ORCH = ".factory";
+
+interface ConcernCounts {
+  open: number;
+  dismissed: number;
+  routed: number;
+  resolved: number;
+}
+
+type StateWithCounts = StateArtifact & { concerns: ConcernCounts };
+
+const ZERO_COUNTS: ConcernCounts = {
+  open: 0,
+  dismissed: 0,
+  routed: 0,
+  resolved: 0,
+};
+
+describe("StateArtifact concern counts (§18)", () => {
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
+    const taskDir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
+    tmpRepo.commit(`add ${task} intent`);
+    return taskDir;
+  }
+
+  function writeConcern(
+    taskDir: string,
+    id: string,
+    status: keyof ConcernCounts
+  ): void {
+    const concernDir = path.join(taskDir, "concerns");
+    fs.mkdirSync(concernDir, { recursive: true });
+    writeYamlAtomic(path.join(concernDir, `${id}.yaml`), {
+      id,
+      kind: status === "routed" ? "blocker" : "risk",
+      summary: `Concern ${id}`,
+      detail: "concern detail",
+      severity: "medium",
+      status,
+      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
+      affects: ["item-1"],
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+    });
+  }
+
+  function minimalPipeline(): PipelineConfig {
+    return {
+      models: { roles: {} },
+      agents: {},
+      flows: { simple: { steps: [] }, story: {}, spike: {} },
+      limits: {},
+    };
+  }
+
+  async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
+    const warnings: string[] = [];
+    const originalWarn = console.warn;
+    const originalError = console.error;
+    const capture = (...args: unknown[]) => {
+      warnings.push(args.map(String).join(" "));
+    };
+    console.warn = capture;
+    console.error = capture;
+    try {
+      await fn();
+    } finally {
+      console.warn = originalWarn;
+      console.error = originalError;
+    }
+    return warnings;
+  }
+
+  it("counts stored concerns by status", async () => {
+    const task = "concern-counts";
+    const taskDir = taskDirFor(task);
+
+    writeConcern(taskDir, "c-open-1", "open");
+    writeConcern(taskDir, "c-open-2", "open");
+    writeConcern(taskDir, "c-dismissed", "dismissed");
+    writeConcern(taskDir, "c-routed", "routed");
+    writeConcern(taskDir, "c-resolved", "resolved");
+
+    const state = await deriveTaskState({
+      taskDir,
+      task,
+      parentBranch: `topic/${task}`,
+    });
+
+    expect((state.toStateArtifact() as StateWithCounts).concerns).toEqual({
+      open: 2,
+      dismissed: 1,
+      routed: 1,
+      resolved: 1,
+    });
+  });
+
+  it("reports zero counts when the concerns directory is missing", async () => {
+    const task = "concern-counts-missing";
+    const taskDir = taskDirFor(task);
+
+    const state = await deriveTaskState({
+      taskDir,
+      task,
+      parentBranch: `topic/${task}`,
+    });
+
+    expect((state.toStateArtifact() as StateWithCounts).concerns).toEqual(ZERO_COUNTS);
+  });
+
+  it("skips corrupt concern files and warns instead of failing derivation", async () => {
+    const task = "concern-counts-corrupt";
+    const taskDir = taskDirFor(task);
+    writeConcern(taskDir, "c-open", "open");
+
+    const corruptPath = path.join(taskDir, "concerns", "c-broken.yaml");
+    fs.writeFileSync(corruptPath, "open: [unterminated\n", "utf8");
+
+    let artifact: StateWithCounts | undefined;
+    const warnings = await captureWarnings(async () => {
+      const state = await deriveTaskState({
+        taskDir,
+        task,
+        parentBranch: `topic/${task}`,
+      });
+      artifact = state.toStateArtifact() as StateWithCounts;
+    });
+
+    expect(artifact?.concerns).toEqual({ ...ZERO_COUNTS, open: 1 });
+    expect(warnings.some((warning) => warning.includes("c-broken.yaml"))).toBe(true);
+  });
+
+  it("refreshStateYaml materializes the counts into state.yaml", async () => {
+    const task = "concern-counts-refresh";
+    const taskDir = taskDirFor(task);
+    writeConcern(taskDir, "c-open", "open");
+    writeConcern(taskDir, "c-dismissed", "dismissed");
+    fs.writeFileSync(
+      path.join(taskDir, "concerns", "c-broken.yaml"),
+      "open: [unterminated\n",
+      "utf8"
+    );
+
+    const warnings = await captureWarnings(async () => {
+      await refreshStateYaml({
+        taskDir,
+        task,
+        parentBranch: `topic/${task}`,
+        taskWt: tmpRepo.dir,
+        pipeline: minimalPipeline(),
+      });
+    });
+
+    const state = await readYaml<StateWithCounts>(path.join(taskDir, "state.yaml"));
+    expect(state.concerns).toEqual({
+      open: 1,
+      dismissed: 1,
+      routed: 0,
+      resolved: 0,
+    });
+    expect(warnings.some((warning) => warning.includes("c-broken.yaml"))).toBe(true);
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
