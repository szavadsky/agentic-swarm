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
  "slug": "reviewer-triage-v2",
  "kind": "dev",
  "title": "Workhorse reviewer triage",
  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
  "outlineRef": "reviewer-triage-v2",
  "milestone": "m2-triage-modes",
  "wave": 7,
  "deps": [
    "concerns-store-v2"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..8f96d11
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,44 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 1 new prod stubs with 35 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/reviewer-triage.test.ts
+      newProdFiles:
+        - plugins/software-factory/src/core/triage.ts
+      stubProdLines: 35
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 11 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794128560664-h2a9pxf6fp.xml
+      junitCaseCount: 11
+      junitCaseIds:
+        - Reviewer triage (§8.7, §18).hydrates steps/review with terse concern
+          fields and triage instructions
+        - Reviewer triage (§8.7, §18).partitions exact-id triage from findings
+          and flags fix once
+        - Reviewer triage (§8.7, §18).renders condensing concern YAML without
+          detail and within the byte cap
+        - Reviewer triage (§8.7, §18).dismisses a concern with its reason and
+          routes nothing
+        - Reviewer triage (§8.7, §18).persists routed dispositions and applies
+          the debt predicate without a tech-debt disposition
+        - Reviewer triage (§8.7, §18).returns fixRequired once for
+          fix-on-concern and keeps it in the fix loop
+        - Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry
+          for human-async triage
+        - Reviewer triage (§8.7, §18).rejects dismiss triage without detail and
+          leaves the concern unchanged
+        - Reviewer triage (§8.7, §18).fails the review step when a dismiss
+          triage lacks detail
+        - "Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern
+          id is a no-op"
+        - Reviewer triage (§8.7, §18).blocks the item with a single q-concern
+          mailbox entry in the engine flow
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..95db947
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
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
+  "slug": "reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Workhorse reviewer triage",
+  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
+  "outlineRef": "reviewer-triage-v2",
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
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..cdc8e15
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T08:48:47.333Z
+session: 01a1ba58-8d0f-72ef-a370-fb780dbea22a
+endedAt: 2026-11-08T09:02:42.987Z
+usage:
+  inputTokens: 181320
+  outputTokens: 65271
+  costUsd: 0.092701
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T08-48-47-887Z_01a1ba58-8d0f-72ef-a370-fb780dbea22a
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..45acc35
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,82 @@
+status: ok
+summary: "Authored 11 test-first behavior tests in
+  test/engine/reviewer-triage.test.ts and a 35-line interface stub at
+  src/core/triage.ts (within the 40-line stubMaxProdLines budget). Tests
+  specify: steps/review hydration with terse open-concern YAML
+  (id/kind/severity/summary/affects, no detail) plus dismiss-reason and
+  condensing instructions; exact-id partition of c-*/rm-* triage vs findings
+  with a single fixRequired flag; strict condensing render under a UTF-8 byte
+  cap; dismiss persisted to dismissReason with no mailbox/routing/debt; routed
+  dispositions persisted and the debt predicate (kind==tech-debt routed/resolved
+  OR disposition==optional routed, no tech-debt disposition); fix-on-concern
+  returns fixRequired once and stays in the canonical fix loop; deduped
+  q-concern-<cid> human-async mailbox entry; dismiss without detail rejects in
+  the store and errors the review step; QA non-triager no-op; and a full engine
+  flow proving the item blocks with exactly one q-concern mailbox entry (normal
+  mailbox path skipped). No existing production code was modified. Verified:
+  typecheck green; target file red with 11 assertion failures and 0 errors; full
+  suite has exactly those 11 failures (335 pass, 2 skip)."
+target:
+  selectors:
+    - test/engine/reviewer-triage.test.ts
+  expectRed:
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates
+      steps/review with terse concern fields and triage instructions
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7,
+      §18).partitions exact-id triage from findings and flags fix once
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders
+      condensing concern YAML without detail and within the byte cap
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses
+      a concern with its reason and routes nothing
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists
+      routed dispositions and applies the debt predicate without a tech-debt
+      disposition
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns
+      fixRequired once for fix-on-concern and keeps it in the fix loop
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes
+      one deduped q-concern mailbox entry for human-async triage
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects
+      dismiss triage without detail and leaves the concern unchanged
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the
+      review step when a dismiss triage lacks detail
+    - "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates
+      non-triagers: QA matching a concern id is a no-op"
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks
+      the item with a single q-concern mailbox entry in the engine flow
+evidence:
+  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
+    --noEmit, no errors)."
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/reviewer-triage.test.ts: 0 pass, 11 fail, 0 errors; failure list
+    shows only assertion failures
+    (toContain/toEqual/toBe/toBeDefined/rejects.toThrow), so target-red is
+    genuine and not an import/compile failure."
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test: 335 pass, 2 skip, 11
+    fail across 57 files; the only failures are the 11 new reviewer-triage
+    tests, so no existing behavior regressed."
+  - "JUnit verification: generated /tmp/rt-junit.xml with bun's junit reporter
+    and matched all 11 expectRed node ids using the engine's parseJunit +
+    normaliseCaseId/findMatchingCase logic; all matched with status fail."
+  - "git status --short: only '?? src/core/triage.ts' (new 35-line interface
+    stub) and '?? test/engine/reviewer-triage.test.ts'; no existing production
+    or test files were modified."
+concerns:
+  - The stub module src/core/triage.ts intentionally returns empty/no-op results
+    so the new tests collect and fail by assertion; the develop step must
+    replace it with real behavior and wire it into step-runner/item-machine.
+  - Test 'fails the review step when a dismiss triage lacks detail' pins
+    StepMetaStatus 'error' (not merely rejected), requiring a distinct
+    triage-validation error path rather than the existing journal-and-keep-ok
+    ingest error path.
+  - Test 'gates non-triagers' requires runAgentStep to expose a triage outcome
+    for every step carrying suggestions (empty triage for non-triagers), which
+    is the planned home for the single fixRequired signal.
+  - The full-engine test expects the canonical review output to exclude non-fix
+    triage suggestions before writeArtifact so the normal mailbox path writes no
+    q-item-* copy; the develop step should apply triage before writeArtifact and
+    retain only fix-on-concern entries for the fix loop.
+notes: Test ids use the JUnit classname form 'Reviewer triage (§8.7, §18).<test
+  name>' under the reporter's file attribute, matching the engine's node-id
+  normalizer. Full-suite runtime was ~67s with TMPDIR=/tmp; without it the two
+  pre-existing head-guard failures noted in infra.yaml appear, so gate runs
+  should keep TMPDIR=/tmp.
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..400af37
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
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
+        durationMs: 3647
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 67705
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-CVEw9C/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3298764
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3298764
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3298764
+
+           346 pass
+           2 skip
+           0 fail
+           1600 expect() calls
+          Ran 348 tests across 57 files. [67.56s]
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
+        test/engine/reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794129408976-qr45ctppnpq.xml
+      junitCaseCount: 11
+      junitCaseIds:
+        - Reviewer triage (§8.7, §18).hydrates steps/review with terse concern
+          fields and triage instructions
+        - Reviewer triage (§8.7, §18).partitions exact-id triage from findings
+          and flags fix once
+        - Reviewer triage (§8.7, §18).renders condensing concern YAML without
+          detail and within the byte cap
+        - Reviewer triage (§8.7, §18).dismisses a concern with its reason and
+          routes nothing
+        - Reviewer triage (§8.7, §18).persists routed dispositions and applies
+          the debt predicate without a tech-debt disposition
+        - Reviewer triage (§8.7, §18).returns fixRequired once for
+          fix-on-concern and keeps it in the fix loop
+        - Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry
+          for human-async triage
+        - Reviewer triage (§8.7, §18).rejects dismiss triage without detail and
+          leaves the concern unchanged
+        - Reviewer triage (§8.7, §18).fails the review step when a dismiss
+          triage lacks detail
+        - "Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern
+          id is a no-op"
+        - Reviewer triage (§8.7, §18).blocks the item with a single q-concern
+          mailbox entry in the engine flow
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 236/300 production lines changed"
+    details:
+      changedLines:
+        added: 224
+        deleted: 12
+        total: 236
+        files:
+          - plugins/software-factory/agents/steps/review.md
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/flows/item-machine.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/triage.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..a7808f8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,68 @@
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
+  "slug": "reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Workhorse reviewer triage",
+  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
+  "outlineRef": "reviewer-triage-v2",
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
+    "test/engine/reviewer-triage.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates steps/review with terse concern fields and triage instructions",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).partitions exact-id triage from findings and flags fix once",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders condensing concern YAML without detail and within the byte cap",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses a concern with its reason and routes nothing",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists routed dispositions and applies the debt predicate without a tech-debt disposition",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns fixRequired once for fix-on-concern and keeps it in the fix loop",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry for human-async triage",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects dismiss triage without detail and leaves the concern unchanged",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the review step when a dismiss triage lacks detail",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern id is a no-op",
+    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks the item with a single q-concern mailbox entry in the engine flow"
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
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..2283576
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T09:02:50.575Z
+session: 01a1ba65-6a46-779e-ba94-c6ca18b9741d
+endedAt: 2026-11-08T09:16:51.788Z
+usage:
+  inputTokens: 74835
+  outputTokens: 36276
+  costUsd: 0.046325
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-02-50-950Z_01a1ba65-6a46-779e-ba94-c6ca18b9741d
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..34ddee0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,60 @@
+status: ok
+summary: "Implemented workhorse reviewer triage: terse, byte-capped concernsYaml
+  hydration; exact-id partition with triager gate and one-shot fixRequired;
+  dispatching dismiss/route/fix/human-async triage with dismiss-reason
+  validation; deduped q-concern-<cid> mailbox; debt predicate without a
+  tech-debt disposition; and engine wiring that excludes concern ids from the
+  normal mailbox while surfacing triage outcomes on StepRunResult."
+target:
+  selectors:
+    - test/engine/reviewer-triage.test.ts
+  expectRed:
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates
+      steps/review with terse concern fields and triage instructions
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7,
+      §18).partitions exact-id triage from findings and flags fix once
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders
+      condensing concern YAML without detail and within the byte cap
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses
+      a concern with its reason and routes nothing
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists
+      routed dispositions and applies the debt predicate without a tech-debt
+      disposition
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns
+      fixRequired once for fix-on-concern and keeps it in the fix loop
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes
+      one deduped q-concern mailbox entry for human-async triage
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects
+      dismiss triage without detail and leaves the concern unchanged
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the
+      review step when a dismiss triage lacks detail
+    - "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates
+      non-triagers: QA matching a concern id is a no-op"
+    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks
+      the item with a single q-concern mailbox entry in the engine flow
+evidence:
+  - "`cd plugins/software-factory && bun test
+    test/engine/reviewer-triage.test.ts` — 11 pass, 0 fail, 97 expect() calls."
+  - "`cd plugins/software-factory && bun run typecheck` — tsc --noEmit exits 0."
+  - "`cd plugins/software-factory && bun test` — full suite: 346 pass, 2 skip, 0
+    fail across 348 tests / 57 files."
+  - "Manual renderer probe with 600-byte details: default output 189 bytes vs
+    JSON payload with detail (strictly condensed); cap 120 yields 108 bytes of
+    valid YAML; cap 80 yields 74 bytes; no U+FFFD produced."
+  - Impacted regression tests `test/smoke-fixes.test.ts`,
+    `test/engine/concerns-funnel.test.ts`, and
+    `test/engine/reviewer-triage.test.ts` — 36 pass, 0 fail.
+concerns:
+  - "`test/smoke-fixes.test.ts` fixture now supplies the newly required
+    `concernsYaml` prompt variable; assertions were unchanged."
+  - Hydration treats a non-directory `concerns` path (ENOTDIR) as empty, while
+    ingest still journals the underlying concern-store failure.
+notes: "Core changes: src/core/triage.ts now implements
+  partitionReviewSuggestions, renderConcernsYaml, applyReviewTriage,
+  concernMailboxId, isDebtConcern, and TriageValidationError. step-runner
+  hydrates open concerns before rendering, applies triage after the canonical
+  artifact write, returns ReviewTriageOutcome as result.triage, and fails the
+  step on dismiss-without-detail. item-machine excludes exact concern ids from
+  the normal q-* mailbox so human-async triage only creates q-concern-<cid>.
+  agents/steps/review.md documents exact-id triage, dismiss detail requirement,
+  and condensing."
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..ad49949
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,61 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 11 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/reviewer-triage.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794129418447-wkx372cxsqg.xml
+      junitCaseCount: 11
+      junitCaseIds:
+        - Reviewer triage (§8.7, §18).hydrates steps/review with terse concern
+          fields and triage instructions
+        - Reviewer triage (§8.7, §18).partitions exact-id triage from findings
+          and flags fix once
+        - Reviewer triage (§8.7, §18).renders condensing concern YAML without
+          detail and within the byte cap
+        - Reviewer triage (§8.7, §18).dismisses a concern with its reason and
+          routes nothing
+        - Reviewer triage (§8.7, §18).persists routed dispositions and applies
+          the debt predicate without a tech-debt disposition
+        - Reviewer triage (§8.7, §18).returns fixRequired once for
+          fix-on-concern and keeps it in the fix loop
+        - Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry
+          for human-async triage
+        - Reviewer triage (§8.7, §18).rejects dismiss triage without detail and
+          leaves the concern unchanged
+        - Reviewer triage (§8.7, §18).fails the review step when a dismiss
+          triage lacks detail
+        - "Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern
+          id is a no-op"
+        - Reviewer triage (§8.7, §18).blocks the item with a single q-concern
+          mailbox entry in the engine flow
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (1 test files, 525 bytes)
+    details:
+      diff: >-
+        diff --git a/plugins/software-factory/test/smoke-fixes.test.ts
+        b/plugins/software-factory/test/smoke-fixes.test.ts
+
+        index cb903e0..d282558 100644
+
+        --- a/plugins/software-factory/test/smoke-fixes.test.ts
+
+        +++ b/plugins/software-factory/test/smoke-fixes.test.ts
+
+        @@ -87,6 +87,7 @@ describe("Smoke fixes acceptance tests (§6.4, §7, §8,
+        §9)", () => {
+                 checks: "sample checks",
+                 diff: "sample diff",
+                 dispositionsCriteria: "sample dispositions",
+        +        concernsYaml: "",
+               },
+               reviewSchema
+             );
+      files:
+        - plugins/software-factory/test/smoke-fixes.test.ts
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..b78b937
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1612 @@
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
+  "slug": "reviewer-triage-v2",
+  "kind": "dev",
+  "title": "Workhorse reviewer triage",
+  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
+  "outlineRef": "reviewer-triage-v2",
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
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..8f96d11
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,44 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 1 new prod stubs with 35 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
++      newProdFiles:
++        - plugins/software-factory/src/core/triage.ts
++      stubProdLines: 35
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 11 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794128560664-h2a9pxf6fp.xml
++      junitCaseCount: 11
++      junitCaseIds:
++        - Reviewer triage (§8.7, §18).hydrates steps/review with terse concern
++          fields and triage instructions
++        - Reviewer triage (§8.7, §18).partitions exact-id triage from findings
++          and flags fix once
++        - Reviewer triage (§8.7, §18).renders condensing concern YAML without
++          detail and within the byte cap
++        - Reviewer triage (§8.7, §18).dismisses a concern with its reason and
++          routes nothing
++        - Reviewer triage (§8.7, §18).persists routed dispositions and applies
++          the debt predicate without a tech-debt disposition
++        - Reviewer triage (§8.7, §18).returns fixRequired once for
++          fix-on-concern and keeps it in the fix loop
++        - Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry
++          for human-async triage
++        - Reviewer triage (§8.7, §18).rejects dismiss triage without detail and
++          leaves the concern unchanged
++        - Reviewer triage (§8.7, §18).fails the review step when a dismiss
++          triage lacks detail
++        - "Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern
++          id is a no-op"
++        - Reviewer triage (§8.7, §18).blocks the item with a single q-concern
++          mailbox entry in the engine flow
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..95db947
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/input.md
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
++  "slug": "reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Workhorse reviewer triage",
++  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
++  "outlineRef": "reviewer-triage-v2",
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
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..cdc8e15
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T08:48:47.333Z
++session: 01a1ba58-8d0f-72ef-a370-fb780dbea22a
++endedAt: 2026-11-08T09:02:42.987Z
++usage:
++  inputTokens: 181320
++  outputTokens: 65271
++  costUsd: 0.092701
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T08-48-47-887Z_01a1ba58-8d0f-72ef-a370-fb780dbea22a
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..45acc35
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,82 @@
++status: ok
++summary: "Authored 11 test-first behavior tests in
++  test/engine/reviewer-triage.test.ts and a 35-line interface stub at
++  src/core/triage.ts (within the 40-line stubMaxProdLines budget). Tests
++  specify: steps/review hydration with terse open-concern YAML
++  (id/kind/severity/summary/affects, no detail) plus dismiss-reason and
++  condensing instructions; exact-id partition of c-*/rm-* triage vs findings
++  with a single fixRequired flag; strict condensing render under a UTF-8 byte
++  cap; dismiss persisted to dismissReason with no mailbox/routing/debt; routed
++  dispositions persisted and the debt predicate (kind==tech-debt routed/resolved
++  OR disposition==optional routed, no tech-debt disposition); fix-on-concern
++  returns fixRequired once and stays in the canonical fix loop; deduped
++  q-concern-<cid> human-async mailbox entry; dismiss without detail rejects in
++  the store and errors the review step; QA non-triager no-op; and a full engine
++  flow proving the item blocks with exactly one q-concern mailbox entry (normal
++  mailbox path skipped). No existing production code was modified. Verified:
++  typecheck green; target file red with 11 assertion failures and 0 errors; full
++  suite has exactly those 11 failures (335 pass, 2 skip)."
++target:
++  selectors:
++    - test/engine/reviewer-triage.test.ts
++  expectRed:
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates
++      steps/review with terse concern fields and triage instructions
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7,
++      §18).partitions exact-id triage from findings and flags fix once
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders
++      condensing concern YAML without detail and within the byte cap
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses
++      a concern with its reason and routes nothing
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists
++      routed dispositions and applies the debt predicate without a tech-debt
++      disposition
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns
++      fixRequired once for fix-on-concern and keeps it in the fix loop
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes
++      one deduped q-concern mailbox entry for human-async triage
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects
++      dismiss triage without detail and leaves the concern unchanged
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the
++      review step when a dismiss triage lacks detail
++    - "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates
++      non-triagers: QA matching a concern id is a no-op"
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks
++      the item with a single q-concern mailbox entry in the engine flow
++evidence:
++  - "cd plugins/software-factory && TMPDIR=/tmp bun run typecheck: exit 0 (tsc
++    --noEmit, no errors)."
++  - "cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/reviewer-triage.test.ts: 0 pass, 11 fail, 0 errors; failure list
++    shows only assertion failures
++    (toContain/toEqual/toBe/toBeDefined/rejects.toThrow), so target-red is
++    genuine and not an import/compile failure."
++  - "cd plugins/software-factory && TMPDIR=/tmp bun test: 335 pass, 2 skip, 11
++    fail across 57 files; the only failures are the 11 new reviewer-triage
++    tests, so no existing behavior regressed."
++  - "JUnit verification: generated /tmp/rt-junit.xml with bun's junit reporter
++    and matched all 11 expectRed node ids using the engine's parseJunit +
++    normaliseCaseId/findMatchingCase logic; all matched with status fail."
++  - "git status --short: only '?? src/core/triage.ts' (new 35-line interface
++    stub) and '?? test/engine/reviewer-triage.test.ts'; no existing production
++    or test files were modified."
++concerns:
++  - The stub module src/core/triage.ts intentionally returns empty/no-op results
++    so the new tests collect and fail by assertion; the develop step must
++    replace it with real behavior and wire it into step-runner/item-machine.
++  - Test 'fails the review step when a dismiss triage lacks detail' pins
++    StepMetaStatus 'error' (not merely rejected), requiring a distinct
++    triage-validation error path rather than the existing journal-and-keep-ok
++    ingest error path.
++  - Test 'gates non-triagers' requires runAgentStep to expose a triage outcome
++    for every step carrying suggestions (empty triage for non-triagers), which
++    is the planned home for the single fixRequired signal.
++  - The full-engine test expects the canonical review output to exclude non-fix
++    triage suggestions before writeArtifact so the normal mailbox path writes no
++    q-item-* copy; the develop step should apply triage before writeArtifact and
++    retain only fix-on-concern entries for the fix loop.
++notes: Test ids use the JUnit classname form 'Reviewer triage (§8.7, §18).<test
++  name>' under the reporter's file attribute, matching the engine's node-id
++  normalizer. Full-suite runtime was ~67s with TMPDIR=/tmp; without it the two
++  pre-existing head-guard failures noted in infra.yaml appear, so gate runs
++  should keep TMPDIR=/tmp.
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..400af37
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/checks.yaml
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
++        durationMs: 3647
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 67705
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-CVEw9C/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3298764
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3298764
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3298764
++
++           346 pass
++           2 skip
++           0 fail
++           1600 expect() calls
++          Ran 348 tests across 57 files. [67.56s]
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
++        test/engine/reviewer-triage.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794129408976-qr45ctppnpq.xml
++      junitCaseCount: 11
++      junitCaseIds:
++        - Reviewer triage (§8.7, §18).hydrates steps/review with terse concern
++          fields and triage instructions
++        - Reviewer triage (§8.7, §18).partitions exact-id triage from findings
++          and flags fix once
++        - Reviewer triage (§8.7, §18).renders condensing concern YAML without
++          detail and within the byte cap
++        - Reviewer triage (§8.7, §18).dismisses a concern with its reason and
++          routes nothing
++        - Reviewer triage (§8.7, §18).persists routed dispositions and applies
++          the debt predicate without a tech-debt disposition
++        - Reviewer triage (§8.7, §18).returns fixRequired once for
++          fix-on-concern and keeps it in the fix loop
++        - Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry
++          for human-async triage
++        - Reviewer triage (§8.7, §18).rejects dismiss triage without detail and
++          leaves the concern unchanged
++        - Reviewer triage (§8.7, §18).fails the review step when a dismiss
++          triage lacks detail
++        - "Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern
++          id is a no-op"
++        - Reviewer triage (§8.7, §18).blocks the item with a single q-concern
++          mailbox entry in the engine flow
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 236/300 production lines changed"
++    details:
++      changedLines:
++        added: 224
++        deleted: 12
++        total: 236
++        files:
++          - plugins/software-factory/agents/steps/review.md
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/flows/item-machine.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/triage.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..a7808f8
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,68 @@
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
++  "slug": "reviewer-triage-v2",
++  "kind": "dev",
++  "title": "Workhorse reviewer triage",
++  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
++  "outlineRef": "reviewer-triage-v2",
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
++    "test/engine/reviewer-triage.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates steps/review with terse concern fields and triage instructions",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).partitions exact-id triage from findings and flags fix once",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders condensing concern YAML without detail and within the byte cap",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses a concern with its reason and routes nothing",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists routed dispositions and applies the debt predicate without a tech-debt disposition",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns fixRequired once for fix-on-concern and keeps it in the fix loop",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry for human-async triage",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects dismiss triage without detail and leaves the concern unchanged",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the review step when a dismiss triage lacks detail",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern id is a no-op",
++    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks the item with a single q-concern mailbox entry in the engine flow"
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
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..2283576
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T09:02:50.575Z
++session: 01a1ba65-6a46-779e-ba94-c6ca18b9741d
++endedAt: 2026-11-08T09:16:51.788Z
++usage:
++  inputTokens: 74835
++  outputTokens: 36276
++  costUsd: 0.046325
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-02-50-950Z_01a1ba65-6a46-779e-ba94-c6ca18b9741d
+diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..34ddee0
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,60 @@
++status: ok
++summary: "Implemented workhorse reviewer triage: terse, byte-capped concernsYaml
++  hydration; exact-id partition with triager gate and one-shot fixRequired;
++  dispatching dismiss/route/fix/human-async triage with dismiss-reason
++  validation; deduped q-concern-<cid> mailbox; debt predicate without a
++  tech-debt disposition; and engine wiring that excludes concern ids from the
++  normal mailbox while surfacing triage outcomes on StepRunResult."
++target:
++  selectors:
++    - test/engine/reviewer-triage.test.ts
++  expectRed:
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates
++      steps/review with terse concern fields and triage instructions
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7,
++      §18).partitions exact-id triage from findings and flags fix once
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders
++      condensing concern YAML without detail and within the byte cap
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses
++      a concern with its reason and routes nothing
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists
++      routed dispositions and applies the debt predicate without a tech-debt
++      disposition
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns
++      fixRequired once for fix-on-concern and keeps it in the fix loop
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes
++      one deduped q-concern mailbox entry for human-async triage
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects
++      dismiss triage without detail and leaves the concern unchanged
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the
++      review step when a dismiss triage lacks detail
++    - "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates
++      non-triagers: QA matching a concern id is a no-op"
++    - test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks
++      the item with a single q-concern mailbox entry in the engine flow
++evidence:
++  - "`cd plugins/software-factory && bun test
++    test/engine/reviewer-triage.test.ts` — 11 pass, 0 fail, 97 expect() calls."
++  - "`cd plugins/software-factory && bun run typecheck` — tsc --noEmit exits 0."
++  - "`cd plugins/software-factory && bun test` — full suite: 346 pass, 2 skip, 0
++    fail across 348 tests / 57 files."
++  - "Manual renderer probe with 600-byte details: default output 189 bytes vs
++    JSON payload with detail (strictly condensed); cap 120 yields 108 bytes of
++    valid YAML; cap 80 yields 74 bytes; no U+FFFD produced."
++  - Impacted regression tests `test/smoke-fixes.test.ts`,
++    `test/engine/concerns-funnel.test.ts`, and
++    `test/engine/reviewer-triage.test.ts` — 36 pass, 0 fail.
++concerns:
++  - "`test/smoke-fixes.test.ts` fixture now supplies the newly required
++    `concernsYaml` prompt variable; assertions were unchanged."
++  - Hydration treats a non-directory `concerns` path (ENOTDIR) as empty, while
++    ingest still journals the underlying concern-store failure.
++notes: "Core changes: src/core/triage.ts now implements
++  partitionReviewSuggestions, renderConcernsYaml, applyReviewTriage,
++  concernMailboxId, isDebtConcern, and TriageValidationError. step-runner
++  hydrates open concerns before rendering, applies triage after the canonical
++  artifact write, returns ReviewTriageOutcome as result.triage, and fails the
++  step on dismiss-without-detail. item-machine excludes exact concern ids from
++  the normal q-* mailbox so human-async triage only creates q-concern-<cid>.
++  agents/steps/review.md documents exact-id triage, dismiss detail requirement,
++  and condensing."
+diff --git a/plugins/software-factory/agents/steps/review.md b/plugins/software-factory/agents/steps/review.md
+index f5f9b31..f36a1fe 100644
+--- a/plugins/software-factory/agents/steps/review.md
++++ b/plugins/software-factory/agents/steps/review.md
+@@ -15,6 +15,13 @@ Conduct adversarial peer code review on completed changes, evaluating implementa
+ ## Dispositions Criteria
+ {{dispositionsCriteria}}
+ 
++## Open Concerns
++{{concernsYaml}}
++
++- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
++- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
++- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
++
+ ## Assignment
+ {{assignment}}
+ 
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index c1e8f80..e7b3f37 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -110,7 +110,7 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
+   const dir = dirOf(taskDir);
+   let names: string[];
+   try { names = await fs.promises.readdir(dir); } catch (err: any) {
+-    if (err?.code === "ENOENT") return [];
++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
+     throw err;
+   }
+   const records = await Promise.all(names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).map(async (name) => {
+diff --git a/plugins/software-factory/src/core/flows/item-machine.ts b/plugins/software-factory/src/core/flows/item-machine.ts
+index 263d64e..a5955a1 100644
+--- a/plugins/software-factory/src/core/flows/item-machine.ts
++++ b/plugins/software-factory/src/core/flows/item-machine.ts
+@@ -707,10 +707,21 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
+     beforeChecks,
+     afterChecks,
+     writeArtifact: async (output: unknown) => {
+-      // Persist human-async questions atomically with the review record (Finding 23)
++      // Persist human-async questions atomically with the review record (Finding 23).
++      // Concern ids are triaged separately (q-concern-*) and never use this mailbox.
+       if (output && typeof output === "object" && "suggestions" in (output as any)) {
+         const rev = output as ReviewArtifact;
+-        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
++        const concernIds = new Set<string>();
++        try {
++          for (const name of await fs.promises.readdir(path.join(taskDir, "concerns"))) {
++            if (name.endsWith(".yaml")) concernIds.add(name.slice(0, -5));
++          }
++        } catch (err: any) {
++          if (err?.code !== "ENOENT") throw err;
++        }
++        const asyncQuestions = rev.suggestions?.filter(
++          (s) => s.disposition === "human-async" && !concernIds.has(s.id)
++        );
+         if (asyncQuestions && asyncQuestions.length > 0) {
+           for (const q of asyncQuestions) {
+             const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index 272ddef..3b158c4 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -27,9 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   aggregateConcerns,
+   applyCloseupResolutions,
+-  applyConcernTriage,
+-  partitionSuggestions,
++  listOpenConcerns,
+ } from "../concerns.js";
++import {
++  applyReviewTriage,
++  renderConcernsYaml,
++  TriageValidationError,
++  type ReviewTriageOutcome,
++} from "../triage.js";
+ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+@@ -87,6 +92,7 @@ export interface StepRunResult {
+   usage?: Usage;
+   branchChanged?: boolean;
+   headMoved?: boolean;
++  triage?: ReviewTriageOutcome;
+ }
+ 
+ /**
+@@ -178,13 +184,13 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
+ async function ingestStepConcerns(opts: {
+   taskDir: string; taskWt: string; repo: any; output: unknown;
+   source: { record: string; agent: string; step: string; item?: string; iteration?: number };
+-}): Promise<void> {
++}): Promise<ReviewTriageOutcome | undefined> {
+   const data = (opts.output ?? {}) as Record<string, any>;
+   const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
+   const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
+   const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
+   const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
+-  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return;
++  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return undefined;
+ 
+   // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
+   let existing: string[] = [];
+@@ -196,9 +202,17 @@ async function ingestStepConcerns(opts: {
+   }
+   const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
+   if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
+-  const { triage } = partitionSuggestions(suggestions, existing);
+-  if (triage.length) await applyConcernTriage({ ...ctx, suggestions: triage, isTriager: isTriagerAgent(opts.source.agent) });
++  const triage = suggestions.length > 0
++    ? await applyReviewTriage({
++        ...ctx,
++        suggestions,
++        concernIds: existing,
++        isTriager: isTriagerAgent(opts.source.agent),
++        ...(opts.source.item ? { item: opts.source.item } : {}),
++      })
++    : undefined;
+   if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
++  return triage;
+ }
+ 
+ /**
+@@ -279,12 +293,16 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
+   const fragment = stepFragment ?? `steps/${stepId}`;
+   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
++  const openConcerns = await listOpenConcerns(taskDir);
++  const concernsYaml = openConcerns.length > 0
++    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
++    : "";
+   const effectivePromptVars: Record<string, string> = {
+     humanInvolvementCriteria: formatHumanInvolvementCriteria(
+       criteriaBundle.humanInvolvement,
+       pipeline.humanInvolvement
+     ),
+-    concernsYaml: "",
++    concernsYaml,
+     ...promptVars,
+   };
+   let promptText: string;
+@@ -679,9 +697,10 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+   }
+ 
+   // Producer concerns feed the taskWt store after the canonical artifact write.
++  let triageOutcome: ReviewTriageOutcome | undefined;
+   if (finalStatus === "ok") {
+     try {
+-      await ingestStepConcerns({
++      triageOutcome = await ingestStepConcerns({
+         taskDir, taskWt, repo, output: validatedData,
+         source: {
+           record: dirName, agent, step: stepId,
+@@ -690,7 +709,12 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+         },
+       });
+     } catch (err: any) {
+-      try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
++      if (err instanceof TriageValidationError) {
++        finalStatus = "error";
++        validationError = `Review triage failed: ${err.message}`;
++      } else {
++        try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
++      }
+     }
+   }
+ 
+@@ -752,5 +776,6 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+     usage: totalUsage,
+     branchChanged,
+     headMoved,
++    ...(triageOutcome ? { triage: triageOutcome } : {}),
+   };
+ }
+diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
+new file mode 100644
+index 0000000..923a9d1
+--- /dev/null
++++ b/plugins/software-factory/src/core/triage.ts
+@@ -0,0 +1,169 @@
++import yaml from "yaml";
++import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++import { applyConcernTriage } from "./concerns.js";
++import type { Repo } from "./git/repo.js";
++import { writeQuestion } from "./steer.js";
++
++/** Exact-id reviewer triage over review suggestions (§8.7, §18). */
++export interface TriagePartition {
++  triage: ReviewSuggestion[];
++  findings: ReviewSuggestion[];
++  fixRequired: boolean;
++}
++export interface ReviewTriageOutcome extends TriagePartition {
++  routed: ReviewSuggestion[];
++  dismissed: ReviewSuggestion[];
++  mailboxIds: string[];
++}
++export interface ReviewTriageContext {
++  taskDir: string; taskWt: string; repo: Repo; suggestions: ReviewSuggestion[];
++  concernIds: Iterable<string>; isTriager: boolean; item?: string; now?: () => Date;
++}
++/** Contract violation that must fail the review step instead of being journaled. */
++export class TriageValidationError extends Error {}
++
++/** Splits suggestions into pre-existing concern triage and ordinary findings. */
++export function partitionReviewSuggestions(
++  suggestions: ReviewSuggestion[],
++  concernIds: Iterable<string>,
++  isTriager: boolean
++): TriagePartition {
++  if (!isTriager) {
++    return { triage: [], findings: [...suggestions], fixRequired: false };
++  }
++  const ids = new Set(concernIds);
++  const triage = suggestions.filter((s) => ids.has(s.id));
++  return {
++    triage,
++    findings: suggestions.filter((s) => !ids.has(s.id)),
++    fixRequired: triage.some((s) => s.disposition === "fix"),
++  };
++}
++
++export function concernMailboxId(concernId: string): string {
++  return `q-concern-${concernId}`;
++}
++
++/**
++ * Debt predicate for close-up accounting. Open concerns are still live, so they
++ * are not debt; a non-open `tech-debt` concern or an `optional` disposition is.
++ * There is deliberately no `tech-debt` disposition.
++ */
++export function isDebtConcern(
++  c: Pick<StoredConcernArtifact, "kind" | "status" | "disposition">
++): boolean {
++  if ((c.disposition as string | undefined) === "tech-debt") return false;
++  if (c.status !== "routed" && c.status !== "resolved") return false;
++  return c.kind === "tech-debt" || c.disposition === "optional";
++}
++
++/** Terse hydration shape: never the bulky detail field (§4, §18). */
++function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
++  return {
++    id: c.id,
++    kind: c.kind,
++    severity: c.severity,
++    summary: c.summary,
++    ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
++  };
++}
++
++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++const serialize = (records: Array<Record<string, unknown>>) =>
++  yaml.stringify(records, { lineWidth: 0 });
++const truncateChars = (text: string, max: number) =>
++  Array.from(text).slice(0, max).join("");
++
++/**
++ * Renders open concerns as terse, byte-capped YAML for prompt hydration.
++ * Detail is dropped; over-budget output condenses summaries, drops affects,
++ * then sheds trailing entries until the UTF-8 byte ceiling is met.
++ */
++export function renderConcernsYaml(
++  concerns: StoredConcernArtifact[],
++  maxBytes = 8000
++): string {
++  const records = concerns.map(terseConcern);
++  const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
++    { records },
++    { records: records.map(({ affects: _affects, ...rest }) => rest) },
++    ...[80, 40, 16, 8, 4, 1].map((summaryLimit) => ({ records, summaryLimit })),
++    ...[80, 40, 16, 8, 4, 1].map((summaryLimit) => ({
++      records: records.map(({ affects: _affects, ...rest }) => rest),
++      summaryLimit,
++    })),
++  ];
++
++  let triedFull = false;
++  for (const variant of variants) {
++    for (let count = variant.records.length; count > 0; count--) {
++      if (variant.summaryLimit === undefined && count === variant.records.length) {
++        if (triedFull) continue;
++        triedFull = true;
++      }
++      const selected = variant.records.slice(0, count).map((r) =>
++        variant.summaryLimit === undefined
++          ? r
++          : { ...r, summary: truncateChars(String(r.summary ?? ""), variant.summaryLimit) }
++      );
++      const text = serialize(selected);
++      if (utf8Bytes(text) <= maxBytes) return text;
++    }
++  }
++  return serialize([]);
++}
++
++/**
++ * Applies exact-id concern triage and reports the partition. Only triagers may
++ * triage; `dismiss` requires detail, and `fix` is reported once while the
++ * suggestion stays in the canonical review output for the fix loop.
++ */
++export async function applyReviewTriage(
++  ctx: ReviewTriageContext
++): Promise<ReviewTriageOutcome> {
++  const partition = partitionReviewSuggestions(
++    ctx.suggestions,
++    ctx.concernIds,
++    ctx.isTriager
++  );
++  if (!ctx.isTriager) {
++    return { ...partition, routed: [], dismissed: [], mailboxIds: [] };
++  }
++
++  for (const s of partition.triage) {
++    if (s.disposition === "dismiss" && !s.detail?.trim()) {
++      throw new TriageValidationError(
++        `Dismiss triage for ${s.id} requires detail (the dismissal reason)`
++      );
++    }
++  }
++
++  if (partition.triage.length > 0) {
++    await applyConcernTriage({
++      taskDir: ctx.taskDir,
++      taskWt: ctx.taskWt,
++      repo: ctx.repo,
++      suggestions: partition.triage,
++      isTriager: true,
++      ...(ctx.now ? { now: ctx.now } : {}),
++    });
++  }
++
++  const dismissed = partition.triage.filter((s) => s.disposition === "dismiss");
++  const routed = partition.triage.filter((s) => s.disposition !== "dismiss");
++  const mailboxIds: string[] = [];
++  for (const s of routed) {
++    if (s.disposition !== "human-async") continue;
++    const id = concernMailboxId(s.id);
++    await writeQuestion(ctx.taskWt, ctx.taskDir, {
++      id,
++      ref: ctx.item ?? s.id,
++      disposition: "human-async",
++      question: s.detail?.trim() || s.summary,
++      ...(ctx.item ? { blocks: [ctx.item] } : {}),
++    });
++    mailboxIds.push(id);
++  }
++
++  return { ...partition, routed, dismissed, mailboxIds };
++}
+diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+new file mode 100644
+index 0000000..fb7cc9b
+--- /dev/null
++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+@@ -0,0 +1,688 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import yaml from "yaml";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runTask } from "../../src/core/engine.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import { concernFingerprint } from "../../src/core/concerns.js";
++import { resolveReviewAllowed } from "../../src/core/review-policy.js";
++import {
++  applyReviewTriage,
++  concernMailboxId,
++  isDebtConcern,
++  partitionReviewSuggestions,
++  renderConcernsYaml,
++  type ReviewTriageOutcome,
++} from "../../src/core/triage.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  ReviewSuggestion,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Item reviewer triage (docs/factory.v2.md §18; ADRs
++ * adr-triage-suggestions-dismiss, adr-concern-store-taskwt, adr-funnel-text-budget).
++ *
++ * The workhorse reviewer sees terse open concerns, triages them by exact id
++ * (`c-*` / `rm-*`) with the review vocabulary plus `dismiss`, and those ids are
++ * excluded from the normal fix-loop/approval/mailbox paths. The one exception is
++ * `fix` on a concern, which reports a single `fixRequired`; human-async writes a
++ * deduped `q-concern-<cid>` mailbox entry. QA is not a triager.
++ */
++describe("Reviewer triage (§8.7, §18)", () => {
++  const ORCH = ".factory";
++  const TASK = "reviewer-triage";
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
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Reviewer triage\n", "utf8");
++    tmpRepo.commit("add reviewer triage task");
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
++        qa: { role: "alt-workhorse" },
++        reviewer: { role: "alt-workhorse" },
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
++  async function writeConcern(concern: StoredConcernArtifact): Promise<string> {
++    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
++    await writeYamlAtomic(file, concern);
++    return file;
++  }
++
++  function mailboxFiles(): string[] {
++    const dir = path.join(taskDir, "steer", "tousertoreview");
++    if (!fs.existsSync(dir)) return [];
++    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
++  }
++
++  async function runReview(opts: {
++    item?: string;
++    agent?: string;
++    stepId?: string;
++    stepFragment?: string;
++    data: unknown;
++  }) {
++    const agent = opts.agent ?? "reviewer";
++    const stepId = opts.stepId ?? "review";
++    const stepFragment = opts.stepFragment ?? `steps/${stepId}`;
++    const harness = new FakeHarness();
++    const label = opts.item
++      ? `${TASK}/items/${opts.item}/${stepId}#a1`
++      : `${TASK}/runs/${stepId}#a1`;
++    harness.scriptOutcome(label, { ok: true, data: opts.data });
++    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
++    harness.scriptComplete(() => opts.data);
++    const recordsDir = path.join(taskDir, opts.item ? `items/${opts.item}/steps` : "runs");
++    fs.mkdirSync(recordsDir, { recursive: true });
++
++    const result = await runAgentStep({
++      task: TASK,
++      item: opts.item,
++      stepId,
++      stepFragment,
++      agent,
++      cwd: taskWt,
++      taskWt,
++      taskDir,
++      recordsDir,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      promptVars: {
++        assignment: "Review the item",
++        checks: "",
++        testDiff: "",
++        diff: "",
++        dispositionsCriteria: "",
++      },
++    });
++    return { result, harness };
++  }
++
++  it("hydrates steps/review with terse concern fields and triage instructions", async () => {
++    const detailSentinel = "DETAIL_SENTINEL_" + "x".repeat(400);
++    await writeConcern(
++      storedConcern({
++        id: "c-aaaaaaaaaa",
++        kind: "risk",
++        severity: "high",
++        summary: "Retry loop can spin forever",
++        detail: detailSentinel,
++        affects: ["item-a", "wave-2"],
++      })
++    );
++
++    const { result, harness } = await runReview({
++      item: "item-a",
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    expect(result.ok).toBe(true);
++
++    const prompt = (harness.calls[0] as any).run.prompt as string;
++    expect(prompt).toContain("c-aaaaaaaaaa");
++    expect(prompt).toContain("Retry loop can spin forever");
++    expect(prompt).toContain("risk");
++    expect(prompt).toContain("high");
++    expect(prompt).toContain("item-a");
++    expect(prompt).toContain("wave-2");
++    expect(prompt).not.toContain("DETAIL_SENTINEL");
++    expect(prompt).toMatch(/dismiss[^\n]*(detail|reason)/i);
++    expect(prompt).toMatch(/condens|shorter|less detail/i);
++  });
++
++  it("partitions exact-id triage from findings and flags fix once", () => {
++    const suggestions: ReviewSuggestion[] = [
++      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Duplicate" },
++      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
++      { id: "c-cccccccccc", disposition: "fix", summary: "Fix one" },
++      { id: "c-dddddddddd", disposition: "fix", summary: "Fix two" },
++      { id: "s-1", disposition: "fix", summary: "Ordinary finding" },
++    ];
++    const ids = ["c-aaaaaaaaaa", "rm-bbbbbbbbbb", "c-cccccccccc", "c-dddddddddd"];
++
++    const reviewer = partitionReviewSuggestions(suggestions, ids, true);
++    expect(reviewer.triage.map((s) => s.id)).toEqual([
++      "c-aaaaaaaaaa",
++      "rm-bbbbbbbbbb",
++      "c-cccccccccc",
++      "c-dddddddddd",
++    ]);
++    expect(reviewer.findings.map((s) => s.id)).toEqual(["s-1"]);
++    expect(reviewer.fixRequired).toBe(true);
++
++    const dismissOnly = partitionReviewSuggestions(
++      [{ id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Duplicate" }],
++      ids,
++      true
++    );
++    expect(dismissOnly.fixRequired).toBe(false);
++
++    const qa = partitionReviewSuggestions(suggestions, ids, false);
++    expect(qa.triage).toEqual([]);
++    expect(qa.findings.map((s) => s.id)).toEqual(suggestions.map((s) => s.id));
++    expect(qa.fixRequired).toBe(false);
++  });
++
++  it("renders condensing concern YAML without detail and within the byte cap", () => {
++    const concerns = [
++      storedConcern({
++        id: "c-aaaaaaaaaa",
++        kind: "tech-debt",
++        severity: "high",
++        summary: "Duplicated helpers",
++        detail: "d".repeat(600),
++        affects: ["wave-2"],
++      }),
++      storedConcern({
++        id: "c-bbbbbbbbbb",
++        kind: "blocker",
++        severity: "low",
++        summary: "Missing dependency",
++        detail: "e".repeat(600),
++      }),
++    ];
++
++    const rendered = renderConcernsYaml(concerns);
++    const parsed = yaml.parse(rendered);
++    expect(Array.isArray(parsed)).toBe(true);
++    expect(parsed).toHaveLength(2);
++    expect(parsed[0]).toMatchObject({
++      id: "c-aaaaaaaaaa",
++      kind: "tech-debt",
++      severity: "high",
++      summary: "Duplicated helpers",
++      affects: ["wave-2"],
++    });
++    expect(parsed[0]).not.toHaveProperty("detail");
++    expect(parsed[1]).toMatchObject({
++      id: "c-bbbbbbbbbb",
++      kind: "blocker",
++      severity: "low",
++      summary: "Missing dependency",
++    });
++    expect(Buffer.byteLength(rendered, "utf8")).toBeLessThan(
++      Buffer.byteLength(JSON.stringify(concerns), "utf8")
++    );
++
++    const capped = renderConcernsYaml(concerns, 120);
++    expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
++    expect(capped).not.toContain("\uFFFD");
++  });
++
++  it("dismisses a concern with its reason and routes nothing", async () => {
++    const cid = "c-aaaaaaaaaa";
++    await writeConcern(storedConcern({ id: cid }));
++
++    const outcome = await applyReviewTriage({
++      taskDir,
++      taskWt,
++      repo,
++      item: "item-a",
++      isTriager: true,
++      concernIds: [cid],
++      suggestions: [
++        {
++          id: cid,
++          disposition: "dismiss",
++          summary: "Duplicate",
++          detail: "covered by ADR-1",
++        },
++      ],
++    });
++
++    expect(outcome.triage.map((s) => s.id)).toEqual([cid]);
++    expect(outcome.dismissed.map((s) => s.id)).toEqual([cid]);
++    expect(outcome.routed).toEqual([]);
++    expect(outcome.fixRequired).toBe(false);
++    expect(outcome.mailboxIds).toEqual([]);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${cid}.yaml`)
++    );
++    expect(stored.status).toBe("dismissed");
++    expect(stored.dismissReason).toBe("covered by ADR-1");
++    expect(isDebtConcern(stored)).toBe(false);
++    expect(mailboxFiles()).toEqual([]);
++  });
++
++  it("persists routed dispositions and applies the debt predicate without a tech-debt disposition", async () => {
++    const architectCid = "c-bbbbbbbbbb";
++    const debtCid = "c-cccccccccc";
++    await writeConcern(storedConcern({ id: architectCid, kind: "risk" }));
++    await writeConcern(storedConcern({ id: debtCid, kind: "risk" }));
++
++    const outcome = await applyReviewTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      concernIds: [architectCid, debtCid],
++      suggestions: [
++        { id: architectCid, disposition: "architect", summary: "Needs a decision" },
++        { id: debtCid, disposition: "optional", summary: "Polish later" },
++      ],
++    });
++
++    expect(outcome.routed.map((s) => s.id).sort()).toEqual([architectCid, debtCid].sort());
++    expect(outcome.dismissed).toEqual([]);
++    expect(outcome.fixRequired).toBe(false);
++    expect(outcome.mailboxIds).toEqual([]);
++
++    const architect = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${architectCid}.yaml`)
++    );
++    expect(architect.status).toBe("routed");
++    expect(architect.disposition).toBe("architect");
++    expect(isDebtConcern(architect)).toBe(false);
++
++    const debt = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${debtCid}.yaml`)
++    );
++    expect(debt.status).toBe("routed");
++    expect(debt.disposition).toBe("optional");
++    expect(isDebtConcern(debt)).toBe(true);
++
++    expect(isDebtConcern({ kind: "tech-debt", status: "routed" })).toBe(true);
++    expect(isDebtConcern({ kind: "tech-debt", status: "resolved" })).toBe(true);
++    expect(isDebtConcern({ kind: "tech-debt", status: "open" })).toBe(false);
++    expect(isDebtConcern({ kind: "risk", status: "routed", disposition: "optional" })).toBe(true);
++    expect(isDebtConcern({ kind: "risk", status: "open", disposition: "optional" })).toBe(false);
++    expect(
++      isDebtConcern({ kind: "risk", status: "routed", disposition: "tech-debt" as never })
++    ).toBe(false);
++    expect(resolveReviewAllowed(pipeline, "reviewer", true)).not.toContain("tech-debt");
++  });
++
++  it("returns fixRequired once for fix-on-concern and keeps it in the fix loop", async () => {
++    const cidOne = "c-dddddddddd";
++    const cidTwo = "c-eeeeeeeeee";
++    await writeConcern(storedConcern({ id: cidOne }));
++    await writeConcern(storedConcern({ id: cidTwo }));
++
++    const { result, harness } = await runReview({
++      item: "item-a",
++      data: {
++        status: "changes_requested",
++        summary: "Concerning retry paths",
++        suggestions: [
++          { id: cidOne, disposition: "fix", summary: "Fix retry one" },
++          { id: cidTwo, disposition: "fix", summary: "Fix retry two" },
++        ],
++      },
++    });
++    expect(result.ok).toBe(true);
++
++    const triage = (result as unknown as { triage?: ReviewTriageOutcome }).triage;
++    expect(triage).toBeDefined();
++    expect(triage!.fixRequired).toBe(true);
++    expect(triage!.triage.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
++    expect(triage!.routed.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
++
++    for (const cid of [cidOne, cidTwo]) {
++      const stored = await readYaml<StoredConcernArtifact>(
++        path.join(taskDir, "concerns", `${cid}.yaml`)
++      );
++      expect(stored.status).toBe("routed");
++      expect(stored.disposition).toBe("fix");
++    }
++
++    // Kept in the canonical review output so the normal fix loop runs once.
++    const output = result.output as { suggestions?: ReviewSuggestion[] };
++    expect(output.suggestions?.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
++    expect(harness.calls.filter((c) => c.type === "run")).toHaveLength(1);
++  });
++
++  it("writes one deduped q-concern mailbox entry for human-async triage", async () => {
++    const cid = "c-ffffffffff";
++    await writeConcern(storedConcern({ id: cid, kind: "question" }));
++
++    const ctx = {
++      taskDir,
++      taskWt,
++      repo,
++      item: "item-a",
++      isTriager: true,
++      concernIds: [cid],
++      suggestions: [
++        {
++          id: cid,
++          disposition: "human-async",
++          summary: "Which retry strategy?",
++          detail: "Choose a retry strategy before continuing",
++        },
++      ],
++    };
++
++    const first = await applyReviewTriage(ctx);
++    expect(first.mailboxIds).toEqual([concernMailboxId(cid)]);
++    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
++
++    const question = await readYaml<Record<string, any>>(
++      path.join(taskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
++    );
++    expect(question.id).toBe(`q-concern-${cid}`);
++    expect(question.disposition).toBe("human-async");
++    expect(question.ref).toBe("item-a");
++    expect(question.status).toBe("open");
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${cid}.yaml`)
++    );
++    expect(stored.status).toBe("routed");
++    expect(stored.disposition).toBe("human-async");
++
++    // A re-run of the same review must not duplicate the mailbox entry.
++    await applyReviewTriage(ctx);
++    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
++  });
++
++  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
++    const cid = "c-9999999999";
++    await writeConcern(storedConcern({ id: cid }));
++
++    await expect(
++      applyReviewTriage({
++        taskDir,
++        taskWt,
++        repo,
++        isTriager: true,
++        concernIds: [cid],
++        suggestions: [{ id: cid, disposition: "dismiss", summary: "No reason" }],
++      })
++    ).rejects.toThrow(/detail/i);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${cid}.yaml`)
++    );
++    expect(stored.status).toBe("open");
++    expect(stored.dismissReason).toBeUndefined();
++    expect(mailboxFiles()).toEqual([]);
++  });
++
++  it("fails the review step when a dismiss triage lacks detail", async () => {
++    const cid = "c-8888888888";
++    const concernPath = await writeConcern(storedConcern({ id: cid }));
++
++    const { result } = await runReview({
++      item: "item-a",
++      data: {
++        status: "changes_requested",
++        summary: "Dismiss without a reason",
++        suggestions: [{ id: cid, disposition: "dismiss", summary: "No reason" }],
++      },
++    });
++
++    expect(result.ok).toBe(false);
++    expect(result.status).toBe("error");
++    expect(result.meta.error ?? "").toMatch(/detail/i);
++    const stored = await readYaml<StoredConcernArtifact>(concernPath);
++    expect(stored.status).toBe("open");
++    expect(stored.dismissReason).toBeUndefined();
++    expect(mailboxFiles()).toEqual([]);
++  });
++
++  it("gates non-triagers: QA matching a concern id is a no-op", async () => {
++    const cid = "c-7777777777";
++    await writeConcern(storedConcern({ id: cid }));
++
++    const { result } = await runReview({
++      item: "item-a",
++      agent: "qa",
++      stepId: "qa",
++      data: {
++        status: "approved",
++        summary: "QA pass",
++        suggestions: [{ id: cid, disposition: "fix", summary: "Ordinary QA finding" }],
++      },
++    });
++    expect(result.ok).toBe(true);
++
++    const triage = (result as unknown as { triage?: ReviewTriageOutcome }).triage;
++    expect(triage).toBeDefined();
++    expect(triage!.triage).toEqual([]);
++    expect(triage!.findings.map((s) => s.id)).toEqual([cid]);
++    expect(triage!.fixRequired).toBe(false);
++    expect(triage!.mailboxIds).toEqual([]);
++
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${cid}.yaml`)
++    );
++    expect(stored.status).toBe("open");
++    expect(stored.disposition).toBeUndefined();
++    expect(mailboxFiles()).toEqual([]);
++  });
++
++  it("blocks the item with a single q-concern mailbox entry in the engine flow", async () => {
++    const task = "triage-flow";
++    const flowTaskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(flowTaskDir, { recursive: true });
++    fs.writeFileSync(path.join(flowTaskDir, "INTENT.md"), "Reviewer triage flow\n", "utf8");
++    tmpRepo.commit("add triage flow intent");
++
++    const flowWtRoot = path.join(tmpRepo.dir + "-flow-wt");
++    fs.mkdirSync(flowWtRoot, { recursive: true });
++    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: flowWtRoot });
++    const flowProject: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot: flowWtRoot };
++    const flowPipeline: PipelineConfig = {
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
++        triage: { role: "workhorse" },
++        infra: { role: "workhorse" },
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++        developer: { role: "workhorse" },
++        reviewer: { role: "alt-workhorse" },
++        "wave-close-up": { role: "alt-workhorse" },
++      },
++      flows: {
++        simple: { steps: [] },
++        story: {
++          dev: {
++            fixLoopTo: "develop",
++            steps: [
++              { id: "develop", agent: "developer", role: "workhorse" },
++              { id: "review", agent: "reviewer", role: "alt-workhorse" },
++            ],
++          },
++        },
++        spike: {},
++      },
++      limits: { maxParallelItems: 2, maxParallelTurns: 4, maxStepAttempts: 3, maxFixRounds: 3 },
++    };
++    const flowPrompts = loadPromptLibrary({
++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
++      overrideDirs: [],
++    });
++    const harness = new FakeHarness();
++    harness.scriptOutcome(`${task}/runs/triage#a1`, {
++      ok: true,
++      data: { kind: "story", rationale: "Triage flow", citations: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/infra#a1`, {
++      ok: true,
++      data: {
++        setup: [],
++        gates: [{ id: "test", command: "true" }],
++        testRunner: { command: "true" },
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
++      ok: true,
++      data: {
++        iteration: 1,
++        milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
++        itemOutlines: [
++          { slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1", deps: [] },
++        ],
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: {
++        iteration: 1,
++        items: [
++          {
++            slug: "item-1",
++            outlineRef: "item-1",
++            kind: "dev",
++            title: "Item 1",
++            assignment: "Implement item 1",
++            milestone: "m1",
++            wave: 1,
++            deps: [],
++          },
++        ],
++      },
++    });
++
++    const concernSummary = "Retry loop can spin";
++    const cid = concernFingerprint({ kind: "risk", summary: concernSummary });
++    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
++      fs.writeFileSync(path.join(run.cwd, "feature.ts"), "export const x = 1;\n");
++      return {
++        ok: true,
++        data: {
++          status: "ok",
++          summary: "Developed",
++          concerns: [{ kind: "risk", summary: concernSummary, detail: "long detail" }],
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
++      ok: true,
++      data: {
++        status: "changes_requested",
++        summary: "Need a human decision",
++        suggestions: [
++          {
++            id: cid,
++            disposition: "human-async",
++            summary: "Which retry strategy?",
++            detail: "Choose a retry strategy",
++          },
++        ],
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
++      ok: true,
++      data: {
++        id: "dec-wave-1",
++        context: "wave",
++        decision: "continue",
++        timestamp: new Date().toISOString(),
++      },
++    });
++
++    const res = await runTask(
++      {
++        harness,
++        repo: repoObj,
++        project: flowProject,
++        pipelineFor: async () => flowPipeline,
++        prompts: flowPrompts,
++      },
++      task,
++      { maxTicks: 25 }
++    );
++
++    expect(res.status).toBe("blocked");
++    expect(res.exitCode).toBe(10);
++
++    const flowWt = path.join(flowWtRoot, `topic_${task}`);
++    const deployedTaskDir = path.join(flowWt, ORCH, task);
++    const mailDir = path.join(deployedTaskDir, "steer", "tousertoreview");
++    const mails = fs.readdirSync(mailDir).filter((n) => n.endsWith(".yaml")).sort();
++    expect(mails).toEqual([`q-concern-${cid}.yaml`]);
++
++    const question = await readYaml<Record<string, any>>(path.join(mailDir, mails[0]!));
++    expect(question.id).toBe(`q-concern-${cid}`);
++    expect(question.ref).toBe("item-1");
++
++    const concern = await readYaml<StoredConcernArtifact>(
++      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
++    );
++    expect(concern.status).toBe("routed");
++    expect(concern.disposition).toBe("human-async");
++  });
++});
+diff --git a/plugins/software-factory/test/smoke-fixes.test.ts b/plugins/software-factory/test/smoke-fixes.test.ts
+index cb903e0..d282558 100644
+--- a/plugins/software-factory/test/smoke-fixes.test.ts
++++ b/plugins/software-factory/test/smoke-fixes.test.ts
+@@ -87,6 +87,7 @@ describe("Smoke fixes acceptance tests (§6.4, §7, §8, §9)", () => {
+         checks: "sample checks",
+         diff: "sample diff",
+         dispositionsCriteria: "sample dispositions",
++        concernsYaml: "",
+       },
+       reviewSchema
+     );
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
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..d0d6855
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T09:16:58.400Z
+session: 01a1ba72-6a65-721c-b201-0a3dd19ead2c
+endedAt: 2026-11-08T09:30:47.652Z
+usage:
+  inputTokens: 48781
+  outputTokens: 23387
+  costUsd: 0.010543
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T09-17-02-949Z_01a1ba72-6a65-721c-b201-0a3dd19ead2c
diff --git a/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..ed214f6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/reviewer-triage-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,16 @@
+status: approved
+summary: 11 triage tests green, full suite 346/0, typecheck pass; no weakening,
+  red->green consistent
+suggestions:
+  - id: condensing-full-without-affects-skipped
+    disposition: optional
+    summary: renderConcernsYaml skips full-without-affects variant, may shed entry
+      unnecessarily
+    detail: "triedFull guard skips variant[1] count==len even though dropping
+      affects changes bytes; when full-with-affects exceeds cap but
+      full-without-affects would fit, code sheds trailing entry instead. Still
+      meets byte cap/valid YAML, so non-blocking polish: key guard by serialized
+      content or affects-presence."
+    location:
+      file: plugins/software-factory/src/core/triage.ts
+      line: 100
diff --git a/plugins/software-factory/agents/steps/review.md b/plugins/software-factory/agents/steps/review.md
index f5f9b31..f36a1fe 100644
--- a/plugins/software-factory/agents/steps/review.md
+++ b/plugins/software-factory/agents/steps/review.md
@@ -15,6 +15,13 @@ Conduct adversarial peer code review on completed changes, evaluating implementa
 ## Dispositions Criteria
 {{dispositionsCriteria}}
 
+## Open Concerns
+{{concernsYaml}}
+
+- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
+- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
+- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
+
 ## Assignment
 {{assignment}}
 
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index c1e8f80..e7b3f37 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -110,7 +110,7 @@ export async function listOpenConcerns(taskDir: string): Promise<StoredConcernAr
   const dir = dirOf(taskDir);
   let names: string[];
   try { names = await fs.promises.readdir(dir); } catch (err: any) {
-    if (err?.code === "ENOENT") return [];
+    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
     throw err;
   }
   const records = await Promise.all(names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).map(async (name) => {
diff --git a/plugins/software-factory/src/core/flows/item-machine.ts b/plugins/software-factory/src/core/flows/item-machine.ts
index 263d64e..a5955a1 100644
--- a/plugins/software-factory/src/core/flows/item-machine.ts
+++ b/plugins/software-factory/src/core/flows/item-machine.ts
@@ -707,10 +707,21 @@ export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMac
     beforeChecks,
     afterChecks,
     writeArtifact: async (output: unknown) => {
-      // Persist human-async questions atomically with the review record (Finding 23)
+      // Persist human-async questions atomically with the review record (Finding 23).
+      // Concern ids are triaged separately (q-concern-*) and never use this mailbox.
       if (output && typeof output === "object" && "suggestions" in (output as any)) {
         const rev = output as ReviewArtifact;
-        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
+        const concernIds = new Set<string>();
+        try {
+          for (const name of await fs.promises.readdir(path.join(taskDir, "concerns"))) {
+            if (name.endsWith(".yaml")) concernIds.add(name.slice(0, -5));
+          }
+        } catch (err: any) {
+          if (err?.code !== "ENOENT") throw err;
+        }
+        const asyncQuestions = rev.suggestions?.filter(
+          (s) => s.disposition === "human-async" && !concernIds.has(s.id)
+        );
         if (asyncQuestions && asyncQuestions.length > 0) {
           for (const q of asyncQuestions) {
             const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index 272ddef..3b158c4 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -27,9 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
   aggregateConcerns,
   applyCloseupResolutions,
-  applyConcernTriage,
-  partitionSuggestions,
+  listOpenConcerns,
 } from "../concerns.js";
+import {
+  applyReviewTriage,
+  renderConcernsYaml,
+  TriageValidationError,
+  type ReviewTriageOutcome,
+} from "../triage.js";
 import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
 import { captureHead, enforceHead } from "../git/guard.js";
 import { commitAll } from "../git/commit.js";
@@ -87,6 +92,7 @@ export interface StepRunResult {
   usage?: Usage;
   branchChanged?: boolean;
   headMoved?: boolean;
+  triage?: ReviewTriageOutcome;
 }
 
 /**
@@ -178,13 +184,13 @@ function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: s
 async function ingestStepConcerns(opts: {
   taskDir: string; taskWt: string; repo: any; output: unknown;
   source: { record: string; agent: string; step: string; item?: string; iteration?: number };
-}): Promise<void> {
+}): Promise<ReviewTriageOutcome | undefined> {
   const data = (opts.output ?? {}) as Record<string, any>;
   const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
   const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
   const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
   const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
-  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return;
+  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return undefined;
 
   // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
   let existing: string[] = [];
@@ -196,9 +202,17 @@ async function ingestStepConcerns(opts: {
   }
   const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
   if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
-  const { triage } = partitionSuggestions(suggestions, existing);
-  if (triage.length) await applyConcernTriage({ ...ctx, suggestions: triage, isTriager: isTriagerAgent(opts.source.agent) });
+  const triage = suggestions.length > 0
+    ? await applyReviewTriage({
+        ...ctx,
+        suggestions,
+        concernIds: existing,
+        isTriager: isTriagerAgent(opts.source.agent),
+        ...(opts.source.item ? { item: opts.source.item } : {}),
+      })
+    : undefined;
   if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
+  return triage;
 }
 
 /**
@@ -279,12 +293,16 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
   const fragment = stepFragment ?? `steps/${stepId}`;
   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+  const openConcerns = await listOpenConcerns(taskDir);
+  const concernsYaml = openConcerns.length > 0
+    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
+    : "";
   const effectivePromptVars: Record<string, string> = {
     humanInvolvementCriteria: formatHumanInvolvementCriteria(
       criteriaBundle.humanInvolvement,
       pipeline.humanInvolvement
     ),
-    concernsYaml: "",
+    concernsYaml,
     ...promptVars,
   };
   let promptText: string;
@@ -679,9 +697,10 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
   }
 
   // Producer concerns feed the taskWt store after the canonical artifact write.
+  let triageOutcome: ReviewTriageOutcome | undefined;
   if (finalStatus === "ok") {
     try {
-      await ingestStepConcerns({
+      triageOutcome = await ingestStepConcerns({
         taskDir, taskWt, repo, output: validatedData,
         source: {
           record: dirName, agent, step: stepId,
@@ -690,7 +709,12 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
         },
       });
     } catch (err: any) {
-      try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
+      if (err instanceof TriageValidationError) {
+        finalStatus = "error";
+        validationError = `Review triage failed: ${err.message}`;
+      } else {
+        try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
+      }
     }
   }
 
@@ -752,5 +776,6 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
     usage: totalUsage,
     branchChanged,
     headMoved,
+    ...(triageOutcome ? { triage: triageOutcome } : {}),
   };
 }
diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
new file mode 100644
index 0000000..923a9d1
--- /dev/null
+++ b/plugins/software-factory/src/core/triage.ts
@@ -0,0 +1,169 @@
+import yaml from "yaml";
+import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+import { applyConcernTriage } from "./concerns.js";
+import type { Repo } from "./git/repo.js";
+import { writeQuestion } from "./steer.js";
+
+/** Exact-id reviewer triage over review suggestions (§8.7, §18). */
+export interface TriagePartition {
+  triage: ReviewSuggestion[];
+  findings: ReviewSuggestion[];
+  fixRequired: boolean;
+}
+export interface ReviewTriageOutcome extends TriagePartition {
+  routed: ReviewSuggestion[];
+  dismissed: ReviewSuggestion[];
+  mailboxIds: string[];
+}
+export interface ReviewTriageContext {
+  taskDir: string; taskWt: string; repo: Repo; suggestions: ReviewSuggestion[];
+  concernIds: Iterable<string>; isTriager: boolean; item?: string; now?: () => Date;
+}
+/** Contract violation that must fail the review step instead of being journaled. */
+export class TriageValidationError extends Error {}
+
+/** Splits suggestions into pre-existing concern triage and ordinary findings. */
+export function partitionReviewSuggestions(
+  suggestions: ReviewSuggestion[],
+  concernIds: Iterable<string>,
+  isTriager: boolean
+): TriagePartition {
+  if (!isTriager) {
+    return { triage: [], findings: [...suggestions], fixRequired: false };
+  }
+  const ids = new Set(concernIds);
+  const triage = suggestions.filter((s) => ids.has(s.id));
+  return {
+    triage,
+    findings: suggestions.filter((s) => !ids.has(s.id)),
+    fixRequired: triage.some((s) => s.disposition === "fix"),
+  };
+}
+
+export function concernMailboxId(concernId: string): string {
+  return `q-concern-${concernId}`;
+}
+
+/**
+ * Debt predicate for close-up accounting. Open concerns are still live, so they
+ * are not debt; a non-open `tech-debt` concern or an `optional` disposition is.
+ * There is deliberately no `tech-debt` disposition.
+ */
+export function isDebtConcern(
+  c: Pick<StoredConcernArtifact, "kind" | "status" | "disposition">
+): boolean {
+  if ((c.disposition as string | undefined) === "tech-debt") return false;
+  if (c.status !== "routed" && c.status !== "resolved") return false;
+  return c.kind === "tech-debt" || c.disposition === "optional";
+}
+
+/** Terse hydration shape: never the bulky detail field (§4, §18). */
+function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
+  return {
+    id: c.id,
+    kind: c.kind,
+    severity: c.severity,
+    summary: c.summary,
+    ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
+  };
+}
+
+const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+const serialize = (records: Array<Record<string, unknown>>) =>
+  yaml.stringify(records, { lineWidth: 0 });
+const truncateChars = (text: string, max: number) =>
+  Array.from(text).slice(0, max).join("");
+
+/**
+ * Renders open concerns as terse, byte-capped YAML for prompt hydration.
+ * Detail is dropped; over-budget output condenses summaries, drops affects,
+ * then sheds trailing entries until the UTF-8 byte ceiling is met.
+ */
+export function renderConcernsYaml(
+  concerns: StoredConcernArtifact[],
+  maxBytes = 8000
+): string {
+  const records = concerns.map(terseConcern);
+  const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
+    { records },
+    { records: records.map(({ affects: _affects, ...rest }) => rest) },
+    ...[80, 40, 16, 8, 4, 1].map((summaryLimit) => ({ records, summaryLimit })),
+    ...[80, 40, 16, 8, 4, 1].map((summaryLimit) => ({
+      records: records.map(({ affects: _affects, ...rest }) => rest),
+      summaryLimit,
+    })),
+  ];
+
+  let triedFull = false;
+  for (const variant of variants) {
+    for (let count = variant.records.length; count > 0; count--) {
+      if (variant.summaryLimit === undefined && count === variant.records.length) {
+        if (triedFull) continue;
+        triedFull = true;
+      }
+      const selected = variant.records.slice(0, count).map((r) =>
+        variant.summaryLimit === undefined
+          ? r
+          : { ...r, summary: truncateChars(String(r.summary ?? ""), variant.summaryLimit) }
+      );
+      const text = serialize(selected);
+      if (utf8Bytes(text) <= maxBytes) return text;
+    }
+  }
+  return serialize([]);
+}
+
+/**
+ * Applies exact-id concern triage and reports the partition. Only triagers may
+ * triage; `dismiss` requires detail, and `fix` is reported once while the
+ * suggestion stays in the canonical review output for the fix loop.
+ */
+export async function applyReviewTriage(
+  ctx: ReviewTriageContext
+): Promise<ReviewTriageOutcome> {
+  const partition = partitionReviewSuggestions(
+    ctx.suggestions,
+    ctx.concernIds,
+    ctx.isTriager
+  );
+  if (!ctx.isTriager) {
+    return { ...partition, routed: [], dismissed: [], mailboxIds: [] };
+  }
+
+  for (const s of partition.triage) {
+    if (s.disposition === "dismiss" && !s.detail?.trim()) {
+      throw new TriageValidationError(
+        `Dismiss triage for ${s.id} requires detail (the dismissal reason)`
+      );
+    }
+  }
+
+  if (partition.triage.length > 0) {
+    await applyConcernTriage({
+      taskDir: ctx.taskDir,
+      taskWt: ctx.taskWt,
+      repo: ctx.repo,
+      suggestions: partition.triage,
+      isTriager: true,
+      ...(ctx.now ? { now: ctx.now } : {}),
+    });
+  }
+
+  const dismissed = partition.triage.filter((s) => s.disposition === "dismiss");
+  const routed = partition.triage.filter((s) => s.disposition !== "dismiss");
+  const mailboxIds: string[] = [];
+  for (const s of routed) {
+    if (s.disposition !== "human-async") continue;
+    const id = concernMailboxId(s.id);
+    await writeQuestion(ctx.taskWt, ctx.taskDir, {
+      id,
+      ref: ctx.item ?? s.id,
+      disposition: "human-async",
+      question: s.detail?.trim() || s.summary,
+      ...(ctx.item ? { blocks: [ctx.item] } : {}),
+    });
+    mailboxIds.push(id);
+  }
+
+  return { ...partition, routed, dismissed, mailboxIds };
+}
diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
new file mode 100644
index 0000000..fb7cc9b
--- /dev/null
+++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
@@ -0,0 +1,688 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import yaml from "yaml";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runAgentStep } from "../../src/core/flows/step-runner.js";
+import { runTask } from "../../src/core/engine.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import { concernFingerprint } from "../../src/core/concerns.js";
+import { resolveReviewAllowed } from "../../src/core/review-policy.js";
+import {
+  applyReviewTriage,
+  concernMailboxId,
+  isDebtConcern,
+  partitionReviewSuggestions,
+  renderConcernsYaml,
+  type ReviewTriageOutcome,
+} from "../../src/core/triage.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  ReviewSuggestion,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Item reviewer triage (docs/factory.v2.md §18; ADRs
+ * adr-triage-suggestions-dismiss, adr-concern-store-taskwt, adr-funnel-text-budget).
+ *
+ * The workhorse reviewer sees terse open concerns, triages them by exact id
+ * (`c-*` / `rm-*`) with the review vocabulary plus `dismiss`, and those ids are
+ * excluded from the normal fix-loop/approval/mailbox paths. The one exception is
+ * `fix` on a concern, which reports a single `fixRequired`; human-async writes a
+ * deduped `q-concern-<cid>` mailbox entry. QA is not a triager.
+ */
+describe("Reviewer triage (§8.7, §18)", () => {
+  const ORCH = ".factory";
+  const TASK = "reviewer-triage";
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
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Reviewer triage\n", "utf8");
+    tmpRepo.commit("add reviewer triage task");
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
+        qa: { role: "alt-workhorse" },
+        reviewer: { role: "alt-workhorse" },
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
+  async function writeConcern(concern: StoredConcernArtifact): Promise<string> {
+    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
+    await writeYamlAtomic(file, concern);
+    return file;
+  }
+
+  function mailboxFiles(): string[] {
+    const dir = path.join(taskDir, "steer", "tousertoreview");
+    if (!fs.existsSync(dir)) return [];
+    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
+  }
+
+  async function runReview(opts: {
+    item?: string;
+    agent?: string;
+    stepId?: string;
+    stepFragment?: string;
+    data: unknown;
+  }) {
+    const agent = opts.agent ?? "reviewer";
+    const stepId = opts.stepId ?? "review";
+    const stepFragment = opts.stepFragment ?? `steps/${stepId}`;
+    const harness = new FakeHarness();
+    const label = opts.item
+      ? `${TASK}/items/${opts.item}/${stepId}#a1`
+      : `${TASK}/runs/${stepId}#a1`;
+    harness.scriptOutcome(label, { ok: true, data: opts.data });
+    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
+    harness.scriptComplete(() => opts.data);
+    const recordsDir = path.join(taskDir, opts.item ? `items/${opts.item}/steps` : "runs");
+    fs.mkdirSync(recordsDir, { recursive: true });
+
+    const result = await runAgentStep({
+      task: TASK,
+      item: opts.item,
+      stepId,
+      stepFragment,
+      agent,
+      cwd: taskWt,
+      taskWt,
+      taskDir,
+      recordsDir,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: {
+        assignment: "Review the item",
+        checks: "",
+        testDiff: "",
+        diff: "",
+        dispositionsCriteria: "",
+      },
+    });
+    return { result, harness };
+  }
+
+  it("hydrates steps/review with terse concern fields and triage instructions", async () => {
+    const detailSentinel = "DETAIL_SENTINEL_" + "x".repeat(400);
+    await writeConcern(
+      storedConcern({
+        id: "c-aaaaaaaaaa",
+        kind: "risk",
+        severity: "high",
+        summary: "Retry loop can spin forever",
+        detail: detailSentinel,
+        affects: ["item-a", "wave-2"],
+      })
+    );
+
+    const { result, harness } = await runReview({
+      item: "item-a",
+      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+    });
+    expect(result.ok).toBe(true);
+
+    const prompt = (harness.calls[0] as any).run.prompt as string;
+    expect(prompt).toContain("c-aaaaaaaaaa");
+    expect(prompt).toContain("Retry loop can spin forever");
+    expect(prompt).toContain("risk");
+    expect(prompt).toContain("high");
+    expect(prompt).toContain("item-a");
+    expect(prompt).toContain("wave-2");
+    expect(prompt).not.toContain("DETAIL_SENTINEL");
+    expect(prompt).toMatch(/dismiss[^\n]*(detail|reason)/i);
+    expect(prompt).toMatch(/condens|shorter|less detail/i);
+  });
+
+  it("partitions exact-id triage from findings and flags fix once", () => {
+    const suggestions: ReviewSuggestion[] = [
+      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Duplicate" },
+      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
+      { id: "c-cccccccccc", disposition: "fix", summary: "Fix one" },
+      { id: "c-dddddddddd", disposition: "fix", summary: "Fix two" },
+      { id: "s-1", disposition: "fix", summary: "Ordinary finding" },
+    ];
+    const ids = ["c-aaaaaaaaaa", "rm-bbbbbbbbbb", "c-cccccccccc", "c-dddddddddd"];
+
+    const reviewer = partitionReviewSuggestions(suggestions, ids, true);
+    expect(reviewer.triage.map((s) => s.id)).toEqual([
+      "c-aaaaaaaaaa",
+      "rm-bbbbbbbbbb",
+      "c-cccccccccc",
+      "c-dddddddddd",
+    ]);
+    expect(reviewer.findings.map((s) => s.id)).toEqual(["s-1"]);
+    expect(reviewer.fixRequired).toBe(true);
+
+    const dismissOnly = partitionReviewSuggestions(
+      [{ id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Duplicate" }],
+      ids,
+      true
+    );
+    expect(dismissOnly.fixRequired).toBe(false);
+
+    const qa = partitionReviewSuggestions(suggestions, ids, false);
+    expect(qa.triage).toEqual([]);
+    expect(qa.findings.map((s) => s.id)).toEqual(suggestions.map((s) => s.id));
+    expect(qa.fixRequired).toBe(false);
+  });
+
+  it("renders condensing concern YAML without detail and within the byte cap", () => {
+    const concerns = [
+      storedConcern({
+        id: "c-aaaaaaaaaa",
+        kind: "tech-debt",
+        severity: "high",
+        summary: "Duplicated helpers",
+        detail: "d".repeat(600),
+        affects: ["wave-2"],
+      }),
+      storedConcern({
+        id: "c-bbbbbbbbbb",
+        kind: "blocker",
+        severity: "low",
+        summary: "Missing dependency",
+        detail: "e".repeat(600),
+      }),
+    ];
+
+    const rendered = renderConcernsYaml(concerns);
+    const parsed = yaml.parse(rendered);
+    expect(Array.isArray(parsed)).toBe(true);
+    expect(parsed).toHaveLength(2);
+    expect(parsed[0]).toMatchObject({
+      id: "c-aaaaaaaaaa",
+      kind: "tech-debt",
+      severity: "high",
+      summary: "Duplicated helpers",
+      affects: ["wave-2"],
+    });
+    expect(parsed[0]).not.toHaveProperty("detail");
+    expect(parsed[1]).toMatchObject({
+      id: "c-bbbbbbbbbb",
+      kind: "blocker",
+      severity: "low",
+      summary: "Missing dependency",
+    });
+    expect(Buffer.byteLength(rendered, "utf8")).toBeLessThan(
+      Buffer.byteLength(JSON.stringify(concerns), "utf8")
+    );
+
+    const capped = renderConcernsYaml(concerns, 120);
+    expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
+    expect(capped).not.toContain("\uFFFD");
+  });
+
+  it("dismisses a concern with its reason and routes nothing", async () => {
+    const cid = "c-aaaaaaaaaa";
+    await writeConcern(storedConcern({ id: cid }));
+
+    const outcome = await applyReviewTriage({
+      taskDir,
+      taskWt,
+      repo,
+      item: "item-a",
+      isTriager: true,
+      concernIds: [cid],
+      suggestions: [
+        {
+          id: cid,
+          disposition: "dismiss",
+          summary: "Duplicate",
+          detail: "covered by ADR-1",
+        },
+      ],
+    });
+
+    expect(outcome.triage.map((s) => s.id)).toEqual([cid]);
+    expect(outcome.dismissed.map((s) => s.id)).toEqual([cid]);
+    expect(outcome.routed).toEqual([]);
+    expect(outcome.fixRequired).toBe(false);
+    expect(outcome.mailboxIds).toEqual([]);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("dismissed");
+    expect(stored.dismissReason).toBe("covered by ADR-1");
+    expect(isDebtConcern(stored)).toBe(false);
+    expect(mailboxFiles()).toEqual([]);
+  });
+
+  it("persists routed dispositions and applies the debt predicate without a tech-debt disposition", async () => {
+    const architectCid = "c-bbbbbbbbbb";
+    const debtCid = "c-cccccccccc";
+    await writeConcern(storedConcern({ id: architectCid, kind: "risk" }));
+    await writeConcern(storedConcern({ id: debtCid, kind: "risk" }));
+
+    const outcome = await applyReviewTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: true,
+      concernIds: [architectCid, debtCid],
+      suggestions: [
+        { id: architectCid, disposition: "architect", summary: "Needs a decision" },
+        { id: debtCid, disposition: "optional", summary: "Polish later" },
+      ],
+    });
+
+    expect(outcome.routed.map((s) => s.id).sort()).toEqual([architectCid, debtCid].sort());
+    expect(outcome.dismissed).toEqual([]);
+    expect(outcome.fixRequired).toBe(false);
+    expect(outcome.mailboxIds).toEqual([]);
+
+    const architect = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${architectCid}.yaml`)
+    );
+    expect(architect.status).toBe("routed");
+    expect(architect.disposition).toBe("architect");
+    expect(isDebtConcern(architect)).toBe(false);
+
+    const debt = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${debtCid}.yaml`)
+    );
+    expect(debt.status).toBe("routed");
+    expect(debt.disposition).toBe("optional");
+    expect(isDebtConcern(debt)).toBe(true);
+
+    expect(isDebtConcern({ kind: "tech-debt", status: "routed" })).toBe(true);
+    expect(isDebtConcern({ kind: "tech-debt", status: "resolved" })).toBe(true);
+    expect(isDebtConcern({ kind: "tech-debt", status: "open" })).toBe(false);
+    expect(isDebtConcern({ kind: "risk", status: "routed", disposition: "optional" })).toBe(true);
+    expect(isDebtConcern({ kind: "risk", status: "open", disposition: "optional" })).toBe(false);
+    expect(
+      isDebtConcern({ kind: "risk", status: "routed", disposition: "tech-debt" as never })
+    ).toBe(false);
+    expect(resolveReviewAllowed(pipeline, "reviewer", true)).not.toContain("tech-debt");
+  });
+
+  it("returns fixRequired once for fix-on-concern and keeps it in the fix loop", async () => {
+    const cidOne = "c-dddddddddd";
+    const cidTwo = "c-eeeeeeeeee";
+    await writeConcern(storedConcern({ id: cidOne }));
+    await writeConcern(storedConcern({ id: cidTwo }));
+
+    const { result, harness } = await runReview({
+      item: "item-a",
+      data: {
+        status: "changes_requested",
+        summary: "Concerning retry paths",
+        suggestions: [
+          { id: cidOne, disposition: "fix", summary: "Fix retry one" },
+          { id: cidTwo, disposition: "fix", summary: "Fix retry two" },
+        ],
+      },
+    });
+    expect(result.ok).toBe(true);
+
+    const triage = (result as unknown as { triage?: ReviewTriageOutcome }).triage;
+    expect(triage).toBeDefined();
+    expect(triage!.fixRequired).toBe(true);
+    expect(triage!.triage.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
+    expect(triage!.routed.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
+
+    for (const cid of [cidOne, cidTwo]) {
+      const stored = await readYaml<StoredConcernArtifact>(
+        path.join(taskDir, "concerns", `${cid}.yaml`)
+      );
+      expect(stored.status).toBe("routed");
+      expect(stored.disposition).toBe("fix");
+    }
+
+    // Kept in the canonical review output so the normal fix loop runs once.
+    const output = result.output as { suggestions?: ReviewSuggestion[] };
+    expect(output.suggestions?.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
+    expect(harness.calls.filter((c) => c.type === "run")).toHaveLength(1);
+  });
+
+  it("writes one deduped q-concern mailbox entry for human-async triage", async () => {
+    const cid = "c-ffffffffff";
+    await writeConcern(storedConcern({ id: cid, kind: "question" }));
+
+    const ctx = {
+      taskDir,
+      taskWt,
+      repo,
+      item: "item-a",
+      isTriager: true,
+      concernIds: [cid],
+      suggestions: [
+        {
+          id: cid,
+          disposition: "human-async",
+          summary: "Which retry strategy?",
+          detail: "Choose a retry strategy before continuing",
+        },
+      ],
+    };
+
+    const first = await applyReviewTriage(ctx);
+    expect(first.mailboxIds).toEqual([concernMailboxId(cid)]);
+    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
+
+    const question = await readYaml<Record<string, any>>(
+      path.join(taskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
+    );
+    expect(question.id).toBe(`q-concern-${cid}`);
+    expect(question.disposition).toBe("human-async");
+    expect(question.ref).toBe("item-a");
+    expect(question.status).toBe("open");
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("routed");
+    expect(stored.disposition).toBe("human-async");
+
+    // A re-run of the same review must not duplicate the mailbox entry.
+    await applyReviewTriage(ctx);
+    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
+  });
+
+  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
+    const cid = "c-9999999999";
+    await writeConcern(storedConcern({ id: cid }));
+
+    await expect(
+      applyReviewTriage({
+        taskDir,
+        taskWt,
+        repo,
+        isTriager: true,
+        concernIds: [cid],
+        suggestions: [{ id: cid, disposition: "dismiss", summary: "No reason" }],
+      })
+    ).rejects.toThrow(/detail/i);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("open");
+    expect(stored.dismissReason).toBeUndefined();
+    expect(mailboxFiles()).toEqual([]);
+  });
+
+  it("fails the review step when a dismiss triage lacks detail", async () => {
+    const cid = "c-8888888888";
+    const concernPath = await writeConcern(storedConcern({ id: cid }));
+
+    const { result } = await runReview({
+      item: "item-a",
+      data: {
+        status: "changes_requested",
+        summary: "Dismiss without a reason",
+        suggestions: [{ id: cid, disposition: "dismiss", summary: "No reason" }],
+      },
+    });
+
+    expect(result.ok).toBe(false);
+    expect(result.status).toBe("error");
+    expect(result.meta.error ?? "").toMatch(/detail/i);
+    const stored = await readYaml<StoredConcernArtifact>(concernPath);
+    expect(stored.status).toBe("open");
+    expect(stored.dismissReason).toBeUndefined();
+    expect(mailboxFiles()).toEqual([]);
+  });
+
+  it("gates non-triagers: QA matching a concern id is a no-op", async () => {
+    const cid = "c-7777777777";
+    await writeConcern(storedConcern({ id: cid }));
+
+    const { result } = await runReview({
+      item: "item-a",
+      agent: "qa",
+      stepId: "qa",
+      data: {
+        status: "approved",
+        summary: "QA pass",
+        suggestions: [{ id: cid, disposition: "fix", summary: "Ordinary QA finding" }],
+      },
+    });
+    expect(result.ok).toBe(true);
+
+    const triage = (result as unknown as { triage?: ReviewTriageOutcome }).triage;
+    expect(triage).toBeDefined();
+    expect(triage!.triage).toEqual([]);
+    expect(triage!.findings.map((s) => s.id)).toEqual([cid]);
+    expect(triage!.fixRequired).toBe(false);
+    expect(triage!.mailboxIds).toEqual([]);
+
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(stored.status).toBe("open");
+    expect(stored.disposition).toBeUndefined();
+    expect(mailboxFiles()).toEqual([]);
+  });
+
+  it("blocks the item with a single q-concern mailbox entry in the engine flow", async () => {
+    const task = "triage-flow";
+    const flowTaskDir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(flowTaskDir, { recursive: true });
+    fs.writeFileSync(path.join(flowTaskDir, "INTENT.md"), "Reviewer triage flow\n", "utf8");
+    tmpRepo.commit("add triage flow intent");
+
+    const flowWtRoot = path.join(tmpRepo.dir + "-flow-wt");
+    fs.mkdirSync(flowWtRoot, { recursive: true });
+    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: flowWtRoot });
+    const flowProject: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot: flowWtRoot };
+    const flowPipeline: PipelineConfig = {
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
+      limits: { maxParallelItems: 2, maxParallelTurns: 4, maxStepAttempts: 3, maxFixRounds: 3 },
+    };
+    const flowPrompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+      overrideDirs: [],
+    });
+    const harness = new FakeHarness();
+    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+      ok: true,
+      data: { kind: "story", rationale: "Triage flow", citations: [] },
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
+        milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
+        itemOutlines: [
+          { slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1", deps: [] },
+        ],
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
+        items: [
+          {
+            slug: "item-1",
+            outlineRef: "item-1",
+            kind: "dev",
+            title: "Item 1",
+            assignment: "Implement item 1",
+            milestone: "m1",
+            wave: 1,
+            deps: [],
+          },
+        ],
+      },
+    });
+
+    const concernSummary = "Retry loop can spin";
+    const cid = concernFingerprint({ kind: "risk", summary: concernSummary });
+    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
+      fs.writeFileSync(path.join(run.cwd, "feature.ts"), "export const x = 1;\n");
+      return {
+        ok: true,
+        data: {
+          status: "ok",
+          summary: "Developed",
+          concerns: [{ kind: "risk", summary: concernSummary, detail: "long detail" }],
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
+      ok: true,
+      data: {
+        status: "changes_requested",
+        summary: "Need a human decision",
+        suggestions: [
+          {
+            id: cid,
+            disposition: "human-async",
+            summary: "Which retry strategy?",
+            detail: "Choose a retry strategy",
+          },
+        ],
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
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
+
+    const res = await runTask(
+      {
+        harness,
+        repo: repoObj,
+        project: flowProject,
+        pipelineFor: async () => flowPipeline,
+        prompts: flowPrompts,
+      },
+      task,
+      { maxTicks: 25 }
+    );
+
+    expect(res.status).toBe("blocked");
+    expect(res.exitCode).toBe(10);
+
+    const flowWt = path.join(flowWtRoot, `topic_${task}`);
+    const deployedTaskDir = path.join(flowWt, ORCH, task);
+    const mailDir = path.join(deployedTaskDir, "steer", "tousertoreview");
+    const mails = fs.readdirSync(mailDir).filter((n) => n.endsWith(".yaml")).sort();
+    expect(mails).toEqual([`q-concern-${cid}.yaml`]);
+
+    const question = await readYaml<Record<string, any>>(path.join(mailDir, mails[0]!));
+    expect(question.id).toBe(`q-concern-${cid}`);
+    expect(question.ref).toBe("item-1");
+
+    const concern = await readYaml<StoredConcernArtifact>(
+      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
+    );
+    expect(concern.status).toBe("routed");
+    expect(concern.disposition).toBe("human-async");
+  });
+});
diff --git a/plugins/software-factory/test/smoke-fixes.test.ts b/plugins/software-factory/test/smoke-fixes.test.ts
index cb903e0..d282558 100644
--- a/plugins/software-factory/test/smoke-fixes.test.ts
+++ b/plugins/software-factory/test/smoke-fixes.test.ts
@@ -87,6 +87,7 @@ describe("Smoke fixes acceptance tests (§6.4, §7, §8, §9)", () => {
         checks: "sample checks",
         diff: "sample diff",
         dispositionsCriteria: "sample dispositions",
+        concernsYaml: "",
       },
       reviewSchema
     );

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
